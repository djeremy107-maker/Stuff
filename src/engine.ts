import { db, type CharacterRow } from "./db.js";
import { gameData, zonesById, actionsById, shopByItem } from "./content/gameData.js";
import type { SkillId } from "./content/types.js";
import { levelForXp, levelProgress } from "./leveling.js";
import { getActiveEvent } from "./events.js";
import { boathouseSkillEfficiency, boathouseRareBonus, boathouseEnhanceBonus } from "./boathouse.js";
import { checkAndSetRecord } from "./records.js";
import { checkAndSetFirst } from "./firsts.js";
import { worldStateAt } from "./world.js";

// Tool-equipped support skills (foraging/crafting/cooking each get one tool slot).
type ToolSkill = "foraging" | "crafting" | "cooking";
const TOOL_SLOT: Record<ToolSkill, "toolForaging" | "toolCrafting" | "toolCooking"> = {
  foraging: "toolForaging",
  crafting: "toolCrafting",
  cooking: "toolCooking",
};

// Cap offline processing so nobody returns to millions of years of loot.
const OFFLINE_CAP_MS = Number(process.env.OFFLINE_CAP_HOURS ?? 24) * 3600 * 1000;
const SIM_GUARD = 500000;

// Odds a fish catch upgrades to its shiny variant — a chase chance, not a
// rarity roll, so a common shiny is just as likely as a legendary shiny.
const SHINY_CHANCE = 1 / 450;

// --------------------------------------------------------------------------
// Shared Guild progression (coop incremental)
// --------------------------------------------------------------------------
const GUILD_MAX_LEVEL = 60;

// Cumulative total catches required to reach each Guild level (growing curve, so
// the shared bar is a genuine multi-month coop project rather than a few hours).
const guildCumulative: number[] = [0];
for (let lvl = 1; lvl <= GUILD_MAX_LEVEL; lvl++) {
  const needed = Math.round(200 * Math.pow(1.15, lvl - 1));
  guildCumulative[lvl] = guildCumulative[lvl - 1] + needed;
}

const selectGuild = db.prepare("SELECT total_catches, legendary_catches, marks, unlocked_milestones_json FROM guild WHERE id = 1");
const addGuild = db.prepare("UPDATE guild SET total_catches = total_catches + ? WHERE id = 1");
const addLegendaryCatches = db.prepare("UPDATE guild SET legendary_catches = legendary_catches + ? WHERE id = 1");
const setUnlockedMilestones = db.prepare("UPDATE guild SET unlocked_milestones_json = ? WHERE id = 1");

interface GuildRow {
  total_catches: number;
  legendary_catches: number;
  marks: number;
  unlocked_milestones_json: string;
}
function guildRow(): GuildRow {
  return (selectGuild.get() as GuildRow | undefined) ?? { total_catches: 0, legendary_catches: 0, marks: 0, unlocked_milestones_json: "[]" };
}

export function guildTotalCatches(): number {
  return guildRow().total_catches;
}
export function guildLegendaryCatches(): number {
  return guildRow().legendary_catches;
}
export function guildMarks(): number {
  return guildRow().marks;
}
export function guildLevel(total = guildTotalCatches()): number {
  let lvl = 0;
  while (lvl < GUILD_MAX_LEVEL && total >= guildCumulative[lvl + 1]) lvl++;
  return lvl;
}
// Shared cast-speed bonus: +0.5%/level, capped at 15% (reached ~level 30).
export function guildSpeedBonus(level = guildLevel()): number {
  return Math.min(0.15, level * 0.005);
}
// Beyond level 20 the Guild also grants shared efficiency, so high levels keep paying.
export function guildEfficiencyBonus(level = guildLevel()): number {
  return Math.max(0, level - 20) * 0.002;
}
export function guildInfo() {
  const row = guildRow();
  const total = row.total_catches;
  const level = guildLevel(total);
  const into = total - guildCumulative[level];
  const needed = level >= GUILD_MAX_LEVEL ? 0 : guildCumulative[level + 1] - guildCumulative[level];
  const unlocked: string[] = row.unlocked_milestones_json ? JSON.parse(row.unlocked_milestones_json) : [];
  const milestones = gameData.guildMilestones.map((m) => ({
    id: m.id, name: m.name, desc: m.desc, icon: m.icon, marks: m.marks, unlocked: unlocked.includes(m.id),
  }));
  return {
    total,
    level,
    maxLevel: GUILD_MAX_LEVEL,
    into,
    needed,
    speedBonus: guildSpeedBonus(level),
    efficiencyBonus: guildEfficiencyBonus(level),
    legendaryCatches: row.legendary_catches,
    marks: row.marks,
    milestones,
  };
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

// A single active provision buff. Food buffs carry speed/rare; drink buffs
// carry efficiency/XP — unused fields stay at their neutral value (1 or 0) so
// both kinds share one shape.
export interface BuffState {
  itemId: string;
  speedMult: number; // multiplies cast time (lower = faster) — food
  rareBonus: number; // — food
  efficiencyBonus: number; // — drink
  xpMult: number; // multiplies XP gained — drink
  expiresAt: number; // ms epoch
}

export interface PlayerState {
  userId: number;
  name: string;
  coins: number;
  skills: Record<string, number>;
  inventory: Record<string, number>;
  bestiary: Record<string, { count: number; max: number }>;
  equipped: {
    rod?: string; lure?: string; reel?: string; line?: string;
    toolForaging?: string; toolCrafting?: string; toolCooking?: string;
    title?: string; // an unlocked achievement id, worn as a display title
  };
  enhancements: Record<string, number>; // rod item id -> enhancement level (0-10)
  loadout: { food?: string; drink?: string }; // provisions auto-consumed from your bag
  foodBuff: BuffState | null;
  drinkBuff: BuffState | null;
  achievements: string[];
  action: ActionState | null;
  queue: QueueEntry[];
  updatedAt: number;
}

const selectChar = db.prepare<[number]>("SELECT * FROM characters WHERE user_id = ?");
const upsertChar = db.prepare(`
  INSERT INTO characters (user_id, name, coins, skills_json, inventory_json, bestiary_json, equipped_json, action_json, buff_json, achievements_json, queue_json, loadout_json, enhancements_json, updated_at)
  VALUES (@user_id, @name, @coins, @skills_json, @inventory_json, @bestiary_json, @equipped_json, @action_json, @buff_json, @achievements_json, @queue_json, @loadout_json, @enhancements_json, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    coins=@coins, skills_json=@skills_json, inventory_json=@inventory_json,
    bestiary_json=@bestiary_json, equipped_json=@equipped_json,
    action_json=@action_json, buff_json=@buff_json,
    achievements_json=@achievements_json, queue_json=@queue_json,
    loadout_json=@loadout_json, enhancements_json=@enhancements_json, updated_at=@updated_at
`);

export function loadPlayer(userId: number): PlayerState | null {
  const row = selectChar.get(userId) as CharacterRow | undefined;
  if (!row) return null;
  const buffs = normalizeBuffs(row.buff_json ? JSON.parse(row.buff_json) : null);
  return {
    userId: row.user_id,
    name: row.name,
    coins: row.coins,
    skills: JSON.parse(row.skills_json),
    inventory: JSON.parse(row.inventory_json),
    bestiary: JSON.parse(row.bestiary_json),
    equipped: JSON.parse(row.equipped_json),
    enhancements: row.enhancements_json ? JSON.parse(row.enhancements_json) : {},
    loadout: row.loadout_json ? JSON.parse(row.loadout_json) : {},
    foodBuff: buffs.food,
    drinkBuff: buffs.drink,
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

function normalizeBuff(raw: any): BuffState | null {
  if (!raw) return null;
  return {
    itemId: raw.itemId ?? raw.dishId,
    speedMult: raw.speedMult ?? 1,
    rareBonus: raw.rareBonus ?? 0,
    efficiencyBonus: raw.efficiencyBonus ?? 0,
    xpMult: raw.xpMult ?? 1,
    expiresAt: raw.expiresAt,
  };
}
// Backfill for saves from before the food/drink split (a single `buff` object
// with a `dishId` was always a food buff).
function normalizeBuffs(raw: any): { food: BuffState | null; drink: BuffState | null } {
  if (!raw) return { food: null, drink: null };
  if ("food" in raw || "drink" in raw) return { food: normalizeBuff(raw.food), drink: normalizeBuff(raw.drink) };
  if (raw.dishId) return { food: normalizeBuff(raw), drink: null };
  return { food: null, drink: null };
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
    buff_json: JSON.stringify({ food: p.foodBuff, drink: p.drinkBuff }),
    achievements_json: JSON.stringify(p.achievements),
    queue_json: JSON.stringify(p.queue),
    loadout_json: JSON.stringify(p.loadout),
    enhancements_json: JSON.stringify(p.enhancements),
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
    enhancements: {},
    loadout: {},
    foodBuff: null,
    drinkBuff: null,
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

// Keep a provision slot topped up: if its buff has expired (or there wasn't
// one yet), auto-consume the next item from the loadout and start a fresh
// buff at exactly `clock` — so a stack of dishes/drinks covers a long offline
// window back-to-back with no gap, and this replays identically whether it's
// running live or catching up on missed time.
function refillBuff(p: PlayerState, kind: "food" | "drink", clock: number) {
  const current = kind === "food" ? p.foodBuff : p.drinkBuff;
  if (current && clock < current.expiresAt) return;
  const itemId = kind === "food" ? p.loadout.food : p.loadout.drink;
  const next = itemId ? startBuff(p, itemId, clock) : null;
  if (kind === "food") p.foodBuff = next;
  else p.drinkBuff = next;
}
function refillBuffs(p: PlayerState, clock: number) {
  refillBuff(p, "food", clock);
  refillBuff(p, "drink", clock);
}
// Consume one of `itemId` (if any remain) and build the buff it grants.
function startBuff(p: PlayerState, itemId: string, clock: number): BuffState | null {
  const def = gameData.items[itemId];
  if (!def || def.buffDurationSec == null || (p.inventory[itemId] || 0) < 1) return null;
  removeItem(p, itemId, 1);
  return {
    itemId,
    speedMult: def.buffSpeedMult ?? 1,
    rareBonus: def.buffRareBonus ?? 0,
    efficiencyBonus: def.buffEfficiencyBonus ?? 0,
    xpMult: def.buffXpMult ?? 1,
    expiresAt: clock + def.buffDurationSec * 1000,
  };
}

function personalCatchTotal(p: PlayerState): number {
  let n = 0;
  for (const [id, r] of Object.entries(p.bestiary)) if (gameData.items[id]?.category === "fish") n += r.count;
  return n;
}
function hasCaughtRarity(p: PlayerState, rarity: string): boolean {
  return Object.keys(p.bestiary).some((id) => gameData.items[id]?.category === "fish" && gameData.items[id]?.rarity === rarity);
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

// Weighted species pick, with rareBonus shifting toward rarer fish. Entries
// with a `condition` (weather/time exclusives) only enter the pool when the
// shared world clock at `clock` matches — evaluated at that exact moment, so
// offline catch-up correctly reflects whatever the sky was doing at the time.
function rollSpecies(zoneId: string, rareBonus: number, clock: number): string | null {
  const zone = zonesById.get(zoneId);
  if (!zone) return null;
  const world = worldStateAt(clock);
  let total = 0;
  const weights: { item: string; w: number }[] = [];
  for (const f of zone.fish) {
    if (f.condition) {
      if (f.condition.time && !f.condition.time.includes(world.time)) continue;
      if (f.condition.weather && !f.condition.weather.includes(world.weather)) continue;
    }
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
// Levels worth a broadcast/celebration, not just a quiet number tick.
export const MILESTONE_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 99];
export function highestMilestoneCrossed(from: number, to: number): number | null {
  let hit: number | null = null;
  for (const m of MILESTONE_LEVELS) if (m > from && m <= to) hit = m;
  return hit;
}

export interface ProgressSummary {
  completions: number;
  bonus: number; // extra completions from efficiency procs
  xpGained: Record<string, number>;
  itemsGained: Record<string, number>;
  coinsGained: number;
  newSpecies: string[]; // species caught for the very first time
  biggest?: { item: string; size: number };
  newAchievements: { id: string; name: string; icon: string; coins: number }[];
  levelUps: { skill: string; from: number; to: number }[];
  notableCatches: { item: string; rarity: string; size: number }[]; // epic/legendary
  newRecords: { item: string; size: number; previousHolder: string | null }[]; // Trophy Hall
  shinyCatches: { item: string; size: number }[]; // 1-in-450 chase variants
  firsts: { item: string; size: number }[]; // first-ever catch of a shiny/exclusive species
  guildLevelUp: { from: number; to: number } | null;
  guildMilestones: { id: string; name: string; icon: string; marks: number }[];
  stopped?: "no_inputs";
}

// A small innate speed bonus from levels above the requirement (efficiency is the
// main level lever; this just makes each level-up tick the timer down a touch).
function levelSpeedFactor(levelsAbove: number): number {
  return 1 - Math.min(0.15, 0.0025 * Math.max(0, levelsAbove));
}

// Effective rod stats after enhancement: speed improves 2%/plus (multiplicative,
// compounding), rare bonus +1pp/plus.
function rodStatsFor(p: PlayerState, rodId: string): { speedMult: number; rareBonus: number; plus: number } {
  const def = gameData.items[rodId];
  const plus = p.enhancements[rodId] || 0;
  return {
    speedMult: (def?.rodSpeedMult ?? 1) * Math.pow(0.98, plus),
    rareBonus: (def?.rodRareBonus ?? 0) + 0.01 * plus,
    plus,
  };
}

// Efficiency: chance(s) to instantly repeat a completion for free extra output.
// +1% per level above the action's requirement, plus the shared Guild bonus, an
// active drink's bonus, an equipped tool's bonus (support skills), an equipped
// reel's bonus (fishing only), and the matching Boathouse room's bonus.
export function efficiencyFor(p: PlayerState, skill: SkillId, levelReq: number, clock: number): number {
  const drinkBonus = p.drinkBuff && clock < p.drinkBuff.expiresAt ? p.drinkBuff.efficiencyBonus : 0;
  const reelBonus = skill === "fishing" && p.equipped.reel ? gameData.items[p.equipped.reel]?.reelEfficiency ?? 0 : 0;
  const toolBonus = skill in TOOL_SLOT ? gameData.items[p.equipped[TOOL_SLOT[skill as ToolSkill]] ?? ""]?.toolEfficiency ?? 0 : 0;
  return (
    0.01 * Math.max(0, skillLevel(p, skill) - levelReq) +
    guildEfficiencyBonus() +
    drinkBonus +
    reelBonus +
    toolBonus +
    boathouseSkillEfficiency(skill)
  );
}
// XP multiplier from an active drink at this moment in sim-time.
function xpMultAt(p: PlayerState, clock: number): number {
  return p.drinkBuff && clock < p.drinkBuff.expiresAt ? p.drinkBuff.xpMult : 1;
}

// Per-completion duration + rare bonus for a single cast at absolute time `clock`.
function fishParamsAt(p: PlayerState, zoneId: string, clock: number): { durMs: number; rareBonus: number } {
  const zone = zonesById.get(zoneId)!;
  const rod = p.equipped.rod ? rodStatsFor(p, p.equipped.rod) : { speedMult: 1, rareBonus: 0 };
  const levelsAbove = skillLevel(p, "fishing") - zone.levelReq;
  const base = zone.baseTimeSec * rod.speedMult * levelSpeedFactor(levelsAbove) * (1 - guildSpeedBonus()) * 1000;
  const event = getActiveEvent();
  const buffed = p.foodBuff && clock < p.foodBuff.expiresAt;
  const eventOn = !!event && event.zoneId === zoneId && clock >= event.startsAt && clock < event.endsAt;
  const durMs = base * (buffed ? p.foodBuff!.speedMult : 1) * (eventOn ? event!.speedMult : 1);
  const rareBonus = rod.rareBonus + (buffed ? p.foodBuff!.rareBonus : 0) + (eventOn ? event!.rareBonus : 0) + boathouseRareBonus();
  return { durMs, rareBonus };
}

// Duration for a support-skill (foraging/crafting/cooking) completion.
function actionDurMs(p: PlayerState, def: { durationSec: number; skill: SkillId; levelReq: number }): number {
  const toolMult = def.skill in TOOL_SLOT ? gameData.items[p.equipped[TOOL_SLOT[def.skill as ToolSkill]] ?? ""]?.toolSpeedMult ?? 1 : 1;
  return def.durationSec * 1000 * levelSpeedFactor(skillLevel(p, def.skill) - def.levelReq) * toolMult;
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
  return def ? actionDurMs(p, def) : 1;
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
  const summary: ProgressSummary = {
    completions: 0, bonus: 0, xpGained: {}, itemsGained: {}, coinsGained: 0,
    newSpecies: [], newAchievements: [], levelUps: [], notableCatches: [], newRecords: [],
    shinyCatches: [], firsts: [], guildLevelUp: null, guildMilestones: [],
  };
  const addItemSum = (id: string, q: number) => (summary.itemsGained[id] = (summary.itemsGained[id] || 0) + q);
  const addXpSum = (s: string, x: number) => (summary.xpGained[s] = (summary.xpGained[s] || 0) + x);

  // Snapshot skill levels so we can report every level crossed by this advance.
  const levelsBefore: Record<string, number> = {};
  for (const s of gameData.skills) levelsBefore[s.id] = skillLevel(p, s.id);

  let guildCatches = 0;
  let legendaryCatches = 0;

  // Grant one full catch's rewards (used by the timed cast and by efficiency procs).
  const doFish = (zone: (typeof gameData.zones)[number], rareBonus: number, xpMult: number) => {
    const rolled = rollSpecies(zone.id, rareBonus, clock);
    if (!rolled) return;
    // Independent chase roll: any fish catch can upgrade to its shiny variant.
    let species = rolled;
    let shiny = false;
    const rolledDef = gameData.items[rolled];
    if (rolledDef?.category === "fish" && Math.random() < SHINY_CHANCE) {
      const shinyId = `shiny_${rolled}`;
      if (gameData.items[shinyId]) { species = shinyId; shiny = true; }
    }
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
    if (def?.category === "fish" && (rarity === "epic" || rarity === "legendary")) {
      summary.notableCatches.push({ item: species, rarity, size });
      if (rarity === "legendary") legendaryCatches++;
    }
    if (shiny) {
      summary.shinyCatches.push({ item: species, size });
      // A shiny catch is still a catch of the base species — same convention
      // as a shiny Pokémon still filling its regular Pokédex entry — so it
      // shouldn't leave "Moonfish" reading "not yet discovered" just because
      // every Moonfish you've hooked so far happened to be shiny ones.
      const baseRec = p.bestiary[rolled];
      if (!baseRec) { p.bestiary[rolled] = { count: 1, max: size }; summary.newSpecies.push(rolled); }
      else { baseRec.count++; if (size > baseRec.max) baseRec.max = size; }
    }
    if (def?.category === "fish" && size > 0) {
      const rec = checkAndSetRecord(species, size, p.userId, p.name);
      if (rec.isRecord) summary.newRecords.push({ item: species, size, previousHolder: rec.previousHolder });
      // Firsts are scoped to shiny/exclusive species only — brand-new content
      // nobody could have caught before this shipped, so "first" is always
      // honestly earned rather than an accident of who reconnects first.
      if (def.shiny || def.exclusive) {
        const first = checkAndSetFirst(species, p.userId, p.name);
        if (first.isFirst) summary.firsts.push({ item: species, size });
      }
    }
    const xp = Math.round(gameData.rarityXp[rarity] * zone.xpMult * xpMult);
    grantXp(p, "fishing", xp);
    addXpSum("fishing", xp);
    if (def?.category === "fish") guildCatches++; // treasure (old boot) is not a fish
    summary.completions++;
  };

  // Grant one produce/gather completion; returns false if inputs were missing.
  const doProduce = (def: (typeof gameData.actions)[number], xpMult: number): boolean => {
    if (def.inputs.length && !hasInputs(p, def)) return false;
    for (const inp of def.inputs) removeItem(p, inp.item, inp.qty);
    for (const out of def.outputs) {
      const chance = out.chance ?? 1;
      const got = chance >= 1 ? out.qty : Math.random() < chance ? out.qty : 0;
      if (got > 0) { addItem(p, out.item, got); addItemSum(out.item, got); }
    }
    const xp = Math.round(def.xp * xpMult);
    grantXp(p, def.skill, xp);
    addXpSum(def.skill, xp);
    summary.completions++;
    return true;
  };

  // If nothing is active but something is queued, promote it.
  if (!p.action && p.queue.length) promoteNext(p);

  let remaining = Math.min(now - p.updatedAt, OFFLINE_CAP_MS);
  let clock = now - remaining; // absolute time as we distribute the elapsed window
  let guard = 0;

  while (remaining > 0 && p.action && guard < SIM_GUARD) {
    guard++;
    const entry = p.action;
    refillBuffs(p, clock);

    if (entry.type === "fish") {
      const zone = zonesById.get(entry.refId);
      if (!zone) { if (!promoteNext(p)) break; continue; }
      const { durMs, rareBonus: baseRare } = fishParamsAt(p, entry.refId, clock);
      const need = durMs - entry.progressMs;
      if (remaining < need) { entry.progressMs += remaining; clock += remaining; remaining = 0; break; }

      // The timed cast: equipped lure adds to rare chance and is (usually) consumed —
      // an equipped line has a chance to save it.
      let rareBonus = baseRare;
      const lure = p.equipped.lure ? gameData.items[p.equipped.lure] : undefined;
      if (lure?.baitRareBonus && (p.inventory[p.equipped.lure!] || 0) > 0) {
        const lineSave = p.equipped.line ? gameData.items[p.equipped.line]?.lineBaitSave ?? 0 : 0;
        if (Math.random() >= lineSave) removeItem(p, p.equipped.lure!, 1);
        rareBonus += lure.baitRareBonus;
      }
      const xpMult = xpMultAt(p, clock);
      doFish(zone, rareBonus, xpMult);
      entry.done++;
      clock += need; remaining -= need; entry.progressMs = 0;

      // Efficiency: free instant extra casts (no time, no lure), using base rare bonus.
      let eff = efficiencyFor(p, "fishing", zone.levelReq, clock);
      while (eff > 0) {
        if (Math.random() < Math.min(1, eff)) { doFish(zone, baseRare, xpMult); entry.done++; summary.bonus++; }
        eff -= 1;
      }
      if (entry.target > 0 && entry.done >= entry.target) { if (!promoteNext(p)) break; }
      continue;
    }

    // gather / produce
    const def = actionsById.get(entry.refId);
    if (!def) { if (!promoteNext(p)) break; continue; }
    const need = actionDurMs(p, def) - entry.progressMs;
    if (remaining < need) { entry.progressMs += remaining; clock += remaining; remaining = 0; break; }

    if (def.inputs.length && !hasInputs(p, def)) {
      // Out of materials — move on to the next queued task (or stop).
      if (!promoteNext(p)) { summary.stopped = "no_inputs"; break; }
      continue; // note: time not consumed; next entry starts fresh
    }

    const xpMult = xpMultAt(p, clock);
    doProduce(def, xpMult);
    entry.done++;
    clock += need; remaining -= need; entry.progressMs = 0;

    // Efficiency procs (skip a proc if it would run out of inputs).
    let eff = efficiencyFor(p, def.skill, def.levelReq, clock);
    while (eff > 0) {
      if (Math.random() < Math.min(1, eff)) { if (doProduce(def, xpMult)) { entry.done++; summary.bonus++; } }
      eff -= 1;
    }
    if (entry.target > 0 && entry.done >= entry.target) { if (!promoteNext(p)) break; }
  }

  // Keep provisions ticking even while idle (no active action).
  refillBuffs(p, now);

  if (guildCatches > 0) {
    const before = guildLevel();
    addGuild.run(guildCatches);
    const after = guildLevel();
    if (after > before) summary.guildLevelUp = { from: before, to: after };
  }
  if (legendaryCatches > 0) addLegendaryCatches.run(legendaryCatches);
  if (guildCatches > 0 || legendaryCatches > 0) evaluateGuildMilestones(summary);

  for (const s of gameData.skills) {
    const to = skillLevel(p, s.id);
    if (to > levelsBefore[s.id]) summary.levelUps.push({ skill: s.id, from: levelsBefore[s.id], to });
  }

  evaluateAchievements(p, summary);
  p.updatedAt = now;
  return summary;
}

// Check every not-yet-unlocked shared Guild milestone; grant Guild Marks for
// newly-met ones. Only worth checking when guild counters just moved.
const addGuildMarksStmt = db.prepare("UPDATE guild SET marks = marks + ? WHERE id = 1");
function evaluateGuildMilestones(summary: ProgressSummary) {
  const row = guildRow();
  const unlocked: string[] = row.unlocked_milestones_json ? JSON.parse(row.unlocked_milestones_json) : [];
  const level = guildLevel(row.total_catches);
  let changed = false;
  for (const m of gameData.guildMilestones) {
    if (unlocked.includes(m.id)) continue;
    let met = false;
    switch (m.cond.type) {
      case "total_catches": met = row.total_catches >= m.cond.value; break;
      case "legendary_catches": met = row.legendary_catches >= m.cond.value; break;
      case "guild_level": met = level >= m.cond.value; break;
    }
    if (met) {
      unlocked.push(m.id);
      changed = true;
      addGuildMarksStmt.run(m.marks);
      summary.guildMilestones.push({ id: m.id, name: m.name, icon: m.icon, marks: m.marks });
    }
  }
  if (changed) setUnlockedMilestones.run(JSON.stringify(unlocked));
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

// Set (or clear, with item = null) your Food or Drink provision. If that slot
// isn't currently active, this consumes one immediately so the boost starts
// right away rather than waiting for the next natural refill.
export function setLoadout(p: PlayerState, kind: "food" | "drink", item: string | null): { ok: boolean; error?: string } {
  if (item != null) {
    const def = gameData.items[item];
    const wantCategory = kind === "food" ? "dish" : "drink";
    if (!def || def.category !== wantCategory || def.buffDurationSec == null) {
      return { ok: false, error: kind === "food" ? "That isn't a dish." : "That isn't a drink." };
    }
    if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't have any of that." };
  }
  if (kind === "food") p.loadout.food = item ?? undefined;
  else p.loadout.drink = item ?? undefined;
  refillBuff(p, kind, Date.now());
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

export function equipLure(p: PlayerState, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "bait") return { ok: false, error: "That isn't bait." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't have any of that." };
  p.equipped.lure = item;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipLure(p: PlayerState) {
  delete p.equipped.lure;
  p.updatedAt = Date.now();
}

export function equipReel(p: PlayerState, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "reel") return { ok: false, error: "That isn't a reel." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't own that." };
  p.equipped.reel = item;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipReel(p: PlayerState) {
  delete p.equipped.reel;
  p.updatedAt = Date.now();
}

export function equipLine(p: PlayerState, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "line") return { ok: false, error: "That isn't a line." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't own that." };
  p.equipped.line = item;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipLine(p: PlayerState) {
  delete p.equipped.line;
  p.updatedAt = Date.now();
}

export function equipTool(p: PlayerState, skill: ToolSkill, item: string): { ok: boolean; error?: string } {
  const def = gameData.items[item];
  if (!def || def.category !== "tool" || def.toolSkill !== skill) return { ok: false, error: "That tool doesn't fit there." };
  if ((p.inventory[item] || 0) < 1) return { ok: false, error: "You don't own that." };
  p.equipped[TOOL_SLOT[skill]] = item;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipTool(p: PlayerState, skill: ToolSkill) {
  delete p.equipped[TOOL_SLOT[skill]];
  p.updatedAt = Date.now();
}

// ---- Titles (cosmetic — earned achievements you can wear as a name badge) ----
export function equipTitle(p: PlayerState, achievementId: string): { ok: boolean; error?: string } {
  const def = gameData.achievements.find((a) => a.id === achievementId);
  if (!def || !def.title) return { ok: false, error: "That's not a title." };
  if (!p.achievements.includes(achievementId)) return { ok: false, error: "You haven't earned that title yet." };
  p.equipped.title = achievementId;
  p.updatedAt = Date.now();
  return { ok: true };
}
export function unequipTitle(p: PlayerState) {
  delete p.equipped.title;
  p.updatedAt = Date.now();
}

// ---- Rod enhancement (+1..+10) ----
// Success chance by target level; cozy contract — a failed attempt only costs
// the materials/coins, never the rod itself.
const ENHANCE_SUCCESS = [0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25];
const ENHANCE_MAX = 10;
function enhanceCost(targetLevel: number) {
  return {
    driftwood: targetLevel,
    fishing_line: targetLevel,
    pearl: Math.ceil(targetLevel / 3),
    coins: 25 * targetLevel * targetLevel,
  };
}
export function enhanceInfo(p: PlayerState, rodId: string) {
  const def = gameData.items[rodId];
  if (!def || def.category !== "rod") return null;
  const plus = p.enhancements[rodId] || 0;
  if (plus >= ENHANCE_MAX) return { plus, maxed: true as const };
  const target = plus + 1;
  const cost = enhanceCost(target);
  const chance = Math.min(1, ENHANCE_SUCCESS[target] + boathouseEnhanceBonus());
  return { plus, maxed: false as const, target, cost, chance };
}
export function enhanceRod(p: PlayerState, rodId: string, useProtection: boolean): { ok: boolean; error?: string; success?: boolean; newPlus?: number; chance?: number } {
  const def = gameData.items[rodId];
  if (!def || def.category !== "rod") return { ok: false, error: "That isn't a rod." };
  const owned = p.equipped.rod === rodId || (p.inventory[rodId] || 0) > 0;
  if (!owned) return { ok: false, error: "You don't own that rod." };
  const plus = p.enhancements[rodId] || 0;
  if (plus >= ENHANCE_MAX) return { ok: false, error: "Already at max enhancement." };
  const target = plus + 1;
  const cost = enhanceCost(target);
  if ((p.inventory.driftwood || 0) < cost.driftwood) return { ok: false, error: "Not enough driftwood." };
  if ((p.inventory.fishing_line || 0) < cost.fishing_line) return { ok: false, error: "Not enough fishing line." };
  if ((p.inventory.pearl || 0) < cost.pearl) return { ok: false, error: "Not enough pearls." };
  if (p.coins < cost.coins) return { ok: false, error: "Not enough coins." };
  const useLacquer = useProtection && (p.inventory.blessed_lacquer || 0) > 0;
  if (useProtection && !useLacquer) return { ok: false, error: "No Blessed Lacquer." };

  removeItem(p, "driftwood", cost.driftwood);
  removeItem(p, "fishing_line", cost.fishing_line);
  removeItem(p, "pearl", cost.pearl);
  p.coins -= cost.coins;
  if (useLacquer) removeItem(p, "blessed_lacquer", 1);

  const chance = Math.min(1, ENHANCE_SUCCESS[target] + boathouseEnhanceBonus() + (useLacquer ? 0.15 : 0));
  const success = Math.random() < chance;
  if (success) p.enhancements[rodId] = target;
  p.updatedAt = Date.now();
  return { ok: true, success, newPlus: p.enhancements[rodId] || 0, chance };
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
  const left = p.inventory[item] || 0;
  if (left < 1) {
    if (p.equipped.rod === item) delete p.equipped.rod;
    if (p.equipped.lure === item) delete p.equipped.lure;
    if (p.equipped.reel === item) delete p.equipped.reel;
    if (p.equipped.line === item) delete p.equipped.line;
    for (const slot of Object.values(TOOL_SLOT)) if (p.equipped[slot] === item) delete p.equipped[slot];
  }
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

  const describeBuff = (b: BuffState | null): any => {
    if (!b || now >= b.expiresAt) return null;
    const d = gameData.items[b.itemId];
    return {
      itemId: b.itemId,
      name: d?.name ?? b.itemId,
      icon: d?.icon ?? "⭐",
      speedMult: b.speedMult,
      rareBonus: b.rareBonus,
      efficiencyBonus: b.efficiencyBonus,
      xpMult: b.xpMult,
      expiresAt: b.expiresAt,
      remainingSec: Math.max(0, Math.round((b.expiresAt - now) / 1000)),
    };
  };
  const foodBuff = describeBuff(p.foodBuff);
  const drinkBuff = describeBuff(p.drinkBuff);

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
    enhancements: p.enhancements,
    rodStats: p.equipped.rod ? rodStatsFor(p, p.equipped.rod) : null,
    loadout: p.loadout,
    foodBuff,
    drinkBuff,
    achievements: p.achievements,
    action,
    queue,
  };
}
