/**
 * 0.62.0 Features: hide an Origin group (a profession) without deleting anything. Mocked Foundry and mocked partner APIs:
 * this proves the logic and the markup, not the live Forge UI or the real partner modules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {featureOrigins, originGroups} from '../scripts/feature-origin.mjs';
import {featuresData} from '../scripts/items.mjs';
import {hiddenKeys, activeHidden, setGroupHidden, showAllGroups, HIDDEN_FLAG} from '../scripts/hidden-groups.mjs';

const L = 'ashen-gate-profession-ledger', M = 'ashen-gate-manager', ID = 'ashen-gate-character-hub';
const feat = (id, name, flags = {}) => ({id, name, type: 'feat', system: {type: {value: 'feat'}}, flags});
const man = sourceId => ({[M]: {source: {sourceId, definition: {}}}});
const mods = () => ({[L]: {active: true, api: {getProfessions: () => [{professionId: 'PROF-HERBALISM', name: 'Herbalism'}, {professionId: 'PROF-MINING', name: 'Mining'}]}}});
const make = (perms) => {
  const a = makeActor({perms, items: [feat('alert', '[TEST] Alert'), feat('herb', '[TEST] Herbalism', man('PROF-HERBALISM')), feat('mine', '[TEST] Mining', man('PROF-MINING'))]});
  for (const i of a.items) i.parent = a;
  a.deleteEmbeddedDocuments = async () => { throw new Error('must not delete'); };
  return a;
};
const groupsOf = a => { const rows = featuresData(a).groups.flatMap(g => g.items); return originGroups(rows, featureOrigins(a, rows)); };
const Hub = createHubSheetClass(FakeActorSheetV2);
const html = async (a, sheetProps = {}) => { const s = new Hub({document: a}); s.tab = 'features'; Object.assign(s, sheetProps); return s._renderHTML(); };

test('the owner hides and shows a profession group; the flag is on the Actor in the Hub namespace; items are untouched', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make(), g = groupsOf(a), key = g.find(x => x.name === 'Herbalism').key;
  assert.equal(key, 'profession-PROF-HERBALISM');
  const r = await setGroupHidden(a, key, true, g);
  assert.equal(r.ok, true); assert.deepEqual(a.flags[ID][HIDDEN_FLAG], [key]);
  assert.equal(a.calls.filter(c => c[0] === 'update').length, 1); assert.equal(a.items.length, 3);
  assert.deepEqual([...activeHidden(a, g)], [key]);
  assert.equal((await setGroupHidden(a, key, false, g)).ok, true);
  assert.equal(a.flags[ID]?.[HIDDEN_FLAG], undefined, 'an empty list removes the flag');
});
test('observers are refused in the data layer; a made-up key is refused; nothing is written', async () => {
  installGlobals({user: users.observer, modules: mods()});
  const a = make(), g = groupsOf(a);
  const r = await setGroupHidden(a, 'profession-PROF-HERBALISM', true, g);
  assert.equal(r.ok, false); assert.match(r.error, /don't own/); assert.equal((await showAllGroups(a)).ok, false);
  assert.equal(a.calls.length, 0);
  installGlobals({user: users.gm, modules: mods()});
  assert.equal((await setGroupHidden(a, 'profession-PROF-NOPE', true, g)).ok, false);
  assert.equal((await setGroupHidden(a, '', true, g)).ok, false); assert.equal(a.calls.length, 0);
  assert.equal((await setGroupHidden(a, 'profession-PROF-MINING', true, g)).ok, true, 'the GM may');
});
test('stale and odd stored values are ignored; a write drops stale keys', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make(), g = groupsOf(a);
  a.flags[ID] = {[HIDDEN_FLAG]: ['profession-PROF-GONE', 7, null, 'profession-PROF-MINING']};
  assert.deepEqual([...activeHidden(a, g)], ['profession-PROF-MINING']);
  await setGroupHidden(a, 'profession-PROF-HERBALISM', true, g);
  assert.deepEqual(a.flags[ID][HIDDEN_FLAG].sort(), ['profession-PROF-HERBALISM', 'profession-PROF-MINING']);
  a.flags[ID] = {[HIDDEN_FLAG]: 'not an array'}; assert.equal(hiddenKeys(a).size, 0);
});
test('Features tab: Hide button on profession headers (button, aria-label, tooltip), hidden group leaves the list, Hidden groups (n) restores it', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make();
  let h = await html(a);
  assert.match(h, /<button type="button"[^>]*data-action="group-hide"[^>]*data-key="profession-PROF-HERBALISM"[^>]*data-tooltip="Hide Professions: Herbalism[^"]*"[^>]*aria-label="Hide Professions: Herbalism"/);
  assert.doesNotMatch(h, /data-action="group-hide"[^>]*data-key="feat"/, 'only profession groups carry Hide'); assert.doesNotMatch(h, /Hidden groups/);
  a.flags[ID] = {[HIDDEN_FLAG]: ['profession-PROF-HERBALISM', 'profession-PROF-GONE']};
  h = await html(a);
  assert.doesNotMatch(h, /Professions: Herbalism/); assert.match(h, /Professions: Mining/); assert.match(h, /Hidden groups \(1\)/);
  assert.doesNotMatch(h, /data-action="group-show"/, 'closed until opened');
  h = await html(a, {hiddenGroupsOpen: true});
  assert.match(h, /data-action="group-show"[^>]*data-key="profession-PROF-HERBALISM"[^>]*aria-label="Show Professions: Herbalism"/);
  assert.equal(a.items.length, 3, 'sheet items are all still there');
});
test('all groups hidden: the empty state explains; the hidden bar stays; the group-hide action refuses observers', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make();
  a.flags[ID] = {[HIDDEN_FLAG]: groupsOf(a).map(g => g.key)};
  const h = await html(a);
  assert.match(h, /All groups are hidden\./); assert.match(h, /Hidden groups \(3\)/); assert.doesNotMatch(h, /Nothing matches/);
  installGlobals({user: users.observer, modules: mods()});
  const o = make(), s = new Hub({document: o}); s.tab = 'features';
  const r = await ACTIONS['group-hide'](s, {dataset: {key: 'profession-PROF-HERBALISM'}});
  assert.equal(r.ok, false); assert.equal(o.calls.length, 0);
  const hh = await html(o); assert.doesNotMatch(hh, /data-action="group-hide"/, 'observers see no Hide button');
});
test('the actions hide, show and show all work through the sheet and redraw', async () => {
  installGlobals({user: users.owner, modules: mods()});
  const a = make(), s = new Hub({document: a}); s.tab = 'features';
  assert.equal((await ACTIONS['group-hide'](s, {dataset: {key: 'profession-PROF-HERBALISM'}})).ok, true);
  assert.equal((await ACTIONS['group-hide'](s, {dataset: {key: 'profession-PROF-MINING'}})).ok, true);
  assert.equal((await ACTIONS['group-show'](s, {dataset: {key: 'profession-PROF-MINING'}})).ok, true);
  assert.deepEqual(a.flags[ID][HIDDEN_FLAG], ['profession-PROF-HERBALISM']);
  assert.equal((await ACTIONS['group-show-all'](s)).ok, true); assert.equal(a.flags[ID]?.[HIDDEN_FLAG], undefined);
  assert.ok(s.renders.length >= 3);
});
