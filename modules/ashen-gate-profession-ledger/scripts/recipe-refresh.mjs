/** Ashen Gate Profession Ledger: Refresh recipes (0.36.0). Pure rules; main.js reads Foundry, enforces the GM gate and does the writes.
 * A recipe-only cousin of Refresh (refresh.mjs, which it shares its helpers with). For one character it lists every known recipe in a group, why,
 * and whether it is ticked "Remove", plus the starting recipes of held professions that are missing:
 *   gone      the catalog does not have it (unknown id, retired, legacy or non-text entry). It cannot work, so it is PRE-TICKED to remove.
 *   draft     in the catalog but not released to players (same rule as the starting-recipe grant). Kept unless ticked.
 *   unheld    its profession is not held any more. Kept unless ticked.
 *   replaced  a recipe that is no longer `starting: true` and either was recorded as granted (Actor flag grantedRecipes) or carries the pack marker `former_starting: true` (formerStarting): the GM swapped the starters.
 *             PRE-TICKED to remove unless the character has crafted items from it (then it stays, with its reason, and ticking it needs the typed name).
 *   starting  a starting recipe of a held profession. Kept unless ticked.
 *   learned   any other recipe of a held profession. Never pre-ticked.
 * Removing a learned/draft/unheld recipe that carries progress (crafted items from it, or XP in its profession) needs the character's name typed.
 * Nothing else is ever touched: crafted items, materials, XP and gear stay. */
import {startingRecipePlan,recipeProfessionKey} from './assign.mjs';
import {RECIPE_NON_TEXT,unrecognisedRecipes,hasProgress} from './refresh.mjs';

export const RECIPE_GROUPS=Object.freeze([
  {id:'gone',label:'Not in the catalog any more'},{id:'replaced',label:'Replaced starting recipes'},{id:'draft',label:'Draft or unreleased'},{id:'unheld',label:'Profession no longer held'},
  {id:'starting',label:'Starting recipes'},{id:'learned',label:'Learned recipes'}]);

/**
 * input: known [REC-*], knownRaw (the stored flag), grantedRecipes, recipes (catalog), held {ids:Set,keys:Set}, recipeNames Map, unreleased(recipe)->''|reason,
 *   crafted [{recipeId}], progress {professions:{PROF-*:{xp,...}}}|null, actor {id,name},
 *   remove: null (the defaults) or an iterable of tokens (recipe ids, or RECIPE_NON_TEXT); add: null (every addable) or an iterable of recipe ids.
 */
export function planRecipeRefresh({known=[],knownRaw=null,grantedRecipes=[],recipes=[],held={ids:new Set(),keys:new Set()},recipeNames=new Map(),unreleased=()=>'',
  crafted=[],progress=null,actor={id:'x',name:''},remove=null,add=null}={}){
  const byId=new Map(recipes.map(r=>[r.id,r]));
  const rows=[];
  for(const u of unrecognisedRecipes({known,knownRaw,byId,recipeNames}))
    rows.push({group:'gone',token:u.token,recipeId:u.token===RECIPE_NON_TEXT?null:u.token,name:u.name,why:`${u.what[0].toUpperCase()+u.what.slice(1)}: it can no longer be used.`,defaultRemove:true,needsConfirm:false});
  for(const id of known){
    const r=byId.get(id);if(!r)continue;
    const key=recipeProfessionKey(r),holds=held.ids.has(r.professionId)||Boolean(key&&held.keys.has(key));
    const why=unreleased(r);
    const made=crafted.some(c=>c.recipeId===id),xp=hasProgress(progress?.professions?.[r.professionId]);
    const base={token:id,recipeId:id,name:r.name,defaultRemove:false,professionId:r.professionId,professionKey:key};
    if(why)rows.push({...base,group:'draft',why,needsConfirm:made||xp});
    else if(!holds)rows.push({...base,group:'unheld',why:'The character no longer holds this recipe’s profession.',needsConfirm:made||xp});
    else if(r.starting===true)rows.push({...base,group:'starting',why:'A starting recipe of a profession the character holds.',needsConfirm:false});
    else if(grantedRecipes.includes(id)||r.formerStarting===true)rows.push({...base,group:'replaced',needsConfirm:made,defaultRemove:!made,
      why:made?'Replaced starting recipe: it is no longer a starter, but this character has crafted with it, so it stays unless you tick it.'
        :'Replaced starting recipe: it is no longer a starter. Untick it if you want the character to keep it.'});
    else rows.push({...base,group:'learned',why:'Learned by the character.',needsConfirm:made||xp});
  }
  const ticked=new Set(remove==null?rows.filter(r=>r.defaultRemove).map(r=>r.token):[...remove].map(String));
  for(const r of rows)r.remove=ticked.has(r.token);
  // Missing starting recipes are those never known: removing a starting recipe on purpose does not offer it back.
  const startRows=startingRecipePlan([{id:actor.id,name:actor.name}],recipes,{heldProfessions:()=>held,known:()=>known,unreleased});
  const addSet=add==null?null:new Set([...add].map(String));
  const missing=startRows.filter(r=>r.status==='new'||r.status==='unreleased').map(r=>({rowId:r.id,recipeId:r.recipeId,name:r.recipeName,professionKey:r.professionKey,
    status:r.status,reason:r.reason,add:r.status==='new'&&(addSet==null||addSet.has(r.recipeId))}));
  const removing=rows.filter(r=>r.remove);
  return {rows,missing,
    needsTypedConfirmation:removing.some(r=>r.needsConfirm),
    counts:{gone:rows.filter(r=>r.group==='gone').length,replaced:rows.filter(r=>r.group==='replaced').length,remove:removing.length,add:missing.filter(m=>m.add).length,skipped:missing.filter(m=>m.status==='unreleased').length},
    problems:rows.some(r=>r.defaultRemove||r.group==='replaced')||missing.some(m=>m.status==='new')};
}
/** How many entries of a character's recipes no longer exist in the catalog (unknown ids and non-text entries): the Individual tab's badge.
 * `exactCatalog:false` (a player: their catalog hides unreleased recipes, which still exist) counts only entries that cannot be recipe ids at all. */
export function missingRecipeCount({known=[],knownRaw=null,recipes=[],exactCatalog=true}={}){
  if(!exactCatalog)return Array.isArray(knownRaw)?knownRaw.filter(e=>typeof e!=='string'||!/^REC-[A-Z0-9-]+$/.test(e)).length:0;
  const byId=new Map(recipes.map(r=>[r.id,r]));
  return unrecognisedRecipes({known,knownRaw,byId}).reduce((n,u)=>n+(u.token===RECIPE_NON_TEXT?(Array.isArray(knownRaw)?knownRaw.filter(e=>typeof e!=='string').length:1):1),0);
}
