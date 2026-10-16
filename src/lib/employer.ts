import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import type { User } from "./auth";
import { isVerified } from "./account";
import { contentHash, dedupeKey, slugify } from "./ingest/util";

export class ForbiddenError extends Error {}

export const JobInput = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().min(30, "Description must be at least 30 characters").max(20000),
  location: z.string().trim().max(150).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  remote: z.coerce.boolean().optional(),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "temporary"]).optional(),
  apply_url: z.string().url().refine((u) => /^https?:\/\//.test(u), "Must be http(s)"),
  valid_through: z.string().optional(),
});

export async function ensureCompany(db: Db, user: User, name: string): Promise<number> {
  const existing = (await db.query<{ id: number }>("SELECT id FROM companies WHERE owner_id=$1 LIMIT 1", [user.id])).rows[0];
  if (existing) return existing.id;
  let slug = slugify(name);
  const taken = (await db.query("SELECT 1 FROM companies WHERE slug=$1", [slug])).rows.length;
  if (taken) slug += `-${user.id}`;
  return (await db.query<{ id: number }>("INSERT INTO companies(slug, name, owner_id) VALUES ($1,$2,$3) RETURNING id", [slug, name, user.id])).rows[0].id;
}

export async function createJob(db: Db, user: User, companyName: string, input: unknown): Promise<number> {
  if (user.role !== "employer" && user.role !== "admin") throw new ForbiddenError("Employers only");
  if (!(await isVerified(db, user.id))) throw new ForbiddenError("Verify your email before posting jobs");
  const p = JobInput.parse(input);
  const vt = p.valid_through ? new Date(p.valid_through) : null;
  if (vt && Number.isNaN(vt.getTime())) throw new Error("Invalid valid_through");
  const companyId = await ensureCompany(db, user, companyName);
  const company = (await db.query<{ name: string }>("SELECT name FROM companies WHERE id=$1", [companyId])).rows[0].name;
  const raw = { externalId: "", title: p.title, company, description: p.description, location: p.location, applyUrl: p.apply_url, employmentType: p.employment_type, validThrough: vt ?? undefined };
  const r = await db.query<{ id: number }>(
    `INSERT INTO jobs(external_id, company_id, title, description, location, city, country, remote, employment_type, apply_url, valid_through, content_hash, dedupe_key, posted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [randomUUID(), companyId, p.title, p.description, p.location ?? null, p.city ?? null, p.country ?? null, p.remote ?? false, p.employment_type ?? null, p.apply_url, vt, contentHash(raw), dedupeKey({ company, title: p.title, city: p.city, location: p.location }), user.id],
  );
  return r.rows[0].id;
}

export async function listOwnJobs(db: Db, user: User) {
  return (await db.query<{ id: number; title: string; status: string; posted_at: Date }>(
    "SELECT id, title, status, posted_at FROM jobs WHERE posted_by=$1 ORDER BY posted_at DESC",
    [user.id],
  )).rows;
}

/** Only the owner (or an admin) may change a job's status. */
export async function setJobStatus(db: Db, user: User, jobId: number, status: "active" | "expired" | "removed"): Promise<void> {
  const j = (await db.query<{ posted_by: number | null }>("SELECT posted_by FROM jobs WHERE id=$1", [jobId])).rows[0];
  if (!j) throw new ForbiddenError("Not found");
  const isOwner = j.posted_by === user.id && user.role === "employer";
  if (!isOwner && user.role !== "admin") throw new ForbiddenError("Not allowed");
  if (status === "removed" && user.role !== "admin") throw new ForbiddenError("Only admins can remove");
  await db.query("UPDATE jobs SET status=$2 WHERE id=$1", [jobId, status]);
}

export async function getOwnJob(db: Db, user: User, jobId: number) {
  const r = (await db.query<Record<string, unknown> & { posted_by: number | null }>(
    "SELECT id, title, description, location, city, country, remote, employment_type, apply_url, valid_through, posted_by FROM jobs WHERE id=$1", [jobId])).rows[0];
  if (!r || (r.posted_by !== user.id && user.role !== "admin")) throw new ForbiddenError("Not found");
  return r;
}

/** Owner (or admin) edits; re-validates everything and refreshes the hashes used for change detection / dedupe. */
export async function updateJob(db: Db, user: User, jobId: number, input: unknown): Promise<void> {
  await getOwnJob(db, user, jobId);
  const p = JobInput.parse(input);
  const vt = p.valid_through ? new Date(p.valid_through) : null;
  if (vt && Number.isNaN(vt.getTime())) throw new Error("Invalid valid_through");
  const company = (await db.query<{ name: string }>("SELECT c.name FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=$1", [jobId])).rows[0].name;
  const raw = { externalId: "", title: p.title, company, description: p.description, location: p.location, applyUrl: p.apply_url, employmentType: p.employment_type, validThrough: vt ?? undefined };
  await db.query(
    `UPDATE jobs SET title=$2, description=$3, location=$4, city=$5, country=$6, remote=$7, employment_type=$8, apply_url=$9, valid_through=$10, content_hash=$11, dedupe_key=$12 WHERE id=$1`,
    [jobId, p.title, p.description, p.location ?? null, p.city ?? null, p.country ?? null, p.remote ?? false, p.employment_type ?? null, p.apply_url, vt, contentHash(raw), dedupeKey({ company, title: p.title, city: p.city, location: p.location })],
  );
}
