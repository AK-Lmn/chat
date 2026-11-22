import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bounceRate, measure, BASELINE, MIN_VISITS } from './measure-bounce.mjs';

const stats = (over = {}) => ({ current: { visitors: 85, visits: 256, bounceRate: 75, ...over } });
const reply = (body, status = 200) => async () => ({ ok: status < 200 || status > 299 ? false : true, status, json: async () => body });

test('today: 75% bounce over 256 visits is a measurement, worse than the 66% baseline', () => {
  const m = bounceRate(stats());
  assert.equal(m.value, 75);
  assert.equal(m.baseline, BASELINE);
  assert.ok(m.baseline / m.value < 1);
});

test('good: 40% bounce reads as better than baseline, past the 1.5x target', () => {
  const m = bounceRate(stats({ bounceRate: 40 }));
  assert.ok(m.baseline / m.value >= 1.5);
});

test('middle: 55% bounce is better than baseline but short of the 1.5x target', () => {
  const m = bounceRate(stats({ bounceRate: 55 }));
  const ratio = m.baseline / m.value;
  assert.ok(ratio > 1 && ratio < 1.5);
});

test('0% bounce is floored to 0.1, because GEL needs a positive value', () => {
  assert.equal(bounceRate(stats({ bounceRate: 0 })).value, 0.1);
});

test('no number: null or missing bounce rate, out of range, too few visits', () => {
  assert.match(bounceRate(stats({ bounceRate: null })).error, /no bounce rate/);
  assert.match(bounceRate({}).error, /no bounce rate/);
  assert.match(bounceRate(stats({ bounceRate: 140 })).error, /no bounce rate/);
  assert.match(bounceRate(stats({ bounceRate: -5 })).error, /no bounce rate/);
  assert.match(bounceRate(stats({ visits: MIN_VISITS - 1 })).error, /only 49 visits/);
  assert.match(bounceRate(stats({ visits: 0, bounceRate: 100 })).error, /only 0 visits/);
});

test('measure: no key, a rejected key, a failing API and a non-JSON answer all give no number', async () => {
  assert.match((await measure({}, reply(stats()))).error, /MEASURE_SECRET/);
  assert.match((await measure({ MEASURE_SECRET: 'fa_x' }, reply({ error: 'no' }, 401))).error, /answered 401/);
  assert.match((await measure({ MEASURE_SECRET: 'fa_x' }, reply({}, 500))).error, /answered 500/);
  assert.match((await measure({ MEASURE_SECRET: 'fa_x' }, async () => { throw new Error('offline'); })).error, /offline/);
  assert.match((await measure({ MEASURE_SECRET: 'fa_x' }, async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }))).error, /JSON/);
});

test('measure sends the key as a bearer token for chat.flisk.si over 7 days', async () => {
  let seen;
  const out = await measure({ MEASURE_SECRET: 'fa_secret' }, async (url, init) => { seen = { url, auth: init.headers.authorization }; return { ok: true, status: 200, json: async () => stats() }; });
  assert.match(seen.url, /site=chat\.flisk\.si&range=7d/);
  assert.equal(seen.auth, 'Bearer fa_secret');
  assert.equal(out.value, 75);
  assert.ok(!JSON.stringify(out).includes('fa_secret'));
});
