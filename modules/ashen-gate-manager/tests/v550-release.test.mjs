import test from 'node:test';
import assert from 'node:assert/strict';
import {initialOwnership, releasable, releaseUpdate, previewRelease, applyRelease, previewText, playerVisible, LEVEL, BASELINE_FLAG, CHUNK} from '../scripts/release.js';
import {runPreSessionCheck} from '../scripts/pre-session-check.js';

const M = 'ashen-gate-manager';
let n = 0;
const doc = (kind, {status = 'approved', visibility = 'player', ownership = {default: 0}, baseline, archived, name} = {}) => {
  const id = `d${++n}`;
  return {id, name: name ?? `Doc ${id}`, documentName: kind, ownership: {...ownership},
    flags: {[M]: {source: {sourceId: `MAT-${id}`, status, visibility}, ...(baseline !== undefined ? {[BASELINE_FLAG]: baseline} : {}), ...(archived ? {lifecycle: {archived: true}} : {})}}};
};
const sourceOf = d => d.flags[M].source;

test('create rule: only approved + player on Item/JournalEntry/Actor is Observer', () => {
  for (const kind of ['Item', 'JournalEntry', 'Actor']) {
    assert.equal(initialOwnership({status: 'approved', visibility: 'player'}, kind), LEVEL.OBSERVER);
    assert.equal(initialOwnership({status: 'approved', visibility: 'gm'}, kind), LEVEL.NONE);
    assert.equal(initialOwnership({status: 'approved', visibility: 'reveal_gated'}, kind), LEVEL.NONE);
    for (const status of ['draft', 'proposed', 'example_only', 'retired']) assert.equal(initialOwnership({status, visibility: 'player'}, kind), LEVEL.NONE);
  }
  assert.equal(initialOwnership({status: 'approved', visibility: 'player'}, 'RollTable'), LEVEL.NONE);
  assert.equal(initialOwnership({status: 'approved', visibility: 'player'}, 'Macro'), LEVEL.NONE);
  assert.equal(playerVisible(undefined, 'Item'), false);
});

test('update rule: raises only a plain None default, never lowers, respects deliberate lowering and per-user entries', () => {
  const d = doc('Item');
  assert.equal(releasable(d, sourceOf(d)), true);                                          // legacy import: no baseline
  assert.equal(releasable(doc('Item', {baseline: LEVEL.NONE}), {status: 'approved', visibility: 'player'}), true);
  assert.equal(releasable(doc('Item', {baseline: LEVEL.OBSERVER}), {status: 'approved', visibility: 'player'}), false); // GM lowered it
  assert.equal(releasable(doc('Item', {ownership: {default: 2}}), {status: 'approved', visibility: 'player'}), false);
  assert.equal(releasable(doc('Item', {ownership: {default: 3}}), {status: 'approved', visibility: 'player'}), false);   // never lowers
  assert.equal(releasable(doc('Item', {ownership: {default: 1}}), {status: 'approved', visibility: 'player'}), false);   // Limited is a choice
  assert.equal(releasable(doc('Item', {archived: true}), {status: 'approved', visibility: 'player'}), false);
  for (const src of [{status: 'approved', visibility: 'gm'}, {status: 'approved', visibility: 'reveal_gated'}, {status: 'draft', visibility: 'player'}])
    assert.equal(releasable(doc('Item'), src), false);
  const u = releaseUpdate(d);
  assert.deepEqual(Object.keys(u).sort(), ['_id', `flags.${M}.${BASELINE_FLAG}`, 'ownership.default'].sort()); // no per-user keys
  assert.equal(u['ownership.default'], LEVEL.OBSERVER);
});

function world() {
  return [doc('Item', {name: 'Reedfin Catch'}), doc('Item', {name: 'Dried Fish'}), doc('JournalEntry', {name: 'Handout'}), doc('Actor', {name: 'Villager'}),
    doc('Item', {visibility: 'gm'}), doc('Item', {visibility: 'reveal_gated'}), doc('Item', {status: 'draft'}), doc('Item', {ownership: {default: 2}}),
    doc('Item', {ownership: {default: 0, user1: 3}}), doc('RollTable'), {id: 'x', name: 'Plain', documentName: 'Item', ownership: {default: 0}, flags: {}}];
}

test('preview groups by kind, lists examples and writes nothing', () => {
  const docs = world();
  const before = JSON.stringify(docs);
  const p = previewRelease(docs, d => d.flags[M]?.source);
  assert.equal(p.total, 5);
  assert.deepEqual(p.kinds.map(k => [k.kind, k.count]), [['Item', 3], ['JournalEntry', 1], ['Actor', 1]]);
  assert.equal(p.alreadyReleased, 1);
  assert.ok(p.examples.length <= 8 && p.examples.some(e => e.name === 'Reedfin Catch'));
  assert.match(previewText(p), /5 approved, player-visible/);
  assert.equal(JSON.stringify(docs), before);
});

test('apply releases in chunks, keeps other ownership, is idempotent, skips what changed after the preview', async () => {
  const docs = Array.from({length: CHUNK + 20}, () => doc('Item'));
  docs.push(doc('Item', {visibility: 'gm'}), doc('Item', {ownership: {default: 0, user1: 3}}));
  const gm = docs.at(-2), withUser = docs.at(-1);
  const writes = [], progress = [];
  const write = async (kind, updates) => {
    writes.push([kind, updates.length]);
    for (const u of updates) { const d = docs.find(x => x.id === u._id); d.ownership.default = u['ownership.default']; d.flags[M][BASELINE_FLAG] = u[`flags.${M}.${BASELINE_FLAG}`]; }
  };
  const preview = previewRelease(docs, sourceOf);
  assert.equal(preview.total, CHUNK + 21);
  // changed since the preview: the GM raised one document meanwhile
  docs[0].ownership.default = 3;
  const out = await applyRelease(preview, sourceOf, {write, onProgress: p => progress.push(p), yieldToUI: async () => {}});
  assert.equal(out.released, CHUNK + 20);
  assert.equal(out.skipped, 1);
  assert.deepEqual(writes.map(w => w[1]), [CHUNK, 20]);
  assert.equal(progress.at(-1).done, CHUNK + 20);
  assert.equal(docs[0].ownership.default, 3);
  assert.equal(gm.ownership.default, 0);
  assert.deepEqual(withUser.ownership, {default: 2, user1: 3});   // per-user entry kept
  const again = previewRelease(docs, sourceOf);
  assert.equal(again.total, 0);
  const second = await applyRelease(again, sourceOf, {write, yieldToUI: async () => {}});
  assert.equal(second.released, 0);
  assert.equal(writes.length, 2);
});

test('apply stops between chunks on Cancel; a rerun finishes', async () => {
  const docs = Array.from({length: CHUNK * 2}, () => doc('Item'));
  const ac = new AbortController();
  const write = async (kind, updates) => { for (const u of updates) { const d = docs.find(x => x.id === u._id); d.ownership.default = 2; d.flags[M][BASELINE_FLAG] = 2; } };
  const out = await applyRelease(previewRelease(docs, sourceOf), sourceOf, {write, signal: ac.signal, yieldToUI: async () => {}, onProgress: () => ac.abort()});
  assert.equal(out.cancelled, true);
  assert.equal(out.released, CHUNK);
  const rest = previewRelease(docs, sourceOf);
  assert.equal(rest.total, CHUNK);
  assert.equal((await applyRelease(rest, sourceOf, {write, yieldToUI: async () => {}})).released, CHUNK);
});

test('after create/release a Ledger-style visibleToEveryPlayer check passes (default >= Observer)', async () => {
  const visibleToEveryPlayer = d => Number(d.ownership.default ?? 0) >= 2;
  const d = doc('Item');
  assert.equal(visibleToEveryPlayer(d), false);
  await applyRelease(previewRelease([d], sourceOf), sourceOf, {write: async (k, [u]) => { d.ownership.default = u['ownership.default']; }, yieldToUI: async () => {}});
  assert.equal(visibleToEveryPlayer(d), true);
  const created = {ownership: {default: initialOwnership({status: 'approved', visibility: 'player'}, 'Item')}};
  assert.equal(visibleToEveryPlayer(created), true);
});

test('pre-session check warns about hidden player-visible records and points at the release action', async () => {
  const mk = docs => ({user: {isGM: true}, users: [], items: docs, journal: [], actors: [], modules: new Map(), settings: {get: () => undefined}, world: {title: 'T'}});
  const hidden = doc('Item');
  const warn = (await runPreSessionCheck(mk([hidden]))).rows.find(r => r.check === 'Player visibility');
  assert.equal(warn.status, 'WARN');
  assert.match(warn.text, /Release player-visible records/);
  const ok = doc('Item', {ownership: {default: 2}});
  assert.equal((await runPreSessionCheck(mk([ok]))).rows.find(r => r.check === 'Player visibility').status, 'PASS');
  assert.equal((await runPreSessionCheck(mk([]))).rows.find(r => r.check === 'Player visibility').status, 'N-A');
});
