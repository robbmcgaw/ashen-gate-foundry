// 0.29.0 GM-only API for bulk Archive / Restore / Delete (api.previewBulk, archiveQuests, restoreQuests, deleteQuests, idsWithPrefix,
// countArchived). No Foundry globals: main.mjs hands in the store calls. Every method checks the GM first, so a player's call is
// refused here and nothing is read or written. The Quests tab uses the same functions through its window.
import {planBulk,runBulk,backupPackage} from './bulk.mjs';
import {idPrefixOf} from './quests-tab.mjs';

/** deps: {assertGM(), entries() -> [{source,state}], updateState(id,patch), removeRecord(id), assignmentCount(id) -> n}. */
export function createBulkApi(deps){
 const idList=ids=>{if(!Array.isArray(ids)||ids.some(i=>typeof i!=='string'))throw new TypeError('ids must be a list of quest ids.');return [...new Set(ids)];};
 const summary=(action,ids)=>{
  const entries=deps.entries(),known=new Set(entries.map(e=>e.source.id)),want=idList(ids);
  const plan=planBulk(action,entries,want.filter(id=>known.has(id)),{assignments:deps.assignmentCount});
  return {entries,plan,unknown:want.filter(id=>!known.has(id))};
 };
 const out=(plan,unknown)=>({action:undefined,changes:plan.changes.map(c=>({id:c.id,name:c.name})),skipped:[...plan.skipped.map(s=>({id:s.id,name:s.name,reason:s.reason})),...unknown.map(id=>({id,name:'',reason:'No such quest.'}))],
  willShow:plan.willShow,willHide:plan.willHide});
 // Manager 0.75.0 hands off with archiveQuests(ids, {source}) / restoreQuests(ids, {source}); the shape is the same for every caller.
 const shape=(action,r)=>{const key=action==='archive'?'archived':'restored',already=action==='archive'?r.skipped.filter(s=>s.reason==='Already archived.'):[];
  return {...r,[key]:r.done,...(action==='archive'?{alreadyArchived:already.map(s=>s.id)}:{}),
   skipped:[...r.skipped.filter(s=>!already.includes(s)).map(({id,reason})=>({id,reason})),...r.failed.map(f=>({id:f.id,reason:f.reason}))]};};
 const run=async(action,ids)=>{
  deps.assertGM();
  const {plan,unknown}=summary(action,ids);
  const res=await runBulk(action,plan,{updateState:deps.updateState,removeRecord:deps.removeRecord,saveRecord:async()=>{},existingIds:[],sourceOf:()=>null});
  return {...out(plan,unknown),done:res.done.map(d=>d.id),failed:res.failed};
 };
 return {
  /** Writes nothing: what the action would change, skip and show or hide. */
  previewBulk(action,ids){deps.assertGM();if(!['archive','restore','delete'].includes(action))throw new Error(`Unknown bulk action "${action}".`);const {plan,unknown}=summary(action,ids);return {...out(plan,unknown),action};},
  /** Archive: off the list and away from players; status, progress, notes and rewards are kept. */
  archiveQuests:async(ids,options)=>shape('archive',await run('archive',ids,options)),
  restoreQuests:async(ids,options)=>shape('restore',await run('restore',ids,options)),
  /** Permanent. Returns {done, failed, skipped, backup}: `backup` is the definitions of the quests deleted (Import JSON reads it) with their play state under `states`. */
  async deleteQuests(ids){
   deps.assertGM();
   const {entries,plan}=summary('delete',ids);
   const backup=backupPackage(entries,plan.changes.map(c=>c.id));
   const r=await run('delete',ids);
   return {...r,backup:{...backup,records:backup.records.filter(x=>r.done.includes(x.id))}};
  },
  idsWithPrefix(prefix,{archived=false}={}){
   deps.assertGM();const p=idPrefixOf(prefix);
   return p?deps.entries().filter(e=>(e.state.archived===true)===(archived===true)&&e.source.id.startsWith(p)).map(e=>e.source.id):[];
  },
  countArchived(){deps.assertGM();return deps.entries().filter(e=>e.state.archived===true).length;}
 };
}
