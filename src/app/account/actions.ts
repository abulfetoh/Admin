"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { getProfile, saveProfile } from "@/lib/profile";
import { AiDisabledError, AiRateLimitError, getAiProvider, suggestSummary } from "@/lib/ai";
import { requireRole } from "@/lib/session";

/** The form posts one JSON textarea per list to stay simple and accessible without client JS. */
export async function saveProfileAction(_: { error?: string; ok?: boolean }, fd: FormData) {
  const user = await requireRole("candidate");
  try {
    const json = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v ? JSON.parse(v) : []; };
    await saveProfile(await getDb(), user, {
      headline: fd.get("headline"), summary: fd.get("summary"), location: fd.get("location"), phone: fd.get("phone"),
      skills: String(fd.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      experience: json("experience"), education: json("education"),
    });
  } catch (e) {
    if (e instanceof ZodError) return { error: `${e.issues[0].path.join(".")}: ${e.issues[0].message}` };
    if (e instanceof SyntaxError) return { error: "Experience/education must be valid JSON" };
    throw e;
  }
  revalidatePath("/account");
  return { ok: true };
}

/** Explicit, user-triggered only. Uses the SAVED profile; the result is a suggestion the user must accept. */
export async function suggestSummaryAction(): Promise<{ suggestion?: string; error?: string }> {
  const user = await requireRole("candidate");
  const db = await getDb();
  try {
    return { suggestion: await suggestSummary(db, getAiProvider(), user, await getProfile(db, user)) };
  } catch (e) {
    if (e instanceof AiDisabledError || e instanceof AiRateLimitError) return { error: e.message };
    return { error: "The AI service is unavailable right now" };
  }
}
