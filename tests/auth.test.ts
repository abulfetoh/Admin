import { describe, expect, it } from "vitest";
import { AuthError, createSession, destroySession, hashPassword, login, registerUser, userFromToken, verifyPassword } from "@/lib/auth";
import { memDb } from "./helpers";

const reg = { email: "A@Example.com", password: "correct horse battery", name: "Ann", role: "candidate" };

describe("auth", () => {
  it("hashes with salt and verifies", async () => {
    const h = await hashPassword("secret-password");
    expect(h).not.toContain("secret-password");
    expect(await verifyPassword("secret-password", h)).toBe(true);
    expect(await verifyPassword("nope", h)).toBe(false);
    expect(h).not.toBe(await hashPassword("secret-password"));
  });

  it("registers, normalises email, rejects duplicates, weak passwords and admin self-registration", async () => {
    const db = await memDb();
    expect((await registerUser(db, reg)).email).toBe("a@example.com");
    await expect(registerUser(db, { ...reg, email: "a@EXAMPLE.com" })).rejects.toThrow(/already exists/);
    await expect(registerUser(db, { ...reg, email: "b@x.com", password: "short" })).rejects.toThrow(AuthError);
    await expect(registerUser(db, { ...reg, email: "c@x.com", role: "admin" })).rejects.toThrow(AuthError);
  });

  it("login, sessions and logout", async () => {
    const db = await memDb();
    const u = await registerUser(db, reg);
    expect((await login(db, "a@example.com", reg.password)).id).toBe(u.id);
    const { token } = await createSession(db, u.id);
    expect((await userFromToken(db, token))?.id).toBe(u.id);
    expect(await userFromToken(db, "garbage")).toBeNull();
    await destroySession(db, token);
    expect(await userFromToken(db, token)).toBeNull();
    const old = await createSession(db, u.id, new Date("2020-01-01"));
    expect(await userFromToken(db, old.token)).toBeNull(); // expired
  });

  it("gives the same error for unknown user and wrong password, and locks after repeated failures", async () => {
    const db = await memDb();
    await registerUser(db, reg);
    const msg = async (e: string, p: string) => login(db, e, p).catch((x: Error) => x.message);
    expect(await msg("nobody@x.com", "whatever12345")).toBe(await msg("a@example.com", "wrong-password"));
    for (let i = 0; i < 4; i++) await msg("a@example.com", "wrong-password");
    // locked: correct password is still refused, with the SAME message as an unknown email (lockout can't confirm an account exists)
    expect(await msg("a@example.com", reg.password)).toBe(await msg("nobody@x.com", "whatever12345"));
    expect((await db.query<{ locked_until: Date | null }>("SELECT locked_until FROM users")).rows[0].locked_until).not.toBeNull();
  });
});
