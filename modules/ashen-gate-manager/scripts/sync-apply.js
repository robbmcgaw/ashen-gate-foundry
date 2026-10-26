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
    if (updates.length) await doc.updateEmbeddedDocuments('Item', updates);
    if (create.length) await doc.createEmbeddedDocuments('Item', structuredClone(create));
    if (del.length) await doc.deleteEmbeddedDocuments('Item', del);
  } else if (kind === 'Item' && ops.effects) {
    const {create = [], update = [], delete: del = []} = ops.effects;
    if (create.length) await doc.createEmbeddedDocuments('ActiveEffect', structuredClone(create));
    if (update.length) await doc.updateEmbeddedDocuments('ActiveEffect', update.map(({changed, ...u}) => u));
    if (del.length) await doc.deleteEmbeddedDocuments('ActiveEffect', del);
  } else if (kind === 'JournalEntry' && ops.pages) {
    const {create = [], update = [], delete: del = []} = ops.pages;
    if (create.length) await doc.createEmbeddedDocuments('JournalEntryPage', structuredClone(create));
    if (update.length) await doc.updateEmbeddedDocuments('JournalEntryPage', update.map(({key, ...u}) => u));
    if (del.length) await doc.deleteEmbeddedDocuments('JournalEntryPage', del);
  } else if (kind === 'RollTable' && ops.results) {
    // New results first, then the old ones: an interrupted run leaves extras that the next run replaces, never an empty table.
    if (ops.results.create.length) await doc.createEmbeddedDocuments('TableResult', structuredClone(ops.results.create));
    if (ops.results.deleteIds.length) await doc.deleteEmbeddedDocuments('TableResult', ops.results.deleteIds);
  }
  const update = {...fields, ...extra, [`flags.${MODULE_ID}.source`]: flag};
  if (kind === 'Actor') update[`flags.${MODULE_ID}.${ACTOR_ITEMS_FLAG}`] = {version: 1};
  await doc.update(update);
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
export async function stampDoc(doc, record) {
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
  await doc.update({[`flags.${MODULE_ID}.source.${MEMO_KEY}`]: JSON.stringify(memo)});
}
function nameKeysOf(names) { const seen = new Map(); return names.map(n => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c === 1 ? n : `${n}#${c}`; }); }

/** Removes one Manager-imported world document. Copies on character sheets are separate documents and are not touched. */
export async function removeDoc(doc, row, {user}) {
  assertSyncTarget(doc, user, row.id, {deleting: true});
  await doc.delete();
}

// ---------- backup ----------
/**
 * The JSON backup downloaded before anything is written: the complete data of every document that will be overwritten
 * or deleted (same shape as Manager's other snapshots, so Import history reads it), plus the records the other modules'
 * public exports hold. The package files themselves are what a rebuild needs for created records.
 */
export function buildSyncBackup(plan, {world = null, now = new Date(), modules = null} = {}) {
  const rows = plan.rows.filter(r => ['overwrite', 'delete', 'rebind'].includes(r.group) && r.snap);
  return {
    schema_version: 'ag-foundry-snapshot/0.3', created_at: now.toISOString(), reason: 'before-sync-from-package', world_id: world?.id ?? null,
    sync: {phrase: SYNC_PHRASE, counts: plan.counts, lines: plan.scope.lines, files: plan.scope.files},
    documents: rows.map(r => ({document_type: r.snap.documentName, uuid: r.snap.uuid, document_id: r.snap.id, source_id: r.id, sync_action: r.group, raw: r.snap.raw})),
    module_records: plan.rows.filter(r => r.external && r.group === 'overwrite').map(r => ({id: r.id, kind: r.kind, module: r.module})),
    module_exports: modules ?? null
  };
}

// ---------- the run ----------
const chunked = async (list, size, signal, run, pause, progress) => {
  let done = 0;
  for (let i = 0; i < list.length; i += size) {
    if (signal?.aborted) return {cancelled: true, done};
    for (const item of list.slice(i, i + size)) { await run(item); done++; }
    progress?.(done);
    await pause?.();
  }
  return {cancelled: Boolean(signal?.aborted && done < list.length), done};
};

/**
 * Runs a previewed plan. `adapter` supplies the Foundry-specific parts:
 *   [extraUpdate(doc, row) → fields written with the document, e.g. the ownership rule], backup(plan), uploadArt(rows), replan() → plan, create(row) → doc, docFor(row) → doc, buildFlag(row) → flag,
 *   bindLinks(rows, log), apis → {locations, routes, shops, specialist(kind)}, retire(ids), saveLedger(entries), pause()
 * Returns {cancelled, log, counts, completed}. The log's counts equal the preview's when nothing fails.
 */
export async function executeSync(plan, adapter, {user, confirmation, signal, onProgress, chunk = 20} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can run Sync from package.');
  if (!phraseOk(confirmation)) throw new Error(`Type "${SYNC_PHRASE}" to confirm.`);
  if (!plan?.ok) throw new Error('This sync has errors; fix them and preview again. Nothing was changed.');
  const log = [], say = (phase, label, done, total) => onProgress?.({phase, label, done, total});
  const ok = (row, action, extra = {}) => log.push({id: row.id, kind: row.kind, action, status: 'ok', ...extra});
  const fail = (row, action, error) => log.push({id: row.id, kind: row.kind, action, status: 'error', message: String(error?.message ?? error)});
  const creates = plan.rows.filter(r => r.group === 'create' && !r.external);
  const overwrites = plan.rows.filter(r => r.group === 'overwrite' && !r.external);
  const rebinds = plan.rows.filter(r => r.group === 'rebind');
  const specialistSupersedes = (plan.specialistSupersedes ?? []).filter(x => x.pending !== 0);
  const external = plan.rows.filter(r => r.external && ['create', 'overwrite'].includes(r.group));
  const deletes = plan.rows.filter(r => r.group === 'delete');
  const total = rebinds.length + creates.length + overwrites.length + external.length + deletes.length;
  let finished = 0;
  const tick = (phase, label) => () => say(phase, label, ++finished, total);

  say('backup', 'Downloading the backup of everything that will change…', 0, total);
  await adapter.backup(plan); // throws → nothing has been written
  if (signal?.aborted) return {cancelled: true, log, completed: 0};
  say('check', 'Checking the world has not changed since the preview…', 0, total);
  const fresh = await adapter.replan();
  if (fresh.fingerprint !== plan.fingerprint) throw new Error('The world or the files changed since the preview. Preview again; nothing was changed.');
  if (adapter.uploadArt) await adapter.uploadArt([...rebinds, ...creates, ...overwrites]);

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
  }, adapter.pause);
  if (r.cancelled) return result(plan, log, true);
  const reboundOk = rebinds.filter(row => log.some(l => l.id === row.id && l.action === 'rebind' && l.status === 'ok'));
  if (reboundOk.length && adapter.afterRebind) {
    try { for (const entry of await adapter.afterRebind(Object.fromEntries(reboundOk.map(row => [row.supersedes.oldId, row.id])), reboundOk)) log.push(entry); }
    catch (e) { log.push({action: 'supersede-ids', status: 'error', id: '—', message: String(e?.message ?? e)}); }
  }
  if (specialistSupersedes.length && adapter.supersedeSpecialist && !signal?.aborted) {
    for (const sp of specialistSupersedes) {
      try { for (const entry of await adapter.supersedeSpecialist(sp)) log.push(entry); }
      catch (e) { log.push({action: 'supersede-ids', status: 'error', id: sp.filename, message: String(e?.message ?? e)}); }
    }
  }
  r = await chunked(creates, chunk, signal, async row => {
    try { const doc = await adapter.create(row); if (!doc) throw new Error('Foundry did not return a saved document.'); touched.push(row); ok(row, 'create', {uuid: doc.uuid}); } catch (e) { fail(row, 'create', e); }
    mark('create', row.name)();
  }, adapter.pause);
  if (r.cancelled) return result(plan, log, true);
  r = await chunked(overwrites, chunk, signal, async row => {
    try { await writeOverwrite(row.snap?.doc ?? adapter.docFor(row), row, {user, flag: adapter.buildFlag(row), replaceArt: Boolean(plan.replaceArt), extra: adapter.extraUpdate?.(row.snap?.doc ?? adapter.docFor(row), row) ?? {}}); touched.push(row); ok(row, 'update', row.metadataOnly ? {metadataOnly: true} : {}); } catch (e) { fail(row, 'update', e); }
    mark('overwrite', row.name)();
  }, adapter.pause);
  if (r.cancelled) return result(plan, log, true);

  say('links', 'Binding links between records…', finished, total);
  try { await adapter.bindLinks(touched.filter(t => log.some(l => l.id === t.id && l.status === 'ok')), log); } catch (e) { log.push({action: 'link-sync', status: 'error', message: String(e?.message ?? e)}); }
  for (const row of touched) {
    if (!log.some(l => l.id === row.id && l.status === 'ok' && l.action !== 'link-sync')) continue;
    try { await stampDoc(adapter.docFor(row), row.record); } catch (e) { log.push({id: row.id, kind: row.kind, action: 'stamp', status: 'error', message: String(e?.message ?? e)}); }
  }

  // Other modules' records: their own import APIs, update mode, in dependency order (locations, routes, shops, specialist files).
  const apis = adapter.apis ?? {};
  const pass = async (rows, runner, kind) => {
    if (!rows.length) return;
    const results = await runner(rows.map(x => x.record), apis);
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
      const res = await applySpecialist(file.kind, file.payload, apis.specialist?.(file.kind) ?? null, {ids: rows.map(x => x.id), updateExisting: true, overwriteEdited: Boolean(plan.overwriteEdited)});
      for (const x of res) { log.push(x); finished++; }
      say('modules', file.filename, finished, total);
    }
    for (const x of log) if (x.status === 'ok' && ['create', 'update'].includes(x.action) && ['Location', 'Route', 'Shop', 'Service', 'MerchantList', 'Quest', 'Skill Tree', 'Facility', 'Faction', 'Deity', 'Strain config'].includes(x.kind)) {
      const row = external.find(e => e.id === x.id);
      if (row) ledgerAdds.push({key: row.specialist ? ledgerKey(null, row.specialist) : ledgerKey(row.line), id: row.id, info: {kind: row.kind, module: row.module, name: row.name}});
    }
    if (ledgerAdds.length) await adapter.saveLedger?.(ledgerAdds);
  }
  if (signal?.aborted) return result(plan, log, true);

  // Deletes: only when every earlier step worked, the id is retired first, and each document is checked again as it goes.
  const failedBefore = log.filter(x => x.status === 'error').length;
  if (deletes.length && failedBefore) {
    log.push({action: 'delete', status: 'skipped', message: `${deletes.length} deletion(s) were not run because ${failedBefore} earlier step(s) failed. Fix the errors and run the same sync again.`});
  } else if (deletes.length) {
    await adapter.retire(deletes.map(d => d.id)); // written before any delete, so a re-run still treats the id as retired
    r = await chunked(deletes, chunk, signal, async row => {
      try {
        // Data-layer guard: an id a package record supersedes is never deleted by Sync, whatever the plan said.
        if (plan.set?.supersedes?.has(row.id)) throw new Error(`${row.id} is superseded by ${plan.set.supersedes.get(row.id)}; Sync does not delete it.`);
        await removeDoc(row.snap?.doc ?? adapter.docFor(row), row, {user}); ok(row, 'delete');
      } catch (e) { fail(row, 'delete', e); }
      mark('delete', row.name)();
    }, adapter.pause);
    if (r.cancelled) return result(plan, log, true);
  }
  return result(plan, log, false);
}

function result(plan, log, cancelled) {
  const n = (action, status = 'ok') => log.filter(x => x.action === action && x.status === status && !x.metadataOnly).length;
  const counts = {rebound: n('rebind'), created: n('create'), updated: log.filter(x => x.action === 'update' && x.status === 'ok' && !x.metadataOnly).length, metadataRefreshed: log.filter(x => x.metadataOnly && x.status === 'ok').length,
    deleted: n('delete'), failed: log.filter(x => x.status === 'error').length, skipped: log.filter(x => x.status === 'skipped').length};
  return {cancelled, log, counts, completed: !cancelled && !counts.failed && !counts.skipped};
}

