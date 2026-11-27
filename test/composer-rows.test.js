// The message box is always two rows: the text across the whole box, then +, the modes and send.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/src/app.css', import.meta.url), 'utf8');

test('the text has the first row to itself', () => {
  expect(css).toContain('.one-row > div > div:nth-child(2){grid-column:1/-1;grid-row:1;padding-inline:8px}');
});

test('+, the modes and send share the second row', () => {
  expect(css).toContain('.one-row > div > div:first-child{grid-column:1;grid-row:2;');
  expect(css).toContain('.one-row > div > div:last-child > div:first-child{grid-column:3;grid-row:2;');
  expect(css).toContain('.one-row > div > div:last-child > div:last-child{grid-column:4;grid-row:2;');
});
