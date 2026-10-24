/**
 * Pop out (0.29.0): Foundry V14's own ApplicationV2 detach. detachWindow() moves the Hub into a separate browser window,
 * attachWindow() brings it back; Foundry carries the app, its stylesheets and its children. Nothing custom: when the
 * running Foundry has no detachWindow (or _canDetach() says no), the button is simply not shown.
 */
const MAIN = () => globalThis.document;

/** The Hub lives in another browser window (its element belongs to a document other than the main one). */
export function isPoppedOut(sheet) {
  const doc = sheet?.element?.ownerDocument;
  return !!doc && !!MAIN() && doc !== MAIN();
}
/** Foundry offers detaching for this window, or it is already out (so it can come back). */
export function canPopOut(sheet) {
  if (isPoppedOut(sheet)) return typeof sheet.attachWindow === 'function';
  if (typeof sheet?.detachWindow !== 'function') return false;
  try { return sheet._canDetach?.() !== false; } catch { return false; }
}
/** Pop out, or back in when already out. Resolves {ok, result: 'out' | 'in'} or {ok: false, error}. */
export async function togglePopOut(sheet) {
  if (!canPopOut(sheet)) return {ok: false, error: 'This Foundry version cannot pop windows out.'};
  const out = isPoppedOut(sheet);
  await (out ? sheet.attachWindow() : sheet.detachWindow());
  return {ok: true, result: out ? 'in' : 'out'};
}

/**
 * Opens an application next to the Hub (0.44.3). A Hub in its own browser window must open its item sheets and settings
 * windows there too: a plain render() puts them in the main Foundry window, where they cannot be seen from the pop-out.
 * Foundry's renderChild() registers the app as a child that shares the Hub's window (as dnd5e's sheets do). Not popped
 * out, or no renderChild: an ordinary render, exactly as before.
 */
export async function renderBeside(sheet, app) {
  if (isPoppedOut(sheet) && typeof sheet.renderChild === 'function') return sheet.renderChild(app);
  return app.render?.({force: true}) ?? app.render?.(true);
}

/**
 * Windows the Hub opens through other code (0.44.4). A popped-out Hub's dialogs (the kit's DialogV2 helpers: Configure a
 * stat, Level up, Help, confirmations), dnd5e's usage and rest dialogs and Foundry's file picker all call render() on a
 * new window, which Foundry puts in the main window. hostWindows(hub, fn) runs one Hub action; while it is in flight,
 * those windows are registered as children of the Hub with renderChild() (the same route as renderBeside), so they
 * appear in the Hub's own browser window. Each class's render() is wrapped only for the length of the action and put
 * back afterwards, so nothing changes when the Hub is not popped out, when renderChild is missing, or for windows opened
 * outside a Hub action. The kit's ag-dialogs.mjs is untouched. A window whose class is not found is simply left alone.
 */
const HOST_CLASS_NAMES = /^(ActivityUsageDialog|ShortRestDialog|LongRestDialog|RestDialog|CompendiumBrowser|AdvancementManager)$/;   // 0.46.0: + the compendium browser (Add…) and the advancement window (Add… / drops)
let hosting = null;

/** Renders app as a child of the Hub, once; renderChild() may call app.render() itself, which then goes straight through. */
export async function hostedRender(hub, app, original) {
  if (app._agchHosted || !isPoppedOut(hub) || typeof hub.renderChild !== 'function') return original();
  app._agchHosted = true;
  try {
    await hub.renderChild(app);
    if (!app.rendered) await original();
  } catch (err) {
    console.warn('ashen-gate-character-hub | could not open the window beside the Hub', err);
    if (!app.rendered) await original();
  }
  return app;
}

function dnd5eDialogClasses() {
  const out = [], apps = globalThis.dnd5e?.applications;
  const take = (name, cls) => { if (HOST_CLASS_NAMES.test(name) && typeof cls === 'function' && cls.prototype && !out.includes(cls)) out.push(cls); };
  for (const [name, ns] of Object.entries(apps ?? {})) {
    take(name, ns);   // a class directly under dnd5e.applications (CompendiumBrowser) ...
    if (!ns || (typeof ns !== 'object' && typeof ns !== 'function')) continue;
    for (const [inner, cls] of Object.entries(ns)) take(inner, cls);   // ... or one level down (actor.ShortRestDialog)
  }
  return out;
}
const filePickerClass = () => globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker?.implementation ?? null;

function install(hub) {
  const undo = [];
  const patchRender = cls => {
    const proto = cls?.prototype;
    if (!proto || typeof proto.render !== 'function') return;
    const had = Object.getOwnPropertyDescriptor(proto, 'render'), original = proto.render;
    Object.defineProperty(proto, 'render', {configurable: true, writable: true, value: function(...args) { return hostedRender(hub, this, () => original.apply(this, args)); }});
    undo.push(() => { if (had) Object.defineProperty(proto, 'render', had); else delete proto.render; });
  };
  try {
    const D = globalThis.foundry?.applications?.api?.DialogV2;
    if (typeof D?.wait === 'function') {
      const had = Object.getOwnPropertyDescriptor(D, 'wait'), original = D.wait;
      Object.defineProperty(D, 'wait', {configurable: true, writable: true, value: function(options) {
        const Base = this;
        const Hosted = class extends Base { render(...args) { return hostedRender(hub, this, () => super.render(...args)); } };
        return original.call(Hosted, options);
      }});
      undo.push(() => { if (had) Object.defineProperty(D, 'wait', had); else delete D.wait; });
    }
    for (const cls of dnd5eDialogClasses()) patchRender(cls);
    patchRender(filePickerClass());
  } catch (err) { console.warn('ashen-gate-character-hub | pop-out hosting not available', err); }
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch { /* best effort */ } } };
}

/** Runs fn (a Hub action) with the windows it opens hosted in the Hub's window. Resolves/rejects as fn does. */
export function hostWindows(hub, fn) {
  if (hosting || !isPoppedOut(hub) || typeof hub.renderChild !== 'function') return fn();
  const entry = hosting = {undo: install(hub)};
  const done = () => { if (hosting === entry) { hosting = null; entry.undo(); } };
  let result;
  try { result = fn(); } catch (err) { done(); throw err; }
  return Promise.resolve(result).finally(done);
}
