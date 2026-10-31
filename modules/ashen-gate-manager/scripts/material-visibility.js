/**
 * Make materials visible to players (0.89.0). A GM-only, re-runnable maintenance action for Material Items already in the world.
 * Pure logic with the Foundry calls injected, so the Node suite covers it.
 *
 *  - Candidates: Manager-bound world Items that are Materials (entity type Material, or a MAT-* id). Nothing else is looked at.
 *  - Changed: approved + `player` visibility, not archived, default ownership exactly None, and not hidden on purpose (the baseline
 *    Manager last set was Observer but the GM lowered the default since). Their `ownership.default` becomes Observer.
 *  - Never lowers anything, never touches a per-user ownership entry, never writes the Material's content. The only other write is
 *    Manager's own bookkeeping flag (the baseline), the same pair every Manager release writes, so a later Sync does not undo the choice
 *    the way it would for a GM who hid the Material on purpose.
 *  - GM only, checked here. Apply re-checks each Item first, so one changed after the preview is skipped; running it again changes nothing.
 */
import {MODULE_ID, BASELINE_FLAG, LEVEL, isMaterialSource} from './release.js';

export const CHUNK = 50;
export const SKIP_REASONS = Object.freeze({
  draft: 'Not approved (draft or retired)',
  gm: 'GM-only or revealed later (visibility is not player)',
  archived: 'Archived',
  onPurpose: 'Hidden on purpose (you lowered it after Manager made it visible)'
});

const isMaterialDoc = (doc, source) => doc?.documentName === 'Item' && Boolean(source?.sourceId) && isMaterialSource(source);
/** 'change' | 'visible' | one of the SKIP_REASONS keys, for a Material Item. Higher-than-Observer defaults count as visible. */
export function materialDecision(doc, source, levels = LEVEL) {
  if (source?.status !== 'approved') return 'draft';
  if (source?.visibility !== 'player') return 'gm';
  if (doc?.flags?.[MODULE_ID]?.lifecycle?.archived) return 'archived';
  if ((doc?.ownership?.default ?? levels.NONE) !== levels.NONE) return 'visible';
  const baseline = doc?.flags?.[MODULE_ID]?.[BASELINE_FLAG];
  if (baseline !== undefined && baseline !== null && baseline !== levels.NONE) return 'onPurpose';
  return 'change';
}
/** The update for one Item: default ownership (a per-user entry is never named) plus Manager's baseline flag. */
export const materialUpdate = (doc, levels = LEVEL) => ({_id: doc.id, 'ownership.default': levels.OBSERVER, [`flags.${MODULE_ID}.${BASELINE_FLAG}`]: levels.OBSERVER});

/** Preview: {total (will change), alreadyVisible, skipped: [{key, label, count}], skippedTotal, materials, targets}. Nothing is written. */
export function planMaterialVisibility(docs, sourceOf, {user, levels = LEVEL} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const targets = [], counts = {};
  let alreadyVisible = 0, materials = 0;
  for (const doc of docs ?? []) {
    const source = sourceOf(doc);
    if (!isMaterialDoc(doc, source)) continue;
    materials++;
    const d = materialDecision(doc, source, levels);
    if (d === 'change') targets.push(doc);
    else if (d === 'visible') alreadyVisible++;
    else counts[d] = (counts[d] ?? 0) + 1;
  }
  const skipped = Object.keys(SKIP_REASONS).filter(k => counts[k]).map(key => ({key, label: SKIP_REASONS[key], count: counts[key]}));
  return {total: targets.length, alreadyVisible, skipped, skippedTotal: skipped.reduce((n, s) => n + s.count, 0), materials, targets};
}

/** One-line result text, used by the confirmation and the status line. */
export function materialSummary(r, {done = false} = {}) {
  const parts = [`${done ? 'Made visible' : 'To make visible'}: ${r.changed ?? r.total}`, `already visible: ${r.alreadyVisible}`,
    `skipped: ${r.skippedTotal}${r.skipped.length ? ` (${r.skipped.map(s => `${s.count} ${s.label.toLowerCase()}`).join('; ')})` : ''}`];
  return `${parts.join(', ')}.`;
}

/** Applies a preview. Returns {ok, changed, alreadyVisible, skipped, skippedTotal, changedSincePreview, cancelled, message}. */
export async function applyMaterialVisibility(plan, {user, sourceOf, write, onProgress = () => {}, signal = null, yieldToUI = () => new Promise(r => setTimeout(r, 0)), levels = LEVEL} = {}) {
  if (!user?.isGM) throw new Error('Only a GM can change who can read Items.');
  const live = plan.targets.filter(doc => materialDecision(doc, sourceOf(doc), levels) === 'change');
  const changedSincePreview = plan.targets.length - live.length;
  let changed = 0, cancelled = false;
  for (let n = 0; n < live.length; n += CHUNK) {
    if (signal?.aborted) { cancelled = true; break; }
    const part = live.slice(n, n + CHUNK);
    await write(part.map(d => materialUpdate(d, levels)));
    changed += part.length;
    onProgress({done: changed, total: live.length});
    await yieldToUI();
  }
  const out = {ok: true, changed, alreadyVisible: plan.alreadyVisible, skipped: plan.skipped, skippedTotal: plan.skippedTotal, changedSincePreview, cancelled};
  const tail = changedSincePreview ? ` ${changedSincePreview} changed since the preview and were left alone.` : '';
  out.message = (cancelled ? `Stopped after ${changed} of ${live.length}. ` : '') + (changed || cancelled ? materialSummary(out, {done: true}) : `Nothing to change. ${materialSummary(out, {done: true})}`) + tail;
  return out;
}
