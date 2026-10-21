/**
 * Target marks (0.13.0): tracking only, nothing automated. A player puts a label such as "Vexed" or "Hunter's Mark"
 * on the tokens they target, and takes it off again. A label is a real ActiveEffect on the target's Actor with a
 * status (so the token shows its icon) and no changes: it does nothing by itself. Its description names who placed it
 * and links dnd5e's own rules page where dnd5e has one. When the player can't edit the target (an enemy), the
 * coordinating GM client makes the change after checking the request (socket, like Utilities).
 *
 * Which marks a character may place comes only from dnd5e data:
 *   - weapon masteries: each equipped weapon's own `system.masteryOptions` (dnd5e 6: the weapon's mastery when the
 *     character has mastery of that weapon type, plus any bonus masteries), else nothing;
 *   - spell marks: a spell the character has whose dnd5e identifier is in MARKS.
 */
import {MODULE_ID, esc} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';

/**
 * Every mark the Hub knows, one line each, so the list is easy to edit. `kind`:
 *   'mastery': `mastery` is a dnd5e weapon mastery key (CONFIG.DND5E.weaponMasteries; its rules page is linked).
 *   'spell':   `identifiers` are dnd5e spell identifiers (system.identifier) that offer this mark.
 * `label` is what the target shows; `icon` a Foundry core icon (any image path works).
 */
export const MARKS = [
  {id: 'cleave', kind: 'mastery', mastery: 'cleave', label: 'Cleaved', icon: 'icons/svg/sword.svg'},
  {id: 'graze', kind: 'mastery', mastery: 'graze', label: 'Grazed', icon: 'icons/svg/blood.svg'},
  {id: 'nick', kind: 'mastery', mastery: 'nick', label: 'Nicked', icon: 'icons/svg/combat.svg'},
  {id: 'push', kind: 'mastery', mastery: 'push', label: 'Pushed', icon: 'icons/svg/wingfoot.svg'},
  {id: 'sap', kind: 'mastery', mastery: 'sap', label: 'Sapped', icon: 'icons/svg/downgrade.svg'},
  {id: 'slow', kind: 'mastery', mastery: 'slow', label: 'Slowed', icon: 'icons/svg/net.svg'},
  {id: 'topple', kind: 'mastery', mastery: 'topple', label: 'Toppled', icon: 'icons/svg/falling.svg'},
  {id: 'vex', kind: 'mastery', mastery: 'vex', label: 'Vexed', icon: 'icons/svg/daze.svg'},
  {id: 'hunters-mark', kind: 'spell', identifiers: ['hunters-mark'], label: "Hunter's Mark", icon: 'icons/svg/target.svg'},
  {id: 'hex', kind: 'spell', identifiers: ['hex'], label: 'Hexed', icon: 'icons/svg/terror.svg'},
  {id: 'bane', kind: 'spell', identifiers: ['bane'], label: 'Baned', icon: 'icons/svg/degen.svg'},
  {id: 'faerie-fire', kind: 'spell', identifiers: ['faerie-fire'], label: 'Faerie Fire', icon: 'icons/svg/light.svg'},
  {id: 'guiding-bolt', kind: 'spell', identifiers: ['guiding-bolt'], label: 'Guiding Bolt', icon: 'icons/svg/sun.svg'},
  {id: 'vicious-mockery', kind: 'spell', identifiers: ['vicious-mockery'], label: 'Vicious Mockery', icon: 'icons/svg/sound.svg'},
  {id: 'ensnaring-strike', kind: 'spell', identifiers: ['ensnaring-strike'], label: 'Ensnared', icon: 'icons/svg/net.svg'}
];
const BY_ID = new Map(MARKS.map(m => [m.id, m]));
export const markById = id => BY_ID.get(id) ?? null;
export const statusId = mark => `agch-${mark.id}`;
const refuse = error => ({ok: false, error});
const SOCKET = `module.${MODULE_ID}`;

const slug = s => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const masteryLabel = key => globalThis.CONFIG?.DND5E?.weaponMasteries?.[key]?.label ?? key;

/**
 * The marks this character may place, from dnd5e data: [{mark, label, source, sourceIds}], one per mark.
 * Mastery marks come from equipped weapons' masteryOptions; spell marks from owned spells by identifier.
 */
export function availableMarks(actor) {
  const out = new Map();
  const add = (mark, item, label) => {
    if (!out.has(mark.id)) out.set(mark.id, {mark, label, sources: [], sourceUuids: []});
    out.get(mark.id).sources.push(item.name);
    out.get(mark.id).sourceUuids.push(item.uuid ?? (actor.uuid ? `${actor.uuid}.Item.${item.id}` : null));
  };
  for (const item of actor?.items ?? []) {
    const s = item.system ?? {};
    if (item.type === 'weapon' && s.equipped) {
      let options = [];
      try { options = Array.isArray(s.masteryOptions) ? s.masteryOptions : []; } catch { options = []; }
      for (const o of options) {
        const mark = MARKS.find(m => m.kind === 'mastery' && m.mastery === o?.value);
        if (mark) add(mark, item, masteryLabel(o.value) || mark.label);
      }
    }
    if (item.type === 'spell') {
      const ident = s.identifier || slug(item.name);
      const mark = MARKS.find(m => m.kind === 'spell' && m.identifiers.includes(ident));
      if (mark) add(mark, item, mark.label);
    }
  }
  return [...out.values()];
}
export const canPlace = (actor, markId) => availableMarks(actor).some(a => a.mark.id === markId);

/** The ActiveEffect a mark puts on a target: a status with no changes, the rules link in its description. */
export function markEffectData(mark, source, user = globalThis.game?.user) {
  const ref = mark.kind === 'mastery' ? globalThis.CONFIG?.DND5E?.weaponMasteries?.[mark.mastery]?.reference : null;
  const what = mark.kind === 'mastery' ? `the ${masteryLabel(mark.mastery)} weapon mastery` : mark.label;
  return {
    name: `${mark.label} (${source.name})`, img: mark.icon, statuses: [statusId(mark)], origin: source.uuid, changes: [], disabled: false,
    description: `<p>${esc(source.name)} marked this with ${esc(what)}. Tracking only: nothing is automated; remove it when it ends.</p>${ref ? `<p>@UUID[${ref}]{${esc(masteryLabel(mark.mastery))} rules}</p>` : ''}`,
    flags: {[MODULE_ID]: {mark: {id: mark.id, by: source.uuid, user: user?.id ?? null}}}
  };
}
const effectsOf = actor => { const e = actor?.effects; return e ? [...(e.values?.() ?? e)] : []; };
/** This source's existing mark on a target Actor, or null. */
export const findMark = (target, markId, sourceUuid) => effectsOf(target).find(e => e.flags?.[MODULE_ID]?.mark?.id === markId && e.flags[MODULE_ID].mark.by === sourceUuid) ?? null;

/**
 * Puts the mark on the target or takes it off (the same click again). Runs where the user may edit the target;
 * `asUser` is the requesting user when the GM client does it for a player. Resolves to {ok, result: 'added'|'removed'}.
 */
export async function toggleMarkOn(source, target, markId, {asUser = globalThis.game?.user} = {}) {
  const mark = markById(markId);
  if (!mark) return refuse('Unknown mark.');
  if (!target) return refuse('That token is gone.');
  if (!canEdit(source, asUser)) return refuse(`You don't own ${source?.name ?? 'this character'}.`);
  const existing = findMark(target, markId, source.uuid);
  if (existing) { await existing.delete(); return {ok: true, result: 'removed'}; }
  if (!canPlace(source, markId)) return refuse(`${source.name} has no ${mark.label} to place (it comes from an equipped weapon's mastery or a spell ${source.name} has).`);
  await target.createEmbeddedDocuments('ActiveEffect', [markEffectData(mark, source, asUser)]);
  return {ok: true, result: 'added'};
}

/** Tokens the user has targeted (Foundry's own targeting, T key / right-click target). */
export const targetedTokens = (user = globalThis.game?.user) => [...(user?.targets ?? [])];

/** True when this client may edit the target's Actor (owner or GM). */
const canEditTarget = (actor, user = globalThis.game?.user) => !!actor && (user?.isGM || actor.testUserPermission?.(user, 'OWNER') === true || actor.isOwner === true);

/**
 * The hotbar button: toggles the mark on every targeted token. Owned targets change here; others go to the GM client.
 * Players are refused while the GM hides the hotbars part.
 */
export async function applyMark(source, markId) {
  if (!canEdit(source)) return refuse(`You don't own ${source?.name ?? 'this character'}, so you can't place its marks.`);
  const hidden = requirePart('hotbars'); if (hidden) return hidden;
  const tokens = targetedTokens();
  if (!tokens.length) return refuse('Target a token first (hover it and press T, or right-click → Target).');
  const results = [];
  for (const token of tokens) {
    const target = token.actor ?? token.document?.actor;
    const r = canEditTarget(target) ? await toggleMarkOn(source, target, markId)
      : await requestGM('mark-toggle', {sourceUuid: source.uuid, sceneId: token.document?.parent?.id ?? token.scene?.id ?? globalThis.canvas?.scene?.id, tokenId: token.document?.id ?? token.id, markId});
    if (r?.ok === false) return r;
    results.push(r?.result ?? r);
  }
  return {ok: true, result: results};
}

/** Marks this character has placed on tokens in the current scene, for the "On targets" list. */
export function placedMarks(source, scene = globalThis.canvas?.scene) {
  const out = [];
  for (const td of scene?.tokens ?? []) {
    const a = td.actor;
    for (const e of effectsOf(a)) {
      const m = e.flags?.[MODULE_ID]?.mark;
      if (m?.by === source?.uuid && markById(m.id)) out.push({tokenId: td.id, sceneId: scene.id, tokenName: td.name ?? a?.name ?? '?', mark: markById(m.id), effectId: e.id});
    }
  }
  return out;
}
/** Takes one placed mark off (the ✕ in "On targets"). */
export async function removePlaced(source, sceneId, tokenId, markId) {
  if (!canEdit(source)) return refuse(`You don't own ${source?.name ?? 'this character'}.`);
  const target = globalThis.game?.scenes?.get?.(sceneId)?.tokens?.get?.(tokenId)?.actor;
  if (!target) return refuse('That token is gone.');
  if (!findMark(target, markId, source.uuid)) return {ok: true, result: 'removed'};
  return canEditTarget(target) ? toggleMarkOn(source, target, markId) : requestGM('mark-toggle', {sourceUuid: source.uuid, sceneId, tokenId, markId});
}

// ---------- GM relay ----------

const pending = new Map();
const isCoordinator = () => { const gms = [...(globalThis.game?.users ?? [])].filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id)); return gms[0]?.id === globalThis.game?.user?.id; };
/** Sends a request to the coordinating GM client and waits for its receipt. */
export function requestGM(type, data, timeout = 15000) {
  const g = globalThis.game;
  if (!g?.socket?.emit) return Promise.resolve(refuse('The Character Hub socket is unavailable.'));
  if (![...(g.users ?? [])].some(u => u.isGM && u.active)) return Promise.resolve(refuse('A GM must be connected to mark a token you don\'t own.'));
  const requestId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve(refuse('The GM client did not answer. Nothing was changed.')); }, timeout);
    pending.set(requestId, {resolve, timer});
    g.socket.emit(SOCKET, {...data, type, requestId, userId: g.user.id});
  });
}
/**
 * GM side: checks the request against the requester's own permissions (they own the source character, the Hub
 * hotbars are shown to them, the mark is one their character may place) before changing anything.
 */
export const GM_HANDLERS = {
  'mark-toggle': async (msg, user) => {
    const g = globalThis.game;
    if (!user.isGM && requirePart('hotbars', user)) throw new Error('The GM has hidden the hotbars from players.');
    const source = globalThis.fromUuidSync?.(String(msg.sourceUuid ?? ''));
    if (source?.documentName !== 'Actor') throw new Error('Character not found.');
    const target = g.scenes?.get?.(String(msg.sceneId ?? ''))?.tokens?.get?.(String(msg.tokenId ?? ''))?.actor;
    const r = await toggleMarkOn(source, target, String(msg.markId ?? ''), {asUser: user});
    if (!r.ok) throw new Error(r.error);
    return r.result;
  }
};
export async function onSocket(msg, senderId) {
  const g = globalThis.game;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'receipt') {
    const p = msg.userId === g.user?.id && pending.get(msg.requestId); if (!p) return;
    pending.delete(msg.requestId); clearTimeout(p.timer);
    p.resolve(msg.ok ? {ok: true, result: msg.message} : refuse(msg.message || 'The GM client refused the request.'));
    return;
  }
  const handler = GM_HANDLERS[msg.type];
  if (!handler || !g.user?.isGM || !isCoordinator()) return;
  let ok = false, message = '';
  try {
    if (typeof senderId === 'string' && senderId !== msg.userId) throw new Error('Request sender mismatch.');
    const user = g.users?.get?.(msg.userId);
    if (!user?.active) throw new Error('Unknown requester.');
    message = await handler(msg, user); ok = true;
  } catch (err) { message = err?.message ?? String(err); console.warn(`${MODULE_ID} | refused ${msg.type} from ${msg.userId}: ${message}`); }
  g.socket.emit(SOCKET, {type: 'receipt', requestId: msg.requestId, userId: msg.userId, ok, message});
}
export function registerMarksSocket() { globalThis.game?.socket?.on?.(SOCKET, (msg, senderId) => { void onSocket(msg, senderId).catch(err => console.error(err)); }); }
