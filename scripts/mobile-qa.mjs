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
console.log(bad ? `\n${bad} device(s) with problems` : "\nall clean");
process.exit(bad ? 1 : 0);
