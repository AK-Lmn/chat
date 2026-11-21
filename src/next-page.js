// The new Astryx look of the chat, served at /next while the current page at / stays as it is.
// The app itself is built from web/ (see scripts/embed-web.mjs) into next-app.generated.js; this only wraps it in a page
// and hands it what the server knows about the visitor (the same facts the current page gets).
import { NEXT_CSS, NEXT_JS } from './next-app.generated.js';
import { EARTH_JS } from './earth.js';
import { CATS, KEY_PAGES, PROVIDER_CARDS, PROVIDER_NAMES } from './page.js';

const LS = new RegExp('[\\u2028\\u2029]', 'g');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '');

export function nextPage({ login = null, anon = false, connected = [], models = [], names = {}, theme = 'earth', here = null, pod = '', inf = '' } = {}) {
  const boot = { login, anon, connected, models, names, theme, here, pod, inf, cats: CATS, cards: PROVIDER_CARDS, providerNames: PROVIDER_NAMES, keyPages: KEY_PAGES };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<title>Flisk Chat</title><meta name="robots" content="noindex">
<style>${NEXT_CSS}</style></head><body><canvas id="earth" class="earthc" aria-hidden="true"></canvas><div id="root"></div>
<script>window.__BOOT__=${json(boot)}</script>
<script type="module">${NEXT_JS}</script>
<script>${EARTH_JS}</script></body></html>`;
}

// The Astryx fonts are inlined in the CSS as data: URLs, which the shared policy does not allow for fonts.
export const nextCsp = (csp) => csp.replace('font-src ', 'font-src data: ');
