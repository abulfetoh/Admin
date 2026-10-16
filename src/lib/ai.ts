import type { Db } from "./db";
import type { User } from "./auth";
import type { ProfileData } from "./profile";

export interface AiProvider {
  readonly name: string;
  complete(prompt: string, opts?: { maxTokens?: number }): Promise<string>;
}

export class AiDisabledError extends Error {}
export class AiRateLimitError extends Error {}

export const mockProvider: AiProvider = {
  name: "mock",
  async complete(prompt) { return `MOCK: ${prompt.slice(0, 40)}`; },
};

/** Anthropic Messages API over fetch. NOT exercised against the live API in this repo's tests. */
export function anthropicProvider(apiKey: string, model: string, fetchFn: typeof fetch = fetch): AiProvider {
  return {
    name: "anthropic",
    async complete(prompt, opts) {
      const res = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: opts?.maxTokens ?? 400, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) throw new Error(`AI provider error ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    },
  };
}

/** AI is OFF unless AI_PROVIDER is set. Keys come from env only. */
export function getAiProvider(env: Record<string, string | undefined> = process.env): AiProvider | null {
  switch (env.AI_PROVIDER) {
    case "mock": return mockProvider;
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY || !env.AI_MODEL) return null;
      return anthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL);
    default: return null;
  }
}

export const AI_DAILY_LIMIT = 10;

async function checkAndRecord(db: Db, user: User, feature: string, now: Date) {
  const n = Number((await db.query<{ n: string }>(
    "SELECT count(*) n FROM ai_usage WHERE user_id=$1 AND created_at > $2", [user.id, new Date(now.getTime() - 86400000)])).rows[0].n);
  if (n >= AI_DAILY_LIMIT) throw new AiRateLimitError("Daily AI limit reached");
  await db.query("INSERT INTO ai_usage(user_id, feature, created_at) VALUES ($1,$2,$3)", [user.id, feature, now]);
}

/** Suggests a better CV summary. Sends only the fields below, only on explicit user action; the output is a suggestion the user must accept. */
export async function suggestSummary(db: Db, provider: AiProvider | null, user: User, p: ProfileData, now = new Date()): Promise<string> {
  if (!provider) throw new AiDisabledError("AI features are not enabled");
  await checkAndRecord(db, user, "cv_summary", now);
  const prompt = [
    "Rewrite this CV summary in 2-3 factual sentences. Do not invent employers, degrees or achievements. Keep the language of the original.",
    `Headline: ${p.headline}`, `Skills: ${p.skills.join(", ")}`, `Current summary: ${p.summary}`,
    `Roles: ${p.experience.map((e) => `${e.title} at ${e.company}`).join("; ")}`,
  ].join("\n");
  return provider.complete(prompt, { maxTokens: 300 });
}
