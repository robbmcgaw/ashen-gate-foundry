/** 0.66.0: Renown 0.18.0 update mode through Manager (Import and Sync from package). Uses Renown's real planner and runner
 *  with an in-memory world; proves the logic, not the live Manager window. Synthetic ids only (public repo). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SPECIALISTS, planSpecialist, applySpecialist, specialistApi, updatesExisting} from '../scripts/specialist-handoff.js';
import {buildSyncSet, planSync, nameIndex, SYNC_PHRASE} from '../scripts/sync.js';
import {executeSync} from '../scripts/sync-apply.js';
import {makeFaction, sourceDefinition} from '../../ashen-gate-factions/scripts/core.mjs';
import {planImport, runImport, IMPORT_SCHEMA} from '../../ashen-gate-factions/scripts/import.mjs';
import {definitionHash} from '../../ashen-gate-factions/scripts/update.mjs';

const def = (key, name, tags = []) => { const f = makeFaction({id: `FACTION-QA-${key}`, trackId: `RENOWN-QA-${key}`, name}); f.tags = tags; return sourceDefinition(f); };
const file = (...defs) => ({schema_version: IMPORT_SCHEMA, definitions: defs});

/** A Renown stand-in built from Renown's real planImport/runImport: `world` maps id -> {definition, hash, state}. */
function renown({withUpdate = true} = {}) {
  const world = new Map([['FACTION-QA-A', {definition: def('A', '[TEST] Guild A'), hash: null, state: {claims: {R1: {status: 'claimed'}}}}], ['FACTION-QA-B', {definition: def('B', '[TEST] Guild B'), hash: null, state: {}}]]);
  const calls = [];
  const plan = (data, options) => {
    const mode = options?.mode ?? 'skip';
    return planImport(data, new Set(world.keys()), mode === 'update' ? {...options, existing: new Map([...world].map(([id, w]) => [id, {definition: w.definition, hash: w.hash, legacy: false, states: {group: w.state, personal: []}}]))} : {});
  };
  const io = () => ({assertGM() {}, createFaction: async d => { world.set(d.id, {definition: d, hash: definitionHash(d), state: {}}); }, updateGroup: async () => {}, updatePersonal: async () => {}, findActor: () => null, finish: async () => {}, eventId: () => 'RENOWN-EVT-1', now: () => 't',
    saveSnapshot: async r => ({id: 'SNAP', name: 'snap', count: r.length}), updateFaction: async (id, d, hash) => { world.get(id).definition = d; world.get(id).hash = hash; }, finishUpdate: async () => {}, stampImport: async () => {}});
  const api = {
    previewFactionsImport: (data, options) => { calls.push(['preview', options]); const {errors, rows} = plan(data, options); return {errors, rows: rows.map(({id, name, kind, action, reason, changes}) => ({id, name, kind, action, reason, ...(changes ? {changes} : {})}))}; },
    importFactions: async (data, options) => { calls.push(['import', options]); return runImport(plan(data, options), io()); },
    ...(withUpdate ? {importOptions: Object.freeze({contract: 'ag-renown-import/1', modes: Object.freeze(['skip', 'update']), overwriteEdited: true})} : {})
  };
  return {api, world, calls};
}
const newer = () => file(def('A', '[TEST] Guild A (rebalanced)', ['x']), def('B', '[TEST] Guild B'), def('C', '[TEST] Guild C'));

test('Renown is an updating specialist, detected from its API', () => {
  assert.equal(SPECIALISTS.factions.canUpdate, true);
  assert.equal(updatesExisting('factions', renown().api), true);
  assert.equal(updatesExisting('factions', renown({withUpdate: false}).api), false);
  assert.equal(updatesExisting('headquarters', {}), false, 'other modules are unchanged');
  assert.equal(specialistApi({modules: {get: () => ({active: true, api: renown({withUpdate: false}).api})}}, 'factions') !== null, true, 'old Renown still imports');
});

test('Import: update off hands Renown skip mode; update on hands it update and shows what changes', () => {
  const r = renown();
  const off = planSpecialist('factions', newer(), r.api, {updateExisting: false});
  assert.deepEqual(r.calls[0], ['preview', {mode: 'skip', overwriteEdited: false}]);
  assert.deepEqual(off.rows.map(x => x.action), ['skipped', 'skipped', 'create']);
  const on = planSpecialist('factions', newer(), r.api, {updateExisting: true});
  assert.deepEqual(r.calls[1], ['preview', {mode: 'update', overwriteEdited: false}]);
  assert.deepEqual(on.rows.map(x => [x.id, x.action]), [['FACTION-QA-A', 'update'], ['FACTION-QA-B', 'skipped'], ['FACTION-QA-C', 'create']]);
  assert.match(on.rows[0].reason, /Update: fields name, tags/);
  assert.equal(on.rows[1].unchanged, true);
  assert.deepEqual(on.notes, []);
});

test('Import apply passes the mode and reports updated, unchanged and notes', async () => {
  const r = renown();
  const results = await applySpecialist('factions', newer(), r.api, {ids: ['FACTION-QA-A', 'FACTION-QA-B', 'FACTION-QA-C'], updateExisting: true});
  assert.deepEqual(r.calls.at(-1), ['import', {mode: 'update', overwriteEdited: false}]);
  assert.deepEqual(results.filter(x => x.status === 'ok').map(x => [x.id, x.action]).sort(), [['FACTION-QA-A', 'update'], ['FACTION-QA-C', 'create']]);
  assert.equal(results.find(x => x.id === 'FACTION-QA-B').status, 'skipped');
  assert.equal(r.world.get('FACTION-QA-A').definition.name, '[TEST] Guild A (rebalanced)');
  assert.deepEqual(r.world.get('FACTION-QA-A').state, {claims: {R1: {status: 'claimed'}}}, 'state is not Manager\'s or the import\'s to touch');
});

test('an edited definition shows as kept (counts as Kept: edited in Sync) until overwrite is on', () => {
  const r = renown();
  r.world.get('FACTION-QA-A').hash = 'older-import-fingerprint';
  const kept = planSpecialist('factions', newer(), r.api, {updateExisting: true});
  assert.equal(kept.rows[0].action, 'skipped');assert.equal(kept.rows[0].keptEdited, true);assert.match(kept.rows[0].reason, /Edited in this world/);
  const over = planSpecialist('factions', newer(), r.api, {updateExisting: true, overwriteEdited: true});
  assert.equal(over.rows[0].action, 'update');
  assert.deepEqual(r.calls.at(-1), ['preview', {mode: 'update', overwriteEdited: true}]);
});

test('an older Renown (no update mode) keeps the skip behaviour and the preview says it needs an update', async () => {
  const r = renown({withUpdate: false});
  const plan = planSpecialist('factions', newer(), r.api, {updateExisting: true});
  assert.equal(r.calls[0][1], undefined, 'no options are sent to a Renown that does not know them');
  assert.deepEqual(plan.rows.map(x => x.action), ['skipped', 'skipped', 'create']);
  assert.match(plan.rows[0].reason, /^Renown needs an update to refresh existing factions and deities\./);
  assert.match(plan.notes[0], /Renown needs an update to refresh existing factions and deities/);
  await applySpecialist('factions', newer(), r.api, {ids: ['FACTION-QA-A'], updateExisting: true});
  assert.equal(r.calls.at(-1)[1], undefined);
  assert.equal(r.world.get('FACTION-QA-A').definition.name, '[TEST] Guild A');
});

test('Sync from package: update rows are listed per record, edited ones are counted as kept, and apply runs in update mode', async () => {
  const r = renown();
  r.world.get('FACTION-QA-B').hash = 'older-import-fingerprint';
  const files = [{filename: 'factions.json', kind: 'factions', label: 'Renown', payload: file(def('A', '[TEST] Guild A (rebalanced)'), def('B', '[TEST] Guild B changed', ['y']), def('C', '[TEST] Guild C'))}];
  const set = buildSyncSet(files);
  const ctx = overwriteEdited => ({includeDrafts: true, deleteUnscoped: false, overwriteEdited, retiredIds: new Set(), ledger: {}, buildFlag: () => ({}), externalIds: new Set(), sceneActorIds: new Set(), hotbarMacroIds: new Set(),
    isProtectedFolder: () => false, locationIds: null, routeIds: null, shopIds: null, specialistApi: () => r.api});
  const world = {docs: [], characterCount: 0, unflaggedNames: nameIndex([])};
  const plan = planSync(set, world, ctx(false));
  assert.deepEqual(plan.errors, []);
  const by = Object.fromEntries(plan.rows.filter(x => x.external).map(x => [x.id, x]));
  assert.equal(by['FACTION-QA-A'].group, 'overwrite');
  assert.match(by['FACTION-QA-A'].reason, /Update: fields name/);
  assert.match(by['FACTION-QA-A'].reason, /snapshot of the old definition first and keeps standings, claims/);
  assert.equal(by['FACTION-QA-B'].group, 'untouched');assert.equal(by['FACTION-QA-B'].keptEdited, true);
  assert.equal(by['FACTION-QA-C'].group, 'create');
  assert.equal(plan.counts.keptEdited, 1);
  const over = planSync(set, world, ctx(true));
  assert.equal(over.rows.find(x => x.id === 'FACTION-QA-B').group, 'overwrite');
  const outcome = await executeSync(over, {backup: async () => {}, replan: async () => over, apis: {specialist: () => r.api}, retire: async () => {}, saveLedger: async () => {}, bindLinks: async () => {}}, {user: {isGM: true}, confirmation: SYNC_PHRASE});
  assert.deepEqual(r.calls.at(-1), ['import', {mode: 'update', overwriteEdited: true}]);
  assert.equal(outcome.counts.failed, 0);
  assert.equal(r.world.get('FACTION-QA-B').definition.name, '[TEST] Guild B changed');
});

test('docs name the new behaviour', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Renown[^\n]*update/i);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8')).version, '0.81.0');
});
