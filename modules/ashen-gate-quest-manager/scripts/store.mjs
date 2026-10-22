import {MOD,assertGM,validSource,validState,initialState,publicView,projectionOwnership,accessSignature,cleanText,normalizePackage,planQuestImport,itemRewardIds,isLevelBackup,LEVEL_BACKUP_ERROR} from './core.mjs';
import {listAssignments} from './assignments.mjs';
import {worldItemById} from './ag-item-drop.mjs';
const FLAG = `flags.${MOD}`;
const GM_ONLY = {default:0};
const FLAGROOT = `flags.${MOD}`;
// 0.14.0 Quest Log never opens a journal on anyone's screen as a side effect of saving, revealing or completing.
const QUIET = {renderSheet:false};
// Imported rewards are named from the world Item bound to their permanent id; none bound -> left out of the player view.
const itemById=id=>{const item=worldItemById(id);return item?{name:item.name,img:item.img}:null;};
export async function ensureFolder(segment){
  if(typeof Folder==='undefined'||!game.folders)return null;
  let parent=null;
  for(const name of ['Ashen Gate','Quests',segment]){
    let folder=[...game.folders].find(f=>f.type==='JournalEntry'&&f.name===name&&(f.folder?.id||f.folder||null)===(parent?.id||null));
    if(!folder)folder=await Folder.create({name,type:'JournalEntry',folder:parent?.id||null});
    parent=folder;
  }
  return parent?.id||null;
}
function gmEntries(){assertGM(game.user);return [...game.journal].filter(j=>j.getFlag(MOD,'private')===true);}
export function getPrivate(id){assertGM(game.user);const matches=gmEntries().filter(j=>j.getFlag(MOD,'source')?.id===id);if(matches.length>1)throw new Error(`Duplicate Quest source ID ${id}`);return matches[0]||null;}
export function allPrivate(){return gmEntries().map(j=>({document:j,source:j.getFlag(MOD,'source'),state:j.getFlag(MOD,'state')})).filter(x=>x.source&&x.state);}
function publicDocs(){return [...game.journal].filter(j=>j.getFlag(MOD,'public')===true);}
function findProjection(id){assertGM(game.user);return publicDocs().find(j=>j.getFlag(MOD,'view')?.id===id)||null;}
export function visibleViews(){
  const gm=game.user?.isGM;
  return publicDocs().filter(j=>gm||j.testUserPermission(game.user,'OBSERVER')).map(j=>({document:j,view:j.getFlag(MOD,'view')})).filter(x=>x.view);
}
export function visibleById(id){const matches=visibleViews().filter(x=>x.view.id===id);return matches.length===1?matches[0]:null;}
export function noteDoc(id,actorId){return [...game.journal].find(j=>j.getFlag(MOD,'notesFor')===id&&j.getFlag(MOD,'noteActorId')===actorId&&(game.user.isGM||j.testUserPermission(game.user,'OBSERVER')))||null;}
export function noteText(id,actorId){const content=[...noteDoc(id,actorId)?.pages||[]][0]?.text?.content??'';return String(content).replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function noteDocs(id){return [...game.journal].filter(j=>j.getFlag(MOD,'notesFor')===id);}
function journalPageHtml(v){
  const objectives=v.objectives.map(o=>`<li>${cleanText(o.goal)} ${o.complete?'✓':o.failed?'✕':''}</li>`).join('');
  return `<article class="ag-objective-journal"><h1>${cleanText(v.name)}</h1><p>${cleanText(v.summary)}</p><p><strong>Status:</strong> ${cleanText(v.status)}</p><ol>${objectives}</ol><p><strong>Party notes:</strong> ${cleanText(v.partyNotes)}</p></article>`;
}
function projectionFlags(v,sig){return {[MOD]:{public:true,view:v,accessSignature:sig}};}
async function publish(source,state){
  assertGM(game.user);
  const v=publicView(source,state,{itemById}), old=findProjection(source.id);
  if(!v){if(old)await old.delete();await synchronizeNotes(source,state,false);return null;}
  const actor=state.scope==='individual'?game.actors.get(state.actorId):null;
  if(state.scope==='individual'&&(!actor||isLevelBackup(actor))){if(old)await old.delete();await synchronizeNotes(source,state,false);return null;}
  const ownership=projectionOwnership(state,actor,[...game.users]);
  const sig=accessSignature(state,ownership);
  // Recreate on ANY audience change instead of merging ownership: stale per-user grants must not survive.
  if(old&&old.getFlag(MOD,'accessSignature')!==sig)await old.delete();
  const cur=(old&&old.getFlag(MOD,'accessSignature')===sig)?old:null;
  if(!cur){const created=await JournalEntry.create({name:`Quest Log — ${source.name}`,folder:await ensureFolder('Quest Log'),ownership,
    flags:projectionFlags(v,sig),pages:[{name:'Quest Log',type:'text',text:{format:1,content:journalPageHtml(v)}}]},QUIET);await synchronizeNotes(source,state,true);return created;}
  // Skip unchanged writes: audience reconciles re-publish every individual quest, and each write re-renders every client.
  const name=`Quest Log — ${source.name}`,html=journalPageHtml(v);
  if(cur.name!==name||JSON.stringify(cur.getFlag(MOD,'view'))!==JSON.stringify(v))await cur.update({name,[`${FLAG}.view`]:v});
  const page=[...cur.pages][0];if(page&&page.text?.content!==html)await page.update({'text.content':html});
  await synchronizeNotes(source,state,true);return cur;
}
async function synchronizeNotes(source,state,visible){
  assertGM(game.user);const id=source.id,users=[...game.users];
  const actors=visible?(state.scope==='individual'?[game.actors.get(state.actorId)].filter(a=>a&&!isLevelBackup(a)):[...game.actors].filter(a=>!isLevelBackup(a)&&users.some(u=>!u.isGM&&a.testUserPermission(u,'OWNER')))):[];
  const permitted=new Map(actors.map(a=>[a.id,a]));
  for(const doc of noteDocs(id))if(!permitted.has(doc.getFlag(MOD,'noteActorId'))){
    const priv=getPrivate(id),existing=priv?.getFlag(MOD,'notesArchive')||[];
    if(priv)await priv.update({[`${FLAG}.notesArchive`]:[...existing,{actorId:doc.getFlag(MOD,'noteActorId'),content:[...doc.pages][0]?.text?.content||''}]});
    await doc.delete();
  }
  for(const actor of actors){
    const own=projectionOwnership({scope:'individual',actorId:actor.id},actor,users);
    const ownerAccess={default:0,...Object.fromEntries(Object.entries(own).filter(([k])=>k!=='default').map(([k])=>[k,3]))};
    const sig=accessSignature({scope:'individual',actorId:actor.id},ownerAccess);
    const old=noteDocs(id).find(j=>j.getFlag(MOD,'noteActorId')===actor.id);
    if(old&&old.getFlag(MOD,'notesAccessSignature')===sig)continue;
    // Preserve existing character note text when same actor owners change; the old access grants must be deleted first.
    const archived=(getPrivate(id)?.getFlag(MOD,'notesArchive')||[]).filter(x=>x.actorId===actor.id).at(-1);
    const content=[...old?.pages||[]][0]?.text?.content||archived?.content||'<p></p>';
    if(old)await old.delete();
    await JournalEntry.create({name:`Quest Character Notes — ${source.name} — ${actor.name}`,folder:await ensureFolder('Character Notes'),ownership:ownerAccess,
      flags:{[MOD]:{notesFor:id,noteActorId:actor.id,notesAccessSignature:sig}},
      pages:[{name:'Character notes',type:'text',text:{format:1,content}}]},QUIET);
  }
}
export async function saveRecord(source,{state=null,replace=false}={}){
  assertGM(game.user);source=validSource(source);
  const existing=getPrivate(source.id);
  if(existing&&!replace)throw new Error(`Objective ${source.id} exists; use Edit or explicit replace.`);
  const next=state??(existing?.getFlag(MOD,'state')??initialState(source));validState(source,next);
  preflightAudience(source,next);
  if(existing){await existing.update({name:`Quest GM — ${source.name}`,[`${FLAG}.source`]:source,[`${FLAG}.state`]:next});}
  else await JournalEntry.create({name:`Quest GM — ${source.name}`,folder:await ensureFolder('GM Source'),ownership:GM_ONLY,flags:{[MOD]:{private:true,source,state:next}},pages:[{name:'GM source',type:'text',text:{format:1,content:'<p>Private objective authority. Edit through Quest Manager. Do not grant players permission to this Journal.</p>'}}]},QUIET);
  await publish(source,next);return source.id;
}
export async function updateState(id,update){
  assertGM(game.user);const doc=getPrivate(id);if(!doc)throw new Error('Objective not found.');
  const source=doc.getFlag(MOD,'source'),old=doc.getFlag(MOD,'state');
  const next={...structuredClone(old),...structuredClone(update)};if(next.scope==='party')next.actorId=null;
  validState(source,next);preflightAudience(source,next);
  await doc.update({[`${FLAG}.state`]:next});await publish(source,next);return structuredClone(next);
}
export async function removeRecord(id){
  assertGM(game.user);
  if(listAssignments({objectiveId:id}).length)throw new Error('Remove/reassign Quest-owned ASSIGN records before deleting this Objective.');const doc=getPrivate(id);if(!doc)throw new Error('Objective not found.');
  const projected=findProjection(id);if(projected)await projected.delete();
  // Preserve authored notes in a separate private GM archive before revoking Journal permissions.
  const notes=[...(doc.getFlag(MOD,'notesArchive')||[]),...noteDocs(id).map(n=>({actorId:n.getFlag(MOD,'noteActorId'),content:[...n.pages][0]?.text?.content||''}))];
  if(notes.some(x=>x.content?.replace(/<[^>]*>/g,'').trim()))await JournalEntry.create({name:`Quest Notes Archive — ${id}`,folder:await ensureFolder('Archives'),ownership:GM_ONLY,flags:{[MOD]:{notesArchiveFor:id,notes}},pages:[{name:'Archive',type:'text',text:{format:1,content:'<p>GM-only backup of character-authored notes for a deleted Objective.</p>'}}]},QUIET);
  await synchronizeNotes(doc.getFlag(MOD,'source'),doc.getFlag(MOD,'state'),false);
  await doc.delete();
  return true;
}
export async function importSources(payload){
  assertGM(game.user);const rows=normalizePackage(payload);const conflicts=rows.filter(r=>getPrivate(r.id));
  if(conflicts.length)throw new Error('Duplicate existing source IDs: '+conflicts.map(x=>x.id).join(', '));
  const out=[];for(const row of rows)out.push(await saveRecord(row));return out;
}
const questPlan=(payload,mode)=>{assertGM(game.user);return planQuestImport(payload,new Set(allPrivate().map(x=>x.source.id)),{mode});};
/** GM-only preview for another module's import hand-off. Writes nothing. */
export function previewQuestImport(payload,{mode='skip'}={}){
  const {errors,rows}=questPlan(payload,mode);
  return {errors,warnings:unboundRewardWarnings(rows.filter(r=>r.action!=='skip').map(r=>r.source)),rows:rows.map(({id,name,action,reason})=>({id,name,action,reason}))};
}
/** Item rewards whose ITEM id has no world Item yet (the quest still imports; the row shows Missing until the item arrives). */
function unboundRewardWarnings(sources){
  return itemRewardIds(sources).filter(({itemId})=>!worldItemById(itemId))
    .map(({questId,itemId})=>`${questId}: item reward ${itemId} has no matching item in this world yet. Import the item first; the quest still imports.`);
}
/** GM-only, additive: new Objectives are created; existing ones are kept (skip) or have their source replaced with status kept (update). */
export async function importQuests(payload,{mode='skip'}={}){
  const {errors,rows}=questPlan(payload,mode);
  if(errors.length)throw new Error(`Import blocked: ${errors[0]}`);
  const report={created:[],updated:[],skipped:[],failed:[],warnings:unboundRewardWarnings(rows.filter(r=>r.action!=='skip').map(r=>r.source))};
  for(const row of rows){
    if(row.action==='skip'){report.skipped.push({id:row.id,reason:row.reason});continue;}
    try{
      await saveRecord(row.source,{replace:row.action==='update'});
      (row.action==='update'?report.updated:report.created).push(row.id);
    }catch(error){report.failed.push({id:row.id,reason:String(error?.message??error)});}
  }
  return report;
}
export async function savePersonalNote(id,actorId,text){
  const entry=visibleById(id);if(!entry)throw new Error('Objective is not visible to you.');
  const actor=game.actors.get(actorId);if(isLevelBackup(actor))throw new Error(LEVEL_BACKUP_ERROR);if(!actor||(!game.user.isGM&&!actor.testUserPermission(game.user,'OWNER')))throw new Error('Actor ownership required.');
  if(entry.view.scope==='individual'&&entry.view.actorId!==actorId)throw new Error('Objective belongs to a different Actor.');
  const notes=noteDoc(id,actorId);if(!notes||!notes.testUserPermission(game.user,'OWNER'))throw new Error('No authorized Character Notes Journal. Ask your GM to republish the Objective.');
  const page=[...notes.pages][0];if(!page)throw new Error('Character Notes page is missing.');
  const html='<p>'+cleanText(String(text||'').slice(0,5000)).replace(/\n/g,'<br>')+'</p>';
  await page.update({'text.content':html});return true;
}

// Actor ownership changes and deletions must revoke obsolete Journal grants on the GM client.
export async function reconcileActorAudience(actorId=null){
  assertGM(game.user);for(const {source,state} of allPrivate()){if(state.scope==='individual'&&(!actorId||state.actorId===actorId))await publish(source,state);}
}
function preflightAudience(source,state){
  if(state.scope==='individual'&&isLevelBackup(game.actors.get(state.actorId)))throw new Error(LEVEL_BACKUP_ERROR);
  if(publicView(source,state)&&state.scope==='individual'){
    const actor=game.actors.get(state.actorId);if(!actor)throw new Error('Individual Actor unavailable: cannot publish.');
    projectionOwnership(state,actor,[...game.users]);
  }
}
