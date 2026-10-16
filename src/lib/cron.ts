import { timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { runAlerts } from "./alerts";
import { flushOutbox, getTransport } from "./email";
import { ingestSource } from "./ingest/run";

export const TASKS = ["ingest", "alerts", "outbox", "cleanup"] as const;
export type Task = (typeof TASKS)[number];
export const isTask = (s: string): s is Task => (TASKS as readonly string[]).includes(s);

/** Constant-time bearer check. An unset/short secret disables the endpoint entirely (fail closed). */
export function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7)), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Deletes expired/used credentials and stale counters so those tables don't grow forever. */
export async function cleanup(db: Db, now = new Date()) {
  const n = async (sql: string, p: unknown[]) => (await db.query(sql, p)).affectedRows ?? 0;
  return {
    sessions: await n("DELETE FROM sessions WHERE expires_at < $1", [now]),
    tokens: await n("DELETE FROM auth_tokens WHERE expires_at < $1 OR used_at < $2", [new Date(now.getTime() - 7 * 86400_000), new Date(now.getTime() - 7 * 86400_000)]),
    rate_limits: await n("DELETE FROM rate_limits WHERE expires_at < $1", [now]),
    old_mail: await n("DELETE FROM email_outbox WHERE status <> 'pending' AND created_at < $1", [new Date(now.getTime() - 30 * 86400_000)]),
    old_pageviews: await n("DELETE FROM pageviews WHERE created_at < $1", [new Date(now.getTime() - 400 * 86400_000)]),
  };
}

export async function runTask(db: Db, task: Task, opts: { fetchFn?: typeof fetch; now?: Date } = {}): Promise<unknown> {
  switch (task) {
    case "ingest": {
      const keys = (await db.query<{ key: string }>("SELECT key FROM sources WHERE enabled ORDER BY key")).rows.map((r) => r.key);
      const out: Record<string, unknown> = {};
      for (const k of keys) { // one failing source must not stop the others
        try { out[k] = await ingestSource(db, k, { fetchFn: opts.fetchFn, now: opts.now }); } catch (e) { out[k] = { error: String(e) }; }
      }
      return out;
    }
    case "alerts": return runAlerts(db, opts.now);
    case "outbox": return flushOutbox(db, getTransport());
    case "cleanup": return cleanup(db, opts.now);
  }
}
