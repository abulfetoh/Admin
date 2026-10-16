import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { jobPath, listIndexableJobs } from "@/lib/jobs";
import { SITE_URL } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const jobs = await listIndexableJobs(await getDb());
  return [
    { url: SITE_URL, changeFrequency: "hourly" },
    ...jobs.map((j) => ({ url: `${SITE_URL}${jobPath(j)}`, lastModified: j.posted_at })),
  ];
}
