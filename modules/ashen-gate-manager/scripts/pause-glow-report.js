/**
 * Pause glow report (0.60.8). A read-only helper for the GM: while the game is paused, lists the big screen-sized elements
 * (and their ::before/::after) that carry a shadow, filter, blur, animation or overlay background, so the real source of a
 * pause glow can be named. Reads computed styles only; changes nothing. Run it with the game paused:
 *   game.modules.get('ashen-gate-manager').api.pauseGlowReport()
 */
const PSEUDOS = [null, '::before', '::after'];
const MAX_ELEMENTS = 6000;

/** A short selector-like name: tag#id.class.class (first three classes). */
export function describeElement(el) {
  if (!el) return '';
  const tag = String(el.tagName ?? el.tag ?? '').toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = [...(el.classList ?? String(el.className ?? '').split(/\s+/))].filter(Boolean).slice(0, 3).map(c => `.${c}`).join('');
  return `${tag}${id}${classes}`;
}

const isSet = v => v !== undefined && v !== null && v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto';
const isClear = v => !v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'none';

/** Which of the suspect properties a computed style carries. Pure: takes a style-like object. */
export function suspectProps(style, pseudo) {
  const found = [];
  if (isSet(style.boxShadow)) found.push(`box-shadow: ${style.boxShadow}`);
  if (isSet(style.filter)) found.push(`filter: ${style.filter}`);
  if (isSet(style.backdropFilter)) found.push(`backdrop-filter: ${style.backdropFilter}`);
  if (isSet(style.animationName)) found.push(`animation: ${style.animationName}`);
  if (pseudo && isSet(style.content) && style.content !== '""' && (!isClear(style.backgroundColor) || isSet(style.backgroundImage))) {
    found.push(`overlay background: ${isSet(style.backgroundImage) ? style.backgroundImage : style.backgroundColor}`);
  }
  return found;
}

/** Large enough to be a screen layer: spans most of the width or the height of the window. */
export function isScreenSized(rect, view) {
  if (!rect || !view) return false;
  return rect.width >= view.width * 0.5 || rect.height >= view.height * 0.5;
}

/**
 * Returns [{element, pseudo, props}] for screen-sized elements with suspect styles.
 * The label (#ag-pause-pill) is skipped. Never throws on one bad element.
 */
export function collectPauseGlowRows({doc = globalThis.document, win = globalThis.window} = {}) {
  if (!doc?.querySelectorAll || !win?.getComputedStyle) return [];
  const view = {width: win.innerWidth || 0, height: win.innerHeight || 0};
  const nodes = [doc.documentElement, ...doc.querySelectorAll('*')].filter(Boolean).slice(0, MAX_ELEMENTS);
  const rows = [];
  for (const el of nodes) {
    if (el.id === 'ag-pause-pill') continue;
    try {
      if (!isScreenSized(el.getBoundingClientRect?.(), view)) continue;
      for (const pseudo of PSEUDOS) {
        const props = suspectProps(win.getComputedStyle(el, pseudo), pseudo);
        if (props.length) rows.push({element: describeElement(el), pseudo: pseudo ?? '', props: props.join('; ')});
      }
    } catch { /* skip this element */ }
  }
  return rows;
}

/** GM-only. Logs a table and returns the rows plus a short note; the game state is only read. */
export function pauseGlowReport({doc = globalThis.document, win = globalThis.window, game = globalThis.game, log = console} = {}) {
  if (!game?.user?.isGM) return {ok: false, message: 'Only the GM can run the pause glow report.', rows: []};
  const paused = Boolean(game.paused);
  const rows = collectPauseGlowRows({doc, win});
  const message = paused
    ? (rows.length ? `${rows.length} screen-sized element(s) with a shadow, filter, animation or overlay. Look for a coloured (teal/blue) one.` : 'Nothing screen-sized with a shadow, filter or overlay was found.')
    : 'The game is not paused. Pause it first (the Pause button, or the space bar), then run this again.';
  if (log?.table && rows.length) log.table(rows);
  log?.info?.(`[ashen-gate-manager] ${message}`);
  return {ok: true, paused, message, rows};
}
