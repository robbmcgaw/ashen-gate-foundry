import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceHtml, sanitizePerkHtml} from '../scripts/perk-html.mjs';
import {buildPerkCard} from '../scripts/perk-card.mjs';
import {perkPanelBody} from '../scripts/perk-panel.mjs';

const TAGS = /<(\/?)([a-z][a-z0-9]*)(?:\s[^>]*)?>/g;
function isBalanced(html) {
  const stack = [];
  for (const m of String(html).matchAll(TAGS)) {
    const name = m[2];
    if (name === 'br' || name === 'hr') continue;
    if (!m[1]) stack.push(name);
    else if (stack.pop() !== name) return false;
  }
  return stack.length === 0;
}
// A perk Item's description as it is imported: the whole thing sits in one <section> wrapper, with the table first and headed sections after.
const DESCRIPTION = '<section class="ag-profession-entry"><h2>[TEST] Sample Perk</h2><table><tbody><tr><th>Tier</th><td>Apprentice (level 1)</td></tr><tr><th>Tool</th><td>[TEST] Supplies</td></tr></tbody></table><h3>Effect &amp; Rules</h3><p>[TEST] You do a thing. It works. It lasts.</p><h3>Notes</h3><p>[TEST] Costs one point.</p></section>';

test('balanceHtml drops a closing tag with no opener and closes what is left open', () => {
  assert.equal(balanceHtml('<p>a</p></section>'), '<p>a</p>');
  assert.equal(balanceHtml('<div><p>a'), '<div><p>a</p></div>');
  assert.equal(balanceHtml('a<br>b'), 'a<br>b');
  assert.equal(balanceHtml(''), '');
});

test('the card and the panel never return markup with a stray closing tag (it closed the panel and broke the window)', () => {
  const safe = sanitizePerkHtml(DESCRIPTION);
  const card = buildPerkCard('[TEST] Sample Perk', safe, '');
  assert.ok(card.detailsHtml);
  assert.ok(isBalanced(card.detailsHtml), card.detailsHtml);
  const panel = perkPanelBody('[TEST] Sample Perk', DESCRIPTION, '');
  assert.ok(panel.body);
  assert.ok(isBalanced(panel.body), panel.body);
  assert.ok(isBalanced(panel.facts), panel.facts);
  assert.doesNotMatch(panel.body, /<\/section>/);
});

test('descriptions with several wrappers and headings stay balanced piece by piece', () => {
  const html = '<section><h3>Effect</h3><div><p>x</p></div></section><section><h3>Notes</h3><ul><li>a</li></ul></section>';
  const panel = perkPanelBody('[TEST] Two', html, '');
  assert.ok(isBalanced(panel.body), panel.body);
});
