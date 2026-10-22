/**
 * Import tab layout (0.45.0): which sections are folded, and the bottom message drawer that holds validation errors,
 * review notes, links to other modules' records and import results, so none of them push the controls down.
 * The layout is remembered per device in the client setting `importLayout` (presentation only, never world data).
 */
export const LAYOUT_SETTING = 'importLayout';
export const FOLDS = Object.freeze(['load', 'zip', 'options', 'preview']);
export const DEFAULT_LAYOUT = Object.freeze({folds:Object.freeze({load:true, zip:true, options:false, preview:true}), drawerOpen:false, drawerTab:null});
export const DRAWER_TABS = Object.freeze([
  Object.freeze({id:'errors', label:'Errors', tone:'danger'}),
  Object.freeze({id:'warnings', label:'Review notes', tone:'warn'}),
  Object.freeze({id:'links', label:'Module links', tone:'accent'}),
  Object.freeze({id:'results', label:'Results', tone:'ok'})
]);

/** A clean layout from whatever was stored (missing or bad values fall back to the defaults). */
export function normalizeLayout(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const folds = Object.fromEntries(FOLDS.map(k => [k, typeof src.folds?.[k] === 'boolean' ? src.folds[k] : DEFAULT_LAYOUT.folds[k]]));
  return {folds, drawerOpen:src.drawerOpen === true, drawerTab:DRAWER_TABS.some(t => t.id === src.drawerTab) ? src.drawerTab : null};
}

/**
 * Opens the drawer on something new: fresh errors open it at Errors, a new import result at Results.
 * `seen` is the last signature; returns the new one. Otherwise the GM's own open/closed choice stands.
 */
export function noteDrawerChanges(layout, {errors = 0, resultsKey = ''} = {}, seen = '') {
  const sig = `${errors}|${resultsKey}`;
  if(sig === seen) return sig;
  const [lastErrors, lastResults = ''] = String(seen).split('|');
  if(errors > 0 && String(errors) !== lastErrors) {layout.drawerOpen = true; layout.drawerTab = 'errors';}
  else if(resultsKey && resultsKey !== lastResults) {layout.drawerOpen = true; layout.drawerTab = 'results';}
  return sig;
}

/** Template context for the drawer: one tab per kind with its count, the shown tab, and whether there is anything at all. */
export function drawerContext(layout, counts) {
  const tabs = DRAWER_TABS.map(t => ({...t, count:Number(counts?.[t.id] ?? 0)}));
  const shown = tabs.find(t => t.id === layout.drawerTab && t.count) ?? tabs.find(t => t.count) ?? null;
  const any = Boolean(shown);
  const open = any && layout.drawerOpen;
  return {any, open, label:shown?.label ?? '', tabs:tabs.map(t => ({...t, active:t.id === shown?.id})),
    errors:open && shown.id === 'errors', warnings:open && shown.id === 'warnings', links:open && shown.id === 'links', results:open && shown.id === 'results'};
}
