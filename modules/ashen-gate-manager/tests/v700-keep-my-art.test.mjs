import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {itemKeys, ITEM_FLAG, ACTOR_ITEMS_FLAG} from '../scripts/actor-update.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, removeDoc, assertSyncTarget, buildSyncBackup} from '../scripts/sync-apply.js';
import {syncView} from '../scripts/sync-view.js';
import {planActor as planActorUpdate} from '../scripts/actor-update.js';
import {planRecord} from '../scripts/core.js';
import {isArtPath, artDecision, artWords} from '../scripts/art-fields.js';

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
function makeWorld({docs = [], retired = [], ledger = {}, deleteUnscoped = false, overwriteEdited = false, replaceArt = false, includeDrafts = true, extra = {}} = {}) {
  const world = {docs: [...docs], retired: new Set(retired), ledger: clone(ledger), saved: [], downloads: [], tokens: new Set(), hotbar: new Set(), protectedFolders: new Set(), apis: {}};
  const sourceOf = (record, manifest, available = new Set()) => ({...sourceMetadata(record, {manifest}, record.refs ?? []), managedFields: exportedFields(record),
    pagesDefinition: record.foundry.document_type === 'JournalEntry' ? record.foundry.data.pages ?? [] : []});
  const ctx = () => ({includeDrafts, deleteUnscoped, overwriteEdited, replaceArt, retiredIds: world.retired, ledger: world.ledger, buildFlag: sourceOf, externalIds: new Set(),
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


// ---------- fixtures ----------
const PKG_IMG = 'icons/environment/people/guard.webp', NEW_IMG = 'icons/environment/people/captain.webp', GM_IMG = 'assets/npc/NPC-OREN.webp', GM_TOKEN = 'assets/token/NPC-OREN.webp';
const RING = {enabled: true, colors: {ring: '#2e9e4f', background: '#10301a'}, subject: {scale: 0.6}};
const leader = (str = 10, over = {}) => npc('NPC-OREN', 'Oren', {img: PKG_IMG, prototypeToken: {disposition: -1, texture: {src: PKG_IMG}, ring: clone(RING)},
  system: {abilities: {str: {value: str}}, attributes: {ac: {flat: 12}, hp: {value: 20, max: 20, temp: 0}}, details: {biography: {value: '<p>bio</p>'}}}, ...over});
const withGmArt = (doc) => { doc.raw.img = GM_IMG; doc.raw.prototypeToken.texture.src = GM_TOKEN; return doc; };
const importedActor = (record = leader()) => {
  const doc = flagged(record, M1);
  const key = itemKeys(record.foundry.data.items)[0];
  doc.raw.items = [{_id: 'i1', ...clone(record.foundry.data.items[0]), flags: {[MODULE_ID]: {[ITEM_FLAG]: key}}}];
  doc.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG] = {version: 1};
  return doc;
};
const rowOf = (plan, id) => plan.rows.find(r => r.id === id);

test('art paths: portrait, token image and every ring field; nothing else', () => {
  for (const p of ['img', 'prototypeToken.texture.src', 'prototypeToken.ring.enabled', 'prototypeToken.ring.colors.ring', 'prototypeToken.ring.subject.texture', 'prototypeToken.ring.subject.scale']) assert.ok(isArtPath(p), p);
  for (const p of ['name', 'prototypeToken.name', 'prototypeToken.texture.scaleX', 'prototypeToken.texture.tint', 'prototypeToken.ringer', 'system.img', 'items']) assert.ok(!isArtPath(p), p);
  assert.equal(artWords(['img', 'prototypeToken.texture.src']), 'portrait and token');
  assert.equal(artWords(['img', 'prototypeToken.texture.src', 'prototypeToken.ring.enabled']), 'portrait, token and ring');
  assert.equal(artDecision('img', 'a', 'b', {img: 'a'}), 'package');
  assert.equal(artDecision('img', 'c', 'b', {img: 'a'}), 'keep');
  assert.equal(artDecision('img', 'c', 'b', {}), 'keep');
  assert.equal(artDecision('img', 'icons/svg/mystery-man.svg', 'b', {}), 'package');
});

test('a GM portrait and token plus a new stat block: stats update, art kept, the record is not "Kept: edited"', async () => {
  const doc = withGmArt(importedActor());
  const world = makeWorld({docs: [doc]});
  const set = set1([leader(18)]);
  const plan = world.plan(set), row = rowOf(plan, 'NPC-OREN');
  assert.equal(row.group, 'overwrite', row.reason);
  assert.equal(plan.counts.keptEdited, 0);
  assert.equal(plan.counts.artKept, 1);
  assert.equal(row.artKept.length, 2);
  assert.deepEqual(row.artKept.map(a => a.path).sort(), ['img', 'prototypeToken.texture.src']);
  assert.equal(plan.artKept[0].summary, 'Keeping your portrait and token art');
  assert.ok(!('img' in row.ops.fields) && !('prototypeToken.texture.src' in row.ops.fields));
  assert.equal(row.lost, 0, 'no GM edit is lost');
  const out = await world.run(set);
  assert.equal(out.counts.failed, 0);
  assert.equal(doc.raw.system.abilities.str.value, 18, 'stat block applied');
  assert.equal(doc.raw.img, GM_IMG);
  assert.equal(doc.raw.prototypeToken.texture.src, GM_TOKEN);
  // Baseline holds the PACKAGE's art, not the GM's.
  const flag = doc.getFlag(MODULE_ID, 'source');
  assert.equal(flag.managedFields.img, PKG_IMG);
  assert.equal(flag.managedFields['prototypeToken.texture.src'], PKG_IMG);
  // Idempotent: the same sync again writes nothing and has nothing to do.
  const writesBefore = doc.writes.length;
  const again = world.plan(set);
  assert.equal(again.counts.overwrite, 0);
  assert.equal(again.records, 0);
  assert.equal(again.counts.artKept, 1, 'still reported, as information');
  const out2 = await world.run(set);
  assert.equal(doc.writes.length, writesBefore, 'nothing written the second time');
  assert.equal(out2.counts.updated, 0);
});

test('a non-art edit still keeps the whole record (today\'s all-or-nothing rule), with or without art edits', () => {
  const doc = withGmArt(importedActor());
  doc.raw.system.abilities.str.value = 8; // GM edit
  const world = makeWorld({docs: [doc]});
  const plan = world.plan(set1([leader(18)])), row = rowOf(plan, 'NPC-OREN');
  assert.equal(row.group, 'untouched');
  assert.ok(row.keptEdited);
  assert.ok(!row.editedFields.some(isArtPath), `art is not listed as an edit: ${row.editedFields}`);
  assert.deepEqual(row.editedFields, ['system.abilities.str.value']);
  assert.equal(plan.counts.keptEdited, 1);
});

test('Also overwrite records I edited never replaces art; only Also replace art I set does', async () => {
  const mk = () => { const d = withGmArt(importedActor()); d.raw.system.abilities.str.value = 8; return d; };
  // force on, art tick off
  let doc = mk();
  let world = makeWorld({docs: [doc], overwriteEdited: true});
  let set = set1([leader(18)]);
  let plan = world.plan(set);
  assert.equal(rowOf(plan, 'NPC-OREN').group, 'overwrite');
  assert.equal(plan.replaceArt, false);
  await world.run(set);
  assert.equal(doc.raw.system.abilities.str.value, 18, 'the edited field is overwritten');
  assert.equal(doc.raw.img, GM_IMG); assert.equal(doc.raw.prototypeToken.texture.src, GM_TOKEN);
  // both ticks
  doc = mk();
  world = makeWorld({docs: [doc], overwriteEdited: true, replaceArt: true});
  plan = world.plan(set);
  assert.equal(plan.replaceArt, true);
  assert.equal(plan.counts.artKept, 0);
  assert.ok(plan.lost >= 3, `art counted as lost edits (${plan.lost})`);
  await world.run(set);
  assert.equal(doc.raw.img, PKG_IMG); assert.equal(doc.raw.prototypeToken.texture.src, PKG_IMG);
  // art tick alone: a record whose only edits are art is replaced, not kept
  doc = withGmArt(importedActor());
  world = makeWorld({docs: [doc], replaceArt: true});
  plan = world.plan(set);
  assert.equal(rowOf(plan, 'NPC-OREN').group, 'overwrite');
  await world.run(set);
  assert.equal(doc.raw.img, PKG_IMG);
  assert.equal(doc.raw.system.abilities.str.value, 18);
  assert.equal(world.plan(set).records, 0, 'idempotent after replacing');
});

test('art the GM never changed takes the package\'s new art (baseline equal)', async () => {
  const doc = importedActor(); // img == baseline == PKG_IMG
  const world = makeWorld({docs: [doc]});
  const next = leader(18); next.foundry.data.img = NEW_IMG; next.foundry.data.prototypeToken.texture.src = NEW_IMG;
  const set = set1([next]);
  const plan = world.plan(set);
  assert.equal(plan.counts.artKept, 0);
  const row = rowOf(plan, 'NPC-OREN');
  assert.ok(row.changes.some(c => c.path === 'img' && c.art && !c.gmEdited));
  await world.run(set);
  assert.equal(doc.raw.img, NEW_IMG); assert.equal(doc.raw.prototypeToken.texture.src, NEW_IMG);
  assert.equal(world.plan(set).records, 0);
});

test('GM art survives a later package art change, and a record with ONLY a new package art and GM art has nothing to write', async () => {
  const doc = withGmArt(importedActor());
  const world = makeWorld({docs: [doc]});
  const next = leader(10); next.foundry.data.img = NEW_IMG; // package art changes, nothing else
  const set = set1([next]);
  const plan = world.plan(set);
  const row = rowOf(plan, 'NPC-OREN');
  assert.ok(row.metadataOnly, 'only the package version stamp refreshes'); assert.deepEqual(row.ops.fields, {}); assert.equal(row.artKept.length, 2);
  assert.equal(plan.counts.keptEdited, 0);
  await world.run(set);
  assert.equal(doc.raw.img, GM_IMG);
  assert.equal(doc.getFlag(MODULE_ID, 'source').managedFields.img, NEW_IMG, 'the baseline now holds the package\'s newer art, still not the GM\'s');
  assert.equal(world.plan(set).records, 0);
  const next2 = leader(10); next2.foundry.data.img = GM_IMG; // the package later ships exactly the GM's art
  assert.equal(rowOf(world.plan(set1([next2])), 'NPC-OREN').artKept.some(a => a.path === 'img'), false);
});

test('token ring settings the GM or the ring tool set are kept; ring fields never make a record "edited"', async () => {
  const doc = importedActor();
  doc.raw.prototypeToken.ring.colors.ring = '#fff000'; doc.raw.prototypeToken.ring.subject.scale = 0.8; doc.raw.prototypeToken.ring.subject.texture = 'assets/ring/x.webp';
  const world = makeWorld({docs: [doc]});
  const next = leader(18); next.foundry.data.prototypeToken.ring.colors.ring = '#111111'; // the package changes the ring colour too
  const set = set1([next]);
  const plan = world.plan(set), row = rowOf(plan, 'NPC-OREN');
  assert.equal(row.group, 'overwrite', row.reason);
  assert.equal(plan.counts.keptEdited, 0);
  assert.ok(row.artKept.every(a => a.path.startsWith('prototypeToken.ring')));
  assert.equal(plan.artKept[0].summary, 'Keeping your ring art');
  await world.run(set);
  assert.equal(doc.raw.prototypeToken.ring.colors.ring, '#fff000');
  assert.equal(doc.raw.prototypeToken.ring.subject.scale, 0.8);
  assert.equal(doc.raw.prototypeToken.ring.subject.texture, 'assets/ring/x.webp');
  assert.equal(doc.raw.system.abilities.str.value, 18);
});

test('Item art: a GM icon is kept while the description updates; an unchanged icon follows the package', async () => {
  const mk = (img, desc) => rec('MAT-ROPE', 'Item', {name: 'Rope', type: 'loot', img, system: {description: {value: desc}, quantity: 1, price: {value: 5}}});
  const old = mk('icons/tools/rope.webp', '<p>old</p>');
  const doc = flagged(old, M1); doc.raw.img = 'assets/item/MAT-ROPE.webp';
  const world = makeWorld({docs: [doc]});
  const set = set1([mk('icons/tools/rope2.webp', '<p>new</p>')]);
  const plan = world.plan(set), row = rowOf(plan, 'MAT-ROPE');
  assert.equal(row.group, 'overwrite'); assert.equal(plan.counts.keptEdited, 0);
  assert.equal(row.artKept[0].path, 'img');
  await world.run(set);
  assert.equal(doc.raw.img, 'assets/item/MAT-ROPE.webp');
  assert.equal(doc.raw.system.description.value, '<p>new</p>');
  assert.equal(world.plan(set).records, 0);
  // untouched icon: follows the package
  const fresh = flagged(old, M1), w2 = makeWorld({docs: [fresh]});
  await w2.run(set);
  assert.equal(fresh.raw.img, 'icons/tools/rope2.webp');
});

test('the data layer drops GM art from a write whatever the plan says; a player cannot write at all', async () => {
  const doc = withGmArt(importedActor());
  const row = {id: 'NPC-OREN', ops: {fields: {img: PKG_IMG, 'prototypeToken.texture.src': PKG_IMG, 'system.abilities.str.value': 18}}};
  await assert.rejects(writeOverwrite(doc, row, {user: PLAYER, flag: {sourceId: 'NPC-OREN'}}), /Only a GM/);
  await writeOverwrite(doc, row, {user: GM, flag: doc.getFlag(MODULE_ID, 'source')});
  assert.equal(doc.raw.img, GM_IMG); assert.equal(doc.raw.prototypeToken.texture.src, GM_TOKEN);
  assert.equal(doc.raw.system.abilities.str.value, 18);
  await writeOverwrite(doc, row, {user: GM, flag: doc.getFlag(MODULE_ID, 'source'), replaceArt: true});
  assert.equal(doc.raw.img, PKG_IMG);
  await assert.rejects(executeSync(makeWorld({docs: [doc]}).plan(set1([leader(18)])), {}, {user: PLAYER, confirmation: SYNC_PHRASE}), /Only a GM/);
});

test('a record the package dropped is still kept (not deleted) when it carries your art', () => {
  const doc = withGmArt(importedActor());
  const world = makeWorld({docs: [doc], deleteUnscoped: true});
  const plan = world.plan(set1([item('MAT-ROPE', 'Rope')]));
  const row = rowOf(plan, 'NPC-OREN');
  assert.equal(row.group, 'untouched'); assert.ok(row.keptRemoved);
});

test('preview: summary count, one short line per record, expandable to the fields; the option is GM-only', () => {
  const world = makeWorld({docs: [withGmArt(importedActor())]});
  const plan = world.plan(set1([leader(18)]));
  const html = syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, isGM: true, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: ''});
  assert.match(html, /<strong>1<\/strong> keeping your art/);
  assert.match(html, /Keeping your art on 1 record\./);
  assert.match(html, /Keeping your portrait and token art/);
  assert.match(html, /<th scope="row">portrait<\/th>/);
  assert.match(html, /<th scope="row">token image<\/th>/);
  assert.match(html, /data-ag-sync-art\s+>/, 'unticked by default');
  assert.match(html, /Also replace art I set/);
  const player = syncView({inputs: [], skipped: [], fileButton: '', replaceArt: false, isGM: false, plan: null, phrase: '', busy: false});
  assert.match(player, /data-ag-sync-art\s+disabled/);
  // Backup still holds everything about the document it overwrites.
  const backup = buildSyncBackup(plan);
  assert.equal(backup.documents[0].raw.img, GM_IMG);
});

test('normal import: Update existing actors keeps the GM portrait, token and ring and still applies the rest', () => {
  const rec1 = leader(18);
  const raw = importedActor(leader()).toObject(); raw.img = GM_IMG; raw.prototypeToken.texture.src = GM_TOKEN; raw.prototypeToken.ring.colors.ring = '#fff000';
  rec1.foundry.data.img = NEW_IMG; // even a new package portrait does not replace it
  rec1.foundry.data.items[0].system.description.value = 'Sharper claw';
  const plan = planActorUpdate(rec1, [raw], {updateExisting: true});
  assert.equal(plan.action, 'update');
  assert.deepEqual(plan.artKept.map(a => a.path).sort(), ['img', 'prototypeToken.ring.colors.ring', 'prototypeToken.texture.src']);
  assert.ok(!('img' in plan.patch.fields) && !('prototypeToken.texture.src' in plan.patch.fields));
  assert.ok(plan.changes.some(c => /Claw/.test(c)), 'the package item still updates');
  // art the GM never changed follows the package
  const raw2 = importedActor(leader()).toObject();
  const plan2 = planActorUpdate(rec1, [raw2], {updateExisting: true});
  assert.equal(plan2.patch.fields.img, NEW_IMG);
  assert.equal(plan2.artKept.length, 0);
  // only art differs: nothing to write
  const rec3 = leader(); const plan3 = planActorUpdate(rec3, [Object.assign(importedActor(leader()).toObject(), {img: GM_IMG})], {updateExisting: true});
  assert.equal(plan3.action, 'unchanged'); assert.match(plan3.reason, /Keeping your portrait art/);
});

test('normal import: an Item whose icon the GM changed is not a conflict; the rest updates', () => {
  const mk = (img, price) => rec('MAT-ROPE', 'Item', {name: 'Rope', type: 'loot', img, system: {description: {value: 'x'}, quantity: 1, price: {value: price}}});
  const base = exportedFields(mk('icons/a.webp', 5));
  const match = {flag: {sourceId: 'MAT-ROPE', managedFields: base}, documentName: 'Item', type: 'loot', get: p => p === 'img' ? 'assets/mine.webp' : p.split('.').reduce((v, k) => v?.[k], {system: {description: {value: 'x'}, quantity: 1, price: {value: 5}}, name: 'Rope'})};
  const plan = planRecord(mk('icons/b.webp', 7), [match], false, true);
  assert.equal(plan.action, 'update', plan.reason);
  assert.deepEqual(plan.artKept, ['img']);
  assert.equal(plan.patch['system.price.value'], 7);
  assert.ok(!('img' in plan.patch));
});
