/** Core links (0.26.0). Proves matching/adopt/link/undo logic with mocked Foundry items and packs, not native Foundry UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreLinks, bookKey, rulesOf, isSource2024, isCoreSource, nameKey, findMatches, coreRefOf, LINK_FLAG, SOURCES_SETTING, LINK_HISTORY_SETTING} from '../scripts/core-links.js';
import {planRecord} from '../scripts/core.js';

const M = 'ashen-gate-manager';
const setPath = (o, path, v) => {const k = path.split('.'), last = k.pop(); k.reduce((x, y) => (x[y] ??= {}), o)[last] = v;};
function mkItem({id, name, type = 'consumable', img = 'icons/ag.webp', system = {}, flags = {}, folder = null}) {
  return {id, _id:id, name, type, img, system, flags, folder, uuid:`Item.${id}`,
    toObject() {return structuredClone({_id:this.id, name:this.name, type:this.type, img:this.img, system:this.system, flags:this.flags});},
    getFlag(s, k) {return this.flags[s]?.[k];},
    async unsetFlag(s, k) {delete this.flags[s]?.[k];}};
}
const agItem = (id, name, coreRef, extra = {}) => mkItem({id, name, system:{quantity:1, price:{value:99}, description:{value:'<p>AG text</p>'}}, ...extra,
  flags:{[M]:{source:{sourceId:`ITEM-${id}`, entityType:'Item', definition:coreRef === undefined ? {} : {core_ref:coreRef}}}}});
const core = (id, name, {type = 'consumable', book = 'XDMG', rules, plutonium = false, quantity = 1, rarity = 'common'} = {}) => mkItem({id, name, type, img:`icons/core-${id}.webp`,
  system:{quantity, rarity, description:{value:`<p>Core ${name}</p>`}, source:{book, ...(rules ? {rules} : {})}}, flags:plutonium ? {plutonium:{source:book, page:'items.html'}} : {}});

function mkWorld({items = [], packs = [], gm = true, sources} = {}) {
  const store = {[SOURCES_SETTING]:sources ?? {}, [LINK_HISTORY_SETTING]:[]};
  const all = [...items, ...packs.flatMap(p => p.full)];
  const game = {user:{isGM:gm}, items:{contents:items, get:id => items.find(i => i.id === id)}, folders:{contents:[]}, packs:{contents:packs},
    settings:{get:(n, k) => structuredClone(store[k]), set:async (n, k, v) => {store[k] = structuredClone(v); return v;}}};
  const writes = [];
  const api = createCoreLinks({game,
    loadCore:async uuid => {const d = all.find(x => x.uuid === uuid); return d ? d.toObject() : null;},
    update:async (doc, data, options) => {
      writes.push({id:doc.id, keys:Object.keys(data), options});
      for(const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v));
    }});
  return {api, game, store, writes};
}
function mkPack(collection, entries, {packageName = 'dnd5e', packageType = 'system', name} = {}) {
  const full = entries.map(e => Object.assign(e, {uuid:`Compendium.${collection}.Item.${e.id}`}));
  return {collection, documentName:'Item', metadata:{packageName, packageType, name:name ?? collection.split('.')[1], label:collection}, full,
    async getIndex() {return {contents:full.map(e => ({...e.toObject(), uuid:e.uuid}))};}};
}

test('book and rules detection: 2024 vs legacy', () => {
  assert.equal(bookKey("DMG'24"), 'DMG24');
  assert.equal(bookKey('XPHB'), 'PHB24');
  assert.equal(bookKey('SRD 5.2'), 'SRD52');
  assert.equal(rulesOf({system:{source:{rules:'2014', book:'XPHB'}}}), false);
  assert.equal(rulesOf({flags:{plutonium:{source:'XDMG'}}}), true);
  assert.equal(rulesOf({system:{source:{book:'PHB'}}}), false);
  assert.equal(rulesOf({system:{}}), null);
  assert.equal(nameKey('The Potion of Healing!'), 'potion of healing');
});

test('only AG items with core_ref are candidates', () => {
  assert.equal(coreRefOf(agItem('a', 'X')), null);
  assert.deepEqual(coreRefOf(agItem('b', 'X', 'Potion of Healing')), {name:'Potion of Healing'});
  assert.equal(coreRefOf(core('c', 'Potion of Healing')), null);
});

test('pool order: Plutonium world items first, then world packs, then dnd5e 2024 packs; legacy never', async () => {
  const pluto = core('p1', 'Potion of Healing', {plutonium:true});
  const legacy = core('l1', 'Potion of Healing', {book:'DMG'});
  const unknown = core('u1', 'Potion of Healing', {book:''});
  const sys24 = mkPack('dnd5e.equipment24', [core('s1', 'Potion of Healing', {book:'SRD 5.2'})]);
  const sys14 = mkPack('dnd5e.items', [core('s2', 'Potion of Healing', {book:'SRD 5.1'})]);
  const ag = agItem('a1', 'Healing Draught', {name:'Potion of Healing', source:"DMG'24"});
  const {api} = mkWorld({items:[ag, pluto, legacy, unknown], packs:[sys24, sys14]});
  const out = await api.preview();
  assert.equal(out.ok, true, out.message);
  const row = out.rows[0];
  assert.equal(row.best.uuid, 'Item.p1');
  assert.equal(row.best.sourceLabel, 'Plutonium world item');
  assert.equal(row.best.confidence, 'HIGH');
  assert.deepEqual([row.best, ...row.others].map(c => c.uuid), ['Item.p1', 'Compendium.dnd5e.equipment24.Item.s1']);
  assert.ok(![row.best, ...row.others].some(c => ['Item.l1', 'Item.u1', 'Compendium.dnd5e.items.Item.s2'].includes(c.uuid)), 'no legacy or unknown-edition content');
  assert.equal(out.withoutRef, 0);
});

test('confidence: HIGH ticked and adopted by default; MEDIUM and LOW need a tick', async () => {
  const items = [core('c1', 'Potion of Healing', {rules:'2024'}), core('c2', 'Rope', {type:'loot', rules:'2024'}), core('c3', 'Bag of Holding (Greater)', {type:'container', rules:'2024'}),
    agItem('a1', 'Draught', {name:'Potion of Healing'}), agItem('a2', 'Climbing Rope', {name:'Rope'}), agItem('a3', 'Big Bag', {name:'Bag of Holding'}), agItem('a4', 'Nothing', {name:'Unobtainium'})];
  const {api} = mkWorld({items});
  const rows = Object.fromEntries((await api.preview()).rows.map(r => [r.name, r]));
  assert.equal(rows.Draught.status, 'adopt'); assert.equal(rows.Draught.ticked, true); assert.equal(rows.Draught.adopt, true);
  assert.ok(rows.Draught.diff.some(d => d.path === 'system.description.value' && d.after === '<p>Core Potion of Healing</p>'));
  assert.equal(rows['Climbing Rope'].status, 'review'); assert.equal(rows['Climbing Rope'].best.confidence, 'MEDIUM'); assert.equal(rows['Climbing Rope'].ticked, false);
  assert.equal(rows['Big Bag'].best.confidence, 'LOW'); assert.equal(rows['Big Bag'].ticked, false);
  assert.equal(rows.Nothing.status, 'nomatch');
});

test('adopt falls back to link-only when type would change or quantity would be lost', async () => {
  const items = [core('c1', 'Potion of Healing', {rules:'2024', quantity:undefined}), agItem('a1', 'Draught', {name:'Potion of Healing'})];
  delete items[0].system.quantity;
  const {api} = mkWorld({items});
  const [row] = (await api.preview()).rows;
  assert.equal(row.status, 'link');
  assert.equal(row.canAdopt, false);
  assert.match(row.reason, /Link only: .*quantity/);
  const items2 = [core('c1', 'Rope', {type:'loot', rules:'2024'}), agItem('a1', 'Rope', {name:'Rope', type:'loot'})];
  const r2 = (await mkWorld({items:items2}).api.preview()).rows[0];
  assert.equal(r2.best.confidence, 'HIGH');
  assert.equal(r2.status, 'link');
  assert.match(r2.reason, /change its type/);
});

test('apply adopts img/system, keeps name/type/flags, stores coreLink; re-run is a no-op; undo restores', async () => {
  const ag = agItem('a1', 'Healing Draught', {name:'Potion of Healing'});
  const items = [core('c1', 'Potion of Healing', {plutonium:true}), ag];
  const w = mkWorld({items});
  const before = ag.toObject();
  const out = await w.api.apply({ids:['a1']});
  assert.equal(out.ok, true); assert.equal(out.adopted, 1);
  assert.equal(ag.name, 'Healing Draught');
  assert.equal(ag.type, 'consumable');
  assert.equal(ag.img, 'icons/core-c1.webp');
  assert.equal(ag.system.description.value, '<p>Core Potion of Healing</p>');
  assert.equal(ag.system.price, undefined, 'system replaced wholesale');
  assert.equal(ag.flags[M].source.sourceId, 'ITEM-a1');
  const link = ag.flags[M][LINK_FLAG];
  assert.deepEqual([link.uuid, link.confidence, link.adopted, link.source], ['Item.c1', 'HIGH', true, 'Plutonium world item']);
  assert.ok(w.writes.every(x => x.keys.every(k => ['img', 'system', `flags.${M}.${LINK_FLAG}`].includes(k))), 'only img, system and the link flag are written');
  assert.equal(w.writes.find(x => x.keys.includes('system')).options.recursive, false);
  const again = await w.api.preview();
  assert.equal(again.rows[0].status, 'linked');
  const n = w.writes.length;
  assert.equal((await w.api.apply({ids:['a1']})).linked, 0);
  assert.equal(w.writes.length, n);
  const undo = await w.api.undoLast();
  assert.equal(undo.restored, 1);
  assert.deepEqual(ag.toObject(), before);
});

test('link-only rows and GM-ticked MEDIUM rows; relink when the linked core item is gone', async () => {
  const ag = agItem('a1', 'Climbing Rope', {name:'Rope'});
  const items = [core('c1', 'Rope', {type:'loot', rules:'2024'}), ag];
  const w = mkWorld({items});
  await w.api.apply({ids:['a1']});
  assert.equal(ag.flags[M][LINK_FLAG].adopted, false);
  assert.equal(ag.img, 'icons/ag.webp');
  ag.flags[M][LINK_FLAG].uuid = 'Compendium.gone.Item.x';
  const row = (await w.api.preview()).rows[0];
  assert.equal(row.status, 'relink');
  assert.match(row.reason, /gone/);
  const ag2 = agItem('a2', 'Draught', {name:'Potion of Healing'});
  const w2 = mkWorld({items:[core('c2', 'Potion of Healing', {rules:'2024'}), ag2]});
  await w2.api.apply({ids:['a2'], linkOnly:['a2']});
  assert.equal(ag2.flags[M][LINK_FLAG].adopted, false);
  assert.equal(ag2.system.price.value, 99);
});

test('items embedded on actors are never candidates; GM gate enforced', async () => {
  const embedded = agItem('e1', 'Draught', {name:'Potion of Healing'});
  const w = mkWorld({items:[core('c1', 'Potion of Healing', {rules:'2024'})]});
  w.game.actors = {contents:[{items:{contents:[embedded]}}]};
  assert.equal((await w.api.preview()).rows.length, 0);
  const g = mkWorld({gm:false, items:[core('c1', 'Potion of Healing', {rules:'2024'}), agItem('a1', 'D', {name:'Potion of Healing'})]});
  for(const out of [await g.api.preview(), await g.api.apply({ids:['a1']}), await g.api.undoLast(), await g.api.saveSources({})]) assert.equal(out.ok, false);
  assert.equal(g.writes.length, 0);
  assert.equal(g.api.describeSources(), null);
});

test('configured packs and folders count as core sources; auto off drops detected ones', async () => {
  const mod = mkPack('my-module.gear', [core('m1', 'Potion of Healing', {book:''})], {packageName:'my-module', packageType:'module'});
  const sys24 = mkPack('dnd5e.equipment24', [core('s1', 'Potion of Healing', {book:'SRD 5.2'})]);
  const ag = agItem('a1', 'Draught', {name:'Potion of Healing'});
  let rows = (await mkWorld({items:[ag], packs:[mod, sys24]}).api.preview()).rows;
  assert.equal(rows[0].best.uuid, 'Compendium.dnd5e.equipment24.Item.s1', 'unconfigured module pack ignored');
  rows = (await mkWorld({items:[ag], packs:[mod, sys24], sources:{auto:false, packs:['my-module.gear'], folders:[]}}).api.preview()).rows;
  assert.equal(rows[0].best.uuid, 'Compendium.my-module.gear.Item.m1');
  assert.equal(rows[0].others.length, 0);
  assert.match(rows[0].best.sourceLabel, /Core source: my-module.gear/);
});

test('findMatches ranks HIGH before MEDIUM and checks the core_ref source book', () => {
  const pool = [{uuid:'a', name:'Rope', type:'loot', book:'PHB24', order:0}, {uuid:'b', name:'Rope', type:'loot', book:'DMG24', order:1}];
  const m = findMatches({name:'Rope', source:"DMG'24"}, 'loot', pool);
  assert.deepEqual(m.map(x => [x.uuid, x.confidence]), [['b', 'HIGH'], ['a', 'MEDIUM']]);
});

test('re-import keeps adopted core data as a known local edit, never overwriting or conflicting', () => {
  const record = {id:'ITEM-a1', status:'approved', foundry:{document_type:'Item', data:{name:'Healing Draught', type:'consumable', img:'icons/ag2.webp', system:{price:{value:120}}}}};
  const doc = {documentName:'Item', type:'consumable', coreLink:{adopted:true, adoptedPaths:['img', 'system'], name:'Potion of Healing'},
    flag:{managedFields:{name:'Healing Draught', img:'icons/ag.webp', 'system.price.value':99}},
    get:path => ({name:'Healing Draught', img:'icons/core.webp', 'system.price.value':50})[path]};
  const plan = planRecord(record, [doc]);
  assert.equal(plan.action, 'local');
  assert.match(plan.reason, /Core-linked to Potion of Healing.*2 source change/);
  const renamed = {...record, foundry:{...record.foundry, data:{...record.foundry.data, name:'Greater Draught'}}};
  const p2 = planRecord(renamed, [doc]);
  assert.equal(p2.action, 'update');
  assert.deepEqual(Object.keys(p2.patch), ['name']);
  const unlinked = planRecord(record, [{...doc, coreLink:null}]);
  assert.equal(unlinked.action, 'conflict');
});

test('a package record with core_ref validates and Manager stores it in the source definition', async () => {
  const {validatePackage} = await import('../scripts/core.js');
  const {sourceMetadata} = await import('../scripts/source-projection.mjs');
  const record = {id:'ITEM-TEST-DRAUGHT', entity_type:'Item', status:'approved', version:'0.1.0', provenance:{author:'[TEST]'}, visibility:'player', refs:[],
    name:'[TEST] Draught', core_ref:{name:'Potion of Healing', source:"DMG'24"}, foundry:{document_type:'Item', data:{name:'[TEST] Draught', type:'consumable'}}};
  const pkg = {manifest:{package_id:'test-core-ref', version:'0.1.0', schema_version:'0.1.0'}, records:[record]};
  assert.deepEqual(validatePackage(pkg).filter(e => /core_ref/.test(e)), []);
  const flags = {[M]:{source:sourceMetadata(record, pkg, [])}};
  assert.deepEqual(coreRefOf({flags}), {name:'Potion of Healing', source:"DMG'24", type:null, rarity:null});
});

test('0.30.0: Core Links uses isSource2024; a Plutonium item with an unknown book is a candidate, 2014 never', async () => {
  assert.equal(isSource2024({flags:{plutonium:{source:'HB'}}}), true);
  assert.equal(isSource2024({system:{source:{rules:'2024'}}}), true);
  assert.equal(isSource2024({system:{source:{book:'Homebrew'}}}), false);
  const plutoOdd = mkItem({id:'po', name:'Potion of Healing', system:{source:{book:'Some Book'}}, flags:{plutonium:{source:'Some Book'}}});
  const pluto14 = core('p14', 'Potion of Healing', {plutonium:true, book:'DMG'});
  const plain = core('n1', 'Potion of Healing', {book:''});
  const ag = agItem('a1', 'Healing Draught', {name:'Potion of Healing'});
  const {api} = mkWorld({items:[ag, plutoOdd, pluto14, plain]});
  const out = await api.preview();
  const uuids = [out.rows[0].best, ...out.rows[0].others].filter(Boolean).map(c => c.uuid);
  assert.deepEqual(uuids, ['Item.po']);
});

test('0.31.0: isCoreSource (Organize) counts 2014 core and SRD 5.1; isSource2024 (Core Links) stays 2024 only', async () => {
  const cases = [
    [{flags:{plutonium:{source:'HB'}}}, true, true],
    [{system:{source:{rules:'2024'}}}, true, true],
    [{system:{source:{book:'XPHB'}}}, true, true],
    [{system:{source:{book:'SRD 5.2'}}}, true, true],
    [{system:{source:{rules:'2014'}}}, true, false],
    [{system:{source:{book:'PHB'}}}, true, false],
    [{system:{source:{book:'DMG'}}}, true, false],
    [{system:{source:{book:'MM'}}}, true, false],
    [{system:{source:{book:"PHB'14"}}}, true, false],
    [{system:{source:{book:'SRD 5.1'}}}, true, false],
    [{system:{source:{book:'System Reference Document 5.1'}}}, true, false],
    [{flags:{plutonium:{source:'PHB'}}}, true, false],
    [{system:{source:{book:'PHB'}}, flags:{plutonium:{source:'PHB'}}}, true, false],
    [{system:{source:{book:'Homebrew'}}}, false, false],
    [{system:{source:{book:'[TEST] Third Party Tome'}}}, false, false],
    [{system:{source:{book:''}}}, false, false],
    [{system:{}}, false, false],
    [{}, false, false]
  ];
  for(const [entry, isCore, is24] of cases) {
    assert.equal(isCoreSource(entry), isCore, `isCoreSource ${JSON.stringify(entry)}`);
    assert.equal(isSource2024(entry), is24, `isSource2024 ${JSON.stringify(entry)}`);
  }
  // Core Links never offers 2014 / SRD 5.1 world items, even though Organize now files them under Core.
  const w14 = core('w14', 'Potion of Healing', {book:'SRD 5.1'});
  const r14 = mkItem({id:'r14', name:'Potion of Healing', system:{source:{rules:'2014'}}});
  const w24 = core('w24', 'Potion of Healing', {book:'XDMG'});
  const ag = agItem('a1', 'Healing Draught', {name:'Potion of Healing'});
  const {api} = mkWorld({items:[ag, w14, r14, w24]});
  const out = await api.preview();
  const uuids = [out.rows[0].best, ...out.rows[0].others].filter(Boolean).map(c => c.uuid);
  assert.deepEqual(uuids, ['Item.w24']);
});
