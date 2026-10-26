/**
 * Level backups (0.27.0): when a character levels up from the Hub, a copy of it as it was just before is kept, named
 * "<name> - level X" (X = the character level before; " (2)", " (3)" … when that name is taken).
 *
 *   - The snapshot is actor.toObject() at click time; the copy is created only after the level change succeeded.
 *   - Copies go in the Actor folder "Ashen Gate / Backups" (earlier versions: "Ashen Gate / Level backups"; folder-nesting.mjs moves them), GM-only (default ownership None, no owners).
 *   - Only GMs can create Actors: the GM's own level-ups create the copy directly; a player's goes to the coordinating
 *     GM client through the Hub's socket (marks.mjs), which checks the player owns the character. With no GM
 *     connected (or no answer) it is queued on the character (flag levelBackupQueue) and made when a GM is next on.
 *   - Each copy has a unique opId: a re-sent request or re-run queue never makes a second copy.
 *   - Copies are inert for Ashen Gate: every flag scope starting "ashen-gate-" is removed from the Actor, its items
 *     and its effects (Cinders bearer and socket markers, Strain, Skill Trees, Ledger, Renown, Quest Log, Locations,
 *     Utilities, HQ and this Hub's Journey, quick bar and companions), except "ashen-gate-manager" (the permanent
 *     source ids of imported items). They are not thrown away: levelBackup.archivedFlags keeps them (see splitSnapshot)
 *     for a later restore. Cinder instance records live in Cinders and are never touched. dnd5e data, items and
 *     effects are kept. The Hub's recorders skip copies.
 *   - flags['ashen-gate-character-hub'].levelBackup = {sourceId, sourceName, levelBefore, classesBefore, date, opId,
 *     by, archivedFlags, reason?} marks a copy (0.28.0: reason 'restore' on the copy made just before a Restore,
 *     level-restore.mjs).
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {GM_HANDLERS, requestGM} from './marks.mjs';
import {backupsFolder, BACKUPS_PATH} from './folder-nesting.mjs';

export const BACKUP_FLAG = 'levelBackup', QUEUE_FLAG = 'levelBackupQueue', QUEUE_MAX = 5;
export const FOLDER_PATH = BACKUPS_PATH;
const KEEP_SCOPES = new Set(['ashen-gate-manager']);
const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
const gmOnline = () => [...(globalThis.game?.users ?? [])].some(u => u.isGM && u.active);
const isCoordinator = () => { const gms = [...(globalThis.game?.users ?? [])].filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id)); return gms[0]?.id === globalThis.game?.user?.id; };
const newOpId = () => globalThis.foundry?.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18);

/** Is this Actor a level backup? */
export const isBackup = actor => !!actor?.flags?.[MODULE_ID]?.[BACKUP_FLAG];

/** Splits a flags object into what stays live (non-Ashen Gate scopes and KEEP_SCOPES) and the Ashen Gate scopes taken off. */
function splitScopes(flags) {
  const live = {}, off = {};
  for (const [scope, v] of Object.entries(flags ?? {})) (!scope.startsWith('ashen-gate-') || KEEP_SCOPES.has(scope) ? live : off)[scope] = v;
  if (off[MODULE_ID]) { const {[QUEUE_FLAG]: _q, ...rest} = off[MODULE_ID]; if (Object.keys(rest).length) off[MODULE_ID] = rest; else delete off[MODULE_ID]; }
  return {live, off};
}
/**
 * The snapshot made inert, plus what was taken off it. Ashen Gate scopes (all but KEEP_SCOPES) leave the Actor, its
 * items, its effects and its items' effects; nothing else changes. `archived` has the shape documented in the README:
 * {actor: {scope: flags}, items: {itemId: {scope: flags}}, effects: {effectId: {…}}, itemEffects: {itemId: {effectId: {…}}}},
 * each present only when something was taken off. Putting each back where its id says restores the flags exactly.
 */
export function splitSnapshot(snapshot) {
  const data = structuredClone(snapshot), archived = {};
  const take = (doc, put) => { const {live, off} = splitScopes(doc.flags); doc.flags = live; if (Object.keys(off).length) put(off); };
  take(data, off => { archived.actor = off; });
  for (const e of data.effects ?? []) take(e, off => { (archived.effects ??= {})[e._id] = off; });
  for (const i of data.items ?? []) {
    take(i, off => { (archived.items ??= {})[i._id] = off; });
    for (const e of i.effects ?? []) take(e, off => { ((archived.itemEffects ??= {})[i._id] ??= {})[e._id] = off; });
  }
  return {data, archived};
}
export const inertCopy = snapshot => splitSnapshot(snapshot).data;
/** The classes in a snapshot: [{id, name, identifier, levels}]. */
export const classesBefore = snapshot => (snapshot.items ?? []).filter(i => i.type === 'class')
  .map(i => ({id: i._id, name: i.name, identifier: i.system?.identifier ?? null, levels: Number(i.system?.levels) || 0}));

/** "<name> - level X", with " (2)", " (3)" … when an Actor already has that name. */
export function backupName(name, levelBefore, actors = globalThis.game?.actors ?? []) {
  const base = `${name} - level ${levelBefore}`, taken = new Set([...actors].map(a => a.name));
  if (!taken.has(base)) return base;
  let n = 2; while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/**
 * GM: makes the copy (or returns the one this opId already made). `snapshot` is the source's toObject() before the
 * level change; `meta` = {sourceId, levelBefore, opId, by, date?}.
 */
export async function createBackup(snapshot, meta) {
  if (!isGM()) return refuse('Only a GM can create the level backup.');
  const g = globalThis.game, Actor = globalThis.Actor;
  const done = [...(g.actors ?? [])].find(a => a.flags?.[MODULE_ID]?.[BACKUP_FLAG]?.opId === meta.opId);
  if (done) return {ok: true, result: done.id, duplicate: true};
  const split = splitSnapshot(snapshot), data = split.data;
  // A queued snapshot was made inert when queued; its archive travels with it in meta.
  const archivedFlags = Object.keys(split.archived).length ? split.archived : meta.archivedFlags ?? {};
  for (const k of ['_id', '_stats', 'sort']) delete data[k];
  const folder = await backupsFolder();
  const flag = {sourceId: meta.sourceId, sourceName: snapshot.name, levelBefore: meta.levelBefore, date: meta.date ?? new Date().toISOString().slice(0, 10), opId: meta.opId, by: meta.by ?? g.user?.id ?? null,
    classesBefore: meta.classesBefore ?? classesBefore(snapshot), archivedFlags, ...(meta.reason ? {reason: String(meta.reason)} : {})};
  Object.assign(data, {name: backupName(snapshot.name, meta.levelBefore), folder: folder?.id ?? null, ownership: {default: 0}});
  data.flags = {...data.flags, [MODULE_ID]: {[BACKUP_FLAG]: flag}};
  const made = await Actor.create(data, {keepEmbeddedIds: true});
  return {ok: true, result: made?.id ?? null};
}

/** The GM side of a player's request: the requester must own the character the snapshot is of. */
GM_HANDLERS['level-backup'] = async (msg, user) => {
  const actor = globalThis.game?.actors?.get?.(String(msg.actorId ?? ''));
  if (!actor || actor.type !== 'character') throw new Error('Character not found.');
  if (!canEdit(actor, user)) throw new Error(`${user.name} doesn't own ${actor.name}.`);
  const snap = msg.snapshot;
  if (!snap || typeof snap !== 'object' || snap._id !== actor.id || snap.type !== 'character') throw new Error('The backup data is not this character.');
  const r = await createBackup(snap, {sourceId: actor.id, levelBefore: Number(msg.levelBefore) || 0, opId: String(msg.opId ?? ''), by: user.id, date: msg.date});
  if (!r.ok) throw new Error(r.error);
  return r.result;
};

/**
 * After a successful level change: makes the copy (GM), asks the GM client (player), or queues it on the character
 * when no GM answers. Resolves {ok, result: 'created' | 'queued', error?}.
 */
export async function saveBackup(actor, snapshot, levelBefore) {
  const meta = {sourceId: actor.id, levelBefore, opId: newOpId(), by: globalThis.game?.user?.id ?? null, date: new Date().toISOString().slice(0, 10)};
  if (isGM()) { const r = await createBackup(snapshot, meta); return r.ok ? {ok: true, result: 'created'} : r; }
  if (gmOnline()) {
    const r = await requestGM('level-backup', {actorId: actor.id, snapshot, levelBefore, opId: meta.opId, date: meta.date});
    if (r.ok) return {ok: true, result: 'created'};
    if (!/did not answer/.test(r.error ?? '')) return r;
  }
  return queueBackup(actor, snapshot, meta);
}

/** Keeps the request on the character (the owner may write it) until a GM is on. At most QUEUE_MAX. */
async function queueBackup(actor, snapshot, meta) {
  const list = readQueue(actor);
  if (list.length >= QUEUE_MAX) return refuse(`${QUEUE_MAX} level backups are already waiting for the GM; this one was not kept.`);
  const {data, archived} = splitSnapshot(snapshot);
  await actor.update({[`flags.${MODULE_ID}.${QUEUE_FLAG}`]: [...list, {...meta, classesBefore: classesBefore(snapshot), archivedFlags: archived, snapshot: data}]});
  return {ok: true, result: 'queued'};
}
export const readQueue = actor => (Array.isArray(actor?.flags?.[MODULE_ID]?.[QUEUE_FLAG]) ? actor.flags[MODULE_ID][QUEUE_FLAG] : []).filter(e => e && typeof e === 'object' && e.opId && e.snapshot);

/** Coordinating GM: makes the queued copies and clears each character's queue. Re-runnable (opId). */
export async function flushQueue(actors = globalThis.game?.actors ?? []) {
  if (!isGM() || !isCoordinator()) return 0;
  let made = 0;
  for (const actor of [...actors]) {
    const list = readQueue(actor);
    if (!list.length) continue;
    const left = [];
    for (const e of list) {
      if (e.snapshot?._id !== actor.id) continue;
      const r = await createBackup(e.snapshot, {...e, sourceId: actor.id});
      if (r.ok) made += r.duplicate ? 0 : 1; else left.push(e);
    }
    await actor.update({[`flags.${MODULE_ID}.${QUEUE_FLAG}`]: left});
  }
  return made;
}
