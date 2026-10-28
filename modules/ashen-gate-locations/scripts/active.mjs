/**
 * 0.24.0: tells every client when the set of active locations changes. Active locations travel in the same player views as
 * everything else (no new socket, no new setting), so each client simply re-reads its own `activeLocations()` after any
 * Locations journal change and compares. A player's list holds only places they may see, so nothing else can leak.
 *
 * Hook (every client, after the set changed; never at start-up): Hooks.callAll('ashen-gate-locations.activeChanged',
 *   {keys: [pin keys active now, on this client], added: [keys], removed: [keys]})
 * Players also get one notification per place that became active ("The party is now at <name>.", the name they may see).
 */
export const ACTIVE_HOOK = 'ashen-gate-locations.activeChanged';

/** deps: {read() → [{key, name}] (this client's api.activeLocations(); may throw), isGM(), fire(name, payload), notify(text)} */
export function createActiveWatcher(deps) {
  let known = null;
  return {
    /** Re-reads and reports a change. The first call only records the starting set. */
    check() {
      let rows;
      try { rows = deps.read() ?? []; } catch { rows = []; }
      const now = new Map(rows.map(r => [r.key, r.name]));
      const before = known;
      known = now;
      if (!before) return null;
      const added = [...now.keys()].filter(k => !before.has(k));
      const removed = [...before.keys()].filter(k => !now.has(k));
      if (!added.length && !removed.length) return null;
      if (!deps.isGM()) for (const k of added) deps.notify(`The party is now at ${now.get(k)}.`);
      deps.fire(ACTIVE_HOOK, {keys: [...now.keys()], added, removed});
      return {added, removed};
    },
    reset() { known = null; }
  };
}
