import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { db, type CharacterRow, type MessageRow } from "./db.js";
import { gameData } from "./content/gameData.js";
import { register, login, logout, userIdForToken } from "./auth.js";
import {
  loadPlayer,
  savePlayer,
  processElapsed,
  serializePlayer,
  startAction,
  stopAction,
  maxHpForCombat,
} from "./engine.js";
import { levelForXp } from "./leveling.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// ---- Auth REST ----
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

// ---- Content ----
app.get("/api/gamedata", (_req, res) => res.json(gameData));

app.get("/", (_req, res) => res.sendFile(join(__dirname, "..", "public", "index.html")));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// userId -> set of sockets
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

// ---- Presence (all characters, online + offline) ----
const allChars = db.prepare("SELECT * FROM characters");
function buildPresence() {
  const rows = allChars.all() as CharacterRow[];
  return rows.map((row) => {
    const skills = JSON.parse(row.skills_json) as Record<string, number>;
    const totalLevel = gameData.skills.reduce((sum, s) => sum + levelForXp(skills[s.id] || 0), 0);
    const action = row.action_json ? JSON.parse(row.action_json) : null;
    let activity: string | null = null;
    if (action) {
      if (action.type === "combat") {
        const m = gameData.monsters.find((x) => x.id === action.refId);
        activity = m ? `${m.icon} Fighting ${m.name}` : null;
      } else {
        const a = gameData.actions.find((x) => x.id === action.refId);
        const skill = a ? gameData.skills.find((s) => s.id === a.skill) : null;
        activity = a && skill ? `${skill.icon} ${a.name}` : null;
      }
    }
    return {
      userId: row.user_id,
      name: row.name,
      online: connections.has(row.user_id),
      combatLevel: levelForXp(skills.combat || 0),
      totalLevel,
      hp: row.hp,
      maxHp: maxHpForCombat(skills.combat || 0),
      activity,
    };
  });
}
function broadcastPresence() {
  broadcast({ type: "presence", players: buildPresence() });
}

// ---- Chat ----
const insertMsg = db.prepare("INSERT INTO messages (user_id, name, text, ts) VALUES (?, ?, ?, ?)");
const recentMsgs = db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 50");
function recentChat(): MessageRow[] {
  return (recentMsgs.all() as MessageRow[]).reverse();
}

// ---- Tick: advance every online player, push their state ----
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

// ---- WebSocket handling ----
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

  // Initial sync
  tickPlayer(userId);
  ws.send(JSON.stringify({ type: "chat_history", messages: recentChat() }));
  broadcastPresence();

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "action") {
      const p = loadPlayer(userId);
      if (!p) return;
      processElapsed(p, Date.now()); // bank progress on the current action first
      const r = startAction(p, msg.kind === "combat" ? "combat" : "action", String(msg.refId));
      savePlayer(p);
      sendTo(userId, { type: "state", player: serializePlayer(p), actionResult: r });
      broadcastPresence();
    } else if (msg.type === "stop") {
      const p = loadPlayer(userId);
      if (!p) return;
      processElapsed(p, Date.now());
      stopAction(p);
      savePlayer(p);
      sendTo(userId, { type: "state", player: serializePlayer(p) });
      broadcastPresence();
    } else if (msg.type === "chat") {
      const text = String(msg.text ?? "").slice(0, 500).trim();
      if (!text) return;
      const p = loadPlayer(userId);
      const name = p?.name ?? "???";
      const ts = Date.now();
      insertMsg.run(userId, name, text, ts);
      broadcast({ type: "chat", message: { user_id: userId, name, text, ts } });
    }
  });

  ws.on("close", () => {
    removeConn(userId, ws);
    broadcastPresence();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Idle Coop RPG running on http://localhost:${PORT}`);
});
