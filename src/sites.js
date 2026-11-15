// Ready page layouts for show-only websites. The model sends only the words ({"site": {...}}) and chat draws the page, so a
// small free model still gets a page that looks finished, works at phone width, and costs far fewer tokens than writing
// a whole HTML file. Nothing here needs a computer: the page is made on the Worker and published like any other page.
//
// Contact details are never taken from the model: every page ends with "Add your ... here" placeholders, and anything that
// looks like an email address or a phone number is removed from the words, so a page never shows invented contacts.

export const LAYOUTS = ['landing', 'portfolio', 'menu', 'event', 'prices'];

// Calm palettes: page background, text, muted text, rule lines, accent, text on the accent.
export const COLOURS = {
  sage: ['#f6f5f0', '#1d241f', '#5d675f', '#dcdfd6', '#2f6b4f', '#ffffff'],
  ocean: ['#f4f6f8', '#152131', '#56657a', '#d8dfe7', '#1f5f99', '#ffffff'],
  clay: ['#faf6f1', '#2a1f18', '#6e5d52', '#e8ddd2', '#b0532f', '#ffffff'],
  plum: ['#f8f5f8', '#251a26', '#685a69', '#e4dae4', '#7a3b78', '#ffffff'],
  ink: ['#fafaf8', '#141414', '#5f5f5a', '#e2e1dc', '#141414', '#ffffff'],
  sun: ['#fbf8ef', '#231f12', '#6a6450', '#ebe4cf', '#9a6b00', '#ffffff'],
};
const DEFAULT_COLOUR = { landing: 'ocean', portfolio: 'ink', menu: 'clay', event: 'plum', prices: 'sage' };

// What the model is told, added to its instructions.
export const SITE_HELP = `{"site": {"layout": "landing", "colour": "<sage|ocean|clay|plum|ink|sun>", "title": "<name>", "tagline": "<one line>", "about": "<2-3 sentences>", ...}}
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

// The model's words, cleaned and cut to size. null when it is not a usable page (no layout we have, or no title).
export function cleanSite(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const layout = String(raw.layout || '').toLowerCase().trim();
  const title = str(raw.title, 80);
  if (!LAYOUTS.includes(layout) || !title) return null;
  const colour = String(raw.colour || raw.color || '').toLowerCase().trim();
  const s = {
    layout,
    colour: COLOURS[colour] ? colour : DEFAULT_COLOUR[layout],
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

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sec = (title, inner, cls = '') => (inner ? `<section class="sec ${cls}"><div class="w"><h2>${esc(title)}</h2>${inner}</div></section>` : '');
const grid = (items, fn) => (items.length ? `<div class="grid">${items.map(fn).join('')}</div>` : '');
const cardHtml = (c, top = '') => `<div class="card">${top}${c.title ? `<h3>${esc(c.title)}</h3>` : ''}${c.text ? `<p>${esc(c.text)}</p>` : ''}</div>`;

function body(s) {
  if (s.layout === 'landing')
    return sec('What you get', grid(s.features, (c) => cardHtml(c))) + sec('About', s.about && `<p class="lead">${esc(s.about)}</p>`);
  if (s.layout === 'portfolio')
    return (
      sec('About', (s.about ? `<p class="lead">${esc(s.about)}</p>` : '') + (s.skills.length ? `<ul class="tags">${s.skills.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')) +
      sec('Work', grid(s.projects, (c) => cardHtml(c, c.tag ? `<span class="tag">${esc(c.tag)}</span>` : '')))
    );
  if (s.layout === 'menu')
    return (
      sec('About', s.about && `<p class="lead">${esc(s.about)}</p>`) +
      s.sections
        .map((m) =>
          sec(m.name || 'Menu', `<ul class="menu">${m.items.map((it) => `<li><div class="row"><b>${esc(it.name)}</b><span class="dots"></span>${it.price ? `<b>${esc(it.price)}</b>` : ''}</div>${it.text ? `<p>${esc(it.text)}</p>` : ''}</li>`).join('')}</ul>`),
        )
        .join('') +
      sec('Opening hours', s.hours.length && `<ul class="plain">${s.hours.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`)
    );
  if (s.layout === 'event')
    return (
      sec('About', s.about && `<p class="lead">${esc(s.about)}</p>`) +
      sec('Programme', s.schedule.length && `<ol class="sched">${s.schedule.map((x) => `<li><span class="time">${esc(x.time)}</span><div>${x.title ? `<b>${esc(x.title)}</b>` : ''}${x.text ? `<p>${esc(x.text)}</p>` : ''}</div></li>`).join('')}</ol>`) +
      sec('Speakers', grid(s.speakers, (c) => cardHtml(c)))
    );
  // prices
  return (
    sec('Plans', s.plans.length && `<div class="grid plans">${s.plans.map((p) => `<div class="card plan${p.best ? ' best' : ''}">${p.best ? '<span class="tag">Most popular</span>' : ''}<h3>${esc(p.name)}</h3><p class="price">${esc(p.price)}${p.per ? `<small> / ${esc(p.per)}</small>` : ''}</p>${p.features.length ? `<ul class="ticks">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`) +
    sec('About', s.about && `<p class="lead">${esc(s.about)}</p>`) +
    sec('Questions', s.faq.length && s.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join(''))
  );
}

// Contact lines a person fills in later: chat never writes real-looking contact details.
const CONTACT = {
  landing: ['Add your email here'],
  portfolio: ['Add your email here', 'Add your links here'],
  menu: ['Add your address here', 'Add your phone number here'],
  event: ['Add the venue address here', 'Add your email here'],
  prices: ['Add your email here'],
};

// The whole page: one self-contained HTML file, system fonts, no scripts, no outside requests.
export function renderSite(s) {
  const [bg, ink, dim, line, acc, onAcc] = COLOURS[s.colour] || COLOURS.ink;
  const meta = s.layout === 'event' ? [s.when, s.where].filter(Boolean).join(' · ') : '';
  const desc = s.tagline || s.about.slice(0, 150) || s.title;
  const css = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:${bg};color:${ink};font:17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:anywhere}
.w{max-width:1040px;margin:0 auto;padding:0 20px}header.hero{padding:88px 0 72px;border-bottom:1px solid ${line}}
.hero h1{font-size:clamp(36px,7vw,64px);line-height:1.05;letter-spacing:-.03em;margin:0 0 16px;max-width:16ch}.hero .tl{font-size:clamp(18px,2.6vw,22px);color:${dim};margin:0;max-width:40ch}
.meta{display:inline-block;margin:0 0 20px;padding:4px 10px;border:1px solid ${line};font-size:14px;color:${dim}}
.btn{display:inline-block;margin-top:28px;padding:12px 22px;background:${acc};color:${onAcc};text-decoration:none;font-weight:600}
.sec{padding:56px 0;border-bottom:1px solid ${line}}.sec h2{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:${dim};margin:0 0 24px;font-weight:600}
.lead{font-size:clamp(18px,2.4vw,21px);max-width:60ch;margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:1px;background:${line};border:1px solid ${line}}
.card{background:${bg};padding:24px}.card h3{font-size:19px;margin:0 0 8px;letter-spacing:-.01em}.card p{margin:0;color:${dim}}
.tag{display:inline-block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:${acc};margin-bottom:10px;font-weight:600}
.tags{list-style:none;padding:0;margin:24px 0 0;display:flex;flex-wrap:wrap;gap:8px}.tags li{border:1px solid ${line};padding:4px 12px;font-size:15px}
.menu{list-style:none;margin:0;padding:0}.menu li{padding:14px 0;border-bottom:1px solid ${line}}.menu li:last-child{border-bottom:0}
.row{display:flex;gap:10px;align-items:baseline}.dots{flex:1;border-bottom:1px dotted ${dim};opacity:.5;min-width:12px}.menu p{margin:4px 0 0;color:${dim};font-size:15px}
.plain{list-style:none;margin:0;padding:0}.plain li{padding:6px 0}
.sched{list-style:none;margin:0;padding:0}.sched li{display:grid;grid-template-columns:90px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid ${line}}.sched li:last-child{border-bottom:0}.time{font-weight:600;color:${acc}}.sched p{margin:4px 0 0;color:${dim}}
.price{font-size:34px;font-weight:700;letter-spacing:-.02em;margin:8px 0 16px!important;color:${ink}!important}.price small{font-size:15px;font-weight:400;color:${dim}}
.plan.best{outline:2px solid ${acc};outline-offset:-2px}.ticks{list-style:none;padding:0;margin:0}.ticks li{padding:6px 0 6px 22px;position:relative}.ticks li:before{content:"";position:absolute;left:2px;top:14px;width:10px;height:5px;border-left:2px solid ${acc};border-bottom:2px solid ${acc};transform:rotate(-45deg)}
details{border-bottom:1px solid ${line};padding:14px 0}summary{cursor:pointer;font-weight:600}details p{margin:8px 0 0;color:${dim}}
.contact ul{list-style:none;margin:0;padding:0}.contact li{padding:6px 0;color:${dim}}
footer{padding:32px 0 48px;font-size:14px;color:${dim}}footer a{color:inherit}
@media (max-width:560px){header.hero{padding:56px 0 48px}.sec{padding:40px 0}.sched li{grid-template-columns:1fr;gap:4px}}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)}</title><meta name="description" content="${esc(desc)}"><style>${css}</style></head><body>
<header class="hero"><div class="w">${meta ? `<p class="meta">${esc(meta)}</p>` : ''}<h1>${esc(s.title)}</h1>${s.tagline ? `<p class="tl">${esc(s.tagline)}</p>` : ''}${s.button ? `<a class="btn" href="#contact">${esc(s.button)}</a>` : ''}</div></header>
<main>${body(s)}<section class="sec contact" id="contact"><div class="w"><h2>Contact</h2><ul>${CONTACT[s.layout].map((c) => `<li>${c}</li>`).join('')}</ul></div></section></main>
<footer><div class="w">Made with <a href="https://chat.flisk.si">Flisk Chat</a></div></footer>
</body></html>`;
}
