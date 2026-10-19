import { describe, expect, it } from "vitest";
import { searchJobs } from "@/lib/jobs";
import { memDb } from "./helpers";

describe("search pagination input is clamped (it is interpolated into SQL as a number)", () => {
  it.each([Infinity, -Infinity, NaN, 1e300, 1e21, -5, 0, 1.5, 2 ** 53, Number.MAX_VALUE])("page=%s does not throw and returns a normal result", async (page) => {
    const db = await memDb();
    const r = await searchJobs(db, { q: "", page });
    expect(r.total).toBe(0);
    expect(r.jobs).toEqual([]);
  });
  it.each([Infinity, NaN, 1e300, -1, 0, 3.7])("pageSize=%s is clamped", async (pageSize) => {
    const db = await memDb();
    await expect(searchJobs(db, { q: "x", pageSize })).resolves.toMatchObject({ jobs: [] });
  });
});
