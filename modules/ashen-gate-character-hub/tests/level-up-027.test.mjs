/** 0.27.0 Level up: starts dnd5e's own level-up flow and keeps a GM-only backup (mocked Foundry and dnd5e; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {levelUpState, startLevelUp, ADD_CLASS} from '../scripts/level-up.mjs';
import * as bk from '../scripts/level-backup.mjs';
import {onSocket} from '../scripts/marks.mjs';
import {shellHtml} from '../scripts/views.mjs';
import {ACTIONS, backupNotice} from '../scripts/sheet.mjs';
import * as j from '../scripts/journey.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const FIGHTER = {id: 'fig', name: '[TEST] Fighter', type: 'class', system: {identifier: 'fighter', levels: 3}};
const WIZARD = {id: 'wiz', name: '[TEST] Wizard', type: 'class', system: {identifier: 'wizard', levels: 1}};

/** Foundry Hooks stand-in (on/off/callAll). */
function fakeHooks() {
  const list = new Map(); let n = 0;
  return {on(name, fn) { list.set(++n, {name, fn}); return n; }, off(name, id) { list.delete(id); },
    callAll(name, ...a) { for (const {name: k, fn} of [...list.values()]) if (k === name) fn(...a); }, count: () => list.size};
}
/** dnd5e stand-ins: AdvancementManager (records calls; `steps` decides whether a window is needed) and CompendiumBrowser. */
function fakeDnd5e({steps = 1, pick = 'Compendium.test.classes.Item.rog'} = {}) {
  const calls = [];
  class AdvancementManager {
    constructor(actor) { this.actor = actor; this.steps = Array(steps).fill({type: 'forward'}); this.renders = []; }
    static forLevelChange(actor, classId, delta) { const m = new this(actor); calls.push({kind: 'level', classId, delta, manager: m}); return m; }
    static forNewItem(actor, itemData) { const m = new this(actor); calls.push({kind: 'new', itemData, manager: m}); return m; }
    async render(options) { this.renders.push(options); return this; }
  }
  const CompendiumBrowser = {async selectOne(o) { calls.push({kind: 'browse', filters: o.filters}); return pick; }};
  globalThis.dnd5e = {applications: {advancement: {AdvancementManager}, CompendiumBrowser}};
  globalThis.fromUuid = async uuid => ({uuid, type: 'class', name: '[TEST] Rogue'});
  return calls;
}
/** World documents: Actor.create, Folder.create, game.actors/folders, the socket (sent messages are kept). */
function fakeWorld(actors) {
  const g = globalThis.game, folders = [], sent = [];
  g.actors = Object.assign(actors, {get: id => actors.find(a => a.id === id)});
  g.folders = folders;
  g.items = {fromCompendium: doc => ({name: doc.name, type: 'class', system: {identifier: 'rogue', levels: 1, advancement: {a1: {}}}})};
  g.socket = {emit: (...a) => sent.push(a), on() {}};
  globalThis.Folder = {async create(d) { const f = {id: `f${folders.length + 1}`, ...d}; folders.push(f); return f; }};
  globalThis.Actor = {async create(d, o) { const a = {id: `copy${actors.length}`, ...structuredClone(d), createOptions: o}; actors.push(a); return a; }};
  return {folders, sent};
}
function setup({user = users.owner, xp = {value: 2700, max: 2700}, items = [FIGHTER], settings = {}, steps = 1, gmOn = true} = {}) {
  const notes = installGlobals({user, settings: {levelingMode: 'xp', ...settings}});
  globalThis.CONFIG.DND5E.maxLevel = 20;
  globalThis.Hooks = fakeHooks();
  const calls = fakeDnd5e({steps});
  const actor = makeActor({items: items.map(i => structuredClone(i)), system: {details: {level: items.reduce((n, i) => n + i.system.levels, 0), xp}}});
  actor.flags = {[MODULE_ID]: {journey: {v: 1, entries: [], seen: {level: 3}}}, 'ashen-gate-strain': {state: {value: 2}}, dnd5e: {keep: 1}};
  actor.toObject = () => structuredClone({_id: actor.id, name: actor.name, type: actor.type, system: actor.system, flags: actor.flags, ownership: {default: 0, owner: 3},
    items: [...actor.items].map(i => ({_id: i.id, name: i.name, type: i.type, system: i.system, flags: i.flags, effects: []})), effects: []});
  const world = fakeWorld([actor]);
  globalThis.game.users = [{...users.gm, active: gmOn}, {...users.owner, active: true}, {...users.observer, active: true}];
  globalThis.game.users.get = id => globalThis.game.users.find(u => u.id === id);
  return {actor, calls, notes, ...world};
}
const copies = () => [...globalThis.game.actors].filter(bk.isBackup);
const pickClass = id => async () => id;

// ---------- Who may level ----------

test('GM may always level, even without the XP', () => {
  const {actor} = setup({user: users.gm, xp: {value: 0, max: 2700}});
  assert.equal(levelUpState(actor).ok, true);
});

test('milestone (dnd5e levelingMode "noxp"): the owner may level any time', () => {
  const {actor} = setup({xp: {value: 0, max: 2700}, settings: {levelingMode: 'noxp'}});
  assert.equal(levelUpState(actor).ok, true);
});

test('XP worlds ("xp", and dnd5e\'s default "xpBoons"): a player needs dnd5e\'s next-level XP', () => {
  assert.equal(levelUpState(setup({xp: {value: 1200, max: 2700}}).actor).reason, 'Not enough XP yet: 1200 of 2700.');
  assert.equal(levelUpState(setup({xp: {value: 10, max: 2700}, settings: {levelingMode: undefined}}).actor).ok, false);
  assert.equal(levelUpState(setup().actor).ok, true);
});

test('observer refused in the action itself; level 20 refused for everyone', async () => {
  const {actor, calls} = setup({user: users.observer});
  const r = await startLevelUp(actor, {choose: pickClass('fig')});
  assert.equal(r.ok, false); assert.match(r.error, /owner or the GM/); assert.equal(calls.length, 0);
  assert.match(levelUpState(setup({user: users.gm, items: [{...FIGHTER, system: {identifier: 'fighter', levels: 20}}]}).actor).reason, /highest level \(20\)/);
});

// ---------- Advance a class ----------

test('the dialog offers each class and "Add a class"; cancel does nothing and makes no copy', async () => {
  const {actor, calls} = setup({user: users.gm, items: [FIGHTER, WIZARD]});
  let offered = null;
  assert.deepEqual(await startLevelUp(actor, {choose: async o => { offered = o; return null; }}), {ok: true, result: null});
  assert.deepEqual(offered.map(o => o.value), ['fig', 'wiz', ADD_CLASS]);
  assert.match(offered[1].label, /\[TEST\] Wizard \(level 1 → 2\)/);
  assert.equal(calls.length, 0); assert.equal(copies().length, 0);
});

test('advancing: dnd5e\'s forLevelChange(+1) window; the copy is made only when dnd5e completes it', async () => {
  const {actor, calls} = setup({user: users.gm, items: [FIGHTER, WIZARD]});
  assert.deepEqual(await startLevelUp(actor, {choose: pickClass('wiz')}), {ok: true, result: 'advancement'});
  assert.equal(calls[0].kind, 'level'); assert.equal(calls[0].classId, 'wiz'); assert.equal(calls[0].delta, 1);
  assert.deepEqual(calls[0].manager.renders, [{force: true}]);
  assert.equal(copies().length, 0, 'nothing yet: the window is open');
  globalThis.Hooks.callAll('dnd5e.advancementManagerComplete', {other: true});
  assert.equal(copies().length, 0, 'another manager completing is ignored');
  globalThis.Hooks.callAll('dnd5e.advancementManagerComplete', calls[0].manager);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copies().length, 1); assert.equal(copies()[0].name, '[TEST] Hero - level 4');
  assert.equal(globalThis.Hooks.count(), 0, 'listeners removed');
});

test('closing dnd5e\'s window without finishing leaves no copy', async () => {
  const {actor, calls} = setup({user: users.gm});
  await startLevelUp(actor, {choose: pickClass('fig')});
  globalThis.Hooks.callAll('closeAdvancementManager', calls[0].manager);
  assert.equal(globalThis.Hooks.count(), 0);
  globalThis.Hooks.callAll('dnd5e.advancementManagerComplete', calls[0].manager);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copies().length, 0);
});

test('a sheet that can render a child window (as dnd5e sheets do) is used for it', async () => {
  const {actor, calls} = setup({user: users.gm}); const shown = [];
  await startLevelUp(actor, {choose: pickClass('fig'), sheet: {_renderChild: m => shown.push(m)}});
  assert.equal(shown[0], calls[0].manager);
});

test('no advancement steps, or advancements disabled: the class level goes up by one, then the copy', async () => {
  let {actor} = setup({user: users.gm, steps: 0});
  { const r1 = await startLevelUp(actor, {choose: pickClass('fig')}); assert.equal(r1.ok, true); assert.equal(r1.result, 'levels'); assert.match(r1.notice, /is now level \d+/); }
  assert.deepEqual(actor.items.get('fig').calls, [['update', {'system.levels': 4}]]);
  assert.equal(copies().length, 1);
  const s = setup({user: users.gm, settings: {disableAdvancements: true}}); let r2;
  r2 = await startLevelUp(s.actor, {choose: pickClass('fig')}); assert.equal(r2.ok, true); assert.equal(r2.result, 'levels');
  assert.equal(s.calls.length, 0);
  assert.match(r2.notice, /level 4\. dnd5e's "Disable Advancements" setting is on/, 'says why, and what is left to do by hand');
});

test('0.44.2: no steps but advancements on says the class has no steps for that level', async () => {
  const {actor} = setup({user: users.gm, steps: 0});
  const r = await startLevelUp(actor, {choose: pickClass('fig')});
  assert.match(r.notice, /\[TEST\] Fighter is now level 4\. dnd5e has no advancement steps for this level/);
  assert.match(r.notice, /set Hit Points and add new features yourself/);
});

// ---------- 0.29.5: dnd5e's window opens the way dnd5e's sheets open it ----------

test('0.29.5: the Hub (a Foundry sheet, no _renderChild) opens dnd5e\'s window with renderChild, in its own window', async () => {
  const {actor, calls} = setup({user: users.gm}); const shown = [];
  const hub = {renderChild: m => { shown.push(m); return m; }};
  assert.deepEqual(await startLevelUp(actor, {choose: pickClass('fig'), sheet: hub}), {ok: true, result: 'advancement'});
  assert.equal(shown[0], calls[0].manager);
  assert.deepEqual(calls[0].manager.renders, [], 'not a bare render in the main window');
  const add = setup({user: users.gm}), added = [];
  await startLevelUp(add.actor, {choose: pickClass(ADD_CLASS), sheet: {renderChild: m => added.push(m)}});
  assert.equal(added[0], add.calls.find(c => c.kind === 'new').manager);
});

test('0.29.5: a sheet embedded in another app hands the window to its parent, as dnd5e does', async () => {
  const {actor, calls} = setup({user: users.gm}); const shown = [];
  await startLevelUp(actor, {choose: pickClass('fig'), sheet: {parent: {renderChild: m => shown.push(m)}, renderChild: () => assert.fail('the parent renders it')}});
  assert.equal(shown[0], calls[0].manager);
});

test('0.29.5: with steps (dnd5e fills them in forLevelChange) the level is never raised by the Hub; cancel leaves it as it was', async () => {
  const {actor, calls} = setup({user: users.gm});
  await startLevelUp(actor, {choose: pickClass('fig'), sheet: {renderChild() {}}});
  globalThis.Hooks.callAll('closeAdvancementManager', calls[0].manager);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(actor.items.get('fig').calls ?? [], [], 'no level change from the Hub');
  assert.deepEqual(actor.calls, [], 'the Actor is untouched');
  assert.equal(copies().length, 0, 'no backup copy');
});

test('0.29.5: dnd5e reports no steps: one direct level bump (as the native sheet), noted in the console', async () => {
  const {actor} = setup({user: users.gm, steps: 0}); const said = [], info = console.info;
  console.info = m => said.push(m);
  try { { const r3 = await startLevelUp(actor, {choose: pickClass('fig'), sheet: {renderChild: () => assert.fail('no window')}}); assert.equal(r3.ok, true); assert.equal(r3.result, 'levels'); assert.match(r3.notice, /is now level \d+/); } }
  finally { console.info = info; }
  assert.deepEqual(actor.items.get('fig').calls, [['update', {'system.levels': 4}]]);
  assert.match(said[0], /no advancement steps for \[TEST\] Fighter/);
});

test('0.29.5: if opening dnd5e\'s window fails, nothing changes and no copy is made', async () => {
  const {actor} = setup({user: users.gm});
  const r = await startLevelUp(actor, {choose: pickClass('fig'), sheet: {renderChild: () => { throw new Error('boom'); }}});
  assert.equal(r.ok, false); assert.match(r.error, /boom/);
  assert.deepEqual(actor.items.get('fig').calls ?? [], []);
  assert.equal(copies().length, 0); assert.equal(globalThis.Hooks.count(), 0, 'listeners removed');
});

// ---------- Add a class ----------

test('Add a class: dnd5e\'s class browser (own classes left out), then forNewItem', async () => {
  const {actor, calls} = setup({user: users.gm});
  assert.deepEqual(await startLevelUp(actor, {choose: pickClass(ADD_CLASS)}), {ok: true, result: 'advancement'});
  const browse = calls.find(c => c.kind === 'browse');
  assert.deepEqual([...browse.filters.locked.types], ['class']);
  assert.deepEqual([...browse.filters.locked.arbitrary[0].v.v], ['fighter']);
  const made = calls.find(c => c.kind === 'new');
  assert.equal(made.itemData.name, '[TEST] Rogue');
});

test('Add a class without advancement steps creates the class item; closing the browser does nothing', async () => {
  const {actor} = setup({user: users.gm, steps: 0});
  assert.deepEqual(await startLevelUp(actor, {choose: pickClass(ADD_CLASS)}), {ok: true, result: 'created'});
  assert.equal(actor.calls.find(c => c[0] === 'createEmbedded')[2][0].name, '[TEST] Rogue');
  assert.equal(copies().length, 1);
  const s = setup({user: users.gm});
  globalThis.dnd5e.applications.CompendiumBrowser.selectOne = async () => null;
  assert.deepEqual(await startLevelUp(s.actor, {choose: pickClass(ADD_CLASS)}), {ok: true, result: null});
  assert.equal(copies().length, 0);
});

test('a character with no class goes straight to Add a class (no dialog)', async () => {
  const {actor, calls} = setup({user: users.gm, items: []});
  let asked = false;
  await startLevelUp(actor, {choose: async () => { asked = true; return null; }});
  assert.equal(asked, false); assert.ok(calls.some(c => c.kind === 'browse'));
});

test('this dnd5e lacks the level-up API: the native sheet opens instead', async () => {
  const {actor} = setup({user: users.gm});
  const opened = [];
  class CharacterActorSheet { constructor(o) { this.document = o.document; } async render() { opened.push(this.document); } }
  globalThis.dnd5e = {applications: {actor: {CharacterActorSheet}}};
  const r = await startLevelUp(actor, {choose: pickClass('fig')});
  assert.equal(r.result, 'native'); assert.match(r.notice, /class level selector/); assert.equal(opened[0], actor);
});

// ---------- The backup copy ----------

test('the copy: GM-only, in Ashen Gate / Level backups, marked, inert for Ashen Gate, dnd5e kept', async () => {
  const {actor, folders} = setup({user: users.gm, steps: 0});
  actor.items.get('fig').flags = {'ashen-gate-cinders': {attachedTo: {instanceId: 'i1', slot: 1}}, 'ashen-gate-manager': {source: {id: 'REC-1'}}, dnd5e: {x: 1}};
  await startLevelUp(actor, {choose: pickClass('fig')});
  const [copy] = copies();
  assert.deepEqual(copy.ownership, {default: 0});
  assert.deepEqual(folders.map(f => [f.name, f.folder]), [['Ashen Gate', null], ['Level backups', 'f1']]);
  assert.equal(copy.folder, 'f2');
  const flag = copy.flags[MODULE_ID].levelBackup;
  assert.equal(flag.sourceId, 'actor1'); assert.equal(flag.levelBefore, 3); assert.match(flag.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(flag.opId);
  assert.deepEqual(Object.keys(copy.flags).sort(), ['ashen-gate-character-hub', 'dnd5e']);
  assert.deepEqual(Object.keys(copy.flags[MODULE_ID]), ['levelBackup'], 'no Journey or other Hub state on the copy');
  assert.deepEqual(copy.items[0].flags, {'ashen-gate-manager': {source: {id: 'REC-1'}}, dnd5e: {x: 1}});
  assert.equal(copy.items[0].system.levels, 3, 'the copy is the character before levelling');
  assert.equal(copy._id, undefined); assert.equal(copy.createOptions.keepEmbeddedIds, true);
  assert.equal(actor.name, '[TEST] Hero', 'the source is not renamed');
});

test('archive round-trip: every stripped scope is kept in levelBackup.archivedFlags; no live ashen-gate-* scope but Manager', async () => {
  const {actor} = setup({user: users.gm, steps: 0});
  actor.flags['ashen-gate-cinders'] = {cinders: ['i1']}; actor.flags['ashen-gate-skill-trees'] = {progressV2: {t: 3}};
  actor.items.get('fig').flags = {'ashen-gate-cinders': {attachedTo: {instanceId: 'i1', slot: 1}}, 'ashen-gate-manager': {source: {id: 'REC-1'}}};
  const snap = actor.toObject();
  snap.effects = [{_id: 'e1', flags: {'ashen-gate-strain': {s: 1}, core: {c: 1}}}];
  snap.items[0].effects = [{_id: 'ie1', flags: {'ashen-gate-factions': {f: 1}}}];
  await bk.createBackup(snap, {sourceId: actor.id, levelBefore: 3, opId: 'rt'});
  const [copy] = copies(), a = copy.flags[MODULE_ID].levelBackup.archivedFlags;
  // Stripped scopes equal archived scopes, document by document.
  const ag = f => Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('ashen-gate-') && k !== 'ashen-gate-manager'));
  assert.deepEqual(a.actor, ag(snap.flags));
  assert.deepEqual(a.items, {fig: ag(snap.items[0].flags)});
  assert.deepEqual(a.effects, {e1: ag(snap.effects[0].flags)});
  assert.deepEqual(a.itemEffects, {fig: {ie1: ag(snap.items[0].effects[0].flags)}});
  // Restoring puts the original flags back exactly.
  const restored = {...copy.flags}; delete restored[MODULE_ID]; Object.assign(restored, a.actor);
  assert.deepEqual(restored, snap.flags);
  // Nothing live is left on the copy but dnd5e/core, Manager source ids and the backup marker.
  const live = [copy.flags, ...copy.items.map(i => i.flags), ...copy.effects.map(e => e.flags), ...copy.items.flatMap(i => (i.effects ?? []).map(e => e.flags))];
  for (const f of live) for (const k of Object.keys(f)) assert.ok(!k.startsWith('ashen-gate-') || k === 'ashen-gate-manager' || (k === MODULE_ID && f === copy.flags), k);
  assert.deepEqual(Object.keys(copy.flags[MODULE_ID]), ['levelBackup']);
  assert.deepEqual(copy.flags[MODULE_ID].levelBackup.classesBefore, [{id: 'fig', name: '[TEST] Fighter', identifier: 'fighter', levels: 3}]);
});

test('copy names: "<name> - level X", then " (2)" when taken', () => {
  assert.equal(bk.backupName('[TEST] Hero', 4, [{name: 'x'}]), '[TEST] Hero - level 4');
  assert.equal(bk.backupName('[TEST] Hero', 4, [{name: '[TEST] Hero - level 4'}, {name: '[TEST] Hero - level 4 (2)'}]), '[TEST] Hero - level 4 (3)');
});

test('same opId twice makes one copy; only the GM may create one', async () => {
  const {actor} = setup({user: users.gm});
  const snap = actor.toObject();
  await bk.createBackup(snap, {sourceId: actor.id, levelBefore: 3, opId: 'op1'});
  assert.equal((await bk.createBackup(snap, {sourceId: actor.id, levelBefore: 3, opId: 'op1'})).duplicate, true);
  assert.equal(copies().length, 1);
  globalThis.game.user = users.owner;
  assert.equal((await bk.createBackup(snap, {sourceId: actor.id, levelBefore: 3, opId: 'op2'})).ok, false);
});

test('player with a GM on: the request goes to the GM client, which checks ownership and makes the copy', async () => {
  const {actor, sent} = setup({steps: 0});
  const run = startLevelUp(actor, {choose: pickClass('fig')});
  await new Promise(r => setTimeout(r, 0));
  const [[, msg]] = sent;
  assert.equal(msg.type, 'level-backup'); assert.equal(msg.actorId, 'actor1'); assert.equal(msg.levelBefore, 3);
  // The GM client handles it.
  globalThis.game.user = users.gm;
  await onSocket(msg, 'owner');
  const receipt = sent.at(-1)[1];
  assert.equal(receipt.ok, true); assert.equal(copies().length, 1);
  globalThis.game.user = users.owner;
  await onSocket(receipt);
  assert.equal((await run).result, 'levels');
  // Replayed: no second copy. Observer asking: refused.
  globalThis.game.user = users.gm;
  await onSocket(msg, 'owner'); assert.equal(copies().length, 1);
  await onSocket({...msg, userId: 'observer', opId: 'x', requestId: 'r2'}, 'observer');
  assert.equal(sent.at(-1)[1].ok, false); assert.match(sent.at(-1)[1].message, /doesn't own/);
  await onSocket({...msg, snapshot: {...msg.snapshot, _id: 'other'}, opId: 'y', requestId: 'r3'}, 'owner');
  assert.equal(sent.at(-1)[1].ok, false); assert.equal(copies().length, 1);
});

test('player with no GM on: level-up goes ahead, the copy is queued and made when a GM is on', async () => {
  const {actor, sent} = setup({steps: 0, gmOn: false});
  const backups = [];
  assert.equal((await startLevelUp(actor, {choose: pickClass('fig'), onBackup: b => backups.push(b)})).result, 'levels');
  assert.equal(sent.length, 0); assert.deepEqual(backups, [{ok: true, result: 'queued'}]);
  assert.deepEqual(backupNotice(backups[0])[0], 'info');
  const queue = bk.readQueue(actor);
  assert.equal(queue.length, 1); assert.equal(queue[0].snapshot.flags['ashen-gate-strain'], undefined, 'queued snapshot is already inert');
  assert.equal(copies().length, 0);
  globalThis.game.user = users.gm; globalThis.game.users[0].active = true;
  assert.equal(await bk.flushQueue(), 1);
  assert.equal(copies().length, 1); assert.equal(copies()[0].name, '[TEST] Hero - level 3');
  assert.deepEqual(copies()[0].flags[MODULE_ID].levelBackup.archivedFlags.actor['ashen-gate-strain'], {state: {value: 2}}, 'queued copies keep the archive');
  assert.deepEqual(bk.readQueue(actor), []);
  assert.equal(await bk.flushQueue(), 0, 're-run makes nothing');
});

test('Journey: the copy records nothing; the source records its new level once', async () => {
  const {actor} = setup({user: users.gm, steps: 0});
  await startLevelUp(actor, {choose: pickClass('fig')});
  const [copy] = copies();
  copy.testUserPermission = () => true; copy.update = async () => { throw new Error('the copy must not be written'); };
  assert.equal(await j.recordLevel(copy), null);
  assert.ok(!j.partyActors().includes(copy));
  actor.system.details.level = 4; // dnd5e derives this from the class levels
  await j.recordLevel(actor); await j.recordLevel(actor);
  assert.deepEqual(actor.flags[MODULE_ID].journey.entries.map(e => e.id), ['level-4']);
});

// ---------- The button ----------

test('header button (0.46.0): ready, or aria-disabled with the reason; never a title attribute; the click says why', async () => {
  const {actor} = setup();
  const menu = {menu: null};
  let html = shellHtml({actor, editable: true, tab: 'overview', sheet: menu});
  const ready = html.match(/<button[^>]*data-action="level-up"[^>]*>/)[0];
  assert.doesNotMatch(ready, /aria-disabled|title=/); assert.match(ready, /aria-label="Level up"/);
  const s = setup({xp: {value: 5, max: 2700}});
  html = shellHtml({actor: s.actor, editable: true, tab: 'overview', sheet: menu});
  const tag = html.match(/<button[^>]*data-action="level-up"[^>]*>/)[0];
  assert.match(tag, /aria-disabled="true"/); assert.match(tag, /aria-label="Level up: Not enough XP yet: 5 of 2700\."/); assert.match(tag, /data-tooltip="Not enough XP yet: 5 of 2700\."/);
  await ACTIONS['level-up']({document: s.actor});
  assert.deepEqual(s.notes.at(-1), ['info', 'Not enough XP yet: 5 of 2700.']);
  assert.equal(s.calls.length, 0);
  assert.doesNotMatch(shellHtml({actor, limited: true, editable: false, tab: 'overview', sheet: menu}), /level-up/);
});
