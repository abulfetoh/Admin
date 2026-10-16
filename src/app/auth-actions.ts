"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, createSession, destroySession, login, registerUser, type Role } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { COOKIE } from "@/lib/session";
import { allow, clientIp } from "@/lib/ratelimit";
import { deliverNow } from "@/lib/email";
import { requestPasswordReset, resetPassword, sendVerification } from "@/lib/account";
import { currentUser } from "@/lib/session";

export interface FormState { error?: string; email?: string }

async function start(userId: number) {
  const { token, expires } = await createSession(await getDb(), userId);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

const home = (role: Role) => (role === "admin" ? "/admin" : role === "employer" ? "/employer" : "/account");

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let role: Role;
  try {
    if (!(await allow(await getDb(), `login:${clientIp(await headers())}`, 20, 900))) return { error: "Too many attempts. Try again later.", email: String(fd.get("email") ?? "") };
    const u = await login(await getDb(), String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
    await start(u.id);
    role = u.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message, email: String(fd.get("email") ?? "") };
    throw e;
  }
  redirect(home(role));
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  let role: Role;
  try {
    if (!(await allow(await getDb(), `register:${clientIp(await headers())}`, 10, 3600))) return { error: "Too many sign-ups from this network. Try again later." };
    const u = await registerUser(await getDb(), Object.fromEntries(fd));
    await sendVerification(await getDb(), u);
    await deliverNow(await getDb());
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

export async function forgotAction(_: FormState & { sent?: boolean }, fd: FormData): Promise<FormState & { sent?: boolean }> {
  const db = await getDb();
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const ok = (await allow(db, `forgot:ip:${clientIp(await headers())}`, 5, 3600)) && (await allow(db, `forgot:email:${email}`, 3, 3600));
  if (ok) { await requestPasswordReset(db, email); await deliverNow(db); }
  return { sent: true }; // identical response whether or not the account exists / was throttled
}

export async function resetAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    if (!(await allow(await getDb(), `reset:${clientIp(await headers())}`, 10, 3600))) return { error: "Too many attempts. Try again later." };
    await resetPassword(await getDb(), String(fd.get("token")), String(fd.get("password") ?? ""));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/login");
}

export async function resendVerificationAction() {
  const u = await currentUser();
  if (!u) return;
  const db = await getDb();
  if (await allow(db, `resend:${u.id}`, 3, 3600)) { await sendVerification(db, u); await deliverNow(db); }
}
