import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, type UserRow } from "./db.js";
import { createCharacter } from "./engine.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const insertUser = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)");
const findUser = db.prepare("SELECT * FROM users WHERE username = ?");
const insertSession = db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)");
const findSession = db.prepare("SELECT user_id FROM sessions WHERE token = ?");
const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");

export function register(username: string, password: string): { ok: true; token: string; userId: number } | { ok: false; error: string } {
  username = username.trim();
  if (username.length < 2 || username.length > 20) return { ok: false, error: "Username must be 2-20 characters." };
  if (password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
  if (findUser.get(username)) return { ok: false, error: "That name is taken." };
  const info = insertUser.run(username, hashPassword(password), Date.now());
  const userId = Number(info.lastInsertRowid);
  createCharacter(userId, username);
  const token = randomBytes(24).toString("hex");
  insertSession.run(token, userId, Date.now());
  return { ok: true, token, userId };
}

export function login(username: string, password: string): { ok: true; token: string; userId: number } | { ok: false; error: string } {
  const user = findUser.get(username.trim()) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return { ok: false, error: "Wrong name or password." };
  const token = randomBytes(24).toString("hex");
  insertSession.run(token, user.id, Date.now());
  return { ok: true, token, userId: user.id };
}

export function userIdForToken(token: string | undefined): number | null {
  if (!token) return null;
  const row = findSession.get(token) as { user_id: number } | undefined;
  return row ? row.user_id : null;
}

export function logout(token: string): void {
  deleteSession.run(token);
}
