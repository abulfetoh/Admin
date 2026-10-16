import type { Db } from "./db";
import type { User } from "./auth";
import { ForbiddenError } from "./employer";

const BOT = /bot|crawl|spider|slurp|headless|preview|monitor/i;

export async function recordPageview(db: Db, v: { path: unknown; locale: unknown; referrer?: unknown; userAgent?: string | null }): Promise<boolean> {
  if (v.userAgent && BOT.test(v.userAgent)) return false;
  if (typeof v.path !== "string" || !v.path.startsWith("/") || v.path.length > 300) return false;
  if (v.locale !== "en" && v.locale !== "ar") return false;
  const path = v.path.split("?")[0].split("#")[0]; // never store query strings (may contain personal data)
  if (/^\/(admin|employer|account|login|register|unsubscribe|ar\/(admin|employer|account|login|register|unsubscribe))/.test(path)) return false;
  let ref: string | null = null;
  if (typeof v.referrer === "string" && v.referrer) {
    try { ref = new URL(v.referrer).hostname.slice(0, 100); } catch { /* ignore */ }
  }
  await db.query("INSERT INTO pageviews(path, locale, ref_host) VALUES ($1,$2,$3)", [path, v.locale, ref]);
  return true;
}

export async function topPages(db: Db, admin: User, days = 7, limit = 20) {
  if (admin.role !== "admin") throw new ForbiddenError("Admins only");
  return (await db.query<{ path: string; views: string }>(
    "SELECT path, count(*) views FROM pageviews WHERE created_at > now() - make_interval(days => $1) GROUP BY path ORDER BY count(*) DESC LIMIT $2",
    [days, limit],
  )).rows.map((r) => ({ path: r.path, views: Number(r.views) }));
}
