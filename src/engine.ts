import { db, type CharacterRow } from "./db.js";
import { actionsById, monstersById, gameData } from "./content/gameData.js";
import type { SkillId } from "./content/types.js";
import { levelForXp, levelProgress } from "./leveling.js";

// Cap offline processing so nobody returns to millions of years of loot.
const OFFLINE_CAP_MS = Number(process.env.OFFLINE_CAP_HOURS ?? 24) * 3600 * 1000;
const HP_REGEN_SECONDS = 6; // 1 HP restored per 6s while not fighting

export interface ActionState {
  type: "gather" | "produce" | "combat";
  refId: string; // action id or monster id
  startedAt: number; // ms epoch of the current in-progress completion
}

export interface PlayerState {
  userId: number;
  name: string;
  coins: number;
  hp: number;
  maxHp: number;
  skills: Record<string, number>; // skillId -> total xp
  inventory: Record<string, number>; // itemId -> qty
  action: ActionState | null;
  updatedAt: number;
}

export function maxHpForCombat(combatXp: number): number {
  const lvl = levelForXp(combatXp);
  return 20 + (lvl - 1) * 2;
}

// --------------------------------------------------------------------------
// Persistence
// --------------------------------------------------------------------------
const selectChar = db.prepare<[number]>("SELECT * FROM characters WHERE user_id = ?");
const upsertChar = db.prepare(`
  INSERT INTO characters (user_id, name, coins, hp, max_hp, skills_json, inventory_json, action_json, updated_at)
  VALUES (@user_id, @name, @coins, @hp, @max_hp, @skills_json, @inventory_json, @action_json, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    coins=@coins, hp=@hp, max_hp=@max_hp, skills_json=@skills_json,
    inventory_json=@inventory_json, action_json=@action_json, updated_at=@updated_at
`);

export function loadPlayer(userId: number): PlayerState | null {
  const row = selectChar.get(userId) as CharacterRow | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    coins: row.coins,
    hp: row.hp,
    maxHp: row.max_hp,
    skills: JSON.parse(row.skills_json),
    inventory: JSON.parse(row.inventory_json),
    action: row.action_json ? JSON.parse(row.action_json) : null,
    updatedAt: row.updated_at,
  };
}

export function savePlayer(p: PlayerState): void {
  upsertChar.run({
    user_id: p.userId,
    name: p.name,
    coins: Math.floor(p.coins),
    hp: Math.floor(p.hp),
    max_hp: p.maxHp,
    skills_json: JSON.stringify(p.skills),
    inventory_json: JSON.stringify(p.inventory),
    action_json: p.action ? JSON.stringify(p.action) : null,
    updated_at: p.updatedAt,
  });
}

export function createCharacter(userId: number, name: string): PlayerState {
  const now = Date.now();
  const skills: Record<string, number> = {};
  for (const s of gameData.skills) skills[s.id] = 0;
  const p: PlayerState = {
    userId,
    name,
    coins: 0,
    hp: 20,
    maxHp: 20,
    skills,
    inventory: {},
    action: null,
    updatedAt: now,
  };
  savePlayer(p);
  return p;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function addItem(p: PlayerState, item: string, qty: number) {
  if (qty <= 0) return;
  p.inventory[item] = (p.inventory[item] || 0) + qty;
}
function removeItem(p: PlayerState, item: string, qty: number): boolean {
  const have = p.inventory[item] || 0;
  if (have < qty) return false;
  const left = have - qty;
  if (left === 0) delete p.inventory[item];
  else p.inventory[item] = left;
  return true;
}

export function skillLevel(p: PlayerState, skill: SkillId): number {
  return levelForXp(p.skills[skill] || 0);
}

function grantXp(p: PlayerState, skill: SkillId, xp: number) {
  p.skills[skill] = (p.skills[skill] || 0) + xp;
}

// Eat the highest-healing food available (used during combat).
function tryEat(p: PlayerState): boolean {
  let best: { id: string; heal: number } | null = null;
  for (const [id, qty] of Object.entries(p.inventory)) {
    if (qty <= 0) continue;
    const def = gameData.items[id];
    if (def?.heals && (!best || def.heals > best.heal)) best = { id, heal: def.heals };
  }
  if (!best) return false;
  removeItem(p, best.id, 1);
  p.hp = Math.min(p.maxHp, p.hp + best.heal);
  return true;
}

// --------------------------------------------------------------------------
// Core: advance a player's state to `now`, returning a summary of gains.
// --------------------------------------------------------------------------
export interface ProgressSummary {
  completions: number;
  xpGained: Record<string, number>;
  itemsGained: Record<string, number>;
  coinsGained: number;
  stopped?: "no_inputs" | "no_food";
}

export function processElapsed(p: PlayerState, now: number): ProgressSummary {
  const summary: ProgressSummary = { completions: 0, xpGained: {}, itemsGained: {}, coinsGained: 0 };
  const addSummaryItem = (id: string, q: number) => (summary.itemsGained[id] = (summary.itemsGained[id] || 0) + q);
  const addSummaryXp = (s: string, x: number) => (summary.xpGained[s] = (summary.xpGained[s] || 0) + x);

  // Keep max HP in sync with combat level.
  p.maxHp = maxHpForCombat(p.skills.combat || 0);

  if (!p.action) {
    regenIdle(p, now);
    p.updatedAt = now;
    return summary;
  }

  const action = p.action;

  if (action.type === "combat") {
    const m = monstersById.get(action.refId);
    if (!m) {
      p.action = null;
      p.updatedAt = now;
      return summary;
    }
    const elapsed = Math.min(now - action.startedAt, OFFLINE_CAP_MS);
    const cLvl = levelLocal(p, "combat");
    const killMs = m.killTimeSec * 1000 * Math.max(0.4, 1 - (cLvl - m.combatLevelReq) * 0.02);
    let budget = elapsed;
    let guard = 0;
    while (budget >= killMs && guard < 500000) {
      guard++;
      // Heal before the blow if we might die or are getting low.
      if (p.hp <= m.damage || p.hp < p.maxHp * 0.35) tryEat(p);
      if (p.hp <= m.damage) {
        // Not enough HP and nothing (more) to eat: bail out safely.
        p.action = null;
        summary.stopped = "no_food";
        p.hp = Math.max(1, p.hp);
        p.updatedAt = now;
        return summary;
      }
      p.hp -= m.damage;
      // Kill rewards
      grantXp(p, "combat", m.xp);
      addSummaryXp("combat", m.xp);
      p.maxHp = maxHpForCombat(p.skills.combat);
      const coins = m.coins.min + Math.floor(Math.random() * (m.coins.max - m.coins.min + 1));
      p.coins += coins;
      summary.coinsGained += coins;
      for (const l of m.loot) {
        if (Math.random() < l.chance) {
          addItem(p, l.item, l.qty);
          addSummaryItem(l.item, l.qty);
        }
      }
      summary.completions++;
      budget -= killMs;
    }
    const remainder = budget; // leftover partial progress
    action.startedAt = now - remainder;
    p.updatedAt = now;
    return summary;
  }

  // Gathering / production
  const def = actionsById.get(action.refId);
  if (!def) {
    p.action = null;
    p.updatedAt = now;
    return summary;
  }
  const durMs = def.durationSec * 1000;
  const capped = Math.min(now - action.startedAt, OFFLINE_CAP_MS);
  let completions = Math.floor(capped / durMs);

  if (completions > 0 && def.inputs.length > 0) {
    // Production is limited by available inputs.
    let maxByInputs = Infinity;
    for (const inp of def.inputs) {
      maxByInputs = Math.min(maxByInputs, Math.floor((p.inventory[inp.item] || 0) / inp.qty));
    }
    if (maxByInputs < completions) {
      completions = maxByInputs;
      summary.stopped = "no_inputs";
    }
  }

  if (completions > 0) {
    for (const inp of def.inputs) removeItem(p, inp.item, inp.qty * completions);
    for (const out of def.outputs) {
      const chance = out.chance ?? 1;
      let got = 0;
      if (chance >= 1) got = out.qty * completions;
      else for (let i = 0; i < completions; i++) if (Math.random() < chance) got += out.qty;
      if (got > 0) {
        addItem(p, out.item, got);
        addSummaryItem(out.item, got);
      }
    }
    grantXp(p, def.skill, def.xp * completions);
    addSummaryXp(def.skill, def.xp * completions);
    summary.completions += completions;
  }

  // Regenerate HP while doing non-combat work.
  regenFrom(p, capped);

  if (summary.stopped === "no_inputs") {
    p.action = null;
  } else {
    const remainder = capped - completions * durMs;
    action.startedAt = now - remainder;
  }
  p.updatedAt = now;
  return summary;
}

function levelLocal(p: PlayerState, skill: SkillId): number {
  return levelForXp(p.skills[skill] || 0);
}

function regenIdle(p: PlayerState, now: number) {
  const dt = Math.min(now - p.updatedAt, OFFLINE_CAP_MS);
  regenFrom(p, dt);
}
function regenFrom(p: PlayerState, dtMs: number) {
  if (p.hp >= p.maxHp) return;
  const healed = Math.floor(dtMs / 1000 / HP_REGEN_SECONDS);
  if (healed > 0) p.hp = Math.min(p.maxHp, p.hp + healed);
}

// --------------------------------------------------------------------------
// Action selection (validated)
// --------------------------------------------------------------------------
export function startAction(p: PlayerState, kind: "action" | "combat", refId: string): { ok: boolean; error?: string } {
  const now = Date.now();
  if (kind === "combat") {
    const m = monstersById.get(refId);
    if (!m) return { ok: false, error: "Unknown monster." };
    if (levelLocal(p, "combat") < m.combatLevelReq) return { ok: false, error: `Requires Combat level ${m.combatLevelReq}.` };
    if (p.hp <= 0) p.hp = Math.max(1, Math.floor(p.maxHp * 0.25));
    p.action = { type: "combat", refId, startedAt: now };
  } else {
    const def = actionsById.get(refId);
    if (!def) return { ok: false, error: "Unknown action." };
    if (levelLocal(p, def.skill) < def.levelReq) return { ok: false, error: `Requires ${def.skill} level ${def.levelReq}.` };
    p.action = { type: def.inputs.length > 0 ? "produce" : "gather", refId, startedAt: now };
  }
  p.updatedAt = now;
  return { ok: true };
}

export function stopAction(p: PlayerState) {
  p.action = null;
  p.updatedAt = Date.now();
}

// --------------------------------------------------------------------------
// Serialization for the client
// --------------------------------------------------------------------------
export function serializePlayer(p: PlayerState, now = Date.now()) {
  const skills: Record<string, any> = {};
  for (const s of gameData.skills) {
    const xp = p.skills[s.id] || 0;
    const prog = levelProgress(xp);
    skills[s.id] = { xp, level: prog.level, into: prog.into, needed: prog.needed, pct: prog.pct };
  }

  let action: any = null;
  if (p.action) {
    if (p.action.type === "combat") {
      const m = monstersById.get(p.action.refId);
      if (m) {
        const cLvl = levelForXp(p.skills.combat || 0);
        const durSec = m.killTimeSec * Math.max(0.4, 1 - (cLvl - m.combatLevelReq) * 0.02);
        const elapsed = (now - p.action.startedAt) / 1000;
        action = { type: "combat", refId: m.id, name: m.name, icon: m.icon, durationSec: durSec, pct: Math.min(1, elapsed / durSec) };
      }
    } else {
      const def = actionsById.get(p.action.refId);
      if (def) {
        const elapsed = (now - p.action.startedAt) / 1000;
        action = { type: p.action.type, refId: def.id, name: def.name, skill: def.skill, durationSec: def.durationSec, pct: Math.min(1, elapsed / def.durationSec) };
      }
    }
  }

  return {
    userId: p.userId,
    name: p.name,
    coins: Math.floor(p.coins),
    hp: Math.floor(p.hp),
    maxHp: p.maxHp,
    combatLevel: levelForXp(p.skills.combat || 0),
    skills,
    inventory: p.inventory,
    action,
  };
}
