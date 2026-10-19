# Security review and controls

**Scope and honesty.** This is a code review of this repository performed by an AI assistant (Claude), followed by fixes, with tests for each fix. It is **not** a penetration test, it did not touch any deployed system, and it cannot replace review by a qualified human before handling real users' data. Severity ratings are my own judgement (Critical / High / Medium / Low).

Method: read all security-relevant code (auth, sessions, every server action and route handler, ingestion, email, cron, analytics, CI workflow); followed the OWASP-based checklist of the `security-review` skill (reference guides from `getsentry/skills`, pinned commit); **verified suspected issues empirically before reporting** (two candidates were disproved, see "Checked and not a problem"); fixed what was real; and proved key fixes with tests, including a negative control (the CSP tests fail when the CSP is switched off).

## Findings and status

| # | Finding | Severity | How established | Status |
|---|---|---|---|---|
| 1 | Password hashing used Node's default scrypt cost (N=2^14, ~16 MB) — below the N=2^17 / r=8 / p=1 minimum in the review reference | Medium | Code + benchmark (56 ms vs ~490 ms per hash) | **Fixed.** N=2^17, self-describing hash format (`scrypt$N$r$p$salt$key`); legacy hashes still verify and are upgraded on next successful login; cost parameters from stored hashes are range-checked (a poisoned DB value can't force huge allocations); hashing concurrency capped at 2 (≈256 MB worst case). |
| 2 | Rate-limit key trusted the *leftmost* `X-Forwarded-For` entry, which a client controls → every limit (login, register, reset, analytics) bypassable by changing a header | Medium | Code + unit tests + e2e (varying a spoofed prefix no longer resets the bucket) | **Fixed.** `clientIp()` takes the entry added by our own proxy (`TRUSTED_PROXY_HOPS`, default 1, counted from the right), validates it is an IP, else `"unknown"`. **Deployment requirement:** run behind a proxy/platform that sets `X-Forwarded-For`; set `TRUSTED_PROXY_HOPS` to the number of trusted proxies. |
| 3 | Feed fetching followed HTTP redirects automatically, so a permitted public host could redirect the server to `http://169.254.169.254/` or localhost; also no timeout or size limit | Medium (needs a partner/compromised feed host) | Code (fetch default semantics) + unit tests with mock redirects | **Fixed.** Redirects are followed manually (max 3), every hop re-validated (https only, no private/loopback/link-local/metadata IP literals), 20 s timeout, 5 MB cap, policy failures are not retried. **Residual:** a hostname that *resolves* to a private IP is not detected (DNS rebinding) — add network egress rules. |
| 4 | `/api/collect` had no rate limit or size cap; the "server re-checks consent" control is useless as abuse protection because the consent cookie is client-set → anyone could flood `pageviews` | Medium-Low | Code + e2e (130 requests → 429s; 4 KB body → 413) | **Fixed.** 120 requests/min per client, 2 KB body cap. |
| 5 | No security headers or Content-Security-Policy | Low-Medium (defense in depth) | Observed with curl | **Fixed.** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, HSTS (production, no `preload`), and a per-request-nonce CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`/`unsafe-eval`; `object-src 'none'`, `frame-ancestors 'none'`, …). Tested: no violations across public/auth/logged-in journeys, and a simulated stored-XSS (nonce-less inline script, inline handler, `javascript:` link injected into the real response) is blocked. **Not verified:** the extra AdSense allowances (added only when `ADSENSE_CLIENT` is set) — no AdSense account to test against. |
| 6 | Account lockout returned a different message ("Too many attempts") only for real accounts → confirms an email exists | Low | Code + test | **Fixed.** Locked accounts get the same message and do the same hashing work as bad credentials. |
| 7 | Feed URL fields (`apply_url`, `company_website`, Greenhouse `absolute_url`) accepted any scheme, including `javascript:` / `data:` | Low (**not exploitable today**: React 19 neutralises `javascript:` hrefs — verified) | Tested | **Fixed** (hardening): only `http(s)` URLs accepted; items failing validation are skipped. |
| 8 | User-influenced text (saved-search query) flows into email subjects; CR/LF could inject headers with an SMTP-style provider | Low / needs verification once a real provider exists (current transports are console/file) | Code | **Fixed.** Subjects are stripped of CR/LF/NUL/U+2028/9; recipients must be a single plain address. |
| 9 | No volume limits on posting jobs, or on password guesses in the account-deletion form | Low | Code | **Fixed.** 20 jobs/day per employer; 5 deletion attempts/hour per user. |
| 10 | Unverified employer submitting the post-job form, or unverified user creating an alert, hit an unhandled error (500 page) | Low | Found while tracing actions | **Fixed.** Clear error messages. |
| 11 | Concurrency limiter for hashing could briefly exceed its cap under a hand-off race | Low | Code re-read | **Fixed** (slot hand-off), extracted to `src/lib/semaphore.ts` with a stress test. |
| 12 | CI workflow had default token permissions and no timeouts | Low | Code | **Fixed.** `permissions: contents: read`, job timeouts, concurrency group. |
| 13 | `?page=` (from the URL) was interpolated into the SQL text as a number; `Infinity`, `NaN` or `1e300` produced a database error (500 page). Not injectable (only numeric characters reach the SQL) | Low (availability) | Reproduced with 6 failing inputs before the fix | **Fixed.** `searchJobs` clamps page (1–10 000) and page size (1–50) to finite integers. |

## Checked and not a problem
- **Authorization:** every server action and route handler enforces identity/role (`requireRole`/`currentUser`/bearer secret/token) — checked individually; ownership checks for employer jobs and admin-only operations are enforced in the library layer, not just the pages.
- **SQL injection:** every user-controlled string is a bound parameter. The few SQL fragments built by interpolation were each checked: they are code constants (`COLS`, the facet-column map keyed by a typed union, fixed `ORDER BY` strings) or clamped integers (see #13). Tested with a hostile search string.
- **XSS:** no `dangerouslySetInnerHTML` except JSON-LD, which is `JSON.stringify`'d with `<` escaped; all user text is rendered as React text.
- **Open redirect via the language switcher (`/ar//evil.com`):** tested — Next redirects (308) double-slash paths; not exploitable.
- **`javascript:` links:** see #7.
- Passwords/tokens: sessions and reset/verify tokens are 256-bit random, stored only as SHA-256 hashes, single-use where applicable, `httpOnly` + `SameSite=Lax` (+ `Secure` in production); reset logs out every device. Authenticated pages are served `no-store`.
- CSRF: relies on Next.js's built-in Origin/Host check for server actions (documented Next behaviour; **not independently tested here**) plus `SameSite=Lax` cookies; state-changing route handlers require a bearer secret or are rate-limited POSTs.

## Known residual risks / decisions for you
1. **Employer identity is not verified.** Email verification proves a mailbox, not a company. Any verified employer can post under any company name (impersonation / job-scam risk) with any apply link. Needs a moderation or company-verification process — a product decision, not implemented.
2. **Registration reveals whether an email is registered** ("account already exists"). Common UX trade-off; mitigated only by the 10/hour/IP limit. Switching to an "email me either way" flow is possible.
3. **Lockout can be abused to lock out a victim** for 15 minutes (5 bad attempts on their email). Accepted trade-off; per-IP limits slow it down.
4. **Possible timing difference on "forgot password"** once a real email provider is wired in (sending takes longer than not sending). Not measurable with today's transports — re-check when a provider is chosen; the usual fix is to send asynchronously via the outbox.
5. **No 2FA, no session idle timeout/rotation, no CAPTCHA.**
6. **DNS rebinding / resolves-to-private-IP** for feed hosts (see #3).
7. GitHub Actions are referenced by version tag, not commit SHA; secret scanning / Dependabot are not configured; the repository is **public**.
8. `npm audit`: 5 high findings remain in dev-only lint tooling (`braces` chain), no patched release existed when checked (see `known-gaps.md`).
9. HSTS is sent without `preload` deliberately; add it only once you are committed to HTTPS on the whole domain.

## Not reviewed
Hosting/infrastructure configuration, DNS/TLS, database roles and network exposure in production, backups, the email/AdSense/AI providers' own settings, third-party dependency internals, and anything not in this repository. Re-run a review after wiring real providers and deploying.

## Operational settings that matter for security
| Setting | Purpose |
|---|---|
| `TRUSTED_PROXY_HOPS` | Number of trusted proxies in front of the app (default 1). Wrong value = rate limits keyed on the wrong address. |
| `CRON_SECRET` (≥16 chars) | Protects `/api/cron/*`; endpoint is disabled when unset/short. |
| `SCRYPT_LOG_N` | **Tests only.** Leave unset in production (default 17). |
| `ADSENSE_CLIENT` | Also widens the CSP for Google ad domains when set. |
| `NODE_ENV=production` | Enables `Secure` cookies, HSTS, and the stricter CSP (no `unsafe-eval`). |
