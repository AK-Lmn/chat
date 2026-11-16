// Chat is built from what each service says it can do (capabilities/*.json, copied by scripts/sync-capabilities.mjs).
// This fails when a service learns a new way to be asked for and chat's prompt, widget or page does not follow.
import { describe, expect, test } from 'bun:test';
import { CAPABILITIES } from '../src/capabilities.generated.js';
import { SYSTEM } from '../src/prompt.js';
import { WIDGETS } from '../src/widgets.js';
import { appPage } from '../src/page.js';

const page = appPage({});
for (const m of CAPABILITIES) {
  describe(`${m.service} (${m.origin}, sign-in: ${m.auth})`, () => {
    for (const c of m.capabilities) {
      const w = WIDGETS[c.id];
      if (!w) continue; // a capability chat only calls from inside another one (citable.check) has no card of its own
      test.each(c.asks)(`the prompt for "${c.id}" covers the ask "%s"`, (ask) => {
        expect(w.prompt.toLowerCase()).toContain(`"${ask.toLowerCase()}"`);
        expect(SYSTEM).toContain(w.prompt);
      });
      test(`"${c.id}" needs a computer only if its manifest says so`, () => {
        expect(!!w.needsComputer).toBe(!!c.needsComputer);
      });
      if (c.link) test(`the page links "${c.id}" with the manifest's link`, () => {
        const [head] = c.link.split('{url}');
        expect(page).toContain(`'${head}'+encodeURIComponent(`);
      });
    }
  });
}
test('every capability names who may call it', () => {
  for (const m of CAPABILITIES) expect(['none', 'login.flisk.si']).toContain(m.auth);
});
