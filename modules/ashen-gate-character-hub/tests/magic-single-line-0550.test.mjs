/**
 * 0.55.0 Magic: every spell row is exactly one line (no chips under the name, no Duration cell), Casting / Range / Components in
 * fixed-width columns that drop by container query, Prepare / Prepared / Always the same size. Mocked Foundry: this proves the
 * markup and the CSS text, not the live Forge layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {SPELL_COLUMNS} from '../scripts/spell-rows.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const act = [{activation: {type: 'action'}}];
const spell = (id, name, o = {}) => ({id, name, type: 'spell', system: {level: 1, method: 'spell', prepared: 0, canPrepare: true, classIdentifier: 'wizard', activities: act, description: {value: `<p>${name} text.</p>`}, properties: new Set(), ...o},
  labels: {level: '1st Level', school: 'Enchantment', activation: 'Action', range: '30 ft', duration: 'Concentration, up to 1 minute', components: {vsm: 'V, S, M'}}});
const items = [{id: 'wizard', name: 'Wizard', type: 'class', system: {identifier: 'wizard', spellcasting: {progression: 'full', preparation: {max: 9}}}},
  spell('a', '[TEST] Plain'), spell('b', '[TEST] Prepared one', {prepared: 1}), spell('c', '[TEST] Always one', {prepared: 2}),
  spell('d', '[TEST] Focus', {properties: new Set(['concentration', 'ritual'])}), spell('e', '[TEST] Cantrip', {level: 0, canPrepare: false}),
  spell('f', '[TEST] A very long spell name that must stay on one line however narrow the Hub gets')];
const actor = () => { const a = makeActor({items, system: {spells: {spell1: {value: 2, max: 3}}}}); for (const d of items) if (d.labels) a.items.get(d.id).labels = d.labels; a.spellcastingClasses = {wizard: a.items.get('wizard')}; return a; };
const render = async settings => { installGlobals({user: users.owner, settings}); const s = new Hub({document: actor()}); s.tab = 'magic'; const h = await s._renderHTML(); return h.slice(h.indexOf('class="agch-body"')); };
const rowOf = (b, id) => { const at = b.indexOf(`data-item-id="${id}"`); return b.slice(b.lastIndexOf('<li', at), b.indexOf('</li>', at)); };
const mainOf = row => row.slice(row.indexOf('<span class="agch-card__main">'), row.indexOf('<span class="agch-card__fact'));
const lineOf = row => row.slice(0, row.indexOf('<div class="agch-card__detail'));
const detailOf = row => row.slice(row.indexOf('<div class="agch-card__detail'));

test('the line has no school or level chip and no Duration cell; C and R badges sit by the name', async () => {
  const b = await render({});
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const line = lineOf(rowOf(b, id));
    assert.doesNotMatch(line, /Enchantment|1st Level|Cantrip<\/span>|Duration|Concentration, up to/, `${id}: nothing of school, level or duration on the line`);
    assert.doesNotMatch(line, /<span class="ag-badge">/, `${id}: no chips`);
    assert.doesNotMatch(line, /agch-card__summary/);
  }
  const focus = mainOf(rowOf(b, 'd'));
  assert.match(focus, /agch-item__badges"><span class="ag-badge agch-flag" data-tooltip="Concentration"><span aria-hidden="true">C<\/span><span class="ag-sr-only">Concentration<\/span><\/span> <span class="ag-badge agch-flag" data-tooltip="Ritual"><span aria-hidden="true">R<\/span><span class="ag-sr-only">Ritual<\/span><\/span>/);
  assert.doesNotMatch(mainOf(rowOf(b, 'a')), /agch-item__badges/, 'no badges when neither');
});

test('headings and columns: ITEM, Casting, Range, Components, (hidden brief), Actions; no Duration or "Casting time"', async () => {
  const b = await render({});
  assert.match(b, /<li class="agch-card__headrow" aria-hidden="true"><span><\/span><span><\/span><span>Item<\/span><span class="agch-sp-cast">Casting<\/span><span class="agch-sp-range">Range<\/span><span class="agch-sp-comps">Components<\/span><span class="agch-sp-brief">Casting · Range<\/span><span>Actions<\/span><\/li>/);
  assert.doesNotMatch(b, /Casting time/);
  assert.doesNotMatch(b.slice(0, b.indexOf('<div class="agch-card__detail')), /Duration/, 'no Duration heading or cell on the line');
  assert.deepEqual(SPELL_COLUMNS.map(c => c.label), ['Casting', 'Range', 'Components', 'Casting · Range']);
  const row = lineOf(rowOf(b, 'a'));
  assert.match(row, /<span class="agch-card__fact agch-sp-cast" data-label="Casting" data-tooltip="Action">Action<\/span><span class="agch-card__fact agch-sp-range" data-label="Range" data-tooltip="30 ft">30 ft<\/span><span class="agch-card__fact agch-sp-comps" data-label="Components" data-tooltip="V, S, M">V, S, M<\/span><span class="agch-card__fact agch-sp-brief" data-label="Casting · Range">Action · 30 ft<\/span>/);
});

test('name is one button that ellipsizes: full name in the markup, tooltip, tabindex kept', async () => {
  const b = await render({});
  const row = rowOf(b, 'f');
  assert.match(row, /class="agch-item__name agch-spell__name"[^>]*data-tooltip="\[TEST\] A very long spell name[^"]*"[^>]*>\[TEST\] A very long spell name that must stay on one line however narrow the Hub gets<\/button>/);
  assert.match(CSS, /\.agch-app \.agch-spell__name \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__main \{[^}]*flex-wrap: nowrap;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__fact \{[^}]*text-overflow: ellipsis; white-space: nowrap;/);
});

test('Prepare, Prepared and Always share size classes; Prepared keeps its word; Cast has a fixed class; cantrips keep an empty slot', async () => {
  const b = await render({});
  const prepare = lineOf(rowOf(b, 'a')), prepared = lineOf(rowOf(b, 'b')), always = lineOf(rowOf(b, 'c')), cantrip = lineOf(rowOf(b, 'e'));
  assert.match(prepare, /class="ag-btn ag-btn--sm agch-prep" data-action="spell-prepare" data-id="a"[^>]*><span>Prepare<\/span>/);
  assert.match(prepared, /class="ag-btn ag-btn--sm agch-prep ag-btn--primary is-prepared" data-action="spell-prepare" data-id="b" data-tooltip="Unprepare"><span>Prepared<\/span>/, 'gold fill, same size classes, the word stays');
  assert.match(always, /<span class="ag-badge agch-prep agch-prep--always" data-tooltip="Always prepared">Always<\/span>/);
  assert.match(cantrip, /<span class="agch-prep agch-prep--none" aria-hidden="true"><\/span><button type="button" class="ag-btn ag-btn--sm agch-cast"/);
  for (const r of [prepare, prepared, always]) assert.match(r, /class="ag-btn ag-btn--sm agch-cast" data-action="item-use"[^>]*aria-label="Cast /);
  // CSS: one fixed width for all three, one explicit font, so the state is the colour plus the word
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-prep \{[^}]*width: var\(--agch-sp-prep\);[^}]*font: 500 var\(--ag-text-sm\)/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-cast \{[^}]*width: var\(--agch-sp-cast\); white-space: nowrap;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__actions \{[^}]*flex-wrap: nowrap;[^}]*width: var\(--agch-sp-actions\);/);
});

test('the open row holds Level, School, Casting, Range, Duration, Components, then the description, at every width', async () => {
  const b = await render({});
  const d = detailOf(rowOf(b, 'a'));
  assert.match(d, /<dl class="agch-spell__facts"><div><dt>Level<\/dt><dd>1st Level<\/dd><\/div><div><dt>School<\/dt><dd>Enchantment<\/dd><\/div><div><dt>Casting<\/dt><dd>Action<\/dd><\/div><div><dt>Range<\/dt><dd>30 ft<\/dd><\/div><div><dt>Duration<\/dt><dd>Concentration, up to 1 minute<\/dd><\/div><div><dt>Components<\/dt><dd>V, S, M<\/dd><\/div><\/dl><p class="agch-spell__text">/);
  assert.match(d, /\[TEST\] Plain text\./);
  assert.match(CSS, /\.agch-app \.agch-spell__facts \{ display: flex;/);
  assert.doesNotMatch(CSS, /\.agch-spell__facts \{ display: none/);
});

test('CSS: one grid template per step and container-query steps in order, none of them wrapping or scrolling the row', () => {
  assert.match(CSS, /\.agch-app \.agch-body \{[^}]*container: agch-body \/ inline-size;/);
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards \{ display: grid; grid-template-columns: max\(var\(--ag-icon-chip\), var\(--ag-control-h-sm\)\) var\(--agch-icon-size\) minmax\(6rem, 1fr\) 6\.5rem 5rem 5\.5rem var\(--agch-sp-actions\); \}/);
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards > li \{ display: grid; grid-template-columns: subgrid;/);
  const at = w => { const i = CSS.indexOf(`@container agch-body (max-width: ${w}px) {`); assert.ok(i >= 0, `step ${w}px`); return i; };
  const steps = [760, 660, 560, 440, 380];
  assert.deepEqual(steps.map(at), steps.map(at).slice().sort((x, y) => x - y), 'steps run widest to narrowest');
  const seg = w => { const i = at(w); return CSS.slice(i, CSS.indexOf('\n}\n', i)); };
  assert.match(seg(760), /agch-sp-comps \{ display: none; \}/);
  assert.match(seg(660), /agch-sp-cast \{ display: none; \}/);
  assert.match(seg(560), /agch-sp-range \{ display: none; \}[\s\S]*agch-sp-brief \{ display: block; \}/);
  assert.match(seg(440), /agch-sp-brief \{ display: none; \}[\s\S]*minmax\(6rem, 1fr\) var\(--agch-sp-actions\)/);
  assert.match(seg(380), /--agch-sp-cast: var\(--ag-control-h-sm\);[\s\S]*agch-cast > span \{ position: absolute;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-sp-brief \{ display: none; \}/, 'the short text is off at full width');
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__fact::before \{ content: none; \}/, 'no inline labels in the one-line rows');
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards > \.agch-card__headrow \{ display: grid; \}/, 'headings stay at every width');
  const block = CSS.slice(CSS.indexOf('/* 0.55.0 Magic'), CSS.indexOf('/* 0.53.0: Combat'));
  assert.doesNotMatch(block, /flex-wrap: wrap|overflow-x/, 'nothing wraps or scrolls sideways');
});

test('Combat, Inventory and Features keep their 0.53.0 behaviour (640px steps, no Magic classes)', () => {
  assert.match(CSS, /@container \(max-width: 640px\) \{[\s\S]*\.agch-crow \.agch-card__fact--late \{ display: none; \}/);
  assert.doesNotMatch(CSS.slice(CSS.indexOf('/* 0.53.0: Combat'), CSS.indexOf('/* Compact mode (0.29.0)')), /agch-sp-|agch-spells/);
});

test('long rows (Show spell descriptions) are unchanged: chips, four fact columns with Duration, original buttons', async () => {
  const b = await render({showSpellDescriptions: true});
  assert.doesNotMatch(b, /agch-spells"|agch-sp-|agch-prep\b|agch-prep--|agch-cast\b/);
  assert.match(b, /<span>Casting<\/span><span>Range<\/span><span>Duration<\/span><span>Components<\/span>/);
  assert.match(b, /<span class="ag-badge">Enchantment<\/span>/);
  assert.match(b, /Concentration, up to 1 minute/);
  assert.match(b, /class="ag-btn ag-btn--primary" data-action="spell-prepare" data-id="b"/);
  assert.match(b, /class="ag-btn ag-btn--sm" data-action="spell-prepare" data-id="a"/);
});

test('README and Help describe the single line and the steps', () => {
  assert.match(README, /single line since 0\.55\.0/);
  assert.match(README, /Components at 760px or less, Casting at 660px, Range at 560px[\s\S]*440px/);
  assert.match(HELP_HTML, /exactly one line each[\s\S]*Casting[\s\S]*Components[\s\S]*Prepared<\/strong> is the gold one/);
});
