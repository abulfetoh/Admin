import { z } from "zod";
import type { RawJob, SourceAdapter } from "../types";
import { getJson, stripHtml } from "../util";

/**
 * Greenhouse public Job Board API (https://developers.greenhouse.io/job-board.html).
 * Intended for public consumption by job aggregators. config: { board: string, company?: string }
 */
const Resp = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string().url(),
      updated_at: z.string().optional(),
      first_published: z.string().optional(),
      content: z.string().optional(),
      location: z.object({ name: z.string() }).optional(),
    }),
  ),
});

export const greenhouseAdapter: SourceAdapter = {
  name: "greenhouse",
  async fetch(config, ctx) {
    const board = z.string().regex(/^[a-zA-Z0-9_-]+$/).parse(config.board);
    const company = typeof config.company === "string" ? config.company : board;
    const data = Resp.parse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, ctx));
    return data.jobs.map<RawJob>((j) => {
      const loc = j.location?.name;
      const when = j.first_published ?? j.updated_at;
      return {
        externalId: String(j.id),
        title: j.title,
        company,
        // Greenhouse returns HTML-entity-escaped HTML in `content`
        description: j.content ? stripHtml(stripHtml(j.content)) : undefined,
        location: loc,
        remote: loc ? /remote/i.test(loc) : undefined,
        applyUrl: j.absolute_url,
        postedAt: when ? new Date(when) : undefined,
      };
    });
  },
};
