/** 0.49.0 Companions auto-listing: owned NPC Actors in the dropdowns, kind rules, auto-link, GM-only types (mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {createHubSheetClass, EDITS} from '../scripts/sheet.mjs';
import {gmSetupTab} from '../scripts/companion-views.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const LV = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};
const other = {id: 'other', name: 'Other', isGM: false};
/** A synthetic world NPC. perms: {userId: 'OWNER' | ...}; sourceId is the Manager id; size is dnd5e system.traits.size. */
function npc(id, {perms = {}, size = 'med', sourceId = null, flag = null, type = 'npc'} = {}) {
  const flags = {};
  if (sourceId) flags['ashen-gate-manager'] = {source: {sourceId}};
  if (flag) flags[MODULE_ID] = {companionType: flag};
  const a = {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, img: `${id}.webp`, type, flags, calls: [],
    system: {traits: {size}, attributes: {ac: {value: 11}, hp: {value: 5, max: 5}}},
    testUserPermission: (u, level) => u.isGM || (LV[perms[u.id] ?? 'NONE'] >= LV[level]),
    async update(diff) { a.calls.push(diff); for (const [k, v] of Object.entries(diff)) { const keys = k.split('.'); let o = a; for (const x of keys.slice(0, -2)) o = o[x] ??= {}; const [scope, last] = keys.slice(-2); (o[scope] ??= {}); if (last.startsWith('-=')) delete o[scope][last.slice(2)]; else o[scope][last] = v; } return a; },
    sheet: {render() {}}};
  return a;
}
const own = 'OWNER';
function setup({user = users.owner, charPerms, actors = [], settings = {}} = {}) {
  installGlobals({user, settings, actors});
  globalThis.game.users = [users.gm, users.owner, users.observer, other];
  globalThis.fromUuidSync = uuid => actors.find(a => a.uuid === uuid) ?? null;
  const hero = makeActor(charPerms ? {perms: charPerms} : {});
  return {hero};
}
const slots = a => a.flags[MODULE_ID]?.companionSlots;
const names = list => list.map(e => e.name.replace('[TEST] ', ''));

test('kind resolution order: GM flag, CRE-MOUNT, CRE-PET, other CRE by size, NPC none, no id by size', () => {
  const k = a => c.companionKindOf(a);
  assert.deepEqual([k(npc('a', {flag: 'mount', size: 'tiny', sourceId: 'CRE-PET-X'})).kind, k(npc('a', {flag: 'mount'})).label], ['mount', 'Mount (set by GM)'], 'the flag beats id and size');
  assert.equal(k(npc('a', {sourceId: 'CRE-MOUNT-STAG', size: 'tiny'})).label, 'Mount (imported as a mount)');
  assert.equal(k(npc('a', {sourceId: 'CRE-PET-CAT', size: 'huge'})).label, 'Pet (imported as a pet)');
  assert.equal(k(npc('a', {sourceId: 'CRE-WOLF', size: 'lg'})).label, 'Mount (Large)', 'other CRE ids fall to size');
  assert.equal(k(npc('a', {sourceId: 'CRE-RAT', size: 'tiny'})).label, 'Pet (Tiny)');
  assert.equal(k(npc('a', {sourceId: 'NPC-OREN', size: 'med'})).kind, 'none', 'people are never companions');
  assert.equal(k(npc('a', {sourceId: 'NPC-OREN', size: 'med', flag: 'pet'})).kind, 'pet', 'but the GM flag still wins');
  assert.equal(k(npc('a', {size: 'sm'})).label, 'Pet (Small)', 'no Manager id: size');
  assert.equal(k(npc('a', {sourceId: 'ITEM-ODD-1', size: 'grg'})).kind, 'mount', 'an unknown prefix falls to size');
});
test('every size: tiny, sm, med are pets; lg, huge, grg are mounts; unknown is none', () => {
  const sized = s => { const a = npc('a'); a.system.traits.size = s; return a; };
  const got = Object.fromEntries(['tiny', 'sm', 'med', 'lg', 'huge', 'grg', 'weird', undefined].map(s => [s, c.companionKindOf(sized(s)).kind]));
  assert.deepEqual(got, {tiny: 'pet', sm: 'pet', med: 'pet', lg: 'mount', huge: 'mount', grg: 'mount', weird: 'none', undefined: 'none'});
  assert.deepEqual(['Pet (Tiny)', 'Pet (Medium)', 'Mount (Large)', 'Mount (Huge)', 'Mount (Gargantuan)'], ['tiny', 'med', 'lg', 'huge', 'grg'].map(s => c.companionKindOf(npc('a', {size: s})).label));
});
test('either lists in both kinds, none in neither, an invalid flag is ignored', () => {
  const both = npc('both', {perms: {owner: own}, flag: 'either'}), nope = npc('nope', {perms: {owner: own}, flag: 'none', size: 'tiny'}), junk = npc('junk', {perms: {owner: own}, flag: 'dragon', size: 'lg'});
  const {hero} = setup({actors: [both, nope, junk]});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['both']);
  assert.deepEqual(names(c.eligibleCompanions(hero, 'mount')), ['both', 'junk']);
});

test('ownership: Owner only; a player owner of the character must own the companion; observers and limited are not listed', () => {
  const stag = npc('stag', {perms: {owner: own}, size: 'lg'}), seen = npc('seen', {perms: {owner: 'OBSERVER'}, size: 'lg'}), lim = npc('lim', {perms: {owner: 'LIMITED'}, size: 'lg'}), nobody = npc('nobody', {size: 'lg'});
  const {hero} = setup({actors: [stag, seen, lim, nobody]});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'mount')), ['stag']);
  assert.equal(c.ownedForCharacter(hero, seen), false);
});
test('only another player owning the companion does not make it the character owner\'s', () => {
  const theirs = npc('theirs', {perms: {other: own}}), shared = npc('shared', {perms: {owner: own, other: own}});
  const {hero} = setup({actors: [theirs, shared]});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['shared']);
});
test('two player owners: owning with either counts; the GM does not count as an owner', () => {
  const a = npc('a', {perms: {other: own}}), b = npc('b', {perms: {owner: own}});
  const {hero} = setup({user: users.gm, actors: [a, b], charPerms: {owner: 'OWNER', other: 'OWNER'}});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['a', 'b']);
  const lone = npc('lone');   // the GM can use anything, but owns nothing "as a player"
  const again = setup({user: users.gm, actors: [lone], charPerms: {owner: 'OWNER'}});
  assert.deepEqual(c.eligibleCompanions(again.hero, 'pet'), []);
  const hidden = setup({actors: [a], charPerms: {owner: 'OWNER', other: 'OWNER'}});
  assert.deepEqual(c.eligibleCompanions(hidden.hero, 'pet'), [], 'an Actor the viewing user cannot see is never listed');
});
test('GM-run character (no player owner): the viewing player\'s own permission decides; a GM viewer gets no auto list', () => {
  const mine = npc('mine', {perms: {observer: own}}), notMine = npc('notMine', {perms: {owner: own}});
  const {hero} = setup({user: users.observer, charPerms: {gm: 'OWNER'}, actors: [mine, notMine]});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['mine']);
  const gmView = setup({user: users.gm, charPerms: {}, actors: [mine, notMine]});
  assert.deepEqual(c.eligibleCompanions(gmView.hero, 'pet'), [], 'a GM owns everything, so nothing is "owned"; the GM links by drop or find');
});
test('GM viewing a player\'s character sees what that player could use', () => {
  const a = npc('a', {perms: {owner: own}}), b = npc('b', {perms: {other: own}});
  const {hero} = setup({user: users.gm, actors: [a, b]});
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['a']);
});
test('never listed: the character itself, player characters, non-NPC types, level backups, compendium Actors, unseen Actors', () => {
  const pc = npc('pc', {perms: {owner: own}, type: 'character'}), veh = npc('veh', {perms: {owner: own}, type: 'vehicle'});
  const comp = npc('comp', {perms: {owner: own}}); comp.pack = 'world.x'; comp.uuid = 'Compendium.world.x.Actor.comp';
  const bak = npc('bak', {perms: {owner: own}}); bak.flags[MODULE_ID] = {levelBackup: {of: 'x'}};
  const hidden = npc('hidden', {perms: {}}), ok = npc('ok', {perms: {owner: own}});
  const {hero} = setup({actors: [pc, veh, comp, hidden, ok]});
  hero.type = 'npc'; hero.uuid = 'Actor.actor1';   // even an NPC-typed character is never its own companion
  const self = npc('actor1', {perms: {owner: own}}); self.uuid = hero.uuid; globalThis.game.actors.push(self, hero);
  assert.deepEqual(names(c.eligibleCompanions(hero, 'pet')), ['ok']);
});
test('linked as one kind: not offered as the other; linked ones carry linked: true and no duplicates', async () => {
  const cat = npc('cat', {perms: {owner: own}, flag: 'either'}), fox = npc('fox', {perms: {owner: own}});
  const {hero} = setup({actors: [cat, fox]});
  assert.equal((await c.activateCompanion(hero, 'pet', cat.uuid, 0)).ok, true);
  assert.deepEqual(c.eligibleCompanions(hero, 'mount'), [], 'an either-Actor linked as a pet is not also offered as a mount');
  assert.deepEqual(c.eligibleCompanions(hero, 'pet').map(e => [e.name.replace('[TEST] ', ''), e.linked]), [['cat', true], ['fox', false]]);
  const box = c.companionBoxes(hero).pets;
  assert.deepEqual(box[1].available.map(e => e.uuid), [fox.uuid], 'a linked or active pet is not repeated in the auto list');
  assert.deepEqual(box[1].others.map(e => e.uuid), [], 'the pet active in box 1 is not offered in box 2');
});

test('choosing an owned Actor links it and makes it active in that box (pet box 2 and the mount); one active per kind', async () => {
  const stag = npc('stag', {perms: {owner: own}, size: 'lg', sourceId: 'CRE-MOUNT-EMBER-STAG'}), cat = npc('cat', {perms: {owner: own}, size: 'sm'}), owl = npc('owl', {perms: {owner: own}, size: 'tiny'});
  const {hero} = setup({actors: [stag, cat, owl]});
  assert.equal((await c.activateCompanion(hero, 'mount', stag.uuid)).ok, true);
  assert.equal((await c.activateCompanion(hero, 'pet', cat.uuid, 1)).ok, true);
  assert.deepEqual([slots(hero).mounts, slots(hero).activeMount, slots(hero).pets, slots(hero).activePets], [[stag.uuid], stag.uuid, [cat.uuid], [null, cat.uuid, null]]);
  assert.match((await c.activateCompanion(hero, 'pet', cat.uuid, 0)).error ?? '', /already active/, 'the same pet is not active in two boxes');
  assert.equal((await c.activateCompanion(hero, 'pet', owl.uuid, 0)).ok, true);
  assert.deepEqual(slots(hero).activePets, [owl.uuid, cat.uuid, null]);
});
test('permission refusals: a player cannot auto-link what they do not own, what is the wrong kind, or the character itself', async () => {
  const seen = npc('seen', {perms: {owner: 'OBSERVER'}, size: 'sm'}), horse = npc('horse', {perms: {owner: own}, size: 'lg'}), cat = npc('cat', {perms: {owner: own}, size: 'sm'});
  const person = npc('person', {perms: {owner: own}, sourceId: 'NPC-OREN'}), pc = npc('pc', {perms: {owner: own}, type: 'character'});
  const {hero} = setup({actors: [seen, horse, cat, person, pc]});
  assert.match((await c.activateCompanion(hero, 'pet', seen.uuid, 0)).error, /don't own/);
  assert.match((await c.activateCompanion(hero, 'pet', horse.uuid, 0)).error, /mount \(large\), so it doesn't fit a pet box/i);
  assert.match((await c.activateCompanion(hero, 'mount', cat.uuid)).error, /doesn't fit a mount box/);
  assert.match((await c.activateCompanion(hero, 'pet', person.uuid, 0)).error, /not a companion \(a person\)/i);
  assert.ok((await c.activateCompanion(hero, 'pet', pc.uuid, 0)).error, 'player characters are refused');
  assert.ok((await c.activateCompanion(hero, 'pet', 'Actor.gone', 0)).error);
  assert.equal(hero.calls.length, 0, 'nothing was written');
  // observers of the character (not owners) cannot change anything
  setup({user: users.observer, actors: [cat]});
  assert.match((await c.activateCompanion(hero, 'pet', cat.uuid, 0)).error, /don't own/);
});
test('the GM may link anything from the dropdown path; the manual Observer rule for drop and find is unchanged', async () => {
  const wolf = npc('wolf', {size: 'lg'}), seen = npc('seen', {perms: {owner: 'OBSERVER'}, size: 'lg'}), hid = npc('hid', {size: 'lg'});
  const {hero} = setup({user: users.gm, actors: [wolf, seen, hid]});
  assert.equal((await c.activateCompanion(hero, 'pet', wolf.uuid, 0)).ok, true, 'the GM can link a mismatched Actor');
  setup({actors: [wolf, seen, hid]});
  assert.equal((await c.addActorCompanion(hero, seen, 'mount')).ok, true, 'an Observer actor can still be dropped');
  assert.match((await c.addActorCompanion(hero, hid, 'mount')).error, /can't see/);
});
test('hidden Companions part and level backups still refuse auto-link', async () => {
  const cat = npc('cat', {perms: {owner: own}, size: 'sm'});
  const {hero} = setup({actors: [cat], settings: {playerVisibility: {companions: false}}});
  assert.ok((await c.activateCompanion(hero, 'pet', cat.uuid, 0)).error, 'hidden part');
  const {hero: bak} = setup({actors: [cat]}); bak.flags[MODULE_ID] = {levelBackup: {of: 'x'}};
  assert.equal((await c.activateCompanion(bak, 'pet', cat.uuid, 0)).error, c.BACKUP_REFUSAL);
});
test('pet slots still apply to auto-link', async () => {
  const cat = npc('cat', {perms: {owner: own}, size: 'sm'});
  const {hero} = setup({actors: [cat], settings: {petSlots: 1}});
  assert.match((await c.activateCompanion(hero, 'pet', cat.uuid, 2)).error, /pet box 3 can't be filled/);
});

test('no auto-removal: losing ownership keeps the link and shows the note; clearing works; the Actor stops being listed', async () => {
  const stag = npc('stag', {perms: {owner: own}, size: 'lg'});
  const {hero} = setup({actors: [stag]});
  await c.activateCompanion(hero, 'mount', stag.uuid);
  stag.testUserPermission = (u, l) => u.isGM || (u.id === 'owner' && LV[l] <= LV.OBSERVER);   // Robb revokes Owner
  assert.equal(slots(hero).activeMount, stag.uuid, 'still linked and active');
  assert.deepEqual(c.eligibleCompanions(hero, 'mount'), []);
  const box = c.companionBoxes(hero).mount;
  assert.equal(box.active.uuid, stag.uuid); assert.equal(box.active.notOwned, true);
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: hero}); sheet.tab = 'companions';
  assert.match(await sheet._renderHTML(), /No longer owned\./);
  assert.equal((await c.activateCompanion(hero, 'mount', null)).ok, true);
  assert.equal(slots(hero).activeMount, null);
  assert.deepEqual(slots(hero).mounts, [stag.uuid], 'still linked, just not active');
  assert.deepEqual(c.companionBoxes(hero).mount.available, [], 'and not auto-listed again');
  assert.equal(c.companionBoxes(hero).mount.others.length, 1, 'but the link still offers it');
});

test('the tab: dropdowns list linked plus owned Actors with a tag, no duplicates, choosing links via the select handler, no raw ids', async () => {
  const stag = npc('stag', {perms: {owner: own}, size: 'lg', sourceId: 'CRE-MOUNT-EMBER-STAG'}), cat = npc('cat', {perms: {owner: own}, size: 'sm', sourceId: 'CRE-PET-CAT'}), owl = npc('owl', {perms: {owner: own}, size: 'tiny'});
  const bear = npc('bear', {perms: {owner: own}, flag: 'either', size: 'lg'});
  const {hero} = setup({actors: [stag, cat, owl, bear]});
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: hero}); sheet.tab = 'companions';
  let html = await sheet._renderHTML();
  assert.match(html, /<optgroup label="Yours to use"><option value="Actor.bear">\[TEST\] bear \(Pet or mount\)<\/option><option value="Actor.stag">\[TEST\] stag \(Mount\)<\/option>/, 'mount list');
  assert.match(html, /<option value="Actor.cat">\[TEST\] cat \(Pet\)<\/option>/);
  const mountSelect = html.match(/<select data-edit="companion-active" data-kind="mount"[\s\S]*?<\/select>/)[0];
  assert.equal((mountSelect.match(/value="Actor\.stag"/g) ?? []).length, 1, 'listed once');
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /Actor\.[a-z0-9]|CRE-/, 'no raw ids in the visible text');
  const r = await EDITS['companion-active'](sheet, {dataset: {kind: 'pet', slot: '0'}, value: 'Actor.cat'});
  assert.equal(r.ok, true); assert.deepEqual(slots(hero).activePets, ['Actor.cat', null, null]);
  html = await sheet._renderHTML();
  const pet2 = html.slice(html.indexOf('aria-label="Pet 2"'), html.indexOf('aria-label="Pet 3"'));
  assert.doesNotMatch(pet2, /Actor\.cat/, 'active elsewhere, excluded'); assert.match(pet2, /Actor\.owl/);
  assert.ok((await EDITS['companion-active'](sheet, {dataset: {kind: 'pet', slot: '1'}, value: 'Actor.stag'})).error, 'a mount cannot be chosen as a pet');
});
test('an empty box with only owned Actors still shows its dropdown', async () => {
  const cat = npc('cat', {perms: {owner: own}, size: 'sm'});
  const {hero} = setup({actors: [cat]});
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: hero}); sheet.tab = 'companions';
  assert.match(await sheet._renderHTML(), /data-edit="companion-active" data-kind="pet"/);
});

test('setting the companion type is GM only in the data layer; Automatic clears the flag; effective kind is explained', async () => {
  const horse = npc('horse', {perms: {owner: own}, size: 'lg'});
  setup({user: users.owner, actors: [horse]});
  assert.match((await c.setCompanionType(horse, 'pet')).error, /Only the GM/);
  assert.equal(horse.calls.length, 0);
  setup({user: users.gm, actors: [horse]});
  let r = await c.setCompanionType(horse, 'either');
  assert.deepEqual([r.ok, r.result.label], [true, 'Pet or mount (set by GM)']);
  assert.equal(horse.flags[MODULE_ID].companionType, 'either');
  r = await c.setCompanionType(horse, 'pet'); assert.equal(r.result.label, 'Pet (set by GM)');
  r = await c.setCompanionType(horse, ''); assert.equal(r.result.label, 'Mount (Large)'); assert.equal(horse.flags[MODULE_ID].companionType, undefined);
  assert.ok((await c.setCompanionType(horse, 'dragon')).error);
  assert.match((await c.setCompanionType(npc('pc', {type: 'character'}), 'pet')).error, /not an NPC/);
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: makeActor()});
  setup({user: users.owner, actors: [horse]});
  const refused = await EDITS['companion-type'](sheet, {dataset: {actor: 'horse'}, value: 'pet'});
  assert.equal(refused?.ok ?? false, false);
});
test('GM Setup shows a Companion types card with a select per NPC Actor and the effective kind', () => {
  const horse = npc('horse', {size: 'lg'}), cat = npc('cat', {flag: 'mount', size: 'sm'}), pc = npc('pc', {type: 'character'});
  setup({user: users.gm, actors: [horse, cat, pc]});
  const html = gmSetupTab();
  assert.match(html, /Companion types/); assert.match(html, /data-edit="companion-type" data-actor="horse"/);
  assert.match(html, /Automatic: Mount \(Large\)/); assert.match(html, /<option value="mount" selected>Mount<\/option>/);
  assert.doesNotMatch(html, /companion-type" data-actor="pc"/);
  assert.match(html, /data-ctype-filter/);
});

test('public API: eligibleCompanions and companionKind are read only and use plain data', async () => {
  const { default: _ } = {default: 0};
  const cat = npc('cat', {perms: {owner: own}, size: 'sm'});
  const {hero} = setup({actors: [cat]});
  assert.deepEqual(c.eligibleCompanions(hero, 'pet').map(e => e.info.kind), ['pet']);
  assert.deepEqual(c.eligibleCompanions(hero, 'dragon'), []);
  assert.equal(hero.calls.length, 0);
});
