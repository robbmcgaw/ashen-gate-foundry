// Quest Log 0.25.0: `supersedes`. When General Manager replaces a person, faction or handout under a new permanent id, a quest
// that named the old id (its giver, issuing faction, any typed ref) must name the new one. Pure plan + one injected writer.
// Quest, Order and Contract ids are Quest Log's own records and are never renamed here. Idempotent: a quest that does not
// mention an old id is not touched. Play state is kept; only the id strings move.
const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const OWN_RECORD = /^(?:QUEST|ORDER|CONTRACT)-/;

/** records: [{id, source, state}]. Returns {updates: [{id, source, state}], changed, notes}. Nothing is mutated. */
export function planSupersede(map, records) {
  const ids = isObj(map) ? map : {};
  const notes = [], usable = {};
  for (const [from, to] of Object.entries(ids)) {
    if (OWN_RECORD.test(from)) { notes.push(`${from}: a Quest, Order or Contract id is a Quest Log record and is not re-keyed here.`); continue; }
    usable[from] = to;
  }
  const updates = [];
  for (const {id, source, state} of records) {
    let touched = false;
    const next = structuredClone(source);
    const seen = new Set();
    next.refs = (Array.isArray(next.refs) ? next.refs : []).map(r => {
      if (isObj(r) && Object.prototype.hasOwnProperty.call(usable, r.target_id)) { touched = true; return {...r, target_id: usable[r.target_id]}; }
      return r;
    }).filter(r => {
      const key = isObj(r) ? `${r.relation}|${r.target_id}` : null;
      if (key === null) return true;
      if (seen.has(key)) { touched = true; return false; }
      seen.add(key); return true;
    });
    const names = isObj(state?.linkNames) ? state.linkNames : null;
    const nextState = structuredClone(state);
    if (names) for (const [from, to] of Object.entries(usable)) if (Object.prototype.hasOwnProperty.call(names, from)) {
      if (!Object.prototype.hasOwnProperty.call(names, to)) nextState.linkNames[to] = names[from];
      delete nextState.linkNames[from]; touched = true;
    }
    if (touched) updates.push({id, source: next, state: nextState});
  }
  return {updates, changed: updates.length, notes};
}

/** api.supersedeIds({OLD: 'NEW'}, {dryRun}). io: assertGM(), records(), save(id, source, state). */
export async function runSupersede(map, options, io) {
  io.assertGM();
  if (!isObj(map)) throw new TypeError('supersedeIds needs a {oldId: newId} object.');
  for (const [k, v] of Object.entries(map)) if (typeof k !== 'string' || typeof v !== 'string' || !k || !v || k === v) throw new TypeError('Every pair must be two different non-empty ids.');
  const plan = planSupersede(map, io.records());
  const dryRun = options?.dryRun === true;
  if (!dryRun) for (const u of plan.updates) await io.save(u.id, u.source, u.state);
  return {module: 'ashen-gate-quest-manager', changed: plan.changed, notes: plan.notes, dryRun};
}
