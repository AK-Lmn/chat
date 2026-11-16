import { expect, test } from 'bun:test';
import { detectLang, resolveLang, replyRule, PRODUCT_FACTS } from '../src/lang.js';
import { talkMessages } from '../src/index.js';
import { appPage } from '../src/page.js';

test('Ukrainian text with none of the letters і ї є ґ is still Ukrainian', () => {
  expect(detectLang('Все добре, дякую. А у тебе як справи?')).toBe('uk');
  expect(detectLang('Розкажи, як в тебе справи.')).toBe('uk');
  expect(detectLang('Все добрые, ты кто?')).toBe('ru');
  expect(detectLang('Что ты умеешь?')).toBe('ru');
  expect(detectLang('Привіт')).toBe('uk');
  expect(detectLang('What is the weather?')).toBe('');
});

test('an ambiguous Cyrillic clip keeps the chat language, then the page language, never a fresh guess', () => {
  // Whisper heard "ru" for a short Ukrainian clip with no marker words.
  expect(resolveLang({ text: 'Все добре', heard: 'ru', sticky: 'uk', ui: 'en' })).toBe('uk');
  expect(resolveLang({ text: 'Ну да', heard: 'ru', sticky: '', ui: 'uk' })).toBe('uk');
  expect(resolveLang({ text: 'Ну да', heard: 'ru', sticky: '', ui: 'en' })).toBe('ru');
  // Marker words beat the sticky language: a Russian sentence in a Ukrainian chat is Russian.
  expect(resolveLang({ text: 'Все добрые, ты кто?', heard: 'uk', sticky: 'uk', ui: 'uk' })).toBe('ru');
  expect(resolveLang({ text: 'Hello there', heard: 'en', sticky: 'uk', ui: 'uk' })).toBe('en');
  expect(resolveLang({ text: '', heard: '', sticky: '', ui: '' })).toBe('');
});

test('the model gets an explicit reply language and the facts about itself, with one persona for each mode', () => {
  expect(replyRule('uk')).toContain('Reply only in Ukrainian');
  expect(replyRule('uk')).toContain('not Russian');
  expect(replyRule('')).toBe('');
  const sys = talkMessages([{ role: 'user', content: 'Привіт' }], 'uk')[0].content;
  expect(sys).toContain('Reply only in Ukrainian');
  expect(sys).toContain(PRODUCT_FACTS);
  expect(PRODUCT_FACTS).toContain('saved in their own browser');
  expect(PRODUCT_FACTS).toContain('Flisk Oracle');
});

test('the page reads Ukrainian text with the Ukrainian voice and agrees with the Worker', () => {
  const page = appPage({ login: 'ann', connected: [] });
  const cut = (a, b) => page.slice(page.indexOf(a), page.indexOf(b));
  const langOf = (sticky = '', ui = '') => new Function('chatLang', 'window', `${cut('const langOf=', 'const pickVoice=')}\nreturn langOf;`)(sticky, { __LANG: ui });
  for (const t of ['Все добре, дякую. А у тебе як справи?', 'Все добрые, ты кто?', 'Привіт', 'Что ты умеешь?']) expect(langOf()(t)).toBe(detectLang(t));
  expect(langOf('uk')('Ну да')).toBe('uk');
  expect(langOf('', 'uk')('Ну да')).toBe('uk');
  expect(langOf('', 'en')('Ну да')).toBe('ru');
  expect(page).toContain("lang:chatLang,memo,ui:window.__LANG");
});

import { runTask } from '../src/loop.js';
test('the typed chat states the reply language and its own name to the model', async () => {
  let system = '';
  const model = async (messages) => { system = messages[0].content; return { text: '{"answer":"Все добре."}' }; };
  await runTask({ task: 'Розкажи, як в тебе справи.', history: [{ role: 'assistant', content: 'Я — Flisk Oracle' }], lang: 'uk', model, computer: {}, emit: () => {} });
  expect(system).toContain('Reply only in Ukrainian');
  expect(system).toContain('"Flisk Chat"');
});

import { handle } from '../src/index.js';
import { makeSession, newAnonLogin } from '../src/session.js';
test('a typed voice turn in Russian is answered in Russian even when the page sent uk', async () => {
  let system = '';
  const cache = new Map();
  const e = { PUBLIC_ORIGIN: 'https://chat.test', SESSION_SECRET: 's', LIMIT_CACHE: { match: async (k) => cache.get(String(k.url || k))?.clone(), put: async (k, r) => { cache.set(String(k.url || k), r); } }, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', INFERENCE: { fetch: async (_u, init) => { system = JSON.parse(init.body).messages[0].content; return Response.json({ choices: [{ message: { content: 'Привет.' } }] }); } } };
  const cookie = (await makeSession(e, newAnonLogin())).split(';')[0];
  const body = { lang: 'uk', ui: 'uk', ai: { ai: 'wolf' }, history: [{ role: 'assistant', content: 'Все добре, дякую!' }, { role: 'user', content: 'Все добрые, ты кто?' }] };
  const res = await handle(new Request('https://chat.test/api/talk', { method: 'POST', headers: { cookie, origin: 'https://chat.test', 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' }, body: JSON.stringify(body) }), e, { fetchImpl: async () => Response.json({}) });
  expect(res.status).toBe(200);
  expect(system).toContain('Reply only in Russian');
});

import { memoMessages, memoNote, cleanMemo } from '../src/memo.js';
test('a chat summary reaches the model as background, not as instructions', async () => {
  expect(memoNote('')).toBe('');
  expect(memoNote('The user builds a shop.')).toContain('The user builds a shop.');
  expect(talkMessages([{ role: 'user', content: 'Привіт' }], 'uk', 'Shop for Kyiv.')[0].content).toContain('Shop for Kyiv.');
  expect(cleanMemo('a'.repeat(5000)).length).toBe(1500);
  const m = memoMessages('old', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]);
  expect(m[1].content).toContain('old');
  expect(m[1].content).toContain('User: hi');
  let system = '';
  await runTask({ task: 'next', history: [], memo: 'Shop for Kyiv.', model: async (ms) => { system = ms[0].content; return { text: '{"answer":"ok"}' }; }, computer: {}, emit: () => {} });
  expect(system).toContain('Shop for Kyiv.');
});
test('/api/memo folds old turns into a summary and the page rolls it', async () => {
  const cache = new Map();
  const e = { PUBLIC_ORIGIN: 'https://chat.test', SESSION_SECRET: 's', LIMIT_CACHE: { match: async (k) => cache.get(String(k.url || k))?.clone(), put: async (k, r) => { cache.set(String(k.url || k), r); } }, INFERENCE_KEY: 'ik', INFERENCE_URL: 'https://inf.test/v1/chat/completions', INFERENCE: { fetch: async () => Response.json({ choices: [{ message: { content: 'User wants a shop.' } }] }) } };
  const cookie = (await makeSession(e, newAnonLogin())).split(';')[0];
  const post = (b) => handle(new Request('https://chat.test/api/memo', { method: 'POST', headers: { cookie, origin: 'https://chat.test', 'content-type': 'application/json', 'cf-connecting-ip': '2.2.2.2' }, body: JSON.stringify(b) }), e, { fetchImpl: async () => Response.json({}) });
  expect((await post({ msgs: [] })).status).toBe(400);
  const res = await post({ memo: '', msgs: [{ role: 'user', content: 'Build a shop' }], ai: { ai: 'wolf' } });
  expect(res.status).toBe(200);
  expect((await res.json()).memo).toBe('User wants a shop.');
  const pg = appPage({ login: 'ann', connected: [] });
  expect(pg).toContain('/api/memo');
  expect(pg).toContain('memo,memoN');
});
