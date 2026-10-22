/**
 * Character Hub follows Player Access (0.45.0). When the GM reveals a module to players on the Modules tab, the Hub
 * parts that module backs are switched on in the Hub's own Player visibility, so they show without a second step;
 * the GM can still turn any part off in the Hub's GM Setup. The Strain bar follows Cinders both ways.
 *
 * Only the Hub's public API is used (api.playerVisibility: parts(), get(), set(patch)), feature-detected; Manager
 * never reads or writes the Hub's settings. A missing or inactive Hub, or an older Hub without that API, is skipped.
 */
export const HUB_ID = 'ashen-gate-character-hub';
export const CINDERS_ID = 'ashen-gate-cinders';

/** The Hub's player-visibility API, or null when the Hub is absent, inactive or too old. */
export function hubVisibilityApi(modules) {
  const hub = modules?.get?.(HUB_ID);
  const api = hub?.active ? hub.api?.playerVisibility : null;
  return api && typeof api.set === 'function' && typeof api.parts === 'function' ? api : null;
}

/** The {partKey: boolean} patch that makes the Hub follow `moduleId` being revealed (true) or hidden (false). */
export function followPatch(parts, moduleId, enabled) {
  const keys = new Set((Array.isArray(parts) ? parts : []).map(p => p?.key).filter(Boolean));
  const patch = {};
  // Revealing a module shows its parts. Hiding one needs nothing: the Hub already hides a part whose module's Player Access is off.
  if(enabled) for(const p of parts ?? []) if(p?.key && p.partner === moduleId) patch[p.key] = true;
  // The Strain bar is a Hub part with no partner; it follows Cinders.
  if(moduleId === CINDERS_ID && keys.has('strain')) patch.strain = Boolean(enabled);
  return patch;
}

/**
 * Applies the follow patch for one module. Resolves to {changed:{...}, message} and never throws: a Hub problem
 * must not undo or block the Player Access change itself. Parts already set the right way are left alone.
 */
export async function followHubVisibility(modules, moduleId, enabled) {
  const api = hubVisibilityApi(modules);
  if(!api) return {changed:{}, message:''};
  try {
    const parts = await api.parts();
    const patch = followPatch(parts, moduleId, enabled);
    const current = typeof api.get === 'function' ? (await api.get()) ?? {} : {};
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => current[k] !== v));
    if(!Object.keys(changed).length) return {changed:{}, message:''};
    const out = await api.set(changed);
    if(out && out.ok === false) return {changed:{}, message:`Character Hub did not update its Player visibility: ${out.error ?? 'refused'}.`};
    const on = Object.keys(changed).filter(k => changed[k]), off = Object.keys(changed).filter(k => !changed[k]);
    const label = k => (parts ?? []).find(p => p?.key === k)?.label ?? k;
    return {changed, message:[on.length ? `Character Hub now shows ${on.map(label).join(', ')} to players.` : '',
      off.length ? `Character Hub now hides ${off.map(label).join(', ')} from players.` : ''].filter(Boolean).join(' ')};
  } catch(error) {
    return {changed:{}, message:`Character Hub did not update its Player visibility: ${error?.message ?? String(error)}.`};
  }
}
