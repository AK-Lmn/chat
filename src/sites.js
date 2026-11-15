// Ready page layouts for show-only websites. The model sends only the words ({"site": {...}}) and chat draws the page, so a
// small free model still gets a page that looks finished, works at phone width, and costs far fewer tokens than writing
// a whole HTML file. Nothing here needs a computer: the page is made on the Worker and published like any other page.
//
// The pages use two of the Flisk looks (flisk-sh/flisk-themes): "cinematic", the black page of chat.flisk.si with thin
// Inter and a full-bleed photo, and "editorial", the ruled paper page of inference.flisk.si with Fraunces headlines and
// mono labels. A photo drawn for the page (photo.js) sits in the hero; without one the hero is a dark glow.
//
// Contact details are never taken from the model: every page ends with "Add your ... here" placeholders, and anything that
// looks like an email address or a phone number is removed from the words, so a page never shows invented contacts.

import { FRAUNCES, INTER, MONO } from './fonts.js';

export const LAYOUTS = ['landing', 'portfolio', 'menu', 'event', 'prices'];
export const LOOKS = ['cinematic', 'editorial'];

// Accents from flisk-themes: [accent, accent text on dark, accent text on paper, text on the accent, dark page background].
export const ACCENTS = {
  flisk: ['#22C55E', '#6EE7A0', '#16A34A', '#04120A', '#0A0A0E'],
  graphite: ['#4e7bbc', '#97b2d8', '#3b5f94', '#ffffff', '#090a0b'],
  midnight: ['#1d96ed', '#7bc2f4', '#0b6fb8', '#ffffff', '#06090e'],
  forest: ['#e0a929', '#edcd82', '#8a6100', '#1a1203', '#070d0a'],
};
const DEFAULTS = {
  landing: ['cinematic', 'midnight'],
  portfolio: ['editorial', 'graphite'],
  menu: ['cinematic', 'forest'],
  event: ['cinematic', 'graphite'],
  prices: ['editorial', 'flisk'],
};

// What the model is told, added to its instructions.
export const SITE_HELP = `{"site": {"layout": "landing", "look": "<cinematic|editorial>", "accent": "<flisk|graphite|midnight|forest>", "photo": "<what the hero photo shows, one sentence, a real scene, no text in it>", "title": "<name>", "tagline": "<one line>", "about": "<2-3 sentences>", ...}}
"cinematic" is a black page with a full-screen photo (food, venues, products, launches); "editorial" is a ruled paper page (portfolios, studios, services, price lists).
Extra fields per layout (all optional, short words, only what the user gave or plain sensible text; never invent a phone number, email or street address, chat adds "Add your ... here" lines itself):
- landing: "button": "<call to action>", "features": [{"title": "", "text": ""}] (3 to 6)
- portfolio: "skills": ["..."], "projects": [{"title": "", "text": "", "tag": ""}]
- menu: "sections": [{"name": "Breakfast", "items": [{"name": "", "price": "", "text": ""}]}], "hours": ["Mon-Fri 8:00-18:00"]
- event: "when": "", "where": "<venue or city>", "button": "", "schedule": [{"time": "", "title": "", "text": ""}], "speakers": [{"name": "", "text": ""}]
- prices: "plans": [{"name": "", "price": "", "per": "month", "features": [""], "best": true}], "faq": [{"q": "", "a": ""}]`;

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi;
const PHONEISH = /\+?\(?\d[\d\s().-]{7,}\d/g;
// A run of digits is a phone number when it has 9 or more digits and is not a date or a time range.
const noContacts = (s) =>
  s.replace(EMAIL, '').replace(PHONEISH, (m) => (m.replace(/\D/g, '').length >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m.trim()) ? '' : m));

const str = (v, max = 160) => {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return noContacts(String(v)).replace(/\s+/g, ' ').trim().slice(0, max);
};
const list = (v, n, fn) => (Array.isArray(v) ? v.slice(0, n).map(fn).filter(Boolean) : []);
const card = (o) => {
  const title = str(o?.title ?? o?.name, 80);
  const text = str(o?.text, 280);
  return title || text ? { title, text } : null;
};
const pick = (v, allowed, fallback) => {
  const k = String(v || '').toLowerCase().trim();
  return allowed.includes(k) ? k : fallback;
};

// The model's words, cleaned and cut to size. null when it is not a usable page (no layout we have, or no title).
export function cleanSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const layout = String(raw.layout || '').toLowerCase().trim();
  const title = str(raw.title, 80);
  if (!LAYOUTS.includes(layout) || !title) return null;
  const [look, accent] = DEFAULTS[layout];
  const s = {
    layout,
    look: pick(raw.look, LOOKS, look),
    accent: pick(raw.accent ?? raw.colour ?? raw.color, Object.keys(ACCENTS), accent),
    photo: str(raw.photo, 300),
    title,
    tagline: str(raw.tagline, 160),
    about: str(raw.about, 700),
    button: str(raw.button, 40),
  };
  if (layout === 'landing') s.features = list(raw.features, 6, card);
  if (layout === 'portfolio') {
    s.skills = list(raw.skills, 12, (x) => str(x, 40));
    s.projects = list(raw.projects, 8, (o) => {
      const c = card(o);
      return c && { ...c, tag: str(o?.tag, 30) };
    });
  }
  if (layout === 'menu') {
    s.sections = list(raw.sections, 6, (sec) => {
      const items = list(sec?.items, 14, (it) => {
        const name = str(it?.name, 70);
        return name ? { name, price: str(it?.price, 16), text: str(it?.text, 160) } : null;
      });
      return items.length ? { name: str(sec?.name, 50), items } : null;
    });
    s.hours = list(raw.hours, 7, (x) => str(x, 60));
  }
  if (layout === 'event') {
    s.when = str(raw.when, 80);
    s.where = str(raw.where, 80);
    s.schedule = list(raw.schedule, 12, (o) => {
      const c = card(o);
      return c && { ...c, time: str(o?.time, 20) };
    });
    s.speakers = list(raw.speakers, 8, card);
  }
  if (layout === 'prices') {
    s.plans = list(raw.plans, 4, (p) => {
      const name = str(p?.name, 40);
      return name ? { name, price: str(p?.price, 20), per: str(p?.per, 20), features: list(p?.features, 8, (x) => str(x, 80)), best: p?.best === true } : null;
    });
    s.faq = list(raw.faq, 6, (o) => {
      const q = str(o?.q, 140);
      const a = str(o?.a, 400);
      return q && a ? { q, a } : null;
    });
  }
  return s;
}

// What the photo model is asked for: the scene the model described (or one made from the words) in the page's style.
const SCENE = {
  landing: 'the product or the place it is used, in a beautiful real setting',
  portfolio: 'the workspace and tools of this kind of work, with finished work in view',
  menu: 'a signature dish on a table in the restaurant',
  event: 'the venue prepared for the event at golden hour',
  prices: 'the service being done well, calm and tidy',
};
export function photoPrompt(s) {
  const scene = s.photo || `${s.title}${s.tagline ? `, ${s.tagline}` : ''}: ${SCENE[s.layout]}`;
  const style =
    s.look === 'editorial'
      ? 'Editorial magazine photograph, 8k HDR, soft natural window light, muted warm tones, precise composition, fine detail'
      : 'Cinematic 8k HDR photograph, dramatic low-key lighting, deep blacks, glowing highlights, shallow depth of field, wide composition with dark empty space on the left';
  return `${style}. ${scene}. Photorealistic, no text, no letters, no logos, no watermark, no close-up faces.`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const pad = (i) => String(i + 1).padStart(2, '0');

// Contact lines a person fills in later: chat never writes real-looking contact details.
const CONTACT = {
  landing: ['Add your email here'],
  portfolio: ['Add your email here', 'Add your links here'],
  menu: ['Add your address here', 'Add your phone number here'],
  event: ['Add the venue address here', 'Add your email here'],
  prices: ['Add your email here'],
};
const KIND = { landing: 'Introducing', portfolio: 'Portfolio', menu: 'Menu', event: 'Event', prices: 'Plans and prices' };

// The sections under the hero, as [label, heading, inner html]. Both looks draw the same parts in their own way.
function parts(s) {
  const out = [];
  const lead = s.about ? `<p class="lead">${esc(s.about)}</p>` : '';
  const rows = (items) =>
    `<div class="rows">${items.map((r, i) => `<div class="r"><span class="n">${esc(r.n ?? pad(i))}</span><b>${esc(r.t)}</b><p>${esc(r.x || '')}</p></div>`).join('')}</div>`;
  if (s.layout === 'landing') {
    if (s.about) out.push(['About', s.tagline || s.title, lead]);
    if (s.features.length) out.push(['What you get', 'Made with care', rows(s.features.map((c) => ({ t: c.title, x: c.text })))]);
  }
  if (s.layout === 'portfolio') {
    const tags = s.skills.length ? `<ul class="tags">${s.skills.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    if (lead || tags) out.push(['About', s.tagline || s.title, lead + tags]);
    if (s.projects.length)
      out.push(['Selected work', 'Work', `<div class="grid">${s.projects.map((c, i) => `<div class="cell"><span class="n">${esc(c.tag || pad(i))}</span>${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${c.text ? `<p>${esc(c.text)}</p>` : ''}</div>`).join('')}</div>`]);
  }
  if (s.layout === 'menu') {
    if (s.about) out.push(['About', s.tagline || s.title, lead]);
    for (const m of s.sections)
      out.push(['Menu', m.name || 'Menu', `<ul class="menu">${m.items.map((it) => `<li><div class="ln"><b>${esc(it.name)}</b><i></i>${it.price ? `<span class="pr">${esc(it.price)}</span>` : ''}</div>${it.text ? `<p>${esc(it.text)}</p>` : ''}</li>`).join('')}</ul>`]);
    if (s.hours.length) out.push(['Visit', 'Opening hours', rows(s.hours.map((h) => { const m = /^(\S+(?:\s*[-–]\s*\S+)?)\s+(.+)$/.exec(h); return m ? { n: m[1], t: m[2] } : { n: '', t: h }; }))]);
  }
  if (s.layout === 'event') {
    if (s.about) out.push(['About', s.tagline || s.title, lead]);
    if (s.schedule.length) out.push(['Programme', 'The day', rows(s.schedule.map((x) => ({ n: x.time, t: x.title, x: x.text })))]);
    if (s.speakers.length) out.push(['People', 'Who is there', `<div class="grid">${s.speakers.map((c, i) => `<div class="cell"><span class="n">${pad(i)}</span>${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${c.text ? `<p>${esc(c.text)}</p>` : ''}</div>`).join('')}</div>`]);
  }
  if (s.layout === 'prices') {
    if (s.plans.length)
      out.push(['Plans', 'Pick a plan', `<div class="grid plans">${s.plans.map((p) => `<div class="cell plan${p.best ? ' best' : ''}"><span class="n">${p.best ? 'Most popular' : esc(p.name)}</span>${p.best ? `<h3>${esc(p.name)}</h3>` : ''}<p class="price">${esc(p.price)}${p.per ? `<small> / ${esc(p.per)}</small>` : ''}</p>${p.features.length ? `<ul class="ticks">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}<a class="btn ${p.best ? '' : 'ghost'}" href="#contact">Choose ${esc(p.name)} <span aria-hidden="true">→</span></a></div>`).join('')}</div>`]);
    if (s.about) out.push(['About', s.tagline || s.title, lead]);
    if (s.faq.length) out.push(['Questions', 'Good to know', s.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')]);
  }
  return out;
}

// Short facts under the hero title: when and where, skills, hours, or the first plans.
function facts(s) {
  if (s.layout === 'event') return [s.when, s.where].filter(Boolean);
  if (s.layout === 'portfolio') return s.skills.slice(0, 3);
  if (s.layout === 'menu') return s.hours.slice(0, 3);
  if (s.layout === 'prices') return s.plans.slice(0, 3).map((p) => `${p.name} ${p.price}`.trim());
  return s.features.slice(0, 3).map((f) => f.title).filter(Boolean);
}

const FONTS = (looks) =>
  `@font-face{font-family:Inter;src:url(${INTER}) format("woff2");font-weight:300 600;font-display:swap}` +
  (looks === 'editorial'
    ? `@font-face{font-family:Fraunces;src:url(${FRAUNCES}) format("woff2");font-weight:800;font-display:swap}@font-face{font-family:"JetBrains Mono";src:url(${MONO}) format("woff2");font-weight:500;font-display:swap}`
    : '');
const SANS = 'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const MONOS = '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace';
// A fine grain over the page, drawn by an SVG noise filter: no image file.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='.55'/%3E%3C/svg%3E")`;

function cinematicCss(s, hasPhoto) {
  const [acc, accInk, , onAcc, bg] = ACCENTS[s.accent];
  const glow = `radial-gradient(60% 70% at 78% 38%,${rgba(acc, 0.32)},transparent 70%),radial-gradient(40% 50% at 95% 90%,${rgba(acc, 0.18)},transparent 70%),radial-gradient(50% 60% at 60% 0%,rgba(255,255,255,.06),transparent 70%)`;
  return `${FONTS('cinematic')}
:root{--bg:${bg};--ink:#EDEDEE;--dim:#8D8D92;--line:rgba(255,255,255,.1);--acc:${acc};--acci:${accInk}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:300 17px/1.6 ${SANS};overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
a{color:inherit}.w{max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,40px)}
nav{position:absolute;top:0;left:0;right:0;z-index:3}nav .w{display:flex;align-items:center;justify-content:space-between;height:76px}
.mark{font-weight:400;font-size:15px;letter-spacing:.32em;text-transform:uppercase;text-decoration:none}.nl{font-size:14px;color:var(--dim);text-decoration:none}.nl:hover{color:var(--ink)}
.hero{position:relative;min-height:100vh;min-height:100svh;display:flex;align-items:flex-end;overflow:hidden;isolation:isolate}
.ph{position:absolute;inset:0;z-index:-2;background:${hasPhoto ? 'var(--photo) center/cover no-repeat' : glow};${hasPhoto ? 'animation:drift 2.6s cubic-bezier(.2,.7,.2,1) both' : ''}}
.hero:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,var(--bg) 0%,${rgba(bg, 0.82)} 30%,${rgba(bg, 0.2)} 62%,transparent 80%),linear-gradient(0deg,var(--bg) 0%,${rgba(bg, 0.6)} 22%,transparent 48%),linear-gradient(180deg,${rgba(bg, 0.7)} 0%,transparent 22%)}
.hc{width:100%;padding-bottom:clamp(48px,9vh,96px);animation:rise 1.1s .15s cubic-bezier(.2,.7,.2,1) both}
.eb{font-size:13px;color:var(--dim);margin:0 0 22px;letter-spacing:.02em}
h1{font-weight:300;font-size:clamp(48px,8.4vw,116px);line-height:.98;letter-spacing:-.045em;margin:0;max-width:11ch}
.tl{font-size:clamp(19px,2.2vw,24px);line-height:1.4;color:#C9C9CD;margin:22px 0 0;max-width:30ch}
.bt{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:12px 18px;background:var(--ink);color:#000;font-weight:500;font-size:15px;text-decoration:none;border:1px solid var(--ink);transition:background .2s,color .2s}
.btn:hover{background:transparent;color:var(--ink)}.btn.ghost{background:rgba(255,255,255,.08);color:var(--ink);border-color:rgba(255,255,255,.14);backdrop-filter:blur(8px)}.btn.ghost:hover{background:rgba(255,255,255,.16)}
.facts{display:flex;flex-wrap:wrap;gap:0;margin:clamp(40px,7vh,72px) 0 0;padding:22px 0 0;border-top:1px solid var(--line);list-style:none}
.facts li{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);padding-right:28px;margin-right:28px;border-right:1px solid var(--line)}.facts li:last-child{border:0}
.sec{padding:clamp(80px,13vh,140px) 0;border-top:1px solid var(--line)}
.lb{font-size:13px;color:var(--dim);margin:0 0 18px}h2{font-weight:300;font-size:clamp(34px,4.8vw,60px);line-height:1.04;letter-spacing:-.035em;margin:0 0 clamp(36px,6vh,56px);max-width:18ch}
.lead{font-size:clamp(20px,2.3vw,26px);line-height:1.45;color:#C9C9CD;max-width:36ch;margin:0}
.band{margin-top:clamp(48px,8vh,80px);aspect-ratio:21/9;background:var(--photo) 50% 60%/cover;position:relative}.band:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,${rgba(bg, 0.55)},transparent 40%)}
.rows{border-bottom:1px solid var(--line)}.r{display:grid;grid-template-columns:minmax(80px,180px) minmax(0,1fr) minmax(0,1.3fr);gap:24px;padding:24px 0;border-top:1px solid var(--line);align-items:baseline}
.r .n{font-size:14px;color:var(--dim)}.r b{font-weight:400;font-size:19px}.r p{margin:0;color:var(--dim)}.r:hover b{color:var(--acci)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
.cell{background:var(--bg);padding:32px 28px}.cell .n{display:block;font-size:13px;color:var(--dim);margin-bottom:28px}.cell h3{font-weight:400;font-size:24px;letter-spacing:-.02em;margin:0 0 10px}.cell p{margin:0;color:var(--dim)}
.tags{list-style:none;padding:0;margin:36px 0 0;display:flex;flex-wrap:wrap;gap:8px}.tags li{border:1px solid var(--line);padding:6px 14px;font-size:14px;color:#C9C9CD}
.menu{list-style:none;margin:0;padding:0;max-width:820px}.menu li{padding:22px 0;border-top:1px solid var(--line)}.menu li:last-child{border-bottom:1px solid var(--line)}
.ln{display:flex;gap:14px;align-items:baseline}.ln b{font-weight:400;font-size:20px}.ln i{flex:1;border-bottom:1px dotted rgba(255,255,255,.22);min-width:16px}.pr{font-size:19px;color:var(--acci);font-variant-numeric:tabular-nums}.menu p{margin:6px 0 0;color:var(--dim);font-size:16px}
.plan{display:flex;flex-direction:column}.plan.best{box-shadow:inset 0 2px 0 var(--acc);background:linear-gradient(180deg,${rgba(acc, 0.1)},var(--bg) 60%)}.plan.best .n{color:var(--acci)}
.price{font-size:52px;font-weight:300;letter-spacing:-.04em;margin:0 0 20px;color:var(--ink)!important}.price small{font-size:16px;color:var(--dim);letter-spacing:0}
.ticks{list-style:none;padding:0;margin:0 0 28px;flex:1}.ticks li{padding:9px 0;border-top:1px solid var(--line);color:#C9C9CD}.plan .btn{align-self:flex-start}
details{border-top:1px solid var(--line);padding:22px 0}details:last-child{border-bottom:1px solid var(--line)}summary{cursor:pointer;font-size:19px;list-style:none;display:flex;justify-content:space-between;gap:16px}summary::-webkit-details-marker{display:none}summary:after{content:"+";color:var(--dim)}details[open] summary:after{content:"−"}details p{margin:12px 0 0;color:var(--dim);max-width:60ch}
.contact .rows .r{grid-template-columns:minmax(80px,180px) minmax(0,1fr)}.contact .r b{color:var(--dim);font-style:italic}
footer{border-top:1px solid var(--line);padding:36px 0 56px;font-size:14px;color:var(--dim)}footer .w{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}footer a{text-decoration:none}footer a:hover{color:var(--ink)}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes drift{from{transform:scale(1.07)}to{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.hc,.ph{animation:none}}
@media (max-width:720px){.hero:after{background:linear-gradient(0deg,var(--bg) 0%,${rgba(bg, 0.85)} 38%,${rgba(bg, 0.25)} 70%,${rgba(bg, 0.6)} 100%)}.ph{background-position:62% center}
.r,.contact .rows .r{grid-template-columns:1fr;gap:4px}.facts li{padding-right:16px;margin-right:16px;letter-spacing:.1em;font-size:12px}.band{aspect-ratio:4/3}}`;
}

function editorialCss(s) {
  const [acc, , accPaper, onAcc] = ACCENTS[s.accent];
  return `${FONTS('editorial')}
:root{--bg:#EEECE5;--sf:#F6F4EE;--ink:#121212;--dim:#6B6A5F;--line:rgba(18,18,18,.82);--soft:rgba(18,18,18,.14);--acc:${acc};--accp:${accPaper};--on:${onAcc}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 ${SANS};overflow-wrap:anywhere;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background:${GRAIN};opacity:.07;mix-blend-mode:multiply;z-index:5}
a{color:inherit}.fr{max-width:1240px;margin:0 auto;border-left:1px solid var(--line);border-right:1px solid var(--line);background:var(--bg)}
nav{display:flex;justify-content:space-between;align-items:center;padding:18px clamp(18px,3vw,32px);border-bottom:1px solid var(--line)}
.mark{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:22px;letter-spacing:-.02em;text-decoration:none}
.mono,.nl,.lb,.n,.btn,.facts li,.eb{font-family:${MONOS};font-weight:500;text-transform:uppercase;letter-spacing:.08em;font-size:12px}
.nl{text-decoration:none}.nl:hover{color:var(--accp)}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);border-bottom:1px solid var(--line)}
.hc{padding:clamp(40px,7vw,88px) clamp(18px,3vw,32px);display:flex;flex-direction:column;justify-content:flex-end;border-right:1px solid var(--line);animation:rise 1s .1s cubic-bezier(.2,.7,.2,1) both}
.eb{color:var(--dim);margin:0 0 28px}
h1{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:clamp(46px,7.4vw,108px);line-height:.94;letter-spacing:-.035em;margin:0;max-width:10ch}
.tl{font-size:clamp(18px,1.8vw,21px);line-height:1.45;color:#3b3a34;margin:26px 0 0;max-width:34ch}
.bt{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 18px;background:var(--acc);color:var(--on);text-decoration:none;border:1px solid var(--line);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translate(-2px,-2px);box-shadow:3px 3px 0 var(--ink)}.btn.ghost{background:var(--sf);color:var(--ink)}
.pic{position:relative;min-height:clamp(320px,52vw,640px);background:${'PIC'};}
.pic:after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 1px var(--line)}
.facts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));border-bottom:1px solid var(--line)}
.facts li{padding:16px clamp(18px,3vw,32px);border-right:1px solid var(--line);margin-right:-1px}
.hatch{height:28px;border-bottom:1px solid var(--line);background:repeating-linear-gradient(135deg,var(--acc) 0 2px,transparent 2px 9px);opacity:.9}
.sec{display:grid;grid-template-columns:minmax(160px,240px) minmax(0,1fr);border-bottom:1px solid var(--line)}
.side{padding:28px clamp(18px,3vw,32px);border-right:1px solid var(--line)}.lb{color:var(--dim);position:sticky;top:24px}.lb b{color:var(--ink);font-weight:500}
.main{padding:clamp(36px,6vw,72px) clamp(18px,3vw,40px)}
h2{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:clamp(32px,4.4vw,56px);line-height:1;letter-spacing:-.03em;margin:0 0 clamp(28px,4vw,44px);max-width:16ch}
.lead{font-size:clamp(19px,2vw,23px);line-height:1.5;max-width:40ch;margin:0}
.rows{border-top:1px solid var(--line)}.r{display:grid;grid-template-columns:minmax(70px,150px) minmax(0,1fr) minmax(0,1.3fr);gap:20px;padding:18px 0;border-bottom:1px solid var(--soft);align-items:baseline}.r:last-child{border-bottom:1px solid var(--line)}
.r .n{color:var(--accp)}.r b{font-weight:600;font-size:18px}.r p{margin:0;color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));border-top:1px solid var(--line);border-left:1px solid var(--line)}
.cell{padding:28px 24px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--sf)}.cell .n{display:block;color:var(--accp);margin-bottom:22px}.cell h3{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:26px;line-height:1.05;letter-spacing:-.02em;margin:0 0 10px}.cell p{margin:0;color:var(--dim)}
.tags{list-style:none;padding:0;margin:32px 0 0;display:flex;flex-wrap:wrap;gap:0}.tags li{border:1px solid var(--line);margin:0 -1px -1px 0;padding:8px 14px;font-size:15px;background:var(--sf)}
.menu{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.menu li{padding:18px 0;border-bottom:1px solid var(--soft)}.menu li:last-child{border-bottom:1px solid var(--line)}
.ln{display:flex;gap:12px;align-items:baseline}.ln b{font-weight:600;font-size:19px}.ln i{flex:1;border-bottom:1px dotted var(--dim);min-width:16px}.pr{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:22px}.menu p{margin:4px 0 0;color:var(--dim);font-size:16px}
.plan{display:flex;flex-direction:column}.plan.best{background:var(--bg);box-shadow:inset 0 6px 0 var(--acc)}
.price{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:60px;line-height:1;letter-spacing:-.04em;margin:0 0 22px;color:var(--ink)!important}.price small{font:500 12px ${MONOS};letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.ticks{list-style:none;padding:0;margin:0 0 26px;flex:1;border-top:1px solid var(--soft)}.ticks li{padding:9px 0 9px 24px;border-bottom:1px solid var(--soft);position:relative}.ticks li:before{content:"→";position:absolute;left:0;color:var(--accp)}.plan .btn{align-self:flex-start}
details{border-bottom:1px solid var(--soft);padding:18px 0}details:first-of-type{border-top:1px solid var(--line)}summary{cursor:pointer;font-weight:600;font-size:18px;list-style:none;display:flex;justify-content:space-between;gap:16px}summary::-webkit-details-marker{display:none}summary:after{content:"+";font-family:${MONOS}}details[open] summary:after{content:"−"}details p{margin:10px 0 0;color:var(--dim);max-width:60ch}
.contact .r{grid-template-columns:minmax(70px,150px) minmax(0,1fr)}.contact .r b{font-weight:400;color:var(--dim);font-style:italic}
footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:22px clamp(18px,3vw,32px) 40px;color:var(--dim)}footer a{text-decoration:none}footer a:hover{color:var(--accp)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.hc{animation:none}}
@media (max-width:760px){.fr{border:0}.hero{grid-template-columns:1fr}.hc{border-right:0;border-bottom:1px solid var(--line);order:2}.pic{order:1;min-height:62vw}.facts{grid-template-columns:1fr 1fr}.facts li{border-bottom:1px solid var(--soft);margin-bottom:-1px}.sec{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--soft);padding-bottom:14px}.r,.contact .r{grid-template-columns:1fr;gap:2px}}`;
}

// The whole page: one self-contained HTML file with its fonts built in, no scripts and no outside requests.
// photo is a data: URL (from photo.js) or empty; it is written once, as a CSS variable, and used by the hero and the band.
export function renderSite(s, photo = '') {
  const hasPhoto = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo);
  const desc = s.tagline || s.about.slice(0, 150) || s.title;
  const meta = s.layout === 'event' ? [s.when, s.where].filter(Boolean).join(' · ') : KIND[s.layout];
  const fl = facts(s);
  const btns = `<div class="bt"><a class="btn" href="#contact">${esc(s.button || (s.layout === 'menu' ? 'Book a table' : s.layout === 'portfolio' ? 'Work with me' : s.layout === 'prices' ? 'Get started' : 'Get in touch'))} <span aria-hidden="true">${s.look === 'editorial' ? '→' : '›'}</span></a>${parts(s).length ? `<a class="btn ghost" href="#more">${s.layout === 'menu' ? 'See the menu' : s.layout === 'event' ? 'The programme' : 'Learn more'} <span aria-hidden="true">${s.look === 'editorial' ? '↓' : '›'}</span></a>` : ''}</div>`;
  const ps = parts(s);
  const contact = CONTACT[s.layout].map((c, i) => ({ n: pad(i), t: c }));
  const contactRows = `<div class="rows">${contact.map((r) => `<div class="r"><span class="n">${r.n}</span><b>${esc(r.t)}</b></div>`).join('')}</div>`;
  const vars = hasPhoto ? `:root{--photo:url(${photo})}` : '';
  const head = (css) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${s.look === 'editorial' ? '#EEECE5' : ACCENTS[s.accent][4]}"><title>${esc(s.title)}</title><meta name="description" content="${esc(desc)}"><style>${vars}${css}</style></head><body>`;
  const foot = `<footer>${s.look === 'editorial' ? '' : '<div class="w">'}<span>© ${esc(s.title)}</span><span>Made with <a href="https://chat.flisk.si">Flisk Chat</a></span>${s.look === 'editorial' ? '' : '</div>'}</footer>`;

  if (s.look === 'editorial') {
    const pic = hasPhoto ? 'var(--photo) center/cover no-repeat' : `${GRAIN},repeating-linear-gradient(135deg,var(--acc) 0 2px,transparent 2px 11px),var(--sf)`;
    const css = editorialCss(s).replace("background:PIC;", `background:${pic};`);
    const sec = (lb, h, inner, i, extra = '') =>
      `<section class="sec ${extra}"${i === 0 ? ' id="more"' : ''}${extra === 'contact' ? ' id="contact"' : ''}><div class="side"><p class="lb"><b>${pad(i)} /</b> ${esc(lb)}</p></div><div class="main"><h2>${esc(h)}</h2>${inner}</div></section>`;
    return `${head(css)}<div class="fr">
<nav><a class="mark" href="#">${esc(s.title)}</a><a class="nl" href="#contact">Contact →</a></nav>
<header class="hero"><div class="hc"><p class="eb">${esc(meta)}</p><h1>${esc(s.title)}</h1>${s.tagline ? `<p class="tl">${esc(s.tagline)}</p>` : ''}${btns}</div><div class="pic" role="img" aria-label="${esc(s.photo || s.title)}"></div></header>
${fl.length ? `<ul class="facts">${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}<div class="hatch"></div>
<main>${ps.map(([lb, h, inner], i) => sec(lb, h, inner, i)).join('')}${sec('Contact', 'Get in touch', contactRows, ps.length, 'contact')}</main>
${foot}</div></body></html>`;
  }

  const sec = (lb, h, inner, i, extra = '') =>
    `<section class="sec ${extra}"${i === 0 ? ' id="more"' : ''}${extra === 'contact' ? ' id="contact"' : ''}><div class="w"><p class="lb">${esc(lb)}</p><h2>${esc(h)}</h2>${inner}${i === 0 && hasPhoto ? '<div class="band" role="img" aria-hidden="true"></div>' : ''}</div></section>`;
  return `${head(cinematicCss(s, hasPhoto))}
<nav><div class="w"><a class="mark" href="#">${esc(s.title)}</a><a class="nl" href="#contact">Contact</a></div></nav>
<header class="hero"><div class="ph" role="img" aria-label="${esc(s.photo || s.title)}"></div><div class="hc"><div class="w"><p class="eb">${esc(meta)}</p><h1>${esc(s.title)}</h1>${s.tagline ? `<p class="tl">${esc(s.tagline)}</p>` : ''}${btns}${fl.length ? `<ul class="facts">${fl.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div></div></header>
<main>${ps.map(([lb, h, inner], i) => sec(lb, h, inner, i)).join('')}${sec('Contact', 'Get in touch', contactRows, ps.length, 'contact')}</main>
${foot}</body></html>`;
}
