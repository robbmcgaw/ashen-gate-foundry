/**
 * Ashen Gate Locations 1.10.0: routes (point-crawl edges). Pure; no Foundry globals.
 *
 * A route joins two locations by LOC id. It is undirected unless `directed` is set (then it runs from → to only).
 * Its RTE-* id is made once from the two endpoint ids and is never reused, even after the route is deleted.
 * `distanceKm` is the whole route; `legKm` is one leg (null = the world default), so legs = ceil(distance / leg).
 *
 * Discovery: unknown (players get nothing), rumoured, known, explored. A player sees a discovered route only while
 * both endpoints are visible to them (not Hidden, and in each one's audience) and they are in the route's own
 * audience. Otherwise they get nothing, or, only when the GM ticks `unknownPath`, an unnamed "Unknown path" naming
 * just the end they can see. A player view never carries the RTE id, a hidden place's name or key, the GM notes,
 * the hazard table or the hazard chance.
 */
import {LOCATION_ID, PIN_KEY, DEFAULT_UNIDENTIFIED_LABEL, newPinKey, normalizeAudience, inAudience, line, text, bool, safeUuid} from './model.mjs';

export const ROUTE_ID = /^RTE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const ROUTE_STATES = Object.freeze(['unknown', 'rumoured', 'known', 'explored']);
export const ROUTE_STATE_LABELS = Object.freeze({unknown: 'Unknown', rumoured: 'Rumoured', known: 'Known', explored: 'Explored'});
/** Starting values for a new route; the leg length is also the world setting's default. GM-editable. */
export const ROUTE_DEFAULTS = Object.freeze({legKm: 5, hazardBase: 5});
export const UNKNOWN_PATH = 'Unknown path';
const MAX_KM = 100000;
/** Kilometres are kept to 0.01 km, so the smallest distance or leg is 0.01 km. */
export const MIN_KM = 0.01;
const roundKm = n => Math.round(n * 100) / 100;
/** A usable distance or leg: a number that is still above 0 and at most MAX_KM once rounded (1.15.2: 0.004 is not). */
export const kmOk = n => Number.isFinite(n) && roundKm(n) > 0 && roundKm(n) <= MAX_KM;
const DISTANCE_PROBLEM = `Distance must be from ${MIN_KM} to ${MAX_KM} km.`;
const filled = value => value !== '' && value !== null && value !== undefined;
const km = (value, fallback) => filled(value) && kmOk(Number(value)) ? roundKm(Number(value)) : fallback;
const pct = (value, fallback) => {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : fallback;
};
const locId = value => LOCATION_ID.test(value ?? '') ? value : '';

/** Fills defaults and drops anything malformed. Re-runnable. */
export function normalizeRoute(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.hazardTable && typeof r.hazardTable === 'object' ? r.hazardTable : {};
  return {
    id: ROUTE_ID.test(r.id ?? '') ? r.id : '',
    // Random and opaque: the only handle players' pages carry (like a location's pinKey).
    viewKey: PIN_KEY.test(r.viewKey ?? '') ? r.viewKey : newPinKey(),
    name: line(r.name),
    fromId: locId(r.fromId), toId: locId(r.toId),
    directed: bool(r.directed, false),
    distanceKm: km(r.distanceKm, 0),
    legKm: km(r.legKm, null),
    terrain: line(r.terrain, 80),
    hazardTable: {uuid: safeUuid(t.uuid), name: line(t.name, 120)},
    hazardBase: pct(r.hazardBase, ROUTE_DEFAULTS.hazardBase),
    state: ROUTE_STATES.includes(r.state) ? r.state : 'unknown',
    unknownPath: bool(r.unknownPath, false),
    audience: normalizeAudience(r.audience),
    notes: text(r.notes, 5000),
    // 1.12.0: the linked map Drawing (world-local binding; GM only, never exported).
    drawingUuid: safeUuid(r.drawingUuid)
  };
}

/** The world default leg length, or the built-in one when the setting is missing or bad. */
export const defaultLeg = value => km(value, ROUTE_DEFAULTS.legKm);
/** Leg length in effect for a route (never 0, so legs are never Infinity). */
export const legKmOf = (route, defaultLegKm) => km(route.legKm, null) ?? defaultLeg(defaultLegKm);
/** Number of legs: ceil(distance / leg length), at least 1 for a route with a distance; 0 without one. */
export function legsOf(route, defaultLegKm) {
  const d = route.distanceKm, l = legKmOf(route, defaultLegKm);
  return d > 0 ? Math.max(1, Math.ceil(d / l - 1e-9)) : 0;
}

/** RTE-* id from the endpoint ids, unique among every id ever used (`used`), so a deleted route's id is never reissued. */
export function makeRouteId(fromId, toId, used = []) {
  const taken = new Set(used);
  const part = id => String(id ?? '').replace(/^LOC-/, '').slice(0, 28).replace(/-+$/, '') || 'PLACE';
  const base = `RTE-${part(fromId)}-${part(toId)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Problems that stop a route being saved: [message]. `locationIds`: the world's LOC ids. */
export function routeProblems(route, locationIds) {
  const ids = locationIds instanceof Set ? locationIds : new Set(locationIds);
  const out = [];
  if (!route.fromId) out.push('Choose where the route starts (From).');
  else if (!ids.has(route.fromId)) out.push(`From: no location ${route.fromId}.`);
  if (!route.toId) out.push('Choose where the route ends (To).');
  else if (!ids.has(route.toId)) out.push(`To: no location ${route.toId}.`);
  if (route.fromId && route.fromId === route.toId) out.push('A route must join two different locations.');
  if (!(route.distanceKm > 0)) out.push(DISTANCE_PROBLEM);
  return out;
}

/**
 * 1.15.2: distance and leg length as typed (before normalizeRoute) that cannot be used: [message]. A leg length that
 * rounds to 0 would otherwise quietly become the world default, and a distance that does would read as "no distance".
 * Blank leg length is fine (world default).
 */
export function routeKmProblems(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = [];
  if (filled(r.distanceKm) && !kmOk(Number(r.distanceKm))) out.push(DISTANCE_PROBLEM);
  if (filled(r.legKm) && !kmOk(Number(r.legKm))) out.push(`Leg length must be from ${MIN_KM} to ${MAX_KM} km, or blank for the world default.`);
  return out;
}

/** Does this route touch the location? */
export const routeTouches = (route, id) => route.fromId === id || route.toId === id;

// ---------- player views ----------
/** May this player see this endpoint at all? (Not Hidden, has published content, in its audience.) */
export const endVisibleTo = (loc, userId) => !!loc && loc.state !== 'hidden' && !!loc.published && inAudience(loc, userId);
/** An endpoint as players see it: a revealed place by name (and id), an unidentified one by its label and key only. */
export const endRef = (loc, label) => loc.state === 'revealed'
  ? {id: loc.id, key: loc.pinKey, name: loc.published.name}
  : {key: loc.pinKey, name: loc.published.unidentifiedLabel || line(label, 80) || DEFAULT_UNIDENTIFIED_LABEL};

/**
 * Which version of the route a player gets: 'full', 'from' / 'to' (an "Unknown path" showing only that end), or null.
 * `locById`: Map of normalized locations.
 */
export function routeVariantFor(raw, locById, userId) {
  const route = normalizeRoute(raw);
  if (!route.id || route.state === 'unknown' || !inAudience(route, userId)) return null;
  const f = endVisibleTo(locById.get(route.fromId), userId), t = endVisibleTo(locById.get(route.toId), userId);
  if (f && t) return 'full';
  if (!route.unknownPath) return null;
  return f ? 'from' : t ? 'to' : null;
}

/**
 * The player-safe route for one variant. Full: name, both ends, state, distance, legs, leg length, terrain, one-way.
 * Unknown path: the fixed name "Unknown path" and the one end the player can see; nothing else.
 */
export function routeView(raw, locById, variant, {label = '', defaultLegKm} = {}) {
  const route = normalizeRoute(raw);
  const ref = id => endRef(locById.get(id), label);
  if (variant === 'full') {
    const view = {key: route.viewKey, variant, state: route.state, name: route.name, from: ref(route.fromId), to: ref(route.toId), directed: route.directed,
      distanceKm: route.distanceKm, legs: legsOf(route, defaultLegKm), legKm: legKmOf(route, defaultLegKm)};
    if (route.terrain) view.terrain = route.terrain;
    return view;
  }
  if (variant === 'from' || variant === 'to') {
    const end = ref(variant === 'from' ? route.fromId : route.toId);
    return {key: route.viewKey, variant, state: 'unknown-path', name: UNKNOWN_PATH, [variant]: end};
  }
  return null;
}

/**
 * Every version of a route that some player should get: [{variant, view, userIds}]. `players`: player user ids.
 * The store gives each its own page, readable only by those players.
 */
export function routeAudiences(raw, locations, players, opts = {}) {
  const locById = locations instanceof Map ? locations : new Map(locations.map(l => [l.id, l]));
  const groups = new Map();
  for (const u of players) {
    const variant = routeVariantFor(raw, locById, u);
    if (!variant) continue;
    if (!groups.has(variant)) groups.set(variant, {variant, view: routeView(raw, locById, variant, opts), userIds: []});
    groups.get(variant).userIds.push(u);
  }
  return [...groups.values()];
}

/** The label a route shows in lists: its name, or "From → To" ("From – To" when two-way). */
export function routeLabel(route, nameOf = id => id) {
  if (route.name) return route.name;
  const a = route.from ? route.from.name : nameOf(route.fromId), b = route.to ? route.to.name : nameOf(route.toId);
  return `${a || 'Unknown'} ${route.directed ? '→' : '–'} ${b || 'Unknown'}`;
}

// ---------- import / export ----------
/** Route records travel in the same ag-foundry-import/0.2 envelope as Location records (see docs/routes-schema.md). */
export function routeRecord(raw) {
  const r = normalizeRoute(raw);
  const route = {from_location_id: r.fromId, to_location_id: r.toId, distance_km: r.distanceKm, hazard_base_percent: r.hazardBase,
    discovery_state: r.state, directed: r.directed};
  if (r.legKm != null) route.leg_km = r.legKm;
  if (r.name) route.name = r.name;
  if (r.terrain) route.terrain = r.terrain;
  if (r.hazardTable.uuid || r.hazardTable.name) route.hazard_table = r.hazardTable.uuid || r.hazardTable.name;
  if (r.notes) route.notes = r.notes;
  return {id: r.id, entity_type: 'Route', status: 'draft', version: '1.0.0', provenance: {sources: ['ashen-gate-locations export']}, visibility: 'gm',
    refs: [{relation: 'route_from', target_id: r.fromId, mode: 'required'}, {relation: 'route_to', target_id: r.toId, mode: 'required'}],
    name: r.name || `${r.fromId} to ${r.toId}`, route};
}

const UUID_LIKE = /^(?:RollTable|Compendium)\.[A-Za-z0-9._-]+$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null;
/**
 * One Route record → {route, errors, given}. Bad numbers are errors (never quietly replaced by defaults).
 * `given`: the route fields the record actually sets, so an update keeps the world's value for the rest.
 */
export function routeFromRecord(rec) {
  const errors = [];
  const f = rec?.route && typeof rec.route === 'object' ? rec.route : {};
  const refs = Array.isArray(rec?.refs) ? rec.refs : [];
  const refTo = rel => refs.find(r => r?.relation === rel)?.target_id;
  const fromId = f.from_location_id ?? refTo('route_from');
  const toId = f.to_location_id ?? refTo('route_to');
  if (!ROUTE_ID.test(rec?.id ?? '')) errors.push('id must look like RTE-NAME.');
  if (!LOCATION_ID.test(fromId ?? '')) errors.push('from_location_id must be a LOC-* id.');
  if (!LOCATION_ID.test(toId ?? '')) errors.push('to_location_id must be a LOC-* id.');
  if (fromId && fromId === toId) errors.push('from_location_id and to_location_id must differ.');
  const num = (k, ok, msg) => { if (has(f, k) && (typeof f[k] !== 'number' || !ok(f[k]))) errors.push(msg); };
  if (!has(f, 'distance_km')) errors.push('distance_km is required.');
  num('distance_km', kmOk, `distance_km must be a number from ${MIN_KM} to ${MAX_KM} (km are kept to 0.01).`);
  num('leg_km', kmOk, `leg_km must be a number from ${MIN_KM} to ${MAX_KM} (km are kept to 0.01).`);
  num('hazard_base_percent', n => n >= 0 && n <= 100, 'hazard_base_percent must be a number from 0 to 100.');
  if (has(f, 'discovery_state') && !ROUTE_STATES.includes(f.discovery_state)) errors.push(`discovery_state must be one of ${ROUTE_STATES.join(', ')}.`);
  if (has(f, 'directed') && typeof f.directed !== 'boolean') errors.push('directed must be true or false.');
  if (has(f, 'hazard_table') && typeof f.hazard_table !== 'string') errors.push('hazard_table must be a RollTable UUID or name.');
  const table = typeof f.hazard_table === 'string' ? f.hazard_table.trim() : '';
  const given = new Set();
  const map = {fromId: 'from_location_id', toId: 'to_location_id', distanceKm: 'distance_km', legKm: 'leg_km', hazardBase: 'hazard_base_percent', hazardTable: 'hazard_table',
    terrain: 'terrain', directed: 'directed', notes: 'notes', state: 'discovery_state'};
  for (const [k, src] of Object.entries(map)) if (has(f, src)) given.add(k);
  // The envelope's `name` is a display label (Manager needs one); only a record without a `route` block uses it as the route name.
  if (has(f, 'name') || (!rec?.route && has(rec ?? {}, 'name'))) given.add('name');
  given.add('fromId'); given.add('toId');
  const route = normalizeRoute({id: rec?.id, name: f.name ?? (rec?.route ? '' : rec?.name) ?? '', fromId, toId, distanceKm: f.distance_km, legKm: f.leg_km,
    hazardBase: f.hazard_base_percent, terrain: f.terrain, directed: f.directed, notes: f.notes, state: f.discovery_state ?? 'unknown',
    hazardTable: UUID_LIKE.test(table) ? {uuid: table} : {name: table}});
  return {route, errors, given};
}

/** Play state an update never overwrites: discovery, who can see it, the GM's unknown-path choice, the player page binding and the linked drawing. */
const PLAY_STATE = ['viewKey', 'state', 'audience', 'unknownPath', 'drawingUuid'];

/**
 * Imports Route records into `existing` routes. Endpoints must be in `locationIds` (Manager imports locations first,
 * in the same run). mode 'skip' (default) keeps an existing id unchanged; 'update' replaces its definition but keeps
 * its play state (PLAY_STATE) and any field the record leaves out. `used`: every RTE id ever issued (a deleted
 * route's id is refused, so it is never reused). Returns {created, updated, skipped: [{id, reason}]}.
 */
export function importRouteRecords(records, existing = [], locationIds = [], {mode = 'skip', used = []} = {}) {
  if (!['skip', 'update'].includes(mode)) throw new Error(`Unknown import mode "${mode}"; use "skip" or "update".`);
  if (!Array.isArray(records)) throw new Error('Expected an array of Route records.');
  const ids = locationIds instanceof Set ? locationIds : new Set(locationIds);
  const current = new Map(existing.map(r => [r.id, normalizeRoute(r)]));
  const retired = new Set(used.filter(id => !current.has(id)));
  const seen = new Set(), created = [], updated = [], skipped = [];
  for (const [i, rec] of records.entries()) {
    const id = rec?.id ?? `records[${i}]`;
    if (rec?.entity_type !== 'Route') { skipped.push({id, reason: 'Not a Route record.'}); continue; }
    const {route, errors, given} = routeFromRecord(rec);
    if (errors.length) { skipped.push({id, reason: errors.join(' ')}); continue; }
    if (seen.has(route.id)) { skipped.push({id, reason: 'Duplicate id in this import.'}); continue; }
    seen.add(route.id);
    const missing = [route.fromId, route.toId].filter(l => !ids.has(l));
    if (missing.length) { skipped.push({id, reason: `Endpoint not found: ${missing.join(', ')}. Import or create the location first.`}); continue; }
    if (retired.has(route.id)) { skipped.push({id, reason: 'This route id belonged to a deleted route and is not reused. Give the record a new RTE id.'}); continue; }
    const old = current.get(route.id);
    if (old && mode === 'skip') { skipped.push({id, reason: 'Already exists; kept unchanged.'}); continue; }
    if (!old) { created.push(route); continue; }
    const next = {...route};
    for (const k of Object.keys(route)) if (k !== 'id' && !given.has(k)) next[k] = old[k];
    for (const k of PLAY_STATE) next[k] = old[k];
    updated.push(normalizeRoute(next));
  }
  return {created, updated, skipped};
}
