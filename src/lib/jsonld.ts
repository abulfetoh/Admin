import type { JobRow } from "./jobs";

/**
 * Google requires JobPosting structured data to match visible page content and to be
 * removed/ invalid-through when the job is no longer available. We therefore emit it
 * ONLY for active, non-expired jobs, and only include fields we actually hold.
 */
export function jobPostingJsonLd(j: JobRow, siteUrl: string, now = new Date()): Record<string, unknown> | null {
  if (j.status !== "active") return null;
  if (j.valid_through && j.valid_through < now) return null;
  if (!j.description.trim()) return null; // description is required by Google

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description,
    datePosted: j.posted_at.toISOString(),
    hiringOrganization: {
      "@type": "Organization",
      name: j.company_name,
      ...(j.company_website ? { sameAs: j.company_website } : {}),
    },
    directApply: false,
    url: `${siteUrl}/jobs/${j.id}`,
  };
  if (j.valid_through) ld.validThrough = j.valid_through.toISOString();
  if (j.employment_type) ld.employmentType = j.employment_type.toUpperCase().replace(/[- ]/g, "_");
  if (j.remote) ld.jobLocationType = "TELECOMMUTE";
  if (j.location || j.city || j.country) {
    ld.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(j.city ? { addressLocality: j.city } : j.location ? { addressLocality: j.location } : {}),
        ...(j.country ? { addressCountry: j.country } : {}),
      },
    };
  }
  if (j.salary_min != null && j.salary_currency) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: j.salary_currency,
      value: { "@type": "QuantitativeValue", minValue: j.salary_min, ...(j.salary_max != null ? { maxValue: j.salary_max } : {}), unitText: "YEAR" },
    };
  }
  return ld;
}
