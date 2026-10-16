import type { Db } from "./db";
import { slugify } from "./ingest/util";
import type { JobRow } from "./jobs";

export type Facet = "country" | "city" | "company";
export const MIN_INDEXABLE = 3; // pages with fewer jobs are thin: served but noindex and left out of the sitemap

const COL: Record<Facet, string> = { country: "j.country", city: "j.city", company: "c.name" };

export async function facetValues(db: Db, facet: Facet): Promise<{ name: string; slug: string; n: number }[]> {
  const col = COL[facet];
  const rows = (await db.query<{ name: string; n: string }>(
    `SELECT ${col} AS name, count(*) n FROM jobs j JOIN companies c ON c.id=j.company_id
     WHERE j.status='active' AND ${col} IS NOT NULL AND ${col} <> '' GROUP BY ${col} ORDER BY count(*) DESC`,
  )).rows;
  // merge values that differ only by case/spacing (e.g. "Egypt" / "egypt")
  const merged = new Map<string, { name: string; slug: string; n: number }>();
  for (const r of rows) {
    const slug = slugify(r.name);
    const cur = merged.get(slug);
    if (cur) cur.n += Number(r.n); else merged.set(slug, { name: r.name, slug, n: Number(r.n) });
  }
  return [...merged.values()];
}

export async function jobsForFacet(db: Db, facet: Facet, slug: string, limit = 50): Promise<{ name: string; jobs: JobRow[] } | null> {
  const match = (await facetValues(db, facet)).find((v) => v.slug === slug);
  if (!match) return null;
  const col = COL[facet];
  const jobs = (await db.query<JobRow>(
    `SELECT j.id, j.title, j.description, j.location, j.country, j.city, j.remote, j.employment_type, j.salary_min, j.salary_max, j.salary_currency,
       j.apply_url, j.posted_at, j.valid_through, j.status, c.name AS company_name, c.slug AS company_slug, c.website AS company_website
     FROM jobs j JOIN companies c ON c.id=j.company_id
     WHERE j.status='active' AND lower(${col}) = lower($1) ORDER BY j.posted_at DESC LIMIT ${limit}`,
    [match.name],
  )).rows;
  return jobs.length ? { name: match.name, jobs } : null;
}
