import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata, replacingSourceFlag} from '../scripts/source-projection.mjs';

import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, buildSyncBackup} from '../scripts/sync-apply.js';
import {syncView} from '../scripts/sync-view.js';

const GM = {isGM: true}, PLAYER = {isGM: false};
const clone = v => structuredClone(v);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// Foundry expands dotted keys at every depth and merges objects on update; the stand-in does the same.
function expand(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const keys = k.split('.');
    let o = out;
    for (const part of keys.slice(0, -1)) o = o[part] ??= {};
    const last = keys.at(-1);
    o[last] = isObj(v) ? assign(o[last] ?? {}, expand(v)) : clone(v);
  }
  return out;
}
// expandObject keeps `-=key` entries for the later merge.
function assign(a, b) { for (const [k, v] of Object.entries(b)) a[k] = isObj(v) && isObj(a[k]) ? assign(a[k], v) : clone(v); return a; }
// Foundry's mergeObject also performs `-=key` deletions at every depth (what replacingSourceFlag relies on).
function merge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (k.startsWith('-=')) { delete a[k.slice(2)]; continue; }
    a[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : isObj(v) ? merge({}, v) : clone(v);
  }
  return a;
}

let ids = 0;
class Doc {
  constructor(documentName, raw, {parent = null} = {}) {
    this.documentName = documentName; this.raw = clone(raw); this.raw._id ??= `${documentName[0]}${++ids}`;
    this.parent = parent; this.deleted = false; this.writes = [];
    this.embedded = {};
  }
  get id() { return this.raw._id; }
  get uuid() { return `${this.documentName}.${this.id}`; }
  get name() { return this.raw.name; }
  get type() { return this.raw.type; }
  get folder() { return this.raw.folder ? {id: this.raw.folder} : null; }
  get hasPlayerOwner() { return Object.entries(this.raw.ownership ?? {}).some(([u, l]) => u !== 'default' && l >= 3); }
  getFlag(scope, key) { return clone(this.raw.flags?.[scope]?.[key]); }
  toObject() { return clone(this.raw); }
  async update(data) { this.writes.push(clone(data)); merge(this.raw, expand(data)); return this; }
  list(name) { return {Item: 'items', ActiveEffect: 'effects', JournalEntryPage: 'pages', TableResult: 'results'}[name]; }
  async createEmbeddedDocuments(name, list) { const key = this.list(name); this.writes.push({create: name, list: clone(list)}); (this.raw[key] ??= []).push(...list.map(x => ({...clone(x), _id: x._id ?? `e${++ids}`}))); }
  async updateEmbeddedDocuments(name, list) { const key = this.list(name); this.writes.push({update: name, list: clone(list)}); for (const u of list) merge(this.raw[key].find(x => x._id === u._id), expand(u)); }
  async deleteEmbeddedDocuments(name, del) { const key = this.list(name); this.writes.push({delete: name, ids: del}); this.raw[key] = this.raw[key].filter(x => !del.includes(x._id)); }
  async delete() { this.deleted = true; this.writes.push('delete'); }
}

const prov = {source: 'test'};
const rec = (id, document_type, data, over = {}) => ({id, entity_type: document_type === 'Actor' ? 'NPC' : 'Item', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov, foundry: {document_type, data}, ...over});
const item = (id, name, sys = {}) => rec(id, 'Item', {name, type: 'loot', system: {description: {value: `<p>${name}</p>`}, quantity: 1, price: {value: 5}, ...sys}});
const npc = (id, name, over = {}) => rec(id, 'Actor', {name, type: 'npc', img: 'icons/test/a.webp', prototypeToken: {disposition: -1, texture: {src: 'icons/test/a.webp'}},
  system: {abilities: {str: {value: 10}}, attributes: {ac: {flat: 12}, hp: {value: 20, max: 20, temp: 0}}, details: {biography: {value: '<p>bio</p>'}}},
  items: [{name: 'Claw', type: 'weapon', system: {description: {value: 'Claw'}, quantity: 1, uses: {spent: 0}}}], ...over}, {entity_type: 'NPC'});
const pkg = (packageId, version, records) => ({manifest: {schema_version: 'ag-foundry-import/0.1', package_id: packageId, version}, records});

/** A mock world plus the adapter main.js supplies, so the same planner and executor run as in Foundry. */
function makeWorld({docs = [], retired = [], ledger = {}, deleteUnscoped = false, overwriteEdited = true, includeDrafts = true, extra = {}} = {}) {
  const world = {docs: [...docs], retired: new Set(retired), ledger: clone(ledger), saved: [], downloads: [], tokens: new Set(), hotbar: new Set(), protectedFolders: new Set(), apis: {}};
  const sourceOf = (record, manifest, available = new Set()) => ({...sourceMetadata(record, {manifest}, record.refs ?? []), managedFields: exportedFields(record),
    pagesDefinition: record.foundry.document_type === 'JournalEntry' ? record.foundry.data.pages ?? [] : []});
  const ctx = () => ({includeDrafts, deleteUnscoped, overwriteEdited, retiredIds: world.retired, ledger: world.ledger, buildFlag: sourceOf, externalIds: new Set(),
    sceneActorIds: world.tokens, hotbarMacroIds: world.hotbar, isProtectedFolder: id => world.protectedFolders.has(id),
    locationIds: world.apis.locations ? new Set(world.apis.locations.listLocations().map(l => l.id)) : null,
    routeIds: world.apis.routes?.listRoutes ? new Set(world.apis.routes.listRoutes().map(r => r.id)) : null, specialistApi: kind => world.apis.specialist?.[kind] ?? null, ...extra});
  const snapshot = () => ({docs: world.docs.filter(d => !d.deleted && d.getFlag(MODULE_ID, 'source')?.sourceId).map(d => makeSnapshot(d, ctx())),
    characterCount: world.docs.filter(d => d.type === 'character').length, unflaggedNames: nameIndex(world.docs.filter(d => !d.deleted))});
  world.plan = set => planSync(set, snapshot(), ctx());
  world.adapter = (set, over = {}) => ({
    async backup(plan) { world.downloads.push(buildSyncBackup(plan)); },
    async replan() { return world.plan(set); },
    async create(row) { const raw = clone(row.record.foundry.data); raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: sourceOf(row.record, row.manifest)}}; const d = new Doc(row.record.foundry.document_type, raw); world.docs.push(d); return d; },
    docFor: row => world.docs.find(d => !d.deleted && d.getFlag(MODULE_ID, 'source')?.sourceId === row.id),
    buildFlag: row => sourceOf(row.record, row.manifest),
    async bindLinks() {},
    apis: world.apis,
    async retire(list) { for (const id of list) world.retired.add(id); },
    async saveLedger(entries) { for (const e of entries) (world.ledger[e.key] ??= {})[e.id] = e.info; },
    ...over
  });
  world.run = (set, opts = {}, adapterOver = {}) => executeSync(world.plan(set), world.adapter(set, adapterOver), {user: GM, confirmation: SYNC_PHRASE, ...opts});
  return world;
}
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set1 = (records, id = 'PKG-MAIN', version = '2.0.0') => buildSyncSet([{filename: `${id}.json`, kind: 'manager', payload: pkg(id, version, records)}]);
import {recreateItem, RECREATE_SKIP_SCOPES} from '../scripts/sync-apply.js';

const flagged = (record, manifest, over = {}) => {
  const raw = clone(record.foundry.data);
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: {...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record), pagesDefinition: [], ...over}}};
  return new Doc(record.foundry.document_type, raw);
};
const flaggedItem = (record, over = {}, extra = {}) => { const d = flagged(record, M1, over); Object.assign(d.raw, extra); return d; };
const gear = (id, type, name = id) => ({id, entity_type: 'Item', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov,
  foundry: {document_type: 'Item', data: {name, type, system: {description: {value: `<p>${name}</p>`}}}}});
const PAIRS = [['loot', 'equipment'], ['loot', 'consumable'], ['equipment', 'consumable'], ['consumable', 'equipment']];
const oldDocs = () => PAIRS.map(([from], i) => { const rec = gear(`ITEM-TEST-${i}`, from); const d = flaggedItem(rec, {}, {folder: 'F1'}); d.raw.flags['ashen-gate-profession-ledger'] = {note: `ledger ${i}`}; d.raw.flags.dnd5e = {junk: 1}; d.raw.flags.core = {sourceId: 'x'}; return d; });
const newRecs = () => PAIRS.map(([, to], i) => gear(`ITEM-TEST-${i}`, to));

test('off by default: the four type changes stay refused, each with the hint', () => {
  const plan = makeWorld({docs: oldDocs()}).plan(set1(newRecs()));
  assert.equal(plan.counts.refused, 4); assert.equal(plan.counts.recreate ?? 0, 0);
  for (const r of plan.rows) { assert.equal(r.refused, true); assert.match(r.reason, /Sync does not change an Item's type\. Tick "Also recreate Items whose type changed" to replace them\./); }
});

test('ticked: each becomes a Recreate row with old type -> new type, counted, labelled, and in the backup with its full raw document', () => {
  const world = makeWorld({docs: oldDocs(), extra: {recreateTypeChange: true}});
  const plan = world.plan(set1(newRecs()));
  assert.equal(plan.counts.recreate, 4); assert.equal(plan.counts.refused, 0); assert.equal(plan.records, 4);
  assert.deepEqual(plan.rows.map(r => `${r.recreate.from}>${r.recreate.to}`).sort(), PAIRS.map(([a, b]) => `${a}>${b}`).sort());
  assert.equal(plan.buttonLabel, 'Recreate 4 Items'); assert.equal(plan.destructive, true);
  const backup = buildSyncBackup(plan);
  assert.equal(backup.documents.length, 4);
  assert.ok(backup.documents.every(d => d.sync_action === 'recreate' && d.raw.flags[MODULE_ID].source.sourceId && d.raw.flags['ashen-gate-profession-ledger']));
  const html = syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, recreateTypeChange: true, isGM: true, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', shown: {}});
  assert.match(html, /<span class="ag-fold__title">Recreate<\/span><span class="ag-fold__count">4</); assert.match(html, /loot → equipment/); assert.match(html, /data-ag-sync-recreate checked/);
});

test('run: swap, not retire. Same folder, other modules\' flags copied, Manager flag rebuilt, old deleted, next preview Already matches and nothing is refused', async () => {
  const docs = oldDocs();
  const world = makeWorld({docs: [...docs], extra: {recreateTypeChange: true}});
  const set = set1(newRecs());
  const out = await world.run(set);
  assert.equal(out.counts.failed, 0); assert.equal(out.counts.recreated, 4);
  assert.ok(docs.every(d => d.deleted), 'old documents deleted');
  const live = world.docs.filter(d => !d.deleted);
  assert.equal(live.length, 4);
  for (const [i, d] of live.entries()) {
    assert.equal(d.raw.type, PAIRS[i][1]); assert.equal(d.raw.folder, 'F1');
    assert.deepEqual(d.raw.flags['ashen-gate-profession-ledger'], {note: `ledger ${i}`}, 'other module flags copied');
    assert.ok(!d.raw.flags.dnd5e && !d.raw.flags.core, 'system and core flags are not copied');
    assert.equal(d.raw.flags[MODULE_ID].source.sourceId, `ITEM-TEST-${i}`);
  }
  assert.deepEqual([...world.retired], [], 'the id is not retired');
  const again = world.plan(set);
  assert.equal(again.counts.refused, 0); assert.ok(again.rows.every(r => r.unchanged), JSON.stringify(again.rows.map(r => [r.group, r.reason])));
  const second = await world.run(set1(newRecs()));
  assert.equal(second.counts.recreated, 0); assert.equal(world.docs.filter(d => !d.deleted).length, 4, 'idempotent');
  assert.deepEqual(RECREATE_SKIP_SCOPES, [MODULE_ID, 'core', 'dnd5e']);
});

test('a failed create leaves the old Item in place and is reported', async () => {
  const docs = oldDocs(); const world = makeWorld({docs: [...docs], extra: {recreateTypeChange: true}});
  const set = set1(newRecs());
  const out = await world.run(set, {}, {async create() { throw new Error('Foundry said no'); }});
  assert.equal(out.counts.failed, 4); assert.ok(docs.every(d => !d.deleted));
  assert.match(out.log.find(l => l.action === 'recreate').message, /Foundry said no/);
});

test('a failed flag copy removes the new Item again and keeps the old one', async () => {
  const [oldDoc] = oldDocs(); const made = [];
  const adapter = {async create() { const d = new Doc('Item', {name: 'n', type: 'equipment', flags: {[MODULE_ID]: {source: {sourceId: 'ITEM-TEST-0'}}}}); d.update = async () => { throw new Error('flag write failed'); }; made.push(d); return d; }};
  await assert.rejects(recreateItem(oldDoc, {id: 'ITEM-TEST-0', name: 'n'}, {user: GM, adapter}), /flag write failed/);
  assert.equal(made[0].deleted, true); assert.equal(oldDoc.deleted, false);
});

test('if the old Item cannot be deleted after the create, the error says so', async () => {
  const [oldDoc] = oldDocs(); oldDoc.delete = async () => { throw new Error('locked'); };
  const adapter = {async create() { return new Doc('Item', {name: 'n', type: 'equipment', flags: {}}); }};
  await assert.rejects(recreateItem(oldDoc, {id: 'ITEM-TEST-0', name: 'n'}, {user: GM, adapter}), /new Item was created but the old one could not be deleted/);
});

test('GM only in the data layer, art the GM set is kept, two documents with one id stay refused', async () => {
  const [oldDoc] = oldDocs(); oldDoc.raw.img = 'my/art.webp';
  const adapter = {async create() { return new Doc('Item', {name: 'n', type: 'equipment', img: 'pkg/art.webp', flags: {}}); }};
  await assert.rejects(recreateItem(oldDoc, {id: 'ITEM-TEST-0', name: 'n'}, {user: PLAYER, adapter}), /Only a GM/);
  const kept = await recreateItem(oldDoc, {id: 'ITEM-TEST-0', name: 'n'}, {user: GM, adapter});
  assert.equal(kept.raw.img, 'my/art.webp');
  const a = oldDocs()[0], b = oldDocs()[0];
  const plan = makeWorld({docs: [a, b], extra: {recreateTypeChange: true}}).plan(set1([newRecs()[0]]));
  assert.match(plan.rows[0].reason, /2 world documents share this id/); assert.equal(plan.counts.recreate ?? 0, 0);
});

test('version and wiring', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /data-ag-sync-recreate/); assert.match(main, /recreateTypeChange:Boolean\(this\.sync\.recreateTypeChange/);
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.73.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.73.0/ashen-gate-manager.zip'));
});
