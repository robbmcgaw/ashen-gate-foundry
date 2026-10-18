/** Actor-owned Profession state. Alpha adapter for Tim's reviewed rules; no Skill Trees XP copy. */
export const PROGRESSION_SCHEMA='ag-profession-actor-progress/0.1';
export const LEDGER_SCOPE='ashen-gate-profession-ledger';
export const LEVEL_COSTS=Object.freeze(Array.from({length:15},(_,i)=>5+i*3)); // 1 -> 2 costs 5; 15 -> 16 costs 47
export const ACCESS_LEVELS=Object.freeze({Apprentice:1,Journeyman:4,Expert:7,Artisan:10,Master:13});
export const GATHERING_PROFESSIONS=Object.freeze(['Archaeology','Fishing','Herbalism','Hunting/Skinning','Mining']);
export const TIERS=Object.freeze(Object.keys(ACCESS_LEVELS));
const validId=(s,prefix)=>typeof s==='string'&&new RegExp(`^${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`).test(s);
const validXp=x=>Number.isSafeInteger(x)&&x>=0;
export function levelForXP(xp){
 if(!validXp(xp))throw Error('XP must be a nonnegative whole number');
 let spent=0,level=1;
 for(const cost of LEVEL_COSTS){if(xp<spent+cost)break;spent+=cost;level++;}
 return level;
}
export function xpForLevel(level){
 if(!Number.isInteger(level)||level<1||level>16)throw Error('Profession level must be 1–16');
 return LEVEL_COSTS.slice(0,level-1).reduce((a,b)=>a+b,0);
}
export function tierForLevel(level){
 if(!Number.isInteger(level)||level<1)return null;
 return [...TIERS].reverse().find(t=>level>=ACCESS_LEVELS[t])??null;
}
export function gatherXP(tier){const i=TIERS.indexOf(tier);if(i<0)throw Error('Unknown material tier');return i+1;}
export function validateProgressState(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Invalid Actor Profession progress');
 if(state.schema!==PROGRESSION_SCHEMA||!state.professions||typeof state.professions!=='object'||Array.isArray(state.professions))throw Error('Unsupported Actor progress format');
 for(const [id,row] of Object.entries(state.professions)){
  if(!validId(id,'PROF')||!row||!validXp(row.xp)||!Array.isArray(row.selectedPerkIds)||!row.selectedPerkIds.every(x=>validId(x,'PERK')))throw Error(`Invalid Profession progress entry ${id}`);
  if(new Set(row.selectedPerkIds).size!==row.selectedPerkIds.length)throw Error(`Duplicate perk selection on ${id}`);
  if(row.selectedPerkIds.length>levelForXP(row.xp))throw Error(`Perk selections exceed level on ${id}`);
 }
 return state;
}
export const emptyProgress=()=>({schema:PROGRESSION_SCHEMA,professions:{}});
export function progressOf(actor,profId){
 if(!validId(profId,'PROF'))return null;
 const raw=actor?.flags?.[LEDGER_SCOPE]?.professionProgress;
 if(!raw)return null;
 try {validateProgressState(raw);}catch{return null;}
 const row=raw.professions[profId];
 if(!row)return null;
 return {id:profId,xp:row.xp,level:levelForXP(row.xp),tier:tierForLevel(levelForXP(row.xp)),selectedPerkIds:[...row.selectedPerkIds],unspentPerkChoices:Math.max(0,levelForXP(row.xp)-row.selectedPerkIds.length)};
}
export function nextProgress(state,profId,points){
 if(!validId(profId,'PROF'))throw Error('An imported PROF-* Item is required');
 if(!Number.isSafeInteger(points)||points<=0)throw Error('XP award must be a positive whole number');
 const current=state??emptyProgress();validateProgressState(current);
 const row=current.professions[profId]??{xp:0,selectedPerkIds:[]};
 if(!validXp(row.xp+points))throw Error('XP award exceeds supported safe integer range');
 const out={schema:PROGRESSION_SCHEMA,professions:{...current.professions,[profId]:{...row,xp:row.xp+points,selectedPerkIds:[...row.selectedPerkIds]}}};
 return {state:out,previousLevel:levelForXP(row.xp),level:levelForXP(row.xp+points)};
}
export function knownRecipesOf(actor){
 const raw=actor?.flags?.[LEDGER_SCOPE]?.knownRecipes;
 return Array.isArray(raw)?[...new Set(raw.filter(id=>validId(id,'REC')))]:[];
}
export function canLearnRecipe(actor,item,sourceId,checkVisible=true){
 if(!validId(sourceId,'REC'))return {ok:false,reason:'A permanent REC-* source ID is required'};
 if(knownRecipesOf(actor).includes(sourceId))return {ok:false,reason:'Recipe already learned'};
 if(!item||!Array.from(actor?.items??[]).some(i=>i.id===item.id))return {ok:false,reason:'Recipe Item must be owned by this Actor'};
 const qty=Number(item.system?.quantity??0);
 if(!Number.isSafeInteger(qty)||qty<1)return {ok:false,reason:'No consumable Recipe Item remaining'};
 if(checkVisible&&item.flags?.['ashen-gate-manager']?.source?.visibility!=='player')return {ok:false,reason:'Recipe lacks an explicit player-visible source binding'};
 return {ok:true};
}
export function isMaterialAwardCandidate(item,getId){
 const id=getId(item);const src=item?.flags?.['ashen-gate-manager']?.source;
 return validId(id,'MAT')&&src?.entityType==='Material'&&src?.visibility==='player'&&
  item?.type!=='feat'&&item?.type!=='spell'&&src?.status==='approved'&&item?.flags?.['ashen-gate-manager']?.lifecycle?.archived!==true;
}
