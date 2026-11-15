// The hero photo of a layout page, drawn by Workers AI (FLUX.1 schnell, about 4 seconds and some 55 of the account's free
// 10,000 daily neurons). The free neurons are shared with inference.flisk.si, so photos have a daily cap per login and
// one for everybody, counted in D1. Anything that goes wrong (cap reached, a slow or failed model, no table yet) gives
// no photo, and the page is drawn with its dark glow instead: a photo never stops a page from being published.

export const PHOTO_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const PHOTOS_PER_LOGIN = 10; // a day
export const PHOTOS_PER_DAY = 80; // a day, for everybody
const PHOTO_MS = 25_000;

// Counts one photo for the login and for everybody today; false when either count is already at its cap.
export async function takePhotoSlot(env, login, day = new Date().toISOString().slice(0, 10)) {
  const rows = await env.DB.prepare('SELECT login, n FROM site_photos WHERE day = ? AND login IN (?, ?)').bind(day, login, '*').all();
  const n = Object.fromEntries((rows.results || []).map((r) => [r.login, r.n]));
  if ((n[login] || 0) >= PHOTOS_PER_LOGIN || (n['*'] || 0) >= PHOTOS_PER_DAY) return false;
  const up = 'INSERT INTO site_photos (day, login, n) VALUES (?, ?, 1) ON CONFLICT (day, login) DO UPDATE SET n = n + 1';
  await env.DB.batch([env.DB.prepare(up).bind(day, login), env.DB.prepare(up).bind(day, '*')]);
  return true;
}

// A data: URL of the photo, or '' when there is none.
export async function sitePhoto(env, login, prompt, { ms = PHOTO_MS } = {}) {
  if (!env.AI || !prompt) return '';
  try {
    if (!(await takePhotoSlot(env, login))) return '';
    let timer;
    const out = await Promise.race([
      env.AI.run(PHOTO_MODEL, { prompt: String(prompt).slice(0, 2000), steps: 4 }),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('photo took too long')), ms); }),
    ]).finally(() => clearTimeout(timer));
    const b64 = typeof out?.image === 'string' ? out.image : '';
    return /^[A-Za-z0-9+/=]{1000,}$/.test(b64) ? `data:image/jpeg;base64,${b64}` : '';
  } catch {
    return '';
  }
}
