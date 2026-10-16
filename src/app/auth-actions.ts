"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, createSession, destroySession, login, registerUser, type Role } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { COOKIE } from "@/lib/session";

export interface FormState { error?: string }

async function start(userId: number) {
  const { token, expires } = await createSession(await getDb(), userId);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

const home = (role: Role) => (role === "admin" ? "/admin" : role === "employer" ? "/employer" : "/account");

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let role: Role;
  try {
    const u = await login(await getDb(), String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
    await start(u.id);
    role = u.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(home(role));
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  let role: Role;
  try {
    const u = await registerUser(await getDb(), Object.fromEntries(fd));
    await start(u.id);
    role = u.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(home(role));
}

export async function logoutAction() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await destroySession(await getDb(), t);
  jar.delete(COOKIE);
  redirect("/");
}
