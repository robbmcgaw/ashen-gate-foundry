import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSyncSet, planSync, nameIndex, ledgerKey, handoffDecision, handoffFingerprint} from '../scripts/sync.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const pack = JSON.parse(fs.readFileSync(new URL('../../../test-fixtures/playtest/AG_Playtest_Pack_0.6.1.json', import.meta.url), 'utf8'));
const locs = () => pack.records.filter(r => r.entity_type === 'Location');
const trees = {schema: 'ag-skill-trees/1', trees: [{id: 'TREE-TEST-A', name: '[TEST] Tree A', nodes: []}, {id: 'TREE-TEST-B', name: '[TEST] Tree B', nodes: []}]};
const treeApi = {previewTreeImport: () => ({rows: trees.trees.map(t => ({id: t.id, name: t.name, action: 'update', reason: 'Replaces the layout; purchased nodes are protected.'}))}), importTrees: async () => ({})};

function plan({payload = pack, ledger = {}, held = () => null, overwriteEdited = false, withTrees = true, api = treeApi} = {}) {
  const files = [{filename: 'pack.json', kind: 'manager', payload}];
  if (withTrees) files.push({filename: 'trees.json', kind: 'skill-trees', payload: trees});
  const set = buildSyncSet(files);
  const ids = new Set(locs().map(l => l.id));
  return planSync(set, {docs: [], characterCount: 0, unflaggedNames: nameIndex([])}, {includeDrafts: true, deleteUnscoped: false, overwriteEdited, retiredIds: new Set(), ledger, buildFlag: () => ({}), externalIds: new Set(),
    sceneActorIds: new Set(), hotbarMacroIds: new Set(), isProtectedFolder: () => false, locationIds: ids, routeIds: null, specialistApi: kind => kind === 'skill-trees' ? api : null, heldFingerprint: held});
}
/** The ledger Manager would hold after handing everything in `p` over. */
const ledgerAfter = (p, held = {}) => {
  const out = {};
  for (const r of p.rows.filter(x => x.external && x.fp)) {
    const key = r.specialist ? ledgerKey(null, r.specialist) : ledgerKey(r.line);
    (out[key] ??= {})[r.id] = {kind: r.kind, module: r.module, name: r.name, fp: r.fp, ...(held[r.id] ? {held: held[r.id]} : {})};
  }
  return out;
};
const ext = (p, kind) => p.rows.filter(r => r.external && r.kind === kind);

test('0.70.5 first run: no earlier import is recorded, so the record is passed on once and a fingerprint is stored', () => {
  const p = plan();
  assert.ok(locs().length > 0 && ext(p, 'Location').length === locs().length);
  for (const r of [...ext(p, 'Location'), ...ext(p, 'Skill Tree')]) {
    assert.equal(r.group, 'overwrite'); assert.ok(r.fp, 'fingerprint attached for the ledger'); assert.match(r.reason, /No earlier import is recorded/);
  }
  assert.equal(ext(p, 'Skill Tree').length, 2);
});

test('0.70.5 second run: identical records are Unchanged and not passed on', () => {
  const ledger = ledgerAfter(plan());
  const p = plan({ledger});
  for (const r of [...ext(p, 'Location'), ...ext(p, 'Skill Tree')]) { assert.equal(r.group, 'untouched'); assert.equal(r.unchanged, true); assert.match(r.reason, /Already matches the package/); }
  assert.equal(p.counts.overwrite, 0);
});

test('0.70.5 changed: only the record whose content changed is passed on again', () => {
  const ledger = ledgerAfter(plan());
  const target = locs()[0].id;
  const changed = {...pack, records: pack.records.map(r => r.id === target ? {...r, location: {...r.location, summary: 'A new summary'}, name: r.name} : r)};
  const p = plan({payload: changed, ledger});
  assert.equal(ext(p, 'Location').find(r => r.id === target).group, 'overwrite');
  assert.ok(ext(p, 'Location').filter(r => r.id !== target).every(r => r.group === 'untouched' && r.unchanged));
  assert.ok(ext(p, 'Skill Tree').every(r => r.unchanged));
  // A changed tree: only that tree.
  const t0 = structuredClone(trees.trees[0]); trees.trees[0].nodes = [{id: 'N1'}];
  try {
    const p2 = plan({ledger});
    assert.equal(ext(p2, 'Skill Tree').find(r => r.id === 'TREE-TEST-A').group, 'overwrite');
    assert.equal(ext(p2, 'Skill Tree').find(r => r.id === 'TREE-TEST-B').group, 'untouched');
  } finally { trees.trees[0] = t0; }
});

test('0.70.5 edited in the module itself: kept, unless "Also overwrite records I edited" is ticked', () => {
  const ids = Object.fromEntries(['TREE-TEST-A', 'TREE-TEST-B'].map(i => [i, 'held-1']));
  const ledger = ledgerAfter(plan(), ids);
  const held = (which, id) => which === 'skill-trees' && id === 'TREE-TEST-A' ? 'held-EDITED' : which === 'skill-trees' ? 'held-1' : null;
  const p = plan({ledger, held});
  const a = ext(p, 'Skill Tree').find(r => r.id === 'TREE-TEST-A'), b = ext(p, 'Skill Tree').find(r => r.id === 'TREE-TEST-B');
  assert.equal(a.group, 'untouched'); assert.equal(a.keptEdited, true); assert.match(a.reason, /Kept: edited in Skill Trees/);
  assert.equal(b.unchanged, true);
  assert.equal(p.counts.keptEdited, 1);
  const forced = plan({ledger, held, overwriteEdited: true});
  assert.equal(ext(forced, 'Skill Tree').find(r => r.id === 'TREE-TEST-A').group, 'overwrite');
  // A module that exposes no fingerprint is judged by the ledger alone.
  assert.equal(ext(plan({ledger}), 'Skill Tree').every(r => r.unchanged), true);
});

test('0.70.5 per-module isolation: another module\'s ledger entry never makes a record Unchanged', () => {
  const l = ledgerAfter(plan());
  const swapped = {[ledgerKey(null, 'skill-trees')]: l[Object.keys(l).find(k => !k.startsWith('specialist:'))], [Object.keys(l).find(k => !k.startsWith('specialist:'))]: l[ledgerKey(null, 'skill-trees')]};
  const p = plan({ledger: swapped});
  assert.ok([...ext(p, 'Location'), ...ext(p, 'Skill Tree')].every(r => r.group === 'overwrite'), 'ids do not match across modules, so nothing is skipped');
  // The same id under a different package line is not trusted either.
  const otherLine = Object.fromEntries(Object.entries(l).map(([k, v]) => [k.startsWith('specialist:') ? k : 'OTHER-LINE', v]));
  assert.ok(ext(plan({ledger: otherLine}), 'Location').every(r => r.group === 'overwrite'));
});

test('0.70.5 absent module: nothing is fingerprinted or skipped, the row says the module is not active', () => {
  const p = plan({api: null, ledger: ledgerAfter(plan())});
  const rows = p.rows.filter(r => r.external && r.module === 'Skill Trees');
  assert.ok(rows.every(r => r.group === 'untouched' && !r.fp && /not active/i.test(r.reason)));
});

test('0.70.5 decision table and fingerprint are stable', () => {
  assert.equal(handoffFingerprint({b: 1, a: 2}), handoffFingerprint({a: 2, b: 1}));
  assert.notEqual(handoffFingerprint({a: 1}), handoffFingerprint({a: 2}));
  assert.deepEqual(handoffDecision({fp: 'x', entry: undefined}), {group: 'overwrite', first: true});
  assert.deepEqual(handoffDecision({fp: 'x', entry: {fp: 'x'}}), {group: 'untouched', unchanged: true});
  assert.deepEqual(handoffDecision({fp: 'y', entry: {fp: 'x'}}), {group: 'overwrite'});
  assert.deepEqual(handoffDecision({fp: 'x', entry: {fp: 'x', held: 'a'}, held: 'b'}), {group: 'untouched', keptEdited: true});
});

test('0.70.5 the ledger stores the fingerprint after a hand-off; GM-only paths unchanged', () => {
  const apply = read('../scripts/sync-apply.js');
  assert.match(apply, /\.\.\.\(row\.fp \? \{fp: row\.fp\} : \{\}\)/);
  assert.match(apply, /adapter\.heldFingerprint\?\.\(row\)/);
  assert.match(read('../scripts/main.js'), /contentFingerprint/);
  assert.match(read('../CHANGELOG.md'), /^## 0\.70\.5 /m);
  assert.match(read('../README.md'), /Unchanged/);
});

test('0.70.6 Help explains the hand-off rows and reference links', () => {
  const src = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const help = src.slice(src.indexOf('const MANAGER_HELP='), src.indexOf('class AshenGateManager'));
  for (const text of ['Already matches the package', 'No earlier import is recorded for this record', 'Kept: edited in</em> that module', '<strong>Reference links</strong>']) assert.ok(help.includes(text), text);
});
