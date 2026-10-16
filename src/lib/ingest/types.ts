export interface RawJob {
  externalId: string;
  title: string;
  company: string;
  companyWebsite?: string;
  description?: string;
  location?: string;
  country?: string;
  city?: string;
  remote?: boolean;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applyUrl: string;
  postedAt?: Date;
  validThrough?: Date;
}

export interface FetchContext {
  fetchFn: typeof fetch;
  userAgent: string;
}

export interface SourceAdapter {
  readonly name: string;
  /** Returns the COMPLETE current set of open jobs for the source. */
  fetch(config: Record<string, unknown>, ctx: FetchContext): Promise<RawJob[]>;
}
