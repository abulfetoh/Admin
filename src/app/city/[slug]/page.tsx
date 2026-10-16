import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { jobPath } from "@/lib/jobs";
import { jobsForFacet, MIN_INDEXABLE } from "@/lib/landing";
import { localePath, t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { alternatesFor } from "@/lib/seo";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const r = await jobsForFacet(await getDb(), "city", slug);
  if (!r) return { robots: { index: false } };
  return {
    title: `Jobs in ${r.name}`,
    alternates: alternatesFor(await getLocale(), `/city/${slug}`),
    robots: r.jobs.length < MIN_INDEXABLE ? { index: false, follow: true } : undefined,
  };
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const locale = await getLocale();
  const s = t(locale);
  const r = await jobsForFacet(await getDb(), "city", slug);
  if (!r) notFound();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">{r.name}</h1>
      <p className="mb-3 text-sm text-slate-600">{r.jobs.length} {s.results}</p>
      <ul className="divide-y divide-slate-200">
        {r.jobs.map((j) => (
          <li key={j.id} className="py-3">
            <Link href={localePath(locale, jobPath(j))} className="font-semibold text-blue-700 hover:underline">{j.title}</Link>
            <div className="text-sm text-slate-700">{j.company_name}{j.location ? ` · ${j.location}` : ""}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
