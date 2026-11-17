// Joins images side by side into one filmstrip PNG. Usage: node scripts/montage.mjs out.png a.png b.png ...
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [out, ...files] = process.argv.slice(2);
const html = `<body style="margin:0;display:flex;gap:6px;background:#888">${files.map((f) => `<img style="height:760px" src="data:image/png;base64,${readFileSync(f).toString("base64")}">`).join("")}</body>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400 * files.length, height: 760 } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
