// Ashen Gate Quest Manager — pure core. No Foundry globals.
export const MOD = 'ashen-gate-quest-manager';
export const SCHEMA = 'ag-quest-source/0.1';
export const STATUSES = Object.freeze(['Hidden', 'Available', 'Active', 'Completed', 'Failed']);
const KINDS = { 'QUEST': 'quest', 'ORDER': 'work_order', 'CONTRACT': 'contract' };
const PERMANENT = /^(QUEST|ORDER|CONTRACT)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const REF = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const STATES = ['pending','complete','failed'];
export function assertGM(user) {if (!user?.isGM) throw new Error('GM permission required.');}
export function assertUI(user, enabled) {if (!user?.isGM && !enabled) throw new Error('Quest Log is hidden by the GM.');}
export function cleanText(s) {return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function validSource(s) {
  if(!s || typeof s!=='object' || Array.isArray(s)) throw new Error('Objective must be an object.');
  if(!PERMANENT.test(s.id||'')) throw new Error('Invalid Quest/Order/Contract ID.');
  const kind=KINDS[s.id.split('-')[0]];
  if(s.entity_type!=='Objective'||s.objective_kind!==kind)throw new Error(`Objective kind must be ${kind}.`);
  if(!['proposed','draft','approved','superseded','retired'].includes(s.status))throw new Error('Invalid definition status.');
  if(typeof s.version!=='string'||!s.version.trim())throw new Error('Missing source version.');
  if(!s.provenance||!Array.isArray(s.provenance.sources)||!s.provenance.sources.every(x=>typeof x==='string'))throw new Error('Invalid provenance.sources.');
  if(s.scope!==undefined&&!['generic_rules','setting_adapter','publication'].includes(s.scope))throw new Error('Objective source scope must not be campaign state.');
  if(!['player','gm','reveal_gated'].includes(s.visibility))throw new Error('Invalid visibility.');
  if(!Array.isArray(s.refs))throw new Error('refs must be a list.');
  for(const r of s.refs)if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='mode,relation,target_id'||typeof r.relation!=='string'||!r.relation.trim()||!REF.test(r.target_id||'')||!['required','optional'].includes(r.mode))throw new Error('Invalid typed reference.');
  if(typeof s.name!=='string'||!s.name.trim())throw new Error('Objective needs a name.');
  if(!Array.isArray(s.objectives)||!s.objectives.length)throw new Error('At least one objective is required.');
  const keys=new Set();
  for(const o of s.objectives){if(!o||typeof o.key!=='string'||!/^[a-z][a-z0-9_]*$/.test(o.key)||keys.has(o.key)||typeof o.goal!=='string'||!o.goal.trim())throw new Error('Invalid/duplicate objective key or goal.');keys.add(o.key);}
  if(s.objective_kind==='work_order'&&!['crafting','production'].includes(s.work_order_domain))throw new Error('Work Order requires crafting/production domain.');
  if(!s.source||typeof s.source!=='object'||Array.isArray(s.source))throw new Error('Source/issuer descriptor required.');
  if(!Array.isArray(s.locations)||!s.parameters||typeof s.parameters!=='object'||!s.outcomes||typeof s.outcomes!=='object')throw new Error('Locations, parameters and outcomes required.');
  return structuredClone(s);
}
export function initialState(source,{scope='party',actorId=null}={}){
  validSource(source);
  if(!['party','individual'].includes(scope)||scope==='individual'&&!actorId)throw new Error('Individual quests require an Actor ID.');
  return {status:'Hidden',scope,actorId:scope==='individual'?actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false};
}
export function validState(source,s){
  if(!s||!STATUSES.includes(s.status)||!['party','individual'].includes(s.scope))throw new Error('Invalid quest state.');
  if(s.scope==='individual'&&(!s.actorId||typeof s.actorId!=='string'))throw new Error('Individual quests require an Actor ID.');
  const keys=new Set(source.objectives.map(o=>o.key));
  if(!Array.isArray(s.objectiveReveal)||s.objectiveReveal.some(k=>!keys.has(k)))throw new Error('Invalid revealed objective.');
  if(s.publicLocationIds!==undefined&&(!Array.isArray(s.publicLocationIds)||s.publicLocationIds.some(x=>!/^LOC-[A-Z0-9-]+$/.test(x))))throw new Error('Invalid public Location IDs.');
  for(const [k,v] of Object.entries(s.progress||{}))if(!keys.has(k)||!STATES.includes(v))throw new Error('Invalid objective progress.');
  return true;
}
export function publicView(source,s){
  validSource(source);validState(source,s);
  if(source.visibility==='gm'||s.status==='Hidden'||source.visibility==='reveal_gated'&&!s.revealed)return null;
  return {contract:'ag-objectives/0.1-alpha',id:source.id,entity_type:'Objective',objective_kind:source.objective_kind,
    name:source.name,summary:String(source.public_summary??''),status:s.status,scope:s.scope,actorId:s.scope==='individual'?s.actorId:null,
    objectives:source.objectives.filter(o=>o.visibility!=='gm'&&((o.reveal_on_create!==false&&o.visibility!=='reveal_gated')||s.objectiveReveal.includes(o.key)))
      .map(o=>({key:o.key,goal:o.goal,complete:s.progress?.[o.key]==='complete',failed:s.progress?.[o.key]==='failed'})),
    locationIds:(s.publicLocationIds||[]).filter(x=>/^LOC-[A-Z0-9-]+$/.test(x)),
    partyNotes:s.partyNotes||'',rewardRecorded:!!s.rewardRecorded};
}
// Explicit view visibility: never expose even objective counts for hidden objectives.
export function projectionOwnership(s,actor,users=[]){
  if(s.scope==='party')return {default:2};
  if(!actor)throw new Error('Individual Actor unavailable: cannot publish.');
  const ownership={default:0};
  for(const u of users){if(u?.active!==false&&u?.id&&actor.testUserPermission?.(u,'OWNER'))ownership[u.id]=2;}
  return ownership;
}
export function accessSignature(s,ownership){return JSON.stringify({scope:s.scope,actorId:s.actorId||null,ownership:Object.entries(ownership).sort(([a],[b])=>a.localeCompare(b))});}
export function normalizePackage(payload){
  let raw=Array.isArray(payload)?payload:payload?.records;
  if(!Array.isArray(raw))throw new Error('Expected records array (source package manifest is not a records file).');
  if(payload?.schema_version&&!['ag-quest-source/0.1','ag-source-records/0.1'].includes(payload.schema_version))throw new Error('Unsupported source records schema_version.');
  const ids=new Set();return raw.map(x=>{const s=validSource(x);if(ids.has(s.id))throw new Error(`Duplicate source ID ${s.id}`);ids.add(s.id);return s;});
}
export function exportPackage(rows){return {schema_version:SCHEMA,domain:'quests_orders',version:'0.4.0',records:rows.map(x=>validSource(x))};}
export function associatedLocationIds(s){return [...new Set([...(s.locations||[]).map(x=>typeof x==='string'?x:x?.target_id),...(s.refs||[]).filter(x=>/location/i.test(x.relation||'')).map(x=>x.target_id)].filter(x=>/^LOC-[A-Z0-9-]+$/.test(x||'')))];}
