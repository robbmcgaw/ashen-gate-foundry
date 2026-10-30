/**
 * 0.36.1: dragging a location from the Locations list onto the canvas places a Map Note there. Two paths reach the same placement:
 * a capture-phase DOM `drop` listener on the canvas element (runs before Foundry's own drop handling, so another module that swallows
 * `dropCanvasData` cannot stop it) and the `dropCanvasData` hook (kept as a fallback). Whichever fires first places the pin; the other
 * sees the same drop and does nothing. Never silent: a placement says where it went, and a drop that cannot be placed says why.
 * Pure of Foundry globals: everything arrives through `deps`.
 */
export const DROP_TYPE = 'AshenGateLocation';
const DUPLICATE_MS = 750;

let dragging = null;
/** The list sets this on dragstart (and clears it on dragend) so dragover can tell our drag from any other. */
export const setDragging = type => { dragging = type || null; };

export function parseDrop(event) {
  try {
    const raw = event?.dataTransfer?.getData?.('text/plain');
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}

/**
 * deps: {isGM(), api() -> module api, canvas() -> canvas, notify: {info, warn, error}, confirm?({note, name, scene, x, y}), now?}
 * Returns {onHook, onDrop, onDragOver, attach, detach}.
 */
export function createCanvasDrop(deps) {
  const now = deps.now ?? (() => Date.now());
  const seen = new WeakSet();
  let last = {key: '', at: -Infinity};
  let bound = null;

  const duplicate = (event, id, x, y) => {
    if (event && typeof event === 'object') {
      if (seen.has(event)) return true;
      seen.add(event);
    }
    const key = `${id}|${Math.round(x ?? 0)}|${Math.round(y ?? 0)}`;
    const t = now();
    if (last.key === key && t - last.at < DUPLICATE_MS) return true;
    last = {key, at: t};
    return false;
  };

  async function place(data, x, y, event) {
    const canvas = deps.canvas();
    const scene = canvas?.scene;
    if (!data?.id) { deps.notify.warn('That location could not be placed: the drop did not say which location it was.'); return; }
    if (!scene) { deps.notify.warn('Open a scene before placing a location.'); return; }
    if (!Number.isFinite(x) || !Number.isFinite(y)) { deps.notify.warn('That location could not be placed: the drop position could not be read.'); return; }
    if (duplicate(event, data.id, x, y)) return;
    const api = deps.api();
    let name = data.id;
    try { name = api.getLocation(data.id)?.name || name; } catch { /* the placement below reports a real problem */ }
    try {
      const note = await api.placeOnScene(data.id, {scene, x, y});
      if (deps.confirm) await deps.confirm({note, name, scene, x, y});
      else deps.notify.info(`Placed ${name} on ${scene.name}.`);
    } catch (err) {
      last = {key: '', at: -Infinity}; // a failed drop may be tried again at once
      deps.notify.error(err);
    }
  }

  /** The capture-phase DOM drop on the canvas element. */
  function onDrop(event) {
    const data = parseDrop(event);
    if (data?.type !== DROP_TYPE || !deps.isGM()) return;
    event.preventDefault();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    setDragging(null);
    const canvas = deps.canvas();
    let x = NaN, y = NaN;
    try {
      const p = canvas?.canvasCoordinatesFromClient?.({x: event.clientX, y: event.clientY});
      x = Number(p?.x); y = Number(p?.y);
    } catch { /* reported by place() */ }
    return place(data, x, y, event);
  }

  /** The dragover that lets our drag be dropped; any other drag is left to Foundry. */
  function onDragOver(event) {
    if (dragging !== DROP_TYPE || !deps.isGM()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  /** The `dropCanvasData` hook (fallback). Returns false when it took the drop, as before. */
  function onHook(canvas, data, event) {
    if (data?.type !== DROP_TYPE || !deps.isGM()) return;
    const x = Number.isFinite(Number(data.x)) ? Number(data.x) : NaN;
    const y = Number.isFinite(Number(data.y)) ? Number(data.y) : NaN;
    place(data, x, y, event);
    return false;
  }

  function detach() {
    if (!bound) return;
    bound.removeEventListener('drop', onDrop, true);
    bound.removeEventListener('dragover', onDragOver, true);
    bound = null;
  }
  /** Binds to the current canvas element (it is recreated, so call this on every canvasReady). */
  function attach(el) {
    detach();
    if (!el?.addEventListener) return false;
    el.addEventListener('drop', onDrop, true);
    el.addEventListener('dragover', onDragOver, true);
    bound = el;
    return true;
  }
  return {onHook, onDrop, onDragOver, attach, detach};
}
