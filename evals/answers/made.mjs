// The checks a person does by eye on something chat made (a picture, a page): does the picture show, does the answer
// say it made one when it did not, did it add sources nobody asked for. No model: each finding names what is wrong.
//
//   node evals/answers/made.mjs https://chat.flisk.si/s/<id>     checks a published page, exit 1 when a picture is broken
import { localImages } from '../../src/loop.js';

const IMG = /<img\b[^>]*>/gi;
const CLAIMS = /\b(generated|created|made|drew|here is|here's)\b[^.\n]{0,60}\b(image|photo|picture|illustration)\b|\b(image|photo|picture)\b[^.\n]{0,40}\b(generated|saved|ready|is live)\b/i;
const WANTS_PICTURE = /\b(photo|picture|image|pic|drawing|illustration|logo|selfie|portrait|draw|paint|sketch)\b/i;

// made: { q, answer, page? (the HTML of the published page) }. Returns findings: [] is a pass.
export function judgeMade({ q = '', answer = '', page = null }) {
  const findings = [];
  const text = String(answer);
  if (/pollinations|image\.pollinations|picsum\.photos|source\.unsplash/i.test(`${text}\n${page ?? ''}`)) findings.push('outside-image-site: the picture came from an image website chat cannot control, and one returned a person for a cat');
  if (/\b(real|actual)\s+(image|photo|picture)\b/i.test(text) && /\b(haven'?t|have not|not)\s+(looked|seen)/i.test(text)) findings.push('unseen-claim: the answer vouches for a picture it says it has not looked at');
  if (/^Sources: \[/m.test(text)) findings.push('stray-sources: a request to make something ends with a line of looked-up sources');
  if (page != null) {
    const broken = localImages(page);
    if (broken.length) findings.push(`broken-picture: the page shows ${broken.map((s) => s || '(no src)').join(', ')}, which is not in the page and not on the web`);
    const shown = (String(page).match(IMG) || []).length - broken.length;
    if (WANTS_PICTURE.test(q) && shown < 1) findings.push('no-picture: a picture was asked for and the page shows none that loads');
    if (CLAIMS.test(text) && shown < 1) findings.push('false-claim: the answer says a picture was made, and the page shows none');
  } else if (WANTS_PICTURE.test(q) && CLAIMS.test(text) && !/!\[[^\]]*\]\(https?:\/\/|https?:\/\/\S+/.test(text)) {
    findings.push('false-claim: the answer says a picture was made and gives no link to it');
  }
  return findings;
}

// A picture on the web has to answer as a picture too.
export async function deadImages(page, fetchImpl = fetch) {
  const dead = [];
  for (const tag of String(page).match(IMG) || []) {
    const src = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find((v) => v != null) || '';
    if (!/^https?:\/\//i.test(src)) continue;
    const r = await fetchImpl(src, { redirect: 'follow' }).catch(() => null);
    if (!r?.ok || !/^image\//i.test(r.headers.get('content-type') || '')) dead.push(src);
  }
  return dead;
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2]) {
  const url = process.argv[2];
  const r = await fetch(url);
  if (!r.ok) { console.error(`${url}: HTTP ${r.status}`); process.exit(1); }
  const page = await r.text();
  const findings = judgeMade({ q: process.argv[3] || 'a picture', page });
  const dead = await deadImages(page);
  if (dead.length) findings.push(`dead-picture: ${dead.join(', ')} did not answer as a picture`);
  console.log(findings.length ? findings.map((f) => `FAIL ${f}`).join('\n') : `PASS ${url}: every picture on the page loads`);
  process.exit(findings.length ? 1 : 0);
}
