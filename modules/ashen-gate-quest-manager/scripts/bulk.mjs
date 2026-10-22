// 0.15.0 Bulk actions on the GM's selected quests: set status, hide, reveal, duplicate, delete. No Foundry globals:
// planBulk says what would change (for the confirmation), runBulk does it through the store functions it is given,
// one quest at a time, so one refusal never stops the rest. Every store write is GM-checked in store.mjs.
import {STATUSES,validSource} from './core.mjs';
import {statusChip,isPlayerVisible} from './quests-tab.mjs';
export const BULK_ACTIONS=Object.freeze(['status','hide','reveal','duplicate','delete']);
const nameOf=e=>e.source.name||e.source.id;
/** {changes:[{id,name,patch?}], skipped:[{id,name,reason}], willShow:[name], willHide:[name]} */
export function planBulk(action,entries,ids,{status=null}={}){
 if(!BULK_ACTIONS.includes(action))throw new Error(`Unknown bulk action ${action}.`);
 if(action==='status'&&!STATUSES.includes(status))throw new Error('Choose a status first.');
 const want=new Set(ids),out={changes:[],skipped:[],willShow:[],willHide:[]};
 for(const e of entries.filter(x=>want.has(x.source.id))){
  const id=e.source.id,name=nameOf(e),before=isPlayerVisible(e.source,e.state);
  const skip=reason=>out.skipped.push({id,name,reason});
  let patch=null;
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
  out.changes.push(patch?{id,name,patch}:{id,name});
 }
 return out;
}
/** A copy with a new permanent id (<ID>-COPY, -COPY-2, ...), "(copy)" title and draft status. Never its campaign state. */
export function duplicateSource(source,existing=new Set()){
 const base=`${source.id}-COPY`;let id=base,n=2;while(existing.has(id))id=`${base}-${n++}`;
 const copy=structuredClone(source);
 Object.assign(copy,{id,name:`${source.name||source.id} (copy)`,status:'draft'});
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
  duplicate:`Make a draft copy of ${n} ${q} (GM only, Hidden).`,delete:`Delete ${n} ${q}. Their published Quest Log views go; character-owned notes are kept in a GM archive. This cannot be undone.`}[action]];
 if(plan.willShow.length)lines.push(`Players will now see: ${plan.willShow.join(', ')}.`);
 if(plan.willHide.length&&action!=='hide')lines.push(`Players will no longer see: ${plan.willHide.join(', ')}.`);
 const left=plan.skipped.filter(s=>!s.applied);if(left.length)lines.push(`Left as is: ${left.map(s=>`${s.name} (${s.reason})`).join('; ')}`);
 return lines.join('\n');
}
