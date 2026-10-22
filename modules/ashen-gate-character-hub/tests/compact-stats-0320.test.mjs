/**
 * 0.32.0: Compact keeps the stats: abilities with saves, hit dice / rests / exhaustion beside HP, Strain, initiative /
 * speed / proficiency, conditions, and the Mastery & marks strip above the quick bar. Mocked Foundry and a stand-in
 * Cinders API: this proves the markup and that the same actions run, not the live layout at Compact sizes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const cinders = (strain = 4) => ({active: true, api: {
  strain: {contract: 'ag-strain/1', get: () => ({value: strain, guaranteeAt: 10, band: {label: '[TEST] Band'}, chance: 15})},
  cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'cinst_TEST00001', name: '[TEST] Ember', art: null, powers: [], enhancements: []}]}
}});
async function render({user = users.owner, compact = true, settings = {}, modules = {}, actor = makeActor(), before} = {}) {
  installGlobals({user, modules, settings: {compactMode: compact, ...settings}});
  globalThis.document = {documentElement: {dataset: {}}};
  const sheet = new Hub({document: actor});
  before?.(sheet);
  return {sheet, html: await sheet._renderHTML()};
}
const column = html => html.slice(html.indexOf('<aside class="agch-char agch-char--compact"'), html.indexOf('</aside>'));
const after = (html, a, b) => html.indexOf(a) >= 0 && html.indexOf(a) < html.indexOf(b);

test('Compact column: abilities with saves (proficient highlighted), rolling through the same check and save actions', async () => {
  const {sheet, html} = await render();
  const col = column(html);
  assert.match(col, /<div class="agch-abils agch-abils--compact" role="group"/);
  assert.match(col, /data-action="roll-check" data-ability="str"[^>]*>\s*<span class="agch-abil__key">STR<\/span><span class="agch-abil__mod">\+2<\/span><span class="agch-abil__score">14<\/span>/);
  assert.match(col, /class="ag-btn agch-abil__save is-prof" data-action="roll-save" data-ability="str" data-tooltip="Strength saving throw \(proficient\)"[^>]*><i class="fa-solid fa-circle agch-abil__prof" aria-hidden="true"><\/i><span>\+4<\/span><span class="ag-sr-only">: Strength saving throw, proficient<\/span>/, 'CH-28: a filled dot and text mark a proficient save');
  assert.match(col, /class="ag-btn agch-abil__save" data-action="roll-save" data-ability="dex"[^>]*><i class="fa-regular fa-circle agch-abil__prof" aria-hidden="true"><\/i><span>\+3<\/span>/);
  await sheet.dispatch('roll-check', {dataset: {ability: 'dex'}}, {});
  await sheet.dispatch('roll-save', {dataset: {ability: 'str'}}, {});
  assert.deepEqual(sheet.document.calls.map(c => c[0]), ['rollAbilityCheck', 'rollSavingThrow']);
  const full = (await render({compact: false})).html;
  assert.match(full, /<div class="agch-abils" role="group"/, 'Full keeps its tiles');
  assert.match(full, /<span>Save \+4<\/span>/, 'Full keeps "Save +N"');
});

test('Compact HP block: hit dice, Short / Long Rest and exhaustion beside the bar, same actions; observers see them disabled', async () => {
  const {sheet, html} = await render();
  const col = column(html);
  assert.match(col, /agch-pill--hd/); assert.match(col, /<b>2 \/ 3<\/b>/);
  assert.match(col, /data-action="rest" data-type="short" data-tooltip="Short Rest \(dnd5e dialog: spend hit dice\)"/);
  assert.match(col, /data-action="rest" data-type="long" data-tooltip="Long Rest \(dnd5e dialog\)"/);
  assert.match(col, /agch-pill--exh is-on" data-tooltip="Exhaustion 1 of 6"/);
  assert.ok(after(col, 'data-action="hp-heal"', 'data-action="rest"') && after(col, 'data-action="rest"', 'agch-pill--exh'), 'HP buttons, then hit dice + rests, then exhaustion');
  await sheet.dispatch('rest', {dataset: {type: 'short'}}, {});
  await sheet.dispatch('rest', {dataset: {type: 'long'}}, {});
  await sheet.dispatch('exhaustion', {dataset: {step: '1'}}, {});
  assert.deepEqual(sheet.document.calls.map(c => c[0]), ['shortRest', 'longRest', 'toggleStatusEffect']);
  const obs = column((await render({user: users.observer})).html);
  assert.match(obs, /data-action="rest" data-type="short"[^>]* disabled/);
  assert.match(obs, /data-action="exhaustion" data-step="1"[^>]* disabled/);
  assert.match(obs, /data-action="roll-save" data-ability="str"[^>]* disabled/);
});

test('Compact rests follow Player visibility like Full: hidden from players, kept (marked) for the GM', async () => {
  const hidden = {playerVisibility: {rest: false}};
  assert.doesNotMatch((await render({settings: hidden})).html, /data-action="rest"/);
  assert.match((await render({user: users.gm, settings: hidden})).html, /data-action="rest" data-type="short" data-tooltip="Short Rest \(dnd5e dialog: spend hit dice\) \(hidden from players/);
});

test('Compact Strain: players get the read-only pill in the HP block, the GM the − / + row; the switch and a missing Cinders hide it', async () => {
  let col = column((await render({modules: {'ashen-gate-cinders': cinders()}})).html);
  assert.match(col, /agch-pill--strain ag-badge--warn"/);
  assert.ok(after(col, 'agch-pill--exh', 'agch-pill--strain'), 'beside exhaustion');
  assert.doesNotMatch(col, /data-action="strain-step"/);
  col = column((await render({user: users.gm, modules: {'ashen-gate-cinders': cinders()}})).html);
  assert.match(col, /<div class="agch-strain"/); assert.match(col, /data-action="strain-step" data-step="1"/);
  assert.doesNotMatch(col, /agch-pill--strain/);
  col = column((await render({modules: {'ashen-gate-cinders': cinders()}, settings: {playerVisibility: {strain: false}}})).html);
  assert.doesNotMatch(col, /agch-pill--strain|agch-strain/);
  col = column((await render()).html);
  assert.doesNotMatch(col, /agch-pill--strain|agch-strain/, 'no Cinders: nothing');
});

test('Compact Mastery & marks strip sits above the quick bar, outside the scrolling column, with target count and Strain chip', async () => {
  const {html} = await render({modules: {'ashen-gate-cinders': cinders()}});
  assert.ok(html.indexOf('</aside>') < html.indexOf('aria-label="Mastery and marks"'), 'in the hotbars, not the column');
  assert.ok(after(html, 'aria-label="Mastery and marks"', 'aria-label="Quick bar"'));
  assert.match(html, /agch-hotbar__targets"><i class="fa-solid fa-crosshairs" aria-hidden="true"><\/i> No target/);
  assert.match(html, /agch-hotbar__strain/);
  assert.match(html, /<span class="agch-marks__title"[^>]*>Mastery &amp; marks<\/span>/);
  assert.doesNotMatch((await render({settings: {playerVisibility: {hotbars: false}}})).html, /Mastery and marks|Quick bar/, 'GM hides the hotbars: none in Compact either');
});

test('Compact stat line: initiative rolls, speed and proficiency; AC joins it only when the slots are hidden', async () => {
  const {sheet, html} = await render();
  const col = column(html);
  assert.match(col, /<div class="agch-statline" role="group"/);
  assert.match(col, /data-action="roll-initiative" data-tooltip="Roll initiative \(right-click to configure\)"[^>]*><span>\+3<\/span>/);
  assert.match(col, /Speed<\/span><b>30 ft<\/b>/); assert.match(col, /Prof<\/span><b>\+2<\/b>/);
  assert.doesNotMatch(col, /agch-statline__label">AC/, 'AC is on the art');
  await sheet.dispatch('roll-initiative', {dataset: {}}, {});
  assert.equal(sheet.document.calls.at(-1)[0], 'rollInitiativeDialog');
  const noSlots = column((await render({settings: {playerVisibility: {equipment: false}}})).html);
  assert.match(noSlots, /agch-statline__label">AC<\/span><b>15<\/b>/);
});

test('Compact conditions line: active chips and + to add, as in Full', async () => {
  const {sheet, html} = await render({actor: makeActor({statuses: ['prone']})});
  assert.match(column(html), /<section class="agch-conds"[\s\S]*data-action="condition" data-id="prone" aria-pressed="true"/);
  await sheet.dispatch('cond-add', {dataset: {}}, {});
  assert.match(column(await sheet._renderHTML()), /agch-conds__list/);
});

test('Compact order and what stays: name, Cinder chips, art + slots, stat line, HP, abilities, conditions; header controls kept; no tabs', async () => {
  const {html} = await render({modules: {'ashen-gate-cinders': cinders()}});
  const col = column(html), order = ['agch-name', 'agch-cchips', 'agch-doll', 'agch-statline', 'agch-hp"', 'agch-abils', 'agch-conds'];
  order.slice(1).forEach((k, i) => assert.ok(after(col, order[i], k), `${order[i]} before ${k}`));
  // 0.33.0 (CH-04): Compact header = Compact/Full, the ⋯ menu (Appearance… with the see-through slider, Pop out, Codex) and Help.
  for (const keep of [/data-action="compact-toggle"/, /data-action="more-menu"/, /data-action="help"/]) assert.match(html, keep);
  assert.doesNotMatch(html, /data-compact-opacity/);
  for (const gone of [/role="tablist"/, /agch-pane/, /agch-agbar/, /agch-tiles/, /agch-idcard/]) assert.doesNotMatch(html, gone);
});

test('Cinder chip in Compact opens the Full Hub at Ashen Gate → Cinders (Compact has no tabs)', async () => {
  const {sheet} = await render({modules: {'ashen-gate-cinders': cinders()}});
  await sheet.dispatch('cinder-open', {dataset: {instance: 'cinst_TEST00001'}}, {});
  assert.equal(sheet.compact, false);
  assert.deepEqual([sheet.tab, sheet.agTab], ['ashen-gate', 'ashen-gate-cinders']);
  assert.notEqual(game.settings.store.compactMode, false, '0.33.0 (CH-14): the saved Compact choice is kept');
  await sheet.dispatch('compact-toggle', {dataset: {}}, {});
  assert.equal(game.settings.store.compactMode, true, 'the toggle itself still saves');
});

test('Compact CSS: only the column scrolls (hotbars frozen), no sideways scroll, see-through rule unchanged', () => {
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-app \.agch-root--compact \{ overflow: hidden; \}/);
  assert.match(css, /\.agch-app \.agch-root--compact \.agch-char--compact \{ overflow-x: hidden; overflow-y: auto;/);
  assert.match(css, /\.agch-app \.agch-hotbars \{ flex: none;/);
  assert.ok(css.indexOf('.agch-root--compact { overflow: hidden; }') > css.indexOf('@container (max-width: 900px)'), 'after the stack rule, so it wins there');
  assert.match(css, /\.agch-root--compact \.agch-char--compact \{ background: radial-gradient\(ellipse at 50% 28%, var\(--agch-bg-raised-fade\), var\(--agch-bg\) 72%\); \}/);
});
