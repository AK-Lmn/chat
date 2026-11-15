import { expect, test } from 'bun:test';
import { OG_PNG } from '../src/og.js';
import { appPage } from '../src/page.js';

test('the landing page has a large social card so X and Slack show an image, not a placeholder', () => {
  const html = appPage({ login: '', anon: true, connected: [] });
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(html).toContain('property="og:image" content="https://chat.flisk.si/og.png');
  expect(html).toContain('name="twitter:image" content="https://chat.flisk.si/og.png');
});

test('the social card is a 1200x630 PNG', () => {
  expect([...OG_PNG.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(OG_PNG.buffer, OG_PNG.byteOffset);
  expect(dv.getUint32(16)).toBe(1200);
  expect(dv.getUint32(20)).toBe(630);
});
