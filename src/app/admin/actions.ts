"use server";
import { revalidatePath } from "next/cache";
import { setSourceEnabled, setUserRole } from "@/lib/admin";
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
