import { expect, test, type Page } from "@playwright/test";

const ipN = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders({ "x-forwarded-for": ipN() })); // own rate-limit bucket per test

test("page responses carry the security headers and a strict, per-request-nonce CSP", async ({ request }) => {
  const [a, b] = await Promise.all([request.get("/"), request.get("/")]);
  const h = a.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
  const csp = h["content-security-policy"];
  const script = csp.split(";").map((x) => x.trim()).find((x) => x.startsWith("script-src"))!;
  expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'"]) expect(csp).toContain(d);
  const nonce = (c: string) => c.match(/'nonce-([^']+)'/)![1];
  expect(nonce(b.headers()["content-security-policy"])).not.toBe(nonce(csp)); // fresh nonce each request
  // Arabic (rewritten) route and a 404 are covered too
  expect((await request.get("/ar")).headers()["content-security-policy"]).toContain("script-src");
  expect((await request.get("/definitely-not-a-page")).headers()["content-security-policy"]).toContain("script-src");
});

test("a client-supplied x-nonce / x-locale / CSP header cannot influence the response", async ({ request }) => {
  const r = await request.get("/", { headers: { "x-nonce": "attacker", "x-locale": "ar", "content-security-policy": "default-src *" } });
  const body = await r.text();
  expect(body).not.toContain("attacker");
  expect(body).toContain('<html lang="en"'); // x-locale forgery ignored
  expect(r.headers()["content-security-policy"]).not.toContain("default-src *");
});

async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} <- ${e.blockedURI}`));
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) errors.push(m.text()); });
  return {
    async check(label: string) {
      const v = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      expect([...v, ...errors], `CSP violations/errors on ${label}`).toEqual([]);
    },
  };
}

test("no CSP violations or script errors across public pages, auth, and logged-in pages (hydration + server actions work)", async ({ page }) => {
  const w = await watchCsp(page);
  for (const p of ["/", "/ar", "/?q=engineer", "/jobs/1/software-engineer", "/country/egypt", "/login", "/register", "/forgot"]) {
    await page.goto(p);
    await page.getByRole("button", { name: /Reject|رفض/ }).click({ timeout: 1500 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await w.check(p);
  }
  // interactive journey: hydration-dependent forms, server actions, redirects, language switch
  await page.goto("/register");
  await page.getByLabel("Name").fill("Csp Tester");
  await page.getByLabel("Email").fill(`csp${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByLabel("Headline").fill("CSP");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await w.check("/account after save");
  await page.goto("/account/alerts");
  await w.check("/account/alerts");
  await page.goto("/account/delete");
  await w.check("/account/delete");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await w.check("after logout");
});

test("accepting consent (analytics beacon) causes no CSP violation", async ({ page }) => {
  const w = await watchCsp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.waitForTimeout(600);
  await w.check("/ after accepting consent");
});

test("the analytics endpoint is rate limited and size capped even with a self-issued consent cookie", async ({ request }) => {
  const ip = "203.0.113.77";
  const headers = { "x-forwarded-for": ip, cookie: `consent=${encodeURIComponent('{"analytics":true,"ads":false}')}`, "content-type": "application/json" };
  const big = await request.post("/api/collect", { headers, data: JSON.stringify({ path: "/" + "a".repeat(4000), locale: "en" }) });
  expect(big.status()).toBe(413);
  const statuses: number[] = [];
  for (let i = 0; i < 130; i++) statuses.push((await request.post("/api/collect", { headers, data: { path: "/", locale: "en" } })).status());
  expect(statuses.filter((s) => s === 204).length).toBeLessThanOrEqual(120);
  expect(statuses).toContain(429);
  // a different client is unaffected
  const other = await request.post("/api/collect", { headers: { ...headers, "x-forwarded-for": "203.0.113.78" }, data: { path: "/", locale: "en" } });
  expect(other.status()).toBe(204);
});

test("rate-limit keys cannot be dodged by spoofing the left side of X-Forwarded-For", async ({ request }) => {
  const cookie = `consent=${encodeURIComponent('{"analytics":true,"ads":false}')}`;
  const real = "203.0.113.90"; // what our (test) proxy "saw": the rightmost entry
  const codes: number[] = [];
  for (let i = 0; i < 130; i++) codes.push((await request.post("/api/collect", { headers: { "x-forwarded-for": `10.${i}.0.1, ${real}`, cookie, "content-type": "application/json" }, data: { path: "/", locale: "en" } })).status());
  expect(codes).toContain(429); // varying the spoofed prefix did not reset the bucket
});

test("CSP actually blocks injected HTML/JS (simulated stored XSS) and the violation detector sees it", async ({ page }) => {
  // Model a real XSS: attacker-controlled markup ends up in the server's HTML. We rewrite the genuine response
  // (keeping its real CSP header) to include a nonce-less inline <script>, an inline event handler and a javascript: link.
  await page.route("**/", async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(
      "</body>",
      `<script>window.__pwned1 = true</script><img src="x" onerror="window.__pwned2 = true"><a id="jsl" href="javascript:window.__pwned3 = true">x</a></body>`,
    );
    await route.fulfill({ response: res, body });
  });
  const w = await watchCsp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.locator("#jsl").click().catch(() => {});
  await page.waitForTimeout(300);
  const ran = await page.evaluate(() => { const x = window as unknown as Record<string, unknown>; return { inline: x.__pwned1 === true, handler: x.__pwned2 === true, jsUrl: x.__pwned3 === true }; });
  expect(ran).toEqual({ inline: false, handler: false, jsUrl: false });
  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations.length).toBeGreaterThan(0); // the detector used by the other tests can fail
  await expect(w.check("(expected violations)")).rejects.toThrow();
});
