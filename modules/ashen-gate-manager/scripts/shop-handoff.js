import {BLOCKED_STATUSES} from './core.js';

// ---------- Shops, services and merchant lists (Utilities 0.21.0+) ----------
export const UTILITIES_ID = 'ashen-gate-utilities';
export const SHOP_TYPES = Object.freeze(['Shop', 'Service', 'MerchantList']);
export const isShopRecord = record => SHOP_TYPES.includes(record?.entity_type);
export const NEEDS_UTILITIES = 'Needs Utilities 0.21.0 or later (active) to import shops, services and merchant lists.';
const LABEL = {Shop: 'shop', Service: 'service', MerchantList: 'merchant list'};

/** Utilities' shops API when it is active and can import shops (feature-detected); otherwise null. */
export function shopsApi(game) {
  const mod = game?.modules?.get?.(UTILITIES_ID);
  const api = mod?.active ? mod.api?.shops : null;
  return typeof api?.importShops === 'function' ? api : null;
}

/** Ids Utilities already holds (shops, services, merchant lists); null when it can't import shops. */
export function shopIds(api) {
  if (!api) return null;
  const ids = new Set();
  for (const list of [() => api.list?.(), () => api.services?.list?.(), () => api.merchants?.list?.()]) {
    try { for (const r of list() ?? []) if (r?.id) ids.add(r.id); } catch {}
  }
  return ids;
}

const skipped = reason => ({action: 'skipped', reason});
/**
 * Preview decision for one Shop, Service or MerchantList record. Utilities owns the records and checks every field
 * again; this only says whether the record will be passed on (after the package's Items, in the same run).
 */
export function planShop(record, {existingIds = null, includeDrafts = false, updateExisting = false} = {}) {
  if (!existingIds) return skipped(NEEDS_UTILITIES);
  if (BLOCKED_STATUSES.has(record.status)) return {action: 'blocked', reason: `${record.status} records cannot be imported.`};
  if (record.status !== 'approved' && !includeDrafts) return skipped('Unapproved record; enable Include drafts to test.');
  const what = LABEL[record.entity_type] ?? 'record';
  if (!existingIds.has(record.id)) return {action: 'create', reason: `New ${what}; imported through Utilities after the Items.`};
  return updateExisting
    ? {action: 'update', reason: 'Replaces the definition; keeps stock left, hand-added items, the merchant\'s coins, who it is shown to and the sales log.'}
    : skipped(`${what[0].toUpperCase()}${what.slice(1)} already exists; kept unchanged. Turn on "Update existing locations, routes and shops" to replace its definition.`);
}

/** Warning shown with the preview when shop records cannot be imported. */
export function shopsNote(records, api) {
  const n = records.filter(isShopRecord).length;
  return n && !api ? `${n} shop, service or merchant list record${n === 1 ? '' : 's'} skipped: ${NEEDS_UTILITIES}` : null;
}

/** Sends the selected records to Utilities in one call (after the Items) and turns its report into import-log results. */
export async function applyShops(records, api, {updateExisting = false} = {}) {
  if (!records.length) return [];
  const kind = r => r.entity_type;
  if (!api) return records.map(r => ({id: r.id, kind: kind(r), status: 'skipped', message: NEEDS_UTILITIES}));
  let report;
  try { report = await api.importShops(records, {mode: updateExisting ? 'update' : 'create'}); }
  catch (error) { return records.map(r => ({id: r.id, kind: kind(r), action: 'create', status: 'error', message: String(error?.message ?? error)})); }
  return (report ?? []).map(r => {
    const lines = (r.lines?.skipped ?? []).map(s => `item ${s.ref}: ${s.reason}`);
    const extra = [...lines, ...(r.notes ?? [])].join(' ');
    if (r.result === 'created' || r.result === 'updated')
      return {id: r.id, kind: r.type, action: r.result === 'created' ? 'create' : 'update', status: 'ok', ...(extra ? {message: extra} : {})};
    if (r.result === 'kept') return {id: r.id, kind: r.type, status: 'skipped', message: r.reason};
    return {id: r.id, kind: r.type, status: 'error', message: [r.reason, extra].filter(Boolean).join(' ')};
  });
}
