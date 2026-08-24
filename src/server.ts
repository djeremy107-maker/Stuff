import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { db, type CharacterRow, type MessageRow } from "./db.js";
import { gameData, zonesById, actionsById } from "./content/gameData.js";
import { register, login, logout, userIdForToken } from "./auth.js";
import {
  loadPlayer,
  savePlayer,
  processElapsed,
  serializePlayer,
  startAction,
  enqueueAction,
  dequeueAt,
  skipAction,
  stopAction,
  setLoadout,
  equipRod,
  unequipRod,
  equipLure,
  unequipLure,
  sellItem,
  buyItem,
  guildInfo,
  type PlayerState,
} from "./engine.js";
import { loadBank, deposit, withdraw } from "./bank.js";
import { startEvents, getActiveEvent } from "./events.js";
import { levelForXp } from "./leveling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

app.post("/api/register", (req, res) => {
  const { username, password } = req.body ?? {};
  const r = register(String(username ?? ""), String(password ?? ""));
  res.status(r.ok ? 200 : 400).json(r);
});
app.post("/api/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const r = login(String(username ?? ""), String(password ?? ""));
  res.status(r.ok ? 200 : 400).json(r);
});
app.post("/api/logout", (req, res) => {
  const token = String(req.body?.token ?? "");
  if (token) logout(token);
  res.json({ ok: true });
});
app.get("/api/gamedata", (_req, res) => res.json(gameData));
app.get("/", (_req, res) => res.sendFile(join(__dirname, "..", "public", "index.html")));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

const connections = new Map<number, Set<WebSocket>>();
function addConn(userId: number, ws: WebSocket) {
  let set = connections.get(userId);
  if (!set) connections.set(userId, (set = new Set()));
  set.add(ws);
}
function removeConn(userId: number, ws: WebSocket) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}
function sendTo(userId: number, msg: unknown) {
  const set = connections.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}
function broadcast(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const set of connections.values()) for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

// ---- Presence (all characters, online + offline) + shared Guild ----
const allChars = db.prepare("SELECT * FROM characters");
function activityLabel(action: any): string | null {
  if (!action) return null;
  if (action.type === "fish") {
    const z = zonesById.get(action.refId);
    return z ? `${z.icon} Fishing — ${z.name}` : null;
  }
  const a = actionsById.get(action.refId);
  const skill = a ? gameData.skills.find((s) => s.id === a.skill) : null;
  return a && skill ? `${skill.icon} ${a.name}` : null;
}
function buildPresence() {
  const rows = allChars.all() as CharacterRow[];
  const players = rows.map((row) => {
    const skills = JSON.parse(row.skills_json) as Record<string, number>;
    const bestiary = JSON.parse(row.bestiary_json || "{}") as Record<string, { count: number; max: number }>;
    const totalLevel = gameData.skills.reduce((sum, s) => sum + levelForXp(skills[s.id] || 0), 0);
    const speciesCaught = Object.keys(bestiary).length;
    const action = row.action_json ? JSON.parse(row.action_json) : null;
    return {
      userId: row.user_id,
      name: row.name,
      online: connections.has(row.user_id),
      fishingLevel: levelForXp(skills.fishing || 0),
      totalLevel,
      speciesCaught,
      coins: row.coins,
      activity: activityLabel(action),
    };
  });
  return { players, guild: guildInfo() };
}
function broadcastPresence() {
  broadcast({ type: "presence", ...buildPresence() });
}
function broadcastBank() {
  broadcast({ type: "bank", items: loadBank() });
}

// Live hotspot events — rotate a boosted zone and tell everyone.
startEvents((event) => broadcast({ type: "event", event }));

// ---- Chat ----
const insertMsg = db.prepare("INSERT INTO messages (user_id, name, text, ts) VALUES (?, ?, ?, ?)");
const recentMsgs = db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 50");
function recentChat(): MessageRow[] {
  return (recentMsgs.all() as MessageRow[]).reverse();
}

// ---- Tick ----
function tickPlayer(userId: number) {
  const p = loadPlayer(userId);
  if (!p) return;
  const summary = processElapsed(p, Date.now());
  savePlayer(p);
  sendTo(userId, { type: "state", player: serializePlayer(p), summary });
}
setInterval(() => {
  for (const userId of connections.keys()) tickPlayer(userId);
  broadcastPresence();
}, 1000);

// Helper: bank progress, mutate, save, push, refresh presence.
function withPlayer(userId: number, fn: (p: PlayerState) => any) {
  const p = loadPlayer(userId);
  if (!p) return;
  processElapsed(p, Date.now());
  const extra = fn(p) ?? {};
  savePlayer(p);
  sendTo(userId, { type: "state", player: serializePlayer(p), ...extra });
  broadcastPresence();
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token") ?? undefined;
  const userId = userIdForToken(token);
  if (!userId) {
    ws.send(JSON.stringify({ type: "error", error: "Not authenticated." }));
    ws.close();
    return;
  }
  addConn(userId, ws);
  tickPlayer(userId);
  ws.send(JSON.stringify({ type: "chat_history", messages: recentChat() }));
  ws.send(JSON.stringify({ type: "bank", items: loadBank() }));
  ws.send(JSON.stringify({ type: "event", event: getActiveEvent() }));
  broadcastPresence();

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "action":
        withPlayer(userId, (p) => ({ actionResult: startAction(p, msg.kind === "fish" ? "fish" : "action", String(msg.refId), Number(msg.target ?? 0)) }));
        break;
      case "queue":
        withPlayer(userId, (p) => ({ actionResult: enqueueAction(p, msg.kind === "fish" ? "fish" : "action", String(msg.refId), Number(msg.target ?? 0)) }));
        break;
      case "dequeue":
        withPlayer(userId, (p) => void dequeueAt(p, Number(msg.index)));
        break;
      case "skip":
        withPlayer(userId, (p) => void skipAction(p));
        break;
      case "stop":
        withPlayer(userId, (p) => void stopAction(p));
        break;
      case "equip": {
        const slot = msg.slot === "lure" ? "lure" : "rod";
        withPlayer(userId, (p) => ({ actionResult: slot === "lure" ? equipLure(p, String(msg.item)) : equipRod(p, String(msg.item)) }));
        break;
      }
      case "unequip": {
        const slot = msg.slot === "lure" ? "lure" : "rod";
        withPlayer(userId, (p) => void (slot === "lure" ? unequipLure(p) : unequipRod(p)));
        break;
      }
      case "sell":
        withPlayer(userId, (p) => ({ actionResult: sellItem(p, String(msg.item), Number(msg.qty ?? 1)) }));
        break;
      case "buy":
        withPlayer(userId, (p) => ({ actionResult: buyItem(p, String(msg.item), Number(msg.qty ?? 1)) }));
        break;
      case "loadout": {
        const kind = msg.kind === "drink" ? "drink" : "food";
        withPlayer(userId, (p) => ({ actionResult: setLoadout(p, kind, msg.item == null ? null : String(msg.item)) }));
        break;
      }
      case "deposit":
        withPlayer(userId, (p) => ({ actionResult: deposit(p, String(msg.item), Number(msg.qty ?? 1)) }));
        broadcastBank();
        break;
      case "withdraw":
        withPlayer(userId, (p) => ({ actionResult: withdraw(p, String(msg.item), Number(msg.qty ?? 1)) }));
        broadcastBank();
        break;
      case "chat": {
        const text = String(msg.text ?? "").slice(0, 500).trim();
        if (!text) return;
        const p = loadPlayer(userId);
        const name = p?.name ?? "???";
        const ts = Date.now();
        insertMsg.run(userId, name, text, ts);
        broadcast({ type: "chat", message: { user_id: userId, name, text, ts } });
        break;
      }
    }
  });

  ws.on("close", () => {
    removeConn(userId, ws);
    broadcastPresence();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Idyll (coop fishing) running on http://localhost:${PORT}`);
});
