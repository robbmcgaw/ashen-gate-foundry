import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bulk, bulkWrite} from '../scripts/bulk.js';
import {bindPackageLinks, REPEAT_STOP} from '../scripts/link-binding.js';
import {executeSync, writeOverwrite, removeDoc, stampDoc, summarizeErrors} from '../scripts/sync-apply.js';
import {SYNC_PHRASE} from '../scripts/sync.js';

const M = 'ashen-gate-manager', GM = {isGM: true};
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
function setPath(o, path, value) { const k = path.split('.'); let t = o; for (const p of k.slice(0, -1)) t = t[p] ??= {}; t[k.at(-1)] = structuredClone(value); }
/** What Foundry does to the options it is given: it ASSIGNS context keys onto them. A frozen object throws exactly like the live error. */
const foundryLike = (opts, seen) => { seen?.push(opts); opts.parent = null; opts.pack = null; opts.diff = true; opts.recursive = true; return opts; };

function world(n, {fail = null} = {}) {
  const seen = [], docs = [], records = [];
  for (let i = 0; i < n; i++) {
    const id = `MAT-T${i}`, text = `<p>See [[AGREF:MAT-T${(i + 1) % n}|Next]]</p>`;
    const d = {id: `i${i}`, name: `[TEST] Item ${i}`, documentName: 'Item', parent: null, uuid: `Item.i${i}`, system: {description: {value: text}}, flags: {[M]: {source: {sourceId: id, visibility: 'player', managedFields: {}}}},
      getFlag(s, k) { return this.flags[s]?.[k] ?? null; }, toObject() { return {name: this.name, system: this.system}; },
      async update(u, o = {}) { foundryLike(o, seen); if (fail) throw new Error(fail); for (const [k, v] of Object.entries(u)) setPath(this, k, v); },
      async delete(o = {}) { foundryLike(o, seen); }, async updateEmbeddedDocuments(n2, u, o = {}) { foundryLike(o, seen); }, async createEmbeddedDocuments(n2, u, o = {}) { foundryLike(o, seen); }, async deleteEmbeddedDocuments(n2, u, o = {}) { foundryLike(o, seen); }};
    docs.push(d);
    records.push({id, name: d.name, visibility: 'player', refs: [{target_id: `MAT-T${(i + 1) % n}`, relation: 'related'}], foundry: {document_type: 'Item', data: {name: d.name, system: {description: {value: text}}}}});
  }
  const by = new Map(docs.map(d => [d.id, d]));
  const w = {moduleId: M, itemFlag: 'k', moduleRecord: () => null, documents: () => docs, sourceFlag: d => d.getFlag(M, 'source'),
    async updateDocuments(name, updates, o) { foundryLike(o, seen); if (fail) throw new Error(fail); for (const u of updates) { const {_id, ...rest} = u; for (const [k, v] of Object.entries(rest)) setPath(by.get(_id), k, v); } }};
  return {docs, records, w, seen, rows: records.map(r => ({id: r.id, action: 'update', kind: 'Item'})), log: () => ({results: records.map(r => ({id: r.id, action: 'update', status: 'ok'}))})};
}

test('0.70.4 bulk() is a fresh, plain, extensible object every call (never frozen, never shared)', () => {
  const a = bulk(), b = bulk(), c = bulkWrite(), d = bulkWrite();
  for (const o of [a, b, c, d]) { assert.equal(Object.isFrozen(o), false); assert.equal(Object.isExtensible(o), true); o.parent = 1; }
  assert.notEqual(a, b); assert.notEqual(c, d);
  assert.deepEqual(bulk(), {agBulk: true});
  assert.deepEqual(bulkWrite(), {render: false, agBulk: true});
});

test('0.70.4 the real failure: a frozen options object throws like Foundry does, and the code never passes one', async () => {
  assert.throws(() => foundryLike(Object.freeze({agBulk: true}), null), /not extensible|read only|Cannot add property/);
  const w = world(40);
  await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.w});
  // writeOverwrite (embedded + document), stamp, delete: all through Foundry-like mutating mocks
  const doc = w.docs[0];
  await writeOverwrite(doc, {id: 'MAT-T0', ops: {fields: {name: 'x'}, effects: {create: [{a: 1}], update: [{_id: 'e', changed: 1}], delete: ['z']}}}, {user: GM, flag: doc.getFlag(M, 'source')});
  await stampDoc(doc, w.records[0]);
  await removeDoc(doc, {id: 'MAT-T0'}, {user: GM});
  assert.ok(w.seen.length > 10);
  assert.equal(new Set(w.seen).size, w.seen.length, 'every write call received its own options object');
  assert.ok(w.seen.every(o => !Object.isFrozen(o) && Object.isExtensible(o)));
});

test('0.70.4 source: no frozen or shared options anywhere in the bulk code', () => {
  const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const f of ['../scripts/bulk.js', '../scripts/sync-apply.js', '../scripts/link-binding.js']) assert.doesNotMatch(code(read(f)), /Object\.(freeze|seal|preventExtensions)|\bBULK\b/, f);
  assert.doesNotMatch(code(read('../scripts/main.js')), /,\s*BULK\s*\)|\bBULK\b/);
});

test('0.70.4 a systematic failure stops the link step after 25 identical failures instead of grinding through all of them', async () => {
  const w = world(200, {fail: 'Cannot add property parent, object is not extensible'});
  const log = w.log(), errors = [], orig = console.error; console.error = (...a) => errors.push(a);
  let r;
  try { r = await bindPackageLinks({records: w.records, rows: w.rows, log, world: w.w}); } finally { console.error = orig; }
  assert.ok(r.stopped && r.stopped.count >= REPEAT_STOP && /not extensible/.test(r.stopped.message));
  assert.ok(log.results.filter(x => x.status === 'error').length < 60, 'did not grind through 200');
  assert.equal(errors.length, 1, 'the original Error is logged once, with the first failing record');
  assert.match(String(errors[0][0]), /first failure of this kind on "\[TEST\] Item \d+"/);
  assert.ok(errors[0][1] instanceof Error);
});

function syncFixture(n, failMsg) {
  const w = world(n);
  const rows = w.records.map((r, i) => ({id: r.id, kind: 'Item', name: r.name, group: 'overwrite', ops: {fields: {name: r.name}}, snap: {doc: w.docs[i]}, record: r}));
  if (failMsg) for (const d of w.docs) d.update = async () => { throw new TypeError(failMsg); };
  const plan = {ok: true, fingerprint: 'f', rows, counts: {}, scope: {lines: [], files: []}, set: {specialistFiles: [], supersedes: new Map()}, specialistSupersedes: []};
  const adapter = {async backup() {}, async replan() { return plan; }, docFor: row => w.docs.find(d => d.getFlag(M, 'source').sourceId === row.id), buildFlag: row => ({sourceId: row.id, visibility: 'player', managedFields: {}}),
    bindLinks: (list, log, o) => bindPackageLinks({records: w.records, rows: list.map(x => ({id: x.id, action: 'update', kind: 'Item'})), log: {results: log}, world: w.w, ...o}),
    updateDocuments: (name, u, o) => w.w.updateDocuments(name, u, o), docsById: () => new Map(w.docs.map(d => [d.getFlag(M, 'source').sourceId, [d]])), apis: {}, async retire() {}, async saveLedger() {}, pause: async () => {}};
  return {w, plan, adapter};
}

test('0.70.4 executeSync: a whole run through Foundry-like mocks has no failures (this is what 0.70.3 broke)', async () => {
  const f = syncFixture(60);
  const out = await executeSync(f.plan, f.adapter, {user: GM, confirmation: SYNC_PHRASE});
  assert.equal(out.completed, true, JSON.stringify(out.counts));
  assert.equal(out.counts.failed, 0);
});

test('0.70.4 executeSync: 25 identical overwrite failures halt the run with one clear line, and the real Error reaches the console once', async () => {
  const f = syncFixture(100, 'Cannot add property parent, object is not extensible');
  const errors = [], orig = console.error; console.error = (...a) => errors.push(a);
  let out;
  try { out = await executeSync(f.plan, f.adapter, {user: GM, confirmation: SYNC_PHRASE}); } finally { console.error = orig; }
  assert.equal(out.completed, false);
  assert.ok(out.log.filter(l => l.status === 'error' && l.action === 'update').length <= 26, 'stopped after the 25th');
  const halt = out.log.find(l => l.action === 'sync-halted');
  assert.match(halt.message, /Sync stopped after 25 records in a row failed with the same error: Cannot add property parent/);
  assert.equal(errors.filter(e => /first failure of this kind/.test(String(e[0]))).length, 1);
  assert.ok(errors.find(e => e[1] instanceof TypeError));
});

test('0.70.4 many identical failures are summarised in one line with example names', () => {
  const log = [...Array.from({length: 763}, (_, i) => ({id: `MAT-${i}`, name: `[TEST] ${i}`, status: 'error', message: 'Cannot add property parent, object is not extensible'})), {id: 'X', status: 'error', message: 'other'}, {id: 'Y', status: 'ok'}];
  const s = summarizeErrors(log);
  assert.equal(s.length, 1); assert.equal(s[0].count, 763); assert.deepEqual(s[0].names, ['[TEST] 0', '[TEST] 1', '[TEST] 2']);
  assert.match(read('../scripts/main.js'), /records failed with the same error: \$\{e\.message\}/);
});

test('0.70.4 version, download URL and CHANGELOG', () => {
  const m = JSON.parse(read('../module.json'));
  assert.equal(m.version, '0.81.0'); assert.ok(m.download.endsWith('/ashen-gate-manager-v0.81.0/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.70\.4 /m);
});
