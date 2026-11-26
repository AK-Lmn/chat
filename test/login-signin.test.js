import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { makeKeys, signToken } from './login-signer.js';

const ORIGIN = 'https://chat.test';
const keys = await makeKeys();
const other = await makeKeys();
const env = { PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', LOGIN_PUBLIC_KEY: keys.publicKey };
const done = (s, token, cookie = `__Host-chat_state=${s}`) => handle(new Request(`${ORIGIN}/auth/done?s=${s}&flisk_token=${encodeURIComponent(token)}`, { headers: { cookie } }), env, {});

describe('sign-in through login.flisk.si', () => {
  test('/auth/start goes to login.flisk.si with a state cookie, needing no GitHub app', async () => {
    const res = await handle(new Request(`${ORIGIN}/auth/start`), env, {});
    const to = new URL(res.headers.get('location'));
    expect(to.origin + to.pathname).toBe('https://login.flisk.si/start');
    const s = new URL(to.searchParams.get('return')).searchParams.get('s');
    expect(res.headers.get('set-cookie')).toContain(`__Host-chat_state=${s}`);
  });
  test('?again=1 still asks GitHub for repo access', async () => {
    const res = await handle(new Request(`${ORIGIN}/auth/start?again=1`), { ...env, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'x' }, {});
    expect(res.headers.get('location')).toContain('github.com/login/oauth/authorize');
  });
  test('a good token signs the visitor in', async () => {
    const r = await done('x', await signToken(keys.signingKey, { login: 'ann', id: 1, aud: ORIGIN }));
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/');
    expect(r.headers.getSetCookie().join(';')).toContain('chat_sess=');
  });
  test.each([
    ['another site', () => signToken(keys.signingKey, { login: 'ann', id: 1, aud: 'https://learn.flisk.si' })],
    ['another key', () => signToken(other.signingKey, { login: 'ann', id: 1, aud: ORIGIN })],
    ['an expired token', () => signToken(keys.signingKey, { login: 'ann', id: 1, aud: ORIGIN }, Date.now() - 3600e3)],
    ['an anonymous-looking login', () => signToken(keys.signingKey, { login: 'anon-1', id: 1, aud: ORIGIN })],
  ])('refuses %s', async (_, make) => {
    expect((await done('x', await make())).status).toBe(400);
  });
  test('refuses a wrong or missing state', async () => {
    const t = await signToken(keys.signingKey, { login: 'ann', id: 1, aud: ORIGIN });
    expect((await done('x', t, 'chat_state=y')).status).toBe(400);
    expect((await done('x', t, '')).status).toBe(400);
  });
});
