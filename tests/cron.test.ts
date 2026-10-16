import { describe, expect, it } from "vitest";
import { authorised, cleanup, isTask, runTask } from "@/lib/cron";
import { registerUser, createSession } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { issueToken } from "@/lib/account";
import { addSource, memDb } from "./helpers";

describe("cron auth", () => {
  const secret = "a-long-enough-secret-value";
  it("fails closed and compares exactly", () => {
    expect(authorised(`Bearer ${secret}`, secret)).toBe(true);
    expect(authorised(`Bearer ${secret}x`, secret)).toBe(false);
    expect(authorised(`Bearer ${secret.slice(1)}`, secret)).toBe(false);
    expect(authorised(secret, secret)).toBe(false); // missing scheme
    expect(authorised(null, secret)).toBe(false);
    expect(authorised("Bearer short", "short")).toBe(false); // weak secrets disable the endpoint
    expect(authorised(`Bearer ${secret}`, undefined)).toBe(false);
  });
  it("only known tasks", () => {
    expect(isTask("ingest")).toBe(true);
    expect(isTask("../etc")).toBe(false);
  });
});

describe("cron tasks", () => {
  it("ingest runs every enabled source and isolates failures", async () => {
    const db = await memDb();
    await addSource(db, "good", "json_feed", { url: "https://g.test/f" });
    await addSource(db, "bad", "json_feed", { url: "https://b.test/f" });
    const f = (async (url: string) => url.includes("b.test") ? new Response("no", { status: 404 }) : new Response(JSON.stringify({ jobs: [{ id: 1, title: "T", company: "C", apply_url: "https://x.test/1" }] }))) as unknown as typeof fetch;
    const out = (await runTask(db, "ingest", { fetchFn: f })) as Record<string, { inserted?: number; error?: string }>;
    expect(out.good.inserted).toBe(1);
    expect(out.bad.error).toMatch(/404/);
  });
  it("cleanup removes only expired/stale rows", async () => {
    const db = await memDb();
    const u = await registerUser(db, { email: "u@x.com", password: "long-enough-pass", name: "U", role: "candidate" });
    const now = new Date("2026-06-01T00:00:00Z");
    await createSession(db, u.id, new Date("2026-01-01")); // expired by `now`
    const live = await createSession(db, u.id, now);
    await issueToken(db, u.id, "reset", new Date("2026-01-01"));
    await allow(db, "k", 5, 60, new Date("2026-01-01"));
    await allow(db, "k2", 5, 60, now);
    await allow(db, "hourly", 5, 3600, now);      // different window sizes must coexist...
    await allow(db, "quarter", 5, 900, now);
    const r = await cleanup(db, now);
    expect(r).toMatchObject({ sessions: 1, tokens: 1, rate_limits: 1 });
    expect((await db.query("SELECT 1 FROM sessions")).rows).toHaveLength(1);
    // ...and cleanup must not wipe still-active counters of ANY window size (regression: bucket-number-based cleanup did)
    expect((await db.query<{ key: string }>("SELECT key FROM rate_limits ORDER BY key")).rows.map((x) => x.key)).toEqual(["hourly", "k2", "quarter"]);
    expect(await allow(db, "hourly", 1, 3600, now)).toBe(false); // counter survived: 2nd hit in same window exceeds limit 1
    expect(live.token).toBeTruthy();
  });
});
