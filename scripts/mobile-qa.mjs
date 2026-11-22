// Mobile QA: loads a chat page on phone-sized devices (WebKit = iPhone, Chromium = Android),
// then reports page overflow, tiny tap targets, inputs that make iOS zoom, covered controls,
// and whether typing works. Usage: node scripts/mobile-qa.mjs [url] [outdir]
import { chromium, webkit, devices } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] || "https://chat.flisk.si/";
const out = process.argv[3] || "mobile-shots";
mkdirSync(out, { recursive: true });

const targets = [
  { name: "iPhone SE", engine: webkit, dev: devices["iPhone SE"] },
  { name: "iPhone 13", engine: webkit, dev: devices["iPhone 13"] },
  { name: "Pixel 7", engine: chromium, dev: devices["Pixel 7"] },
];

const inPage = () => {
  const vw = innerWidth;
  const res = { overflowX: document.documentElement.scrollWidth - vw, tiny: [], zoom: [], offscreen: [], overlapped: [] };
  const els = [...document.querySelectorAll("button, a[href], [role=button], input, textarea, select, [contenteditable=true]")];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const label = (el.getAttribute("aria-label") || el.innerText || el.placeholder || el.id || el.tagName).trim().slice(0, 30);
    const tag = el.tagName.toLowerCase();
    const isText = tag === "input" || tag === "textarea" || el.isContentEditable;
    if (isText && parseFloat(cs.fontSize) < 16) res.zoom.push(`${tag} "${label}" ${cs.fontSize}`);
    if (tag !== "a" || !el.closest("p,li")) if (r.width < 40 || r.height < 40) res.tiny.push(`${tag} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.right > vw + 1 || r.left < -1) res.offscreen.push(`${tag} "${label}" l=${Math.round(r.left)} r=${Math.round(r.right)}`);
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = r.top + r.height / 2;
    if (cy >= 0 && cy < innerHeight) {
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) res.overlapped.push(`${tag} "${label}" covered by ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 30)}`);
    }
  }
  return res;
};

let bad = 0;
for (const t of targets) {
  const browser = await t.engine.launch();
  const ctx = await browser.newContext({ ...t.dev });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1500);
  const tag = t.name.replace(/\s/g, "-");
  await page.screenshot({ path: `${out}/${tag}-1-load.png` });
  const report = await page.evaluate(inPage);
  // typing
  let typing = "no composer found";
  const box = page.locator("textarea, input[type=text], input:not([type]), [contenteditable=true]").first();
  if (await box.count()) {
    await box.tap().catch(() => {});
    await page.keyboard.type("Make me a landing page for a bakery", { delay: 15 });
    const val = await box.evaluate((e) => ("value" in e ? e.value : e.innerText));
    const rect = await box.boundingBox();
    typing = val === "Make me a landing page for a bakery" ? "ok" : `WRONG: "${val}"`;
    typing += ` | box ${Math.round(rect?.width || 0)}x${Math.round(rect?.height || 0)} at y=${Math.round(rect?.y || 0)}`;
    await page.screenshot({ path: `${out}/${tag}-2-typed.png` });
  }
  console.log(`\n=== ${t.name} (${t.dev.viewport.width}x${t.dev.viewport.height}) ===`);
  console.log("overflowX:", report.overflowX, "| typing:", typing);
  for (const k of ["tiny", "zoom", "offscreen", "overlapped"]) if (report[k].length) { console.log(k + ":"); report[k].forEach((x) => console.log("  -", x)); }
  if (errors.length) { console.log("errors:"); errors.slice(0, 5).forEach((x) => console.log("  -", x)); }
  if (report.overflowX > 0 || report.offscreen.length || report.zoom.length || report.overlapped.length || !typing.startsWith("ok")) bad++;
  await browser.close();
}

// New home page top bar (#358): at 320, 360 and 375 px every button sits inside the screen with an 8px gutter.
// The row clips what overflows, so the page never scrolls sideways and only the button edges show it.
{
  const barBrowser = await chromium.launch();
  for (const width of [320, 360, 375]) {
    const ctx = await barBrowser.newContext({ ...devices["Pixel 7"], viewport: { width, height: 760 } });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(1000);
    const off = await page.evaluate(() => [...document.querySelectorAll(".chat-head button, .chat-head a")].map((e) => {
      const r = e.getBoundingClientRect();
      return { label: (e.getAttribute("aria-label") || e.innerText).trim().slice(0, 30), left: Math.round(r.left), right: Math.round(r.right), w: r.width };
    }).filter((b) => b.w && (b.right > innerWidth - 8 || b.left < 8)));
    console.log(`${off.length ? "FAIL" : "ok  "} top bar ${width}px${off.length ? " - " + off.map((b) => `"${b.label}" ${b.left}-${b.right}`).join("; ") : ""}`);
    if (off.length) bad++;
    await ctx.close();
  }
  await barBrowser.close();
}

// Phone "+" sheet and model picker, every look at 320/360/390: no sideways scroll, Settings collapsed,
// 44px rows, picker opens as one full-width column.
const looks = ["classic", "ivory", "glow", "focus", "voice", "earth"];
const origin = new URL(url).origin;
const sheetBrowser = await chromium.launch();
for (const width of [320, 360, 390]) for (const look of looks) {
  const ctx = await sheetBrowser.newContext({ ...devices["Pixel 7"], viewport: { width, height: 760 } });
  await ctx.addCookies([{ name: "chat_theme", value: look, url: origin }]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(1000);
  const probs = [];
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if ((await over()) > 0) probs.push("home overflows");
  await page.locator("#plus").tap().catch(() => probs.push("no + button"));
  await page.waitForTimeout(350);
  const sheet = await page.evaluate(() => {
    const more = document.querySelector(".plusmenu .more");
    const rows = [...document.querySelectorAll(".plusmenu summary, .plusmenu .cats > *")].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
    return { more: !!more, open: !!more?.open, minRow: Math.min(...rows, 999), over: document.documentElement.scrollWidth - innerWidth };
  });
  if (!sheet.more) probs.push("no Settings group");
  if (sheet.open) probs.push("Settings open by default");
  if (sheet.minRow < 44) probs.push(`sheet row ${sheet.minRow}px`);
  if (sheet.over > 0) probs.push("sheet overflows");
  await page.locator(".more > summary").tap().catch(() => {});
  await page.locator("#mpbtn:visible").first().tap().catch(() => probs.push("no model button"));
  await page.waitForTimeout(500);
  const pick = await page.evaluate(() => {
    const pop = document.querySelector("#mppop"), r = pop.getBoundingClientRect();
    const rows = [...pop.querySelectorAll(".mi")].filter((e) => e.offsetParent);
    const xs = new Set(rows.map((e) => Math.round(e.getBoundingClientRect().left)));
    return { shown: !pop.hidden && r.width > 0, w: Math.round(r.width), vw: innerWidth, cols: xs.size, rows: rows.length, tiny: rows.filter((e) => e.getBoundingClientRect().height < 44).length, over: document.documentElement.scrollWidth - innerWidth };
  });
  if (!pick.shown) probs.push("picker did not open");
  else {
    if (pick.w < pick.vw - 2) probs.push(`picker ${pick.w}px of ${pick.vw}`);
    if (pick.cols > 1) probs.push("picker has several columns");
    if (!pick.rows) probs.push("picker has no rows");
    if (pick.tiny) probs.push(`${pick.tiny} picker rows under 44px`);
    if (pick.over > 0) probs.push("picker overflows");
  }
  console.log(`${probs.length ? "FAIL" : "ok  "} sheet ${look} ${width}px${probs.length ? " - " + probs.join("; ") : ""}`);
  if (probs.length) bad++;
  await ctx.close();
}
await sheetBrowser.close();
console.log(bad ? `\n${bad} device(s) with problems` : "\nall clean");
process.exit(bad ? 1 : 0);
