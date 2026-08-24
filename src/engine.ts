import { db, type CharacterRow } from "./db.js";
import { gameData, zonesById, actionsById, shopByItem } from "./content/gameData.js";
import type { SkillId } from "./content/types.js";
import { levelForXp, levelProgress } from "./leveling.js";
import { getActiveEvent } from "./events.js";

// Cap offline processing so nobody returns to millions of years of loot.
const OFFLINE_CAP_MS = Number(process.env.OFFLINE_CAP_HOURS ?? 24) * 3600 * 1000;
const SIM_GUARD = 500000;

// --------------------------------------------------------------------------
// Shared Guild progression (coop incremental)
// --------------------------------------------------------------------------
const GUILD_MAX_LEVEL = 25;
const CATCHES_PER_GUILD_LEVEL = 250;

const selectGuild = db.prepare("SELECT total_catches FROM guild WHERE id = 1");
const addGuild = db.prepare("UPDATE guild SET total_catches = total_catches + ? WHERE id = 1");

export function guildTotalCatches(): number {
  const row = selectGuild.get() as { total_catches: number } | undefined;
  return row?.total_catches ?? 0;
}
export function guildLevel(total = guildTotalCatches()): number {
  return Math.min(GUILD_MAX_LEVEL, Math.floor(total / CATCHES_PER_GUILD_LEVEL));
}
export function guildSpeedBonus(level = guildLevel()): number {
  return level * 0.01; // up to 25% faster casts, shared by both of you
}
export function guildInfo() {
  const total = guildTotalCatches();
  const level = guildLevel(total);
  const into = total - level * CATCHES_PER_GUILD_LEVEL;
  const needed = level >= GUILD_MAX_LEVEL ? 0 : CATCHES_PER_GUILD_LEVEL;
  return { total, level, maxLevel: GUILD_MAX_LEVEL, into, needed, speedBonus: guildSpeedBonus(level) };
}

// --------------------------------------------------------------------------
// Player state
// --------------------------------------------------------------------------
export interface QueueEntry {
  type: "fish" | "gather" | "produce";
  refId: string; // zone id or action id
  target: number; // desired completions; 0 = run until stopped / out of materials
}

export interface ActionState extends QueueEntry {
  done: number; // completions granted so far this entry
  progressMs: number; // ms accumulated toward the next completion
}

export interface BuffState {
  dishId: string;
  speedMult: number; // multiplies cast time (lower = faster)
  rareBonus: number;
  expiresAt: number; // ms epoch
}

export interface PlayerState {
  userId: number;
  name: string;
  coins: number;
  skills: Record<string, number>;
  inventory: Record<string, number>;
  bestiary: Record<string, { count: number; max: number }>;
  equipped: { rod?: string };
  baitActive: boolean;
  buff: BuffState | null;
  achievements: string[];
  action: ActionState | null;
  queue: QueueEntry[];
  updatedAt: number;
}

const selectChar = db.prepare<[number]>("SELECT * FROM characters WHERE user_id = ?");
const upsertChar = db.prepare(`
  INSERT INTO characters (user_id, name, coins, skills_json, inventory_json, bestiary_json, equipped_json, action_json, bait_active, buff_json, achievements_json, queue_json, updated_at)
  VALUES (@user_id, @name, @coins, @skills_json, @inventory_json, @bestiary_json, @equipped_json, @action_json, @bait_active, @buff_json, @achievements_json, @queue_json, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    coins=@coins, skills_json=@skills_json, inventory_json=@inventory_json,
    bestiary_json=@bestiary_json, equipped_json=@equipped_json,
    action_json=@action_json, bait_active=@bait_active, buff_json=@buff_json,
    achievements_json=@achievements_json, queue_json=@queue_json, updated_at=@updated_at
`);

export function loadPlayer(userId: number): PlayerState | null {
  const row = selectChar.get(userId) as CharacterRow | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    coins: row.coins,
    skills: JSON.parse(row.skills_json),
    inventory: JSON.parse(row.inventory_json),
    bestiary: JSON.parse(row.bestiary_json),
    equipped: JSON.parse(row.equipped_json),
    baitActive: !!row.bait_active,
    buff: row.buff_json ? JSON.parse(row.buff_json) : null,
    achievements: row.achievements_json ? JSON.parse(row.achievements_json) : [],
    action: normalizeAction(row.action_json ? JSON.parse(row.action_json) : null),
    queue: row.queue_json ? JSON.parse(row.queue_json) : [],
    updatedAt: row.updated_at,
  };
}

// Backfill fields for actions saved before the queue existed (old format had
// only { type, refId, startedAt }).
function normalizeAction(a: any): ActionState | null {
  if (!a) return null;
  return {
    type: a.type,
    refId: a.refId,
    target: typeof a.target === "number" ? a.target : 0,
    done: typeof a.done === "number" ? a.done : 0,
    progressMs: typeof a.progressMs === "number" ? a.progressMs : 0,
  };
}

export function savePlayer(p: PlayerState): void {
  upsertChar.run({
    user_id: p.userId,
    name: p.name,
    coins: Math.floor(p.coins),
    skills_json: JSON.stringify(p.skills),
    inventory_json: JSON.stringify(p.inventory),
    bestiary_json: JSON.stringify(p.bestiary),
    equipped_json: JSON.stringify(p.equipped),
    action_json: p.action ? JSON.stringify(p.action) : null,
    bait_active: p.baitActive ? 1 : 0,
    buff_json: p.buff ? JSON.stringify(p.buff) : "",
    achievements_json: JSON.stringify(p.achievements),
    queue_json: JSON.stringify(p.queue),
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
    skills,
    inventory: {},
    bestiary: {},
    equipped: {},
    baitActive: false,
    buff: null,
    achievements: [],
    action: null,
    queue: [],
    updatedAt: now,
  };
  savePlayer(p);
  return p;
}

// --------------------------------------------------------------------------
// Inventory helpers
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

// Highest-bonus bait currently in the bag.
function bestBait(p: PlayerState): { id: string; bonus: number } | null {
  let best: { id: string; bonus: number } | null = null;
  for (const [id, qty] of Object.entries(p.inventory)) {
    if (qty <= 0) continue;
    const def = gameData.items[id];
    if (def?.baitRareBonus && (!best || def.baitRareBonus > best.bonus)) best = { id, bonus: def.baitRareBonus };
  }
  return best;
}

function personalCatchTotal(p: PlayerState): number {
  let n = 0;
  for (const r of Object.values(p.bestiary)) n += r.count;
  return n;
}
function hasCaughtRarity(p: PlayerState, rarity: string): boolean {
  return Object.keys(p.bestiary).some((id) => gameData.items[id]?.rarity === rarity);
}

// Check every not-yet-unlocked achievement; grant rewards for newly met ones.
function evaluateAchievements(p: PlayerState, summary: ProgressSummary) {
  for (const a of gameData.achievements) {
    if (p.achievements.includes(a.id)) continue;
    let met = false;
    switch (a.cond.type) {
      case "discover": met = Object.keys(p.bestiary).length >= a.cond.value; break;
      case "catch_total": met = personalCatchTotal(p) >= a.cond.value; break;
      case "skill": met = levelForXp(p.skills[a.cond.skill] || 0) >= a.cond.value; break;
      case "rarity": met = hasCaughtRarity(p, a.cond.rarity); break;
    }
    if (met) {
      p.achievements.push(a.id);
      p.coins += a.coins;
      summary.coinsGained += a.coins;
      summary.newAchievements.push({ id: a.id, name: a.name, icon: a.icon, coins: a.coins });
    }
  }
}

// Weighted species pick, with rareBonus shifting toward rarer fish.
function rollSpecies(zoneId: string, rareBonus: number): string | null {
  const zone = zonesById.get(zoneId);
  if (!zone) return null;
  let total = 0;
  const weights: { item: string; w: number }[] = [];
  for (const f of zone.fish) {
    const rarity = gameData.items[f.item]?.rarity ?? "common";
    const rank = gameData.rarityRank[rarity];
    const mult = rank === 0 ? 1 : 1 + rareBonus * (1 + rank);
    const w = f.weight * mult;
    weights.push({ item: f.item, w });
    total += w;
  }
  let r = Math.random() * total;
  for (const x of weights) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return weights[weights.length - 1]?.item ?? null;
}

// --------------------------------------------------------------------------
// Core: advance state to `now`
// --------------------------------------------------------------------------
export interface ProgressSummary {
  completions: number;
  xpGained: Record<string, number>;
  itemsGained: Record<string, number>;
  coinsGained: number;
  newSpecies: string[]; // species caught for the very first time
  biggest?: { item: string; size: number };
  newAchievements: { id: string; name: string; icon: string; coins: number }[];
  stopped?: "no_inputs";
}

// Per-completion duration + rare bonus for a single cast at absolute time `clock`.
function fishParamsAt(p: PlayerState, zoneId: string, clock: number): { durMs: number; rareBonus: number } {
  const zone = zonesById.get(zoneId)!;
  const rod = p.equipped.rod ? gameData.items[p.equipped.rod] : undefined;
  const base = zone.baseTimeSec * (rod?.rodSpeedMult ?? 1) * (1 - guildSpeedBonus()) * 1000;
  const event = getActiveEvent();
  const buffed = p.buff && clock < p.buff.expiresAt;
  const eventOn = !!event && event.zoneId === zoneId && clock >= event.startsAt && clock < event.endsAt;
  const durMs = base * (buffed ? p.buff!.speedMult : 1) * (eventOn ? event!.speedMult : 1);
  const rareBonus = (rod?.rodRareBonus ?? 0) + (buffed ? p.buff!.rareBonus : 0) + (eventOn ? event!.rareBonus : 0);
  return { durMs, rareBonus };
}

function hasInputs(p: PlayerState, def: { inputs: { item: string; qty: number }[] }): boolean {
  return def.inputs.every((inp) => (p.inventory[inp.item] || 0) >= inp.qty);
}

// The duration of the active entry's current completion (for pct display etc.).
function currentDurMs(p: PlayerState, clock = Date.now()): number {
  const a = p.action;
  if (!a) return 1;
  if (a.type === "fish") return fishParamsAt(p, a.refId, clock).durMs;
  const def = actionsById.get(a.refId);
  return def ? def.durationSec * 1000 : 1;
}

function promoteNext(p: PlayerState): boolean {
  const next = p.queue.shift();
  if (next) {
    p.action = { ...next, done: 0, progressMs: 0 };
    return true;
  }
  p.action = null;
  return false;
}

export function processElapsed(p: PlayerState, now: number): ProgressSummary {
  const summary: ProgressSummary = { completions: 0, xpGained: {}, itemsGained: {}, coinsGained: 0, newSpecies: [], newAchievements: [] };
  const addItemSum = (id: string, q: number) => (summary.itemsGained[id] = (summary.itemsGained[id] || 0) + q);
  const addXpSum = (s: string, x: number) => (summary.xpGained[s] = (summary.xpGained[s] || 0) + x);

  // If nothing is active but something is queued, promote it.
  if (!p.action && p.queue.length) promoteNext(p);

  let remaining = Math.min(now - p.updatedAt, OFFLINE_CAP_MS);
  let clock = now - remaining; // absolute time as we distribute the elapsed window
  let guildCatches = 0;
  let guard = 0;

  while (remaining > 0 && p.action && guard < SIM_GUARD) {
    guard++;
    const entry = p.action;

    if (entry.type === "fish") {
      const zone = zonesById.get(entry.refId);
      if (!zone) { if (!promoteNext(p)) break; continue; }
      const { durMs, rareBonus: baseRare } = fishParamsAt(p, entry.refId, clock);
      const need = durMs - entry.progressMs;
      if (remaining < need) { entry.progressMs += remaining; clock += remaining; remaining = 0; break; }

      // Complete one cast.
      let rareBonus = baseRare;
      if (p.baitActive) {
        const bait = bestBait(p);
        if (bait) { removeItem(p, bait.id, 1); rareBonus += bait.bonus; }
      }
      const species = rollSpecies(entry.refId, rareBonus);
      if (species) {
        addItem(p, species, 1);
        addItemSum(species, 1);
        const def = gameData.items[species];
        const size = def?.sizeMin != null && def?.sizeMax != null
          ? Math.round((def.sizeMin + Math.random() * (def.sizeMax - def.sizeMin)) * 10) / 10
          : 0;
        const rec = p.bestiary[species];
        if (!rec) { p.bestiary[species] = { count: 1, max: size }; summary.newSpecies.push(species); }
        else { rec.count++; if (size > rec.max) rec.max = size; }
        if (size > 0 && (!summary.biggest || size > summary.biggest.size)) summary.biggest = { item: species, size };
        const rarity = def?.rarity ?? "common";
        const xp = Math.round(gameData.rarityXp[rarity] * zone.xpMult);
        grantXp(p, "fishing", xp);
        addXpSum("fishing", xp);
        guildCatches++;
      }
      entry.done++;
      summary.completions++;
      clock += need; remaining -= need; entry.progressMs = 0;
      if (entry.target > 0 && entry.done >= entry.target) { if (!promoteNext(p)) break; }
      continue;
    }

    // gather / produce
    const def = actionsById.get(entry.refId);
    if (!def) { if (!promoteNext(p)) break; continue; }
    const durMs = def.durationSec * 1000;
    const need = durMs - entry.progressMs;

    if (remaining < need) { entry.progressMs += remaining; clock += remaining; remaining = 0; break; }

    if (def.inputs.length && !hasInputs(p, def)) {
      // Out of materials — move on to the next queued task (or stop).
      const advanced = promoteNext(p);
      if (!advanced) { summary.stopped = "no_inputs"; break; }
      continue; // note: time not consumed; next entry starts fresh
    }

    for (const inp of def.inputs) removeItem(p, inp.item, inp.qty);
    for (const out of def.outputs) {
      const chance = out.chance ?? 1;
      const got = chance >= 1 ? out.qty : Math.random() < chance ? out.qty : 0;
      if (got > 0) { addItem(p, out.item, got); addItemSum(out.item, got); }
    }
    grantXp(p, def.skill, def.xp);
    addXpSum(def.skill, def.xp);
    entry.done++;
    summary.completions++;
    clock += need; remaining -= need; entry.progressMs = 0;
    if (entry.target > 0 && entry.done >= entry.target) { if (!promoteNext(p)) break; }
  }

  if (guildCatches > 0) addGuild.run(guildCatches);
  if (p.buff && now >= p.buff.expiresAt) p.buff = null;
  evaluateAchievements(p, summary);
  p.updatedAt = now;
  return summary;
}

// --------------------------------------------------------------------------
// Actions & economy (validated)
// --------------------------------------------------------------------------
// Resolve a request into a validated queue entry.
function resolveEntry(p: PlayerState, kind: "fish" | "action", refId: string, target: number): { ok: true; entry: QueueEntry } | { ok: false; error: string } {
  const t = Math.max(0, Math.floor(target || 0));
  if (kind === "fish") {
    const zone = zonesById.get(refId);
    if (!zone) return { ok: false, error: "Unknown fishing spot." };
    if (skillLevel(p, "fishing") < zone.levelReq) return { ok: false, error: `Requires Fishing level ${zone.levelReq}.` };
    return { ok: true, entry: { type: "fish", refId, target: t } };
  }
  const def = actionsById.get(refId);
  if (!def) return { ok: false, error: "Unknown action." };
  if (skillLevel(p, def.skill) < def.levelReq) return { ok: false, error: `Requires ${def.skill} level ${def.levelReq}.` };
  return { ok: true, entry: { type: def.inputs.length > 0 ? "produce" : "gather", refId, target: t } };
}

// Start now: replace the active action and clear any pending queue.
export function startAction(p: PlayerState, kind: "fish" | "action", refId: string, target = 0): { ok: boolean; error?: string } {
  const r = resolveEntry(p, kind, refId, target);
  if (!r.ok) return r;
  p.action = { ...r.entry, done: 0, progressMs: 0 };
  p.queue = [];
  p.updatedAt = Date.now();
  return { ok: true };
}

// Add to the end of the queue (promoting immediately if nothing is active).
export function enqueueAction(p: PlayerState, kind: "fish" | "action", refId: string, target: number): { ok: boolean; error?: string } {
  const r = resolveEntry(p, kind, refId, target);
  if (!r.ok) return r;
  if (!p.action) p.action = { ...r.entry, done: 0, progressMs: 0 };
  else p.queue.push(r.entry);
  p.updatedAt = Date.now();
  return { ok: true };
}

export function dequeueAt(p: PlayerState, index: number) {
  if (index >= 0 && index < p.queue.length) p.queue.splice(index, 1);
  p.updatedAt = Date.now();
}

// Finish the active task now and move to the next queued one.
export function skipAction(p: PlayerState) {
  promoteNext(p);
  p.updatedAt = Date.now();
}

export function stopAction(p: PlayerState) {
  p.action = null;
  p.queue = [];
  p.updatedAt = Date.now();
}

export function setBait(p: PlayerState, active: boolean) {
  p.baitActive = active;
  p.updatedAt = Date.now();
}

export function eatDish(p: PlayerState, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "dish" || def.buffDurationSec == null) return { ok: false, error: "That isn't an edible dish." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't have that dish." };
  removeItem(p, item, 1);
  p.buff = {
    dishId: item,
    speedMult: def.buffSpeedMult ?? 1,
    rareBonus: def.buffRareBonus ?? 0,
    expiresAt: Date.now() + def.buffDurationSec * 1000,
  };
  p.updatedAt = Date.now();
  return { ok: true };
}

export function equipRod(p: PlayerState, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "rod") return { ok: false, error: "That isn't a rod." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't own that rod." };
  p.equipped.rod = item;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipRod(p: PlayerState) {
  delete p.equipped.rod;
  p.updatedAt = Date.now();
}

export function sellItem(p: PlayerState, item: string, qty: number): { ok: boolean; error?: string; coins?: number } {
  const def = gameData.items[item];
  if (!def || def.value == null) return { ok: false, error: "That can't be sold." };
  const have = p.inventory[item] || 0;
  qty = Math.min(Math.max(1, Math.floor(qty)), have);
  if (qty < 1) return { ok: false, error: "You have none of that." };
  removeItem(p, item, qty);
  const gained = def.value * qty;
  p.coins += gained;
  if (p.equipped.rod === item && (p.inventory[item] || 0) < 1) delete p.equipped.rod;
  p.updatedAt = Date.now();
  return { ok: true, coins: gained };
}

export function buyItem(p: PlayerState, item: string, qty: number): { ok: boolean; error?: string } {
  const entry = shopByItem.get(item);
  if (!entry) return { ok: false, error: "The shop doesn't stock that." };
  qty = Math.max(1, Math.floor(qty));
  const cost = entry.price * qty;
  if (p.coins < cost) return { ok: false, error: "Not enough coins." };
  p.coins -= cost;
  addItem(p, item, qty);
  p.updatedAt = Date.now();
  return { ok: true };
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

  const buffActive = p.buff && now < p.buff.expiresAt;
  let buff: any = null;
  if (buffActive && p.buff) {
    const d = gameData.items[p.buff.dishId];
    buff = {
      dishId: p.buff.dishId,
      name: d?.name ?? p.buff.dishId,
      icon: d?.icon ?? "⭐",
      speedMult: p.buff.speedMult,
      rareBonus: p.buff.rareBonus,
      expiresAt: p.buff.expiresAt,
      remainingSec: Math.max(0, Math.round((p.buff.expiresAt - now) / 1000)),
    };
  }

  const entryLabel = (type: string, refId: string): { name: string; icon: string } => {
    if (type === "fish") {
      const z = zonesById.get(refId);
      return { name: z ? `Fishing — ${z.name}` : refId, icon: z?.icon ?? "🎣" };
    }
    const d = actionsById.get(refId);
    const skill = d ? gameData.skills.find((s) => s.id === d.skill) : null;
    return { name: d?.name ?? refId, icon: skill?.icon ?? "⏳" };
  };

  let action: any = null;
  if (p.action) {
    const durMs = currentDurMs(p, now);
    const { name, icon } = entryLabel(p.action.type, p.action.refId);
    action = {
      type: p.action.type,
      refId: p.action.refId,
      name,
      icon,
      durationSec: durMs / 1000,
      pct: Math.min(1, durMs > 0 ? p.action.progressMs / durMs : 0),
      target: p.action.target,
      done: p.action.done,
    };
  }
  const queue = p.queue.map((q) => {
    const { name, icon } = entryLabel(q.type, q.refId);
    return { type: q.type, refId: q.refId, name, icon, target: q.target };
  });

  return {
    userId: p.userId,
    name: p.name,
    coins: Math.floor(p.coins),
    skills,
    inventory: p.inventory,
    bestiary: p.bestiary,
    equipped: p.equipped,
    baitActive: p.baitActive,
    buff,
    achievements: p.achievements,
    action,
    queue,
  };
}
