/** 0.13.0 combat helpers: mastery/spell marks on targets (tracking only), GM relay, quick bar (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, makeItem, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as m from '../scripts/marks.mjs';
import * as hb from '../scripts/hotbar.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const ITEMS = () => [
  {id: 'ss', name: '[TEST] Shortsword', type: 'weapon', system: {equipped: true, mastery: 'vex', masteryOptions: [{value: 'vex', label: 'Vex'}]}},
  {id: 'club', name: '[TEST] Club', type: 'weapon', system: {equipped: true, mastery: 'slow', masteryOptions: [{value: 'slow', label: 'Slow'}, {value: 'vex', label: 'Vex'}]}},
  {id: 'axe', name: '[TEST] Handaxe', type: 'weapon', system: {equipped: false, mastery: 'vex', masteryOptions: [{value: 'vex', label: 'Vex'}]}},
  {id: 'mace', name: '[TEST] Mace', type: 'weapon', system: {equipped: true, mastery: 'sap', masteryOptions: []}},
  {id: 'hm', name: "[TEST] Hunter's Mark", type: 'spell', system: {identifier: 'hunters-mark', level: 1}},
  {id: 'hx', name: 'Hex', type: 'spell', system: {level: 1}},
  {id: 'fb', name: '[TEST] Fire Bolt', type: 'spell', system: {identifier: 'fire-bolt'}}
];
/** A target Actor whose effects can be created and deleted. */
function targetActor(id, {owner = false} = {}) {
  const a = {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, effects: [], calls: [],
    testUserPermission: (u, level) => u.isGM || (owner && level !== 'NONE'),
    async createEmbeddedDocuments(type, rows) { a.calls.push(['create', type, rows]); for (const r of rows) { const e = {...r, id: `e${a.effects.length}`, async delete() { a.calls.push(['delete', e.id]); a.effects = a.effects.filter(x => x !== e); }}; a.effects.push(e); } return rows; }};
  return a;
}
function world({user = users.owner, targets = [], gmActive = true} = {}) {
  installGlobals({user});
  const sent = [];
  game.users = [{...users.gm, active: gmActive}, {...users.owner, active: true}, {...users.observer, active: true}];
  game.users.get = id => game.users.find(u => u.id === id);
  game.socket = {emit: (name, msg) => sent.push([name, msg]), on: () => {}};
  user.targets = new Set(targets);
  CONFIG.DND5E.weaponMasteries = {vex: {label: 'Vex', reference: 'Compendium.dnd5e.content24.JournalEntry.x.JournalEntryPage.vex'}, slow: {label: 'Slow'}, sap: {label: 'Sap'}};
  const actor = makeActor({items: ITEMS()});
  const tokens = targets.map(t => t.document);
  const scene = {id: 'scene1', tokens: Object.assign(tokens, {get: id => tokens.find(t => t.id === id)})};
  game.scenes = {get: id => id === 'scene1' ? scene : null};
  globalThis.canvas = {scene};
  globalThis.fromUuidSync = uuid => uuid === actor.uuid ? actor : null;
  return {actor, sent, scene};
}
const tokenFor = (a, id) => ({actor: a, document: {id, name: a.name, actor: a, parent: {id: 'scene1'}}});

test('which marks a character may place comes only from dnd5e data: equipped weapons\' masteryOptions and owned spells', () => {
  const {actor} = world();
  const marks = m.availableMarks(actor);
  assert.deepEqual(marks.map(x => x.mark.id), ['vex', 'slow', 'hunters-mark', 'hex']);
  assert.deepEqual(marks.find(x => x.mark.id === 'vex').sources, ['[TEST] Shortsword', '[TEST] Club'], 'bonus masteries from dnd5e count too');
  assert.equal(marks.some(x => x.mark.id === 'sap'), false, 'no mastery option (dnd5e: no mastery of that weapon) means no button');
  assert.equal(m.canPlace(actor, 'topple'), false);
  assert.equal(m.MARKS.filter(x => x.kind === 'mastery').map(x => x.mastery).sort().join(), 'cleave,graze,nick,push,sap,slow,topple,vex', 'all 8 masteries in the table');
  assert.ok(m.MARKS.every(x => x.id && x.label && x.icon), 'one table, every line complete');
});

test('a mark is a real ActiveEffect with a status, no changes, and dnd5e\'s rules link only in the description', () => {
  const {actor} = world();
  const d = m.markEffectData(m.markById('vex'), actor);
  assert.deepEqual(d.statuses, ['agch-vex']); assert.deepEqual(d.changes, []);
  assert.equal(d.name, 'Vexed ([TEST] Hero)'); assert.equal(d.origin, actor.uuid);
  assert.match(d.description, /Tracking only: nothing is automated/);
  assert.match(d.description, /@UUID\[Compendium\.dnd5e\.content24\.JournalEntry\.x\.JournalEntryPage\.vex\]\{Vex rules\}/);
  assert.deepEqual(d.flags[MODULE_ID].mark, {id: 'vex', by: actor.uuid, user: 'owner'});
  assert.doesNotMatch(m.markEffectData(m.markById('hex'), actor).description, /@UUID/, 'no rules text invented for spells');
});

test('applying to a target you own toggles the effect here; the same click removes it; no target refused', async () => {
  const mine = targetActor('ally', {owner: true});
  const {actor, sent} = world({targets: [tokenFor(mine, 't1')]});
  let r = await m.applyMark(actor, 'vex');
  assert.equal(r.ok, true); assert.equal(mine.effects.length, 1); assert.equal(mine.effects[0].statuses[0], 'agch-vex');
  assert.deepEqual(m.placedMarks(actor).map(p => [p.tokenName, p.mark.id]), [['[TEST] ally', 'vex']]);
  r = await m.applyMark(actor, 'vex');
  assert.deepEqual(r.result, ['removed']); assert.equal(mine.effects.length, 0);
  assert.equal(sent.length, 0, 'no GM relay needed');
  assert.match((await m.applyMark(actor, 'topple')).error, /has no Toppled to place/, 'refused in the data layer, not just hidden');
  game.user.targets = new Set();
  assert.match((await m.applyMark(actor, 'vex')).error, /Target a token first/);
  installGlobals({user: users.observer}); game.user.targets = new Set([tokenFor(mine, 't1')]);
  assert.equal((await m.applyMark(actor, 'vex')).ok, false, 'observers of the character refused');
});

test('an enemy token goes through the coordinating GM client, which re-checks everything', async () => {
  const foe = targetActor('goblin');
  const {actor, sent} = world({targets: [tokenFor(foe, 't9')]});
  const pending = m.applyMark(actor, 'slow');
  assert.equal(sent.length, 1);
  const [name, msg] = sent[0];
  assert.equal(name, `module.${MODULE_ID}`);
  assert.deepEqual({type: msg.type, sourceUuid: msg.sourceUuid, sceneId: msg.sceneId, tokenId: msg.tokenId, markId: msg.markId, userId: msg.userId}, {type: 'mark-toggle', sourceUuid: actor.uuid, sceneId: 'scene1', tokenId: 't9', markId: 'slow', userId: 'owner'});
  // The GM client handles it (same world, now as the GM).
  const playerUser = game.user; game.user = {...users.gm, active: true};
  await m.onSocket(msg, 'owner');
  assert.equal(foe.effects.length, 1); assert.equal(foe.effects[0].flags[MODULE_ID].mark.user, 'owner');
  const receipt = sent.at(-1)[1];
  assert.deepEqual([receipt.type, receipt.ok, receipt.message], ['receipt', true, 'added']);
  game.user = playerUser;
  await m.onSocket(receipt);
  assert.deepEqual(await pending, {ok: true, result: ['added']});
  // Forged or not allowed requests are refused by the GM client.
  game.user = {...users.gm, active: true};
  await m.onSocket({...msg, requestId: 'r2', markId: 'topple'}, 'owner');
  assert.equal(sent.at(-1)[1].ok, false, 'a mark the character cannot place');
  await m.onSocket({...msg, requestId: 'r3', userId: 'observer'}, 'observer');
  assert.match(sent.at(-1)[1].message, /don't own/, 'a user who does not own the character');
  await m.onSocket({...msg, requestId: 'r4'}, 'observer');
  assert.match(sent.at(-1)[1].message, /sender mismatch/);
  assert.equal(foe.effects.length, 1, 'nothing else changed');
});

test('no GM connected: a clear refusal and nothing sent', async () => {
  const foe = targetActor('goblin');
  const {actor, sent} = world({targets: [tokenFor(foe, 't9')], gmActive: false});
  assert.match((await m.applyMark(actor, 'vex')).error, /A GM must be connected/);
  assert.equal(sent.length, 0); assert.equal(foe.effects.length, 0);
});

test('quick bar: own items and usable world macros, 10 slots per character; use, clear, refusals', async () => {
  const {actor} = world();
  assert.equal(hb.hotbarSlots(actor).length, 10);
  assert.equal((await hb.setHotbarSlot(actor, 3, actor.items.get('hm'))).result, 3);
  assert.equal((await hb.setHotbarSlot(actor, null, actor.items.get('ss'))).result, 0, 'first free slot');
  const macro = {documentName: 'Macro', uuid: 'Macro.m1', id: 'm1', name: '[TEST] Macro', img: 'm.webp', calls: [], testUserPermission: () => true, async execute(o) { macro.calls.push(o); return 'ran'; }};
  globalThis.fromUuidSync = u => u === 'Macro.m1' ? macro : null;
  await hb.setHotbarSlot(actor, 9, macro);
  assert.deepEqual(actor.flags[MODULE_ID].hotbar.slice(0, 4), [{type: 'Item', id: 'ss'}, null, null, {type: 'Item', id: 'hm'}]);
  assert.deepEqual(actor.flags[MODULE_ID].hotbar[9], {type: 'Macro', uuid: 'Macro.m1'});
  const foreign = makeItem({id: 'w', name: '[TEST] World Sword', type: 'weapon'}, null);
  assert.match((await hb.setHotbarSlot(actor, 1, foreign)).error, /own items/);
  assert.match((await hb.setHotbarSlot(actor, 1, {...macro, uuid: 'Compendium.x.Macro.y', pack: 'x'})).error, /Import/);
  assert.match((await hb.setHotbarSlot(actor, 1, {...macro, testUserPermission: () => false})).error, /can't use/);
  await hb.useHotbarSlot(actor, 3, {type: 'click'});
  assert.deepEqual(actor.items.get('hm').calls.at(-1), ['use', {event: {type: 'click'}}], 'dnd5e item.use()');
  assert.equal((await hb.useHotbarSlot(actor, 9)).result, 'ran');
  assert.equal(macro.calls[0].actor, actor);
  await hb.clearHotbarSlot(actor, 3);
  assert.equal(hb.hotbarSlots(actor)[3], null);
  assert.match((await hb.useHotbarSlot(actor, 3)).error, /empty/);
  actor.flags[MODULE_ID].hotbar = ['junk', {type: 'Item'}, {type: 'Macro', uuid: 'nope'}];
  assert.deepEqual(hb.hotbarSlots(actor).slice(0, 3), [null, null, null], 'odd saved data reads as empty');
  installGlobals({user: users.observer});
  assert.equal((await hb.setHotbarSlot(actor, 2, actor.items.get('fb'))).ok, false, 'observers refused');
  installGlobals({user: users.owner, settings: {playerVisibility: {hotbars: false}}});
  assert.equal((await hb.setHotbarSlot(actor, 2, actor.items.get('fb'))).ok, false, 'refused while the GM hides the hotbars');
});

test('the Hub shows both hotbars at the bottom, folding; mark buttons from equipped weapons; drag data on item cards', async () => {
  const foe = targetActor('goblin');
  const {actor} = world({targets: [tokenFor(foe, 't9')]});
  foe.effects.push({id: 'e0', name: 'Vexed', flags: {[MODULE_ID]: {mark: {id: 'vex', by: actor.uuid}}}});
  await hb.setHotbarSlot(actor, 0, actor.items.get('ss'));
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor}); sheet.tab = 'combat';
  const html = await sheet._renderHTML();
  assert.match(html, /<\/div><div class="agch-hotbars">/, 'below the main split');
  assert.match(html, /data-key="hotbar:marks"[\s\S]*data-key="hotbar:quick"/);
  assert.match(html, /data-action="mark-apply" data-mark="vex"[\s\S]*data-action="mark-apply" data-mark="slow"[\s\S]*data-mark="hunters-mark"/);
  assert.doesNotMatch(html, /data-mark="sap"/);
  assert.match(html, /1 target</);
  assert.match(html, /\[TEST\] goblin: Vexed[\s\S]*data-action="mark-remove" data-scene="scene1" data-token="t9" data-mark="vex"/);
  assert.match(html, /data-action="hotbar-use" data-hotbar-slot="0"[^>]*aria-label="Slot 1: \[TEST\] Shortsword"/);
  assert.equal((html.match(/class="agch-quick__slot/g) ?? []).length, 10);
  assert.match(html, /data-item-id="ss"[^>]*draggable="true" data-drag-uuid="Actor\.actor1\.Item\.ss"/);
  game.users.find(u => u.isGM).active = false;
  const r = await ACTIONS['mark-apply'](sheet, {dataset: {mark: 'vex'}});
  assert.match(r.error, /A GM must be connected/, 'an enemy token needs the GM client');
  installGlobals({user: users.owner, settings: {playerVisibility: {hotbars: false}}}); game.user.targets = new Set();
  assert.doesNotMatch(await sheet._renderHTML(), /agch-hotbars/, 'gone for players when the GM hides them');
});
