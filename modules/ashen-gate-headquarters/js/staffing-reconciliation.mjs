/** AG-WORK-0005 - read-only reconciliation from Hirelings-authoritative snapshots.
 * No assumed Des event name/API. The owner supplies snapshots when available.
 * Manual GM invocation until a verified API/event exists. Never modifies Hirelings.
 */
const HIRE=/^HIRE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const PERMANENT=new Set(['dismissed','retired','departed','deceased']);
/**
 * Snapshot input: `{hirelingRef, status, verified:true}` produced by trusted
 * Hirelings adapter. Merely Working:false NEVER vacates a station.
 * Return a proposed mutation, not committed state; caller must check GM role,
 * revision, and save through HQ's existing state persistence path.
 */
export function previewPermanentVacancies(coreState,snapshots,{isGM=false}={}){
  if(!isGM)throw Error('Only GM may reconcile staffing');
  if(!coreState || !Array.isArray(coreState.headquarters_states))throw TypeError('Invalid HQ core state');
  if(!Array.isArray(snapshots))throw TypeError('Snapshots must be an array');
  const exits=new Set();
  for(const s of snapshots){
    if(!s || s.verified!==true || !HIRE.test(s.hirelingRef||''))continue;
    if(PERMANENT.has(s.status))exits.add(s.hirelingRef);
  }
  const changes=[];
  for(const hq of coreState.headquarters_states){
    for(const slot of hq.staffing_slots||[]){
      if(exits.has(slot.occupant_hireling_ref))changes.push(Object.freeze({hq_ref:hq.hq_ref,slot_key:slot.key,hireling_ref:slot.occupant_hireling_ref}));
    }
  }
  return Object.freeze(changes);
}
/**
 * Commit preparation re-checks exact occupant; NEVER clears an occupant who was
 * transferred or replaced between preview and commit. Pure function. Caller
 * must enforce GM, world revision, authorized personnel source & save atomically.
 */
export function clearVerifiedDepartures(coreState,changes){
 if(!Array.isArray(changes))throw TypeError('Expected changes');
 const next=structuredClone(coreState);let cleared=0;
 for(const rec of changes){
   const hq=next.headquarters_states.find(x=>x.hq_ref===rec.hq_ref);
   const slot=hq?.staffing_slots?.find(x=>x.key===rec.slot_key);
   if(!slot||slot.occupant_hireling_ref!==rec.hireling_ref)continue;
   slot.occupant_hireling_ref=null;
   if(slot.room_key==='common')hq.shared_revision++;
   else{
     const room=hq.rooms?.find(r=>r.key===slot.room_key);
     if(room)room.revision++;
     else hq.shared_revision++; // malformed legacy slot: force a visible refresh
   }
   cleared++;
 }
 return {next,cleared};
}
