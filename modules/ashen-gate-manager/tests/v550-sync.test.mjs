import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID, exportedFields} from '../scripts/core.js';
import {sourceMetadata} from '../scripts/source-projection.mjs';
import {itemKeys, ITEM_FLAG, ACTOR_ITEMS_FLAG} from '../scripts/actor-update.js';
import {buildSyncSet, makeSnapshot, nameIndex, planSync, SYNC_PHRASE, phraseOk, compareVersions, ledgerKey} from '../scripts/sync.js';
import {executeSync, writeOverwrite, removeDoc, assertSyncTarget, buildSyncBackup} from '../scripts/sync-apply.js';

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

test('matches by permanent id, never by name', () => {
  const old = item('MAT-ROPE', 'Rope');
  const world = makeWorld({docs: [flagged(old, M1), new Doc('Item', {name: 'Shiny', type: 'loot', system: {}})]});
  // The package renames the record and also ships a new record named like the unflagged world item.
  const plan = world.plan(set1([item('MAT-ROPE', 'Hemp Rope'), item('MAT-SHINY', 'Shiny')]));
  const byId = Object.fromEntries(plan.rows.map(r => [r.id, r]));
  assert.equal(byId['MAT-ROPE'].group, 'overwrite');
  assert.ok(byId['MAT-ROPE'].changes.some(c => c.path === 'name'));
  assert.equal(byId['MAT-SHINY'].group, 'untouched', 'a same-name unmanaged document blocks creating a duplicate');
  assert.match(byId['MAT-SHINY'].reason, /unmanaged/);
});

test('package wins: GM edits are overwritten and counted; play-state fields of an NPC are kept', async () => {
  const rope = item('MAT-ROPE', 'Rope'), orc = npc('NPC-ORC', 'Orc');
  const doc = flagged(rope, M1);
  doc.raw.system.price.value = 999; // GM edit
  const actor = flagged(orc, M1);
  actor.raw.system.attributes.hp.value = 3; actor.raw.system.attributes.hp.temp = 5; actor.raw.system.details.biography.value = '<p>my notes</p>';
  const key = itemKeys(orc.foundry.data.items)[0];
  actor.raw.items = [{_id: 'i1', ...clone(orc.foundry.data.items[0]), flags: {[MODULE_ID]: {[ITEM_FLAG]: key}}}, {_id: 'p1', name: 'Rope', type: 'loot', system: {}, flags: {}}];
  actor.raw.items[0].system.quantity = 4; actor.raw.items[0].system.description.value = 'GM edit';
  actor.raw.system.abilities.str.value = 8; // GM edit to a definition field
  actor.raw.flags[MODULE_ID][ACTOR_ITEMS_FLAG] = {version: 1};
  const world = makeWorld({docs: [doc, actor]});
  const newOrc = npc('NPC-ORC', 'Orc', {system: {abilities: {str: {value: 16}}, attributes: {ac: {flat: 15}, hp: {value: 30, max: 40, temp: 0}}, details: {biography: {value: '<p>new bio</p>'}}}});
  newOrc.foundry.data.items = [{name: 'Claw', type: 'weapon', system: {description: {value: 'Sharper claw'}, quantity: 1, uses: {spent: 0}}}];
  const set = set1([item('MAT-ROPE', 'Rope', {price: {value: 5}}), newOrc]);
  const plan = world.plan(set);
  assert.equal(plan.counts.overwrite, 2);
  assert.ok(plan.lost >= 3, `lost GM edits counted (${plan.lost})`);
  const out = await world.run(set);
  assert.equal(out.counts.failed, 0);
  assert.equal(doc.raw.system.price.value, 5, 'GM edit overwritten');
  assert.equal(actor.raw.system.abilities.str.value, 16);
  assert.equal(actor.raw.system.attributes.ac.flat, 15);
  assert.equal(actor.raw.system.attributes.hp.max, 40, 'max HP follows the package');
  assert.equal(actor.raw.system.attributes.hp.value, 3, 'current HP kept');
  assert.equal(actor.raw.system.attributes.hp.temp, 5, 'temp HP kept');
  assert.equal(actor.raw.system.details.biography.value, '<p>my notes</p>', 'GM notes kept');
  assert.equal(actor.raw.items[0].system.description.value, 'Sharper claw');
  assert.equal(actor.raw.items[0].system.quantity, 4, 'item quantity is play state');
  assert.ok(actor.raw.items.some(i => i._id === 'p1'), 'player-added item stays');
});

test('a character sheet is never written, whatever the package says', async () => {
  const hero = npc('NPC-HERO', 'Hero');
  const sheet = flagged(hero, M1);
  sheet.raw.type = 'character'; sheet.raw.system.attributes.hp.value = 1;
  const asChar = clone(hero); asChar.foundry.data.type = 'character';
  const world = makeWorld({docs: [sheet]});
  // 1. package record is an npc, world doc is a character
  let plan = world.plan(set1([hero]));
  assert.equal(plan.rows.find(r => r.id === 'NPC-HERO').group, 'untouched');
  assert.match(plan.rows.find(r => r.id === 'NPC-HERO').reason, /Character sheets are never changed/);
  // 2. package record is a character
  plan = world.plan(set1([asChar]));
  assert.equal(plan.rows.find(r => r.id === 'NPC-HERO').group, 'untouched');
  // 3. the character's id is missing from the package: never deleted, never listed for deletion
  plan = world.plan(set1([item('MAT-X', 'X')]));
  const row = plan.rows.find(r => r.id === 'NPC-HERO');
  assert.equal(row.group, 'untouched');
  assert.match(row.reason, /character sheet/);
  assert.equal(plan.counts.delete, 0);
  await world.run(set1([item('MAT-X', 'X')]));
  assert.deepEqual(sheet.writes, [], 'no write of any kind reached the character');
  // 4. the data layer refuses even if a row is forged
  assert.throws(() => assertSyncTarget(sheet, GM, 'NPC-HERO'), /Character sheets/);
  await assert.rejects(() => removeDoc(sheet, {id: 'NPC-HERO'}, {user: GM}), /Character sheets/);
  await assert.rejects(() => writeOverwrite(sheet, {id: 'NPC-HERO', ops: {fields: {name: 'x'}}}, {user: GM, flag: {}}), /Character sheets/);
});

test('only Manager-flagged documents of the synced package lines are deleted', () => {
  const a = item('MAT-A', 'A'), b = item('MAT-B', 'B'), c = item('SBX-C', 'C'), d = item('MAT-D', 'D');
  const oldLine = flagged(a, M1), gone = flagged(b, M1), sandbox = flagged(c, {...M1, package_id: 'PKG-SANDBOX'});
  const unflagged = new Doc('Item', {name: 'My homebrew', type: 'loot', system: {}});
  const noLine = flagged(d, M1, {packageId: undefined});
  const world = makeWorld({docs: [oldLine, gone, sandbox, unflagged, noLine]});
  const plan = world.plan(set1([a]));
  assert.deepEqual(sorted(plan.rows.filter(r => r.group === 'delete')), ['MAT-B']);
  assert.ok(!plan.rows.some(r => r.name === 'My homebrew'), 'unflagged documents are not even listed');
  assert.ok(!plan.rows.some(r => r.id === 'SBX-C' && r.group === 'delete'), 'another package line is untouched');
  assert.equal(plan.outOfScope.withoutLine, 1);
  assert.ok(plan.notes.some(n => /no package line/.test(n)));
  // "Also delete records not in these files" lets the no-line one go too, still only flagged documents.
  const wider = makeWorld({docs: [oldLine, gone, sandbox, unflagged, noLine], deleteUnscoped: true}).plan(set1([a]));
  assert.deepEqual(sorted(wider.rows.filter(r => r.group === 'delete')), ['MAT-B', 'MAT-D']);
});

test('deletes respect Keep here, protected folders, players, tokens, hotbars and references', () => {
  const mk = (id, over) => { const d = flagged(item(id, id), M1); Object.assign(d.raw, over); return d; };
  const keep = mk('MAT-KEEP', {flags: {[MODULE_ID]: {keepFolder: true, source: flagged(item('MAT-KEEP', 'k'), M1).raw.flags[MODULE_ID].source}}});
  const inFolder = mk('MAT-FOLD', {folder: 'prot'});
  const archived = mk('MAT-ARCH', {}); archived.raw.flags[MODULE_ID].lifecycle = {archived: true};
  const macro = flagged(rec('MAC-RUN', 'Macro', {name: 'Run', type: 'chat', command: 'hi'}), M1);
  const owned = flagged(npc('NPC-PET', 'Pet'), M1); owned.raw.ownership = {default: 0, u1: 3};
  const placed = flagged(npc('NPC-GUARD', 'Guard'), M1);
  const free = flagged(npc('NPC-FREE', 'Free'), M1);
  const target = flagged(item('MAT-TARGET', 'Target'), M1);
  const refs = flagged(item('SBX-REF', 'Refers'), {...M1, package_id: 'PKG-SANDBOX'}, {refs: [{target_id: 'MAT-TARGET', mode: 'required'}]});
  const world = makeWorld({docs: [keep, inFolder, archived, macro, owned, placed, free, target, refs]});
  world.protectedFolders.add('prot'); world.hotbar.add(macro.id); world.tokens.add(placed.id);
  const plan = world.plan(set1([item('MAT-OTHER', 'Other')]));
  assert.deepEqual(sorted(plan.rows.filter(r => r.group === 'delete')), ['NPC-FREE']);
  const why = id => plan.rows.find(r => r.id === id).reason;
  assert.match(why('MAT-KEEP'), /Keep here/);
  assert.match(why('MAT-FOLD'), /protected folder/);
  assert.match(why('MAT-ARCH'), /archived/);
  assert.match(why('MAC-RUN'), /hotbar/);
  assert.match(why('NPC-PET'), /owned by a player/);
  assert.match(why('NPC-GUARD'), /scene/);
  assert.match(why('MAT-TARGET'), /referenced by SBX-REF/);
});

test('deleting a world Item leaves copies on character sheets exactly as they are', async () => {
  const sword = item('MAT-SWORD', 'Sword');
  const worldItem = flagged(sword, M1);
  const hero = new Doc('Actor', {name: 'Hero', type: 'character', items: [{_id: 'c1', name: 'Sword', type: 'loot', flags: {[MODULE_ID]: {source: {sourceId: 'MAT-SWORD'}}}}]});
  const world = makeWorld({docs: [worldItem, hero]});
  const set = set1([item('MAT-OTHER', 'Other')]);
  const plan = world.plan(set);
  assert.deepEqual(sorted(plan.rows.filter(r => r.group === 'delete')), ['MAT-SWORD']);
  const out = await world.run(set);
  assert.equal(out.counts.deleted, 1);
  assert.equal(worldItem.deleted, true);
  assert.deepEqual(hero.writes, []);
  assert.equal(hero.raw.items.length, 1);
});

test('union of two ZIPs: syncing only one never deletes the other, syncing both keeps both', () => {
  const main = item('MAT-MAIN', 'Main'), sbx = item('SBX-ONE', 'Sandbox');
  const docs = () => [flagged(main, M1), flagged(sbx, {...M1, package_id: 'PKG-SANDBOX'}), flagged(item('MAT-OLD', 'Old'), M1)];
  const mainFile = {filename: 'main.json', origin: 'main-pack.zip', kind: 'manager', payload: pkg('PKG-MAIN', '2.0.0', [main])};
  const sbxFile = {filename: 'sbx.json', origin: 'sandbox-pack.zip', kind: 'manager', payload: pkg('PKG-SANDBOX', '0.2.0', [sbx])};
  const onlyMain = makeWorld({docs: docs()}).plan(buildSyncSet([mainFile]));
  assert.deepEqual(sorted(onlyMain.rows.filter(r => r.group === 'delete')), ['MAT-OLD']);
  assert.deepEqual(onlyMain.scope.lines.map(l => l.packageId), ['PKG-MAIN'], 'the preview says which package lines the comparison used');
  const both = makeWorld({docs: docs()}).plan(buildSyncSet([mainFile, sbxFile]));
  assert.deepEqual(both.scope.lines.map(l => l.packageId).sort(), ['PKG-MAIN', 'PKG-SANDBOX']);
  assert.deepEqual(sorted(both.rows.filter(r => r.group === 'delete')), ['MAT-OLD']);
  // A record that moved from the sandbox package into the main one is kept (its id is in the union) and re-lined.
  const moved = makeWorld({docs: [flagged(sbx, {...M1, package_id: 'PKG-SANDBOX'})]}).plan(buildSyncSet([{...mainFile, payload: pkg('PKG-MAIN', '2.0.0', [sbx])}]));
  assert.equal(moved.counts.delete, 0);
  assert.equal(moved.rows.find(r => r.id === 'SBX-ONE').metadataOnly, true);
});

test('an id in two files with different content is refused and its world copy left alone', () => {
  const a1 = item('MAT-A', 'A'), a2 = item('MAT-A', 'A changed');
  const set = buildSyncSet([{filename: 'one.json', kind: 'manager', payload: pkg('PKG-MAIN', '2.0.0', [a1])}, {filename: 'two.json', kind: 'manager', payload: pkg('PKG-SANDBOX', '1.0.0', [a2])}]);
  const world = makeWorld({docs: [flagged(a1, M1)]});
  const plan = world.plan(set);
  assert.equal(plan.rows.find(r => r.id === 'MAT-A').group, 'untouched');
  assert.equal(plan.counts.delete, 0);
  assert.equal(plan.counts.overwrite, 0);
  // identical duplicates are fine
  const dup = buildSyncSet([{filename: 'one.json', kind: 'manager', payload: pkg('PKG-MAIN', '2.0.0', [a1])}, {filename: 'two.json', kind: 'manager', payload: pkg('PKG-SANDBOX', '1.0.0', [a1])}]);
  assert.equal(dup.refusedIds.size, 0);
});

test('running the same sync twice changes nothing the second time; counts equal what was applied', async () => {
  const keep = item('MAT-KEEP', 'Keep'), edit = item('MAT-EDIT', 'Edit'), fresh = item('MAT-NEW', 'New');
  const docs = [flagged(keep, M1), flagged(edit, M1), flagged(item('MAT-GONE', 'Gone'), M1), flagged(npc('NPC-A', 'A'), M1)];
  docs[1].raw.system.price.value = 1;
  const world = makeWorld({docs});
  const set = set1([keep, item('MAT-EDIT', 'Edit'), fresh, npc('NPC-A', 'A', {system: {abilities: {str: {value: 12}}, attributes: {hp: {value: 20, max: 22}}}})]);
  const plan = world.plan(set);
  const expected = {created: plan.counts.create, updated: plan.counts.overwrite, deleted: plan.counts.delete};
  assert.deepEqual(expected, {created: 1, updated: 2, deleted: 1});
  const out = await world.run(set);
  assert.deepEqual({created: out.counts.created, updated: out.counts.updated, deleted: out.counts.deleted}, expected, 'preview counts equal applied counts');
  assert.equal(out.completed, true);
  assert.equal(world.downloads.length, 1, 'one backup was taken first');
  const again = world.plan(set);
  assert.deepEqual([again.counts.create, again.counts.overwrite, again.counts.delete, again.counts.metadataRefreshes], [0, 0, 0, 0]);
  const before = world.docs.map(d => d.writes.length);
  const second = await world.run(set);
  assert.deepEqual(world.docs.map(d => d.writes.length), before, 'no document was written on the second run');
  assert.deepEqual([second.counts.created, second.counts.updated, second.counts.deleted], [0, 0, 0]);
});

test('text Foundry stores differently (rich-text links) is not a perpetual change after the first sync', async () => {
  const withLink = item('MAT-LINK', 'Linked', {description: {value: 'See [[AGREF:MAT-OTHER|Other]].'}});
  const doc = flagged(withLink, M1);
  doc.raw.system.description.value = 'See @UUID[Item.x]{Other}.'; // what Foundry holds after links were bound
  const world = makeWorld({docs: [doc]});
  const set = set1([withLink]);
  const bind = async (rows) => { for (const r of rows) await world.docs.find(d => d.getFlag(MODULE_ID, 'source')?.sourceId === r.id).update({'system.description.value': 'See @UUID[Item.x]{Other}.'}); };
  // Links are bound after the write, as main.js does; the memo then recognises the stored form.
  const plan1 = world.plan(set);
  assert.equal(plan1.counts.overwrite, 1, 'the first sync must write: the stored text is the resolved form');
  await world.run(set, {}, {bindLinks: bind});
  const plan2 = world.plan(set);
  assert.deepEqual([plan2.counts.overwrite, plan2.counts.metadataRefreshes], [0, 0]);
  // A GM edit to that field afterwards is overwritten again.
  doc.raw.system.description.value = 'GM text';
  assert.equal(world.plan(set).counts.overwrite, 1);
});

test('tombstones: a deleted id stays retired; an id that still exists can always be updated', async () => {
  const a = item('MAT-A', 'A'), gone = item('MAT-GONE', 'Gone');
  const world = makeWorld({docs: [flagged(a, M1), flagged(gone, M1)]});
  await world.run(set1([a]));
  assert.ok(world.retired.has('MAT-GONE'));
  const back = world.plan(set1([a, gone]));
  const row = back.rows.find(r => r.id === 'MAT-GONE');
  assert.equal(row.group, 'untouched');
  assert.match(row.reason, /retired/);
  // retired id with a surviving document: still updated
  const survivor = flagged(item('MAT-LIVE', 'Live'), M1); survivor.raw.system.price.value = 77;
  const w2 = makeWorld({docs: [survivor], retired: ['MAT-LIVE']});
  assert.equal(w2.plan(set1([item('MAT-LIVE', 'Live')])).counts.overwrite, 1);
});

test('refuses without the typed phrase, for non-GMs, and when the world changed since the preview', async () => {
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1)]});
  const set = set1([item('MAT-A', 'A2')]);
  await assert.rejects(() => world.run(set, {confirmation: 'yes'}), /Type "Replace content from package"/);
  await assert.rejects(() => world.run(set, {user: PLAYER}), /Only a GM/);
  assert.equal(phraseOk('  replace CONTENT from package '), true);
  assert.equal(world.docs[0].writes.length, 0);
  const plan = world.plan(set);
  world.docs[0].raw.name = 'changed behind our back'; // plan fingerprint covers the ops, which now differ
  world.docs[0].raw.system.price.value = 1234;
  await assert.rejects(() => executeSync(plan, world.adapter(set), {user: GM, confirmation: SYNC_PHRASE}), /changed since the preview/);
  assert.equal(world.docs[0].writes.length, 0);
});

test('a failed backup stops the run before anything is written', async () => {
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1), flagged(item('MAT-B', 'B'), M1)]});
  const set = set1([item('MAT-A', 'A2')]);
  await assert.rejects(() => world.run(set, {}, {async backup() { throw new Error('download blocked'); }}), /download blocked/);
  assert.ok(world.docs.every(d => !d.deleted && d.writes.length === 0));
  assert.equal(world.retired.size, 0);
});

test('the backup holds the full data of every overwritten and deleted document', async () => {
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1), flagged(item('MAT-B', 'B'), M1)]});
  await world.run(set1([item('MAT-A', 'A2')]));
  const [backup] = world.downloads;
  assert.equal(backup.schema_version, 'ag-foundry-snapshot/0.3');
  assert.deepEqual(backup.documents.map(d => [d.source_id, d.sync_action, d.raw.name]).sort(), [['MAT-A', 'overwrite', 'A'], ['MAT-B', 'delete', 'B']]);
});

test('cancel stops between chunks; running again finishes the job', async () => {
  const records = Array.from({length: 7}, (_, i) => item(`MAT-${i}`, `Item ${i}`));
  const world = makeWorld({docs: records.map(r => flagged({...r, foundry: {...r.foundry, data: {...r.foundry.data, name: 'old'}}}, M1))});
  const set = set1(records);
  const controller = new AbortController();
  const first = await world.run(set, {signal: controller.signal, chunk: 3}, {pause: async () => { controller.abort(); }});
  assert.equal(first.cancelled, true);
  const done = world.docs.filter(d => d.name !== 'old').length;
  assert.ok(done > 0 && done < 7, `partly applied (${done})`);
  const rest = await world.run(set);
  assert.equal(rest.cancelled, false);
  assert.equal(world.plan(set).counts.overwrite, 0);
  assert.equal(rest.counts.updated, 7 - done, 'only what was left');
});

test('deletes are skipped when an earlier step failed', async () => {
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1), flagged(item('MAT-GONE', 'Gone'), M1)]});
  const set = set1([item('MAT-A', 'A2')]);
  const orig = world.docs[0].update.bind(world.docs[0]);
  world.docs[0].update = async () => { throw new Error('write blocked'); };
  const out = await world.run(set);
  assert.equal(out.counts.failed, 1);
  assert.equal(out.counts.deleted, 0);
  assert.equal(world.docs[1].deleted, false);
  assert.ok(out.log.some(l => l.action === 'delete' && l.status === 'skipped'));
  assert.equal(world.retired.size, 0);
  world.docs[0].update = orig;
});

test('journals follow the package pages; pages the GM added stay; roll tables replace results', async () => {
  const journal = rec('JRN-A', 'JournalEntry', {name: 'Guide', pages: [{name: 'One', type: 'text', text: {content: '<p>1</p>', format: 1}}, {name: 'Two', type: 'text', text: {content: '<p>2</p>', format: 1}}]});
  const jd = flagged(journal, M1, {pagesDefinition: journal.foundry.data.pages});
  jd.raw.pages = [{_id: 'p1', name: 'One', type: 'text', text: {content: '<p>GM changed</p>', format: 1}}, {_id: 'p2', name: 'Two', type: 'text', text: {content: '<p>2</p>', format: 1}}, {_id: 'p3', name: 'GM page', type: 'text', text: {content: 'mine', format: 1}}];
  const table = rec('TBL-A', 'RollTable', {name: 'Loot', formula: '1d2', results: [{type: 'text', text: 'Coin', range: [1, 1], weight: 1}, {type: 'text', text: 'Gem', range: [2, 2], weight: 1}]});
  const td = flagged(table, M1);
  td.raw.results = [{_id: 'r1', type: 'text', description: 'Coin', range: [1, 1], weight: 1, drawn: true}];
  const world = makeWorld({docs: [jd, td]});
  const newJournal = rec('JRN-A', 'JournalEntry', {name: 'Guide', pages: [{name: 'One', type: 'text', text: {content: '<p>one fixed</p>', format: 1}}]});
  const set = set1([newJournal, table]);
  const out = await world.run(set);
  assert.equal(out.counts.failed, 0);
  assert.equal(jd.raw.pages.find(p => p._id === 'p1').text.content, '<p>one fixed</p>');
  assert.ok(!jd.raw.pages.some(p => p._id === 'p2'), 'the old package page that was dropped is removed');
  assert.ok(jd.raw.pages.some(p => p._id === 'p3'), 'a page the GM added stays');
  assert.deepEqual(td.raw.results.map(r => r.description).sort(), ['Coin', 'Gem']);
  assert.equal(world.plan(set).counts.overwrite, 0, 'idempotent');
});

test('item effects: Manager-made effects follow the package, hand-made ones stay', async () => {
  const eff = (id, v) => ({eff_id: id, name: id, transfer: true, changes: [{key: 'system.bonuses.abilities.save', mode: 'add', value: v}]});
  const ring = rec('MAT-RING', 'Item', {name: 'Ring', type: 'equipment', system: {}, effects: [eff('e1', '1'), eff('e3', '3')]});
  const doc = flagged(ring, M1);
  const { effectCreateData } = await import('../scripts/item-effects.js');
  const old1 = effectCreateData(eff('e1', '1')), old2 = effectCreateData(eff('e2', '2'));
  doc.raw.effects = [{_id: 'x1', ...old1}, {_id: 'x2', ...old2}, {_id: 'h1', name: 'Hand made', changes: [], flags: {}}];
  doc.raw.effects[0].changes[0].value = '9'; // GM edit
  const world = makeWorld({docs: [doc]});
  const set = set1([ring]);
  await world.run(set);
  const names = doc.raw.effects.map(e => e._id);
  assert.ok(names.includes('x1') && names.includes('h1') && !names.includes('x2'));
  assert.equal(doc.raw.effects.find(e => e._id === 'x1').changes[0].value, '1', 'GM edit replaced');
  assert.equal(doc.raw.effects.length, 3, 'e3 created');
  assert.equal(world.plan(set).counts.overwrite, 0);
});

test('records other modules own go through their import API in update mode; ones the files drop are listed, never deleted', async () => {
  const {readFile} = await import('node:fs/promises');
  const {createApi} = await import('../../ashen-gate-locations/scripts/api.mjs');
  const {playerView} = await import('../../ashen-gate-locations/scripts/model.mjs');
  const {packFileName} = await import('../../../scripts/build-test-pack.mjs');
  const pack = JSON.parse(await readFile(new URL(`../../../test-fixtures/playtest/${packFileName()}`, import.meta.url), 'utf8'));
  const state = {stored: []};
  const locApi = createApi({version: 'test', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => structuredClone(state.stored), writeAll: async list => { state.stored = list; }, readViews: () => state.stored.map(l => playerView(l, state.stored)).filter(Boolean),
    placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  const world = makeWorld();
  world.apis.locations = locApi; world.apis.routes = locApi;
  const sourceFile = payload => ({filename: 'pack.json', kind: 'manager', payload});
  const set = buildSyncSet([sourceFile(pack)]);
  const plan = world.plan(set);
  assert.equal(plan.ok, true, plan.errors.join('; '));
  const locations = plan.rows.filter(r => r.kind === 'Location');
  assert.ok(locations.length > 0 && locations.every(r => r.group === 'create' && r.external));
  // First run creates everything; Locations keeps its own state, and Manager remembers what it passed on.
  const first = await world.run(set);
  assert.equal(first.counts.failed, 0, JSON.stringify(first.log.filter(l => l.status === 'error')));
  assert.ok(Object.keys(world.ledger[pack.manifest.package_id] ?? {}).length >= locations.length);
  const again = world.plan(set);
  // 0.70.5: what was handed over unchanged is Unchanged the second time (the ledger holds a fingerprint of each record).
  assert.ok(again.rows.filter(r => r.kind === 'Location').every(r => r.group === 'untouched' && r.unchanged && /Already matches the package/.test(r.reason)), 'an unchanged hand-off is not passed on again');
  // A newer package that drops one location: the location stays in Locations and is listed as not removed.
  const dropped = locations[0].id;
  const smaller = {...pack, records: pack.records.filter(r => r.id !== dropped)};
  const plan2 = world.plan(buildSyncSet([sourceFile(smaller)]));
  const row = plan2.rows.find(r => r.id === dropped);
  assert.equal(row.group, 'untouched');
  assert.match(row.reason, /Not removed: remove it in Locations/);
  assert.equal(plan2.counts.notRemoved, 1);
  await world.run(buildSyncSet([sourceFile(smaller)]));
  assert.ok(locApi.listLocations().some(l => l.id === dropped), 'Locations still holds it');
});

test('validation errors in any file stop the whole sync; a stale package version is called out', () => {
  const bad = {id: 'not valid', entity_type: 'Item', status: 'approved', version: '1', provenance: prov, visibility: 'player', refs: [], foundry: {document_type: 'Item', data: {name: 'x', type: 'loot'}}};
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1, {packageVersion: '3.0.0'})]});
  const plan = world.plan(set1([item('MAT-A', 'A'), bad]));
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.length);
  assert.equal(plan.counts.delete, 0);
  const older = world.plan(set1([item('MAT-A', 'A')], 'PKG-MAIN', '2.0.0'));
  assert.ok(older.notes.some(n => /version 2\.0\.0 but the world has version 3\.0\.0/.test(n)));
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(ledgerKey('PKG-MAIN'), 'PKG-MAIN');
  assert.equal(ledgerKey(null, 'quests'), 'specialist:quests');
});

test('archived documents and mismatched types are refused, never written', () => {
  const arch = flagged(item('MAT-A', 'A'), M1); arch.raw.flags[MODULE_ID].lifecycle = {archived: true};
  const wrongType = flagged(item('MAT-B', 'B'), M1); wrongType.raw.type = 'weapon';
  const world = makeWorld({docs: [arch, wrongType]});
  const plan = world.plan(set1([item('MAT-A', 'A2'), item('MAT-B', 'B2')]));
  assert.deepEqual(plan.rows.map(r => r.group), ['untouched', 'untouched']);
  assert.match(plan.rows[0].reason, /Archived/);
  assert.match(plan.rows[1].reason, /type/);
});

test('players and embedded documents cannot be targeted', () => {
  const d = flagged(item('MAT-A', 'A'), M1);
  assert.throws(() => assertSyncTarget(d, PLAYER, 'MAT-A'), /Only a GM/);
  const embedded = new Doc('Item', d.raw, {parent: {}});
  assert.throws(() => assertSyncTarget(embedded, GM, 'MAT-A'), /embedded/);
  assert.throws(() => assertSyncTarget(new Doc('Item', {name: 'plain', type: 'loot'}), GM, null), /no Manager source flag/);
  assert.throws(() => assertSyncTarget(d, GM, 'MAT-OTHER'), /bound to MAT-A/);
});

// ---------- window text, file reading and wiring ----------
import '../scripts/vendor/jszip.min.js';
import {readFileSync} from 'node:fs';
import {readSyncInput, joinSyncInputs} from '../scripts/sync-load.js';
import {syncView, SHOWN_ROWS} from '../scripts/sync-view.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const view = (plan, extra = {}) => syncView({inputs: [{name: 'a.zip', imports: [{filename: 'a.json', label: 'Manager package', records: 3, packageId: 'PKG-MAIN'}]}], skipped: [], fileButton: '<span class="ag-file"></span>', deleteUnscoped: false, plan, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', ...extra});

test('the preview names the groups, the package lines compared, and every deletion; the red button waits for the phrase', () => {
  const docs = [flagged(item('MAT-OLD', 'Old <b>one</b>'), M1), flagged(item('MAT-EDIT', 'Edit'), M1)];
  docs[1].raw.system.price.value = 1;
  const plan = makeWorld({docs}).plan(set1([item('MAT-EDIT', 'Edit')]));
  const html = view(plan);
  assert.match(html, /Sync from package/);
  assert.match(html, /Create/); assert.match(html, /Overwrite/); assert.match(html, /Delete/); assert.match(html, /Untouched/);
  assert.match(html, /Compared against:<\/strong> PKG-MAIN v2\.0\.0/);
  assert.match(html, /Old &lt;b&gt;one&lt;\/b&gt;/, 'names are escaped and listed');
  assert.match(html, /GM-edited field/);
  assert.match(html, /Replace 1 record and delete 1/);
  assert.match(html, /Character sheets are never touched/);
  assert.match(html, /data-ag-sync-run[^>]*disabled/, 'disabled until the phrase is typed');
  assert.doesNotMatch(view(plan, {phrase: SYNC_PHRASE}), /data-ag-sync-run[^>]*disabled/);
  assert.match(html, /data-ag-action="sync-cancel"/);
});

test('deletes are never cut off in the preview; other groups are capped with a pointer to the full download', () => {
  const many = Array.from({length: SHOWN_ROWS + 20}, (_, i) => item(`MAT-${i}`, `Item ${i}`));
  const plan = makeWorld({docs: many.map(r => flagged(r, M1))}).plan(set1([item('MAT-KEEP', 'Keep')]));
  assert.equal(plan.counts.delete, many.length);
  const html = view(plan);
  assert.equal((html.match(/Item \d+<\/span>/g) ?? []).length, many.length, 'every deletion is listed');
  const creates = makeWorld().plan(set1(many));
  assert.match(view(creates), /and 20 more \(Download preview lists every row\)/);
});

test('errors stop the section with the problems listed and no run button', () => {
  const plan = makeWorld().plan(set1([{...item('MAT-A', 'A'), id: 'bad id'}]));
  const html = view(plan);
  assert.match(html, /Nothing can be synced yet/);
  assert.doesNotMatch(html, /data-ag-sync-run/);
});

test('reads several JSON files and ZIPs into one set, including the order manifest', async () => {
  const file = (name, body) => ({name, size: 100, text: async () => JSON.stringify(body)});
  const zipFile = async (name, entries) => { const z = new globalThis.JSZip(); for (const [n, v] of Object.entries(entries)) z.file(n, JSON.stringify(v)); const buf = await z.generateAsync({type: 'uint8array'}); return {name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)}; };
  const main = await zipFile('main-pack.zip', {'ALPHA.json': {schema: 'ag-alpha-manifest/1', ordered_files: ['x/a.json']}, 'a.json': pkg('PKG-MAIN', '2.0.0', [item('MAT-A', 'A')]), 'quests.json': {schema_version: 'ag-quest-source/0.1', records: [{id: 'QST-1', entity_type: 'Objective'}]}});
  const sbx = await zipFile('sandbox-pack.zip', {'s.json': pkg('PKG-SBX', '0.1.0', [item('SBX-A', 'S')])});
  const inputs = [await readSyncInput(main, globalThis.JSZip), await readSyncInput(sbx, globalThis.JSZip), await readSyncInput(file('loose.json', pkg('PKG-LOOSE', '1.0.0', [item('LOS-A', 'L')])))];
  const joined = joinSyncInputs(inputs);
  assert.deepEqual(joined.sources.map(s => s.kind).sort(), ['manager', 'manager', 'manager', 'quests']);
  assert.ok(joined.skipped.some(s => /order list/i.test(s.reason)), 'the manifest is used, not an unknown file');
  const set = buildSyncSet(joined.sources);
  assert.deepEqual([...set.lines.keys()].sort(), ['PKG-LOOSE', 'PKG-MAIN', 'PKG-SBX']);
  assert.ok(set.allIds.has('QST-1') && set.allIds.has('SBX-A'));
  await assert.rejects(() => readSyncInput({name: 'x.txt', size: 1, text: async () => ''}), /choose JSON/);
  await assert.rejects(() => readSyncInput({name: 'bad.json', size: 1, text: async () => '{'}), /not valid JSON/);
});

test('wiring: switch off by default, separate wording, data-layer guards, shared link binding, version', () => {
  const main = read('../scripts/main.js'), hbs = read('../templates/manager.hbs');
  assert.match(main, /this\.sync = \{on:false/);
  assert.match(hbs, /data-ag-sync-mode \{\{#if syncOn\}\}checked\{\{\/if\}\}/);
  assert.match(hbs, /\{\{#if syncOn\}\}\{\{\{syncHtml\}\}\}\{\{else\}\}/);
  assert.doesNotMatch(read('../scripts/sync-view.js'), /Also apply updates|Update existing/);
  assert.match(main, /await resolvePackageLinks\(\{pkg:this\.pkg,rows:ordered,log,plans\}\)/);
  assert.match(main, /executeSync\(plan,this\.#syncAdapter\(set,results\)/);
  assert.match(main, /data-ag-sync-stop|\[data-ag-sync-stop\]/);
  assert.match(main, /MANAGER_HELP|Sync from package<\/strong> \(Import/);
  const apply = read('../scripts/sync-apply.js');
  assert.match(apply, /Character sheets are never changed by Sync/);
  assert.doesNotMatch(read('../scripts/sync.js') + apply, /\bgame\.|ui\.notifications|globalThis\.foundry|\bfoundry\.(utils|applications)/, 'planning and writing stay free of Foundry globals');
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.71.2');
  assert.match(read('../CHANGELOG.md'), /^## 0\.56\.0 /m);
});

test('duplicates sharing an id are never deleted; "also delete" is ignored without a Manager package', async () => {
  const dupA = flagged(item('MAT-DUP', 'Dup'), M1), dupB = flagged(item('MAT-DUP', 'Dup copy'), M1);
  const world = makeWorld({docs: [dupA, dupB, flagged(item('MAT-OLDER', 'Older'), M1, {packageId: undefined})], deleteUnscoped: true});
  const plan = world.plan(set1([item('MAT-KEEP', 'Keep')]));
  assert.deepEqual(sorted(plan.rows.filter(r => r.group === 'delete')), ['MAT-OLDER']);
  assert.equal(plan.rows.filter(r => r.id === 'MAT-DUP' && r.group === 'untouched').length, 2);
  const onlyQuests = buildSyncSet([{filename: 'q.json', kind: 'quests', payload: {schema_version: 'ag-quest-source/0.1', records: [{id: 'QST-1', entity_type: 'Objective'}]}}]);
  const qp = world.plan(onlyQuests);
  assert.equal(qp.counts.delete, 0);
  assert.ok(qp.notes.some(n => /ignored: this sync has no Manager package/.test(n)));
});

test('by default a record edited in your world is kept and listed; unedited ones update fully', async () => {
  const unedited = flagged(item('MAT-A', 'A'), M1), edited = flagged(item('MAT-B', 'B'), M1), actor = flagged(npc('NPC-A', 'A'), M1), legacy = flagged(item('MAT-C', 'C'), M1);
  edited.raw.system.price.value = 99; // GM edit to a field the package does NOT change
  actor.raw.system.abilities.str.value = 8; // GM edit on an NPC
  delete legacy.raw.flags[MODULE_ID].source.managedFields; // no record of the last import
  const world = makeWorld({docs: [unedited, edited, actor, legacy], overwriteEdited: false});
  const set = set1([item('MAT-A', 'A new'), item('MAT-B', 'B new'), npc('NPC-A', 'A', {system: {abilities: {str: {value: 16}}}}), item('MAT-C', 'C new')]);
  const plan = world.plan(set);
  assert.deepEqual([plan.counts.overwrite, plan.counts.keptEdited], [1, 3]);
  const kept = plan.rows.filter(r => r.keptEdited);
  assert.deepEqual(sorted(kept), ['MAT-B', 'MAT-C', 'NPC-A']);
  assert.ok(kept.find(r => r.id === 'MAT-B').changes.some(c => c.path === 'name'), 'what would differ stays available');
  assert.match(kept.find(r => r.id === 'MAT-C').reason, /no record of the last import/);
  const out = await world.run(set);
  assert.equal(out.counts.updated, 1);
  assert.equal(unedited.raw.name, 'A new');
  assert.deepEqual([edited.writes.length, actor.writes.length, legacy.writes.length], [0, 0, 0], 'edited records are not written at all');
  assert.equal(edited.raw.name, 'B');
  // The option lets the package win again, counting what is lost.
  const wins = makeWorld({docs: [edited], overwriteEdited: true}).plan(set1([item('MAT-B', 'B new')]));
  assert.deepEqual([wins.counts.overwrite, wins.counts.keptEdited], [1, 0]);
  assert.ok(wins.lost >= 1);
  // Re-running the default sync changes nothing more.
  const again = world.plan(set);
  assert.deepEqual([again.counts.create, again.counts.overwrite, again.counts.delete], [0, 0, 0]);
});

test('the window shows the kept group, the option (off) and no lost-fields badge until the option is on', () => {
  const edited = flagged(item('MAT-B', 'B'), M1); edited.raw.system.price.value = 99;
  const plan = makeWorld({docs: [edited], overwriteEdited: false}).plan(set1([item('MAT-B', 'B new')]));
  const html = view(plan, {overwriteEdited: false});
  assert.match(html, /Kept: edited in your world/);
  assert.match(html, /data-ag-sync-edited(?![^>]*checked)/);
  assert.match(html, /Also overwrite records I edited/);
  assert.doesNotMatch(html, /will be lost/);
  const on = makeWorld({docs: [edited], overwriteEdited: true}).plan(set1([item('MAT-B', 'B new')]));
  assert.match(view(on, {overwriteEdited: true}), /GM-edited field.*will be lost/);
});

test('by default an edited record the files no longer carry is kept, not deleted; the option deletes it', async () => {
  const plain = flagged(item('MAT-PLAIN', 'Plain'), M1), edited = flagged(item('MAT-EDITED', 'Edited'), M1), legacy = flagged(item('MAT-LEGACY', 'Legacy'), M1);
  edited.raw.system.price.value = 42;
  delete legacy.raw.flags[MODULE_ID].source.managedFields;
  const docs = () => [plain, edited, legacy];
  const set = set1([item('MAT-KEEP', 'Keep')]);
  const def = makeWorld({docs: docs(), overwriteEdited: false});
  const plan = def.plan(set);
  assert.deepEqual(sorted(plan.rows.filter(r => r.group === 'delete')), ['MAT-PLAIN']);
  assert.deepEqual(sorted(plan.rows.filter(r => r.keptRemoved)), ['MAT-EDITED', 'MAT-LEGACY']);
  assert.equal(plan.counts.keptRemoved, 2);
  await def.run(set);
  assert.deepEqual([plain.deleted, edited.deleted, legacy.deleted], [true, false, false]);
  assert.match(view(plan), /Kept: edited in your world, no longer in the package/);
  const wins = makeWorld({docs: [edited, legacy], overwriteEdited: true}).plan(set);
  assert.deepEqual(sorted(wins.rows.filter(r => r.group === 'delete')), ['MAT-EDITED', 'MAT-LEGACY']);
});

test('a sync write carries the adapter\'s ownership update with the document (same rule as the importer)', async () => {
  const world = makeWorld({docs: [flagged(item('MAT-A', 'A'), M1)]});
  const set = set1([item('MAT-A', 'A2')]);
  const out = await world.run(set, {}, {extraUpdate: () => ({'ownership.default': 2, [`flags.${MODULE_ID}.ownershipBaseline`]: 2})});
  assert.equal(out.counts.failed, 0);
  assert.equal(world.docs[0].raw.ownership.default, 2);
  assert.equal(world.docs[0].raw.flags[MODULE_ID].ownershipBaseline, 2);
  const main = read('../scripts/main.js');
  assert.match(main, /extraUpdate: \(doc,row\)=>\{const levels=CONST\.DOCUMENT_OWNERSHIP_LEVELS;return releasable\(doc,/, 'sync reuses releasable() instead of a second copy of the rule');
});
