/** Ashen Gate Profession Ledger gathering rules (0.10.0; DC defaults and Exotic candidates 0.15.0).
 * One lead gatherer, one check per node for the party. Eligible helpers with suitable tools give advantage,
 * not another attempt. Success gives one common bundle; success by 5+ gives one rare bundle instead.
 * A success may also find one Exotic (exotic.mjs). Failure exhausts the node. No Foundry globals are read here.
 */
import {norm,quantity} from './core.mjs';
import {TIERS} from './progression.mjs';
import {heldTool,professionKey,SKILL_IDS} from './checks.mjs';
import {normalizeExotics} from './exotic.mjs';

/** Kept equal to Locations' GATHERING.dcByTier (a Locations test checks both). A node's own DC always wins. */
export const DEFAULT_DC_BY_TIER=Object.freeze({1:10,2:12,3:15,4:18,5:20});
export const RARE_MARGIN=5;
const MAT=/^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAX_QTY=999;
const NODE_ID=/^NODE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const GATHER_KEYS=['archaeology','fishing','herbalism','huntingskinning','mining'];
const TOOL_KEY=/^[a-z][a-z0-9]{0,39}$/i;
/** A common/rare table (0.25.0 node templates): [{materialId, quantity, chance|null}], valid entries only. */
const nodeTable=list=>(Array.isArray(list)?list:[]).filter(e=>e&&MAT.test(String(e.materialId??''))).slice(0,20)
  .map(e=>{const q=Number(e.quantity),c=Number(e.chance);return {materialId:String(e.materialId),quantity:Number.isSafeInteger(q)&&q>=1&&q<=MAX_QTY?q:1,
    chance:e.chance!=null&&e.chance!==''&&Number.isInteger(c)&&c>=1&&c<=100?c:null};});

/** Tier as 1–5 from a number or a tier name ("Apprentice", "journeyman"), or null. */
export function tierNumber(tier){
  const n=Number(tier);
  if(Number.isInteger(n)&&n>=1&&n<=TIERS.length)return n;
  const i=TIERS.findIndex(t=>norm(t)===norm(tier));
  return i>=0?i+1:null;
}
export const tierName=tier=>TIERS[(tierNumber(tier)??0)-1]??'';
export const defaultDC=tier=>DEFAULT_DC_BY_TIER[tierNumber(tier)]??null;

/**
 * A Locations gathering-resource entry (or an ad-hoc node) in one shape. Tolerates missing fields:
 * DC falls back to the tier default, quantities to 1, finite to true.
 */
export function normalizeNode(raw,{locationId=null,locationName='',locationRevealed=true,index=0}={}){
  if(!raw||typeof raw!=='object')return null;
  const count=(v,d)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=1&&n<=MAX_QTY?n:d;};
  const tier=tierNumber(raw.tier);
  const dcRaw=Number(raw.dc);
  const dc=raw.dc!==''&&raw.dc!=null&&Number.isSafeInteger(dcRaw)&&dcRaw>=1&&dcRaw<=40?dcRaw:defaultDC(tier);
  const mat=v=>MAT.test(String(v??''))?String(v):'';
  const id=typeof raw.id==='string'&&raw.id?raw.id:null;
  const node={id,key:`${locationId??'adhoc'}:${id??`#${index}`}`,label:String(raw.label??'').trim(),skill:String(raw.skill??'').trim(),
    // Locations sends players the DC only when the GM shows it; a GM record says so in dcVisible.
    tier,dc,dcVisible:raw.dcVisible===true||(raw.dcVisible===undefined&&raw.dc!=null&&raw.dc!==''),materialId:mat(raw.materialId),rareMaterialId:mat(raw.rareMaterialId),
    quantity:count(raw.quantity,1),rareQuantity:count(raw.rareQuantity,1),
    finite:raw.finite!==false,exhausted:raw.exhausted===true,available:raw.available!==false,visible:raw.visible!==false,
    // GM-only Exotic candidates (Locations never sends them to players).
    exotics:normalizeExotics(raw.exotics),
    note:String(raw.note??''),locationId,locationName:String(locationName??''),locationRevealed:locationRevealed===true,
    // 0.25.0 node templates: the template it came from, every gathering profession it allows, a check override, and
    // weighted material tables (each a list; one entry per table is the same as materialId/rareMaterialId).
    templateId:NODE_ID.test(String(raw.templateId??''))?String(raw.templateId):null,missingTemplate:NODE_ID.test(String(raw.missingTemplate??''))?String(raw.missingTemplate):null,
    professions:[...new Set((Array.isArray(raw.professions)?raw.professions:[]).map(professionKey).filter(k=>GATHER_KEYS.includes(k)))],
    checkSkill:SKILL_IDS.includes(raw.checkSkill)?raw.checkSkill:'',checkTool:TOOL_KEY.test(String(raw.checkTool??''))?String(raw.checkTool):'',
    tables:raw.tables&&typeof raw.tables==='object'?{common:nodeTable(raw.tables.common),rare:nodeTable(raw.tables.rare)}:null};
  if(node.tables?.common.length&&!node.materialId){node.materialId=node.tables.common[0].materialId;node.quantity=node.tables.common[0].quantity;}
  node.gatherable=node.available&&!node.exhausted&&Boolean(node.materialId)&&Number.isInteger(node.dc);
  node.why=node.missingTemplate?'The shared gathering node used here no longer exists':!node.materialId?'No material set: award by hand':node.exhausted?'Already gathered (exhausted)':!node.available?'Not available right now':!Number.isInteger(node.dc)?'No DC or tier set':'';
  return node;
}

/** {result:'fail'|'common'|'rare', margin}. Success is total ≥ DC; rare is total ≥ DC + 5. */
export function gatherOutcome(total,dc){
  const t=Number(total),d=Number(dc);
  if(!Number.isFinite(t)||!Number.isFinite(d))throw Error('A check total and DC are required');
  const margin=t-d;
  return {result:margin<0?'fail':margin>=RARE_MARGIN?'rare':'common',margin,total:t,dc:d};
}
/** A weighted pick from a table of two or more entries: one die with as many faces as the chances add up to (100 for a
 * checked template). `roll(faces)` gives 1..faces. A table of one entry needs no roll. */
export function pickTableEntry(table,roll){
  if(!table?.length)return null;
  if(table.length===1)return {entry:table[0],roll:null,faces:null};
  const weights=table.some(e=>!(e.chance>0))?table.map(()=>1):table.map(e=>e.chance);
  const faces=weights.reduce((n,w)=>n+w,0);
  const r=Number(typeof roll==='function'?roll(faces):NaN);
  if(!Number.isInteger(r)||r<1||r>faces)throw Error(`Material table roll must be a whole number 1–${faces}`);
  let top=0;
  for(let i=0;i<table.length;i++){top+=weights[i];if(r<=top)return {entry:table[i],roll:r,faces};}
  return {entry:table.at(-1),roll:r,faces};
}
/** What the lead receives: one bundle, rare instead of common on success by 5+. A node without a rare material gives its common one.
 * 0.25.0: a template node with a table of several materials picks one of them with `roll` (tableRoll says which die). */
export function gatherReward(node,outcome,{roll}={}){
  if(!node||outcome?.result==='fail'||!outcome)return null;
  const rareTable=node.tables?.rare??[],commonTable=node.tables?.common??[];
  if(outcome.result==='rare'&&rareTable.length>1){const p=pickTableEntry(rareTable,roll);return {materialId:p.entry.materialId,quantity:p.entry.quantity,rare:true,noRareFallback:false,tableRoll:{roll:p.roll,faces:p.faces}};}
  if(outcome.result==='rare'&&node.rareMaterialId)return {materialId:node.rareMaterialId,quantity:node.rareQuantity,rare:true,noRareFallback:false};
  if(commonTable.length>1){const p=pickTableEntry(commonTable,roll);return {materialId:p.entry.materialId,quantity:p.entry.quantity,rare:false,noRareFallback:outcome.result==='rare',tableRoll:{roll:p.roll,faces:p.faces}};}
  return {materialId:node.materialId,quantity:node.quantity,rare:false,noRareFallback:outcome.result==='rare'};
}
/** Finite nodes are spent by any attempt; a failure exhausts any node (a renewable one only for now: Locations
 * can't exhaust a non-finite node, so the Ledger blocks it until the GM reloads). */
export const exhaustsNode=(node,outcome)=>Boolean(node?.finite)||outcome?.result==='fail';

/**
 * A helper is eligible when they are a different character who carries a suitable tool (the
 * profession's tool or the check's tool) or, if no tool applies, has the gathering profession.
 */
export function helperEligibility(helper,{leadId,toolRefs=[],hasProfession=()=>false}){
  if(!helper)return {eligible:false,reason:'Not available'};
  if(helper.id===leadId)return {eligible:false,reason:'The lead gatherer can’t also assist'};
  const refs=toolRefs.filter(Boolean);
  if(refs.length){
    const tool=refs.map(r=>heldTool(helper,r)).find(Boolean);
    return tool?{eligible:true,reason:`Carries ${tool.name}`}:{eligible:false,reason:'Carries no suitable tool'};
  }
  return hasProfession(helper)?{eligible:true,reason:'Has the gathering profession'}:{eligible:false,reason:'Lacks the gathering profession'};
}

/**
 * Player-requested gathering. The GM client checks this against its full (GM) Locations record, so a
 * player can never request an unrevealed location or a hidden node. One message for "unknown" and
 * "hidden" so a refusal does not confirm that something exists.
 */
export function checkGatherRequest({ownsActor,inParty,location,node,busy=false}){
  if(!ownsActor)return {ok:false,reason:'You need to own that character to request gathering: ask the GM to give you Owner permission on it.'};
  if(!inParty)return {ok:false,reason:'That character is not in the party: ask the GM to tick them in Ledger > GM Setup.'};
  if(!location||location.revealed!==true||!node||node.visible===false)return {ok:false,reason:'That gathering spot is not available'};
  if(busy)return {ok:false,reason:'Someone is already gathering there'};
  if(!node.gatherable)return {ok:false,reason:nodeBlocker(node,{forPlayer:true})||node.why||'That gathering spot is not available'};
  return {ok:true};
}
/** Only a GM may approve, decline or start gathering. */
export const canRunGathering=user=>user?.isGM===true;

/**
 * Award `qty` of a world Material Item to an Actor, stacking onto an Item with the same MAT-* id.
 * `sourceIdOf(item)` reads the id; `flagScope` tags a newly created Item.
 */
export async function stackMaterial(actor,worldItem,qty,{sourceIdOf,flagScope}){
  const materialId=sourceIdOf(worldItem);
  if(!actor||!worldItem||!MAT.test(materialId??''))throw Error('An imported world material is required');
  if(!Number.isSafeInteger(qty)||qty<1||qty>MAX_QTY)throw Error(`Gathering quantity must be 1–${MAX_QTY}`);
  const existing=Array.from(actor.items??[]).find(i=>sourceIdOf(i)===materialId&&!['feat','spell','tool'].includes(i.type));
  if(existing){
    const total=quantity(existing)+qty;
    await actor.updateEmbeddedDocuments('Item',[{_id:existing.id,'system.quantity':total}]);
    return {item:existing,stacked:true,total};
  }
  const data=typeof worldItem.toObject==='function'?worldItem.toObject():structuredClone(worldItem);
  for(const key of ['_id','id','folder','sort','ownership','_stats','uuid'])delete data[key];
  data.system={...(data.system??{}),quantity:qty};
  data.flags={...(data.flags??{}),[flagScope]:{...(data.flags?.[flagScope]??{}),entityType:'Material',sourceId:materialId}};
  const created=await actor.createEmbeddedDocuments('Item',[data]);
  if(!created?.length)throw Error('Foundry did not create the gathered Item');
  return {item:created[0],stacked:false,total:qty};
}

/**
 * Why gathering cannot start, as one plain line that also says how to fix it. Empty string means nothing blocks.
 * Players get the same reasons without ids or GM menus. No gathering rule lives here; these only explain gates
 * that startGather/checkGatherRequest already enforce.
 */
export const GATHER_FIX=Object.freeze({
  noParty:'No party set: Ledger > GM Setup > tick the characters, then Save Changes.',
  partyMissing:'The party characters were not found: Ledger > GM Setup > tick them again, then Save Changes.',
  playerNoParty:'The GM has not set the party yet: ask them to tick the characters in Ledger > GM Setup.',
  playerNotOwner:'You do not own a character in the party: ask the GM to give you Owner permission on your character.',
  noLocations:'The Locations module is not active: enable Ashen Gate | Locations in Manage Modules.',
  playerNoSpots:'No gathering spots yet: the GM must reveal a location that has gathering resources.',
  useDraft:'tick “Use draft materials anyway” (GM only) to award it now',
  noNode:'Choose a gathering node first.',
  noLead:'Choose a lead gatherer from the party.',
  busy:'That node is already being gathered: finish or cancel the open check first.'});
/** Why a MAT-* is not awardable, by its state (0.25.0): names "not imported" apart from "draft/unreleased". '' for ok.
 * States: ok, missing (not imported), draft (status not approved), gm-only, not-visible, duplicate, retired. `allowDraft` (GM
 * "use anyway") turns draft, gm-only and not-visible into ok. */
export const DRAFT_STATES=Object.freeze(['draft','gm-only','not-visible']);
export function materialProblem(id,state,{forPlayer=false,status='draft',allowDraft=false,name=''}={}){
  if(!state||state==='ok'||(allowDraft&&DRAFT_STATES.includes(state)))return '';
  if(forPlayer)return state==='missing'?'The GM has not imported this material yet.':'The GM has not released this material yet.';
  // The id is never shown: the material's name when known, else a neutral label.
  const m=name?`Material “${name}”`:'This material';
  if(state==='missing')return `${m} is not imported in this world: import it with General Manager.`;
  if(state==='draft')return `${m} is draft/unreleased (status: ${status}): approve it in General Manager, or ${GATHER_FIX.useDraft}.`;
  if(state==='gm-only')return `${m} is unreleased (GM-only): make it player-visible in General Manager, or ${GATHER_FIX.useDraft}.`;
  if(state==='not-visible')return `${m} is not visible to every player: check its permissions, or ${GATHER_FIX.useDraft}.`;
  if(state==='duplicate')return `${m} is imported more than once: remove the duplicate in General Manager.`;
  if(state==='retired')return `${m} is retired or superseded: restore it in General Manager.`;
  return `${m} cannot be awarded.`;
}
/** The reason one node cannot be gathered ('' when it can). `materialFound`: the node's MAT-* is an imported, approved, player-visible world Item.
 * 0.25.0: `materialState` (see materialProblem) says why not, and `allowDraft` lets the GM use a draft/unreleased one anyway. */
export function nodeBlocker(node,{materialFound=true,materialState=null,materialStatus='draft',materialId=null,materialName='',allowDraft=false,forPlayer=false}={}){
  if(!node)return GATHER_FIX.noNode;
  if(forPlayer&&!node.id)return 'This spot cannot be requested yet: the GM needs a newer Locations module.';
  if(node.missingTemplate)return forPlayer?'This spot is not set up yet: the GM has to finish it in Locations.'
    :'The gathering node this place uses no longer exists: pick another node for it in Locations, or restore it in Ledger > Gathering Nodes.';
  // A node with no material is a by-hand node (e.g. remains the GM awards at the table), not a broken one.
  if(!node.materialId)return forPlayer?'The GM handles this spot at the table: ask them.'
    :`No material set: award by hand.${node.note?` ${node.note}`:''} (To let the Ledger award it, set a Common material ${node.templateId?'on the template in Ledger > Gathering Nodes':'in Locations > Gathering'}.)`;
  if(node.exhausted)return forPlayer?'Already gathered (exhausted).':'Already gathered (exhausted): untick Exhausted in Locations to gather it again.';
  if(!node.available)return forPlayer?'Not available right now.':'Marked not available: tick Available on the node in Locations.';
  if(!Number.isInteger(node.dc))return forPlayer?'This spot is not set up yet: the GM has to finish it in Locations.':'No DC or tier on this node: set one in Locations.';
  const state=materialState??(materialFound?'ok':'missing');
  return materialProblem(materialId??node.materialId,state,{forPlayer,status:materialStatus,allowDraft,name:materialName});
}
/** GM start: first thing that blocks, in the order a GM would fix them. */
export function startBlocker({rosterCount=0,partyCount=0,leadInParty=false,node=null,materialFound=true,materialState=null,materialStatus='draft',materialId=null,materialName='',allowDraft=false,busy=false}={}){
  if(!rosterCount)return GATHER_FIX.noParty;
  if(!partyCount)return GATHER_FIX.partyMissing;
  if(!leadInParty)return GATHER_FIX.noLead;
  const why=nodeBlocker(node,{materialFound,materialState,materialStatus,materialId,materialName,allowDraft});
  if(why)return why;
  return busy?GATHER_FIX.busy:'';
}
/** Player Gathering tab: why there is nothing to request. `where` is gatherLocations(); `mine` the user's party characters. */
export function playerBlocker({rosterCount=0,mine=0,where={ok:true,locations:[]}}={}){
  if(!rosterCount)return GATHER_FIX.playerNoParty;
  if(!mine)return GATHER_FIX.playerNotOwner;
  if(!where.ok)return /not active/i.test(where.reason??'')?'The Locations module is not active: ask the GM to enable Ashen Gate | Locations.'
    :/hidden from players/i.test(where.reason??'')?'Locations is hidden from players: ask the GM to turn on Player Access in Locations.':`${where.reason}`;
  return where.locations.length?'':GATHER_FIX.playerNoSpots;
}
