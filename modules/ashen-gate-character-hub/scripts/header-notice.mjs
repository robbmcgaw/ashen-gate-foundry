/**
 * Character notices in the Hub's window title bar (0.54.0, Robb): a short status line between the title and the
 * window buttons. Until 0.52.0 the resurrection-diamond message sat in the Inventory panel; it is a character-level
 * notice, so it now shows on every tab. Display only: not stored, not clickable.
 *
 * Responsive rule (CSS, character-hub.css): the title bar is a named container. Wide: the first notice as one line
 * of text (+N for the rest). Narrow (under 900px, the Hub's own narrow width) or Compact: the text is hidden first
 * and a small icon button takes its place, carrying every notice in its aria-label and tooltip; a click shows them
 * as a Foundry notification. Exactly one of the two is displayed at a time, so a screen reader reads it once.
 */
import {esc, DIAMOND_PRESENT, DIAMOND_ABSENT} from './constants.mjs';
import {hasDiamond} from './tabs.mjs';

/**
 * The notices for a character, first = most important. Same rule as the old Inventory banner: any item with
 * "diamond" in its name (containers' contents too) means present, otherwise absent. Limited observers see no notices
 * (they never saw the Inventory tab).
 */
export function headerNotices(actor, {limited = false} = {}) {
  if (!actor || limited) return [];
  return hasDiamond(actor)
    ? [{id: 'diamond', tone: 'ok', icon: 'fa-solid fa-gem', text: DIAMOND_PRESENT}]
    : [{id: 'diamond', tone: 'danger', icon: 'fa-solid fa-gem', text: DIAMOND_ABSENT}];
}

/** Markup for the title bar: wide text version plus the narrow icon button. Empty string when there are no notices. */
export function headerNoticeHtml(notices, {compact = false} = {}) {
  if (!notices?.length) return '';
  const [first, ...rest] = notices, all = notices.map(n => n.text).join('. ');
  const more = rest.length ? `<span class="agch-notice__more" data-tooltip="${esc(rest.map(n => n.text).join('. '))}" aria-label="${rest.length} more: ${esc(rest.map(n => n.text).join('. '))}">+${rest.length}</span>` : '';
  return `<div class="agch-notice" data-agch-notice data-compact="${compact ? 'true' : 'false'}">
    <p class="agch-notice__text is-${esc(first.tone)}" role="status"><i class="${esc(first.icon)}" aria-hidden="true"></i><span class="agch-notice__label">${esc(first.text)}</span></p>${more}
    <button type="button" class="agch-notice__icon is-${esc(first.tone)}" data-notice-button aria-label="${esc(all)}" data-tooltip="${esc(all)}"><i class="${esc(first.icon)}" aria-hidden="true"></i>${rest.length ? `<span class="agch-notice__count">+${rest.length}</span>` : ''}</button>
  </div>`;
}

/**
 * Puts the notices into the window's title bar, after the title and before the window buttons. Called on every
 * render; the bar is only touched when what it shows has changed, so a screen reader does not hear it again.
 */
export function syncHeaderNotice(sheet) {
  const header = sheet?.window?.header, doc = header?.ownerDocument ?? globalThis.document;
  if (!header || !doc?.createElement) return;
  const html = headerNoticeHtml(headerNotices(sheet.document, {limited: sheet.hubContext?.limited === true}), {compact: sheet.compact === true});
  let slot = header.querySelector?.('[data-agch-notice-slot]');
  if (!html) { slot?.remove?.(); return; }
  if (!slot) {
    slot = doc.createElement('div');
    slot.className = 'agch-notice-slot'; slot.setAttribute('data-agch-notice-slot', '');
    const title = sheet.window?.title;
    if (title?.after) title.after(slot); else header.append(slot);
    slot.addEventListener?.('click', ev => {
      if (!ev.target?.closest?.('[data-notice-button]')) return;
      const text = ev.target.closest('[data-notice-button]').getAttribute('aria-label');
      try { globalThis.ui?.notifications?.info?.(text, {console: false}); } catch {}
    });
  }
  if (slot._agchHtml !== html) { slot.innerHTML = html; slot._agchHtml = html; }
}
