"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createSavedSearch, deleteSavedSearch } from "@/lib/alerts";
import { getDb } from "@/lib/db";
import { requireRole } from "@/lib/session";

export async function createAlertAction(fd: FormData) {
  const user = await requireRole("candidate");
  try {
    await createSavedSearch(await getDb(), user, { q: fd.get("q") ?? "", location: fd.get("location") ?? "", remote: fd.get("remote") === "on" });
  } catch (e) {
    if (!(e instanceof ZodError) && !(e instanceof Error && /up to/.test(e.message))) throw e;
  }
  revalidatePath("/account/alerts");
}
export async function deleteAlertAction(fd: FormData) {
  const user = await requireRole("candidate");
  await deleteSavedSearch(await getDb(), user, Number(fd.get("id")));
  revalidatePath("/account/alerts");
}
