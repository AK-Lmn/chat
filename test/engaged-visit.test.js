import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {markEngaged} from '../web/src/engaged.js';

const app = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');

test('the first task of a visit sends one /ask pageview to Flisk Analytics, and nothing else', () => {
  const sent = [];
  const send = (u, b) => { sent.push([u, JSON.parse(b)]); return true; };
  expect(markEngaged(send, 'chat.flisk.si')).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toBe('https://analytics.flisk.si/e');
  expect(sent[0][1]).toMatchObject({d: 'chat.flisk.si', p: '/ask', r: '', u: '', t: ''});
  // A second task in the same visit adds nothing: still one extra pageview, so the visit is two, not many.
  expect(markEngaged(send, 'chat.flisk.si')).toBe(false);
  expect(sent).toHaveLength(1);
});

test('no beacon on other hosts or without sendBeacon, and a throwing beacon never stops a task', () => {
  expect(markEngaged(() => true, 'localhost')).toBe(false);
  expect(markEngaged(null, 'chat.flisk.si')).toBe(false);
  expect(markEngaged(() => { throw new Error('blocked'); }, 'chat.flisk.si')).toBe(false);
});

test('run() reports the engaged visit before anything slow, and the payload holds no task text', () => {
  expect(app).toMatch(/if \(busy\) return;\n\s+markEngaged\(\);\n\s+await vaultReady;/);
  const fn = readFileSync(new URL('../web/src/engaged.js', import.meta.url), 'utf8').match(/export function markEngaged[\s\S]*?\n}\n/)[0];
  expect(fn).not.toMatch(/task|prompt|text/i);
});
