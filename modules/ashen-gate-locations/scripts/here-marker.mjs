/**
 * 0.36.0: "Your party is here". Pure: no Foundry globals.
 *
 * The places the GM marked Active carry `active: true` (GM records and player views alike; a player's views hold only what that player may
 * see, so a hidden place is never in the input and an unidentified one is the generic row). The marker is drawn where the user can actually
 * SEE the answer: on the folder header or tree row that stands for the active place when it is itself listed there, otherwise on the nearest
 * collapsed ancestor. A visible place row already carries its own "Here now" badge, so rows that are showing get no second marker.
 */
import {buildTree} from './tree.mjs';
import {GM_ACCESS} from './region-groups.mjs';

export const HERE_TEXT = 'Your party is here';
const on = i => i?.active === true;

/** Does this section (its own Region place, a row, or anything inside) hold an active place? */
export const sectionHasHere = s => on(s.item) || s.rows.some(on) || s.sections.some(sectionHasHere);
/** Does anything below this tree node hold an active place? */
export const nodeHasHereBelow = n => n.children.some(c => on(c.item) || nodeHasHereBelow(c));

/**
 * Which header sections and which tree rows show the marker.
 * `sections`: buildRegionSections output. `folded(sectionId)` / `open(nodeId)`: what the user currently sees. `nested`: players (rows nest under
 * a non-Region parent); the GM's rows are plain. Returns {sections: Set<section id>, nodes: Set<node id>}.
 */
export function hereMarks(sections, {folded = () => false, open = () => true, nested = true, access = GM_ACCESS, sort = null} = {}) {
  const out = {sections: new Set(), nodes: new Set()};
  const walkNodes = nodes => {
    for (const n of nodes) {
      if (!n.children.length) continue;
      if (!open(n.id)) { if (nodeHasHereBelow(n)) out.nodes.add(n.id); } else walkNodes(n.children);
    }
  };
  const walk = s => {
    if (on(s.item)) out.sections.add(s.id); // the Region (or container) IS the active place: its header is its row
    if (folded(s.id)) { if (sectionHasHere(s)) out.sections.add(s.id); return; }
    if (nested) walkNodes(buildTree(s.rows, {...access, sort}));
    for (const c of s.sections) walk(c);
  };
  for (const s of sections) walk(s);
  return out;
}

/** The marker's markup: a pin icon with an accessible name and a tooltip. Shape, not colour, carries the meaning. */
export const hereMarkHtml = (esc = String) =>
  `<span class="agl-here" role="img" aria-label="${esc(HERE_TEXT)}" data-tooltip="${esc(HERE_TEXT)}" data-tooltip-class="ag-tooltip"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>`;
