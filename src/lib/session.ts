import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { hasRole, userFromToken, type Role, type User } from "./auth";

export const COOKIE = "sid";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return userFromToken(await getDb(), token);
}

/** Server-side guard: redirects to /login when missing, 404-ish redirect home when role is wrong. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!hasRole(u, ...roles)) redirect("/");
  return u;
}
