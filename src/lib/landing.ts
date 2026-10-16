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
  // Merge values that differ only by case/spacing (e.g. "Egypt" / "egypt").
  // Display name must not depend on row order or DB collation: most frequent spelling wins; ties prefer a
  // spelling that has capitals, then plain code-unit order.
  const bySlug = new Map<string, { name: string; n: number }[]>();
  for (const r of rows) {
    const slug = slugify(r.name);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), { name: r.name, n: Number(r.n) }]);
  }
  const hasCaps = (s: string) => s !== s.toLowerCase();
  const out = [...bySlug.entries()].map(([slug, variants]) => {
    const best = [...variants].sort((a, b) => b.n - a.n || Number(hasCaps(b.name)) - Number(hasCaps(a.name)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
    return { name: best.name, slug, n: variants.reduce((t, v) => t + v.n, 0) };
  });
  return out.sort((a, b) => b.n - a.n || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
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
