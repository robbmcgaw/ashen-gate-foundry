// 0.15.0 Bulk actions on the GM's selected quests: set status, hide, reveal, duplicate, delete. No Foundry globals:
// planBulk says what would change (for the confirmation), runBulk does it through the store functions it is given,
// one quest at a time, so one refusal never stops the rest. Every store write is GM-checked in store.mjs.
import {STATUSES,validSource,exportPackage} from './core.mjs';
import {statusChip,isPlayerVisible,UNTITLED} from './quests-tab.mjs';
// 0.29.0 adds archive (reversible: the quest keeps its status, progress and notes, and players lose it) and restore.
export const BULK_ACTIONS=Object.freeze(['status','hide','reveal','duplicate','delete','archive','restore']);
const nameOf=e=>e.source.name||UNTITLED;
/** {changes:[{id,name,patch?}], skipped:[{id,name,reason}], willShow:[name], willHide:[name]} */
export function planBulk(action,entries,ids,{status=null,assignments=()=>0}={}){
 if(!BULK_ACTIONS.includes(action))throw new Error(`Unknown bulk action ${action}.`);
 if(action==='status'&&!STATUSES.includes(status))throw new Error('Choose a status first.');
 const want=new Set(ids),out={changes:[],skipped:[],willShow:[],willHide:[]};
 for(const e of entries.filter(x=>want.has(x.source.id))){
  const id=e.source.id,name=nameOf(e),before=isPlayerVisible(e.source,e.state);
  const skip=reason=>out.skipped.push({id,name,reason});
  let patch=null;
  if(action==='archive'){
   if(e.state.archived===true){skip('Already archived.');continue;}
   patch={archived:true,archivedAt:new Date().toISOString()};
  }
  if(action==='restore'){
   if(e.state.archived!==true){skip('Not archived.');continue;}
   patch={archived:false,archivedAt:null};
  }
  if(action==='delete'&&assignments(id)>0){skip(`Has ${assignments(id)} ${assignments(id)===1?'assignment':'assignments'}: remove ${assignments(id)===1?'it':'them'} first.`);continue;}
  if(!['archive','restore','delete'].includes(action)&&e.state.archived===true){skip('Archived: restore it first.');continue;}
  if(action==='status'){if(e.state.status===status){skip(`Already ${status}.`);continue;}patch={status};}
  if(action==='hide'){
   if(!before){skip('Already GM only.');continue;}
   // Taking the reveal back is enough for reveal-gated quests; a player-visible definition also needs Hidden.
   patch={revealed:false};if(isPlayerVisible(e.source,{...e.state,...patch}))patch.status='Hidden';
  }
  if(action==='reveal'){
   // Drafts stay GM only: a bulk reveal never publishes one. Give it a status in its editor first.
   if(statusChip(e.source,e.state)==='Draft'){skip('Draft: drafts stay GM only. Give it a status first.');continue;}
   if(e.source.visibility==='gm'){skip('GM-only definition: change Definition visibility first.');continue;}
   if(e.state.revealed){skip(before?'Already visible to players.':`Already revealed; stays GM only while ${e.state.status}.`);continue;}
   patch={revealed:true};
   if(!isPlayerVisible(e.source,{...e.state,...patch}))out.skipped.push({id,name,reason:`Revealed, but stays GM only while ${e.state.status}.`,applied:true});
  }
  if(patch){const after=isPlayerVisible(e.source,{...e.state,...patch});if(!before&&after)out.willShow.push(name);if(before&&!after)out.willHide.push(name);}
  if(action==='delete'&&before)out.willHide.push(name);
  out.changes.push(patch?{id,name,patch}:{id,name});
 }
 return out;
}
/** A copy with a new permanent id (<ID>-COPY, -COPY-2, ...), "(copy)" title and draft status. Never its campaign state. */
export function duplicateSource(source,existing=new Set()){
 const base=`${source.id}-COPY`;let id=base,n=2;while(existing.has(id))id=`${base}-${n++}`;
 const copy=structuredClone(source);
 Object.assign(copy,{id,name:`${source.name||UNTITLED} (copy)`,status:'draft'});
 return validSource(copy);
}
/** Runs a plan. deps: {updateState, saveRecord, removeRecord, existingIds:Set, sourceOf(id)}. Returns {done:[{id,name,newId?}], failed:[{id,name,reason}]}. */
export async function runBulk(action,plan,deps){
 const done=[],failed=[],existing=new Set(deps.existingIds??[]);
 for(const c of plan.changes){
  try{
   if(action==='delete')await deps.removeRecord(c.id);
   else if(action==='duplicate'){const copy=duplicateSource(deps.sourceOf(c.id),existing);existing.add(copy.id);await deps.saveRecord(copy);done.push({id:c.id,name:c.name,newId:copy.id});continue;}
   else await deps.updateState(c.id,c.patch);
   done.push({id:c.id,name:c.name});
  }catch(err){failed.push({id:c.id,name:c.name,reason:String(err?.message??err)});}
 }
 return {done,failed};
}
/** Confirmation text: what happens, who will newly see what, and what is left alone. */
export function confirmText(action,plan,{status=null}={}){
 const n=plan.changes.length,q=n===1?'quest':'quests';
 const lines=[{status:`Set ${n} ${q} to ${status}.`,hide:`Hide ${n} ${q} from players.`,reveal:`Reveal ${n} ${q} to their audience.`,
  duplicate:`Make a draft copy of ${n} ${q} (GM only, Hidden).`,delete:`Delete ${n} ${q} for good. Their published Quest Log views go; character-owned notes are kept in a GM archive. A backup file of exactly these quests downloads first; Import JSON brings the definitions back. Links to them from Locations and other modules are ignored afterwards, not errors. This cannot be undone.`,
  archive:`Archive ${n} ${q}. They leave the Quests list and players lose them, as if Hidden. Status, progress, notes and rewards are kept, and Restore brings them back exactly as they were.`,
  restore:`Restore ${n} ${q} with the status they had. Players see each one again only if it was revealed and not Hidden.`}[action]];
 if(action==='delete'||action==='archive'||action==='restore')lines.push(`Affected: ${plan.changes.map(c=>c.name).join(', ')}.`);
 if(plan.willShow.length)lines.push(`Players will now see: ${plan.willShow.join(', ')}.`);
 if(plan.willHide.length&&action!=='hide')lines.push(`Players will no longer see: ${plan.willHide.join(', ')}.`);
 const left=plan.skipped.filter(s=>!s.applied);if(left.length)lines.push(`Left as is: ${left.map(s=>`${s.name} (${s.reason})`).join('; ')}`);
 return lines.join('\n');
}

/** The backup the window downloads before a bulk Delete: the same package Export JSON writes, for exactly these quests, plus their
 *  play state under `states` (status, progress, notes) for reference. Import JSON reads the definitions; a quest comes back Hidden. */
export function backupPackage(entries,ids){
 const want=new Set(ids),rows=entries.filter(e=>want.has(e.source.id));
 return {...exportPackage(rows.map(e=>e.source)),states:Object.fromEntries(rows.map(e=>[e.source.id,structuredClone(e.state)]))};
}
