// Wrapped text gets the full width of the message box; the buttons move under it.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../web/src/${p}`, import.meta.url), 'utf8');

test('the box is marked tall once the text wraps', () => {
  expect(read('App.jsx')).toContain("className={tall ? 'one-row tall' : 'one-row'}");
});

test('a tall box gives the text every column and puts the buttons on the second row', () => {
  const css = read('app.css');
  expect(css).toContain('.one-row.tall > div > div:nth-child(2){grid-column:1/-1;grid-row:1}');
  expect(css).toContain('.one-row.tall > div > div:first-child,.one-row.tall > div > div:last-child > div{grid-row:2}');
});
