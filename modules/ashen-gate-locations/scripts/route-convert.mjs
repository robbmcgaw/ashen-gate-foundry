/**
 * 0.20.0: routes are retired. Developer Tools → "Convert routes to locations" turns each stored route into a new
 * location of type Route. Pure; no Foundry globals. The stored routes are only read, never changed or deleted.
 *
 * A converted location gets a new LOC id made from its name (never the RTE id), type "Route", the route's terrain and
 * distance as its description, its parent = the start location's parent (or the start location itself at the top level),
 * the old hazard table as a GM-only linked roll table and one GM-only hazard carrying the route's GM notes. It starts
 * Hidden like any new location. `convertedFromRoute` records the RTE id, so running it again converts nothing twice.
 */
import {ROUTE_ID, line, text, safeUuid, newLocation, normalizeLocation} from './model.mjs';

const km = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? `${Math.round(n * 100) / 100} km` : ''; };

/**
 * `routes`: the raw stored route records. `locations`: the world's locations. `tableUuid(name)` (optional): a world
 * RollTable's uuid by name, for an old hazard table stored by name only.
 * Returns {total, convert: [{routeId, name, location, notes: [text]}], done: [{routeId, name, locationId}], skipped: [{routeId, name, reason}]}.
 */
export function planRouteConversion(routes, locations, {tableUuid = () => ''} = {}) {
  const list = Array.isArray(routes) ? routes : [];
  const byId = new Map(locations.map(l => [l.id, l]));
  const converted = new Map(locations.filter(l => l.convertedFromRoute).map(l => [l.convertedFromRoute, l.id]));
  const ids = locations.map(l => l.id);
  const convert = [], done = [], skipped = [], seen = new Set();
  for (const [i, raw] of list.entries()) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const routeId = ROUTE_ID.test(r.id ?? '') ? r.id : '';
    const from = byId.get(r.fromId), to = byId.get(r.toId);
    const name = line(r.name) || (from && to ? `${from.name} – ${to.name}` : '');
    const label = name || routeId || `Route ${i + 1}`;
    if (!routeId) { skipped.push({routeId: '', name: label, reason: 'It has no RTE id.'}); continue; }
    if (seen.has(routeId)) continue;
    seen.add(routeId);
    if (converted.has(routeId)) { done.push({routeId, name: label, locationId: converted.get(routeId)}); continue; }
    if (!from) { skipped.push({routeId, name: label, reason: `Its start location ${r.fromId || '(none)'} no longer exists.`}); continue; }
    if (!name) { skipped.push({routeId, name: label, reason: 'It has no name and its end location no longer exists.'}); continue; }
    const notes = [];
    const t = r.hazardTable && typeof r.hazardTable === 'object' ? r.hazardTable : {};
    let uuid = safeUuid(t.uuid);
    const tableName = line(t.name, 120);
    if (!uuid && tableName) {
      try { uuid = safeUuid(tableUuid(tableName)); } catch { uuid = ''; }
      if (!uuid) notes.push(`Hazard table "${tableName}" was not found, so it is not linked.`);
    }
    const gmNotes = text(r.notes, 2000).trim();
    const loc = newLocation(name, ids);
    ids.push(loc.id);
    Object.assign(loc, {type: 'Route', description: [line(r.terrain, 80), km(r.distanceKm)].filter(Boolean).join(' · '),
      parentLocationId: from.parentLocationId || from.id, convertedFromRoute: routeId,
      rollTables: uuid ? [{name: tableName || 'Hazard table', uuid, shown: false}] : [],
      hazards: uuid || gmNotes ? [{name: tableName || 'Hazards', note: gmNotes, tableUuid: uuid, shown: false}] : [],
      state: 'hidden', revealed: false, published: null, passConditions: false});
    convert.push({routeId, name, location: normalizeLocation(loc), notes});
  }
  return {total: list.length, convert, done, skipped};
}
