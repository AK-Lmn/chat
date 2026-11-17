import { test, expect } from 'bun:test';
import { REASONING_CSS, REASONING_JS } from '../src/reasoning.js';
import { appPage } from '../src/page.js';

test('reasoning script parses and defines reasoning()', () => {
  expect(() => new Function(REASONING_JS + ';return reasoning;')).not.toThrow();
});
test('reasoning css only uses the doctrine radius', () => {
  const r = REASONING_CSS.match(/border-radius:[^;}]+/g) || [];
  for (const x of r) expect(x).toMatch(/var\(--radius\)|50%|:0$/);
});
test('app page ships the component and the old box is gone', () => {
  const html = String(appPage({ login: 'a' }, [], {}, '') || '');
  expect(html).toContain('function reasoning(');
  expect(html).toContain('.rsn-h{');
  expect(html).not.toContain("node('details','stepsbox')");
});
