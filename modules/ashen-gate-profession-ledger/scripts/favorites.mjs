/** Ashen Gate Profession Ledger: favorites (0.39.0). Pure helpers, no Foundry globals.
 * A character's favorites live on the Actor: flags.ashen-gate-profession-ledger.favorites = {professions:[PROF-*], recipes:[REC-*]}.
 * Anything malformed is ignored, never thrown on; ids that no longer exist are dropped when the next change is written. */
import {LEDGER_SCOPE} from './progression.mjs';

export const FAVORITES_FLAG='favorites';
export const FAVORITES_MAX=500;
const KINDS={profession:{key:'professions',prefix:'PROF'},recipe:{key:'recipes',prefix:'REC'}};
const validId=(s,prefix)=>typeof s==='string'&&new RegExp(`^${prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`).test(s);

/** Normalise a raw flag value: always {professions:[...],recipes:[...]} with unique, well-formed ids. */
export function cleanFavorites(raw){
  const out={professions:[],recipes:[]};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const {key,prefix} of Object.values(KINDS)){
    const list=Array.isArray(raw[key])?raw[key]:[];
    out[key]=[...new Set(list.filter(id=>validId(id,prefix)))].slice(0,FAVORITES_MAX);
  }
  return out;
}
export const favoritesOf=actor=>cleanFavorites(actor?.flags?.[LEDGER_SCOPE]?.[FAVORITES_FLAG]);

/** Plan one change. `valid` is the ids that still exist ({professions:Set,recipes:Set}); anything else is pruned. `canAdd` (default: valid) is what may be newly starred.
 * Un-starring is always allowed. Ids no longer valid are pruned from what is written. Returns {changed,next,on}. */
export function planFavorite(current,{kind,id,on},valid,canAdd=valid){
  const spec=KINDS[kind];
  if(!spec)throw Error('Favorites are for a profession or a recipe');
  if(typeof on!=='boolean')throw Error('Say whether to add or remove the favorite');
  if(!validId(id,spec.prefix))throw Error(`That is not a ${kind} id`);
  const base=cleanFavorites(current);
  if(on&&!canAdd?.[spec.key]?.has(id))throw Error(kind==='recipe'?'Only a recipe the character knows can be a favorite':'Only a profession the character has can be a favorite');
  const next={professions:base.professions.filter(x=>valid?.professions?.has(x)),recipes:base.recipes.filter(x=>valid?.recipes?.has(x))};
  const list=next[spec.key].filter(x=>x!==id);
  if(on){if(list.length>=FAVORITES_MAX)throw Error('That is too many favorites');list.push(id);}
  next[spec.key]=list;
  const empty=!next.professions.length&&!next.recipes.length;
  return {next,on,changed:current==null?!empty:JSON.stringify(next)!==JSON.stringify(current)};
}

/** Stable sort: favorites first, otherwise the given order. `idOf` reads an item's id. */
export function favoritesFirst(items,favIds,idOf=x=>x){
  const set=favIds instanceof Set?favIds:new Set(favIds??[]);
  return items.map((item,i)=>({item,i,f:set.has(idOf(item))?0:1})).sort((a,b)=>a.f-b.f||a.i-b.i).map(x=>x.item);
}
/** "Favorites only": keep favorite items; with the switch off, everything. */
export const filterFavorites=(items,favIds,only,idOf=x=>x)=>only?items.filter(item=>(favIds instanceof Set?favIds:new Set(favIds??[])).has(idOf(item))):items;
