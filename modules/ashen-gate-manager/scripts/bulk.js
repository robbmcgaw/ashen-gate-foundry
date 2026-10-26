/**
 * Bulk writes (0.70.3). Pure; no Foundry globals except the optional Hooks.
 * Manager's own mass writes (Sync from package, Import, the References conversion) carry `agBulk: true` in their options. Every
 * Ashen Gate module's document hooks return at once for such a write and instead refresh ONCE when Manager announces
 * `ashenGate.bulkFinished` (a hook with {source, reason}). Before this, each of ~800 updated Items woke every module (one re-published
 * Skill Trees to a world setting per Item, re-rendered windows, rebuilt indexes) and froze the tab.
 */
export const BULK = Object.freeze({agBulk: true});
/** Options for a batch write: no redraw, flagged as bulk. */
export const bulkWrite = () => ({render: false, agBulk: true});
export const BULK_FINISHED = 'ashenGate.bulkFinished';
export const BULK_SOCKET = 'module.ashen-gate-manager';
/** Tells this client's listeners, and (socket) every other client's, that a bulk write is over: refresh once. */
export function emitBulkFinished(reason, {hooks = globalThis.Hooks, socket = globalThis.game?.socket} = {}) {
  try { hooks?.callAll?.(BULK_FINISHED, {source: 'ashen-gate-manager', reason}); }
  catch (error) { console.warn('[ashen-gate-manager] bulk-finished listeners failed', error); }
  try { socket?.emit?.(BULK_SOCKET, {type: 'ag-bulk-finished', reason}); } catch { /* other clients refresh on their next event */ }
}
/** Every client re-announces what the writing GM announced. Call once at ready. */
export function listenBulkFinished({hooks = globalThis.Hooks, socket = globalThis.game?.socket} = {}) {
  socket?.on?.(BULK_SOCKET, message => { if (message?.type === 'ag-bulk-finished') try { hooks?.callAll?.(BULK_FINISHED, {source: 'ashen-gate-manager', reason: message.reason, remote: true}); } catch (e) { console.warn('[ashen-gate-manager] bulk-finished listeners failed', e); } });
}
