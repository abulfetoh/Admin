import { describe, expect, it } from "vitest";
import { ingestSource } from "@/lib/ingest/run";
import { dedupeKey, withRetry, HttpError, stripHtml } from "@/lib/ingest/util";
import { addSource, feedFetch, memDb } from "./helpers";

const job = (id: string, extra = {}) => ({ id, title: `Engineer ${id}`, company: "Acme", apply_url: `https://acme.test/j/${id}`, description: "Build things", location: "Cairo", ...extra });

describe("ingestion", () => {
  it("inserts, is idempotent, updates changes and expires missing jobs", async () => {
    const db = await memDb();
    await addSource(db, "acme", "json_feed", { url: "https://acme.test/feed.json" });
    expect(await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1"), job("2")] }) })).toMatchObject({ fetched: 2, inserted: 2 });
    expect(await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1"), job("2")] }) })).toMatchObject({ inserted: 0, updated: 0, expired: 0 });
    const r = await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1", { title: "Senior Engineer 1" })] }) });
    expect(r).toMatchObject({ updated: 1, expired: 1 });
    const rows = (await db.query<{ external_id: string; status: string }>("SELECT external_id, status FROM jobs ORDER BY external_id")).rows;
    expect(rows).toEqual([{ external_id: "1", status: "active" }, { external_id: "2", status: "expired" }]);
  });

  it("dry run writes nothing but reports stats", async () => {
    const db = await memDb();
    await addSource(db, "acme", "json_feed", { url: "https://acme.test/feed.json" });
    expect(await ingestSource(db, "acme", { dryRun: true, fetchFn: feedFetch({ jobs: [job("1")] }) })).toMatchObject({ inserted: 1 });
    expect((await db.query("SELECT 1 FROM jobs")).rows).toHaveLength(0);
  });

  it("does not expire everything when the feed comes back empty", async () => {
    const db = await memDb();
    await addSource(db, "acme", "json_feed", { url: "https://acme.test/feed.json" });
    await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1")] }) });
    await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [] }) });
    expect((await db.query("SELECT 1 FROM jobs WHERE status='active'")).rows).toHaveLength(1);
  });

  it("dedupes the same job across sources", async () => {
    const db = await memDb();
    await addSource(db, "a", "json_feed", { url: "https://a.test/f" });
    await addSource(db, "b", "json_feed", { url: "https://b.test/f" });
    await ingestSource(db, "a", { fetchFn: feedFetch({ jobs: [job("1")] }) });
    const r = await ingestSource(db, "b", { fetchFn: feedFetch({ jobs: [job("99", { title: "Engineer 1", company: "ACME " })] }) });
    expect(r).toMatchObject({ inserted: 0, duplicates: 1 });
  });

  it("expires jobs past valid_through and records failures", async () => {
    const db = await memDb();
    await addSource(db, "acme", "json_feed", { url: "https://acme.test/feed.json" });
    await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1", { valid_through: "2020-01-01T00:00:00Z" }), job("2")] }) });
    expect((await db.query("SELECT external_id FROM jobs WHERE status='active'")).rows).toEqual([{ external_id: "2" }]);
    await expect(ingestSource(db, "acme", { fetchFn: feedFetch({}, 404) })).rejects.toThrow(/404/);
    expect((await db.query<{ error: string }>("SELECT error FROM ingestion_runs ORDER BY id DESC LIMIT 1")).rows[0].error).toMatch(/404/);
  });

  it("skips malformed feed items and refuses sources without recorded terms", async () => {
    const db = await memDb();
    await addSource(db, "acme", "json_feed", { url: "https://acme.test/feed.json" });
    await addSource(db, "noterms", "json_feed", { url: "https://x.test/f" }, null);
    expect(await ingestSource(db, "acme", { fetchFn: feedFetch({ jobs: [job("1"), { id: 2 }] }) })).toMatchObject({ fetched: 1 });
    await expect(ingestSource(db, "noterms", { fetchFn: feedFetch({ jobs: [] }) })).rejects.toThrow(/terms_url/);
  });

  it("parses the greenhouse board API", async () => {
    const db = await memDb();
    await addSource(db, "gh", "greenhouse", { board: "acme", company: "Acme" });
    const body = { jobs: [{ id: 7, title: "SRE", absolute_url: "https://boards.greenhouse.io/acme/jobs/7", content: "&lt;p&gt;Run &amp;amp; scale&lt;/p&gt;", location: { name: "Remote - EMEA" } }] };
    await ingestSource(db, "gh", { fetchFn: feedFetch(body) });
    const r = (await db.query<{ description: string; remote: boolean }>("SELECT description, remote FROM jobs")).rows[0];
    expect(r.remote).toBe(true);
    expect(r.description).toBe("Run & scale");
  });
});

describe("util", () => {
  it("dedupeKey ignores case/whitespace", () => {
    expect(dedupeKey({ company: "Acme", title: "Dev  Ops", city: "Cairo", location: undefined })).toBe(dedupeKey({ company: "ACME ", title: "dev ops", city: "cairo", location: undefined }));
  });
  it("withRetry retries 5xx/network but not 4xx", async () => {
    let n = 0;
    const sleep = async () => {};
    expect(await withRetry(async () => { if (++n < 3) throw new HttpError(503, "u"); return "ok"; }, { sleep })).toBe("ok");
    n = 0;
    await expect(withRetry(async () => { n++; throw new HttpError(404, "u"); }, { sleep })).rejects.toThrow();
    expect(n).toBe(1);
  });
  it("stripHtml", () => expect(stripHtml("<p>a<br>b</p><script>x</script>")).toBe("a\nb"));
});
