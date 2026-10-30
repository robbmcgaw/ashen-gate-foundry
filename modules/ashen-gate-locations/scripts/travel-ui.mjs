/**
 * 0.33.0 Travel, the user-facing parts: the scene chooser, the one flow every Travel button uses, a small right-click menu, and the
 * right-click handler on this module's Map Notes. All permission decisions are the API's (travelScenes / travelToLocation); nothing here decides who may go.
 *
 * Why the module draws its own pin menu (Foundry V14 build 367, from the core code the pin look already relies on): a Note is a canvas
 * object, so there is no DOM element for a context-menu hook to attach to, a player's right-click on a Note has no core menu at all, and a
 * GM's opens nothing we can extend. So each bound Note's `controlIcon` gets a PIXI `rightclick` listener (added once, on refreshNote) that
 * opens this DOM menu at the pointer. Core's own handling of the same click is left alone.
 */
import {MODULE_ID} from './model.mjs';
import {choiceDialog, esc} from './ag-dialogs.mjs';
import {travelLabel, TRAVEL_UNAVAILABLE} from './travel.mjs';

const apiOf = () => globalThis.game?.modules?.get?.(MODULE_ID)?.api;
const warn = text => globalThis.ui?.notifications?.warn?.(text);
const info = text => globalThis.ui?.notifications?.info?.(text);

/** Asks which of several scenes. Resolves a scene uuid, or null on Cancel. Names are the ones this user may already see. */
export async function chooseScene(scenes) {
  const picked = await choiceDialog('Travel to scene',
    '<p>Choose a scene to view. Only you move; other players stay where they are.</p>',
    scenes.map(s => ({action: s.uuid, label: esc(s.name || 'Scene'), icon: 'fa-solid fa-map'})), {cancel: 'Cancel'});
  return scenes.some(s => s.uuid === picked) ? picked : null;
}

/**
 * The one Travel flow: no choice -> says so; one -> goes; several -> asks first. Resolves the API result ({ok, ...}) or {ok: false, reason}.
 * Never silent (0.36.0): a refusal or a failure is shown as a warning with a short reason, and "already there" as a note.
 */
export async function travel(ref, {api = apiOf(), choose = chooseScene, notify = warn, inform = info} = {}) {
  const fail = reason => { notify(reason || TRAVEL_UNAVAILABLE); return {ok: false, reason: reason || TRAVEL_UNAVAILABLE}; };
  try {
    let scenes = [];
    try { scenes = api?.travelScenes?.(ref) ?? []; } catch { scenes = []; }
    if (!scenes.length) { const r = await api?.travelToLocation?.(ref) ?? {ok: false, reason: TRAVEL_UNAVAILABLE}; if (!r.ok) notify(r.reason || TRAVEL_UNAVAILABLE); return r; }
    let sceneUuid = scenes[0].uuid;
    if (scenes.length > 1) {
      sceneUuid = await choose(scenes);
      if (!sceneUuid) return {ok: false, reason: 'cancelled'};
    }
    const r = await api.travelToLocation(ref, {sceneUuid});
    if (!r?.ok) return fail(r?.reason);
    if (r.already) inform("You're already viewing that scene.");
    return r;
  } catch (err) {
    console.warn(`${MODULE_ID} | Travel failed`, err);
    return fail('That scene could not be opened right now.');
  }
}

/** Number of scenes `ref` offers this user (0 hides every Travel control). */
export function travelCount(ref, api = apiOf()) {
  try { return api?.travelScenes?.(ref)?.length ?? 0; } catch { return 0; }
}

let openMenu = null;
export function closeTravelMenu() { openMenu?.close(); }

/**
 * A one-item menu at (x, y) in the page: a plain button (no menu role, so no arrow-key promise), focused on open; Escape, a click elsewhere,
 * scrolling or the window losing focus close it, and focus returns to `returnFocus`. Resolves nothing; the click runs travel(ref).
 */
export function showTravelMenu({ref, x = 0, y = 0, count, doc = globalThis.document, returnFocus = null, run = travel} = {}) {
  closeTravelMenu();
  const body = doc?.body;
  if (!body) return null;
  const menu = doc.createElement('div');
  menu.className = 'agl-ctx ag-app';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Location actions');
  const item = doc.createElement('button');
  item.type = 'button';
  item.className = 'ag-btn ag-btn--sm agl-ctx__item';
  item.innerHTML = `<i class="fa-solid fa-map" aria-hidden="true"></i><span>${esc(travelLabel(count ?? travelCount(ref)))}</span>`;
  menu.append(item);
  menu.style.left = `${Math.max(0, Math.round(x))}px`;
  menu.style.top = `${Math.max(0, Math.round(y))}px`;
  const onDown = ev => { if (!menu.contains(ev.target)) close(); };
  const onKey = ev => { if (ev.key === 'Escape') { ev.stopPropagation?.(); close(true); } };
  const close = (restore = false) => {
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('wheel', onDown, true);
    menu.remove();
    if (openMenu?.menu === menu) openMenu = null;
    if (restore) returnFocus?.focus?.();
  };
  item.addEventListener('click', ev => { ev.preventDefault(); close(); Promise.resolve(run(ref)).catch(err => console.error(`${MODULE_ID} |`, err)); });
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('wheel', onDown, true);
  body.append(menu);
  item.focus?.();
  openMenu = {menu, close};
  return menu;
}

/** Right-click (or the keyboard's context-menu key) on a list row: the same menu, only where the API offers a scene. Returns true if it opened. */
export function onRowContextMenu(ev, ref, deps = {}) {
  const count = travelCount(ref, deps.api);
  if (!count) return false;
  ev.preventDefault?.();
  let {clientX: x, clientY: y} = ev;
  if (!x && !y) { const r = ev.currentTarget?.getBoundingClientRect?.(); x = r?.left ?? 0; y = (r?.bottom ?? 0); } // keyboard: under the row
  showTravelMenu({ref, x, y, count, returnFocus: ev.currentTarget, ...deps});
  return true;
}

/* ---------- Map Notes ---------- */
const BOUND = Symbol.for(`${MODULE_ID}.travelBound`);
/** The location reference a Note stands for. A companion (the generic unidentified pin) and a Note with no pin key never travel. */
export const travelRefOf = note => {
  try {
    const d = note?.document;
    if (d?.getFlag?.(MODULE_ID, 'companionKey') || d?.getFlag?.(MODULE_ID, 'partyMarker') === true) return '';
    return d?.getFlag?.(MODULE_ID, 'pinKey') || d?.getFlag?.(MODULE_ID, 'locationId') || '';
  } catch { return ''; }
};

/** Adds the right-click listener to one Note's icon, once. Returns true when it was added. Never throws. */
export function bindPinTravel(note, deps = {}) {
  try {
    const icon = note?.controlIcon;
    if (!icon || typeof icon.on !== 'function' || icon[BOUND] || !travelRefOf(note)) return false;
    icon[BOUND] = true;
    icon.on('rightclick', ev => {
      try {
        const ref = travelRefOf(note); // read at click time: the Note may have been rebound
        const count = ref ? travelCount(ref, deps.api) : 0;
        if (!count) return;
        const e = ev?.nativeEvent ?? ev?.data?.originalEvent ?? ev;
        e?.preventDefault?.();
        showTravelMenu({ref, x: e?.clientX ?? 0, y: e?.clientY ?? 0, count, ...deps});
      } catch (err) { console.warn(`${MODULE_ID} | pin Travel menu failed`, err); }
    });
    return true;
  } catch { return false; }
}

/** Registers the refreshNote listener that binds each pin. Called once from init. */
export function registerPinTravel(hooks = globalThis.Hooks) {
  hooks.on('refreshNote', note => { bindPinTravel(note); });
}
