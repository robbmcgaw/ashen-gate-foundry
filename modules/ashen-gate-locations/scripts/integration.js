/**
 * Locations domain-owned read-only integration, AG-WORK-0007.
 *
 * Pinned engineering inputs (not an approved public v1 SDK):
 * - Archie: ag-definition-resolver/0.1-prototype, v0.1.4-alpha.1
 * - Eli:   ag-objective-consumer/0.2-alpha, Quest Manager v0.3.1
 *
 * Source Journal flags and campaign reveal state remain solely owned by Locations.
 * No Location record is re-homed into Manager, Quest Manager, maps, or the resolver.
 */
import {MODULE_ID, clone, OBJECTIVE_PATTERN, objectiveRefs} from './model.js';

export const RESOLVER_CONTRACT = 'ag-definition-resolver/0.1-prototype';
export const OBJECTIVE_CONSUMER_CONTRACT = 'ag-objective-consumer/0.2-alpha';
export const QUEST_MODULE_ID = 'ashen-gate-quest-manager';

/**
 * The GM-only source editor has no player-facing source visibility. The safe
 * published Journal remains the only player view in this release. We therefore
 * never expose a raw Location source record through this provider to players.
 * World revision is read separately from the owner; resolver bindings are keys.
 *
 * getLocations must synchronously return [{record,revision}].
 */
export function createLocationProvider({getLocations,isGM}) {
  if(typeof getLocations !== 'function'||typeof isGM!=='function') throw new TypeError('Location owner callbacks are required.');
  return Object.freeze({
    providerId: MODULE_ID,
    readEntries: () => {
      // The source Journal is intentionally not a public data source. In a
      // player client, even a direct call to this callback reveals nothing.
      if(isGM() !== true) return [];
      const locations = getLocations();
      if(!Array.isArray(locations)) throw new TypeError('Location owner returned invalid source data.');
      return locations.map(data => {
        const record = clone(data.record);
        if(record?.entity_type !== 'Location') throw new TypeError('Location provider encountered non-Location source data.');
        return {
          record,
          binding:{kind:'domain',providerId:MODULE_ID,recordKey:record.id},
          // This is not a player reveal API: restrict read even if a source
          // record carries visibility:"player" for its eventual projection.
          canRead: viewer => isGM() === true && viewer?.isGM === true
        };
      });
    }
  });
}

/** Register with a supplied, feature-detected resolver instance. No Manager dependency. */
export function createResolverConnections(provider) {
  const active = new Map();
  const connect = resolver => {
    if(!resolver || resolver.contract !== RESOLVER_CONTRACT || typeof resolver.registerProvider !== 'function' || typeof resolver.refresh !== 'function') {
      throw new Error(`Expected compatible ${RESOLVER_CONTRACT} resolver; Locations data was not changed.`);
    }
    if(active.has(resolver)) return active.get(resolver).release;
    const lease=resolver.registerProvider({providerId:provider.providerId,readEntries:provider.readEntries});
    if(!lease || typeof lease.unregister!=='function') throw new Error('Resolver did not return an unregister lease.');
    const release=()=>{
      if(active.get(resolver)?.lease !== lease)return;
      active.delete(resolver);
      lease.unregister();
    };
    active.set(resolver,{lease,release});
    return release;
  };
  return Object.freeze({
    connect,
    refresh:()=>{
      let refreshed=0;const errors=[];
      for(const resolver of active.keys()){
        try{resolver.refresh();refreshed++;}
        catch(error){errors.push(error);console.warn(`${MODULE_ID}: optional resolver refresh failed`,error);}
      }
      // A failed optional resolver must not turn a completed Location save into
      // a reported failure. Its own permission-safe reader fails closed.
      return {refreshed,errors};
    },
    disconnectAll:()=>{for(const {release} of [...active.values()])release();},
    count:()=>active.size
  });
}

/**
 * Feature-detect Eli's public, permission-safe Objective lookup.
 * Returned rows contain IDs, relation and resolution status only. A Quest
 * campaign progress record, player title, or hidden objective is never copied.
 * Missing/inactive Quest Manager is "owner_unavailable", not "not_found".
 */
export async function checkObjectiveLinks({records,modules,isGM}) {
  if(isGM() !== true)throw new Error('Only the GM can check Objective links.');
  if(!Array.isArray(records))throw new TypeError('Expected Location records.');
  const quest=modules?.get?.(QUEST_MODULE_ID);
  const consumer=quest?.active ? quest.api?.consumer : null;
  const available=consumer?.contract===OBJECTIVE_CONSUMER_CONTRACT && typeof consumer.resolveObjective==='function';
  const rows=[];
  for(const record of records)for(const ref of objectiveRefs(record)) {
    const row={location_ref:record.id,relation:ref.relation,target_id:ref.target_id,mode:ref.mode};
    if(!OBJECTIVE_PATTERN.test(ref.target_id))row.status='invalid_id';
    else if(!quest?.active)row.status='owner_unavailable';
    else if(!available)row.status='unsupported_contract';
    else {
      try {
        // Exact logical type, no name lookups or private Quest state.
        const result=await consumer.resolveObjective(ref.target_id,{entityType:'Objective'});
        row.status=typeof result?.status==='string' ? result.status : 'invalid_response';
      } catch {row.status='owner_error';}
    }
    rows.push(row);
  }
  return rows;
}
