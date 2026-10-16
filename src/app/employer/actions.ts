"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createJob, setJobStatus } from "@/lib/employer";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export async function postJobAction(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const user = await requireRole("employer");
  const data = Object.fromEntries(fd) as Record<string, unknown>;
  data.remote = fd.get("remote") === "on";
  for (const k of Object.keys(data)) if (data[k] === "") delete data[k];
  try {
    await createJob(await getDb(), user, String(fd.get("company") || user.name), data);
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0].message };
    throw e;
  }
  redirect("/employer");
}
export async function closeJobAction(fd: FormData) {
  const user = await requireRole("employer");
  await setJobStatus(await getDb(), user, Number(fd.get("id")), "expired");
  revalidatePath("/employer");
}
