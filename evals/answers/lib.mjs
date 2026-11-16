// The answer loop: measure -> propose -> measure again -> keep only what scores better. The model is only ever the
// thing being measured or the thing proposing a rewrite; the decision to keep a rewrite is made by score.mjs alone.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseAction } from '../../src/loop.js';
import { SYSTEM } from '../../src/prompt.js';
import { ANSWER_STYLE } from '../../src/answer-style.js';
import { sourcesNote, splitPoints, wantsLookup, withSources } from '../../src/lookup.js';
import { summarize, unsupportedYears } from './score.mjs';

const here = (f) => new URL(f, import.meta.url);
export const STYLE_FILE = here('../../src/answer-style.js');
export const BASELINE_FILE = here('baseline.json');
export const loadQuestions = () => JSON.parse(readFileSync(here('questions.json'), 'utf8'));
export const loadBaseline = () => { try { return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')); } catch { return null; } };
export const currentStyle = () => ANSWER_STYLE;

// EVAL_URL is any OpenAI-compatible chat completions address (Flisk Inference, Workers AI, OpenRouter...).
export function config(env = process.env) {
  const cfg = { url: env.EVAL_URL, key: env.EVAL_KEY, model: env.EVAL_MODEL, editor: env.EDITOR_MODEL || env.EVAL_MODEL, samples: Math.max(1, Number(env.EVAL_SAMPLES) || 1), lookup: env.EVAL_LOOKUP === '1' };
  const missing = ['url', 'key', 'model'].filter((k) => !cfg[k]).map((k) => `EVAL_${k.toUpperCase()}`);
  return { cfg, missing };
}

export function makeAsk(cfg, fetchImpl = fetch) {
  return async (messages, { model = cfg.model, maxTokens = 1024, temperature = 0.2 } = {}) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetchImpl(cfg.url, { method: 'POST', headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }) });
      if (r.ok) {
        const d = await r.json();
        const c = d?.choices?.[0]?.message?.content ?? d?.result?.response ?? '';
        return typeof c === 'string' ? c : JSON.stringify(c);
      }
      if (attempt >= 2 || ![429, 500, 502, 503].includes(r.status)) throw new Error(`model HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
    }
  };
}

// One question the way chat asks it: the real system prompt with `style` in place of the current block. The eval has
// no computer, so a model that reaches for one is told so once and must answer.
// facts(q) -> sources, the same lookup chat does before it answers (src/lookup.js). Without it the model answers from memory.
export async function answerFor(question, style, ask, facts = null) {
  const sources = facts && wantsLookup(question.q) ? await Promise.resolve(facts(question.q)).catch(() => []) || [] : [];
  const messages = [{ role: 'system', content: SYSTEM.replace(ANSWER_STYLE, style) + sourcesNote(sources) }, { role: 'user', content: question.q }];
  for (let turn = 0; turn < 2; turn++) {
    const raw = await ask(messages);
    const action = parseAction(raw);
    if (action?.type === 'say') return { answer: withSources(splitPoints(String(action.text || '')), sources), sources };
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: 'Result: this test has no computer and no widgets. Reply with "say" now, from what you know. JSON only.' });
  }
  return { answer: '', sources };
}

export async function evaluate(questions, style, ask, { samples = 1, parallel = 4, facts = null } = {}) {
  const jobs = questions.flatMap((question) => Array.from({ length: samples }, () => question));
  const rows = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    while (next < jobs.length) {
      const i = next++;
      let got = { answer: '', sources: [] };
      try { got = await answerFor(jobs[i], style, ask, facts); } catch (e) { rows[i] = { error: String(e?.message || e) }; }
      rows[i] = { ...rows[i], question: jobs[i], answer: got.answer, sources: got.sources, unsupported: unsupportedYears(jobs[i], got.answer, got.sources) };
    }
  }));
  const failed = rows.filter((r) => r.error);
  // A dead model is not a bad prompt: with most calls failing there is no score to compare.
  if (failed.length > rows.length / 2) throw new Error(`the model failed on ${failed.length} of ${rows.length} questions: ${failed[0].error}`);
  return summarize(rows);
}

// A rewrite must still be the same kind of thing: one prompt block, plain text, a sane size.
export function validStyle(s) {
  const t = String(s ?? '').trim();
  if (!t.startsWith('- ')) return 'it must start with "- " like the other rules';
  if (t.length < 300 || t.length > 3000) return `it is ${t.length} characters (300 to 3000 allowed)`;
  if (/[`\\]|\$\{/.test(t)) return 'it has a backtick, a backslash or ${';
  if (/\{\s*"(run|write|say|widget)"/.test(t)) return 'it redefines the reply shapes';
  return '';
}

export async function proposeStyle(style, summary, ask, editor) {
  const worst = summary.scored.slice().sort((a, b) => a.score - b.score).slice(0, 3)
    .map((r) => `Question: ${r.question.q}\nAnswer (score ${r.score}): ${r.answer.slice(0, 500) || '(empty)'}\nLost: ${r.findings.map((f) => f.replace(/^facts: .*/, 'facts: some well-known facts about the subject are missing')).join('; ')}`).join('\n\n');
  const text = await ask([
    { role: 'system', content: 'You improve one block of a system prompt for a chat assistant that runs on a small model. You get the block, the checks its answers fail most, and the worst answers. Rewrite the block so a small model passes those checks on ANY question: never mention the example questions or their subjects, never add topic-specific rules. Keep rules it already follows. Plain text, starts with "- ", under 2500 characters, no backticks, no backslashes. Reply with the new block only.' },
    { role: 'user', content: `Current block:\n${style}\n\nMean score: ${summary.mean}/100.\nChecks that lose points (check: answers failing): ${summary.lost.map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'}\n\nWhat each check wants: length = 60 to 320 words; structure = at least 3 bullets, each starting with a **bold label**; specifics = at least 5 real names or numbers; facts = well-known facts about the subject are present; follow-up = the last line is a specific question offering a next step, not "anything else?" or "what is your favourite?"; language = same language as the question; no-filler = no opening compliment, no "I cannot"; short = a greeting or thanks gets at most 40 words.\n\nWorst answers:\n${worst}` },
  ], { model: editor, maxTokens: 1200, temperature: 0.7 });
  return String(text).replace(/^```\w*\n?|```$/g, '').trim();
}

// The loop itself, with the model calls passed in so a test can drive it. Questions are split in two: a rewrite is
// tuned on one half and must not score worse on the half it never saw, so it cannot win by fitting the examples.
export async function improve({ questions, style, measure, propose, rounds = 3, margin = 2, slack = 1, log = () => {} }) {
  const train = questions.filter((_, i) => i % 2 === 0);
  const holdout = questions.filter((_, i) => i % 2 === 1);
  let best = { style, train: await measure(train, style), holdout: await measure(holdout, style) };
  const start = { train: best.train.mean, holdout: best.holdout.mean };
  const history = [];
  log(`start: train ${best.train.mean}, holdout ${best.holdout.mean}`);
  for (let round = 1; round <= rounds; round++) {
    const entry = { round };
    history.push(entry);
    let candidate;
    try { candidate = await propose(best.style, best.train); } catch (e) { entry.verdict = `no rewrite: ${String(e?.message || e).slice(0, 120)}`; log(`round ${round}: ${entry.verdict}`); continue; }
    const bad = validStyle(candidate);
    if (bad) { entry.verdict = `rejected: ${bad}`; log(`round ${round}: ${entry.verdict}`); continue; }
    const t = await measure(train, candidate);
    entry.train = t.mean;
    if (t.mean < best.train.mean + margin) { entry.verdict = `rejected: train ${t.mean} is not ${margin} above ${best.train.mean}`; log(`round ${round}: ${entry.verdict}`); continue; }
    const h = await measure(holdout, candidate);
    entry.holdout = h.mean;
    if (h.mean < best.holdout.mean - slack) { entry.verdict = `rejected: holdout fell ${best.holdout.mean} -> ${h.mean} (fits the examples, not the job)`; log(`round ${round}: ${entry.verdict}`); continue; }
    entry.verdict = `kept: train ${best.train.mean} -> ${t.mean}, holdout ${best.holdout.mean} -> ${h.mean}`;
    log(`round ${round}: ${entry.verdict}`);
    best = { style: candidate.trim(), train: t, holdout: h };
  }
  return { style: best.style, changed: best.style !== style, start, end: { train: best.train.mean, holdout: best.holdout.mean }, history, best };
}

export function writeStyle(style, file = STYLE_FILE) {
  const src = readFileSync(file, 'utf8');
  const at = src.indexOf('export const ANSWER_STYLE');
  writeFileSync(file, `${src.slice(0, at)}export const ANSWER_STYLE = \`${style}\`;\n`);
}

export const overall = (questions, a, b) => {
  const nA = questions.filter((_, i) => i % 2 === 0).length;
  const nB = questions.length - nA;
  return Math.round(((a * nA + b * nB) / questions.length) * 10) / 10;
};
