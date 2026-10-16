import { z } from "zod";
import type { RawJob, SourceAdapter } from "../types";
import { assertPublicHttpsUrl, getJson } from "../util";

/**
 * Generic adapter for an employer/partner-provided JSON feed that they have
 * authorised us to use. config: { url: string }
 * Feed shape: { jobs: [{ id, title, company, description?, location?, ... }] }
 */
const Item = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().min(1),
  company: z.string().min(1),
  company_website: z.string().url().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  remote: z.boolean().optional(),
  employment_type: z.string().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  salary_currency: z.string().optional(),
  apply_url: z.string().url(),
  posted_at: z.string().optional(),
  valid_through: z.string().optional(),
});
const Feed = z.object({ jobs: z.array(z.unknown()) });

const date = (s?: string) => {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export const jsonFeedAdapter: SourceAdapter = {
  name: "json_feed",
  async fetch(config, ctx) {
    const url = assertPublicHttpsUrl(z.string().url().parse(config.url)).toString(); // re-checked at fetch time, not only at creation
    const feed = Feed.parse(await getJson(url, ctx));
    const out: RawJob[] = [];
    for (const raw of feed.jobs) {
      const p = Item.safeParse(raw); // skip malformed items rather than failing the whole run
      if (!p.success) continue;
      const i = p.data;
      out.push({
        externalId: i.id,
        title: i.title,
        company: i.company,
        companyWebsite: i.company_website,
        description: i.description,
        location: i.location,
        country: i.country,
        city: i.city,
        remote: i.remote,
        employmentType: i.employment_type,
        salaryMin: i.salary_min,
        salaryMax: i.salary_max,
        salaryCurrency: i.salary_currency,
        applyUrl: i.apply_url,
        postedAt: date(i.posted_at),
        validThrough: date(i.valid_through),
      });
    }
    return out;
  },
};
