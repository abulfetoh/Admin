import type { Db } from "./db";

/** Fixed-window counter in the DB. Returns false when the limit for this window is exceeded. */
export async function allow(db: Db, key: string, limit: number, windowSec: number, now = new Date()): Promise<boolean> {
  const bucket = Math.floor(now.getTime() / 1000 / windowSec);
  const r = await db.query<{ count: number }>(
    `INSERT INTO rate_limits(key, bucket, count) VALUES ($1,$2,1)
     ON CONFLICT (key, bucket) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [key, bucket],
  );
  if (Math.random() < 0.01) await db.query("DELETE FROM rate_limits WHERE bucket < $1", [bucket - 2 * Math.ceil(86400 / windowSec)]);
  return r.rows[0].count <= limit;
}

/**
 * Client IP. x-forwarded-for is only trustworthy behind a proxy that overwrites it; deploy behind one
 * (or the limit is trivially bypassed by spoofing the header).
 */
export function clientIp(h: { get(n: string): string | null }): string {
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}
