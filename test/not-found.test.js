import { expect, test } from 'bun:test';
import worker from '../src/index.js';

const ORIGIN = 'https://chat.flisk.si';
const get = (path) => worker.fetch(new Request(`${ORIGIN}${path}`), { SESSION_SECRET: 'x'.repeat(32) });

test('GET on unknown path returns 404 with lightweight body under 4 KB', async () => {
  const res = await get('/nope-xyz-404');
  expect(res.status).toBe(404);
  expect(res.headers.get('content-type')).toContain('text/html');

  const html = await res.text();
  expect(html.length).toBeLessThan(4096);
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).toContain('href="/"');
  expect(html).toContain('Back to chat');
  expect(html).not.toContain('data:image/');
});
