/**
 * Party Notes write path. Players never get write rights on any Locations document: every change is a request
 * that the primary GM's client checks and carries out. A GM on that client acts directly; anyone else sends
 * the request over the module socket and waits for a receipt. Requests run one at a time, so two saves that
 * arrive together are decided in order (the second is refused as stale, see applyNotesOp).
 *
 * The checks here are the real ones (a player can bypass the API and emit on the socket by hand):
 *  - the sender is the user named in the request, and is connected;
 *  - a player needs Player Access, and may name a location only by the pin key of a page they can see, or by the
 *    LOC id of a revealed one. Hidden, unknown and made-up references get the same answer;
 *  - only the GM can clear.
 */
import {MODULE_ID, PARTY_NOTES, applyNotesOp, notesMirror} from './model.mjs';

export const SOCKET = `module.${MODULE_ID}`;
const OPS = new Set(['lock', 'release', 'save', 'clear']);
export const NOT_AVAILABLE = "That location isn't available to you.";

/**
 * deps: {users (iterable, with get(id)), currentUser(), isPrimaryGM(), playerAccessEnabled(), readAll(), readNotes(locationId),
 *        writeNotes(loc, record), socket?: {emit, on}, now?(), timeout?, randomId?()}
 */
export function createNotesService(deps) {
  const now = deps.now ?? Date.now;
  const isActive = id => deps.users.get(id)?.active === true;
  const nameOf = id => deps.users.get(id)?.name ?? '';
  const pending = new Map();
  let queue = Promise.resolve();
  const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

  /** The location a user may write notes for, or an error. Hidden and unknown look the same to a player. */
  function resolve(ref, user) {
    if (typeof ref !== 'string' || !ref || ref.length > 64) throw new Error(NOT_AVAILABLE);
    const all = deps.readAll();
    if (user.isGM) {
      const loc = all.find(l => l.id === ref || l.pinKey === ref);
      if (!loc) throw new Error(`No location ${ref}.`);
      return loc;
    }
    if (!deps.playerAccessEnabled()) throw new Error('Locations is hidden from players. Ask your GM to enable Player Access.');
    const loc = all.find(l => l.pinKey === ref) ?? all.find(l => l.id === ref && l.state === 'revealed');
    if (!loc || loc.state === 'hidden' || !loc.published) throw new Error(NOT_AVAILABLE);
    return loc;
  }

  /** Carries out one request on the primary GM's client: {notes, visible}. `visible` is false for a hidden location (only a GM gets that far). */
  function perform(payload, user) {
    return serial(async () => {
      if (!user?.id) throw new Error('Unknown user.');
      const {op, ref, text, rev, takeover} = payload ?? {};
      if (!OPS.has(op)) throw new Error(`Unknown Party Notes action "${op}".`);
      if (op === 'clear' && !user.isGM) throw new Error('Only the GM can clear Party Notes.');
      const loc = resolve(ref, user);
      const before = deps.readNotes(loc.id);
      const next = applyNotesOp(before, {op, text, rev, takeover: takeover === true},
        {userId: user.id, isGM: user.isGM === true, now: now(), isActive, nameOf, lockMs: PARTY_NOTES.lockMs});
      const saved = JSON.stringify(next) === JSON.stringify(before) ? before : await deps.writeNotes(loc, next);
      return {notes: notesMirror(saved), visible: loc.state !== 'hidden' && !!loc.published};
    });
  }

  /** From any client: performs locally on the primary GM's client, otherwise asks it over the socket. */
  function request(payload) {
    const me = deps.currentUser();
    if (me?.isGM && deps.isPrimaryGM()) return perform(payload, me).then(r => r.notes);
    if (!deps.socket?.emit) return Promise.reject(new Error('The Locations socket is unavailable.'));
    if (![...deps.users].some(u => u.isGM && u.active))
      return Promise.reject(new Error('A GM must be connected to change Party Notes. You can still read them.'));
    const requestId = deps.randomId?.() ?? globalThis.crypto.randomUUID();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { pending.delete(requestId); fail(new Error('The GM client did not answer. Nothing was changed.')); }, deps.timeout ?? 15000);
      pending.set(requestId, {ok, fail, timer});
      deps.socket.emit(SOCKET, {type: 'notes-request', requestId, userId: me?.id, op: payload.op, ref: payload.ref,
        text: payload.text, rev: payload.rev, takeover: payload.takeover === true});
    });
  }

  /** Every client: receipts for its own requests; the primary GM: requests. */
  async function onSocket(msg, senderId) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'notes-receipt') {
      const p = msg.userId === deps.currentUser()?.id && pending.get(msg.requestId);
      if (!p) return;
      pending.delete(msg.requestId); clearTimeout(p.timer);
      return msg.ok ? p.ok(msg.notes ?? null) : p.fail(new Error(msg.message || 'The GM client refused the request.'));
    }
    if (msg.type !== 'notes-request' || !deps.currentUser()?.isGM || !deps.isPrimaryGM()) return;
    let ok = false, message = '', result = null;
    try {
      // When Foundry supplies the sender's id, it must be the user the request claims to come from.
      if (typeof senderId === 'string' && senderId !== msg.userId) throw new Error('Request sender mismatch.');
      const user = deps.users.get(msg.userId);
      if (!user?.active) throw new Error('Unknown requester.');
      if (msg.text !== undefined && typeof msg.text !== 'string') throw new TypeError('Party Notes must be text.');
      if (msg.text?.length > PARTY_NOTES.maxLength * 2) throw new Error('Party Notes are too long.');
      result = await perform({op: msg.op, ref: msg.ref, text: msg.text, rev: msg.rev, takeover: msg.takeover}, user);
      ok = true;
    } catch (e) {
      message = e?.message || String(e);
      console.warn(`${MODULE_ID} | refused Party Notes ${msg.op} from ${msg.userId}: ${message}`);
    }
    // Receipts reach every client, so they only carry notes every player may already read: never a hidden location's.
    deps.socket.emit(SOCKET, {type: 'notes-receipt', requestId: msg.requestId, userId: msg.userId, ok, message, notes: ok && result.visible ? result.notes : null});
  }

  return {perform, request, onSocket, isActive, nameOf};
}
