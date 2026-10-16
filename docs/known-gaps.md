# Known gaps (as of this build)

Security/accounts: no email verification, no password reset, no IP-based rate limiting (lockout is per account), no CSRF layer beyond Next.js server-action origin checks, session cookie is `secure` only when `NODE_ENV=production`.
Data: PGlite only (see architecture); RLS covers 2 tables; no GDPR export endpoint (account deletion helper exists in `lib/profile.ts` but has no UI).
Product: AI has no UI; CV PDF can't render Arabic (use printable view); alerts are daily-digest-style only (run `npm run alerts` on a schedule — no scheduler included); employer jobs have no editing UI; landing pages have no translated names.
Dependencies: `npm audit` reports high-severity advisories (e.g. in Next's bundled postcss); fix needs a Next major bump — not applied.
Ops: domain today-jobs.com not purchased; sitemap/canonicals use it as a placeholder.
