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
    : skipped('Location already exists; kept unchanged. Turn on "Update existing locations" to replace its definition.');
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
