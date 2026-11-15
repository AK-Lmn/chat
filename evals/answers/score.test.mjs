// The eval of the eval: the scorers must agree with answers a person has already labelled good and bad. A scorer that
// stops telling them apart fails here, before the loop can tune the prompt towards a broken score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreAnswer, script, specifics, summarize } from './score.mjs';
import { unsupportedYears } from './score.mjs';

const here = (f) => new URL(f, import.meta.url);
const questions = JSON.parse(readFileSync(here('questions.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(here('corpus.json'), 'utf8'));
const byId = Object.fromEntries(questions.map((q) => [q.id, q]));

for (const c of corpus) {
  test(`labelled pair ${c.id}: the good answer outscores the bad one by 25 or more`, () => {
    const good = scoreAnswer(byId[c.id], c.good);
    const bad = scoreAnswer(byId[c.id], c.bad);
    assert.ok(good.score >= 85, `good scored ${good.score}: ${good.findings.join('; ')}`);
    assert.ok(bad.score <= 60, `bad scored ${bad.score}`);
    assert.ok(good.score - bad.score >= 25, `gap ${good.score - bad.score}`);
    assert.ok(bad.findings.length > 0, 'a bad answer names what is wrong with it');
  });
}

test('the question set is well formed and has short-answer controls', () => {
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  assert.ok(questions.filter((q) => q.kind === 'small').length >= 3);
  assert.ok(questions.filter((q) => script(q.q) !== 'latin').length >= 2, 'questions in another script');
  for (const q of questions) assert.ok(q.kind === 'small' || q.facts?.length >= 2, `${q.id} needs known facts`);
  for (const c of corpus) assert.ok(byId[c.id], `corpus ${c.id} has no question`);
});

test('scores are deterministic and name each lost check', () => {
  const q = byId['rising-sun'];
  const a = scoreAnswer(q, corpus[0].bad);
  assert.deepEqual(a, scoreAnswer(q, corpus[0].bad));
  const ids = a.findings.map((f) => f.split(':')[0]);
  for (const id of ['length', 'structure', 'facts', 'follow-up']) assert.ok(ids.includes(id), id);
});

test('script and specifics', () => {
  assert.equal(script('що таке борщ'), 'cyrillic');
  assert.equal(script('what is borscht'), 'latin');
  assert.equal(specifics('It is nice. It is good.'), 0);
  assert.ok(specifics('Released in 1964 by The Animals with Eric Burdon.') >= 4);
});

test('summarize gives the mean and the checks that lose most', () => {
  const s = summarize(corpus.map((c) => ({ question: byId[c.id], answer: c.bad })));
  assert.ok(s.mean < 60);
  assert.ok(s.lost.length > 0 && s.lost[0][1] >= s.lost[s.lost.length - 1][1]);
});

test('a year that is in neither the question nor the sources is reported', () => {
  const src = [{ text: 'The Animals recorded it in 1964.' }];
  assert.deepEqual(unsupportedYears({ q: 'best song?' }, 'Recorded in 1964, written in 1933. [x](https://a.b/1999)', src), ['1933']);
  assert.deepEqual(unsupportedYears({ q: 'what happened in 1933?' }, 'In 1933 it began.', []), []);
});

test('a closing question still counts when chat adds its line of sources after it', () => {
  const q = { q: 'is Inception a good movie?' };
  const body = 'Yes, it is.\n\n- **Plot:** a heist in dreams\n\nWhich part did you like?';
  const plain = scoreAnswer(q, body);
  const sourced = scoreAnswer(q, `${body}\n\nSources: [Inception](https://en.wikipedia.org/wiki/Inception)`);
  assert.equal(sourced.checks['follow-up'], plain.checks['follow-up']);
  assert.equal(plain.checks['follow-up'], 15);
});
