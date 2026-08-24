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
  equipReel,
  unequipReel,
  equipLine,
  unequipLine,
  equipTool,
  unequipTool,
  equipTitle,
  unequipTitle,
  doPrestige,
  enhanceRod,
  sellItem,
  buyItem,
  guildInfo,
  highestMilestoneCrossed,
  type PlayerState,
  type ProgressSummary,
} from "./engine.js";
import { loadBank, saveBank, deposit, withdraw } from "./bank.js";
import { boathouseInfo, upgradeRoom, tickBaitGarden } from "./boathouse.js";
import { contributeToPurse } from "./purse.js";
import { allRecords } from "./records.js";
import { allFirsts } from "./firsts.js";
import { noticeBoardInfo, deliverOrder, buyWithMarks } from "./noticeBoard.js";
import { startEvents, getActiveEvent } from "./events.js";
import { worldStateAt } from "./world.js";
import { levelForXp } from "./leveling.js";

const TOOL_SLOTS = new Set(["toolForaging", "toolCrafting", "toolCooking"]);
function toolSkillForSlot(slot: string): "foraging" | "crafting" | "cooking" {
  return slot === "toolForaging" ? "foraging" : slot === "toolCrafting" ? "crafting" : "cooking";
}

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
    const skillLevels: Record<string, number> = {};
    for (const s of gameData.skills) skillLevels[s.id] = levelForXp(skills[s.id] || 0);
    const totalLevel = Object.values(skillLevels).reduce((sum, lvl) => sum + lvl, 0);
    const speciesCaught = Object.keys(bestiary).length;
    const action = row.action_json ? JSON.parse(row.action_json) : null;
    const equipped = row.equipped_json ? JSON.parse(row.equipped_json) : {};
    const titleDef = equipped.title ? gameData.achievements.find((a) => a.id === equipped.title) : null;
    return {
      userId: row.user_id,
      name: row.name,
      online: connections.has(row.user_id),
      fishingLevel: skillLevels.fishing ?? 1,
      totalLevel,
      skillLevels,
      title: titleDef?.title ?? null,
      prestige: row.prestige ?? 0,
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
function broadcastBoathouse() {
  broadcast({ type: "boathouse", ...boathouseInfo() });
}
function broadcastRecords() {
  broadcast({ type: "records", records: allRecords() });
}
function broadcastNoticeBoard() {
  broadcast({ type: "notice_board", ...noticeBoardInfo() });
}
function broadcastFirsts() {
  broadcast({ type: "firsts", firsts: allFirsts() });
}

// Live hotspot events — rotate a boosted zone and tell everyone.
startEvents((event) => broadcast({ type: "event", event }));

// The shared world clock (time of day / weather) — a pure function of real
// time, so nothing needs storing; just tell everyone when the phase changes.
let lastWorld = worldStateAt();
setInterval(() => {
  const w = worldStateAt();
  if (w.time !== lastWorld.time || w.weather !== lastWorld.weather) {
    lastWorld = w;
    broadcast({ type: "world", ...w });
  }
}, 15_000);

// The Bait Garden (once built) passively grows worms & grubs into the shared
// Bank, independent of any one player's session.
setInterval(() => {
  const bank = loadBank();
  const grown = tickBaitGarden(bank);
  if (grown) {
    saveBank(bank);
    broadcastBank();
  }
}, 30 * 60 * 1000);

// ---- Chat ----
const insertMsg = db.prepare("INSERT INTO messages (user_id, name, text, ts, kind, rarity) VALUES (?, ?, ?, ?, ?, ?)");
const recentMsgs = db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 50");
function recentChat(): MessageRow[] {
  return (recentMsgs.all() as MessageRow[]).reverse();
}
// A system broadcast: persisted to chat history and pushed live to everyone,
// so an achievement lands even for a partner who's offline right now.
function systemMsg(userId: number, text: string, rarity: string | null = null) {
  const ts = Date.now();
  insertMsg.run(userId, "📢 System", text, ts, "system", rarity);
  broadcast({ type: "chat", message: { user_id: userId, name: "📢 System", text, ts, kind: "system", rarity } });
}

// Turn a progress summary into celebratory, witnessed chat broadcasts —
// level milestones, discoveries, notable catches, achievements, and shared
// Guild level-ups. This runs on every tick (live or offline catch-up) so
// nothing worth celebrating happens silently.
function announceSummary(p: PlayerState, summary: ProgressSummary) {
  for (const lv of summary.levelUps) {
    const milestone = highestMilestoneCrossed(lv.from, lv.to);
    if (milestone == null) continue;
    const skill = gameData.skills.find((s) => s.id === lv.skill);
    const label = skill ? `${skill.icon} ${skill.name}` : lv.skill;
    const max = milestone === 99 ? " — max level! 🏆" : "";
    systemMsg(p.userId, `${p.name} reached ${label} level ${milestone}!${max}`);
  }
  for (const speciesId of summary.newSpecies) {
    const def = gameData.items[speciesId];
    if (!def || def.rarity === "epic" || def.rarity === "legendary") continue; // those get the louder message below
    systemMsg(p.userId, `${p.name} discovered a new species — ${def.icon} ${def.name}!`, def.rarity ?? null);
  }
  for (const c of summary.notableCatches) {
    const def = gameData.items[c.item];
    const label = def ? `${def.icon} ${def.name}` : c.item;
    const tag = c.rarity === "legendary" ? "🌟 LEGENDARY catch" : "✨ Epic catch";
    systemMsg(p.userId, `${p.name} landed a ${tag} — ${label} (${c.size}cm)!`, c.rarity);
  }
  for (const a of summary.newAchievements) {
    systemMsg(p.userId, `${p.name} unlocked an achievement — ${a.icon} ${a.name}!`);
  }
  if (summary.guildLevelUp) {
    systemMsg(p.userId, `🏛️ The Anglers' Guild reached Level ${summary.guildLevelUp.to}!`);
    // Shared moment — both of you should see the fanfare, not just whoever's catch tipped it over.
    broadcast({ type: "celebration", kind: "guildLevelUp", data: summary.guildLevelUp });
  }
  for (const r of summary.newRecords) {
    const def = gameData.items[r.item];
    const label = def ? `${def.icon} ${def.name}` : r.item;
    const beat = r.previousHolder ? ` (beat ${r.previousHolder}'s record!)` : "";
    systemMsg(p.userId, `🏆 ${p.name} set a new Trophy Hall record — ${label} at ${r.size}cm${beat}`);
  }
  if (summary.newRecords.length) broadcastRecords();
  for (const m of summary.guildMilestones) {
    systemMsg(p.userId, `🎖️ Guild milestone reached — ${m.icon} ${m.name}! +${m.marks} Guild Marks`);
    broadcast({ type: "celebration", kind: "guildMilestone", data: m });
  }
  for (const s of summary.shinyCatches) {
    const def = gameData.items[s.item];
    const label = def ? `${def.icon} ${def.name}` : s.item;
    systemMsg(p.userId, `💫 ${p.name} hooked a SHINY catch — ${label} (${s.size}cm)!`, "legendary");
  }
  for (const f of summary.firsts) {
    const def = gameData.items[f.item];
    const label = def ? `${def.icon} ${def.name}` : f.item;
    systemMsg(p.userId, `🥇 ${p.name} is the first to ever catch ${label}!`);
  }
  if (summary.firsts.length) broadcastFirsts();
}

// ---- Tick ----
function tickPlayer(userId: number) {
  const p = loadPlayer(userId);
  if (!p) return;
  const summary = processElapsed(p, Date.now());
  savePlayer(p);
  announceSummary(p, summary);
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
  const summary = processElapsed(p, Date.now());
  const extra = fn(p) ?? {};
  savePlayer(p);
  announceSummary(p, summary);
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
  ws.send(JSON.stringify({ type: "boathouse", ...boathouseInfo() }));
  ws.send(JSON.stringify({ type: "records", records: allRecords() }));
  ws.send(JSON.stringify({ type: "notice_board", ...noticeBoardInfo() }));
  ws.send(JSON.stringify({ type: "world", ...worldStateAt() }));
  ws.send(JSON.stringify({ type: "firsts", firsts: allFirsts() }));
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
        const slot = String(msg.slot ?? "rod");
        withPlayer(userId, (p) => {
          const item = String(msg.item);
          if (slot === "lure") return { actionResult: equipLure(p, item) };
          if (slot === "reel") return { actionResult: equipReel(p, item) };
          if (slot === "line") return { actionResult: equipLine(p, item) };
          if (TOOL_SLOTS.has(slot)) return { actionResult: equipTool(p, toolSkillForSlot(slot), item) };
          return { actionResult: equipRod(p, item) };
        });
        break;
      }
      case "unequip": {
        const slot = String(msg.slot ?? "rod");
        withPlayer(userId, (p) => {
          if (slot === "lure") unequipLure(p);
          else if (slot === "reel") unequipReel(p);
          else if (slot === "line") unequipLine(p);
          else if (TOOL_SLOTS.has(slot)) unequipTool(p, toolSkillForSlot(slot));
          else unequipRod(p);
        });
        break;
      }
      case "equip_title":
        withPlayer(userId, (p) => ({ actionResult: equipTitle(p, String(msg.achievementId)) }));
        break;
      case "unequip_title":
        withPlayer(userId, (p) => void unequipTitle(p));
        break;
      case "prestige": {
        let prestiged = 0;
        let name = "";
        withPlayer(userId, (p) => {
          const result = doPrestige(p);
          if (result.ok) { prestiged = result.newPrestige!; name = p.name; }
          return { actionResult: result };
        });
        if (prestiged > 0) {
          systemMsg(userId, `🌟 ${name} was reborn — Prestige ${prestiged}! Every skill starts over, permanently faster.`);
          broadcast({ type: "celebration", kind: "prestige", data: { name, prestige: prestiged } });
          broadcastPresence();
        }
        break;
      }
      case "enhance":
        withPlayer(userId, (p) => ({ actionResult: enhanceRod(p, String(msg.rodId), !!msg.useProtection) }));
        break;
      case "boathouse_upgrade": {
        withPlayer(userId, (p) => {
          const bank = loadBank();
          const result = upgradeRoom(String(msg.room), bank);
          if (result.ok) {
            saveBank(bank);
            const roomDef = gameData.boathouseRooms.find((r) => r.id === msg.room);
            systemMsg(userId, `🏠 ${p.name} upgraded the ${roomDef?.name ?? msg.room} to Level ${result.newLevel}!`);
            broadcastBank();
            broadcastBoathouse();
          }
          return { actionResult: result };
        });
        break;
      }
      case "purse_contribute":
        withPlayer(userId, (p) => ({ actionResult: contributeToPurse(p, Number(msg.amount ?? 0)) }));
        broadcastBoathouse();
        break;
      case "deliver_order": {
        let completedOrder = false;
        withPlayer(userId, (p) => {
          const result = deliverOrder(p, String(msg.orderId), Number(msg.qty ?? 1));
          if (result.ok && result.completed) {
            completedOrder = true;
            systemMsg(userId, `📦 ${p.name} completed a Merchant's Dock order! +${result.marks} Guild Marks`);
          }
          return { actionResult: result };
        });
        broadcastNoticeBoard();
        if (completedOrder) broadcastPresence();
        break;
      }
      case "buy_marks":
        withPlayer(userId, (p) => ({ actionResult: buyWithMarks(p, String(msg.item), Number(msg.qty ?? 1)) }));
        broadcastPresence();
        break;
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
        insertMsg.run(userId, name, text, ts, "chat", null);
        broadcast({ type: "chat", message: { user_id: userId, name, text, ts, kind: "chat", rarity: null } });
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
