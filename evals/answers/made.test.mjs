// The labelled cases for things chat made: each bad one is a real complaint, kept so the check that catches it cannot
// be loosened by accident. A check that passes the bad case, or fails the good one, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deadImages, judgeMade } from './made.mjs';

const cases = JSON.parse(readFileSync(new URL('made.json', import.meta.url), 'utf8'));
const ids = (findings) => findings.map((f) => f.split(':')[0]);

for (const c of cases) {
  test(`made ${c.id}: the good one passes, the bad one is caught for the labelled reasons`, () => {
    assert.deepEqual(judgeMade({ q: c.q, ...c.good }), []);
    assert.deepEqual(ids(judgeMade({ q: c.q, answer: c.bad.answer, page: c.bad.page })).sort(), [...c.bad.findings].sort());
  });
}

test('a picture on the web that does not answer as a picture is dead', async () => {
  const fetchImpl = async (url) => (url.endsWith('ok.png') ? { ok: true, headers: new Headers({ 'content-type': 'image/png' }) } : url.endsWith('page.png') ? { ok: true, headers: new Headers({ 'content-type': 'text/html' }) } : { ok: false, headers: new Headers() });
  const page = '<img src="https://a.test/ok.png"><img src="https://a.test/page.png"><img src="https://a.test/gone.png"><img src="data:image/png;base64,AA">';
  assert.deepEqual(await deadImages(page, fetchImpl), ['https://a.test/page.png', 'https://a.test/gone.png']);
});
