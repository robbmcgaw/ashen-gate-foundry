/** 0.60.1: the Foundry hotbar sync is for players. A GM's macro hotbar is never read or written, on any path. Mocked Foundry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHotbarLink} from '../scripts/hotbar-link.mjs';
import {createHubSheetClass, linkHub} from '../scripts/sheet.mjs';
import {quickDrawerHtml, GM_NOTE} from '../scripts/hotbar-views.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

function world(base) {
  const user = {...base, hotbar: {1: 'm1', 2: 'm2'}, flags: {}, calls: [], can: () => true,
    async assignHotbarMacro(m, slot) { user.calls.push(['assign', slot]); return user; },
    async setFlag(s, k) { user.calls.push(['setFlag', k]); }, async update() { user.calls.push(['update']); }};
  installGlobals({user});
  const macros = [{id: 'm1', name: 'Mine', command: 'x', documentName: 'Macro', uuid: 'Macro.m1', isAuthor: true, testUserPermission: () => true}, {id: 'm2', name: 'Two', command: 'y', documentName: 'Macro', uuid: 'Macro.m2', isAuthor: true, testUserPermission: () => true}];
  globalThis.game.macros = Object.assign(macros, {get: id => macros.find(m => m.id === id)});
  globalThis.fromUuidSync = u => macros.find(m => m.uuid === u) ?? null;
  const actor = makeActor({items: [{id: 'ss', name: '[TEST] Sword', type: 'weapon'}]});
  actor.flags = {[MODULE_ID]: {hotbar: [{type: 'Item', id: 'ss'}]}};
  const sockets = []; globalThis.game.socket = {emit: (...a) => sockets.push(a)};
  return {user, actor, link: createHotbarLink({create: async () => { user.calls.push(['create']); }, notify: () => {}}), sockets};
}
test('GM: opening, hub changes and hotbar changes never touch the macro hotbar, the user, a flag or a socket', async () => {
  const w = world(users.gm);
  assert.equal(await w.link.activate(w.actor), null);
  assert.equal(w.link.linked, null);
  assert.equal(await w.link.hubChanged(w.actor), null); assert.equal(await w.link.foundryChanged(), null);
  assert.deepEqual(w.user.calls, []); assert.deepEqual(w.user.hotbar, {1: 'm1', 2: 'm2'}); assert.deepEqual(w.sockets, []);
  assert.equal(w.actor.calls.filter(c => c[0] === 'update').length, 0, 'the Hub bar is not written from the GM\'s hotbar either');
  // several characters, a player's character, and the sheet's own hook
  for (let i = 0; i < 3; i++) { const a = makeActor(); a.id = 'a' + i; a.flags = {[MODULE_ID]: {hotbar: [{type: 'Item', id: 'x'}]}}; await w.link.activate(a); }
  assert.deepEqual(w.user.calls, []);
  const Hub = createHubSheetClass(FakeActorSheetV2), sheet = new Hub({document: w.actor});
  assert.equal(linkHub(sheet, {activate: () => { throw new Error('must not be called for a GM'); }}), null);
});
test('GM: even a link that was somehow set cannot write (push / pull are guarded too)', async () => {
  const w = world(users.owner);
  await w.link.activate(w.actor); assert.equal(w.link.linked, w.actor);
  const before = w.user.calls.length;
  globalThis.game.user.isGM = true;   // the same client becomes GM
  w.actor.flags[MODULE_ID].hotbar = [{type: 'Item', id: 'ss'}, {type: 'Macro', uuid: 'Macro.m2'}];
  await w.link.hubChanged(w.actor); w.user.hotbar[3] = 'm1'; await w.link.foundryChanged();
  assert.equal(w.user.calls.length, before, 'nothing written after becoming GM');
});
test('player: unchanged, the bars still link and the Hub change still reaches Foundry', async () => {
  const w = world(users.owner);
  assert.ok(await w.link.activate(w.actor)); assert.equal(w.link.linked, w.actor);
  assert.ok(w.user.calls.some(c => c[0] === 'create' || c[0] === 'assign'), 'a player still gets the sync');
  assert.equal(linkHub({hubContext: {editable: true}, document: w.actor}, {activate: a => a}), w.actor);
});
test('the GM sees a short note in the quick bar; players do not; stored hotbar data is untouched', () => {
  const w = world(users.gm);
  const html = quickDrawerHtml({sheet: {id: 'x'}, actor: w.actor, editable: true});
  assert.match(html, /data-hotbar-gm-note[^>]*>Hotbar sync is for players\. As GM your macro hotbar is not changed\./);
  assert.equal(GM_NOTE, 'Hotbar sync is for players. As GM your macro hotbar is not changed.');
  assert.deepEqual(w.actor.flags[MODULE_ID].hotbar, [{type: 'Item', id: 'ss'}]);
  const p = world(users.owner); assert.doesNotMatch(quickDrawerHtml({sheet: {id: 'x'}, actor: p.actor, editable: true}), /gm-note/);
});
test('the Foundry hooks are guarded for a GM (main.mjs)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  for (const hook of ['updateActor', 'updateUser', 'renderHotbar']) assert.match(src, new RegExp(`Hooks\\.on\\('${hook}'[^\\n]*game\\.user\\?\\.isGM`), hook);
});
