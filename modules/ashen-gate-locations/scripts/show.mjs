/**
 * 0.23.0 "Show to Players": the GM opens a location in every other connected client's Locations window, like Foundry's own
 * Show to Players for journals. It reuses the module socket (SOCKET, as Party Notes and Share with…), and nothing is written.
 *
 * Wire message (only a pin key, never a LOC id, a name or any content): {type: 'show-location', ref: <pinKey>, userId: <sender>}
 * sent with {recipients: [user ids]} to the connected users who may see the location.
 *
 * Both ends check (a client can emit by hand):
 *  - sender: only a GM sends; the location must be Revealed or Unidentified (a Hidden one is refused here, the window asks to
 *    reveal it first); recipients are limited to users in its audience (Selected players: only those players).
 *  - receiver: the server-supplied sender id must belong to an active GM, the ref must look like a pin key, Player Access must
 *    be on, and the module's own player view API (getLocation) must return something for it; otherwise nothing opens and
 *    nothing is shown to the player. A repeat of the same location within a second is ignored.
 */
import {MODULE_ID, PIN_KEY, inAudience} from './model.mjs';
import {SOCKET} from './party-notes.mjs';

export const SHOW_TYPE = 'show-location';
export const RATE_MS = 1000;

/**
 * deps: {users (iterable, with get(id)), currentUser(), socket?: {emit}, readAll() (GM), getLocation(ref) (the player view API; may throw),
 *        mayOpen(), autoOpen(), open(ref) → Promise<boolean> (false: could not switch, e.g. the player is mid-edit), notify(text), now?(), wait?(ms)}
 */
export function createShowService(deps) {
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? (ms => new Promise(r => setTimeout(r, ms)));
  const last = new Map();

  /** GM: shows the location `ref` (LOC id or pin key) to everyone else who may see it. Resolves to {sent: players reached}. */
  function send(ref) {
    const me = deps.currentUser();
    if (!me?.isGM) throw new Error('Only the GM can show a location to players.');
    const loc = deps.readAll().find(l => l.id === ref || l.pinKey === ref);
    if (!loc) throw new Error('No location found with that reference.');
    if (loc.state === 'hidden' || !loc.published) throw new Error('This location is hidden. Reveal it before showing it.');
    const to = [...deps.users].filter(u => u?.id && u.id !== me.id && u.active && (u.isGM || inAudience(loc, u.id)));
    const players = to.filter(u => !u.isGM).length;
    if (to.length) {
      if (!deps.socket?.emit) throw new Error('The Locations socket is unavailable.');
      deps.socket.emit(SOCKET, {type: SHOW_TYPE, ref: loc.pinKey, userId: me.id}, {recipients: to.map(u => u.id)});
    }
    return {sent: players, recipients: to.length};
  }

  /** Every client: handles a show message. Returns true when the message was ours. Never throws to the caller for a refusal. */
  async function onSocket(msg, senderId) {
    if (!msg || typeof msg !== 'object' || msg.type !== SHOW_TYPE) return false;
    const me = deps.currentUser();
    const sender = typeof senderId === 'string' ? deps.users.get(senderId) : null;
    if (!sender?.isGM || !sender.active) return true;              // players cannot broadcast
    if (msg.userId !== undefined && msg.userId !== senderId) return true;
    if (!me || me.id === senderId) return true;                    // the sender's own client opens nothing
    if (typeof msg.ref !== 'string' || !PIN_KEY.test(msg.ref)) return true;
    if (!deps.mayOpen()) return true;
    const t = now();
    if (t - (last.get(msg.ref) ?? -Infinity) < RATE_MS) return true;
    last.set(msg.ref, t);
    let view = null;
    for (let i = 0; i < 2 && !view; i++) {
      try { view = deps.getLocation(msg.ref); } catch { view = null; }
      if (!view && i === 0) await wait(600);                       // the player copy may still be arriving
    }
    if (!view) return true;                                        // not visible to this user: open nothing, say nothing
    const name = view.name ?? '';
    if (deps.autoOpen()) {
      let opened = false;
      try { opened = await deps.open(msg.ref); } catch { opened = false; }
      if (!opened && name) deps.notify(`The GM is showing ${name}.`);
    } else if (name) deps.notify(`The GM is showing ${name}.`);
    return true;
  }
  return {send, onSocket};
}

export { MODULE_ID };
