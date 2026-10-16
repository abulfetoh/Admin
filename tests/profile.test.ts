import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { registerUser } from "@/lib/auth";
import { buildCvPdf, UnsupportedTextError } from "@/lib/cv-pdf";
import { deleteAccountData, getProfile, saveProfile } from "@/lib/profile";
import { memDb } from "./helpers";

const base = { headline: "Engineer", summary: "Builds things", location: "Cairo", phone: "+20 100", skills: ["TS", "SQL"], experience: [{ title: "Dev", company: "Acme", from: "2020", details: "Did stuff" }], education: [{ school: "Cairo Univ", degree: "BSc", year: "2019" }] };

describe("profile + CV", () => {
  it("round-trips and updates", async () => {
    const db = await memDb();
    const u = await registerUser(db, { email: "c@x.com", password: "long-enough-pass", name: "Cam", role: "candidate" });
    expect(await getProfile(db, u)).toMatchObject({ headline: "", skills: [] });
    await saveProfile(db, u, base);
    await saveProfile(db, u, { ...base, headline: "Senior" });
    expect(await getProfile(db, u)).toMatchObject({ headline: "Senior", skills: ["TS", "SQL"], experience: [{ title: "Dev" }] });
  });
  it("rejects invalid input and cascades on account deletion", async () => {
    const db = await memDb();
    const u = await registerUser(db, { email: "c@x.com", password: "long-enough-pass", name: "Cam", role: "candidate" });
    await expect(saveProfile(db, u, { ...base, skills: new Array(60).fill("x") })).rejects.toThrow();
    await saveProfile(db, u, base);
    await deleteAccountData(db, u);
    expect((await db.query("SELECT 1 FROM profiles")).rows).toHaveLength(0);
  });
  it("builds a valid multi-page PDF, and refuses Arabic text", async () => {
    const p = { ...base, summary: "word ".repeat(2500) };
    const bytes = await buildCvPdf({ name: "Cam", email: "c@x.com" }, p);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    await expect(buildCvPdf({ name: "محمد", email: "c@x.com" }, base)).rejects.toThrow(UnsupportedTextError);
  });
});
