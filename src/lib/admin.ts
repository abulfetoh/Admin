import type { Db } from "./db";
import type { Role, User } from "./auth";
import { ForbiddenError } from "./employer";

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
