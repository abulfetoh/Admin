import { isIP } from "node:net";
import type { Db } from "./db";

/** Fixed-window counter in the DB. Returns false when the limit for this window is exceeded. */
export async function allow(db: Db, key: string, limit: number, windowSec: number, now = new Date()): Promise<boolean> {
  const bucket = Math.floor(now.getTime() / 1000 / windowSec);
  const expires = new Date((bucket + 2) * windowSec * 1000); // window end + one spare window
  const r = await db.query<{ count: number }>(
    `INSERT INTO rate_limits(key, bucket, count, expires_at) VALUES ($1,$2,1,$3)
     ON CONFLICT (key, bucket) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [key, bucket, expires],
  );
  if (Math.random() < 0.01) await db.query("DELETE FROM rate_limits WHERE expires_at < $1", [now]);
  return r.rows[0].count <= limit;
}

/**
 * Client IP for rate limiting. Anything left of the entries appended by our own proxies is client-controlled, so we
 * take the entry `hops` places from the RIGHT (TRUSTED_PROXY_HOPS, default 1 = one proxy/platform in front, which
 * either appends or overwrites X-Forwarded-For — the rightmost value is the peer it saw). If the header is missing or
 * shorter than `hops` the request did not come through the expected proxies, so we do not trust it.
 */
export function clientIp(h: { get(n: string): string | null }, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string {
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const candidate = hops >= 1 && parts.length >= hops ? parts[parts.length - hops] : (h.get("x-real-ip") ?? "").trim();
  return isIP(candidate) ? candidate : "unknown"; // validated: bounded length, no attacker-chosen rate-limit keys
}
