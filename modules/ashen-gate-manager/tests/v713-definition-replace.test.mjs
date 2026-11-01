import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata, replacingSourceFlag} from '../scripts/source-projection.mjs';
import {} from '../scripts/actor-update.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, buildSyncBackup} from '../scripts/sync-apply.js';

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
const flagged = (record, manifest, over = {}) => {
  const raw = clone(record.foundry.data);
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: {...sourceMetadata(record, {manifest}, []), managedFields: exportedFields(record), pagesDefinition: [], ...over}}};
  return new Doc(record.foundry.document_type, raw);
};
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set1 = (records, id = 'PKG-MAIN', version = '2.0.0') => buildSyncSet([{filename: `${id}.json`, kind: 'manager', payload: pkg(id, version, records)}]);

const recipe = (extra, name = 'A Courtyard Jest', img) => ({id: 'REC-ART-JEST', entity_type: 'Recipe', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov,
  name, profession_id: 'PROF-ART', tier: 'apprentice', kind: 'activity', ...extra,
  foundry: {document_type: 'Item', data: {name, type: 'loot', ...(img ? {img} : {}), system: {description: {value: `<p>${name}</p>`}}}}});
const stale = recipe({required_tools: ['Disguise Kit'], workstation: 'rehearsal', tool: 'disguiseKit', access: 'trained'});
const fresh = recipe({required_tools: ['Disguise Kit']});
const stored = doc => doc.raw.flags[MODULE_ID].source;

test('REPRODUCTION: a plain Foundry update of the source flag keeps a removed field (the cause)', async () => {
  const doc = flagged(stale, M1);
  await doc.update({[`flags.${MODULE_ID}.source`]: sourceMetadata(fresh, {manifest: M1}, [])});
  assert.equal(stored(doc).definition.workstation, 'rehearsal', 'merge keeps keys the package dropped');
});

test('Sync replaces the stored definition: removed workstation / tool / access disappear, then it Already matches', async () => {
  const doc = flagged(stale, M1);
  doc.raw.folder = 'GMFOLDER'; doc.raw.ownership = {default: 2, USER1: 3}; // world-side state Sync never rewrites
  const world = makeWorld({docs: [doc], overwriteEdited: false});
  const set = set1([fresh]);
  const plan = world.plan(set);
  const row = plan.rows.find(r => r.id === 'REC-ART-JEST');
  assert.equal(row.group, 'overwrite', 'preview says Will update');
  assert.equal(row.metadataOnly, true, 'only the stored definition is refreshed');
  assert.match(row.reason, /definition/);
  const out = await world.run(set, {}, {});
  assert.equal(out.counts.failed, 0);
  const def = stored(doc).definition;
  assert.deepEqual(def.required_tools, ['Disguise Kit']);
  for (const gone of ['workstation', 'tool', 'access']) assert.ok(!(gone in def), `${gone} removed`);
  assert.equal(def.id, 'REC-ART-JEST'); assert.equal(stored(doc).sourceId, 'REC-ART-JEST');
  assert.equal(doc.raw.folder, 'GMFOLDER'); assert.deepEqual(doc.raw.ownership, {default: 2, USER1: 3}); assert.equal(doc.raw.name, 'A Courtyard Jest');
  const again = world.plan(set).rows.find(r => r.id === 'REC-ART-JEST');
  assert.equal(again.group, 'untouched'); assert.equal(again.unchanged, true, 'Already matches');
});

test('edit protection is unchanged: a renamed recipe is Kept (definition untouched) until "Also overwrite records I edited"', async () => {
  const doc = flagged(stale, M1);
  doc.raw.name = 'My renamed jest';
  const kept = makeWorld({docs: [doc], overwriteEdited: false});
  const row = kept.plan(set1([fresh])).rows.find(r => r.id === 'REC-ART-JEST');
  assert.equal(row.keptEdited, true);
  await kept.run(set1([fresh]));
  assert.equal(stored(doc).definition.workstation, 'rehearsal', 'a kept record is not written at all');
  await makeWorld({docs: [doc], overwriteEdited: true}).run(set1([fresh]));
  assert.ok(!('workstation' in stored(doc).definition)); assert.equal(doc.raw.name, 'A Courtyard Jest');
});

test('re-running Sync is harmless; a definition field that stays or is added is written', async () => {
  const doc = flagged(stale, M1), world = makeWorld({docs: [doc]});
  const v2 = recipe({required_tools: ['Disguise Kit', 'Forgery Kit'], note: 'new'});
  await world.run(set1([v2]));
  await world.run(set1([v2]));
  assert.deepEqual(stored(doc).definition.required_tools, ['Disguise Kit', 'Forgery Kit']);
  assert.equal(stored(doc).definition.note, 'new'); assert.ok(!('workstation' in stored(doc).definition));
});

test('Journeyman shape: station kept, a removed tool list disappears', async () => {
  const before = recipe({required_tools: ['Disguise Kit'], workstation: 'rehearsal'});
  const after = recipe({workstation: 'rehearsal'});
  const doc = flagged(before, M1), world = makeWorld({docs: [doc]});
  await world.run(set1([after]));
  assert.equal(stored(doc).definition.workstation, 'rehearsal'); assert.ok(!('required_tools' in stored(doc).definition));
});

test('replacingSourceFlag: nested keys and provenance; other flag parts and dotted keys are left to merge', () => {
  const out = replacingSourceFlag({definition: {a: 1, b: {c: 1, d: 2}, 'x.y': 1}, provenance: {s: 1, t: 2}, memo: 'm'}, {definition: {a: 2, b: {c: 1}}, provenance: {s: 1}, sourceId: 'X'});
  assert.equal(out.definition.b['-=d'], null); assert.equal(out.provenance['-=t'], null);
  assert.ok(!('-=x.y' in out.definition), 'a key with a dot is never turned into a path deletion');
  assert.ok(!('-=memo' in out), 'memo / managedFields are not deleted');
  assert.deepEqual(replacingSourceFlag(undefined, {definition: {a: 1}}), {definition: {a: 1}});
});

test('writeOverwrite sends the removal inside the one flag write and needs no extra update', async () => {
  const doc = flagged(stale, M1);
  const row = {id: 'REC-ART-JEST', ops: {fields: {}}, record: fresh};
  await writeOverwrite(doc, row, {user: GM, flag: sourceMetadata(fresh, {manifest: M1}, [])});
  assert.equal(doc.writes.length, 1);
  assert.equal(doc.writes[0][`flags.${MODULE_ID}.source`].definition['-=workstation'], null);
});

test('0.72.2 version and CHANGELOG', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.100.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.100.0/ashen-gate-manager.zip'));
  assert.match(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), /^## 0\.71\.3 /m);
  for (const f of ['sync-apply.js', 'actor-update.js', 'main.js']) assert.match(fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8'), /replacingSourceFlag\(/, f);
});
