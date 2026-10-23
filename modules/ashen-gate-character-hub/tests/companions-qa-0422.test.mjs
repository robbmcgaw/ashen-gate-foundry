/** 0.42.2 Companions QA: world-Actor mounts/pets keep working when unshared; keyboard route to link an Actor (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as c from '../scripts/companions.mjs';
import {companionsTab} from '../scripts/companion-views.mjs';
import {EDITS} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const LV = {NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3};
function world(id, {type = 'npc', folder = null, perms = {}} = {}) {
  return {documentName: 'Actor', id, uuid: `Actor.${id}`, name: `[TEST] ${id}`, img: `${id}.webp`, type, folder,
    system: {attributes: {ac: {value: 15}, hp: {value: 104, max: 104}, movement: {walk: 50, units: 'ft'}}, details: {biography: {value: '<p>Secret biography text.</p>'}}},
    testUserPermission: (u, level) => u.isGM || LV[perms[u.id] ?? 'NONE'] >= LV[level]};
}
const folder = (name, parent = null) => ({name, folder: parent});
function setup(actors, {user = users.owner, settings = {petCap: 2}} = {}) {
  installGlobals({user, settings, actors});
  const map = new Map(actors.map(a => [a.uuid, a]));
  globalThis.fromUuidSync = u => map.get(u) ?? null;
  return makeActor();
}

test('an Actor companion the player can no longer observe stays listed but shows nothing from it', async () => {
  const steed = world('steed', {perms: {owner: 'OBSERVER'}});
  const hero = setup([steed]);
  assert.equal((await c.addActorCompanion(hero, steed, 'mount')).ok, true);
  assert.match(companionsTab({actor: hero, editable: true}), /Secret biography text|\[TEST\] steed/);
  steed.testUserPermission = () => false;                                  // the GM unshared it
  const d = c.companionsData(hero);
  assert.equal(d.mount.denied, true); assert.equal(d.mount.actor, null); assert.equal(d.mount.missing, false);
  assert.equal(d.mount.displayName, 'Companion (not shared)');
  const html = companionsTab({actor: hero, editable: true});
  assert.doesNotMatch(html, /Secret biography|\[TEST\] steed|steed\.webp|104|companion-open/, 'no name, art, notes, stats or open button');
  assert.match(html, /not shared with you any more/); assert.match(html, /companion-remove/, 'can still be removed');
  installGlobals({user: users.gm, settings: {petCap: 2}, actors: [steed]});
  assert.equal(c.companionsData(hero).mount.denied, false, 'the GM always sees it');
});

test('linkable Actors: observable only, not already linked or self; a Companions folder narrows the list', async () => {
  const comp = folder('Companions'), mounts = folder('Cinder-touched Mounts', comp);
  const stag = world('stag', {folder: mounts, perms: {owner: 'OBSERVER'}}), fox = world('fox', {folder: comp, perms: {owner: 'OBSERVER'}});
  const hidden = world('hidden', {folder: mounts}), wolf = world('wolf', {perms: {owner: 'OBSERVER'}}), pc = world('pc', {type: 'character', perms: {owner: 'OBSERVER'}});
  const hero = setup([wolf, fox, stag, hidden, pc]);
  assert.deepEqual(c.linkableActors(hero, 'mount').map(a => a.id), ['stag', 'fox'], 'folder Companions only; the mount-named folder first for a mount');
  assert.deepEqual(c.linkableActors(hero, 'pet').map(a => a.id), ['fox', 'stag']);
  await c.addActorCompanion(hero, stag, 'mount');
  assert.deepEqual(c.linkableActors(hero, 'pet').map(a => a.id), ['fox'], 'already linked is not offered again');
  const lone = setup([wolf, pc]);
  assert.deepEqual(c.linkableActors(lone, 'pet').map(a => a.id), ['wolf'], 'no Companions folder: non-character Actors the user can see');
  installGlobals({user: users.gm, settings: {petCap: 2}, actors: [wolf, world('plain')]});
  assert.deepEqual(c.linkableActors(lone, 'pet').map(a => a.id).sort(), ['plain', 'wolf'], 'the GM sees all');
});

test('the Companions tab offers "link a world Actor" and the select links it (permissions still enforced)', async () => {
  const stag = world('stag', {perms: {owner: 'OBSERVER'}});
  const hero = setup([stag]);
  const html = companionsTab({actor: hero, editable: true});
  assert.match(html, /data-edit="companion-link" data-kind="mount"[^>]*aria-label="Link a mount Actor"/);
  assert.match(html, /<option value="Actor.stag">\[TEST\] stag<\/option>/);
  const sheet = {document: hero};
  assert.equal(await EDITS['companion-link'](sheet, {value: '', dataset: {kind: 'mount'}}), null, 'the empty choice does nothing');
  const r = await EDITS['companion-link'](sheet, {value: 'Actor.stag', dataset: {kind: 'mount'}});
  assert.equal(r.ok, true); assert.equal(hero.flags[MODULE_ID].companions[0].actorUuid, 'Actor.stag');
  stag.testUserPermission = () => false;
  assert.match((await EDITS['companion-link'](sheet, {value: 'Actor.stag', dataset: {kind: 'pet'}})).error, /can't see|already/);
  assert.doesNotMatch(companionsTab({actor: hero, editable: false}), /companion-link/, 'read-only view has no link control');
});

test('search: a folded section opens while it holds a match and folds back; a search with no hits says so', async () => {
  const { applyFilter } = await import('../scripts/sheet.mjs');
  installGlobals({user: users.owner, settings: {collapsedSections: {'combat:weapons': true}}});
  const attrs = {};
  const card = name => ({hidden: false, querySelector: () => ({textContent: name})});
  const a = card('[TEST] Bless'), b = card('[TEST] Fire Bolt');
  const secBody = {hidden: true, dataset: {secBody: 'combat:weapons'}};
  const toggle = {setAttribute: (k, v) => { attrs[k] = v; }};
  const sec = {classList: {toggle() {}}, querySelectorAll: sel => sel.includes('section-toggle') ? [toggle] : [a, b], querySelector: () => secBody};
  const appended = [];
  const note = {hidden: true, className: '', setAttribute() {}, set innerHTML(v) { this.html = v; }};
  const body = {querySelector: sel => sel === '.agch-nomatch' ? appended[0] ?? null : null, ownerDocument: {createElement: () => note}, append: n => appended.push(n)};
  const root = {querySelector: () => body, querySelectorAll: sel => sel.includes('.agch-sec') ? [sec] : sel.includes('agch-contents') ? [] : [a, b]};
  applyFilter(root, 'bless');
  assert.equal(secBody.hidden, false, 'the folded section opens for its match'); assert.equal(attrs['aria-expanded'], 'true');
  applyFilter(root, '');
  assert.equal(secBody.hidden, true, 'and folds back as saved'); assert.equal(attrs['aria-expanded'], 'false');
  applyFilter(root, 'zzz');
  assert.equal(note.hidden, false); assert.match(note.html, /Nothing matches your search/);
  applyFilter(root, 'bless');
  assert.equal(note.hidden, true, 'the note goes away when something matches');
});
