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
  releaseHosting(sheet);   // 0.46.2: moving the window ends any hosting in flight
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
 * stat, Level up, Help, confirmations), dnd5e's usage, rest and roll configuration dialogs and Foundry's file picker all
 * call render() on a new window, which Foundry puts in the main window. hostWindows(hub, fn) runs one Hub action; the
 * windows it opens are registered as children of the Hub with renderChild() (the same route as renderBeside), so they
 * appear in the Hub's own browser window. The kit's ag-dialogs.mjs is untouched. A window whose class is not found is
 * simply left alone.
 *
 * THE ARMING RULE (0.46.2). The render() wrappers are real patches on the shared prototypes, so while they are on, ANY
 * code that opens one of these windows is hijacked, not only the Hub. They are therefore ON only while the Hub action is
 * waiting for its next window:
 *   - ON  from the start of a Hub action until the first window it opens starts rendering (that window is hosted and the
 *         patches are removed on the spot);
 *   - OFF for as long as any hosted window is open, so a confirm, an actor delete or another actor's rest opened from the
 *         main window stays in the main window;
 *   - ON again when the last open hosted window closes (a hosted DialogV2 counts as done when it is submitted, because its
 *         promise resolves before it closes, 0.46.6), but only if an action is still pending (multi-step flows: picker
 *         -> config window, picker -> confirm, Use -> usage dialog -> roll dialogs, rest dialog -> results);
 *   - OFF for good when the last pending action settles (resolves or rejects).
 * A new action started while a hosted window is open arms for its own first window, then disarms the same way. Safety
 * nets restore every patched prototype: a timer if the wrapper stays on too long without a window, and releaseHosting()
 * on Hub close, Pop in / Pop out and the pop-out window unloading. Not popped out, no renderChild, or a window class that
 * is not found: nothing is patched or hosted.
 */
const HOST_CLASS_NAMES = /^(ActivityUsageDialog|ShortRestDialog|LongRestDialog|RestDialog|CompendiumBrowser|AdvancementManager|RollConfigurationDialog|D20RollConfigurationDialog|AttackRollConfigurationDialog|DamageRollConfigurationDialog|SkillToolRollConfigurationDialog)$/;   // 0.46.0: + compendium browser, advancement window; 0.46.2: + dnd5e.applications.dice.* roll dialogs (item/activity use, attack and damage rolls)
export const ARM_TIMEOUT_MS = 30000;
let hosting = null;

/** Renders app as a child of the Hub, once; renderChild() may call app.render() itself, which then goes straight through. */
export async function hostedRender(hub, app, original, entry = null) {
  if (app._agchHosted || !isPoppedOut(hub) || typeof hub.renderChild !== 'function') return original();
  app._agchHosted = true;
  if (entry) windowOpened(entry, app);
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
    for (const [inner, cls] of Object.entries(ns)) take(inner, cls);   // ... or one level down (actor.ShortRestDialog, dice.DamageRollConfigurationDialog)
  }
  return out;
}
const filePickerClass = () => globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker?.implementation ?? null;

function install(hub, entry) {
  const undo = [];
  const patchRender = cls => {
    const proto = cls?.prototype;
    if (!proto || typeof proto.render !== 'function') return;
    const had = Object.getOwnPropertyDescriptor(proto, 'render'), original = proto.render;
    Object.defineProperty(proto, 'render', {configurable: true, writable: true, value: function(...args) { return hostedRender(hub, this, () => original.apply(this, args), entry); }});
    undo.push(() => { if (had) Object.defineProperty(proto, 'render', had); else delete proto.render; });
  };
  try {
    const D = globalThis.foundry?.applications?.api?.DialogV2;
    if (typeof D?.wait === 'function') {
      const had = Object.getOwnPropertyDescriptor(D, 'wait'), original = D.wait;
      Object.defineProperty(D, 'wait', {configurable: true, writable: true, value: function(options) {
        const Base = this;
        const Hosted = class extends Base {
          constructor(config = {}, ...rest) {
            // 0.46.6: DialogV2.wait resolves inside the dialog's submit handler, BEFORE the dialog closes, so the Hub action's next step
            // (Restore: picker -> confirm) runs while this dialog is still open. Count the dialog as done at submit, not at close.
            const inner = config?.submit;
            if (typeof inner === 'function') config = {...config, submit: (result, dialog) => { windowDone(entry, dialog); return inner(result, dialog); }};
            super(config, ...rest);
          }
          render(...args) { return hostedRender(hub, this, () => super.render(...args), entry); }
        };
        Object.defineProperty(Hosted, 'name', {value: Base.name, configurable: true});   // reports DialogV2, not an anonymous subclass
        return original.call(Hosted, options);
      }});
      undo.push(() => { if (had) Object.defineProperty(D, 'wait', had); else delete D.wait; });
    }
    for (const cls of dnd5eDialogClasses()) patchRender(cls);
    patchRender(filePickerClass());
  } catch (err) { console.warn('ashen-gate-character-hub | pop-out hosting not available', err); }
  return () => { for (const fn of undo.reverse()) { try { fn(); } catch { /* best effort */ } } };
}

function arm(entry) {
  if (hosting !== entry || entry.undo) return;
  entry.undo = install(entry.hub, entry);
  entry.timer = setTimeout(() => disarm(entry), ARM_TIMEOUT_MS);
  entry.timer?.unref?.();
}
function disarm(entry) {
  clearTimeout(entry.timer); entry.timer = null;
  const undo = entry.undo; entry.undo = null;
  undo?.();
}
function end(entry) {
  disarm(entry);
  entry.stop?.();
  if (hosting === entry) hosting = null;
}
/** A hosted window starts rendering: the patches come off while it is open and go back on when it closes, if an action is pending. */
function windowOpened(entry, app) {
  entry.open.add(app);
  disarm(entry);
  if (typeof app.addEventListener === 'function') app.addEventListener('close', () => windowDone(entry, app), {once: true});
  else entry.open.delete(app);   // cannot see it close: stay off until the action settles (never hijack)
}
/** A hosted window is finished (closed, or a dialog submitted): when it was the last one open and its action has more steps, arm again. */
function windowDone(entry, app) {
  if (!entry.open.delete(app)) return;
  if (hosting === entry && !entry.open.size && entry.pending > 0) arm(entry);
}

/** Ends hosting for hub (or any hub): the Hub closed, popped in/out, or its window unloaded. Every patched prototype is restored. */
export function releaseHosting(hub) {
  if (hosting && (!hub || hosting.hub === hub)) end(hosting);
}

/** Runs fn (a Hub action) with the windows it opens hosted in the Hub's window. Resolves/rejects as fn does. */
export function hostWindows(hub, fn) {
  if (!isPoppedOut(hub) || typeof hub.renderChild !== 'function' || (hosting && hosting.hub !== hub)) return fn();
  let entry = hosting;
  if (!entry) {
    entry = hosting = {hub, pending: 0, open: new Set(), undo: null, timer: null, stop: null};
    const view = hub.element?.ownerDocument?.defaultView;
    if (typeof view?.addEventListener === 'function') {
      const gone = () => { if (hosting === entry) end(entry); };
      view.addEventListener('pagehide', gone); view.addEventListener('unload', gone);
      entry.stop = () => { view.removeEventListener?.('pagehide', gone); view.removeEventListener?.('unload', gone); };
    }
  }
  entry.pending++;
  arm(entry);
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    if (--entry.pending <= 0) end(entry);
  };
  let result;
  try { result = fn(); } catch (err) { done(); throw err; }
  return Promise.resolve(result).finally(done);
}
