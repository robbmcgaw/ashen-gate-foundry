/**
 * 0.31.0: Combat groups / sort / filters, per-user Appearance (Manager or built-in), NPC Codex from the header, Cinder chips
 * in the character header, Open skill tree, and the first-bind Journey milestone. Mocked Foundry and stand-in partner APIs:
 * this proves logic and markup, not the live Foundry UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {combatData, combatCategory} from '../scripts/items.mjs';
import {setListChoice, filterRows} from '../scripts/organize.mjs';
import {createHubSheetClass, ACTIONS, EDITS, setListFilter} from '../scripts/sheet.mjs';
import * as look from '../scripts/look.mjs';
import {codexBtn, openCodex} from '../scripts/codex.mjs';
import {boundCinders, cinderChipsHtml, artSpins, orbCoreHtml, skillTreeBtn} from '../scripts/cinders.mjs';
import * as j from '../scripts/journey.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const act = type => [{activation: {type}}];
const mgr = id => ({flags: {'ashen-gate-manager': {source: {sourceId: id}}}});
const ITEMS = () => [
  {id: 'sw', name: '[TEST] Sword', type: 'weapon', system: {equipped: true, activities: act('action')}},
  {id: 'bow', name: '[TEST] Bow', type: 'weapon', system: {equipped: false, activities: act('action')}},
  {id: 'sh', name: '[TEST] Shield', type: 'equipment', system: {equipped: true, type: {value: 'shield'}, activities: act('bonus')}},
  {id: 'kit', name: '[TEST] Herbalism Kit', type: 'tool', system: {activities: act('action')}},
  {id: 'herb', name: '[TEST] Ash Herb', type: 'consumable', ...mgr('MAT-TEST-HERB'), system: {activities: act('action')}},
  {id: 'pot', name: '[TEST] Potion', type: 'consumable', system: {quantity: 2, uses: {max: 1, value: 1}, activities: act('bonus')}},
  {id: 'ft', name: '[TEST] Second Wind', type: 'feat', system: {uses: {max: 1, value: 0}, activities: act('bonus')}},
  {id: 'ring', name: '[TEST] Ring of Sparks', type: 'equipment', system: {equipped: false, type: {value: 'ring'}, activities: act('reaction')}},
  {id: 'sp', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, activities: act('action')}}
];
const hero = () => makeActor({items: ITEMS()});
const Sheet = () => createHubSheetClass(FakeActorSheetV2);
const render = async (tab, actor = hero(), setup = s => s) => { const s = new (Sheet())({document: actor}); s.tab = tab; setup(s); return {sheet: s, html: await s._renderHTML()}; };
const body = html => html.slice(html.indexOf('class="agch-body"'));
const heads = html => [...body(html).matchAll(/class="agch-sec__title">([^<]+)</g)].map(m => m[1].trim());

// ---------- Combat ----------

test('combat categories: Combat, Professions, Consumables, Features, Trinkets (spells stay in Magic)', () => {
  installGlobals();
  const d = combatData(hero());
  assert.deepEqual(Object.fromEntries(d.rows.map(r => [r.id, r.category])),
    {sw: 'combat', bow: 'combat', sh: 'combat', kit: 'professions', herb: 'professions', pot: 'consumables', ft: 'features', ring: 'trinkets'});
  assert.equal(combatCategory({type: 'loot'}), 'trinkets');
  assert.equal(combatCategory({type: 'equipment', system: {type: {value: 'heavy'}}}), 'combat');
  assert.equal(combatCategory({type: 'weapon', ...mgr('REC-TEST-BLADE')}), 'professions', 'a recipe item counts as a profession thing');
  assert.ok(d.weapons.length === 2 && d.groups.length > 0, 'the old weapons / groups shape is kept');
});

test('Combat tab: grouped by category in order, with counts, group / sort selects, filter chips, favourites and a sticky list head', async () => {
  installGlobals();
  const {html} = await render('combat', hero(), s => { s.menu = 'filters:combat'; });
  const b = body(html);
  assert.match(b, /^[^]*?<div class="agch-sticky"><div class="ag-toolbar agch-toolbar">[^]*?data-action="filters-menu"[^]*?agch-filtermenu[^]*?data-key="equipped"[^]*?<\/div><\/div>/, '0.33.0: search and Filters in one frozen row; selects and chips in its popover');
  assert.match(b, /data-filter data-tab="combat"/);
  assert.match(b, /data-edit="list-sort" data-tab="combat" data-field="group"/); assert.match(b, /data-edit="list-sort" data-tab="combat" data-field="sort"/);
  assert.match(b, /data-key="equipped"[^>]*>Hide unequipped</); assert.match(b, /data-key="uses"/); assert.match(b, /data-key="left"/);
  assert.match(b, /data-tab="combat" data-key="action" data-value="bonus"/, 'action-type chips like Features');
  const order = ['Combat', 'Professions', 'Consumables', 'Features', 'Trinkets'];
  const pos = order.map(l => b.indexOf(`${l} <span class="ag-badge">`));
  assert.ok(pos.every(p => p > 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]), `groups in order: ${pos}`);
  assert.match(b, /Combat <span class="ag-badge">3<\/span>/);
  assert.match(b, /data-label="To hit"/, 'the Combat group keeps the weapon columns');
  assert.doesNotMatch(b, /Fire Bolt/);
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-sticky \{ position: sticky;/);
});

test('Combat filters and grouping: Hide unequipped keeps features, Uses left, action chip, Clear; group by action / none; sort equipped first', async () => {
  installGlobals();
  const actor = hero();
  const {sheet} = await render('combat', actor);
  setListFilter(sheet, 'combat', 'equipped');
  let b = body(await sheet._renderHTML());
  assert.doesNotMatch(b, /\[TEST\] Bow/); assert.doesNotMatch(b, /Ring of Sparks/); assert.match(b, /\[TEST\] Sword/); assert.match(b, /Second Wind/, 'items that can\'t be equipped stay');
  assert.match(b, /Clear filters/);
  setListFilter(sheet, 'combat', 'left');
  b = body(await sheet._renderHTML());
  assert.doesNotMatch(b, /Second Wind/, 'no uses left');
  setListFilter(sheet, 'combat', 'clear');
  setListFilter(sheet, 'combat', 'action', 'reaction');
  b = body(await sheet._renderHTML());
  assert.match(b, /Ring of Sparks/); assert.doesNotMatch(b, /\[TEST\] Sword/);
  setListFilter(sheet, 'combat', 'clear');
  assert.deepEqual(sheet.listFilters.combat, {});
  assert.equal((await EDITS['list-sort'](sheet, {dataset: {tab: 'combat', field: 'group'}, value: 'action'})).ok, true);
  assert.deepEqual(heads(await sheet._renderHTML()).slice(0, 3), ['Action', 'Bonus Action', 'Reaction']);
  await setListChoice('combat', 'group', 'none'); await setListChoice('combat', 'sort', 'equipped');
  b = body(await sheet._renderHTML());
  assert.ok(b.indexOf('[TEST] Shield') < b.indexOf('[TEST] Bow') && b.indexOf('[TEST] Sword') < b.indexOf('[TEST] Ash Herb'), 'equipped first, then by name');
  assert.equal((await setListChoice('combat', 'group', 'school')).ok, false, 'an unknown choice is refused');
  assert.deepEqual(filterRows([{equippable: true, equipped: false}, {equippable: false}], {equipped: true}).length, 1);
});

// ---------- Appearance ----------

const managerMod = ({codex = null, appearance = true} = {}) => {
  const calls = [];
  const state = {worldDefault: 'ag-default', userOverride: '', effective: 'ag-default', size: 'compact'};
  const api = {calls, state};
  if (appearance) api.appearance = {contract: 'ag-appearance/0.1-beta', getState: () => ({...state}), listSkins: () => [{id: 'ag-default', label: 'Standard'}, {id: 'ag-slate', label: 'Slate'}],
    listSizes: () => [{id: 'compact', label: 'Compact', selected: state.size === 'compact'}, {id: 'comfortable', label: 'Comfortable', selected: state.size === 'comfortable'}],
    applyTo: root => calls.push(['applyTo', !!root]), setUserOverride: async id => { calls.push(['setUserOverride', id]); state.userOverride = id; return {...state}; },
    setSize: async v => { calls.push(['setSize', v]); state.size = v; }, openMyAppearance: () => calls.push(['openMyAppearance'])};
  if (codex) api.codex = codex(calls);
  return {active: true, api};
};

test('Appearance without Manager: per-user Dark / Light and density, defaulting to the GM\'s world default; GM-only default', async () => {
  installGlobals({user: users.owner});
  assert.deepEqual(look.userLook(), {theme: 'world', density: 'world'});
  assert.deepEqual(look.effectiveLook(), {theme: 'dark', density: 'compact'});
  assert.equal((await look.setUserLook('theme', 'light')).ok, true);
  assert.equal((await look.setUserLook('theme', 'neon')).ok, false);
  assert.equal((await look.setUserLook('colour', 'light')).ok, false);
  assert.deepEqual(game.settings.store.look, {theme: 'light', density: 'world'});
  assert.equal((await look.setWorldLook('density', 'comfortable')).ok, false, 'players can\'t change the world default');
  installGlobals({user: users.gm, settings: {look: {theme: 'light'}}});
  assert.equal((await look.setWorldLook('density', 'comfortable')).ok, true);
  assert.deepEqual(look.effectiveLook(), {theme: 'light', density: 'comfortable'});
  const el = {dataset: {}};
  look.applyLook(el);
  assert.deepEqual({...el.dataset}, {agchTheme: 'light', agchDensity: 'comfortable'});
  const menu = look.lookMenuHtml();
  assert.match(menu, /class="agch-menu agch-lookmenu"/); assert.match(menu, /data-action="look-set" data-value="world" data-field="theme"/);
  assert.match(menu, /aria-checked="true" data-action="look-set" data-value="light" data-field="theme"/);
  assert.match(look.lookSetupCard(), /data-edit="look-default" data-field="theme"/);
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-app\[data-agch-theme="light"\]/); assert.match(css, /\.agch-app\[data-agch-density="comfortable"\]/);
});

test('Appearance with Manager: the menu lists Manager\'s skins and sizes and sets this user\'s own choice; the built-in look is cleared', async () => {
  const m = managerMod();
  installGlobals({user: users.owner, modules: {'ashen-gate-manager': m}});
  const {sheet, html} = await render('overview');
  assert.match(html, /data-action="more-menu"[^>]*aria-expanded="false"/);
  assert.match(html, /data-action="look-menu" data-ag-always aria-label="Appearance" data-tooltip="[^"]+" aria-haspopup="true" aria-expanded="false"/, '0.46.0: Appearance is an icon button in the header');
  await ACTIONS['more-menu'](sheet, {dataset: {}});
  assert.doesNotMatch(await sheet._renderHTML(), /agch-moremenu[\s\S]*data-action="look-menu"/, '0.46.0: not in the ⋯ menu any more');
  await ACTIONS['look-menu'](sheet, {dataset: {}});
  const open = await sheet._renderHTML();
  assert.match(open, /GM default \(Standard\)/); assert.match(open, /data-action="look-skin" data-value="ag-slate"/); assert.match(open, /data-action="look-size" data-value="comfortable"/);
  assert.equal((await ACTIONS['look-skin'](sheet, {dataset: {value: 'ag-slate'}})).ok, true);
  assert.equal((await ACTIONS['look-skin'](sheet, {dataset: {value: 'nope'}})).ok, false);
  assert.equal((await ACTIONS['look-size'](sheet, {dataset: {value: 'comfortable'}})).ok, true);
  ACTIONS['look-more'](sheet, {dataset: {}});
  assert.deepEqual(m.api.calls, [['setUserOverride', 'ag-slate'], ['setSize', 'comfortable'], ['openMyAppearance']]);
  const el = {dataset: {agchTheme: 'light', agchDensity: 'compact'}};
  look.applyLook(el);
  assert.deepEqual({...el.dataset}, {}, 'Manager\'s tokens apply instead');
  assert.match(look.lookSetupCard(), /General Manager's appearance is active/);
});

// ---------- NPC Codex ----------

test('NPC Codex button: GM always (with Manager), players only while Manager shares it; nothing without Manager', async () => {
  let access = false;
  const codex = calls => ({playerAccessEnabled: () => access, openPlayerView: async () => { calls.push(['openPlayerView']); return true; }});
  installGlobals({user: users.owner});
  assert.equal(codexBtn(), '');
  assert.equal((await openCodex()).ok, false);
  const m = managerMod({codex});
  installGlobals({user: users.gm, modules: {'ashen-gate-manager': m}});
  const more = s => { s.menu = 'more'; };   // 0.33.0: NPC Codex is in the header's ⋯ menu
  assert.match((await render('overview', hero(), more)).html, /data-action="codex-open"/);
  installGlobals({user: users.owner, modules: {'ashen-gate-manager': m}});
  assert.doesNotMatch((await render('overview', hero(), more)).html, /data-action="codex-open"/);
  assert.match((await openCodex()).error, /hasn't shared/);
  access = true;
  assert.match((await render('overview', hero(), more)).html, /data-action="codex-open"/);
  assert.equal((await ACTIONS['codex-open']()).ok, true);
  assert.deepEqual(m.api.calls, [['openPlayerView']]);
});

// ---------- Cinders ----------

const INST = 'cinst_TEST00001';
function cindersMod({art = 'ashen-gate/cinders/test-ember.webp', refuse = false, list = null, strain = 4} = {}) {
  return {active: true, api: {
    strain: {contract: 'ag-strain/1', get: () => ({value: strain, guaranteeAt: 10, band: {label: '[TEST] Band'}, chance: 0})},
    cinder: {contract: 'ag-cinder/1', list: () => { if (refuse) throw new Error('Cinders is hidden from players right now'); return list ?? [{instanceId: INST, name: '[TEST] Ember', art, treeId: 'TREE-TEST-EMBER', powers: [], enhancements: []}]; }}
  }};
}
const treesMod = calls => ({active: true, api: {open: async o => { calls.push(o); return true; }, listTrees: () => [], actorProgress: () => null}});

test('Cinder chip in the header: orb with art on the Strain glow, turning when Cinders allows it; click opens Ashen Gate → Cinders', async () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod()}});
  const {sheet, html} = await render('overview');
  assert.match(html, /<div class="agch-ident"><div class="agch-cchips"[\s\S]*data-action="inspiration"/, '0.37.0: the column\'s top row, before the star (the name and identity are in the header)');
  assert.match(html, /data-action="cinder-open" data-instance="cinst_TEST00001"/);
  assert.match(html, /<span class="agch-corb__orb agch-corb__orb--art agch-corb__orb--spin" data-tone="warm"><span class="agch-corb__default agch-corb__glow" aria-hidden="true"><\/span><img class="agch-corb__img" src="ashen-gate\/cinders\/test-ember\.webp" alt=""><\/span><\/span><span class="agch-cchip__name">\[TEST\] Ember<\/span>/);
  await ACTIONS['cinder-open'](sheet);
  assert.deepEqual([sheet.tab, sheet.agTab], ['ashen-gate', 'ashen-gate-cinders']);
  assert.equal(artSpins(), true, 'a Cinders without the settings counts as on');
  game.settings.store.rotateArtLocal = false;
  assert.equal(artSpins(), false);
  assert.doesNotMatch(cinderChipsHtml(sheet.document), /--spin/, 'off on this device: no turn');
  assert.doesNotMatch(orbCoreHtml(null, 'calm', true), /--spin|<img/, 'the default orb never turns');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-corb__orb--spin \.agch-corb__img \{ animation: agch-spin 90s linear infinite;/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.agch-app \.agch-corb__img \{ animation: none !important;/);
});

test('no Cinder chip without a Cinder, when Cinders refuses the player, or when the GM hides Cinders from players', async () => {
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod({list: []})}});
  assert.doesNotMatch((await render('overview')).html, /agch-cchips/);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod({refuse: true})}});
  assert.deepEqual(boundCinders(makeActor()), []);
  assert.doesNotMatch((await render('overview')).html, /agch-cchips/);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod()}, settings: {playerVisibility: {cinders: false}}});
  const {sheet, html} = await render('overview');
  assert.doesNotMatch(html, /agch-cchips/);
  assert.equal((await ACTIONS['cinder-open'](sheet)).ok, false);
});

test('Cinders panel head: Open skill tree next to the title opens Skill Trees at the Cinder\'s tree; players need Perks shown', async () => {
  const calls = [];
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod(), 'ashen-gate-skill-trees': treesMod(calls)}});
  const {sheet, html} = await render('ashen-gate', hero(), s => { s.agTab = 'ashen-gate-cinders'; });
  assert.match(html, /<span class="agch-panel__title"><h3><i class="fa-solid fa-fire" aria-hidden="true"><\/i> Cinders<\/h3><button type="button" class="ag-btn ag-btn--sm" data-action="cinder-tree" data-tree="TREE-TEST-EMBER"/);
  assert.equal((await ACTIONS['cinder-tree'](sheet, {dataset: {tree: 'TREE-TEST-EMBER'}})).ok, true);
  assert.deepEqual(calls, [{actorId: 'actor1', treeId: 'TREE-TEST-EMBER', tab: 'cinders'}]);
  installGlobals({user: users.owner, modules: {'ashen-gate-cinders': cindersMod(), 'ashen-gate-skill-trees': treesMod(calls)}, settings: {playerVisibility: {perks: false}}});
  assert.equal(skillTreeBtn(makeActor(), {canSeePerks: false}), '');
  assert.equal((await ACTIONS['cinder-tree'](sheet, {dataset: {}})).ok, false);
  installGlobals({user: users.gm, modules: {'ashen-gate-cinders': cindersMod({list: [{instanceId: 'a', name: 'A', treeId: 'T1'}, {instanceId: 'b', name: 'B', treeId: 'T2'}]}), 'ashen-gate-skill-trees': treesMod(calls)}});
  assert.match(skillTreeBtn(makeActor()), /data-action="cinder-tree" data-tooltip="Open Skill Trees for this character"/, 'two Cinders: Skill Trees opens for the character');
  installGlobals({user: users.gm, modules: {'ashen-gate-cinders': cindersMod()}});
  assert.equal(skillTreeBtn(makeActor()), '', 'no button without Skill Trees');
});

// ---------- First bind = Journey milestone ----------

function world({user = users.gm, cinders = cindersMod()} = {}) {
  const actor = hero();
  installGlobals({user, modules: {'ashen-gate-cinders': cinders}, actors: [actor]});
  game.actors.get = id => [actor].find(a => a.id === id);
  game.journal = [];
  return actor;
}
const entries = actor => actor.flags[MODULE_ID]?.journey?.entries ?? [];

test('first bind: one Journey entry per Cinder instance, written by the GM client; a re-fire, reload or other kinds add nothing', async () => {
  const actor = world();
  const bind = {kind: 'bind', instanceId: INST, definitionId: 'MUT-TEST-EMBER', actorId: 'actor1'};
  assert.equal((await j.recordCinderBind(bind)).ok, true);
  assert.deepEqual(entries(actor).map(e => [e.id, e.type, e.text]), [['cinder-cinst_TEST00001', 'cinder', 'Bound to the [TEST] Ember Cinder']]);
  await j.recordCinderBind(bind);
  await j.recordCinderBind({...bind, kind: 'progress'});
  await j.recordCinderBind({...bind, kind: 'transfer'});
  assert.equal(entries(actor).length, 1);
  await j.recordCinderBind({...bind, instanceId: 'cinst_TEST00002'});
  assert.equal(entries(actor).length, 2, 'another Cinder instance is its own milestone');
  assert.equal(await j.recordCinderBind({...bind, instanceId: 'bad id!'}), null);
  assert.equal(j.cinderBindText('[TEST] Ember Cinder'), 'Bound to the [TEST] Ember Cinder');
  assert.equal(j.cinderBindText(''), 'Bound to a Cinder');
  assert.equal(j.TYPES.cinder, 'Cinder');
});

test('first bind: players and level backups record nothing; a GM-hidden entry is never added again; Cinders missing still records', async () => {
  let actor = world({user: users.owner});
  assert.equal(await j.recordCinderBind({kind: 'bind', instanceId: INST, actorId: 'actor1'}), null);
  assert.deepEqual(entries(actor), []);
  actor = world();
  actor.flags[MODULE_ID] = {levelBackup: {sourceId: 'x'}};
  assert.equal(await j.recordCinderBind({kind: 'bind', instanceId: INST, actorId: 'actor1'}), null);
  actor = world({cinders: {active: false}});
  await j.recordCinderBind({kind: 'bind', instanceId: INST, actorId: 'actor1'});
  assert.equal(entries(actor)[0].text, 'Bound to a Cinder');
  globalThis.JournalEntry = {create: async data => { const doc = {...data, flags: structuredClone(data.flags), async update(diff) { for (const [p, v] of Object.entries(diff)) { const ks = p.split('.'); let o = doc; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks.at(-1)] = v; } return doc; }}; game.journal.push(doc); return doc; }};
  assert.equal((await j.setHidden(actor, `cinder-${INST}`, true)).ok, true);
  await j.recordCinderBind({kind: 'bind', instanceId: INST, actorId: 'actor1'});
  assert.deepEqual(entries(actor), [], 'hidden by the GM: stays hidden, no duplicate');
});
