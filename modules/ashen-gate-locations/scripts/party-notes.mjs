/**
 * Party Notes write path.
 *
 * GM connected (as in 1.5.0): every change is a request that the primary GM's client checks and carries out. A GM
 * on that client acts directly; anyone else sends the request over the module socket and waits for a receipt.
 * Requests run one at a time, so two saves that arrive together are decided in order (the second is refused as
 * stale, see applyNotesOp). Before each change the GM client reconciles that location with its shared page, so
 * anything players saved while no GM was connected is kept.
 *
 * No GM connected (1.7.0): a player writes the location's page in the "Locations (Shared Notes)" Journal directly,
 * with the same rules (applyNotesOp: one-editor lock, rev check). Foundry only lets them write a page that gives
 * them OWNER, which the GM gives only to pages of locations visible to players. Without a server-side
 * compare-and-swap two players can still race, so after writing, the client waits a moment and re-reads: if
 * someone else's lock or save landed instead, it reports that (the text stays in the box) rather than claiming success.
 * The trade-off Robb accepted: a player could edit, by console, the notes of a location they can already see.
 *
 * The GM-side checks are the real ones for the socket (a player can bypass the API and emit by hand):
 *  - the sender is the user named in the request, and is connected;
 *  - a player needs Player Access, and may name a location only by the pin key of a page they can see, or by the
 *    LOC id of a revealed one, and must be in its audience (1.8.0). Hidden, unknown, other players' and made-up
 *    references get the same answer;
 *  - only the GM can clear.
 */
import {MODULE_ID, PARTY_NOTES, applyNotesOp, notesMirror, notesLockHolder, inAudience} from './model.mjs';

export const SOCKET = `module.${MODULE_ID}`;
const OPS = new Set(['lock', 'release', 'save', 'clear']);
export const NOT_AVAILABLE = "That location isn't available to you.";

/**
 * deps: {users (iterable, with get(id)), currentUser(), isPrimaryGM(), playerAccessEnabled(), readAll(), readNotes(locationId),
 *        writeNotes(loc, record), reconcile?(loc), shared?: {read(pinKey) → {record, writable} | null, write(pinKey, record)},
 *        socket?: {emit, on}, now?(), timeout?, randomId?(), settleMs?, wait?(ms)}
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
    if (!loc || loc.state === 'hidden' || !loc.published || !inAudience(loc, user.id)) throw new Error(NOT_AVAILABLE);
    return loc;
  }

  /** Carries out one request on the primary GM's client: {notes, visible}. `visible` (every player may read these notes)
   *  is false for a hidden location (only a GM gets that far) and for a "Selected players" one. */
  function perform(payload, user) {
    return serial(async () => {
      if (!user?.id) throw new Error('Unknown user.');
      const {op, ref, text, rev, takeover} = payload ?? {};
      if (!OPS.has(op)) throw new Error(`Unknown Party Notes action "${op}".`);
      if (op === 'clear' && !user.isGM) throw new Error('Only the GM can clear Party Notes.');
      const loc = resolve(ref, user);
      await deps.reconcile?.(loc);
      const before = deps.readNotes(loc.id);
      const next = applyNotesOp(before, {op, text, rev, takeover: takeover === true},
        {userId: user.id, isGM: user.isGM === true, now: now(), isActive, nameOf, lockMs: PARTY_NOTES.lockMs});
      const saved = JSON.stringify(next) === JSON.stringify(before) ? before : await deps.writeNotes(loc, next);
      return {notes: notesMirror(saved), visible: loc.state !== 'hidden' && !!loc.published && loc.audience?.mode !== 'selected'};
    });
  }

  /** From any client: performs locally on the primary GM's client, otherwise asks it over the socket. */
  function request(payload) {
    const me = deps.currentUser();
    if (me?.isGM && deps.isPrimaryGM()) return perform(payload, me).then(r => r.notes);
    if (![...deps.users].some(u => u.isGM && u.active)) return direct(payload, me);
    if (!deps.socket?.emit) return Promise.reject(new Error('The Locations socket is unavailable.'));
    const requestId = deps.randomId?.() ?? globalThis.crypto.randomUUID();
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { pending.delete(requestId); fail(new Error('The GM client did not answer. Nothing was changed.')); }, deps.timeout ?? 15000);
      pending.set(requestId, {ok, fail, timer});
      deps.socket.emit(SOCKET, {type: 'notes-request', requestId, userId: me?.id, op: payload.op, ref: payload.ref,
        text: payload.text, rev: payload.rev, takeover: payload.takeover === true});
    });
  }

  /** A player with no GM connected: the same rules, applied to the shared page this player may write. */
  function direct(payload, me) {
    return serial(async () => {
      if (!me?.id) throw new Error('Unknown user.');
      if (!deps.shared) throw new Error('A GM must be connected to change Party Notes. You can still read them.');
      if (!deps.playerAccessEnabled()) throw new Error('Locations is hidden from players. Ask your GM to enable Player Access.');
      const {op, ref, text, rev} = payload ?? {};
      if (!OPS.has(op)) throw new Error(`Unknown Party Notes action "${op}".`);
      if (op === 'clear') throw new Error('Only the GM can clear Party Notes.');
      if (typeof ref !== 'string' || !ref || ref.length > 64) throw new Error(NOT_AVAILABLE);
      const cur = deps.shared.read(ref);
      if (!cur?.writable) throw new Error(NOT_AVAILABLE);
      // A visible location whose page holds no copy yet: the GM has not opened the world since updating. Writing
      // now could hide the GM's stored text behind an empty one, so refuse.
      if (!cur.record) throw new Error('Party Notes for this place are not set up yet: the GM needs to log in once. You can still read them.');
      const ctx = {userId: me.id, isGM: false, now: now(), isActive, nameOf, lockMs: PARTY_NOTES.lockMs};
      const next = applyNotesOp(cur.record, {op, text, rev, takeover: false}, ctx);
      if (JSON.stringify(next) === JSON.stringify(cur.record)) return notesMirror(cur.record);
      await deps.shared.write(ref, next);
      await (deps.wait ?? (ms => new Promise(r => setTimeout(r, ms))))(deps.settleMs ?? 400);
      const after = deps.shared.read(ref)?.record ?? null;
      if (op === 'lock') {
        const holder = notesLockHolder(after, now(), isActive);
        if (holder !== me.id) throw new Error(`${nameOf(holder) || 'Someone'} started editing these Party Notes at the same moment. Try again when they have saved or closed.`);
      }
      if (op === 'save' && after?.version !== next.version)
        throw new Error('Someone else saved these Party Notes at the same moment. Your text was not saved and is still in the box: copy it, click Cancel, then Edit to see the new notes.');
      return notesMirror(after);
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
    // Receipts reach every client, so they only carry notes every player may already read: never a hidden or
    // "Selected players" location's (the requester then reads its own copy from the page it may open).
    deps.socket.emit(SOCKET, {type: 'notes-receipt', requestId: msg.requestId, userId: msg.userId, ok, message, notes: ok && result.visible ? result.notes : null});
  }

  return {perform, request, onSocket, isActive, nameOf};
}
