/** Ashen Gate Profession Ledger: Exotic gathering rewards (0.15.0).
 * One reward resolver for Location and ad-hoc nodes. A successful check gives its Common (or, by 5+, Rare)
 * bundle as before, and may also give one Exotic material:
 *  - Only candidates the GM configured on the node can be found; a node without candidates rolls nothing.
 *  - A candidate is eligible when its imported definition says quality "Exotic", it is gathered by the node's
 *    gathering profession, and its tier is not above the node's tier. Nothing is inferred from names.
 *  - A node with an eligible designated candidate is a designated source: its own chance and condition decide,
 *    and the generic discovery roll is not made. Otherwise one d100 against the discovery chance (default 2%).
 *  - At most one d100 per gathering action; a failed check never rolls.
 * `roll(faces)` is injected (1..faces) so the rules are deterministic in tests. No Foundry globals are read here.
 */
import {norm} from './core.mjs';
import {professionKey} from './checks.mjs';
import {tierNumber,gatherReward} from './gathering.mjs';

export const EXOTIC_SETTING='exoticChance';
export const DEFAULT_EXOTIC_PERCENT=2;
export const EXOTIC_MODES=Object.freeze(['discovery','designated']);
/** When a designated source can give its Exotic: on any success, or only on success by 5+. */
export const DESIGNATED_CONDITIONS=Object.freeze({success:'Any success',rare:'Success by 5+ only'});
export const MAX_EXOTICS=20;
const MAT=/^MAT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const PROF=/^PROF-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
/** Gathering professions an Exotic can belong to (keys as checks.mjs professionKey gives them). */
export const GATHERING_KEYS=Object.freeze(['archaeology','fishing','herbalism','huntingskinning','mining']);

/** Whole percent 0–100. Fractions round to the nearest whole percent; anything unreadable is the 2% default. */
export function clampPercent(value,fallback=DEFAULT_EXOTIC_PERCENT){
  if(value===''||value==null||typeof value==='boolean')return fallback;
  const n=Number(value);
  return Number.isFinite(n)?Math.min(100,Math.max(0,Math.round(n))):fallback;
}

/** One configured candidate: {materialId, mode, chance, condition}. A designated entry with no chance stays
 * (so the GM sees it) but can never award: a designated source must say how it gives its Exotic. */
export function normalizeExoticEntry(raw){
  if(!raw||typeof raw!=='object')return null;
  const materialId=MAT.test(String(raw.materialId??''))?String(raw.materialId):'';
  if(!materialId)return null;
  const mode=raw.mode==='designated'?'designated':'discovery';
  if(mode==='discovery')return {materialId,mode};
  const c=Number(raw.chance);
  const chance=raw.chance!==''&&raw.chance!=null&&Number.isFinite(c)&&c>=1&&c<=100?Math.round(c):null;
  return {materialId,mode,chance,condition:raw.condition==='rare'?'rare':'success'};
}
/** A node's candidate list: valid entries, each material once (first wins), at most 20. */
export function normalizeExotics(list){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(list)?list:[]){
    const e=normalizeExoticEntry(raw);
    if(!e||seen.has(e.materialId))continue;
    seen.add(e.materialId);out.push(e);
    if(out.length>=MAX_EXOTICS)break;
  }
  return out;
}

/** The gathering profession a node uses, or null when its skill is a plain skill/tool rather than a gathering profession. */
export function nodeProfessionKey(node){
  const listed=(Array.isArray(node?.professions)?node.professions:[]).find(k=>GATHERING_KEYS.includes(k));
  if(listed)return listed;
  const key=professionKey(node?.skill??'');
  return GATHERING_KEYS.includes(key)?key:null;
}
/** 0.25.0: every gathering profession a node allows (a template may list several), else its one from the skill. */
export function nodeProfessionKeys(node){
  const listed=(Array.isArray(node?.professions)?node.professions:[]).filter(k=>GATHERING_KEYS.includes(k));
  if(listed.length)return [...new Set(listed)];
  const one=nodeProfessionKey(node);return one?[one]:[];
}
/** A PROF-* id read as a profession key when no Profession definition gives its name: PROF-PT-HERBALISM → herbalism. */
export function professionKeyFromId(id){
  if(!PROF.test(String(id??'')))return null;
  const parts=String(id).split('-').slice(1);
  for(let i=0;i<parts.length;i++){const k=professionKey(parts.slice(i).join(' '));if(GATHERING_KEYS.includes(k))return k;}
  return professionKey(parts.join(' '))||null;
}

/**
 * Machine-readable metadata of an imported Material definition (Manager's source.definition):
 * {id, name, quality, exotic, tier, professionIds}. Never reads rarity or profession from the name.
 */
export function materialMeta(definition,{name=''}={}){
  const d=definition&&typeof definition==='object'?definition:null;
  if(!d||!MAT.test(String(d.id??''))||(d.entity_type&&d.entity_type!=='Material'))return null;
  const quality=['common','rare','exotic'].find(q=>q===norm(d.quality))??null;
  const ids=new Set();
  if(PROF.test(String(d.source_profession_id??'')))ids.add(d.source_profession_id);
  for(const r of Array.isArray(d.refs)?d.refs:[])if(r?.relation==='gathered_by'&&PROF.test(String(r.target_id??'')))ids.add(r.target_id);
  return {id:d.id,name:String(name||d.name||d.id),quality:quality?quality[0].toUpperCase()+quality.slice(1):null,exotic:quality==='exotic',
    tier:tierNumber(d.tierId??d.tier_id??d.tier),professionIds:[...ids]};
}
const TIER_WORDS='Apprentice|Journeyman|Expert|Artisan|Master';
const DESC_LINE=new RegExp(`<em>\\s*(Common|Rare|Exotic)\\s*(?:·|&middot;|&#183;|\\|)\\s*(${TIER_WORDS})\\s*(?:·|&middot;|&#183;|\\|)\\s*([^<]*?)\\s*</em>`,'i');
/**
 * 0.35.1: the same metadata read from a world Material Item, tolerant of older or thinner imports. `source` is the Manager flag
 * (`flags.ashen-gate-manager.source`). The full definition is preferred; when it is missing or lacks quality, tier or profession,
 * the gaps are filled from the flag's own `refs` (gathered_by) and from the Item description's first line ("Common · Apprentice · Herbalism").
 * Quality is matched without regard to case and tier by name or number.
 */
export function materialMetaOfSource(source,{name='',description=''}={}){
  const flag=source&&typeof source==='object'?source:null;
  const def=flag?.definition&&typeof flag.definition==='object'?flag.definition:{};
  const id=def.id??flag?.sourceId;
  const base=materialMeta({...def,id,entity_type:def.entity_type??flag?.entityType??'Material',tierId:def.tierId??def.tier_id??def.tier,
    refs:Array.isArray(def.refs)&&def.refs.length?def.refs:(Array.isArray(flag?.refs)?flag.refs:[])},{name});
  if(!base)return null;
  const line=DESC_LINE.exec(String(description??''));
  const out={...base,professionKeys:[]};
  if(!out.quality&&line){out.quality=line[1][0].toUpperCase()+line[1].slice(1).toLowerCase();out.exotic=out.quality==='Exotic';}
  if(out.tier==null&&line)out.tier=tierNumber(line[2]);
  if(line){const k=professionKey(line[3]);if(k)out.professionKeys=[k];}
  return out;
}
/** Profession keys a material is gathered by. `keyOf(profId)` may name it from its world definition. */
export const materialProfessionKeys=(meta,keyOf=professionKeyFromId)=>[...new Set([...(meta?.professionIds??[]).map(id=>keyOf(id)??professionKeyFromId(id)),...(meta?.professionKeys??[])].filter(Boolean))];

/**
 * Filter material metadata for a selector: text, gathering profession key, quality, exact tier or "not above" tier.
 * Only valid definitions (meta not null) are listed.
 */
export function filterMaterials(metas,{query='',profession=null,quality=null,tier=null,maxTier=null,keyOf}={}){
  const q=norm(query);
  return metas.filter(m=>m&&(!quality||norm(m.quality)===norm(quality))
    &&(!profession||materialProfessionKeys(m,keyOf).includes(profession))
    &&(tier==null||m.tier===Number(tier))&&(maxTier==null||(m.tier!=null&&m.tier<=Number(maxTier)))
    &&(!q||norm(m.name).includes(q)||norm(m.id).includes(q)))
    .sort((a,b)=>(a.tier??9)-(b.tier??9)||a.name.localeCompare(b.name));
}

/** Why one candidate can or cannot be found at this node: {eligible, reason}. `meta` null means not imported/visible. */
export function exoticEligibility(entry,node,meta,{keyOf}={}){
  if(!meta)return {eligible:false,reason:'Not an imported, approved, player-visible world material'};
  if(!meta.exotic)return {eligible:false,reason:`Its definition says ${meta.quality??'no quality'}, not Exotic`};
  const profs=nodeProfessionKeys(node);
  if(!profs.length)return {eligible:false,reason:'The node’s skill is not a gathering profession'};
  const keys=materialProfessionKeys(meta,keyOf);
  if(!keys.length)return {eligible:false,reason:'Its definition names no gathering profession'};
  if(!keys.some(k=>profs.includes(k)))return {eligible:false,reason:'Gathered by another profession'};
  const nodeTier=tierNumber(node?.tier);
  if(meta.tier==null||nodeTier==null)return {eligible:false,reason:'Its tier or the node’s tier is missing'};
  if(meta.tier>nodeTier)return {eligible:false,reason:`Tier ${meta.tier} is above the node’s tier ${nodeTier}`};
  if(entry.mode==='designated'&&entry.chance==null)return {eligible:false,reason:'Designated source with no chance set'};
  return {eligible:true,reason:''};
}

const rollDie=(roll,faces)=>{
  const n=Number(roll(faces));
  if(!Number.isInteger(n)||n<1||n>faces)throw Error(`Exotic roll must be a whole number 1–${faces}`);
  return n;
};
/**
 * The Exotic part of one gathering action. Returns
 * {kind:'none'|'discovery'|'designated', roll, target, materialId, skipped:[{materialId,reason}], eligible:[materialId]}.
 * `metaOf(materialId)` gives materialMeta for an awardable material, or null.
 */
export function resolveExotic({node,outcome,percent=DEFAULT_EXOTIC_PERCENT,roll,metaOf=()=>null,keyOf}={}){
  const none={kind:'none',roll:null,target:null,materialId:null,skipped:[],eligible:[]};
  const entries=normalizeExotics(node?.exotics);
  if(!entries.length||!outcome||outcome.result==='fail')return none;
  const checked=entries.map(e=>({e,...exoticEligibility(e,node,metaOf(e.materialId),{keyOf})}));
  const ok=checked.filter(c=>c.eligible).map(c=>c.e);
  const out={...none,skipped:checked.filter(c=>!c.eligible).map(c=>({materialId:c.e.materialId,reason:c.reason})),eligible:ok.map(e=>e.materialId)};
  const designated=ok.filter(e=>e.mode==='designated');
  if(designated.length){
    // Designated source: its own rules instead of the generic roll. Bands share one d100, in the GM's order.
    const live=designated.filter(e=>e.condition!=='rare'||outcome.result==='rare');
    if(!live.length)return {...out,kind:'designated'};
    const r=rollDie(roll,100);let top=0;
    for(const e of live){top=Math.min(100,top+e.chance);if(r<=top)return {...out,kind:'designated',roll:r,target:top,materialId:e.materialId};}
    return {...out,kind:'designated',roll:r,target:top};
  }
  const pool=ok.filter(e=>e.mode==='discovery');
  const target=clampPercent(percent);
  if(!pool.length||target<=0)return out;
  const r=rollDie(roll,100);
  if(r>target)return {...out,kind:'discovery',roll:r,target};
  // Which candidate was found is a pick, not a second discovery roll.
  const pick=pool.length>1?pool[rollDie(roll,pool.length)-1]:pool[0];
  return {...out,kind:'discovery',roll:r,target,materialId:pick.materialId};
}

/**
 * Everything one gathering action awards, for Location and ad-hoc nodes alike:
 * {base: gatherReward(...), exotic: resolveExotic(...), awards:[{materialId, quantity, kind:'common'|'rare'|'exotic'}]}.
 */
export function resolveGatherRewards({node,outcome,percent,roll,metaOf,keyOf}={}){
  const base=gatherReward(node,outcome,{roll});
  const exotic=resolveExotic({node,outcome,percent,roll,metaOf,keyOf});
  const awards=[];
  if(base)awards.push({materialId:base.materialId,quantity:base.quantity,kind:base.rare?'rare':'common'});
  if(exotic.materialId)awards.push({materialId:exotic.materialId,quantity:1,kind:'exotic'});
  return {base,exotic,awards};
}

/** Foundry's dice RNG (the one Roll uses) when present, else Math.random. Returns 1..faces. */
export function defaultRoll(faces){
  const u=globalThis.CONFIG?.Dice?.randomUniform;
  const x=typeof u==='function'?Number(u()):Math.random();
  const v=Number.isFinite(x)&&x>=0&&x<1?x:Math.random();
  return Math.floor(v*faces)+1;
}
