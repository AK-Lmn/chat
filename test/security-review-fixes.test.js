import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { safeEqual } from '../src/session.js';
import { isPrivateHost, web } from '../src/widgets.js';
import { runScript } from '../src/run.js';
import { applyEv, newTurn } from '../web/src/events.js';

test('safeEqual compares whole strings and tolerates different lengths', () => {
  expect(safeEqual('abc', 'abc')).toBe(true);
  expect(safeEqual('abc', 'abd')).toBe(false);
  expect(safeEqual('abc', 'abcd')).toBe(false);
  expect(safeEqual('', 'x')).toBe(false);
});

test('the web widget refuses private and local hosts, including ranges the old denylist missed', () => {
  for (const h of ['localhost', 'a.localhost', 'printer.local', 'svc.internal', '127.0.0.1', '10.1.2.3', '172.16.0.5', '172.31.255.1', '0.0.0.0', '100.64.0.1', '169.254.169.254', '192.168.1.1', '[::1]']) {
    expect(isPrivateHost(h)).toBe(true);
  }
  for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', 'feeds.bbci.co.uk']) expect(isPrivateHost(h)).toBe(false);
});

test('the web widget checks every redirect hop before following it', async () => {
  const calls = [];
  const fetch = async (u) => {
    calls.push(u);
    return new Response(null, { status: 302, headers: { location: 'http://172.16.0.9/admin' } });
  };
  const r = await web({ url: 'https://news.example.com/start' }, { fetch });
  expect(r.error).toContain('private address');
  expect(calls).toEqual(['https://news.example.com/start']);
});

test('the PR runner removes the clone token from disk and from the checkout before the PR code runs', () => {
  const s = runScript({
    pr: 7,
    cloneUrl: 'https://x-access-token:SECRET@github.com/o/r.git',
    publicUrl: 'https://github.com/o/r.git',
    callback: 'https://chat.test/github/run-result?x=1',
  });
  expect(s.startsWith('#!/bin/sh\nrm -f "$0"')).toBe(true);
  expect(s).toContain("git remote set-url origin 'https://github.com/o/r.git'");
  // The set-url must come before any PR command runs.
  expect(s.indexOf('set-url')).toBeLessThan(s.indexOf('if [ -f package.json ]'));
  expect(s).toContain('x-access-token:***@');
});

test('task events only turn web addresses into links', () => {
  expect(applyEv(newTurn('t'), { type: 'output', live: 'javascript:alert(1)' }).link).toBe('');
  expect(applyEv(newTurn('t'), { type: 'output', live: 'https://example.com/a' }).link).toBe('https://example.com/a');
  const t = applyEv(newTurn('t'), { type: 'websources', results: [{ url: 'data:text/html,x', title: 'bad' }, { url: 'https://ok.example', title: 'ok' }] });
  expect(t.sources.map((s) => s.url)).toEqual(['https://ok.example']);
});

test('sign-in state cookie is a __Host- cookie, so another site cannot set it', async () => {
  const env = { PUBLIC_ORIGIN: 'https://chat.test', SESSION_SECRET: 's', LOGIN_PUBLIC_KEY: 'k', LOGIN_ORIGIN: 'https://login.test' };
  const res = await handle(new Request('https://chat.test/auth/start'), env, {});
  expect(res.headers.get('set-cookie')).toMatch(/^__Host-chat_state=.+; Path=\/; HttpOnly; Secure/);
});

test('sign-out from another site does not end the session', async () => {
  const res = await handle(new Request('https://chat.test/auth/signout', { headers: { 'sec-fetch-site': 'cross-site' } }), {}, {});
  expect(res.headers.get('set-cookie')).toBeNull();
});

test('DEV_LOGIN is ignored outside localhost', async () => {
  const env = { PUBLIC_ORIGIN: 'https://chat.flisk.si', SESSION_SECRET: 's', DEV_LOGIN: 'someone' };
  const res = await handle(new Request('https://chat.flisk.si/auth/start'), env, {});
  expect(res.headers.get('set-cookie') || '').not.toContain('chat_sess=');
});
