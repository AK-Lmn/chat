// Filmstrip of the phone "+" sheet and model picker per look. Usage: node scripts/sheet-shots.mjs <url> <outdir> [widths] [looks]
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
const [url = "http://localhost:8799/", out = "sheet-shots", w = "390", looks = "classic,ivory,glow,focus,voice,earth"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const width of w.split(",").map(Number)) for (const look of looks.split(",")) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], viewport: { width, height: 760 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "chat_theme", value: look, url }]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${look}-${width}-1-home.png` });
  await page.locator("#plus").tap(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${look}-${width}-2-sheet.png` });
  const more = page.locator(".more > summary");
  if (await more.count()) await more.tap(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${look}-${width}-3-settings.png` });
  const mp = page.locator("#mpbtn:visible").first();
  if (await mp.count()) { await mp.tap(); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${look}-${width}-4-models.png` }); }
  await ctx.close();
}
await browser.close();
