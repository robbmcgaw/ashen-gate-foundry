// Vows (0.19.0): the one Vow a character holds at a time, kept in Renown's own Actor flag. No Foundry globals here, so it is
// testable; every function takes the actor and the acting user and checks permission itself (not only the buttons).
import {syncVowItem, removeVowItems, logVow, vowItemsOf} from './vow-item.mjs';
export const VOW_FLAG = 'vow';
/** Piety lost with the god when a Vow is broken on purpose. The one place this number lives. */
export const VOW_BREAK_PENALTY = 3;

/** The stored Vow in canonical shape, or null when there is none or the flag is not usable. */
export function normalizeVow(raw) {
  if (typeof raw === 'string' && raw) return {deity_id: raw, sworn_at: null};
  if (!raw || typeof raw !== 'object' || typeof raw.deity_id !== 'string' || !raw.deity_id) return null;
  return {deity_id: raw.deity_id, sworn_at: typeof raw.sworn_at === 'string' ? raw.sworn_at : null};
}
export const getVow = (actor, moduleId) => normalizeVow(actor?.getFlag?.(moduleId, VOW_FLAG));

/** The character's owner and the GM may swear or end a Vow. */
export function canManageVow(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  return Boolean(actor.testUserPermission?.(user, 'OWNER'));
}
function need(user, actor) {
  if (!actor?.id) throw Error('Select a character.');
  if (!canManageVow(user, actor)) throw Error('Only the character\'s owner or the GM can change this Vow.');
}

/** Swear a Vow to a god. `unlocked` says whether this character has reached the god's first rank. Replaces any other Vow. */
export async function swearVow({moduleId, actor, user, deityId, unlocked, itemData = null, now = () => new Date().toISOString()}) {
  need(user, actor);
  if (!deityId) throw Error('Choose a god.');
  if (!unlocked) throw Error('This Vow is not unlocked yet. Reach the god\'s first rank.');
  const before = getVow(actor, moduleId);
  if (before?.deity_id === deityId) {
    const kept = await syncVowItem({actor, moduleId, deityId, data: itemData});
    return {vow: before, replaced: null, changed: false, item: kept.created};
  }
  const vow = {deity_id: deityId, sworn_at: now()};
  await actor.setFlag(moduleId, VOW_FLAG, vow);
  const item = await syncVowItem({actor, moduleId, deityId, data: itemData});
  await logVow(actor, moduleId, before ? 'replaced' : 'sworn', deityId, now);
  return {vow, replaced: before?.deity_id ?? null, changed: true, item: item.created};
}

/** End the Vow without a penalty (the toggle turned off). */
export async function endVow({moduleId, actor, user}) {
  need(user, actor);
  const before = getVow(actor, moduleId);
  if (before) { await actor.unsetFlag(moduleId, VOW_FLAG); await logVow(actor, moduleId, 'ended', before.deity_id); }
  await removeVowItems({actor, moduleId});
  return {ended: before?.deity_id ?? null};
}

/** GM only: the Vow was broken on purpose. Ends it and takes VOW_BREAK_PENALTY piety (never below 0) via writePiety(deityId, delta, reason). */
export async function breakVow({moduleId, actor, user, score = 0, writePiety}) {
  if (!user?.isGM) throw Error('Only the GM rules that a Vow was broken.');
  if (!actor?.id) throw Error('Select a character.');
  const before = getVow(actor, moduleId);
  if (!before) throw Error('No Vow is sworn.');
  const lost = Math.min(VOW_BREAK_PENALTY, Math.max(0, Number(score) || 0));
  if (lost > 0) await writePiety(before.deity_id, -lost, 'Broke a Vow');
  await actor.unsetFlag(moduleId, VOW_FLAG);
  await removeVowItems({actor, moduleId});
  await logVow(actor, moduleId, 'broken', before.deity_id);
  return {deityId: before.deity_id, lost};
}

/** Safe, re-runnable repair of the Vow flag on each actor: a bare string becomes the object form, an unusable value is removed.
 * A good flag and an actor with no flag are never touched, so running it twice changes nothing. Returns the ids it changed. */
export async function migrateVows(actors, moduleId) {
  const changed = [];
  for (const actor of actors ?? []) {
    const raw = actor?.getFlag?.(moduleId, VOW_FLAG);
    if (raw === undefined || raw === null) continue;
    const good = normalizeVow(raw);
    if (good && typeof raw === 'object' && raw.deity_id === good.deity_id && raw.sworn_at === good.sworn_at) continue;
    if (good) await actor.setFlag(moduleId, VOW_FLAG, good); else await actor.unsetFlag(moduleId, VOW_FLAG);
    changed.push(actor.id);
  }
  return changed;
}

/** Startup repair (GM client): a character with a sworn Vow but no Vow Item gets one. `itemDataFor(actor, deityId)` returns build data or null.
 * Re-runnable; changes nothing when the Item is already there, and never rewrites any other state. Returns the actor ids it created for. */
export async function ensureVowItems(actors, moduleId, itemDataFor) {
  const created = [];
  for (const actor of actors ?? []) {
    const vow = getVow(actor, moduleId);
    if (!vow) continue;
    if (vowItemsOf(actor, moduleId).some(i => i.getFlag(moduleId, 'vowItem').deityId === vow.deity_id)) continue;
    const data = itemDataFor(actor, vow.deity_id);
    if (!data) continue;
    const r = await syncVowItem({actor, moduleId, deityId: vow.deity_id, data});
    if (r.created) created.push(actor.id);
  }
  return created;
}

/** The Seeker (first rank) card gets the Vow toggle once reached; reward behavior and usage limits play no part. */
export const attachVowToggle = (milestones, info) => milestones.map((m, i) => i === 0 && info.show && m.unlocked ? {...m, vowToggle: info} : m);
