/** 0.33.2: the value switches (role="radio" buttons) get the kit's arrow-key pattern. The pattern itself is tested in
 *  scripts/kit-tests/bind-radio-groups.test.mjs; this proves every window that renders such a switch binds it. Logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');

test('the Utilities window binds its radio groups (Change coins action, Whose coins) after each render', () => {
  const main = read('main.mjs');
  assert.match(main, /import \{[^}]*bindRadioGroups[^}]*\} from '\.\/ag-html\.mjs'/);
  assert.match(main, /for\(const g of root\.querySelectorAll\('\[role="radiogroup"\]'\)\)bindRadioGroups\(g\);/, 'each group, not the window element (which already carries the key guard)');
  assert.match(main, /role="radio" data-fund-action=/, 'the switch it covers is still a radio group');
  assert.match(read('party-fund.mjs'), /role="radiogroup" aria-labelledby="agu-fund-whose-label"/);
});

test('the shop window binds Buy / Sell, Coins go to and the Bank form\'s Whose coins', () => {
  const buy = read('shop-buy.mjs');
  assert.match(buy, /import \{[^}]*bindRadioGroups[^}]*\} from '\.\/ag-html\.mjs'/);
  assert.match(buy, /if\(body\)\{\s*for\(const g of body\.querySelectorAll\('\[role="radiogroup"\]'\)\)bindRadioGroups\(g\);/, 'each group in the window body, which is new on every render');
  assert.match(read('shop-sell.mjs'), /role="radiogroup" aria-label="Buy or sell"/);
  assert.match(read('services.mjs'), /role="radiogroup" aria-labelledby="agu-bank-whose-/);
});
