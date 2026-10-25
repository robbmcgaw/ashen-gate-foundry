/** Renown 0.17.0: `supersedes` for information entries. Portable: no Foundry runtime here.
 *
 * A new entry that supersedes an old entry id takes the old entry's place in a faction or deity:
 *  - the stored definition's entry id is renamed (the new entry's own text replaces the old text when the file is given);
 *  - the group state's knowledge["<old>"] = {party, actors[]} moves to knowledge["<new>"], so what the party learned is kept.
 * Track ids, standings, claims, requests, rewards and choices are not touched. Idempotent: an old id that is not there is
 * skipped, and a second run changes nothing. A superseded faction/deity id (root) is reported, never renamed.
 */
const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const ENTRY_BODY = ['name', 'text', 'uuid', 'link_mode', 'unlock', 'threshold'];

/** Entry ids the file replaces: [{old, new, faction}] from definitions[].entries[].supersedes. */
export function entrySupersedes(definitions) {
  const out = [];
  for (const def of Array.isArray(definitions) ? definitions : []) for (const e of Array.isArray(def?.entries) ? def.entries : [])
    for (const old of Array.isArray(e?.supersedes) ? e.supersedes : []) if (typeof old === 'string' && old && typeof e.id === 'string') out.push({old, new: e.id, faction: def.id});
  return out;
}

const mergeKnowledge = (a, b) => ({party: Boolean(a?.party || b?.party), actors: [...new Set([...(a?.actors ?? []), ...(b?.actors ?? [])])]});

/**
 * Pure plan. factions: [{docId, faction}], groups: [{docId, state}] (state.faction_id names its faction), map: {old: new},
 * definitions (optional): the new definitions from the file, for the replacement entry text.
 * Returns {factionUpdates: [{docId, faction}], groupUpdates: [{docId, set: {newId: knowledge}, remove: [oldId]}], changed, notes, skipped}.
 * Nothing is mutated.
 */
export function planSupersede(map, {factions, groups}, definitions = []) {
  const ids = isObj(map) ? map : {};
  const out = {factionUpdates: [], groupUpdates: [], changed: 0, notes: [], skipped: []};
  const newEntry = new Map();
  for (const def of definitions ?? []) for (const e of def?.entries ?? []) if (e?.id) newEntry.set(`${def.id}|${e.id}`, e);
  const rootHit = new Set();
  for (const {docId, faction} of factions) {
    if (Object.prototype.hasOwnProperty.call(ids, faction.id) && !rootHit.has(faction.id)) { rootHit.add(faction.id); out.skipped.push({id: faction.id, reason: 'Renaming a whole faction or deity is not supported here; its saved Renown stays under the old id.'}); }
    const entries = Array.isArray(faction.entries) ? faction.entries : [];
    const renames = [];
    for (const e of entries) {
      if (!Object.prototype.hasOwnProperty.call(ids, e.id)) continue;
      const to = ids[e.id];
      if (/[.]/.test(e.id) || /[.]/.test(to)) { out.skipped.push({id: e.id, reason: 'Ids with a dot cannot be moved.'}); continue; }
      if (entries.some(x => x.id === to)) { out.skipped.push({id: e.id, reason: `${faction.id} already has an entry ${to}; the old one is left for you to remove.`}); continue; }
      renames.push({from: e.id, to});
    }
    if (!renames.length) continue;
    const next = structuredClone(faction);
    for (const r of renames) {
      const entry = next.entries.find(x => x.id === r.from);
      const fresh = newEntry.get(`${faction.id}|${r.to}`);
      if (fresh) for (const key of ENTRY_BODY) if (Object.prototype.hasOwnProperty.call(fresh, key)) entry[key] = structuredClone(fresh[key]);
      entry.id = r.to;
    }
    out.factionUpdates.push({docId, faction: next});
    out.changed += renames.length;
    const group = groups.find(g => g.state?.faction_id === faction.id);
    if (group && isObj(group.state.knowledge)) {
      const knowledge = group.state.knowledge, set = {}, remove = [];
      for (const r of renames) if (Object.prototype.hasOwnProperty.call(knowledge, r.from)) {
        set[r.to] = Object.prototype.hasOwnProperty.call(knowledge, r.to) ? mergeKnowledge(knowledge[r.from], knowledge[r.to]) : structuredClone(knowledge[r.from]);
        remove.push(r.from);
      }
      if (remove.length) out.groupUpdates.push({docId: group.docId, set, remove});
    }
  }
  if (out.skipped.length) out.notes.push(...out.skipped.map(s => `${s.id}: ${s.reason}`));
  return out;
}

/**
 * The whole operation behind api.supersedeIds, with every Foundry call injected (so it is testable and the GM check is first):
 *   io.assertGM(), io.factions() -> [{docId, faction}], io.groups() -> [{docId, state}],
 *   io.writeGroup(docId, {set, remove}), io.writeEntries(docId, entries), io.after()
 */
export async function runSupersede(map, options, io) {
  io.assertGM();
  if (!isObj(map)) throw new TypeError('supersedeIds needs a {oldId: newId} object.');
  for (const [k, v] of Object.entries(map)) if (typeof k !== 'string' || typeof v !== 'string' || !k || !v || k === v) throw new TypeError('Every pair must be two different non-empty ids.');
  const plan = planSupersede(map, {factions: io.factions(), groups: io.groups()}, options?.definitions);
  const dryRun = options?.dryRun === true;
  if (!dryRun && plan.changed) {
    // Knowledge first: if this stops part way, running it again finishes the move (the old key is simply gone).
    for (const g of plan.groupUpdates) await io.writeGroup(g.docId, {set: g.set, remove: g.remove});
    for (const f of plan.factionUpdates) await io.writeEntries(f.docId, f.faction.entries);
    await io.after?.();
  }
  return {module: 'ashen-gate-factions', changed: plan.changed, notes: plan.notes, dryRun};
}
