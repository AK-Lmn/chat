// The loop's own rules, driven with fake measurements: it keeps a rewrite only for a real gain, and never one that
// wins on the questions it was tuned on while losing on the ones it never saw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerFor, evaluate, improve, validStyle, writeStyle } from './lib.mjs';

const questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, q: `question ${i}` }));
const style = (name) => `- Quality of a plain answer ${name}. ${'Be specific and useful. '.repeat(20)}`;
// means[styleName] = [train, holdout]
const fake = (means) => async (qs, s) => {
  const name = Object.keys(means).find((k) => s.includes(` ${k}.`));
  const isTrain = qs[0].id === 'q0';
  return { mean: means[name][isTrain ? 0 : 1], scored: [], lost: [] };
};
const proposals = (...names) => { let i = 0; return async () => style(names[i++]); };

test('keeps a rewrite that gains on train and holds on holdout', async () => {
  const out = await improve({ questions, style: style('a'), rounds: 1, measure: fake({ a: [50, 50], b: [70, 65] }), propose: proposals('b') });
  assert.equal(out.changed, true);
  assert.deepEqual(out.end, { train: 70, holdout: 65 });
  assert.match(out.history[0].verdict, /^kept/);
});

test('rejects a gain smaller than the margin (noise)', async () => {
  const out = await improve({ questions, style: style('a'), rounds: 1, measure: fake({ a: [50, 50], b: [51, 60] }), propose: proposals('b') });
  assert.equal(out.changed, false);
  assert.match(out.history[0].verdict, /^rejected: train/);
});

test('rejects a rewrite that fits the examples: train up, holdout down', async () => {
  const out = await improve({ questions, style: style('a'), rounds: 1, measure: fake({ a: [50, 50], b: [90, 40] }), propose: proposals('b') });
  assert.equal(out.changed, false);
  assert.match(out.history[0].verdict, /holdout fell/);
});

test('builds on a kept rewrite and survives a failing proposer', async () => {
  let n = 0;
  const propose = async () => { n++; if (n === 2) throw new Error('model HTTP 503'); return style(n === 1 ? 'b' : 'c'); };
  const out = await improve({ questions, style: style('a'), rounds: 3, measure: fake({ a: [50, 50], b: [60, 55], c: [75, 70] }), propose });
  assert.deepEqual(out.end, { train: 75, holdout: 70 });
  assert.match(out.history[1].verdict, /^no rewrite/);
});

test('refuses a rewrite that is not one plain prompt block', async () => {
  assert.equal(validStyle(style('a')), '');
  assert.ok(validStyle('short'));
  assert.ok(validStyle(`${style('a')} \`code\``));
  assert.ok(validStyle(`${style('a')} {"say": "x"}`));
  const out = await improve({ questions, style: style('a'), rounds: 1, measure: fake({ a: [50, 50] }), propose: async () => 'Sure! Here is the block' });
  assert.equal(out.changed, false);
});

test('answerFor asks with the candidate block in the real system prompt and nudges a model that reaches for the computer', async () => {
  const seen = [];
  const replies = ['{"run": "curl example.com"}', '{"say": "the answer"}'];
  const ask = async (messages) => { seen.push(messages); return replies[seen.length - 1]; };
  assert.equal(await answerFor({ q: 'why?' }, style('zz'), ask), 'the answer');
  assert.ok(seen[0][0].content.includes('Quality of a plain answer zz.'));
  assert.ok(seen[0][0].content.includes('You are Flisk Chat'));
  assert.match(seen[1][3].content, /no computer/);
});

test('evaluate stops when the model is down, so a dead model is never read as a bad prompt', async () => {
  await assert.rejects(evaluate(questions, style('a'), async () => { throw new Error('model HTTP 500'); }), /failed on 6 of 6/);
});

test('writeStyle replaces only the block and the file still imports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'style-'));
  const file = join(dir, 'answer-style.mjs');
  writeFileSync(file, '// keep this comment\nexport const ANSWER_STYLE = `- old`;\n');
  writeStyle(style('new'), file);
  assert.ok(readFileSync(file, 'utf8').startsWith('// keep this comment\n'));
  assert.equal((await import(file)).ANSWER_STYLE, style('new'));
});
