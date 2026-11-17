import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flagged, deprecationSections } from './check-models.mjs';

const md = `# Changelog\n\n## 2026-05-08\n\n**Planned model deprecations**\n- \`@cf/old/model\`\n\n## 2026-04-01\n\nNew model \`@cf/new/model\` added.\n`;

test('only deprecation sections count', () => {
  assert.equal(deprecationSections(md).length, 1);
});
test('flags a used model named in a deprecation notice', () => {
  assert.deepEqual(flagged(['@cf/old/model'], md), [{ id: '@cf/old/model', date: '2026-05-08' }]);
});
test('ignores a model that is only added', () => {
  assert.deepEqual(flagged(['@cf/new/model'], md), []);
});
