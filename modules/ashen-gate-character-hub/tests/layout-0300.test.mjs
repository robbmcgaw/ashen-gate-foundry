/**
 * 0.30.0 layout and list behaviour: weapon mastery on cards, Professions under Proficiencies, Strain beside HP, bigger
 * Initiative / Proficiency, the Mastery & marks strip, version far right and About, frozen bands and the weight bar.
 * Mocked Foundry and dnd5e: proves the markup and data reads, not the live layout (sticky scrolling, wrapping).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {weaponMastery, encumbranceData} from '../scripts/items.mjs';
import {masteryBadge, weightBar} from '../scripts/tabs.mjs';
import {knownProfessions} from '../scripts/partners.mjs';
import {professionsBox} from '../scripts/views.mjs';
import {characterPanelHtml} from '../scripts/character.mjs';
import {hotbarsHtml} from '../scripts/hotbar-views.mjs';
import {aboutHtml} from '../scripts/help.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const MASTERIES = {vex: {label: 'Vex', reference: 'Compendium.dnd5e.content24.JournalEntry.x.JournalEntryPage.vex'}, cleave: {label: 'Cleave', reference: 'Compendium.dnd5e.content24.JournalEntry.x.JournalEntryPage.cleave'}};
const setup = (opts = {}) => { const notes = installGlobals(opts); CONFIG.DND5E.weaponMasteries = MASTERIES; CONFIG.DND5E.weightUnits = {lb: {abbreviation: 'lb'}}; return notes; };
const WEAPONS = [
  {id: 'ss', name: '[TEST] Shortsword', type: 'weapon', system: {equipped: true, mastery: 'vex', masteryOptions: [{value: 'vex'}]}},
  {id: 'ax', name: '[TEST] Greataxe', type: 'weapon', system: {equipped: false, mastery: 'cleave', masteryOptions: []}},
  {id: 'cl', name: '[TEST] Club', type: 'weapon', system: {equipped: false}}
];
const render = async (tab, actor = makeActor({items: WEAPONS}), setupSheet = s => s) => { const s = new Hub({document: actor}); s.tab = tab; setupSheet(s); return s._renderHTML(); };
const LEDGER = rows => ({active: true, version: '0.24.3', title: 'Ashen Gate | Profession Ledger', api: {getProfessions: () => { if (rows instanceof Error) throw rows; return rows; }}});

test('weapon mastery from dnd5e data: name on the card, rules page as the tooltip, dimmed when not mastered', async () => {
  setup();
  const actor = makeActor({items: WEAPONS});
  assert.deepEqual(weaponMastery(actor.items.get('ss')), {key: 'vex', label: 'Vex', reference: MASTERIES.vex.reference, mastered: true});
  assert.equal(weaponMastery(actor.items.get('ax')).mastered, false);
  assert.equal(weaponMastery(actor.items.get('cl')), null, 'no mastery, no badge');
  const html = await render('combat', actor);
  assert.match(html, /agch-mastery ag-badge--accent"[^>]*data-tooltip="Vex weapon mastery"[^>]*>.*Vex<\/span>/, 'plain tooltip without dnd5e\'s rich tooltips');
  assert.match(html, /agch-mastery is-off"[^>]*Cleave weapon mastery \(not mastered by this character\)/);
  game.dnd5e = {tooltips: {}};
  assert.match(masteryBadge({mastery: weaponMastery(actor.items.get('ss'))}), /data-tooltip-html="[^"]*data-uuid=&quot;Compendium\.dnd5e\.content24\.JournalEntry\.x\.JournalEntryPage\.vex&quot;[^"]*" data-tooltip-class="dnd5e2 dnd5e-tooltip rule-tooltip"/, 'dnd5e\'s own rules page');
  assert.match(await render('inventory', actor), /agch-mastery[^>]*>.*Vex<\/span>/, 'Inventory weapons show it too');
});

test('Professions under Proficiencies: name and level from the Ledger; jumps to Ashen Gate → Professions; hidden when it should be', async () => {
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': LEDGER([{professionId: 'PROF-TEST-A', name: '[TEST] Herbalism', level: 2}, {professionId: 'PROF-TEST-B', name: '[TEST] Smithing', level: 1}])}});
  const box = professionsBox(makeActor());
  assert.match(box, /data-action="ag-jump" data-partner="ashen-gate-profession-ledger"/);
  assert.match(box, /<i class="fa-solid fa-leaf agch-profbox__icon" aria-hidden="true"><\/i><span class="agch-profbox__name">\[TEST\] Herbalism - Level 2<\/span>/, '0.34.0: icon; no tier from this Ledger, so none shown');
  const overview = await render('overview');
  assert.ok(overview.indexOf('Proficiencies') < overview.indexOf('agch-profbox'), 'under Proficiencies');
  const sheet = new Hub({document: makeActor()}); await sheet.dispatch('ag-jump', {dataset: {partner: 'ashen-gate-profession-ledger'}});
  assert.deepEqual([sheet.tab, sheet.agTab], ['ashen-gate', 'ashen-gate-profession-ledger']);
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': LEDGER([])}});
  assert.match(professionsBox(makeActor()), /No professions yet/);
  setup({user: users.owner, modules: {}});
  assert.equal(professionsBox(makeActor()), '', 'no Ledger, no box');
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': {active: true, api: {}}}});
  assert.equal(knownProfessions(makeActor()), null, 'an older Ledger without getProfessions: no box');
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': LEDGER([{name: '[TEST] Herbalism', level: 2}])}, settings: {playerVisibility: {professions: false}}});
  assert.equal(professionsBox(makeActor()), '', 'the GM hid Professions from players');
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': {...LEDGER([{name: '[TEST] Herbalism', level: 2}]), api: {getProfessions: () => [], playerAccess: {getState: () => ({playerAccessEnabled: false})}}}}});
  assert.equal(professionsBox(makeActor()), '', 'Ledger Player Access off');
  setup({user: users.owner, modules: {'ashen-gate-profession-ledger': LEDGER(new Error('Actor access denied'))}});
  assert.equal(professionsBox(makeActor()), '', 'a refusal hides the box, never breaks the sheet');
  setup({user: users.gm, modules: {'ashen-gate-profession-ledger': LEDGER([{name: '[TEST] Herbalism', level: 2}])}, settings: {playerVisibility: {professions: false}}});
  assert.match(professionsBox(makeActor()), /Hidden from players/, 'the GM still sees it, badged');
});

test('Strain pill beside hit dice and exhaustion: read only; follows the Strain switch and Cinders', () => {
  const cinders = (value = 3) => ({'ashen-gate-cinders': {active: true, api: {strain: {contract: 'ag-strain/1', get: () => ({value, guaranteeAt: 10, band: {label: '[TEST] Band'}, chance: 5})}}}});
  setup({user: users.owner, modules: cinders()});
  const html = characterPanelHtml({actor: makeActor(), editable: true});
  const pill = html.slice(html.indexOf('agch-pill--strain'), html.indexOf('</div>', html.indexOf('agch-pill--strain')));
  assert.match(pill, /<b>3 \/ 10<\/b><span class="agch-pill__band">\[TEST\] Band/);
  assert.match(pill, /--ag-meter:30%/);
  assert.doesNotMatch(html, /strain-step/, 'no − / + for players');
  assert.ok(html.indexOf('agch-pill--exh') < html.indexOf('agch-pill--strain'), 'after exhaustion, in the HP row');
  setup({user: users.owner, modules: cinders(), settings: {playerVisibility: {strain: false}}});
  assert.doesNotMatch(characterPanelHtml({actor: makeActor(), editable: true}), /agch-pill--strain/, 'hidden from players');
  setup({user: users.owner, modules: {}});
  assert.doesNotMatch(characterPanelHtml({actor: makeActor(), editable: true}), /agch-pill--strain/, 'no Cinders, no pill');
});

test('Initiative and Proficiency tiles take the big number; Speed keeps its own', () => {
  setup();
  const html = characterPanelHtml({actor: makeActor(), editable: true});
  assert.match(html, /<div class="agch-tile agch-tile--big" data-config="initiative"/);
  assert.match(html, /<div class="agch-tile agch-tile--big"><span class="agch-tile__label">Proficiency/);
  assert.match(html, /<div class="agch-tile"[^>]*><span class="agch-tile__label">Speed/);
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-tile--big > \.agch-tile__value, \.agch-app \.agch-tile--big > \.agch-tile__roll \{[^}]*justify-self: stretch; text-align: center;[^}]*font-size: calc\(var\(--ag-text-xl\) \* 1\.35\)/);
});

test('Mastery & marks: one strip, no fold; targets, Strain and the title together at the right, the marks before them', () => {
  setup({user: users.owner, modules: {'ashen-gate-cinders': {active: true, api: {strain: {contract: 'ag-strain/1', get: () => ({value: 1, guaranteeAt: 10, band: {label: '[TEST] Low'}, chance: 0})}}}}});
  game.user.targets = new Set();
  const html = hotbarsHtml({actor: makeActor({items: WEAPONS}), editable: true});
  const strip = html.slice(html.indexOf('agch-hotbar--marks'), html.indexOf('agch-hotbar--conds'));
  assert.doesNotMatch(strip, /data-action="section-toggle"/, 'not a dropdown any more');
  assert.match(strip, /<div class="agch-marks"><div class="agch-marks__list">[\s\S]*data-mark="vex"[\s\S]*<\/div>\s*<div class="agch-marks__end"><span class="agch-muted agch-hotbar__targets">[\s\S]*No target<\/span>[\s\S]*agch-hotbar__strain[\s\S]*Mastery &amp; marks<\/span><button type="button" class="agch-marks__help" data-tooltip="[^"]+" aria-label="[^"]+"><i class="fa-solid fa-circle-question" aria-hidden="true"><\/i><\/button><\/div><\/div>/, 'CH-25: the help is a focusable button');
  assert.doesNotMatch(html, /hotbar:quick|data-hotbar-slot/, '0.34.0: the quick bar is the drawer under the bottom bar, not in the strips');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-marks__list \{[^}]*flex-wrap: wrap; justify-content: flex-end;/, 'marks wrap and grow to the left');
  assert.match(css, /\.agch-marks__end \{ flex: none;/, 'the right corner never shrinks under the marks');
});

test('header: version and Help together at the far right; Help lists the active partner versions', async () => {
  setup({modules: {'ashen-gate-character-hub': {active: true, version: '0.30.0'}, 'ashen-gate-cinders': {active: true, version: '0.7.0', title: 'Ashen Gate | Cinders'},
    'ashen-gate-quest-manager': {active: false, version: '0.13.1', title: 'Ashen Gate | Quest Log'}}});
  const html = await render('overview');
  const head = html.slice(0, html.indexOf('</header>'));
  assert.match(head, /<span class="ag-header__meta agch-head__meta"><span class="ag-version">v0\.30\.0<\/span>\s*<button[^>]*data-action="help"[\s\S]*<\/span><\/div>$/, 'last in the header');
  const about = aboutHtml();
  assert.match(about, /Character Hub <span class="ag-version">v0\.30\.0/);
  assert.match(about, /<li>Cinders <span class="ag-version">v0\.7\.0<\/span><\/li>/);
  assert.doesNotMatch(about, /Quest Log/, 'inactive modules are left out');
});

test('frozen bands: Combat, Inventory (search, filters, attunement, purse and weight), Magic and Features', async () => {
  setup();
  const act = type => [{activation: {type}}];
  const actor = makeActor({items: [...WEAPONS, {id: 'sp', name: '[TEST] Bless', type: 'spell', system: {level: 1, prepared: 1, canPrepare: true, activities: act('action')}},
    {id: 'ft', name: '[TEST] Second Wind', type: 'feat', system: {type: {value: 'class'}, activities: act('bonus'), uses: {max: 1, spent: 0}}}],
    system: {attributes: {...makeActor().system.attributes, encumbrance: {value: 42.5, max: 150, pct: 28.33}}, spells: {spell1: {value: 1, max: 2}}}});
  const band = html => html.match(/<div class="agch-body"[^>]*><div class="agch-sticky">([\s\S]*?)<\/div>\s*(?=<p class="agch-diamond|<section|<div class="ag-empty"|\n)/)?.[1] ?? '';
  assert.match(band(await render('combat', actor)), /data-filter data-tab="combat"/);
  const inv = await render('inventory', actor), invBand = inv.slice(inv.indexOf('agch-sticky'), inv.indexOf('agch-purse'));
  for (const part of [/data-filter data-tab="inventory"/, /Attuned 0 \/ 3/]) assert.match(invBand, part, String(part));
  // 0.33.0 (CH-07): the purse and weight bar scroll with the list, just under the frozen row.
  const purse = inv.slice(inv.indexOf('agch-purse'), inv.indexOf('agch-diamond'));
  assert.doesNotMatch(invBand, /data-edit="currency"/);
  for (const part of [/data-edit="currency" data-key="gp"/, /agch-weight/, /42\.5 \/ 150 lb/, /--ag-meter:28%/]) assert.match(purse, part, String(part));
  const slice = html => { const at = html.indexOf('agch-sticky'); return html.slice(at, html.indexOf('<section', at)); };
  // 0.33.0 (CH-07): one frozen row (search, Filters (n)); Magic keeps its spell levels; Group, Sort and chips open from Filters.
  const magic = await render('magic', actor), mBand = slice(magic);
  for (const part of [/data-filter data-tab="magic"/, /data-action="filters-menu" data-tab="magic"/, /agch-slotstrip/]) assert.match(mBand, part, String(part));
  assert.doesNotMatch(mBand, /data-key="prepared"/);
  const mOpen = slice(await render('magic', actor, s => { s.menu = 'filters:magic'; }));
  for (const part of [/data-field="group"/, /data-key="prepared"/]) assert.match(mOpen, part, String(part));
  const feat = await render('features', actor, s => { s.menu = 'filters:features'; }), fBand = slice(feat);
  for (const part of [/data-filter data-tab="features"/, /data-field="sort"/, /data-key="uses"/]) assert.match(fBand, part, String(part));
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-sticky \{ position: sticky; top: 0; z-index: 5;[^}]*background: var\(--agch-bg\)/);
});

test('weight bar: dnd5e\'s carried weight against its capacity; nothing without a capacity; over capacity is red', () => {
  setup();
  const a = enc => makeActor({system: {attributes: {...makeActor().system.attributes, encumbrance: enc}}});
  assert.deepEqual(encumbranceData(a({value: 10, max: 150, pct: 6.7})), {value: 10, max: 150, pct: 7, units: 'lb', over: false});
  assert.equal(encumbranceData(a(undefined)), null);
  assert.equal(encumbranceData(a({value: 3, max: 0})), null);
  const over = encumbranceData(a({value: 160, max: 150, pct: 100}));
  assert.equal(over.over, true);
  assert.match(weightBar(over), /ag-meter ag-meter--danger agch-weight[^>]*over capacity/);
  assert.equal(weightBar(null), '');
  globalThis.dnd5e = {utils: {defaultUnits: () => 'kg'}}; CONFIG.DND5E.weightUnits.kg = {abbreviation: 'kg'};
  assert.equal(encumbranceData(a({value: 5, max: 70})).units, 'kg', 'dnd5e\'s metric weight unit');
  delete globalThis.dnd5e;
});
