import { expect, test } from 'bun:test';
import { KEYBOARD_FIT, appPage } from '../src/page.js';

const page = appPage({ login: 'ann', connected: [] });

test('the phone sidebar opens under the flisk bar, not behind it', () => {
  expect(page).toContain("$('sideopen').onclick=()=>{const fb=document.querySelector('flisk-bar'),t=fb?Math.max(0,fb.getBoundingClientRect().bottom):0;side.style.top=t+'px';side.classList.add('open');};");
});

test('on a phone the mic stays beside send when the box buttons wrap', () => {
  const phone = page.slice(page.indexOf('@media (max-width:860px)'));
  expect(phone).toContain('.composer .bar #mic{margin-left:auto}.composer .bar #mic:not([hidden])+.send{margin-left:6px}');
});

test('touch screens never get a text field under 16px (iPhone Safari zooms the page on focus)', () => {
  expect(page).toContain('@media (pointer:coarse){input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select{font-size:16px!important}}');
});

// Runs the keyboard fit against a fake iPhone: 844px tall page, keyboard leaves 553px visible.
function runFit(src, { height = 553, scale = 1 } = {}) {
  const listeners = {};
  const classes = new Set();
  const body = { style: {} };
  const vv = { height: 844, scale: 1, offsetTop: 0, addEventListener: (e, f) => { listeners[e] = f; } };
  const document = { body, documentElement: { clientHeight: 844, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } };
  new Function('window', 'document', src)({ visualViewport: vv }, document);
  Object.assign(vv, { height, scale, offsetTop: 40 });
  listeners.resize();
  return { body, classes };
}

test('keyboard open on an iPhone: the body is pinned to the visible part of the screen', () => {
  const { body, classes } = runFit(KEYBOARD_FIT);
  expect(classes.has('kbopen')).toBe(true);
  expect(body.style).toEqual({ position: 'fixed', top: '40px', left: '0', right: '0', height: '553px' });
});

test('pinch zoom is not mistaken for the keyboard', () => {
  const { body, classes } = runFit(KEYBOARD_FIT, { height: 400, scale: 2 });
  expect(classes.has('kbopen')).toBe(false);
  expect(body.style.position).toBe('');
});

test('every page carries the keyboard fit and hides the top bar while typing on a phone', () => {
  expect(page).toContain(`<script>${KEYBOARD_FIT}`);
  expect(page).toContain('html.kbopen flisk-bar,html.kbopen .top{display:none!important}');
});

test('on a phone the sidebar drawer is opaque on the Earth home (the page text must not show through it)', () => {
  expect(page).toContain('@media (max-width:860px){html[data-theme=earth].home .side{background:#0b0b0c;backdrop-filter:none}}');
});

test('touch screens get 44px tap targets on the box buttons, menu button and mode switch', () => {
  expect(page).toContain('@media (pointer:coarse){.iconbtn,.chip,.md,#mic,.excta>button{min-height:44px;min-width:44px}.composer .send{width:44px;height:44px}#newchat{min-height:44px}');
});

test('phone composer puts the modes on their own row and shrinks the model picker to an icon', () => {
  const src = require('fs').readFileSync(new URL('../src/page.js', import.meta.url), 'utf8');
  expect(src).toContain('.composer .bar .modes{order:-1;width:100%;margin:0;display:flex}');
  expect(src).toContain('.composer .bar .mpname,.composer .bar #mpbtn .chev{display:none}');
});
