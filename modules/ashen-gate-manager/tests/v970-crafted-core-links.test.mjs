// 0.97.0: Core links never adopt `system` for Ashen Gate crafted items (link only; core image only over the default placeholder);
// "Restore Ashen Gate text on linked crafted items…" (preview, apply, idempotent, GM only, plain gear untouched); Sync fills an EMPTY
// source label on unchanged Manager-imported Items. Mocked Foundry; synthetic [TEST] data only. Proves logic, not the live Forge window.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCoreLinks, isCraftedItem, isPlaceholderImg, CRAFTED_NOTE, LINK_FLAG, SOURCES_SETTING, LINK_HISTORY_SETTING} from '../scripts/core-links.js';
import {planRestoreCrafted, applyRestoreCrafted, undoRestoreCrafted, storedSections, restoreSummary, RESTORE_FLAG} from '../scripts/crafted-restore.js';
import {MODULE_ID, exportedFields} from '../scripts/core.js';

const M = MODULE_ID;
const GM = {isGM: true}, PLAYER = {isGM: false};
const setPath = (o, path, v) => {const k = path.split('.'), last = k.pop(); k.reduce((x, y) => (x[y] ??= {}), o)[last] = v;};
function mkItem({id, name, type = 'loot', img = 'icons/svg/item-bag.svg', system = {}, flags = {}, effects = [], parent = null}) {
  return {id, _id: id, documentName: 'Item', name, type, img, system, flags, effects, parent, folder: 'F1', uuid: `Item.${id}`,
    toObject() {return structuredClone({_id: this.id, name: this.name, type: this.type, img: this.img, system: this.system, flags: this.flags, effects: this.effects});},
    getFlag(s, k) {return this.flags[s]?.[k];},
    async unsetFlag(s, k) {delete this.flags[s]?.[k];}};
}
const CRAFT_SYS = {quantity: 3, weight: {value: 7, units: 'lb'}, price: {value: 12, denomination: 'gp'}, description: {value: '<p>[TEST] Padded text</p>'},
  source: {custom: 'Ashen Gate'}, activities: {actAAAAAAAAAAAAAA: {type: 'utility', name: '[TEST] Rest well'}}};
const managedOf = system => exportedFields({foundry: {document_type: 'Item', data: {name: 'x', system}}});
function agItem(id, name, {def = {}, coreRef = {name: '[TEST] Bedroll'}, system = CRAFT_SYS, baseline = system, link, img, effects = []} = {}) {
  return mkItem({id, name, img, system: structuredClone(system), effects,
    flags: {[M]: {source: {sourceId: `ITEM-${id}`, entityType: 'Item', definition: {core_ref: coreRef, ...def}, managedFields: managedOf(baseline)}, ...(link ? {[LINK_FLAG]: link} : {})}}});
}
const coreItem = (id, name, {img = 'icons/core/bedroll.webp'} = {}) => {
  const it = mkItem({id, name, type: 'loot', img, system: {quantity: 1, weight: {value: 5, units: 'lb'}, price: {value: 1, denomination: 'gp'}, description: {value: '<p>Core bedroll text</p>'}, source: {book: 'XPHB', rules: '2024'}}});
  it.uuid = `Compendium.dnd5e.equipment24.Item.${id}`; it.flags = {plutonium: {source: 'XPHB'}};
  return it;
};
function mkWorld(items, packs = [coreItem('c1', '[TEST] Bedroll')], {gm = true} = {}) {
  const store = {[SOURCES_SETTING]: {}, [LINK_HISTORY_SETTING]: []};
  const pack = {collection: 'dnd5e.equipment24', documentName: 'Item', metadata: {packageName: 'dnd5e', packageType: 'system', name: 'equipment24', label: 'Equipment'},
    async getIndex() {return {contents: packs.map(e => ({...e.toObject(), uuid: e.uuid}))};}};
  const game = {user: {isGM: gm}, items: {contents: items, get: id => items.find(i => i.id === id)}, folders: {contents: []}, packs: {contents: [pack]},
    settings: {get: (n, k) => structuredClone(store[k]), set: async (n, k, v) => {store[k] = structuredClone(v);}}};
  const writes = [];
  const api = createCoreLinks({game,
    loadCore: async uuid => packs.find(p => p.uuid === uuid)?.toObject() ?? null,
    update: async (doc, data, options) => {
      writes.push({id: doc.id, keys: Object.keys(data), options});
      for (const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v));
    }});
  return {api, game, store, writes};
}

// ---------- B1: Core links ----------
test('crafted detection: definition fields, Ashen Gate activities or effects; plain gear is not crafted', () => {
  assert.equal(isCraftedItem(agItem('a', 'A', {def: {created_by_recipe_id: 'REC-TEST'}, system: {quantity: 1}})), true);
  assert.equal(isCraftedItem(agItem('b', 'B', {def: {profession_id: 'PROF-TEST'}, system: {quantity: 1}})), true);
  assert.equal(isCraftedItem(agItem('c', 'C', {def: {tierId: 'apprentice'}, system: {quantity: 1}})), true);
  assert.equal(isCraftedItem(agItem('d', 'D', {system: {quantity: 1}})), false, 'plain gear');
  assert.equal(isCraftedItem(agItem('e', 'E')), true, 'package-defined activities');
  assert.equal(isCraftedItem(agItem('f', 'F', {system: {quantity: 1}, effects: [{flags: {[M]: {effect: {effId: 'EFF-TEST'}}}}]})), true, 'an Ashen Gate effect');
  assert.equal(isCraftedItem(agItem('g', 'G', {system: {quantity: 1}, effects: [{flags: {}}]})), false, 'a foreign effect does not count');
  assert.equal(isCraftedItem(mkItem({id: 'h', name: 'H'})), false, 'not a Manager Item');
  assert.equal(isPlaceholderImg('icons/svg/item-bag.svg'), true); assert.equal(isPlaceholderImg(''), true);
  assert.equal(isPlaceholderImg('assets/items/mine.webp'), false);
});

test('preview: a crafted row says "Link only: this is an Ashen Gate crafted item" and shows no system diff; plain gear still adopts', async () => {
  const crafted = agItem('k1', '[TEST] Padded Bedroll', {def: {created_by_recipe_id: 'REC-TEST'}, img: 'assets/mine.webp'});
  const plain = agItem('p1', '[TEST] Plain Bedroll', {system: {quantity: 2, description: {value: '<p>AG</p>'}}});
  const w = mkWorld([crafted, plain]);
  const out = await w.api.preview();
  assert.equal(out.ok, true);
  const c = out.rows.find(r => r.id === 'k1'), p = out.rows.find(r => r.id === 'p1');
  assert.equal(c.crafted, true); assert.equal(c.canAdopt, false); assert.equal(c.adopt, false); assert.equal(c.status, 'link');
  assert.match(c.reason, new RegExp(CRAFTED_NOTE)); assert.deepEqual(c.diff, [], 'own image kept, no system change shown');
  assert.equal(p.canAdopt, true); assert.equal(p.status, 'adopt'); assert.match(p.reason, /adopt core data and link/);
  assert.ok(p.diff.some(d => d.path.startsWith('system.')));
  assert.ok(CRAFTED_NOTE.startsWith('Link only: this is an Ashen Gate crafted item'));
});

test('apply: a crafted item is linked, its system is never written; the core image only when it has the default image', async () => {
  const withDefault = agItem('k1', '[TEST] Padded Bedroll', {def: {created_by_recipe_id: 'REC-TEST'}});
  const withOwn = agItem('k2', '[TEST] Patchwork Blanket', {def: {profession_id: 'PROF-TEST'}, img: 'assets/mine.webp'});
  const plain = agItem('p1', '[TEST] Plain Bedroll', {system: {quantity: 2, description: {value: '<p>AG</p>'}}});
  const w = mkWorld([withDefault, withOwn, plain]);
  const plan = await w.api.preview();
  assert.match(plan.rows.find(r => r.id === 'k1').reason, /core image is used because this item has the default image/);
  assert.equal(plan.rows.find(r => r.id === 'k1').diff[0].path, 'img');
  const res = await w.api.apply({ids: ['k1', 'k2', 'p1']});
  assert.equal(res.linked, 3); assert.equal(res.adopted, 1, 'only the plain item adopts system');
  for (const id of ['k1', 'k2']) assert.ok(!w.writes.some(x => x.id === id && x.options?.recursive === false), `${id}: system never replaced`);
  assert.deepEqual(withDefault.system, CRAFT_SYS); assert.equal(withDefault.img, 'icons/core/bedroll.webp');
  assert.deepEqual(withOwn.system, CRAFT_SYS); assert.equal(withOwn.img, 'assets/mine.webp');
  assert.equal(withDefault.flags[M][LINK_FLAG].adopted, false); assert.deepEqual(withDefault.flags[M][LINK_FLAG].adoptedPaths, ['img']);
  assert.equal(withOwn.flags[M][LINK_FLAG].adopted, false); assert.deepEqual(withOwn.flags[M][LINK_FLAG].adoptedPaths, []);
  assert.equal(plain.flags[M][LINK_FLAG].adopted, true); assert.equal(plain.system.description.value, '<p>Core bedroll text</p>', 'plain gear keeps today\'s adopt behaviour');
  // Undo puts the image and the plain item back.
  const undo = await w.api.undoLast();
  assert.equal(undo.restored, 3);
  assert.equal(withDefault.img, 'icons/svg/item-bag.svg'); assert.equal(plain.system.description.value, '<p>AG</p>');
  assert.equal(withDefault.flags[M][LINK_FLAG], undefined);
});

test('apply: an image that stopped being the placeholder between preview and apply is not replaced; "link only" ticks are respected', async () => {
  const k = agItem('k1', '[TEST] Padded Bedroll', {def: {created_by_recipe_id: 'REC-TEST'}});
  const w = mkWorld([k]);
  await w.api.preview();
  k.img = 'assets/mine.webp'; // changed after the preview
  await w.api.apply({ids: ['k1']});
  assert.equal(k.img, 'assets/mine.webp');
});

test('a GM is required', async () => {
  const w = mkWorld([agItem('k1', 'K', {def: {created_by_recipe_id: 'REC-TEST'}})], undefined, {gm: false});
  assert.equal((await w.api.preview()).ok, false);
  assert.equal((await w.api.apply({ids: ['k1']})).ok, false);
});

// ---------- B2: Restore ----------
const adoptedLink = (over = {}) => ({uuid: 'Compendium.dnd5e.equipment24.Item.c1', name: 'Bedroll', adopted: true, adoptedPaths: ['img', 'system'], linkedAt: 'T1', ...over});
const coreLike = () => ({quantity: 3, weight: {value: 5, units: 'lb'}, price: {value: 1, denomination: 'gp'}, description: {value: '<p>Core bedroll text</p>'}, source: {custom: 'Ashen Gate', book: 'XPHB'},
  activities: {coreActBBBBBBBBB: {type: 'utility', name: 'Core use'}}});
function damaged(id, name, over = {}) { return agItem(id, name, {def: {created_by_recipe_id: 'REC-TEST'}, link: adoptedLink(), ...over, }); }

test('restore preview: counts adopted crafted items; plain gear, unlinked and non-adopted items are not targets', () => {
  const a = damaged('k1', '[TEST] Padded Bedroll'); a.system = coreLike();
  const b = damaged('k2', '[TEST] Patchwork Blanket'); b.system = coreLike();
  const plainAdopted = agItem('p1', '[TEST] Plain', {system: {quantity: 1, description: {value: '<p>AG</p>'}}, link: adoptedLink()}); plainAdopted.system.description.value = '<p>Core</p>';
  const linkOnly = damaged('k3', '[TEST] Link only'); linkOnly.flags[M][LINK_FLAG].adopted = false; linkOnly.system = coreLike();
  const unlinked = agItem('k4', '[TEST] Unlinked', {def: {created_by_recipe_id: 'REC-TEST'}}); unlinked.system = coreLike();
  const onActor = damaged('k5', '[TEST] On actor'); onActor.system = coreLike(); onActor.parent = {id: 'A1'};
  const matching = damaged('k6', '[TEST] Already fine');
  const noStore = damaged('k7', '[TEST] Nothing stored'); delete noStore.flags[M].source.managedFields; noStore.system = coreLike();
  const plan = planRestoreCrafted([a, b, plainAdopted, linkOnly, unlinked, onActor, matching, noStore], {user: GM});
  assert.equal(plan.total, 2); assert.equal(plan.alreadyMatching, 1); assert.equal(plan.nothingStored, 1); assert.equal(plan.items, 4);
  assert.deepEqual(plan.targets.filter(t => t.differs).map(t => t.id).sort(), ['k1', 'k2']);
  assert.match(restoreSummary(plan), /To restore: 2, already matching .*: 1, nothing stored to restore from .*: 1/);
  assert.throws(() => planRestoreCrafted([a], {user: PLAYER}), /Only the GM/);
});

test('restore apply: description, weight, price and activities come back; quantity, source label, folder, name and other fields stay', async () => {
  const a = damaged('k1', '[TEST] Padded Bedroll'); a.system = coreLike(); a.system.quantity = 3; a.system.source.custom = 'My label';
  const plan = planRestoreCrafted([a], {user: GM});
  const writes = [];
  const update = async (doc, data, options) => { writes.push({data: structuredClone(data), options}); for (const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v)); };
  const out = await applyRestoreCrafted(plan, {user: GM, update, yieldToUI: async () => {}, now: () => 'T2'});
  assert.equal(out.restored, 1); assert.deepEqual(out.failed, []);
  assert.equal(a.system.description.value, '<p>[TEST] Padded text</p>');
  assert.deepEqual(a.system.weight, {value: 7, units: 'lb'}); assert.deepEqual(a.system.price, {value: 12, denomination: 'gp'});
  assert.deepEqual(a.system.activities, CRAFT_SYS.activities, 'the core activity is gone, the Ashen Gate one is back');
  assert.equal(a.system.quantity, 3); assert.equal(a.system.source.custom, 'My label'); assert.equal(a.system.source.book, 'XPHB');
  assert.equal(a.folder, 'F1'); assert.equal(a.name, '[TEST] Padded Bedroll');
  assert.equal(a.flags[M][LINK_FLAG].adopted, false); assert.equal(a.flags[M][LINK_FLAG].restoredAt, 'T2'); assert.ok(!a.flags[M][LINK_FLAG].adoptedPaths.includes('system'));
  assert.equal(a.flags[M][RESTORE_FLAG].prev.description.value, '<p>Core bedroll text</p>', 'what was replaced is kept for undo');
  assert.ok(writes.every(w => !('name' in w.data) && !('folder' in w.data) && !('ownership' in w.data)));
  // Idempotent: nothing left to do, nothing written.
  const again = planRestoreCrafted([a], {user: GM});
  assert.equal(again.total, 0); assert.equal(again.targets.length, 0);
  const n = writes.length;
  const second = await applyRestoreCrafted(again, {user: GM, update, yieldToUI: async () => {}});
  assert.equal(second.restored, 0); assert.equal(writes.length, n); assert.match(second.message, /^Nothing to restore/);
});

test('restore apply: an adopted item whose text already matches only has its mark cleared (no system write); a stale preview skips changed items', async () => {
  const fine = damaged('k6', '[TEST] Already fine'), moved = damaged('k8', '[TEST] Moved'); moved.system = coreLike();
  const plan = planRestoreCrafted([fine, moved], {user: GM});
  moved.flags[M][LINK_FLAG].adopted = false; // changed since the preview
  const writes = [];
  const update = async (doc, data, options) => { writes.push({id: doc.id, data, options}); for (const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v)); };
  const out = await applyRestoreCrafted(plan, {user: GM, update, yieldToUI: async () => {}});
  assert.equal(out.restored, 0); assert.equal(out.cleared, 1); assert.equal(out.changedSincePreview, 1);
  assert.ok(!writes.some(w => w.options?.recursive === false), 'no system write');
  assert.equal(moved.system.description.value, '<p>Core bedroll text</p>', 'left as it is');
  await assert.rejects(() => applyRestoreCrafted(plan, {user: PLAYER, update}), /Only the GM/);
});

test('restore apply is chunked, can be stopped, and one failing item does not stop the others', async () => {
  const items = Array.from({length: 45}, (_, i) => { const d = damaged(`k${i}`, `[TEST] Item ${i}`); d.system = coreLike(); return d; });
  const plan = planRestoreCrafted(items, {user: GM});
  const ctl = new AbortController(), progress = [];
  const out = await applyRestoreCrafted(plan, {user: GM, signal: ctl.signal, yieldToUI: async () => {}, onProgress: p => { progress.push(p.done); ctl.abort(); },
    update: async (doc, data, options) => { options?.recursive === false ? doc.system = data.system : setPath(doc, Object.keys(data)[0], Object.values(data)[0]); }});
  assert.deepEqual(progress, [20]); assert.equal(out.cancelled, true); assert.equal(out.restored, 20);
  const again = planRestoreCrafted(items, {user: GM});
  assert.equal(again.total, 25, 'the rest is finished by running it again');
  const bad = await applyRestoreCrafted(again, {user: GM, yieldToUI: async () => {}, update: async (doc, data, options) => {
    if (doc.id === 'k21') throw new Error('write refused');
    options?.recursive === false ? doc.system = data.system : setPath(doc, Object.keys(data)[0], Object.values(data)[0]); }});
  assert.equal(bad.restored, 24); assert.equal(bad.failed.length, 1); assert.match(bad.message, /1 failed/);
});

test('restore undo puts the replaced text and the adopted mark back', async () => {
  const a = damaged('k1', '[TEST] Padded Bedroll'); a.system = coreLike();
  const update = async (doc, data, options) => { for (const [k, v] of Object.entries(data)) options?.recursive === false ? doc[k] = structuredClone(v) : setPath(doc, k, structuredClone(v)); };
  await applyRestoreCrafted(planRestoreCrafted([a], {user: GM}), {user: GM, update, yieldToUI: async () => {}});
  const out = await undoRestoreCrafted([a], {user: GM, update});
  assert.equal(out.undone, 1); assert.equal(a.system.description.value, '<p>Core bedroll text</p>'); assert.equal(a.flags[M][LINK_FLAG].adopted, true);
  assert.equal(a.flags[M][RESTORE_FLAG], undefined);
  await assert.rejects(() => undoRestoreCrafted([a], {user: PLAYER, update}), /Only the GM/);
});

test('stored sections: definition.foundry.data.system when present, else the import baseline', () => {
  assert.equal(storedSections({managedFields: managedOf(CRAFT_SYS)}).description.value, '<p>[TEST] Padded text</p>');
  assert.deepEqual(storedSections({managedFields: managedOf(CRAFT_SYS)}).activities, CRAFT_SYS.activities);
  assert.equal(storedSections({definition: {foundry: {data: {system: {description: {value: 'x'}, quantity: 9}}}}, managedFields: managedOf(CRAFT_SYS)}).description.value, 'x');
  assert.deepEqual(Object.keys(storedSections({managedFields: managedOf({quantity: 2, source: {custom: 'x'}})})), []);
});

test('wiring: Items > Checks has the action with the labelled confirmation; API is GM-gated; no write to quantity or ownership', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = read('../scripts/main.js'), hbs = read('../templates/manager.hbs'), src = read('../scripts/crafted-restore.js');
  assert.match(hbs, /data-ag-action="craftedrestore-run"[^]*Restore Ashen Gate text on linked crafted items…/);
  assert.match(main, /case "craftedrestore-run": await this\.#craftedRestoreAction\(\)/);
  assert.match(main, /yes:`Restore \$\{n\} item\$\{n===1\?'':'s'\}`/);
  assert.match(main, /craftedRestore:\{[^]*planRestoreCrafted[^]*applyRestoreCrafted[^]*undoRestoreCrafted/);
  assert.doesNotMatch(src.split('\n').filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n'), /quantity|ownership|folder/);
  assert.match(src, /Only the GM can restore/);
});

// ---------- C: Sync label ----------
import {executeSync} from '../scripts/sync-apply.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE} from '../scripts/sync.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';

const clone = v => structuredClone(v);
function merge(t, s) { for (const [k, v] of Object.entries(s)) { if (v && typeof v === 'object' && !Array.isArray(v)) merge(t[k] = (t[k] && typeof t[k] === 'object') ? t[k] : {}, v); else t[k] = v; } return t; }
function expand(data) { const out = {}; for (const [k, v] of Object.entries(data)) { const ks = k.split('.'), last = ks.pop(); ks.reduce((o, x) => (o[x] ??= {}), out)[last] = v; } return out; }
let ids = 0;
class Doc {
  constructor(raw, extra = {}) { this.documentName = 'Item'; this.raw = clone(raw); this.raw._id ??= `i${++ids}`; this.parent = null; this.deleted = false; this.writes = []; Object.assign(this, extra); }
  get id() { return this.raw._id; } get name() { return this.raw.name; } get type() { return this.raw.type; } get folder() { return null; } get hasPlayerOwner() { return false; }
  get uuid() { return `Item.${this.id}`; }
  getFlag(s, k) { return clone(this.raw.flags?.[s]?.[k]); } toObject() { return clone(this.raw); }
  async update(data) { this.writes.push(clone(data)); merge(this.raw, expand(data)); return this; }
}
const prov = {source: 'test'};
const rec = (id, name, sys = {}) => ({id, entity_type: 'Item', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov,
  foundry: {document_type: 'Item', data: {name, type: 'loot', system: {description: {value: `<p>${name}</p>`}, quantity: 1, price: {value: 5}, ...sys}}}});
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const flagged = (record, custom) => {
  const raw = clone(record.foundry.data); raw.system.source = {...(raw.system.source ?? {}), ...(custom === undefined ? {} : {custom})};
  raw.flags = {[M]: {source: {...sourceMetadata(record, {manifest: M1}, []), managedFields: exportedFields(record), pagesDefinition: []}}};
  return new Doc(raw);
};
function syncWorld(docs, {withUpdateDocuments = true} = {}) {
  const batches = [];
  const ctx = () => ({includeDrafts: false, deleteUnscoped: false, overwriteEdited: false, retiredIds: new Set(), ledger: {}, buildFlag: (r, m) => ({...sourceMetadata(r, {manifest: m}, []), managedFields: exportedFields(r), pagesDefinition: []}),
    externalIds: new Set(), updateExternal: true, sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false});
  const plan = set => planSync(set, {docs: docs.filter(d => !d.deleted && d.getFlag(M, 'source')?.sourceId).map(d => makeSnapshot(d, ctx())), characterCount: 0, unflaggedNames: nameIndex(docs.filter(d => !d.deleted))}, ctx());
  const adapter = set => ({async backup() {}, async replan() { return plan(set); }, async create() { throw new Error('no create here'); },
    docFor: row => docs.find(d => d.getFlag(M, 'source')?.sourceId === row.id), buildFlag: row => ({...sourceMetadata(row.record, {manifest: row.manifest}, []), managedFields: exportedFields(row.record), pagesDefinition: []}),
    async bindLinks() {}, apis: {}, async retire() {}, async saveLedger() {},
    ...(withUpdateDocuments ? {updateDocuments: async (name, updates) => { batches.push({name, updates: clone(updates)}); for (const u of updates) { const d = docs.find(x => x.id === u._id); await d.update(Object.fromEntries(Object.entries(u).filter(([k]) => k !== '_id'))); d.writes.pop(); } }} : {})});
  return {plan, adapter, batches, run: set => executeSync(plan(set), adapter(set), {user: GM, confirmation: SYNC_PHRASE})};
}
const setOf = records => buildSyncSet([{filename: 'PKG-MAIN.json', kind: 'manager', payload: {manifest: M1, records}}]);

test('Sync fills an EMPTY source label on unchanged Manager-imported Items, never overwrites one, in one batched write', async () => {
  const r1 = rec('MAT-A', 'Alpha'), r2 = rec('MAT-B', 'Beta'), r3 = rec('MAT-C', 'Gamma'), r4 = rec('MAT-D', 'Delta (changes)');
  const empty = flagged(r1, ''), none = flagged(r2), mine = flagged(r3, 'My label'), changing = flagged(rec('MAT-D', 'Delta'), '');
  const docs = [empty, none, mine, changing];
  const w = syncWorld(docs);
  const set = setOf([r1, r2, r3, r4]);
  const plan = w.plan(set);
  assert.deepEqual(plan.rows.filter(r => r.unchanged).map(r => r.id).sort(), ['MAT-A', 'MAT-B', 'MAT-C']);
  const out = await w.run(set);
  assert.equal(out.completed, true);
  assert.equal(empty.raw.system.source.custom, 'Ashen Gate'); assert.equal(none.raw.system.source.custom, 'Ashen Gate');
  assert.equal(mine.raw.system.source.custom, 'My label', 'a label that is there is never replaced');
  assert.equal(changing.raw.system.source.custom, 'Ashen Gate', 'the overwritten one gets it from the overwrite itself');
  const labelBatches = w.batches.filter(b => b.updates.some(u => 'system.source.custom' in u));
  assert.equal(labelBatches.length, 1, 'one batched write for the unchanged Items');
  assert.deepEqual(labelBatches[0].updates.map(u => u._id).sort(), [empty.id, none.id].sort(), 'no update for an Item that is already labelled');
  assert.deepEqual(labelBatches[0].updates.map(u => Object.keys(u).sort().join()).filter((v, i, a) => a.indexOf(v) === i), ['_id,system.source.custom']);
  assert.equal(out.counts.labelled, 2); assert.equal(mine.writes.length, 0);
  // A second run writes nothing for labels.
  const before = w.batches.filter(b => b.updates.some(u => 'system.source.custom' in u)).length;
  const second = await w.run(set);
  assert.equal(w.batches.filter(b => b.updates.some(u => 'system.source.custom' in u)).length, before); assert.equal(second.counts.labelled, 0);
});

test('Sync label fill: no updateDocuments on the adapter falls back to one update per lacking Item; a kept (edited) record is not touched', async () => {
  const r1 = rec('MAT-A', 'Alpha'), r2 = rec('MAT-B', 'Beta');
  const a = flagged(r1, ''), edited = flagged(r2, '');
  edited.raw.system.price.value = 99; // GM edit: kept, so not "unchanged"
  const w = syncWorld([a, edited], {withUpdateDocuments: false});
  const out = await w.run(setOf([r1, r2]));
  assert.equal(a.raw.system.source.custom, 'Ashen Gate'); assert.equal(a.writes.length, 1);
  assert.equal(edited.writes.length, 0); assert.equal(edited.raw.system.source.custom, '');
  assert.equal(out.counts.labelled, 1);
});

test('Sync label fill is described in the result line, Help, README and CHANGELOG', () => {
  const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../scripts/main.js'), /source label\$\{k\.labelled===1\?'':'s'\} set/);
  const log = read('../CHANGELOG.md');
  assert.match(log, /^## 0\.97\.0 /);
  assert.match(log, /Link only: this is an Ashen Gate crafted item/);
  assert.match(log, /Restore Ashen Gate text on linked crafted items/);
  assert.match(log, /Sync[^\n]*source label/i);
  assert.match(read('../README.md'), /Restore Ashen Gate text on linked crafted items/);
});
