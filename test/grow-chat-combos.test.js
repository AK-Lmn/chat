// Is grow.flisk.si natively part of chat? Many combinations, offline: what the visitor types, what was built before,
// what the model sends, whether Citable answers, and whether the link that leaves chat arrives filled in on grow.
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseWidget, WIDGETS } from '../src/widgets.js';
import { runTask } from '../src/loop.js';
import { SYSTEM } from '../src/prompt.js';
import { appPage } from '../src/page.js';

const report = { score: 64, grade: 'D', checks: [{ title: 'Readable without JavaScript', status: 'fail', summary: 'Thin HTML.' }] };
const card = (url, over = {}) => ({
  kind: 'grow', url, product: 'Portfolio of a photographer', buyers: 'Couples planning a wedding in the next year who want natural photos.',
  pitch: 'Photos that look like your day, not a pose.',
  places: [{ name: 'r/weddingplanning', why: 'engaged couples ask for photographers' }],
  emails: [{ to: 'wedding planner', subject: 'A photographer for your couples', body: 'Hi [Name], do you refer photographers?\n\n[Your name]' }],
  ...over,
});
const LINKS = {
  chatSite: 'https://chat.flisk.si/s/0123456789abcdef',
  liveApp: 'https://box-3000.preview.box.upstash.com/',
  pages: 'https://pages.flisk.si/@odykyi/portfolio',
  ownDomain: 'https://anna-photo.com/work?x=1&y=2',
};

// A scripted model: returns each reply in turn and remembers every message it was shown.
const script = (replies) => {
  let i = 0;
  const seen = [];
  return { seen, model: async (messages) => { seen.push(messages); return { text: typeof replies[i] === 'function' ? replies[i++](messages) : replies[i++] }; } };
};
const run = async (task, replies, extra = {}) => {
  const events = [];
  const s = script(replies);
  const computer = { start: async () => { throw new Error('this task must not start a computer'); } };
  const res = await runTask({
    task, model: s.model, computer, emit: (e) => events.push(e),
    citable: async () => Response.json(report),
    publish: async () => ({ url: LINKS.chatSite }), photo: async () => '',
    ...extra,
  });
  return { res, events, seen: s.seen };
};
const answerOf = (r) => r.res?.answer || r.events.find((e) => e.type === 'answer')?.text || '';

describe('the model is told about Grow', () => {
  // The visitor never says "widget". These are the ways people ask for customers.
  const ASKS = ['Grow it', 'find customers', 'find users', 'promote', 'market', 'advertise', 'get more visitors', 'get my first customers'];
  test.each(ASKS)('the system prompt covers the ask "%s"', (ask) => {
    const line = SYSTEM.split('\n').find((l) => l.includes('"kind": "grow"')) || '';
    expect(line.toLowerCase()).toContain(ask.toLowerCase().split(' ')[0]);
  });
  test('the grow widget needs no computer', () => {
    expect(WIDGETS.grow.needsComputer).toBeFalsy();
  });
});

describe('what the model can send, per kind of live link', () => {
  for (const [name, link] of Object.entries(LINKS)) {
    test(`${name}: draws the card, checks Citable, starts no computer`, async () => {
      const asked = [];
      const r = await run(`Grow it: find the first customers for ${link}`,
        [JSON.stringify({ widget: card(link) }), JSON.stringify({ say: 'Post in r/weddingplanning today.' })],
        { citable: async (u) => (asked.push(u), Response.json(report)) });
      const w = r.events.find((e) => e.type === 'widget');
      expect(w.kind).toBe('grow');
      expect(w.data.url).toBe(new URL(link).href);
      expect(w.data.check.score).toBe(64);
      expect(asked[0]).toContain(encodeURIComponent(new URL(link).href));
      expect(r.events.some((e) => e.type === 'pod_starting')).toBe(false);
      expect(answerOf(r)).toContain('r/weddingplanning');
    });
  }
});

describe('a site built in the same task, then grown', () => {
  test('portfolio is published, then the card carries the published link', async () => {
    const r = await run('promote my website and make portfolio.', [
      JSON.stringify({ site: { layout: 'portfolio', title: 'Anna Photo', tagline: 'Wedding photographer' } }),
      (messages) => {
        // The model must have been shown the published link to put in the card.
        expect(JSON.stringify(messages)).toContain(LINKS.chatSite);
        return JSON.stringify({ widget: card(LINKS.chatSite) });
      },
      JSON.stringify({ say: `Your site is ${LINKS.chatSite}. Send the first email today.` }),
    ]);
    const kinds = r.events.map((e) => e.type);
    expect(kinds.indexOf('site')).toBeGreaterThan(-1);
    expect(kinds.indexOf('widget')).toBeGreaterThan(kinds.indexOf('site'));
    expect(r.events.find((e) => e.type === 'widget').data.url).toBe(LINKS.chatSite);
    expect(r.events.some((e) => e.type === 'pod_starting')).toBe(false);
  });
});

describe('Grow card edge cases', () => {
  test('promote with no link at all: the model is told what is missing and can recover', async () => {
    const r = await run('promote my website', [
      JSON.stringify({ widget: card('') }),
      (messages) => {
        expect(JSON.stringify(messages).toLowerCase()).toContain('grow');
        return JSON.stringify({ say: 'Which address is your website?' });
      },
    ]);
    expect(r.events.some((e) => e.type === 'widget' && e.kind === 'grow')).toBe(false);
    expect(answerOf(r)).toContain('Which address');
  });

  for (const [name, citable] of Object.entries({
    'Citable answers 503': async () => new Response('busy', { status: 503 }),
    'Citable throws': async () => { throw new Error('binding gone'); },
    'Citable answers junk': async () => Response.json({ hello: 1 }),
  })) {
    test(`${name}: the card still shows, with no score`, async () => {
      const r = await run(`Grow it: ${LINKS.liveApp}`, [JSON.stringify({ widget: card(LINKS.liveApp) }), JSON.stringify({ say: 'Start with Reddit.' })], { citable });
      const w = r.events.find((e) => e.type === 'widget');
      expect(w.kind).toBe('grow');
      expect(w.data.check).toBeNull();
      expect(w.data.places.length).toBe(1);
    });
  }

  test('unsafe links and email addresses the model invented never reach the card', () => {
    const { input } = parseWidget(card(LINKS.pages, {
      places: [{ name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Good', url: 'https://www.reddit.com/r/x/' }],
      emails: [{ to: 'ceo@bigco.com', subject: 'Hi', body: 'Hello [Name]' }],
    }));
    expect(input.places.map((p) => p.url)).toEqual(['', 'https://www.reddit.com/r/x/']);
    // The "to" is only a kind of person; the page never sends mail, the visitor does.
    expect(appPage({})).toContain('Nothing is sent for you');
  });
});

describe('the buttons in the page', () => {
  const html = appPage({});
  test('a live link gets Grow it (stays in chat) and Find customers (opens grow.flisk.si)', () => {
    expect(html).toContain("'Grow it: find the first customers for '+link");
    expect(html).toContain("'https://grow.flisk.si/?url='+encodeURIComponent(link)");
  });
  test('the card links the full plan on grow.flisk.si with the same link', () => {
    expect(html).toContain("'https://grow.flisk.si/?url='+encodeURIComponent(d.url)");
  });
  test('the Grow it prompt is itself something the model is told to treat as a grow ask', () => {
    const line = SYSTEM.split('\n').find((l) => l.includes('"kind": "grow"')) || '';
    expect(line).toContain('Grow it');
  });
});

// The other half: the link leaves chat and must land filled in on grow, without spending a model call.
const GROW = process.env.GROW_DIR || join(homedir(), 'tdk-pr-work', 'grow');
describe.skipIf(!existsSync(join(GROW, 'src', 'index.js')))('chat link -> grow.flisk.si', () => {
  for (const [name, link] of Object.entries(LINKS)) {
    test(`${name}: lands pre-filled, never calls the model, never indexed`, async () => {
      const { handle } = await import(join(GROW, 'src', 'index.js'));
      const { fakeD1 } = await import(join(GROW, 'test', 'fake-d1.js'));
      const calls = [];
      const deps = { fetch: async (u) => (calls.push(String(u)), new Response('no', { status: 500 })), cache: { match: async () => undefined, put: async () => {} } };
      const href = 'https://grow.flisk.si/?url=' + encodeURIComponent(link);
      const r = await handle(new Request(href), { DB: fakeD1(), INFERENCE_KEY: 'k' }, deps);
      const t = await r.text();
      expect(r.status).toBe(200);
      expect(r.headers.get('x-robots-tag')).toContain('noindex');
      expect(t).toContain('value="' + new URL(link).href.replace(/&/g, '&#38;').replace(/"/g, '%22') + '"');
      expect(calls.filter((c) => c.includes('inference')).length).toBe(0);
    });
  }
});
