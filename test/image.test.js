import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { appPage } from '../src/page.js';
import { asksImage, cleanSvg, inlineLocal, parseAction, runTask, SYSTEM } from '../src/loop.js';
import { handle, saveImage } from '../src/index.js';
import { fakeD1 } from './d1.js';

const PIC = `data:image/jpeg;base64,${'A'.repeat(2000)}`;
const scripted = (...texts) => { let i = 0; return async () => ({ text: texts[Math.min(i++, texts.length - 1)] }); };
const noComputer = { start: async () => { throw new Error('a picture needs no computer'); } };

describe('a picture the user asks for is drawn and shown in the chat, like ChatGPT', () => {
  test('"generate a photo of a cat taking a mirror selfie" is drawn at once: no model, no computer, no page', async () => {
    const events = [];
    let asked = 0;
    const prompts = [];
    const r = await runTask({ task: 'generate a photo of a cat taking a mirror selfie', model: async () => (asked++, { text: '{"say":"no"}' }), computer: noComputer, publish: async () => { throw new Error('no page'); }, photo: async (p) => (prompts.push(p), PIC), saveImage: async () => ({ url: 'https://chat.flisk.si/i/0123456789abcdef.jpg' }), lookupFacts: () => { throw new Error('no lookup'); }, emit: (e) => events.push(e) });
    expect(asked).toBe(0);
    expect(prompts[0]).toContain('a cat taking a mirror selfie');
    expect(r.answer).toBe('![Here is a cat taking a mirror selfie.](https://chat.flisk.si/i/0123456789abcdef.jpg)\n\nHere is a cat taking a mirror selfie.');
    expect(events.map((e) => e.type)).toEqual(['image_start', 'answer']);
    expect(r.links).toEqual(['https://chat.flisk.si/i/0123456789abcdef.jpg']);
  });

  test('only plain picture requests take the fast way', () => {
    expect(asksImage('draw me a dragon over Kyiv')?.caption).toBe('Here is a dragon over Kyiv.');
    expect(asksImage('Create an image of a sunset on Mars.')?.caption).toBe('Here is a sunset on Mars.');
    expect(asksImage('make a landing page with a photo of a cat')).toBeNull();
    expect(asksImage('draw a chart of our sales')).toBeNull();
    expect(asksImage('what is in this photo of a cat')).toBeNull();
    expect(asksImage('make a video of a cat')).toBeNull();
  });

  test('the model can send an "image" action; the picture ends the task with no computer', async () => {
    expect(SYSTEM).toContain('{"image": {"prompt"');
    expect(SYSTEM).toContain('never download a picture with curl');
    expect(parseAction('{"image": {"prompt": "a red fox", "caption": "A red fox."}}')).toEqual({ type: 'image', spec: { prompt: 'a red fox', caption: 'A red fox.' } });
    const r = await runTask({ task: 'I would love a cute fox for my avatar', model: scripted('{"image": {"prompt": "a cute red fox avatar", "caption": "A cute red fox for your avatar."}}'), computer: noComputer, photo: async () => PIC, saveImage: async () => ({ url: 'https://chat.flisk.si/i/fedcba9876543210.jpg' }) });
    expect(r.answer).toContain('![A cute red fox for your avatar.](https://chat.flisk.si/i/fedcba9876543210.jpg)');
    expect(r.error).toBeNull();
  });

  test('a model that reaches for an image website is refused, and the prompt rules it out', async () => {
    expect(SYSTEM).toContain('Never fetch a picture from an image website');
    expect(SYSTEM).toContain('never call it "real"');
    let ran = 0;
    const computer = { start: async () => ({ ok: true, data: { podId: 'p' } }), run: async () => (ran++, { data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({}) };
    const msgs = [];
    const model = async (m) => { msgs.push(m); return { text: msgs.length === 1 ? '{"run":"curl -o cat.jpg https://image.pollinations.ai/prompt/cat"}' : '{"say":"ok"}' }; };
    await runTask({ task: 'put a cat photo into my notes file', model, computer });
    expect(ran).toBe(0);
    expect(JSON.stringify(msgs[1])).toContain('Refused: do not fetch pictures from an image website');
  });

  test('no picture (daily limit, busy model): a calm sentence, never a page or a computer', async () => {
    const r = await runTask({ task: 'generate a picture of a lighthouse at night', model: scripted('{"say":"x"}'), computer: noComputer, photo: async () => '' });
    expect(r.answer).toMatch(/^Sorry, the picture could not be drawn right now/);
  });
});

describe('a drawn picture has its own link', () => {
  const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  test('saveImage keeps it in D1 and /i/<id>.jpg serves the bytes', async () => {
    const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.flisk.si' };
    const made = await saveImage(env, 'ann', 'data:image/jpeg;base64,/9j/4AAQ', 'a cat', 'https://chat.flisk.si');
    expect(made.url).toMatch(/^https:\/\/chat\.flisk\.si\/i\/[a-f0-9]{16}\.jpg$/);
    const res = await handle(new Request(made.url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect([...new Uint8Array(await res.arrayBuffer())].slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect((await handle(new Request('https://chat.flisk.si/i/0000000000000000.jpg'), env, {})).status).toBe(404);
    expect((await saveImage(env, 'ann', 'not a picture', '', 'https://chat.flisk.si')).error).toBeTruthy();
  });
});

describe('a published page keeps its pictures', () => {
  test('<img src="cat.jpg"> next to the page goes into it as a data: URL', async () => {
    const files = { '~/site/cat.jpg': { encoding: 'base64', content: '/9j/4AAQ' } };
    const read = async (p) => (p in files ? { data: files[p] } : { error: `No such file: ${p}` });
    const r = await inlineLocal('<html><body><img src="cat.jpg" alt="Cat"><img src="https://x.test/a.png"></body></html>', '~/site/index.html', read);
    expect(r.html).toContain('<img src="data:image/jpeg;base64,/9j/4AAQ" alt="Cat">');
    expect(r.html).toContain('src="https://x.test/a.png"');
    expect(r.pictures).toBe(1);
    expect(r.missing).toEqual([]);
  });

  test('a picture that is not there is reported, never published broken', async () => {
    const r = await inlineLocal('<html><body><img src="cat.jpg" alt="Cat"></body></html>', '~/site/index.html', async (p) => ({ error: `No such file: ${p}` }));
    expect(r.missing).toEqual(['cat.jpg']);
  });
});

describe('the chat page shows the picture', () => {
  const page = appPage({ login: 'ann', connected: [] });
  test('an answer line ![alt](link) is drawn as a picture with a save button, and the step says what happens', () => {
    expect(page).toContain("const picture=(src,alt)=>");
    expect(page).toContain("if(im){n.appendChild(picture(im[2],im[1]));i++;continue;}");
    expect(page).toContain("step('Drawing the picture','','image')");
    for (const [, s] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(s)).not.toThrow();
  });
});

describe('when the drawing model has no budget, the chat model draws the picture as SVG code', () => {
  const SVG = `<svg viewBox="0 0 800 800"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#a50"/></radialGradient></defs><rect width="800" height="800" fill="#cde"/><circle cx="400" cy="400" r="200" fill="url(#g)" onclick="x()"/><ellipse cx="400" cy="620" rx="220" ry="40" fill="#0003"/><path d="M200 300 L400 100 L600 300Z" fill="#c60"/><script>alert(1)</script><image href="https://evil.test/a.png"/>${'<circle cx="1" cy="1" r="1"/>'.repeat(10)}</svg>`;
  test('cleanSvg keeps the shapes and drops script, handlers and outside links', () => {
    const out = cleanSvg('Here you go:\n```svg\n' + SVG + '\n```');
    expect(out).toContain('radialGradient');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).not.toMatch(/script|onclick|evil\.test|<image/i);
    expect(cleanSvg('no picture here')).toBeNull();
    expect(cleanSvg('<svg><rect/></svg>')).toBeNull();
  });

  test('a picture request whose photo fails is drawn by the chat model and kept as an svg', async () => {
    let saved = null;
    const r = await runTask({ task: 'generate a photo of a red fox in the snow', model: async () => ({ text: SVG }), computer: noComputer, photo: async () => '', saveImage: async (pic) => ((saved = pic), { url: 'https://chat.flisk.si/i/0123456789abcdef.svg' }) });
    expect(saved).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(r.answer).toContain('![Here is a red fox in the snow.](https://chat.flisk.si/i/0123456789abcdef.svg)');
  });

  test('saved svg is served with a locked-down policy', async () => {
    const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    const env = { DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://chat.flisk.si' };
    const out = await saveImage(env, 'odykyi', `data:image/svg+xml;base64,${btoa(cleanSvg(SVG))}`, 'fox', 'https://chat.flisk.si');
    expect(out.url).toMatch(/\/i\/[0-9a-f]{16}\.svg$/);
    const res = await handle(new Request(out.url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
  });
});
