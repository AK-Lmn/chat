// GitHub App access: webhook signature check, the App's installation token, and a small REST caller.
// Shared by the review bot (review.js) and the test-run callback (run.js), so neither imports the other.
const API = 'https://api.github.com';
const enc = new TextEncoder();
const b64url = (u) => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hexOf = (u) => [...new Uint8Array(u)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function verifySignature(secret, body, header) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(header || '')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  const got = header.slice(7);
  let diff = want.length ^ got.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
  return diff === 0;
}

// The App's private key must be PKCS#8 PEM (openssl pkcs8 -topk8 -nocrypt -in app.pem), the one GitHub hands out is PKCS#1.
async function appJwt(env, now = Date.now()) {
  const der = Uint8Array.from(atob(String(env.GITHUB_APP_KEY).replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(now / 1000) - 30;
  const head = b64url(enc.encode('{"alg":"RS256","typ":"JWT"}'));
  const body = b64url(enc.encode(JSON.stringify({ iat, exp: iat + 540, iss: env.GITHUB_APP_ID })));
  return `${head}.${body}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)))}`;
}

export async function installToken(env, id, scope, fetchImpl, now = Date.now()) {
  const res = await fetchImpl(`${API}/app/installations/${id}/access_tokens`, { method: 'POST', headers: { authorization: `Bearer ${await appJwt(env, now)}`, accept: 'application/vnd.github+json', 'user-agent': 'flisk-chat-review', ...(scope ? { 'content-type': 'application/json' } : {}) }, body: scope ? JSON.stringify(scope) : undefined });
  return res.ok ? (await res.json()).token : null;
}

export function gh(token, fetchImpl) {
  return async (path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) => {
    const res = await fetchImpl(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'flisk-chat-review', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, ok: res.ok, text: res.ok || res.status === 422 ? await res.text() : '' };
  };
}
