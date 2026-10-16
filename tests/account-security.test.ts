import { describe, expect, it } from "vitest";
import { AuthError, login, registerUser, userFromToken, createSession } from "@/lib/auth";
import { consumeToken, isVerified, issueToken, requestPasswordReset, resetPassword, sendVerification, verifyEmail } from "@/lib/account";
import { createJob, ForbiddenError } from "@/lib/employer";
import { createSavedSearch, runAlerts } from "@/lib/alerts";
import { allow } from "@/lib/ratelimit";
import { memDb, verify } from "./helpers";

const reg = { email: "u@x.com", password: "old-password-123", name: "U", role: "employer" };
const mails = async (db: Awaited<ReturnType<typeof memDb>>) => (await db.query<{ to_email: string; body: string }>("SELECT to_email, body FROM email_outbox ORDER BY id")).rows;
const tokenOf = (body: string) => body.match(/\/(?:verify|reset)\/([\w-]+)/)![1];

describe("email verification", () => {
  it("emails a single-use link; verifying unlocks posting jobs and alerts", async () => {
    const db = await memDb();
    const u = await registerUser(db, reg);
    await sendVerification(db, u);
    const job = { title: "Some Role", description: "Description long enough to be valid here.", apply_url: "https://a.test/x" };
    await expect(createJob(db, u, "Co", job)).rejects.toThrow(ForbiddenError);
    await expect(createSavedSearch(db, { ...u, role: "candidate" }, { q: "x" })).rejects.toThrow(/Verify/);
    const t = tokenOf((await mails(db))[0].body);
    expect(await verifyEmail(db, t)).toBe(true);
    expect(await verifyEmail(db, t)).toBe(false); // single use
    expect(await isVerified(db, u.id)).toBe(true);
    await expect(createJob(db, u, "Co", job)).resolves.toBeTypeOf("number");
  });
  it("expired and forged tokens fail; a newer link invalidates the older one", async () => {
    const db = await memDb();
    const u = await registerUser(db, reg);
    const old = await issueToken(db, u.id, "verify", new Date(Date.now() - 3 * 86400_000));
    expect(await verifyEmail(db, old)).toBe(false);
    const a = await issueToken(db, u.id, "verify");
    const b = await issueToken(db, u.id, "verify");
    expect(await consumeToken(db, a, "verify")).toBeNull();
    expect(await consumeToken(db, b, "reset")).toBeNull(); // wrong purpose
    expect(await verifyEmail(db, "forged")).toBe(false);
  });
  it("unverified users never receive alert emails", async () => {
    const db = await memDb();
    const u = await registerUser(db, { ...reg, role: "candidate" });
    await verify(db, u.id);
    await createSavedSearch(db, u, { q: "dev" }, new Date(Date.now() - 1000));
    await db.query("UPDATE users SET email_verified_at=NULL");
    await db.query("INSERT INTO companies(slug,name) VALUES ('c','C')");
    await db.query("INSERT INTO jobs(external_id,company_id,title,apply_url,content_hash,dedupe_key) VALUES ('1',1,'dev','https://x.test','h','k')");
    expect(await runAlerts(db)).toEqual({ emails: 0 });
  });
});

describe("password reset", () => {
  it("does not reveal whether the email exists", async () => {
    const db = await memDb();
    await registerUser(db, reg);
    await requestPasswordReset(db, "nobody@x.com");
    expect(await mails(db)).toHaveLength(0);
    await requestPasswordReset(db, "U@X.com");
    expect(await mails(db)).toHaveLength(1);
  });
  it("sets the new password, logs out all sessions, works once, rejects weak passwords without burning the link", async () => {
    const db = await memDb();
    const u = await registerUser(db, reg);
    const { token: sess } = await createSession(db, u.id);
    await requestPasswordReset(db, reg.email);
    const t = tokenOf((await mails(db))[0].body);
    await expect(resetPassword(db, t, "short")).rejects.toThrow(AuthError);
    await resetPassword(db, t, "brand-new-password");
    expect(await userFromToken(db, sess)).toBeNull();
    await expect(login(db, reg.email, reg.password)).rejects.toThrow();
    expect((await login(db, reg.email, "brand-new-password")).id).toBe(u.id);
    await expect(resetPassword(db, t, "another-password-1")).rejects.toThrow(/invalid or has expired/);
  });
  it("a reset clears a lockout", async () => {
    const db = await memDb();
    const u = await registerUser(db, reg);
    await db.query("UPDATE users SET locked_until = now() + interval '1 hour' WHERE id=$1", [u.id]);
    await requestPasswordReset(db, reg.email);
    await resetPassword(db, tokenOf((await mails(db))[0].body), "brand-new-password");
    expect((await login(db, reg.email, "brand-new-password")).id).toBe(u.id);
  });
});

describe("rate limit", () => {
  it("blocks after the limit within a window and resets in the next", async () => {
    const db = await memDb();
    const t = new Date("2026-01-01T00:00:10Z");
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await allow(db, "k", 3, 60, t));
    expect(r).toEqual([true, true, true, false]);
    expect(await allow(db, "other", 3, 60, t)).toBe(true);
    expect(await allow(db, "k", 3, 60, new Date("2026-01-01T00:01:10Z"))).toBe(true);
  });
});
