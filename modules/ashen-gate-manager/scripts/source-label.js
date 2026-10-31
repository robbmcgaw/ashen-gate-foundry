/**
 * Ashen Gate source label (0.91.0). Every Item Manager creates from an Ashen Gate record carries the dnd5e custom source label
 * "Ashen Gate" (Item sheet > Configure Source > Custom Label = system.source.custom, shown in the sheet header).
 *
 *  - Fill only when empty. A value the GM typed (or the package wrote) is never replaced, and the label is never cleared.
 *  - Applies to Items Manager creates (import, Sync create, recreate), to Items a re-import or Sync overwrite writes, and to the
 *    Items it creates on an Actor. Other documents are never touched.
 *  - The label is NOT part of the managed baseline (that comes from the record), so Sync never reads it as a package change or a GM edit.
 *  - Pure logic with the Foundry calls injected, so the Node suite covers it.
 */
export const SOURCE_LABEL = 'Ashen Gate';
export const SOURCE_PATH = 'system.source.custom';
export const CHUNK = 50;

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isBlank = v => v === undefined || v === null || String(v).trim() === '';
/** The label on an Item document or plain Item data (reads `system.source.custom`, else the document's own accessor). */
export function customOf(docOrData) {
  const direct = docOrData?.system?.source?.custom;
  if (direct !== undefined) return direct;
  try { return docOrData?.toObject?.()?.system?.source?.custom ?? docOrData?.get?.(SOURCE_PATH); } catch { return undefined; }
}

/** Item creation data with the label filled in when `system.source.custom` is empty. Returns a copy; the input is not changed. */
export function withSourceLabel(data) {
  const out = {...(data ?? {})};
  const system = isObject(out.system) ? {...out.system} : {};
  const source = isObject(system.source) ? {...system.source} : {};
  if (isBlank(source.custom)) source.custom = SOURCE_LABEL;
  system.source = source;
  out.system = system;
  return out;
}

/**
 * Flat update fields (as Sync / re-import write them) with the label added when the write would leave it empty: the package field
 * wins when it has text; an empty package field, or none at all, gets the label only if the live value is empty too.
 * Documents that are not world Items (embedded, other types) get the fields back unchanged.
 */
export function withSourceLabelFields(doc, fields) {
  if (doc?.documentName !== 'Item' || doc.parent) return fields;
  const out = {...(fields ?? {})};
  if (SOURCE_PATH in out) { if (isBlank(out[SOURCE_PATH])) out[SOURCE_PATH] = SOURCE_LABEL; return out; }
  if (isObject(out['system.source'])) {
    if (isBlank(out['system.source'].custom) && isBlank(customOf(doc))) out['system.source'] = {...out['system.source'], custom: SOURCE_LABEL};
    return out;
  }
  if (isBlank(customOf(doc))) out[SOURCE_PATH] = SOURCE_LABEL;
  return out;
}

/**
 * Core Links adopt: the `system` to write. The core item's system replaces the world Item's, but a label the world Item already has is
 * kept (never blanked); a world Item with none gets the Ashen Gate label unless the core item brings one. Returns a copy.
 */
export function adoptedSystem(worldSystem, coreSystem) {
  const out = structuredClone(coreSystem ?? {});
  const kept = worldSystem?.source?.custom;
  const source = isObject(out.source) ? {...out.source} : {};
  if (!isBlank(kept)) source.custom = kept;
  else if (isBlank(source.custom)) source.custom = SOURCE_LABEL;
  out.source = source;
  return out;
}

const isManagerItem = (doc, sourceOf) => doc?.documentName === 'Item' && !doc.parent && Boolean(sourceOf(doc)?.sourceId);

/** Preview: {total (will change), alreadyLabelled, items (Manager-imported Items looked at), targets}. Nothing is written. */
export function planSourceLabel(docs, sourceOf, {user} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can set the source label on Items.');
  const targets = [];
  let items = 0, alreadyLabelled = 0;
  for (const doc of docs ?? []) {
    if (!isManagerItem(doc, sourceOf)) continue;
    items++;
    if (isBlank(customOf(doc))) targets.push(doc); else alreadyLabelled++;
  }
  return {total: targets.length, alreadyLabelled, items, targets};
}

/** One-line result text, used by the confirmation and the status line. */
export function sourceLabelSummary(r, {done = false} = {}) {
  return `${done ? 'Labelled' : 'To label'}: ${r.changed ?? r.total}, already labelled (kept as they are): ${r.alreadyLabelled}.`;
}

/** The update for one Item: the label only. */
export const sourceLabelUpdate = doc => ({_id: doc.id, [SOURCE_PATH]: SOURCE_LABEL});

/** Applies a preview. Each Item is re-checked first (one that got a label since the preview is left alone). */
export async function applySourceLabel(plan, {user, sourceOf, write, onProgress = () => {}, signal = null, yieldToUI = () => new Promise(r => setTimeout(r, 0))} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can set the source label on Items.');
  const live = plan.targets.filter(doc => isManagerItem(doc, sourceOf) && isBlank(customOf(doc)));
  const changedSincePreview = plan.targets.length - live.length;
  let changed = 0, cancelled = false;
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    const part = live.slice(n, n + CHUNK);
    await write(part.map(sourceLabelUpdate));
    changed += part.length;
    onProgress({done: changed, total: live.length});
    await yieldToUI();
  }
  const out = {ok: true, changed, alreadyLabelled: plan.alreadyLabelled, changedSincePreview, cancelled};
  const tail = changedSincePreview ? ` ${changedSincePreview} got a label since the preview and were left alone.` : '';
  out.message = (cancelled ? `Stopped after ${changed} of ${live.length}. ` : '') + (changed || cancelled ? sourceLabelSummary(out, {done: true}) : `Nothing to change. ${sourceLabelSummary(out, {done: true})}`) + tail;
  return out;
}
