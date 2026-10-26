/**
 * 0.51.0 Magic: compact one-line spell rows (description on demand), the Show spell descriptions setting, pinned column
 * headings, and spell preparation limits with the prepared-count indicator. Mocked Foundry: this proves the markup and the
 * logic, not the live Forge UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS, EDITS} from '../scripts/sheet.mjs';
import * as prep from '../scripts/spell-prep.mjs';
import * as rows from '../scripts/spell-rows.mjs';
import * as ia from '../scripts/item-actions.mjs';
import {gmSetupTab} from '../scripts/companion-views.mjs';
import {HELP_HTML} from '../scripts/help.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const act = [{activation: {type: 'action'}}];

const cls = (id, name, max, extra = {}) => ({id, name, type: 'class', system: {identifier: id, spellcasting: {progression: 'full', preparation: {max}}}, ...extra});
const spell = (id, name, o = {}) => ({id, name, type: 'spell', system: {level: 1, method: 'spell', prepared: 0, canPrepare: true, classIdentifier: 'wizard', activities: act, description: {value: `<p>${name} long text.</p>`}, properties: new Set(), ...o},
  labels: {level: '1st Level', school: 'Evocation', activation: '1 Action', range: '30 ft', duration: '1 hour', components: {vsm: 'V, S'}}});
/** A [TEST] wizard: limit 2. Bless-like spells W1..W4 (W1, W2 prepared), a cantrip, an always-prepared spell, a ritual-only one. */
function wizard({max = 2, extra = [], classes = null} = {}) {
  const items = [cls('wizard', 'Wizard', max), ...(classes ?? []),
    spell('c1', '[TEST] Cantrip', {level: 0, prepared: 1, canPrepare: true}),
    spell('w1', '[TEST] Alpha', {prepared: 1}), spell('w2', '[TEST] Beta', {prepared: 1}), spell('w3', '[TEST] Gamma'), spell('w4', '[TEST] Delta'),
    spell('al', '[TEST] Always', {prepared: 2}), spell('rt', '[TEST] Ritual only', {method: 'ritual', canPrepare: false}),
    spell('aw', '[TEST] At will', {method: 'atwill', canPrepare: false}), ...extra];
  const actor = makeActor({items, system: {spells: {spell1: {value: 2, max: 3}}}});
  for (const d of items) if (d.labels) actor.items.get(d.id).labels = d.labels;
  actor.spellcastingClasses = Object.fromEntries(actor.items.filter(i => i.type === 'class').map(c => [c.system.identifier, c]));
  for (const i of actor.items) { const orig = i.update; i.update = async (diff, options) => { i.calls.push(['opts', options]); return orig(diff); }; }
  return actor;
}
const setup = (o = {}) => installGlobals({user: users.owner, settings: {}, ...o});
const render = async (actor, tab = 'magic', pre = s => s) => { const s = new Hub({document: actor}); s.tab = tab; pre(s); return {sheet: s, html: await s._renderHTML()}; };
const body = html => html.slice(html.indexOf('class="agch-body"'));
const el = (attrs = {}, extra = {}) => ({dataset: attrs, ...extra});

// ---------- compact rows ----------

test('setting: Show spell descriptions is per user, default off; registered client scope', () => {
  const reg = [];
  rows.registerSpellViewSetting({register: (m, k, d) => reg.push([k, d])});
  assert.equal(reg[0][0], 'showSpellDescriptions'); assert.equal(reg[0][1].scope, 'client'); assert.equal(reg[0][1].default, false); assert.equal(reg[0][1].type, Boolean);
  setup(); assert.equal(rows.showDescriptions(), false);
  setup({settings: {showSpellDescriptions: true}}); assert.equal(rows.showDescriptions(), true);
});

test('default: one-line rows, no description under the name; the long setting brings back the 0.50 rows', async () => {
  setup();
  const b = body((await render(wizard())).html);
  assert.match(b, /class="ag-list agch-cards agch-spelllist agch-spells"/);
  assert.doesNotMatch(b, /agch-card__summary/, 'no description in the row');
  assert.doesNotMatch(b, /data-action="item-more"/);
  assert.match(b, /agch-spell__chev[^>]*aria-expanded="false"[^>]*aria-controls="more:magic-1:w1"[^>]*aria-label="Show description of \[TEST\] Alpha"/);
  assert.match(b, /data-action="spell-expand" data-id="w1" data-key="more:magic-1:w1"[^>]*tabindex="-1"/, 'the name toggles too (pointer); the chevron is the tab stop');
  assert.match(b, /id="more:magic-1:w1" role="region" aria-label="Description of \[TEST\] Alpha" hidden>/);
  assert.match(b, /\[TEST\] Alpha long text\./, 'the full text is in the detail row');
  assert.match(b, /data-action="item-sheet" data-id="w1" data-ag-always><span>Open \[TEST\] Alpha<\/span>/, 'the item sheet is one click from the detail row');
  assert.match(b, /data-action="item-use" data-id="w3"/, 'Cast kept');
  assert.match(b, /data-action="spell-prepare" data-id="w3"/);
  assert.match(b, /<span class="ag-badge" data-tooltip="Always prepared">Always<\/span>/);
  setup({settings: {showSpellDescriptions: true}});
  const long = body((await render(wizard())).html);
  assert.doesNotMatch(long, /agch-spell__chev|agch-spells"/);
  assert.match(long, /agch-card__summary/, 'long rows show the description');
  assert.match(long, /agch-spelllist/, 'long lists keep pinned headings');
});

test('duration shows C and R badges with text, a hover tooltip and a spoken name', async () => {
  setup();
  const a = wizard({extra: [spell('cr', '[TEST] Focus', {properties: new Set(['concentration', 'ritual'])})]});
  const b = body((await render(a)).html);
  assert.match(b, /data-tooltip="Concentration"><span aria-hidden="true">C<\/span><span class="ag-sr-only">Concentration<\/span>/);
  assert.match(b, /data-tooltip="Ritual"><span aria-hidden="true">R<\/span><span class="ag-sr-only">Ritual<\/span>/);
});

test('expand and collapse: no redraw, focus stays, state kept across a re-render', async () => {
  setup();
  const a = wizard(), {sheet} = await render(a);
  const attrs = {};
  const mk = (cls2) => ({classList: {contains: c => c === cls2}, getAttribute: k => attrs[cls2 + k] ?? 'Show description of x', setAttribute: (k, v) => { attrs[cls2 + k] = v; }});
  const li = {classList: {toggle: (c, v) => { attrs.liOpen = v; }}, querySelector: () => detail, querySelectorAll: () => [mk('agch-spell__chev'), mk('agch-spell__name')]};
  const detail = {hidden: true};
  const target = el({key: 'more:magic-1:w1'}, {closest: () => li});
  let r = await ACTIONS['spell-expand'](sheet, target);
  assert.deepEqual([r.ok, r.result, detail.hidden, attrs.liOpen, attrs['agch-spell__chevaria-expanded'], attrs['agch-spell__chevaria-label']], [true, true, false, true, 'true', 'Hide description of x']);
  assert.ok(sheet.expanded.has('more:magic-1:w1'));
  assert.equal(sheet.renders.length, 0, 'no re-render, so the focus stays on the control');
  const b = body(await sheet._renderHTML());
  assert.match(b, /agch-spell is-open"[^>]*data-item-id="w1"/);
  assert.match(b, /aria-expanded="true" aria-controls="more:magic-1:w1" aria-label="Hide description of \[TEST\] Alpha"/);
  assert.match(b, /id="more:magic-1:w1" role="region" aria-label="Description of \[TEST\] Alpha">/, 'open: not hidden');
  r = await ACTIONS['spell-expand'](sheet, target);
  assert.deepEqual([r.result, detail.hidden], [false, true]); assert.ok(!sheet.expanded.has('more:magic-1:w1'));
});

test('level groups are collapsible with remembered state and keep their slot counts', async () => {
  setup();
  const a = wizard(), {html} = await render(a);
  assert.match(html, /data-action="section-toggle" data-key="magic:1"[^>]*aria-expanded="true"[\s\S]*Level 1 <span class="ag-badge" data-tooltip="Slots left">2 \/ 3 slots<\/span>/);
  const {toggleSection} = await import('../scripts/collapse.mjs');
  await toggleSection(null, 'magic:1');
  assert.deepEqual(game.settings.store.collapsedSections, {'magic:1': true}, 'saved per user');
  const again = body((await render(a)).html);
  assert.match(again, /data-key="magic:1"[^>]*aria-expanded="false"/);
  assert.match(again, /data-sec-body="magic:1" hidden/);
});

test('the Filters popover carries the Show spell descriptions switch (applies now); the edit saves and redraws', async () => {
  setup();
  const {sheet} = await render(wizard(), 'magic', s => { s.menu = 'filters:magic'; });
  const b = body(await sheet._renderHTML());
  assert.match(b, /agch-filtermenu[\s\S]*data-edit="spell-descriptions" data-ag-always> <span>Show spell descriptions<\/span> <span class="ag-badge">Applies now<\/span>/);
  assert.equal(prep_n(b, 'data-edit="spell-descriptions" data-ag-always checked'), 0);
  await EDITS['spell-descriptions'](sheet, {checked: true});
  assert.equal(game.settings.store.showSpellDescriptions, true);
  assert.equal(sheet.renders.length, 1);
  assert.match(body(await sheet._renderHTML()), /data-edit="spell-descriptions" data-ag-always checked/);
  assert.doesNotMatch(body(await sheet._renderHTML()), /Filters \(1\)/, 'a view choice is not a filter');
});
const prep_n = (s, t) => s.split(t).length - 1;

test('sticky headings and narrow layout (CSS text)', () => {
  assert.match(CSS, /\.agch-app \.agch-spelllist > \.agch-card__headrow \{ position: sticky; top: var\(--agch-band-h, 0\); z-index: 4; \}/);
  assert.match(CSS, /\.agch-app \.agch-sticky \{ position: sticky; top: 0; z-index: 5;/, 'the toolbar band stays above the headings');
  const narrow = CSS.slice(CSS.indexOf('/* 0.51.0 Magic'), CSS.indexOf('/* Compact mode (0.29.0)'));
  assert.match(narrow, /@container \(max-width: 640px\) \{[\s\S]*\.agch-spell \.agch-card__fact--late \{ display: none; \}[\s\S]*\.agch-spell__facts \{ display: flex; \}/, 'duration and components move into the expanded row');
  assert.match(narrow, /prefers-reduced-motion/);
  assert.doesNotMatch(narrow.replaceAll('(max-width: 640px)', '').replace(/1px solid/g, ''), /\d+px/, 'tokens only (the 640px breakpoint and 1px borders are the Hub\'s existing ones)');
  assert.doesNotMatch(narrow, /overflow-x|white-space: nowrap/, 'nothing scrolls sideways or clips');
});

test('syncBandHeight pins the headings under the band, and follows its height', () => {
  const props = {}; let observed = null, cb = null;
  globalThis.ResizeObserver = class { constructor(f) { cb = f; } observe(e) { observed = e; } disconnect() {} };
  const band = {getBoundingClientRect: () => ({height: 40.2})};
  const body2 = {style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }}, querySelector: () => band};
  rows.syncBandHeight({querySelector: sel => (sel === '.agch-body' ? body2 : null)});
  assert.equal(props['--agch-band-h'], '41px'); assert.equal(observed, band);
  band.getBoundingClientRect = () => ({height: 80}); cb();
  assert.equal(props['--agch-band-h'], '80px');
  delete globalThis.ResizeObserver;
});

// ---------- preparation limits: counting ----------

test('counts per class: always-prepared, cantrips, at-will, ritual-only are excluded; spellbook spells are not limited', () => {
  setup();
  const s = prep.preparationSummary(wizard({max: 6, extra: [spell('bk1', '[TEST] Book A'), spell('bk2', '[TEST] Book B')]}));
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].id, s[0].name, s[0].max, s[0].value, s[0].full, s[0].known], ['wizard', 'Wizard', 6, 2, false, true]);
  assert.deepEqual(s[0].prepared.map(p => p.name), ['[TEST] Alpha', '[TEST] Beta'], 'only the prepared ones count: the book (5+ spells) does not');
});

test('multiclass: each class counts its own spells; a subclass spell counts for its class', () => {
  setup();
  const a = wizard({max: 2, classes: [cls('cleric', 'Cleric', 4)], extra: [spell('c2', '[TEST] Heal', {prepared: 1, classIdentifier: 'cleric'}), spell('c3', '[TEST] Ward', {prepared: 1, classIdentifier: 'cleric'}), spell('nl', '[TEST] Loose', {prepared: 1, classIdentifier: ''})]});
  const s = Object.fromEntries(prep.preparationSummary(a).map(c => [c.id, c]));
  assert.deepEqual([s.wizard.value, s.wizard.max, s.cleric.value, s.cleric.max], [2, 2, 2, 4]);
  assert.equal(s.wizard.full, true);
  const viaSource = prep.classIdOf({system: {sourceItem: 'class:cleric'}});
  assert.equal(viaSource, 'cleric');
});

test('pact spells count like dnd5e counts them (the method prepares); a missing maximum is unknown, 0 too', () => {
  setup();
  const a = wizard({max: 0, extra: [spell('p1', '[TEST] Pact', {method: 'pact', prepared: 1})]});
  const [c] = prep.preparationSummary(a);
  assert.deepEqual([c.known, c.max, c.value], [false, null, 3], 'pact counted; max 0 = unknown');
  assert.equal(prep.classLimit({system: {spellcasting: {preparation: {}}}}), null);
  assert.equal(prep.classLimit({spellcasting: {preparation: {max: 5}}, system: {}}), 5, 'the effective (subclass-aware) spellcasting wins');
});

// ---------- the indicator ----------

test('indicator: per class when multiclassed, one total otherwise; aria-label and tooltip; full state has text and an icon', async () => {
  setup();
  let b = body((await render(wizard({max: 6}))).html);
  assert.match(b, /<span class="ag-badge agch-prepcount" role="img" aria-label="2 of 6 spells prepared as Wizard" data-tooltip="2 of 6 spells prepared as Wizard">Prepared 2\/6<\/span>/);
  b = body((await render(wizard({max: 2}))).html);
  assert.match(b, /agch-prepcount is-full" role="img" aria-label="2 of 2 spells prepared as Wizard \(full\)"[^>]*><i class="fa-solid fa-circle-check" aria-hidden="true"><\/i> Prepared 2\/2 full<\/span>/);
  b = body((await render(wizard({max: 6, classes: [cls('cleric', 'Cleric', 4)]}))).html);
  assert.match(b, /aria-label="2 of 6 spells prepared as Wizard"[^>]*>Wizard 2\/6<\/span>/);
  setup(); b = body((await render(wizard({max: 0}))).html);
  assert.match(b, /aria-label="2 spells prepared as a Wizard \(limit unknown\)"[^>]*>Prepared 2<\/span>/);
});

test('indicator sits inside the existing level strip: no new padding, margin or container', async () => {
  setup();
  const b = body((await render(wizard({max: 6}))).html);
  const strip = b.slice(b.indexOf('class="agch-slotstrip"'), b.indexOf('</div>', b.indexOf('class="agch-slotstrip"')));
  assert.match(strip, /agch-prepcount/, 'inline in the strip row, inside its flex gap');
  assert.match(CSS, /\.agch-app \.agch-slotstrip, \.agch-app \.agch-filters \{ display: flex; flex-wrap: wrap; align-items: center; gap: var\(--ag-space-1\); margin: 0 0 var\(--ag-space-2\); \}/, 'the strip rule is untouched');
  const rule = CSS.match(/\.agch-app \.agch-prepcount \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /padding|(?<!inline-start: auto; )margin(?!-inline-start)/, 'no padding; only the item itself nudges to the end');
  assert.doesNotMatch(CSS.match(/\.agch-app \.agch-slotstrip[^{]*\{[^}]*\}/g).join(''), /prepcount/);
});

// ---------- enforcement ----------

test('setting: Enforce spell preparation limits is a world setting, default on; only the GM changes it', async () => {
  const reg = [];
  prep.registerPrepSettings({register: (m, k, d) => reg.push([k, d])});
  assert.deepEqual([reg[0][0], reg[0][1].scope, reg[0][1].default], ['enforcePrepLimits', 'world', true]);
  setup(); assert.equal(prep.enforcementOn(), true, 'unset = on');
  const r = await prep.setEnforcement(false);
  assert.equal(r.ok, false); assert.match(r.error, /Only the GM/); assert.equal(prep.enforcementOn(), true);
  setup({user: users.gm});
  assert.equal((await prep.setEnforcement(false)).ok, true); assert.equal(prep.enforcementOn(), false);
  assert.match(gmSetupTab(), /data-edit="prep-enforce"> <span>Enforce spell preparation limits<\/span> <span class="ag-badge">Applies now<\/span>/);
  assert.match(gmSetupTab(), /agch-switchrow/);
  const {sheet} = await render(wizard());
  await EDITS['prep-enforce'](sheet, {checked: true});
  assert.equal(prep.enforcementOn(), true);
});

test('the Hub toggle API refuses an over-limit prepare with a clear error and the class info; nothing is written', async () => {
  setup();
  const a = wizard({max: 2}), w3 = a.items.get('w3');
  const r = await ia.togglePrepared(a, 'w3');
  assert.equal(r.ok, false); assert.equal(r.code, 'prep-limit');
  assert.equal(r.error, 'You can prepare 2 spells as a Wizard. Unprepare one first.');
  assert.deepEqual(r.limit.prepared.map(p => p.id), ['w1', 'w2']);
  assert.deepEqual(w3.calls, [], 'not written'); assert.equal(w3.system.prepared, 0);
  assert.equal((await ia.togglePrepared(a, 'w1')).ok, true, 'unpreparing always works');
  assert.equal((await ia.togglePrepared(a, 'w3')).ok, true, 'one slot free now');
  assert.equal(a.items.get('w3').system.prepared, 1);
  assert.equal(prep.limitMessage({name: 'Artificer', max: 1}), 'You can prepare 1 spell as an Artificer. Unprepare one first.');
});

test('never blocked: always-prepared, cantrip, at-will, ritual-only, no source class, items without a class', async () => {
  setup();
  const a = wizard({max: 2, extra: [spell('nc', '[TEST] Nobody', {classIdentifier: ''})]});
  for (const id of ['c1', 'aw', 'rt', 'al']) assert.equal(prep.prepareCheck(a, a.items.get(id)).applies, false, id);
  assert.equal(prep.prepareCheck(a, a.items.get('nc')).applies, false, 'no class: not counted by dnd5e, not blocked');
  const r = await ia.togglePrepared(a, 'nc');
  assert.equal(r.ok, true);
  assert.match((await ia.togglePrepared(a, 'al')).error, /always prepared/);
});

test('unknown limit: allowed, with a quiet note and no notice', async () => {
  const notes = setup();
  const a = wizard({max: 0}), r = await ia.togglePrepared(a, 'w3');
  assert.equal(r.ok, true); assert.equal(r.note, 'limit unknown');
  assert.deepEqual(notes, [], 'nothing shown');
  assert.equal(prep.prepareCheck(a, a.items.get('w4')).unknown, true);
});

test('dialog flow: labelled choices, Cancel changes nothing, a choice swaps and prepares', async () => {
  setup();
  const a = wizard({max: 2});
  let seen;
  const cancelled = await ia.togglePreparedAsk(a, 'w3', {ask: async p => { seen = p; return null; }});
  assert.equal(cancelled.ok, false); assert.equal(cancelled.cancelled, true); assert.equal(cancelled.error, null);
  assert.equal(seen.title, 'Preparation limit reached');
  assert.match(seen.content, /You can prepare 2 spells as a Wizard\. Unprepare one first\./);
  assert.match(seen.content, /<li>\[TEST\] Alpha<\/li><li>\[TEST\] Beta<\/li>/);
  assert.deepEqual(seen.choices.map(c => c.label), ['Unprepare [TEST] Alpha and prepare [TEST] Gamma', 'Unprepare [TEST] Beta and prepare [TEST] Gamma']);
  assert.ok(!seen.content.includes('Always') && !seen.content.includes('Cantrip'), 'only counted spells are listed');
  assert.deepEqual([a.items.get('w1').system.prepared, a.items.get('w3').system.prepared], [1, 0]);
  const swapped = await ia.togglePreparedAsk(a, 'w3', {ask: async () => 'unprepare:w2'});
  assert.equal(swapped.ok, true);
  assert.deepEqual(['w1', 'w2', 'w3'].map(i => a.items.get(i).system.prepared), [1, 0, 1]);
  assert.equal((await ia.togglePreparedAsk(a, 'w4', {ask: async () => 'unprepare:nope'})).ok, false, 'a choice that was not offered is refused');
  assert.equal(a.items.get('w4').system.prepared, 0);
  assert.equal((await ia.togglePreparedAsk(a, 'w1', {ask: async () => assert.fail('no dialog when unpreparing')})).ok, true);
  assert.equal(ACTIONS['spell-prepare'].length, 2);
});

test('the dialog default is Cancel (DialogV2 buttons)', async () => {
  setup();
  let cfg;
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async c => { cfg = c; return 'cancel'; }}}}};
  const r = await ia.askPrepareLimit({title: 'T', content: '<p>x</p>', choices: [{action: 'unprepare:w1', label: 'Unprepare A and prepare B'}]});
  assert.equal(r, null);
  assert.deepEqual(cfg.buttons.map(b => [b.action, b.default]), [['cancel', true], ['unprepare:w1', false]]);
  assert.ok(cfg.classes.includes('ag-dialog'));
  delete globalThis.foundry;
});

test('GM bypass: never blocked on any actor, told "over the limit"; enforcement off is quiet for everyone', async () => {
  let notes = setup({user: users.gm});
  const a = wizard({max: 2}), r = await ia.togglePrepared(a, 'w3');
  assert.equal(r.ok, true); assert.equal(a.items.get('w3').system.prepared, 1);
  assert.deepEqual(notes, [['warn', 'Over the limit: 3 of 2 spells prepared as a Wizard.']]);
  notes = setup({user: users.gm, settings: {enforcePrepLimits: false}});
  assert.equal((await ia.togglePrepared(wizard({max: 2}), 'w3')).ok, true); assert.deepEqual(notes, []);
  notes = setup({settings: {enforcePrepLimits: false}});
  assert.equal((await ia.togglePrepared(wizard({max: 2}), 'w3')).ok, true, 'a player is not blocked while the GM has enforcement off'); assert.deepEqual(notes, []);
});

test('the Hub marks its own updates as checked so the sheet guard leaves them alone (no double notice)', async () => {
  setup({user: users.gm});
  const a = wizard({max: 2});
  await ia.togglePrepared(a, 'w3');
  assert.deepEqual(a.items.get('w3').calls.find(c => c[0] === 'opts')[1], {agchPrepChecked: true});
});

test('sheet guard (preUpdateItem): stops a player over the limit with the same message; GM told; never throws', () => {
  const notes = setup();
  const a = wizard({max: 2}), w3 = a.items.get('w3'); w3.actor = a;
  assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 1}}, {}, 'owner'), false);
  assert.deepEqual(notes.pop(), ['warn', 'You can prepare 2 spells as a Wizard. Unprepare one first.']);
  assert.equal(prep.guardPrepareUpdate(w3, {'system.prepared': 1}, {}, 'owner'), false, 'flattened key too');
  assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 1}}, {agchPrepChecked: true}, 'owner'), true, 'the Hub\'s own checked update');
  assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 1}}, {}, 'someone-else'), true, 'only the user who made the change checks it');
  assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 0}}, {}, 'owner'), true, 'unpreparing');
  assert.equal(prep.guardPrepareUpdate(w3, {name: 'x'}, {}, 'owner'), true, 'unrelated update');
  assert.equal(prep.guardPrepareUpdate({type: 'spell', get actor() { throw new Error('boom'); }}, {system: {prepared: 1}}, {}, 'owner'), true, 'an error lets the update through');
  const gm = setup({user: users.gm}); w3.actor = a;
  assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 1}}, {}, 'gm'), true);
  assert.deepEqual(gm, [['warn', 'Over the limit: 3 of 2 spells prepared as a Wizard.']]);
  setup({settings: {enforcePrepLimits: false}}); assert.equal(prep.guardPrepareUpdate(w3, {system: {prepared: 1}}, {}, 'owner'), true);
  setup(); const un = wizard({max: 0}); assert.equal(prep.guardPrepareUpdate(Object.assign(un.items.get('w3'), {actor: un}), {system: {prepared: 1}}, {}, 'owner'), true, 'unknown limit');
});

test('observers cannot prepare at all (ownership first); Help and README describe the new behaviour', async () => {
  setup({user: users.observer});
  const r = await ia.togglePrepared(wizard(), 'w3');
  assert.equal(r.ok, false); assert.match(r.error, /don't own/);
  for (const t of [HELP_HTML, README]) { assert.match(t, /Show spell descriptions/); assert.match(t, /preparation limit|prepare/i); }
  assert.match(HELP_HTML, /Enforce spell preparation limits/);
  assert.match(README, /Enforce spell preparation limits/);
});
