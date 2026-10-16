import { describe, expect, it } from "vitest";
import { searchJobs } from "@/lib/jobs";
import { jobPostingJsonLd } from "@/lib/jsonld";
import { ingestSource } from "@/lib/ingest/run";
import { addSource, feedFetch, memDb } from "./helpers";

async function seeded() {
  const db = await memDb();
  await addSource(db, "s", "json_feed", { url: "https://s.test/f" });
  const jobs = [
    { id: "1", title: "Software Engineer", company: "Acme", apply_url: "https://s.test/1", description: "TypeScript backend", location: "Cairo, Egypt" },
    { id: "2", title: "Accountant", company: "Beta", apply_url: "https://s.test/2", description: "Books", location: "Dubai", remote: false },
    { id: "3", title: "محاسب", company: "Gamma", apply_url: "https://s.test/3", description: "وظيفة محاسبة", location: "الرياض", remote: true },
  ];
  await ingestSource(db, "s", { fetchFn: feedFetch({ jobs }) });
  return db;
}

describe("search", () => {
  it("full-text matches", async () => {
    const r = await searchJobs(await seeded(), { q: "engineer" });
    expect(r.jobs.map((j) => j.title)).toEqual(["Software Engineer"]);
    expect(r.fuzzy).toBe(false);
  });
  it("falls back to trigram on typos", async () => {
    const r = await searchJobs(await seeded(), { q: "acountant" });
    expect(r.jobs[0]?.title).toBe("Accountant");
    expect(r.fuzzy).toBe(true);
  });
  it("matches Arabic and applies filters", async () => {
    const db = await seeded();
    expect((await searchJobs(db, { q: "محاسب" })).total).toBe(1);
    expect((await searchJobs(db, { remote: true })).total).toBe(1);
    expect((await searchJobs(db, { location: "dubai" })).jobs[0].title).toBe("Accountant");
  });
  it("is safe against SQL-ish input", async () => {
    expect((await searchJobs(await seeded(), { q: "'; DROP TABLE jobs;--" })).total).toBe(0);
  });
});

describe("JobPosting JSON-LD", () => {
  it("is emitted only for live jobs", async () => {
    const db = await seeded();
    const job = (await searchJobs(db, { q: "engineer" })).jobs[0];
    const ld = jobPostingJsonLd(job, "https://today-jobs.com");
    expect(ld).toMatchObject({ "@type": "JobPosting", title: "Software Engineer", hiringOrganization: { name: "Acme" } });
    expect(jobPostingJsonLd({ ...job, status: "expired" }, "https://x")).toBeNull();
    expect(jobPostingJsonLd({ ...job, valid_through: new Date("2020-01-01") }, "https://x")).toBeNull();
  });
});
