// AI settings for PR reviews, kept per GitHub login. The key is encrypted (AES-GCM) with KEY_SECRET before it reaches D1.
const enc = new TextEncoder();
const b64 = (u) => btoa(String.fromCharCode(...u));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aes(secret) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(`chat-review-keys:${secret}`)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(secret, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(secret), enc.encode(text)));
  return b64(new Uint8Array([...iv, ...ct]));
}

export async function open(secret, sealed) {
  try {
    const all = unb64(sealed);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aes(secret), all.slice(12)));
  } catch {
    return null;
  }
}

// One sealed secret per login, with its plain companion columns: INSERT, or replace on the same login.
// Table and column names come from this repo's own callers, never from a request.
export async function upsertSealed(env, table, login, secretCol, secret, fields = {}) {
  const cols = ['login', ...Object.keys(fields), secretCol, 'updated'];
  const vals = [login, ...Object.values(fields), await seal(env.KEY_SECRET, secret), new Date().toISOString()];
  const set = cols.slice(1).map((c) => `${c} = excluded.${c}`).join(', ');
  await env.DB.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(login) DO UPDATE SET ${set}`).bind(...vals).run();
}

export async function saveSettings(env, login, { ai, model, key }) {
  if (!env.KEY_SECRET) return { error: 'key storage is not set up yet' };
  await upsertSealed(env, 'ai_settings', login, 'key_enc', key, { ai, model });
  return { ok: true };
}

export const deleteSettings = (env, login) => env.DB.prepare('DELETE FROM ai_settings WHERE login = ?').bind(login).run();

// What a login saved: { ai, model } for the page (never the key), or the full choice for the review bot.
export async function loadSettings(env, login, { withKey = false } = {}) {
  const row = await env.DB.prepare('SELECT ai, model, key_enc FROM ai_settings WHERE login = ?').bind(login).first();
  if (!row) return null;
  if (!withKey) return { ai: row.ai, model: row.model };
  const key = env.KEY_SECRET ? await open(env.KEY_SECRET, row.key_enc) : null;
  return key ? { ai: row.ai, model: row.model, key } : null;
}
