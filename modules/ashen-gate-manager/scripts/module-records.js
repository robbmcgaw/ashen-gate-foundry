/**
 * 0.44.3: does another Ashen Gate module hold a record? Asked only through that module's public, GM-readable API
 * (feature-detected; never its settings or documents). Used by the post-apply link pass so a link to an existing
 * Locations, Renown, Quest Log, Headquarters or Utilities record is not reported missing.
 */
import {ownerModuleFor} from './contract.js';
import {shopIds} from './shop-handoff.js';

const idsOf = list => (Array.isArray(list) ? list : []).map(r => r?.id).filter(id => typeof id === 'string');
const tryList = fn => { try { return fn() ?? []; } catch { return []; } };

/** Ids a module's API reports, or null when it offers no way to list them. */
const READERS = {
  'ashen-gate-locations': api => typeof api.listLocations === 'function'
    ? [...idsOf(tryList(() => api.listLocations())), ...idsOf(typeof api.listRoutes === 'function' ? tryList(() => api.listRoutes()) : [])] : null,
  'ashen-gate-factions': api => {
    if (typeof api.getFactions !== 'function') return null;
    const defs = [...tryList(() => api.getFactions()), ...(typeof api.getDeities === 'function' ? tryList(() => api.getDeities()) : [])];
    // A faction or deity also carries its Renown track ids (RENOWN-).
    return defs.flatMap(d => [d?.id, d?.renown_track?.id, d?.individual_track?.id]).filter(id => typeof id === 'string');
  },
  'ashen-gate-quest-manager': api => typeof api.listQuests === 'function'
    ? [...idsOf(tryList(() => api.listQuests())), ...idsOf(typeof api.assignments?.list === 'function' ? tryList(() => api.assignments.list()) : [])] : null,
  'ashen-gate-headquarters': api => typeof api.getState === 'function' ? idsOf(tryList(() => api.getState()?.catalog)) : null,
  'ashen-gate-utilities': api => { const ids = shopIds(typeof api.shops?.importShops === 'function' ? api.shops : null); return ids ? [...ids] : null; }
};

/**
 * Returns lookup(id): null when no other module owns the id (Manager's own or unowned), otherwise
 * {owner, active, exists}. `exists` is true only when the active module's API lists the record. Each module is read once.
 */
export function moduleRecordLookup(game) {
  const cache = new Map();
  const holdings = owner => {
    if (!cache.has(owner.moduleId)) {
      const mod = game?.modules?.get?.(owner.moduleId);
      const active = Boolean(mod?.active);
      const reader = READERS[owner.moduleId];
      const ids = active && mod.api && reader ? reader(mod.api) : null;
      cache.set(owner.moduleId, {active, ids: ids ? new Set(ids) : null});
    }
    return cache.get(owner.moduleId);
  };
  return id => {
    const owner = ownerModuleFor(id);
    if (!owner) return null;
    const {active, ids} = holdings(owner);
    return {owner, active, exists: Boolean(ids?.has(id))};
  };
}
