// Headquarters activation: the Guildhall and Location are picked by name. Pure; no Foundry globals.
const HQ_ID = /^HQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const LOC_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/** Picker records for the Guildhall records General Manager lists (api.definitions.list bindings: {id, title}); null when it cannot list. */
export function guildhallRecords(bindings) {
  if (!Array.isArray(bindings)) return null;
  return bindings.filter(b => b && HQ_ID.test(b.id ?? '')).map(b => ({value: b.id, label: String(b.title ?? '').trim() || 'Unnamed Guildhall', kind: 'guildhall', hint: ''}));
}

/** Picker records for Locations' GM list (api.listLocations: {id, name, region, type, isRegion}); null when Locations is off. */
export function locationPickRecords(list) {
  if (!Array.isArray(list)) return null;
  return list.filter(l => l && LOC_ID.test(l.id ?? '') && String(l.name ?? '').trim())
    .map(l => ({value: l.id, label: l.name, kind: 'location', group: l.region || (l.isRegion ? 'Regions' : 'Other places'), hint: l.type || (l.isRegion ? 'Region' : '')}));
}

/** A starting campaign key from the world: lower-case letters, digits, - and _ (the GM can change it under Advanced). */
export function defaultCampaignKey(world) {
  const raw = String(world?.id ?? world?.title ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60);
  return raw || 'campaign';
}
