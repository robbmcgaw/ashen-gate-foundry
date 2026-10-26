/** Ashen Gate Profession Ledger: Refresh (0.33.0). Pure rules; main.js reads Foundry, enforces the GM gate and does the writes.
 * Refresh re-runs Assign for one character and cleans up what Assign (or the starting-recipe and signature-perk grants)
 * put there that no longer applies. It removes only what the module can prove it granted:
 *   - a profession feature or signature perk Item carrying the module's own `grant` flag (flags.<ledger>.grant, written by Assign / the perk grant),
 *   - a known recipe that is a `starting: true` recipe of a profession being removed (the module's own definition of a starting recipe),
 *     or one listed in the Actor's `grantedRecipes` flag,
 * and never anything else (crafted items, gathered materials, gear, hand-added Items). A profession feature with no `grant`
 * flag (added by an older version, or dragged on by hand) is "Can't tell, left alone" unless the GM ticks it.
 * Progress safety rail: a profession with XP, history, chosen perks, crafted items, signature perks or a non-starting known
 * recipe is NOT removed unless the GM ticks "Also remove <profession> progress" for it.
 */
import {startingRecipePlan,recipeProfessionKey} from './assign.mjs';

export const REFRESH_SNAPSHOT_SCHEMA='ag-profession-refresh-snapshot/1';

const hasProgressRow=row=>Boolean(row)&&(Number(row.xp)>0||(row.selectedPerkIds??[]).length>0||(row.history??[]).length>0);

/**
 * input:
 *   qualifying  [{key, profession, reason}]            what the character qualifies for now (assign.mjs qualifications)
 *   defsByKey   Map key -> [{sourceId, name}]          imported Profession Items (Assign's candidates)
 *   held        [{itemId, name, key, sourceId, granted}]   profession features on the sheet (granted: carries the module's grant flag)
 *   perks       [{itemId, name, professionId, granted}]    signature perk Items on the sheet
 *   known       [REC-*], grantedRecipes [REC-*]        the knownRecipes flag, and the recipes the module recorded granting
 *   recipes     catalog recipes (normalized: id, name, professionId, profession, starting)
 *   progress    {professions:{PROF-*:{xp,selectedPerkIds,history}}} | null, progressUnreadable: boolean
 *   crafted     [{itemId, name, recipeId}]             Items on the sheet made by a Ledger craft
 *   perkAdds    [{id, name, professionId, tier}]       signature perks the character's current tiers earn but lacks
 *   unreleased  recipe -> '' | reason                  same rule as the starting-recipe grant
 *   removeProgress Set<key>, alsoRemove Set<itemId>
 */
export function planRefresh(input){
  const {qualifying=[],defsByKey=new Map(),held=[],perks=[],known=[],grantedRecipes=[],recipes=[],progress=null,progressUnreadable=false,crafted=[],
    perkAdds=[],unreleased=()=>'',removeProgress=new Set(),alsoRemove=new Set()}=input;
  const byId=new Map(recipes.map(r=>[r.id,r]));
  const qualifies=new Set(qualifying.map(q=>q.key));
  const idOfKey=key=>defsByKey.get(key)?.[0]?.sourceId??null;
  const keyOfRecipe=r=>recipeProfessionKey(r);
  const profId=h=>h.sourceId??idOfKey(h.key);
  const recipesOf=(key,id)=>known.filter(rid=>{const r=byId.get(rid);return r&&(keyOfRecipe(r)===key||(id&&r.professionId===id));}).map(rid=>byId.get(rid));

  const willRemove=[],willKeep=[],willAdd=[],cantTell=[],blocked=[],notes=[];
  const removedKeys=new Set(),keptKeys=new Set(),keptIds=new Set();

  // 1. Profession features.
  for(const h of held){
    const pid=profId(h);
    if(qualifies.has(h.key)){willKeep.push({kind:'profession',name:h.name,itemId:h.itemId,key:h.key});keptKeys.add(h.key);if(pid)keptIds.add(pid);continue;}
    const optIn=alsoRemove.has(h.itemId);
    if(!h.granted&&!optIn){
      cantTell.push({kind:'profession',name:h.name,itemId:h.itemId,key:h.key,optIn:h.itemId,
        why:'No record that Assign added it (added by hand or by an older version). Left alone unless you tick it.'});
      keptKeys.add(h.key);if(pid)keptIds.add(pid);continue;
    }
    // Progress rail.
    const reasons=[];
    const row=pid?progress?.professions?.[pid]:null;
    if(progressUnreadable)reasons.push('its progress data could not be read');
    if(hasProgressRow(row)){
      const bits=[];if(row.xp>0)bits.push(`${row.xp} XP`);if((row.selectedPerkIds??[]).length)bits.push(`${row.selectedPerkIds.length} chosen perk${row.selectedPerkIds.length===1?'':'s'}`);
      if(!bits.length)bits.push('XP history');reasons.push(bits.join(', '));
    }
    const mine=crafted.filter(c=>{const r=byId.get(c.recipeId);return r&&(keyOfRecipe(r)===h.key||(pid&&r.professionId===pid));});
    if(mine.length)reasons.push(`${mine.length} crafted item${mine.length===1?'':'s'}`);
    const learned=recipesOf(h.key,pid).filter(r=>r.starting!==true);
    if(learned.length)reasons.push(`${learned.length} learned recipe${learned.length===1?'':'s'} beyond the starting ones`);
    const sig=perks.filter(p=>pid&&p.professionId===pid);
    if(sig.length)reasons.push(`${sig.length} signature perk${sig.length===1?'':'s'}`);
    if(reasons.length&&!removeProgress.has(h.key)){
      blocked.push({key:h.key,name:h.name,itemId:h.itemId,profession:h.name,reasons,message:`This character has progress in ${h.name}`});
      willKeep.push({kind:'profession',name:h.name,itemId:h.itemId,key:h.key,note:'has progress, kept'});keptKeys.add(h.key);if(pid)keptIds.add(pid);continue;
    }
    willRemove.push({kind:'profession',name:h.name,itemId:h.itemId,key:h.key,professionId:pid,
      why:h.granted?'Added by Assign, and the character no longer qualifies':'Ticked by you (added before Assign kept a record), and the character no longer qualifies'});
    removedKeys.add(h.key);
  }
  // A profession key can be held twice; it is only gone when every copy goes.
  for(const k of [...removedKeys])if(keptKeys.has(k)){removedKeys.delete(k);for(let i=willRemove.length-1;i>=0;i--)if(willRemove[i].kind==='profession'&&willRemove[i].key===k){willKeep.push({...willRemove[i],note:'another copy is kept'});willRemove.splice(i,1);}}
  const removedIds=new Set(willRemove.filter(r=>r.kind==='profession'&&r.professionId).map(r=>r.professionId));

  // 2. Progress rows, recipes and signature perks of the removed professions.
  const removedRecipes=new Set();
  for(const r of willRemove.filter(x=>x.kind==='profession')){
    const pid=r.professionId;
    for(const rec of recipesOf(r.key,pid)){
      if(keptKeys.has(keyOfRecipe(rec))||keptIds.has(rec.professionId))continue; // shared with a profession that stays
      if(removedRecipes.has(rec.id))continue;
      const starting=rec.starting===true||grantedRecipes.includes(rec.id);
      // A learned (non-starting) recipe only goes with its profession when the GM ticked "Also remove progress".
      if(!starting&&!removeProgress.has(r.key))continue;
      removedRecipes.add(rec.id);
      willRemove.push({kind:'recipe',name:rec.name,recipeId:rec.id,professionKey:r.key,why:starting?`Starting recipe of ${r.name}`:`Learned recipe of ${r.name} (progress)`});
    }
    if(removeProgress.has(r.key)&&pid&&hasProgressRow(progress?.professions?.[pid]))
      willRemove.push({kind:'progress',name:`${r.name} progress`,professionId:pid,why:`${progress.professions[pid].xp} XP and history`});
    for(const p of perks.filter(p=>pid&&p.professionId===pid)){
      if(p.granted&&removeProgress.has(r.key))willRemove.push({kind:'perk',name:p.name,itemId:p.itemId,why:`Signature perk of ${r.name}`});
      else cantTell.push({kind:'perk',name:p.name,itemId:p.itemId,optIn:null,why:`Signature perk of ${r.name}; no record that the Ledger granted it. Left alone.`});
    }
  }
  const removingItems=new Set(willRemove.filter(x=>x.itemId).map(x=>x.itemId));

  // 3. What stays.
  for(const rid of known){
    if(removedRecipes.has(rid))continue;
    const r=byId.get(rid);
    if(!r){cantTell.push({kind:'recipe',name:rid,recipeId:rid,optIn:null,why:'Not in the recipe catalog, so it cannot be tied to a profession. Left alone.'});continue;}
    willKeep.push({kind:'recipe',name:r.name,recipeId:rid});
  }
  for(const p of perks)if(!removingItems.has(p.itemId)&&!cantTell.some(c=>c.itemId===p.itemId))willKeep.push({kind:'perk',name:p.name,itemId:p.itemId});

  // 4. What will be added: professions she now qualifies for, then the starting recipes and perks of what she will hold.
  const finalKeys=new Set(keptKeys),finalIds=new Set(keptIds);
  for(const q of qualifying){
    if(keptKeys.has(q.key))continue;
    const defs=defsByKey.get(q.key)??[];
    if(!defs.length){notes.push(`${q.profession}: no imported Profession Item, so it cannot be added. Import it with General Manager.`);continue;}
    if(defs.length>1){notes.push(`${q.profession}: several imported Profession Items; archive the extra one in General Manager.`);continue;}
    willAdd.push({kind:'profession',name:defs[0].name||q.profession,key:q.key,sourceId:defs[0].sourceId,reason:q.reason});
    finalKeys.add(q.key);finalIds.add(defs[0].sourceId);
  }
  const knownAfter=known.filter(id=>!removedRecipes.has(id));
  const rows=startingRecipePlan([{id:'x'}],recipes,{heldProfessions:()=>({ids:finalIds,keys:finalKeys}),known:()=>knownAfter,unreleased});
  for(const row of rows){
    if(row.status==='new')willAdd.push({kind:'recipe',name:row.recipeName,recipeId:row.recipeId,professionKey:row.professionKey});
    else if(row.status==='unreleased')notes.push(`${row.recipeName}: not granted (${row.reason})`);
  }
  for(const p of perkAdds){
    if(p.professionId&&finalIds.has(p.professionId)&&!removedIds.has(p.professionId))willAdd.push({kind:'perk',name:p.name,perkId:p.id,professionId:p.professionId,tier:p.tier});
  }
  const needsTypedConfirmation=willRemove.some(r=>r.kind==='progress'||(r.kind==='recipe'&&/progress/.test(r.why))||r.kind==='perk');
  return {willAdd,willKeep,willRemove,cantTell,blocked,notes,needsTypedConfirmation,
    counts:{add:willAdd.length,keep:willKeep.length,remove:willRemove.filter(r=>r.kind!=='progress').length,progress:willRemove.filter(r=>r.kind==='progress').length}};
}
