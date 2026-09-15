/*
 * Drives the real app in Chrome and saves screenshots of every key screen to docs/screenshots.
 * Usage: BASE_URL=http://localhost:3100 node scripts/screenshots.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: process.env.SCHEME ?? "light" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log("saved", name);
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await shot("01-empty");

await page.getByRole("button", { name: /HVAC companies in Austin/i }).click();
await page.waitForSelector("tbody tr", { timeout: 60_000 });
await page.waitForTimeout(1500);
await shot("02-streaming");
// Wait for enrichment to finish (activity bar disappears).
await page.waitForFunction(() => !document.body.innerText.includes("Analysing websites"), null, { timeout: 180_000 });
await page.waitForTimeout(800);
await shot("03-ranked");

await page.getByRole("button", { name: /Buy box/ }).click();
await page.waitForSelector("[role=dialog]");
await shot("11-buybox");
await page.getByRole("button", { name: "Close panel" }).click();

await page.getByRole("button", { name: /Import CSV/ }).click();
await page.waitForSelector("[role=dialog]");
await shot("12-import");
await page.getByRole("button", { name: "Close dialog" }).click();

await page.locator("tbody tr").first().click();
await page.waitForSelector("aside[aria-label]");
await shot("04-drawer-why");

await page.getByRole("tab", { name: "Contacts & data" }).click();
await shot("05-drawer-contacts");

await page.getByRole("tab", { name: "Outreach" }).click();
await page.getByRole("button", { name: /^Generate$/ }).click();
await page.waitForSelector("text=Why now:", { timeout: 90_000 });
await shot("06-drawer-outreach");

await page.getByRole("button", { name: "Close" }).click();
await page.getByRole("tab", { name: /Pipeline/ }).click();
await shot("07-pipeline");

await page.setViewportSize({ width: 400, height: 860 });
await page.getByRole("tab", { name: /Ranked/ }).click();
await shot("08-mobile", { fullPage: false });

console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
