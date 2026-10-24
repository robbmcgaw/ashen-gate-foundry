/** 0.45.0: add attacks, items, spells and features from the Hub (mocked Foundry and dnd5e; logic only, not the real browser). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as add from '../scripts/item-add.mjs';
import {ADD_TYPES} from '../scripts/item-add.mjs';
import {shellHtml} from '../scripts/views.mjs';
import {ACTIONS, createHubSheetClass} from '../scripts/sheet.mjs';
const CharacterHubSheet = createHubSheetClass(class { static DEFAULT_OPTIONS = {position: {}}; });
import {ITEM_TABS} from '../scripts/tabs.mjs';

const MAIN = {name: 'main'}, OTHER = {name: 'popout'};
const dropEvent = (data, target) => ({target, dataTransfer: {getData: () => JSON.stringify(data)}, preventDefault() {}, stopPropagation() {}});

/** dnd5e + Foundry stand-ins. `docs` maps uuid → Item document. */
function world({user = users.owner, docs = {}, steps = 0, settings = {}, actor = makeActor()} = {}) {
  const notes = installGlobals({user, settings});
  const log = {browse: [], dropCreate: [], manager: [], fromCompendium: []};
  class AdvancementManager {
    constructor() { this.steps = Array(steps).fill({}); }
    static forNewItem(a, data) { log.manager.push(data); return new this(); }
    async render() { return this; }
  }
  let pick = null;
  globalThis.dnd5e = {applications: {advancement: {AdvancementManager}, CompendiumBrowser: {async selectOne(o) { log.browse.push(o); return pick; }}}};
  globalThis.CONFIG.Item = {typeLabels: {}, dataModels: {spell: {onDropCreate: (e, a, d) => log.dropCreate.push([e, a, d])}}};
  const doc = (uuid, type, extra = {}) => (docs[uuid] = {documentName: 'Item', uuid, id: uuid.split('.').pop(), name: `[TEST] ${type}`, type, system: {}, parent: null, ...extra});
  globalThis.fromUuid = async uuid => docs[uuid] ?? null;
  globalThis.Item = {implementation: {fromCompendium: (d, o) => { log.fromCompendium.push(o); return {_id: d.id, name: d.name, type: d.type, system: structuredClone(d.system)}; },
    fromDropData: async raw => docs[raw.uuid] ?? null}};
  globalThis.foundry = {...globalThis.foundry, utils: {randomID: () => 'rnd'}};
  return {actor, notes, log, doc, setPick: u => { pick = u; }};
}
const created = actor => actor.calls.filter(c => c[0] === 'createEmbedded');
const ctx = (actor, user = users.owner) => ({actor, editable: actor.testUserPermission(user, 'OWNER'), tab: 'x', sheet: {filters: {}, listFilters: {combat: {}, magic: {}, features: {}}, expanded: new Set()}});

test('the types each tab hands the compendium browser', async () => {
  const w = world();
  for (const [tab, types] of Object.entries(ADD_TYPES)) {
    w.setPick(null);
    assert.deepEqual(await add.browseAndAdd(w.actor, tab), {ok: true, result: null});
    assert.deepEqual([...w.log.browse.at(-1).filters.locked.types], types);
  }
  assert.deepEqual(ADD_TYPES.inventory, ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']);
  assert.deepEqual(ADD_TYPES.magic, ['spell']); assert.deepEqual(ADD_TYPES.features, ['feat']); assert.deepEqual(ADD_TYPES.combat, ['weapon', 'feat']);
});

test('permissions: an observer is refused in the function, a GM and an owner are not', async () => {
  const w = world({user: users.observer});
  for (const fn of [() => add.startAdd(w.actor, 'inventory', {choose: async () => 'browse'}), () => add.browseAndAdd(w.actor, 'magic'),
    () => add.createNew(w.actor, 'features', {pick: async () => ({name: 'x'})}),
    () => add.dropOnList(w.actor, 'combat', dropEvent({type: 'Item', uuid: 'a.b'})), () => add.addDocument(w.actor, {documentName: 'Item', type: 'loot', name: 'x'})]) {
    const r = await fn(); assert.equal(r.ok, false); assert.match(r.error, /owner or the GM|don't own/);
  }
  assert.equal(w.log.browse.length, 0); assert.equal(created(w.actor).length, 0);
  assert.equal(add.addState(w.actor, 'nope').ok, false);
  for (const u of [users.owner, users.gm]) assert.equal(add.addState(w.actor, 'magic', u).ok, true);
});

test('a tab hidden from players refuses a player but not the GM', async () => {
  const w = world({settings: {playerVisibility: {magic: false}}});
  assert.equal((await add.browseAndAdd(w.actor, 'magic')).ok, false);
  assert.equal(add.addState(w.actor, 'magic', users.gm).ok, true);
  assert.equal(add.addState(w.actor, 'inventory').ok, true);
});

test('browse: the pick is built with fromCompendium and dnd5e onDropCreate, created once, with a quiet note', async () => {
  const w = world(); w.doc('Compendium.t.s.Item.fire', 'spell', {name: '[TEST] Firebolt', system: {level: 0}});
  w.setPick('Compendium.t.s.Item.fire');
  const r = await add.browseAndAdd(w.actor, 'magic', {sheet: {element: {}}});
  assert.equal(r.ok, true); assert.equal(r.result, 'created');
  assert.equal(created(w.actor).length, 1); assert.equal(created(w.actor)[0][2][0].name, '[TEST] Firebolt');
  assert.equal(w.log.dropCreate.length, 1, "dnd5e's spell onDropCreate ran"); assert.ok(w.log.dropCreate[0][0].target !== undefined);
  assert.deepEqual(w.notes.at(-1), ['info', 'Added [TEST] Firebolt to [TEST] Hero.']);
});

test('browse: a type the tab does not take, a missing item and a feat with no attack are refused with a reason', async () => {
  const w = world(); w.doc('u.sword', 'weapon'); w.doc('u.feat', 'feat', {name: '[TEST] Lucky', system: {activities: {a: {type: 'utility'}}}});
  w.doc('u.strike', 'feat', {name: '[TEST] Strike', system: {activities: {a: {type: 'attack'}}}}); w.doc('u.cls', 'class', {name: '[TEST] Fighter'});
  w.setPick('u.sword'); assert.match((await add.browseAndAdd(w.actor, 'magic')).error, /doesn't go in this list/);
  w.setPick('u.feat'); assert.match((await add.browseAndAdd(w.actor, 'combat')).error, /Add it from the Features tab/);
  w.setPick('u.strike'); assert.equal((await add.browseAndAdd(w.actor, 'combat')).ok, true, 'a feat with an attack activity is an attack');
  w.setPick('u.nope'); assert.match((await add.browseAndAdd(w.actor, 'features')).error, /no longer exists/);
  w.setPick('u.cls'); assert.match((await add.browseAndAdd(w.actor, 'features')).error, /Level up/);
  assert.equal(created(w.actor).length, 1);
});

test('browse: no compendium browser in this dnd5e says so; a browser that throws is an error, not silence', async () => {
  const w = world(); delete globalThis.dnd5e.applications.CompendiumBrowser;
  assert.match((await add.browseAndAdd(w.actor, 'features')).error, /no compendium browser/);
  globalThis.dnd5e.applications.CompendiumBrowser = {selectOne: async () => { throw new Error('boom'); }};
  const orig = console.error; console.error = () => {};
  try { assert.match((await add.browseAndAdd(w.actor, 'features')).error, /boom/); } finally { console.error = orig; }
});

test('an item with advancement runs dnd5e\'s manager exactly as the native drop does (a window when it has steps; created otherwise or when disabled)', async () => {
  for (const [steps, settings, expect] of [[1, {}, 'advancement'], [0, {}, 'created'], [1, {disableAdvancements: true}, 'created']]) {
    const w = world({steps, settings}); w.doc('u.feat', 'feat', {name: '[TEST] Granter', system: {advancement: {a1: {}}}});
    let shown = 0; globalThis.Hooks = {on: () => 1, off() {}}; const sheet = {_renderChild: () => { shown++; }};
    w.setPick('u.feat');
    const r = await add.browseAndAdd(w.actor, 'features', {sheet});
    assert.equal(r.result, expect); assert.equal(shown, expect === 'advancement' ? 1 : 0);
    assert.equal(created(w.actor).length, expect === 'created' ? 1 : 0, 'with a window, dnd5e creates the item itself on completion');
    assert.equal(w.log.manager.length, settings.disableAdvancements ? 0 : 1);
  }
});

test('a container comes with its contents', async () => {
  const w = world(); const box = w.doc('u.box', 'container', {name: '[TEST] Pack', toObject() { return {name: this.name, type: 'container', system: {}}; }});
  box.parent = null; box.pack = 'p'; globalThis.game.packs = {get: () => ({getIndex: async () => [{_id: 'c1', system: {container: 'box'}}], getDocument: async () => ({documentName: 'Item', id: 'c1', name: '[TEST] Rope', type: 'loot', system: {container: 'box'}, toObject() { return {name: this.name, type: 'loot', system: {container: 'box'}}; }})})};
  const make = w.actor.createEmbeddedDocuments, opts = []; w.actor.createEmbeddedDocuments = (t, rows, o) => { opts.push(o); return make(t, rows, o); };
  const r = await add.addDocument(w.actor, box, {tab: 'inventory'});
  assert.equal(r.ok, true); const rows = created(w.actor)[0][2];
  assert.equal(rows.length, 2); assert.equal(rows[1].system.container, rows[0]._id); assert.deepEqual(opts, [{keepId: true}]);
  assert.match(w.notes.at(-1)[1], /with 1 item inside/);
});

test('create new: name and type, a blank embedded item, then its sheet opens beside the Hub (popped out: in the Hub\'s window)', async () => {
  globalThis.document = MAIN;
  try {
    const w = world(); const sheetApp = {renders: [], render(o) { this.renders.push(o); return Promise.resolve(); }};
    const orig = w.actor.createEmbeddedDocuments; w.actor.createEmbeddedDocuments = async (t, rows) => { const [i] = await orig(t, rows); i.sheet = sheetApp; return [i]; };
    const asked = []; const pick = async tab => { asked.push(tab); return {name: '  [TEST] Club  ', type: 'weapon'}; };
    const hub = {element: {ownerDocument: OTHER}, children: [], renderChild(a) { this.children.push(a); return Promise.resolve(); }};
    const r = await add.createNew(w.actor, 'combat', {sheet: hub, pick});
    assert.equal(r.ok, true); assert.deepEqual(created(w.actor)[0][2], [{name: '[TEST] Club', type: 'weapon'}]);
    assert.deepEqual(hub.children, [sheetApp]); assert.deepEqual(sheetApp.renders, []);
    const inMain = {element: {ownerDocument: MAIN}, renderChild() { throw new Error('not popped out'); }};
    await add.createNew(w.actor, 'combat', {sheet: inMain, pick}); assert.deepEqual(sheetApp.renders, [{force: true}]);
    // one type tabs do not ask for a type; blank names and foreign types are refused
    let fields; await add.createPick('magic', {ask: async (t, f) => { fields = f; return null; }}); assert.deepEqual(fields.map(f => f.name), ['name']);
    await add.createPick('inventory', {ask: async (t, f) => { fields = f; return null; }}); assert.deepEqual(fields.map(f => f.name), ['name', 'type']);
    assert.match((await add.createNew(w.actor, 'magic', {pick: async () => ({name: ' '})})).error, /name/);
    assert.match((await add.createNew(w.actor, 'inventory', {pick: async () => ({name: 'x', type: 'spell'})})).error, /types listed/);
    assert.deepEqual(await add.createNew(w.actor, 'inventory', {pick: async () => null}), {ok: true, result: null});
  } finally { delete globalThis.document; }
});

test('create new: a failed create is an error message', async () => {
  const w = world(); w.actor.createEmbeddedDocuments = async () => { throw new Error('no room'); };
  const orig = console.error; console.error = () => {};
  try { assert.match((await add.createNew(w.actor, 'features', {pick: async () => ({name: 'x'})})).error, /Could not create x: no room/); } finally { console.error = orig; }
});

test('the Add button: its dialog picks Browse or Create; Cancel does nothing', async () => {
  const w = world(); w.doc('u.feat', 'feat'); w.setPick('u.feat');
  assert.equal((await add.startAdd(w.actor, 'features', {choose: async () => 'browse'})).result, 'created');
  assert.equal((await add.startAdd(w.actor, 'features', {choose: async () => 'create', pick: async () => ({name: 'Z'})})).result, 'created');
  assert.deepEqual(await add.startAdd(w.actor, 'features', {choose: async () => null}), {ok: true, result: null});
  assert.equal(created(w.actor).length, 2);
  let args; await add.addChoice('combat', async (...a) => { args = a; return 'x'; });
  assert.deepEqual(args[2].map(c => c.label), ['Browse compendiums…', 'Create new…']);
});

test('drop: an Item from the sidebar or a compendium is added; folders, non-items, own items and classes are refused', async () => {
  const w = world(); w.doc('Item.s1', 'loot', {name: '[TEST] Gem'}); w.doc('Item.mine', 'loot', {parent: w.actor}); w.doc('Item.c', 'class');
  const ok = await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Item', uuid: 'Item.s1'}), {target: {}});
  assert.equal(ok.ok, true); assert.equal(created(w.actor)[0][2][0].name, '[TEST] Gem');
  assert.match((await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Folder', uuid: 'f'}))).error, /one at a time/);
  assert.match((await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Actor', uuid: 'a'}))).error, /Drop an item/);
  assert.match((await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Item', uuid: 'Item.mine'}))).error, /already on/);
  assert.match((await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Item', uuid: 'Item.c'}))).error, /Level up/);
  assert.match((await add.dropOnList(w.actor, 'inventory', dropEvent({type: 'Item', uuid: 'Item.gone'}))).error, /no longer exists/);
  assert.equal(created(w.actor).length, 1);
});

test('drop on a list: the Hub\'s content handler adds, keeps the hotbar slot behaviour and refuses observers', async () => {
  const w = world(); w.doc('Item.s1', 'weapon', {name: '[TEST] Axe'});
  const calls = []; const slot = {}; const zone = {dataset: {itemDrop: 'combat'}};
  const fake = {document: w.actor, _dropHighlight() {}, _onHotbarDrop: e => calls.push(['hotbar', e]), _onSocketDrop: () => calls.push(['socket']), _onCompanionDrop: () => calls.push(['companion'])};
  const onList = CharacterHubSheet.prototype._onListDrop;
  const ev = dropEvent({type: 'Item', uuid: 'Item.s1'}, {closest: sel => (sel === '[data-item-drop]' ? zone : null)});
  const r = await onList.call(fake, ev); assert.equal(r.ok, true); assert.equal(created(w.actor).length, 1);
  // the listener routes a hotbar slot before an item zone
  const handlers = {}; const content = {addEventListener: (t, f) => { (handlers[t] ??= []).push(f); }};
  CharacterHubSheet.prototype._bindContent.call({...fake, _onListDrop: onList.bind(fake), _onHub: () => {}, _onHubChange() {}, _onContextMenu() {}, _onOutsideClick() {}, _onHpBarOpen() {}, _onArtEdit() {}}, content);
  const both = {target: {closest: sel => (/hotbar-slot/.test(sel) ? slot : /item-drop/.test(sel) ? zone : null)}};
  handlers.drop.forEach(f => f(both)); assert.deepEqual(calls.map(c => c[0]), ['hotbar'], 'quick bar drops are unchanged');
  let prevented = 0; handlers.dragover.forEach(f => f({target: {closest: sel => (/item-drop/.test(sel) ? zone : null)}, preventDefault: () => prevented++}));
  assert.equal(prevented, 1, 'a list accepts the drag');
  const o = world({user: users.observer}); o.doc('Item.s1', 'weapon');
  assert.equal((await onList.call({...fake, document: o.actor}, ev)).ok, false);
  assert.equal(created(o.actor).length, 0);
});

test('Add buttons render per tab, disabled with a reason for an observer, and lists carry a drop zone only for owners', () => {
  installGlobals({user: users.owner});
  const mkCtx = (actor, tab) => ({...ctx(actor), tab});
  const html = {};
  const w = world();
  for (const t of ITEM_TABS) html[t.id] = t.render(mkCtx(w.actor, t.id));
  assert.match(html.combat, /data-action="item-add" data-tab="combat"[^>]*>(?:(?!<\/button>).)*Add attack…/s);
  assert.match(html.inventory, /Add item…/); assert.match(html.magic, /Add spell…/); assert.match(html.features, /Add feature…/);
  for (const id of Object.keys(html)) assert.match(html[id], new RegExp(`data-item-drop="${id}"`));
  assert.doesNotMatch(html.inventory.match(/<button[^>]*data-action="item-add"[^>]*>/)[0], /disabled/);
  const o = world({user: users.observer}); const octx = {...ctx(o.actor, users.observer), editable: false};
  for (const t of ITEM_TABS) {
    const h = t.render({...octx, tab: t.id}); const b = h.match(/<button[^>]*data-action="item-add"[^>]*>/)[0];
    assert.match(b, /disabled/); assert.match(b, /data-tooltip="Only /); assert.doesNotMatch(h, /data-item-drop/);
  }
});

test('actions: item-add refuses an observer (shown as a warning by report) and puts focus back on the tab\'s Add button', async () => {
  const o = world({user: users.observer}); let focused = 0;
  const sheet = {document: o.actor, element: {querySelector: sel => (sel === '[data-action="item-add"][data-tab="features"]' ? {focus: () => focused++} : null)}};
  const r = await ACTIONS['item-add'](sheet, {dataset: {tab: 'features'}});
  assert.equal(r.ok, false); assert.equal(focused, 1); assert.equal(created(o.actor).length, 0);
});
