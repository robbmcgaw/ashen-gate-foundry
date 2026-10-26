/**
 * Sync from package (0.70.1): what the progress line says. Pure; no Foundry globals, so the Node suite drives it with a fake clock.
 *
 * The executor reports {phase, label, done, total, step, stepDone, stepTotal, name} whenever it moves. This turns that into the one
 * line the window shows, and runs a heartbeat: every few seconds the line is redrawn with the elapsed time even when no count moved,
 * so a slow step looks like "still working" and a stuck one is named. A watchdog notices when nothing has moved for STALL_MS and
 * says so in plain words (and in the console, by record name). Nothing here changes what Sync does.
 */
export const HEARTBEAT_MS = 2000;
export const STALL_MS = 60000;

export const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
};

/** The base line, without timing: "Sync: Binding links between records… (1896 of 2106)". */
export function progressLine(p) {
  const head = p.phase === 'backup' ? 'Backup' : p.phase === 'check' ? 'Checking' : 'Sync';
  const counted = p.total && p.phase !== 'backup' && p.phase !== 'check';
  return `${head}: ${p.label}${counted ? ` (${p.done} of ${p.total})` : ''}`;
}
/** The detail after the line: the sub-step with its own count, and what is being written now. */
export function stepText(p) {
  const parts = [];
  if (p.step) parts.push(p.stepTotal ? `${p.step} ${p.stepDone ?? 0} of ${p.stepTotal}` : p.step);
  if (p.name) parts.push(p.name);
  return parts.join(': ');
}

/**
 * `paint({pct, label, stalled})` draws; `warn(text)` goes to the console. `now()` is injected. Call `report(p)` for every executor
 * event, `beat()` from a timer (the window uses setInterval(HEARTBEAT_MS)), `stop()` when the run ends.
 */
export function createProgress({paint, warn = () => {}, now = Date.now, stallMs = STALL_MS, isStopping = () => false} = {}) {
  const startedAt = now();
  let last = null, movedAt = now(), key = '', warned = false, stepKey = '', stepAt = now();
  const keyOf = p => `${p.phase}|${p.step ?? ''}|${p.done}|${p.stepDone ?? ''}|${p.name ?? ''}`;
  const compose = () => {
    if (!last) return null;
    const idle = now() - movedAt, stalled = idle >= stallMs;
    const detail = stepText(last);
    // Two clocks, labelled: the whole run, and the step now running (a long run is not a long step).
    const times = `run ${clock(now() - startedAt)} · step ${clock(now() - stepAt)}`;
    let label = progressLine(last) + (detail ? ` · ${detail}` : '') + ` · ${times}`;
    if (stalled) {
      const where = detail || last.label;
      label = `Sync has not moved for ${Math.floor(idle / 1000)} s: ${last.label.replace(/…$/, '')}, ${last.stepTotal ? `${last.stepDone ?? 0} of ${last.stepTotal}` : `${last.done} of ${last.total}`}${last.name ? ` (${last.name})` : ''}. Wait, or Cancel; running the same sync again resumes. · ${times}`;
      void where;
    } else if (idle >= 5000) label += ` · still working (last change ${Math.floor(idle / 1000)} s ago)`;
    return {pct: last.total ? Math.min(1, last.done / last.total) : 1, label, stalled};
  };
  const draw = () => { const out = compose(); if (out && !isStopping()) paint(out); return out; };
  return {
    report(p) {
      last = p;
      const sk = `${p.phase}|${p.step ?? ''}`;
      if (sk !== stepKey) { stepKey = sk; stepAt = now(); }
      const k = keyOf(p);
      if (k !== key) { key = k; movedAt = now(); warned = false; }
      return draw();
    },
    beat() {
      const out = draw();
      if (out?.stalled && !warned) {
        warned = true;
        warn(`Sync has not moved for ${Math.floor((now() - movedAt) / 1000)} s at "${last.label}" step "${last.step ?? ''}" ${last.stepDone ?? last.done} of ${last.stepTotal ?? last.total}${last.name ? `, record "${last.name}"` : ''}`);
      }
      return out;
    },
    elapsed: () => now() - startedAt,
    current: () => last
  };
}
