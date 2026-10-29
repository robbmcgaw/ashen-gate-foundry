/**
 * "Hide Region Controls and Journal Notes from players' scene controls" (Manager 0.81.0). Presentation only: no scene,
 * region, note, permission or flag is written, and notes and regions keep working through every other route. The GM is never
 * affected: a tool group is removed only for a non-GM user while the world setting is on.
 *
 * Mechanism (Foundry V14 names, none confirmed in a live world):
 *  1. `getSceneControlButtons`: V13/V14 hand the hook an object keyed by control name (`controls.regions`, `controls.notes`);
 *     older cores hand an array of `{name}`. Both are handled and the group is removed in place. The hook is registered at
 *     module load (before the controls are first built) and reads the setting lazily.
 *  2. DOM fallback, in `hideSceneControlsDom` only: if the controls were already built (or a module re-adds the groups), the
 *     group buttons are hidden with display:none, and restored when the setting goes off.
 *  3. Live change: the controls are rebuilt with `ui.controls.initialize()` (or `render()`), and if the open control was one
 *     of the removed groups the Token controls are activated instead.
 */
export const HIDDEN_CONTROLS = Object.freeze(['regions', 'notes']);
const MARK = 'agmControlHidden';
const TOKENS_NAMES = ['tokens', 'token'];

/** Hide only for a non-GM user with the setting on. */
export const shouldHideControls = ({ isGM, setting }) => !isGM && setting === true;

/** Removes the groups from what the hook was given (object keyed by name, or array of {name}). Returns the names removed. */
export function removeControlGroups(controls, names = HIDDEN_CONTROLS) {
  const removed = [];
  if (Array.isArray(controls)) {
    for (let i = controls.length - 1; i >= 0; i--) {
      if (names.includes(controls[i]?.name)) { removed.push(controls[i].name); controls.splice(i, 1); }
    }
  } else if (controls && typeof controls === 'object') {
    for (const name of names) if (name in controls) { delete controls[name]; removed.push(name); }
  }
  return removed;
}

const controlNames = controls => (Array.isArray(controls) ? controls.map(c => c?.name) : Object.keys(controls ?? {})).filter(Boolean);

/** The name of the open control group, or null (V13 `ui.controls.control.name`, older `activeControl`). */
export const activeControlName = ui => ui?.controls?.control?.name ?? ui?.controls?.activeControl ?? null;

/**
 * The one DOM fallback: hides (or restores, exactly what it hid) the buttons of the removed groups. Looks only in the scene
 * controls. V13/V14 buttons carry `data-control="<name>"`, inside an <li> in the layer menu.
 */
export function hideSceneControlsDom(doc, hidden, names = HIDDEN_CONTROLS) {
  const selector = names.map(n => `#scene-controls [data-control="${n}"]`).join(', ');
  let count = 0;
  for (const button of doc?.querySelectorAll?.(selector) ?? []) {
    const el = button.closest?.('li') ?? button;
    if (hidden) {
      el.hidden = true;
      el.style?.setProperty?.('display', 'none', 'important');
      if (el.dataset) el.dataset[MARK] = '1';
      count++;
    } else if (el.dataset?.[MARK]) {
      el.hidden = false;
      el.style?.removeProperty?.('display');
      delete el.dataset[MARK];
    }
  }
  return count;
}

/** If the open control group was removed, open the Token controls. Returns true when it switched. Never throws. */
export function leaveRemovedControl(ui, names = HIDDEN_CONTROLS) {
  try {
    const active = activeControlName(ui);
    if (!active || !names.includes(active)) return false;
    const controls = ui.controls;
    const known = controlNames(controls.controls);
    const target = TOKENS_NAMES.find(n => known.includes(n)) ?? TOKENS_NAMES[0];
    if (typeof controls.activate === 'function') { controls.activate({ control: target }); return true; }
    if (typeof controls.initialize === 'function') { controls.initialize({ control: target }); return true; }
  } catch (error) { console.warn('[ashen-gate-manager] Scene controls not switched', error); }
  return false;
}

/** Rebuilds the controls so the hook runs again. Feature-detected; never throws. */
export function refreshSceneControls(ui) {
  try {
    if (typeof ui?.controls?.initialize === 'function') { ui.controls.initialize(); return true; }
    if (typeof ui?.controls?.render === 'function') { ui.controls.render({ force: true }); return true; }
  } catch (error) { console.warn('[ashen-gate-manager] Scene controls not refreshed', error); }
  return false;
}

/**
 * Registers the hooks now and returns a controller. Call `attach(appearance)` once the appearance controller exists (at
 * ready): it applies the setting and follows live changes. Until then the hook leaves the controls alone.
 */
export function installSceneControlHider({ game, hooks, doc = globalThis.document, getUi = () => globalThis.ui }) {
  let appearance = null;
  let removedBefore = false;
  const wanted = () => {
    try { return shouldHideControls({ isGM: Boolean(game?.user?.isGM), setting: appearance?.getState?.()?.hideSceneTools === true }); } catch { return false; }
  };
  const onControls = controls => { try { if (wanted()) removeControlGroups(controls); } catch (error) { console.warn('[ashen-gate-manager] Scene controls not filtered', error); } };
  const apply = () => {
    try {
      const hide = wanted();
      hideSceneControlsDom(doc, hide);
      // Rebuild when the state changed since the controls were last built, so the hook above does the real removal.
      if (hide !== removedBefore) { removedBefore = hide; refreshSceneControls(getUi()); }
      if (hide) leaveRemovedControl(getUi());
    } catch (error) { console.warn('[ashen-gate-manager] Scene controls not updated', error); }
  };
  const ids = [['getSceneControlButtons', hooks?.on?.('getSceneControlButtons', onControls)], ['renderSceneControls', hooks?.on?.('renderSceneControls', apply)]];
  let stop = null;
  return {
    apply,
    attach(next) {
      appearance = next;
      if (typeof stop === 'function') stop();
      stop = appearance?.subscribe?.(apply) ?? null;
      apply();
    },
    stop() { for (const [name, id] of ids) if (id !== undefined) hooks?.off?.(name, id); if (typeof stop === 'function') stop(); }
  };
}
