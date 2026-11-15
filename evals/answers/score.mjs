// Deterministic scores for one chat answer. No model: the same answer always gets the same score, and every lost
// point names the check that took it, the way a lint error does. The checks read shape and facts, never taste.

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const lines = (s) => String(s).split('\n').map((l) => l.trim()).filter(Boolean);
const share = (s, re) => {
  const letters = String(s).match(/\p{L}/gu) || [];
  return letters.length ? letters.filter((c) => re.test(c)).length / letters.length : 0;
};
// The writing system of a text: enough to catch an English answer to a Ukrainian question.
export function script(s) {
  if (share(s, /\p{Script=Cyrillic}/u) > 0.5) return 'cyrillic';
  if (share(s, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u) > 0.3) return 'cjk';
  if (share(s, /\p{Script=Arabic}/u) > 0.5) return 'arabic';
  return 'latin';
}

const FILLER = /^(great|good|excellent|interesting|what a (great|good)|that's a (great|good)|sure|certainly|of course|absolutely)\b[^.!?\n]{0,40}[!.,]/i;
const GIVE_UP = /\b(as an ai|i (can't|cannot|am unable to)|i don't have (access|opinions|personal))\b/i;
// A closing question that only hands the conversation back, in place of offering a next step.
const HAND_BACK = /(anything else|how can i help|help you with|what do you think|what about you|your favou?rite|let me know)/i;

// Names and numbers: the things a generic answer does not have. A capitalised word that does not start a sentence,
// or any number, counts once.
export function specifics(answer) {
  const found = new Set();
  for (const m of String(answer).matchAll(/\d[\d.,:%]*/g)) found.add(m[0]);
  for (const m of String(answer).matchAll(/(?<![.!?:\n*\-]\s*)(?<=\S\s+)(\p{Lu}[\p{L}'’]+)/gu)) found.add(m[1].toLowerCase());
  return found.size;
}

// question: { q, kind?: 'small', facts?: [[any-of words], ...] }. Returns { score: 0..100, checks, findings }.
export function scoreAnswer(question, answer) {
  const text = String(answer ?? '').trim();
  const n = words(text).length;
  const checks = {};
  const findings = [];
  const check = (id, weight, got, why) => {
    const value = Math.max(0, Math.min(1, got));
    checks[id] = Math.round(value * weight);
    if (value < 1) findings.push(`${id}: ${why}`);
    return weight;
  };
  let total = 0;
  // An answer the user cannot read is a failed answer whatever else is right in it: wrong language caps the score.
  const done = () => {
    const raw = Math.round((Object.values(checks).reduce((a, b) => a + b, 0) / total) * 100);
    return { score: checks.language ? raw : Math.min(raw, 40), checks, findings };
  };
  total += check('language', 10, script(text) === script(question.q) ? 1 : 0, 'the answer is not in the language of the question');
  total += check('no-filler', 10, FILLER.test(text) || GIVE_UP.test(text) ? 0 : 1, 'opens with a compliment or says what it cannot do');

  // A greeting or a thank-you: the right answer is short, and a long one loses the points.
  if (question.kind === 'small') {
    total += check('short', 80, n > 0 && n <= 40 ? 1 : 0, `${n} words for a greeting (at most 40)`);
    return done();
  }

  total += check('length', 10, n >= 60 && n <= 320 ? 1 : n >= 30 && n <= 450 ? 0.5 : 0, `${n} words (60 to 320 expected)`);
  const ls = lines(text);
  const bullets = ls.filter((l) => /^([-*•]|\d+[.)])\s+/.test(l));
  const labelled = bullets.filter((l) => /^([-*•]|\d+[.)])\s+\*\*[^*]+\*\*/.test(l));
  total += check('structure', 20, Math.min(bullets.length, 3) / 6 + Math.min(labelled.length, 3) / 6, `${bullets.length} bullets, ${labelled.length} with a bold label (3 of each expected)`);
  const sp = specifics(text);
  total += check('specifics', 15, sp / 5, `${sp} names or numbers (5 expected)`);
  const facts = Array.isArray(question.facts) ? question.facts : [];
  if (facts.length) {
    const low = text.toLowerCase();
    const hit = facts.filter((anyOf) => anyOf.some((w) => low.includes(String(w).toLowerCase())));
    const missed = facts.filter((f) => !hit.includes(f)).map((f) => f[0]);
    total += check('facts', 20, hit.length / facts.length, `missing known facts: ${missed.join(', ')}`);
  }
  // The line of sources that chat adds after a lookup is not part of what the model wrote: the question before it counts.
  const said = ls.filter((l) => !/^Sources: \[/.test(l));
  const last = said[said.length - 1] || '';
  const asks = /[?？]\s*$/.test(last.replace(/[*_]+$/g, ''));
  total += check('follow-up', 15, asks ? (HAND_BACK.test(last) ? 0.3 : 1) : 0, asks ? 'the closing question only hands the conversation back' : 'no closing follow-up question');
  return done();
}

// Mean score and the checks that lose the most points over a set of { question, answer } rows.
export function summarize(rows) {
  const scored = rows.map((r) => ({ ...r, ...scoreAnswer(r.question, r.answer) }));
  const mean = scored.length ? Math.round((scored.reduce((a, r) => a + r.score, 0) / scored.length) * 10) / 10 : 0;
  const lost = {};
  for (const r of scored) for (const f of r.findings) lost[f.split(':')[0]] = (lost[f.split(':')[0]] || 0) + 1;
  return { mean, scored, lost: Object.entries(lost).sort((a, b) => b[1] - a[1]) };
}

// Years in an answer that neither the question nor the looked-up sources contain: the cheapest sign of an invented
// fact. It reports, it does not score: a right year can simply be missing from the first paragraph of a source.
export function unsupportedYears(question, answer, sources = []) {
  const known = `${question?.q || ''} ${sources.map((s) => s.text).join(' ')}`;
  const years = String(answer ?? '').replace(/\]\([^)]*\)/g, ']').match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  return [...new Set(years)].filter((y) => !known.includes(y));
}
