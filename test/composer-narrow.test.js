// On narrow screens the buttons squeezed the message text to a few pixels. They get their own rows there.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/src/app.css', import.meta.url), 'utf8');

test('narrow screens put the text, then the modes, then + and send on separate rows', () => {
  const narrow = css.slice(css.indexOf('/* Narrow screens: the buttons do not fit'));
  expect(narrow).toContain('@media (max-width:600px){');
  expect(narrow).toContain('div:nth-child(2){grid-column:1/-1;grid-row:1}');
  expect(narrow).toContain('div:last-child > div:first-child{grid-column:1/-1;grid-row:2;justify-self:center}');
  expect(narrow).toContain('div:first-child{grid-column:1;grid-row:3;justify-self:start}');
  expect(narrow).toContain('div:last-child > div:last-child{grid-column:4;grid-row:3}');
});
