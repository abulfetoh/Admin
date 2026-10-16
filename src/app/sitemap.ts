import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { jobPath, listIndexableJobs } from "@/lib/jobs";
import { facetValues, MIN_INDEXABLE, type Facet } from "@/lib/landing";
import { LOCALES, localePath } from "@/lib/i18n";
import { SITE_URL } from "@/lib/locale";

export const dynamic = "force-dynamic";

const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${localePath("en", path)}`,
  lastModified,
  alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localePath(l, path)}`])) },
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const out: MetadataRoute.Sitemap = [entry("/")];
  for (const f of ["country", "city", "company"] as Facet[])
    for (const v of await facetValues(db, f)) if (v.n >= MIN_INDEXABLE) out.push(entry(`/${f}/${v.slug}`));
  for (const j of await listIndexableJobs(db)) out.push(entry(jobPath(j), j.posted_at));
  return out;
}
