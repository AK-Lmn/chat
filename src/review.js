// "@flisk-chat review" in a pull request comment: a GitHub App webhook, the model reads the diff, one review is posted.
// Compact on purpose (Workers Free: 10 ms CPU, 50 subrequests): about 8 calls per review, the diff is cut to a size cap.
import { loadSettings } from './keys.js';
import { startRun } from './run.js';
import { gh, installToken, verifySignature } from './github-app.js';
import { modelFrom, resolveModel } from './loop.js';

export { verifySignature };
export const WOLF_DIFF = 14_000; // the free model answers at most 1024 tokens, so it only reads this much
export const OWN_KEY_DIFF = 120_000;
export const REVIEWS_PER_DAY = 10; // on the free model, per login
const TRIGGER = /(?:^|[\s(])@(?:flisk-chat|chat)\b[^\n]*?\b(review(?:\s+run)?|auto\s+(?:on|off))\b/i;
const commandOf = (text) => (TRIGGER.exec(text || '')?.[1] || '').toLowerCase().replace(/\s+/, ' ');
const WRITE = new Set(['write', 'maintain', 'admin']);

// The lines of the new file the diff shows, per path: only these can carry an inline comment.
export function diffLines(diff) {
  const files = {};
  let cur = null;
  let n = 0;
  for (const line of diff.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) { cur = files[f[1]] = new Set(); continue; }
    if (line.startsWith('--- ')) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (h) { n = Number(h[1]); continue; }
    if (!cur || !n || line === '') continue;
    if (line.startsWith('-') || line.startsWith('\\')) continue;
    cur.add(n++);
  }
  return files;
}

function prompt(diff, cut) {
  return [
    { role: 'system', content: 'You review a GitHub pull request diff. Find real bugs, security problems and missing tests; skip style nits. Rate EVERY comment: "priority" P0 = breaks production, data loss or a security hole, must fix before merge; P1 = a real bug or a missing test on a changed behavior, fix before merge; P2 = should fix, a risk or a gap that can follow in a later PR; P3 = nice to have, optional. Also give "impact", "confidence" and "ease" (whole numbers 1 to 10, ease 10 = a one-line fix) so the ICE score can be computed. Answer with ONE JSON object only: {"summary": "3-6 plain sentences: what changed, the risks, what to test", "verdict": "approve" | "request_changes" | "comment", "comments": [{"path": "file path from the diff", "line": <line number in the NEW file, a line shown in the diff>, "priority": "P0" | "P1" | "P2" | "P3", "impact": 1-10, "confidence": 1-10, "ease": 1-10, "body": "the problem and why", "suggestion": "optional replacement for that one line"}]}. At most 8 comments. Use "request_changes" only if a P0 or P1 exists, "approve" only if you found nothing that matters.' },
    { role: 'user', content: `${diff}${cut ? '\n\n(The diff was cut here because it is too long; say so in the summary.)' : ''}` },
  ];
}

export function parseReview(text) {
  const t = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    if (typeof v?.summary !== 'string' || !v.summary.trim()) return null;
    return { summary: v.summary.trim().slice(0, 3000), verdict: ['approve', 'request_changes'].includes(v.verdict) ? v.verdict : 'comment', comments: Array.isArray(v.comments) ? v.comments : [] };
  } catch {
    return null;
  }
}

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const score = (v) => Math.min(10, Math.max(1, Math.round(Number(v)) || 5));
const priorityOf = (v) => (PRIORITIES.includes(String(v).toUpperCase()) ? String(v).toUpperCase() : 'P2');

// Keep only comments GitHub will accept, label each [P0]..[P3] with its ICE score (impact x confidence x ease), worst first.
export function cleanComments(comments, files) {
  return comments
    .map((c) => {
      const impact = score(c?.impact), confidence = score(c?.confidence), ease = score(c?.ease);
      return { path: String(c?.path || '').replace(/^b\//, ''), line: Number(c?.line), priority: priorityOf(c?.priority), impact, confidence, ease, ice: impact * confidence * ease, body: String(c?.body || '').trim().slice(0, 1500), suggestion: typeof c?.suggestion === 'string' ? c.suggestion.slice(0, 1500) : '' };
    })
    .filter((c) => c.body && files[c.path]?.has(c.line))
    .sort((x, y) => PRIORITIES.indexOf(x.priority) - PRIORITIES.indexOf(y.priority) || y.ice - x.ice)
    .slice(0, 8)
    .map((c) => {
      const text = `**[${c.priority}]** ICE ${c.ice} (impact ${c.impact} x confidence ${c.confidence} x ease ${c.ease})\n\n${c.body}`;
      return { path: c.path, line: c.line, side: 'RIGHT', priority: c.priority, ice: c.ice, body: c.suggestion ? `${text}\n\n\`\`\`suggestion\n${c.suggestion.replace(/\n+$/, '')}\n\`\`\`` : text };
    });
}

// The verdict follows the priorities, not the model's mood: P0/P1 block the merge, anything else cannot.
export function verdictFor(verdict, comments) {
  const blocking = comments.some((c) => c.priority === 'P0' || c.priority === 'P1');
  if (blocking) return 'request_changes';
  return verdict === 'request_changes' ? 'comment' : verdict;
}

export function priorityLine(comments) {
  if (!comments.length) return '';
  const n = (p) => comments.filter((c) => c.priority === p).length;
  return `**Priorities:** ${PRIORITIES.map((p) => `${p} x${n(p)}`).join(' · ')}. P0 breaks production or security, P1 a real bug or missing test, P2 should fix, P3 optional. ICE = impact x confidence x ease (1 to 1000), higher goes first.\n\n`;
}

export async function reviewPullRequest(env, event, { fetchImpl = fetch, overLimit = async () => false, now = Date.now() } = {}) {
  const { repository, issue, comment, installation } = event;
  const repo = repository.full_name;
  const sender = comment.user.login;
  const token = await installToken(env, installation.id, undefined, fetchImpl, now);
  if (!token) return { error: 'no installation token' };
  const api = gh(token, fetchImpl);
  const say = (text) => api(`/repos/${repo}/issues/${issue.number}/comments`, { method: 'POST', body: { body: text } });

  // Only people who can push may spend the budget. An automatic review (event.auto) runs for whoever switched it on.
  if (!event.auto) {
    const perm = await api(`/repos/${repo}/collaborators/${encodeURIComponent(sender)}/permission`);
    if (!perm.ok || !WRITE.has(JSON.parse(perm.text || '{}').permission)) return { ignored: 'no write access' };
    await api(`/repos/${repo}/issues/comments/${comment.id}/reactions`, { method: 'POST', body: { content: 'eyes' } });
    const cmd = commandOf(comment.body);
    if (cmd === 'auto on' || cmd === 'auto off') {
      if (cmd === 'auto on') await env.DB.prepare('INSERT OR REPLACE INTO auto_repos (repo, login, updated) VALUES (?, ?, ?)').bind(repo, sender, new Date().toISOString()).run();
      else await env.DB.prepare('DELETE FROM auto_repos WHERE repo = ?').bind(repo).run();
      await say(cmd === 'auto on' ? `Automatic reviews are on for ${repo}: every new pull request gets a review, using the AI and daily limit of @${sender}. Comment \`@flisk-chat auto off\` to stop.` : `Automatic reviews are off for ${repo}. \`@flisk-chat review\` still works.`);
      return { auto: cmd };
    }
  }

  // Their own AI from chat.flisk.si, or the free one.
  const saved = await loadSettings(env, sender, { withKey: true }).catch(() => null);
  const chosen = saved ? resolveModel(saved) : { ai: 'wolf', free: true };
  // The AI label goes into every result, so analytics and alerts show which model a failed review used.
  const who = chosen.free ? 'Flisk Wolf (free)' : String(chosen.model || saved?.model || saved?.ai || 'own key');
  if (chosen.error) {
    await say(`@${sender} the review could not start: ${chosen.error}. Check your AI at ${env.PUBLIC_ORIGIN}/reviews.`);
    return { error: chosen.error, ai: who };
  }
  if (chosen.free && (await overLimit(sender))) {
    if (event.auto) return { limited: true, ai: who };
    await say(`@${sender} you used today's ${REVIEWS_PER_DAY} free reviews. Save your own AI key at ${env.PUBLIC_ORIGIN}/reviews and reviews will use it with no daily limit.`);
    return { limited: true, ai: who };
  }

  const dres = await api(`/repos/${repo}/pulls/${issue.number}`, { accept: 'application/vnd.github.v3.diff' });
  if (!dres.ok) {
    await say(`@${sender} the review failed: GitHub did not give the diff (HTTP ${dres.status}).`);
    return { error: `diff ${dres.status}`, ai: who };
  }
  const cap = chosen.free ? WOLF_DIFF : OWN_KEY_DIFF;
  const cut = dres.text.length > cap;
  const diff = cut ? dres.text.slice(0, cap) : dres.text;
  const files = diffLines(diff);

  const ask = modelFrom(env, fetchImpl, chosen, { overLimit: env.freeModelLimit });
  let review = null;
  let err = '';
  for (let i = 0; i < 2 && !review; i++) {
    const r = await ask(prompt(diff, cut));
    if (r.error) { err = r.error; break; }
    review = parseReview(r.text);
  }
  if (!review) {
    await say(`@${sender} the review failed: ${err || 'the model did not answer in the expected shape'}. ${chosen.free ? '' : 'Check your key at ' + env.PUBLIC_ORIGIN + '/reviews.'}`);
    return { error: err || 'bad model answer', ai: who };
  }

  const foot = `\n\n<sub>Reviewed by ${who} on request of @${sender}${cut ? `, first ${Math.round(cap / 1000)} KB of the diff only` : ''}. ${saved ? '' : `Use your own model: ${env.PUBLIC_ORIGIN}/reviews. `}A model can be wrong: read before you merge.</sub>`;
  const comments = cleanComments(review.comments, files);
  const verdict = verdictFor(review.verdict, comments);
  const event_ = { approve: 'APPROVE', request_changes: 'REQUEST_CHANGES', comment: 'COMMENT' }[verdict];
  const post = (e, c) => api(`/repos/${repo}/pulls/${issue.number}/reviews`, { method: 'POST', body: { event: e, body: priorityLine(comments) + review.summary + foot, ...(c.length ? { comments: c.map(({ priority, ice, ...rest }) => rest) } : {}) } });
  let res = await post(event_, comments);
  // A bot cannot approve its own author's PR, and one bad inline comment fails the whole review: fall back step by step.
  if (!res.ok && comments.length) res = await post(event_, []);
  if (!res.ok && event_ !== 'COMMENT') res = await post('COMMENT', []);
  if (!res.ok) await say(`@${sender} ${review.summary}${foot}`);
  let run = null;
  if (!event.auto && commandOf(comment.body) === 'review run') run = await startRun(env, { repo, pr: issue.number, installationId: installation.id, sender, isPrivate: !!repository.private, fetchImpl, say });
  return { posted: true, ai: who, verdict, comments: comments.length, run };
}

// A review that failed or never answered goes to the private Discord channel (env.DISCORD_ERRORS_WEBHOOK). Never throws.
export async function alertReview(env, { repo, pr, sender, auto, ai, why }, fetchImpl = fetch) {
  const url = env.DISCORD_ERRORS_WEBHOOK;
  if (!url || !why) return;
  const link = repo && pr ? `https://github.com/${repo}/pull/${pr}` : repo || 'unknown pull request';
  const text = `**Chat review failed: ${String(why).slice(0, 300)}**\n${link} · ${auto ? 'automatic review' : `asked by @${sender || 'unknown'}`}${ai ? ` · ${ai}` : ''}`;
  await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) }).catch(() => {});
}

// Review analytics (D1 review_runs). Never throws: a broken table must not stop a review.
async function startReviewRow(env, { repo, pr, sender, auto }) {
  try {
    const r = await env.DB.prepare("INSERT INTO review_runs (created, repo, pr, sender, auto, status) VALUES (?, ?, ?, ?, ?, 'started')").bind(new Date().toISOString(), repo || '', Number(pr) || 0, sender || null, auto ? 1 : 0).run();
    return r?.meta?.last_row_id ?? null;
  } catch { return null; }
}
export const reviewStatus = (r) => (r?.error ? 'failed' : r?.posted ? 'posted' : r?.limited ? 'limited' : r?.auto ? 'auto' : r?.ignored ? 'ignored' : 'failed');
async function finishReviewRow(env, id, r, ms) {
  if (id == null) return;
  try {
    await env.DB.prepare('UPDATE review_runs SET status = ?, ai = ?, verdict = ?, error = ?, ms = ?, finished = ? WHERE id = ?').bind(reviewStatus(r), r?.ai || null, r?.verdict || null, r?.error ? String(r.error).slice(0, 300) : null, ms, new Date().toISOString(), id).run();
  } catch {}
}

// Hourly cron: a review still 'started' after 10 minutes was stopped by the Worker without any answer. Report each once.
export async function reportLostReviews(env, fetchImpl = fetch, now = Date.now()) {
  const before = new Date(now - 10 * 60_000).toISOString();
  const { results = [] } = await env.DB.prepare("SELECT id, repo, pr, sender, auto FROM review_runs WHERE status = 'started' AND created < ? LIMIT 20").bind(before).all();
  for (const r of results) {
    await env.DB.prepare("UPDATE review_runs SET status = 'lost' WHERE id = ?").bind(r.id).run();
    await alertReview(env, { repo: r.repo, pr: r.pr, sender: r.sender, auto: !!r.auto, why: 'it never finished: the Worker stopped it before an answer (likely the 30 s after-response limit), nothing was posted on the PR' }, fetchImpl);
  }
  return { lost: results.length };
}

// The webhook: checked, answered at once, and the review runs after the answer.
export async function githubWebhook(request, env, { fetchImpl = fetch, waitUntil = null, overLimit } = {}) {
  const body = await request.text();
  if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))) return new Response('bad signature', { status: 401 });
  const kind = request.headers.get('x-github-event');
  if (kind !== 'issue_comment' && kind !== 'pull_request') return new Response('ignored', { status: 202 });
  let ev;
  try { ev = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
  if (kind === 'pull_request') {
    if (!['opened', 'ready_for_review'].includes(ev.action) || ev.pull_request?.draft || ev.sender?.type === 'Bot' || !ev.installation?.id || !ev.repository?.full_name) return new Response('ignored', { status: 202 });
    const row = await env.DB.prepare('SELECT login FROM auto_repos WHERE repo = ?').bind(ev.repository.full_name).first().catch(() => null);
    if (!row) return new Response('ignored', { status: 202 });
    ev = { repository: ev.repository, installation: ev.installation, issue: { number: ev.pull_request.number }, comment: { id: 0, user: { login: row.login } }, auto: true };
  } else if (ev.action !== 'created' || !ev.issue?.pull_request || ev.issue.state !== 'open' || ev.comment?.user?.type === 'Bot' || !TRIGGER.test(ev.comment?.body || '') || !ev.installation?.id) return new Response('ignored', { status: 202 });
  const info = { repo: ev.repository?.full_name, pr: ev.issue?.number, sender: ev.comment?.user?.login, auto: !!ev.auto };
  if (!env.GITHUB_APP_KEY || !env.GITHUB_APP_ID) {
    if (waitUntil) waitUntil(alertReview(env, { ...info, why: 'the GitHub App key or id is not set' }, fetchImpl)); else await alertReview(env, { ...info, why: 'the GitHub App key or id is not set' }, fetchImpl);
    return new Response('not set up', { status: 503 });
  }
  const started = Date.now();
  const rowId = await startReviewRow(env, info);
  const job = reviewPullRequest(env, ev, { fetchImpl, overLimit })
    .then(async (r) => {
      console.log('review', JSON.stringify(r));
      await finishReviewRow(env, rowId, r, Date.now() - started);
      if (r?.error) await alertReview(env, { ...info, ai: r.ai, why: r.error }, fetchImpl);
    })
    .catch(async (e) => {
      const why = `crashed: ${String(e?.message || e).slice(0, 250)}`;
      console.log('review failed', why);
      await finishReviewRow(env, rowId, { error: why }, Date.now() - started);
      await alertReview(env, { ...info, why }, fetchImpl);
    });
  if (waitUntil) waitUntil(job);
  else await job;
  return new Response('reviewing', { status: 202 });
}
