/**
 * 0.33.0 "Travel": a user views a scene linked to a location. Pure rules here; the API wraps them (api.mjs), the window and the map pins call the API.
 *
 * Navigation is `Scene#view()` for the current user only. It never activates a scene and never moves anyone else.
 * Who may travel where:
 *  - GM: every linked scene that still resolves. No other rule.
 *  - Player: only a Revealed location they can read (their player view carries `travelScenes`, set by the GM at Publish from the per-scene
 *    switch "Players can travel here", default off), and only scenes this client can resolve AND is allowed to view. A scene the player
 *    cannot view is skipped silently: it is not named, counted or hinted at. Unidentified and Hidden locations never offer Travel.
 * "Allowed to view" for a player (conservative): the scene is in the Scenes bar for everyone (`navigation`), or the player has Observer
 * permission on it. A scene the server withholds from the player's client does not resolve at all, so it is skipped by the first check.
 */
export const TRAVEL_UNAVAILABLE = "Travel isn't available for that location.";

/** Can this user view the scene? GM: any scene. Player: navigation true, or Observer (or better) permission. */
export function sceneViewable(scene, user) {
  if (!scene || typeof scene.view !== 'function') return false;
  if (user?.isGM) return true;
  if (scene.navigation === true) return true;
  try { return scene.testUserPermission?.(user, 'OBSERVER') === true; } catch { return false; }
}

/**
 * The scenes this user may travel to: [{uuid, name, scene}] sorted by name. `uuids` is the GM's sceneUuids (GM) or the view's travelScenes (player).
 * `resolve(uuid)` returns a Scene or null/throws.
 */
export function travelOptions(uuids, {resolve, user}) {
  const out = [];
  for (const uuid of new Set(Array.isArray(uuids) ? uuids : [])) {
    let scene = null;
    try { scene = resolve(uuid); } catch { scene = null; }
    if (sceneViewable(scene, user)) out.push({uuid, name: String(scene.name ?? ''), scene});
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Button/menu text: "Travel" for one scene, "Travel to scene…" when the user has to choose. */
export const travelLabel = count => (count > 1 ? 'Travel to scene…' : 'Travel');
