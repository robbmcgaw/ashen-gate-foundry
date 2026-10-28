import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata, replacingSourceFlag} from '../scripts/source-projection.mjs';

import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, phraseRequired, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, writeRename, buildSyncBackup} from '../scripts/sync-apply.js';
import {syncView} from '../scripts/sync-view.js';
import {archiveFolderName, partnerArchiveApi, applyPartnerArchive, hardTargets, ARCHIVE_EXPLAIN, writeArchive, writeRestore, archiveUpdate} from '../scripts/sync-archive.js';
import {BASELINE_FLAG} from '../scripts/release.js';
import {planLifecycle} from '../scripts/workflows.js';

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
  get ownership() { return this.raw.ownership ?? {}; }
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
    routeIds: world.apis.routes?.listRoutes ? new Set(world.apis.routes.listRoutes().map(r => r.id)) : null, specialistApi: kind => world.apis.specialist?.[kind] ?? null, partnerArchive: kind => Boolean(world.partner?.[kind]), ...extra});
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
    archiveFolder: async documentName => ({id: `ARCH-${archiveFolderName(documentName)}`}),
    restoreFolder: async (doc, lc) => lc?.previousFolderId ?? null,
    partnerApi: kind => world.partner?.[kind] ?? null,
    ...over
  });
  world.run = (set, opts = {}, adapterOver = {}) => executeSync(world.plan(set), world.adapter(set, adapterOver), {user: GM, confirmation: SYNC_PHRASE, ...opts});
  return world;
}

import {itemKeys, ITEM_FLAG, ACTOR_ITEMS_FLAG} from '../scripts/actor-update.js';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set1 = (records, id = 'PKG-MAIN', version = '2.0.0') => buildSyncSet([{filename: `${id}.json`, kind: 'manager', payload: pkg(id, version, records)}]);
const flagged = (record, manifest = M1, over = {}) => {
  const raw = clone(record.foundry.data);
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: {...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record), pagesDefinition: record.foundry.document_type === 'JournalEntry' ? record.foundry.data.pages ?? [] : [], ...over}}};
  return new Doc(record.foundry.document_type, raw);
};
const page = (text = '<p>x</p>') => [{name: 'P1', type: 'text', text: {content: text, format: 1}}];
const jr = (id, name, text) => rec(id, 'JournalEntry', {name, pages: page(text)}, {entity_type: 'Journal'});
const tbl = (id, name) => rec(id, 'RollTable', {name, formula: '1d6', results: [{type: 'text', description: 'a', range: [1, 6], weight: 1}]}, {entity_type: 'Table'});
const mac = (id, name) => rec(id, 'Macro', {name, type: 'chat', command: 'ui.notifications.info(1)'}, {entity_type: 'Macro'});
/** An NPC world document with marked embedded items (as an earlier sync or import leaves it). */
const npcDoc = (record, extra = {}) => {
  const d = flagged(record);
  const keys = itemKeys(record.foundry.data.items ?? []);
  d.raw.items = (record.foundry.data.items ?? []).map((it, i) => ({_id: `i${i}`, ...clone(it), flags: {[MODULE_ID]: {[ITEM_FLAG]: keys[i]}}}));
  d.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG] = {version: 1};
  Object.assign(d.raw, extra);
  return d;
};
const phraseless = {confirmation: ''};

const reserve = (id, name, over = {}) => ({...item(id, name), ...over});
const archived = d => Boolean(d.getFlag(MODULE_ID, 'lifecycle')?.archived);
const KEEP = ['MAT-KEEP', 'Kept Rope'];
const mk = () => ({
  core: item('MAT-CORE', 'Core Rope'),
  res: item('MAT-RES', 'Reserve Lantern'),
  res2: jr('JRN-RES', 'Reserve Journal', '<p>r</p>'),
  tbl: tbl('TBL-RES', 'Reserve Table'),
  mac: mac('MAC-RES', 'Reserve Macro'),
  npc: npc('NPC-RES', 'Reserve Ogre')
});
const docsFor = r => [flagged(r.core), flagged(r.res), flagged(r.res2), flagged(r.tbl), flagged(r.mac), npcDoc(r.npc)];
const archiveWorld = (extra = {}, over = {}) => { const r = mk(); const docs = docsFor(r); return {r, docs, world: makeWorld({docs, overwriteEdited: false, extra: {archiveMissing: true, ...extra}, ...over})}; };
const coreOnly = r => set1([r.core]);

// ---------------------------------------------------------------- the Archive group

test('Archive group: managed documents whose id is not in the ticked pack, every type, with names and per-type counts', () => {
  const {r, world} = archiveWorld();
  const plan = world.plan(coreOnly(r));
  const rows = plan.rows.filter(x => x.group === 'archive');
  assert.deepEqual(rows.map(x => x.id).sort(), ['JRN-RES', 'MAC-RES', 'MAT-RES', 'NPC-RES', 'TBL-RES']);
  assert.equal(plan.counts.archive, 5); assert.equal(plan.counts.delete, 0);
  assert.deepEqual(plan.archive.byKind, {Item: 1, JournalEntry: 1, RollTable: 1, Macro: 1, Actor: 1});
  assert.deepEqual(plan.archive.byLine, {'PKG-MAIN': 5});
  assert.ok(rows.every(x => x.name && x.line === 'PKG-MAIN'));
  assert.equal(plan.destructive, false); assert.equal(phraseRequired(plan), true);
  assert.match(plan.buttonLabel, /archive 5 records/i);
  assert.equal(plan.archiveMissing, true);
});

test('switch off: the plan is exactly the old one (Delete rows, no Archive rows)', () => {
  const {r, world} = archiveWorld({archiveMissing: false});
  const plan = world.plan(coreOnly(r));
  assert.equal(plan.counts.archive, 0); assert.equal(plan.counts.delete, 5);
  assert.equal(plan.rows.filter(x => x.group === 'archive').length, 0);
  assert.equal(plan.archiveMissing, false);
  assert.equal(plan.destructive, true);
});

test('switch on replaces Delete: a record the files dropped is archived, not deleted, and its id is not retired', async () => {
  const {r, docs, world} = archiveWorld();
  const out = await world.run(coreOnly(r));
  assert.equal(out.completed, true, JSON.stringify(out.log.filter(x => x.status !== 'ok')));
  assert.equal(out.counts.archived, 5); assert.equal(out.counts.deleted, 0);
  assert.equal(world.retired.size, 0);
  for (const d of docs.slice(1)) { assert.equal(archived(d), true); assert.equal(d.deleted, false); assert.equal(d.getFlag(MODULE_ID, 'lifecycle').archivedBy, 'sync'); }
  assert.equal(archived(docs[0]), false);
  assert.equal(docs[1].raw.folder, `ARCH-${archiveFolderName('Item')}`);
  assert.equal(world.downloads.length, 1);
});

test('hidden from players: default ownership drops to None (baseline too) and the previous default is remembered', async () => {
  const {r, docs, world} = archiveWorld();
  docs[1].raw.ownership = {default: 2, u1: 3}; docs[1].raw.folder = 'F-OLD';
  await world.run(coreOnly(r));
  assert.equal(docs[1].raw.ownership.default, 0); assert.equal(docs[1].raw.ownership.u1, 3);
  assert.equal(docs[1].raw.flags[MODULE_ID][BASELINE_FLAG], 0);
  assert.equal(docs[1].getFlag(MODULE_ID, 'lifecycle').previousOwnershipDefault, 2);
  assert.equal(docs[1].getFlag(MODULE_ID, 'lifecycle').previousFolderId, 'F-OLD');
});

test('idempotent: a second preview after the run has no archive rows, and running again writes nothing', async () => {
  const {r, docs, world} = archiveWorld();
  await world.run(coreOnly(r));
  const writes = docs.map(d => d.writes.length);
  const plan = world.plan(coreOnly(r));
  assert.equal(plan.counts.archive, 0); assert.equal(plan.archive.already, 5);
  const out = await world.run(coreOnly(r), phraselessOpts());
  assert.deepEqual(docs.map(d => d.writes.length), writes);
  assert.equal(out.counts.archived, 0);
});
function phraselessOpts() { return {}; }

test('never touched: documents without the Manager flag, characters, Actors a player owns, Keep, protected folder, tokens, hotbar', () => {
  const r = mk();
  const unflagged = new Doc('Item', {name: 'Mine', type: 'loot'});
  const sheet = npcDoc(npc('NPC-PC', 'Hero')); sheet.raw.type = 'character';
  const owned = npcDoc(npc('NPC-OWNED', 'Pal'), {ownership: {default: 0, u1: 3}});
  const keep = flagged(item('MAT-KEEPME', 'Keep Me')); keep.raw.flags[MODULE_ID].keepFolder = true;
  const prot = flagged(item('MAT-PROT', 'Protected')); prot.raw.folder = 'PF';
  const tok = npcDoc(npc('NPC-TOK', 'On Scene'));
  const hot = flagged(mac('MAC-HOT', 'Hot'));
  const world = makeWorld({docs: [flagged(r.core), unflagged, sheet, owned, keep, prot, tok, hot], overwriteEdited: false, extra: {archiveMissing: true}});
  world.protectedFolders.add('PF'); world.tokens.add(tok.id); world.hotbar.add(hot.id);
  const plan = world.plan(coreOnly(r));
  assert.equal(plan.counts.archive, 0, JSON.stringify(plan.rows.filter(x => x.group === 'archive').map(x => x.id)));
  const why = id => plan.rows.find(x => x.id === id)?.reason;
  assert.match(why('NPC-PC'), /character sheet/); assert.match(why('NPC-OWNED'), /owned by a player/); assert.match(why('MAT-KEEPME'), /Keep/);
  assert.match(why('MAT-PROT'), /protected/); assert.match(why('NPC-TOK'), /tokens/); assert.match(why('MAC-HOT'), /hotbar/);
  assert.equal(plan.rows.some(x => x.name === 'Mine'), false);
});

test('data layer refuses: a player, an unmanaged or character document, an id in the packs, a referenced id', async () => {
  const set = coreOnly(mk());
  const ok = flagged(item('MAT-X', 'X'));
  await assert.rejects(writeArchive(ok, {id: 'MAT-X'}, {user: PLAYER, folderFor: async () => ({id: 'f'})}), /Only a GM/);
  await assert.rejects(writeArchive(new Doc('Item', {name: 'n', type: 'loot'}), {id: 'MAT-X'}, {user: GM, folderFor: async () => ({id: 'f'})}), /no Manager source flag/);
  const pc = npcDoc(npc('NPC-PC', 'Hero')); pc.raw.type = 'character';
  await assert.rejects(writeArchive(pc, {id: 'NPC-PC'}, {user: GM, folderFor: async () => ({id: 'f'})}), /Character sheets/);
  const owned = npcDoc(npc('NPC-OWNED', 'Pal'), {ownership: {default: 0, u1: 3}});
  await assert.rejects(writeArchive(owned, {id: 'NPC-OWNED'}, {user: GM, folderFor: async () => ({id: 'f'})}), /player owns/);
  await assert.rejects(writeArchive(flagged(mk().core), {id: 'MAT-CORE'}, {user: GM, folderFor: async () => ({id: 'f'}), set}), /in the chosen packs/);
  await assert.rejects(writeArchive(ok, {id: 'MAT-X'}, {user: GM, folderFor: async () => ({id: 'f'}), referenced: new Set(['MAT-X'])}), /still referenced/);
  await assert.rejects(writeArchive(ok, {id: 'MAT-OTHER'}, {user: GM, folderFor: async () => ({id: 'f'})}), /bound to/);
});

test('a non-GM cannot run an archive plan at all', async () => {
  const {r, world} = archiveWorld();
  await assert.rejects(executeSync(world.plan(coreOnly(r)), world.adapter(coreOnly(r)), {user: PLAYER, confirmation: SYNC_PHRASE}), /Only a GM/);
});

// ---------------------------------------------------------------- confirmation, backup

test('the typed phrase is required, in the data layer, for an archive-only plan', async () => {
  const {r, docs, world} = archiveWorld();
  const set = coreOnly(r);
  await assert.rejects(executeSync(world.plan(set), world.adapter(set), {user: GM, confirmation: ''}), /Type "Replace content from package"/);
  assert.equal(docs.some(archived), false);
  assert.equal(world.downloads.length, 0);
});

test('the backup holds the full document of every archived record, before anything is written', async () => {
  const {r, world} = archiveWorld();
  let order = [];
  const set = coreOnly(r);
  const adapter = world.adapter(set, {async backup(plan) { order.push(['backup', world.docs.filter(archived).length]); world.downloads.push(buildSyncBackup(plan)); }});
  await executeSync(world.plan(set), adapter, {user: GM, confirmation: SYNC_PHRASE});
  assert.deepEqual(order, [['backup', 0]]);
  const backup = world.downloads[0];
  assert.equal(backup.documents.filter(d => d.sync_action === 'archive').length, 5);
  assert.ok(backup.documents.every(d => d.raw && d.source_id));
});

test('a failed backup stops everything', async () => {
  const {r, docs, world} = archiveWorld();
  const set = coreOnly(r);
  await assert.rejects(executeSync(world.plan(set), world.adapter(set, {async backup() { throw new Error('disk full'); }}), {user: GM, confirmation: SYNC_PHRASE}), /disk full/);
  assert.equal(docs.some(archived), false);
});

// ---------------------------------------------------------------- dependencies

test('Kept: still referenced - a record in the ticked pack that needs it, directly or through another kept record', () => {
  const r = mk();
  const core = {...r.core, refs: ['MAT-RES']};
  const lantern = flagged(r.res, M1, {refs: ['MAT-DEEP']});
  const deep = flagged(item('MAT-DEEP', 'Deep'));
  const soft = flagged(item('MAT-SOFT', 'Soft'));
  const core2 = {...core, refs: ['MAT-RES', {target_id: 'MAT-SOFT', relation: 'uses', mode: 'optional'}]};
  const world = makeWorld({docs: [flagged(r.core), lantern, deep, soft, flagged(r.res2)], overwriteEdited: false, extra: {archiveMissing: true}});
  const plan = world.plan(set1([core2]));
  const arch = plan.rows.filter(x => x.group === 'archive').map(x => x.id).sort();
  assert.deepEqual(arch, ['JRN-RES', 'MAT-SOFT'], 'optional refs do not keep a record; hard ones (and theirs) do');
  const kept = plan.rows.filter(x => x.keptReferenced).map(x => x.id).sort();
  assert.deepEqual(kept, ['MAT-DEEP', 'MAT-RES']);
  assert.equal(plan.counts.keptReferenced, 2);
  assert.match(plan.rows.find(x => x.id === 'MAT-RES').reason, /still referenced by Core Rope/);
  assert.deepEqual(hardTargets(['A', {id: 'B', optional: true}, {id: 'C'}, {target_id: 'D', mode: 'required'}, {target_id: 'E', mode: 'soft'}]), ['A', 'C', 'D']);
});

test('data layer: the executor will not archive a referenced id even if a plan row says so', async () => {
  const {r, docs, world} = archiveWorld();
  const set = coreOnly(r);
  const plan = world.plan(set);
  plan.archive.referencedIds.add('MAT-RES');
  const adapter = world.adapter(set, {async replan() { return plan; }});
  const out = await executeSync(plan, adapter, {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(archived(docs[1]), false);
  assert.ok(out.log.some(x => x.action === 'archive' && x.status === 'error' && /still referenced/.test(x.message)));
});

// ---------------------------------------------------------------- restore

test('ticking the reserve pack again restores what Sync archived (folder, readable), then compares as usual', async () => {
  const {r, docs, world} = archiveWorld();
  docs[1].raw.ownership = {default: 2}; docs[1].raw.folder = 'F-OLD';
  await world.run(coreOnly(r));
  assert.equal(archived(docs[1]), true);
  const both = set1([r.core, r.res, r.res2, r.tbl, r.mac, r.npc]);
  const plan = world.plan(both);
  assert.equal(plan.counts.restore, 5, JSON.stringify(plan.rows.map(x => [x.group, x.id])));
  assert.equal(plan.rows.filter(x => x.group === 'restore').every(x => x.snap), true);
  assert.equal(plan.counts.archive, 0);
  const out = await world.run(both);
  assert.equal(out.completed, true, JSON.stringify(out.log.filter(x => x.status !== 'ok')));
  assert.equal(out.counts.restored, 5);
  assert.equal(archived(docs[1]), false);
  assert.equal(docs[1].raw.folder, 'F-OLD'); assert.equal(docs[1].raw.ownership.default, 2); assert.equal(docs[1].raw.flags[MODULE_ID][BASELINE_FLAG], 2);
  assert.equal(world.plan(both).counts.restore, 0);
  assert.equal(world.plan(both).counts.archive, 0);
});

test('restore also happens with the switch off, but only for what Sync archived: a hand-archived record stays refused', async () => {
  const {r, docs, world} = archiveWorld();
  await world.run(coreOnly(r));
  const hand = flagged(item('MAT-HAND', 'Hand')); hand.raw.flags[MODULE_ID].lifecycle = {archived: true};
  world.docs.push(hand);
  world.extraOff = true;
  const w2 = makeWorld({docs: world.docs, overwriteEdited: false, extra: {archiveMissing: false}});
  const plan = w2.plan(set1([r.core, r.res, {...item('MAT-HAND', 'Hand')}]));
  assert.equal(plan.counts.restore, 1);
  assert.equal(plan.rows.find(x => x.id === 'MAT-HAND').refused, true);
  assert.match(plan.rows.find(x => x.id === 'MAT-HAND').reason, /Archived in Manager; restore it/);
});

test('Library can put back an archived Actor, Roll Table or Macro (and still refuses to archive or delete them)', () => {
  assert.equal(planLifecycle({managed: true, kind: 'Actor', archived: true, action: 'restore'}).allowed, true);
  assert.equal(planLifecycle({managed: true, kind: 'Macro', archived: false, action: 'restore'}).action, 'blocked');
  assert.equal(planLifecycle({managed: true, kind: 'RollTable', archived: true, action: 'delete'}).action, 'blocked');
  assert.equal(planLifecycle({managed: true, kind: 'Actor', action: 'archive'}).action, 'blocked');
});

// ---------------------------------------------------------------- Locations and Quest Log hand-off

const ledgerWith = () => ({
  'PKG-MAIN': {'LOC-OLD': {kind: 'Location', module: 'Locations', name: 'Old Gate'}, 'LOC-KEEP': {kind: 'Location', module: 'Locations', name: 'Kept Gate'}, 'ROUTE-OLD': {kind: 'Route', module: 'Locations', name: 'Old Road'}},
  'specialist:quests': {'QST-OLD': {kind: 'Quest', module: 'Quest Log', name: 'Old Quest'}}
});
const fakePartner = (kind, calls) => {
  const spec = {Location: ['archiveLocations', 'restoreLocations'], Quest: ['archiveQuests', 'restoreQuests']}[kind];
  return {[spec[0]]: async (ids, o) => { calls.push([spec[0], ids, o]); return {archived: ids, skipped: []}; }, [spec[1]]: async (ids, o) => { calls.push([spec[1], ids, o]); return {restored: ids, skipped: []}; }};
};

test('without the API: Locations and Quest records show as "Not archived: needs ... update" and nothing is asked of the module', async () => {
  const {r, world} = archiveWorld({}, {ledger: ledgerWith()});
  const plan = world.plan(coreOnly(r));
  const info = plan.rows.filter(x => x.notArchived);
  assert.deepEqual(info.map(x => x.id).sort(), ['LOC-KEEP', 'LOC-OLD', 'QST-OLD']);
  assert.match(info.find(x => x.id === 'LOC-OLD').reason, /Not archived: needs a Locations update/);
  assert.match(info.find(x => x.id === 'QST-OLD').reason, /Not archived: needs a Quest Log update/);
  assert.equal(plan.counts.notArchived, 3);
  assert.equal(plan.rows.filter(x => x.group === 'archive' && x.external).length, 0);
  assert.equal(plan.rows.some(x => x.notRemoved && x.id === 'LOC-OLD'), false, 'replaced by the Not archived row');
  assert.ok(plan.rows.some(x => x.notRemoved && x.id === 'ROUTE-OLD'), 'other kinds keep the old line');
  const out = await world.run(coreOnly(r));
  assert.equal(out.counts.archived, 5);
});

test('with the API: partner rows join the Archive group, are asked by id with the documented shape, and the ledger remembers it', async () => {
  const calls = [];
  const {r, world} = archiveWorld({}, {ledger: ledgerWith()});
  world.partner = {Location: fakePartner('Location', calls), Quest: fakePartner('Quest', calls)};
  const set = coreOnly(r);
  const plan = world.plan(set);
  const partnerRows = plan.rows.filter(x => x.group === 'archive' && x.external);
  assert.deepEqual(partnerRows.map(x => x.id).sort(), ['LOC-KEEP', 'LOC-OLD', 'QST-OLD']);
  assert.deepEqual(plan.archive.byKind, {Item: 1, JournalEntry: 1, RollTable: 1, Macro: 1, Actor: 1, Location: 2, Quest: 1});
  assert.equal(plan.counts.archive, 8);
  const out = await world.run(set);
  assert.equal(out.completed, true, JSON.stringify(out.log.filter(x => x.status !== 'ok')));
  assert.deepEqual(calls.map(c => c[0]).sort(), ['archiveLocations', 'archiveQuests']);
  const loc = calls.find(c => c[0] === 'archiveLocations');
  assert.deepEqual([...loc[1]].sort(), ['LOC-KEEP', 'LOC-OLD']);
  assert.equal(loc[2].source, 'ashen-gate-manager'); assert.equal(loc[2].reason, 'sync-not-in-package');
  assert.equal(world.ledger['PKG-MAIN']['LOC-OLD'].archived, true);
  assert.equal(world.ledger['specialist:quests']['QST-OLD'].archived, true);
  assert.equal(out.counts.archived, 8);
  // idempotent
  const again = world.plan(set);
  assert.equal(again.counts.archive, 0); assert.equal(again.archive.already, 8); assert.equal(again.archive.partner.Location.already, 2);
  assert.equal(calls.length, 2);
});

test('a Location the ticked packs still need is kept, and a gone one is ignored', () => {
  const {r, world} = archiveWorld({moduleHas: (kind, id) => id !== 'LOC-GONE', externalIds: new Set(['LOC-KEEP'])}, {ledger: {'PKG-MAIN': {...ledgerWith()['PKG-MAIN'], 'LOC-GONE': {kind: 'Location', name: 'Gone'}}}});
  world.partner = {Location: fakePartner('Location', [])};
  const plan = world.plan(set1([{...r.core, refs: ['LOC-KEEP']}]));
  assert.deepEqual(plan.rows.filter(x => x.group === 'archive' && x.external).map(x => x.id), ['LOC-OLD']);
  assert.ok(plan.rows.find(x => x.id === 'LOC-KEEP').keptReferenced);
  assert.equal(plan.rows.some(x => x.id === 'LOC-GONE'), false);
});

test('ticking the pack again asks the module to restore first, then the ledger forgets the archive mark', async () => {
  const calls = [];
  const {r, world} = archiveWorld({}, {ledger: ledgerWith()});
  world.partner = {Location: fakePartner('Location', calls), Quest: fakePartner('Quest', calls)};
  await world.run(coreOnly(r));
  calls.length = 0;
  const loc = {id: 'LOC-OLD', entity_type: 'Location', status: 'approved', version: '1.0.0', provenance: {sources: ['synthetic']}, visibility: 'player', refs: [], name: 'Old Gate', location: {name: 'Old Gate'}};
  const set = buildSyncSet([{filename: 'p.json', kind: 'manager', payload: {manifest: {schema_version: 'ag-foundry-import/0.2', package_id: 'PKG-MAIN', version: '2.0.0'}, records: [loc]}}]);
  const plan = world.plan(set);
  const restoreRow = plan.rows.find(x => x.group === 'restore' && x.id === 'LOC-OLD');
  assert.ok(restoreRow && restoreRow.external);
  assert.equal(plan.rows.some(x => x.group === 'restore' && x.id === 'LOC-KEEP'), false, 'only what the packs carry again');
  await world.run(set);
  assert.deepEqual(calls.map(c => [c[0], c[1]]), [['restoreLocations', ['LOC-OLD']]]);
  assert.equal(world.ledger['PKG-MAIN']['LOC-OLD'].archived, undefined);
});

test('a module that has only half the pair, or answers badly, archives nothing', async () => {
  assert.equal(partnerArchiveApi({modules: new Map([['ashen-gate-locations', {active: true, api: {archiveLocations() {}}}]])}, 'Location'), null);
  assert.ok(partnerArchiveApi({modules: new Map([['ashen-gate-locations', {active: true, api: {archiveLocations() {}, restoreLocations() {}}}]])}, 'Location'));
  assert.equal(partnerArchiveApi({modules: new Map([['ashen-gate-quest-manager', {active: false, api: {archiveQuests() {}, restoreQuests() {}}}]])}, 'Quest'), null);
  const bad = await applyPartnerArchive('Location', ['A', 'B'], {archiveLocations: async () => ({archived: ['A'], skipped: [{id: 'B', reason: 'is the start location'}]}), restoreLocations() {}});
  assert.deepEqual(bad.map(x => [x.id, x.status, x.message]), [['A', 'ok', undefined], ['B', 'skipped', 'is the start location']]);
  const boom = await applyPartnerArchive('Quest', ['Q'], {archiveQuests: async () => { throw new Error('nope'); }, restoreQuests() {}});
  assert.equal(boom[0].status, 'error');
  const none = await applyPartnerArchive('Quest', ['Q'], null);
  assert.match(none[0].message, /needs a Quest Log update/);
});

// ---------------------------------------------------------------- view

test('preview view: Archive group with names, per-type and per-package counts, the explanation, and the switch', () => {
  const {r, world} = archiveWorld({}, {ledger: ledgerWith()});
  const plan = world.plan(coreOnly(r));
  const state = {inputs: [], skipped: [], fileButton: '', isGM: true, archiveMissing: true, plan, phrase: '', busy: false, progress: null, result: null, message: ''};
  const html = syncView(state);
  assert.match(html, /data-ag-sync-archive checked/);
  assert.match(html, /Also archive records that are no longer in the package/);
  assert.match(html, /<span class="ag-fold__title">Archive<\/span>/);
  for (const n of ['Reserve Lantern', 'Reserve Ogre', 'Reserve Macro']) assert.match(html, new RegExp(n));
  assert.match(html, /1 Roll Tables/); assert.match(html, /PKG-MAIN<\/code><\/td><td class="is-num">5/);
  assert.match(html, /Archive keeps everything/); assert.match(html, /Delete is different: it removes the document and retires its id for good/);
  assert.match(html, /Not archived: needs a module update/);
  assert.match(html, /retires its permanent id for good/);
  assert.match(html, /data-ag-sync-phrase/);
  assert.match(html, /On: [^<]*archiving records not in the files/);
  const off = syncView({...state, archiveMissing: false, plan: archiveWorld({archiveMissing: false}).world.plan(coreOnly(r))});
  assert.doesNotMatch(off, /<span class="ag-fold__title">Archive<\/span>/);
  assert.match(off, /data-ag-sync-archive /);
  assert.equal(ARCHIVE_EXPLAIN.includes('Archive keeps everything'), true);
});

test('a switch with no Manager package in the sync is ignored with a note (specialist files alone cannot say what is missing)', () => {
  const {world} = archiveWorld();
  const plan = world.plan(buildSyncSet([]));
  assert.equal(plan.archiveMissing, false);
});

test('main.js wires the switch for GMs only and the adapter supplies folder, restore and partner hooks', () => {
  const main = read('../scripts/main.js');
  assert.match(main, /data-ag-sync-archive/);
  assert.match(main, /archiveMissing:Boolean\(this\.sync\.archiveMissing&&game\.user\?\.isGM\)/);
  assert.match(main, /archiveFolder: documentName=>/); assert.match(main, /restoreFolder:/); assert.match(main, /partnerApi: kind=>partnerArchiveApi\(game,kind\)/);
});
