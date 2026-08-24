import { db } from "./db.js";
import type { PlayerState } from "./engine.js";

// The shared purse funds Boathouse construction. Either player can top it up
// from their personal coins; nothing else spends personal coins directly.
const selectPurse = db.prepare("SELECT coins FROM purse WHERE id = 1");
const updatePurse = db.prepare("UPDATE purse SET coins = ? WHERE id = 1");

export function purseCoins(): number {
  const row = selectPurse.get() as { coins: number } | undefined;
  return row?.coins ?? 0;
}

export function contributeToPurse(p: PlayerState, amount: number): { ok: boolean; error?: string; purseCoins?: number } {
  amount = Math.floor(amount);
  if (amount < 1) return { ok: false, error: "Enter a positive amount." };
  if (p.coins < amount) return { ok: false, error: "Not enough coins." };
  p.coins -= amount;
  const newTotal = purseCoins() + amount;
  updatePurse.run(newTotal);
  p.updatedAt = Date.now();
  return { ok: true, purseCoins: newTotal };
}

// Internal: spend from the purse (used by boathouse.ts). Returns false if insufficient.
export function spendFromPurse(amount: number): boolean {
  const cur = purseCoins();
  if (cur < amount) return false;
  updatePurse.run(cur - amount);
  return true;
}
