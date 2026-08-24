import { db } from "./db.js";

// Trophy Hall records: the biggest catch of each species, by either player.
const selectRecord = db.prepare("SELECT holder_user_id, holder_name, size, ts FROM records WHERE species = ?");
const selectAllRecords = db.prepare("SELECT * FROM records");
const upsertRecord = db.prepare(`
  INSERT INTO records (species, holder_user_id, holder_name, size, ts) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(species) DO UPDATE SET holder_user_id=excluded.holder_user_id, holder_name=excluded.holder_name, size=excluded.size, ts=excluded.ts
`);

export interface RecordRow {
  species: string;
  holder_user_id: number;
  holder_name: string;
  size: number;
  ts: number;
}

export function recordFor(species: string): RecordRow | null {
  const row = selectRecord.get(species) as Omit<RecordRow, "species"> | undefined;
  return row ? { species, ...row } : null;
}

export function allRecords(): RecordRow[] {
  return selectAllRecords.all() as RecordRow[];
}

// Checks a catch against the current record; if it's a new (or first) record,
// stores it and returns the previous holder's name (null if there was none).
export function checkAndSetRecord(species: string, size: number, userId: number, name: string): { isRecord: boolean; previousHolder: string | null } {
  if (size <= 0) return { isRecord: false, previousHolder: null };
  const existing = recordFor(species);
  if (existing && existing.size >= size) return { isRecord: false, previousHolder: null };
  upsertRecord.run(species, userId, name, size, Date.now());
  return { isRecord: true, previousHolder: existing?.holder_name ?? null };
}
