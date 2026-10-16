import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getJob, jobPath } from "@/lib/jobs";
import { jobPostingJsonLd } from "@/lib/jsonld";
import { t } from "@/lib/i18n";
import { getLocale, SITE_URL } from "@/lib/locale";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string; slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { id } = await params;
  const job = Number.isInteger(+id) ? await getJob(await getDb(), +id) : null;
  if (!job) return { robots: { index: false } };
  return {
    title: `${job.title} – ${job.company_name}`,
    description: job.description.slice(0, 155),
    alternates: { canonical: `${SITE_URL}${jobPath(job)}` },
    robots: job.status === "active" ? undefined : { index: false },
  };
}

export default async function JobPage({ params }: P) {
  const { id, slug } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const job = await getJob(await getDb(), +id);
  if (!job) notFound();
  if (slug !== jobPath(job).split("/")[3]) permanentRedirect(jobPath(job));
  const s = t(await getLocale());
  const ld = jobPostingJsonLd(job, SITE_URL);

  return (
    <article>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
      <Link href="/" className="text-sm underline">{s.backToResults}</Link>
      <h1 className="mt-3 text-2xl font-bold">{job.title}</h1>
      <p className="text-slate-700">{job.company_name}{job.location ? ` · ${job.location}` : ""}{job.remote ? ` · ${s.remote}` : ""}</p>
      <p className="text-sm text-slate-500">{s.postedOn} {job.posted_at.toISOString().slice(0, 10)}</p>
      {job.status !== "active" ? (
        <p className="my-4 rounded bg-amber-50 p-3">{s.jobExpired}</p>
      ) : (
        <a href={job.apply_url} rel="nofollow noopener noreferrer sponsored" className="my-4 inline-block rounded bg-blue-700 px-4 py-2 text-white">{s.apply}</a>
      )}
      <div className="whitespace-pre-line leading-relaxed">{job.description}</div>
    </article>
  );
}
