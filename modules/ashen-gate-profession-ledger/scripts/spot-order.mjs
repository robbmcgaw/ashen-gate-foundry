/** Ashen Gate Profession Ledger: the order gathering spots are listed in (0.37.0). Pure. Every spot picker (Gather: Location spot and Node template,
 * the Gathering nodes list, a player's request list) sorts and labels with these, so the order and the tier shown can never disagree.
 * Order: tier ascending (a range sorts by its lowest tier, then its highest; no tier last), then activity/profession, then name. */
import {TIERS} from './progression.mjs';
import {tierNumber} from './gathering.mjs';

/** {min,max} from a spot's tier: a number or tier name (a Location spot), or a {min,max} range (a node template). null when it has none. */
export function spotRange(tier){
  if(tier&&typeof tier==='object'){
    const min=tierNumber(tier.min),max=tierNumber(tier.max)??min;
    return min==null?null:{min,max:Math.max(min,max)};
  }
  const n=tierNumber(tier);
  return n==null?null:{min:n,max:n};
}
/** "Tier 1", "Tier 1–2", or '' for no tier. */
export const tierText=range=>!range?'':range.min===range.max?`Tier ${range.min}`:`Tier ${range.min}–${range.max}`;
/** Comparator for {range, activity, name}. */
export function compareSpots(a,b){
  const ra=a.range,rb=b.range;
  if(!ra!==!rb)return ra?-1:1;
  if(ra&&rb&&(ra.min!==rb.min||ra.max!==rb.max))return ra.min-rb.min||ra.max-rb.max;
  return String(a.activity??'').localeCompare(String(b.activity??''))||String(a.name??'').localeCompare(String(b.name??''));
}
/** "Tier 1–2 · Herbalism · Reedbed Ford": the label of an option or row. Empty parts are left out. */
export const spotLabel=({range,activity,name})=>[tierText(range),activity,name].filter(Boolean).join(' · ');
/** The heading a spot sits under: its lowest tier, {order, label:'Tier 1 · Apprentice'}, or {order:99, label:'No tier'}. */
export const tierHeading=range=>range?{order:range.min,label:`Tier ${range.min} · ${TIERS[range.min-1]}`}:{order:99,label:'No tier'};
/** Groups sorted spots under tier headings by their lowest tier: [{order, label, items}]. `items` are {range,...}. */
export function groupByTier(items){
  const sorted=[...items].sort(compareSpots),groups=new Map();
  for(const it of sorted){
    const h=tierHeading(it.range);
    if(!groups.has(h.order))groups.set(h.order,{...h,items:[]});
    groups.get(h.order).items.push(it);
  }
  return [...groups.values()];
}
