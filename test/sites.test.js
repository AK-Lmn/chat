import { describe, expect, test } from 'bun:test';
import { parseAction, runTask, SYSTEM } from '../src/loop.js';
import { BROWSER_NOTE } from '../src/browserpod.js';
import { cleanSite, LAYOUTS, renderSite } from '../src/sites.js';

const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };

const SAMPLES = {
  landing: { layout: 'landing', title: 'Moon Roast', tagline: 'Coffee roasted on Tuesdays', about: 'A small roastery.', button: 'Visit us', features: [{ title: 'Fresh', text: 'Roasted this week.' }, { title: 'Local', text: 'From the hill farm.' }] },
  portfolio: { layout: 'portfolio', title: 'Ana Ruiz', tagline: 'Illustrator', about: 'I draw books.', skills: ['Ink', 'Watercolour'], projects: [{ title: 'The Fox', text: 'A picture book.', tag: '2025' }] },
  menu: { layout: 'menu', title: 'Hearth & Crumb', tagline: 'Bakery', about: 'Bread every morning.', sections: [{ name: 'Bread', items: [{ name: 'Sourdough', price: '£4', text: 'Two days of rise.' }] }], hours: ['Mon-Fri 7-15', 'Sat 8-13'] },
  event: { layout: 'event', title: 'Sam & Lee', tagline: 'We are getting married', about: 'Join us.', when: '2027-06-12 15:00', where: 'The Old Mill', button: 'RSVP', schedule: [{ time: '15:00', title: 'Ceremony', text: 'In the garden.' }], speakers: ['Sam', 'Lee'] },
  prices: { layout: 'prices', title: 'Tidy', tagline: 'Cleaning plans', about: 'Weekly cleaning.', plans: [{ name: 'Basic', price: '£20', per: 'week', features: ['Kitchen'], best: false }, { name: 'Full', price: '£40', per: 'week', features: ['Whole home'], best: true }], faq: [{ q: 'Can I cancel?', a: 'Any time.' }] },
};

describe('every layout draws a full page', () => {
  test('there are five layouts and a sample for each', () => {
    expect(LAYOUTS).toEqual(Object.keys(SAMPLES));
  });

  for (const [name, raw] of Object.entries(SAMPLES)) {
    test(`${name}: a whole page with its title, phone styles, no scripts, under 200 KB`, () => {
      const html = renderSite(cleanSite(raw));
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
      expect(html).toContain('@media (max-width:560px)');
      expect(html).toContain('<title>');
      expect(html).toContain('id="contact"');
      expect(html).not.toMatch(/<script/i);
      // Nothing is loaded from elsewhere: no outside images, fonts or stylesheets.
      expect(html).not.toMatch(/src="https?:|<link|@import|url\(/i);
      expect(new TextEncoder().encode(html).length).toBeLessThan(200 * 1024);
    });
  }

  test('each layout shows its own parts', () => {
    expect(renderSite(cleanSite(SAMPLES.menu))).toContain('Sourdough');
    expect(renderSite(cleanSite(SAMPLES.menu))).toContain('Sat 8-13');
    expect(renderSite(cleanSite(SAMPLES.event))).toContain('The Old Mill');
    expect(renderSite(cleanSite(SAMPLES.event))).toContain('Ceremony');
    expect(renderSite(cleanSite(SAMPLES.prices))).toContain('Can I cancel?');
    expect(renderSite(cleanSite(SAMPLES.portfolio))).toContain('The Fox');
    expect(renderSite(cleanSite(SAMPLES.landing))).toContain('Roasted this week.');
  });

  test('the biggest allowed page is still under 200 KB', () => {
    const long = 'x'.repeat(5000);
    const raw = { layout: 'menu', title: long, tagline: long, about: long, hours: Array(50).fill(long), sections: Array(50).fill({ name: long, items: Array(50).fill({ name: long, price: long, text: long }) }) };
    expect(new TextEncoder().encode(renderSite(cleanSite(raw))).length).toBeLessThan(200 * 1024);
  });
});

describe('the page is safe and honest', () => {
  test('text is escaped, so a model reply cannot add markup', () => {
    const html = renderSite(cleanSite({ layout: 'landing', title: '<script>alert(1)</script>', about: '"><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  test('made-up emails and phone numbers are taken out; dates, times and prices stay', () => {
    const s = cleanSite({ layout: 'event', title: 'Party', about: 'Write to hello@party.com or call +44 20 7946 0958.', when: '2027-06-12 15:00', schedule: [{ time: '15:00', title: 'Cake', text: 'Tickets £12.50' }] });
    const html = renderSite(s);
    expect(html).not.toContain('hello@party.com');
    expect(html).not.toContain('7946');
    expect(html).toContain('2027-06-12 15:00');
    expect(html).toContain('£12.50');
  });

  test('the contact part only asks the owner to add their details', () => {
    const html = renderSite(cleanSite(SAMPLES.menu));
    expect(html).toContain('Add your address here');
    expect(html).toContain('Add your phone number here');
  });

  test('an unknown layout or a missing title is refused', () => {
    expect(cleanSite({ layout: 'shop', title: 'X' })).toBeNull();
    expect(cleanSite({ layout: 'landing' })).toBeNull();
    expect(cleanSite(null)).toBeNull();
  });
});

describe('the model can ask for a layout', () => {
  test('the instructions name the layouts, and the in-tab note prefers them', () => {
    for (const l of LAYOUTS) expect(SYSTEM).toContain(l);
    expect(SYSTEM).toContain('{"site":');
    expect(BROWSER_NOTE).toContain('"site"');
  });

  test('a site reply is read as a site action', () => {
    const a = parseAction(JSON.stringify({ site: SAMPLES.landing }));
    expect(a.type).toBe('site');
    expect(a.spec.title).toBe('Moon Roast');
  });

  test('a site with no layout gets a helpful retry message', () => {
    const a = parseAction('{"site": {"title": "X"}}');
    expect(a.type).toBe('bad');
    expect(a.why).toContain('landing');
  });

  test('a visitor gets a live page with no computer started', async () => {
    let started = 0;
    const computer = { start: async () => (started++, { status: 201, data: { id: 'p1' } }), stop: async () => ({ status: 200, data: {} }), run: async () => ({ status: 200, data: {} }) };
    const published = [];
    const events = [];
    const model = scripted(JSON.stringify({ site: SAMPLES.menu }), '{"say": "Your bakery page: https://chat.flisk.si/s/abc"}');
    const r = await runTask({ task: 'a menu page for my bakery', model, computer, emit: (e) => events.push(e), publish: async (html) => (published.push(html), { url: 'https://chat.flisk.si/s/abc' }) });
    expect(started).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0]).toContain('Sourdough');
    expect(r.stats.errors).toBe(0);
    expect(events.some((e) => e.type === 'site' && e.layout === 'menu')).toBe(true);
  });
});
