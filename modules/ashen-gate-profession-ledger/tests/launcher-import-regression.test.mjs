import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
test('Actors launcher helper is imported before use',()=>{
  assert.match(src,/import \{arrangeLaunchers\} from '\.\/launcher-order\.mjs';/);
  assert.match(src,/arrangeLaunchers\(header\)/);
});
