import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

import { z } from "zod";
import type { Db } from "./db";

const scryptRaw = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: ScryptOptions) => Promise<Buffer>;

/**
 * Password hashing cost. OWASP-style minimum for scrypt is N=2^17, r=8, p=1 (~128 MB, ~0.5 s per hash on the
 * benchmark machine). Tests lower it via SCRYPT_LOG_N for speed; production must leave it unset.
 */
export function scryptCost() {
  const logN = Number(process.env.SCRYPT_LOG_N ?? 17);
  return { N: 2 ** (Number.isInteger(logN) && logN >= 10 && logN <= 20 ? logN : 17), r: 8, p: 1 };
}
const KEYLEN = 64;

// Each hash can allocate ~128 MB; bound concurrency so a burst of logins can't exhaust memory.
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}
const derive = (pw: string, salt: Buffer, len: number, c: { N: number; r: number; p: number }) =>
  withSlot(() => scryptRaw(pw, salt, len, { ...c, maxmem: 256 * 1024 * 1024 }));

/** Format: scrypt$N$r$p$saltHex$keyHex (parameters stored so they can be raised later). */
export async function hashPassword(pw: string): Promise<string> {
  const c = scryptCost();
  const salt = randomBytes(16);
  const key = await derive(pw, salt, KEYLEN, c);
  return `scrypt$${c.N}$${c.r}$${c.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

function parseHash(stored: string) {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { N: 16384, r: 8, p: 1, salt: parts[1], key: parts[2] }; // legacy format (Node defaults)
  if (parts.length === 6) return { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), salt: parts[4], key: parts[5] };
  return null;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const h = parseHash(stored);
  if (!h || !h.salt || !h.key || !(h.N >= 2 ** 10 && h.N <= 2 ** 20) || !(h.r > 0 && h.r <= 16) || !(h.p > 0 && h.p <= 4)) return false;
  const expected = Buffer.from(h.key, "hex");
  const key = await derive(pw, Buffer.from(h.salt, "hex"), expected.length, h);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** True for legacy-format hashes or hashes made with a weaker cost than the current setting. */
export function needsRehash(stored: string): boolean {
  const h = parseHash(stored);
  const c = scryptCost();
  return !h || stored.split("$").length === 3 || h.N < c.N || h.r < c.r || h.p < c.p;
}

export type Role = "candidate" | "employer" | "admin";
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export const SESSION_DAYS = 14;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["candidate", "employer"]), // admin can never be self-registered
});

export class AuthError extends Error {}

export async function registerUser(db: Db, input: unknown): Promise<User> {
  const p = RegisterInput.safeParse(input);
  if (!p.success) throw new AuthError(p.error.issues[0].message);
  const { email, password, name, role } = p.data;
  const hash = await hashPassword(password);
  try {
    const r = await db.query<User>(
      "INSERT INTO users(email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role",
      [email, hash, name, role],
    );
    return r.rows[0];
  } catch (e) {
    if (String(e).includes("users_email_idx")) throw new AuthError("An account with this email already exists");
    throw e;
  }
}

// Same message for unknown email / wrong password to avoid account enumeration.
const BAD_CREDS = "Invalid email or password";
// Locked accounts get the SAME message (and do the same work) as wrong passwords, so lockout state can't be used to confirm an email exists.

export async function login(db: Db, emailRaw: string, password: string, now = new Date()): Promise<User> {
  const email = emailRaw.trim().toLowerCase();
  const row = (await db.query<User & { password_hash: string; failed_logins: number; locked_until: Date | null }>(
    "SELECT id, email, name, role, password_hash, failed_logins, locked_until FROM users WHERE lower(email)=$1",
    [email],
  )).rows[0];
  if (!row) {
    await hashPassword(password); // equalise timing
    throw new AuthError(BAD_CREDS);
  }
  const locked = !!row.locked_until && row.locked_until > now;
  const ok = await verifyPassword(password, row.password_hash); // always do the work, locked or not (constant-ish timing)
  if (locked) throw new AuthError(BAD_CREDS);
  if (!ok) {
    const fails = row.failed_logins + 1;
    await db.query("UPDATE users SET failed_logins=$2, locked_until=$3 WHERE id=$1", [
      row.id,
      fails >= MAX_FAILS ? 0 : fails,
      fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
    ]);
    throw new AuthError(BAD_CREDS);
  }
  await db.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1", [row.id]);
  if (needsRehash(row.password_hash)) await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [row.id, await hashPassword(password)]);
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Returns the raw token (goes in the cookie); only its hash is stored. */
export async function createSession(db: Db, userId: number, now = new Date()): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await db.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2,$3)", [sha(token), userId, expires]);
  return { token, expires };
}

export async function userFromToken(db: Db, token: string | undefined, now = new Date()): Promise<User | null> {
  if (!token) return null;
  const r = await db.query<User>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > $2`,
    [sha(token), now],
  );
  return r.rows[0] ?? null;
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash=$1", [sha(token)]);
}

export const hasRole = (u: User | null, ...roles: Role[]): u is User => !!u && roles.includes(u.role);
