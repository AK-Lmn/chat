// Calling a model: which provider a choice means (the free Flisk Wolf, or the visitor's own key), the free fallback
// chain behind Wolf (OpenRouter, Workers AI, Pollinations), and how a failed call is explained. loop.js only asks.
// Who answers. "wolf" is Flisk Inference (free, shared, answers capped at 2048 tokens). The others use the visitor's own API key,
// sent with the request and never stored; only these three addresses are allowed, so a key can't be sent anywhere else.
export const BYO = {
  anthropic: { label: 'Claude (my API key)', url: 'https://api.anthropic.com/v1/chat/completions', model: 'claude-sonnet-5-5' },
  openai: { label: 'OpenAI (my API key)', url: 'https://api.openai.com/v1/chat/completions', model: '' },
  openrouter: { label: 'OpenRouter (my API key)', url: 'https://openrouter.ai/api/v1/chat/completions', model: '' },
};

// choice: undefined or { ai: 'wolf' } or { ai: 'anthropic'|'openai'|'openrouter', key, model }. Returns { error } for a bad choice.
// What to call the chosen AI when the user asks "which model are you".
export const modelLabel = (chosen) => (chosen?.free ? 'Flisk Wolf, a free model hosted by Flisk (a smaller backup model answers when it is busy)' : `${chosen?.model || ''} (through the visitor's own ${String(chosen?.ai || '')} key)`.trim());

export function resolveModel(choice) {
  const ai = choice?.ai || 'wolf';
  if (ai === 'wolf') return { ai, free: true };
  const p = BYO[ai];
  if (!p) return { error: 'pick one of the listed AI models' };
  const key = String(choice.key || '').trim();
  const model = String(choice.model || '').trim() || p.model;
  if (key.length < 8 || key.length > 300 || /\s/.test(key)) return { error: `paste your ${p.label.split(' (')[0]} API key`, kind: 'key' };
  if (!model) return { error: 'type the model name, for example the one shown on your provider\'s model list', kind: 'model' };
  if (!/^~?[A-Za-z0-9._:\/-]{1,80}$/.test(model)) return { error: 'the model name may only use letters, numbers and . _ : / - (copy it from your provider\'s model list)', kind: 'model' };
  return { ai, free: false, url: p.url, key, model };
}


// "Provider returned error" tells a person nothing. OpenRouter puts the real reason in error.metadata (raw text and the
// upstream provider's name), so show it, say what kind of problem it is, and let the page offer the matching next step.
export function explainModelError(body, status, chosen = {}) {
  const e = body?.error;
  const msg = typeof e === 'string' ? e : String(e?.message || '');
  const code = Number(e?.code) || status || 0;
  const meta = e?.metadata || {};
  let raw = meta.raw;
  if (raw && typeof raw !== 'string') raw = JSON.stringify(raw);
  const detail = String(raw || meta.reasons || '').replace(/\s+/g, ' ').slice(0, 220);
  const who = meta.provider_name ? ` from ${meta.provider_name}` : '';
  const hay = `${msg} ${detail}`.toLowerCase();
  let kind = 'other';
  if (/temperature|top_p|max_tokens|max_completion_tokens|unsupported (parameter|value)|not supported with this model/.test(hay) && code === 400) kind = 'setting';
  else if (code === 401 || code === 403 || /api key|unauthori|invalid.*key|no auth/.test(hay)) kind = 'key';
  else if (code === 402 || code === 429 || /credit|quota|rate.?limit|insufficient|too many/.test(hay)) kind = 'limit';
  else if (code === 404 || code === 400 && /model/.test(hay) || /no endpoints|not a valid model|model.*not (found|exist)|does not exist|unknown model/.test(hay)) kind = 'model';
  else if (code >= 500 || /provider returned error|overloaded|timeout/.test(hay)) kind = 'provider';
  const head = {
    key: `Your ${chosen.free ? 'Flisk Wolf' : chosen.ai || 'provider'} API key was refused`,
    limit: 'Out of credit or rate limited',
    model: `The model "${chosen.free ? 'Flisk Wolf' : chosen.model || 'you chose'}" is not available`,
    setting: `The AI refused a setting Flisk Chat sent (HTTP ${code || 'unknown'})`,
    provider: `The model provider${who} had a problem (HTTP ${code || 'unknown'})`,
    other: `The model answered with an error (HTTP ${code || 'unknown'})`,
  }[kind];
  const why = [msg && !/^provider returned error$/i.test(msg) ? msg : '', detail].filter(Boolean).join(': ') || msg;
  return { error: `${head}${why ? `: ${why}` : ''}`.slice(0, 500), kind };
}

// An OpenAI-style event stream ("data: {...}" lines, ending "data: [DONE]"): each piece of text goes to onDelta as it
// arrives. Resolves { text, finish }, or { error } when the provider sends one in the stream.
async function readStream(res, onDelta) {
  const rd = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', finish = '', error = null;
  const line = (raw) => {
    const l = raw.trim();
    if (!l.startsWith('data:')) return;
    const data = l.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j?.error && !text) error = j.error;
    const c = j?.choices?.[0];
    const d = c?.delta?.content;
    if (typeof d === 'string' && d) { text += d; onDelta(d); }
    if (c?.finish_reason) finish = c.finish_reason;
  };
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  line(buf);
  return error ? { error, text, finish } : { text, finish };
}

// Calls one model (OpenAI-compatible). Errors come back as { error }. A second argument { onDelta } streams the answer.
function oneModel(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }) {
  const url = chosen.free ? env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions' : chosen.url;
  const model = chosen.free ? env.INFERENCE_MODEL || 'flisk-wolf-chat' : chosen.model;
  const key = chosen.free ? env.INFERENCE_KEY : chosen.key;
  // Claude 5 thinks before it answers and thinking counts against max_tokens, so a Claude key gets room for both.
  const maxTokens = chosen.free ? 2048 : chosen.referer ? 1024 : chosen.ai === 'anthropic' ? 16000 : 4096;
  // The free model is another Worker on our own domain: Cloudflare refuses a Worker calling it by its public address
  // (error 1033), so the call goes through a service binding when there is one.
  const call = chosen.free && env.INFERENCE ? (u, init) => env.INFERENCE.fetch(u, init) : fetchImpl;
  return async (messages, o = {}) => {
    if (!key) return { error: 'chat has no model key yet (INFERENCE_KEY)' };
    // Voice talk reads the answer aloud while it is still being written: the model's own key streams it. Flisk Wolf
    // (inference.flisk.si) answers 400 to stream: true, so the free choice never streams.
    const stream = typeof o.onDelta === 'function' && !chosen.free;
    // Newer models refuse settings other models take: Claude 4.7 and later answer 400 to any `temperature` below 1, and
    // OpenAI's newer models want `max_completion_tokens` instead of `max_tokens`. So a model the visitor brings is called
    // without `temperature` (and OpenAI with `max_completion_tokens`), and a 400 that names one of them is retried once
    // with that setting fixed. (Anthropic's docs: platform.claude.com/docs/en/api/openai-sdk, "Request fields".)
    const opts = { temperature: chosen.free || chosen.referer || chosen.ai === 'openrouter', completion: chosen.ai === 'openai' };
    const send = async () => {
      const r = await call(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'user-agent': 'flisk-chat', ...(chosen.referer ? { 'http-referer': 'https://chat.flisk.si', 'x-title': 'Flisk Chat' } : {}) },
        body: JSON.stringify({ model, messages, [opts.completion ? 'max_completion_tokens' : 'max_tokens']: maxTokens, ...(opts.temperature ? { temperature: 0 } : {}), ...(chosen.free ? { reasoning_effort: o.effort === 'medium' ? 'medium' : 'low' } : {}), ...(stream ? { stream: true } : {}) }),
        ...(chosen.ms ? { signal: AbortSignal.timeout(chosen.ms) } : {}),
      });
      return { res: r, body: stream && r.ok ? null : await r.json().catch(() => null) };
    };
    let res, body;
    try {
      ({ res, body } = await send());
      for (let again = 0; again < 2 && !res.ok; again++) {
        const why = JSON.stringify(body?.error ?? '');
        if (opts.temperature && /temperature/i.test(why)) opts.temperature = false;
        else if (!opts.completion && /max_completion_tokens/i.test(why)) opts.completion = true;
        else break;
        ({ res, body } = await send());
      }
    } catch (e) {
      return { error: `the model did not answer: ${String(e?.message || e).slice(0, 150)}`, kind: 'provider' };
    }
    if (!res.ok || (body?.error && !body?.choices)) return explainModelError(body, res.status, chosen);
    if (stream) {
      let got;
      try { got = await readStream(res, o.onDelta); } catch (e) { return { error: `the model stopped answering: ${String(e?.message || e).slice(0, 150)}`, kind: 'provider' }; }
      if (got.error) return explainModelError({ error: got.error }, 0, chosen);
      if (got.text.trim()) return got.finish === 'length' ? { text: got.text, cut: true } : { text: got.text };
      return { error: 'the model sent an empty answer' + (got.finish ? ` (finish reason: ${String(got.finish).slice(0, 30)})` : ''), kind: 'empty' };
    }
    const text = body?.choices?.[0]?.message?.content;
    const finish = body?.choices?.[0]?.finish_reason;
    // cut: the answer stopped at the length limit, so an action in it may be missing its end.
    if (typeof text === 'string' && text.trim()) return finish === 'length' ? { text, cut: true } : { text };
    if (text && typeof text === 'object') return { text: JSON.stringify(text) };
    // Reasoning models sometimes spend the whole answer thinking and write nothing; say so, and let the loop retry.
    const thought = body?.choices?.[0]?.message?.reasoning;
    const why = finish === 'length' ? ' (it ran out of answer length' + (thought ? ' while thinking' : '') + ')' : finish ? ` (finish reason: ${String(finish).slice(0, 30)})` : '';
    return { error: `the model sent an empty answer${why}`, kind: 'empty' };
  };
}

// The free choice never shows a budget or rate-limit error. Flisk Wolf answers first; when it cannot (its shared daily
// budget is used up, or it fails), the same messages go to OpenRouter's free models (with OPENROUTER_KEY), then to a
// small Workers AI model on our own account (capped per day). Only when every one fails does the visitor see an error,
// and it says the free AI is busy, not why.
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_PREFERRED = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'nvidia/nemotron-3.5-super-vl:free'];
export const WORKERS_AI_FALLBACK = '@cf/meta/llama-3.1-8b-instruct-fast';
// The last fallback needs no key and no Cloudflare neurons: when the account's free 10,000 daily neurons are used up,
// Wolf and Workers AI both fail at once, and without it every free chat said "busy" until midnight UTC.
export const POLLINATIONS_TEXT_URL = 'https://text.pollinations.ai/openai';
export const POLLINATIONS_MS = 25_000; // it queues anonymous callers: a stuck call must end, not hang the chat
export const WORKERS_AI_PER_DAY = 300; // about 1,500 neurons at most: chat's share of the account's free 10,000
export const FREE_BUSY = 'The free AI is busy right now. Try again in a minute, or keep going free with your own OpenRouter account.';
// Step 4, our Vercel AI Gateway (pay per use, no markup): off unless a key AND a daily request cap are set. A request cap is a
// hard ceiling on cost (each call is limited to max_tokens), so a missing or zero cap means the route is never called.
export const VERCEL_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
export const VERCEL_MODEL = 'alibaba/qwen3.8-27b';
export const vercelCap = (env) => (env.VERCEL_AI_KEY ? Math.max(0, Math.floor(Number(env.VERCEL_DAILY_REQUESTS) || 0)) : 0);
const WOLF_REST_MS = 10 * 60 * 1000;
let wolfOutUntil = 0; // after a budget or rate-limit answer, skip Wolf for a while instead of asking it every step
let orModels = { at: 0, ids: null };

// OpenRouter's free models right now (they come and go), in our preferred order first, kept 1 hour.
export async function freeOpenRouterModels(fetchImpl = fetch, now = Date.now()) {
  if (orModels.ids && now - orModels.at < 3_600_000) return orModels.ids;
  let live = [];
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(4000) });
    const data = (await res.json())?.data || [];
    live = data.filter((m) => String(m?.id || '').endsWith(':free') && !/vl|omni|code/i.test(m.id) && (m.context_length || 0) >= 32000).map((m) => m.id);
  } catch {}
  const ids = live.length ? [...OPENROUTER_PREFERRED.filter((id) => live.includes(id)), ...live.filter((id) => !OPENROUTER_PREFERRED.includes(id))] : OPENROUTER_PREFERRED;
  orModels = { at: now, ids };
  return ids;
}

// Does this message ask for a picture to be drawn (and nothing else)? One cheap Workers AI call, one word back.
// Anything unclear, any error, any missing binding answers null, and the main model handles the message as usual.
export function imageIntent(env) {
  if (!env?.AI) return null;
  return async (task) => {
    const r = await env.AI.run(WORKERS_AI_FALLBACK, {
      messages: [
        { role: 'system', content: 'Decide what the user wants. Answer with ONE word. "image" = they want a picture, photo, drawing or illustration generated for them, and nothing else. "other" = anything else: writing or text about pictures, plans, code, websites, videos, charts, questions, edits, analysis. When unsure answer "other".' },
        { role: 'user', content: String(task).slice(0, 600) },
      ],
      max_tokens: 3, temperature: 0,
    });
    const raw = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
    return /^\W*image\b/i.test(String(raw)) ? 'image' : 'other';
  };
}

function workersAiModel(env, overLimit) {
  return async (messages) => {
    if (!env.AI) return { error: 'no Workers AI binding', kind: 'provider' };
    if (overLimit && (await overLimit())) return { error: 'the Workers AI fallback is used up for today', kind: 'limit' };
    try {
      const r = await env.AI.run(WORKERS_AI_FALLBACK, { messages, max_tokens: 1024, temperature: 0 });
      // Older models answer { response }; newer ones (llama-3.1-8b-fast-v2 behind the same name) answer OpenAI-style choices.
      const raw = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      return text.trim() ? { text } : { error: 'the model sent an empty answer', kind: 'empty' };
    } catch (e) {
      return { error: String(e?.message || e).slice(0, 200), kind: 'provider' };
    }
  };
}

// A person's own OpenRouter account on a free model ("Log in with OpenRouter"): when that model is busy, try other free
// models with the same key. The account's own daily free allowance being used up ends it, since every free model shares it.
export const ownFreeOpenRouter = (chosen) => !chosen.free && chosen.ai === 'openrouter' && /:free$/.test(chosen.model || '');
const dailyFreeUsed = (r) => /free-models-per-day|per.?day/i.test(r.error || '');
function ownFreeModel(env, fetchImpl, chosen) {
  return async (messages, o = {}) => {
    // Once words were streamed to the speaker, another model must not start the answer again.
    let streamed = false;
    const onDelta = typeof o.onDelta === 'function' ? (d) => { streamed = true; o.onDelta(d); } : undefined;
    const first = await oneModel(env, fetchImpl, chosen)(messages, { onDelta });
    if (!first.error || streamed || first.kind === 'key' || dailyFreeUsed(first)) return first;
    const others = (await freeOpenRouterModels(fetchImpl)).filter((id) => id !== chosen.model).slice(0, 2);
    for (const id of others) {
      const r = await oneModel(env, fetchImpl, { ...chosen, model: id })(messages);
      if (!r.error) return { ...r, by: id };
      if (dailyFreeUsed(r)) return r;
    }
    return first;
  };
}

// Models announced but not out yet: when the provider says the name does not exist, try these likely names too, then say plainly
// that it is not released. The first name in each list is the one the picker sends.
export const NAME_GUESSES = {
  'gpt-6.2-astra': ['gpt-6.2-astra', 'gpt-6.2', 'gpt-6-astra', 'gpt-6.2-astra-preview', 'gpt-6.2-astra-latest'],
};
export const NOT_RELEASED = (name) => `"${name}" is not released yet: OpenAI does not list it for your key. Flisk tried the likely names and none exists. Pick another model, or try again when OpenAI ships it.`;
function withNameGuesses(make, env, fetchImpl, chosen, trace = () => {}) {
  const names = chosen.ai === 'openai' ? NAME_GUESSES[chosen.model] : null;
  if (!names) return make(env, fetchImpl, chosen);
  return async (messages, o = {}) => {
    let last;
    const tried = [];
    for (const name of names) {
      const r = await make(env, fetchImpl, { ...chosen, model: name })(messages, o);
      if (!r.error || r.kind !== 'model') {
        // Answered by a different name than the one picked, or failed for another reason: a trace says which name, never the key or the prompt.
        if (!r.error && tried.length) trace({ kind: 'rerouted', why: `${chosen.model} not found, tried ${tried.join(', ')}`.slice(0, 300), expected: chosen.model, actual: name });
        else if (!r.error) trace({ kind: 'unexpected', why: `${chosen.model} is not released, yet OpenAI answered it`, expected: chosen.model, actual: name });
        else if (r.error) trace({ kind: 'error', why: `${name}: ${r.kind || 'error'}`, expected: chosen.model, actual: 'none', detail: [...tried, name].join(', ').slice(0, 300) });
        return r;
      }
      tried.push(name);
      last = r;
    }
    trace({ kind: 'error', why: 'model not released: OpenAI answered not found for every name', expected: chosen.model, actual: 'none', detail: tried.join(', ').slice(0, 300) });
    return { ...last, error: NOT_RELEASED(chosen.model), kind: 'model' };
  };
}

export function modelFrom(env = {}, fetchImpl = fetch, chosen = { ai: 'wolf', free: true }, { overLimit = null, overVercel = null, now = () => Date.now(), log = () => {}, trace = () => {} } = {}) {
  if (ownFreeOpenRouter(chosen)) return ownFreeModel(env, fetchImpl, chosen);
  if (!chosen.free) return withNameGuesses(oneModel, env, fetchImpl, chosen, trace);
  const wolf = oneModel(env, fetchImpl, chosen);
  const workers = workersAiModel(env, overLimit);
  return async (messages, o = {}) => {
    const tried = [];
    // Wolf is the planned first stop. Whoever answers instead is a reroute worth a row, with the reason.
    // Whether wolf was skipped is decided once, before anything runs, so a pause that ends mid-request cannot change the story.
    const skipped = now() < wolfOutUntil;
    const rest = skipped ? Math.max(1, Math.ceil((wolfOutUntil - now()) / 60000)) : 0;
    const rerouted = (by, model) => {
      if (by === 'wolf') return;
      const why = [skipped ? `wolf skipped: resting ${rest} more min after a limit` : '', ...tried].filter(Boolean).join('; ') || 'wolf did not answer';
      trace({ kind: 'rerouted', why: why.slice(0, 300), expected: 'wolf', actual: by, detail: `answered by ${model || by} after ${tried.length} failed` });
    };
    if (now() >= wolfOutUntil) {
      const r = await wolf(messages, { effort: o.effort });
      if (!r.error) return { ...r, by: 'wolf' };
      tried.push(`wolf: ${r.error}`);
      if (r.kind === 'limit') wolfOutUntil = now() + WOLF_REST_MS;
    }
    if (env.OPENROUTER_KEY) {
      const ids = (await freeOpenRouterModels(fetchImpl)).slice(0, 3);
      for (const id of ids) {
        const r = await oneModel(env, fetchImpl, { ai: 'openrouter', url: OPENROUTER_URL, model: id, key: env.OPENROUTER_KEY, referer: true })(messages);
        if (!r.error) { rerouted('openrouter', id); return { ...r, by: id }; }
        tried.push(`${id}: ${r.error}`);
      }
    }
    const r = await workers(messages);
    if (!r.error) { rerouted('workers-ai', WORKERS_AI_FALLBACK); return { ...r, by: WORKERS_AI_FALLBACK }; }
    tried.push(`workers-ai: ${r.error}`);
    if (vercelCap(env) && !(overVercel && (await overVercel(vercelCap(env))))) {
      const v = await oneModel(env, fetchImpl, { ai: 'vercel', url: env.VERCEL_URL || VERCEL_URL, model: env.VERCEL_MODEL || VERCEL_MODEL, key: env.VERCEL_AI_KEY, ms: 60_000 })(messages);
      if (!v.error) { rerouted('vercel', env.VERCEL_MODEL || VERCEL_MODEL); return { ...v, by: 'vercel' }; }
      tried.push(`vercel: ${v.error}`);
    }
    if (env.NO_POLLINATIONS !== '1') {
      const p = await oneModel(env, fetchImpl, { ai: 'pollinations', url: env.POLLINATIONS_TEXT_URL || POLLINATIONS_TEXT_URL, model: 'openai', key: '-', referer: true, ms: POLLINATIONS_MS })(messages);
      if (!p.error) { rerouted('pollinations', 'openai'); return { ...p, by: 'pollinations' }; }
      tried.push(`pollinations: ${p.error}`);
    }
    log(tried);
    trace({ kind: 'error', why: 'every free model failed', expected: 'wolf', actual: 'none', detail: tried.join('; ').slice(0, 300) });
    return { error: FREE_BUSY, kind: 'busy' };
  };
}

// Tests only: forget that Wolf was out and the cached OpenRouter list.
export function resetFallbacks() { wolfOutUntil = 0; orModels = { at: 0, ids: null }; }
