import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata, replacingSourceFlag} from '../scripts/source-projection.mjs';

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
const M1 = {schema_version: 'ag-foundry-import/0.1', package_id: 'PKG-MAIN', version: '1.0.0'};
const set1 = (records, id = 'PKG-MAIN', version = '2.0.0') => buildSyncSet([{filename: `${id}.json`, kind: 'manager', payload: pkg(id, version, records)}]);
import {effectCreateData} from '../scripts/item-effects.js';
import {resultCreateData} from '../scripts/table-results.js';

// Foundry rewrites the quote entity in rich text it stores (&#x27; comes back as '). The stand-in does the same for embedded
// effects and table results, on create AND on update, so a plan -> apply -> plan loop behaves like the live world.
const quote = v => typeof v === 'string' ? v.replace(/&#x27;/g, "'") : v;
function foundryLike(doc) {
  const fix = () => { for (const e of doc.raw.effects ?? []) e.description = quote(e.description); for (const r of doc.raw.results ?? []) r.description = quote(r.description); };
  for (const m of ['update', 'createEmbeddedDocuments', 'updateEmbeddedDocuments']) { const old = doc[m].bind(doc); doc[m] = async (...a) => { const out = await old(...a); fix(); return out; }; }
  fix(); return doc;
}
const realisticCreate = world => over => ({async create(row) {
  const raw = clone(row.record.foundry.data);
  if (Array.isArray(raw.effects) && raw.effects.length) raw.effects = raw.effects.map((e, i) => ({_id: `fx${++ids}`, ...effectCreateData(e)})); else delete raw.effects;
  if (Array.isArray(raw.results)) raw.results = raw.results.map(r => ({_id: `r${++ids}`, ...resultCreateData(r)}));
  raw.flags = {...(raw.flags ?? {}), [MODULE_ID]: {source: {...sourceMetadata(row.record, row.manifest ? {manifest: row.manifest} : {manifest: M1}, []), managedFields: exportedFields(row.record), pagesDefinition: []}}};
  const d = foundryLike(new Doc(row.record.foundry.document_type, raw)); world.docs.push(d); return d;
}, ...over});
const withRealCreate = world => { const base = world.adapter; world.adapter = (set, over = {}) => base(set, realisticCreate(world)(over)); return world; };

const rec2 = (id, document_type, data, over = {}) => ({id, entity_type: document_type === 'Actor' ? 'Creature' : document_type === 'RollTable' ? 'RollTable' : 'Item', status: 'approved', version: '1.0.0', visibility: 'player', refs: [], provenance: prov, foundry: {document_type, data}, ...over});
const gear = (id, desc) => rec2(id, 'Item', {name: `[TEST] ${id}`, type: 'loot', system: {description: {value: '<p>x</p>'}},
  effects: [{eff_id: 'effect-1', name: `[TEST] ${id} effect`, description: desc, disabled: false, transfer: false, statuses: [], changes: [{key: 'system.attributes.ac.bonus', mode: 'add', value: '1', priority: 20}]}]});
const table = id => rec2(id, 'RollTable', {name: `[TEST] ${id}`, description: '<p>t</p>', formula: '1d2', replacement: true, displayRoll: true,
  results: [{type: 'text', name: 'A', description: '<p>the party&#x27;s pack</p>', weight: 1, range: [1, 1]}, {type: 'text', name: 'B', description: '<p>plain</p>', weight: 1, range: [2, 2]}]});
const records = () => [gear('ITEM-TEST-APOS', '<p>the mount&#x27;s check</p>'), gear('ITEM-TEST-PLAIN', '<p>plain text</p>'), table('TABLE-TEST-TRAVEL')];

test('REPRODUCTION (before the fix): Foundry-style rewriting of &#x27; made 1 tables + item effect differ for ever, and the effect was called a GM edit', async () => {
  const world = withRealCreate(makeWorld({docs: [], overwriteEdited: true}));
  await world.run(set1(records()));
  const plan = world.plan(set1(records()));
  assert.equal(plan.counts.overwrite, 0, JSON.stringify(plan.rows.filter(r => r.group === 'overwrite').map(r => [r.id, r.changes])));
  assert.equal(plan.counts.untouched, 3);
  assert.ok(plan.rows.every(r => r.unchanged), 'every row says Already matches straight after the create');
});

test('a world written before the fix (live text has the plain apostrophe) previews Already matches; nothing is called a GM edit', async () => {
  const world = withRealCreate(makeWorld({docs: [], overwriteEdited: true}));
  await world.run(set1(records()));
  const apos = world.docs.find(d => d.getFlag(MODULE_ID, 'source').sourceId === 'ITEM-TEST-APOS');
  assert.equal(apos.raw.effects[0].description, '<p>the mount\'s check</p>');
  const plan = world.plan(set1(records()));
  assert.equal(plan.lost, 0);
  assert.equal(plan.rows.filter(r => r.group === 'overwrite').length, 0);
});

test('a real change still shows, converges after one Apply, and "GM edit replaced" is only said for a real edit', async () => {
  const world = withRealCreate(makeWorld({docs: [], overwriteEdited: true}));
  await world.run(set1(records()));
  const changed = records(); changed[0].foundry.data.effects[0].description = '<p>the mount&#x27;s check, now +2</p>'; changed[2].foundry.data.results[1].description = '<p>changed</p>';
  const plan = world.plan(set1(changed));
  const row = id => plan.rows.find(r => r.id === id);
  assert.equal(row('ITEM-TEST-APOS').group, 'overwrite'); assert.equal(row('ITEM-TEST-APOS').lost, 0, 'the GM never edited the effect');
  assert.equal(row('TABLE-TEST-TRAVEL').group, 'overwrite');
  await world.run(set1(changed));
  const again = world.plan(set1(changed));
  assert.equal(again.counts.overwrite, 0); assert.ok(again.rows.every(r => r.unchanged), 'Already matches after one Apply');
  // an effect the GM really edited is still reported as an edit
  const apos = world.docs.find(d => d.getFlag(MODULE_ID, 'source').sourceId === 'ITEM-TEST-APOS');
  apos.raw.effects[0].changes[0].value = '9';
  const edited = world.plan(set1(changed)).rows.find(r => r.id === 'ITEM-TEST-APOS');
  assert.equal(edited.group, 'overwrite'); assert.ok(edited.lost > 0, 'a real GM edit is still counted');
});

test('status draft -> approved is a one-time metadata refresh that converges', async () => {
  const world = withRealCreate(makeWorld({docs: [], overwriteEdited: true}));
  const drafts = records().map(r => ({...r, status: 'draft'}));
  await world.run(set1(drafts));
  const approved = records();
  const plan = world.plan(set1(approved));
  assert.equal(plan.metadataRefreshes, 3);
  await world.run(set1(approved));
  const after = world.plan(set1(approved));
  assert.equal(after.metadataRefreshes, 0); assert.ok(after.rows.every(r => r.unchanged));
});

const cre = (id, name, status) => rec2(id, 'Actor', {name, type: 'npc', img: 'icons/test/a.webp', prototypeToken: {disposition: -1, texture: {src: 'icons/test/a.webp'}},
  system: {abilities: {str: {value: 10}}, attributes: {ac: {flat: 12}, hp: {value: 20, max: 20, temp: 0}}}, items: []}, {status});
test('creatures: approved ones are Will create; drafts are left out unless the profile includes drafts; a same-name unmanaged Actor blocks a create', () => {
  const recs = [cre('CRE-TEST-MULE', '[TEST] Mule', 'approved'), cre('CRE-TEST-OX', '[TEST] Ox', 'draft')];
  const by = (plan, id) => plan.rows.find(r => r.id === id);
  const safe = makeWorld({includeDrafts: false}).plan(set1(recs));
  assert.equal(by(safe, 'CRE-TEST-MULE').group, 'create');
  assert.equal(by(safe, 'CRE-TEST-OX').group, 'untouched'); assert.match(by(safe, 'CRE-TEST-OX').reason, /Unapproved record/);
  const dev = makeWorld({includeDrafts: true}).plan(set1(recs));
  assert.equal(by(dev, 'CRE-TEST-OX').group, 'create');
  const clash = makeWorld({includeDrafts: true, docs: [new Doc('Actor', {name: '[TEST] Ox', type: 'npc'})]}).plan(set1(recs));
  assert.equal(by(clash, 'CRE-TEST-OX').group, 'untouched'); assert.match(by(clash, 'CRE-TEST-OX').reason, /unmanaged document with this name/);
  assert.equal(by(clash, 'CRE-TEST-MULE').group, 'create');
});

test('0.72.2 version', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
  assert.equal(m.version, '0.72.2'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.72.2/ashen-gate-manager.zip'));
});
