import { verifyEmail } from "@/lib/account";
import { getDb } from "@/lib/db";

export const metadata = { title: "Confirm email", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

async function confirm(fd: FormData) {
  "use server";
  const { redirect } = await import("next/navigation");
  const ok = await verifyEmail(await getDb(), String(fd.get("token")));
  redirect(ok ? "/verify/done" : "/verify/invalid");
}

// Button (POST) rather than verify-on-GET so mail scanners that prefetch links can't consume the token.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token === "done") return <p role="status">Your email is confirmed. You can now post jobs and create alerts.</p>;
  if (token === "invalid") return <p role="alert">This confirmation link is invalid or has expired. Request a new one from your account page.</p>;
  return (
    <form action={confirm} className="space-y-3">
      <h1 className="text-xl font-bold">Confirm your email address</h1>
      <input type="hidden" name="token" value={token} />
      <button className="rounded bg-slate-900 px-4 py-2 text-white">Confirm</button>
    </form>
  );
}
