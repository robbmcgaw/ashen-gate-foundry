/**
 * Target marks (0.13.0). A player puts a label such as "Vexed" or "Hunter's Mark" on the tokens they target, and takes
 * it off again. A label is a real ActiveEffect on the target's Actor with a status (so the token shows its icon). Its
 * description names who placed it and links dnd5e's own rules page where dnd5e has one. When the player can't edit
 * the target (an enemy), the coordinating GM client makes the change after checking the request (socket, like Utilities).
 *
 * 0.45.1: weapon masteries act, using only what dnd5e 6 has (SRD 5.2.1 wording in `rule`):
 *   - Sap, Slow, Vex are timed effects: dnd5e's own special duration `duration.expiry` ('sourceStart' = the start of
 *     the attacker's next turn, 'sourceEnd' = the end of it; out of combat dnd5e ends them when game time advances).
 *     Sap changes the target's attack rolls (`system.rolls.attack.mode`: Disadvantage); Slow takes 10 ft off each of its
 *     speeds and never stacks; Vex only marks (dnd5e cannot give the attacker Advantage against one creature), so it
 *     shows the rule. Sap ends with the target's next attack roll, Vex with the attacker's next attack roll against it.
 *   - Topple is no mark: it asks for the Constitution save (DC shown) and puts Prone on the target after a failed one.
 *   - Cleave, Graze, Nick and Push are instant: a reminder with the rule text, nothing is put on anyone.
 * Spell marks (Hunter's Mark, Hex, ...) stay tracking only.
 *
 * Which marks a character may place comes only from dnd5e data:
 *   - weapon masteries: each equipped weapon's own `system.masteryOptions` (dnd5e 6: the weapon's mastery when the
 *     character has mastery of that weapon type, plus any bonus masteries), else nothing;
 *   - spell marks: a spell the character has whose dnd5e identifier is in MARKS.
 */
import {MODULE_ID, esc} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {requirePart} from './visibility.mjs';
import {confirmDialog} from './ag-dialogs.mjs';
import {applyStatusTo, conditionToggleOnGM} from './conditions.mjs';

/**
 * Every mark the Hub knows, one line each, so the list is easy to edit. `kind`:
 *   'mastery': `mastery` is a dnd5e weapon mastery key (CONFIG.DND5E.weaponMasteries; its rules page is linked).
 *   'spell':   `identifiers` are dnd5e spell identifiers (system.identifier) that offer this mark.
 * `label` is what the target shows; `icon` a Foundry core icon (any image path works).
 */
export const MARKS = [
  {id: 'cleave', kind: 'mastery', mastery: 'cleave', label: 'Cleaved', icon: 'icons/svg/sword.svg', mode: 'reminder', rule: "After you hit a creature with a melee attack, you can make a melee attack roll against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn."},
  {id: 'graze', kind: 'mastery', mastery: 'graze', label: 'Grazed', icon: 'icons/svg/blood.svg', mode: 'reminder', rule: 'If your attack roll misses a creature, you can deal damage to it equal to the ability modifier you used for the attack roll. The damage is the same type the weapon deals, and it can be increased only by increasing the ability modifier.'},
  {id: 'nick', kind: 'mastery', mastery: 'nick', label: 'Nicked', icon: 'icons/svg/combat.svg', mode: 'reminder', rule: 'When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.'},
  {id: 'push', kind: 'mastery', mastery: 'push', label: 'Pushed', icon: 'icons/svg/wingfoot.svg', mode: 'reminder', rule: 'If you hit a creature with this weapon, you can push it up to 10 feet straight away from you if it is Large or smaller.'},
  {id: 'sap', kind: 'mastery', mastery: 'sap', label: 'Sapped', icon: 'icons/svg/downgrade.svg', mode: 'effect', expiry: 'sourceStart', ends: 'target-attack', endsText: 'at the start of your next turn, or when it makes its next attack roll', rule: 'If you hit a creature with this weapon, it has Disadvantage on its next attack roll before the start of your next turn.'},
  {id: 'slow', kind: 'mastery', mastery: 'slow', label: 'Slowed', icon: 'icons/svg/net.svg', mode: 'effect', expiry: 'sourceStart', unique: true, ends: 'time', endsText: 'at the start of your next turn', rule: 'If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. Several Slow hits do not reduce its Speed by more than 10 feet.'},
  {id: 'topple', kind: 'mastery', mastery: 'topple', label: 'Toppled', icon: 'icons/svg/falling.svg', mode: 'save', rule: 'If you hit a creature with this weapon, you can force it to make a Constitution saving throw (DC 8 + the ability modifier you used for the attack roll + your Proficiency Bonus). On a failed save it has the Prone condition.'},
  {id: 'vex', kind: 'mastery', mastery: 'vex', label: 'Vexed', icon: 'icons/svg/daze.svg', mode: 'effect', expiry: 'sourceEnd', ends: 'source-attack', endsText: 'at the end of your next turn, or after your next attack roll against it', rule: 'If you hit a creature with this weapon and deal damage to it, you have Advantage on your next attack roll against that creature before the end of your next turn.'},
  {id: 'hunters-mark', kind: 'spell', identifiers: ['hunters-mark'], label: "Hunter's Mark", icon: 'icons/svg/target.svg'},
  {id: 'hex', kind: 'spell', identifiers: ['hex'], label: 'Hexed', icon: 'icons/svg/terror.svg'},
  {id: 'bane', kind: 'spell', identifiers: ['bane'], label: 'Baned', icon: 'icons/svg/degen.svg'},
  {id: 'faerie-fire', kind: 'spell', identifiers: ['faerie-fire'], label: 'Faerie Fire', icon: 'icons/svg/light.svg'},
  {id: 'guiding-bolt', kind: 'spell', identifiers: ['guiding-bolt'], label: 'Guiding Bolt', icon: 'icons/svg/sun.svg'},
  {id: 'vicious-mockery', kind: 'spell', identifiers: ['vicious-mockery'], label: 'Vicious Mockery', icon: 'icons/svg/sound.svg'},
  {id: 'ensnaring-strike', kind: 'spell', identifiers: ['ensnaring-strike'], label: 'Ensnared', icon: 'icons/svg/net.svg'},
  // 0.28.0: more standard dnd5e spells that leave a lasting effect on a creature until it ends (same tracking-only label).
  {id: 'bless', kind: 'spell', identifiers: ['bless'], label: 'Blessed', icon: 'icons/svg/angel.svg'},
  {id: 'searing-smite', kind: 'spell', identifiers: ['searing-smite'], label: 'Searing Smite', icon: 'icons/svg/fire.svg'},
  {id: 'wrathful-smite', kind: 'spell', identifiers: ['wrathful-smite'], label: 'Wrathful Smite', icon: 'icons/svg/skull.svg'},
  {id: 'shining-smite', kind: 'spell', identifiers: ['shining-smite', 'branding-smite'], label: 'Shining Smite', icon: 'icons/svg/aura.svg'}
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

/** Speeds a Slow mark takes 10 ft off: each dnd5e movement type the target actually has (jump is derived, never listed). */
const SLOW_BY = 10;
export function slowChanges(target) {
  const speeds = target?.system?.attributes?.movement?.speeds ?? {};
  const types = Object.keys(globalThis.CONFIG?.DND5E?.movementTypes ?? {walk: 1, burrow: 1, climb: 1, fly: 1, swim: 1}).filter(t => t !== 'jump');
  return types.filter(t => Number(speeds[t]) > 0).map(t => ({key: `system.attributes.movement.speeds.${t}`, type: 'add', value: `-${SLOW_BY}`}));
}
/** Real changes a timed mark makes to its target (Sap: Disadvantage on its attack rolls; Slow: speeds). Vex changes nothing. */
export function markChanges(mark, target) {
  if (mark.id === 'sap') return [{key: 'system.rolls.attack.mode', type: 'add', value: '-1'}];
  if (mark.id === 'slow') return slowChanges(target);
  return [];
}
const isEffectMark = mark => mark?.mode === 'effect';

/**
 * The ActiveEffect a mark puts on a target: a status, the rules link and (masteries) the rule text in its description.
 * Sap / Slow / Vex also carry dnd5e's special duration and their real changes; spell marks stay tracking only.
 */
export function markEffectData(mark, source, user = globalThis.game?.user, target = null) {
  const ref = mark.kind === 'mastery' ? globalThis.CONFIG?.DND5E?.weaponMasteries?.[mark.mastery]?.reference : null;
  const what = mark.kind === 'mastery' ? `the ${masteryLabel(mark.mastery)} weapon mastery` : mark.label;
  const timed = isEffectMark(mark);
  const note = timed ? `${esc(mark.rule)} Ends ${esc(mark.endsText)}; out of combat, when game time moves on. Take it off early with its ✕.`
    : 'Tracking only: nothing is automated; remove it when it ends.';
  const data = {
    name: `${mark.label} (${source.name})`, img: mark.icon, statuses: [statusId(mark)], origin: source.uuid, changes: timed ? markChanges(mark, target) : [], disabled: false,
    description: `<p>${esc(source.name)} marked this with ${esc(what)}. ${note}</p>${ref ? `<p>@UUID[${ref}]{${esc(masteryLabel(mark.mastery))} rules}</p>` : ''}`,
    flags: {[MODULE_ID]: {mark: {id: mark.id, by: source.uuid, user: user?.id ?? null}}}
  };
  if (timed) data.duration = {expiry: mark.expiry};
  return data;
}
const effectsOf = actor => { const e = actor?.effects; return e ? [...(e.values?.() ?? e)] : []; };
/** 0.46.6: an expired Sap / Slow / Vex stays on its target as an inactive effect (Foundry's default expiry action only marks it expired). It is over: not listed, not found, swept at the next placement. */
export const isExpired = e => e?.duration?.expired === true;
/** This source's existing (not expired) mark on a target Actor, or null. */
export const findMark = (target, markId, sourceUuid) => effectsOf(target).find(e => e.flags?.[MODULE_ID]?.mark?.id === markId && e.flags[MODULE_ID].mark.by === sourceUuid && !isExpired(e)) ?? null;

/**
 * Puts the mark on the target or takes it off (the same click again). Runs where the user may edit the target;
 * `asUser` is the requesting user when the GM client does it for a player. Resolves to {ok, result: 'added'|'removed'}.
 * A Slow already on the target from someone else is replaced (the speed reduction never adds up past 10 ft).
 */
export async function toggleMarkOn(source, target, markId, {asUser = globalThis.game?.user, removeOnly = false} = {}) {
  const mark = markById(markId);
  if (!mark) return refuse('Unknown mark.');
  if (!target) return refuse('That token is gone.');
  if (!canEdit(source, asUser)) return refuse(`You don't own ${source?.name ?? 'this character'}.`);
  if (mark.mode === 'reminder' || mark.mode === 'save') return refuse(`${mark.label} puts nothing on a target.`);
  const existing = findMark(target, markId, source.uuid);
  if (existing) { await existing.delete(); return {ok: true, result: 'removed'}; }
  if (removeOnly) return {ok: true, result: 'removed'};
  if (!canPlace(source, markId)) return refuse(`${source.name} has no ${mark.label} to place (it comes from an equipped weapon's mastery or a spell ${source.name} has).`);
  for (const spent of effectsOf(target).filter(e => e.flags?.[MODULE_ID]?.mark && isExpired(e))) { try { await spent.delete(); } catch { /* already gone */ } }   // 0.46.6: clear the expired marks
  if (mark.unique) for (const other of effectsOf(target).filter(e => e.flags?.[MODULE_ID]?.mark?.id === markId)) await other.delete();
  await target.createEmbeddedDocuments('ActiveEffect', [markEffectData(mark, source, asUser, target)]);
  return {ok: true, result: 'added'};
}

/** Tokens the user has targeted (Foundry's own targeting, T key / right-click target). */
export const targetedTokens = (user = globalThis.game?.user) => [...(user?.targets ?? [])];

/** True when this client may edit the target's Actor (owner or GM). */
const canEditTarget = (actor, user = globalThis.game?.user) => !!actor && (user?.isGM || actor.testUserPermission?.(user, 'OWNER') === true || actor.isOwner === true);

const targetOf = token => token.actor ?? token.document?.actor;
const targetName = token => token.name ?? token.document?.name ?? targetOf(token)?.name ?? 'the target';
const endsLine = mark => mark.mode === 'effect' ? ` It ends ${mark.endsText}; out of combat, when game time moves on. The ✕ takes it off early.` : '';

/** DC for Topple: 8 + the modifier of the ability the weapon attacks with + proficiency; null when dnd5e doesn't say. */
export function toppleDC(source, weaponUuid) {
  const item = weaponUuid ? globalThis.fromUuidSync?.(weaponUuid) : null;
  const key = item?.system?.abilityMod, mod = Number(source?.system?.abilities?.[key]?.mod), prof = Number(source?.system?.attributes?.prof);
  return Number.isFinite(mod) && Number.isFinite(prof) ? 8 + mod + prof : null;
}
/** Topple: ask for each target's Constitution save result; after a failed one the real Prone condition goes on it. */
async function toppleTargets(source, tokens, ui) {
  const info = availableMarks(source).find(a => a.mark.id === 'topple'), dc = toppleDC(source, info?.sourceUuids?.[0]);
  const dcText = dc === null ? 'DC 8 + the ability modifier you used + your Proficiency Bonus' : `DC ${dc}`;
  const proned = [], saved = [];
  for (const token of tokens) {
    const name = targetName(token);
    const failed = await ui.confirm(`${name} makes a Constitution saving throw (${dcText}). On a failed save it has the Prone condition. Did it fail?`, {title: `Topple ${name}?`, yes: 'It failed: put Prone on it', no: 'It saved'});
    if (!failed) { saved.push(name); continue; }
    const r = await applyStatusTo(source, {actor: targetOf(token), name, token}, 'prone');
    if (r?.ok === false) return r;
    proned.push(name);
  }
  const parts = [proned.length && `Prone put on ${proned.join(', ')}.`, saved.length && `${saved.join(', ')} saved.`].filter(Boolean);
  return {ok: true, result: parts.length ? ['topple'] : [], notice: parts.join(' ')};
}

const placeable = (source, mark) => canPlace(source, mark.id) ? null : refuse(`${source.name} has no ${mark.label} to place (it comes from an equipped weapon's mastery or a spell ${source.name} has).`);

/**
 * The hotbar button. Spell marks and Sap / Slow / Vex toggle the mark on every targeted token (owned targets change
 * here; others go to the GM client). Topple asks for each target's save; Cleave, Graze, Nick and Push only show their
 * rule. `notice` is the line the Hub shows. Players are refused while the GM hides the hotbars part.
 */
export async function applyMark(source, markId, {ui = {confirm: confirmDialog}} = {}) {
  if (!canEdit(source)) return refuse(`You don't own ${source?.name ?? 'this character'}, so you can't place its marks.`);
  const hidden = requirePart('hotbars'); if (hidden) return hidden;
  const mark = markById(markId);
  if (mark?.mode === 'reminder') return placeable(source, mark) ?? {ok: true, result: ['reminder'], notice: `${mark.label}: ${mark.rule}`};
  const tokens = targetedTokens();
  if (!tokens.length) return refuse('Target a token first (hover it and press T, or right-click → Target).');
  if (mark?.mode === 'save') return placeable(source, mark) ?? toppleTargets(source, tokens, ui);
  const results = [];
  for (const token of tokens) {
    const target = targetOf(token);
    const r = canEditTarget(target) ? await toggleMarkOn(source, target, markId)
      : await requestGM('mark-toggle', {sourceUuid: source.uuid, sceneId: token.document?.parent?.id ?? token.scene?.id ?? globalThis.canvas?.scene?.id, tokenId: token.document?.id ?? token.id, markId});
    if (r?.ok === false) return r;
    results.push(r?.result ?? r);
  }
  const added = results.includes('added');
  return {ok: true, result: results, notice: added && mark ? `${mark.label}: ${mark.rule}${endsLine(mark)}` : null};
}

/**
 * An attack roll was made by `attacker` (dnd5e.postRollAttack, on the roller's client): Sap on the attacker ends, and
 * the Vex the attacker placed on a creature they are targeting ends. Returns what ended.
 */
export async function spendMarks(attacker, {user = globalThis.game?.user} = {}) {
  const ended = [];
  if (!attacker) return ended;
  for (const e of effectsOf(attacker).filter(x => x.flags?.[MODULE_ID]?.mark?.id === 'sap')) {
    try { await e.delete(); ended.push('sap'); } catch (err) { console.warn(`${MODULE_ID} | could not end Sap`, err); }
  }
  for (const token of targetedTokens(user)) {
    const target = targetOf(token);
    if (!findMark(target, 'vex', attacker.uuid)) continue;
    const r = canEditTarget(target, user) ? await toggleMarkOn(attacker, target, 'vex', {asUser: user, removeOnly: true})
      : await requestGM('mark-toggle', {sourceUuid: attacker.uuid, sceneId: token.document?.parent?.id ?? globalThis.canvas?.scene?.id, tokenId: token.document?.id ?? token.id, markId: 'vex', removeOnly: true});
    if (r?.ok !== false) ended.push('vex');
  }
  return ended;
}
export function registerMarkHooks() {
  globalThis.Hooks?.on?.('dnd5e.postRollAttack', (rolls, data) => { void spendMarks(data?.subject?.actor).catch(err => console.warn(`${MODULE_ID} | marks after attack`, err)); });
}

/** Marks this character has placed on tokens in the current scene, for the "On targets" list. */
export function placedMarks(source, scene = globalThis.canvas?.scene) {
  const out = [];
  for (const td of scene?.tokens ?? []) {
    const a = td.actor;
    for (const e of effectsOf(a)) {
      const m = e.flags?.[MODULE_ID]?.mark;
      if (m?.by === source?.uuid && markById(m.id) && !isExpired(e)) out.push({tokenId: td.id, sceneId: scene.id, tokenName: td.name ?? a?.name ?? '?', mark: markById(m.id), effectId: e.id});
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
  'condition-toggle': (msg, user) => conditionToggleOnGM(msg, user),
  'mark-toggle': async (msg, user) => {
    const g = globalThis.game;
    if (!user.isGM && requirePart('hotbars', user)) throw new Error('The GM has hidden the hotbars from players.');
    const source = globalThis.fromUuidSync?.(String(msg.sourceUuid ?? ''));
    if (source?.documentName !== 'Actor') throw new Error('Character not found.');
    const target = g.scenes?.get?.(String(msg.sceneId ?? ''))?.tokens?.get?.(String(msg.tokenId ?? ''))?.actor;
    const r = await toggleMarkOn(source, target, String(msg.markId ?? ''), {asUser: user, removeOnly: msg.removeOnly === true});
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
