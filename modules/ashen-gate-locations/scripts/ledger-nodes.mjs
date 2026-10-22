/**
 * 1.18.0: Profession Ledger node templates (contract ag-gathering-nodes/1, Ledger 0.25.0+), feature-detected.
 * The Ledger owns the templates and their material tables; Locations only stores a reference ({nodeId, …}) on a
 * gathering entry. Every call is GM only on the Ledger's side; a refusal or a missing Ledger is never an error here.
 */
const LEDGER_MODULE = 'ashen-gate-profession-ledger';
export const NODE_CONTRACT = 'ag-gathering-nodes/1';

/** The Ledger's templates API, or null (Ledger inactive, older than 0.25.0, or another contract). */
export function templatesApi() {
  const m = globalThis.game?.modules?.get?.(LEDGER_MODULE);
  const t = m?.active ? m.api?.gathering?.templates : null;
  return t?.contract === NODE_CONTRACT && typeof t.list === 'function' ? t : null;
}

/**
 * Every template the GM can pick, or why there are none to pick from:
 * {ok: true, list} | {ok: false, reason: 'absent' | 'refused', message}.
 */
export function nodeTemplates() {
  const t = templatesApi();
  if (!t) return {ok: false, reason: 'absent', message: 'Profession Ledger 0.25.0 or later is not active, so node templates are not available. Add a custom node instead.'};
  try {
    const list = t.list();
    return {ok: true, list: Array.isArray(list) ? list.filter(n => n && typeof n.id === 'string') : []};
  } catch (err) {
    return {ok: false, reason: 'refused', message: `Profession Ledger did not list its node templates (${err?.message ?? err}). Add a custom node instead.`};
  }
}

/** What players may see of a template at a tier (the Ledger's templates.playerView), or null. Never throws. */
export function nodePlayerView(id, options = {}) {
  const t = templatesApi();
  if (typeof t?.playerView !== 'function') return null;
  try { return t.playerView(id, options) ?? null; } catch { return null; }
}

/** Opens the Ledger on its Gathering Nodes tab (GM). False when the Ledger cannot be opened. */
export function openNodesTab() {
  const m = globalThis.game?.modules?.get?.(LEDGER_MODULE);
  if (!m?.active || typeof m.api?.open !== 'function') return false;
  m.api.open({view: 'nodes'});
  return true;
}
