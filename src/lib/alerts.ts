import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import type { User } from "./auth";
import { enqueueEmail } from "./email";
import { withUser } from "./rls";
import { jobPath, searchJobs } from "./jobs";
import { SITE_URL } from "./locale-const";

export const MAX_SAVED_SEARCHES = 10;
const Input = z.object({ q: z.string().trim().max(200).default(""), location: z.string().trim().max(100).default(""), remote: z.boolean().default(false) })
  .refine((v) => v.q || v.location || v.remote, "Add at least one search term or filter");

export async function createSavedSearch(db: Db, user: User, input: unknown, now = new Date()): Promise<number> {
  const p = Input.parse(input);
  const n = Number((await db.query<{ n: string }>("SELECT count(*) n FROM saved_searches WHERE user_id=$1", [user.id])).rows[0].n);
  if (n >= MAX_SAVED_SEARCHES) throw new Error(`You can save up to ${MAX_SAVED_SEARCHES} searches`);
  return (await db.query<{ id: number }>(
    "INSERT INTO saved_searches(user_id,q,location,remote,token,last_run_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [user.id, p.q, p.location, p.remote, randomBytes(24).toString("base64url"), now],
  )).rows[0].id;
}

export async function listSavedSearches(db: Db, user: User) {
  return withUser(db, user.id, async (tx) =>
    (await tx.query<{ id: number; q: string; location: string; remote: boolean }>("SELECT id,q,location,remote FROM saved_searches WHERE user_id=$1 ORDER BY id", [user.id])).rows);
}

export async function deleteSavedSearch(db: Db, user: User, id: number) {
  await withUser(db, user.id, (tx) => tx.query("DELETE FROM saved_searches WHERE id=$1 AND user_id=$2", [id, user.id]));
}

export async function unsubscribe(db: Db, token: string): Promise<boolean> {
  const r = await db.query("DELETE FROM saved_searches WHERE token=$1", [token]);
  return (r.affectedRows ?? 0) > 0;
}

/** For each saved search, emails jobs posted since the last run. Fuzzy (typo) matches are excluded to avoid noisy alerts. */
export async function runAlerts(db: Db, now = new Date()): Promise<{ emails: number }> {
  const searches = (await db.query<{ id: number; email: string; q: string; location: string; remote: boolean; token: string; last_run_at: Date }>(
    `SELECT s.id, u.email, s.q, s.location, s.remote, s.token, s.last_run_at FROM saved_searches s JOIN users u ON u.id=s.user_id ORDER BY s.id`,
  )).rows;
  let emails = 0;
  for (const s of searches) {
    const res = await searchJobs(db, { q: s.q, location: s.location, remote: s.remote, pageSize: 50 });
    const fresh = res.fuzzy ? [] : res.jobs.filter((j) => j.posted_at > s.last_run_at && j.posted_at <= now);
    if (fresh.length) {
      const label = [s.q, s.location, s.remote ? "remote" : ""].filter(Boolean).join(" · ");
      const lines = fresh.slice(0, 20).map((j) => `- ${j.title} (${j.company_name}${j.location ? `, ${j.location}` : ""})\n  ${SITE_URL}${jobPath(j)}`);
      await enqueueEmail(db, {
        to: s.email,
        subject: `${fresh.length} new job${fresh.length > 1 ? "s" : ""}: ${label}`,
        body: `${lines.join("\n")}\n\nStop these alerts: ${SITE_URL}/unsubscribe/${s.token}\n`,
      });
      emails++;
    }
    await db.query("UPDATE saved_searches SET last_run_at=$2 WHERE id=$1", [s.id, now]);
  }
  return { emails };
}
