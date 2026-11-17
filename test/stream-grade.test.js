import { describe, expect, test } from 'bun:test';
import { gradeReply, modelFrom } from '../src/model.js';
import { readAiStream, sayStreamer } from '../src/say-stream.js';
import { runEvents } from '../src/trace.js';

const sse = (...toks) => new ReadableStream({ start(c) { const e = new TextEncoder(); for (const t of toks) c.enqueue(e.encode(`data: ${JSON.stringify({ response: t })}\n\n`)); c.enqueue(e.encode('data: [DONE]\n\n')); c.close(); } });

describe('streaming', () => {
  test('say text is cut out of half-written JSON, escapes decoded', () => {
    const out = [];
    const f = sayStreamer((e) => out.push(e.text));
    for (const t of ['{"sa', 'y": "Hel', 'lo wor', 'ld\\n\\u0041', 'B \\"q\\"', '"}']) f(t);
    expect(out.join('')).toBe('Hello world\nAB "q"');
    expect(f.sent()).toBe(true);
  });
  test('another action streams nothing', () => {
    const out = [];
    const f = sayStreamer((e) => out.push(e));
    for (const t of ['{"run": "ls', ' -la"}']) f(t);
    expect(out).toEqual([]);
    expect(f.sent()).toBe(false);
  });
  test('Workers AI event stream is read token by token', async () => {
    const got = [];
    expect(await readAiStream(sse('a', 'b', 'c'), (t) => got.push(t))).toBe('abc');
    expect(got).toEqual(['a', 'b', 'c']);
  });
  test('the Workers AI fallback streams when asked', async () => {
    const calls = [];
    const env = { AI: { run: async (m, i) => { calls.push(i.stream); return i.stream ? sse('{"say":"hi', '"}') : { response: 'x' }; } } };
    const model = modelFrom(env, async () => { throw new Error('down'); }, { ai: 'wolf', free: true });
    const got = [];
    const r = await model([{ role: 'user', content: 'hi' }], { onDelta: (t) => got.push(t) });
    expect(r.text).toBe('{"say":"hi"}');
    expect(got.length).toBe(2);
  });
});

describe('Jev grades a reply', () => {
  const ai = (a) => ({ AI: { run: async (m, i) => { ai.last = i; if (!a) throw new Error('x'); return { answers: { verdict: { type: 'choice', ...a } } }; } } });
  test('bad with confidence is bad, with the ask and reply as state', async () => {
    const g = await gradeReply(ai({ choice: 'wrong_language', confidence: 0.9 }))('hi', 'привіт');
    expect(g).toEqual({ verdict: 'wrong_language', confidence: 0.9, bad: true });
    expect(ai.last.state).toContain('ASK: hi');
  });
  test('unsure bad is not acted on; good is not bad; failure is null', async () => {
    expect((await gradeReply(ai({ choice: 'off_topic', confidence: 0.5 }))('a', 'b')).bad).toBe(false);
    expect((await gradeReply(ai({ choice: 'good', confidence: 0.99 }))('a', 'b')).bad).toBe(false);
    expect(await gradeReply(ai(null))('a', 'b')).toBeNull();
  });
  test('a bad verdict is traced as codes only', () => {
    const ev = runEvents({ answer: 'x', provider: 'p', ms: 1, steps: [], stats: { graded: { verdict: 'off_topic', confidence: 0.9, retried: true } } }, null);
    expect(ev.some((e) => /Jev graded the reply off_topic, asked again/.test(e.why))).toBe(true);
  });
});
