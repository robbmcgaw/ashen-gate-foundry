/**
 * Top-level tree tabs (0.27.0): Professions and Cinders, the same for every role. Pure helpers; the app keeps the state.
 * A tree belongs to Cinders when it is a Cinder tree (provider cinder_milestone); everything else (profession trees and any
 * other tree the GM awards points in) sits under Professions, so no tree becomes unreachable. Room for more tabs: add a row
 * to TREE_TABS and teach tabOfTree about it.
 */
export const TREE_TABS = Object.freeze([{id: 'professions', label: 'Professions', icon: 'fa-solid fa-hammer'}, {id: 'cinders', label: 'Cinders', icon: 'fa-solid fa-fire'}]);
export const DEFAULT_TREE_TAB = 'professions';
export const isTreeTab = id => TREE_TABS.some(t => t.id === id);
export const tabOfTree = tree => tree?.provider?.kind === 'cinder_milestone' ? 'cinders' : 'professions';
export const treesInTab = (trees, tab) => (Array.isArray(trees) ? trees : []).filter(t => tabOfTree(t) === tab);

/**
 * Which tab api.open({tab, treeId}) lands on. A known tree decides its own tab (a Cinder tree always opens under Cinders, even
 * when tab says 'professions'); else a valid tab; else the window's current tab; else Professions. Unknown tab values are ignored.
 */
export function openTab({tab = null, treeId = null} = {}, {trees = [], current = null} = {}) {
  const tree = treeId ? (Array.isArray(trees) ? trees : []).find(t => t?.id === treeId) : null;
  if (tree) return tabOfTree(tree);
  if (isTreeTab(tab)) return tab;
  return isTreeTab(current) ? current : DEFAULT_TREE_TAB;
}

/**
 * Character to show: the one already chosen if it is still allowed, else the first that has a tree under the current tab
 * (so opening Cinders lands on the bearer, not on whoever comes first alphabetically), else the first.
 */
export function chooseActor(actors, currentId, hasTrees = () => true) {
  const list = Array.isArray(actors) ? actors : [];
  if (list.some(a => a.id === currentId)) return currentId;
  return (list.find(a => hasTrees(a)) ?? list[0])?.id ?? null;
}

/** The sentence shown in place of a tab with no tree. */
export function emptyTabText(tab, {gm = false, actorName = '', bound = false} = {}) {
  if (tab === 'cinders') {
    if (!gm && bound) return `${actorName || 'This character'} has a bound Cinder, but its tree has not been released yet. Ask your GM.`;
    return gm ? 'No Cinder trees yet. Import a Cinder tree through General Manager, or create one in the Tree Library.'
      : `${actorName || 'This character'} has no bound Cinder yet. When a Cinder is bound to this character, its tree appears here.`;
  }
  return gm ? 'Create one with New tree in the Tree Library tab, or import a tree file through General Manager.' : null;
}
