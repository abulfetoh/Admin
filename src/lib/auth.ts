import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import type { Db } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

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

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(key, expected);
}

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
  if (row.locked_until && row.locked_until > now) throw new AuthError("Too many attempts. Try again later.");
  if (!(await verifyPassword(password, row.password_hash))) {
    const fails = row.failed_logins + 1;
    await db.query("UPDATE users SET failed_logins=$2, locked_until=$3 WHERE id=$1", [
      row.id,
      fails >= MAX_FAILS ? 0 : fails,
      fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null,
    ]);
    throw new AuthError(BAD_CREDS);
  }
  await db.query("UPDATE users SET failed_logins=0, locked_until=NULL WHERE id=$1", [row.id]);
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
