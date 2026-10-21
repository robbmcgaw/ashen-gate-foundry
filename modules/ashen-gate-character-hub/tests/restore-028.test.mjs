/** 0.28.0 Restore a level backup (GM only), more spell marks, Strain in the marks bar (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as bk from '../scripts/level-backup.mjs';
import * as rs from '../scripts/level-restore.mjs';
import {restoreAsk} from '../scripts/sheet.mjs';
import {shellHtml} from '../scripts/views.mjs';
import {strainChip, hotbarsHtml} from '../scripts/hotbar-views.mjs';
import {availableMarks, MARKS} from '../scripts/marks.mjs';
import {createApi} from '../scripts/main.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';
import * as journey from '../scripts/journey.mjs';

/**
 * A stored Actor with real-ish embedded collections: update() honours recursive: false (replace, not merge),
 * create/update/delete of Items and ActiveEffects (also on Items), toObject(). `failOn` throws on a named step once.
 */
function storedActor(data, world) {
  const a = {documentName: 'Actor', ...structuredClone(data), id: data._id, uuid: `Actor.${data._id}`, calls: []};
  delete a._id;
  const coll = arr => Object.assign(arr, {get: id => arr.find(d => d.id === id)});
  const effectDoc = e => ({...structuredClone(e), id: e._id});
  const embedded = (owner, key, make) => ({
    async create(rows) { world.step(`create:${key}`); for (const r of rows) owner[key].push(make(r)); },
    async update(rows, o) { world.step(`update:${key}`); for (const r of rows) { const d = owner[key].get(r._id); if (o?.recursive === false) { for (const k of Object.keys(d)) if (!['id', 'effects', 'documentName'].includes(k) && typeof d[k] !== 'function') delete d[k]; } Object.assign(d, structuredClone(r)); d.id = r._id; } },
    async delete(ids) { world.step(`delete:${key}`); for (const id of ids) owner[key].splice(owner[key].findIndex(d => d.id === id), 1); }
  });
  const methods = (owner, kinds) => ({
    async createEmbeddedDocuments(name, rows, o) { owner.calls?.push(['create', name, o]); return kinds[name].create(rows, o); },
    async updateEmbeddedDocuments(name, rows, o) { owner.calls?.push(['update', name, o]); return kinds[name].update(rows, o); },
    async deleteEmbeddedDocuments(name, ids, o) { owner.calls?.push(['delete', name, o]); return kinds[name].delete(ids, o); }
  });
  const itemDoc = i => { const it = {documentName: 'Item', ...structuredClone(i), id: i._id, effects: coll((i.effects ?? []).map(effectDoc))}; Object.assign(it, methods(it, {ActiveEffect: embedded(it, 'effects', effectDoc)})); return it; };
  a.items = coll((data.items ?? []).map(itemDoc));
  a.effects = coll((data.effects ?? []).map(effectDoc));
  Object.assign(a, methods(a, {Item: embedded(a, 'items', itemDoc), ActiveEffect: embedded(a, 'effects', effectDoc)}));
  a.update = async (diff, o) => { world.step('update:actor'); a.calls.push(['updateActor', o]); for (const [k, v] of Object.entries(diff)) a[k] = o?.recursive === false ? structuredClone(v) : {...a[k], ...structuredClone(v)}; };
  const plain = d => { const {id, documentName, calls, effects, uuid, update, createEmbeddedDocuments, updateEmbeddedDocuments, deleteEmbeddedDocuments, ...rest} = d; return {...structuredClone(Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function'))), _id: id}; };
  a.toObject = () => ({...plain({...a, items: undefined}), items: [...a.items].map(i => ({...plain(i), effects: [...i.effects].map(plain)})), effects: [...a.effects].map(plain)});
  return a;
}
function setup({user = users.gm} = {}) {
  installGlobals({user});
  const world = {fail: null, step(name) { if (world.fail === name) { world.fail = null; throw new Error(`boom at ${name}`); } }};
  const actors = [], folders = [];
  const g = globalThis.game;
  g.actors = Object.assign(actors, {get: id => actors.find(a => a.id === id)});
  g.folders = folders;
  g.users = [{...users.gm, active: true}, {...users.owner, active: true}];
  globalThis.Folder = {async create(d) { const f = {id: `f${folders.length + 1}`, ...d}; folders.push(f); return f; }};
  globalThis.Actor = {async create(d) { const made = storedActor({...structuredClone(d), _id: `copy${actors.length}`}, world); actors.push(made); return made; }};
  // The live character at level 4 now, with Ashen Gate state; its level-3 backup was made earlier.
  const live = storedActor({_id: 'hero', name: '[TEST] Hero', type: 'character', img: 'hero-new.webp', folder: 'party', ownership: {default: 0, owner: 3},
    prototypeToken: {name: '[TEST] Hero', texture: {src: 'tok.webp'}},
    system: {details: {level: 4}, attributes: {hp: {value: 36, max: 36}}, abilities: {str: {value: 16}}, newKey: 1},
    flags: {core: {sheetClass: 'agch'}, dnd5e: {now: 1}, 'ashen-gate-strain': {state: {value: 7}}, [MODULE_ID]: {journey: {v: 1, entries: [{id: 'level-4'}], seen: {level: 4}}, hotbar: [{type: 'Item', id: 'sword'}]}},
    items: [{_id: 'fig', name: '[TEST] Fighter', type: 'class', system: {identifier: 'fighter', levels: 4}, flags: {}, effects: []},
      {_id: 'sword', name: '[TEST] Sword', type: 'weapon', system: {quantity: 1, extra: 'new'}, flags: {'ashen-gate-cinders': {attachedTo: {instanceId: 'i9'}}}, effects: [{_id: 'se', name: 'Glow', flags: {}}]},
      {_id: 'potion', name: '[TEST] Potion', type: 'consumable', system: {quantity: 2}, flags: {}, effects: []}],
    effects: [{_id: 'new-eff', name: 'New effect', flags: {}}]}, world);
  actors.push(live);
  return {live, world, actors};
}
/** The level-3 copy, made through the real createBackup from what the character looked like then. */
async function makeOldCopy(live) {
  const then = {_id: live.id, name: '[TEST] Hero', type: 'character', img: 'hero-old.webp', ownership: {default: 0, owner: 3},
    system: {details: {level: 3}, attributes: {hp: {value: 20, max: 28}}, abilities: {str: {value: 14}}},
    flags: {core: {sheetClass: 'old'}, dnd5e: {then: 1}, 'ashen-gate-strain': {state: {value: 2}}, 'ashen-gate-skill-trees': {progressV2: {t: 1}},
      [MODULE_ID]: {journey: {v: 1, entries: [], seen: {level: 3}}, hotbar: [{type: 'Item', id: 'sword'}], levelBackupQueue: []}},
    items: [{_id: 'fig', name: '[TEST] Fighter', type: 'class', system: {identifier: 'fighter', levels: 3}, flags: {'ashen-gate-manager': {source: {id: 'REC-1'}}}, effects: []},
      {_id: 'sword', name: '[TEST] Sword', type: 'weapon', system: {quantity: 1}, flags: {'ashen-gate-cinders': {attachedTo: {instanceId: 'i1', slot: 1}}}, effects: [{_id: 'se', name: 'Glow', flags: {'ashen-gate-factions': {f: 1}}}]},
      {_id: 'shield', name: '[TEST] Shield', type: 'equipment', system: {quantity: 1}, flags: {}, effects: []}],
    effects: [{_id: 'old-eff', name: 'Old effect', flags: {'ashen-gate-strain': {e: 1}}}]};
  const r = await bk.createBackup(then, {sourceId: live.id, levelBefore: 3, opId: 'lvl-op', date: '2026-10-01'});
  return globalThis.game.actors.get(r.result);
}
const copies = () => [...globalThis.game.actors].filter(bk.isBackup);

// ---------- Restore ----------

test('restore brings the copy back onto the live character (same id, owners, token) with archived flags', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  const r = await rs.restoreBackup(copy, {opId: 'rest1'});
  assert.equal(r.ok, true, r.error);
  assert.equal(live.id, 'hero'); assert.equal(globalThis.game.actors.get('hero'), live, 'same Actor, not a new one');
  // dnd5e state from the copy, replaced (not merged).
  assert.deepEqual(live.system, {details: {level: 3}, attributes: {hp: {value: 20, max: 28}}, abilities: {str: {value: 14}}});
  assert.equal(live.items.get('fig').system.levels, 3);
  assert.deepEqual([...live.items].map(i => i.id).sort(), ['fig', 'shield', 'sword'], 'potion gone, shield back');
  assert.equal(live.items.get('sword').system.extra, undefined, 'kept items are replaced, not merged');
  assert.deepEqual([...live.effects].map(e => e.id), ['old-eff']);
  // Ashen Gate flags back on the documents they came from.
  assert.deepEqual(live.flags['ashen-gate-strain'], {state: {value: 2}});
  assert.deepEqual(live.flags['ashen-gate-skill-trees'], {progressV2: {t: 1}});
  assert.deepEqual(live.flags[MODULE_ID].journey, {v: 1, entries: [{id: 'level-4'}], seen: {level: 4}}, 'the Journey does not revert (Robb)');
  assert.equal(live.flags[MODULE_ID].levelBackup, undefined, 'the marker does not come along');
  assert.deepEqual(live.items.get('sword').flags['ashen-gate-cinders'], {attachedTo: {instanceId: 'i1', slot: 1}});
  assert.deepEqual(live.items.get('sword').effects.get('se').flags, {'ashen-gate-factions': {f: 1}});
  assert.deepEqual(live.items.get('fig').flags, {'ashen-gate-manager': {source: {id: 'REC-1'}}});
  assert.deepEqual(live.effects.get('old-eff').flags, {'ashen-gate-strain': {e: 1}});
  assert.deepEqual(live.flags.dnd5e, {then: 1});
  // Kept from the live character.
  assert.equal(live.name, '[TEST] Hero'); assert.equal(live.img, 'hero-new.webp'); assert.equal(live.folder, 'party');
  assert.deepEqual(live.ownership, {default: 0, owner: 3}); assert.deepEqual(live.prototypeToken.texture, {src: 'tok.webp'});
  assert.deepEqual(live.flags.core, {sheetClass: 'agch'}, 'sheet choice stays');
  // Every write replaces (recursive: false).
  assert.ok(live.calls.filter(c => c[0] === 'updateActor' || c[0] === 'update').every(c => c.at(-1)?.recursive === false));
  assert.ok(live.calls.some(c => c[0] === 'create' && c[2]?.keepId === true));
  // The record.
  assert.deepEqual({...live.flags[MODULE_ID].levelRestore, date: 'd'}, {opId: 'rest1', backupId: copy.id, backupName: '[TEST] Hero - level 3', levelBefore: 4, levelAfter: 3, safetyId: r.result.safetyId, date: 'd', by: 'gm'});
});

test('before overwriting, the character as it is now is saved as another copy (existing name rule, archive kept)', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  const r = await rs.restoreBackup(copy, {opId: 'rest2'});
  const safety = globalThis.game.actors.get(r.result.safetyId);
  assert.equal(safety.name, '[TEST] Hero - level 4');
  const f = safety.flags[MODULE_ID].levelBackup;
  assert.equal(f.reason, 'restore'); assert.equal(f.levelBefore, 4); assert.equal(f.sourceId, 'hero'); assert.equal(f.opId, 'rest2-before-restore');
  assert.deepEqual(f.archivedFlags.actor['ashen-gate-strain'], {state: {value: 7}});
  assert.deepEqual(f.archivedFlags.items.sword, {'ashen-gate-cinders': {attachedTo: {instanceId: 'i9'}}});
  assert.equal(safety.system.attributes.hp.value, 36);
  assert.deepEqual([...safety.items].map(i => i.id).sort(), ['fig', 'potion', 'sword']);
  assert.deepEqual(safety.ownership, {default: 0});
  // Restoring the safety copy brings level 4 back exactly (round trip), and makes a third copy.
  const back = await rs.restoreBackup(safety, {opId: 'rest3'});
  assert.equal(back.ok, true);
  assert.deepEqual(live.system, {details: {level: 4}, attributes: {hp: {value: 36, max: 36}}, abilities: {str: {value: 16}}, newKey: 1});
  assert.deepEqual(live.flags['ashen-gate-strain'], {state: {value: 7}});
  assert.equal(live.flags['ashen-gate-skill-trees'], undefined);
  assert.deepEqual(live.items.get('sword').flags, {'ashen-gate-cinders': {attachedTo: {instanceId: 'i9'}}});
  assert.equal(live.items.get('sword').system.extra, 'new');
  assert.equal(copies().length, 3); assert.equal(copies()[2].name, '[TEST] Hero - level 3 (2)');
  assert.deepEqual(copy.flags[MODULE_ID].levelBackup.opId, 'lvl-op', 'the backup copy itself is not changed');
});

test('all or nothing: a failure part-way rolls the character back; the safety copy stays', async () => {
  for (const step of ['update:actor', 'delete:items', 'create:items', 'update:effects']) {
    const {live, world} = setup();
    const copy = await makeOldCopy(live);
    const before = live.toObject();
    // Fail on the restore's step (the safety copy is created by Actor.create, not these steps).
    world.fail = step;
    const r = await rs.restoreBackup(copy, {opId: `fail-${step}`});
    assert.equal(r.ok, false, step); assert.equal(r.rolledBack, true, step); assert.match(r.error, /put back as it was/);
    const after = live.toObject();
    assert.deepEqual(after.system, before.system, step); assert.deepEqual(after.flags, before.flags, step);
    assert.deepEqual(after.items.map(i => [i._id, i.system, i.flags]), before.items.map(i => [i._id, i.system, i.flags]), step);
    assert.deepEqual(after.effects.map(e => e._id), before.effects.map(e => e._id), step);
    assert.equal(copies().length, 2, `${step}: the safety copy is kept`);
  }
});

test('if the safety copy cannot be made, nothing changes', async () => {
  for (const create of [async () => { throw new Error('no room'); }, async () => null]) {
    const {live} = setup();
    const copy = await makeOldCopy(live);
    globalThis.Actor.create = create;
    const r = await rs.restoreBackup(copy, {opId: 'x'});
    assert.equal(r.ok, false); assert.match(r.error, /^Nothing was changed/);
    assert.equal(live.system.details.level, 4); assert.equal(live.calls.length, 0);
  }
});

test('same opId twice restores once; only a GM may restore (data layer, not only the button)', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  await rs.restoreBackup(copy, {opId: 'once'});
  const n = live.calls.length, made = copies().length;
  const again = await rs.restoreBackup(copy, {opId: 'once'});
  assert.equal(again.duplicate, true); assert.equal(live.calls.length, n); assert.equal(copies().length, made);
  globalThis.game.user = users.owner;
  const r = await rs.restoreBackup(copy, {opId: 'p'});
  assert.deepEqual(r, {ok: false, error: 'Only a GM can restore a level backup.'});
  assert.deepEqual(await rs.restoreBackup(copy, {opId: 'p2', user: users.owner}), r);
  const api = createApi();
  assert.equal((await api.levelBackups.restore(copy, {opId: 'p3'})).ok, false);
  assert.equal(live.calls.length, n);
});

test('refusals: not a backup, the source is gone', async () => {
  const {live, actors} = setup();
  assert.match((await rs.restoreBackup(live)).error, /is not a level backup/);
  const copy = await makeOldCopy(live);
  actors.splice(actors.indexOf(live), 1);
  assert.match((await rs.restoreBackup(copy)).error, /is gone/);
});

test('a queued level backup on the live character is kept through a restore', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  live.flags[MODULE_ID].levelBackupQueue = [{opId: 'q1', snapshot: {_id: 'hero'}}];
  await rs.restoreBackup(copy, {opId: 'q'});
  assert.deepEqual(live.flags[MODULE_ID].levelBackupQueue, [{opId: 'q1', snapshot: {_id: 'hero'}}]);
});

test('backupsFor lists a character\'s copies newest first; the API list hides archivedFlags', async () => {
  const {live} = setup();
  const old = await makeOldCopy(live);
  await bk.createBackup(live.toObject(), {sourceId: live.id, levelBefore: 4, opId: 'n', date: '2026-10-20'});
  assert.deepEqual(rs.backupsFor(live).map(a => a.name), ['[TEST] Hero - level 4', '[TEST] Hero - level 3']);
  assert.deepEqual(rs.backupsFor(old), [], 'a copy has no copies');
  const listed = createApi().levelBackups.list(live);
  assert.equal(listed[1].levelBefore, 3); assert.equal(listed[1].archivedFlags, undefined); assert.equal(listed[1].id, old.id);
});

test('Journey: kept as it is now through a restore; the recorder adds nothing for the lower level and the next new level once', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  await rs.restoreBackup(copy, {opId: 'j'});
  assert.deepEqual(live.flags[MODULE_ID].journey.entries, [{id: 'level-4'}]);
  live.testUserPermission = () => true;
  assert.deepEqual(journey.levelEntries(live).entries, [], 'level 3 below the recorded 4: nothing');
  live.system.details.level = 4; assert.deepEqual(journey.levelEntries(live).entries, [], 'level 4 again: already recorded');
  live.system.details.level = 5; assert.deepEqual(journey.levelEntries(live).entries.map(e => e.id), ['level-5']);
});

// ---------- Cinders re-link (Robb: the records stay the truth) ----------

/**
 * Cinders 0.7.0 stand-in: a registry (instanceId → bearer actor id) and api.cinder.rehook(actor), which rewrites the
 * actor's bearer pointers and its items' socket markers from the registry, like the real one. `fail` throws once.
 */
function fakeCinders({registry = {'cinst-1': {bearer: 'hero', sockets: [{itemId: 'sword', slot: 0}]}}, rehook = true} = {}) {
  const calls = [], c = {fail: false, calls, registry};
  const api = {contract: 'ag-cinder/1', async rehook(actor) {
    calls.push(actor.id);
    if (c.fail) { c.fail = false; throw new Error('Cinders said no'); }
    const mine = Object.entries(registry).filter(([, r]) => r.bearer === actor.id);
    await actor.update({flags: {...actor.flags, 'ashen-gate-cinders': {cinders: mine.map(([id]) => ({instanceId: id}))}}}, {recursive: false});
    for (const item of actor.items) {
      const at = mine.flatMap(([id, r]) => r.sockets.filter(x => x.itemId === item.id).map(x => ({instanceId: id, slot: x.slot})))[0] ?? null;
      item.flags = {...item.flags, 'ashen-gate-cinders': {...item.flags['ashen-gate-cinders'], attachedTo: at}};
    }
    return {instances: mine.map(([id]) => id), done: []};
  }};
  if (!rehook) delete api.rehook;
  globalThis.game.modules = {get: id => id === 'ashen-gate-cinders' ? {active: true, api: {cinder: api}} : null};
  return c;
}

test('Cinders: after the restore the character is re-linked from Cinders\' records (not the copy\'s old links)', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  const cin = fakeCinders();
  const r = await rs.restoreBackup(copy, {opId: 'c1'});
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(cin.calls, ['hero'], 'rehook ran for the restored character');
  assert.deepEqual(r.result.cinders, ['cinst-1']);
  assert.deepEqual(live.flags['ashen-gate-cinders'], {cinders: [{instanceId: 'cinst-1'}]});
  assert.deepEqual(live.items.get('sword').flags['ashen-gate-cinders'].attachedTo, {instanceId: 'cinst-1', slot: 0}, 'record wins over the copy\'s old marker (i1 slot 1)');
  assert.equal(live.system.details.level, 3, 'the rest of the restore stands');
});

test('Cinders: the safety copy never keeps a live bearer link (inert flags, new id the records never name)', async () => {
  const {live} = setup();
  live.flags['ashen-gate-cinders'] = {cinders: [{instanceId: 'cinst-1'}]};
  const copy = await makeOldCopy(live);
  const cin = fakeCinders();
  const r = await rs.restoreBackup(copy, {opId: 'c2'});
  const safety = globalThis.game.actors.get(r.result.safetyId);
  assert.notEqual(safety.id, 'hero');
  assert.equal(safety.flags['ashen-gate-cinders'], undefined, 'no live Cinders flags on the copy');
  for (const i of safety.items) assert.equal(i.flags['ashen-gate-cinders'], undefined, `${i.name}: no socket marker`);
  assert.deepEqual(safety.flags[MODULE_ID].levelBackup.archivedFlags.actor['ashen-gate-cinders'], {cinders: [{instanceId: 'cinst-1'}]}, 'kept only in the archive');
  assert.ok(!Object.values(cin.registry).some(x => x.bearer === safety.id));
  assert.deepEqual(cin.calls, ['hero'], 'rehook never runs on the copy');
});

test('Cinders: a failed re-link rolls the whole restore back (and re-links the character as it was)', async () => {
  const {live} = setup();
  const copy = await makeOldCopy(live);
  const before = live.toObject();
  const cin = fakeCinders(); cin.fail = true;
  const r = await rs.restoreBackup(copy, {opId: 'c3'});
  assert.equal(r.ok, false); assert.equal(r.rolledBack, true); assert.match(r.error, /Cinders said no/);
  assert.deepEqual(live.system, before.system);
  assert.deepEqual([...live.items].map(i => [i.id, i.system]), before.items.map(i => [i._id, i.system]));
  assert.deepEqual(cin.calls, ['hero', 'hero'], 're-linked again after the rollback');
});

test('Cinders missing: restore works, nothing called; Cinders without rehook (older than 0.7.0): restore works and warns', async () => {
  let {live} = setup();
  let copy = await makeOldCopy(live);
  const r = await rs.restoreBackup(copy, {opId: 'm'});
  assert.equal(r.ok, true); assert.equal(r.warning, undefined); assert.equal(r.result.cinders, null);
  ({live} = setup()); copy = await makeOldCopy(live);
  fakeCinders({rehook: false});
  const old = await rs.restoreBackup(copy, {opId: 'o'});
  assert.equal(old.ok, true); assert.match(old.warning, /older than 0\.7\.0.*Check and Repair/);
  assert.equal(live.system.details.level, 3);
});

// ---------- The button and the confirmation ----------

test('header: GM sees Restore backup only when the character has copies; on a copy "Restore this backup"; players never', async () => {
  const {live} = setup();
  const tag = html => html.match(/<button[^>]*data-action="level-restore"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? null;
  live.system.attributes = {...live.system.attributes, hp: {value: 1, max: 1}};
  const head = a => shellHtml({actor: a, editable: true, tab: 'overview', limited: false}).split('</header>')[0];
  assert.equal(tag(head(live)), null, 'no copies yet');
  const copy = await makeOldCopy(live);
  assert.match(tag(head(live)), /Restore backup/); assert.match(tag(head(live)), /1 level backup back onto it \(GM; asks first\)/);
  assert.match(tag(head(copy)), /Restore this backup/);
  globalThis.game.user = users.owner;
  assert.equal(tag(head(live)), null);
});

test('the click: picks (several copies), then a labelled red confirmation; Cancel changes nothing', async () => {
  const {live, actors} = setup();
  const copy = await makeOldCopy(live);
  await bk.createBackup(live.toObject(), {sourceId: live.id, levelBefore: 4, opId: 'n2', date: '2026-10-20'});
  let offered = null, asked = null;
  const cancel = await restoreAsk({document: live}, {pick: async l => { offered = l.map(a => a.name); return copy.id; }, confirm: async (m, o) => { asked = {m, o}; return false; }});
  assert.equal(cancel, null);
  assert.deepEqual(offered, ['[TEST] Hero - level 4', '[TEST] Hero - level 3']);
  assert.equal(asked.o.danger, true); assert.equal(asked.o.yes, 'Restore from backup'); assert.equal(asked.o.title, 'Restore [TEST] Hero?');
  assert.match(asked.m, /Restore \[TEST\] Hero to "\[TEST\] Hero - level 3" \(level 3, saved 2026-10-01\)\?/);
  assert.match(asked.m, /as it is now \(level 4\) is saved as a new copy in Ashen Gate \/ Level backups/);
  assert.match(asked.m, /name, portrait, owners and token stay/);
  assert.equal(live.system.details.level, 4); assert.equal(actors.length, 3);
  // Confirmed from the copy's own Hub: no pick step.
  const r = await restoreAsk({document: copy}, {pick: async () => { throw new Error('no pick on a copy'); }, confirm: async () => true});
  assert.equal(r.ok, true); assert.equal(live.system.details.level, 3);
  // A player clicking is refused with a warning.
  globalThis.game.user = users.owner;
  const p = await restoreAsk({document: live}, {confirm: async () => true});
  assert.equal(p.ok, false);
});

// ---------- Marks ----------

test('new standard spell marks: Bless, Searing / Wrathful / Shining Smite (Branding Smite too), tracking only', () => {
  installGlobals();
  const actor = makeActor({items: [
    {id: 'b', name: '[TEST] Bless', type: 'spell', system: {identifier: 'bless'}},
    {id: 's', name: '[TEST] Searing Smite', type: 'spell', system: {identifier: 'searing-smite'}},
    {id: 'w', name: 'Wrathful Smite', type: 'spell', system: {}},
    {id: 'br', name: '[TEST] Branding Smite', type: 'spell', system: {identifier: 'branding-smite'}},
    {id: 'df', name: '[TEST] Divine Favor', type: 'spell', system: {identifier: 'divine-favor'}}]});
  assert.deepEqual(availableMarks(actor).map(a => [a.mark.id, a.label]), [['bless', 'Blessed'], ['searing-smite', 'Searing Smite'], ['wrathful-smite', 'Wrathful Smite'], ['shining-smite', 'Shining Smite']]);
  assert.equal(new Set(MARKS.map(m => m.id)).size, MARKS.length, 'ids unique');
  assert.ok(MARKS.every(m => m.icon.startsWith('icons/svg/')));
});

// ---------- Strain readout ----------

function cinders(get) { return {'ashen-gate-cinders': {active: true, api: {strain: {contract: 'ag-strain/1', get}}}}; }
test('Strain chip: read-only from Cinders\' api.strain; nothing without Cinders, on errors, or an old contract', () => {
  installGlobals({modules: cinders(() => ({value: 6, guaranteeAt: 10, band: {label: '[TEST] Uneasy'}, chance: 15, guaranteed: false}))});
  const actor = makeActor();
  const chip = strainChip(actor);
  assert.match(chip, /Strain 6 \/ 10 · \[TEST\] Uneasy/); assert.match(chip, /ag-badge--warn/); assert.match(chip, /Backfire on a Push from here: 15%/);
  assert.doesNotMatch(chip, /data-action|<button/, 'read only');
  assert.match(hotbarsHtml({actor, editable: true}), /agch-hotbar__strain/);
  installGlobals({modules: cinders(() => ({value: 12, guaranteeAt: 10, band: {label: 'X'}, chance: 100, guaranteed: true}))});
  assert.match(strainChip(actor), /ag-badge--danger/);
  installGlobals();
  assert.equal(strainChip(actor), ''); assert.doesNotMatch(hotbarsHtml({actor, editable: true}), /agch-hotbar__strain/);
  installGlobals({modules: cinders(() => { throw new Error('not yours'); })});
  assert.equal(strainChip(actor), '');
  installGlobals({modules: {'ashen-gate-cinders': {active: true, api: {strain: {contract: 'ag-strain/0', get: () => ({value: 1})}}}}});
  assert.equal(strainChip(actor), '');
});
