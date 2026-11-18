import { expect, test } from 'bun:test';
import { BUSY_WAITS, runTask } from '../src/loop.js';

// Every free model busy is short-lived: the task waits and goes round again instead of showing the error.
test('a busy answer is retried after a wait, the page is told, and the answering model is named', async () => {
  const events = [];
  const waits = [];
  let calls = 0;
  const model = async (messages, o) => {
    calls++;
    if (calls === 1) { o.onReroute('Flisk Wolf is busy, switching to gemma-4-31b-it (OpenRouter, free)'); return { error: 'The free AI is busy right now.', kind: 'busy' }; }
    return { text: '{"say":"JSON is a text format for data."}', by: 'google/gemma-4-31b-it:free' };
  };
  const r = await runTask({ task: 'who is json?', model, computer: {}, emit: (e) => events.push(e), wait: async (ms) => { waits.push(ms); } });
  expect(r.error ?? null).toBe(null);
  expect(waits).toEqual([BUSY_WAITS[0]]);
  expect(events.some((e) => e.type === 'error')).toBe(false);
  expect(events.filter((e) => e.type === 'reroute').map((e) => e.text)).toEqual(['Flisk Wolf is busy, switching to gemma-4-31b-it (OpenRouter, free)', 'Every free model is busy, trying again in 5 s']);
  expect(events.filter((e) => e.type === 'model')).toEqual([{ type: 'model', name: 'gemma-4-31b-it (OpenRouter, free)' }]);
});

test('still busy after every wait: the error is shown at last', async () => {
  const events = [];
  const model = async () => ({ error: 'The free AI is busy right now.', kind: 'busy' });
  const r = await runTask({ task: 'who is json?', model, computer: {}, emit: (e) => events.push(e), wait: async () => {} });
  expect(r.error).toMatch(/busy/);
  expect(events.filter((e) => e.type === 'reroute').length).toBe(BUSY_WAITS.length);
});
