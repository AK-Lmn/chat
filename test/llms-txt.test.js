import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';

const get = (path) => handle(new Request(`https://chat.flisk.si${path}`), {}, {});

test('GET /llms.txt returns 200 with text/plain content-type', async () => {
  const res = await get('/llms.txt');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
});

test('it provides a summary and key links', async () => {
  const res = await get('/llms.txt');
  const text = await res.text();
  expect(text).toContain('# Flisk Chat');
  expect(text).toContain('https://chat.flisk.si/');
  expect(text).toContain('https://github.com/flisk-sh/chat');
  expect(text).toContain('https://flisk.sh/');
});
