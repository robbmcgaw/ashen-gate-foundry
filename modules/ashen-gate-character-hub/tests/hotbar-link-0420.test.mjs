/**
 * 0.42.0: the quick bar linked to Foundry's hotbar page 1, the roll dialog position for quick-bar uses, and item icons
 * that use the item. Mocked Foundry and dnd5e: this proves the Hub's logic and calls, not Foundry's hotbar UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as hb from '../scripts/hotbar.mjs';
import {createHotbarLink, macroToEntry, itemMacroCommand, itemMacroName, LINK_FLAG} from '../scripts/hotbar-link.mjs';
import {rollEvent, useItem} from '../scripts/item-actions.mjs';
import {pressQuickSlot} from '../scripts/quick-keys.mjs';
import {cardHtml, iconHtml} from '../scripts/cards.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {moreMenuHtml, headerHtml} from '../scripts/views.mjs';
import * as hotbarLinkModule from '../scripts/hotbar-link.mjs';
import fs from 'node:fs';
import {MODULE_ID} from '../scripts/constants.mjs';

const ITEMS = [
  {id: 'ss', name: '[TEST] Shortsword', type: 'weapon', system: {activities: [{activation: {type: 'action'}}]}},
  {id: 'hp', name: '[TEST] Potion', type: 'consumable', system: {activities: [{activation: {type: 'action'}}]}},
  {id: 'rock', name: '[TEST] Rock', type: 'loot'}
];

/** A world with a user hotbar, world macros and dnd5e's create5eMacro (same find-or-create rule as dnd5e 6.0.6). */
function world({hotbar = {}, can = true, hub = [], settings = {}, flags = {}} = {}) {
  const user = {...users.owner, hotbar: {...hotbar}, flags: structuredClone(flags), calls: [], can: () => can,
    async assignHotbarMacro(m, slot) { user.calls.push(['assign', m?.id ?? null, slot]); if (m) user.hotbar[slot] = m.id; else delete user.hotbar[slot]; return user; },
    async setFlag(scope, key, v) { user.calls.push(['setFlag', key]); (user.flags[scope] ??= {})[key] = v; }};
  const notes = installGlobals({user, settings});
  const list = [];
  const macro = (id, name, command, extra = {}) => { const m = {documentName: 'Macro', id, uuid: `Macro.${id}`, name, command, isAuthor: true, testUserPermission: () => true, ...extra}; list.push(m); return m; };
  globalThis.game.macros = Object.assign(list, {get: id => list.find(m => m.id === id) ?? null});
  globalThis.fromUuidSync = uuid => list.find(m => m.uuid === uuid) ?? null;
  const actor = makeActor({items: ITEMS});
  for (const i of actor.items) { i.uuid = `Actor.actor1.Item.${i.id}`; i._source = {name: i.name}; }
  actor.flags = {[MODULE_ID]: {hotbar: hub}};
  let made = 0;
  const create = async (data, slot) => {
    if (!can) throw new Error('You do not have permission to create script macros');
    const item = actor.items.find(i => i.uuid === data.uuid);
    const cmd = itemMacroCommand(item);
    const m = list.find(x => x.name === item.name && x.command === cmd && x.isAuthor) ?? (made++, macro(`made${made}`, item.name, cmd, {flags: {dnd5e: {itemMacro: true}}}));
    await user.assignHotbarMacro(m, slot);
  };
  const told = [];
  const link = createHotbarLink({create, notify: m => told.push(m)});
  return {user, actor, link, macro, notes, told, made: () => made, writes: () => actor.calls.filter(c => c[0] === 'update').length};
}
const askNever = () => { throw new Error('should not ask'); };

test('Hub → Foundry: the first link of a bar onto an empty Foundry page puts each slot there without asking, with dnd5e\'s item macro', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}, {type: 'Macro', uuid: 'Macro.light'}]});
  w.macro('light', '[TEST] Light', 'console.log(1)');
  assert.equal(await w.link.activate(w.actor, {ask: askNever}), 'hub');
  const m1 = game.macros.get(w.user.hotbar[1]);
  assert.equal(m1.name, '[TEST] Shortsword'); assert.equal(m1.command, 'dnd5e.documents.macro.rollItem("[TEST] Shortsword", { event })');
  assert.equal(w.user.hotbar[2], 'light');
  assert.equal(w.made(), 1);
  assert.equal(w.link.linked, w.actor);
  assert.equal(await w.link.activate(w.actor, {ask: askNever}), null, 'already linked: nothing again');
});

test('Hub → Foundry: an item that already has your dnd5e macro reuses it (no duplicate); assign and clear follow live', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}]});
  const old = w.macro('mine', '[TEST] Shortsword', 'dnd5e.documents.macro.rollItem("[TEST] Shortsword", { event })');
  await w.link.activate(w.actor, {ask: askNever});
  assert.equal(w.user.hotbar[1], old.id); assert.equal(w.made(), 0);
  await hb.setHotbarSlot(w.actor, 3, w.actor.items.get('hp'));
  await w.link.hubChanged(w.actor);
  assert.equal(game.macros.get(w.user.hotbar[4]).name, '[TEST] Potion');
  await hb.clearHotbarSlot(w.actor, 0);
  await w.link.hubChanged(w.actor);
  assert.equal(w.user.hotbar[1], undefined, 'cleared in Foundry too');
  assert.equal(game.macros.length, 2, 'the macro itself is kept');
});

test('Foundry → Hub: an item macro of this character or a world macro goes into the Hub slot; clearing it clears the Hub slot', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}]});
  await w.link.activate(w.actor, {ask: askNever});
  const potion = w.macro('pot', '[TEST] Potion', itemMacroCommand(w.actor.items.get('hp')));
  const world1 = w.macro('w1', '[TEST] Torch', 'game.togglePause()');
  await w.user.assignHotbarMacro(potion, 3); await w.link.foundryChanged();
  await w.user.assignHotbarMacro(world1, 10); await w.link.foundryChanged();
  assert.deepEqual(hb.hotbarSlots(w.actor)[2], {type: 'Item', id: 'hp'});
  assert.deepEqual(hb.hotbarSlots(w.actor)[9], {type: 'Macro', uuid: 'Macro.w1'});
  await w.user.assignHotbarMacro(null, 1); await w.link.foundryChanged();
  assert.equal(hb.hotbarSlots(w.actor)[0], null, 'dragged off Foundry\'s bar: cleared in the Hub');
});

test('things the Hub cannot hold stay in Foundry and the Hub slot is left as it is', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}]});
  await w.link.activate(w.actor, {ask: askNever});
  const other = w.macro('o', '[TEST] Greataxe', 'dnd5e.documents.macro.rollItem("[TEST] Greataxe", { event })');
  const activity = w.macro('a', '[TEST] Shortsword: Attack', 'dnd5e.documents.macro.rollItem("[TEST] Shortsword", { activityName: "Attack", event });');
  assert.equal(macroToEntry(other, w.actor).kind, 'foreign');
  assert.equal(macroToEntry(activity, w.actor).kind, 'foreign');
  assert.equal(itemMacroName(activity), null);
  const before = w.writes();
  await w.user.assignHotbarMacro(other, 1); await w.link.foundryChanged();
  await w.user.assignHotbarMacro(activity, 2); await w.link.foundryChanged();
  assert.deepEqual(hb.hotbarSlots(w.actor).slice(0, 2), [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}], 'never cleared');
  assert.equal(w.writes(), before);
  assert.equal(w.user.hotbar[1], 'o', 'left alone in Foundry');
});

test('only page 1 (slots 1-10) is read or written', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}], hotbar: {11: 'p2', 23: 'p3'}});
  w.macro('p2', '[TEST] Page two', 'x'); w.macro('p3', '[TEST] Page three', 'y');
  await w.link.activate(w.actor, {ask: askNever});   // Foundry's page 1 is empty: no question
  assert.ok(w.user.calls.filter(c => c[0] === 'assign').every(c => c[2] >= 1 && c[2] <= 10));
  assert.equal(w.user.hotbar[11], 'p2'); assert.equal(w.user.hotbar[23], 'p3');
  const before = w.writes();
  await w.user.assignHotbarMacro(game.macros.get('p3'), 15); await w.link.foundryChanged();
  assert.equal(w.writes(), before, 'a change on page 2 does not touch the Hub');
  for (let i = 0; i < 10; i++) { await hb.setHotbarSlot(w.actor, i, w.actor.items.get('hp')); }
  await w.link.hubChanged(w.actor);
  assert.equal(w.user.hotbar[11], 'p2'); assert.equal(w.user.hotbar[15], 'p3');
});

test('first link with different bars asks once; each answer does what it says and is remembered for this character', async () => {
  const setup = () => { const w = world({hub: [{type: 'Item', id: 'ss'}, null, {type: 'Item', id: 'hp'}], hotbar: {2: 'w1', 3: 'w2'}}); w.macro('w1', '[TEST] One', 'a'); w.macro('w2', '[TEST] Two', 'b'); return w; };
  let w = setup(), asked = 0;
  assert.equal(await w.link.activate(w.actor, {ask: async () => { asked++; return null; }}), null, 'Cancel');
  assert.equal(asked, 1); assert.equal(w.link.linked, null); assert.equal(w.user.flags[MODULE_ID], undefined, 'Cancel is not remembered');
  assert.deepEqual(w.user.hotbar, {2: 'w1', 3: 'w2'}); assert.equal(w.writes(), 0, 'Cancel changes nothing');
  assert.equal(await w.link.activate(w.actor, {ask: askNever}), null, 'not asked again this session');
  const twice = setup(); let n = 0;
  const slow = async () => { n++; return null; };
  await Promise.all([twice.link.activate(twice.actor, {ask: slow}), twice.link.activate(twice.actor, {ask: slow})]);
  assert.equal(n, 1, 'two activations while the question is open ask once');

  w = setup();
  await w.link.activate(w.actor, {ask: async () => 'hub'});
  assert.equal(game.macros.get(w.user.hotbar[1]).name, '[TEST] Shortsword'); assert.equal(w.user.hotbar[2], undefined); assert.equal(game.macros.get(w.user.hotbar[3]).name, '[TEST] Potion');
  assert.equal(w.user.flags[MODULE_ID][LINK_FLAG].actor1, 'hub');

  w = setup();
  await w.link.activate(w.actor, {ask: async () => 'foundry'});
  assert.deepEqual(hb.hotbarSlots(w.actor).slice(0, 3), [null, {type: 'Macro', uuid: 'Macro.w1'}, {type: 'Macro', uuid: 'Macro.w2'}]);
  assert.deepEqual(w.user.hotbar, {2: 'w1', 3: 'w2'});

  w = setup();
  await w.link.activate(w.actor, {ask: async () => 'both'});
  assert.deepEqual(hb.hotbarSlots(w.actor).slice(0, 3), [{type: 'Item', id: 'ss'}, {type: 'Macro', uuid: 'Macro.w1'}, {type: 'Item', id: 'hp'}], 'empty Hub slot 2 filled; slot 3 keeps its item');
  assert.equal(game.macros.get(w.user.hotbar[1]).name, '[TEST] Shortsword', 'empty Foundry slot 1 filled');
  assert.equal(w.user.hotbar[3], 'w2', 'both full: kept');

  // Remembered: a later session (a new link) does not ask; the Hub's bar goes onto Foundry's page.
  const again = world({hub: [{type: 'Item', id: 'ss'}], hotbar: {2: 'w1'}, flags: {[MODULE_ID]: {[LINK_FLAG]: {actor1: 'foundry'}}}});
  again.macro('w1', '[TEST] One', 'a');
  assert.equal(await again.link.activate(again.actor, {ask: askNever}), 'hub');
  assert.equal(again.user.hotbar[2], undefined);
});

test('switching to another character\'s Hub puts that character\'s bar on Foundry\'s page 1', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}]});
  await w.link.activate(w.actor, {ask: askNever});
  const b = makeActor({items: [{id: 'bow', name: '[TEST] Bow', type: 'weapon'}]});
  b.id = 'actor2'; b.items[0].uuid = 'Actor.actor2.Item.bow'; b.items[0]._source = {name: '[TEST] Bow'};
  b.flags = {[MODULE_ID]: {hotbar: [null, {type: 'Item', id: 'bow'}]}};
  const link = createHotbarLink({create: async (data, slot) => { const m = {id: 'bowm', uuid: 'Macro.bowm', name: '[TEST] Bow', command: itemMacroCommand(b.items[0]), isAuthor: true}; game.macros.push(m); await w.user.assignHotbarMacro(m, slot); }});
  let asked = 0;
  await link.activate(b, {ask: async () => { asked++; return 'hub'; }});
  assert.equal(asked, 1, 'first link of this character with different bars: asks');
  assert.equal(w.user.hotbar[1], undefined); assert.equal(w.user.hotbar[2], 'bowm');
});

test('loop guard: a copy that already matches writes nothing, so each change is written once', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}]});
  await w.link.activate(w.actor, {ask: askNever});
  const assigns = () => w.user.calls.filter(c => c[0] === 'assign').length;
  const a0 = assigns(), u0 = w.writes();
  await hb.setHotbarSlot(w.actor, 1, w.actor.items.get('hp'));   // the Hub write (1 actor update)
  await w.link.hubChanged(w.actor);                              // → Foundry (1 assign)
  await w.link.foundryChanged();                                 // Foundry's redraw comes back: nothing
  await w.link.hubChanged(w.actor);                              // and the Actor update again: nothing
  assert.equal(assigns() - a0, 1); assert.equal(w.writes() - u0, 1);
  const pot = game.macros.get(w.user.hotbar[2]);
  await w.user.assignHotbarMacro(pot, 5); await w.link.foundryChanged();   // a Foundry move: 1 Hub write
  const u1 = w.writes(), a1 = assigns();
  await w.link.hubChanged(w.actor); await w.link.foundryChanged();
  assert.equal(w.writes(), u1); assert.equal(assigns(), a1, 'no echo either way');
});

test('0.46.0: always linked, no option: an old stored "unlinked" value is ignored, and no setting, menu item or action exists', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}], settings: {linkFoundryHotbar: false}});
  await w.link.activate(w.actor, {ask: askNever});
  assert.equal(w.user.hotbar[1] !== undefined, true, 'the stored false does not leave the user unlinked');
  assert.equal(w.link.linked, w.actor);
  for (const gone of ['LINK_SETTING', 'registerLinkSetting', 'linkOn', 'setLinkOn']) assert.equal(hotbarLinkModule[gone], undefined, gone);
  assert.equal(ACTIONS['hotbar-link'], undefined);
  const html = moreMenuHtml({menu: 'more'}, {actor: w.actor, sheet: {menu: 'more'}, limited: false, editable: true}) + headerHtml({actor: w.actor, sheet: {menu: null}, limited: false, editable: true}, false);
  assert.doesNotMatch(html, /hotbar-link|Link quick bar|linkbtn/);
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /linkFoundryHotbar|registerLinkSetting|linkOn/, 'no setting is registered');
});

test('no permission to create script macros: the Hub slot still works, one quiet notice, never a throw', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}], can: false});
  await w.link.activate(w.actor, {ask: askNever});
  assert.equal(w.user.hotbar[1], undefined);
  await hb.setHotbarSlot(w.actor, 1, w.actor.items.get('hp')); await w.link.hubChanged(w.actor);
  assert.equal(w.told.length, 1); assert.match(w.told[0], /could not be made/);
  assert.deepEqual(hb.hotbarSlots(w.actor).slice(0, 2), [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'hp'}]);
  assert.equal((await hb.useHotbarSlot(w.actor, 0)).ok, true, 'the Hub slot itself is used as before');
});

test('keys 1-0 with the link on: a Hub in front uses its slot once; Foundry\'s binding is told the key was taken', () => {
  installGlobals();
  const used = [];
  const hub = {rendered: true, hubContext: {editable: true}, element: {querySelector: () => ({})}, dispatch: (a, t) => { used.push(t.dataset.hotbarSlot); return Promise.resolve(); }};
  const ev = {target: null, repeat: false};
  assert.equal(pressQuickSlot(2, ev, [hub]), true);
  assert.equal(pressQuickSlot(2, ev, [hub]), true, 'the same key press again (another binding) does nothing more');
  assert.deepEqual(used, ['2']);
  assert.equal(pressQuickSlot(2, {target: null}, []), false, 'no Hub: the key is Foundry\'s, which now runs the same thing');
});

// ---------- Roll dialog position (bug: "the roll UI sticks to the top of the screen") ----------

class Click { constructor(type, init) { Object.assign(this, init); this.type = type; } }
const view = {PointerEvent: Click, innerWidth: 1600, innerHeight: 900, document: {id: 'main'}};
const slotEl = {ownerDocument: view.document, getBoundingClientRect: () => ({left: 400, top: 700, width: 40, height: 40}), closest: () => null};

test('a quick-bar key press (no pointer position) gets a click at the slot, keeping Shift/Ctrl/Alt for dnd5e', () => {
  const key = {type: 'keydown', key: '1', shiftKey: true, ctrlKey: false};
  const e = rollEvent(key, slotEl, view);
  assert.ok(e instanceof Click); assert.equal(e.clientY, 720); assert.equal(e.clientX, 420); assert.equal(e.shiftKey, true);
  const enter = rollEvent({type: 'click', detail: 0, clientX: 0, clientY: 0, view}, null, view);
  assert.equal(enter.clientY, 450, 'Enter/Space on a button, no anchor: the middle of the screen, not the top');
  const mouse = {type: 'click', detail: 1, clientX: 300, clientY: 500, view};
  assert.equal(rollEvent(mouse, slotEl, view), mouse, 'a real click is passed on unchanged');
  const popped = rollEvent({type: 'click', detail: 1, clientX: 30, clientY: 40, view: {}}, {...slotEl, ownerDocument: {id: 'popout'}}, view);
  assert.equal(popped.clientY, 450, 'a popped-out Hub: its window\'s position means nothing in Foundry\'s window');
  assert.equal(rollEvent(undefined), undefined);
});

test('useItem hands dnd5e the placed event (quick bar and list rows go through the same call)', async () => {
  installGlobals();
  globalThis.PointerEvent = Click; globalThis.innerHeight = 900; globalThis.innerWidth = 1600;
  try {
    const actor = makeActor({items: ITEMS});
    await useItem(actor, 'ss', {type: 'keydown', altKey: true}, {getBoundingClientRect: () => ({left: 0, top: 100, width: 20, height: 20}), closest: () => null});
    const [, cfg] = actor.items.get('ss').calls.find(c => c[0] === 'use');
    assert.equal(cfg.event.clientY, 110); assert.equal(cfg.event.altKey, true);
  } finally { delete globalThis.PointerEvent; delete globalThis.innerHeight; delete globalThis.innerWidth; }
});

// ---------- Item icons use the item ----------

test('the icon of an item row uses it (owner); nothing to use opens it; observers get a plain image; the name opens it', () => {
  installGlobals();
  const row = {id: 'ss', name: '[TEST] Shortsword', img: 'a.webp', usable: true, facts: {}, uuid: 'Actor.actor1.Item.ss'};
  const html = cardHtml(row, [], {iconUse: true});
  assert.match(html, /<button type="button" class="agch-item__icon" data-action="item-use" data-id="ss" aria-label="Use \[TEST\] Shortsword" data-tooltip="Use"><img class="agch-item__img" src="a.webp" alt="" draggable="false"><\/button>/);
  assert.match(html, /class="agch-item__name" data-action="item-sheet" data-id="ss"[^>]*aria-label="Open \[TEST\] Shortsword"/);
  assert.match(html, /draggable="true" data-drag-uuid="Actor\.actor1\.Item\.ss"/, 'the row still drags');
  assert.match(iconHtml({...row, usable: false}, true), /data-action="item-sheet"[^>]*aria-label="Open \[TEST\] Shortsword" data-tooltip="Nothing to use: opens the item"/);
  assert.equal(iconHtml(row, false), '<img class="agch-item__img" src="a.webp" alt="">');
  assert.doesNotMatch(cardHtml(row, []), /agch-item__icon/, 'lists that do not ask (Companions) keep the image');
});

test('Combat, Inventory, Magic and Features all give the owner the icon button; observers do not get it', async () => {
  const items = [...ITEMS, {id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, activities: [{activation: {type: 'action'}}]}},
    {id: 'surge', name: '[TEST] Action Surge', type: 'feat', system: {type: {value: 'class'}, activities: [{activation: {type: 'action'}}]}}];
  const render = async (user, tab) => { installGlobals({user}); const s = new (createHubSheetClass(FakeActorSheetV2))({document: makeActor({items})}); s.tab = tab; return s._renderHTML(); };
  for (const [tab, id] of [['combat', 'ss'], ['inventory', 'hp'], ['magic', 'fb'], ['features', 'surge']]) {
    assert.match(await render(users.owner, tab), new RegExp(`class="agch-item__icon" data-action="item-use" data-id="${id}"`), tab);
    assert.doesNotMatch(await render(users.observer, tab), /agch-item__icon/, `${tab} observer`);
  }
  assert.match(await render(users.owner, 'inventory'), /class="agch-item__icon" data-action="item-sheet" data-id="rock"[^>]*Nothing to use/);
});

// ---------- Magic: Group defaults to Spell level and keeps the player's choice (Robb, 0.42.0) ----------

import {listChoice, setListChoice} from '../scripts/organize.mjs';
import {setListFilter} from '../scripts/sheet.mjs';

test('Magic groups by Spell level for a fresh user; Combat and Features keep their own defaults', () => {
  installGlobals();
  assert.equal(listChoice('magic').group, 'level');
  assert.equal(listChoice('combat').group, 'category');
  assert.equal(listChoice('features').group, 'type');
  installGlobals({settings: {listSort: {magic: {group: 'nonsense'}}}});
  assert.equal(listChoice('magic').group, 'level', 'an unknown stored value falls back to Spell level');
});

test('a Group the player picks stays: a new Hub sheet (reopened) uses it, other tabs keep theirs, Clear filters leaves it', async () => {
  installGlobals();
  const Sheet = createHubSheetClass(FakeActorSheetV2);
  const items = [{id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {level: 0, school: 'evo'}}];
  assert.equal((await setListChoice('magic', 'group', 'none')).ok, true);
  const s = new Sheet({document: makeActor({items})}); s.tab = 'magic';
  assert.equal(listChoice('magic').group, 'none');
  assert.match(await s._renderHTML(), /All spells/, 'drawn with the chosen Group (No groups)');
  setListFilter(s, 'magic', 'prepared', '1'); setListFilter(s, 'magic', 'clear');
  assert.deepEqual(s.listFilters.magic, {}); assert.equal(listChoice('magic').group, 'none', 'Clear filters keeps the chosen Group');
  const reopened = new Sheet({document: makeActor({items})});
  reopened.tab = 'magic';
  assert.equal(listChoice('magic').group, 'none', 'saved per user on this computer (client setting), not on the Actor');
  assert.equal(listChoice('combat').group, 'category'); assert.equal(listChoice('features').group, 'type');
  assert.equal(reopened.document.calls.length, 0, 'nothing written to the character');
});

// 0.42.1: hostile and duplicate item names
import {unsafeName} from '../scripts/hotbar-link.mjs';

test('0.42.1: unsafeName flags quotes, backslashes, backticks, ${ and line breaks', () => {
  for (const n of ['x"); game.user.delete()//', 'a\\b', 'a`b', 'a${1}b', 'a\nb', 'a\rb', 'a b']) assert.equal(unsafeName(n), true, JSON.stringify(n));
  for (const n of ['[TEST] Shortsword', "Rogue's Blade", 'Potion $5', '{braces}']) assert.equal(unsafeName(n), false, n);
});

test('0.42.1: itemMacroCommand escapes a hostile name defensively and leaves safe names exactly as dnd5e writes them', () => {
  assert.equal(itemMacroCommand({name: '[TEST] Sword'}), 'dnd5e.documents.macro.rollItem("[TEST] Sword", { event })');
  assert.equal(itemMacroCommand({name: 'x"); evil()//'}), 'dnd5e.documents.macro.rollItem("x\\"); evil()//", { event })');
  assert.ok(itemMacroCommand({name: 'a${b}`c\\d\ne'}).includes('a\\${b}\\`c\\\\d\\ne'));
});

test('0.42.1: a hostile item name is never copied to the hotbar (nothing created, nothing assigned), the others still are, one notice', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'bad'}, {type: 'Item', id: 'bad2'}, {type: 'Item', id: 'hp'}]});
  for (const [id, name] of [['bad', 'x"); game.user.delete()//'], ['bad2', 'y`${evil}']]) {
    const it = {id, name, type: 'weapon', uuid: `Actor.actor1.Item.${id}`, _source: {name}, system: {activities: [{activation: {type: 'action'}}]}};
    w.actor.items.push(it);
  }
  await w.link.activate(w.actor, {ask: askNever});
  assert.equal(game.macros.get(w.user.hotbar[1]).name, '[TEST] Shortsword');
  assert.equal(w.user.hotbar[2], undefined); assert.equal(w.user.hotbar[3], undefined);
  assert.equal(game.macros.get(w.user.hotbar[4]).name, '[TEST] Potion');
  assert.equal(w.made(), 2, 'only the two safe items got a macro');
  assert.ok(!game.macros.some(m => /evil|delete/.test(m.command)));
  assert.equal(w.told.length, 1, 'the GM/player is told once');
  assert.ok(!w.told[0].includes('delete') && !w.told[0].includes('evil'), 'the notice never repeats the hostile name');
});

test('0.42.1: an existing hotbar macro with a hostile name is not read back into the Hub', () => {
  const w = world({});
  const it = {id: 'bad', name: 'x"); evil()//', type: 'weapon', _source: {name: 'x"); evil()//'}};
  w.actor.items.push(it);
  const m = w.macro('m', 'x', 'dnd5e.documents.macro.rollItem("x"); evil()//", { event })');
  assert.deepEqual(macroToEntry(m, w.actor, w.user), {kind: 'foreign'});
});

test('0.42.1: two items with the same name: the first links, the duplicate is skipped with a notice (it would roll the first)', async () => {
  const w = world({hub: [{type: 'Item', id: 'ss'}, {type: 'Item', id: 'dup'}]});
  w.actor.items.push({id: 'dup', name: '[TEST] Shortsword', type: 'weapon', uuid: 'Actor.actor1.Item.dup', _source: {name: '[TEST] Shortsword'}, system: {activities: [{activation: {type: 'action'}}]}});
  await w.link.activate(w.actor, {ask: askNever});
  assert.equal(game.macros.get(w.user.hotbar[1]).name, '[TEST] Shortsword');
  assert.equal(w.user.hotbar[2], undefined);
  assert.equal(w.made(), 1);
  assert.equal(w.told.length, 1);
  assert.match(w.told[0], /same name/);
});
