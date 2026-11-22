// The new home page (web/src) must show everything the server streams, as /classic (src/page.js) does (#343-#347).
import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {newTurn, applyEv} from '../web/src/events.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = read('web/src/App.jsx');
const cards = read('web/src/Cards.jsx');
const page = read('src/page.js');

test('every field a turn collects is read by the page', () => {
  // A field events.js fills but nothing renders is a card the visitor never sees (widgets, workers and browser were).
  const internal = ['task', 'status', 'answer', 'podStarted', 'model', 'text'];
  for (const k of Object.keys(newTurn('x'))) {
    if (internal.includes(k)) continue;
    expect({k, read: new RegExp('t\\.' + k + '\\b').test(app)}).toEqual({k, read: true});
  }
});

test('every widget kind /classic draws has a card here', () => {
  const block = page.slice(page.indexOf('const WIDGET_DRAW={'), page.indexOf('const drawWidget='));
  const kinds = [...block.matchAll(/^ {2}([a-z]+)\(d\)/gm)].map((m) => m[1]);
  expect(kinds.length).toBeGreaterThanOrEqual(5);
  const here = cards.slice(cards.indexOf('export const WIDGETS'));
  for (const k of kinds) expect({k, here: new RegExp('\\b' + k + '\\b').test(here)}).toEqual({k, here: true});
});

test('widget, worker and browseranswer events reach the turn', () => {
  let t = newTurn('weather in Kyiv');
  t = applyEv(t, {type: 'widget', kind: 'weather', data: {}});
  t = applyEv(t, {type: 'worker', path: 'src/index.js', code: 'export default {}'});
  t = applyEv(t, {type: 'browseranswer', question: 'q', results: [{title: 'a', snippet: 'b'}]});
  expect(t.widgets).toHaveLength(1);
  expect(t.workers).toHaveLength(1);
  expect(t.browser.question).toBe('q');
});

test('a reroute is shown as a model step, not a computer', () => {
  const t = applyEv(newTurn('x'), {type: 'reroute', text: 'Trying another model'});
  expect(t.steps.at(-1).name).toBe('model');
});

test('a task stopped by sign-in is kept and runs once after it', () => {
  const at401 = app.slice(app.indexOf('res.status === 401'), app.indexOf('res.status === 429'));
  expect(at401).toContain("sessionStorage.setItem('chat_pending', String(task)");
  expect(at401).toContain("'chat_pending_files'");
  expect(app).toMatch(/if \(p && BOOT\.login\) run\(p, \{files:/);
  expect(app).toContain("sessionStorage.removeItem('chat_pending_files')");
});

test('the Oracle wakes the voice model when it opens', () => {
  expect(read('web/src/Oracle.jsx')).toContain("fetch('/api/talk/warm', {method: 'POST'})");
});

test('the home page at / can be found by search engines and shows a link preview, as /classic does (#350)', async () => {
  const {nextPage} = await import('../src/next-page.js');
  const {appPage} = await import('../src/page.js');
  const head = (html) => html.slice(0, html.indexOf('</head>'));
  const tags = (html) => [...head(html).matchAll(/<(?:meta (?:name|property)="(?:robots|description|og:[a-z:]+|twitter:[a-z]+)"|link rel="(?:canonical|icon|apple-touch-icon)")[^>]*>/g)].map((m) => m[0]).sort();
  const home = nextPage({login: null, anon: true});
  expect(home).not.toContain('noindex');
  expect(home).toContain('<meta name="robots" content="index,follow">');
  expect(home).toContain('<link rel="canonical" href="https://chat.flisk.si/">');
  expect(home).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(tags(home)).toEqual(tags(appPage({login: '', anon: true, connected: []})));
});
