import { db } from "./db.js";

// "Firsts" board: whoever catches a species first gets permanent bragging
// rights — a second flex axis alongside the Trophy Hall's biggest-size
// record. Scoped in practice to shiny variants and weather/time exclusives
// (brand-new content nobody could have caught before this shipped), so a
// "first" is always honestly earned rather than an accident of who happened
// to reconnect first on deploy day — see engine.ts's evaluateAchievements-
// adjacent catch handling for exactly which species get celebrated.
const selectFirst = db.prepare("SELECT holder_user_id, holder_name, ts FROM firsts WHERE species = ?");
const selectAllFirsts = db.prepare("SELECT * FROM firsts");
const insertFirst = db.prepare("INSERT OR IGNORE INTO firsts (species, holder_user_id, holder_name, ts) VALUES (?, ?, ?, ?)");

export interface FirstRow {
  species: string;
  holder_user_id: number;
  holder_name: string;
  ts: number;
}

export function firstFor(species: string): FirstRow | null {
  const row = selectFirst.get(species) as Omit<FirstRow, "species"> | undefined;
  return row ? { species, ...row } : null;
}

export function allFirsts(): FirstRow[] {
  return selectAllFirsts.all() as FirstRow[];
}

// Records the catch if nobody's claimed this species yet (INSERT OR IGNORE —
// atomic, so two simultaneous first catches can't both "win"). Returns
// whether this catch was the one that claimed it.
export function checkAndSetFirst(species: string, userId: number, name: string): { isFirst: boolean } {
  const result = insertFirst.run(species, userId, name, Date.now());
  return { isFirst: result.changes > 0 };
}
