import { describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth";
import { createJob, ForbiddenError, listOwnJobs, setJobStatus } from "@/lib/employer";
import { listUsers, setUserRole } from "@/lib/admin";
import { searchJobs } from "@/lib/jobs";
import { memDb } from "./helpers";

const job = { title: "Backend Developer", description: "Build and run our APIs in a small friendly team.", apply_url: "https://acme.test/apply", city: "Cairo" };

async function world() {
  const db = await memDb();
  const mk = (email: string, role: "candidate" | "employer") => registerUser(db, { email, password: "long-enough-pass", name: email.split("@")[0], role });
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
