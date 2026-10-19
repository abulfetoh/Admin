"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createJob, ForbiddenError, setJobStatus, updateJob } from "@/lib/employer";
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
    if (e instanceof ForbiddenError) return { error: e.message }; // e.g. email not verified, daily limit
    throw e;
  }
  redirect("/employer");
}
export async function closeJobAction(fd: FormData) {
  const user = await requireRole("employer");
  await setJobStatus(await getDb(), user, Number(fd.get("id")), "expired");
  revalidatePath("/employer");
}

export async function editJobAction(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const user = await requireRole("employer");
  const data = Object.fromEntries(fd) as Record<string, unknown>;
  const id = Number(data.id);
  delete data.id;
  data.remote = fd.get("remote") === "on";
  for (const k of Object.keys(data)) if (data[k] === "") delete data[k];
  try {
    await updateJob(await getDb(), user, id, data);
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0].message };
    throw e;
  }
  redirect("/employer");
}
