import { db } from "./db.js";
import { gameData } from "./content/gameData.js";
import type { SkillId } from "./content/types.js";
import { spendFromPurse, purseCoins } from "./purse.js";

const roomDefs = new Map(gameData.boathouseRooms.map((r) => [r.id, r]));
const BAIT_GARDEN_CAP_MS = 12 * 3600 * 1000;

const selectBoathouse = db.prepare("SELECT rooms_json, bait_last_tick FROM boathouse WHERE id = 1");
const updateRooms = db.prepare("UPDATE boathouse SET rooms_json = ? WHERE id = 1");
const updateBaitTick = db.prepare("UPDATE boathouse SET bait_last_tick = ? WHERE id = 1");

function loadRooms(): Record<string, number> {
  const row = selectBoathouse.get() as { rooms_json: string } | undefined;
  return row ? JSON.parse(row.rooms_json) : {};
}
function saveRooms(rooms: Record<string, number>) {
  updateRooms.run(JSON.stringify(rooms));
}

export function roomLevel(id: string): number {
  return loadRooms()[id] || 0;
}

function costAt(roomId: string, targetLevel: number): { coins: number; materials: { item: string; qty: number }[] } | null {
  const def = roomDefs.get(roomId);
  if (!def) return null;
  const mult = Math.pow(def.costGrowth, targetLevel - 1);
  return {
    coins: Math.round(def.baseCoins * mult),
    materials: def.baseMaterials.map((m) => ({ item: m.item, qty: Math.round(m.qty * mult) })),
  };
}

// Full status for the client: every room's level, description, and the cost
// to reach the next one (null if maxed).
export function boathouseInfo() {
  const rooms = loadRooms();
  return {
    purseCoins: purseCoins(),
    rooms: gameData.boathouseRooms.map((def) => {
      const level = rooms[def.id] || 0;
      const maxed = level >= def.maxLevel;
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        desc: def.desc,
        level,
        maxLevel: def.maxLevel,
        nextCost: maxed ? null : costAt(def.id, level + 1),
      };
    }),
  };
}

// Upgrade a room, spending shared Bank materials + shared Purse coins. `bank`
// is the caller's live bank-items object (from bank.ts); mutated on success.
export function upgradeRoom(roomId: string, bank: Record<string, number>): { ok: boolean; error?: string; newLevel?: number } {
  const def = roomDefs.get(roomId);
  if (!def) return { ok: false, error: "Unknown room." };
  const rooms = loadRooms();
  const level = rooms[roomId] || 0;
  if (level >= def.maxLevel) return { ok: false, error: "Already at max level." };
  const cost = costAt(roomId, level + 1)!;
  if (purseCoins() < cost.coins) return { ok: false, error: `Needs 🪙${cost.coins.toLocaleString()} in the shared purse.` };
  for (const m of cost.materials) {
    if ((bank[m.item] || 0) < m.qty) return { ok: false, error: `The shared bank needs more ${m.item.replace(/_/g, " ")}.` };
  }
  if (!spendFromPurse(cost.coins)) return { ok: false, error: "Not enough in the shared purse." };
  for (const m of cost.materials) {
    const left = bank[m.item] - m.qty;
    if (left <= 0) delete bank[m.item];
    else bank[m.item] = left;
  }
  rooms[roomId] = level + 1;
  saveRooms(rooms);
  return { ok: true, newLevel: level + 1 };
}

// ---- Bonuses rooms grant ----
export function boathouseSkillEfficiency(skill: SkillId): number {
  const rooms = loadRooms();
  if (skill === "fishing") return (rooms.dock || 0) * 0.02;
  if (skill === "cooking") return (rooms.smokery || 0) * 0.02;
  if (skill === "crafting") return (rooms.workshop || 0) * 0.02;
  return 0;
}
export function boathouseRareBonus(): number {
  return (loadRooms().trophy_hall || 0) * 0.005;
}
export function boathouseEnhanceBonus(): number {
  return (loadRooms().workshop || 0) * 0.01;
}
export function chartRoomBonus(): { extraDurationMs: number; extraRareBonus: number } {
  const level = loadRooms().chart_room || 0;
  return { extraDurationMs: level * 30_000, extraRareBonus: level * 0.02 };
}

// ---- Bait Garden: passive worm/grub income into the shared Bank ----
// Called periodically; deposits directly into the given bank-items object and
// returns what was added (or null if the room is unbuilt / nothing accrued).
export function tickBaitGarden(bank: Record<string, number>, now = Date.now()): { worms: number; grubs: number } | null {
  const level = loadRooms().bait_garden || 0;
  const row = selectBoathouse.get() as { bait_last_tick: number } | undefined;
  const lastTick = row?.bait_last_tick || now;
  if (level <= 0) {
    updateBaitTick.run(now); // don't accrue backlog while unbuilt
    return null;
  }
  const elapsed = Math.min(now - lastTick, BAIT_GARDEN_CAP_MS);
  updateBaitTick.run(now);
  const hours = elapsed / 3600_000;
  const worms = Math.floor(4 * level * hours);
  const grubs = Math.floor(1 * level * hours);
  if (worms <= 0 && grubs <= 0) return null;
  if (worms > 0) bank.worm = (bank.worm || 0) + worms;
  if (grubs > 0) bank.grub = (bank.grub || 0) + grubs;
  return { worms, grubs };
}
