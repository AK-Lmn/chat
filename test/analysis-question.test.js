import { describe, expect, test } from 'bun:test';
import { asksAnalysis } from '../src/analysis-style.js';
import { runTask } from '../src/loop.js';

describe('research questions get the full report and no computer', () => {
  test('which questions count', () => {
    expect(asksAnalysis('who are flisk.sh competitors are?')).toBe(true);
    expect(asksAnalysis('compare Tilt and Skaffold')).toBe(true);
    expect(asksAnalysis('alternatives to Docker Compose')).toBe(true);
    expect(asksAnalysis('build me a competitor tracker')).toBe(false);
    expect(asksAnalysis('what is the weather in Paris')).toBe(false);
  });

  test('a model that reaches for curl is refused, no computer starts, and the web widget answer is used', async () => {
    let started = 0;
    const computer = { start: async () => (started++, { data: { id: 'p', provider: 'upstash' } }), run: async () => ({ data: { exitCode: 0, stdout: '', stderr: '' } }), stop: async () => ({ status: 200 }) };
    const seen = [];
    const replies = ['{"run":"curl -s https://flisk.sh | head -50"}', '{"say":"**Compose, Tilt, Skaffold.**"}'];
    const r = await runTask({
      task: 'who are flisk.sh competitors are?',
      model: async (m) => (seen.push(m), { text: replies.shift() }),
      computer,
      publish: async () => ({}),
    });
    expect(started).toBe(0);
    expect(seen[0][0].content).toContain('research or analysis question');
    expect(JSON.stringify(seen[1])).toContain('needs no computer');
    expect(r.answer).toContain('Compose');
  });
});

import { asksStats, STATS_NOTE } from '../src/analysis-style.js';
import { asksImage } from '../src/loop.js';
describe('stats requests', () => {
  test('"draw me stats" is a data request, not a picture', () => {
    const t = 'draw me stats from openstas aboioy openx laucnes rockets';
    expect(asksImage(t)).toBeNull();
    expect(asksStats(t)).toBe(true);
    expect(STATS_NOTE).toContain('never invent numbers');
  });
  test('a real picture request still draws', () => {
    expect(asksImage('draw me a rocket on the moon')).not.toBeNull();
    expect(asksStats('draw me a rocket on the moon')).toBe(false);
  });
});
