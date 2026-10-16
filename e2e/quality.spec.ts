import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/ar", "/?q=engineer", "/login", "/register", "/jobs/1/software-engineer", "/country/egypt"];

for (const path of pages) {
  test(`a11y: no serious/critical axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole("button", { name: /Reject|رفض/ }).click({ timeout: 2000 }).catch(() => {});
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });
}

test("perf budget: home HTML and JS stay small and fast", async ({ page }) => {
  let js = 0;
  page.on("response", async (r) => {
    if (r.url().endsWith(".js")) js += (await r.body().catch(() => Buffer.alloc(0))).length;
  });
  const t0 = Date.now();
  const res = await page.goto("/", { waitUntil: "networkidle" });
  const html = (await res!.body()).length;
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(html).toBeLessThan(60_000);
  expect(js).toBeLessThan(400_000); // uncompressed; current ~110 kB gzip-equivalent first load
});
