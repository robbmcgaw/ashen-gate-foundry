/**
 * 1.8.0 "Share with...": a player who can see a "Selected players" location adds other players to it.
 *
 * Only the primary GM's client writes: a player sends a request over the module socket and waits for a receipt. The
 * GM client re-checks everything (a player can emit by hand): the sender is the user named and is connected, Player
 * Access is on, the location is visible and the sender is in its audience, the GM allows sharing on it, and every
 * target is a player in this world (applyShare). Nobody is ever removed this way; each added player is recorded as
 * shared by the sender, so the GM can see who added whom and undo it. With no GM connected, sharing waits.
 * Receipts reach every client, so they carry only ok/message and a count, never a name or id of the location.
 */
import {MODULE_ID, applyShare, inAudience} from './model.mjs';
import {SOCKET, NOT_AVAILABLE} from './party-notes.mjs';

/**
 * deps: {users (iterable, with get(id)), currentUser(), isPrimaryGM(), playerAccessEnabled(), readAll(), writeAll(list),
 *        socket?: {emit}, timeout?, randomId?()}
 */
export function createShareService(deps) {
  const pending = new Map();
  let queue = Promise.resolve();
  const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  const playerIds = () => [...deps.users].filter(u => u?.id && !u.isGM).map(u => u.id);

  /** On the primary GM's client: adds `userIds` to the location `ref` (a pin key, or a revealed LOC id) for `user`. */
  function perform({ref, userIds} = {}, user) {
    return serial(async () => {
      if (!user?.id || user.isGM) throw new Error('Only players share locations; the GM sets who can see a location on its card.');
      if (!deps.playerAccessEnabled(user)) throw new Error('Locations is hidden from players. Ask your GM to enable Player Access.');
      if (typeof ref !== 'string' || !ref || ref.length > 64) throw new Error(NOT_AVAILABLE);
      const all = deps.readAll();
      const loc = all.find(l => l.pinKey === ref) ?? all.find(l => l.id === ref && l.state === 'revealed');
      if (!loc || loc.state === 'hidden' || !loc.published || !inAudience(loc, user.id)) throw new Error(NOT_AVAILABLE);
      const {audience, added} = applyShare(loc, user.id, Array.isArray(userIds) ? userIds.slice(0, 100) : userIds, playerIds());
      if (added.length) { loc.audience = audience; await deps.writeAll(all); }
      return {added: added.length};
    });
  }

  /** From a player's client: asks the primary GM's client. Resolves to {added}. */
  function request(payload) {
    const me = deps.currentUser();
    if (me?.isGM && deps.isPrimaryGM()) return perform(payload, me);
    if (![...deps.users].some(u => u.isGM && u.active)) return Promise.reject(new Error('A GM must be connected to share a location.'));
    if (!deps.socket?.emit) return Promise.reject(new Error('The Locations socket is unavailable.'));
    const requestId = deps.randomId?.() ?? globalThis.crypto.randomUUID();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { pending.delete(requestId); fail(new Error('The GM client did not answer. Nothing was changed.')); }, deps.timeout ?? 15000);
      pending.set(requestId, {ok, fail, timer});
      deps.socket.emit(SOCKET, {type: 'share-request', requestId, userId: me?.id, ref: payload.ref, userIds: payload.userIds});
    });
  }

  /** Every client: receipts for its own requests; the primary GM: requests. Returns true when the message was a share message. */
  async function onSocket(msg, senderId) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'share-receipt') {
      const p = msg.userId === deps.currentUser()?.id && pending.get(msg.requestId);
      if (p) {
        pending.delete(msg.requestId); clearTimeout(p.timer);
        if (msg.ok) p.ok({added: Number(msg.added) || 0}); else p.fail(new Error(msg.message || 'The GM client refused the request.'));
      }
      return true;
    }
    if (msg.type !== 'share-request') return false;
    if (!deps.currentUser()?.isGM || !deps.isPrimaryGM()) return true;
    let ok = false, message = '', added = 0;
    try {
      if (typeof senderId === 'string' && senderId !== msg.userId) throw new Error('Request sender mismatch.');
      const user = deps.users.get(msg.userId);
      if (!user?.active) throw new Error('Unknown requester.');
      ({added} = await perform({ref: msg.ref, userIds: msg.userIds}, user));
      ok = true;
    } catch (e) {
      message = e?.message || String(e);
      console.warn(`${MODULE_ID} | refused share from ${msg.userId}: ${message}`);
    }
    deps.socket.emit(SOCKET, {type: 'share-receipt', requestId: msg.requestId, userId: msg.userId, ok, message, added});
    return true;
  }

  return {perform, request, onSocket};
}
