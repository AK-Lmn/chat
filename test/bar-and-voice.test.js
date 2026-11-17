import { expect, test } from 'bun:test';
import { appPage } from '../src/page.js';

const page = appPage({ login: 'ann', connected: [] });

test('the flisk bar does not clip its dropdown menus', () => {
  // overflow-x:auto turns overflow-y into auto too, which hides the open menu panel
  expect(page).not.toContain('flisk-bar{display:block;max-width:100vw;overflow-x:auto}');
  expect(page).toContain('flisk-bar{display:block;max-width:100vw;overflow-x:clip}');
});

test('reading answers aloud is off until the person turns it on', () => {
  expect(page).toContain("let voiceOn=lsGet('chat_voice2')==='1'");
  expect(page).not.toContain("lsGet('chat_voice')");
});
