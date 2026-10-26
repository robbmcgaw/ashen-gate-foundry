/**
 * Sync from package (0.70.1): survives a dropped connection without hanging. Pure; the Foundry socket is passed in
 * (`game.socket.io`: on / off / connected), so the Node suite drives it with a fake.
 *
 * A write that was sent just before the socket dropped never gets an answer from the server, so awaiting it alone would hang the
 * window for ever. `race(promise)` settles with ConnectionLost the moment the socket drops, or with SyncTimeout when no answer
 * comes within `timeoutMs`. Between chunks, `ready()` waits (up to `waitMs`) for Foundry's own reconnect before the next write.
 * Whatever was written before stays; every Sync step is idempotent, so running the same sync again finishes the job.
 */
export class ConnectionLost extends Error {
  constructor(message = 'The connection to the server was lost.') { super(message); this.name = 'ConnectionLost'; }
}
export class SyncTimeout extends Error {
  constructor(ms) { super(`The server did not answer within ${Math.round(ms / 1000)} s.`); this.name = 'SyncTimeout'; }
}
export const isInterruption = e => e instanceof ConnectionLost || e instanceof SyncTimeout;

export function createConnection(socket, {timeoutMs = 300000, waitMs = 60000, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  let lost = socket ? socket.connected === false : false;
  const drops = new Set(), backs = new Set();
  const onDisconnect = () => { lost = true; for (const f of [...drops]) f(); };
  const onConnect = () => { lost = false; for (const f of [...backs]) f(); };
  socket?.on?.('disconnect', onDisconnect);
  socket?.on?.('connect', onConnect);
  return {
    isLost: () => lost,
    /** Resolves true when connected (waiting up to waitMs for the reconnect), false when it did not come back. */
    ready(onWait = () => {}) {
      if (!lost) return Promise.resolve(true);
      onWait();
      return new Promise(resolve => {
        const done = ok => { backs.delete(back); clearTimer(timer); resolve(ok); };
        const back = () => done(true), timer = setTimer(() => done(false), waitMs);
        backs.add(back);
      });
    },
    race(promise, {ms = timeoutMs} = {}) {
      return new Promise((resolve, reject) => {
        let finished = false;
        const end = fn => v => { if (finished) return; finished = true; drops.delete(drop); clearTimer(timer); fn(v); };
        const drop = () => end(reject)(new ConnectionLost());
        const timer = setTimer(() => end(reject)(new SyncTimeout(ms)), ms);
        drops.add(drop);
        if (lost) { drop(); return; }
        Promise.resolve(promise).then(end(resolve), end(reject));
      });
    },
    dispose() { socket?.off?.('disconnect', onDisconnect); socket?.off?.('connect', onConnect); drops.clear(); backs.clear(); }
  };
}
