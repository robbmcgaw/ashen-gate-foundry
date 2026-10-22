/** Ashen Gate | Cinders has nothing for players in Configure Settings: every setting and menu of this module is GM-only.
 * Foundry decides what the list shows per client, so on a player's client the module's settings are marked not shown
 * (config false, menus restricted) and, as a second guard, its category is taken out of the rendered Settings window.
 * The settings themselves are unchanged: same keys, values and scope. */
export function hideSettingsFromPlayers(game, moduleId) {
  if (!game?.user || game.user.isGM) return 0;
  let hidden = 0;
  const mine = (key, s) => s?.namespace === moduleId || String(key).startsWith(`${moduleId}.`);
  for (const [key, s] of game.settings?.settings?.entries?.() ?? []) {
    if (!mine(key, s) || !s.config) continue;
    try { s.config = false; hidden++; } catch { /* a frozen entry: the render guard below still removes it */ }
  }
  for (const [key, m] of game.settings?.menus?.entries?.() ?? []) {
    if (!mine(key, m) || m.restricted) continue;
    try { m.restricted = true; hidden++; } catch { /* as above */ }
  }
  return hidden;
}
/** renderSettingsConfig on a player's client: remove this module's category tab and section if Foundry still drew them. */
export function stripSettingsCategory(game, moduleId, root) {
  if (!game?.user || game.user.isGM || !root?.querySelectorAll) return 0;
  const sel = [`[data-tab="${moduleId}"]`, `[data-category="${moduleId}"]`, `[data-category-id="${moduleId}"]`].join(',');
  const found = [...root.querySelectorAll(sel)];
  for (const el of found) el.remove();
  return found.length;
}
