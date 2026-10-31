/**
 * Travel requests over the module socket (0.39.0). A player's client cannot write the world setting, so declare() asks the primary GM's
 * client, which re-checks everything (sender, Travel for players, one request per user) and writes. The receipt carries only ok / a message.
 * deps: {users (iterable with get(id)), currentUser(), isPrimaryGM(), service (createOverland), socket: {emit}, timeout?, randomId?()}
 */
import {SOCKET} from './party-notes.mjs';

export function createTravelChannel(deps) {
  const pending = new Map();
  /** A player's client: ask the GM's client to add a waiting request. Rejects with a plain message. */
  function send(action) {
    const me = deps.currentUser();
    if (!me?.id || me.isGM) return Promise.reject(new Error('Only players can ask for an action.'));
    if (![...deps.users].some(u => u.isGM && u.active)) return Promise.reject(new Error('No GM is connected, so the request cannot be sent.'));
    if (!deps.socket?.emit) return Promise.reject(new Error('The Locations socket is unavailable.'));
    const requestId = deps.randomId?.() ?? globalThis.crypto.randomUUID();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { pending.delete(requestId); fail(new Error('The GM client did not answer. Nothing was changed.')); }, deps.timeout ?? 15000);
      pending.set(requestId, {ok, fail, timer});
      deps.socket.emit(SOCKET, {type: 'travel-declare', requestId, userId: me.id, action});
    });
  }
  /** Every client: receipts for its own requests. The primary GM's client: requests. */
  async function onSocket(msg, senderId) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'travel-receipt') {
      const p = msg.userId === deps.currentUser()?.id && pending.get(msg.requestId);
      if (!p) return;
      pending.delete(msg.requestId); clearTimeout(p.timer);
      return msg.ok ? p.ok() : p.fail(new Error(msg.message || 'The GM client refused the request.'));
    }
    if (msg.type !== 'travel-declare' || !deps.currentUser()?.isGM || !deps.isPrimaryGM()) return;
    let ok = false, message = '';
    try {
      if (typeof senderId === 'string' && senderId !== msg.userId) throw new Error('Request sender mismatch.');
      const user = deps.users.get(msg.userId);
      if (!user?.active || user.isGM) throw new Error('Unknown requester.');
      await deps.service.receiveDeclare({id: user.id, name: user.name, isGM: user.isGM === true}, msg.action);
      ok = true;
    } catch (e) {
      message = e?.message || String(e);
      console.warn(`${SOCKET} | refused Travel request from ${msg.userId}: ${message}`);
    }
    deps.socket.emit(SOCKET, {type: 'travel-receipt', requestId: msg.requestId, userId: msg.userId, ok, message});
  }
  return {send, onSocket};
}
