/**
 * Items → Checks → Improve icons… (0.47.0). Lists world Items and Actors whose icon is a placeholder and offers a
 * smart icon for each; Apply writes in chunks (cancellable) and keeps one-step undo. GM only, checked here.
 * Only placeholder icons are offered: an icon the GM set or a real authored icon is never listed or changed.
 */
import {isPlaceholderIcon, isProtectedIcon, resolveIcon, documentIconInput, iconFlagUpdate, ICON_FLAGS} from './smart-icons.js';

export const ICON_UNDO_SETTING = 'iconUndo';
export const ICON_CHUNK = 50;

const flagsOf = (doc, moduleId) => doc?.flags?.[moduleId] ?? {};
const playerOwned = doc => doc?.documentName === 'Actor' && (doc.type === 'character' || Boolean(doc.hasPlayerOwner));

/**
 * One row per world Item / Actor with a placeholder icon. A row is ticked when there is a suggestion, except player
 * characters (their owners may want to choose). Rows are sorted by kind, then name, then uuid.
 */
export function scanIconDocuments(docs, index) {
  const rows = [];
  for (const doc of docs ?? []) {
    const img = doc?.img;
    if (isProtectedIcon(img) || !isPlaceholderIcon(img)) continue;
    const found = resolveIcon(documentIconInput(doc), index);
    const suggestion = found && found.img !== img ? found : null;
    rows.push({uuid: doc.uuid, id: doc.id, documentName: doc.documentName, name: String(doc.name ?? ''), type: doc.type ?? '',
      from: img ?? '', img: suggestion?.img ?? null, reason: suggestion?.reason ?? 'No fitting icon found; use Change…',
      confidence: suggestion?.confidence ?? 'none', source: suggestion ? 'smart' : null, playerOwned: playerOwned(doc),
      checked: Boolean(suggestion) && !playerOwned(doc)});
  }
  return rows.sort((a, b) => a.documentName.localeCompare(b.documentName) || a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid));
}

const turn = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Writes the ticked rows. deps: {user, moduleId, getDoc(uuid), updateMany(documentName, updates[]), signal, onProgress, yieldTurn}.
 * A document whose icon changed since the scan is skipped. Returns {ok, message, applied, skipped, cancelled, errors};
 * applied holds what undo needs ({uuid, documentName, id, before:{img, source, path}, after}).
 */
export async function applyIconChanges(rows, {user, moduleId, getDoc, updateMany, signal = null, onProgress = () => {}, yieldTurn = turn, chunk = ICON_CHUNK} = {}) {
  if (!user?.isGM) return {ok: false, message: 'Only a GM can change icons.', applied: [], skipped: [], errors: []};
  const applied = [], skipped = [], errors = [];
  const todo = (rows ?? []).filter(r => r?.img && r.uuid);
  let cancelled = false;
  for (let start = 0; start < todo.length; start += chunk) {
    if (signal?.aborted) { cancelled = true; break; }
    const batch = {};
    for (const row of todo.slice(start, start + chunk)) {
      const doc = getDoc(row.uuid);
      if (!doc) { skipped.push({uuid: row.uuid, name: row.name, why: 'no longer in the world'}); continue; }
      if (doc.img !== row.from || !isPlaceholderIcon(doc.img)) { skipped.push({uuid: row.uuid, name: row.name, why: 'its icon changed since the scan'}); continue; }
      const f = flagsOf(doc, moduleId);
      (batch[doc.documentName] ??= []).push({row, doc, before: {img: doc.img ?? null, source: f[ICON_FLAGS.source] ?? null, path: f[ICON_FLAGS.path] ?? null}});
    }
    for (const [documentName, list] of Object.entries(batch)) {
      try {
        await updateMany(documentName, list.map(({row, doc}) => ({_id: doc.id, img: row.img, ...iconFlagUpdate(moduleId, {img: row.img, source: row.source ?? 'authored'})})));
        for (const {row, doc, before} of list) applied.push({uuid: row.uuid, documentName, id: doc.id, name: row.name, before, after: row.img});
      } catch (error) {
        errors.push({documentName, message: String(error?.message ?? error)});
      }
    }
    onProgress({done: Math.min(start + chunk, todo.length), total: todo.length});
    await yieldTurn();
  }
  const message = `${applied.length} icon(s) changed${skipped.length ? `, ${skipped.length} skipped (changed since the scan or gone)` : ''}${errors.length ? `, ${errors.length} write error(s)` : ''}${cancelled ? '; cancelled: the rest were not changed' : ''}.`;
  return {ok: !errors.length || applied.length > 0, message, applied, skipped, errors, cancelled};
}

/** Puts the last run back, only where the icon is still the one Manager wrote. deps as applyIconChanges. */
export async function undoIconChanges(undo, {user, moduleId, getDoc, updateMany, chunk = ICON_CHUNK, yieldTurn = turn} = {}) {
  if (!user?.isGM) return {ok: false, message: 'Only a GM can undo icon changes.', restored: 0, kept: 0};
  const rows = undo?.applied ?? [];
  let restored = 0, kept = 0;
  const errors = [];
  for (let start = 0; start < rows.length; start += chunk) {
    const batch = {};
    for (const r of rows.slice(start, start + chunk)) {
      const doc = getDoc(r.uuid);
      if (!doc || doc.img !== r.after) { kept++; continue; }
      (batch[r.documentName] ??= []).push({_id: doc.id, img: r.before.img,
        [`flags.${moduleId}.${ICON_FLAGS.source}`]: r.before.source, [`flags.${moduleId}.${ICON_FLAGS.path}`]: r.before.path});
    }
    for (const [documentName, updates] of Object.entries(batch)) {
      try { await updateMany(documentName, updates); restored += updates.length; }
      catch (error) { errors.push(String(error?.message ?? error)); }
    }
    await yieldTurn();
  }
  return {ok: !errors.length, restored, kept, message: `${restored} icon(s) put back${kept ? `; ${kept} left alone because they were changed again or are gone` : ''}${errors.length ? `; ${errors.length} write error(s): ${errors[0]}` : ''}.`};
}

/** The JSON backup of the ticked rows' current icons (Download backup). */
export function iconBackup(rows, getDoc, moduleId) {
  return {kind: 'ashen-gate-icon-backup', version: 1, documents: (rows ?? []).filter(r => r?.img).map(r => {
    const doc = getDoc(r.uuid);
    const f = flagsOf(doc, moduleId);
    return {uuid: r.uuid, name: r.name, img: doc?.img ?? r.from ?? null, iconSource: f[ICON_FLAGS.source] ?? null, iconPath: f[ICON_FLAGS.path] ?? null};
  })};
}
