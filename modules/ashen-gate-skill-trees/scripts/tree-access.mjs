/**
 * Which trees a character can see, given the proficiency gate (0.27.0). Pure; main.js gathers the facts.
 *
 * A tree may carry `access` (tool and/or skill proficiencies, any one of them is enough). The requirement is per TREE, not per
 * perk: each Artistry sub-tree (Literary Arts, Music, ...) has its own `access`, and a perk's "Tool" row is only description text.
 * For a player:
 *  - no `access`, or nobody could check it (no Profession Ledger): the tree stays visible, nothing is guessed;
 *  - the Ledger says the character has the proficiency: visible;
 *  - the Ledger says it does not, and the character owns no perk in the tree: hidden;
 *  - the Ledger says it does not, but the character owns perks there: visible, with the note "Needs … proficiency".
 * The GM is never filtered: every tree is visible, and a tree that players like this character would not see is marked.
 */
import {cleanAccess} from './engine.mjs';

export const VISIBILITY_CONTRACT = 'ag-tree-visibility/1';
export const HIDDEN_REASON = 'proficiency';

/**
 * @param {object} p
 * @param {object} p.tree      the tree (needs `access`)
 * @param {object|null} p.check the Ledger's answer {ok:boolean}, or null when there is no gate or nobody could check
 * @param {boolean} p.owned    the character has at least one perk in this tree
 * @param {boolean} p.asGM     the viewer is a GM
 * @param {string} p.line      "Needs … proficiency" for this tree ('' when none)
 * @returns {{visible:boolean, hiddenFromPlayers:boolean, reason:string|null, note:string}}
 */
export function classifyTree({tree, check = null, owned = false, asGM = false, line = ''}) {
  const gated = Boolean(cleanAccess(tree?.access)) && check != null && check.ok === false;
  if (!gated) return {visible: true, hiddenFromPlayers: false, reason: null, note: ''};
  if (asGM) return {visible: true, hiddenFromPlayers: !owned, reason: owned ? null : HIDDEN_REASON, note: line};
  if (owned) return {visible: true, hiddenFromPlayers: false, reason: null, note: line};
  return {visible: false, hiddenFromPlayers: false, reason: HIDDEN_REASON, note: line};
}

/** "2 trees hidden until you have the right tool proficiency" ('' for none). */
export const hiddenHint = count => count > 0 ? `${count} tree${count === 1 ? '' : 's'} hidden until you have the right tool proficiency` : '';

/** Full answer for one character: rows in the given order, the hidden count and the hint. rows: [{tree, ...classifyTree()}] */
export function visibilitySummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const hiddenCount = list.filter(r => !r.visible).length;
  return {hiddenCount, hint: hiddenHint(hiddenCount)};
}
