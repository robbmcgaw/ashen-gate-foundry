/**
 * Selected-perk panel model (0.27.0). Pure: no Foundry, no DOM, so it runs the same in tests.
 *
 * The panel used to print the perk description as one run-together string. It now shows the perk the way its Item reads: the
 * description table as small label/value chips, the Effect & Rules text as paragraphs, then Notes (perk-card.mjs does the
 * splitting and reuses the sanitiser the hover tooltip uses; nothing here trusts markup it did not sanitise itself). It also
 * decides the three buttons: Unlock / Refund (always shown for the state the perk is in, disabled with a visible reason when
 * the action is not possible) and Open sheet.
 */
import {buildPerkCard} from './perk-card.mjs';
import {sanitizePerkHtml, balanceHtml} from './perk-html.mjs';

const escapeText = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Label/value chips for the perk's description table, as a definition list ('' when there are none). Values are escaped text. */
export function factsHtml(meta) {
  const rows = (meta ?? []).filter(r => r?.label && r?.value);
  if (!rows.length) return '';
  return `<dl class="agst-facts">${rows.map(r => `<div class="agst-fact"><dt>${escapeText(r.label)}</dt><dd>${escapeText(r.value)}</dd></div>`).join('')}</dl>`;
}

/**
 * @param {string} name   perk name
 * @param {string} html   the node's description HTML (already sanitised once; sanitised again here, it is idempotent)
 * @param {string} plain  plain description (used when the perk has no HTML description)
 * @returns {{facts:string, body:string, tier:string}} facts: chip list; body: safe HTML (Effect & Rules paragraphs, then Notes)
 */
export function perkPanelBody(name, html, plain = '') {
  const safe = sanitizePerkHtml(html);
  const card = buildPerkCard(name, safe, safe ? '' : plain);
  // The card folds the effect text away when it is only one sentence; the panel always shows the whole text.
  const text = String(plain ?? '').replace(/\s+/g, ' ').trim();
  const body = card.detailsHtml || (card.summary ? `<p>${escapeText(card.summary)}</p>` : (!safe && text ? `<p>${escapeText(text)}</p>` : ''));
  return {facts: factsHtml(card.meta), body: balanceHtml(body), tier: card.tier};
}

/** Words for the unlock and refund buttons. "Unlock (2 points)…" opens a confirmation, so it ends in an ellipsis. */
export const unlockLabel = cost => `Unlock (${plural(Number.isFinite(cost) && cost > 0 ? cost : 1, 'point')})…`;
export const REFUND_LABEL = 'Refund…';
export const NEEDS_CHARACTER = 'Choose a character first.';
export const PREVIEW_UNLOCK = 'Player preview is read-only. Turn it off to unlock perks.';
export const PREVIEW_REFUND = 'Player preview is read-only. Turn it off to refund perks.';
export const PLAYER_REFUND = 'Only the GM can refund a perk. Ask your GM.';

/**
 * What the Unlock / Refund buttons do for one perk.
 *  unlocked: the character already has it (Refund shows); otherwise Unlock shows.
 *  available / reason: the engine's answer for the viewer (GM rules for the GM, the published rules for a player).
 *  mode: 'gm' (raw GM view), 'player' (a player, or the Test player), 'preview' (the GM's Player preview, read-only).
 * Returns {unlock, refund, primary}: each button is {show, enabled, act, label, reason}; primary names the one worth focusing.
 */
export function panelActions({unlocked = false, available = false, reason = '', cost = 1, mode = 'player', hasActor = true, silhouette = false} = {}) {
  const off = {show: false, enabled: false, act: '', label: '', reason: ''};
  let unlock = {...off}, refund = {...off};
  if (unlocked) {
    const why = !hasActor ? NEEDS_CHARACTER : mode === 'preview' ? PREVIEW_REFUND : mode !== 'gm' ? PLAYER_REFUND : '';
    refund = {show: true, enabled: !why, act: 'refund', label: REFUND_LABEL, reason: why};
  } else {
    const why = !hasActor ? NEEDS_CHARACTER : mode === 'preview' ? PREVIEW_UNLOCK : silhouette ? 'Not yet revealed' : available ? '' : String(reason || 'Not available yet');
    unlock = {show: true, enabled: !why, gm: mode === 'gm', act: mode === 'gm' ? 'purchase' : 'request', label: unlockLabel(cost), reason: why};
  }
  const primary = unlock.show && unlock.enabled ? 'unlock' : refund.show && refund.enabled ? 'refund' : null;
  return {unlock, refund, primary};
}

/** Open sheet…: the GM opens the world perk, a player opens the copy on their own sheet once they have learned it. */
export function sheetAction({gm = false, hasPerk = false, learnedCopy = false, silhouette = false} = {}) {
  if (silhouette) return {enabled: false, reason: 'This perk has not been revealed yet.'};
  if (gm) return hasPerk ? {enabled: true, reason: ''} : {enabled: false, reason: 'This node has no perk sheet to open.'};
  return learnedCopy ? {enabled: true, reason: ''} : {enabled: false, reason: 'Learn this perk to open its sheet.'};
}

/**
 * The sentence under the Locked badge (and in the tree list): what the perk still needs. '' for a perk that is not locked.
 * The engine already names the perks and the proficiency, so this only guards against an empty or bare answer.
 */
export function lockReason({flag, reason}) {
  if (flag !== 'LOCKED') return '';
  const text = String(reason ?? '').trim();
  return !text || /^(available|locked)$/i.test(text) ? 'Not available yet' : text;
}

/** One line for the "Tree as a list" entry: the lock reason for a locked perk, else the requirement sentence. */
export function listNote({flag, reason, relText = '', rivalText = '', requirement = ''}) {
  const first = flag === 'LOCKED' ? lockReason({flag, reason}) : requirement;
  return [first, rivalText].filter(Boolean).join('. ') || relText;
}
