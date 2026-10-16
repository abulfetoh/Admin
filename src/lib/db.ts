import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";

export type Db = PGlite;

export async function createDb(dataDir?: string): Promise<Db> {
  const db = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { pg_trgm } });
  await db.waitReady;
  await migrate(db);
  return db;
}

export async function migrate(db: Db, dir = path.join(process.cwd(), "migrations")): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
    applied.push(f);
  }
  return applied;
}

const g = globalThis as unknown as { __db?: Promise<Db> };
export function getDb(): Promise<Db> {
  g.__db ??= createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
  return g.__db;
}
