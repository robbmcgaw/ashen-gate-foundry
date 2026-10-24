/** 0.44.4: no Ashen Gate canonical id in player-visible output (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {PANELS, panelState, knownProfessions} from '../scripts/partners.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';

const mods = () => ({
  'ashen-gate-profession-ledger': {active: true, api: {
    getProfessions: () => [{professionId: 'PROF-TEST-HERB', name: '', level: 3, xp: 20, xpToNext: 1}, {professionId: 'PROF-TEST-MINE', name: '[TEST] Mining', level: 2, xp: 5, xpToNext: 3}],
    getKnownRecipes: () => [{id: 'REC-TEST-1'}, {id: 'REC-TEST-2'}], open: () => {}}},
  'ashen-gate-skill-trees': {active: true, api: {
    listTrees: () => [{id: 'TREE-TEST-A', name: '', nodes: [{id: 'PERK-TEST-1', name: ''}]}, {id: 'TREE-TEST-B', name: '[TEST] Cinders', nodes: []}],
    actorProgress: (a, id) => id === 'TREE-TEST-A' ? {awarded: 1, unlocks: ['PERK-TEST-1', 'PERK-TEST-2']} : {awarded: 2, unlocks: []},
    pointsSummary: () => [{treeId: 'TREE-TEST-A', earned: 1, spent: 0, available: 1, wallet: 'w'}, {treeId: 'TREE-TEST-B', earned: 2, spent: 0, available: 2, wallet: 'w'}],
    open: () => {}}},
  'ashen-gate-factions': {active: true, api: {getFactions: () => [{id: 'FAC-TEST', name: '', group: {score: 1}}], open: () => {}}},
  'ashen-gate-quest-manager': {active: true, api: {listVisible: () => [{id: 'QUEST-TEST', name: '[TEST] Quest', status: 'Active', scope: 'party', objectives: []}], open: () => {}}},
  'ashen-gate-locations': {active: true, api: {listLocations: () => [{id: 'LOC-TEST-MILL', name: '[TEST] Millbrook'}], open: () => {}}}
});

test('partner panels never show ids, even when a partner omits names', () => {
  installGlobals({user: users.owner, modules: mods()});
  const actor = makeActor();
  for (const panel of PANELS) assertNoIds(panelState(panel, actor).html, `${panel.label} panel`);
  const rows = knownProfessions(actor) ?? [];
  assertNoIds(rows.map(r => r.name).join(' '), 'Overview professions box');
});
