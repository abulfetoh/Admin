"use server";
import { revalidatePath } from "next/cache";
import { createSource, setSourceEnabled, setUserRole } from "@/lib/admin";
import { ZodError } from "zod";
import { setJobStatus } from "@/lib/employer";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import type { Role } from "@/lib/auth";

export async function roleAction(fd: FormData) {
  const admin = await requireRole("admin");
  const role = String(fd.get("role"));
  if (!["candidate", "employer", "admin"].includes(role)) return;
  await setUserRole(await getDb(), admin, Number(fd.get("id")), role as Role);
  revalidatePath("/admin");
}
export async function sourceAction(fd: FormData) {
  const admin = await requireRole("admin");
  await setSourceEnabled(await getDb(), admin, Number(fd.get("id")), fd.get("enabled") === "1");
  revalidatePath("/admin");
}
export async function removeJobAction(fd: FormData) {
  const admin = await requireRole("admin");
  await setJobStatus(await getDb(), admin, Number(fd.get("id")), "removed");
  revalidatePath("/admin");
}

export async function createSourceAction(_: { error?: string; ok?: boolean }, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireRole("admin");
  try {
    let config: unknown;
    try { config = JSON.parse(String(fd.get("config") ?? "{}")); } catch { return { error: "Config must be valid JSON" }; }
    await createSource(await getDb(), admin, { key: fd.get("key"), adapter: fd.get("adapter"), terms_url: fd.get("terms_url"), config });
  } catch (e) {
    if (e instanceof ZodError) return { error: `${e.issues[0].path.join(".") || "input"}: ${e.issues[0].message}` };
    if (e instanceof Error && /already exists|not allowed|https/.test(e.message)) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true };
}
