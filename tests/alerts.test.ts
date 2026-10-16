import { describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth";
import { createSavedSearch, deleteSavedSearch, MAX_SAVED_SEARCHES, runAlerts, unsubscribe } from "@/lib/alerts";
import { flushOutbox, type EmailTransport } from "@/lib/email";
import { createJob } from "@/lib/employer";
import { memDb, verify } from "./helpers";

const job = (title: string) => ({ title, description: "A description that is long enough to pass.", apply_url: "https://a.test/x", city: "Cairo" });

async function world() {
  const db = await memDb();
  const emp = await registerUser(db, { email: "e@x.com", password: "long-enough-pass", name: "E", role: "employer" });
  const cand = await registerUser(db, { email: "c@x.com", password: "long-enough-pass", name: "C", role: "candidate" });
  await verify(db, emp.id); await verify(db, cand.id);
  return { db, emp, cand };
}

describe("alerts + email", () => {
  it("emails only new matching jobs, once", async () => {
    const { db, emp, cand } = await world();
    const t0 = new Date(Date.now() - 3600_000);
    await createSavedSearch(db, cand, { q: "developer" }, t0);
    await createJob(db, emp, "Acme", job("Python Developer"));
    await createJob(db, emp, "Acme", job("Chef"));
    expect(await runAlerts(db)).toEqual({ emails: 1 });
    expect(await runAlerts(db)).toEqual({ emails: 0 }); // nothing new the second time
    const mail = (await db.query<{ to_email: string; subject: string; body: string }>("SELECT * FROM email_outbox")).rows;
    expect(mail).toHaveLength(1);
    expect(mail[0].to_email).toBe("c@x.com");
    expect(mail[0].body).toContain("Python Developer");
    expect(mail[0].body).not.toContain("Chef");
    expect(mail[0].body).toMatch(/unsubscribe\//);
  });

  it("does not alert on typo-fuzzy matches", async () => {
    const { db, emp, cand } = await world();
    await createSavedSearch(db, cand, { q: "acountant" }, new Date(Date.now() - 3600_000));
    await createJob(db, emp, "Acme", job("Accountant"));
    expect(await runAlerts(db)).toEqual({ emails: 0 });
  });

  it("enforces limits, ownership and unsubscribe", async () => {
    const { db, cand, emp } = await world();
    await expect(createSavedSearch(db, cand, {})).rejects.toThrow();
    for (let i = 0; i < MAX_SAVED_SEARCHES; i++) await createSavedSearch(db, cand, { q: `k${i}` });
    await expect(createSavedSearch(db, cand, { q: "one more" })).rejects.toThrow(/up to/);
    const id = (await db.query<{ id: number }>("SELECT id FROM saved_searches LIMIT 1")).rows[0].id;
    await deleteSavedSearch(db, emp, id); // someone else's: no-op
    expect((await db.query("SELECT 1 FROM saved_searches")).rows).toHaveLength(MAX_SAVED_SEARCHES);
    const token = (await db.query<{ token: string }>("SELECT token FROM saved_searches LIMIT 1")).rows[0].token;
    expect(await unsubscribe(db, token)).toBe(true);
    expect(await unsubscribe(db, token)).toBe(false);
  });

  it("outbox retries then marks failed", async () => {
    const { db } = await world();
    await db.query("INSERT INTO email_outbox(to_email,subject,body) VALUES ('a@x.com','s','b')");
    const bad: EmailTransport = { send: async () => { throw new Error("smtp down"); } };
    expect(await flushOutbox(db, bad)).toEqual({ sent: 0, failed: 0 });
    await flushOutbox(db, bad);
    expect(await flushOutbox(db, bad)).toEqual({ sent: 0, failed: 1 });
    expect((await db.query<{ status: string }>("SELECT status FROM email_outbox")).rows[0].status).toBe("failed");
    await db.query("INSERT INTO email_outbox(to_email,subject,body) VALUES ('b@x.com','s','b')");
    expect(await flushOutbox(db, { send: async () => {} })).toEqual({ sent: 1, failed: 0 });
  });
});
