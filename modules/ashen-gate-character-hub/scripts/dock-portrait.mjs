/**
 * The player-portrait button in General Manager's player dock (0.64.0).
 *
 * Manager (0.81.0+) draws a small dock for players and reserves an empty `[data-agm-dock-slot="portrait"]` in it. When that
 * slot exists, this fills it with the player's own character picture. Double-click (or double-tap, where the browser fires
 * double-click on touch) opens the Character Hub for that character; Enter or Space on the focused picture also opens it.
 * A single mouse click does nothing. The picture is the only control: there is no separate text button (0.66.0). The Hub is opened only through its own public `api.open(actor)`, which
 * refuses non-characters and (for players) characters the user cannot at least see, so nothing is bypassed here.
 *
 * Manager gives no event for "the dock was built" (it appends #agm-player-dock to <body> from its renderSidebar hook and
 * when its settings change), so the Hub watches the Foundry renderSidebar hook and the direct children of <body>, and fills
 * the slot again whenever it is empty. Every pass is idempotent: it updates the button in place and never adds a second one.
 * Manager is only read through the DOM slot; no Manager code or setting is touched. No slot (older Manager, dock off) means
 * nothing happens, and nothing here throws.
 */
import {MODULE_ID} from './constants.mjs';

export const SLOT_SELECTOR = '[data-agm-dock-slot="portrait"]';
export const MARK = 'data-agch-dock-portrait';
export const STOCK_IMAGE = 'icons/svg/mystery-man.svg';

const isCharacter = actor => actor?.type === 'character';
/** The same rule api.open applies to players (LIMITED or better). The GM is never shown the button. */
const canOpen = (actor, user) => isCharacter(actor) && user && !user.isGM && actor.testUserPermission?.(user, 'LIMITED') === true;

/**
 * The character the button stands for: the user's assigned character, else the first character they own, else the actor
 * of the first controlled token. Returns null when none is a character the user may open.
 */
export function dockActor(game = globalThis.game, canvas = globalThis.canvas) {
  const user = game?.user;
  if (!user || user.isGM) return null;
  const assigned = user.character;
  if (canOpen(assigned, user)) return assigned;
  const owned = [...(game.actors ?? [])].find(a => isCharacter(a) && a.testUserPermission?.(user, 'OWNER') === true);
  if (owned) return owned;
  let token = null;
  try { token = canvas?.tokens?.controlled?.[0]?.actor ?? null; } catch { token = null; }
  return canOpen(token, user) ? token : null;
}

const usable = src => typeof src === 'string' && src.trim() !== '' && !src.includes('*');
const isVideo = src => /\.(webm|mp4|m4v|ogv)(\?|#|$)/i.test(src);
/** The picture: the character's prototype token texture, else its portrait, else the user's avatar, else a stock icon. */
export function dockImage(actor, user) {
  const candidates = [actor?.prototypeToken?.texture?.src, actor?.img, user?.avatar];
  return candidates.find(src => usable(src) && !isVideo(src)) ?? STOCK_IMAGE;
}

function el(doc, tag, attrs = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

/**
 * Fills (or updates, or empties) the portrait slot once. `open(actor)` is called with the current actor. Returns the
 * wrapper element, or null when nothing is shown.
 */
export function syncDockPortrait({game = globalThis.game, doc = globalThis.document, canvas = globalThis.canvas, open} = {}) {
  const slot = doc?.querySelector?.(SLOT_SELECTOR);
  if (!slot) return null;
  const existing = slot.querySelector(`[${MARK}]`);
  const actor = dockActor(game, canvas);
  if (!actor) { existing?.remove(); return null; }
  const name = String(actor.name ?? '').trim() || 'your character';
  const src = dockImage(actor, game.user);
  let wrap = existing;
  if (!wrap) {
    const img = el(doc, 'img', {class: 'agch-dock-portrait__img', alt: '', draggable: 'false'});
    const portrait = el(doc, 'button', {type: 'button', class: 'ag-btn agch-dock-portrait__btn', 'data-agch-dock-action': 'portrait'}, [img]);
    wrap = el(doc, 'span', {class: 'agch-dock-portrait', role: 'group', [MARK]: '1'}, [portrait]);
    // Double-click opens. A keyboard Enter/Space on a button arrives as a click with detail 0: that opens too. A mouse or touch single click (detail >= 1) does nothing.
    portrait.addEventListener('dblclick', event => { event.preventDefault?.(); void openFor(wrap, open); });
    portrait.addEventListener('click', event => { if (event.detail === 0) void openFor(wrap, open); });
    slot.append(wrap);
  }
  wrap.actorId = actor.id ?? null;
  wrap.getActor = () => dockActor(game, canvas);
  const portrait = wrap.querySelector('[data-agch-dock-action="portrait"]');
  const img = portrait.querySelector('img');
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  img.setAttribute('alt', `Portrait of ${name}`);
  const label = `Open ${name}`;
  portrait.setAttribute('aria-label', label);
  portrait.setAttribute('data-tooltip', `${label} (double-click)`);
  return wrap;
}

async function openFor(wrap, open) {
  const actor = wrap?.getActor?.();
  if (!actor) return;
  try {
    const res = await open(actor);
    if (res && res.ok === false && res.error) globalThis.ui?.notifications?.warn?.(res.error);
  } catch (error) { console.warn(`${MODULE_ID} | dock portrait could not open the Hub`, error); }
}

/**
 * Starts keeping the slot filled. Returns a function that stops everything (hooks, observer, button). Safe to call
 * without Manager: it only ever looks for the slot.
 */
export function installDockPortrait({game = globalThis.game, hooks = globalThis.Hooks, doc = globalThis.document, canvas = () => globalThis.canvas, Observer = globalThis.MutationObserver, api = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api} = {}) {
  const open = actor => {
    const fn = api()?.open;
    return typeof fn === 'function' ? fn.call(api(), actor) : {ok: false, error: 'The Character Hub is not ready yet.'};
  };
  const run = () => { try { syncDockPortrait({game, doc, canvas: canvas(), open}); } catch (error) { console.warn(`${MODULE_ID} | dock portrait not updated`, error); } };
  const names = ['renderSidebar', 'updateUser', 'updateActor', 'controlToken'];
  const ids = names.map(name => [name, hooks?.on?.(name, run)]);
  let observer = null;
  try {
    if (Observer && doc?.body) { observer = new Observer(run); observer.observe(doc.body, {childList: true}); }
  } catch { observer = null; }
  run();
  return () => {
    for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id);
    try { observer?.disconnect?.(); } catch { /* nothing to stop */ }
    try { doc?.querySelector?.(SLOT_SELECTOR)?.querySelector?.(`[${MARK}]`)?.remove?.(); } catch { /* the slot is gone */ }
  };
}
