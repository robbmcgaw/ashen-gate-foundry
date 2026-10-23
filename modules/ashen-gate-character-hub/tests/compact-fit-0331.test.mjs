/**
 * 0.33.1: the Compact column fits its window (the live runner found it 122 px taller than its box at the default
 * Compact size, with the ability / save row half under the bottom edge). Mocked Foundry: this proves the CSS rules and
 * the markup that make it fit, not the live layout; the sizes were checked in Chromium against the shipped CSS.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const rule = sel => { const at = CSS.lastIndexOf(`${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return CSS.slice(at, CSS.indexOf('}', at)); };
const cinders = {active: true, api: {cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'cinst_TEST00001', name: '[TEST] Ember', art: null, powers: [], enhancements: []}]}}};
async function render({compact = true, actor = makeActor()} = {}) {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cinders}, settings: {compactMode: compact}});
  globalThis.document = {documentElement: {dataset: {}}};
  return new Hub({document: actor})._renderHTML();
}
const column = html => html.slice(html.indexOf('<aside class="agch-char agch-char--compact"'), html.indexOf('</aside>'));

test('Compact layout rule: the column fills the body and scrolls inside itself; the doll shrinks before it has to', () => {
  assert.match(rule('.agch-app .agch-root--compact'), /overflow: hidden/);
  assert.match(rule('.agch-app .agch-char--compact'), /flex: 1; min-height: 0/);
  assert.match(rule('.agch-app .agch-root--compact .agch-char--compact'), /overflow-y: auto/);
  const doll = rule('.agch-app .agch-char .agch-doll');
  assert.match(doll, /container: agch-doll \/ size/, 'the doll is the size container its slots measure');
  assert.match(doll, /flex: 0 1 calc\(var\(--agch-slot-max\) \* 5 \+ var\(--ag-space-2\) \* 4\)/, 'full size, may shrink, never grows');
  assert.match(doll, /min-height: calc\(var\(--agch-slot-min\) \* 5 \+ var\(--ag-space-2\) \* 4\)/, 'never below icon-button slots');
  assert.match(rule('.agch-app .agch-char .agch-doll > *'), /--agch-slot: clamp\(var\(--agch-slot-min\), min\(\(100cqh - var\(--ag-space-2\) \* 4\) \/ 5, \(100cqw - var\(--ag-space-2\) \* 6\) \/ 7\), var\(--agch-slot-max\)\)/,
    'five slot rows fill the height; seven slots and six gaps fit the width');
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__row'), /grid-row: 2; grid-column: 2; flex-wrap: nowrap/, 'rings and trinkets under the art');
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__col'), /grid-row: 1 \/ span 2/);
  assert.match(rule('.agch-app .agch-drawer .agch-quick'), /grid-template-columns: repeat\(10, minmax\(0, var\(--ag-slot\)\)\)/, 'quick bar on one row');
  assert.match(rule('.agch-app .agch-char--compact > *'), /flex: none/, 'everything else keeps its height');
});

test('Compact markup: name row with the Cinder chips (Configure… is in the ⋯ menu since 0.34.0); an empty "Other equipped" is left out, in Full too', async () => {
  const col = column(await render());
  assert.match(col, /<div class="agch-ident"><div class="agch-cchips"[\s\S]*data-action="inspiration"/, '0.37.0: the name is in the header');
  assert.doesNotMatch(col, /data-action="configure"/);
  assert.doesNotMatch(col, /agch-other/, 'nothing equipped outside the slots: no row');
  const stone = makeActor({items: [{id: 'stone', name: '[TEST] Odd Stone', type: 'equipment', system: {quantity: 1, equipped: true, type: {value: 'wondrous'}}}]});
  assert.match(column(await render({actor: stone})), /Other equipped <span class="ag-badge">1<\/span>[\s\S]*data-id="stone"/, 'shown when something is there');
  const full = await render({compact: false});
  assert.doesNotMatch(full, /agch-other/, '0.34.0: Full leaves the empty row out too (room for the stats)');
  assert.doesNotMatch(full, /agch-ctop/);
});

test('Compact marks strip: "No marks" on one line, where marks come from moves into the help button; Full unchanged', async () => {
  const html = await render();
  assert.match(html, /<span class="agch-muted agch-marks__empty">No marks<\/span>/);
  assert.match(html, /class="agch-marks__help" data-tooltip="[^"]*Marks: they come from equipped weapons with a mastery you know[^"]*" aria-label="[^"]*Marks: they come from/);
  const full = await render({compact: false});
  assert.match(full, /No marks: they come from equipped weapons/);
  assert.doesNotMatch(full, /Marks: they come from/);
});
