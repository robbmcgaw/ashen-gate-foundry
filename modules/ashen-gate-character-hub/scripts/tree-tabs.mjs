/**
 * 0.72.0: Ashen Gate → Skill Trees helpers (pure, no Foundry globals except through the arguments).
 * The Hub stores nothing here: points, perks and gates stay Skill Trees' own state. These functions only word what
 * Skill Trees reports (why a perk is locked), ask it which trees to show (tree visibility, feature-detected) and build the
 * small Professions | Cinders shell around the list.
 */
import {esc, num} from './constants.mjs';

const GENERIC = /^(prerequisite required|an alternative prerequisite is required)$/i;
const nameOf = (x, tree) => {
  if (x && typeof x === 'object') return String(x.name ?? '').trim();
  const hit = (tree?.nodes ?? []).find(n => n.id === x);
  return String(hit?.name ?? '').trim();   // an id that can't be named is dropped, never shown
};
const listOf = v => (Array.isArray(v) ? v : []);

/**
 * What a locked perk needs, in words. Skill Trees' own reason is shown as given when it is specific ("Needs … proficiency",
 * "Needs profession level 3 (now 1)"). The generic "Prerequisite required" is made specific when the perk row names its
 * prerequisites (`requiresAll` / `requiresAny` / `requires` / `prerequisites`: perk names, or ids of perks in the same tree);
 * otherwise it says what kind of thing is needed. Never prints an id.
 */
export function lockedNeed(node, tree = null) {
  const reason = String(node?.reason ?? '').trim();
  if (reason && !GENERIC.test(reason)) return reason;
  const all = listOf(node?.requiresAll ?? node?.requires ?? node?.prerequisites).map(x => nameOf(x, tree)).filter(Boolean);
  const any = listOf(node?.requiresAny).map(g => listOf(g).map(x => nameOf(x, tree)).filter(Boolean)).filter(g => g.length);
  const parts = [...(all.length ? [all.join(' and ')] : []), ...any.map(g => g.join(' or '))];
  if (parts.length) return `Needs ${parts.join(', and ')}`;
  if (/^an alternative/i.test(reason)) return 'Needs one of several earlier perks in this tree';
  if (reason) return 'Needs an earlier perk in this tree';
  return String(tree?.access ?? '').trim();
}

/**
 * Skill Trees' tree-visibility function, when it has one (feature-detected, never reimplemented). Assumed names, tried in order:
 * api.treeVisibility(actorId) or api.visibleTrees(actorId). The answer may be an object {hiddenTreeIds | visibleTreeIds, hint}
 * (arrays or Sets of tree ids), or an array of visible tree ids / rows {id | treeId, visible}. Returns null when there is no such
 * function (or it throws): the list is then left unchanged.
 */
export function treeVisibility(api, actorId) {
  const fn = ['treeVisibility', 'visibleTrees'].map(k => api?.[k]).find(f => typeof f === 'function');
  if (!fn) return null;
  let r;
  try { r = fn.call(api, actorId); } catch { return null; }
  const ids = v => new Set(listOf(v instanceof Set ? [...v] : v).map(String));
  if (Array.isArray(r)) {
    if (r.every(x => x && typeof x === 'object')) {
      const rows = r.map(x => ({id: String(x.id ?? x.treeId ?? ''), visible: x.visible !== false && x.hidden !== true}));
      return {hidden: new Set(rows.filter(x => !x.visible).map(x => x.id)), visible: null, hint: ''};
    }
    return {hidden: new Set(), visible: ids(r), hint: ''};
  }
  if (!r || typeof r !== 'object') return null;
  return {hidden: ids(r.hiddenTreeIds ?? r.hidden), visible: r.visibleTreeIds ?? r.visible ? ids(r.visibleTreeIds ?? r.visible) : null, hint: String(r.hint ?? r.hintText ?? '').trim()};
}
/** embed.data groups minus the trees Skill Trees says to hide (a group left with no tree goes too). Unchanged without a visibility answer. */
export function applyVisibility(groups, vis) {
  if (!vis) return groups;
  const keep = m => !vis.hidden.has(String(m.id)) && (!vis.visible || vis.visible.has(String(m.id)));
  return groups.map(g => ({...g, trees: (g.trees ?? []).filter(keep)})).filter(g => g.trees.length);
}

const plural = (n, word) => `${num(n)} ${word}${num(n) === 1 ? '' : 's'}`;
/** One line of progress for a Cinder's tree from Skill Trees' embed.data model: "2 of 5 perks · 1 point to spend". */
export function cinderTreeSummary(groups, treeId) {
  const m = treeId ? groups.flatMap(g => g.trees ?? []).find(t => t.id === treeId) : null;
  if (!m) return '';
  const nodes = listOf(m.nodes), got = nodes.filter(n => n.unlocked).length;
  const pts = m.available === null || m.available === undefined ? '' : ` · ${plural(m.available, 'point')} to spend`;
  return `${got} of ${plural(nodes.length, 'perk')} unlocked${pts}`;
}

/**
 * The Cinders tab: one row per bound Cinder with its tree progress and an Open Skill Trees… button (data-tree when the
 * Cinder's tree is known). `button(treeId)` builds the button; no bound Cinder is an empty state, not a hidden tab.
 */
export function cindersTabHtml(cinders, groups, button) {
  if (!cinders.length) return '<div class="ag-empty"><i class="fa-solid fa-fire" aria-hidden="true"></i><p class="ag-empty__title">No Cinder bound yet.</p><p class="ag-empty__text">A bound Cinder and its skill tree show here.</p></div>';
  return `<ul class="agch-plist agch-stcinders">${cinders.map(c => {
    const line = cinderTreeSummary(groups, c.treeId);
    return `<li><strong>${esc(c.name)}</strong> ${line ? `<span class="agch-muted">${esc(line)}</span>` : ''} ${button(c.treeId)}</li>`;
  }).join('')}</ul>`;
}
