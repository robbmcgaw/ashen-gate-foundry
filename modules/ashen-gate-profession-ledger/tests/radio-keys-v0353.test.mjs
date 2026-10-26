/** 0.35.3: the Ledger's value switches (GM: XP Award / Adjust, Sort recipes, Where) get the kit's arrow-key pattern in the
 *  window, the Tidy5e tab and the Character Hub embed. The pattern itself is tested in scripts/kit-tests; this proves each
 *  surface binds it. Logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

test('the window, the Tidy5e tab and the embed each bind their radio groups after rendering', () => {
  assert.match(main, /import \{[^}]*bindRadioGroups[^}]*\} from '\.\/ag-html\.mjs'/);
  assert.match(main, /bindFolds\(this\.element,this\._ui\),bindRadioGroups\(this\.element\)\]/, 'window');
  assert.match(main, /bindFolds\(target,uiState\(ID\)\);\s*bindRadioGroups\(target\);/, 'Tidy5e tab');
  assert.match(main, /bindFolds\(element,uiState\(ID\)\);bindRadioGroups\(element\);/, 'Character Hub embed');
});

test('the switches it covers are still radio groups', () => {
  for (const label of ['XP change', 'Sort recipes', 'Where']) assert.match(main, new RegExp(`role="radiogroup" aria-label="[^"]*${label}`), label);
});
