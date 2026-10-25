/**
 * `supersedes` (0.64.0): a new record that takes over from an old permanent id. Pure logic, no Foundry globals.
 *
 * Contract (ag-foundry-import/0.1 and /0.2; an optional, additive field on a record):
 *   "supersedes": ["<old permanent id>"]
 *  - an array of well-formed permanent id strings (the same pattern as `id`), no repeats;
 *  - an old id may not equal the record's own id;
 *  - no two records in the package claim the same old id (one new record per old id);
 *  - an old id that is still a record in the same package is an error (the old record must be gone).
 * A record whose old id is bound to a world document can REPLACE that document in place (the GM chooses Yes / No / Skip
 * per row in the preview; nothing is written before Apply). With no old document in the world the record is simply imported.
 */
export const SUPERSEDES_KEY = 'supersedes';
export const SUPERSEDE_CHOICES = Object.freeze(['yes', 'no', 'skip']);
/** Partner modules call this: api.supersedeIds({OLD: 'NEW'}, {dryRun}) (GM only, idempotent). */
export const PARTNER_API = 'supersedeIds';
/** Document types Manager can rebind in place. */
export const REBINDABLE = Object.freeze(['Actor', 'JournalEntry', 'Item']);

const isStr = v => typeof v === 'string' && v.trim() !== '';
/** The record's old ids (strings only; validation reports anything else). */
export const supersedesOf = record => Array.isArray(record?.[SUPERSEDES_KEY]) ? record[SUPERSEDES_KEY].filter(isStr) : [];
export const hasSupersedes = record => record != null && Object.prototype.hasOwnProperty.call(record, SUPERSEDES_KEY);

/** Errors for the whole record list. `idPattern` is the id pattern the package uses (legacy or contract). */
export function validateSupersedes(records, idPattern) {
  const errors = [], claimed = new Map(), present = new Set(records.map(r => r?.id).filter(isStr));
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || !hasSupersedes(record)) return;
    const label = `records[${index}]${isStr(record.id) ? ` (${record.id})` : ''}.supersedes`;
    const list = record[SUPERSEDES_KEY];
    if (!Array.isArray(list)) { errors.push(`${label}: must be an array of permanent id strings.`); return; }
    if (!list.length) { errors.push(`${label}: must not be empty (leave the field out instead).`); return; }
    const seen = new Set();
    list.forEach((old, i) => {
      if (typeof old !== 'string' || !idPattern.test(old)) { errors.push(`${label}[${i}]: invalid permanent ID.`); return; }
      if (seen.has(old)) errors.push(`${label}[${i}]: ${old} is listed twice.`);
      seen.add(old);
      if (old === record.id) errors.push(`${label}[${i}]: a record cannot supersede its own id (${old}).`);
      if (present.has(old) && old !== record.id) errors.push(`${label}[${i}]: ${old} is still a record in this package; remove the old record, or do not supersede it.`);
      if (claimed.has(old) && claimed.get(old) !== record.id) errors.push(`${label}[${i}]: ${old} is also claimed by ${claimed.get(old)}; only one new record may supersede an id.`);
      else claimed.set(old, record.id);
    });
  });
  return errors;
}

/** Map oldId -> newId over records (first claim wins; validation already rejects duplicates). */
export function supersedeMap(records) {
  const map = new Map();
  for (const r of records ?? []) for (const old of supersedesOf(r)) if (isStr(r.id) && !map.has(old)) map.set(old, r.id);
  return map;
}

/**
 * Decides, for one record, what the preview offers.
 *   bySource: Map(sourceId -> [snapshot]) of Manager-bound world documents.
 * Returns null (no supersedes, or nothing to offer: the record imports as usual) or
 *   {newId, oldId, snap?, state: 'offer'|'ambiguous'|'blocked', reason?}
 */
export function offerFor(record, bySource) {
  const olds = supersedesOf(record);
  if (!olds.length || (bySource.get(record.id)?.length ?? 0) > 0) return null; // the new id already exists: nothing special
  const found = olds.flatMap(oldId => (bySource.get(oldId) ?? []).map(snap => ({oldId, snap})));
  if (!found.length) return null;
  const type = record.foundry?.document_type;
  if (found.length > 1) return {newId: record.id, oldId: found[0].oldId, state: 'ambiguous', reason: `${found.length} world documents are bound to the ids this record replaces; resolve that in Foundry first.`};
  const {oldId, snap} = found[0];
  if (!REBINDABLE.includes(type)) return {newId: record.id, oldId, snap, state: 'blocked', reason: `A ${type ?? 'record'} cannot be replaced in place; only Actors, Journals and Items can.`};
  if (snap.documentName !== type) return {newId: record.id, oldId, snap, state: 'blocked', reason: `The world document is a ${snap.documentName}, not a ${type}.`};
  if (snap.archived) return {newId: record.id, oldId, snap, state: 'blocked', reason: 'The old document is archived in Manager; restore it first.'};
  if (snap.documentName === 'Actor' && (snap.type === 'character' || record.foundry?.data?.type === 'character')) return {newId: record.id, oldId, snap, state: 'blocked', reason: 'Character sheets are never replaced.'};
  return {newId: record.id, oldId, snap, state: 'offer'};
}

/** Replaces every old id with its new one inside a list of id strings or ref objects (target_id / id). Returns {value, changed}. */
export function rewriteRefs(list, map) {
  let changed = false;
  const lookup = id => map instanceof Map ? map.get(id) : Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;
  const out = (Array.isArray(list) ? list : []).map(ref => {
    if (typeof ref === 'string') { const n = lookup(ref); if (n) { changed = true; return n; } return ref; }
    if (ref && typeof ref === 'object') {
      for (const key of ['target_id', 'id']) if (typeof ref[key] === 'string') { const n = lookup(ref[key]); if (n) { changed = true; return {...ref, [key]: n}; } }
    }
    return ref;
  });
  // Two ids can collapse into one; keep the first.
  const seen = new Set();
  const value = out.filter(x => { if (typeof x !== 'string') return true; if (seen.has(x)) { changed = true; return false; } seen.add(x); return true; });
  return {value, changed};
}

/**
 * Edits to make to a rebound Actor/Item/Journal's fields so it reads as the new record, on top of the sync planners' ops:
 *  - Actor: the biography follows the new record; the token ring is written only where the Actor has no ring on yet;
 *    the prototype token's name follows the new name when it still carries the old one.
 * `raw` is the old document's toObject(); `ops` the planner's {fields, changes}. Mutates and returns ops.
 */
export function adjustRebindOps(ops, record, raw) {
  if (record.foundry?.document_type !== 'Actor') return ops;
  const data = record.foundry.data ?? {};
  const bio = data.system?.details?.biography?.value;
  const liveBio = raw.system?.details?.biography?.value;
  if (typeof bio === 'string' && bio !== liveBio) {
    ops.fields['system.details.biography.value'] = bio;
    ops.changes.push({path: 'system.details.biography.value', label: 'biography', from: '(text)', to: '(text)', gmEdited: false});
  }
  const ringOn = Boolean(raw.prototypeToken?.ring?.enabled);
  if (ringOn) {
    for (const path of Object.keys(ops.fields)) if (path.startsWith('prototypeToken.ring')) delete ops.fields[path];
    ops.changes = ops.changes.filter(c => !String(c.path).startsWith('prototypeToken.ring'));
  }
  if (!Object.prototype.hasOwnProperty.call(ops.fields, 'prototypeToken.name') && typeof data.name === 'string'
    && raw.prototypeToken?.name === raw.name && raw.prototypeToken?.name !== data.name) {
    ops.fields['prototypeToken.name'] = data.name;
    ops.changes.push({path: 'prototypeToken.name', label: 'prototypeToken.name', from: raw.prototypeToken.name, to: data.name, gmEdited: false});
  }
  return ops;
}

/**
 * `supersedes` inside a specialist file. Renown (factions files): on a faction/deity definition and on its information
 * entries. Returns {map: {OLD: NEW}, items: [{old, new, level, owner}], definitions: [definition]} (definitions that carry any).
 * Other kinds have nothing to re-key today.
 */
export function collectSpecialistSupersedes(kind, payload) {
  const out = {map: {}, items: [], definitions: []};
  if (kind !== 'factions' || !Array.isArray(payload?.definitions)) return out;
  for (const def of payload.definitions) {
    if (!def || typeof def !== 'object') continue;
    const before = out.items.length;
    const add = (node, level) => { for (const old of supersedesOf(node)) if (isStr(node.id) && old !== node.id && !(old in out.map)) { out.map[old] = node.id; out.items.push({old, new: node.id, level, owner: def.id}); } };
    add(def, 'faction');
    for (const entry of Array.isArray(def.entries) ? def.entries : []) add(entry, 'entry');
    if (out.items.length > before) out.definitions.push(def);
  }
  return out;
}
export const SUPERSEDE_ROW_ID = 'SUPERSEDES-IDS';
