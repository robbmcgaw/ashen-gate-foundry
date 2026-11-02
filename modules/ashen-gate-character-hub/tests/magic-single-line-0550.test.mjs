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
import {SPELL_COLUMNS, SPELL_PRIORITY, SPELL_STEPS, SPELL_MIN_LIST, diceText, diceFull, castingShort} from '../scripts/spell-rows.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const act = [{activation: {type: 'action'}}];
const spell = (id, name, o = {}) => ({id, name, type: 'spell', system: {level: 1, method: 'spell', prepared: 0, canPrepare: true, classIdentifier: 'wizard', activities: act, description: {value: `<p>${name} text.</p>`}, properties: new Set(), ...o},
  labels: {damages: [{label: '8d6 Fire'}], level: '1st Level', school: 'Enchantment', activation: 'Action', range: '30 ft', duration: 'Concentration, up to 1 minute', components: {vsm: 'V, S, M'}}});
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

test('headings and columns: ITEM, Dice, Range, Casting, Components, Actions; no Duration or "Casting time"', async () => {
  const b = await render({});
  assert.match(b, /<li class="agch-card__headrow" aria-hidden="true"><span><\/span><span><\/span><span>Item<\/span><span class="agch-sp-dice">Dice<\/span><span class="agch-sp-range">Range<\/span><span class="agch-sp-cast">Casting<\/span><span class="agch-sp-comps">Components<\/span><span>Actions<\/span><\/li>/);
  assert.doesNotMatch(b, /Casting time|Damage \/ Healing|agch-sp-brief/);
  assert.doesNotMatch(b.slice(0, b.indexOf('<div class="agch-card__detail')), /Duration/, 'no Duration heading or cell on the line');
  assert.deepEqual(SPELL_COLUMNS.map(c => c.label), ['Dice', 'Range', 'Casting', 'Components']);
  const row = lineOf(rowOf(b, 'a'));
  assert.match(row, /<span class="agch-card__fact agch-sp-dice" data-label="Dice" data-tooltip="8d6 Fire">8d6 fire<\/span><span class="agch-card__fact agch-sp-range" data-label="Range" data-tooltip="30 ft">30 ft<\/span><span class="agch-card__fact agch-sp-cast" data-label="Casting" data-tooltip="Action">Action<\/span><span class="agch-card__fact agch-sp-comps" data-label="Components" data-tooltip="V, S, M">V, S, M<\/span>/);
});

test('Dice extraction: damage, healing, several parts, none; base value; same source as Combat (facts.damage)', () => {
  assert.equal(diceText({damage: '8d6 Fire'}), '8d6 fire');
  assert.equal(diceText({damage: '2d8 + 3 Healing'}), '2d8+3 heal');
  assert.equal(diceText({damage: '8d6 Fire, 2d6 Radiant'}), '8d6 fire + 2d6 radiant');
  assert.equal(diceFull({damage: '8d6 Fire, 2d6 Radiant'}), '8d6 Fire + 2d6 Radiant');
  assert.equal(diceText({damage: '1d4 Temporary Hit Points'}), '1d4 temp HP');
  assert.equal(diceText({damage: ''}), ''); assert.equal(diceText({}), ''); assert.equal(diceFull(undefined), '');
});

test('a spell with no dice has an empty Dice cell; several parts keep the full text in the tooltip and the open row', async () => {
  const none = spell('n', '[TEST] Nodice'); none.labels = {...none.labels, damages: []};
  const two = spell('t', '[TEST] Twice'); two.labels = {...two.labels, damages: [{label: '8d6 Fire'}, {label: '2d6 Radiant'}]};
  items.push(none, two);
  const b = await render({});
  items.length -= 2;
  assert.match(lineOf(rowOf(b, 'n')), /agch-sp-dice" data-label="Dice"><\/span>/);
  assert.match(lineOf(rowOf(b, 't')), /agch-sp-dice" data-label="Dice" data-tooltip="8d6 Fire \+ 2d6 Radiant">8d6 fire \+ 2d6 radiant<\/span>/);
  assert.match(detailOf(rowOf(b, 't')), /<dt>Dice<\/dt><dd>8d6 Fire \+ 2d6 Radiant<\/dd>/);
});

test('casting time exceptions: a short word by the name, shown only while Casting is hidden; plain Action has none', async () => {
  assert.equal(castingShort('Action'), ''); assert.equal(castingShort('1 Action'), '');
  assert.equal(castingShort('Bonus Action'), 'Bonus'); assert.equal(castingShort('Reaction'), 'Reaction');
  assert.equal(castingShort('1 Minute'), '1 min'); assert.equal(castingShort('10 Minutes'), '10 min'); assert.equal(castingShort('1 Hour'), '1 hr');
  const bonus = spell('x', '[TEST] Quick'); bonus.labels = {...bonus.labels, activation: 'Bonus Action'};
  items.push(bonus); const b = await render({}); items.length -= 1;
  assert.match(mainOf(rowOf(b, 'x')), /agch-cast-ex" data-tooltip="Casting time: Bonus Action"><span aria-hidden="true">Bonus<\/span><span class="ag-sr-only">Casting time: Bonus Action<\/span>/);
  assert.doesNotMatch(mainOf(rowOf(b, 'a')), /agch-cast-ex/);
  assert.match(CSS, /\.agch-spells \.agch-cast-ex \{ display: none; \}/);
  assert.match(CSS, /max-width: 590px\) \{[\s\S]*?agch-sp-cast \{ display: none; \}\n  \.agch-app \.agch-spells \.agch-cast-ex \{ display: inline-flex; \}/);
});

test('priority list: always shown, then optional columns from last to first to go; steps mirror it in the CSS', () => {
  assert.deepEqual(SPELL_PRIORITY.always, ['star', 'icon', 'chevron', 'name', 'badges', 'prepare', 'cast']);
  assert.deepEqual(SPELL_PRIORITY.optional, ['dice', 'range', 'casting', 'components']);
  assert.deepEqual(SPELL_STEPS.map(x => x.hides), ['components', 'casting', 'range', 'dice-compact', 'dice']);
  assert.deepEqual(SPELL_STEPS.map(x => x.hides.replace('-compact', '')).filter((v, i, a) => a.indexOf(v) === i), [...SPELL_PRIORITY.optional].reverse(), 'columns drop in reverse priority');
  const w = SPELL_STEPS.map(x => x.width); assert.deepEqual(w, [...w].sort((x, y) => y - x));
  assert.deepEqual(w, [680, 590, 505, 455, 415]);
  const css = [...CSS.matchAll(/@container agch-body \(max-width: (\d+)px\) \{\n  \.agch-app \.agch-spells/g)].map(m => +m[1]);
  assert.deepEqual(css, w, 'CSS container steps = SPELL_STEPS, in order');
  assert.equal(SPELL_MIN_LIST, 384); assert.match(CSS, /\.agch-app \.agch-spells \{[^}]*min-width: 24rem;/);
  const at = n => CSS.indexOf(`max-width: ${n}px) {\n  .agch-app .agch-spells`);
  const seg = n => CSS.slice(at(n), CSS.indexOf('\n}\n', at(n)));
  assert.match(seg(680), /agch-sp-comps \{ display: none; \}/); assert.match(seg(590), /agch-sp-cast \{ display: none; \}/);
  assert.match(seg(505), /agch-sp-range \{ display: none; \}/); assert.doesNotMatch(seg(455), /display: none/); assert.match(seg(415), /agch-sp-dice \{ display: none; \}/);
});

test('actions are pinned and have a fixed track plus a gutter, so data columns never move with the button text', () => {
  assert.match(CSS, /--agch-sp-track: calc\(var\(--agch-sp-actions\) \+ var\(--ag-space-2\)\);/);
  assert.match(CSS, /\.agch-card__actions \{[^}]*box-sizing: border-box; width: var\(--agch-sp-track\); padding-inline-start: var\(--ag-space-2\); position: sticky; inset-inline-end: 0;/);
  const tracks = [...CSS.slice(CSS.indexOf('/* 0.55.0 Magic'), CSS.indexOf('/* 0.53.0: Combat')).matchAll(/grid-template-columns: max\([^;]*?(var\(--agch-sp-\w+\)); \}/g)].map(m => m[1]);
  assert.equal(tracks.length, 6); assert.ok(tracks.every(t => t === 'var(--agch-sp-track)'), 'every step ends in the fixed actions track');
  assert.match(CSS, /\.agch-spells\.agch-cards > li \{[^}]*padding-inline: var\(--ag-space-2\);/, 'inner padding at the right edge');
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
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-cast \{[^}]*width: var\(--agch-sp-cast\);[^}]*white-space: nowrap;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__actions \{[^}]*flex-wrap: nowrap;[^}]*width: var\(--agch-sp-track\);/);
});

test('the open row holds Level, School, Casting, Range, Dice, Duration, Components, then the description, at every width', async () => {
  const b = await render({});
  const d = detailOf(rowOf(b, 'a'));
  assert.match(d, /<dl class="agch-spell__facts"><div><dt>Level<\/dt><dd>1st Level<\/dd><\/div><div><dt>School<\/dt><dd>Enchantment<\/dd><\/div><div><dt>Casting<\/dt><dd>Action<\/dd><\/div><div><dt>Range<\/dt><dd>30 ft<\/dd><\/div><div><dt>Dice<\/dt><dd>8d6 Fire<\/dd><\/div><div><dt>Duration<\/dt><dd>Concentration, up to 1 minute<\/dd><\/div><div><dt>Components<\/dt><dd>V, S, M<\/dd><\/div><\/dl><p class="agch-spell__text">/);
  assert.match(d, /\[TEST\] Plain text\./);
  assert.match(CSS, /\.agch-app \.agch-spell__facts \{ display: flex;/);
  assert.doesNotMatch(CSS, /\.agch-spell__facts \{ display: none/);
});

test('CSS: one grid template; rows are subgrids; no wrapping or sideways scroll inside the row', () => {
  assert.match(CSS, /\.agch-app \.agch-body \{[^}]*container: agch-body \/ inline-size;/);
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards \{ display: grid; grid-template-columns: max\(var\(--ag-icon-chip\), var\(--ag-control-h-sm\)\) var\(--agch-icon-size\) minmax\(5rem, 1fr\) 5\.5rem 4rem 5\.25rem 5rem var\(--agch-sp-track\); \}/);
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards > li \{ display: grid; grid-template-columns: subgrid;/);
  assert.match(CSS, /\.agch-app \.agch-spells \.agch-card__fact::before \{ content: none; \}/, 'no inline labels in the one-line rows');
  assert.match(CSS, /\.agch-app \.agch-spells\.agch-cards > \.agch-card__headrow \{ display: grid; \}/);
  const block = CSS.slice(CSS.indexOf('/* 0.55.0 Magic'), CSS.indexOf('/* 0.53.0: Combat'));
  assert.doesNotMatch(block, /flex-wrap: wrap|overflow-x/);
});

test('the item rows (0.56.0) share no Magic classes', () => {
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
  assert.match(README, /Components at 680px or less, Casting at 590px, Range at 505px[\s\S]*455px[\s\S]*415px/);
  assert.match(README, /Dice/);
  assert.match(HELP_HTML, /<strong>C<\/strong> marks concentration and <strong>R<\/strong> marks a ritual[\s\S]*Prepared<\/strong> \(gold\)/);
});
