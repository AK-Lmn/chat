// The new home page (web/src) must show everything the server streams, as /classic (src/page.js) does (#343-#347).
import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {newTurn, applyEv, liveText} from '../web/src/events.js';

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

test('closing the tab while a task runs asks first, as /classic does (#352)', () => {
  expect(page).toContain("addEventListener('beforeunload'");
  // The guard is on only while a task runs and is taken off when it ends.
  expect(app).toMatch(/if \(!busy\) return undefined;[\s\S]{0,200}addEventListener\('beforeunload', stay\)[\s\S]{0,80}removeEventListener\('beforeunload', stay\)[\s\S]{0,20}\}, \[busy\]\)/);
  expect(app).toContain("e.preventDefault(); e.returnValue = '';");
});

test('screen readers hear the status and the answer; errors and limits are alerts (#353)', () => {
  expect(page).toContain('aria-live="polite"');
  expect(app).toContain('aria-live="polite" aria-atomic="true" data-testid="turn-status">{liveText(turns, busy)}');
  expect(app).toContain('<Card role="alert"><VStack gap={2}>\n      <Text weight="semibold">{t.error.message}');
  expect(app).toContain('<Card role="alert"><VStack gap={2}>\n      <Heading level={4}>Daily limit reached');
  const turn = (t, extra) => ({task: 'x', files: [], t: {...newTurn('x'), ...t}, ...extra});
  expect(liveText([], false)).toBe('');
  expect(liveText([turn({status: 'Searching the web'})], true)).toBe('Searching the web…');
  expect(liveText([turn({status: 'Done', answer: 'Here it is.'})], false)).toBe('Answer ready: Here it is.');
  expect(liveText([turn({status: 'Done', answer: 'y'.repeat(900)})], false).length).toBe('Answer ready: '.length + 300);
  expect(liveText([turn({error: {message: 'No', kind: 'busy'}})], false)).toBe('');
  // Opening an old chat from the list is not read out.
  expect(liveText([turn({status: 'Done', answer: 'old'}, {old: true})], false)).toBe('');
});

test('a past chat can be deleted from the list, as on /classic (#355)', async () => {
  expect(page).toContain('Delete chat: ');
  expect(app).toContain("actions={<Button label={'Delete chat: ' + (c.title || 'Untitled')}");
  expect(app).toMatch(/setChats\(deleteChat\(c\.id\)\);\s*if \(c\.id === chatId\) newChat\(\);/);
  const store = {chat_history_v1: JSON.stringify([{id: 'a', title: 'A'}, {id: 'b', title: 'B'}, {id: 'c', title: 'C'}])};
  const had = globalThis.localStorage;
  globalThis.localStorage = {getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }};
  const {deleteChat, loadChats} = await import('../web/src/api.js?delete-chat'); // its own copy: other tests load api.js with a window set
  expect(deleteChat('b').map((c) => c.id)).toEqual(['a', 'c']);
  expect(loadChats().map((c) => c.id)).toEqual(['a', 'c']);
  expect(deleteChat('nope').map((c) => c.id)).toEqual(['a', 'c']);
  globalThis.localStorage = had;
});

test('the home page has one level-1 heading, as /classic does (#357)', () => {
  expect(page).toMatch(/<h1[ >]/);
  expect(app.match(/<Heading level=\{1\}/g) || []).toHaveLength(1);
  expect(app).toContain("<Heading level={1} className=\"greet\">{BOOT.login ? 'What shall we make today?'");
  // Once a chat has turns the greeting goes, and a hidden h1 names the chat; the two never show together.
  expect(app).toContain('{!turns.length && (');
  expect(app).toContain('{turns.length > 0 && <h1 className="sr-only">');
});
