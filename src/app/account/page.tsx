import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { requireRole } from "@/lib/session";
import { getAiProvider } from "@/lib/ai";
import { VerifyNotice } from "@/app/verify-notice";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile", robots: { index: false } };

export default async function Account() {
  const user = await requireRole("candidate");
  const p = await getProfile(await getDb(), user);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My profile</h1>
      <VerifyNotice userId={user.id} />
      <p className="text-sm"><Link className="underline" href="/account/alerts">Job alerts</Link> · <Link className="underline" href="/account/cv">Printable CV</Link> · <a className="underline" href="/account/cv.pdf">Download PDF (Latin text only)</a> · <a className="underline" href="/account/export.json">Export my data</a> · <Link className="underline" href="/account/delete">Delete account</Link></p>
      <ProfileForm p={p} aiEnabled={getAiProvider() !== null} />
    </div>
  );
}
