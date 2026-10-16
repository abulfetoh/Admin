import { describe, expect, it } from "vitest";
import { gpcOptOut, parseConsent, serializeConsent } from "@/lib/consent";
import { recordPageview, topPages } from "@/lib/analytics";
import { ForbiddenError } from "@/lib/employer";
import { memDb } from "./helpers";

describe("consent", () => {
  it("defaults to no consent and rejects malformed values", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("%7Bbad")).toBeNull();
    expect(parseConsent(serializeConsent({ analytics: true, ads: false }))).toEqual({ analytics: true, ads: false });
    expect(parseConsent(encodeURIComponent('{"analytics":"yes"}'))).toEqual({ analytics: false, ads: false }); // only literal true counts
  });
  it("detects Global Privacy Control", () => {
    expect(gpcOptOut(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(gpcOptOut(new Headers())).toBe(false);
  });
});

describe("analytics", () => {
  it("stores path only (no query), referrer host only, skips bots/private/invalid", async () => {
    const db = await memDb();
    expect(await recordPageview(db, { path: "/jobs/1/x?email=a@b.c#h", locale: "en", referrer: "https://google.com/search?q=secret" })).toBe(true);
    expect(await recordPageview(db, { path: "/", locale: "en", userAgent: "Googlebot/2.1" })).toBe(false);
    expect(await recordPageview(db, { path: "/account/alerts", locale: "en" })).toBe(false);
    expect(await recordPageview(db, { path: "/ar/admin", locale: "ar" })).toBe(false);
    expect(await recordPageview(db, { path: "http://evil", locale: "en" })).toBe(false);
    expect(await recordPageview(db, { path: "/", locale: "fr" })).toBe(false);
    expect((await db.query("SELECT path, ref_host FROM pageviews")).rows).toEqual([{ path: "/jobs/1/x", ref_host: "google.com" }]);
  });
  it("top pages is admin-only", async () => {
    const db = await memDb();
    await recordPageview(db, { path: "/", locale: "en" });
    await expect(topPages(db, { id: 1, email: "", name: "", role: "employer" })).rejects.toThrow(ForbiddenError);
    expect(await topPages(db, { id: 1, email: "", name: "", role: "admin" })).toEqual([{ path: "/", views: 1 }]);
  });
});
