/** 0.68.0 Effects tab. Mocked Foundry/dnd5e: proves the logic and the calls, not the real sheet. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as fx from '../scripts/effects.mjs';
import {visibleTabs} from '../scripts/views.mjs';

function mkEffect(o, parent) {
  const e = {documentName: 'ActiveEffect', id: o.id, name: o.name, img: 'e.svg', disabled: !!o.disabled, origin: o.origin ?? null, flags: o.flags ?? {}, statuses: new Set(o.statuses ?? []),
    isTemporary: !!o.temporary, isSuppressed: !!o.suppressed, duration: {label: o.dur ?? ''}, parent, calls: [], transfer: !!o.transfer,
    getDurationParts() { return e.duration.label ? [e.duration.label] : []; },
    async update(d) { e.calls.push(['update', d]); Object.assign(e, d); },
    async delete() { e.calls.push(['delete']); },
    sheet: {render: a => e.calls.push(['sheet', a])}};
  if (o.deny) e.canUserModify = (u, act) => !o.deny.includes(act);
  return e;
}
function setup(user = users.owner, extra = {}) {
  installGlobals({user});
  const actor = makeActor({items: [{id: 'ring', name: '[TEST] Ring', type: 'equipment'}]});
  const own = [mkEffect({id: 'a', name: '[TEST] Bless', temporary: true, dur: '1 minute', origin: 'Actor.other.Item.x'}, actor), mkEffect({id: 'b', name: '[TEST] Hand'}, actor),
    mkEffect({id: 'c', name: '[TEST] Off', disabled: true}, actor), mkEffect({id: 'd', name: '[TEST] Strain', flags: {'ashen-gate-cinders': {strain: 1}}}, actor), ...(extra.own ?? [])];
  const ring = actor.items.get('ring'); ring.documentName = 'Item';
  const fromRing = mkEffect({id: 'r', name: '[TEST] Ring glow', transfer: true}, ring);
  ring.effects = new Map([['r', fromRing]]);
  actor.effects = new Map(own.map(e => [e.id, e]));
  actor.allApplicableEffects = function* () { yield* own; yield fromRing; };
  actor.createEmbeddedDocuments = async (...a) => { actor.calls.push(['create', ...a]); return [{id: 'new'}]; };
  globalThis.fromUuidSync = u => (u === 'Actor.other.Item.x' ? {documentName: 'Item', name: '[TEST] Bless spell'} : null);
  return {actor, own, fromRing, byId: id => actor.effects.get(id)};
}
const cats = (actor, user) => Object.fromEntries(fx.effectsData(actor, user).categories.map(c => [c.type, c.rows.map(r => r.id)]));

test('list, grouping (fallback when dnd5e helper absent) and source resolution', () => {
  const {actor} = setup();
  assert.deepEqual(cats(actor), {temporary: ['a'], passive: ['b', 'd', 'r'], inactive: ['c']});
  const rows = Object.fromEntries(fx.effectsData(actor).categories.flatMap(c => c.rows).map(r => [r.id, r]));
  assert.equal(rows.a.source.name, '[TEST] Bless spell'); assert.equal(rows.a.duration, '1 minute');
  assert.equal(rows.b.source.name, actor.name); assert.equal(rows.r.source.name, '[TEST] Ring'); assert.equal(rows.r.transferred, true);
});
test('uses dnd5e prepareCategories when it is exposed', () => {
  const {actor} = setup(); let called = 0;
  globalThis.customElements = {get: () => ({prepareCategories: (effects, o) => { called++; assert.equal(o.parent, actor); return {temporary: {type: 'temporary', label: 'Temp!', effects: effects.slice(0, 1)}}; }})};
  try { const d = fx.effectsData(actor); assert.equal(called, 1); assert.deepEqual(d.categories.map(c => c.label), ['Temp!']); } finally { delete globalThis.customElements; }
});
test('toggle writes disabled, for an owner and the GM; item effects can be switched', async () => {
  const {actor, byId, fromRing} = setup();
  assert.equal((await fx.toggleEffect(actor, 'b')).ok, true); assert.deepEqual(byId('b').calls[0], ['update', {disabled: true}]);
  assert.equal((await fx.toggleEffect(actor, 'c')).ok, true); assert.deepEqual(byId('c').calls[0], ['update', {disabled: false}]);
  assert.equal((await fx.toggleEffect(actor, 'r', {parentId: 'ring'})).ok, true); assert.deepEqual(fromRing.calls[0], ['update', {disabled: true}]);
  assert.equal((await fx.toggleEffect(actor, 'b', {user: users.gm})).ok, true);
});
test('observers are refused everywhere (data layer), and the view is read-only', async () => {
  const {actor, byId} = setup(users.observer);
  for (const f of [() => fx.toggleEffect(actor, 'b'), () => fx.editEffect(actor, 'b'), () => fx.deleteEffect(actor, 'b', {confirm: async () => true}), () => fx.addEffect(actor)]) {
    const r = await f(); assert.equal(r.ok, false); assert.match(r.error, /don't own/);
  }
  assert.deepEqual(byId('b').calls, []); assert.deepEqual(actor.calls, []);
  const html = fx.effectsTab({actor, editable: false});
  assert.doesNotMatch(html, /effect-edit|effect-delete/); assert.match(html, /data-action="effect-add"[^>]*disabled/);
  assert.match(html, /role="switch"[^>]*disabled/);
});
test('add creates a plain effect with the native sheet; edit opens the native config', async () => {
  const {actor, byId} = setup();
  assert.equal((await fx.addEffect(actor)).ok, true);
  const [, type, rows, opts] = actor.calls.at(-1); assert.equal(type, 'ActiveEffect'); assert.equal(rows[0].name, 'New Effect'); assert.equal(opts.renderSheet, true);
  assert.equal((await fx.editEffect(actor, 'b')).ok, true); assert.deepEqual(byId('b').calls[0], ['sheet', {force: true}]);
});
test('delete asks "Delete <name>?" with "Delete effect"; Cancel deletes nothing; transferred effects are refused', async () => {
  const {actor, byId, fromRing} = setup(); const log = [];
  assert.equal((await fx.deleteEffect(actor, 'b', {confirm: async (m, o) => { log.push(o); return false; }})).result, null);
  assert.deepEqual(log[0], {title: 'Delete [TEST] Hand?', yes: 'Delete effect'}); assert.deepEqual(byId('b').calls, []);
  assert.equal((await fx.deleteEffect(actor, 'b', {confirm: async () => true})).ok, true); assert.deepEqual(byId('b').calls, [['delete']]);
  const r = await fx.deleteEffect(actor, 'r', {parentId: 'ring', confirm: async () => true});
  assert.equal(r.ok, false); assert.match(r.error, /comes from \[TEST\] Ring: edit it there/); assert.deepEqual(fromRing.calls, []);
  assert.equal((await fx.deleteEffect(actor, 'r', {parentId: 'ring', user: users.gm, confirm: async () => true})).ok, false, 'GM too');
});
test('Ashen Gate managed effects, concentration and document permission', async () => {
  const {actor, byId} = setup(users.owner, {own: [mkEffect({id: 'x', name: '[TEST] Conc', statuses: ['concentrating']}, null), mkEffect({id: 'y', name: '[TEST] Locked', deny: ['update', 'delete']}, null)]});
  assert.match((await fx.toggleEffect(actor, 'd')).error, /managed by an Ashen Gate module/);
  assert.equal((await fx.toggleEffect(actor, 'd', {user: users.gm})).ok, true);
  actor.concentration = {effects: new Set([byId('x')])};
  assert.equal((await fx.toggleEffect(actor, 'x', {user: users.gm})).ok, false);
  assert.equal((await fx.deleteEffect(actor, 'x', {user: users.gm, confirm: async () => true})).ok, false);
  assert.equal((await fx.toggleEffect(actor, 'y')).ok, false); assert.equal((await fx.editEffect(actor, 'y')).ok, false);
});
test('condition (status) effects follow the Conditions rule for players', async () => {
  const {actor} = setup(users.owner, {own: [mkEffect({id: 's', name: '[TEST] Prone', statuses: ['prone']}, null)]});
  installGlobals({user: users.owner, modules: {'ashen-gate-utilities': {active: true, api: {conditions: {contract: 'ag-utilities-conditions/1', canApply: () => false, canRemove: () => false, apply() {}, remove() {}, canChangeActor: () => false, isPlayerCharacter: () => true}}}}});
  actor.id = 'actor1'; globalThis.game.actors = {get: () => actor};
  assert.equal((await fx.toggleEffect(actor, 's')).ok, false);
});
test('view: switch semantics, empty state, tab for every role', () => {
  const {actor} = setup(); const html = fx.effectsTab({actor, editable: true});
  assert.match(html, /role="switch"[^>]*aria-checked="true"/); assert.match(html, /Temporary Effects/); assert.match(html, /Delete \[TEST\] Hand/); assert.match(html, /Switches apply now/);
  assert.match(html, /\[TEST\] Ring \(edit it on the item\)/);
  const empty = makeActor(); empty.effects = new Map(); empty.allApplicableEffects = function* () {};
  const e = fx.effectsTab({actor: empty, editable: true}); assert.match(e, /No effects on this character/); assert.match(e, /data-action="effect-add"/);
  for (const u of [users.owner, users.observer, users.gm]) assert.ok(visibleTabs(u).some(t => t.id === 'effects'));
});
test('live re-render: main.mjs already redraws on every ActiveEffect hook, item effects included', async () => {
  const {readFile} = await import('node:fs/promises');
  const src = await readFile(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(src, /'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect'\]\) \{\s*Hooks\.on\(hook, \(doc, \.\.\.rest\) => \{ if \(isBulk\(\.\.\.rest\)\) return; scheduleRender\(actorOf\(doc\)\)/);
  const {actorOf} = await import('../scripts/main.mjs').catch(() => ({}));
  if (actorOf) { const a = {documentName: 'Actor'}, i = {documentName: 'Item', parent: a}, e = {documentName: 'ActiveEffect', parent: i}; assert.equal(actorOf(e), a); }
});
