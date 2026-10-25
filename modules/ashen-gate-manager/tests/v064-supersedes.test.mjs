import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {itemKeys, ITEM_FLAG, ACTOR_ITEMS_FLAG} from '../scripts/actor-update.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE} from '../scripts/sync.js';
import {validatePackage, SOURCE_ID_PATTERN} from '../scripts/core.js';
import {supersedesOf, supersedeMap, offerFor, rewriteRefs, collectSpecialistSupersedes} from '../scripts/supersedes.js';
import {previewPartners, applyPartners, renameManagerRefs, partnerApis} from '../scripts/supersede-run.js';
import {checkContractGraph} from '../scripts/contract.js';
import {executeSync, writeRebind, buildSyncBackup} from '../scripts/sync-apply.js';

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
    o[last] = isObj(v) ? merge(o[last] ?? {}, expand(v)) : clone(v);
  }
  return out;
}
function merge(a, b) { for (const [k, v] of Object.entries(b)) a[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : clone(v); return a; }

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
const flagged = (record, manifest, over = {}) => {
  const raw = clone(record.foundry.data);
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: {...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record), pagesDefinition: [], ...over}}};
  return new Doc(record.foundry.document_type, raw);
};
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set1 = (records, id = 'PKG-MAIN', version = '2.0.0') => buildSyncSet([{filename: `${id}.json`, kind: 'manager', payload: pkg(id, version, records)}]);
const sorted = rows => rows.map(r => r.id).sort();

// ---------- synthetic fixtures: NPC-TEST-OLD -> NPC-TEST-NEW ----------
const sup = (record, ...olds) => ({...record, supersedes: olds});
const oldNpc = () => npc('NPC-TEST-OLD', '[TEST] Old Person');
const newNpc = () => sup(npc('NPC-TEST-NEW', '[TEST] New Person', {system: {abilities: {str: {value: 12}}, attributes: {ac: {flat: 13}, hp: {value: 22, max: 22, temp: 0}}, details: {biography: {value: '<p>new bio</p>'}}}}), 'NPC-TEST-OLD');
const sameLine = records => set1(records, 'PKG-MAIN', '2.0.0');
function worldWithOldNpc(opts = {}) {
  const doc = flagged(oldNpc(), M1);
  doc.raw.folder = 'FOLDER1'; doc.raw.ownership = {default: 2, USERPLAYER: 3};
  doc.raw.system.attributes.hp.value = 5;
  doc.raw.items.push({_id: 'gm-item', name: 'GM Added Charm', type: 'loot', system: {}});
  return {doc, world: makeWorld({docs: [doc], ...opts})};
}

test('validation: supersedes must be a well-formed, unique, non-self, non-present array (both schema versions)', () => {
  const base = (schema, mods) => ({manifest: {schema_version: schema, package_id: 'PKG-MAIN', version: '1.0.0'}, records: mods.map(r => ({...r, provenance: {sources: ['test']}}))});
  for (const schema of ['ag-foundry-import/0.1', 'ag-foundry-import/0.2']) {
    const ok = base(schema, [sup(npc('NPC-TEST-NEW', 'N'), 'NPC-TEST-OLD')]);
    assert.deepEqual(validatePackage(ok, new Set()), [], schema);
    const errs = records => validatePackage(base(schema, records), new Set()).join('\n');
    assert.match(errs([{...npc('NPC-TEST-NEW', 'N'), supersedes: 'NPC-TEST-OLD'}]), /must be an array/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'))]), /must not be empty/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'), 'bad id')]), /invalid permanent ID/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'), 'NPC-TEST-NEW')]), /cannot supersede its own id/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'), 'NPC-TEST-OLD', 'NPC-TEST-OLD')]), /listed twice/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'), 'NPC-TEST-OLD'), sup(npc('NPC-TEST-NEW2', 'N2'), 'NPC-TEST-OLD')]), /also claimed by NPC-TEST-NEW/);
    assert.match(errs([sup(npc('NPC-TEST-NEW', 'N'), 'NPC-TEST-OLD'), npc('NPC-TEST-OLD', 'O')]), /still a record in this package/);
  }
});

test('references that still use a superseded id resolve to the new record, with a note', () => {
  const records = [sup({...npc('NPC-TEST-NEW', 'N'), refs: []}, 'NPC-TEST-OLD'), {...item('MAT-TEST', 'M'), refs: [{relation: 'given_by', target_id: 'NPC-TEST-OLD', mode: 'required'}]}];
  const bare = checkContractGraph(records, new Map());
  assert.match(bare.errors.join(), /unresolved required reference NPC-TEST-OLD/);
  const withAlias = checkContractGraph(records, new Map(), null, supersedeMap(records));
  assert.deepEqual(withAlias.errors, []);
  assert.match(withAlias.warnings.join(), /superseded by NPC-TEST-NEW/);
});

test('rebind keeps the same world document, ownership and folder, and moves it to the new id', async () => {
  const { doc, world } = worldWithOldNpc();
  const docId = doc.id;
  const set = sameLine([newNpc()]);
  const plan = world.plan(set);
  assert.equal(plan.ok, true);
  assert.equal(plan.counts.rebind, 1); assert.equal(plan.counts.create, 0); assert.equal(plan.counts.delete, 0);
  assert.equal(plan.offers[0].oldName, '[TEST] Old Person');
  assert.match(plan.rows.find(r => r.group === 'rebind').reason, /Replaces \[TEST\] Old Person/);
  const calls = [];
  const out = await world.run(set, {}, {async afterRebind(map, rows) { calls.push(map); return []; }});
  assert.equal(out.completed, true);
  assert.equal(out.counts.rebound, 1);
  assert.deepEqual(calls, [{'NPC-TEST-OLD': 'NPC-TEST-NEW'}]);
  assert.equal(world.docs.length, 1, 'no second document');
  assert.equal(world.docs[0].id, docId);
  const raw = doc.toObject();
  assert.equal(raw.name, '[TEST] New Person');
  assert.equal(raw.flags[MODULE_ID].source.sourceId, 'NPC-TEST-NEW');
  assert.deepEqual(raw.flags[MODULE_ID].supersededFrom, ['NPC-TEST-OLD']);
  assert.equal(raw.folder, 'FOLDER1'); assert.deepEqual(raw.ownership, {default: 2, USERPLAYER: 3});
  assert.equal(raw.system.attributes.hp.value, 5, 'current HP is play state');
  assert.equal(raw.system.details.biography.value, '<p>new bio</p>', 'the biography follows the new record');
  assert.ok(raw.items.some(i => i.name === 'GM Added Charm'), 'items the GM added stay');
  assert.equal(world.downloads.length, 1);
  assert.ok(world.downloads[0].documents.some(d => d.source_id === 'NPC-TEST-NEW' && d.sync_action === 'rebind'), 'the backup holds the old data');
});

test('rebind is idempotent: running the same files again changes nothing and never deletes', async () => {
  const { doc, world } = worldWithOldNpc({ deleteUnscoped: true });
  const set = sameLine([newNpc()]);
  await world.run(set);
  const before = JSON.stringify(doc.toObject());
  const again = world.plan(set);
  assert.deepEqual(again.offers, []); assert.equal(again.counts.rebind, 0); assert.equal(again.counts.delete, 0);
  const out = await world.run(set);
  assert.equal(out.counts.rebound, 0); assert.equal(out.counts.deleted, 0);
  assert.equal(JSON.stringify(doc.toObject()), before);
  assert.equal(doc.deleted, false);
});

test('sync never deletes the old document while its id is superseded, whatever the choice', async () => {
  for (const choice of ['no', 'skip']) {
    const { doc, world } = worldWithOldNpc({ deleteUnscoped: true });
    const set = sameLine([newNpc(), item('MAT-TEST', 'Other')]);
    world.docs.length; // eslint
    const ctxChoices = { supersedeChoices: { 'NPC-TEST-NEW': choice } };
    const w2 = makeWorld({ docs: [doc], deleteUnscoped: true, extra: ctxChoices });
    const plan = w2.plan(set);
    assert.equal(plan.counts.delete, 0, choice);
    assert.equal(plan.counts.rebind, 0);
    assert.ok(plan.rows.some(r => r.id === 'NPC-TEST-OLD' && /supersedes it/.test(r.reason)), choice);
    assert.equal(plan.counts.create, choice === 'no' ? 2 : 1, choice);
    await w2.run(set);
    assert.equal(doc.deleted, false);
    assert.equal(doc.getFlag(MODULE_ID, 'source').sourceId, 'NPC-TEST-OLD');
  }
});

test('data-layer guard: the executor refuses to delete a superseded id even from a forged plan', async () => {
  const { doc, world } = worldWithOldNpc();
  const set = sameLine([newNpc()]);
  const plan = world.plan(set);
  plan.rows = [{group: 'delete', key: 'x', id: 'NPC-TEST-OLD', name: 'o', kind: 'Actor', snap: makeSnapshot(doc), changes: [], lost: 0}];
  plan.fingerprint = world.plan(set).fingerprint; // the forged rows do not matter to the replan check
  const adapter = world.adapter(set, {async replan() { return plan; }});
  const out = await executeSync(plan, adapter, {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(doc.deleted, false);
  assert.ok(out.log.some(l => l.action === 'delete' && l.status === 'error' && /superseded/.test(l.message)));
});

test('a fresh world imports the new record normally; a new id that already exists gets no special handling', () => {
  const fresh = makeWorld({});
  const p1 = fresh.plan(sameLine([newNpc()]));
  assert.equal(p1.counts.create, 1); assert.equal(p1.counts.rebind, 0); assert.deepEqual(p1.offers, []);
  const bothDocs = makeWorld({docs: [flagged(oldNpc(), M1), flagged(newNpc(), M1)], overwriteEdited: true});
  const p2 = bothDocs.plan(sameLine([newNpc()]));
  assert.deepEqual(p2.offers, []); assert.equal(p2.counts.rebind, 0);
  assert.equal(p2.counts.delete, 0, 'the old document is held, not deleted');
});

test('rebind refuses wrong types, characters and archived documents', () => {
  const chars = flagged(oldNpc(), M1); chars.raw.type = 'character';
  const w1 = makeWorld({docs: [chars]});
  assert.equal(w1.plan(sameLine([newNpc()])).counts.rebind, 0);
  assert.match(w1.plan(sameLine([newNpc()])).offers[0].reason, /Character sheets/);
  const archived = flagged(oldNpc(), M1); archived.raw.flags[MODULE_ID].lifecycle = {archived: true};
  assert.match(makeWorld({docs: [archived]}).plan(sameLine([newNpc()])).offers[0].reason, /archived/);
  const asItem = flagged(item('NPC-TEST-OLD', 'Weird'), M1);
  assert.match(makeWorld({docs: [asItem]}).plan(sameLine([newNpc()])).offers[0].reason, /not a Actor/);
});

test('journal handouts and items rebind in place too (GM pages stay)', async () => {
  const journal = id => ({id, entity_type: 'Handout', status: 'approved', version: '1', visibility: 'player', refs: [], provenance: prov,
    foundry: {document_type: 'JournalEntry', data: {name: id === 'HANDOUT-TEST-NEW' ? '[TEST] New Handout' : '[TEST] Old Handout', pages: [{name: 'Page', type: 'text', text: {content: id === 'HANDOUT-TEST-NEW' ? '<p>new</p>' : '<p>old</p>'}}]}}});
  const oldJ = flagged(journal('HANDOUT-TEST-OLD'), M1, {pagesDefinition: journal('HANDOUT-TEST-OLD').foundry.data.pages});
  oldJ.raw.pages = [{_id: 'p1', name: 'Page', type: 'text', text: {content: '<p>old</p>'}}, {_id: 'p2', name: 'GM Page', type: 'text', text: {content: 'mine'}}];
  const oldI = flagged(item('ITEM-TEST-OLD', '[TEST] Old Item'), M1);
  const world = makeWorld({docs: [oldJ, oldI]});
  const set = sameLine([sup(journal('HANDOUT-TEST-NEW'), 'HANDOUT-TEST-OLD'), sup(item('ITEM-TEST-NEW', '[TEST] New Item'), 'ITEM-TEST-OLD')]);
  const out = await world.run(set);
  assert.equal(out.counts.rebound, 2); assert.equal(out.completed, true);
  assert.equal(oldJ.raw.name, '[TEST] New Handout');
  assert.equal(oldJ.raw.pages.find(p => p._id === 'p1').text.content, '<p>new</p>');
  assert.ok(oldJ.raw.pages.some(p => p.name === 'GM Page'));
  assert.equal(oldI.raw.name, '[TEST] New Item');
  assert.equal(oldI.getFlag(MODULE_ID, 'source').sourceId, 'ITEM-TEST-NEW');
});

test('an already-on token ring is kept; the prototype token name follows the new name', () => {
  const { doc, world } = worldWithOldNpc();
  doc.raw.prototypeToken = {name: '[TEST] Old Person', ring: {enabled: true, colors: {ring: '#123456'}}, texture: {src: 'icons/test/a.webp'}};
  const rec = newNpc(); rec.foundry.data.prototypeToken = {disposition: -1, ring: {enabled: false, colors: {ring: '#ffffff'}}, texture: {src: 'icons/test/b.webp'}};
  const row = world.plan(sameLine([rec])).rows.find(r => r.group === 'rebind');
  assert.equal(Object.keys(row.ops.fields).some(k => k.startsWith('prototypeToken.ring')), false);
  assert.equal(row.ops.fields['prototypeToken.texture.src'], 'icons/test/b.webp');
  assert.equal(row.ops.fields['prototypeToken.name'], '[TEST] New Person');
});

test('writeRebind is GM only and only for the document bound to the old id', async () => {
  const { doc, world } = worldWithOldNpc();
  const set = sameLine([newNpc()]);
  const row = world.plan(set).rows.find(r => r.group === 'rebind');
  const flag = world.adapter(set).buildFlag(row);
  await assert.rejects(() => writeRebind(doc, row, {user: PLAYER, flag}), /Only a GM/);
  await assert.rejects(() => writeRebind(doc, {...row, supersedes: {oldId: 'NPC-TEST-OTHER'}}, {user: GM, flag}), /bound to NPC-TEST-OLD/);
  await assert.rejects(() => writeRebind(doc, row, {user: GM, flag: {...flag, sourceId: 'NPC-OTHER'}}), /names NPC-OTHER/);
  assert.equal(doc.getFlag(MODULE_ID, 'source').sourceId, 'NPC-TEST-OLD', 'nothing was written');
  await assert.rejects(() => executeSync(world.plan(set), world.adapter(set), {user: PLAYER, confirmation: SYNC_PHRASE}), /Only a GM/);
});

test('supersedes is stored with the record text and a failing rebind leaves the document on the old id', async () => {
  const { doc, world } = worldWithOldNpc();
  const set = sameLine([newNpc()]);
  const out = await world.run(set, {}, {buildFlag() { throw new Error('boom'); }});
  assert.equal(out.counts.failed, 1);
  assert.equal(doc.getFlag(MODULE_ID, 'source').sourceId, 'NPC-TEST-OLD');
  const again = await world.run(set);
  assert.equal(again.counts.rebound, 1, 'the same preview finishes the job');
});

// ---------- other modules ----------
const partnerGame = (apis, active = true) => ({modules: { get: id => apis[id] ? {active, api: apis[id]} : undefined }});
const mockApi = (seen, changed = 2) => ({async supersedeIds(map, opts = {}) { seen.push({map, opts}); return {changed, notes: []}; }});

test('partners: dry run first, GM only, feature-detected, failures reported not thrown', async () => {
  const seen = [];
  const game = partnerGame({'ashen-gate-factions': mockApi(seen), 'ashen-gate-quest-manager': {listQuests() {}} /* too old: no supersedeIds */});
  assert.deepEqual(partnerApis(game).map(p => p.id), ['ashen-gate-factions']);
  const map = {'NPC-TEST-OLD': 'NPC-TEST-NEW'};
  const preview = await previewPartners(game, map);
  assert.deepEqual(preview.map(p => [p.id, p.changes]), [['ashen-gate-factions', 2]]);
  assert.equal(seen[0].opts.dryRun, true);
  await assert.rejects(() => applyPartners(game, map, {user: PLAYER}), /Only a GM/);
  const log = await applyPartners(game, map, {user: GM});
  assert.equal(log[0].status, 'ok'); assert.equal(seen[1].opts.dryRun, undefined);
  const failing = partnerGame({'ashen-gate-factions': {async supersedeIds() { throw new Error('nope'); }}});
  assert.equal((await applyPartners(failing, map, {user: GM}))[0].status, 'error');
  // Absent or inactive partners: nothing happens, nothing throws.
  assert.deepEqual(await applyPartners(partnerGame({}), map, {user: GM}), []);
  assert.deepEqual(await applyPartners(partnerGame({'ashen-gate-factions': mockApi([])}, false), map, {user: GM}), []);
  assert.deepEqual(await applyPartners(game, {}, {user: GM}), []);
});

test('the sync run calls the partner step after the rebinds, once, with the old-to-new map', async () => {
  const { world } = worldWithOldNpc();
  const seen = [];
  const game = partnerGame({'ashen-gate-factions': mockApi(seen)});
  const set = sameLine([newNpc()]);
  await world.run(set, {}, {afterRebind: (map) => applyPartners(game, map, {user: GM})});
  assert.deepEqual(seen.map(s => s.map), [{'NPC-TEST-OLD': 'NPC-TEST-NEW'}]);
});

test('Manager moves its own refs and Codex links, idempotently', async () => {
  const mk = (flags) => { const d = new Doc('Actor', {name: 'x', type: 'npc', flags: {[MODULE_ID]: flags}}); return d; };
  const a = mk({source: {sourceId: 'NPC-A', refs: [{relation: 'knows', target_id: 'NPC-TEST-OLD', mode: 'optional'}, 'NPC-Z']}, codex: {links: ['NPC-TEST-OLD', 'NPC-TEST-NEW', 'LOC-X']}});
  const b = mk({source: {sourceId: 'NPC-B', refs: []}});
  const map = {'NPC-TEST-OLD': 'NPC-TEST-NEW'};
  await assert.rejects(() => renameManagerRefs([a, b], map, {user: PLAYER}), /Only a GM/);
  assert.deepEqual(await renameManagerRefs([a, b], map, {user: GM, dryRun: true}), {changed: 1});
  assert.equal(a.writes.length, 0);
  assert.deepEqual(await renameManagerRefs([a, b], map, {user: GM}), {changed: 1});
  assert.deepEqual(a.raw.flags[MODULE_ID].codex.links, ['NPC-TEST-NEW', 'LOC-X'], 'collapsed duplicates keep one');
  assert.equal(a.raw.flags[MODULE_ID].source.refs[0].target_id, 'NPC-TEST-NEW');
  assert.deepEqual(await renameManagerRefs([a, b], map, {user: GM}), {changed: 0});
  assert.deepEqual(rewriteRefs(['A'], {}).value, ['A']);
});

test('specialist files: supersedes on a Renown faction and its entries is collected', () => {
  const payload = {schema_version: 'ag-factions-source-export/0.4', definitions: [
    {id: 'FACTION-TEST-NEW', supersedes: ['FACTION-TEST-OLD'], entries: [{id: 'entry-new', supersedes: ['entry-old']}, {id: 'entry-plain'}]},
    {id: 'FACTION-TEST-OTHER', entries: [{id: 'e1'}]}]};
  const s = collectSpecialistSupersedes('factions', payload);
  assert.deepEqual(s.map, {'FACTION-TEST-OLD': 'FACTION-TEST-NEW', 'entry-old': 'entry-new'});
  assert.equal(s.definitions.length, 1);
  assert.deepEqual(collectSpecialistSupersedes('quests', {records: []}).items, []);
  const set = buildSyncSet([{filename: 'f.json', kind: 'factions', payload}]);
  const plan = planSync(set, {docs: [], characterCount: 0}, {specialistApi: () => null, supersedePreview: () => 0});
  assert.equal(plan.specialistSupersedes[0].items.length, 2);
  assert.equal(plan.counts.supersedeFiles, 0, 'nothing pending: already moved');
});

test('wiring: Yes/No/Skip rows, GM-only data-layer calls, no rewrite before Apply', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /data-ag-sync-supersede/);
  assert.match(main, /data-ag-supersede/);
  assert.match(main, /writeRebind\(doc,\{id:row\.id/);
  const view = readFileSync(new URL('../scripts/sync-view.js', import.meta.url), 'utf8');
  assert.match(view, /Yes, replace it/); assert.match(view, /Skip for now/);
});
