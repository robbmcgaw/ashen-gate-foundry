/** Hirelings personnel domain hosted by Headquarters (AG-WORK-0004 handoff).
 * HIRE/HPERK definitions are external; these records contain only mutable campaign state.
 * No ASSIGN state, no copied perk definitions, no source document mutations.
 */
export const PERSONNEL_FORMAT = 'aghq-personnel/0.1';
export const HIRE_REF = /^HIRE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const PERK_REF = /^HPERK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const DEPARTED = Object.freeze(['dismissed','retired','departed','deceased']);
export function ensurePersonnel(state) {
  if(state.personnel === undefined) state.personnel={format:PERSONNEL_FORMAT,hirelings:[]};
  if(state.personnel?.format!==PERSONNEL_FORMAT || !Array.isArray(state.personnel.hirelings)) throw Error('Unsupported Hirelings personnel state; no automatic destructive migration.');
  return state.personnel;
}
export const hirelingState = (state,id) => state.personnel?.hirelings?.find(e=>e.hireling_ref===id)??null;
export function stationed(state,id){
  const matches=[];
  for(const hq of state.core?.headquarters_states??[])for(const slot of hq.staffing_slots??[]){
    if(slot.occupant_hireling_ref===id) matches.push({hq,slot,installation:hq.installations.find(x=>x.key===slot.installation_key)});
  }
  return matches;
}
export function registerHireling(state,id){
  if(!HIRE_REF.test(id||''))throw Error('Hireling must use canonical HIRE-* source ID.');
  const p=ensurePersonnel(state);
  if(p.hirelings.some(x=>x.hireling_ref===id))throw Error('Hireling is already in the roster.');
  const entry={hireling_ref:id,working:true,employment_status:'active',history:[]};
  p.hirelings.push(entry);
  return entry;
}
export function setHirelingWorking(state,id,working){
  if(typeof working!=='boolean')throw Error('Working must be true or false.');
  const h=hirelingState(state,id);
  if(!h)throw Error('Hireling not in roster.');
  if(h.employment_status!=='active')throw Error('A departed Hireling cannot be marked Working.');
  h.working=working; // Working OFF NEVER clears staffing occupancy.
  return h;
}
export function departHireling(state,id,status,{gmId,at}={}){
  if(!DEPARTED.includes(status))throw Error('Choose an explicit permanent-departure reason.');
  const h=hirelingState(state,id);if(!h)throw Error('Hireling not in roster.');
  if(h.employment_status!=='active'){
    if(h.employment_status===status)return {changed:false,cleared:0};
    throw Error('Hireling already permanently departed. Reinstatement/history correction is deferred.');
  }
  const date=typeof at==='number' && Number.isFinite(at) ? new Date(at).toISOString() : new Date().toISOString();
  h.employment_status=status;h.working=false;
  h.history.push({key:`event_${h.history.length+1}`,event:'permanent_departure',status,at:date,gm_user_id:String(gmId||'gm')});
  let cleared=0;
  for(const {hq,slot} of stationed(state,id)){
    slot.occupant_hireling_ref=null;
    const room=hq.rooms?.find(r=>r.key===slot.room_key);
    if(room?.kind==='personal')room.revision++;
    else hq.shared_revision++;
    cleared++;
  }
  return {changed:true,cleared};
}
/** Derive stable staffing-slot keys for old (0.4.0) installations without deleting staff. */
export function ensureInstallationSlots(state,installationKey,capacity){
  const st=state.core?.headquarters_states?.[0];
  const installation=st?.installations.find(x=>x.key===installationKey);
  if(!installation)throw Error('Target facility installation not found.');
  if(!Number.isInteger(capacity)||capacity<0||capacity>100)throw Error('Invalid facility staffing capacity.');
  const slots=st.staffing_slots.filter(x=>x.installation_key===installationKey);
  if(slots.length>capacity){
    if(slots.slice(capacity).some(x=>x.occupant_hireling_ref)) throw Error('Transfer Hirelings before reducing staffing slots.');
    const remove=new Set(slots.slice(capacity).map(x=>x.key));
    st.staffing_slots=st.staffing_slots.filter(x=>!remove.has(x.key));
  }
  const existingNums=new Set(slots.map(x=>x.key));
  const count=st.staffing_slots.filter(x=>x.installation_key===installationKey).length;
  for(let n=count;n<capacity;n++){
    let key=`staff_${installationKey}_${n+1}`;let i=n+2;
    while(st.staffing_slots.some(x=>x.key===key)||existingNums.has(key)){key=`staff_${installationKey}_${i++}`;}
    st.staffing_slots.push({key,room_key:installation.room_key,installation_key:installationKey,occupant_hireling_ref:null});
  }
  return st.staffing_slots.filter(x=>x.installation_key===installationKey);
}
export function assignHireling(state,id,installationKey,capacity){
  const h=hirelingState(state,id);if(!h)throw Error('Add Hireling to roster first.');
  if(h.employment_status!=='active')throw Error('Permanent-departure Hireling cannot occupy a station.');
  const st=state.core?.headquarters_states?.[0];if(!st)throw Error('Guildhall not activated.');
  const current=stationed(state,id);
  if(current.length>1)throw Error('Hireling has duplicate legacy occupancy; GM reconciliation required.');
  const all=ensureInstallationSlots(state,installationKey,capacity);
  if(current.length && current[0].slot.installation_key===installationKey)return {transferred:false,unchanged:true,slot_key:current[0].slot.key};
  const target=all.find(x=>!x.occupant_hireling_ref);
  if(!target)throw Error('No open staffing slot on the target facility.');
  if(current.length){const old=current[0];old.slot.occupant_hireling_ref=null;const r=old.hq.rooms.find(x=>x.key===old.slot.room_key);if(r?.kind==='personal')r.revision++;else old.hq.shared_revision++;}
  target.occupant_hireling_ref=id;
  const room=st.rooms.find(x=>x.key===target.room_key);if(room?.kind==='personal')room.revision++;else st.shared_revision++;
  return {transferred:!!current.length,slot_key:target.key};
}
export function unassignHireling(state,id){
  const matches=stationed(state,id);if(matches.length>1)throw Error('Duplicate legacy staffing must be reconciled by GM.');
  for(const {hq,slot} of matches){slot.occupant_hireling_ref=null;const room=hq.rooms.find(x=>x.key===slot.room_key);if(room?.kind==='personal')room.revision++;else hq.shared_revision++;}
  return matches.length;
}
/** Defs contain canonical source fields from an already authorized native reader.
 * Unknown conditions never authorize a mechanical effect; all results informational.
 */
export function derivePerkStatuses(state,hirelingRef,profile,perkDefinitions){
 const hire=hirelingState(state,hirelingRef);if(!hire)return [];
 const station=stationed(state,hirelingRef)[0];
 const fac=station?.installation?.facility_ref??null;
 const caps=Array.isArray(profile?.capabilities)?profile.capabilities.map(x=>x?.key).filter(Boolean):null;
 const refs=(profile?.refs??[]).filter(x=>x?.relation==='has_hireling_perk'&&PERK_REF.test(x.target_id||'')).map(x=>x.target_id);
 const selected=[...new Set([...refs,...(hire.earned_perk_refs??[])])];
 return selected.map(id=>{
  const perk=perkDefinitions instanceof Map?perkDefinitions.get(id):perkDefinitions?.[id];
  if(!perk || !Array.isArray(perk.contexts)||!perk.conditions||!perk.stacking)return {id,status:'unverified',reason:'Perk definition/conditions unavailable'};
  const co=perk.conditions;
  const reasons=[];
  if(hire.employment_status!=='active')reasons.push('Hireling permanently departed');
  if(co.requires_working && !hire.working)reasons.push('Working OFF');
  if(co.requires_presence && (!station || !hire.working))reasons.push('Not present and working at a station');
  if(perk.contexts.includes('headquarters')&&!station&&!perk.contexts.includes('passive'))reasons.push('Not stationed at Headquarters');
  if(perk.contexts.every(x=>x==='field'))reasons.push('Field activity not evaluated by Headquarters');
  if(Array.isArray(co.eligible_facility_refs)&&co.eligible_facility_refs.length&&(!fac||!co.eligible_facility_refs.includes(fac)))reasons.push('Ineligible facility');
  if(Array.isArray(co.required_capability_keys)&&co.required_capability_keys.length){
   if(!caps)reasons.push('Capabilities unverified');
   else if(co.required_capability_keys.some(k=>!caps.includes(k)))reasons.push('Required capabilities not met');
  }
  return {id,name:perk.name??id,status:reasons.length?'inactive':'eligible',reason:reasons.join('; '),overlap_group:perk.stacking.overlap_group??null,allow_overlap:perk.stacking.allow_overlap===true,description:perk.description??''};
 });
}
export function markNonStacking(rows){
 const seen=new Set();return rows.map(row=>{
  if(row.status!=='eligible'||!row.overlap_group||row.allow_overlap)return row;
  const key=row.overlap_group;
  if(seen.has(key))return {...row,status:'nonstacking',reason:`Overlaps existing eligible perk group ${key}; do not stack without explicit permission`};
  seen.add(key);return row;
 });
}
