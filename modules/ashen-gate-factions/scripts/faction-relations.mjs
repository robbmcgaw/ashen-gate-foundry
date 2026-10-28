/** Faction-to-faction relations (0.22.0). Pure JS, no Foundry runtime.
 * Same model and maths as the Pantheon (deity.mjs): a Faction may carry an optional
 * `relations: [{faction_id, resonance}]`. One direction (A -> B). `resonance` runs 0..1: below 0.5 is Dissonance (a
 * rival: B loses Renown when the character gains it with A), 0.5 is neutral, above 0.5 is Resonance (an ally: B gains).
 * Only a GAIN in a character's PERSONAL Renown with A spreads; group Renown never does. Knock-ons use the same
 * rounding as deities, a world damping setting of their own (`factionDamping`), never chain, and the GM confirms each.
 * The field is optional: a faction without it behaves exactly as before and its stored definition is not rewritten.
 */
import {knockOnDelta,relationLabel,validResonance} from './deity.mjs';
export const FACTION_ID=/^FACTION-[A-Z0-9-]+$/;
export const factionRelations=f=>Array.isArray(f?.relations)?f.relations:[];
/** Errors for a Faction's `relations` (empty when absent). */
export function validateFactionRelations(f){
  if(f?.relations===undefined)return [];
  if(!Array.isArray(f.relations))return ['Faction relations must be a list.'];
  const e=[],seen=new Set();
  for(const r of f.relations){
    if(!r||typeof r!=='object'||Array.isArray(r)){e.push('Faction relation must be an object.');continue;}
    if(!FACTION_ID.test(r.faction_id??'')||r.faction_id===f.id)e.push('Faction relation needs another faction.');
    else if(seen.has(r.faction_id))e.push('Duplicate relation to the same faction.');
    seen.add(r.faction_id);
    if(!validResonance(r.resonance))e.push('Faction relation resonance must be a number from 0 (Dissonance) to 1 (Resonance).');
  }
  return e;
}
/** The knock-ons a PERSONAL gain with `faction` would cause, one per relation with a nonzero effect. Pure; nothing is applied. */
export function factionKnockOns(faction,gain,damping,names=new Map()){
  return factionRelations(faction).map(r=>({faction_id:r.faction_id,name:names.get(r.faction_id)??'Unknown faction',resonance:r.resonance,label:relationLabel(r.resonance),delta:knockOnDelta(gain,r.resonance,damping)})).filter(k=>k.delta!==0);
}
/** Player-safe relation list: only relations to factions this viewer already knows (name shown to them). */
export function visibleFactionRelations(faction,visibleNames){
  return factionRelations(faction).filter(r=>visibleNames.has(r.faction_id)).map(r=>{const label=relationLabel(r.resonance);return{faction_id:r.faction_id,name:visibleNames.get(r.faction_id),label,isDissonant:label==='Dissonance',isResonant:label==='Resonance'};});
}
/** Player-safe personal history: an entry caused by, or undoing one caused by, a faction this viewer cannot see does
 * not name it. The source id is dropped and the line is replaced. */
export function visibleFactionHistory(events,visibleNames){
  return (events??[]).map(e=>{if(!e.source_faction||visibleNames.has(e.source_faction))return e;const {source_faction,...rest}=e;return{...rest,reason:e.reverses?'Undo: Renown shifted through a related faction':'Renown shifted through a related faction'};});
}
