// Sends a problem to traces.flisk.si (flisk-sh/traces): only when something went wrong or took an unexpected path, never a normal request.
// Never throws, never waits more than 2 s, and does nothing until TRACE_KEY is set. No prompt, answer or name is ever sent.
// Needs the TRACES service binding (a Worker cannot call a Worker on the same domain by its public address) or falls back to the public URL.
export const SLOW_ASK_MS = 30_000;
export const SLOW_STEP_MS = 90_000;

// Provider errors can quote a key, even a masked one ("key_gl8C********hRTv"). Cut anything key-shaped before it leaves for traces.
export function redactSecrets(text) {
  return String(text)
    .replace(/[A-Za-z0-9_-]*\*{3,}[A-Za-z0-9_*-]*/g, '[key]')
    .replace(/\b(?:sk|rk|pk|key|gsk|xai|ghp|github_pat)[-_][A-Za-z0-9_-]{6,}/gi, '[key]')
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[key]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [key]')
    .replace(/(Incorrect API key provided:)[^.]*\./i, '$1 [key].');
}
const clean = (v) => typeof v === 'string' ? redactSecrets(v) : v;

export async function sendTrace(env, event, fetchImpl = fetch) {
  if (!env?.TRACE_KEY) return;
  try {
    event = Object.fromEntries(Object.entries(event || {}).map(([k, v]) => [k, clean(v)]));
    const init = { method: 'POST', headers: { authorization: `Bearer ${env.TRACE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000) };
    if (env.TRACES) await env.TRACES.fetch('https://traces.flisk.si/v1/trace', init);
    else await fetchImpl('https://traces.flisk.si/v1/trace', init);
  } catch { /* tracing must never break a request */ }
}

// What a finished task says about itself: a failure is an error, a weak result is unexpected, a long one is slow. Nothing otherwise.
export function runEvents(result, problem, route = '/api/run') {
  const out = [];
  const ms = result.ms || 0;
  const steps = result.steps?.length || 0;
  const detail = `${steps} steps · ${result.stats?.errors || 0} failed · ${result.provider || 'no provider'}`;
  if (problem) out.push({ route, kind: result.error ? 'error' : 'unexpected', why: String(problem).slice(0, 200), detail, ms });
  const slow = steps ? ms / steps > SLOW_STEP_MS : ms > SLOW_ASK_MS;
  if (slow) out.push({ route, kind: 'slow', why: steps ? `a step took ${Math.round(ms / steps / 1000)} s on average` : `answered in ${Math.round(ms / 1000)} s`, detail, ms });
  return out;
}
