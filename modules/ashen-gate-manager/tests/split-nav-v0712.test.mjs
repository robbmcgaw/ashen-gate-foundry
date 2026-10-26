/** Kit 2.4.0 stacked split: this window binds bindSplitNav after each render (scroll to the detail, Back to list).
 *  The helper itself is tested in scripts/kit-tests/bind-split-nav.test.mjs. Logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Manager binds the stacked-split navigation', () => {
  const src = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*bindSplitNav[^}]*\} from '?"?\.\/ag-html\.mjs/);
  assert.match(src, /bindSplitNav\(root\)/);
});
