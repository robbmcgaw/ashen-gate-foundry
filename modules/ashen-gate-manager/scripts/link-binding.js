/**
 * Binding links between records (shared by Import and Sync from package). Until 0.70.1 this ran inside main.js and, for every
 * record, scanned every Manager document in the world (foundDocuments), rebuilt the set of ids, searched the package's record
 * list and awaited one or two document updates: quadratic, and silent while it ran. This version:
 *   - builds every lookup ONCE per run (documents by permanent id, the UUID index, records by id, visibility by id);
 *   - works in chunks (default 50 records): compute the chunk, then write it with one updateDocuments per document type, one
 *     embedded update per Actor (its Items) and one per Journal (its pages), always with render:false;
 *   - skips a write whose values the document already holds (a re-run after a cancel changes nothing that is already done);
 *   - reports each chunk and sub-step through onStep, checks `signal` between chunks, yields to the browser between chunks;
 *   - never loses an error: a failed batch is retried one document at a time so the error names the record.
 * Pure of Foundry globals: `world` supplies the Foundry-specific parts, so the Node suite drives it with in-memory documents.
 *   world: {moduleId, documents() → every Manager-bound document, sourceFlag(doc), moduleRecord(id), updateDocuments(documentName, updates, opts), itemFlag}
 */
import {buildUuidIndex, resolveRichText, resolveTypedRefs, stripReferenceBlock, resolveRefCells} from './import-fidelity.js';
import {projectedReferences} from './contract.js';
import {relatedFor, withRelated} from './related-lists.mjs';
import {itemKeys} from './actor-update.js';
import {activityEffectRefs, resolveActivityEffects, unknownEffectWarning} from './activity-effects.js';
import {isInterruption as isStop} from './sync-connection.js';

export const REPEAT_STOP = 25;     // this many identical failures in a row end the step (a systematic fault, not bad records)
class RepeatedFailure extends Error { constructor(message, count) { super(message); this.count = count; } }
export const BIND_CHUNK = 25;
export const WRITE_UNIT = 10;      // documents per request, so progress moves inside a chunk
export const SLOW_CHUNK_MS = 20000; // a chunk slower than this halves the chunk size
import {bulkWrite} from './bulk.js';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const pathGet = (o, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], o);
const msg = e => String(e?.message ?? e);

export async function bindPackageLinks({records, rows, log, plans = new Map(), world, signal = null, onStep = () => {}, chunk = BIND_CHUNK, pause = null, guard = p => p}) {
  const {moduleId: MODULE_ID, itemFlag: ITEM_FLAG} = world;
  const step = (name, stepDone, stepTotal, who) => onStep({step: name, stepDone, stepTotal, name: who});
  // ---- once per run ----
  step('Reading the world', 0, 0);
  const docs = world.documents();
  const flags = new Map(), byId = new Map();
  const flagOf = doc => { if (!flags.has(doc)) flags.set(doc, world.sourceFlag(doc) ?? null); return flags.get(doc); };
  // Chunked with a yield, so even a big world draws a progress tick before and between slices (no long silent pass).
  for (let i = 0; i < docs.length; i += 200) {
    if (signal?.aborted) return {cancelled: true, done: 0, total: 0};
    step('Reading the world', i, docs.length);
    for (const doc of docs.slice(i, i + 200)) { const id = flagOf(doc)?.sourceId; if (id) (byId.get(id) ?? byId.set(id, []).get(id)).push(doc); }
    await pause?.();
  }
  const uuidIndex = buildUuidIndex(docs);
  const currentIds = new Set(uuidIndex.keys());
  const moduleRecord = world.moduleRecord ?? (() => null);
  const recordsById = new Map(records.map(r => [r.id, r]));
  const writtenOk = new Set(log.results.filter(r => ['create', 'update', 'metadata', 'rebind'].includes(r.action) && r.status === 'ok').map(r => r.id));
  const todo = rows.filter(r => writtenOk.has(r.id));
  const rep = {message: null, count: 0};
  const seen = new Set();
  const failed = (message, error, name) => {
    if (error && !seen.has(message)) { seen.add(message); console.error(`[${MODULE_ID}] Binding links: first failure of this kind on "${name}"`, error); }
    rep.count = message === rep.message ? rep.count + 1 : 1; rep.message = message; if (rep.count >= REPEAT_STOP) throw new RepeatedFailure(message, rep.count); };
  const succeeded = () => { rep.count = 0; rep.message = null; };
  const issue = (row, name, extra) => log.results.push({id: row.id, name, ...extra});

  // ---- one record: compute what to write (no awaits) ----
  const compute = row => {
    const record = recordsById.get(row.id), doc = byId.get(row.id)?.[0];
    if (!record || !doc) return null;
    const name = doc.name ?? record.name ?? row.id;
    const fresh = row.action === 'create' || row.action === 'rebind';
    const {bindings, issues, moduleLinks} = resolveTypedRefs(record.refs, uuidIndex, [], moduleRecord);
    for (const i of issues) issue(row, name, {action: 'link-sync', status: i.level === 'error' ? 'error' : i.level === 'info' ? 'note' : 'warning', message: i.message});
    if (moduleLinks.length) issue(row, name, {action: 'link-sync', status: 'note', message: `Linked by permanent id to ${moduleLinks.map(l => `${l.module} record ${l.target_id}`).join(', ')}.`});
    const updates = {}, work = {row, doc, name, record, updates, items: [], pages: [], after: [], bindings};
    const missingRequired = issues.filter(i => i.level === 'error').map(i => i.id);
    const source = flagOf(doc) ?? {};
    updates[`flags.${MODULE_ID}.source.refs`] = projectedReferences(record.refs, currentIds);
    const newFields = {...(source.managedFields ?? {})};
    updates[`flags.${MODULE_ID}.source.resolvedUuidRefs`] = bindings;
    updates[`flags.${MODULE_ID}.source.unresolvedRequiredRefs`] = missingRequired;
    updates[`flags.${MODULE_ID}.source.unresolvedOptionalRefs`] = issues.filter(i => i.level === 'warning' || i.level === 'info').map(i => i.id);
    const hostVisibility = record.visibility;
    // 0.60.3 related-record cells; the target's name and visibility come from the maps built once above.
    const refCells = text => stripReferenceBlock(resolveRefCells(text, bindings, {
      nameOf: id => uuidIndex.get(id)?.[0]?.name ?? '',
      canLink: id => hostVisibility === 'gm' || flagOf(byId.get(id)?.[0] ?? {})?.visibility === 'player'}));
    if (doc.documentName === 'Item') {
      const original = record.foundry.data?.system?.description?.value;
      if (typeof original === 'string') {
        const linked = resolveRichText(original, uuidIndex);
        const final = withRelated(refCells(linked.text), relatedFor(record));
        for (const i of linked.issues) issue(row, name, {action: 'rich-text-link', status: 'error', message: i.message});
        const live = doc.system?.description?.value, baseline = source.managedFields?.['system.description.value'];
        if (fresh || live === final || live === baseline) {
          if (live !== final) updates['system.description.value'] = final;
          newFields['system.description.value'] = final;
        }
        issue(row, name, {action: 'rich-text-link', status: 'ok', resolved: linked.resolved.length});
      }
      // 0.71.0: activities name their effects by eff_id; point each at the live effect's _id (re-resolved every run, so random ids are fine).
      const system = record.foundry.data?.system;
      if (activityEffectRefs(system).length) {
        const live = (doc.effects?.contents ?? [...(doc.effects ?? [])]).map(e => e?.toObject?.() ?? e);
        const r = resolveActivityEffects(system, live, doc._source?.system ?? doc.system ?? null);
        Object.assign(updates, r.updates);
        const warning = unknownEffectWarning(name, r.unknown);
        if (warning) issue(row, name, {action: 'activity-effect', status: 'warning', message: warning});
      }
    } else if (doc.documentName === 'Actor') {
      const created = fresh, touched = new Set(plans.get(row.id)?.patch?.touched ?? []);
      const defs = record.foundry.data?.items ?? [], keys = itemKeys(defs);
      const bio = record.foundry.data?.system?.details?.biography?.value;
      if (created && typeof bio === 'string') {
        const resolved = resolveRichText(bio, uuidIndex);
        updates['system.details.biography.value'] = refCells(resolved.text);
        for (const i of resolved.issues) issue(row, name, {action: 'actor-bio-link', status: 'error', message: i.message});
      }
      let embeddedByKey = null;
      for (const [i, sourceItem] of defs.entries()) {
        if (!created && !touched.has(keys[i])) continue;
        const html = sourceItem.system?.description?.value;
        if (typeof html !== 'string') continue;
        embeddedByKey ??= new Map((doc.items?.contents ?? []).map(it => [it.getFlag?.(MODULE_ID, ITEM_FLAG), it]));
        const embedded = embeddedByKey.get(keys[i]);
        if (!embedded) continue;
        const resolved = resolveRichText(html, uuidIndex);
        for (const x of resolved.issues) issue(row, name, {action: 'actor-item-link', status: 'error', message: x.message});
        if (embedded.system?.description?.value !== resolved.text) work.items.push({embedded, update: {_id: embedded.id, 'system.description.value': resolved.text}});
      }
    } else if (doc.documentName === 'RollTable') {
      const text = record.foundry.data?.description;
      if (typeof text === 'string') {
        const resolved = resolveRichText(text, uuidIndex);
        updates.description = refCells(resolved.text);
        for (const i of resolved.issues) issue(row, name, {action: 'table-link', status: 'error', message: i.message});
      }
    } else if (doc.documentName === 'JournalEntry') {
      const pages = record.foundry.data?.pages ?? [], live = doc.pages?.contents ?? [];
      for (const [pi, pageDef] of pages.entries()) {
        const named = live.filter(p => p.name === pageDef.name), page = named.length === 1 ? named[0] : live[pi];
        if (!page || typeof pageDef.text?.content !== 'string') continue;
        const linked = resolveRichText(pageDef.text.content, uuidIndex);
        const final = refCells(linked.text);
        for (const i of linked.issues) issue(row, name, {action: 'rich-text-link', status: 'error', message: i.message});
        if (page.text?.content !== final && (fresh || stripReferenceBlock(page.text?.content) === final || page.text?.content === undefined)) work.pages.push({page, update: {_id: page.id, 'text.content': final}});
        else work.after.push(() => issue(row, name, {action: 'rich-text-link', status: 'ok', page: page.name, resolved: linked.resolved.length}));
      }
    }
    updates[`flags.${MODULE_ID}.source.managedFields`] = newFields;
    return work;
  };

  // ---- a chunk: embedded first, then the documents themselves ----
  const flush = async (works, report = () => {}) => {
    const group = (list, keyOf) => { const m = new Map(); for (const x of list) (m.get(keyOf(x)) ?? m.set(keyOf(x), []).get(keyOf(x))).push(x); return m; };
    for (const w of works) {
      if (w.items.length) {
        try { await guard(w.doc.updateEmbeddedDocuments('Item', w.items.map(x => x.update), bulkWrite())); }
        catch (batchError) {
          if (isStop(batchError)) throw batchError;
          for (const x of w.items) try { await guard(x.embedded.update({'system.description.value': x.update['system.description.value']}, bulkWrite())); }
          catch (e) { if (isStop(e)) throw e; issue(w.row, w.name, {action: 'actor-item-link', status: 'error', message: `${x.embedded.name ?? 'Item'}: ${msg(e)}`}); }
        }
      }
      if (w.pages.length) {
        try {
          await guard(w.doc.updateEmbeddedDocuments('JournalEntryPage', w.pages.map(x => x.update), bulkWrite()));
          for (const x of w.pages) issue(w.row, w.name, {action: 'rich-text-link', status: 'ok', page: x.page.name});
        } catch (batchError) {
          if (isStop(batchError)) throw batchError;
          for (const x of w.pages) try { await guard(x.page.update({'text.content': x.update['text.content']}, bulkWrite())); issue(w.row, w.name, {action: 'rich-text-link', status: 'ok', page: x.page.name}); }
          catch (e) { if (isStop(e)) throw e; issue(w.row, w.name, {action: 'rich-text-link', status: 'error', message: `Page ${x.page.name}: ${msg(e)}`}); }
        }
      }
      for (const f of w.after) f();
    }
    // Only what actually differs is written, so a re-run after a cancel writes nothing that is already done.
    const pending = works.map(w => ({w, changed: Object.fromEntries(Object.entries(w.updates).filter(([path, value]) => !same(pathGet(w.doc._source ?? w.doc, path), value)))}));
    const needed = pending.filter(p => Object.keys(p.changed).length);
    for (const [documentName, list] of group(needed, p => p.w.doc.documentName)) {
      const done = ok => { for (const p of ok) if (p.w.bindings.length) issue(p.w.row, p.w.name, {action: 'uuid-bind', status: 'ok', bindings: p.w.bindings.length}); };
      for (let u = 0; u < list.length; u += WRITE_UNIT) {
        const unit = list.slice(u, u + WRITE_UNIT);
        report(unit[0].w.name, u);
        try {
          await guard(world.updateDocuments(documentName, unit.map(p => ({_id: p.w.doc.id, ...p.changed})), bulkWrite()));
          done(unit); succeeded();
        } catch (batchError) {
          if (isStop(batchError)) throw batchError;
          for (const p of unit) try { await guard(p.w.doc.update(p.changed, bulkWrite())); done([p]); succeeded(); }
          catch (e) { if (isStop(e)) throw e; issue(p.w.row, p.w.name, {action: 'link-sync', status: 'error', message: `UUID binding update failed: ${msg(e)}`}); failed(msg(e), e, p.w.name); }
        }
        await pause?.();
      }
    }
    for (const p of pending) if (!Object.keys(p.changed).length && p.w.bindings.length) issue(p.w.row, p.w.name, {action: 'uuid-bind', status: 'ok', bindings: p.w.bindings.length});
  };

  // ---- the run ----
  const total = todo.length;
  let done = 0;
  const timer = world.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
  for (let i = 0; i < total;) {
    if (signal?.aborted) return {cancelled: true, done, total};
    const started = timer();
    const part = todo.slice(i, i + chunk);
    const lead = byId.get(part[0].id)?.[0]?.name ?? part[0].id;
    step('Binding links', done, total, lead);
    const works = [];
    for (const row of part) {
      try { const w = compute(row); if (w) works.push(w); }
      catch (e) {
        console.warn(`[${MODULE_ID}] Binding links failed for ${byId.get(row.id)?.[0]?.name ?? row.id}`, e);
        log.results.push({id: row.id, name: byId.get(row.id)?.[0]?.name ?? row.id, action: 'link-sync', status: 'error', message: msg(e)});
      }
    }
    step('Saving links', done, total, lead);
    try { await flush(works, (who, offset) => step('Saving links', Math.min(total, done + offset), total, who)); }
    catch (e) { if (e instanceof RepeatedFailure) return {cancelled: false, done, total, stopped: {message: e.message, count: e.count}}; throw e; }
    done += part.length;
    i += part.length;
    const took = timer() - started;
    console.info(`[${MODULE_ID}] Binding links: ${done} of ${total} (chunk of ${part.length} in ${Math.round(took)} ms)`);
    // Low impact: a slow chunk (a busy server or many open windows) halves the next ones, never below 5.
    if (took > SLOW_CHUNK_MS && chunk > 5) { chunk = Math.max(5, Math.floor(chunk / 2)); console.warn(`[${MODULE_ID}] Binding links is slow here (${Math.round(took / 1000)} s for a chunk); using chunks of ${chunk}`); }
    step('Binding links', done, total, '');
    await pause?.();
  }
  return {cancelled: false, done, total};
}
