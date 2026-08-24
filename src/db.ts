import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH || "./data/game.sqlite";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    coins          INTEGER NOT NULL DEFAULT 0,
    skills_json    TEXT NOT NULL DEFAULT '{}',
    inventory_json TEXT NOT NULL DEFAULT '{}',
    bestiary_json  TEXT NOT NULL DEFAULT '{}',
    equipped_json  TEXT NOT NULL DEFAULT '{}',
    action_json    TEXT,
    bait_active    INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL
  );

  -- Shared coop progression: the two of you level up the Guild together.
  CREATE TABLE IF NOT EXISTS guild (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    total_catches INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO guild (id, total_catches) VALUES (1, 0);

  -- Shared bank: a stash both anglers can deposit into and withdraw from.
  CREATE TABLE IF NOT EXISTS bank (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    items_json TEXT NOT NULL DEFAULT '{}'
  );
  INSERT OR IGNORE INTO bank (id, items_json) VALUES (1, '{}');`);

// Lightweight migrations for databases created before a column existed.
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn("characters", "buff_json", "buff_json TEXT NOT NULL DEFAULT ''");
ensureColumn("characters", "achievements_json", "achievements_json TEXT NOT NULL DEFAULT '[]'");
ensureColumn("characters", "queue_json", "queue_json TEXT NOT NULL DEFAULT '[]'");

db.exec(`

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    text    TEXT NOT NULL,
    ts      INTEGER NOT NULL
  );
`);

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export interface CharacterRow {
  user_id: number;
  name: string;
  coins: number;
  skills_json: string;
  inventory_json: string;
  bestiary_json: string;
  equipped_json: string;
  action_json: string | null;
  bait_active: number;
  buff_json: string;
  achievements_json: string;
  queue_json: string;
  updated_at: number;
}

export interface MessageRow {
  id: number;
  user_id: number;
  name: string;
  text: string;
  ts: number;
}
