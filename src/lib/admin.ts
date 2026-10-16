import type { Db } from "./db";
import type { Role, User } from "./auth";
import { z } from "zod";
import { ForbiddenError } from "./employer";
import { adapters } from "./ingest/run";
import { assertPublicHttpsUrl } from "./ingest/util";

function assertAdmin(u: User) {
  if (u.role !== "admin") throw new ForbiddenError("Admins only");
}

export async function listUsers(db: Db, admin: User) {
  assertAdmin(admin);
  return (await db.query<{ id: number; email: string; name: string; role: Role; created_at: Date }>(
    "SELECT id, email, name, role, created_at FROM users ORDER BY id DESC LIMIT 200",
  )).rows;
}

export async function setUserRole(db: Db, admin: User, userId: number, role: Role) {
  assertAdmin(admin);
  if (userId === admin.id) throw new ForbiddenError("Cannot change your own role");
  await db.query("UPDATE users SET role=$2 WHERE id=$1", [userId, role]);
  if (role !== "admin") await db.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
}

export async function listRuns(db: Db, admin: User) {
  assertAdmin(admin);
  return (await db.query<{ id: number; source: string; started_at: Date; fetched: number; inserted: number; updated: number; duplicates: number; expired: number; error: string | null; dry_run: boolean }>(
    `SELECT r.id, s.key AS source, r.started_at, r.fetched, r.inserted, r.updated, r.duplicates, r.expired, r.error, r.dry_run
     FROM ingestion_runs r JOIN sources s ON s.id=r.source_id ORDER BY r.id DESC LIMIT 50`,
  )).rows;
}

export async function listSources(db: Db, admin: User) {
  assertAdmin(admin);
  return (await db.query<{ id: number; key: string; adapter: string; enabled: boolean; terms_url: string | null }>(
    "SELECT id, key, adapter, enabled, terms_url FROM sources ORDER BY key",
  )).rows;
}

export async function setSourceEnabled(db: Db, admin: User, id: number, enabled: boolean) {
  assertAdmin(admin);
  await db.query("UPDATE sources SET enabled=$2 WHERE id=$1", [id, enabled]);
}

export async function stats(db: Db, admin: User) {
  assertAdmin(admin);
  const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
  return {
    activeJobs: await n("SELECT count(*) n FROM jobs WHERE status='active'"),
    users: await n("SELECT count(*) n FROM users"),
    companies: await n("SELECT count(*) n FROM companies"),
  };
}

const ConfigByAdapter: Record<string, z.ZodType<Record<string, unknown>>> = {
  json_feed: z.object({ url: z.string().url().refine((u) => { try { assertPublicHttpsUrl(u); return true; } catch { return false; } }, "Feed URL must be a public https URL") }).strict(),
  greenhouse: z.object({ board: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), company: z.string().min(1).max(100).optional() }).strict(),
};

export const SourceInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,49}$/, "Key: lowercase letters, digits, - or _"),
  adapter: z.string().refine((a) => a in adapters, "Unknown adapter"),
  terms_url: z.string().url().refine((u) => u.startsWith("https://"), "Terms/permission URL must be https"),
  config: z.unknown(),
});

/** Terms URL is mandatory: it records where usage rights were confirmed (ingestion refuses sources without one). */
export async function createSource(db: Db, admin: User, input: unknown) {
  assertAdmin(admin);
  const p = SourceInput.parse(input);
  const config = ConfigByAdapter[p.adapter].parse(p.config);
  try {
    await db.query("INSERT INTO sources(key, adapter, config, terms_url, enabled) VALUES ($1,$2,$3,$4,false)", [p.key, p.adapter, JSON.stringify(config), p.terms_url]);
  } catch (e) {
    if (String(e).includes("sources_key_key")) throw new Error("A source with this key already exists");
    throw e;
  }
}

export { assertPublicHttpsUrl };
