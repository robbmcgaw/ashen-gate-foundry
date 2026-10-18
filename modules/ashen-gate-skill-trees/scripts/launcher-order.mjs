/** AG-WORK-0016 common Actors sidebar placement for cooperating Ashen Gate modules.
 * Does not restyle or relocate Foundry's controls. Each specialist owns its button.
 */
export const ACTORS_LAUNCHER_RANK = Object.freeze({
  'ashen-gate-profession-ledger':10,
  'ashen-gate-factions':20,
  'ashen-gate-skill-trees':30,
  'ashen-gate-headquarters':40,
  'ashen-gate-quest-manager':50
});
export const ITEM_LAUNCHER_RANK = Object.freeze({
  'ashen-gate-manager':10,
  'ashen-gate-locations':20
});
/** Sorts direct child Ashen Gate launcher buttons only, retaining other UI nodes. */
export function arrangeLaunchers(host) {
  if (!host?.children || typeof host.append !== 'function') return;
  const tagged=Array.from(host.children).filter(node=>node?.dataset?.agLauncherRank!==undefined);
  const sorted=[...tagged].sort((a,b)=>Number(a.dataset.agLauncherRank)-Number(b.dataset.agLauncherRank));
  // Avoid unnecessary DOM moves (and duplicate append side effects in V14 UI shims).
  const tail=Array.from(host.children).slice(-sorted.length);
  if(tail.every((node,index)=>node===sorted[index]))return;
  for (const button of sorted) host.append(button);
}
