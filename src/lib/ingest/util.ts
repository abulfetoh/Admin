import { createHash } from "node:crypto";
import { z } from "zod";
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
      if (e instanceof NonRetryableError || (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429)) throw e;
      if (attempt < retries) await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Policy/size violations are deterministic: retrying them is pointless (and for security refusals, wrong). */
export class NonRetryableError extends Error {}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

/** Reads at most `max` bytes; aborts instead of buffering an unbounded body from an untrusted host. */
async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new NonRetryableError("Feed too large");
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel(); throw new NonRetryableError("Feed too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * GET JSON from an untrusted public host. Redirects are followed manually and EVERY hop is re-validated
 * (a permitted host must not be able to bounce us to http://169.254.169.254/ or localhost), with a timeout and size cap.
 * Note: hostnames that merely RESOLVE to private IPs are not detected here — keep egress rules in production.
 */
export async function getJson(url: string, ctx: { fetchFn: typeof fetch; userAgent: string }, sleep?: (ms: number) => Promise<void>): Promise<unknown> {
  return withRetry(
    async () => {
      let current = assertPublicHttpsUrl(url);
      for (let hop = 0; ; hop++) {
        const res = await ctx.fetchFn(current.toString(), {
          headers: { "User-Agent": ctx.userAgent, Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          if (hop >= MAX_REDIRECTS) throw new NonRetryableError("Too many redirects");
          current = assertPublicHttpsUrl(new URL(res.headers.get("location")!, current).toString()); // throws on private/non-https targets
          continue;
        }
        if (!res.ok) throw new HttpError(res.status, current.toString());
        return JSON.parse(await readCapped(res, MAX_FEED_BYTES));
      }
    },
    { sleep },
  );
}

/** Only web links may reach an href: feeds are untrusted, and z.string().url() also accepts javascript:/data:. */
export const httpUrl = z.string().url().max(2048).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");

/** https only; refuses localhost / private / link-local / metadata IP literals. (Hostnames resolving to private IPs are NOT checked — admin-only input, but add DNS-level egress rules in production.) */
export function assertPublicHttpsUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new NonRetryableError("URL must use https");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const privateV4 = v4 && (() => { const [a, b] = [Number(v4[1]), Number(v4[2])]; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224; })();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || privateV4 || h.includes(":")) throw new NonRetryableError("URL host is not allowed");
  return u;
}

