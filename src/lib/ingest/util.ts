import { createHash } from "node:crypto";
import type { RawJob } from "./types";

export const USER_AGENT = "TodayJobsBot/0.1 (+https://today-jobs.com/bot; contact via site)";

export function slugify(s: string): string {
  const out = s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return out || "x";
}

export function norm(s: string | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function dedupeKey(j: Pick<RawJob, "company" | "title" | "city" | "location">): string {
  const place = norm(j.city ?? j.location);
  return createHash("sha1").update([norm(j.company), norm(j.title), place].join("|")).digest("hex");
}

export function contentHash(j: RawJob): string {
  return createHash("sha1")
    .update(JSON.stringify([j.title, j.description, j.location, j.applyUrl, j.employmentType, j.validThrough?.toISOString()]))
    .digest("hex");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const { retries = 3, baseMs = 500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      if (attempt < retries) await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export async function getJson(url: string, ctx: { fetchFn: typeof fetch; userAgent: string }, sleep?: (ms: number) => Promise<void>): Promise<unknown> {
  return withRetry(
    async () => {
      const res = await ctx.fetchFn(url, { headers: { "User-Agent": ctx.userAgent, Accept: "application/json" } });
      if (!res.ok) throw new HttpError(res.status, url);
      return res.json();
    },
    { sleep },
  );
}
