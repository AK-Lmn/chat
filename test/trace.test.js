import { afterAll, beforeEach, expect, test } from 'bun:test';
import { modelFrom, OPENROUTER_URL, resetFallbacks } from '../src/model.js';
import { runEvents, sendTrace } from '../src/trace.js';

const WOLF = 'https://inf.test/v1/chat/completions';
const msgs = [{ role: 'user', content: 'hi' }];
const ok = (t) => Response.json({ choices: [{ message: { content: t } }] });
const limited = () => Response.json({ error: { message: 'rate limited', code: 429 } }, { status: 429 });
function world({ wolf = () => ok('wolf here'), ai = 'workers answer' } = {}) {
  const fetchImpl = async (u) => {
    u = String(u);
    if (u === WOLF) return wolf();
    if (u.endsWith('/api/v1/models')) return Response.json({ data: [] });
    if (u === OPENROUTER_URL) return limited();
    return new Response('?', { status: 404 });
  };
  return { fetchImpl, env: { INFERENCE_KEY: 'ik', INFERENCE_URL: WOLF, NO_POLLINATIONS: '1', AI: { run: async () => ({ response: ai }) } } };
}
beforeEach(() => resetFallbacks());
afterAll(() => resetFallbacks());

test('Wolf answering sends nothing', async () => {
  const { env, fetchImpl } = world();
  const seen = [];
  await modelFrom(env, fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) })(msgs);
  expect(seen).toEqual([]);
});

test('another model answering is one rerouted row with the reason', async () => {
  const { env, fetchImpl } = world({ wolf: limited });
  const seen = [];
  const r = await modelFrom(env, fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) })(msgs);
  expect(r.error).toBeUndefined();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ kind: 'rerouted', expected: 'wolf', actual: 'workers-ai (@cf/meta/llama-3.1-8b-instruct-fast)' });
  expect(seen[0].why).toContain('wolf');
  expect(seen[0].detail).toContain('@cf/meta/llama-3.1-8b-instruct-fast');
});

test('wolf resting then a failed fallback keeps both facts in the row', async () => {
  const { env, fetchImpl } = world({ wolf: limited });
  const seen = [];
  const m = modelFrom(env, fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) });
  await m(msgs); // wolf limited: starts the rest
  seen.length = 0;
  await m(msgs); // wolf skipped now
  expect(seen).toHaveLength(1);
  expect(seen[0].why).toContain('wolf skipped: resting');
  expect(seen[0].detail).toContain('after 0 failed');
});

test('every free model failing is an error row', async () => {
  const { env, fetchImpl } = world({ wolf: limited, ai: '' });
  env.AI = undefined;
  const seen = [];
  const r = await modelFrom(env, fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) })(msgs);
  expect(r.kind).toBe('busy');
  expect(seen.at(-1)).toMatchObject({ kind: 'error', why: 'every free model failed', actual: 'none' });
});

test('a normal finished task is not traced; failed, weak and slow ones are', () => {
  const fine = { ms: 20_000, steps: [{}, {}], stats: {} };
  expect(runEvents(fine, null)).toEqual([]);
  expect(runEvents({ ...fine, error: 'boom' }, 'failed: boom')[0]).toMatchObject({ kind: 'error' });
  expect(runEvents(fine, 'a bigger app ended without a live link')[0]).toMatchObject({ kind: 'unexpected' });
  expect(runEvents({ ...fine, ms: 400_000 }, null)[0]).toMatchObject({ kind: 'slow' });
  expect(runEvents({ ms: 40_000, steps: [], stats: {} }, null)[0]).toMatchObject({ kind: 'slow' });
});

test('sendTrace does nothing without a key, uses the binding, and never throws', async () => {
  let n = 0;
  await sendTrace({}, { kind: 'error' }, async () => { n++; });
  expect(n).toBe(0);
  const sent = [];
  await sendTrace({ TRACE_KEY: 'k', TRACES: { fetch: async (u, init) => { sent.push([u, init.headers.authorization, JSON.parse(init.body)]); return new Response('{}'); } } }, { route: '/a', kind: 'error', why: 'x' });
  expect(sent[0][0]).toBe('https://traces.flisk.si/v1/trace');
  expect(sent[0][1]).toBe('Bearer k');
  await sendTrace({ TRACE_KEY: 'k' }, { kind: 'error' }, async () => { throw new Error('down'); });
});

test('runEvents flags an answer in another language than the turn asked for, with codes only', () => {
  const ev = runEvents({ answer: 'Я Flisk Wolf, вільна модель, розміщена на Flisk.', ms: 1000, steps: [] }, '', '/api/run', 'en');
  expect(ev).toHaveLength(1);
  expect(ev[0]).toMatchObject({ kind: 'unexpected', why: 'asked in en, answered in uk' });
  expect(JSON.stringify(ev)).not.toContain('Flisk Wolf');
  expect(runEvents({ answer: 'Hello there', ms: 1000, steps: [] }, '', '/api/run', 'en')).toEqual([]);
  expect(runEvents({ answer: 'Привіт, як справи?', ms: 1000, steps: [] }, '', '/api/run', 'uk')).toEqual([]);
});

test('a picked build kind whose model tried to draw is traced; a 70 s single-step answer is slow', () => {
  expect(runEvents({ answer: 'ok', steps: [{}], stats: {}, ms: 2000, provider: 'wolf', picked: 'website', refusedImage: 1 }, null)[0]).toMatchObject({ kind: 'unexpected', why: expect.stringContaining('picked website') });
  expect(runEvents({ answer: 'ok', steps: [{}], stats: {}, ms: 73_000 }, null)[0]).toMatchObject({ kind: 'slow' });
});

test('a Ukrainian request skips weak Workers AI for the backups, and the row records the language', async () => {
  const { env, fetchImpl: base } = world({ wolf: limited });
  const fetchImpl = async (u, i) => (String(u).includes('pollinations') ? ok('poll answer') : base(u, i));
  env.NO_POLLINATIONS = '0';
  const seen = [];
  const r = await modelFrom(env, fetchImpl, { ai: 'wolf', free: true }, { trace: (e) => seen.push(e) })(msgs, { lang: 'uk' });
  expect(r.error).toBeUndefined();
  expect(seen[0].detail).toContain('lang uk');
  expect(seen[0].actual).toContain('pollinations');
});
