import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

export interface QueryResult<T> { rows: T[]; affectedRows?: number }
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
/** The only database surface the app uses; implemented by PGlite (dev/tests) and by pg.Pool (production, DATABASE_URL). */
export interface Tx extends Queryable { exec(sql: string): Promise<unknown> }
export interface Db extends Queryable {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function pgliteDb(p: PGlite): Db {
  return {
    query: (sql, params) => p.query(sql, params as unknown[]) as never,
    exec: (sql) => p.exec(sql),
    transaction: (fn) => p.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params as unknown[]) as never, exec: (sql) => tx.exec(sql) })),
    close: () => p.close(),
  };
}

export function pgDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) });
  // Idle clients can error (server restart, network blip); without a listener Node would crash the process.
  pool.on("error", (e) => console.error("pg pool error:", e.message));
  const wrap = (q: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Queryable["query"] =>
    (async (sql: string, params?: unknown[]) => {
      const r = await q.query(sql, params);
      return { rows: r.rows, affectedRows: r.rowCount ?? undefined };
    }) as Queryable["query"];
  return {
    query: wrap(pool),
    exec: (sql) => pool.query(sql), // simple protocol: multi-statement scripts are fine without params
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn({ query: wrap(c), exec: (sql) => c.query(sql) });
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createDb(dataDir?: string, url: string | undefined = undefined): Promise<Db> {
  let db: Db;
  if (url) {
    db = pgDb(url);
  } else {
    const p = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { pg_trgm } });
    await p.waitReady;
    db = pgliteDb(p);
  }
  await migrate(db);
  return db;
}

export async function migrate(db: Db, dir = path.join(process.cwd(), "migrations")): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied: string[] = [];
  for (const f of fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.endsWith(".sql")).sort()) {
    // One transaction per migration (no half-applied schema). The advisory lock serialises concurrent app instances;
    // the applied-check happens INSIDE the lock so the loser of the race skips instead of re-running.
    const ran = await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(727274)");
      if ((await tx.query("SELECT 1 FROM schema_migrations WHERE name=$1", [f])).rows.length) return false;
      await tx.exec(fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, f), "utf8"));
      await tx.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
      return true;
    });
    if (ran) applied.push(f);
  }
  return applied;
}

/** DATABASE_URL => managed Postgres; otherwise embedded PGlite in DB_DIR (default data/pg). Used by the app and the CLI scripts. */
export function openDb(): Promise<Db> {
  return createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"), process.env.DATABASE_URL);
}

const g = globalThis as unknown as { __db?: Promise<Db> };
export function getDb(): Promise<Db> {
  g.__db ??= openDb();
  return g.__db;
}
