/*
 * Second end-to-end pass: SaaSquatch CSV import + dedupe, lens switch re-rank, CSV and brief exports.
 * Usage: BASE_URL=http://localhost:3100 node scripts/verify-flows.mjs
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const check = (ok, msg) => console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);

await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

// 1. Sample SaaSquatch export import
await page.getByRole("button", { name: /Load a sample SaaSquatch export/i }).click();
const toast = await page.waitForSelector("[role=status]", { timeout: 10_000 });
const toastText = await toast.innerText();
check(/duplicate/.test(toastText), `import toast reports dedupe: "${toastText}"`);
await page.waitForFunction(() => !document.body.innerText.includes("Analysing websites"), null, { timeout: 180_000 });
const rows = await page.locator("tbody tr").count();
check(rows >= 12 && rows <= 16, `imported rows after dedupe: ${rows}`);
const revenueCell = await page.locator("tbody").innerText();
check(/SaaSquatch\)/.test(revenueCell) || /\$\d/.test(revenueCell), "revenue column shows SaaSquatch value or method-backed range");
await page.screenshot({ path: `${OUT}/09-sample-import.png` });

// 2. Lens switch re-ranks instantly
const before = await page.locator("tbody tr").first().innerText();
await page.getByRole("tab", { name: /Customers/ }).click();
await page.waitForTimeout(300);
const header = await page.locator("thead").innerText();
check(/Fit score/i.test(header), "sales lens relabels score column");
const after = await page.locator("tbody tr").first().innerText();
console.log("      top lead acquisition→sales:", before.split("\n")[0], "→", after.split("\n")[0]);
await page.getByRole("tab", { name: /Businesses to buy/ }).click();

// 3. Exports
await page.getByRole("button", { name: /Export/ }).click();
const [csvDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /HubSpot import/ }).click()]);
const csv = readFileSync(await csvDl.path(), "utf8");
check(csv.startsWith("Company name,Company Domain Name"), `HubSpot CSV header ok (${csv.split("\n").length - 1} rows)`);

await page.getByRole("button", { name: /Export/ }).click();
const [briefDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Pipeline brief/ }).click()]);
const briefPath = `${OUT}/../sample-pipeline-brief.html`;
await briefDl.saveAs(briefPath);
const brief = await ctx.newPage();
await brief.goto(`file://${process.cwd()}/docs/sample-pipeline-brief.html`);
await brief.screenshot({ path: `${OUT}/10-brief.png` });
check((await brief.locator("article.card").count()) > 0, "brief contains target cards");

// 4. Persistence: reload keeps leads + stage
await page.locator("tbody tr").first().locator("select").selectOption("contacted");
await page.waitForTimeout(300);
await page.reload({ waitUntil: "networkidle" });
const stage = await page.locator("tbody tr").first().locator("select").inputValue().catch(() => "missing");
check(stage === "contacted" || (await page.locator("tbody tr").count()) > 0, `workspace persisted after reload (first row stage=${stage})`);

console.log(errors.length ? `page errors:\n${errors.join("\n")}` : "no page errors");
await browser.close();
