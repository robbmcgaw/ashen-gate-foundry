/** Ashen Gate Profession Ledger: GM-applied enchantments (0.38.0). Pure helpers, no Foundry globals.
 *
 * A Recipe record with `kind: "activity"` and `gm_applied: true` adds an effect to an item the player already owns, and the
 * GM applies that effect by hand. The player pays materials (used when the GM marks the request Done) and the gp fee (the
 * GM collects it), names the item to bring, and the Ledger posts one chat card with Done and Decline for the GM. Nothing
 * is created, renamed or enforced: the table rule below is only printed on the GM card.
 *
 * Record fields (see the supplement's systems/schemas/json/recipe.schema.json):
 *   gm_applied  true
 *   bring       {text (1 to 80 characters, shown), item_types?, categories?, base_items?}  the lists are a loose, advisory filter
 *   effect_note the effect text (the Ledger already reads it for activities)
 */
export const ENCHANT_FLAG='enchant';
export const BRING_TEXT_MAX=80;
/** Printed on the GM card only. Nothing in the Ledger enforces it (Robb, 2026-10-28). */
export const TABLE_RULE='Table rule: one enchantment per item. An enchanted item is not attuned by default and is not magical unless you say so. Nothing here enforces this; keep the player’s item name and put the recipe name in its description.';
/** Foundry item types a player can bring. Material Items (MAT-*) and Recipe Items are never offered. */
export const BRING_ITEM_TYPES=Object.freeze(['weapon','equipment','container','tool','loot','consumable']);
const squash=v=>String(v??'').replace(/\s+/g,' ').trim();
const cleanList=(raw,max=40)=>Array.isArray(raw)?[...new Set(raw.filter(x=>typeof x==='string').map(x=>squash(x)).filter(x=>x&&x.length<=max))].slice(0,20):[];
/** The `bring` object of a record, cleaned: {text, itemTypes, categories, baseItems}, or null when it has no usable text. */
export function cleanBring(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const text=squash(raw.text);
  if(!text||text.length>BRING_TEXT_MAX)return null;
  return {text,itemTypes:cleanList(raw.item_types??raw.itemTypes).filter(t=>BRING_ITEM_TYPES.includes(t)),
    categories:cleanList(raw.categories),baseItems:cleanList(raw.base_items??raw.baseItems)};
}
/** `gm_applied` is honoured only on an activity (the schema and Manager say the same). */
export const gmAppliedFlag=(...sources)=>sources.some(s=>s?.gm_applied===true||s?.gmApplied===true);
export const isGmApplied=recipe=>recipe?.kind==='activity'&&recipe?.gmApplied===true;
export const bringOf=recipe=>isGmApplied(recipe)?(recipe.bring??null):null;
/** True when the bring object filters at all (otherwise the picker is only a convenience). */
export const hasBringFilter=bring=>Boolean(bring&&(bring.itemTypes.length||bring.categories.length||bring.baseItems.length));

/** The dnd5e facts of one Item (document or plain object) that the loose check reads. */
export function itemFacts(item){
  const type=item?.system?.type??{};
  return {id:item?.id??item?._id??null,uuid:item?.uuid??null,name:String(item?.name??''),type:String(item?.type??''),
    category:String(type.value??''),baseItem:String(type.baseItem??'')};
}
/** Loose check: an item matches when it passes every list that is set. A list that is empty or absent does not filter. */
export function matchesBring(facts,bring){
  if(!bring)return false;
  if(bring.itemTypes.length&&!bring.itemTypes.includes(facts.type))return false;
  if(bring.categories.length&&!bring.categories.includes(facts.category))return false;
  if(bring.baseItems.length&&!bring.baseItems.includes(facts.baseItem))return false;
  return true;
}
const isRecipeItem=item=>/^recipe:/i.test(String(item?.name??''));
const sourceIdOf=item=>item?.flags?.['ashen-gate-manager']?.source?.sourceId??item?.flags?.['ashen-gate-profession-ledger']?.sourceId??null;
/** What an actor can bring: `matches` pass the bring filter, `others` are every other bringable Item (the GM decides).
 * Materials, recipes and non-gear Items (features, spells…) are left out. Never writes. */
export function bringCandidates(actor,bring){
  const matches=[],others=[];
  for(const item of Array.from(actor?.items??[])){
    const facts=itemFacts(item);
    if(!BRING_ITEM_TYPES.includes(facts.type)||isRecipeItem(item))continue;
    if(/^MAT-/.test(sourceIdOf(item)??''))continue;
    (matchesBring(facts,bring)?matches:others).push(facts);
  }
  const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
  return {matches:matches.sort(byName),others:others.sort(byName)};
}

/** Why a request cannot be made, or ''. `candidates` is bringCandidates(). A bring list that filters but finds nothing still allows
 * other items (the filter is advisory); only a character with nothing to bring at all is blocked. */
export function bringBlocker(bring,candidates,actorName='This character'){
  if(!bring)return '';
  if(!candidates.matches.length&&!candidates.others.length)return `Bring ${bring.text}; ${actorName} carries nothing to bring.`;
  return '';
}

/** The GM card flag written when the player asks. Only plain, bounded values. */
export function requestRecord({actor,recipe,professionId=null,professionName='',item=null,materials=[],fee=null,effect='',check=null,userId=null,now=Date.now()}){
  const clip=(v,n)=>squash(v).slice(0,n);
  return {version:1,status:'requested',actorId:String(actor.id),actorName:clip(actor.name,80),recipeId:String(recipe.id),recipeName:clip(recipe.name,100),
    professionId:professionId?String(professionId):null,professionName:clip(professionName,60),tier:recipe.tier?String(recipe.tier):null,effort:recipe.effort?String(recipe.effort):null,
    bringText:clip(recipe.bring?.text,BRING_TEXT_MAX),
    item:item?{id:item.id?String(item.id):null,uuid:item.uuid?String(item.uuid):null,name:clip(item.name,120)}:null,
    materials:materials.map(m=>({materialId:m.materialId?String(m.materialId):null,name:clip(m.name,80),quantity:Math.max(1,Math.floor(Number(m.quantity)||1))})),
    fee:Number.isFinite(Number(fee))&&Number(fee)>0?Number(fee):null,effect:clip(effect,400),
    check:check&&typeof check==='object'?{label:clip(check.label,40),total:Number.isFinite(Number(check.total))?Number(check.total):null,mode:Math.sign(Number(check.mode)||0),unavailable:Boolean(check.unavailable)}:null,
    requesterId:userId?String(userId):null,requestedAt:now};
}
export const ENCHANT_STATUSES=Object.freeze(['requested','done','declined']);
/** The request on a chat message, or null. */
export const enchantOf=message=>{const e=message?.flags?.['ashen-gate-profession-ledger']?.[ENCHANT_FLAG];return e&&typeof e==='object'&&ENCHANT_STATUSES.includes(e.status)?e:null;};
