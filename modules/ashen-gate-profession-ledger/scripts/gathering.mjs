/** Ashen Gate Profession Ledger gathering rules (0.10.0; DC defaults and Exotic candidates 0.15.0).
 * One lead gatherer, one check per node for the party. Eligible helpers with suitable tools give advantage,
 * not another attempt. Success gives one common bundle; success by 5+ gives one rare bundle instead.
 * A success may also find one Exotic (exotic.mjs). Failure exhausts the node. No Foundry globals are read here.
 */
import {norm,quantity} from './core.mjs';
import {TIERS} from './progression.mjs';
import {heldTool} from './checks.mjs';
import {normalizeExotics} from './exotic.mjs';

/** Kept equal to Locations' GATHERING.dcByTier (a Locations test checks both). A node's own DC always wins. */
export const DEFAULT_DC_BY_TIER=Object.freeze({1:10,2:12,3:15,4:18,5:20});
export const RARE_MARGIN=5;
const MAT=/^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAX_QTY=999;

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
    note:String(raw.note??''),locationId,locationName:String(locationName??''),locationRevealed:locationRevealed===true};
  node.gatherable=node.available&&!node.exhausted&&Boolean(node.materialId)&&Number.isInteger(node.dc);
  node.why=!node.materialId?'No material id set: award by hand':node.exhausted?'Already gathered (exhausted)':!node.available?'Not available right now':!Number.isInteger(node.dc)?'No DC or tier set':'';
  return node;
}

/** {result:'fail'|'common'|'rare', margin}. Success is total ≥ DC; rare is total ≥ DC + 5. */
export function gatherOutcome(total,dc){
  const t=Number(total),d=Number(dc);
  if(!Number.isFinite(t)||!Number.isFinite(d))throw Error('A check total and DC are required');
  const margin=t-d;
  return {result:margin<0?'fail':margin>=RARE_MARGIN?'rare':'common',margin,total:t,dc:d};
}
/** What the lead receives: one bundle, rare instead of common on success by 5+. A node without a rare material gives its common one. */
export function gatherReward(node,outcome){
  if(!node||outcome?.result==='fail'||!outcome)return null;
  if(outcome.result==='rare'&&node.rareMaterialId)return {materialId:node.rareMaterialId,quantity:node.rareQuantity,rare:true,noRareFallback:false};
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
  if(!actor||!worldItem||!MAT.test(materialId??''))throw Error('A world MAT-* material is required');
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
  noNode:'Choose a gathering node first.',
  noLead:'Choose a lead gatherer from the party.',
  busy:'That node is already being gathered: finish or cancel the open check first.'});
/** The reason one node cannot be gathered ('' when it can). `materialFound`: the node's MAT-* is an imported, approved, player-visible world Item. */
export function nodeBlocker(node,{materialFound=true,forPlayer=false}={}){
  if(!node)return GATHER_FIX.noNode;
  if(forPlayer&&!node.id)return 'This spot cannot be requested yet: the GM needs a newer Locations module.';
  // A node with no material is a by-hand node (e.g. remains the GM awards at the table), not a broken one.
  if(!node.materialId)return forPlayer?'The GM handles this spot at the table: ask them.'
    :`No material id set: award by hand.${node.note?` ${node.note}`:''} (To let the Ledger award it, set a Common material in Locations > Gathering.)`;
  if(node.exhausted)return forPlayer?'Already gathered (exhausted).':'Already gathered (exhausted): untick Exhausted in Locations to gather it again.';
  if(!node.available)return forPlayer?'Not available right now.':'Marked not available: tick Available on the node in Locations.';
  if(!Number.isInteger(node.dc))return forPlayer?'This spot is not set up yet: the GM has to finish it in Locations.':'No DC or tier on this node: set one in Locations.';
  if(!materialFound)return forPlayer?'The GM has not imported this material yet.'
    :`Material ${node.materialId} is not in the world: import the pack in General Manager (it must be approved and player-visible).`;
  return '';
}
/** GM start: first thing that blocks, in the order a GM would fix them. */
export function startBlocker({rosterCount=0,partyCount=0,leadInParty=false,node=null,materialFound=true,busy=false}={}){
  if(!rosterCount)return GATHER_FIX.noParty;
  if(!partyCount)return GATHER_FIX.partyMissing;
  if(!leadInParty)return GATHER_FIX.noLead;
  const why=nodeBlocker(node,{materialFound});
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
