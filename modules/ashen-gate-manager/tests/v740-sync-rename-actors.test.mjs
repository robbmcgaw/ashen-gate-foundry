import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata, replacingSourceFlag} from '../scripts/source-projection.mjs';

import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, phraseRequired, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, writeRename, buildSyncBackup} from '../scripts/sync-apply.js';
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
  const ctx = () => ({includeDrafts, deleteUnscoped, overwriteEdited, retiredIds: world.retired, ledger: world.ledger, buildFlag: sourceOf, externalIds: new Set(), updateExternal: true,
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

// ---------------------------------------------------------------- rename propagation

const RENAMES = {
  JournalEntry: [jr('JRN-OUTPOST', 'Western Receiving Outpost'), jr('JRN-OUTPOST', 'Western Expedition Outpost')],
  Item: [item('MAT-ROPE', 'Rope'), item('MAT-ROPE', 'Hemp Rope', {description: {value: '<p>Rope</p>'}})],
  Actor: [npc('NPC-SERA', 'Sera Kest'), npc('NPC-SERA', 'Sera Kest-Vael')],
  RollTable: [tbl('TBL-RUMORS', 'Rumors'), tbl('TBL-RUMORS', 'Road Rumors')],
  Macro: [mac('MAC-PING', 'Ping'), mac('MAC-PING', 'Ping Party')]
};
for (const [kind, [before, after]] of Object.entries(RENAMES)) {
  test(`${kind}: a name changed in the package shows as a Rename, applies without the phrase, keeps the same document and is not repeated`, async () => {
    const doc = kind === 'Actor' ? npcDoc(before) : flagged(before);
    doc.raw.folder = 'F9'; doc.raw.ownership = {default: 2, u1: 3};
    const world = makeWorld({docs: [doc], overwriteEdited: false});
    const set = set1([after]);
    const plan = world.plan(set);
    const row = plan.rows.find(r => r.id === before.id);
    assert.equal(row.group, 'rename', JSON.stringify(plan.rows.map(r => [r.group, r.reason])));
    assert.deepEqual(row.rename, {from: before.foundry.data.name, to: after.foundry.data.name});
    assert.equal(plan.counts.rename, 1); assert.equal(plan.counts.overwrite, 0);
    assert.equal(phraseRequired(plan), false); assert.equal(plan.renameOnly, true); assert.equal(plan.buttonLabel, 'Rename 1 record'); assert.equal(plan.destructive, false);
    const out = await executeSync(plan, world.adapter(set, {extraUpdate: () => ({'ownership.default': 3})}), {user: GM, confirmation: ''});
    assert.equal(out.counts.failed, 0, JSON.stringify(out.log)); assert.equal(out.counts.renamed, 1);
    assert.equal(world.docs.length, 1, 'no duplicate was created');
    assert.equal(doc.raw.name, after.foundry.data.name);
    assert.equal(doc.raw.folder, 'F9'); assert.deepEqual(doc.raw.ownership, {default: 2, u1: 3}); assert.equal(doc.id, doc.raw._id);
    assert.equal(doc.raw.flags[MODULE_ID].source.sourceId, before.id);
    const again = world.plan(set);
    assert.equal(again.counts.rename, 0); assert.equal(again.rows.find(r => r.id === before.id).group, 'untouched');
    assert.equal(again.rows.find(r => r.id === before.id).unchanged, true);
  });
}

test('a rename with other changes is an ordinary Overwrite (phrase needed) that says it also renames', async () => {
  const world = makeWorld({docs: [flagged(jr('JRN-OUTPOST', 'Western Receiving Outpost', '<p>old</p>'))], overwriteEdited: false});
  const plan = world.plan(set1([jr('JRN-OUTPOST', 'Western Expedition Outpost', '<p>new</p>')]));
  const row = plan.rows[0];
  assert.equal(row.group, 'overwrite'); assert.match(row.reason, /Also renamed: Western Receiving Outpost → Western Expedition Outpost/);
  assert.equal(plan.counts.rename, 0); assert.equal(phraseRequired(plan), true);
  await assert.rejects(() => executeSync(plan, world.adapter(set1([jr('JRN-OUTPOST', 'Western Expedition Outpost', '<p>new</p>')])), {user: GM, confirmation: ''}), /Type "Replace content from package" to confirm/);
});

test('a name the GM changed by hand is not renamed; the record is kept, and only the option lets the package win', async () => {
  const doc = flagged(jr('JRN-OUTPOST', 'Western Receiving Outpost'));
  doc.raw.name = 'The Wardens\' Outpost';
  const set = set1([jr('JRN-OUTPOST', 'Western Expedition Outpost')]);
  let world = makeWorld({docs: [doc], overwriteEdited: false});
  let plan = world.plan(set);
  assert.equal(plan.counts.rename, 0); assert.equal(plan.rows[0].group, 'untouched'); assert.equal(plan.rows[0].keptEdited, true);
  assert.equal(phraseRequired(plan), true === (plan.rows.some(r => r.group === 'rename')) ? false : true);
  world = makeWorld({docs: [doc], overwriteEdited: true});
  plan = world.plan(set);
  assert.equal(plan.rows[0].group, 'overwrite'); assert.equal(plan.rows[0].changes.find(c => c.path === 'name').gmEdited, true);
  assert.equal(plan.counts.rename, 0, 'replacing a GM name is a replacement, so it needs the phrase');
  assert.equal(phraseRequired(plan), true);
  const out = await executeSync(plan, world.adapter(set), {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(out.counts.failed, 0); assert.equal(doc.raw.name, 'Western Expedition Outpost');
});

test('a record kept because the GM edited it still gets its rename: only the name is written, the GM edit and everything else stay', async () => {
  const doc = flagged(jr('JRN-OUTPOST', 'Western Receiving Outpost', '<p>package text</p>'));
  doc.raw.pages[0]._id = 'pg1'; doc.raw.pages[0].text.content = '<p>my own notes</p>'; doc.raw.folder = 'F2';
  const set = set1([jr('JRN-OUTPOST', 'Western Expedition Outpost', '<p>package text</p>')]);
  const world = makeWorld({docs: [doc], overwriteEdited: false});
  const plan = world.plan(set);
  const kinds = plan.rows.map(r => r.group).sort();
  assert.deepEqual(kinds, ['rename', 'untouched']);
  const rename = plan.rows.find(r => r.group === 'rename'), kept = plan.rows.find(r => r.group === 'untouched');
  assert.equal(rename.partial, true); assert.equal(kept.keptEdited, true);
  assert.ok(!kept.changes.some(c => c.path === 'name'), 'the kept row no longer lists the name');
  assert.equal(phraseRequired(plan), false);
  const before = clone(doc.raw);
  const out = await executeSync(plan, world.adapter(set), {user: GM, confirmation: ''});
  assert.equal(out.counts.failed, 0); assert.equal(out.counts.renamed, 1);
  assert.equal(doc.raw.name, 'Western Expedition Outpost');
  assert.equal(doc.raw.pages[0].text.content, '<p>my own notes</p>'); assert.equal(doc.raw.folder, 'F2');
  assert.equal(doc.raw.flags[MODULE_ID].source.managedFields.name, 'Western Expedition Outpost', 'the baseline name moved with it');
  assert.equal(doc.raw.flags[MODULE_ID].source.syncMemo, before.flags[MODULE_ID].source.syncMemo, 'no stamp: the GM edit is not remembered as normal');
  assert.deepEqual(doc.writes.at(-1), {name: 'Western Expedition Outpost', [`flags.${MODULE_ID}.source.managedFields.name`]: 'Western Expedition Outpost'});
  const again = world.plan(set);
  assert.equal(again.counts.rename, 0); assert.equal(again.counts.keptEdited, 1);
});

test('a rename onto the name of an unmanaged document is refused, not written', () => {
  const doc = flagged(jr('JRN-OUTPOST', 'Western Receiving Outpost'));
  const mine = new Doc('JournalEntry', {name: 'Western Expedition Outpost', pages: []});
  const world = makeWorld({docs: [doc, mine], overwriteEdited: false});
  const plan = world.plan(set1([jr('JRN-OUTPOST', 'Western Expedition Outpost')]));
  assert.equal(plan.counts.rename, 0);
  const row = plan.rows.find(r => r.id === 'JRN-OUTPOST');
  assert.equal(row.refused, true); assert.match(row.reason, /Not renamed to Western Expedition Outpost: an unmanaged document/);
});

test('with no baseline name (nothing records the last import) a changed name is not called a rename', () => {
  const doc = flagged(jr('JRN-OUTPOST', 'Western Receiving Outpost'));
  delete doc.raw.flags[MODULE_ID].source.managedFields.name;
  const plan = makeWorld({docs: [doc], overwriteEdited: false}).plan(set1([jr('JRN-OUTPOST', 'Western Expedition Outpost')]));
  assert.equal(plan.counts.rename, 0);
});

test('renames run without a phrase only when nothing else is written; a mixed plan (even with a forged flag) and a player are refused', async () => {
  const set = set1([jr('JRN-A', 'New A'), item('MAT-B', 'Rope', {price: {value: 9}})]);
  const docs = () => [flagged(jr('JRN-A', 'Old A')), flagged(item('MAT-B', 'Rope'))];
  const mixedWorld = makeWorld({docs: docs(), overwriteEdited: false});
  const mixed = mixedWorld.plan(set);
  assert.equal(mixed.counts.rename, 1); assert.equal(mixed.counts.overwrite, 1); assert.equal(phraseRequired(mixed), true);
  await assert.rejects(() => executeSync(mixed, mixedWorld.adapter(set), {user: GM, confirmation: ''}), /to confirm/);
  mixed.renameOnly = true; // a forged flag changes nothing: the rule is read from the rows
  await assert.rejects(() => executeSync(mixed, mixedWorld.adapter(set), {user: GM, confirmation: ''}), /to confirm/);
  const only = makeWorld({docs: [flagged(jr('JRN-A', 'Old A'))], overwriteEdited: false});
  const onlySet = set1([jr('JRN-A', 'New A')]);
  await assert.rejects(() => executeSync(only.plan(onlySet), only.adapter(onlySet), {user: PLAYER, confirmation: ''}), /Only a GM/);
  const plan = only.plan(onlySet);
  // Nothing was written by any refusal.
  assert.equal(only.docs[0].raw.name, 'Old A');
  // writeRename is GM-only at the write too, and never touches a character sheet.
  await assert.rejects(() => writeRename(only.docs[0], plan.rows.find(r => r.group === 'rename'), {user: PLAYER}), /Only a GM/);
  const pc = flagged(npc('NPC-PC', 'Hero', {type: 'character'}));
  pc.raw.type = 'character';
  await assert.rejects(() => writeRename(pc, {id: 'NPC-PC', ops: {rename: {from: 'Hero', to: 'Zero'}}}, {user: GM}), /Character sheets are never changed/);
  await assert.rejects(() => writeRename(only.docs[0], {id: 'JRN-A', ops: {rename: {from: 'Old A', to: 'X'}}}, {user: GM}).then(() => writeRename(only.docs[0], {id: 'JRN-A', ops: {rename: {from: 'Old A', to: 'Y'}}}, {user: GM})), /name changed since the preview/);
});

test('the rename-only window: Renames fold with Old → New, no phrase box, a plain primary button that is enabled; a mixed plan keeps the phrase', () => {
  const view = plan => syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, recreateTypeChange: false, updateActors: false, isGM: true, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', shown: {}});
  const only = makeWorld({docs: [flagged(jr('JRN-A', 'Western Receiving Outpost'))], overwriteEdited: false}).plan(set1([jr('JRN-A', 'Western Expedition Outpost')]));
  const html = view(only);
  assert.match(html, /<span class="ag-fold__title">Renames<\/span><span class="ag-fold__count">1</);
  assert.match(html, /Western Receiving Outpost → Western Expedition Outpost/);
  assert.doesNotMatch(html, /data-ag-sync-phrase/); assert.match(html, /Only renames\./);
  assert.match(html, /ag-btn--primary" data-ag-action="sync-run" data-ag-sync-run >/); assert.match(html, /Rename 1 record/);
  assert.match(html, /<strong>1<\/strong> rename</);
  const mixedPlan = makeWorld({docs: [flagged(jr('JRN-A', 'Old A')), flagged(item('MAT-B', 'Rope'))], overwriteEdited: false}).plan(set1([jr('JRN-A', 'New A'), item('MAT-B', 'Rope', {price: {value: 9}})]));
  assert.match(view(mixedPlan), /data-ag-sync-phrase/);
});

test('the backup of a rename-only run holds the document as it was', () => {
  const world = makeWorld({docs: [flagged(jr('JRN-A', 'Old A'))], overwriteEdited: false});
  const plan = world.plan(set1([jr('JRN-A', 'New A')]));
  const backup = buildSyncBackup(plan);
  assert.equal(backup.documents.length, 1); assert.equal(backup.documents[0].sync_action, 'rename'); assert.equal(backup.documents[0].raw.name, 'Old A');
});

test('a hand-off record (a Location) says it was renamed since the last hand-off', async () => {
  const {readFile} = await import('node:fs/promises');
  const {createApi} = await import('../../ashen-gate-locations/scripts/api.mjs');
  const {playerView} = await import('../../ashen-gate-locations/scripts/model.mjs');
  const {packFileName} = await import('../../../scripts/build-test-pack.mjs');
  const pack = JSON.parse(await readFile(new URL(`../../../test-fixtures/playtest/${packFileName()}`, import.meta.url), 'utf8'));
  const state = {stored: []};
  const locApi = createApi({version: 'test', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(state.stored), writeAll: async list => { state.stored = list; }, readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  const world = makeWorld({overwriteEdited: false}); world.apis.locations = locApi; world.apis.routes = locApi;
  const first = buildSyncSet([{filename: 'pack.json', kind: 'manager', payload: pack}]);
  assert.equal((await world.run(first)).counts.failed, 0);
  const loc = pack.records.find(r => r.entity_type === 'Location');
  const renamed = structuredClone(pack);
  const target = renamed.records.find(r => r.id === loc.id);
  const old = target.location?.name ?? target.name;
  if (target.location) target.location.name = 'Western Expedition Outpost'; else target.name = 'Western Expedition Outpost';
  const row = world.plan(buildSyncSet([{filename: 'pack.json', kind: 'manager', payload: renamed}])).rows.find(r => r.id === loc.id);
  assert.equal(row.group, 'overwrite');
  assert.ok(row.reason.startsWith(`Renamed in the package: ${old} → Western Expedition Outpost.`), row.reason);
});

// ---------------------------------------------------------------- Also update Actors from the package

const sera = (over = {}, items) => npc('NPC-SERA', 'Sera Kest', {img: 'icons/test/a.webp', prototypeToken: {disposition: -1, texture: {src: 'icons/test/a.webp'}, sight: {enabled: false}},
  system: {abilities: {str: {value: 10}, dex: {value: 10}}, attributes: {ac: {flat: 12}, hp: {value: 20, max: 20, temp: 0}}, details: {biography: {value: '<p>old bio</p>'}}, skills: {ath: {value: 0}}},
  items: items ?? [{name: 'Dagger', type: 'weapon', system: {description: {value: 'Old dagger'}, quantity: 1, uses: {spent: 0}}}, {name: 'Old Trick', type: 'feat', system: {description: {value: 'Gone soon'}}}], ...over});
const seraNew = () => sera({
  system: {abilities: {str: {value: 16}, dex: {value: 10}}, attributes: {ac: {flat: 15}, hp: {value: 40, max: 40, temp: 0}}, details: {biography: {value: '<p>new bio</p>'}}, skills: {ath: {value: 1}}},
  img: 'icons/test/a.webp'
}, [{name: 'Dagger', type: 'weapon', system: {description: {value: 'Keen dagger'}, quantity: 1, uses: {spent: 0}}}, {name: 'Parry', type: 'feat', system: {description: {value: 'New reaction'}}}]);
const seraWorld = () => {
  const d = npcDoc(sera(), {folder: 'FOLDER-NPC', ownership: {default: 0, user1: 3}});
  d.raw.name = 'Sera Kest'; d.raw.img = 'my/portrait.webp'; d.raw.prototypeToken.texture.src = 'my/token.webp'; d.raw.prototypeToken.sight = {enabled: true};
  d.raw.system.attributes.hp.value = 7; d.raw.system.abilities.dex.value = 14; // damaged; GM raised dex (package never changed it)
  d.raw.system.details.biography.value = '<p>my table notes</p>';
  d.raw.items.push({_id: 'mine', name: 'Lucky Coin', type: 'loot', system: {description: {value: 'GM added'}}, flags: {}});
  d.raw.items[0].system.uses = {spent: 2}; d.raw.items[0].system.quantity = 3;
  return d;
};

test('switch off: Actors are planned exactly as before (an edited Actor is kept, nothing is flagged as an Actor update)', () => {
  const plan = makeWorld({docs: [seraWorld()], overwriteEdited: false}).plan(set1([seraNew()]));
  const same = makeWorld({docs: [seraWorld()], overwriteEdited: false, extra: {updateActors: false}}).plan(set1([seraNew()]));
  assert.deepEqual(plan.rows.map(r => [r.group, r.reason]), same.rows.map(r => [r.group, r.reason]));
  assert.equal(plan.rows[0].group, 'untouched'); assert.equal(plan.rows[0].keptEdited, true);
  assert.equal(plan.counts.actorUpdates, 0); assert.ok(plan.rows.every(r => !r.actorUpdate)); assert.equal(plan.updateActors, false);
});

test('switch on: the new stat block is written; art, token settings, ownership, folder, notes, GM items, damage and uses are kept; idempotent', async () => {
  const doc = seraWorld();
  const world = makeWorld({docs: [doc], overwriteEdited: false, extra: {updateActors: true}});
  const set = set1([seraNew()]);
  const plan = world.plan(set);
  const row = plan.rows[0];
  assert.equal(row.group, 'overwrite'); assert.equal(row.actorUpdate, true); assert.equal(plan.counts.actorUpdates, 1);
  const paths = row.changes.map(c => c.path);
  for (const p of ['system.abilities.str.value', 'system.attributes.ac.flat', 'system.attributes.hp.max', 'system.skills.ath.value']) assert.ok(paths.includes(p), `${p} in ${paths}`);
  for (const p of ['img', 'prototypeToken.texture.src', 'prototypeToken.sight.enabled', 'system.details.biography.value', 'system.abilities.dex.value', 'system.attributes.hp.value']) assert.ok(!paths.includes(p), `${p} must not be written`);
  assert.ok(paths.includes('items.weapon:Dagger')); assert.ok(paths.includes('items.feat:Parry')); assert.ok(paths.includes('items.feat:Old Trick'));
  assert.equal(phraseRequired(plan), true, 'an Actor update asks for the phrase');
  assert.equal(plan.buttonLabel, 'Replace 1 record');
  const before = clone(doc.raw);
  const out = await executeSync(plan, world.adapter(set, {extraUpdate: () => ({'ownership.default': 2})}), {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(out.counts.failed, 0, JSON.stringify(out.log));
  const raw = doc.raw;
  assert.equal(raw.system.abilities.str.value, 16); assert.equal(raw.system.attributes.ac.flat, 15); assert.equal(raw.system.attributes.hp.max, 40); assert.equal(raw.system.skills.ath.value, 1);
  assert.equal(raw.system.abilities.dex.value, 14, 'a GM edit of a field the package did not change stays');
  assert.equal(raw.system.attributes.hp.value, 7, 'a damaged NPC keeps its current HP');
  assert.equal(raw.img, 'my/portrait.webp'); assert.equal(raw.prototypeToken.texture.src, 'my/token.webp'); assert.equal(raw.prototypeToken.sight.enabled, true);
  assert.equal(raw.folder, 'FOLDER-NPC'); assert.deepEqual(raw.ownership, {default: 0, user1: 3});
  assert.equal(raw.system.details.biography.value, '<p>my table notes</p>');
  const names = raw.items.map(i => i.name).sort();
  assert.deepEqual(names, ['Dagger', 'Lucky Coin', 'Parry']);
  const dagger = raw.items.find(i => i.name === 'Dagger');
  assert.equal(dagger.system.description.value, 'Keen dagger'); assert.deepEqual(dagger.system.uses, {spent: 2}); assert.equal(dagger.system.quantity, 3);
  assert.equal(raw.items.find(i => i.name === 'Parry').flags[MODULE_ID][ITEM_FLAG], 'feat:Parry');
  assert.equal(world.docs.length, 1);
  // Idempotent: the next preview has nothing to do and a re-run writes nothing.
  const again = world.plan(set);
  assert.equal(again.rows[0].group, 'untouched', again.rows[0].reason); assert.equal(again.rows[0].unchanged, true);
  const writes = doc.writes.length;
  const rerun = await executeSync(again, world.adapter(set), {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(rerun.counts.failed, 0); assert.equal(doc.writes.length, writes);
  void before;
  // What the update kept is not remembered as "normal": with the switch off again, the GM's dex edit still shows as an edit.
  const off = makeWorld({docs: [doc], overwriteEdited: false}).plan(set);
  assert.equal(off.rows[0].keptEdited, true); assert.match(off.rows[0].reason, /system\.abilities\.dex\.value/);
  assert.ok(!JSON.parse(doc.raw.flags[MODULE_ID].source.syncMemo ?? '{}')['system.abilities.dex.value']);
});

test('switch on: an undamaged NPC follows the package HP and an untouched biography follows the package; a lowered maximum never leaves HP above it', async () => {
  const fresh = npcDoc(sera());
  const world = makeWorld({docs: [fresh], overwriteEdited: false, extra: {updateActors: true}});
  const set = set1([seraNew()]);
  assert.equal((await world.run(set)).counts.failed, 0);
  assert.equal(fresh.raw.system.attributes.hp.value, 40); assert.equal(fresh.raw.system.details.biography.value, '<p>new bio</p>');
  const hurt = npcDoc(sera());
  hurt.raw.system.attributes.hp.value = 18;
  const small = sera({system: {abilities: {str: {value: 10}, dex: {value: 10}}, attributes: {ac: {flat: 12}, hp: {value: 12, max: 12, temp: 0}}, details: {biography: {value: '<p>old bio</p>'}}, skills: {ath: {value: 0}}}});
  const w2 = makeWorld({docs: [hurt], overwriteEdited: false, extra: {updateActors: true}});
  assert.equal((await w2.run(set1([small]))).counts.failed, 0);
  assert.equal(hurt.raw.system.attributes.hp.max, 12); assert.equal(hurt.raw.system.attributes.hp.value, 12);
});

test('switch on: a field both you and the package changed is replaced and counted as a GM edit', () => {
  const doc = npcDoc(sera()); doc.raw.system.attributes.ac.flat = 18;
  const plan = makeWorld({docs: [doc], overwriteEdited: false, extra: {updateActors: true}}).plan(set1([seraNew()]));
  const ac = plan.rows[0].changes.find(c => c.path === 'system.attributes.ac.flat');
  assert.equal(ac.gmEdited, true); assert.ok(plan.lost >= 1);
});

test('switch on: an embedded item whose type changed is replaced (the package-marked one is deleted, a new one created); the GM\'s own items are never deleted', async () => {
  const asWeapon = npcDoc(sera({}, [{name: 'Parry', type: 'weapon', system: {description: {value: 'x'}}}]));
  asWeapon.raw.items.push({_id: 'mine2', name: 'Parry', type: 'loot', system: {}, flags: {}}); // the GM's own item, not marked
  const world = makeWorld({docs: [asWeapon], overwriteEdited: false, extra: {updateActors: true}});
  const set = set1([sera({}, [{name: 'Parry', type: 'feat', system: {description: {value: 'x'}}}])]);
  const plan = world.plan(set);
  assert.deepEqual(plan.rows[0].ops.items.delete, ['i0']); assert.equal(plan.rows[0].ops.items.create.length, 1);
  assert.equal((await executeSync(plan, world.adapter(set), {user: GM, confirmation: SYNC_PHRASE})).counts.failed, 0);
  const items = asWeapon.raw.items;
  assert.equal(items.length, 2); assert.ok(items.some(i => i._id === 'mine2'), 'the GM item stays');
  const made = items.find(i => i._id !== 'mine2');
  assert.equal(made.type, 'feat'); assert.equal(made.flags[MODULE_ID][ITEM_FLAG], 'feat:Parry');
  const again = world.plan(set);
  assert.equal(again.rows[0].group, 'untouched', again.rows[0].reason);
});

test('switch on: refusals stay (character sheets, an unmanaged Actor with the same name, a record that is not approved) and a player cannot write', async () => {
  const pc = flagged(npc('NPC-SERA', 'Sera Kest')); pc.raw.type = 'character';
  const set = set1([seraNew()]);
  const plan = makeWorld({docs: [pc], overwriteEdited: false, extra: {updateActors: true}}).plan(set);
  assert.equal(plan.rows[0].group, 'untouched'); assert.match(plan.rows[0].reason, /Character sheets are never changed by Sync/);
  const mine = new Doc('Actor', {name: 'Barkat', type: 'npc', system: {}});
  const p2 = makeWorld({docs: [mine], overwriteEdited: false, extra: {updateActors: true}}).plan(set1([npc('NPC-BARKAT', 'Barkat')]));
  assert.equal(p2.rows[0].refused, true); assert.match(p2.rows[0].reason, /unmanaged document with this name/);
  const doc = seraWorld();
  const world = makeWorld({docs: [doc], overwriteEdited: false, extra: {updateActors: true}});
  const good = world.plan(set);
  await assert.rejects(() => executeSync(good, world.adapter(set), {user: PLAYER, confirmation: SYNC_PHRASE}), /Only a GM/);
  await assert.rejects(() => writeOverwrite(doc, good.rows[0], {user: PLAYER, flag: {}}), /Only a GM/);
  await assert.rejects(() => executeSync(good, world.adapter(set), {user: GM, confirmation: ''}), /to confirm/);
  assert.equal(doc.raw.system.abilities.str.value, 10, 'nothing was written by the refusals');
  // The Actors the switch is for: five records, one preview group with a count.
  const five = ['Sera Kest', 'Tessa', 'Dorran', 'Barkat', 'Maelin Rook'].map((n, i) => npc(`NPC-T${i}`, n));
  const docs = five.map(r => npcDoc(r));
  const next = five.map(r => npc(r.id, r.foundry.data.name, {system: {abilities: {str: {value: 18}}, attributes: {ac: {flat: 16}, hp: {value: 30, max: 30, temp: 0}}, details: {biography: {value: '<p>bio</p>'}}}}));
  const w5 = makeWorld({docs, overwriteEdited: false, extra: {updateActors: true}});
  const p5 = w5.plan(set1(next));
  assert.equal(p5.counts.actorUpdates, 5);
  const html = syncView({inputs: [], skipped: [], fileButton: '', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, recreateTypeChange: false, updateActors: true, isGM: true, plan: p5, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', shown: {}});
  assert.match(html, /<span class="ag-fold__title">Actor updates<\/span><span class="ag-fold__count">5</);
  assert.match(html, /data-ag-sync-actors checked/); assert.match(html, /<strong>5<\/strong> Actor updates/); assert.match(html, /On: updating Actors from the package/);
  assert.match(html, /data-ag-sync-phrase/);
});

test('wiring: the switch is off by default, GM-gated where it is read, dropped on change, and versioned', () => {
  const main = read('../scripts/main.js'), view = read('../scripts/sync-view.js'), hbs = read('../scripts/sync-apply.js');
  assert.match(main, /updateActors:false, archiveMissing:false, updateExternal:false, phrase:''/);
  assert.match(main, /this\.sync\.updateActors=Boolean\(event\.target\.checked\)&&Boolean\(game\.user\?\.isGM\)/);
  assert.match(main, /updateActors:Boolean\(this\.sync\.updateActors&&game\.user\?\.isGM\)/);
  assert.match(main, /phraseRequired\(plan\)&&!phraseOk\(this\.sync\.phrase\)/);
  assert.match(view, /Also update Actors from the package/); assert.match(hbs, /phraseRequired\(plan\) && !phraseOk\(confirmation\)/);
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.85.3'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.85.3/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.74\.0 /m); assert.match(read('../README.md'), /Also update Actors from the package/);
  assert.match(main, /Also update Actors from the package/, 'Help mentions it');
});
