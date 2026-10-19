import { scryptSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, login, needsRehash, registerUser, scryptCost, verifyPassword } from "@/lib/auth";
import { memDb } from "./helpers";

describe("password hashing", () => {
  it("defaults to the OWASP-level cost (N=2^17, r=8, p=1) when no test override is set", () => {
    const saved = process.env.SCRYPT_LOG_N;
    delete process.env.SCRYPT_LOG_N;
    try { expect(scryptCost()).toEqual({ N: 131072, r: 8, p: 1 }); } finally { if (saved) process.env.SCRYPT_LOG_N = saved; }
    process.env.SCRYPT_LOG_N = "99"; // nonsense falls back to the strong default, not to something weak
    try { expect(scryptCost().N).toBe(131072); } finally { process.env.SCRYPT_LOG_N = saved; }
  });

  it("stores its parameters in the hash and verifies; salts differ", async () => {
    const h = await hashPassword("a-long-passphrase");
    expect(h).toMatch(/^scrypt\$\d+\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword("a-long-passphrase", h)).toBe(true);
    expect(await verifyPassword("a-long-passphrasf", h)).toBe(false);
    expect(h).not.toBe(await hashPassword("a-long-passphrase"));
  });

  it("rejects malformed hashes and attacker-sized cost parameters quickly (no memory-exhaustion via a poisoned DB value)", async () => {
    for (const bad of ["", "scrypt", "bcrypt$a$b", "scrypt$1073741824$8$1$aa$bb", "scrypt$1024$1000$1$aa$bb", "scrypt$1024$8$99$aa$bb", "scrypt$x$8$1$aa$bb"])
      expect(await verifyPassword("pw", bad), bad).toBe(false);
  });

  it("legacy 3-part hashes (Node default cost) still verify, are flagged, and are upgraded on successful login", async () => {
    const db = await memDb();
    const u = await registerUser(db, { email: "old@x.com", password: "old-password-123", name: "Old", role: "candidate" });
    const salt = randomBytes(16);
    const legacy = `scrypt$${salt.toString("hex")}$${scryptSync("old-password-123", salt, 64).toString("hex")}`;
    await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [u.id, legacy]);
    expect(needsRehash(legacy)).toBe(true);
    expect((await login(db, "old@x.com", "old-password-123")).id).toBe(u.id);
    const after = (await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [u.id])).rows[0].password_hash;
    expect(after).not.toBe(legacy);
    expect(needsRehash(after)).toBe(false);
    expect((await login(db, "old@x.com", "old-password-123")).id).toBe(u.id); // still works with the new hash
    // a wrong password must NOT trigger a rehash/upgrade
    await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [u.id, legacy]);
    await expect(login(db, "old@x.com", "wrong-password-1")).rejects.toThrow();
    expect((await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [u.id])).rows[0].password_hash).toBe(legacy);
  });
});
