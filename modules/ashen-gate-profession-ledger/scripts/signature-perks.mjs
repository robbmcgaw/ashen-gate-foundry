/** Signature perks (0.31.0): a ProfessionPerk record with `signature: true`, a `tier` and a `profession_id` is granted
 * automatically when a character reaches that tier in the profession. Pure rules only; main.js does the world and Actor work. */
import {ACCESS_LEVELS} from './progression.mjs';
export const SIGNATURE_TIERS=Object.freeze(['journeyman','expert']);
const TIER_NAMES=Object.freeze({journeyman:'Journeyman',expert:'Expert'});
export const signatureTierName=tier=>TIER_NAMES[tier]??String(tier??'');
/** Profession level at which a signature tier is reached (Journeyman 4, Expert 7). */
export const signatureTierLevel=tier=>TIER_NAMES[tier]?ACCESS_LEVELS[TIER_NAMES[tier]]:null;
const PROF_ID=/^PROF-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
/** The signature facts of a Manager source definition, or null when it is not a usable signature perk
 * ({id, name, professionId, tier, level}): `signature` must be exactly true, the tier one of SIGNATURE_TIERS, the profession a PROF-* id. */
export function signatureOf(definition){
  const d=definition;
  if(!d||typeof d!=='object'||d.entity_type!=='ProfessionPerk'||d.signature!==true)return null;
  const tier=String(d.tier??'').trim().toLowerCase();
  if(!SIGNATURE_TIERS.includes(tier)||!PROF_ID.test(String(d.profession_id??'')))return null;
  return {id:d.id,name:String(d.name??d.id),professionId:d.profession_id,tier,level:signatureTierLevel(tier)};
}
/** Tiers whose level a change crosses upward (previous below it, new at or above it), lowest first. Handles multi-level jumps. */
export function tiersCrossed(previousLevel,level){
  const a=Number(previousLevel),b=Number(level);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return [];
  return SIGNATURE_TIERS.filter(t=>a<signatureTierLevel(t)&&b>=signatureTierLevel(t));
}
/**
 * Dry-run rows for the catch-up grant: every signature perk whose profession a character holds at a level that reaches its tier.
 * `professions(actor)` → [{id, name, level}]; `holds(actor, perkId)`; `unreleased(perk)` → '' or why it is not granted.
 * status: 'new' (will grant), 'held' (already owned), 'unreleased'. Rows are plain data.
 */
export function signaturePlan(actors,perks,{professions,holds,unreleased}){
  const order=[...perks].sort((a,b)=>SIGNATURE_TIERS.indexOf(a.tier)-SIGNATURE_TIERS.indexOf(b.tier)||String(a.name).localeCompare(String(b.name)));
  const rows=[];
  for(const actor of actors){
    const held=new Map(professions(actor).map(p=>[p.id,p]));
    for(const p of order){
      const prof=held.get(p.professionId);
      if(!prof||prof.level<p.level)continue;
      const base={id:`${actor.id}:${p.id}`,actorId:actor.id,actorName:actor.name,perkId:p.id,perkName:p.name,professionId:p.professionId,
        profession:prof.name,tier:signatureTierName(p.tier),level:p.level};
      if(holds(actor,p.id))rows.push({...base,status:'held',reason:''});
      else{const why=unreleased(p);rows.push({...base,status:why?'unreleased':'new',reason:why||''});}
    }
  }
  return rows;
}
