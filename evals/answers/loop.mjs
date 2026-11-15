#!/usr/bin/env node
// The answer loop. Scores the current prompt block, asks a model for a rewrite, scores that, and writes the rewrite
// to src/answer-style.js only when it wins on score. Run on a schedule by .github/workflows/answer-loop.yml, which
// turns a kept rewrite into a pull request.
//   node evals/answers/loop.mjs --rounds 3
import { appendFileSync, writeFileSync } from 'node:fs';
import { BASELINE_FILE, config, currentStyle, evaluate, improve, loadBaseline, loadQuestions, makeAsk, overall, proposeStyle, writeStyle } from './lib.mjs';

const { cfg, missing } = config();
if (missing.length) { console.error(`Set ${missing.join(', ')} (any OpenAI-compatible chat completions address).`); process.exit(2); }
const rounds = Number(process.argv[process.argv.indexOf('--rounds') + 1]) || 3;
const dry = process.argv.includes('--dry-run');
const questions = loadQuestions();
const ask = makeAsk(cfg);
const out = await improve({
  questions, style: currentStyle(), rounds, log: (m) => console.log(m),
  measure: (qs, style) => evaluate(qs, style, ask, { samples: cfg.samples }),
  propose: (style, summary) => proposeStyle(style, summary, ask, cfg.editor),
});
const before = overall(questions, out.start.train, out.start.holdout);
const after = overall(questions, out.end.train, out.end.holdout);
const report = [`## Answer loop: ${out.changed ? `${before} -> ${after}` : `no better prompt found (stays ${before})`}`, '', `Model ${cfg.model}, ${questions.length} questions, ${cfg.samples} sample(s) each, ${rounds} round(s).`, '', '| Round | Train | Holdout | Verdict |', '| --- | --- | --- | --- |', `| start | ${out.start.train} | ${out.start.holdout} | |`, ...out.history.map((h) => `| ${h.round} | ${h.train ?? '-'} | ${h.holdout ?? '-'} | ${h.verdict} |`), ''].join('\n');
console.log(`\n${report}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
writeFileSync(new URL('last-run.md', import.meta.url), report);
if (out.changed && !dry) {
  writeStyle(out.style);
  const base = loadBaseline();
  if (!base || after > base.mean) writeFileSync(BASELINE_FILE, `${JSON.stringify({ mean: after, tolerance: base?.tolerance ?? 5, model: cfg.model, date: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  console.log('wrote src/answer-style.js');
}
