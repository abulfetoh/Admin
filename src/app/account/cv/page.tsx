import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "CV", robots: { index: false } };

/** Browser-printable CV: works for any script (incl. Arabic/RTL) via Print → Save as PDF. */
export default async function Cv() {
  const u = await requireRole("candidate");
  const p = await getProfile(await getDb(), u);
  return (
    <article dir="auto" className="mx-auto max-w-2xl space-y-3 print:max-w-none">
      <h1 className="text-3xl font-bold">{u.name}</h1>
      {p.headline && <p className="text-lg">{p.headline}</p>}
      <p className="text-sm">{[u.email, p.phone, p.location].filter(Boolean).join(" · ")}</p>
      {p.summary && <section><h2 className="font-semibold uppercase">Summary</h2><p className="whitespace-pre-line">{p.summary}</p></section>}
      {p.skills.length > 0 && <section><h2 className="font-semibold uppercase">Skills</h2><p>{p.skills.join(", ")}</p></section>}
      {p.experience.length > 0 && <section><h2 className="font-semibold uppercase">Experience</h2>
        {p.experience.map((e, i) => <div key={i} className="mb-2"><strong>{e.title}</strong>{e.company && ` — ${e.company}`}<div className="text-sm">{e.from} – {e.to ?? "present"}</div>{e.details && <p className="whitespace-pre-line">{e.details}</p>}</div>)}</section>}
      {p.education.length > 0 && <section><h2 className="font-semibold uppercase">Education</h2>
        {p.education.map((e, i) => <p key={i}>{e.degree && `${e.degree}, `}{e.school}{e.year && ` (${e.year})`}</p>)}</section>}
    </article>
  );
}
