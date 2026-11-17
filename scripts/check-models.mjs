// Fails when a Workers AI model we use is named in a Cloudflare deprecation notice.
// Reads the public changelog, so it needs no key. Run weekly by .github/workflows/model-health.yml.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CHANGELOG = 'https://developers.cloudflare.com/workers-ai/changelog/index.md';

// Every "## date" section of the changelog that talks about deprecation or retirement.
export function deprecationSections(md) {
  return md
    .split(/^## /m)
    .slice(1)
    .filter((s) => /deprecat|retir/i.test(s))
    .map((s) => ({ date: s.split('\n', 1)[0].trim(), text: s }));
}

// Models from `used` that a deprecation section names.
export function flagged(used, md) {
  const out = [];
  for (const id of used) {
    for (const s of deprecationSections(md)) {
      if (s.text.includes(id)) out.push({ id, date: s.date });
    }
  }
  return out;
}

export function modelsUsed(dir) {
  const ids = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else for (const m of readFileSync(p, 'utf8').matchAll(/@(?:cf|hf)\/[a-z0-9./_-]+/gi)) ids.add(m[0].replace(/[.,]+$/, ''));
    }
  };
  walk(dir);
  return [...ids];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const used = modelsUsed(root);
  const md = await (await fetch(CHANGELOG)).text();
  if (!md.includes('##')) { console.error('Could not read the Cloudflare changelog'); process.exit(2); }
  const bad = flagged(used, md);
  console.log(`Checked ${used.length} models: ${used.join(', ')}`);
  for (const b of bad) console.error(`${b.id} is named in the deprecation notice of ${b.date}`);
  process.exit(bad.length ? 1 : 0);
}
