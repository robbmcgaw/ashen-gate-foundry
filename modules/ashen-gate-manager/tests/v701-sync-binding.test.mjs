import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindPackageLinks, BIND_CHUNK, WRITE_UNIT} from '../scripts/link-binding.js';
import {executeSync} from '../scripts/sync-apply.js';
import {SYNC_PHRASE} from '../scripts/sync.js';
import {createConnection, ConnectionLost, SyncTimeout} from '../scripts/sync-connection.js';
import {createProgress, progressLine, stepText, STALL_MS, HEARTBEAT_MS, clock} from '../scripts/sync-progress.js';

const M = 'ashen-gate-manager', ITEM_FLAG = 'itemKey';
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function setPath(o, path, value) { const k = path.split('.'); let t = o; for (const p of k.slice(0, -1)) t = t[p] ??= {}; t[k.at(-1)] = structuredClone(value); }

/** A world of N linked Items. Every Foundry call that could be expensive is counted. */
function makeWorld(n, {failOn = null, batchFails = false} = {}) {
  const calls = {sourceFlag: 0, getFlag: 0, docUpdate: 0, batch: 0, batchSizes: [], embedded: 0, documents: 0};
  const byDocId = new Map(), docs = [], records = [];
  for (let i = 0; i < n; i++) {
    const sourceId = `MAT-T${i}`, next = `MAT-T${(i + 1) % n}`, text = `<p>See [[AGREF:${next}|Next]] and ${'lorem '.repeat(40)}</p>`;
    const doc = {id: `i${i}`, name: `[TEST] Item ${i}`, documentName: 'Item', uuid: `Item.i${i}`, system: {description: {value: text}},
      flags: {[M]: {source: {sourceId, visibility: 'player', managedFields: {'system.description.value': text}}}},
      getFlag(scope, key) { calls.getFlag++; return this.flags[scope]?.[key] ?? null; },
      async update(u) { calls.docUpdate++; if (failOn === this.id) throw new Error('boom from the server'); for (const [k, v] of Object.entries(u)) setPath(this, k, v); }};
    docs.push(doc); byDocId.set(doc.id, doc);
    records.push({id: sourceId, name: doc.name, visibility: 'player', refs: [{target_id: next, relation: 'related'}], foundry: {document_type: 'Item', data: {name: doc.name, system: {description: {value: text}}}}});
  }
  const world = {moduleId: M, itemFlag: ITEM_FLAG, moduleRecord: () => null,
    documents: () => { calls.documents++; return docs; },
    sourceFlag: d => { calls.sourceFlag++; return d.getFlag(M, 'source'); },
    async updateDocuments(name, updates) {
      calls.batch++; calls.batchSizes.push(updates.length);
      if (batchFails) throw new Error('batch refused');
      for (const u of updates) { if (failOn === u._id) throw new Error('boom from the server'); const {_id, ...rest} = u; for (const [k, v] of Object.entries(rest)) setPath(byDocId.get(_id), k, v); }
    }};
  const rows = records.map(r => ({id: r.id, action: 'update', kind: 'Item'}));
  const log = () => ({results: records.map(r => ({id: r.id, action: 'update', status: 'ok'}))});
  return {calls, docs, records, world, rows, log};
}

const units = n => Math.floor(n / BIND_CHUNK) * Math.ceil(BIND_CHUNK / WRITE_UNIT) + (n % BIND_CHUNK ? Math.ceil((n % BIND_CHUNK) / WRITE_UNIT) : 0);
test('0.70.1 complexity: binding links does linear work (lookups are built once, not per record)', async () => {
  const per = [];
  for (const n of [100, 200, 400]) {
    const w = makeWorld(n);
    await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world});
    per.push({n, flag: w.calls.sourceFlag / n, get: w.calls.getFlag / n, upd: w.calls.docUpdate, batch: w.calls.batch, docs: w.calls.documents});
  }
  // The old code scanned the whole world per record: sourceFlag calls per record grew with n (about 2n per record). Now they are constant.
  assert.ok(per.every(p => p.flag <= 2.5), JSON.stringify(per));
  assert.ok(Math.abs(per[2].flag - per[0].flag) < 0.2, 'calls per record do not grow with the world: ' + JSON.stringify(per));
  assert.ok(per.every(p => p.get <= 4), JSON.stringify(per));
  assert.ok(per.every(p => p.docs === 1), 'the world is read once');
  assert.ok(per.every(p => p.upd === 0), 'no per-document update when the batch write works');
  assert.deepEqual(per.map(p => p.batch), per.map(p => units(p.n)), 'one request per 10 documents of each chunk of 25');
});

test('0.70.1 chunking: chunks of 25, requests of at most 10 documents, and the step count moves inside a chunk', async () => {
  const w = makeWorld(130), steps = [];
  const r = await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world, onStep: s => steps.push(s)});
  assert.ok(w.calls.batchSizes.every(x => x <= 10)); assert.equal(w.calls.batchSizes.reduce((a, b) => a + b, 0), 130);
  assert.deepEqual([r.done, r.total, r.cancelled], [130, 130, false]);
  const counts = steps.filter(s => s.step === 'Binding links' && s.stepTotal).map(s => s.stepDone);
  assert.deepEqual([...new Set(counts)], [0, 25, 50, 75, 100, 125, 130]);
  assert.ok(steps.some(s => s.step === 'Saving links' && s.stepDone === 10), 'a count inside the first chunk is reported');
  assert.ok(steps.some(s => s.step === 'Saving links' && /\[TEST\]/.test(s.name)), 'the current record is named, not its id');
  assert.ok(w.docs.every(d => /@UUID\[Item\.i\d+\]\{Next\}/.test(d.system.description.value)), 'links were bound');
});

test('0.70.1 cancel between chunks, then the same run resumes and a third run writes nothing (idempotent)', async () => {
  const w = makeWorld(120), controller = new AbortController();
  let saved = 0;
  const first = await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world, signal: controller.signal,
    onStep: s => { if (s.step === 'Binding links' && s.stepDone === 25) controller.abort(); }});
  assert.equal(first.cancelled, true); assert.equal(first.done, 25);
  assert.equal(w.calls.batchSizes.reduce((a, b) => a + b, 0), 25);
  const second = await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world});
  assert.equal(second.cancelled, false); assert.equal(second.done, 120);
  assert.equal(w.calls.batchSizes.slice(w.calls.batchSizes.length - 10).reduce((a, b) => a + b, 0) > 0, true);
  assert.equal(w.calls.batchSizes.reduce((a, b) => a + b, 0), 120, 'every record written exactly once across the two runs');
  const before = w.calls.batch;
  await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world});
  assert.equal(w.calls.batch, before, 'a finished world needs no writes');
  void saved;
});

test('0.70.1 a failed write is surfaced with the record name and message, never swallowed', async () => {
  const w = makeWorld(60, {failOn: 'i7'}), log = w.log();
  await bindPackageLinks({records: w.records, rows: w.rows, log, world: w.world});
  const errors = log.results.filter(r => r.status === 'error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, '[TEST] Item 7'); assert.match(errors[0].message, /boom from the server/);
  assert.ok(w.docs.filter(d => d.id !== 'i7').every(d => d.system.description.value.includes('@UUID')), 'the other records were still bound');
  // A refused batch falls back to one write per document (so each error can name its record).
  const x = makeWorld(5, {batchFails: true});
  await bindPackageLinks({records: x.records, rows: x.rows, log: x.log(), world: x.world});
  assert.equal(x.calls.docUpdate, 5);
});

test('0.70.1 a lost connection stops the binding with ConnectionLost instead of recording a failure', async () => {
  const w = makeWorld(10);
  await assert.rejects(bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world, guard: () => Promise.reject(new ConnectionLost())}), ConnectionLost);
});

// ---- connection ----
function fakeSocket() { const h = {}; return {connected: true, on(e, f) { (h[e] ??= new Set()).add(f); }, off(e, f) { h[e]?.delete(f); }, fire(e) { this.connected = e === 'connect'; [...(h[e] ?? [])].forEach(f => f()); }}; }

test('0.70.1 connection: a write that never answers settles when the socket drops, or times out', async () => {
  const sock = fakeSocket(), conn = createConnection(sock, {timeoutMs: 20});
  const hung = conn.race(new Promise(() => {}), {ms: 10000});
  sock.fire('disconnect');
  await assert.rejects(hung, ConnectionLost);
  sock.fire('connect');
  await assert.rejects(conn.race(new Promise(() => {}), {ms: 15}), SyncTimeout);
  assert.equal(await conn.race(Promise.resolve(7)), 7);
  sock.fire('disconnect');
  const waiting = conn.ready(); sock.fire('connect');
  assert.equal(await waiting, true, 'ready() waits for the reconnect');
  sock.fire('disconnect');
  assert.equal(await createConnection(sock, {waitMs: 10}).ready(), false, 'and gives up when it does not come back');
});

// ---- executeSync ----
function syncFixture(n) {
  const w = makeWorld(n), settingsWrites = [];
  const rows = w.records.map((r, i) => ({id: r.id, kind: 'Item', name: r.name, group: 'overwrite', ops: {fields: {name: r.name}}, snap: {doc: w.docs[i]}, record: r}));
  for (const [i, d] of w.docs.entries()) { d.toObject = () => structuredClone({name: d.name, system: d.system}); d.documentName = 'Item'; d.parent = null; }
  const plan = {ok: true, fingerprint: 'f', rows, counts: {}, scope: {lines: [], files: []}, set: {specialistFiles: [], supersedes: new Map()}, specialistSupersedes: []};
  const adapter = {async backup() {}, async replan() { return plan; }, docFor: row => w.docs.find(d => d.getFlag(M, 'source').sourceId === row.id),
    buildFlag: row => ({sourceId: row.id, visibility: 'player', managedFields: {'system.description.value': row.record.foundry.data.system.description.value}}),
    bindLinks: (list, log, o) => bindPackageLinks({records: w.records, rows: list.map(x => ({id: x.id, action: 'update', kind: 'Item'})), log: {results: log}, world: w.world, ...o}),
    updateDocuments: (name, updates) => w.world.updateDocuments(name, updates),
    docsById: () => new Map(w.docs.map(d => [d.getFlag(M, 'source').sourceId, [d]])),
    apis: {}, async retire(ids) { settingsWrites.push('retire'); }, async saveLedger() { settingsWrites.push('ledger'); }, pause: async () => {}};
  return {w, plan, adapter, settingsWrites};
}

test('0.70.1 executeSync: whole-run call counts stay linear and settings writes are bounded', async () => {
  const sizes = [];
  for (const n of [100, 300]) {
    const f = syncFixture(n), events = [];
    const out = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE, onProgress: e => events.push(e)});
    assert.equal(out.completed, true, JSON.stringify(out.counts));
    sizes.push({n, sourceFlag: f.w.calls.sourceFlag / n, settings: f.settingsWrites.length, singles: f.w.calls.docUpdate});
    assert.ok(events.some(e => e.phase === 'links' && e.step === 'Binding links' && e.stepTotal === n), 'link phase reports its own count');
    assert.ok(events.some(e => e.phase === 'stamp' && e.stepTotal === n), 'the stamp phase reports its own count');
  }
  assert.ok(Math.abs(sizes[1].sourceFlag - sizes[0].sourceFlag) < 0.2, JSON.stringify(sizes));
  assert.ok(sizes.every(s => s.settings === 0), JSON.stringify(sizes)); // no deletes, no hand-off: no settings writes
  assert.ok(sizes.every(s => s.singles === s.n), 'one document write per record (the overwrite itself); links and stamps are batched: ' + JSON.stringify(sizes));
});

test('0.70.1 executeSync: Cancel during link binding stops between chunks and says so; running again finishes', async () => {
  const f = syncFixture(120), controller = new AbortController();
  const out = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE, signal: controller.signal,
    onProgress: e => { if (e.step === 'Binding links' && e.stepDone === 25) controller.abort(); }});
  assert.equal(out.cancelled, true); assert.equal(out.completed, false);
  const again = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE});
  assert.equal(again.completed, true);
  assert.ok(f.w.docs.every(d => d.system.description.value.includes('@UUID')));
});

test('0.70.1 executeSync: a socket drop during link binding ends the run with a clear message instead of hanging', async () => {
  const f = syncFixture(120), sock = fakeSocket();
  f.adapter.connection = createConnection(sock, {timeoutMs: 60000});
  f.w.world.updateDocuments = () => { sock.fire('disconnect'); return new Promise(() => {}); }; // a write the server will never answer
  const out = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE});
  assert.ok(out.interrupted, 'interrupted');
  assert.match(out.interrupted.message, /Connection lost during Binding links between records, 0 of 120/);
  assert.match(out.interrupted.message, /Reload the page and run the same Sync again; it resumes/);
  assert.equal(out.completed, false);
  assert.deepEqual(f.settingsWrites, [], 'nothing was retired or deleted');
});

test('0.70.1 executeSync: a swallowed error is not swallowed: a throwing bindLinks is reported in the result', async () => {
  const f = syncFixture(3);
  f.adapter.bindLinks = async () => { throw new Error('index exploded'); };
  const out = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE});
  assert.ok(out.log.some(l => l.status === 'error' && /Binding links stopped: index exploded/.test(l.message)));
  assert.equal(out.completed, false);
});

// ---- progress line ----
test('0.70.1 progress: heartbeat adds elapsed time, "still working" appears, and a 60 s stall is named', () => {
  let t = 1_000_000; const drawn = [], warned = [];
  const p = createProgress({now: () => t, paint: o => drawn.push(o), warn: x => warned.push(x)});
  p.report({phase: 'links', label: 'Binding links between records…', done: 1896, total: 2106, step: 'Binding links', stepDone: 150, stepTotal: 1896, name: '[TEST] Item 150'});
  assert.equal(drawn.at(-1).label, 'Sync: Binding links between records… (1896 of 2106) · Binding links 150 of 1896: [TEST] Item 150 · run 0 s · step 0 s');
  t += HEARTBEAT_MS; p.beat();
  assert.match(drawn.at(-1).label, /· run 2 s · step 2 s$/); assert.equal(drawn.at(-1).stalled, false);
  t += 4000; p.beat();
  assert.match(drawn.at(-1).label, /still working \(last change 6 s ago\)/);
  t += STALL_MS; p.beat();
  const last = drawn.at(-1);
  assert.equal(last.stalled, true);
  assert.match(last.label, /^Sync has not moved for 66 s: Binding links between records, 150 of 1896 \(\[TEST\] Item 150\)\. Wait, or Cancel; running the same sync again resumes\./);
  assert.equal(warned.length, 1); assert.match(warned[0], /record "\[TEST\] Item 150"/);
  t += 1000; p.beat(); assert.equal(warned.length, 1, 'warned once per stall');
  p.report({phase: 'links', label: 'Binding links between records…', done: 1896, total: 2106, step: 'Binding links', stepDone: 200, stepTotal: 1896, name: 'next'});
  assert.equal(drawn.at(-1).stalled, false, 'any movement clears the warning');
  assert.equal(clock(125000), '2:05'); assert.equal(progressLine({phase: 'backup', label: 'x', done: 0, total: 5}), 'Backup: x');
  assert.equal(stepText({step: 'Recording', stepDone: 3, stepTotal: 9}), 'Recording 3 of 9');
});

// ---- wiring and docs ----
test('0.70.1 wiring: no per-record world scans in the Sync path; legacy conversion is batched and once per world', () => {
  const main = read('../scripts/main.js'), apply = read('../scripts/sync-apply.js'), link = read('../scripts/link-binding.js');
  const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code(link), /foundDocuments|allBoundDocuments|existingSourceIndex/);
  const adapter = main.slice(main.indexOf('#syncAdapter(set,results)'), main.indexOf('  #fail(error)'));
  assert.doesNotMatch(adapter, /new Set\(existingSourceIndex\(\)\.keys\(\)\);ids\.add/);
  const legacy = main.slice(main.indexOf('async function convertLegacyReferenceBlocks'), main.indexOf('let appearanceController'));
  assert.match(legacy, /updateDocuments\(/); assert.match(legacy, /bulkWrite\(\)/); assert.match(legacy, /LEGACY_REFS_SETTING/); assert.match(legacy, /bulkBusy\(\)/);
  assert.doesNotMatch(legacy, /await target\.update/);
});
test('0.70.1 version, CHANGELOG, README and Help agree', () => {
  const manifest = JSON.parse(read('../module.json'));
  assert.equal(manifest.version, '0.99.0');
  assert.ok(manifest.download.endsWith('/ashen-gate-manager-v0.99.0/ashen-gate-manager.zip'));
  assert.match(read('../CHANGELOG.md'), /^## 0\.70\.1 /m);
  assert.match(read('../README.md'), /has not moved for 60 s/);
  assert.match(read('../scripts/main.js'), /not moved for 60 s|resumes/);
});

// ---- 0.70.3: bulk flag, bulk-finished signal, a link step that cannot hold the Sync hostage ----
import {emitBulkFinished, listenBulkFinished, BULK_FINISHED, bulkWrite} from '../scripts/bulk.js';

test('0.70.3 every link write is a bulk write: agBulk, no redraw, at most 10 documents', async () => {
  const w = makeWorld(30), seen = [], orig = w.world.updateDocuments;
  w.world.updateDocuments = (name, updates, opts) => { seen.push({n: updates.length, opts}); return orig(name, updates, opts); };
  await bindPackageLinks({records: w.records, rows: w.rows, log: w.log(), world: w.world});
  assert.ok(seen.length >= 3 && seen.every(s => s.opts.agBulk === true && s.opts.render === false && s.n <= 10), JSON.stringify(seen));
  assert.deepEqual(bulkWrite(), {render: false, agBulk: true});
});

test('0.70.3 bulk finished: announced here and over the socket; every client re-announces what it hears', () => {
  const called = [], emitted = [], handlers = [];
  emitBulkFinished('sync', {hooks: {callAll: (...a) => called.push(a)}, socket: {emit: (...a) => emitted.push(a)}});
  assert.equal(called[0][0], BULK_FINISHED); assert.equal(called[0][1].reason, 'sync');
  assert.equal(emitted[0][1].type, 'ag-bulk-finished');
  const heard = [];
  listenBulkFinished({hooks: {callAll: (...a) => heard.push(a)}, socket: {on: (ch, f) => handlers.push(f)}});
  handlers[0]({type: 'ag-bulk-finished', reason: 'import'}); handlers[0]({type: 'other'});
  assert.equal(heard.length, 1); assert.equal(heard[0][1].remote, true);
  emitBulkFinished('x', {hooks: {callAll() { throw new Error('listener broke'); }}, socket: null}); // never throws
});

test('0.70.3 a link step that stops making progress is abandoned: the Sync finishes, says links are not bound, skips deletes', async () => {
  const f = syncFixture(30), stamps = [];
  f.w.world.updateDocuments = () => new Promise(() => {}); // the server never answers
  f.adapter.updateDocuments = (name, updates) => { stamps.push(updates.length); return Promise.resolve(); };
  const doomed = {...f.plan.rows[0], id: 'MAT-GONE', group: 'delete', snap: {doc: {documentName: 'Item', parent: null, getFlag: () => ({sourceId: 'MAT-GONE'}), delete: async () => {}}}};
  f.plan.rows.push(doomed);
  const t0 = Date.now();
  const out = await executeSync(f.plan, f.adapter, {user: {isGM: true}, confirmation: SYNC_PHRASE, stallMs: 30});
  assert.ok(Date.now() - t0 < 3000, 'did not hang');
  assert.equal(out.completed, false);
  assert.ok(out.log.some(l => /Links are not bound yet: Binding links made no progress/.test(l.message)));
  assert.ok(out.log.some(l => l.action === 'delete' && l.status === 'skipped'), 'deletes are skipped');
  assert.deepEqual(stamps, [], 'nothing is remembered for unbound text');
  assert.equal(out.counts.updated, 30, 'the records themselves were written');
});

test('0.70.3 every Ashen Gate module ignores agBulk writes and refreshes once on bulk finished', () => {
  const files = {
    hub: '../../ashen-gate-character-hub/scripts/main.mjs', ledger: '../../ashen-gate-profession-ledger/scripts/main.js',
    utilities: '../../ashen-gate-utilities/scripts/main.mjs', shopBuy: '../../ashen-gate-utilities/scripts/shop-buy.mjs', shops: '../../ashen-gate-utilities/scripts/shops.mjs',
    quest: '../../ashen-gate-quest-manager/scripts/main.mjs', locations: '../../ashen-gate-locations/scripts/main.mjs',
    renown: '../../ashen-gate-factions/scripts/module.mjs', trees: '../../ashen-gate-skill-trees/scripts/main.js'};
  for (const [name, rel] of Object.entries(files)) {
    const src = read(rel);
    assert.match(src, /agBulk/, `${name} skips bulk writes`);
    assert.match(src, /ashenGate\.bulkFinished/, `${name} refreshes once afterwards`);
  }
  assert.match(read('../scripts/main.js'), /agBulk/); // Manager's own invalidate
  assert.match(read('../module.json'), /"socket": true/);
});

test('0.70.3 an unbound import marker is drawn as a name through the reference enricher, ahead of Foundry\'s roll enricher', () => {
  const main = read('../scripts/main.js');
  assert.match(main, /enrichers\.unshift\(\{id:'ag-unbound-marker',pattern:MARKER_PATTERN/);
});
