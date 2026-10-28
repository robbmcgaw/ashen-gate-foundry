/**
 * Ashen Gate Locations 0.30.0: "People here" and "Shops here". Pure: no Foundry globals, so everything here is unit-tested.
 *
 * People: a location keeps links to the NPC Actors (or Journals) the GM says are here. General Manager records where an NPC
 * lives in the record's refs (`found_at` is the documented relation; `located_at`, `based_at` and the like are read the same
 * way) and sometimes as a plain `location_id`. Those make a SUGGESTION the GM confirms with one click; nothing links by itself.
 * A `related` ref to a location is much looser (the packs use it for any connection), so it is offered too but labelled as such.
 *
 * Shops: Ashen Gate | Utilities owns shops and who they are shown to. Locations only asks its API, and works without it.
 */
import {NPC_ID, LOCATION_ID} from './model.mjs';

export const MANAGER_MODULE = 'ashen-gate-manager';
export const UTILITIES_MODULE = 'ashen-gate-utilities';
/** Relations that put an NPC at a place. */
export const PLACED_RELATIONS = Object.freeze(['found_at', 'located_at', 'based_at', 'resides_at', 'lives_at', 'works_at', 'present_at', 'home_location']);
/** Relations that only say the record mentions the place. */
export const MENTION_RELATIONS = Object.freeze(['related']);
/** Plain definition fields that name the NPC's place. */
const PLACE_FIELDS = Object.freeze(['location_id', 'locationId', 'home_location_id', 'location']);

const refParts = ref => {
  if (typeof ref === 'string') return {relation: 'related', id: ref};
  if (!ref || typeof ref !== 'object') return null;
  const id = ref.target_id ?? ref.targetId ?? ref.id;
  return typeof id === 'string' ? {relation: String(ref.relation ?? ref.type ?? 'related'), id} : null;
};
/**
 * The places a General Manager source flag ({sourceId, refs, definition}) names, strongest first:
 * [{locationId, relation, placed: boolean}]. A location is listed once, with its strongest reason.
 */
export function placesOfSource(source) {
  if (!source || typeof source !== 'object') return [];
  const found = new Map();
  const add = (locationId, relation, placed) => {
    if (!LOCATION_ID.test(locationId ?? '')) return;
    const had = found.get(locationId);
    if (!had || (placed && !had.placed)) found.set(locationId, {locationId, relation, placed});
  };
  const def = source.definition && typeof source.definition === 'object' ? source.definition : {};
  for (const ref of [...(Array.isArray(source.refs) ? source.refs : []), ...(Array.isArray(def.refs) ? def.refs : [])]) {
    const p = refParts(ref);
    if (!p) continue;
    if (PLACED_RELATIONS.includes(p.relation)) add(p.id, p.relation, true);
    else if (MENTION_RELATIONS.includes(p.relation)) add(p.id, p.relation, false);
  }
  for (const f of PLACE_FIELDS) if (typeof def[f] === 'string') add(def[f].trim(), f, true);
  return [...found.values()].sort((a, b) => Number(b.placed) - Number(a.placed));
}

/**
 * What the matcher needs from a world Actor (or a Journal), read defensively. Works on a live document or a plain object.
 * `lifecycle.archived` is General Manager's archive flag; a player's character or a Hub level-up backup is never a person here.
 */
export function actorFacts(doc) {
  const flags = doc?.flags ?? {};
  const read = (scope, key) => { try { return doc?.getFlag?.(scope, key) ?? flags?.[scope]?.[key]; } catch { return flags?.[scope]?.[key]; } };
  const source = read(MANAGER_MODULE, 'source');
  const sourceId = typeof source?.sourceId === 'string' && NPC_ID.test(source.sourceId) ? source.sourceId : '';
  const lifecycle = read(MANAGER_MODULE, 'lifecycle');
  const type = doc?.documentName ?? doc?.docType ?? 'Actor';
  const levelBackup = !!flags?.['ashen-gate-character-hub']?.levelBackup;
  const playerOwned = type === 'Actor' && (doc?.type === 'character' || doc?.hasPlayerOwner === true);
  return {uuid: typeof doc?.uuid === 'string' ? doc.uuid : '', name: String(doc?.name ?? ''), docType: type, sourceId,
    places: sourceId ? placesOfSource(source) : [], excluded: levelBackup || playerOwned || lifecycle?.archived === true};
}

/**
 * Suggestions for one location from the world's Actors: [{uuid, name, docType, sourceId, relation, placed}], the ones the record
 * places here first, then the ones that only mention it, each by name. Already-linked people (by uuid or by sourceId) and
 * excluded Actors are left out.
 */
export function npcSuggestions(docs, locationId, linkedEntries = []) {
  const haveUuid = new Set(linkedEntries.map(e => e.uuid).filter(Boolean));
  const haveSource = new Set(linkedEntries.map(e => e.sourceId).filter(Boolean));
  const out = [];
  for (const doc of docs ?? []) {
    const f = actorFacts(doc);
    if (f.excluded || !f.uuid || !f.sourceId || haveUuid.has(f.uuid) || haveSource.has(f.sourceId)) continue;
    const hit = f.places.find(p => p.locationId === locationId);
    if (hit) out.push({uuid: f.uuid, name: f.name, docType: f.docType, sourceId: f.sourceId, relation: hit.relation, placed: hit.placed});
  }
  return out.sort((a, b) => Number(b.placed) - Number(a.placed) || a.name.localeCompare(b.name));
}

/**
 * The world document a People entry points at: the one with its uuid, else the single one with its sourceId (an NPC imported
 * again gets a new uuid). `null` when neither is found or the sourceId is ambiguous. `docs` are live documents or plain objects.
 */
export function resolveLinked(entry, docs) {
  const all = [...(docs ?? [])].map(d => ({doc: d, f: actorFacts(d)}));
  const byUuid = entry?.uuid ? all.find(x => x.f.uuid === entry.uuid) : null;
  if (byUuid) return {doc: byUuid.doc, rebound: false};
  if (!entry?.sourceId) return null;
  const same = all.filter(x => x.f.sourceId === entry.sourceId && !x.f.excluded);
  return same.length === 1 ? {doc: same[0].doc, rebound: true} : null;
}
/**
 * Entries whose uuid no longer resolves but whose NPC id finds exactly one Actor: [{key, uuid, docType, label}] to re-link. A
 * plain list; the caller decides when to apply it (the editor's Re-link button). `exists(uuid)` says whether a uuid still resolves.
 */
export function relinkPlan(entries, docs, exists = () => false) {
  const plan = [];
  for (const e of entries ?? []) {
    if (e.uuid && exists(e.uuid)) continue;
    const hit = e.sourceId ? resolveLinked({...e, uuid: ''}, docs) : null;
    if (hit) { const f = actorFacts(hit.doc); if (f.uuid && f.uuid !== e.uuid) plan.push({key: e.key, uuid: f.uuid, docType: f.docType, name: f.name}); }
  }
  return plan;
}
/** Applies a relink plan to a list of entries (new objects; the input is untouched). */
export function applyRelink(entries, plan) {
  const by = new Map(plan.map(p => [p.key, p]));
  return entries.map(e => by.has(e.key) ? {...e, uuid: by.get(e.key).uuid, docType: by.get(e.key).docType} : e);
}

/* ---------------- Shops (through Ashen Gate | Utilities) ---------------- */

/** The Utilities shops API, or a reason there is none: {state: 'ok' | 'inactive' | 'old', shops}. */
export function shopsApiState(modules) {
  const m = modules?.get?.(UTILITIES_MODULE);
  if (!m?.active) return {state: 'inactive', shops: null};
  const shops = m.api?.shops;
  if (!shops || typeof shops.present !== 'function') return {state: 'inactive', shops: null};
  return typeof shops.atPlace === 'function' ? {state: 'ok', shops} : {state: 'old', shops};
}
/** "Shown to all players" / "Shown to 2 players" / "Not shown", from an atPlace row. */
export function shownText(row) {
  if (!row?.presented) return 'Not shown to players';
  if (row.mode === 'users') return `Shown to ${row.count} ${row.count === 1 ? 'player' : 'players'}`;
  return 'Shown to all players';
}
/**
 * GM rows for "Shops here": [{id, name, merchant, kind, presented, shown}] or {state}. Never throws: a Utilities that refuses or
 * fails reads as an empty list with state 'error'.
 */
export function shopsHere(modules, locationId, {includeChildren = false} = {}) {
  const {state, shops} = shopsApiState(modules);
  if (state !== 'ok' || !LOCATION_ID.test(locationId ?? '')) return {state, rows: []};
  try {
    const rows = shops.atPlace(locationId, {includeChildren: includeChildren === true});
    return {state: 'ok', rows: (Array.isArray(rows) ? rows : []).filter(r => r?.id).map(r => ({id: String(r.id), name: String(r.name ?? ''), merchant: String(r.merchant ?? ''),
      kind: r.kind === 'service' ? 'service' : 'shop', presented: r.presented === true, shown: shownText(r)}))};
  } catch (err) { return {state: 'error', rows: [], error: err?.message ?? String(err)}; }
}
/**
 * The shops shown to THIS player at a place, from Utilities' own player-filtered `forMe()`: [{id, name, merchant, kind}].
 * `view` is the player's Locations view of the place (null, hidden or unidentified: nothing). A shop matches by the place key
 * Utilities puts on the view, which it does only for a place revealed to everyone. Nothing about an unshown shop is ever read.
 */
export function shopsForPlayer(modules, view) {
  if (!view || view.state !== 'revealed' || !view.key) return [];
  const {state, shops} = shopsApiState(modules);
  if (state === 'inactive' || typeof shops?.forMe !== 'function') return [];
  try {
    const views = shops.forMe();
    return (Array.isArray(views) ? views : []).filter(v => v?.id && v.placeKey === view.key)
      .map(v => ({id: String(v.id), name: String(v.name ?? ''), merchant: String(v.merchant?.name ?? ''), kind: v.kind === 'service' ? 'service' : 'shop'}));
  } catch { return []; }
}
