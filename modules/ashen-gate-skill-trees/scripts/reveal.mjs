/**
 * Progressive reveal (0.28.0). Pure rules, no Foundry globals.
 *
 * A tree may carry `reveal: 'progressive'`. Players then see, per character:
 *   shown      the node is unlocked, has no prerequisites, or is available now (every requiresAll unlocked and every requiresAny group has an unlocked member);
 *   silhouette not shown, but at least one of its prerequisites is shown ("Undiscovered": no name, text, picture or real cost);
 *   hidden     everything else: not drawn, not listed, not in tooltips, not in embed data.
 * The GM's own view is never filtered.
 *
 * Where the text lives (so the shared copy never leaks): the shared player copy (a world setting every client can read) holds the full text of
 * nodes with no prerequisites only; every other node is published as a silhouette (id, position, prerequisite ids). The real text of the nodes
 * a character can see travels in a per-character record on that Actor (`revealV1`), written by the GM client from the private tree.
 */
export const REVEAL_VALUES = Object.freeze(['progressive']);
export const REVEAL_SCHEMA = 'ag-skill-trees-reveal/0.1';
export const SILHOUETTE_NAME = 'Undiscovered';
const list = v => Array.isArray(v) ? v : [];
/** The known value, or null (absent and unknown values both mean "all shown, as before"). */
export const cleanReveal = v => REVEAL_VALUES.includes(v) ? v : null;
export const isProgressive = tree => tree?.reveal === 'progressive';
const prereqIds = n => [...list(n.requiresAll), ...list(n.requiresAny).flatMap(g => list(g))].filter(x => typeof x === 'string');
const noPrereq = n => !n.unrevealedPrerequisite && !prereqIds(n).length;
/** Fields a per-character record may carry for a node. Anything else is dropped. */
export const DETAIL_FIELDS = Object.freeze(['name', 'description', 'descriptionHtml', 'lane', 'img', 'cost', 'status', 'requiredLevel']);

/** Map of node id → 'shown' | 'silhouette' | 'hidden' for one character's unlocked node ids. */
export function revealStates(tree, unlocks = []) {
  const nodes = list(tree?.nodes), have = new Set(list(unlocks));
  const shown = new Set();
  for (const n of nodes) {
    if (have.has(n.id) || noPrereq(n)) { shown.add(n.id); continue; }
    if (n.unrevealedPrerequisite) continue; // a prerequisite is not released, so it can never be available
    if (list(n.requiresAll).every(id => have.has(id)) && list(n.requiresAny).every(g => list(g).some(id => have.has(id)))) shown.add(n.id);
  }
  const out = new Map();
  for (const n of nodes) {
    out.set(n.id, shown.has(n.id) ? 'shown' : prereqIds(n).some(id => shown.has(id)) ? 'silhouette' : 'hidden');
  }
  return out;
}

/** The text of every shown node that the shared copy masks (those with prerequisites), from a FULL projection. {nodeId: details}. */
export function revealDetails(fullTree, unlocks = []) {
  if (!isProgressive(fullTree)) return {};
  const states = revealStates(fullTree, unlocks), out = {};
  for (const n of list(fullTree.nodes)) {
    if (states.get(n.id) !== 'shown' || noPrereq(n) || n.silhouette) continue;
    out[n.id] = Object.fromEntries(DETAIL_FIELDS.filter(k => n[k] !== undefined && n[k] !== null).map(k => [k, n[k]]));
  }
  return out;
}

const silhouetteOf = (n, keep) => ({
  id: n.id, name: SILHOUETTE_NAME, description: '', img: null, x: n.x, y: n.y, cost: 1, silhouette: true,
  requiresAll: list(n.requiresAll).filter(id => keep.has(id)),
  requiresAny: list(n.requiresAny).map(g => list(g).filter(id => keep.has(id))).filter(g => g.length),
  excludes: [], unrevealedPrerequisite: true
});

/**
 * One character's view of a published tree. Hidden nodes are removed; silhouettes are rebuilt from layout only; shown nodes take their real text
 * from `details` (the character's record) when the shared copy masked it. A shown node with no record stays a silhouette (fails closed).
 * A tree that is not progressive is returned as it is.
 */
export function applyReveal(tree, unlocks = [], details = {}, sanitize = x => x) {
  if (!isProgressive(tree)) return tree;
  const states = revealStates(tree, unlocks);
  const keep = new Set(list(tree.nodes).filter(n => states.get(n.id) !== 'hidden').map(n => n.id));
  const nodes = [];
  for (const n of list(tree.nodes)) {
    const state = states.get(n.id);
    if (state === 'hidden') continue;
    if (state === 'silhouette') { nodes.push(silhouetteOf(n, keep)); continue; }
    let out = n;
    if (n.silhouette) {
      const d = details && typeof details === 'object' ? details[n.id] : null;
      if (!d || typeof d !== 'object') { nodes.push(silhouetteOf(n, keep)); continue; }
      const text = Object.fromEntries(DETAIL_FIELDS.filter(k => d[k] !== undefined && d[k] !== null).map(k => [k, d[k]]));
      if (text.descriptionHtml !== undefined) text.descriptionHtml = sanitize(text.descriptionHtml);
      out = { ...n, ...text, name: String(text.name ?? ''), description: String(text.description ?? ''), cost: Number.isSafeInteger(text.cost) ? text.cost : 1, silhouette: false };
      if (typeof out.img !== 'string') out.img = null;
    }
    nodes.push({
      ...out,
      requiresAll: list(out.requiresAll).filter(id => keep.has(id)),
      requiresAny: list(out.requiresAny).map(g => list(g).filter(id => keep.has(id))).filter(g => g.length),
      excludes: list(out.excludes).filter(id => keep.has(id))
    });
  }
  return { ...tree, nodes };
}

/**
 * 0.28.0 maintenance plan ("Show Cinder trees to their bearers"): every cinder_milestone tree becomes player-visible with reveal 'progressive',
 * and each of its nodes player-visible and shown. Status, positions, art, tiers, costs, prerequisites and progress are never touched; placeholder
 * nodes (which must stay GM-only and hidden) are skipped. Pure; running it on its own output changes nothing.
 */
export function planShowCinderTrees(trees) {
  const counts = { cinderTrees: 0, treesChanged: 0, nodesChanged: 0, nodesSkipped: 0, notReleased: 0 };
  const out = list(trees).map(t => {
    if (t?.provider?.kind !== 'cinder_milestone') return t;
    counts.cinderTrees++;
    let changed = false;
    const next = { ...t };
    if (next.visibility !== 'player') { next.visibility = 'player'; changed = true; }
    if (next.reveal !== 'progressive') { next.reveal = 'progressive'; changed = true; }
    if (next.status === 'draft') counts.notReleased++;
    next.nodes = list(t.nodes).map(n => {
      if (n.status === 'placeholder') { counts.nodesSkipped++; return n; }
      if (n.visibility === 'player' && n.display === 'shown') return n;
      counts.nodesChanged++; changed = true;
      return { ...n, visibility: 'player', display: 'shown' };
    });
    if (changed) counts.treesChanged++;
    return changed ? next : t;
  });
  return { trees: out, counts };
}
/** The notice the GM reads after the action. */
export function showCinderTreesText(c) {
  if (!c.cinderTrees) return 'There are no Cinder trees to show.';
  const parts = [c.treesChanged
    ? `Updated ${c.treesChanged} of ${c.cinderTrees} Cinder tree${c.cinderTrees === 1 ? '' : 's'} (${c.nodesChanged} perk${c.nodesChanged === 1 ? '' : 's'} set to shown).`
    : `All ${c.cinderTrees} Cinder tree${c.cinderTrees === 1 ? ' is' : 's are'} already shown to their bearers; nothing changed.`];
  if (c.notReleased) parts.push(`${c.notReleased} still in draft and not shown to players.`);
  if (c.nodesSkipped) parts.push(`${c.nodesSkipped} placeholder perk${c.nodesSkipped === 1 ? '' : 's'} left GM-only.`);
  parts.push('Player view republished.');
  return parts.join(' ');
}
