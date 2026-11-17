import { describe, expect, test } from 'bun:test';
import { decide } from '../src/model.js';

const ai = (answers) => ({ AI: { run: async (m, i) => { ai.last = { m, i }; if (!answers) throw new Error('no access'); return { answers }; } } });
const ch = (choice, confidence) => ({ type: 'choice', choice, confidence });

describe('Jev decides language and kind of ask', () => {
  test('one call, two typed questions, confident answers returned', async () => {
    const d = await decide(ai({ lang: ch('uk', 0.95), type: ch('weather', 0.9) }))('яка погода у Львові');
    expect(d).toEqual({ lang: 'uk', type: 'weather' });
    expect(ai.last.m).toBe('typesafe/jev');
    expect(Object.keys(ai.last.i.questions)).toEqual(['lang', 'type']);
  });
  test('low confidence answers are dropped', async () => {
    expect(await decide(ai({ lang: ch('de', 0.4), type: ch('code', 0.5) }))('x')).toBeNull();
    expect(await decide(ai({ lang: ch('de', 0.9), type: ch('code', 0.5) }))('x')).toEqual({ lang: 'de', type: '' });
  });
  test('failure or no binding gives null', async () => {
    expect(await decide(ai(null))('x')).toBeNull();
    expect(decide({})).toBeNull();
  });
});
