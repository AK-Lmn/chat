// The message box must have the cursor when chat opens. autoFocus on ChatComposerInput did nothing (it is not passed to
// the editor), so the page uses the component's handle.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');

test('the message box is focused on open through its handle, except on touch screens', () => {
  expect(app).toContain('useEffect(() => { if (!touch) composerInput.current?.focus(); }, []);');
  expect(app).toContain('<ChatComposerInput handleRef={composerInput}');
});
