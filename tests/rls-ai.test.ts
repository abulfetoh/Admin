import { describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth";
import { AI_DAILY_LIMIT, AiDisabledError, AiRateLimitError, anthropicProvider, getAiProvider, mockProvider, suggestSummary } from "@/lib/ai";
import { emptyProfile, getProfile, saveProfile } from "@/lib/profile";
import { createSavedSearch, listSavedSearches } from "@/lib/alerts";
import { withUser } from "@/lib/rls";
import { memDb } from "./helpers";

async function two() {
  const db = await memDb();
  const mk = (e: string) => registerUser(db, { email: e, password: "long-enough-pass", name: e, role: "candidate" });
  return { db, a: await mk("a@x.com"), b: await mk("b@x.com") };
}

describe("RLS", () => {
  it("a user's scoped connection cannot see or write another user's rows, even without a WHERE", async () => {
    const { db, a, b } = await two();
    await saveProfile(db, a, { ...emptyProfile(), headline: "A-secret" });
    await saveProfile(db, b, { ...emptyProfile(), headline: "B-secret" });
    const seen = await withUser(db, b.id, async (tx) => (await tx.query<{ headline: string }>("SELECT headline FROM profiles")).rows);
    expect(seen).toEqual([{ headline: "B-secret" }]);
    await expect(withUser(db, b.id, (tx) => tx.query("INSERT INTO profiles(user_id) VALUES ($1)", [a.id]))).rejects.toThrow(/row-level security/);
    await withUser(db, b.id, (tx) => tx.query("UPDATE profiles SET headline='hacked'")); // only touches B's own row
    expect((await getProfile(db, a)).headline).toBe("A-secret");
  });
  it("no user context means no rows; saved searches are isolated", async () => {
    const { db, a, b } = await two();
    await createSavedSearch(db, a, { q: "x" });
    expect(await listSavedSearches(db, b)).toHaveLength(0);
    expect(await listSavedSearches(db, a)).toHaveLength(1);
    const none = await db.transaction(async (tx) => { await tx.query("SET LOCAL ROLE app_user"); return (await tx.query("SELECT * FROM saved_searches")).rows; });
    expect(none).toHaveLength(0);
  });
});

describe("AI layer", () => {
  it("is disabled by default and needs full config for a real provider", () => {
    expect(getAiProvider({})).toBeNull();
    expect(getAiProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toBeNull();
    expect(getAiProvider({ AI_PROVIDER: "mock" })?.name).toBe("mock");
  });
  it("throws when disabled, and rate limits per user", async () => {
    const { db, a, b } = await two();
    await expect(suggestSummary(db, null, a, emptyProfile())).rejects.toThrow(AiDisabledError);
    for (let i = 0; i < AI_DAILY_LIMIT; i++) await suggestSummary(db, mockProvider, a, emptyProfile());
    await expect(suggestSummary(db, mockProvider, a, emptyProfile())).rejects.toThrow(AiRateLimitError);
    await expect(suggestSummary(db, mockProvider, b, emptyProfile())).resolves.toMatch(/^MOCK/);
  });
  it("anthropic provider builds the request and parses text blocks (mocked fetch)", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ content: [{ type: "text", text: "Hi " }, { type: "text", text: "there" }] })); }) as unknown as typeof fetch;
    expect(await anthropicProvider("key", "m", f).complete("p")).toBe("Hi there");
    expect(seen?.url).toBe("https://api.anthropic.com/v1/messages");
    expect((seen?.init.headers as Record<string, string>)["x-api-key"]).toBe("key");
  });
});
