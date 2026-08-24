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
    hp             INTEGER NOT NULL DEFAULT 20,
    max_hp         INTEGER NOT NULL DEFAULT 20,
    skills_json    TEXT NOT NULL DEFAULT '{}',
    inventory_json TEXT NOT NULL DEFAULT '{}',
    action_json    TEXT,
    updated_at     INTEGER NOT NULL
  );

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
  hp: number;
  max_hp: number;
  skills_json: string;
  inventory_json: string;
  action_json: string | null;
  updated_at: number;
}

export interface MessageRow {
  id: number;
  user_id: number;
  name: string;
  text: string;
  ts: number;
}
