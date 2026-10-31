/**
 * 0.42.0: how Locations names the people who know a place. Display only: reveal records stay keyed by user ids, nothing here is saved.
 *
 * A user is shown by the first word of each character they own ("Face Stomper" -> "Face"), so a table reads in character. A user who owns
 * no character (or none the viewer may see) falls back to the user name, as before. Also: which user ids count as "this character's
 * player" for the Personal badge in a partner's list. No Foundry imports: the world is passed in.
 */
const OWNER = 3;

/** First word of a name, split at the first run of whitespace; '' for an empty name. */
export const firstName = name => String(name ?? '').trim().split(/\s+/)[0] ?? '';

/** Can `viewer` see this Actor's name? The GM always; others with Limited or better, or when it is the user's assigned character (Foundry's Players list shows that name to everyone). */
function nameVisible(actor, owner, viewer) {
  if (viewer?.isGM) return true;
  if (owner?.character?.id && owner.character.id === actor.id) return true;
  try { return actor.testUserPermission?.(viewer, 'LIMITED') === true; } catch { return false; }
}

/**
 * Names for one user: the first name of every character they own that `viewer` may see (sorted), else the user's name,
 * else "A former player" when the user no longer exists. ctx: {users: {get(id)}, actors: iterable, viewer}.
 */
export function namesForUser(userId, {users, actors = [], viewer} = {}) {
  const user = users?.get?.(userId);
  if (!user) return ['A former player'];
  const seen = new Set(), names = [];
  const add = a => {
    if (!a || seen.has(a.id) || a.type !== 'character' || !nameVisible(a, user, viewer)) return;
    seen.add(a.id);
    const n = firstName(a.name);
    if (n) names.push(n);
  };
  const owned = [...actors].filter(a => a?.type === 'character' && !user.isGM && Number(a.ownership?.[userId]) >= OWNER);
  owned.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(add);
  add(user.character);
  return names.length ? names : [String(user.name ?? '') || 'A former player'];
}

/** Names for several users, in the order given, each user's characters together. */
export const namesForUsers = (userIds, ctx) => (userIds ?? []).flatMap(id => namesForUser(id, ctx));

/**
 * The user ids that count as "the player of this character" for the Personal badge when `viewer` reads the Hub of `actorId`.
 * The GM: every player who owns it (or has it assigned). A player: only themself, and only when they own it. Anyone else: none.
 */
export function playersOfActor(actorId, {users, actors, viewer} = {}) {
  const actor = actorId ? actors?.get?.(actorId) : null;
  if (!actor || !viewer) return [];
  const owns = u => u && !u.isGM && (Number(actor.ownership?.[u.id]) >= OWNER || u.character?.id === actor.id);
  if (viewer.isGM) return [...(users ?? [])].filter(owns).map(u => u.id);
  return owns(users?.get?.(viewer.id) ?? viewer) ? [viewer.id] : [];
}
