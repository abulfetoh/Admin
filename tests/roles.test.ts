import { describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth";
import { createJob, ForbiddenError, listOwnJobs, setJobStatus } from "@/lib/employer";
import { listUsers, setUserRole } from "@/lib/admin";
import { searchJobs } from "@/lib/jobs";
import { memDb, verify } from "./helpers";

const job = { title: "Backend Developer", description: "Build and run our APIs in a small friendly team.", apply_url: "https://acme.test/apply", city: "Cairo" };

async function world() {
  const db = await memDb();
  const mk = async (email: string, role: "candidate" | "employer") => { const u = await registerUser(db, { email, password: "long-enough-pass", name: email.split("@")[0], role }); await verify(db, u.id); return u; };
  const emp1 = await mk("e1@x.com", "employer");
  const emp2 = await mk("e2@x.com", "employer");
  const cand = await mk("c@x.com", "candidate");
  const admin = { ...(await mk("a@x.com", "candidate")), role: "admin" as const };
  await db.query("UPDATE users SET role='admin' WHERE id=$1", [admin.id]);
  return { db, emp1, emp2, cand, admin };
}

describe("employer + admin permissions", () => {
  it("employer posts a job that becomes searchable; candidates cannot post", async () => {
    const { db, emp1, cand } = await world();
    const id = await createJob(db, emp1, "Acme", job);
    expect((await searchJobs(db, { q: "backend" })).jobs.map((j) => j.id)).toEqual([id]);
    expect(await listOwnJobs(db, emp1)).toHaveLength(1);
    await expect(createJob(db, cand, "Evil", job)).rejects.toThrow(ForbiddenError);
  });

  it("validates input", async () => {
    const { db, emp1 } = await world();
    await expect(createJob(db, emp1, "Acme", { ...job, apply_url: "javascript:alert(1)" })).rejects.toThrow();
    await expect(createJob(db, emp1, "Acme", { ...job, description: "short" })).rejects.toThrow();
  });

  it("only the owner can close a job; only admin can remove", async () => {
    const { db, emp1, emp2, admin } = await world();
    const id = await createJob(db, emp1, "Acme", job);
    await expect(setJobStatus(db, emp2, id, "expired")).rejects.toThrow(ForbiddenError);
    await expect(setJobStatus(db, emp1, id, "removed")).rejects.toThrow(ForbiddenError);
    await setJobStatus(db, emp1, id, "expired");
    await setJobStatus(db, admin, id, "removed");
    expect((await db.query<{ status: string }>("SELECT status FROM jobs WHERE id=$1", [id])).rows[0].status).toBe("removed");
  });

  it("admin-only functions reject non-admins; role change revokes sessions", async () => {
    const { db, emp1, cand, admin } = await world();
    await expect(listUsers(db, emp1)).rejects.toThrow(ForbiddenError);
    await expect(setUserRole(db, cand, emp1.id, "admin")).rejects.toThrow(ForbiddenError);
    await expect(setUserRole(db, admin, admin.id, "candidate")).rejects.toThrow(ForbiddenError);
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('h',$1,now()+interval '1 day')", [emp1.id]);
    await setUserRole(db, admin, emp1.id, "candidate");
    expect((await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [emp1.id])).rows).toHaveLength(0);
  });
});

import { createSource } from "@/lib/admin";
import { assertPublicHttpsUrl } from "@/lib/admin";
import { getOwnJob, updateJob } from "@/lib/employer";

describe("job editing", () => {
  it("owner can edit (search index follows); others cannot; invalid edits are rejected", async () => {
    const { db, emp1, emp2 } = await world();
    const id = await createJob(db, emp1, "Acme", job);
    await updateJob(db, emp1, id, { ...job, title: "Renamed Platform Engineer" });
    expect((await searchJobs(db, { q: "platform" })).jobs.map((j) => j.id)).toEqual([id]);
    expect((await searchJobs(db, { q: "backend" })).total).toBe(0);
    await expect(updateJob(db, emp2, id, job)).rejects.toThrow(ForbiddenError);
    await expect(getOwnJob(db, emp2, id)).rejects.toThrow(ForbiddenError);
    await expect(updateJob(db, emp1, id, { ...job, apply_url: "javascript:alert(1)" })).rejects.toThrow();
  });
});

describe("admin source creation", () => {
  it("requires admin, a terms URL and a valid per-adapter config; new sources start disabled", async () => {
    const { db, emp1, admin } = await world();
    const ok = { key: "partner-a", adapter: "json_feed", terms_url: "https://partner.example/terms", config: { url: "https://partner.example/feed.json" } };
    await expect(createSource(db, emp1, ok)).rejects.toThrow(ForbiddenError);
    await expect(createSource(db, admin, { ...ok, terms_url: "" })).rejects.toThrow();
    await expect(createSource(db, admin, { ...ok, adapter: "scraper" })).rejects.toThrow();
    await expect(createSource(db, admin, { ...ok, config: { url: "http://partner.example/f" } })).rejects.toThrow();
    await expect(createSource(db, admin, { ...ok, config: { url: "https://127.0.0.1/f" } })).rejects.toThrow();
    await expect(createSource(db, admin, { ...ok, adapter: "greenhouse", config: { board: "../x" } })).rejects.toThrow();
    await expect(createSource(db, admin, { ...ok, config: { url: "https://partner.example/f", extra: 1 } })).rejects.toThrow(); // strict
    await createSource(db, admin, ok);
    await expect(createSource(db, admin, ok)).rejects.toThrow(/already exists/);
    expect((await db.query<{ enabled: boolean }>("SELECT enabled FROM sources")).rows).toEqual([{ enabled: false }]);
  });
  it("blocks private/loopback/metadata hosts", () => {
    for (const bad of ["https://localhost/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.16.0.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://svc.internal/x", "http://example.com/x"])
      expect(() => assertPublicHttpsUrl(bad), bad).toThrow();
    expect(assertPublicHttpsUrl("https://boards-api.greenhouse.io/v1").hostname).toBe("boards-api.greenhouse.io");
  });
});
