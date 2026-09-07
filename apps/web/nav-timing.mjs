import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3001";
const LABEL = process.env.LABEL || "run";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Sign up / sign in
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Fill email — check if there's an email input
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (emailInput) {
    await emailInput.fill("test@example.com");
    // Look for password
    const pwInput = await page.$('input[type="password"], input[name="password"]');
    if (pwInput) {
      await pwInput.fill("testpassword123");
    }
    // Click submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    await page.waitForTimeout(2000);
  }

  // 2. Try navigating to dashboard
  await page.goto(`${BASE}/dashboard/inbox`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const url = page.url();
  if (url.includes("/login") || url.includes("/welcome")) {
    console.log(`[${LABEL}] Cannot access dashboard (redirected to ${url}). Measuring public board navigations.`);

    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Measure: board → roadmap → changelog → board
    const timings = [];

    // Board → Roadmap
    const roadmapLink = await page.$('a[href="/roadmap"]');
    if (roadmapLink) {
      const start = performance.now();
      await roadmapLink.click();
      await page.waitForURL("**/roadmap**", { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Board → Roadmap", ms: elapsed });
    }

    // Roadmap → Changelog
    const changelogLink = await page.$('a[href="/changelog"]');
    if (changelogLink) {
      const start = performance.now();
      await changelogLink.click();
      await page.waitForURL("**/changelog**", { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Roadmap → Changelog", ms: elapsed });
    }

    // Changelog → Board
    const boardLink = await page.$('a[href="/"]');
    if (boardLink) {
      const start = performance.now();
      await boardLink.click();
      await page.waitForURL(/^[^?]*\/$|^[^?]*(?<!\/)$/, { timeout: 10000 });
      await page.waitForTimeout(100);
      const elapsed = Math.round(performance.now() - start);
      timings.push({ label: "Changelog → Board", ms: elapsed });
    }

    for (const t of timings) console.log(`[${LABEL}] ${t.label}: ${t.ms}ms`);
    await browser.close();
    return;
  }

  // We're on the dashboard — measure sidebar navigations
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
    const link = await page.$('a[href="/dashboard/inbox"]');
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
  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
