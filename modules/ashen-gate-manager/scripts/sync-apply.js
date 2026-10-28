/**
 * Sync from package (0.56.0): writing. Every function checks the caller and the target here, in the data layer, so a
 * refusal does not depend on what the window hides. Documents are duck-typed (update / updateEmbeddedDocuments / ...),
 * so the Node suite drives these with in-memory documents.
 *
 * Order of a run: backup (a failed backup stops everything) → artwork → create → overwrite → link binding → stamp →
 * hand-off to other modules → delete. Deletes run last and only when nothing before them failed. Every step is
 * idempotent and the next preview is computed from the world, so an interrupted or cancelled run is finished by running
 * the same sync again.
 */
import {MODULE_ID, MANAGED_TYPES, baselineFields} from './core.js';
import {isArtPath, artDecision, liveArt} from './art-fields.js';
import {ACTOR_ITEMS_FLAG, ITEM_FLAG, ITEM_PLAY_STATE, itemKeys, itemLeaves, keyOf} from './actor-update.js';
import {contentHash} from './world-export.js';
import {applyLocations, applyRoutes} from './location-handoff.js';
import {applyShops} from './shop-handoff.js';
import {applySpecialist} from './specialist-handoff.js';
import {replacingSourceFlag} from './source-projection.mjs';
import {bulkWrite, bulk} from './bulk.js';
import {ConnectionLost, isInterruption} from './sync-connection.js';
import {SYNC_PHRASE, MEMO_KEY, incomingFields, pageFields, ledgerKey, phraseOk} from './sync.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const get = (o, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], o);

/** Throws unless this user may write this world document for this id. Character sheets are never writable. */
export function assertSyncTarget(doc, user, id, {deleting = false} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can run Sync from package.');
  if (!doc || !MANAGED_TYPES.includes(doc.documentName)) throw new Error('Sync only changes Items, Journals, Actors, Roll Tables and Macros.');
  if (doc.parent) throw new Error('Sync never changes a document embedded in a sheet.');
  if (doc.documentName === 'Actor') {
    if (doc.type === 'character') throw new Error('Character sheets are never changed by Sync.');
    if (deleting && doc.type !== 'npc') throw new Error('Sync only removes NPC Actors.');
  }
  const flag = doc.getFlag?.(MODULE_ID, 'source');
  if (!flag?.sourceId) throw new Error('Sync only changes documents Manager imported (no Manager source flag on this one).');
  if (id && flag.sourceId !== id) throw new Error(`This document is bound to ${flag.sourceId}, not ${id}.`);
}

/**
 * 0.70.0 "art is always yours", enforced at the write: the art fields of `fields` (portrait, token image, token ring) that the
 * world has changed from the last import's package value are dropped, whatever the plan said, unless the GM ticked
 * "Also replace art I set" (replaceArt). Returns the fields to write.
 */
export function withoutGmArt(doc, fields, {replaceArt = false} = {}) {
  if (replaceArt) return fields;
  const arts = Object.keys(fields).filter(isArtPath);
  if (!arts.length) return fields;
  const raw = doc.toObject?.() ?? {}, baseline = baselineFields(doc.getFlag?.(MODULE_ID, 'source')?.managedFields) ?? {};
  const out = {...fields};
  for (const path of arts) if (artDecision(path, liveArt(path, raw, baseline, get), fields[path], baseline) === 'keep') delete out[path];
  return out;
}

/** Overwrites one document with the package's version of it. Embedded changes first, the source flag last. */
export async function writeOverwrite(doc, row, {user, flag, extra = {}, replaceArt = false}) {
  assertSyncTarget(doc, user, row.id);
  const ops = row.ops, kind = doc.documentName;
  const fields = withoutGmArt(doc, ops.fields, {replaceArt});
  if (kind === 'Actor') {
    const {adopt = [], update = [], create = [], delete: del = []} = ops.items ?? {};
    const updates = [...adopt.map(a => ({_id: a._id, [`flags.${MODULE_ID}.${ITEM_FLAG}`]: a.key})), ...update];
    if (updates.length) await doc.updateEmbeddedDocuments('Item', updates, bulk());
    if (create.length) await doc.createEmbeddedDocuments('Item', structuredClone(create), bulk());
    if (del.length) await doc.deleteEmbeddedDocuments('Item', del, bulk());
  } else if (kind === 'Item' && ops.effects) {
    const {create = [], update = [], delete: del = []} = ops.effects;
    if (create.length) await doc.createEmbeddedDocuments('ActiveEffect', structuredClone(create), bulk());
    if (update.length) await doc.updateEmbeddedDocuments('ActiveEffect', update.map(({changed, edited, ...u}) => u), bulk());
    if (del.length) await doc.deleteEmbeddedDocuments('ActiveEffect', del, bulk());
  } else if (kind === 'JournalEntry' && ops.pages) {
    const {create = [], update = [], delete: del = []} = ops.pages;
    if (create.length) await doc.createEmbeddedDocuments('JournalEntryPage', structuredClone(create), bulk());
    if (update.length) await doc.updateEmbeddedDocuments('JournalEntryPage', update.map(({key, ...u}) => u), bulk());
    if (del.length) await doc.deleteEmbeddedDocuments('JournalEntryPage', del, bulk());
  } else if (kind === 'RollTable' && ops.results) {
    // New results first, then the old ones: an interrupted run leaves extras that the next run replaces, never an empty table.
    if (ops.results.create.length) await doc.createEmbeddedDocuments('TableResult', structuredClone(ops.results.create), bulk());
    if (ops.results.deleteIds.length) await doc.deleteEmbeddedDocuments('TableResult', ops.results.deleteIds, bulk());
  }
  const update = {...fields, ...extra, [`flags.${MODULE_ID}.source`]: replacingSourceFlag(doc.getFlag?.(MODULE_ID, 'source'), flag)};
  if (kind === 'Actor') update[`flags.${MODULE_ID}.${ACTOR_ITEMS_FLAG}`] = {version: 1};
  await doc.update(update, bulk());
}

/** Flag scopes never copied from the old Item to its recreation: Manager's own (rebuilt from the package), Foundry core's and the system's. */
export const RECREATE_SKIP_SCOPES = [MODULE_ID, 'core', 'dnd5e'];
/**
 * 0.72.2 "Also recreate Items whose type changed": a swap, not a retire. The new Item is created from the package first (folder of the
 * old one, ownership by the current Items rule, Manager source flag and baseline); other modules' flags are copied from the old Item;
 * art the GM set is kept unless "Also replace art I set". Only then is the old Item deleted. Any failure before the delete removes the
 * new Item again and leaves the old one untouched. Copies on Actors are separate documents and are never touched.
 * adapter: {create(row) → new document}.
 */
export async function recreateItem(oldDoc, row, {user, adapter, replaceArt = false}) {
  assertSyncTarget(oldDoc, user, row.id, {deleting: true});
  if (oldDoc.documentName !== 'Item') throw new Error('Only Items can be recreated.');
  const baseline = baselineFields(oldDoc.getFlag?.(MODULE_ID, 'source')?.managedFields) ?? {};
  const raw = oldDoc.toObject?.() ?? {};
  const fresh = await adapter.create(row);
  if (!fresh) throw new Error('Foundry did not return a saved document.');
  try {
    const update = {folder: oldDoc.folder?.id ?? raw.folder ?? null};
    const flags = {};
    for (const [scope, value] of Object.entries(raw.flags ?? {})) if (!RECREATE_SKIP_SCOPES.includes(scope)) flags[scope] = structuredClone(value);
    if (Object.keys(flags).length) update.flags = flags;
    // Art the GM set stays theirs: not a Foundry default icon, not an icon Manager picked itself, and not the package's own value.
    const gmArt = raw.img && !String(raw.img).startsWith('icons/svg/') && !oldDoc.getFlag?.(MODULE_ID, 'iconSource') && (baseline.img === undefined || raw.img !== baseline.img);
    if (!replaceArt && gmArt) update.img = raw.img;
    await fresh.update(update, bulk());
  } catch (error) {
    try { await fresh.delete(bulk()); } catch (rollback) { throw new Error(`${error?.message ?? error}; the new Item could not be removed again (${rollback?.message ?? rollback}). Delete the duplicate by hand.`); }
    throw error;
  }
  try { await oldDoc.delete(bulk()); }
  catch (error) { throw new Error(`The new Item was created but the old one could not be deleted (${error?.message ?? error}). Delete the old ${row.name} by hand; the next preview lists the duplicate.`); }
  return fresh;
}

/**
 * Replaces one document in place with the record that supersedes it (0.64.0): the SAME world document (so tokens on scenes,
 * ownership, folder, linked actors and links stay) is rewritten with the new record's content and re-bound to the new id.
 * Embedded changes first and the source flag last, so an interrupted run leaves the document bound to the old id and the
 * same preview finishes it. The old id is kept in the Manager flag `supersededFrom` for the record.
 */
export async function writeRebind(doc, row, {user, flag, extra = {}, replaceArt = false}) {
  const oldId = row?.supersedes?.oldId;
  if (!oldId) throw new Error('This row does not replace anything.');
  assertSyncTarget(doc, user, oldId);
  if (flag?.sourceId !== row.id) throw new Error(`The new source flag names ${flag?.sourceId}, not ${row.id}.`);
  const prior = doc.getFlag?.(MODULE_ID, 'supersededFrom');
  const from = [...new Set([...(Array.isArray(prior) ? prior : []), oldId])];
  await writeOverwrite(doc, {...row, id: oldId}, {user, flag, replaceArt, extra: {...extra, [`flags.${MODULE_ID}.supersededFrom`]: from}});
}

/**
 * After a write (and after links are bound): remember, per path, where Foundry stores something other than the package
 * text (rich-text links, normalised numbers), so the next preview calls that field unchanged. JSON text, one write.
 */
export async function stampDoc(doc, record) { await doc.update(stampUpdate(doc, record), bulk()); }
/** The one update stampDoc writes ({flag path: JSON text}); sync, so a run can batch many documents into one write. */
export function stampUpdate(doc, record) {
  const raw = doc.toObject();
  const memo = {};
  for (const [path, incoming] of Object.entries(incomingFields(record))) {
    if (incoming && typeof incoming === 'object' && !Array.isArray(incoming) && !Object.keys(incoming).length) continue;
    if (isArtPath(path)) continue; // 0.70.0: the GM's art is never remembered as a "normalised" package value (art-fields.js)
    const live = get(raw, path);
    if (!same(live, incoming)) memo[path] = {raw: contentHash(incoming ?? null), live: contentHash(live ?? null)};
  }
  if (record.foundry.document_type === 'Actor') {
    const defs = record.foundry.data.items ?? [], keys = itemKeys(defs), marked = new Map((raw.items ?? []).filter(keyOf).map(i => [keyOf(i), i]));
    defs.forEach((def, i) => {
      const liveItem = marked.get(keys[i]);
      if (!liveItem) return;
      for (const [path, incoming] of Object.entries(itemLeaves(def))) {
        if (ITEM_PLAY_STATE.has(path) || (incoming && typeof incoming === 'object' && !Array.isArray(incoming) && !Object.keys(incoming).length)) continue;
        const cur = get(liveItem, path);
        if (!same(cur, incoming)) memo[`item:${keys[i]}:${path}`] = {raw: contentHash(incoming ?? null), live: contentHash(cur ?? null)};
      }
    });
  }
  if (record.foundry.document_type === 'JournalEntry') {
    const live = raw.pages ?? [];
    const keys = nameKeysOf(live.map(p => p.name));
    const byKey = new Map(keys.map((k, i) => [k, live[i]]));
    for (const [key, def] of Object.entries(pageFields(record))) {
      const page = byKey.get(key);
      if (!page) continue;
      for (const [path, value] of [['text.content', def.text.content], ...(def.text.format !== undefined ? [['text.format', def.text.format]] : [])]) {
        const cur = get(page, path);
        if (!same(cur, value)) memo[`page:${key}:${path}`] = {raw: contentHash(value ?? null), live: contentHash(cur ?? null)};
      }
    }
  }
  return {[`flags.${MODULE_ID}.source.${MEMO_KEY}`]: JSON.stringify(memo)};
}
function nameKeysOf(names) { const seen = new Map(); return names.map(n => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c === 1 ? n : `${n}#${c}`; }); }

/** Removes one Manager-imported world document. Copies on character sheets are separate documents and are not touched. */
export async function removeDoc(doc, row, {user}) {
  assertSyncTarget(doc, user, row.id, {deleting: true});
  await doc.delete(bulk());
}

// ---------- backup ----------
/**
 * The JSON backup downloaded before anything is written: the complete data of every document that will be overwritten
 * or deleted (same shape as Manager's other snapshots, so Import history reads it), plus the records the other modules'
 * public exports hold. The package files themselves are what a rebuild needs for created records.
 */
export function buildSyncBackup(plan, {world = null, now = new Date(), modules = null} = {}) {
  const rows = plan.rows.filter(r => ['overwrite', 'delete', 'rebind', 'recreate'].includes(r.group) && r.snap);
  return {
    schema_version: 'ag-foundry-snapshot/0.3', created_at: now.toISOString(), reason: 'before-sync-from-package', world_id: world?.id ?? null,
    sync: {phrase: SYNC_PHRASE, counts: plan.counts, lines: plan.scope.lines, files: plan.scope.files},
    documents: rows.map(r => ({document_type: r.snap.documentName, uuid: r.snap.uuid, document_id: r.snap.id, source_id: r.id, sync_action: r.group, raw: r.snap.raw})),
    module_records: plan.rows.filter(r => r.external && r.group === 'overwrite').map(r => ({id: r.id, kind: r.kind, module: r.module})),
    module_exports: modules ?? null
  };
}

// ---------- the run ----------
/** Chunks of `size`; checks `signal` and the connection between chunks, guards each item so a dead socket cannot hang it. */
const chunked = async (list, size, signal, run, pause, progress, {guard = p => p, ensure = async () => {}, halted = () => false} = {}) => {
  let done = 0;
  for (let i = 0; i < list.length; i += size) {
    if (signal?.aborted) return {cancelled: true, done};
    await ensure();
    for (const item of list.slice(i, i + size)) { await guard(run(item)); done++; if (halted()) return {cancelled: true, halted: true, done}; }
    progress?.(done);
    await pause?.();
  }
  return {cancelled: Boolean(signal?.aborted && done < list.length), done};
};

/**
 * Runs a previewed plan. `adapter` supplies the Foundry-specific parts:
 *   [extraUpdate(doc, row) → fields written with the document, e.g. the ownership rule], backup(plan), uploadArt(rows), replan() → plan, create(row) → doc, docFor(row) → doc, buildFlag(row) → flag,
 *   bindLinks(rows, log, {signal, onStep, guard, chunk}) → {cancelled}, apis → {locations, routes, shops, specialist(kind)}, retire(ids), saveLedger(entries), pause(),
 *   [docsById() → Map id→[docs], read once after the links are bound], [updateDocuments(documentName, updates, options)], [connection → sync-connection.js]
 * onProgress receives {phase, label, done, total} plus, inside a long phase, {step, stepDone, stepTotal, name}.
 * Returns {cancelled, log, counts, completed, interrupted?}. The log's counts equal the preview's when nothing fails.
 * 0.70.1: a lost connection (or a server that stops answering) ends the run with `interrupted` set and the same sync resumes it.
 */
export const REPEAT_STOP = 25;
/** One line per distinct message when many records failed the same way: [{message, count, names}]. */
export function summarizeErrors(log, {many = 4} = {}) {
  const by = new Map();
  for (const x of log) if (x.status === 'error') { const e = by.get(x.message) ?? by.set(x.message, {message: x.message, count: 0, names: []}).get(x.message); e.count++; if (e.names.length < 3) e.names.push(x.name ?? x.id); }
  return [...by.values()].filter(e => e.count >= many);
}
export async function executeSync(plan, adapter, options = {}) {
  const log = [], state = {phase: '', label: '', done: 0, total: 0};
  try { return await runSync(plan, adapter, options, log, state); }
  catch (e) {
    if (!isInterruption(e)) throw e;
    const where = state.step ? `${state.label.replace(/…$/, '')}, ${state.stepDone} of ${state.stepTotal}` : `${state.label.replace(/…$/, '')}${state.total ? `, ${state.done} of ${state.total}` : ''}`;
    const why = e instanceof ConnectionLost ? 'Connection lost' : 'No answer from the server';
    const message = `${why} during ${where}. Reload the page and run the same Sync again; it resumes and does not repeat what is already done. Nothing was deleted unless it was listed as deleted.`;
    log.push({action: 'sync-interrupted', status: 'error', id: '—', message});
    console.warn(`[${MODULE_ID}] Sync interrupted at ${where}`, e);
    return {...result(plan, log, true), interrupted: {phase: state.phase, message}};
  }
}

async function runSync(plan, adapter, options = {}, log, state) {
  const {user, confirmation, signal, onProgress, chunk = 20} = options;
  if (!user?.isGM) throw new Error('Only a GM can run Sync from package.');
  if (!phraseOk(confirmation)) throw new Error(`Type "${SYNC_PHRASE}" to confirm.`);
  if (!plan?.ok) throw new Error('This sync has errors; fix them and preview again. Nothing was changed.');
  const say = (phase, label, done, total, extra = {}) => { Object.assign(state, {phase, label, done, total, step: null, stepDone: 0, stepTotal: 0}, extra); onProgress?.({phase, label, done, total, ...extra}); };
  const conn = adapter.connection ?? null;
  const guard = p => conn ? conn.race(p) : p;
  const ensure = async () => { if (conn && !(await conn.ready(() => say(state.phase, 'Connection lost: waiting for Foundry to reconnect…', state.done, state.total)))) throw new ConnectionLost(); };
  const ok = (row, action, extra = {}) => { succeeded(); log.push({id: row.id, kind: row.kind, name: row.name, action, status: 'ok', ...extra}); };
  const streak = {message: null, count: 0}, logged = new Set();
  const fail = (row, action, error) => {
    const message = String(error?.message ?? error);
    streak.count = message === streak.message ? streak.count + 1 : 1; streak.message = message;
    // The original Error (with its stack) once per distinct message, so the real throw site is visible in the console.
    if (!logged.has(message)) { logged.add(message); console.error(`[${MODULE_ID}] Sync: first failure of this kind on "${row.name ?? row.id}" (${action})`, error); }
    log.push({id: row.id, kind: row.kind, name: row.name, action, status: 'error', message});
  };
  const succeeded = () => { streak.count = 0; streak.message = null; };
  // 0.70.4: a failure that repeats for 25 records in a row is a systematic fault, not 25 bad records: stop grinding and say so once.
  const halted = () => {
    if (streak.count < REPEAT_STOP) return false;
    log.push({action: 'sync-halted', status: 'error', id: '—', message: `Sync stopped after ${streak.count} records in a row failed with the same error: ${streak.message}. Nothing further was written; fix the cause and run the same Sync again.`});
    return true;
  };
  const creates = plan.rows.filter(r => r.group === 'create' && !r.external);
  const overwrites = plan.rows.filter(r => r.group === 'overwrite' && !r.external);
  const rebinds = plan.rows.filter(r => r.group === 'rebind');
  const recreates = plan.rows.filter(r => r.group === 'recreate');
  const specialistSupersedes = (plan.specialistSupersedes ?? []).filter(x => x.pending !== 0);
  const external = plan.rows.filter(r => r.external && ['create', 'overwrite'].includes(r.group));
  const deletes = plan.rows.filter(r => r.group === 'delete');
  const total = rebinds.length + recreates.length + creates.length + overwrites.length + external.length + deletes.length;
  let finished = 0;
  const tick = (phase, label) => () => say(phase, label, ++finished, total);
  const co = {guard, ensure, halted};

  say('backup', 'Downloading the backup of everything that will change…', 0, total);
  await adapter.backup(plan); // throws → nothing has been written
  if (signal?.aborted) return {cancelled: true, log, completed: 0};
  say('check', 'Checking the world has not changed since the preview…', 0, total);
  await ensure();
  const fresh = await guard(adapter.replan());
  if (fresh.fingerprint !== plan.fingerprint) throw new Error('The world or the files changed since the preview. Preview again; nothing was changed.');
  if (adapter.uploadArt) await guard(adapter.uploadArt([...rebinds, ...creates, ...overwrites]));

  const touched = [];
  const mark = (phase, label) => tick(phase, label);
  // 0.64.0: replace-in-place first, so the new ids exist before anything links to them; then the owning modules re-key their own state.
  let r = await chunked(rebinds, chunk, signal, async row => {
    try {
      const doc = row.snap?.doc ?? adapter.docFor({...row, id: row.supersedes.oldId});
      await writeRebind(doc, row, {user, flag: adapter.buildFlag(row), replaceArt: Boolean(plan.replaceArt), extra: adapter.extraUpdate?.(doc, row) ?? {}});
      touched.push(row); ok(row, 'rebind', {oldId: row.supersedes.oldId, uuid: doc.uuid});
    } catch (e) { fail(row, 'rebind', e); }
    mark('rebind', row.name)();
  }, adapter.pause, null, co);
  if (r.cancelled) return result(plan, log, true);
  const reboundOk = rebinds.filter(row => log.some(l => l.id === row.id && l.action === 'rebind' && l.status === 'ok'));
  if (reboundOk.length && adapter.afterRebind) {
    try { for (const entry of await guard(adapter.afterRebind(Object.fromEntries(reboundOk.map(row => [row.supersedes.oldId, row.id])), reboundOk))) log.push(entry); }
    catch (e) { if (isInterruption(e)) throw e; log.push({action: 'supersede-ids', status: 'error', id: '—', message: String(e?.message ?? e)}); }
  }
  if (specialistSupersedes.length && adapter.supersedeSpecialist && !signal?.aborted) {
    for (const sp of specialistSupersedes) {
      try { for (const entry of await guard(adapter.supersedeSpecialist(sp))) log.push(entry); }
      catch (e) { if (isInterruption(e)) throw e; log.push({action: 'supersede-ids', status: 'error', id: sp.filename, message: String(e?.message ?? e)}); }
    }
  }
  r = await chunked(creates, chunk, signal, async row => {
    try { const doc = await adapter.create(row); if (!doc) throw new Error('Foundry did not return a saved document.'); touched.push(row); ok(row, 'create', {uuid: doc.uuid}); } catch (e) { fail(row, 'create', e); }
    mark('create', row.name)();
  }, adapter.pause, null, co);
  if (r.cancelled) return result(plan, log, true);
  r = await chunked(overwrites, chunk, signal, async row => {
    try { await writeOverwrite(row.snap?.doc ?? adapter.docFor(row), row, {user, flag: adapter.buildFlag(row), replaceArt: Boolean(plan.replaceArt), extra: adapter.extraUpdate?.(row.snap?.doc ?? adapter.docFor(row), row) ?? {}}); touched.push(row); ok(row, 'update', row.metadataOnly ? {metadataOnly: true} : {}); } catch (e) { fail(row, 'update', e); }
    mark('overwrite', row.name)();
  }, adapter.pause, null, co);
  if (r.cancelled) return result(plan, log, true);

  // 0.72.2: Items whose type changed are swapped (create the new one, then delete the old one). Not a retire: the id stays live.
  r = await chunked(recreates, chunk, signal, async row => {
    try {
      const old = row.snap?.doc ?? adapter.docFor(row);
      const doc = await guard(recreateItem(old, row, {user, adapter, replaceArt: Boolean(plan.replaceArt)}));
      touched.push(row); ok(row, 'recreate', {uuid: doc.uuid});
    } catch (e) { fail(row, 'recreate', e); }
    mark('recreate', row.name)();
  }, adapter.pause, null, co);
  if (r.cancelled) return result(plan, log, true);

  // Link binding: one pass with every lookup built once, written in chunks (link-binding.js). Reports its own sub-steps.
  const LINKS = 'Binding links between records…';
  const okIds = new Set(log.filter(l => l.status === 'ok' && l.action !== 'link-sync').map(l => l.id));
  const written = touched.filter(t => okIds.has(t.id));
  say('links', LINKS, finished, total, {step: 'Preparing', stepDone: 0, stepTotal: written.length});
  await ensure();
  // 0.70.3: the link step may never hold the rest of the Sync hostage. If it makes no progress for twice the watchdog time, it is
  // abandoned: the records and hand-offs still complete, the result says the links are not bound yet, deletes are skipped, and the
  // same Sync run again binds them (an unbound [[AGREF:..]] marker is drawn as a name by Manager's text enricher, never as an id).
  const now = options.now ?? Date.now, stallMs = options.stallMs ?? 60000;
  const inner = new AbortController(), linkSignal = {get aborted() { return Boolean(signal?.aborted || inner.aborted); }};
  let lastMove = now(), linksStalled = false;
  const watch = {id: null};
  try {
    const stalled = new Promise(resolve => { watch.id = (options.setInterval ?? setInterval)(() => { if (now() - lastMove >= 2 * stallMs) resolve(true); }, Math.max(10, Math.floor(stallMs / 4))); });
    const run = Promise.resolve(adapter.bindLinks(written, log, {signal: linkSignal, guard, pause: adapter.pause, onStep: s => { lastMove = now(); say('links', LINKS, finished, total, s); }}));
    run.catch(() => {});
    const winner = await Promise.race([run.then(v => ({v})), stalled.then(() => ({stalled: true}))]);
    if (winner.stalled) {
      linksStalled = true; inner.abort();
      const where = state.stepTotal ? `${state.stepDone} of ${state.stepTotal}${state.name ? ` (${state.name})` : ''}` : 'before the first record';
      console.warn(`[${MODULE_ID}] Binding links abandoned: no progress for ${Math.round((now() - lastMove) / 1000)} s at ${where}`);
      log.push({action: 'link-sync', status: 'error', id: '—', message: `Links are not bound yet: Binding links made no progress for ${Math.round((now() - lastMove) / 1000)} s at ${where}. The records and hand-offs were still written; descriptions show names until the links are bound. Run the same Sync again to finish (deletes were skipped).`});
    } else if (winner.v?.stopped) {
      linksStalled = true; // the text is not bound: nothing is remembered for it
      log.push({action: 'link-sync', status: 'error', id: '—', message: `Binding links stopped after ${winner.v.stopped.count} records in a row failed with the same error: ${winner.v.stopped.message}. The records and hand-offs were still written; descriptions show names until the links are bound. Fix the cause and run the same Sync again (deletes were skipped).`});
    } else if (winner.v?.cancelled) return result(plan, log, true);
  } catch (e) {
    if (isInterruption(e)) throw e;
    console.warn(`[${MODULE_ID}] Binding links failed`, e);
    log.push({action: 'link-sync', status: 'error', id: '—', message: `Binding links stopped: ${String(e?.message ?? e)}`});
  } finally { (options.clearInterval ?? clearInterval)(watch.id); }
  // Remember how Foundry stores each written field (stampDoc), in chunks; one write per document type per chunk.
  const STAMP = 'Remembering what was written…';
  const wroteIds = new Set(log.filter(l => l.status === 'ok' && ['create', 'update', 'rebind', 'recreate'].includes(l.action)).map(l => l.id));
  const stampable = linksStalled ? [] : touched.filter(row => wroteIds.has(row.id)); // unbound text would be remembered wrongly
  const docsById = adapter.docsById?.() ?? null;
  const docOf = row => docsById ? docsById.get(row.id)?.[0] : adapter.docFor(row);
  for (let i = 0; i < stampable.length; i += 25) {
    if (signal?.aborted) return result(plan, log, true);
    await ensure();
    const part = stampable.slice(i, i + 25);
    say('stamp', STAMP, finished, total, {step: 'Recording', stepDone: i, stepTotal: stampable.length, name: part[0]?.name});
    const batch = [];
    for (const row of part) {
      try {
        const doc = docOf(row);
        if (!doc) continue;
        if (adapter.updateDocuments) batch.push({row, doc, update: stampUpdate(doc, row.record)});
        else await guard(stampDoc(doc, row.record));
      } catch (e) { if (isInterruption(e)) throw e; log.push({id: row.id, kind: row.kind, name: row.name, action: 'stamp', status: 'error', message: String(e?.message ?? e)}); }
    }
    const changed = batch.filter(b => { const [key] = Object.keys(b.update); return !same(get(b.doc, key), b.update[key]); });
    for (const [name, list] of groupBy(changed, b => b.doc.documentName)) {
      try { await guard(adapter.updateDocuments(name, list.map(b => ({_id: b.doc.id, ...b.update})), bulkWrite())); }
      catch (batchError) {
        if (isInterruption(batchError)) throw batchError;
        for (const b of list) try { await guard(b.doc.update(b.update, bulkWrite())); }
        catch (e) { if (isInterruption(e)) throw e; log.push({id: b.row.id, kind: b.row.kind, name: b.row.name, action: 'stamp', status: 'error', message: String(e?.message ?? e)}); }
      }
    }
    await adapter.pause?.();
  }

  // Other modules' records: their own import APIs, update mode, in dependency order (locations, routes, shops, specialist files).
  const apis = adapter.apis ?? {};
  const pass = async (rows, runner, kind) => {
    if (!rows.length) return;
    say('modules', `Handing ${rows.length} ${kind} record${rows.length === 1 ? '' : 's'} to ${kind}…`, finished, total);
    await ensure();
    const results = await guard(runner(rows.map(x => x.record), apis));
    for (const res of results) {
      log.push(res); finished++;
    }
    say('modules', kind, finished, total);
  };
  const ext = kind => external.filter(x => x.kind === kind && !x.specialist);
  const ledgerAdds = [];
  if (!signal?.aborted) {
    await pass(ext('Location'), (recs, a) => applyLocations(recs, a.locations, {updateExisting: true}), 'Locations');
    await pass(ext('Route'), (recs, a) => applyRoutes(recs, a.routes, {updateExisting: true}), 'Routes');
    await pass(external.filter(x => ['Shop', 'Service', 'MerchantList'].includes(x.kind)), (recs, a) => applyShops(recs, a.shops, {updateExisting: true}), 'Shops');
    for (const file of plan.set.specialistFiles) {
      const rows = external.filter(x => x.specialist === file.kind && x.filename === file.filename);
      if (!rows.length) continue;
      say('modules', `Handing ${rows.length} record${rows.length === 1 ? '' : 's'} to ${file.filename}…`, finished, total);
      await ensure();
      const res = await guard(applySpecialist(file.kind, file.payload, apis.specialist?.(file.kind) ?? null, {ids: rows.map(x => x.id), updateExisting: true, overwriteEdited: Boolean(plan.overwriteEdited)}));
      for (const x of res) { log.push(x); finished++; }
      say('modules', file.filename, finished, total);
    }
    const externalById = new Map(external.map(e => [e.id, e]));
    const LEDGER_KINDS = new Set(['Location', 'Route', 'Shop', 'Service', 'MerchantList', 'Quest', 'Skill Tree', 'Facility', 'Faction', 'Deity', 'Strain config']);
    for (const x of log) if (x.status === 'ok' && ['create', 'update'].includes(x.action) && LEDGER_KINDS.has(x.kind)) {
      const row = externalById.get(x.id);
      if (row) ledgerAdds.push({key: row.specialist ? ledgerKey(null, row.specialist) : ledgerKey(row.line), id: row.id, info: {kind: row.kind, module: row.module, name: row.name, ...(row.fp ? {fp: row.fp} : {}), ...(adapter.heldFingerprint?.(row) ? {held: adapter.heldFingerprint(row)} : {})}});
    }
    if (ledgerAdds.length) await guard(adapter.saveLedger?.(ledgerAdds));
  }
  if (signal?.aborted) return result(plan, log, true);

  // Deletes: only when every earlier step worked, the id is retired first, and each document is checked again as it goes.
  const failedBefore = log.filter(x => x.status === 'error').length;
  if (deletes.length && failedBefore) {
    log.push({action: 'delete', status: 'skipped', message: `${deletes.length} deletion(s) were not run because ${failedBefore} earlier step(s) failed. Fix the errors and run the same sync again.`});
  } else if (deletes.length) {
    await ensure();
    await guard(adapter.retire(deletes.map(d => d.id))); // written before any delete, so a re-run still treats the id as retired
    r = await chunked(deletes, chunk, signal, async row => {
      try {
        // Data-layer guard: an id a package record supersedes is never deleted by Sync, whatever the plan said.
        if (plan.set?.supersedes?.has(row.id)) throw new Error(`${row.id} is superseded by ${plan.set.supersedes.get(row.id)}; Sync does not delete it.`);
        await removeDoc(row.snap?.doc ?? adapter.docFor(row), row, {user}); ok(row, 'delete');
      } catch (e) { fail(row, 'delete', e); }
      mark('delete', row.name)();
    }, adapter.pause, null, co);
    if (r.cancelled) return result(plan, log, true);
  }
  return result(plan, log, false);
}
const groupBy = (list, keyOf) => { const m = new Map(); for (const x of list) { const k = keyOf(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); } return m; };

function result(plan, log, cancelled) {
  const n = (action, status = 'ok') => log.filter(x => x.action === action && x.status === status && !x.metadataOnly).length;
  const counts = {rebound: n('rebind'), created: n('create'), recreated: n('recreate'), updated: log.filter(x => x.action === 'update' && x.status === 'ok' && !x.metadataOnly).length, metadataRefreshed: log.filter(x => x.metadataOnly && x.status === 'ok').length,
    deleted: n('delete'), failed: log.filter(x => x.status === 'error').length, skipped: log.filter(x => x.status === 'skipped').length};
  return {cancelled, log, counts, completed: !cancelled && !counts.failed && !counts.skipped};
}

