/** Ashen Gate Profession Ledger: the gather round (0.34.0). No Foundry globals are read here.
 * There is no lead gatherer. The GM picks which gathering professions may roll, which tier(s) and the DC. Every party
 * character who holds one of those professions rolls once with their own check. The Ledger then settles every drop
 * BEFORE any animation, from the rules that already existed:
 *  - total < DC: nothing. Total ≥ DC: a Common material. Total ≥ DC + 5 (RARE_MARGIN): a Rare one instead; a pool with
 *    no Rare material gives its Common one (the old "no rare material" rule).
 *  - A success may also find one Exotic (resolveExotic in exotic.mjs: only configured/eligible candidates, the d100 chance).
 *  - A saved node (Location or template) draws from its own Common/Rare tables, as before. An ad-hoc round draws from the
 *    imported Materials of the chosen professions and tiers, by their quality.
 *  - Each successful player gets a different material while the pool has more to give (no repeat until it runs out).
 * When a success has nothing to draw from, the row is "undetermined" and the GM hands it out by hand. */
import {norm} from './core.mjs';
import {professionKey} from './checks.mjs';
import {GATHERING_KEYS,professionKeyFromId,materialProfessionKeys,resolveExotic,normalizeExotics} from './exotic.mjs';
import {gatherOutcome,pickTableEntry,tierNumber,defaultDC} from './gathering.mjs';
import {TIERS} from './progression.mjs';

/** Old callers passed a lead gatherer and helpers; a round has neither. */
export function stripLead(options){
  const {leadId,helperIds,lead,helpers,...rest}=options&&typeof options==='object'?options:{};
  return rest;
}
/** Gathering profession keys from names, keys, PROF-* ids or a mix. Anything else is dropped. */
export function selectionKeys(list){
  const out=[];
  for(const raw of Array.isArray(list)?list:[list]){
    if(raw==null||raw==='')continue;
    const key=professionKeyFromId(raw)??professionKey(String(raw));
    if(GATHERING_KEYS.includes(key)&&!out.includes(key))out.push(key);
  }
  return out;
}
/** Tier numbers 1–5, sorted, from an array of numbers/names or a {min,max} range. */
export function selectionTiers(value){
  const list=value&&!Array.isArray(value)&&typeof value==='object'&&('min' in value||'max' in value)
    ?Array.from({length:Math.max(0,(tierNumber(value.max)??0)-(tierNumber(value.min)??1)+1)},(_,i)=>(tierNumber(value.min)??1)+i)
    :(Array.isArray(value)?value:[value]);
  return [...new Set(list.map(tierNumber).filter(n=>n!=null))].sort((a,b)=>a-b);
}
export const tiersText=tiers=>{
  const t=selectionTiers(tiers);if(!t.length)return '';
  const runs=[];for(const n of t){const last=runs.at(-1);if(last&&n===last[1]+1)last[1]=n;else runs.push([n,n]);}
  return runs.map(([a,b])=>a===b?`Tier ${a}`:`Tiers ${a}–${b}`).join(', ');
};
/** The DC for a round: the one given, else the default of the highest chosen tier. */
export function roundDC(dc,tiers){
  const n=Number(dc);
  if(dc!==''&&dc!=null&&Number.isSafeInteger(n)&&n>=1&&n<=40)return n;
  const top=selectionTiers(tiers).at(-1);
  return top?defaultDC(top):null;
}

/** Who may roll: party characters holding at least one chosen profession. `keysOf(actor)` gives the profession keys they hold.
 * A holder of several chosen professions rolls with the first one in the GM's order. */
export function eligibleRollers(actors,professions,keysOf){
  const wanted=selectionKeys(professions),out=[];
  for(const actor of actors??[]){
    const held=new Set(keysOf(actor)??[]);
    const key=wanted.find(k=>held.has(k));
    if(key)out.push({actor,professionKey:key});
  }
  return out;
}

const entry=(materialId,quantity=1,chance=null)=>({materialId,quantity,chance});
/** A saved node's own Common and Rare tables. */
export function nodePool(node){
  const common=node?.tables?.common?.length?node.tables.common.map(e=>entry(e.materialId,e.quantity,e.chance))
    :node?.materialId?[entry(node.materialId,node.quantity)]:[];
  const rare=node?.tables?.rare?.length?node.tables.rare.map(e=>entry(e.materialId,e.quantity,e.chance))
    :node?.rareMaterialId?[entry(node.rareMaterialId,node.rareQuantity)]:[];
  return {common,rare};
}
/** An ad-hoc round's pool: imported Materials gathered by a chosen profession, in a chosen tier, by quality.
 * `catalog` rows are materialMeta-like ({id,name,quality,tier,professionIds}); `usable(row)` says whether the Ledger may give it
 * (released, or a draft the GM allowed). Exotics are returned as discovery candidates, not as a table. */
export function catalogPool(catalog,{professions,tiers,usable=()=>true,keyOf=professionKeyFromId}={}){
  const wanted=selectionKeys(professions),tierSet=new Set(selectionTiers(tiers));
  const rows=(catalog??[]).filter(m=>m&&m.tier!=null&&tierSet.has(m.tier)&&usable(m)
    &&materialProfessionKeys(m,keyOf).some(k=>wanted.includes(k))).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const of=q=>rows.filter(m=>norm(m.quality)===q);
  return {common:of('common').map(m=>entry(m.id)),rare:of('rare').map(m=>entry(m.id)),
    exotics:normalizeExotics(of('exotic').map(m=>({materialId:m.id,mode:'discovery'})))};
}

/**
 * Settle a round. `rolls`: [{actorId, actorName, total}] in the order they rolled; nothing here reads an animation.
 * Returns {rows, skipped}; a row is {actorId, actorName, total, dc, margin, result:'fail'|'common'|'rare', drops:[{materialId,quantity,kind}],
 * undetermined:[kind], noRareFallback, mayReceive:['Common'|'Rare'|'Exotic'], exotic:{kind,roll,target}}.
 * `roll(faces)` is injected so tests are deterministic. `exoticNode` = {professions, tier, exotics} for resolveExotic.
 */
export function planRound({pool,exoticNode=null,rolls,dc,roll,percent,metaOf,keyOf}){
  const used=new Set(),usedExotic=new Set(),skipped=[],rows=[];
  const draw=kind=>{
    const table=pool?.[kind]??[];if(!table.length)return null;
    const fresh=table.filter(e=>!used.has(e.materialId));
    const pick=pickTableEntry(fresh.length?fresh:table,roll).entry;   // repeats only once the pool has been given out
    used.add(pick.materialId);return pick;
  };
  for(const r of rolls??[]){
    const outcome=gatherOutcome(r.total,dc);
    const row={actorId:r.actorId,actorName:r.actorName,total:outcome.total,dc:outcome.dc,margin:outcome.margin,result:outcome.result,drops:[],undetermined:[],
      noRareFallback:false,mayReceive:[],exotic:{kind:'none',roll:null,target:null}};
    if(outcome.result!=='fail'){
      let kind=outcome.result;
      if(kind==='rare'&&!(pool?.rare??[]).length){kind='common';row.noRareFallback=true;}
      row.mayReceive.push(kind==='rare'?'Rare':'Common');
      const e=draw(kind);
      if(e)row.drops.push({materialId:e.materialId,quantity:e.quantity,kind});else row.undetermined.push(kind);
      if(exoticNode?.exotics?.length){
        const free=exoticNode.exotics.filter(x=>!usedExotic.has(x.materialId));
        const x=resolveExotic({node:{...exoticNode,exotics:free.length?free:exoticNode.exotics},outcome,percent,roll,metaOf,keyOf});
        row.exotic={kind:x.kind,roll:x.roll,target:x.target};
        skipped.push(...x.skipped);
        if(x.materialId){usedExotic.add(x.materialId);row.drops.push({materialId:x.materialId,quantity:1,kind:'exotic'});row.mayReceive.push('Exotic');}
      }
    }
    rows.push(row);
  }
  return {rows,skipped};
}
/** Does the round need the GM to hand something out? */
export const needsManual=rows=>rows.some(r=>r.undetermined.length>0);
/** The best outcome of the round, for exhausting a spot: 'rare' | 'common' | 'fail'. */
export const bestResult=rows=>rows.some(r=>r.result==='rare')?'rare':rows.some(r=>r.result==='common')?'common':'fail';

/** Tier numbers offered in the setup form. */
export const TIER_CHOICES=Object.freeze(TIERS.map((name,i)=>({n:i+1,name})));
