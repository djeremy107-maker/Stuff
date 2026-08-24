import { db } from "./db.js";
import { gameData } from "./content/gameData.js";
import type { PlayerState } from "./engine.js";

// The shared bank is a single stash both anglers use.
const selectBank = db.prepare("SELECT items_json FROM bank WHERE id = 1");
const updateBank = db.prepare("UPDATE bank SET items_json = ? WHERE id = 1");

export function loadBank(): Record<string, number> {
  const row = selectBank.get() as { items_json: string } | undefined;
  return row ? JSON.parse(row.items_json) : {};
}
export function saveBank(items: Record<string, number>) {
  updateBank.run(JSON.stringify(items));
}

function invRemove(inv: Record<string, number>, item: string, qty: number): boolean {
  const have = inv[item] || 0;
  if (have < qty) return false;
  const left = have - qty;
  if (left === 0) delete inv[item];
  else inv[item] = left;
  return true;
}

export interface BankResult {
  ok: boolean;
  error?: string;
  bank: Record<string, number>;
}

export function deposit(p: PlayerState, item: string, qty: number): BankResult {
  const bank = loadBank();
  if (!gameData.items[item]) return { ok: false, error: "Unknown item.", bank };
  const have = p.inventory[item] || 0;
  qty = Math.min(Math.max(1, Math.floor(qty)), have);
  if (qty < 1) return { ok: false, error: "You have none of that.", bank };
  // Don't let the currently equipped rod get banked out from under you.
  if (p.equipped.rod === item && have - qty < 1) delete p.equipped.rod;
  invRemove(p.inventory, item, qty);
  bank[item] = (bank[item] || 0) + qty;
  saveBank(bank);
  p.updatedAt = Date.now();
  return { ok: true, bank };
}

export function withdraw(p: PlayerState, item: string, qty: number): BankResult {
  const bank = loadBank();
  const have = bank[item] || 0;
  qty = Math.min(Math.max(1, Math.floor(qty)), have);
  if (qty < 1) return { ok: false, error: "The bank has none of that.", bank };
  const left = have - qty;
  if (left === 0) delete bank[item];
  else bank[item] = left;
  p.inventory[item] = (p.inventory[item] || 0) + qty;
  saveBank(bank);
  p.updatedAt = Date.now();
  return { ok: true, bank };
}
