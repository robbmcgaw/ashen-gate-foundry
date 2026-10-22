/**
 * Rich item tooltips (0.15.0): dnd5e's own. The native sheet puts `data-tooltip-html` with a "loading" section that
 * carries the item's UUID on the hovered element (dnd5e.utils.loadingTooltip); dnd5e's Tooltips5e watches Foundry's
 * tooltip element for every window and fills it with the document's richTooltip(). The Hub uses the same markup, so
 * the tooltip is dnd5e's (name, rarity, description, properties, uses) and follows dnd5e's own rules for what a user
 * may see (unidentified items, GM-only price and uses). When dnd5e's tooltips are not there, a plain Foundry tooltip (data-tooltip) stays.
 */
import {esc} from './constants.mjs';

/** True when dnd5e's rich tooltips are running (game.dnd5e.tooltips). */
export const richTooltipsAvailable = () => !!globalThis.game?.dnd5e?.tooltips;

/** dnd5e's loading section for a UUID (its own helper when present, else the same markup). */
export function loadingSection(uuid) {
  const helper = globalThis.dnd5e?.utils?.loadingTooltip;
  if (typeof helper === 'function') return helper({uuid});
  return `<section class="loading" data-uuid="${esc(uuid)}"><i class="fa-solid fa-spinner fa-spin-pulse" inert></i></section>`;
}

/**
 * Attributes for an element that should show the rich tooltip of the document at `uuid`. With dnd5e's tooltips:
 * data-tooltip-html (+ class, direction) and no title (so the browser's own tooltip doesn't double up). Without them:
 * a plain Foundry `data-tooltip` fallback. `kind: 'rule'` is for a dnd5e rules page (weapon masteries, 0.30.0).
 */
export function tooltipAttrs(uuid, title = '', {direction = 'LEFT', kind = 'item'} = {}) {
  if (uuid && richTooltipsAvailable()) return ` data-tooltip-html="${esc(loadingSection(uuid))}" data-tooltip-class="dnd5e2 dnd5e-tooltip ${kind}-tooltip" data-tooltip-direction="${direction}"`;
  return title ? ` data-tooltip="${esc(title)}"` : '';
}
/** The UUID of an Item on an Actor (real Items have .uuid; built from the parent otherwise). */
export const itemUuid = item => item?.uuid ?? (item?.parent?.uuid && item?.id ? `${item.parent.uuid}.Item.${item.id}` : null);
