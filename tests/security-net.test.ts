import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/ratelimit";
import { enqueueEmail, headerSafe } from "@/lib/email";
import { getJson, MAX_FEED_BYTES } from "@/lib/ingest/util";
import { ingestSource } from "@/lib/ingest/run";
import { registerUser } from "@/lib/auth";
import { createJob, ForbiddenError } from "@/lib/employer";
import { addSource, feedFetch, memDb, verify } from "./helpers";

const H = (o: Record<string, string>) => new Headers(o);
const ctx = (fetchFn: typeof fetch) => ({ fetchFn, userAgent: "t" });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

describe("clientIp (rate-limit key)", () => {
  it("ignores client-supplied leftmost X-Forwarded-For entries; trusts only the entry our proxy added", () => {
    expect(clientIp(H({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), 1)).toBe("203.0.113.9"); // attacker prepended 1.1.1.1
    expect(clientIp(H({ "x-forwarded-for": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIp(H({ "x-forwarded-for": "9.9.9.9, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9"); // CDN + LB
    expect(clientIp(H({ "x-forwarded-for": "2001:db8::1" }), 1)).toBe("2001:db8::1");
  });
  it("does not trust a header that is shorter than the expected proxy chain, and never uses junk as a key", () => {
    expect(clientIp(H({ "x-forwarded-for": "1.1.1.1" }), 2)).toBe("unknown");
    expect(clientIp(H({}), 1)).toBe("unknown");
    expect(clientIp(H({ "x-real-ip": "198.51.100.4" }), 1)).toBe("198.51.100.4");
    expect(clientIp(H({ "x-forwarded-for": "x".repeat(5000) }), 1)).toBe("unknown");
    expect(clientIp(H({ "x-forwarded-for": "1.1.1.1, '; DROP TABLE" }), 1)).toBe("unknown");
  });
});

describe("email header safety", () => {
  it("strips line breaks from subjects and refuses malformed recipients", async () => {
    expect(headerSafe("Hi\r\nBcc: attacker@evil.com")).toBe("Hi Bcc: attacker@evil.com");
    expect(headerSafe("a b\0c")).toBe("a b c");
    const db = await memDb();
    await enqueueEmail(db, { to: "u@x.com", subject: "New jobs: dev\r\nBcc: a@evil.com", body: "b" });
    const row = (await db.query<{ subject: string }>("SELECT subject FROM email_outbox")).rows[0];
    expect(row.subject).not.toMatch(/[\r\n]/);
    for (const bad of ["a@x.com,b@evil.com", "a@x.com\r\nBcc: b@evil.com", "no-at-sign", "a b@x.com", "<a@x.com>"])
      await expect(enqueueEmail(db, { to: bad, subject: "s", body: "b" }), bad).rejects.toThrow(/Invalid recipient/);
  });
});

describe("untrusted feed fetching", () => {
  it("rejects redirects to private / metadata / non-https targets, at any hop", async () => {
    for (const target of ["http://169.254.169.254/latest/meta-data", "https://169.254.169.254/", "https://10.0.0.5/f", "https://localhost/f", "http://example.com/f", "https://[::1]/f"]) {
      let calls = 0;
      const f = (async () => { calls++; return calls === 1 ? redirect(target) : new Response("{}"); }) as unknown as typeof fetch;
      await expect(getJson("https://feeds.example.com/a.json", ctx(f), async () => {}), target).rejects.toThrow();
      expect(calls, `${target}: must not be requested`).toBe(1);
    }
  });
  it("follows a legitimate public https redirect (relative or absolute) but caps the number of hops", async () => {
    const ok = (async (u: string) => u.endsWith("/final.json") ? new Response('{"ok":true}') : redirect("/final.json")) as unknown as typeof fetch;
    expect(await getJson("https://feeds.example.com/a.json", ctx(ok))).toEqual({ ok: true });
    const loop = (async () => redirect("https://feeds.example.com/again")) as unknown as typeof fetch;
    await expect(getJson("https://feeds.example.com/a.json", ctx(loop), async () => {})).rejects.toThrow(/redirects/);
  });
  it("refuses oversized bodies whether or not Content-Length is declared", async () => {
    const declared = (async () => new Response("{}", { headers: { "content-length": String(MAX_FEED_BYTES + 1) } })) as unknown as typeof fetch;
    await expect(getJson("https://feeds.example.com/a.json", ctx(declared), async () => {})).rejects.toThrow(/too large/);
    const chunk = new Uint8Array(1024 * 1024);
    const streamed = (async () => new Response(new ReadableStream({ pull(c) { c.enqueue(chunk); } }))) as unknown as typeof fetch;
    await expect(getJson("https://feeds.example.com/a.json", ctx(streamed), async () => {})).rejects.toThrow(/too large/);
  });
  it("sends requests with manual redirect handling and a timeout signal", async () => {
    let init: RequestInit | undefined;
    const f = (async (_u: string, i: RequestInit) => { init = i; return new Response("{}"); }) as unknown as typeof fetch;
    await getJson("https://feeds.example.com/a.json", ctx(f));
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("drops feed items whose links are not http(s), so javascript:/data: URLs never reach an href", async () => {
    const db = await memDb();
    await addSource(db, "p", "json_feed", { url: "https://p.example.com/f" });
    const job = (id: string, apply_url: string, extra = {}) => ({ id, title: `T${id}`, company: "C", apply_url, ...extra });
    const r = await ingestSource(db, "p", { fetchFn: feedFetch({ jobs: [
      job("1", "https://ok.example.com/1"), job("2", "javascript:alert(document.cookie)"), job("3", "data:text/html,<script>1</script>"),
      job("4", "https://ok.example.com/4", { company_website: "javascript:alert(1)" }), job("5", "HTTP://ok.example.com/5"),
    ] }) });
    expect(r.fetched).toBe(2); // 1 and 5 only
    expect((await db.query<{ apply_url: string }>("SELECT apply_url FROM jobs ORDER BY id")).rows.map((x) => x.apply_url.toLowerCase().slice(0, 4))).toEqual(["http", "http"]);
  });
});

describe("abuse brakes", () => {
  it("limits job posting per employer per day", async () => {
    const db = await memDb();
    const u = await registerUser(db, { email: "e@x.com", password: "long-enough-pass", name: "E", role: "employer" });
    await verify(db, u.id);
    const job = { title: "Some Role", description: "A description that is certainly long enough to pass.", apply_url: "https://a.test/x" };
    for (let i = 0; i < 20; i++) await createJob(db, u, "Co", job);
    await expect(createJob(db, u, "Co", job)).rejects.toThrow(ForbiddenError);
  });
});
