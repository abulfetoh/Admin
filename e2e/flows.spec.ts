import { expect, test } from "@playwright/test";

const pw = "correct-horse-battery";
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test("typo search shows similar results; Arabic page is RTL with hreflang", async ({ page }) => {
  await page.goto("/?q=acountant");
  await expect(page.getByText("Senior Accountant")).toBeVisible();
  await expect(page.getByText(/showing similar results/i)).toBeVisible();
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.goto("/jobs/1/software-engineer");
  await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute("href", /\/ar\/jobs\/1\/software-engineer$/);
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(ld!)["@type"]).toBe("JobPosting");
});

test("role guards: anonymous and candidate cannot reach admin/employer", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/register");
  await page.getByLabel("Name").fill("Cand");
  await page.getByLabel("Email").fill(`cand${uniq()}@example.com`);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/admin/);
  await page.goto("/employer");
  await expect(page).not.toHaveURL(/employer/);
});

test("candidate saves a profile and an alert", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Cand Two");
  await page.getByLabel("Email").fill(`cand${uniq()}@example.com`);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Headline").fill("Data person");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.goto("/account/alerts");
  await page.getByLabel("Keywords").fill("engineer");
  await page.getByRole("button", { name: "Save alert" }).click();
  await expect(page.getByText("engineer")).toBeVisible();
});

test("employer posts a job that becomes searchable and can close it", async ({ page }) => {
  const title = `Playwright Wrangler ${uniq()}`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("Emp");
  await page.getByLabel("I am a").selectOption("employer");
  await page.getByLabel("Email").fill(`emp${uniq()}@example.com`);
  await page.getByLabel("Password").fill(pw);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/employer$/);
  await page.getByLabel("Company name").fill("E2E Corp");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("We need someone who can wrangle browsers all day long.");
  await page.getByLabel("Apply URL").fill("https://example.com/apply");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto(`/?q=${encodeURIComponent("Wrangler")}`);
  await expect(page.getByText(title)).toBeVisible();
  await page.goto("/employer");
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.goto(`/?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title)).toHaveCount(0);
});

test("bad login shows one generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("whatever-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Invalid email or password");
});

test("no ads or analytics before consent; analytics only after accepting", async ({ page, context }) => {
  const hits: string[] = [];
  page.on("request", (r) => hits.push(r.url()));
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  expect(hits.some((u) => u.includes("/api/collect") || u.includes("googlesyndication"))).toBe(false);
  await page.getByRole("button", { name: "Reject" }).click();
  await page.goto("/jobs/1/software-engineer");
  await page.waitForTimeout(500);
  expect(hits.some((u) => u.includes("/api/collect"))).toBe(false);
  await context.clearCookies();
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => hits.some((u) => u.includes("/api/collect"))).toBe(true);
});
