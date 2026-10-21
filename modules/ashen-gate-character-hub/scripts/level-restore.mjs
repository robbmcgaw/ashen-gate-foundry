/**
 * Restore a level backup (0.28.0), GM only. Puts a "<name> - level X" copy's state back onto the live character it
 * was made from (levelBackup.sourceId): dnd5e data (class levels, HP, abilities, everything in `system`), items,
 * effects, and the Ashen Gate flags kept in levelBackup.archivedFlags, each put back on the document its id names.
 *
 *   - Kept from the live character: its id, name, portrait, ownership, prototype token, folder, its `core` flags
 *     (sheet choice), its Journey (Robb: the Journey does not revert) and any level backups still queued for the GM.
 *   - Cinders (Robb: the Cinder records stay the truth): with Ashen Gate | Cinders active, its api.cinder.rehook(actor)
 *     then re-links the restored character to the Cinders the records say it bears (bearer links, Cinder tree
 *     progress, socket markers). It is part of the all-or-nothing restore. The safety copy is inert like every copy
 *     (no live Cinders flags, a new id the records never name), so it never holds a bearer link. Without rehook (no
 *     Cinders, or one older than 0.7.0) the restore still happens and says to run Cinders → Manage → Check.
 *   - First the character as it is now is saved as another backup copy, named by the usual rule (createBackup), so
 *     nothing is lost. If that copy can't be made, nothing is changed.
 *   - All or nothing: if a step fails part-way, the character is put back to how it was just before the restore (the
 *     same steps with the pre-restore snapshot); the safety copy stays either way.
 *   - Each restore has an opId, stored in flags[MODULE_ID].levelRestore with what was restored; the same opId again
 *     does nothing (and the safety copy's opId is derived from it, so it is never made twice).
 *   - Refused for anyone but a GM here, in the data layer (there is no player relay for it). The copy is not changed.
 * Items and effects that exist on both sides are replaced in place (same id), so links to them (quick bar, sockets,
 * effect origins) keep working; ones only the copy has are created with their ids; ones only the live character has
 * are deleted.
 */
import {MODULE_ID} from './constants.mjs';
import {BACKUP_FLAG, QUEUE_FLAG, isBackup, createBackup, FOLDER_PATH} from './level-backup.mjs';
import {JOURNEY_FLAG} from './journey.mjs';
import {CINDERS_ID} from './cinders.mjs';

export const RESTORE_FLAG = 'levelRestore';
const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
const newOpId = () => globalThis.foundry?.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18);
const running = new Set();
const list = c => (c ? [...(c.values?.() ?? c)] : []);
const backupFlag = actor => actor?.flags?.[MODULE_ID]?.[BACKUP_FLAG] ?? null;

/** The backup copies made from this character, newest first. */
export function backupsFor(actor, actors = globalThis.game?.actors ?? []) {
  if (!actor || isBackup(actor)) return [];
  return [...actors].filter(a => backupFlag(a)?.sourceId === actor.id)
    .sort((a, b) => String(backupFlag(b).date ?? '').localeCompare(String(backupFlag(a).date ?? '')) || String(b.name).localeCompare(String(a.name)));
}
/** The live character a copy was made from, or null. */
export const sourceOf = (backup, actors = globalThis.game?.actors) => { const id = backupFlag(backup)?.sourceId; const a = id ? actors?.get?.(id) ?? [...(actors ?? [])].find(x => x.id === id) : null; return a && !isBackup(a) ? a : null; };

/** Puts archived scopes back onto a flags object (a copy of it). */
const withScopes = (flags, scopes) => ({...structuredClone(flags ?? {}), ...structuredClone(scopes ?? {})});

/**
 * The state a restore writes: {system, flags, items, effects} from the copy's toObject(), with archivedFlags put back,
 * the backup marker removed, and the live character's `core` flags and backup queue kept. `record` is stored as
 * flags[MODULE_ID].levelRestore.
 */
export function restoredState(copyData, liveData, record = null) {
  const archived = copyData.flags?.[MODULE_ID]?.[BACKUP_FLAG]?.archivedFlags ?? {};
  const flags = withScopes(copyData.flags, archived.actor);
  const hub = {...(archived.actor?.[MODULE_ID] ?? {})};
  const queue = liveData.flags?.[MODULE_ID]?.[QUEUE_FLAG];
  if (Array.isArray(queue) && queue.length) hub[QUEUE_FLAG] = structuredClone(queue);
  const journey = liveData.flags?.[MODULE_ID]?.[JOURNEY_FLAG];
  if (journey) hub[JOURNEY_FLAG] = structuredClone(journey); else delete hub[JOURNEY_FLAG];
  if (record) hub[RESTORE_FLAG] = record;
  delete hub[BACKUP_FLAG];
  if (Object.keys(hub).length) flags[MODULE_ID] = hub; else delete flags[MODULE_ID];
  if (liveData.flags?.core) flags.core = structuredClone(liveData.flags.core); else delete flags.core;
  const items = (copyData.items ?? []).map(i => ({...structuredClone(i), flags: withScopes(i.flags, archived.items?.[i._id]),
    effects: (i.effects ?? []).map(e => ({...structuredClone(e), flags: withScopes(e.flags, archived.itemEffects?.[i._id]?.[e._id])}))}));
  const effects = (copyData.effects ?? []).map(e => ({...structuredClone(e), flags: withScopes(e.flags, archived.effects?.[e._id])}));
  return {system: structuredClone(copyData.system ?? {}), flags, items, effects};
}
/** The same shape from a plain toObject() (used to roll back). */
export const stateOf = data => ({system: structuredClone(data.system ?? {}), flags: structuredClone(data.flags ?? {}),
  items: structuredClone(data.items ?? []), effects: structuredClone(data.effects ?? [])});

const OPTS = {recursive: false, diff: false};
const strip = (row, keys) => { const out = {...row}; for (const k of keys) delete out[k]; return out; };
/**
 * Makes `parent`'s embedded `name` documents match `rows` by id: deletes the ones not in rows, replaces the ones in
 * both (recursive: false, so nothing old is merged in), creates the rest with their ids. `nested(doc, row)` then runs
 * for each kept or created row (items: their own effects).
 */
async function syncEmbedded(parent, name, current, rows, nested = null) {
  const want = new Set(rows.map(r => r._id)), have = new Set(current.map(d => d.id));
  const gone = current.filter(d => !want.has(d.id)).map(d => d.id);
  if (gone.length) await parent.deleteEmbeddedDocuments(name, gone);
  const keep = rows.filter(r => have.has(r._id)), add = rows.filter(r => !have.has(r._id));
  if (keep.length) await parent.updateEmbeddedDocuments(name, keep.map(r => strip(r, ['_stats', 'effects'])), OPTS);
  if (add.length) await parent.createEmbeddedDocuments(name, add.map(r => strip(r, ['_stats'])), {keepId: true});
  if (nested) for (const r of keep) { const doc = parent.items?.get?.(r._id); if (doc) await nested(doc, r); }
}
/** Writes a state onto the live Actor: system and flags (replaced, not merged), then its effects and items. */
async function applyState(actor, state) {
  await actor.update({system: state.system, flags: state.flags}, OPTS);
  await syncEmbedded(actor, 'ActiveEffect', list(actor.effects), state.effects);
  await syncEmbedded(actor, 'Item', list(actor.items), state.items,
    (item, row) => syncEmbedded(item, 'ActiveEffect', list(item.effects), row.effects ?? []));
}

/** Cinders' rehook when Cinders is active and offers it (0.7.0+); 'old' when Cinders is active without it; else null. */
export function cindersRehook() {
  const m = globalThis.game?.modules?.get?.(CINDERS_ID);
  if (!m?.active) return null;
  const c = m.api?.cinder;
  return c?.contract === 'ag-cinder/1' && typeof c.rehook === 'function' ? actor => c.rehook(actor) : 'old';
}
const OLD_CINDERS = 'Ashen Gate | Cinders is older than 0.7.0, so the Cinders were not re-linked: update it, or run Cinders → Manage → Check and Repair.';

/**
 * GM: restores `backup` onto its character. Resolves {ok, result: {actorId, backupId, safetyId, opId}} or
 * {ok: false, error} (with `rolledBack` when a failed restore was undone).
 */
export async function restoreBackup(backup, {opId = newOpId(), user = globalThis.game?.user} = {}) {
  if (!isGM(user)) return refuse('Only a GM can restore a level backup.');
  const flag = backupFlag(backup);
  if (!flag) return refuse(`${backup?.name ?? 'That Actor'} is not a level backup.`);
  const actor = sourceOf(backup);
  if (!actor) return refuse(`The character "${flag.sourceName ?? '?'}" this backup was made from is gone, so there is nothing to restore onto.`);
  const done = actor.flags?.[MODULE_ID]?.[RESTORE_FLAG];
  if (done?.opId === opId) return {ok: true, result: {actorId: actor.id, backupId: done.backupId, safetyId: done.safetyId, opId}, duplicate: true};
  if (running.has(actor.id)) return refuse(`A restore of ${actor.name} is already running.`);
  running.add(actor.id);
  try {
    const before = actor.toObject();
    const level = Number(actor.system?.details?.level) || 0;
    let safety;
    try { safety = await createBackup(before, {sourceId: actor.id, levelBefore: level, opId: `${opId}-before-restore`, by: user.id, reason: 'restore'}); }
    catch (err) { safety = refuse(err?.message ?? String(err)); }
    if (!safety.ok || !safety.result) return refuse(`Nothing was changed: the copy of ${actor.name} as it is now could not be made (${safety.error ?? 'no copy came back'}).`);
    const record = {opId, backupId: backup.id, backupName: backup.name, levelBefore: level, levelAfter: Number(flag.levelBefore) || 0, safetyId: safety.result, date: new Date().toISOString().slice(0, 10), by: user.id};
    const rehook = cindersRehook();
    let cinders = null;
    try {
      await applyState(actor, restoredState(backup.toObject(), before, record));
      if (typeof rehook === 'function') cinders = await rehook(actor);
    } catch (err) {
      console.error(`${MODULE_ID} | level restore`, err);
      try {
        await applyState(actor, stateOf(before));
        if (typeof rehook === 'function') await rehook(actor).catch(e => console.warn(`${MODULE_ID} | Cinders re-link after rollback`, e));
      }
      catch (err2) {
        console.error(`${MODULE_ID} | level restore rollback`, err2);
        return {...refuse(`The restore failed (${err?.message ?? err}) and ${actor.name} could not be put back automatically (${err2?.message ?? err2}). Its state from just before is in the copy in ${FOLDER_PATH.join(' / ')}.`), rolledBack: false};
      }
      return {...refuse(`The restore failed (${err?.message ?? err}). ${actor.name} was put back as it was; nothing changed. The copy made just before is kept in ${FOLDER_PATH.join(' / ')}.`), rolledBack: true};
    }
    return {ok: true, result: {actorId: actor.id, backupId: backup.id, safetyId: safety.result, opId, cinders: cinders?.instances ?? null},
      ...(rehook === 'old' ? {warning: OLD_CINDERS} : {})};
  } finally { running.delete(actor.id); }
}

/** What the confirmation says, line by line (plain text; the shared confirm escapes it). */
export function restoreLines(backup, actor) {
  const f = backupFlag(backup) ?? {}, now = Number(actor?.system?.details?.level) || 0;
  return [`Restore ${actor.name} to "${backup.name}" (level ${f.levelBefore ?? '?'}, saved ${f.date ?? '?'})?`,
    `${actor.name}'s class levels, hit points, abilities, items, effects and Ashen Gate data (Strain, Skill Trees, Ledger, Renown, Quest Log, quick bar, companions) are replaced with the copy's. The Journey stays as it is now.`,
    ...(cindersRehook() ? [`Cinders: ${actor.name} is re-linked to the Cinders that Cinders' records say it bears now (records unchanged).`] : []),
    `First, ${actor.name} as it is now (level ${now}) is saved as a new copy in ${FOLDER_PATH.join(' / ')}, so nothing is lost.`,
    'The name, portrait, owners and token stay. The backup copy itself is kept. If anything fails, the character is put back as it was.'];
}
