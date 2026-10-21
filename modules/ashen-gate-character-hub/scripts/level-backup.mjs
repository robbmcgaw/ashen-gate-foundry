/**
 * Level backups (0.27.0): when a character levels up from the Hub, a copy of it as it was just before is kept, named
 * "<name> - level X" (X = the character level before; " (2)", " (3)" … when that name is taken).
 *
 *   - The snapshot is actor.toObject() at click time; the copy is created only after the level change succeeded.
 *   - Copies go in the Actor folder "Ashen Gate / Level backups", GM-only (default ownership None, no owners).
 *   - Only GMs can create Actors: the GM's own level-ups create the copy directly; a player's goes to the coordinating
 *     GM client through the Hub's socket (marks.mjs), which checks the player owns the character. With no GM
 *     connected (or no answer) it is queued on the character (flag levelBackupQueue) and made when a GM is next on.
 *   - Each copy has a unique opId: a re-sent request or re-run queue never makes a second copy.
 *   - Copies are inert for Ashen Gate: every flag scope starting "ashen-gate-" is removed from the Actor, its items
 *     and its effects (Cinders bearer and socket markers, Strain, Skill Trees, Ledger, Renown, Quest Log, Locations,
 *     Utilities, HQ and this Hub's Journey, quick bar and companions), except "ashen-gate-manager" (the permanent
 *     source ids of imported items). dnd5e data, items and effects are kept. The Hub's recorders skip copies.
 *   - flags['ashen-gate-character-hub'].levelBackup = {sourceId, sourceName, levelBefore, date, opId, by} marks a copy.
 */
import {MODULE_ID} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {GM_HANDLERS, requestGM} from './marks.mjs';

export const BACKUP_FLAG = 'levelBackup', QUEUE_FLAG = 'levelBackupQueue', QUEUE_MAX = 5;
export const FOLDER_PATH = ['Ashen Gate', 'Level backups'];
const KEEP_SCOPES = new Set(['ashen-gate-manager']);
const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
const gmOnline = () => [...(globalThis.game?.users ?? [])].some(u => u.isGM && u.active);
const isCoordinator = () => { const gms = [...(globalThis.game?.users ?? [])].filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id)); return gms[0]?.id === globalThis.game?.user?.id; };
const newOpId = () => globalThis.foundry?.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18);

/** Is this Actor a level backup? */
export const isBackup = actor => !!actor?.flags?.[MODULE_ID]?.[BACKUP_FLAG];

/** Removes Ashen Gate flag scopes (all but KEEP_SCOPES) from a flags object. */
function stripFlags(flags) {
  const out = {};
  for (const [scope, v] of Object.entries(flags ?? {})) if (!scope.startsWith('ashen-gate-') || KEEP_SCOPES.has(scope)) out[scope] = v;
  return out;
}
/** The snapshot, inert: Ashen Gate state off the Actor, its items and effects; nothing else changed. */
export function inertCopy(snapshot) {
  const data = structuredClone(snapshot);
  data.flags = stripFlags(data.flags);
  for (const list of [data.items, data.effects, ...(data.items ?? []).map(i => i.effects)]) for (const d of list ?? []) d.flags = stripFlags(d.flags);
  return data;
}

/** "<name> - level X", with " (2)", " (3)" … when an Actor already has that name. */
export function backupName(name, levelBefore, actors = globalThis.game?.actors ?? []) {
  const base = `${name} - level ${levelBefore}`, taken = new Set([...actors].map(a => a.name));
  if (!taken.has(base)) return base;
  let n = 2; while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** The "Ashen Gate / Level backups" Actor folder, created when missing (GM only). */
async function ensureFolder() {
  const g = globalThis.game, Folder = globalThis.Folder ?? globalThis.foundry?.documents?.Folder;
  let parent = null;
  for (const name of FOLDER_PATH) {
    const found = [...(g.folders ?? [])].find(f => f.type === 'Actor' && f.name === name && (f.folder?.id ?? f.folder ?? null) === (parent?.id ?? null));
    parent = found ?? await Folder.create({name, type: 'Actor', folder: parent?.id ?? null});
  }
  return parent;
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
  const data = inertCopy(snapshot);
  for (const k of ['_id', '_stats', 'sort']) delete data[k];
  const folder = await ensureFolder();
  const flag = {sourceId: meta.sourceId, sourceName: snapshot.name, levelBefore: meta.levelBefore, date: meta.date ?? new Date().toISOString().slice(0, 10), opId: meta.opId, by: meta.by ?? g.user?.id ?? null};
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
  await actor.update({[`flags.${MODULE_ID}.${QUEUE_FLAG}`]: [...list, {...meta, snapshot: inertCopy(snapshot)}]});
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
