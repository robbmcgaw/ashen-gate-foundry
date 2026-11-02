/* 0.38.0: which characters the Conditions overlay lists, and in what order. Display only: who may see or change what is
   decided elsewhere (conditionRole / applyDecision / Foundry permissions) and is not touched here. No Foundry globals. */
export const OVERLAY_DEFAULT_WIDTH = 240;
export const OVERLAY_DEFAULT_HEIGHT = 'auto';
export const OVERLAY_SCOPES = Object.freeze(['party', 'self']);
export const normalizeScope = v => v === 'self' ? 'self' : 'party';

const isBackup = a => Boolean(a?.flags?.['ashen-gate-character-hub']?.levelBackup);
/** Characters this user counts as their own: the assigned character, and for a player every character they own. A GM owns everything, so only the assigned character counts. */
export function isOwnCharacter(actor, user) {
  if (!actor || !user || actor.type !== 'character' || isBackup(actor)) return false;
  if (user.character?.id !== undefined && user.character.id === actor.id) return true;
  return !user.isGM && actor.testUserPermission?.(user, 'OWNER') === true;
}
/** Actors with the user's own characters first (assigned character, then the other owned ones), the rest in their given order. */
export function orderOwnFirst(actors, user) {
  const list = [...actors ?? []], own = list.filter(a => isOwnCharacter(a, user));
  const assigned = own.find(a => a.id === user?.character?.id);
  const first = assigned ? [assigned, ...own.filter(a => a !== assigned)] : own;
  return [...first, ...list.filter(a => !first.includes(a))];
}
/** Whether the Self / Party switch is worth showing: the user has at least one character of their own in the list. */
export const hasOwnCharacter = (actors, user) => [...actors ?? []].some(a => isOwnCharacter(a, user));
/** The effective scope: Self only counts while the user still has a character of their own. */
export const effectiveScope = (scope, actors, user) => normalizeScope(scope) === 'self' && hasOwnCharacter(actors, user) ? 'self' : 'party';
/** The overlay's actor list: own first; in Self scope, only the user's own characters. Party scope never drops anyone. */
export function overlayActors(actors, user, scope) {
  const ordered = orderOwnFirst(actors, user);
  return effectiveScope(scope, ordered, user) === 'self' ? ordered.filter(a => isOwnCharacter(a, user)) : ordered;
}
/** Keep the picked card when it is still listed; else, in Self scope, the first own card; else leave it as it was. */
export function keepSelection(selectedId, shownIds, scope) {
  if (!selectedId || shownIds.includes(selectedId)) return selectedId;
  return scope === 'self' ? (shownIds[0] ?? null) : selectedId;
}
