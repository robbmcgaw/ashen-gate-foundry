import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
test('shared Actors shelf helper is imported and used independently of Manager',()=>{
  assert.match(src,/import \{attachSkillTreesLauncher\} from '\.\/sidebar-launcher\.mjs';/);
  assert.match(src,/return attachSkillTreesLauncher\(/);
});
