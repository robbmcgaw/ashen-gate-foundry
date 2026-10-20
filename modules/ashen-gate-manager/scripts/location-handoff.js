import {BLOCKED_STATUSES} from './core.js';

export const LOCATIONS_ID = 'ashen-gate-locations';
export const isLocationRecord = record => record?.entity_type === 'Location';

/** The Locations API when that module is active and new enough to import; otherwise null. */
export function locationsApi(game) {
  const mod = game?.modules?.get?.(LOCATIONS_ID);
  return mod?.active && typeof mod.api?.importLocations === 'function' ? mod.api : null;
}

const skipped = reason => ({action: 'skipped', reason});

/**
 * Preview decision for one Location record. Locations keeps ownership of its data; this only says
 * whether the record will be passed on. existingIds is the set of ids Locations already holds (null when
 * Locations is not available).
 */
export function planLocation(record, {existingIds = null, includeDrafts = false, updateExisting = false} = {}) {
  if (!existingIds) return skipped('Locations is not active: enable Locations to import this record.');
  if (BLOCKED_STATUSES.has(record.status)) return {action: 'blocked', reason: `${record.status} records cannot be imported.`};
  if (record.status !== 'approved' && !includeDrafts) return skipped('Unapproved record; enable Include drafts to test.');
  if (!existingIds.has(record.id)) return {action: 'create', reason: 'New location; imported through Locations.'};
  return updateExisting
    ? {action: 'update', reason: 'Replaces the definition; keeps revealed and exhausted state.'}
    : skipped('Location already exists; kept unchanged. Turn on "Update existing locations and routes" to replace its definition.');
}

/** Warning shown with the preview when Location records cannot be imported. */
export function locationsNote(records, api) {
  const n = records.filter(isLocationRecord).length;
  return n && !api ? `${n} location record${n === 1 ? '' : 's'} skipped: enable Locations` : null;
}

/** Sends the selected Location records to Locations in one call and turns its report into import-log results. */
export async function applyLocations(records, api, {updateExisting = false} = {}) {
  if (!records.length) return [];
  if (!api) return records.map(r => ({id: r.id, kind: 'Location', status: 'skipped', message: 'Locations is not active: enable Locations.'}));
  let report;
  try { report = await api.importLocations(records, {mode: updateExisting ? 'update' : 'skip'}); }
  catch (error) { return records.map(r => ({id: r.id, kind: 'Location', action: 'create', status: 'error', message: String(error?.message ?? error)})); }
  return [
    ...report.created.map(id => ({id, kind: 'Location', action: 'create', status: 'ok'})),
    ...report.updated.map(id => ({id, kind: 'Location', action: 'update', status: 'ok'})),
    ...report.skipped.map(s => ({id: s.id, kind: 'Location', status: 'skipped', message: s.reason}))
  ];
}

// ---------- Routes (Locations 1.10.0+) ----------
export const isRouteRecord = record => record?.entity_type === 'Route';
const LOC_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/** The Locations API when it can import routes (1.10.0+); otherwise null. */
export function routesApi(game) {
  const api = locationsApi(game);
  return api && typeof api.importRoutes === 'function' && typeof api.listRoutes === 'function' ? api : null;
}

/** A Route record's two endpoint ids, from its `route` block or its route_from / route_to refs. */
export function routeEnds(record) {
  const refs = Array.isArray(record?.refs) ? record.refs : [];
  const ref = rel => refs.find(r => r?.relation === rel)?.target_id;
  return [record?.route?.from_location_id ?? ref('route_from'), record?.route?.to_location_id ?? ref('route_to')];
}

/**
 * Preview decision for one Route record. Locations validates every field again and owns the route; this only says
 * whether the record will be passed on. `existingIds`: route ids Locations holds (null when Locations cannot import
 * routes). `locationIds`: LOC ids in the world plus those this import run will create.
 */
export function planRoute(record, {existingIds = null, locationIds = new Set(), includeDrafts = false, updateExisting = false} = {}) {
  if (!existingIds) return skipped('Locations 1.10.0 or later is not active: enable or update Locations to import routes.');
  if (BLOCKED_STATUSES.has(record.status)) return {action: 'blocked', reason: `${record.status} records cannot be imported.`};
  if (record.status !== 'approved' && !includeDrafts) return skipped('Unapproved record; enable Include drafts to test.');
  const [from, to] = routeEnds(record);
  const bad = [from, to].filter(id => !LOC_ID.test(id ?? ''));
  if (bad.length) return {action: 'blocked', reason: 'A route needs from_location_id and to_location_id (LOC-* ids).'};
  if (from === to) return {action: 'blocked', reason: 'A route must join two different locations.'};
  const missing = [from, to].filter(id => !locationIds.has(id));
  if (missing.length) return {action: 'blocked', reason: `Endpoint not in this world or this import: ${missing.join(', ')}.`};
  const km = record.route?.distance_km;
  if (typeof km !== 'number' || !(km > 0)) return {action: 'blocked', reason: 'distance_km must be a number above 0.'};
  if (!existingIds.has(record.id)) return {action: 'create', reason: 'New route; imported through Locations after the locations.'};
  return updateExisting
    ? {action: 'update', reason: 'Replaces the definition; keeps discovery state, who can see it, its map drawing and any journey.'}
    : skipped('Route already exists; kept unchanged. Turn on "Update existing locations and routes" to replace its definition.');
}

/** Warning shown with the preview when Route records cannot be imported. */
export function routesNote(records, api) {
  const n = records.filter(isRouteRecord).length;
  return n && !api ? `${n} route record${n === 1 ? '' : 's'} skipped: enable Locations 1.10.0 or later` : null;
}

/** Sends the selected Route records to Locations (after the locations) and turns its report into import-log results. */
export async function applyRoutes(records, api, {updateExisting = false} = {}) {
  if (!records.length) return [];
  if (!api) return records.map(r => ({id: r.id, kind: 'Route', status: 'skipped', message: 'Locations 1.10.0 or later is not active.'}));
  let report;
  try { report = await api.importRoutes(records, {mode: updateExisting ? 'update' : 'skip'}); }
  catch (error) { return records.map(r => ({id: r.id, kind: 'Route', action: 'create', status: 'error', message: String(error?.message ?? error)})); }
  return [
    ...report.created.map(id => ({id, kind: 'Route', action: 'create', status: 'ok'})),
    ...report.updated.map(id => ({id, kind: 'Route', action: 'update', status: 'ok'})),
    ...report.skipped.map(s => ({id: s.id, kind: 'Route', status: /Already exists/.test(s.reason) ? 'skipped' : 'error', message: s.reason}))
  ];
}

/**
 * The world's source index plus the LOC ids Locations already holds, so a record that requires a location living
 * only in Locations (a route's endpoint) is not reported as an unresolved reference. Existing entries win.
 */
export function withLocationIds(index, api) {
  const out = new Map(index);
  if (!api) return out;
  try { for (const l of api.listLocations()) if (l?.id && !out.has(l.id)) out.set(l.id, {entityType: 'Location', sourceId: l.id}); } catch {}
  return out;
}
