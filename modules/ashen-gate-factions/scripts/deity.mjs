/** Pantheon: deities are Renown entries with entity_type 'Deity'. Pure JS, no Foundry runtime.
 * A deity reuses the faction model (discovery, information entries, rank ladder, rewards, claims) with
 * per-character standing only: its `individual_track` is the deity's own rank ladder and it has no group score.
 * Internally a deity also carries the faction-only keys (leader, public_role, folder_key, renown_track) so shared
 * code paths keep working; sourceDefinition strips them, and they are never shown or scored.
 */
export const DEITY_TIERS=Object.freeze(['major','lesser']);
/** Cross-deity effects (approved by Robb, 2026-10-20). Each relation is one direction, A -> B, with a
 * `resonance` slider value 0..1: 0 = full Dissonance, 0.5 = neutral, 1 = full Resonance. Only GAINS with A spread:
 * B changes by gain x factor x damping, factor = (resonance - 0.5) x 2 in [-1, 1], damping a GM world setting
 * (default 0.5, always below 1, so B never moves by the full amount). Positive results round down, negative ones
 * round away from zero (a dissonant loss is ceil). Knock-ons never chain. The GM confirms each one. */
export const RESONANCE_NEUTRAL=0.5;
export const DAMPING_DEFAULT=0.5;
export const DAMPING_MAX=0.95;
export const validResonance=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
export const validDamping=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=DAMPING_MAX;
export const resonanceFactor=v=>validResonance(v)?(v-RESONANCE_NEUTRAL)*2:0;
export const relationLabel=v=>v<RESONANCE_NEUTRAL?'Dissonance':v>RESONANCE_NEUTRAL?'Resonance':'Neutral';
export function knockOnDelta(gain,resonance,damping=DAMPING_DEFAULT){
  if(!Number.isSafeInteger(gain)||gain<=0||!validDamping(damping))return 0;
  // Round away float noise first: (0.7 - 0.5) x 2 is 0.3999…, which must count as 0.4.
  const raw=Math.round(gain*resonanceFactor(resonance)*damping*1e6)/1e6;
  return raw>0?Math.floor(raw):raw<0?-Math.ceil(-raw):0;
}
/** The knock-ons a gain with `deity` would cause, one per relation with a nonzero effect. Pure; nothing is applied. */
export function knockOns(deity,gain,damping,names=new Map()){
  return (deity?.deity?.relations??[]).map(r=>({deity_id:r.deity_id,name:names.get(r.deity_id)??r.deity_id,resonance:r.resonance,label:relationLabel(r.resonance),delta:knockOnDelta(gain,r.resonance,damping)})).filter(k=>k.delta!==0);
}
/** "gain 10 -> +3" for the GM slider preview. */
export const resonancePreview=(resonance,damping,sample=10)=>{const d=knockOnDelta(sample,resonance,damping);return `gain ${sample} → ${d>0?'+':''}${d}`;};
export const DEITY_ID=/^DEITY-[A-Z0-9-]+$/;
export const DEITY_TEXT_KEYS=Object.freeze(['title','domain','blurb','portfolio','teachings','followers','practices']);
export const DEITY_KEYS=Object.freeze(['symbol',...DEITY_TEXT_KEYS,'tier','saying','relations']);
// Neutral rank placeholders; the GM or the import file names each deity's own ladder.
export const DEITY_RANKS=Object.freeze([['Rank I',0],['Rank II',3],['Rank III',6],['Rank IV',10],['Rank V',15]]);
export const isDeity=f=>f?.entity_type==='Deity';

export function blankDeityProfile(){return {symbol:'',title:'',domain:'',tier:'major',blurb:'',portfolio:'',teachings:'',followers:'',practices:'',saying:{text:'',attribution:''},relations:[]};}
/** Fills defaults; keeps unknown keys so the closed source check can reject them instead of silently dropping data. */
export function deityProfile(input){
  const x=input&&typeof input==='object'&&!Array.isArray(input)?structuredClone(input):{};
  const out={...blankDeityProfile(),...x};
  out.saying={text:'',attribution:'',...(x.saying&&typeof x.saying==='object'?x.saying:{})};
  out.relations=Array.isArray(x.relations)?x.relations.map(r=>({...r})):[];
  return out;
}
const track=(id,ladder)=>({id,entity_type:'RenownTrack',status:'draft',version:'0.3.0',provenance:{sources:['Pantheon default ladder'],decision_refs:[]},visibility:'player',refs:[],default_scope:'individual',
  milestones:ladder.map(([name,threshold],i)=>({id:`${id}-M${i+1}`,key:`milestone_${i+1}`,name,threshold,benefit:'',selection_mode:'all'}))});
/** The internal-only group track a deity carries so shared code keeps one shape. Never shown, scored or exported. */
export const unusedGroupTrack=individual=>({...structuredClone(individual),id:`${individual.id}-GROUP`,default_scope:'group'});
export function makeDeity({id,trackId,name,source='New GM draft'}){
  if(!DEITY_ID.test(id??'')||!/^RENOWN-[A-Z0-9-]+$/.test(trackId??''))throw Error('Deity and Renown IDs required.');
  const individual=track(trackId,DEITY_RANKS);individual.refs=[{relation:'for_faction',target_id:id,mode:'required'}];
  return {id,entity_type:'Deity',status:'draft',version:'0.3.0',provenance:{sources:[source],decision_refs:[]},visibility:'reveal_gated',refs:[],
    name,leader:'',public_role:'',folder_key:'',tags:[],discovery:{party:false,actors:[],placeholder:false,sharing_enabled:true},
    entries:[],renown_track:unusedGroupTrack(individual),individual_track:individual,rewards:[],deity:blankDeityProfile()};
}
/** Errors specific to a deity record (after upgrade). Shared checks (ladder, rewards, entries) run in validateFaction. */
export function validateDeityParts(f){
  const e=[];if(!isDeity(f))return e;
  if(!DEITY_ID.test(f.id??''))e.push('Deity id must look like DEITY-NAME.');
  const d=f.deity;
  if(!d||typeof d!=='object')return [...e,'Deity profile missing.'];
  if(typeof d.symbol!=='string'||d.symbol.length>500||/^\s*(javascript|data|vbscript):/i.test(d.symbol))e.push('Deity symbol must be an image path (500 characters max).');
  for(const k of DEITY_TEXT_KEYS)if(typeof d[k]!=='string'||d[k].length>4000)e.push(`Deity ${k} must be text (4000 characters max).`);
  if(!DEITY_TIERS.includes(d.tier))e.push('Deity tier must be major or lesser.');
  if(!d.saying||typeof d.saying.text!=='string'||typeof d.saying.attribution!=='string')e.push('Deity saying needs text and attribution strings.');
  const seen=new Set();
  for(const r of d.relations??[]){
    if(!DEITY_ID.test(r?.deity_id??'')||r.deity_id===f.id)e.push('Deity relation needs another DEITY- id.');
    else if(seen.has(r.deity_id))e.push(`Duplicate relation to ${r.deity_id}.`);
    seen.add(r?.deity_id);
    if(!validResonance(r?.resonance))e.push('Deity relation resonance must be a number from 0 (Dissonance) to 1 (Resonance).');
  }
  if(f.rewards.some(r=>r.audience!=='individual'))e.push('Deity rewards are per character only (audience individual).');
  if(f.entries.some(x=>x.unlock==='group_renown'))e.push('Deity information cannot unlock by group Renown.');
  return e;
}
/** Player-safe relation list: only relations to deities this viewer may already see. */
export function visibleRelations(deity,visibleNames){
  return (deity.deity?.relations??[]).filter(r=>visibleNames.has(r.deity_id)).map(r=>{const label=relationLabel(r.resonance);return{deity_id:r.deity_id,name:visibleNames.get(r.deity_id),label,isDissonant:label==='Dissonance',isResonant:label==='Resonance'};});
}
/** Player-safe favour history: an entry caused by, or undoing one caused by, a deity this viewer cannot see
 * does not name it. Ids of unseen deities are dropped. */
export function visibleHistory(events,visibleNames){
  return (events??[]).map(e=>{if(!e.source_deity||visibleNames.has(e.source_deity))return e;const {source_deity,...rest}=e;return{...rest,reason:e.reverses?'Undo: favour shifted through a related deity':'Favour shifted through a related deity'};});
}
/** The player card: profile fields only, never discovery settings, tags or GM provenance. */
export function deityCard(f){
  // Definitions nest the profile under `deity`; player projections are already flat cards.
  const d=deityProfile(f.deity??f);
  return {id:f.id,name:f.name,symbol:d.symbol,title:d.title,domain:d.domain,tier:d.tier,tierLabel:d.tier==='lesser'?'Lesser':'Major',blurb:d.blurb,portfolio:d.portfolio,teachings:d.teachings,followers:d.followers,practices:d.practices,saying:{text:d.saying.text,attribution:d.saying.attribution}};
}
/** A character's standing with each deity in a list of definitions (GM) or projected cards (player). Pure: callers pass
 * only deities the viewer may see, plus `standingFor(deity)` -> {score, rank, next, remaining, percent} or null. */
export function pantheonRows(list,standingFor){
  return list.map(x=>{const s=standingFor(x);if(!s)return null;const c=deityCard(x);
    return{id:c.id,name:c.name,symbol:c.symbol,title:c.title,domain:c.domain,tier:c.tier,tierLabel:c.tierLabel,score:s.score,rank:s.rank,next:s.next??null,remaining:s.remaining??0,percent:s.percent??100};
  }).filter(Boolean).sort((a,b)=>DEITY_TIERS.indexOf(a.tier)-DEITY_TIERS.indexOf(b.tier)||a.name.localeCompare(b.name));
}
