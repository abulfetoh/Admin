"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account";
import { AuthError } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { allow } from "@/lib/ratelimit";
import { COOKIE, currentUser } from "@/lib/session";

export async function deleteAccountAction(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!(await allow(await getDb(), `delete:${user.id}`, 5, 3600))) return { error: "Too many attempts. Try again later." }; // password-guessing brake
  try {
    await deleteAccount(await getDb(), user, String(fd.get("password") ?? ""));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  (await cookies()).delete(COOKIE);
  redirect("/");
}
