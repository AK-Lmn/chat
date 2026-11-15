#!/usr/bin/env node
// Score chat's answers to the question set with the current prompt.
//   node evals/answers/run.mjs                    print the table
//   node evals/answers/run.mjs --check            exit 1 when the mean is below baseline.json (minus its tolerance)
//   EVAL_LOOKUP=1 node evals/answers/run.mjs     answer with the Wikipedia lookup chat does, and count unsupported years
//   node evals/answers/run.mjs --update-baseline  record a better mean (a ratchet: it only moves up)
import { writeFileSync } from 'node:fs';
import { lookup } from '../../src/lookup.js';
import { BASELINE_FILE, config, currentStyle, evaluate, loadBaseline, loadQuestions, makeAsk } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const { cfg, missing } = config();
if (missing.length) { console.error(`Set ${missing.join(', ')} (any OpenAI-compatible chat completions address).`); process.exit(2); }
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const questions = loadQuestions().filter((q) => !only || only.includes(q.id));
const s = await evaluate(questions, currentStyle(), makeAsk(cfg), { samples: cfg.samples, facts: cfg.lookup ? (q) => lookup(q) : null });
console.log(`| Question | Score | Lost |\n| --- | --- | --- |`);
for (const r of s.scored) console.log(`| ${r.question.id} | ${r.score} | ${r.findings.map((f) => f.split(':')[0]).join(', ') || '-'} |`);
const loose = s.scored.reduce((n, r) => n + (r.unsupported?.length || 0), 0);
console.log(`\nLookup ${cfg.lookup ? 'on' : 'off'}: ${s.scored.filter((r) => r.sources?.length).length} answers had sources, ${loose} years in the answers are in no source.`);
console.log(`Mean ${s.mean}/100 on ${cfg.model} (${s.scored.length} answers). Most lost: ${s.lost.slice(0, 4).map(([k, n]) => `${k} x${n}`).join(', ') || 'nothing'}`);
if (args.has('--answers')) for (const r of s.scored) console.log(`\n--- ${r.question.id} (${r.score})\n${r.answer}`);
const base = loadBaseline();
if (args.has('--update-baseline') && !only && (!base || s.mean > base.mean)) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ mean: s.mean, tolerance: base?.tolerance ?? 5, model: cfg.model, date: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  console.log(`baseline: ${base?.mean ?? 'none'} -> ${s.mean}`);
}
if (args.has('--check') && base && s.mean < base.mean - (base.tolerance ?? 5)) { console.error(`FAIL: mean ${s.mean} is below the baseline ${base.mean} (tolerance ${base.tolerance ?? 5})`); process.exit(1); }
