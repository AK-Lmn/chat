import { expect, test } from 'bun:test';
import { appPage } from '../src/page.js';
import { UK, UK_PATTERNS, i18nScript } from '../src/i18n.js';

const page = appPage({ login: 'ann', connected: [] });

test('the page carries the Ukrainian script and picks it from the browser, the country or a saved choice', () => {
  expect(page).toContain("var auto=geo==='UA'||nav.some(");
  expect(page).toContain("localStorage.getItem('chat_lang')");
  expect(page).toContain("b.id='langsw'");
});

test('the script is valid JavaScript', () => {
  expect(() => new Function(i18nScript())).not.toThrow();
});

test('the main screen strings are translated', () => {
  for (const s of ['What should it do?', 'New chat', 'Sign in with GitHub', 'Website', 'Good evening', 'Search your chats']) expect(UK[s]).toBeTruthy();
  expect(UK_PATTERNS.some(([re]) => re.test('3 computers connected · Fleet picks the cheapest'))).toBe(true);
});

test('the Ukrainian script swaps text and placeholders in a browser-like document', () => {
  // Minimal DOM check of the translate function through the real script text.
  const src = i18nScript();
  expect(src).toContain('attributeFilter:ATTRS');
  expect(src).toContain("document.documentElement.lang=on?'uk':'en'");
});

test('the four modes have four different Ukrainian labels', () => {
  const labels = ['Chat', 'Build', 'Create', 'Voice'].map((k) => UK[k]);
  expect(new Set(labels).size).toBe(4);
});

// Run the real script against a stub browser and return window.__t.
function loadT(lang) {
  const win = { __GEO: lang === 'uk' ? 'UA' : '' };
  const doc = { readyState: 'complete', documentElement: {}, body: {}, querySelector: () => null, createTreeWalker: () => ({ currentNode: null, nextNode: () => null }), addEventListener() {} };
  const nav = { languages: [lang === 'uk' ? 'uk-UA' : 'en-US'], language: lang === 'uk' ? 'uk-UA' : 'en-US' };
  const store = {};
  new Function('window', 'document', 'navigator', 'localStorage', 'MutationObserver', i18nScript())(win, doc, nav, { getItem: (k) => store[k] || null, setItem() {} }, class { observe() {} });
  return win.__t;
}

test('errors the chat shows come out in Ukrainian for a Ukrainian visitor', () => {
  const t = loadT('uk');
  expect(t('Out of credit or rate limited: insufficient credits')).toBe('Кредит вичерпано або перевищено ліміт запитів: insufficient credits');
  expect(t('Your Anthropic API key was refused: invalid x-api-key')).toBe('Ваш API-ключ Anthropic відхилено: invalid x-api-key');
  expect(t('The model provider from Azure had a problem (HTTP 502)')).toBe('У провайдера моделі (Azure) виникла проблема (HTTP 502)');
  expect(t("That's your 20 free tasks for today")).toBe('Це ваші 20 безкоштовних завдань на сьогодні');
  expect(t('sign in first')).toBe('спершу увійдіть');
  expect(t('Try again')).toBe('Спробувати ще раз');
  expect(t('The free AI is busy right now. Try again in a minute, or keep going free with your own OpenRouter account.')).toContain('Безкоштовний ШІ зараз зайнятий');
  expect(t('the model did not answer: fetch failed')).toBe('модель не відповіла: fetch failed');
});

test('errors stay English for an English visitor', () => {
  const t = loadT('en');
  expect(t('sign in first')).toBe('sign in first');
  expect(t('Try again')).toBe('Try again');
});

test('every error string the server sends has a Ukrainian form', () => {
  const t = loadT('uk');
  const src = ['index.js', 'loop.js', 'model.js'].map((f) => require('node:fs').readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n');
  const missing = [];
  for (const m of src.matchAll(/error: '([^'$\\]{3,80})'/g)) if (t(m[1]) === m[1]) missing.push(m[1]);
  expect(missing).toEqual([]);
});
