/**
 * 0.57.2 regression: below 640px the older narrow rule (`@container (max-width: 640px) { .agch-cards { display: block } }`) turned the
 * item lists into blocks and stacked every cell. This checks, from the CSS text and the constants, that the item lists state
 * display: grid, and that at every step of every tab the number of visible cells equals the grid template's track count and the
 * hidden cells are display: none. (A real-browser check at 13 widths found the break at exactly body <= 640px, all three item tabs.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ITEM_LAYOUT, ITEM_STEPS, COL_ID} from '../scripts/item-rows.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const css56 = CSS.slice(CSS.indexOf('/* 0.56.0:'), CSS.indexOf('@media (prefers-reduced-motion: reduce) { .agch-app .agch-spell__chev'));
const tracks = tpl => tpl.match(/minmax\([^)]*\)|var\([^)]*\)|[\w.]+/g).length;

test('the item lists and Magic say display: grid, so the 640px block rule cannot stack them', () => {
  assert.match(CSS, /@container \(max-width: 640px\) \{\n  \.agch-app \.agch-cards \{ display: block; \}/, 'the old rule is still there');
  assert.match(css56, /\.agch-app \.agch-crows\.agch-cards \{ display: grid; \}/);
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards \{ display: grid;/);
  assert.doesNotMatch(css56, /\.agch-crows\.agch-cards[^{]*\{[^}]*display: (block|flex)/, 'no later rule turns the lists back');
});

test('at every step of every tab: visible cells = template tracks, hidden cells are display: none', () => {
  for (const [tab, L] of Object.entries(ITEM_LAYOUT)) {
    const blocks = [...css56.matchAll(new RegExp(`@container agch-body \\(max-width: (\\d+)px\\) \\{\\n  /\\* ${tab[0].toUpperCase() + tab.slice(1)}: [^*]*\\*/\\n([\\s\\S]*?)\\n\\}`, 'g'))].map(m => ({width: +m[1], body: m[2]}));
    assert.equal(blocks.length, ITEM_STEPS[tab].length, `${tab}: one block per step`);
    for (const [set, cols] of Object.entries(L.sets)) {
      const base = css56.match(new RegExp(`\\.agch-crows--${tab}\\.agch-set-${set}\\.agch-cards \\{ grid-template-columns: ([^;]*); \\}`))[1];
      let template = base; const hidden = [];
      assert.equal(tracks(template), 3 + cols.length + 1, `${tab}/${set}: base`);
      blocks.forEach((b, i) => {
        for (const m of b.body.matchAll(new RegExp(`\\.agch-crows--${tab} \\.agch-ic-(\\w+) \\{ display: none; \\}`, 'g'))) hidden.push(m[1]);
        const t = b.body.match(new RegExp(`\\.agch-crows--${tab}\\.agch-set-${set}\\.agch-cards \\{ grid-template-columns: ([^;]*); \\}`));
        if (t) template = t[1];
        const visible = cols.filter(c => !hidden.includes(c));
        assert.equal(tracks(template), 3 + visible.length + 1, `${tab}/${set} at ${b.width}px: ${visible.length} data cells + lead, icon, name, actions`);
        // every hidden column's cell AND heading carry the class that is display: none (cell and heading share agch-ic-<id>)
        for (const h of hidden.filter(h => cols.includes(h))) assert.match(css56, new RegExp(`\\.agch-ic-${h} \\{ display: none; \\}`));
      });
    }
  }
  assert.ok(COL_ID.damage === 'dice');
});
