/**
 * 0.36.1: after a pin is placed, check that Foundry really drew it, pan to it if it is off screen, and say in plain words why it is
 * not visible when it is not. Used by the editor's Place on map button and by dragging a location onto the map. Never throws.
 * Everything arrives through `deps`, so it is testable without Foundry.
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The canvas object (PlaceableObject) for a Note document, waiting a few frames for the canvas to draw it. */
export async function findNoteObject(doc, canvas, {tries = 6, delay = 50, wait = sleep} = {}) {
  for (let i = 0; i < tries; i++) {
    const found = doc?.object ?? [...(canvas?.notes?.placeables ?? [])].find(p => p?.document?.id === doc?.id || p?.id === doc?.id);
    if (found) return found;
    await wait(delay);
  }
  return null;
}

/** Plain-words reasons the drawn pin cannot be seen. Empty when it looks fine. */
export function hiddenReasons(obj, doc, {canvas, game} = {}) {
  const out = [];
  if (!obj) return ['Foundry did not draw it on the map'];
  const size = Number(doc?.iconSize ?? obj.document?.iconSize);
  if (!Number.isFinite(size) || size <= 0) out.push('its size is zero');
  const src = doc?.texture?.src ?? obj.document?.texture?.src;
  if (!src) out.push('its picture is empty');
  const opacity = Number(obj.alpha ?? 1), icon = obj.controlIcon;
  if (opacity === 0 || (icon && Number(icon.alpha) === 0)) out.push('it is fully transparent');
  const w = icon ? Number(icon.width) : NaN, h = icon ? Number(icon.height) : NaN;
  if (icon && (w === 0 || h === 0 || Number.isNaN(w) || Number.isNaN(h))) out.push('it has no drawn size');
  const hiddenFlag = obj.visible === false || obj.isVisible === false || doc?.hidden === true;
  if (hiddenFlag) {
    let toggledOff = false;
    try { toggledOff = game?.settings?.get?.('core', 'notesDisplayToggle') === false && canvas?.notes?.active !== true; } catch { /* not readable */ }
    out.push(toggledOff ? 'Map Notes are turned off in the scene controls (use the Map Notes toggle, or open the Notes layer)' : 'Foundry marked it hidden');
  }
  return out;
}

/** Is the point outside the part of the scene on screen? */
export function isOffScreen(canvas, x, y) {
  const s = canvas?.app?.screen, pivot = canvas?.stage?.pivot, scale = Number(canvas?.stage?.scale?.x) || 1;
  if (!s || !pivot) return false;
  return Math.abs(x - pivot.x) > (s.width / 2) / scale || Math.abs(y - pivot.y) > (s.height / 2) / scale;
}

/**
 * Confirms a placement. Returns {ok, reasons, panned}. Success shows "Placed <name> on <scene>."; a pin that is not visible shows one warning
 * that names the position and the reasons, and the details go to the console.
 */
export async function confirmPlacement({note, name, scene, x, y, canvas, game, notify, wait, log = console}) {
  let obj = null, reasons = [], panned = false;
  try {
    if (canvas?.scene && scene && canvas.scene.id !== scene.id) reasons = ['that scene is not the one on screen'];
    else {
      obj = await findNoteObject(note, canvas, {wait});
      reasons = hiddenReasons(obj, note, {canvas, game});
    }
    const px = Math.round(Number(note?.x ?? x)), py = Math.round(Number(note?.y ?? y));
    if (!reasons.length && Number.isFinite(px) && Number.isFinite(py) && isOffScreen(canvas, px, py) && typeof canvas.animatePan === 'function') {
      panned = true;
      try { await canvas.animatePan({x: px, y: py, duration: 500}); } catch { /* the pin is still placed */ }
    }
    if (reasons.length) {
      notify.warn(`${name} was placed at ${px}, ${py} on ${scene?.name}, but you may not see it because ${reasons.join(' and ')}.`);
      log.warn?.('ashen-gate-locations | placed pin is not visible', {noteId: note?.id, x: px, y: py, scene: scene?.id, reasons, drawn: !!obj});
    } else notify.info(`Placed ${name} on ${scene?.name}.`);
  } catch (err) {
    log.warn?.('ashen-gate-locations | could not confirm the placed pin', err);
    notify.info(`Placed ${name} on ${scene?.name}.`);
  }
  return {ok: reasons.length === 0, reasons, panned};
}
