/** 0.58.3 GM Setup → Companion types: grouped, people hidden by default, 50 per group, search reaches everything, stash never listed (mocked Foundry; markup and logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, users} from './foundry-mock.mjs';
import {gmSetupTab, CTYPE_PAGE} from '../scripts/companion-views.mjs';
import {filterCompanionTypes} from '../scripts/sheet.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const LV = {NONE: 0, OWNER: 3};
function npc(id, {size = 'med', sourceId = null, flag = null, owner = false, stash = false, type = 'npc'} = {}) {
  const flags = {};
  if (sourceId) flags['ashen-gate-manager'] = {source: {sourceId}};
  if (flag) flags[MODULE_ID] = {companionType: flag};
  if (stash) flags['ashen-gate-utilities'] = {partyStash: true};
  return {documentName: 'Actor', id, uuid: `Actor.${id}`, name: id, type, flags, system: {traits: {size}}, testUserPermission: (u, l) => !u.isGM && owner && LV[l] <= 3};
}
const setup = actors => { installGlobals({user: users.gm, actors}); globalThis.game.users = [users.gm, users.owner]; return gmSetupTab(); };
const group = (html, id) => html.match(new RegExp(`<details class="agch-ctgroup" data-ctgroup="${id}"[^>]*>[\\s\\S]*?</details>`))?.[0] ?? '';
const rowsOf = h => [...h.matchAll(/<li (hidden )?data-ctype-row data-name="([^"]*)"/g)].map(m => ({hidden: !!m[1], name: m[2]}));

test('groups with counts; only Overrides is open; people and plain non-companions are hidden by default', () => {
  const html = setup([npc('ovr', {flag: 'mount'}), npc('cat', {size: 'tiny'}), npc('horse', {size: 'lg'}), npc('oren', {sourceId: 'NPC-OREN'}), npc('mine', {sourceId: 'NPC-X', owner: true}), npc('wolf', {sourceId: 'CRE-WOLF', size: 'lg'})]);
  assert.match(group(html, 'overrides'), /^<details[^>]* open>/); for (const id of ['pets', 'mounts', 'none']) assert.doesNotMatch(group(html, id).split('>')[0] + '>', / open>/);
  assert.match(group(html, 'overrides'), /Overrides <span class="ag-badge">1<\/span>/);
  assert.deepEqual(rowsOf(group(html, 'pets')).map(r => r.name), ['cat']); assert.deepEqual(rowsOf(group(html, 'mounts')).map(r => r.name), ['horse', 'wolf']);
  assert.deepEqual(rowsOf(group(html, 'none')), [{hidden: false, name: 'mine'}, {hidden: true, name: 'oren'}], 'a player-owned NPC stays visible');
  assert.match(html, /Show all NPC Actors \(1 more\)/);
  assert.doesNotMatch(html, /agch-ctype__eff/, 'no duplicated right-hand label');
  assert.match(html, /data-ctype-filter/);
});
test('the party stash, loot and vehicles are never listed, unless the GM put an override on one', () => {
  const html = setup([npc('stash', {stash: true}), npc('chest', {type: 'loot'}), npc('cat', {size: 'tiny'})]);
  assert.doesNotMatch(html, /data-actor="stash"|data-actor="chest"/);
  assert.match(setup([npc('stash', {stash: true, flag: 'pet'})]), /data-actor="stash"/);
});
test('only 50 rows of a group show first; Show more appears; nothing is lost', () => {
  const html = setup([...Array(120)].map((_, i) => npc(`c${String(i).padStart(3, '0')}`, {size: 'tiny'})));
  const rows = rowsOf(group(html, 'pets'));
  assert.equal(rows.length, 120); assert.equal(rows.filter(r => !r.hidden).length, CTYPE_PAGE);
  assert.doesNotMatch(group(html, 'pets'), /data-ctype-more-wrap hidden/);
});
test('the intro is short, with purpose and precedence', () => {
  const html = setup([npc('cat')]);
  const intro = html.match(/Companion types<[\s\S]*?<p class="agch-muted">([^<]*)<\/p>/)[1];
  assert.ok(intro.length < 220, intro.length); assert.match(intro, /Override/); assert.match(intro, /CRE-PET/);
});
// A tiny DOM stand-in for the filter logic.
function fakeRoot(html) {
  const mk = (name, extra = {}) => ({dataset: {name}, hidden: false, ...extra});
  const groups = [...html.matchAll(/data-ctgroup="(\w+)"/g)].map(m => m[1]).map(id => {
    const rows = rowsOf(group(html, id)).map(r => { const m = html.match(new RegExp(`<li [^>]*data-name="${r.name}"([^>]*)>`)); return mk(r.name, {dataset: {name: r.name, ...(/data-minor/.test(m[1]) ? {minor: ''} : {})}}); });
    const wrap = {hidden: true};
    return {dataset: {ctgroup: id, limit: String(CTYPE_PAGE)}, hidden: false, open: false, rows, wrap, querySelectorAll: () => rows, querySelector: s => s === '[data-ctype-more-wrap]' ? wrap : null};
  });
  const all = {checked: false};
  return {all, groups, querySelector: s => s.includes('ctype-all') ? all : null, querySelectorAll: s => s === '[data-ctgroup]' ? groups : []};
}
test('search reaches hidden people and pages; clearing it restores the defaults; the toggle shows all', () => {
  const html = setup([npc('oren', {sourceId: 'NPC-OREN'}), npc('ansel', {sourceId: 'NPC-ANSEL'}), npc('cat', {size: 'tiny'})]);
  const root = fakeRoot(html), none = root.groups.find(g => g.dataset.ctgroup === 'none');
  filterCompanionTypes(root, ''); assert.deepEqual(none.rows.map(r => r.hidden), [true, true]); assert.equal(none.hidden, true);
  filterCompanionTypes(root, 'ore'); assert.deepEqual(none.rows.map(r => [r.dataset.name, r.hidden]), [['ansel', true], ['oren', false]]); assert.equal(none.hidden, false); assert.equal(none.open, true);
  filterCompanionTypes(root, ''); root.all.checked = true; filterCompanionTypes(root, ''); assert.deepEqual(none.rows.map(r => r.hidden), [false, false]);
});
