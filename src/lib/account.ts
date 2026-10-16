import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import { AuthError, hashPassword, type User } from "./auth";
import { enqueueEmail } from "./email";
import { SITE_URL } from "./locale-const";

type Purpose = "verify" | "reset";
const TTL_MS: Record<Purpose, number> = { verify: 48 * 3600_000, reset: 60 * 60_000 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueToken(db: Db, userId: number, purpose: Purpose, now = new Date()): Promise<string> {
  await db.query("DELETE FROM auth_tokens WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL", [userId, purpose]); // newest link wins
  const raw = randomBytes(32).toString("base64url");
  await db.query("INSERT INTO auth_tokens(token_hash, user_id, purpose, expires_at) VALUES ($1,$2,$3,$4)", [sha(raw), userId, purpose, new Date(now.getTime() + TTL_MS[purpose])]);
  return raw;
}

/** Atomically burns the token; returns the user id only on first valid use. */
export async function consumeToken(db: Db, raw: string, purpose: Purpose, now = new Date()): Promise<number | null> {
  const r = await db.query<{ user_id: number }>(
    "UPDATE auth_tokens SET used_at=$3 WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at > $3 RETURNING user_id",
    [sha(raw), purpose, now],
  );
  return r.rows[0]?.user_id ?? null;
}

export async function sendVerification(db: Db, user: Pick<User, "id" | "email">, now = new Date()): Promise<void> {
  const token = await issueToken(db, user.id, "verify", now);
  await enqueueEmail(db, { to: user.email, subject: "Confirm your email", body: `Confirm your email address:\n${SITE_URL}/verify/${token}\n\nThis link expires in 48 hours. If you didn't sign up, ignore this message.\n` });
}

export async function verifyEmail(db: Db, raw: string, now = new Date()): Promise<boolean> {
  const id = await consumeToken(db, raw, "verify", now);
  if (id == null) return false;
  await db.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2) WHERE id=$1", [id, now]);
  return true;
}

export async function isVerified(db: Db, userId: number): Promise<boolean> {
  const r = await db.query<{ v: Date | null; role: string }>("SELECT email_verified_at v, role FROM users WHERE id=$1", [userId]);
  return !!r.rows[0] && (r.rows[0].v !== null || r.rows[0].role === "admin");
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function requestPasswordReset(db: Db, emailRaw: string, now = new Date()): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const u = (await db.query<{ id: number; email: string }>("SELECT id, email FROM users WHERE lower(email)=$1", [email])).rows[0];
  if (!u) return;
  const token = await issueToken(db, u.id, "reset", now);
  await enqueueEmail(db, { to: u.email, subject: "Reset your password", body: `Reset your password:\n${SITE_URL}/reset/${token}\n\nThis link expires in 1 hour and works once. If you didn't ask for this, ignore this message.\n` });
}

const NewPassword = z.string().min(10, "Password must be at least 10 characters").max(200);

export async function resetPassword(db: Db, raw: string, newPassword: string, now = new Date()): Promise<void> {
  const p = NewPassword.safeParse(newPassword);
  if (!p.success) throw new AuthError(p.error.issues[0].message); // validate BEFORE burning the token
  const id = await consumeToken(db, raw, "reset", now);
  if (id == null) throw new AuthError("This reset link is invalid or has expired");
  await db.query("UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL WHERE id=$1", [id, await hashPassword(p.data)]);
  await db.query("DELETE FROM sessions WHERE user_id=$1", [id]); // log out every device
}

/** Everything we hold about the user, for a data-portability request. Password hash and session tokens are deliberately excluded. */
export async function exportUserData(db: Db, user: User) {
  const q = async (sql: string) => (await db.query(sql, [user.id])).rows;
  return {
    exported_at: new Date().toISOString(),
    user: (await q("SELECT id, email, name, role, email_verified_at, created_at FROM users WHERE id=$1"))[0],
    profile: (await q("SELECT headline, summary, location, phone, skills, experience, education, updated_at FROM profiles WHERE user_id=$1"))[0] ?? null,
    saved_searches: await q("SELECT q, location, remote, created_at FROM saved_searches WHERE user_id=$1 ORDER BY id"),
    posted_jobs: await q("SELECT id, title, status, posted_at FROM jobs WHERE posted_by=$1 ORDER BY id"),
    emails_sent: await q("SELECT subject, status, created_at FROM email_outbox WHERE to_email=(SELECT email FROM users WHERE id=$1) ORDER BY id"),
    ai_usage: await q("SELECT feature, created_at FROM ai_usage WHERE user_id=$1 ORDER BY id"),
  };
}

/** Requires the current password. Deletes the account and cascades profile/sessions/alerts/tokens; the user's posted jobs are taken down. */
export async function deleteAccount(db: Db, user: User, password: string): Promise<void> {
  const row = (await db.query<{ password_hash: string; role: string }>("SELECT password_hash, role FROM users WHERE id=$1", [user.id])).rows[0];
  if (!row || !(await (await import("./auth")).verifyPassword(password, row.password_hash))) throw new AuthError("Incorrect password");
  if (row.role === "admin") {
    const n = Number((await db.query<{ n: string }>("SELECT count(*) n FROM users WHERE role='admin'")).rows[0].n);
    if (n <= 1) throw new AuthError("The last admin cannot be deleted");
  }
  await db.query("UPDATE jobs SET status='removed' WHERE posted_by=$1", [user.id]);
  await db.query("DELETE FROM email_outbox WHERE to_email=(SELECT email FROM users WHERE id=$1)", [user.id]);
  await db.query("DELETE FROM users WHERE id=$1", [user.id]);
}
