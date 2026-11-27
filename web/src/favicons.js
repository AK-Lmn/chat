// Favicon and app icon set generator (plugin: studio.icons).
// Turns any image into favicon.ico (16/32/48), PNG favicons, apple-touch-icon.png, PWA icons, site.webmanifest, and a single-click ZIP, all in the browser.

export const ICON_SIZES = [
  {name: 'favicon-16x16.png', size: 16, label: 'Browser tab (16×16)', ico: true},
  {name: 'favicon-32x32.png', size: 32, label: 'Retina tab (32×32)', ico: true},
  {name: 'favicon-48x48.png', size: 48, label: 'Desktop & search (48×48)', ico: true},
  {name: 'apple-touch-icon.png', size: 180, label: 'iOS home screen (180×180)'},
  {name: 'icon-192.png', size: 192, label: 'Android & PWA (192×192)'},
  {name: 'icon-512.png', size: 512, label: 'Splash & store (512×512)'},
];

export const ICON_HTML = [
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
].join('\n');

const QUESTION = /^(?:what|why|how|who|when|where|explain)\b/;

export function parseIconCommand(text) {
  const t = String(text || '').toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80 || QUESTION.test(t)) return null;
  if (
    /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:make|create|generate|build|export)\s+(?:a\s+|an\s+|the\s+)?(?:favicon(?:\s+and\s+app\s+icon)?|favicons|app\s+icons?|icon\s+set|icons)(?:\s+(?:set|pack))?(?:\s+from\s+(?:this|it|(?:this|the)\s+(?:image|photo|picture|pic|logo)))?$/.test(t)
    || /^(?:please\s+|can you\s+|could you\s+)?turn\s+(?:this|it|(?:this|the)\s+(?:image|photo|picture|pic|logo))\s+into\s+(?:a\s+|an\s+)?(?:favicon(?:\s+and\s+app\s+icon)?|favicons|app\s+icons?|icon\s+set|icons)(?:\s+(?:set|pack))?$/.test(t)
    || /^favicon(?:\s+and\s+app\s+icon)?\s+set$/.test(t)
  ) {
    return {cmd: 'makeIcons'};
  }
  return null;
}

export function buildManifest(name = 'App') {
  return JSON.stringify({
    name,
    short_name: name,
    icons: [
      {src: '/icon-192.png', sizes: '192x192', type: 'image/png'},
      {src: '/icon-512.png', sizes: '512x512', type: 'image/png'},
    ],
  }, null, 2) + '\n';
}

// Multi-size ICO container embedding PNG payloads (supported by all modern browsers and OSes).
export function buildIco(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('At least one icon entry is required.');
  const head = 6 + entries.length * 16;
  const total = head + entries.reduce((n, e) => n + e.png.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); // reserved
  dv.setUint16(2, 1, true); // type: 1 = icon
  dv.setUint16(4, entries.length, true);

  let offset = head;
  entries.forEach((e, i) => {
    const pos = 6 + i * 16;
    const dim = e.size >= 256 ? 0 : e.size;
    out[pos] = dim;
    out[pos + 1] = dim;
    out[pos + 2] = 0; // palette colors
    out[pos + 3] = 0; // reserved
    dv.setUint16(pos + 4, 1, true); // color planes
    dv.setUint16(pos + 6, 32, true); // bits per pixel
    dv.setUint32(pos + 8, e.png.length, true);
    dv.setUint32(pos + 12, offset, true);
    out.set(e.png, offset);
    offset += e.png.length;
  });
  return out;
}

import { buildZip, crc32 } from './zip.js';

export { buildZip, crc32 };

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    let revoke = '';
    const cleanup = () => { if (revoke) URL.revokeObjectURL(revoke); };
    im.onload = () => { cleanup(); resolve(im); };
    im.onerror = () => { cleanup(); reject(new Error('Could not read that image. Try a PNG, JPEG, WebP, or SVG.')); };
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      revoke = URL.createObjectURL(source);
      im.src = revoke;
    } else if (source && source.content) {
      const mime = source.type || (/\.(svg)$/i.test(source.name || '') ? 'image/svg+xml' : 'image/png');
      im.src = 'data:' + mime + ';base64,' + source.content;
    } else {
      reject(new Error('No image provided.'));
    }
  });
}

function renderSquarePng(im, size) {
  return new Promise((resolve, reject) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const w = im.naturalWidth || im.width || size;
    const h = im.naturalHeight || im.height || size;
    const side = Math.min(w, h);
    const sx = Math.max(0, (w - side) / 2);
    const sy = Math.max(0, (h - side) / 2);
    ctx.drawImage(im, sx, sy, side, side, 0, 0, size, size);
    c.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Could not encode PNG.')); return; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      resolve({bytes, url: URL.createObjectURL(blob)});
    }, 'image/png');
  });
}

export async function generateIconSet(source) {
  const im = await loadImage(source);
  const items = [];
  for (const spec of ICON_SIZES) {
    const {bytes, url} = await renderSquarePng(im, spec.size);
    items.push({...spec, bytes, url});
  }
  const icoBytes = buildIco(items.filter((x) => x.ico).map((x) => ({size: x.size, png: x.bytes})));
  const icoUrl = URL.createObjectURL(new Blob([icoBytes], {type: 'image/x-icon'}));
  const manifest = buildManifest();
  const zipBytes = buildZip([
    {name: 'favicon.ico', data: icoBytes},
    ...items.map((x) => ({name: x.name, data: x.bytes})),
    {name: 'site.webmanifest', data: manifest},
  ]);
  const zipUrl = URL.createObjectURL(new Blob([zipBytes], {type: 'application/zip'}));
  const sourceName = (source && source.name) || 'image';
  const dispose = () => {
    items.forEach((x) => URL.revokeObjectURL(x.url));
    URL.revokeObjectURL(icoUrl);
    URL.revokeObjectURL(zipUrl);
  };
  return {sourceName, items, icoBytes, icoUrl, manifest, html: ICON_HTML, zipBytes, zipUrl, dispose};
}
