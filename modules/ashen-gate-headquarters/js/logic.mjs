import {ensurePersonnel,registerHireling,setHirelingWorking,departHireling,assignHireling,unassignHireling,ensureInstallationSlots} from './hirelings.mjs';
/** Headquarters pure state logic: no Foundry/DOM dependencies. */
export const MODULE_ID = "ashen-gate-headquarters";
export const FORMAT = "aghq-state/0.1";
export const COPY_KEY = /^[a-z][a-z0-9_-]*$/;
export const FAC_ID = /^FAC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const HQ_ID = /^HQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const LOC_ID = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const LEASE_MS = 120000;
const clone = data => structuredClone(data);
const integer = (value, label, min=0, max=10000) => {
  if (!Number.isInteger(value) || value<min || value>max) throw Error(`${label} must be an integer between ${min} and ${max}.`);
  return value;
};
const safeText = (value, label, max=160) => {
  if (typeof value!=="string" || !value.trim() || value.length>max) throw Error(`Invalid ${label}.`);
  return value.trim();
};
const validateAsset = value => {
  if (value===null || value==="") return "";
  const str=safeText(value,"artwork path",500);
  if (/^(?:https?:\/\/[^\s]+|(?:modules|worlds|systems|assets|icons)\/[^\s]+)$/i.test(str) && !/["'<>]/.test(str)) return str;
  throw Error("Artwork must be a Foundry data path or HTTPS URL, without HTML.");
};
const collision = (a,b) => a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
export const demoCatalog = () => [
  {id:"FAC-DEMO-FORGE",entity_type:"Facility",status:"draft",version:"0.1.0",provenance:{sources:["synthetic builder demo"]},visibility:"player",refs:[],scope:"generic_rules",name:"Demo Forge",category:"Profession",placements:["shared"],stages:[{key:"base",label:"Basic",width:4,height:3,staffing_slots:1,art:"",benefits:[{name:"Workshop Access (demo)",recipient:"guild",description:"Informational demonstration only."}]},{key:"improved",label:"Expanded",width:5,height:4,staffing_slots:2,art:"",benefits:[]}]},
  {id:"FAC-DEMO-STUDY",entity_type:"Facility",status:"draft",version:"0.1.0",provenance:{sources:["synthetic builder demo"]},visibility:"player",refs:[],scope:"generic_rules",name:"Demo Study",category:"Administrative",placements:["shared","personal"],stages:[{key:"base",label:"Basic",width:3,height:3,staffing_slots:0,art:"",benefits:[]}]},
  {id:"FAC-DEMO-DESK",entity_type:"Facility",status:"draft",version:"0.1.0",provenance:{sources:["synthetic builder demo"]},visibility:"player",refs:[],scope:"generic_rules",name:"Demo Writing Desk",category:"Personal",placements:["personal"],stages:[{key:"base",label:"Basic",width:2,height:2,staffing_slots:0,art:"",benefits:[]}]}
];
export const rankRules = () => Array.from({length:5},(_,i)=>({rank:i+1,shared_facility_slots:2,orders_per_downtime:2,unlock_refs:[]}));
export function emptyState(){return {format:FORMAT,active:false,core:null,config:{name:"Guildhall",bounds:{width:24,height:18},cell_px:44,background:"",background_fit:"contain",background_x:50,background_y:50,background_opacity:100,rank_rules:rankRules(),manual_unlock_refs:[],decoration_art:[]},catalog:[],inventory:[],personal_layouts:{},editor_lease:null,personnel:{format:"aghq-personnel/0.1",hirelings:[]},state_revision:0};}
export const site = s => s.core?.headquarters_states?.[0];
export const rankConfig = s => s.config.rank_rules[s.core?.guild_state?.rank-1 || 0];
export const facilities = s => new Map(s.catalog.map(d=>[d.id,d]));
export const owned = s => new Map(s.inventory.map(d=>[d.key,d]));
export const stageFor = (s, entry) => {
  const def=facilities(s).get(entry.facility_ref);
  if(!def)throw Error(`Facility ${entry.facility_ref} not found.`);
  const stage=def.stages.find(t=>t.key===entry.stage_key);
  if(!stage)throw Error(`Upgrade stage ${entry.stage_key} not found.`);
  return {def,stage};
};
export const getPlacement = (stage,x,y,rotation) => {
  const angle=integer(rotation,"Rotation",0,270);
  if(angle%90!==0)throw Error("Rotation must use 90° steps.");
  return {x:integer(x,"X coordinate"),y:integer(y,"Y coordinate"),rotation:angle,width:angle%180?stage.height:stage.width,height:angle%180?stage.width:stage.height};
};
export function validateDefinition(def){
  if(!def || typeof def!=="object" || !FAC_ID.test(def.id||"") || def.entity_type!=="Facility" || !Array.isArray(def.refs) || !Array.isArray(def.provenance?.sources)) throw Error("Facility requires canonical FAC-* identity and shared metadata.");
  safeText(def.name,"facility name");
  if(def.visibility!=="player") throw Error("Only player-visible facility definitions can be stored. Do not import GM secrets.");
  if(!['draft','approved','proposed'].includes(def.status)||typeof def.version!=='string'||!def.version||!['generic_rules','setting_adapter'].includes(def.scope))throw Error("Invalid definition status, version or scope.");
  for(const r of def.refs){if(!r||typeof r.relation!=='string'||!r.relation||typeof r.target_id!=='string'||!(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/).test(r.target_id)||!['required','optional'].includes(r.mode))throw Error("Invalid typed facility reference.");}
  if(!Array.isArray(def.placements) || !def.placements.length || def.placements.some(x=>!['shared','personal'].includes(x))) throw Error("A facility must allow shared and/or personal placement.");
  if(!Array.isArray(def.stages) || !def.stages.length || def.stages.length>20) throw Error("A facility must have 1–20 stages.");
  const keys=new Set();
  for(const t of def.stages){if(!COPY_KEY.test(t.key||"")||keys.has(t.key))throw Error("Invalid or duplicate upgrade key.");keys.add(t.key);integer(t.width,"Width",1,100);integer(t.height,"Height",1,100);integer(t.staffing_slots,"Staffing slots",0,100);validateAsset(t.art||"");if(!Array.isArray(t.benefits))throw Error("Benefits must be an array.");
   for(const b of t.benefits){if(typeof b.name!=='string'||!b.name||typeof b.description!=='string'||!['guild','facility','individual','room_owner'].includes(b.recipient))throw Error("Benefits require name, description and an allowed recipient.");}}
  return true;
}
/** What a facility import would do, without writing. Existing facility ids are always kept (HQ has no definition update). */
export function planFacilityImport(payload,knownIds=new Set()){
 const defs=Array.isArray(payload)?payload:payload?.records;
 if(!Array.isArray(defs)||defs.length<1||defs.length>200)return {errors:['Expected a JSON array of 1–200 facility definitions (or an object with records[]).'],rows:[]};
 const errors=[],rows=[],seen=new Set();
 defs.forEach((def,i)=>{
  try{validateDefinition(def);}catch(e){errors.push(`records[${i}] ${def?.id??'?'}: ${e.message}`);return;}
  if(seen.has(def.id)){errors.push(`records[${i}]: duplicate id ${def.id}.`);return;}
  seen.add(def.id);
  const exists=knownIds.has(def.id);
  rows.push({id:def.id,name:def.name,action:exists?'skip':'new',reason:exists?'Already in the catalog; kept as is.':'',definition:def});
 });
 return {errors,rows};
}
/** UI placement aid (0.13.0, keyboard Place): the first top-left cell, row by row, where a width×height piece fits the room
 * without overlapping another installed piece; null when none fits. It writes nothing: install still enforces every rule. */
export function freeSpot(s,roomKey,width,height){
 const st=site(s);const dims=roomKey==='common'?s.config.bounds:s.personal_layouts?.[roomKey]?.bounds;if(!st||!dims)return null;
 const others=st.installations.filter(i=>i.room_key===roomKey).map(i=>i.placement);
 for(let y=0;y+height<=dims.height;y++)for(let x=0;x+width<=dims.width;x++){const c={x,y,width,height};if(!others.some(o=>collision(c,o)))return {x,y};}
 return null;
}
export const activeLock = (s, now=Date.now()) => s.editor_lease && s.editor_lease.until>now ? s.editor_lease : null;
function requireGM(actor){if(!actor?.isGM)throw Error("GM authorization required.");}
function allowedToEdit(actor,s,roomKey,now){
 const room=site(s).rooms.find(r=>r.key===roomKey);if(!room)throw Error("Unknown room.");
 if(room.kind==='personal'){if(!actor?.isGM && room.owner_user_id!==actor?.id)throw Error("Only the room owner or GM may edit this room.");}
 else {const lock=activeLock(s,now);if(!lock || lock.user_id!==actor?.id)throw Error("Acquire the shared editor lock first.");}
 return room;
}
function ensureFit(s,roomKey,candidate,skipKey){
 const st=site(s);const isShared=roomKey==='common';const dims=isShared?s.config.bounds:s.personal_layouts[roomKey]?.bounds;
 if(!dims)throw Error("Room has no canvas.");
 if(candidate.x+candidate.width>dims.width || candidate.y+candidate.height>dims.height)throw Error("Piece exceeds canvas bounds.");
 for(const item of st.installations){if(item.key===skipKey || item.room_key!==roomKey)continue;if(collision(candidate,item.placement))throw Error("Building pieces cannot overlap.");}
}
function updateUnlocks(s){
 const level=s.core.guild_state.rank;
 const unlocked=new Set(s.config.manual_unlock_refs);
 for(const rule of s.config.rank_rules)if(rule.rank<=level)for(const id of rule.unlock_refs)unlocked.add(id);
 s.core.guild_state.unlocked_facility_refs=[...unlocked].sort();
 const rule=rankConfig(s);s.core.guild_state.shared_defaults={orders_per_downtime:rule.orders_per_downtime,shared_facility_slots:rule.shared_facility_slots};
}
function ensureCurrentUnlocked(s,ref){if(!s.core.guild_state.unlocked_facility_refs.includes(ref))throw Error("Facility is locked. GM must unlock it first.");}
export function applyOperation(prior,actor,op,payload={},now=Date.now()){
 let s=clone(prior || emptyState());if(s.format!==FORMAT)throw Error("Unrecognized Headquarters state format; no migration attempted.");
 ensurePersonnel(s); // Additive migration from existing v0.4.0 state. Never reset facilities/rooms.
 const gm=!!actor?.isGM;
 if(op==="activate"){
  requireGM(actor);if(s.active)throw Error("Guildhall already active. Existing state preserved.");
  if(!HQ_ID.test(payload.hq_ref||"")||!LOC_ID.test(payload.location_ref||""))throw Error("Use valid, existing HQ-* and LOC-* IDs.");
  let campaign_key=safeText(payload.campaign_key,"campaign key"),guild_key=safeText(payload.guild_key,"guild key",40);
  if(!COPY_KEY.test(guild_key))throw Error("Guild key must be lowercase letters, digits, underscores or hyphens.");
  s.active=true;s.core={guild_state:{campaign_key,guild_key,rank:1,shared_defaults:{},unlocked_facility_refs:[]},headquarters_states:[{hq_ref:payload.hq_ref,location_ref:payload.location_ref,shared_revision:0,rooms:[{key:"common",kind:"shared",owner_user_id:null,revision:0}],installations:[],staffing_slots:[]}]};updateUnlocks(s);
 }else if(op==="import_definitions"){
  // Facility definitions are library data, not campaign state: allowed before the Guildhall is activated.
  requireGM(actor);const defs=payload.definitions;if(!Array.isArray(defs)||defs.length<1||defs.length>200)throw Error("Import a JSON array of 1–200 facility definitions.");
  const known=facilities(s);const seen=new Set();for(const def of defs){validateDefinition(def);if(known.has(def.id)||seen.has(def.id))throw Error(`Duplicate FAC ID ${def.id}; import cancelled.`);seen.add(def.id);}
  s.catalog.push(...clone(defs));
 }else{
  if(!s.active)throw Error("GM must activate the Guildhall first.");
  const st=site(s);
  if(op==="lock"){
   const current=activeLock(s,now);
   if(current && current.user_id!==actor.id && !gm)throw Error("Another player is editing the Guildhall.");
   s.editor_lease={user_id:actor.id,until:now+LEASE_MS};
  }else if(op==="unlock_editor"){
   const current=activeLock(s,now);if(current && current.user_id!==actor.id && !gm)throw Error("Only the editor or GM can release this lock.");s.editor_lease=null;
  }else if(op==="renew"){
   if(!activeLock(s,now)||s.editor_lease.user_id!==actor.id)throw Error("No current editing lock.");s.editor_lease.until=now+LEASE_MS;
  }else if(op==="load_demo"){
   requireGM(actor);for(const def of demoCatalog()){if(!facilities(s).has(def.id))s.catalog.push(def);}
  }else if(op==="unlock_facility"){
   requireGM(actor);if(!facilities(s).has(payload.facility_ref))throw Error("Unknown facility.");
   if(!s.config.manual_unlock_refs.includes(payload.facility_ref))s.config.manual_unlock_refs.push(payload.facility_ref);
   updateUnlocks(s);
  }else if(op==="acquire"){
   requireGM(actor);ensureCurrentUnlocked(s,payload.facility_ref);
   if(!facilities(s).has(payload.facility_ref))throw Error("Unknown facility.");
   const key=safeText(payload.key,"instance key",64);if(!COPY_KEY.test(key)||s.inventory.some(x=>x.key===key))throw Error("Invalid or duplicate copy key.");
   s.inventory.push({key,facility_ref:payload.facility_ref,stage_key:facilities(s).get(payload.facility_ref).stages[0].key});
  }else if(op==="install"){
   const roomKey=payload.room_key||"common";allowedToEdit(actor,s,roomKey,now);
   const record=s.inventory.find(x=>x.key===payload.key);if(!record)throw Error("Facility copy not acquired.");
   if(st.installations.some(i=>i.key===record.key))throw Error("Facility copy is already installed.");
   ensureCurrentUnlocked(s,record.facility_ref);
   const {def,stage}=stageFor(s,record);const room=st.rooms.find(x=>x.key===roomKey);
   if(!def.placements.includes(room.kind))throw Error("Facility cannot be installed in this room type.");
   const n=st.installations.filter(i=>i.room_key===roomKey).length;
   const capacity=roomKey==="common"?rankConfig(s).shared_facility_slots:1;
   if(n>=capacity)throw Error("No facility slots available in this room.");
   const placement=getPlacement(stage,payload.x,payload.y,0);ensureFit(s,roomKey,placement);
   st.installations.push({key:record.key,facility_ref:record.facility_ref,room_key:roomKey,placement});
   ensureInstallationSlots(s,record.key,stage.staffing_slots);
   if(room.kind==='shared')st.shared_revision++;else room.revision++;
  }else if(op==="move" || op==="rotate"){
   const record=st.installations.find(i=>i.key===payload.key);if(!record)throw Error("Not installed.");
   allowedToEdit(actor,s,record.room_key,now);
   const instance=s.inventory.find(x=>x.key===record.key);const {stage}=stageFor(s,instance);
   const next=getPlacement(stage,op==='move'?payload.x:record.placement.x,op==='move'?payload.y:record.placement.y,op==='rotate'?((record.placement.rotation+90)%360):record.placement.rotation);
   ensureFit(s,record.room_key,next,record.key);record.placement=next;
   if(record.room_key==='common')st.shared_revision++;else st.rooms.find(r=>r.key===record.room_key).revision++;
  }else if(op==="uninstall"){
   const found=st.installations.find(i=>i.key===payload.key);if(!found)throw Error("Facility is not installed.");allowedToEdit(actor,s,found.room_key,now);
   const assigned=st.staffing_slots.filter(x=>x.installation_key===found.key&&x.occupant_hireling_ref);
   if(assigned.length&&!payload.confirm_staff)throw Error("Facility has staff; confirm unassignment before uninstalling.");
   st.installations=st.installations.filter(x=>x.key!==found.key);st.staffing_slots=st.staffing_slots.filter(x=>x.installation_key!==found.key);
   if(found.room_key==='common')st.shared_revision++;else st.rooms.find(r=>r.key===found.room_key).revision++;
  }else if(op==="upgrade"){
   requireGM(actor);const record=st.installations.find(i=>i.key===payload.key);const instance=s.inventory.find(i=>i.key===payload.key);
   if(!instance)throw Error("Unknown facility copy.");const def=facilities(s).get(instance.facility_ref);const stage=def.stages.find(x=>x.key===payload.stage_key);if(!stage)throw Error("Unknown upgrade stage.");
   if(record){const placement=getPlacement(stage,record.placement.x,record.placement.y,record.placement.rotation);ensureFit(s,record.room_key,placement,record.key);
    const staffed=st.staffing_slots.filter(x=>x.installation_key===record.key&&x.occupant_hireling_ref).length;
    if(staffed>stage.staffing_slots)throw Error("Transfer staff before reducing staffing capacity.");record.placement=placement;
    ensureInstallationSlots(s,record.key,stage.staffing_slots);
    if(record.room_key==='common')st.shared_revision++;else st.rooms.find(r=>r.key===record.room_key).revision++;
   }instance.stage_key=stage.key;
  }else if(op==="register_hireling"){
   requireGM(actor);registerHireling(s,payload.hireling_ref);
  }else if(op==="set_working"){
   requireGM(actor);setHirelingWorking(s,payload.hireling_ref,payload.working);
  }else if(op==="depart_hireling"){
   requireGM(actor);
   if(payload.confirm!==true)throw Error('Permanent departure requires explicit GM confirmation.');
   departHireling(s,payload.hireling_ref,payload.status,{gmId:actor.id,at:now});
  }else if(op==="assign_staff"){
   requireGM(actor);
   const installation=st.installations.find(x=>x.key===payload.installation_key);
   if(!installation)throw Error('Staffing requires an installed facility.');
   const instance=s.inventory.find(x=>x.key===installation.key);
   const {stage}=stageFor(s,instance);
   assignHireling(s,payload.hireling_ref,installation.key,stage.staffing_slots);
  }else if(op==="unassign_staff"){
   requireGM(actor);unassignHireling(s,payload.hireling_ref);
  }else if(op==="save_config"){
   requireGM(actor);const width=integer(payload.width,"Canvas width",4,100),height=integer(payload.height,"Canvas height",4,100);
   for(const ins of st.installations.filter(x=>x.room_key==='common')){if(ins.placement.x+ins.placement.width>width||ins.placement.y+ins.placement.height>height)throw Error("Move out-of-bounds pieces before shrinking the canvas.");}
   s.config.bounds={width,height};s.config.name=safeText(payload.name,"Guildhall name",90);s.config.background=validateAsset(payload.background||"");
   const fit=payload.background_fit ?? s.config.background_fit ?? 'contain';
   if(!['contain','cover','stretch'].includes(fit))throw Error('Background fit must be Contain, Cover, or Stretch.');
   s.config.background_fit=fit;
   s.config.background_x=integer(payload.background_x ?? s.config.background_x ?? 50,'Background horizontal position',0,100);
   s.config.background_y=integer(payload.background_y ?? s.config.background_y ?? 50,'Background vertical position',0,100);
   s.config.background_opacity=integer(payload.background_opacity ?? s.config.background_opacity ?? 100,'Background opacity',0,100);
  }else if(op==="set_rank_table"){
   requireGM(actor);if(!Array.isArray(payload.rules)||payload.rules.length!==5)throw Error("Specify exactly five Guild Ranks.");
   s.config.rank_rules=payload.rules.map((x,i)=>({rank:i+1,shared_facility_slots:integer(x.shared_facility_slots,"Facility slots",0,100),orders_per_downtime:integer(x.orders_per_downtime,"Orders",0,100),unlock_refs:Array.isArray(x.unlock_refs)?x.unlock_refs.filter(ref=>facilities(s).has(ref)):[]}));updateUnlocks(s);
  }else if(op==="set_rank"){
   requireGM(actor);s.core.guild_state.rank=integer(payload.rank,"Guild Rank",1,5);updateUnlocks(s);
  }else if(op==="add_rooms"){
   requireGM(actor);if(!Array.isArray(payload.users))throw Error("Expected a user list.");
   for(const user of payload.users){const u=safeText(user.id,"user ID",80);if(st.rooms.some(r=>r.owner_user_id===u))continue;
    const key=`room_${u.toLowerCase().replace(/[^a-z0-9_]/g,"_")}`;if(!COPY_KEY.test(key)||st.rooms.some(r=>r.key===key))throw Error("Room key conflict.");
    st.rooms.push({key,kind:"personal",owner_user_id:u,revision:0});s.personal_layouts[key]={bounds:{width:12,height:9},background:"",decorations:[]};
   }
  }else if(op==="add_decoration_art"){
   requireGM(actor);const art=validateAsset(payload.art);if(!art)throw Error("Artwork path is required.");s.config.decoration_art ||= [];if(!s.config.decoration_art.includes(art))s.config.decoration_art.push(art);
  }else if(op==="set_personal_background"){
   requireGM(actor);const room=st.rooms.find(r=>r.key===payload.room_key);if(!room||room.kind!=="personal")throw Error("Not a personal room.");s.personal_layouts[room.key].background=validateAsset(payload.background||"");room.revision++;
  }else if(op==="add_decoration"){
   const room=allowedToEdit(actor,s,payload.room_key,now);if(room.kind!=="personal")throw Error("Decorations are limited to personal rooms.");
   const art=validateAsset(payload.art);if(!art || !s.config.decoration_art?.includes(art))throw Error("Decoration art must be in the GM-provided library.");
   const rec={key:safeText(payload.key,"decoration key",64),art,x:integer(payload.x,"X"),y:integer(payload.y,"Y"),width:integer(payload.width,"Width",1,12),height:integer(payload.height,"Height",1,12),rotation:0};
   if(rec.x+rec.width>s.personal_layouts[room.key].bounds.width||rec.y+rec.height>s.personal_layouts[room.key].bounds.height)throw Error("Decoration is outside room bounds.");
   if(s.personal_layouts[room.key].decorations.some(x=>x.key===rec.key))throw Error("Duplicate decoration key.");
   s.personal_layouts[room.key].decorations.push(rec);room.revision++;
  }else if(op==="move_decoration"||op==="rotate_decoration"||op==="remove_decoration"){
   const room=allowedToEdit(actor,s,payload.room_key,now);if(room.kind!=="personal")throw Error("Not a personal room.");
   const decorations=s.personal_layouts[room.key].decorations;const d=decorations.find(x=>x.key===payload.key);if(!d)throw Error("Decoration not found.");
   if(op==="remove_decoration")s.personal_layouts[room.key].decorations=decorations.filter(x=>x.key!==d.key);
   else if(op==="rotate_decoration")d.rotation=(d.rotation+90)%360;
   else {const x=integer(payload.x,"X"),y=integer(payload.y,"Y");if(x+d.width>s.personal_layouts[room.key].bounds.width||y+d.height>s.personal_layouts[room.key].bounds.height)throw Error("Decoration is outside room bounds.");d.x=x;d.y=y;}
   room.revision++;
  }else throw Error(`Unsupported operation ${op}.`);
 }
 s.state_revision++;
 return s;
}
