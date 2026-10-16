import { describe, expect, it } from "vitest";
import { localePath, splitLocale } from "@/lib/i18n";
import { alternatesFor } from "@/lib/seo";
import { facetValues, jobsForFacet } from "@/lib/landing";
import { ingestSource } from "@/lib/ingest/run";
import { addSource, feedFetch, memDb } from "./helpers";

describe("locale paths", () => {
  it("prefixes only Arabic and round-trips", () => {
    expect(localePath("en", "/jobs/1/x")).toBe("/jobs/1/x");
    expect(localePath("ar", "/jobs/1/x")).toBe("/ar/jobs/1/x");
    expect(localePath("ar", "/")).toBe("/ar");
    expect(splitLocale("/ar")).toEqual({ locale: "ar", path: "/" });
    expect(splitLocale("/ar/jobs/1")).toEqual({ locale: "ar", path: "/jobs/1" });
    expect(splitLocale("/arabic-things")).toEqual({ locale: "en", path: "/arabic-things" }); // no false positive
  });
  it("emits canonical + hreflang incl. x-default", () => {
    const a = alternatesFor("ar", "/country/egypt");
    expect(a.canonical).toBe("https://today-jobs.com/ar/country/egypt");
    expect(a.languages).toMatchObject({ en: "https://today-jobs.com/country/egypt", ar: "https://today-jobs.com/ar/country/egypt", "x-default": "https://today-jobs.com/country/egypt" });
  });
});

describe("landing facets", () => {
  it("groups case-insensitively, counts only active jobs, 404s unknown slugs", async () => {
    const db = await memDb();
    await addSource(db, "s", "json_feed", { url: "https://s.test/f" });
    const j = (id: string, country: string, company = "Acme") => ({ id, title: `Job ${id}`, company, country, city: "Cairo", apply_url: "https://s.test/" + id, description: "d" });
    await ingestSource(db, "s", { fetchFn: feedFetch({ jobs: [j("1", "Egypt"), j("2", "egypt"), j("3", "UAE", "Beta")] }) });
    expect(await facetValues(db, "country")).toEqual([{ name: "Egypt", slug: "egypt", n: 2 }, { name: "UAE", slug: "uae", n: 1 }]);
    expect((await jobsForFacet(db, "country", "egypt"))?.jobs).toHaveLength(2);
    expect((await jobsForFacet(db, "company", "beta"))?.jobs).toHaveLength(1);
    expect(await jobsForFacet(db, "country", "nowhere")).toBeNull();
    await ingestSource(db, "s", { fetchFn: feedFetch({ jobs: [j("3", "UAE", "Beta")] }) }); // 1,2 expire
    expect(await jobsForFacet(db, "country", "egypt")).toBeNull();
  });

  it("display name and ordering are deterministic regardless of row order/collation", async () => {
    const db = await memDb();
    await addSource(db, "s", "json_feed", { url: "https://s.test/f" });
    const mk = (id: string, country: string) => ({ id, title: `Job ${id}`, company: "Acme", country, city: "X", apply_url: "https://s.test/" + id, description: "d" });
    // egypt/Egypt tie 1-1 (capitalised spelling wins); kenya x2 beats Kenya x1 (majority spelling wins); ghana/egypt tie on total, ordered by slug
    await ingestSource(db, "s", { fetchFn: feedFetch({ jobs: [mk("1", "egypt"), mk("2", "Egypt"), mk("3", "kenya"), mk("4", "kenya"), mk("5", "Kenya"), mk("6", "Ghana"), mk("7", "Ghana")] }) });
    const v = await facetValues(db, "country");
    expect(v.map((x) => [x.slug, x.name, x.n])).toEqual([["kenya", "kenya", 3], ["egypt", "Egypt", 2], ["ghana", "Ghana", 2]]);
  });
});
