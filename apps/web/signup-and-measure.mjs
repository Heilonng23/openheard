import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3001";
const LABEL = process.env.LABEL || "run";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Sign up
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Click "Create an account"
  await page.click('text=Create an account').catch(() => {});
  await page.waitForTimeout(500);

  // Fill by placeholder
  await page.fill('input[placeholder*="name" i]', "Test Admin").catch(() => {});
  await page.fill('input[placeholder*="email" i], input[type="email"]', "admin@test.com").catch(() => {});
  await page.fill('input[type="password"]', "Testpassword123!").catch(() => {});

  await page.screenshot({ path: `/tmp/nav-timing-${LABEL}-02-filled.png` });

  // Submit
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);

  console.log(`After signup, URL: ${page.url()}`);
  await page.screenshot({ path: `/tmp/nav-timing-${LABEL}-03-after.png` });

  // If we ended up on welcome, skip it
  if (page.url().includes("/welcome")) {
    await page.goto(`${BASE}/dashboard/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
  }

  // If still on login, try signing in
  if (page.url().includes("/login")) {
    await page.fill('input[type="email"], input[placeholder*="email" i]', "admin@test.com").catch(() => {});
    await page.fill('input[type="password"]', "Testpassword123!").catch(() => {});
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    console.log(`After signin, URL: ${page.url()}`);
  }

  // Navigate to dashboard
  if (!page.url().includes("/dashboard")) {
    await page.goto(`${BASE}/dashboard/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
  }

  console.log(`Final URL: ${page.url()}`);
  await page.screenshot({ path: `/tmp/nav-timing-${LABEL}-04-final.png` });

  if (!page.url().includes("/dashboard")) {
    console.log(`[${LABEL}] Cannot reach dashboard.`);
    await browser.close();
    return;
  }

  // Measure dashboard sidebar navigations
  console.log(`[${LABEL}] On dashboard. Measuring sidebar navigations.`);
  await page.waitForTimeout(1000);
  const timings = [];

  // Inbox → Roadmap
  {
    const link = await page.$('a[href*="/dashboard/roadmap"]');
    if (link) {
      const start = performance.now();
      await link.click();
      await page.waitForURL("**/dashboard/roadmap**", { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Inbox → Roadmap", ms: elapsed });
    }
  }

  // Roadmap → Changelog
  {
    const link = await page.$('a[href*="/dashboard/changelog"]');
    if (link) {
      const start = performance.now();
      await link.click();
      await page.waitForURL("**/dashboard/changelog**", { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Roadmap → Changelog", ms: elapsed });
    }
  }

  // Changelog → Inbox
  {
    const links = await page.$$('a[href="/dashboard/inbox"]');
    const link = links[0];
    if (link) {
      const start = performance.now();
      await link.click();
      await page.waitForURL("**/dashboard/inbox**", { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Changelog → Inbox", ms: elapsed });
    }
  }

  for (const t of timings) console.log(`[${LABEL}] ${t.label}: ${t.ms}ms`);

  // Save cookies for reuse
  const cookies = await context.cookies();
  const fs = await import("fs");
  fs.writeFileSync("/tmp/nav-timing-cookies.json", JSON.stringify(cookies));

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
