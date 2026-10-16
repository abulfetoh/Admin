import { isVerified } from "@/lib/account";
import { getDb } from "@/lib/db";
import { resendVerificationAction } from "./auth-actions";

export async function VerifyNotice({ userId }: { userId: number }) {
  if (await isVerified(await getDb(), userId)) return null;
  return (
    <div role="status" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      Confirm your email to post jobs or create alerts. Check your inbox for the link.
      <form action={resendVerificationAction} className="mt-1"><button className="underline">Resend confirmation email</button></form>
    </div>
  );
}
