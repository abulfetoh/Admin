import { Pool } from "pg";
import { afterAll } from "vitest";
import { createDb, type Db } from "@/lib/db";

const created: { db: Db; name: string }[] = [];
let admin: Pool | undefined;

/**
 * Fresh isolated database per call. PGlite in-memory by default; set TEST_DATABASE_URL
 * (e.g. postgres://postgres@localhost:5433/postgres) to run the whole suite against real Postgres.
 * TEST_DB_OPTIONS adds CREATE DATABASE options, e.g. "TEMPLATE template0 ENCODING UTF8 LOCALE_PROVIDER icu ICU_LOCALE 'en-US'"
 * to emulate the en_US collation of the official postgres Docker image (CI) — results must not depend on collation.
 */
export async function memDb(): Promise<Db> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) return createDb();
  admin ??= new Pool({ connectionString: base, max: 2 });
  const name = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.query(`CREATE DATABASE ${name} ${process.env.TEST_DB_OPTIONS ?? ""}`);
  const u = new URL(base);
  u.pathname = `/${name}`;
  const db = await createDb(undefined, u.toString());
  created.push({ db, name });
  return db;
}

afterAll(async () => {
  // Only drop databases created by THIS worker (test files run in parallel).
  const mine = created.splice(0);
  for (const { db } of mine) await db.close().catch(() => {});
  for (const { name } of mine) await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
  await admin?.end();
  admin = undefined;
});

export async function addSource(db: Db, key: string, adapter: string, config: object = {}, terms: string | null = "https://example.com/terms") {
  await db.query("INSERT INTO sources(key, adapter, config, terms_url) VALUES ($1,$2,$3,$4)", [key, adapter, JSON.stringify(config), terms]);
}

export function feedFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

export async function verify(db: Db, userId: number) {
  await db.query("UPDATE users SET email_verified_at = now() WHERE id=$1", [userId]);
}
