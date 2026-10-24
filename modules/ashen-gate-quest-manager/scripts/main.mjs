import {MOD,assertGM,assertUI,isPlayerCharacter,cleanText,publicView,validSource,initialState,exportPackage,STATUSES,WORK_ORDER_DOMAINS} from './core.mjs';
import {safeButton,options,questCards,questsToolbar,questsSubnav,bulkBar,bulkHint,questsAdvanced,filterLabel,editorSection,setupPanel,emptyState,statusBadge,progressMeter} from './gm-panels.mjs';
import {DEFAULT_VIEW,KIND_LABELS,listQuestsTab,gmViewState,filterCount,hideIds,UNTITLED} from './quests-tab.mjs';
import {planBulk,runBulk,confirmText} from './bulk.mjs';
import {getPrivate,allPrivate,visibleViews,visibleById,saveRecord,updateState,removeRecord,previewQuestImport,importQuests,savePersonalNote,reconcileActorAudience,noteText,ensureFolder} from './store.mjs';
import {createObjectiveConsumer} from './resolver-consumer.mjs';
import {createQuestDefinitionReader,parsePackIds} from './pinned-runtime.mjs';
import {ASSIGNMENT_CONTRACT,listAssignments,getAssignment,saveAssignment,removeAssignment} from './assignments.mjs';
import {selectTrackedViews,validTrackedId,trackingState,overlayState,clampOpacity,clampPosition} from './tracking.mjs';
import {captureView,restoreView} from './view-state.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog} from './ag-dialogs.mjs';
import {windowSize,uiState,bindTablist,bindFolds,bindFileButtons,linkButton} from './ag-html.mjs';
import {readDrop,worldItemById} from './ag-item-drop.mjs';
import {rewardsApi,grantableRewards,addFromDrop,updateReward,removeReward,grantRewards,grantAgain,rewardDragData,onActorSheetDrop} from './rewards.mjs';
import {rewardsSection,playerRewardsSection,grantPanel,grantSummary,receiveList,defaultChoices} from './rewards-ui.mjs';
import {createJournalStore} from './journal-store.mjs';
import {installJournal,bindRadios} from './journal-ui.mjs';

const VERSION='0.19.3';
let instance=null;
let objectiveConsumer=null;
let questDefinitionReader=null;
const E=cleanText;
const appBase=()=>foundry?.applications?.api?.ApplicationV2;
const openAllowed=()=>game.user?.isGM||game.settings.get(MOD,'playerAccessEnabled');
const hasGM=()=>!!game.user?.isGM;
// Character pickers: player characters only (core.mjs isPlayerCharacter); a player sees their own.
function actorsOwned(){return [...game.actors].filter(a=>isPlayerCharacter(a,hasGM()?[...game.users]:[game.user])).sort((a,b)=>String(a.name).localeCompare(String(b.name)));}
function notifyError(err){console.error(`[${MOD}]`,err);ui.notifications?.error(hideIds(err.message??String(err)));}
function dialogDownload(name,text,type='application/json'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function blankTemplate(){return {
 id:'',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',
 provenance:{sources:['GM-authored world draft; not approved canon']},visibility:'reveal_gated',refs:[],
 name:'',public_summary:'',source:{description:'GM to specify source'},
 objectives:[{key:'first',goal:'',visibility:'player'}],locations:[],parameters:{},outcomes:{}
};}
function blankAssignment(objectiveId){return {id:'ASSIGN-REPLACE-ME',entity_type:'Assignment',status:'draft',version:'0.1.0',provenance:{sources:['GM-authored campaign assignment']},visibility:'gm',refs:[{relation:'executes_objective',target_id:objectiveId,mode:'required'}],scope:'campaign_state',owner_system_id:'SYS-QUEST',objective_id:objectiveId,execution_status:'pending',participants:[],results:{}};}
function stateForGM(){return allPrivate().map(x=>({...x,changed:x.document?._stats?.modifiedTime??null})).sort((a,b)=>String(a.source.name??a.source.id).localeCompare(String(b.source.name??b.source.id)));}
function roleViewList(tab,actorId){return visibleViews().filter(x=>x.view.scope===(tab==='individual'?'individual':'party')&&(tab!=='individual'||x.view.actorId===actorId)).sort((a,b)=>a.view.name.localeCompare(b.view.name));}
const tipAttr=t=>` data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`;
// Player rows: title, kind, revealed-objectives count and status; Track sits beside the row button.
function cards(list,sel,{empty=["No quests yet","Your GM hasn't revealed any quests here yet."]}={}){
 if(!list.length)return emptyState(...empty);
 return `<div class="ag-rows">${list.map(({view})=>{const on=view.id===sel,done=view.objectives.filter(o=>o.complete).length;
  return `<div class="ag-row agq-prow${on?' is-selected':''}"${on?' aria-current="true"':''}><button type="button" class="agq-prow__main" data-action="select" data-id="${E(view.id)}"><span class="ag-row__title">${E(view.name)}</span><span class="ag-row__meta">${E(view.objective_kind.replace('_',' '))}</span><span class="agq-row__stats">${statusBadge(view.status)}${progressMeter(done,view.objectives.length)}</span></button><label class="agq-track"${tipAttr('Show this quest in your on-screen objectives overlay')}><input type="checkbox" data-action="track" data-id="${E(view.id)}" ${trackedIds().includes(view.id)?'checked':''}> Track</label></div>`;}).join('')}</div>`;
}
// Optional Locations link: ids the GM listed on the quest plus locations that list this quest.
// Feature-detected; Locations decides what the current user may see.
function locationLinks(view){
 const loc=game.modules.get('ashen-gate-locations');if(!loc?.active||typeof loc.api?.getLocation!=='function')return '';
 try{
  const ids=[...new Set([...(view.locationIds||[]),...(loc.api.locationsForQuest?.(view.id)??[]).map(x=>x.id)])];
  const links=ids.map(id=>[id,loc.api.getLocation(id)?.name]).filter(([,name])=>name)
   .map(([id,name])=>`<li>${linkButton(name,{data:{action:'open-location',id},icon:'fa-solid fa-map-location-dot'})}</li>`);
  return links.length?`<h3 class="agq-h">Locations</h3><ul class="agq-locations">${links.join('')}</ul>`:'';
 }catch{return '';}
}
const OBJ_BADGE={complete:'<span class="ag-badge ag-badge--ok">Complete</span>',failed:'<span class="ag-badge ag-badge--danger">Failed</span>',pending:'<span class="ag-badge">Pending</span>'};
// picker: the window's Party tab puts its character select in the Character notes heading (QL-04).
function readableDetail(view,actorId,{picker=''}={}){
 if(!view)return emptyState('No quest selected','Pick a quest from the list to read its objectives.',{iconName:'fa-book-open'});
 const state=STATUSES.includes(view.status)?view.status:'Unknown';
 const items=view.objectives.map(o=>`<li class="ag-row agq-objective"><span class="ag-row__main">${E(o.goal)}</span><span class="ag-row__end">${OBJ_BADGE[o.complete?'complete':o.failed?'failed':'pending']}</span></li>`).join('');
 const actor=actorId?game.actors.get(actorId):null;const notes=actor?noteText(view.id,actor.id):'';
 const canNote=actor&&(hasGM()||actor.testUserPermission(game.user,'OWNER'))&&(view.scope==='party'||view.actorId===actorId);
 return `<div class="agq-detail"><h2 class="agq-detail__title">${E(view.name)}</h2><div class="agq-detail__meta">${E(view.objective_kind.replace('_',' '))} ${statusBadge(state)}</div><p class="agq-prose">${E(view.summary||'No public summary.')}</p>
 <h3 class="agq-h">Objectives</h3>${items?`<ul class="ag-rows agq-objectives">${items}</ul>`:'<p class="ag-field__hint">No objectives revealed yet.</p>'}${playerRewardsSection(view.rewards)}${locationLinks(view)}
 <h3 class="agq-h">Shared party notes</h3><p class="agq-note agq-prose">${E(view.partyNotes||'No shared notes yet.')}</p>
 <h3 class="agq-h">Character notes</h3>${picker}${canNote?`<label class="ag-field">Notes for ${E(actor.name)}<textarea id="ag-my-note" rows="5">${E(notes)}</textarea></label><div class="agq-actions">${safeButton('Save character notes','save-note',{kind:'primary',sm:true})}</div>`:'<p class="ag-field__hint">Choose one of your characters to keep character notes.</p>'}</div>`;
}
// 0.15.0 Quest editor: collapsible sections (open state kept per user), one sticky save bar for the whole quest.
const NEW_STATE=Object.freeze({status:'Hidden',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false});
// The permanent ID's prefix for each Type (core.mjs checks that they agree).
const KIND_PREFIX=Object.freeze({quest:'QUEST',work_order:'ORDER',contract:'CONTRACT'});
function basicsSection(source,existing){
 const type=source.objective_kind;
 const kinds=[['quest','Quest'],['work_order','Work Order (crafting, production or creative)'],['contract','Contract']];
 return `<p class="ag-field__hint">Write what the job is and what the players can learn.</p>
 <div class="ag-form-grid"><label class="ag-field">Type<select id="ag-src-kind" ${existing?'disabled':''}>${options(kinds,type)}</select></label>
 <label class="ag-field ag-field--wide">Title<input id="ag-src-name" value="${E(source.name)}" placeholder="Name this quest"></label>
 <label class="ag-field ag-field--wide">Public description<textarea id="ag-src-summary" rows="3">${E(source.public_summary??'')}</textarea></label>
 <label class="ag-field">Definition visibility<select id="ag-src-visibility">${options([['reveal_gated','Reveal when GM approves'],['player','Player-visible when not Hidden'],['gm','GM only (never publish)']],source.visibility)}</select></label>
 ${existing&&type!=='work_order'?'':`<label class="ag-field" data-kind-field="work_order"${type==='work_order'?'':' hidden'}>Work order domain<select id="ag-src-workdomain">${options(WORK_ORDER_DOMAINS,source.work_order_domain||'crafting')}</select></label>`}</div>
 ${source.visibility==='gm'?'<p class="ag-notice ag-notice--warn"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> This is a GM-only source. Campaign status and reveal cannot publish it until you change Definition visibility.</p>':''}`;
}
function audienceSection(state){
 const actorChoices=actorsOwned().map(a=>[a.id,a.name]);
 // A quest saved earlier for a non-player actor keeps it selected, labelled, so saving doesn't silently drop it.
 const current=state.actorId&&!actorChoices.some(([id])=>id===state.actorId)?game.actors.get(state.actorId):null;
 if(current)actorChoices.push([current.id,`${current.name} (not a player character)`]);
 return `<div class="ag-form-grid"><label class="ag-field">Audience<select id="ag-scope">${options([['party','Party'],['individual','Individual character']],state.scope)}</select></label>
 <label class="ag-field" data-actor-field${state.scope==='individual'?'':' hidden'}>Individual character<select id="ag-state-actor"><option value="">Choose a character</option>${options(actorChoices,state.actorId)}</select></label></div>`;
}
function objectivesSection(source,state){
 return `<p class="ag-field__hint">Give each objective a stable key. Mark secret steps Reveal later; only the GM can reveal them. Revealing never overrides GM only.</p>
 <div id="ag-source-objective-list">${source.objectives.map(o=>objectiveFormRow(o,state)).join('')}</div>
 <div class="agq-actions">${safeButton('Add objective','add-objective',{sm:true,icon:'fa-plus'})}</div>`;
}
function objectiveFormRow(o,state=NEW_STATE){
 return `<div class="agq-srcobj" data-key="${E(o.key)}"><label class="ag-field">Key<input class="ag-src-obj-key" value="${E(o.key)}" readonly></label><label class="ag-field">Objective<input class="ag-src-obj-goal" value="${E(o.goal)}" placeholder="What must be done?"></label><label class="ag-field">Shown<select class="ag-src-obj-visibility">${options([['player','When quest is visible'],['reveal_gated','Reveal later'],['gm','GM only']],o.visibility||'player')}</select></label>
 <label class="ag-field">Progress<select class="ag-obj-progress">${options([['pending','Pending'],['complete','Complete'],['failed','Failed']],state.progress?.[o.key]||'pending')}</select></label>
 <label class="ag-field ag-field--inline agq-srcobj__reveal"><input type="checkbox" class="ag-obj-reveal" ${state.objectiveReveal?.includes(o.key)?'checked':''}> Revealed</label></div>`;
}
function rewardsEditSection(source,state,rewardsHtml,saved){
 return `<label class="ag-field">Suggested rewards / outcomes<textarea id="ag-src-outcome" rows="2">${E(source.outcomes?.description??'')}</textarea><span class="ag-field__hint">Coin and other rewards in words. Informational; the GM grants rewards separately.</span></label>
 <label class="ag-field ag-field--inline"><input id="ag-reward-recorded" type="checkbox" ${state.rewardRecorded?'checked':''}> Rewards handled outside Quest Log</label>
 ${saved?rewardsHtml:'<p class="ag-field__hint">Save the quest to add item rewards.</p>'}`;
}
function statusSection(source,state,saved){
 const isPublic=saved&&!!publicView(source,state);
 const why=!saved?'Not published: a new quest is saved Hidden unless you choose another status.':source.visibility==='gm'?'Not published: this definition is GM only. Change Definition visibility in Basics.':state.status==='Hidden'?'Not published: set status to Available or Active, then save.':source.visibility==='reveal_gated'&&!state.revealed?'Not published: tick Reveal quest and save.':'Not published: check audience and source permissions.';
 return `<p class="ag-notice ${isPublic?'ag-notice--ok':'ag-notice--warn'}"><i class="fa-solid ${isPublic?'fa-eye':'fa-eye-slash'}" aria-hidden="true"></i> ${isPublic?'Published to authorized players.':why}</p>
 <div class="ag-form-grid"><label class="ag-field">Campaign status<select id="ag-status">${options(STATUSES.map(x=>[x,x]),state.status)}</select></label></div>
 <label class="ag-field ag-field--inline"><input id="ag-state-revealed" type="checkbox" ${state.revealed?'checked':''} ${source.visibility==='gm'?'disabled':''}> Reveal quest to the selected audience (when status is not Hidden)</label>
 <label class="ag-field">Shared party notes<textarea id="ag-party-notes" rows="3">${E(state.partyNotes||'')}</textarea><span class="ag-field__hint">Players in the audience can read these.</span></label>`;
}
function gmNotesSection(source,state){
 return `<label class="ag-field">GM-only notes<textarea id="ag-gm-notes" rows="3">${E(state.gmNotes||'')}</textarea></label>
 <label class="ag-field">GM-only source / issuer notes<textarea id="ag-src-description" rows="2">${E(source.source?.description??'')}</textarea></label>`;
}
// IDs live only here: a closed fold the GM opens on purpose. A new quest's ID is made from its title when left empty.
function detailsSection(source,state,existing){
 return `<p class="ag-field__hint">Permanent IDs, for linking and troubleshooting. You do not need them to run a quest; they are never renamed after creation.</p>
 <div class="ag-form-grid"><label class="ag-field">Permanent ID<input id="ag-src-id" value="${existing?E(source.id):''}" ${existing?'readonly':''} placeholder="Made from the title when left empty"></label>
 ${existing?`<div class="ag-field"><span>&nbsp;</span>${safeButton('Copy ID','copy-id',{sm:true,icon:'fa-copy',data:{id:source.id}})}</div>`:''}</div>
 <div class="ag-form-grid"><label class="ag-field">Related location IDs<textarea id="ag-src-locations" rows="2">${E((source.locations||[]).filter(x=>typeof x==='string').join('\n'))}</textarea><span class="ag-field__hint">Optional, one per line.</span></label>
 <label class="ag-field">Public location IDs<textarea id="ag-public-locations" rows="2">${E((state.publicLocationIds||[]).join('\n'))}</textarea><span class="ag-field__hint">One per line.</span></label></div>`;
}
// 0.17.0 The source JSON is its own section (QL-10: once edited it is what Save changes saves, and the form says so).
function jsonSection(source){
 return `<p class="ag-field__hint">Only edit JSON if you need additional references, issuer fields, terms or provenance. Edited JSON takes precedence over the form when saved.</p><textarea id="ag-source-json" class="agq-code" rows="12" spellcheck="false" aria-label="Canonical source JSON">${E(JSON.stringify(source,null,2))}</textarea>`;
}
// 0.17.0 Delegated assignments: their own section with their own footer; they never go through Save changes (QL-02, QL-07).
function assignmentsSection(source){
 const list=listAssignments({objectiveId:source.id});
 const rows=list.length?`<div class="ag-rows agq-assignments">${list.map((a,i)=>`<div class="ag-row"><span class="ag-row__main"><span class="ag-row__title">Assignment ${i+1}</span><span class="ag-row__meta">${E(a.execution_status)}</span></span><span class="ag-row__end">${safeButton('Load into editor','edit-assignment',{sm:true,icon:'fa-pen',data:{id:a.id},title:`Load assignment ${i+1} into the assignment editor below`})}${safeButton(`Delete assignment ${i+1}`,'remove-assignment',{kind:'danger',sm:true,iconOnly:true,icon:'fa-trash',data:{id:a.id},title:'Delete this assignment'})}</span></div>`).join('')}</div>`:'<p class="ag-field__hint">No delegated assignments.</p>';
 return `<div class="agq-assign" data-assignments><p class="ag-field__hint">Separate execution records, not HQ staffing. They save with Save assignment, not with Save changes.</p>${rows}
 <label class="ag-field">Assignment JSON<textarea id="ag-assignment-json" rows="8" class="agq-code" spellcheck="false">${E(JSON.stringify(blankAssignment(source.id),null,2))}</textarea></label>
 <footer class="ag-footer agq-assign__footer">${safeButton('Cancel','cancel-assignment',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-assign-status>New assignment</span>${safeButton('Save assignment','save-assignment',{icon:'fa-floppy-disk'})}</footer></div>`;
}
// A new quest left without an ID gets one made from its title (QUEST-HARBOR-RUMORS, -2 if taken); the GM never has to type one.
function idFromTitle(name,kind){
 const slug=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/,'');
 if(!slug)throw new Error('Give the quest a title first.');
 const taken=new Set(allPrivate().map(x=>x.source.id)),base=`${KIND_PREFIX[kind]||'QUEST'}-${slug}`;
 let id=base,n=2;while(taken.has(id))id=`${base}-${n++}`;
 return id;
}
function sourceFromForm(root,current){
 const src=structuredClone(current||blankTemplate());
 src.id=root.querySelector('#ag-src-id').value.trim().toUpperCase();
 src.objective_kind=root.querySelector('#ag-src-kind').value;
 src.name=root.querySelector('#ag-src-name').value.trim();
 if(!current&&!src.id)src.id=idFromTitle(src.name,src.objective_kind);
 src.public_summary=root.querySelector('#ag-src-summary').value.trim();
 src.source={...src.source,description:root.querySelector('#ag-src-description').value.trim()};
 src.visibility=root.querySelector('#ag-src-visibility').value;
 src.outcomes={...src.outcomes,description:root.querySelector('#ag-src-outcome').value.trim()};
 const locationIds=root.querySelector('#ag-src-locations').value.split(/\s+/).map(x=>x.trim()).filter(Boolean);
 const unchanged=(src.locations||[]).filter(x=>typeof x==='string');
 if(JSON.stringify(unchanged)!==JSON.stringify(locationIds))src.locations=[...(src.locations||[]).filter(x=>typeof x!=='string'),...locationIds];
 else src.locations=src.locations||[];
 if(locationIds.some(x=>!/^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(x)))throw new Error('Location IDs (in Details) must be valid location IDs.');
 src.objectives=[...root.querySelectorAll('.agq-srcobj')].map(row=>{
  const key=row.querySelector('.ag-src-obj-key').value.trim();
  const old=(current?.objectives||[]).find(x=>x.key===key)||{};
  return {...old,key,goal:row.querySelector('.ag-src-obj-goal').value.trim(),visibility:row.querySelector('.ag-src-obj-visibility').value};
 });
 if(src.objective_kind==='work_order')src.work_order_domain=root.querySelector('#ag-src-workdomain')?.value||src.work_order_domain||'crafting';
 else delete src.work_order_domain;
 return validSource(src);
}
/** Campaign state from the editor, for `source` (objective progress and reveals only for its objectives). */
function stateFromForm(root,source,old){
 const keys=new Set(source.objectives.map(o=>o.key)),val=sel=>root.querySelector(sel);
 const progress=Object.fromEntries(Object.entries(old.progress||{}).filter(([k])=>keys.has(k)));
 const reveal=new Set((old.objectiveReveal||[]).filter(k=>keys.has(k)));
 for(const el of root.querySelectorAll('.agq-srcobj')){const key=el.querySelector('.ag-src-obj-key')?.value?.trim();if(!keys.has(key))continue;
  const p=el.querySelector('.ag-obj-progress')?.value;if(p)progress[key]=p;
  const r=el.querySelector('.ag-obj-reveal');if(r){r.checked?reveal.add(key):reveal.delete(key);}}
 const lines=sel=>val(sel)?val(sel).value.split(/\s+/).map(x=>x.trim()).filter(Boolean):null;
 const next={...structuredClone(old),status:val('#ag-status')?.value??old.status,scope:val('#ag-scope')?.value??old.scope,
  actorId:val('#ag-state-actor')?(val('#ag-state-actor').value||null):old.actorId,revealed:val('#ag-state-revealed')?!!val('#ag-state-revealed').checked:old.revealed,
  objectiveReveal:[...reveal],progress,publicLocationIds:lines('#ag-public-locations')??old.publicLocationIds??[],
  partyNotes:val('#ag-party-notes')?.value??old.partyNotes,gmNotes:val('#ag-gm-notes')?.value??old.gmNotes,rewardRecorded:val('#ag-reward-recorded')?.checked??old.rewardRecorded};
 if(next.scope==='party')next.actorId=null;
 return next;
}
function editorHead(selected,dirty){
 const name=selected?.source?.name||UNTITLED;
 return `<header class="agq-edit__head"><h2 class="agq-detail__title">${selected?E(name):'New quest'}</h2><span class="ag-badge ag-badge--warn agq-dirty-badge"${dirty?'':' hidden'}><i class="fa-solid fa-pen" aria-hidden="true"></i>Unsaved changes</span>${selected?safeButton('Delete quest…','delete',{kind:'danger',sm:true,icon:'fa-trash'}):''}</header>`;
}
// 0.17.0 Sections after Audience and Objectives start closed (QL-02); the GM's open/closed choice is kept (gmView flag).
function questEditor(selected,rewardsHtml,{sections,dirty=false}){
 const source=selected?.source||blankTemplate(),state=selected?.state||NEW_STATE,saved=!!selected;
 const open=k=>sections?.[k]!==false;
 const done=source.objectives.filter(o=>state.progress?.[o.key]==='complete').length;
 const audience=state.scope==='individual'?`Individual: ${game.actors.get(state.actorId)?.name??'no character chosen'}`:'Party';
 const visible=saved&&!!(()=>{try{return publicView(source,state);}catch{return null;}})();
 const body=[
  editorSection('basics','Basics',basicsSection(source,saved),{open:open('basics'),summary:KIND_LABELS[source.objective_kind]||source.objective_kind}),
  editorSection('audience','Audience',audienceSection(state),{open:open('audience'),summary:audience}),
  editorSection('objectives','Objectives',objectivesSection(source,state),{open:open('objectives'),summary:`${done}/${source.objectives.length} complete`}),
  editorSection('rewards','Rewards',rewardsEditSection(source,state,rewardsHtml,saved),{open:open('rewards'),summary:saved?'Item rewards save as you change them':''}),
  editorSection('status','Campaign status and reveal',statusSection(source,state,saved),{open:open('status'),summary:`${state.status} · ${visible?'visible to players':'GM only'}`}),
  editorSection('gmnotes','GM notes',gmNotesSection(source,state),{open:open('gmnotes')}),
  editorSection('details','Details (IDs)',detailsSection(source,state,saved),{open:open('details'),summary:'Permanent IDs'}),
  editorSection('json','Advanced: source JSON',jsonSection(source),{open:open('json'),summary:'Optional'}),
 ].join('');
 // Assignments sit after the draft form and its save bar: they save on their own.
 const assign=saved?`<div class="agq-after">${editorSection('assignments','Assignments (saved separately)',assignmentsSection(source),{open:open('assignments'),summary:`${listAssignments({objectiveId:source.id}).length} delegated`})}</div>`:'';
 return `${editorHead(selected,dirty)}<div class="agq-source">${body}</div>
 <footer class="ag-footer agq-savebar${dirty?' is-dirty':''}">${safeButton('Cancel','cancel-edit',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-source-status>${dirty?'Unsaved changes':'No unsaved changes'}</span>${safeButton(saved?'Save changes':'Create quest','save-quest',{kind:'primary'})}</footer>${assign}`;
}
// Names for the cards: actors, Locations (when that module is there) and imported reward items.
function rowContext(){
 const loc=game.modules.get('ashen-gate-locations'),getLoc=loc?.active&&typeof loc.api?.getLocation==='function'?loc.api.getLocation:null;
 const safe=fn=>id=>{try{return fn(id)??null;}catch{return null;}};
 return {actorName:safe(id=>game.actors.get(id)?.name),locationName:safe(id=>getLoc?.(id)?.name),locationRegion:safe(id=>getLoc?.(id)?.region),itemName:safe(id=>worldItemById(id)?.name)};
}
function gmList(view){return listQuestsTab(stateForGM(),view,rowContext());}
// 0.17.0 Toolbar (Filters (n) opens a second row), then the bulk row once quests are ticked, then list and editor (QL-05).
function questsPanel(app,rewardsHtml=''){
 const rows=stateForGM(),selected=rows.find(x=>x.source.id===app.gmId)||null;
 const {groups,locations,levels,regions,givers,shown,total,counts,ids}=listQuestsTab(rows,app.qv,rowContext());
 app.shownIds=ids;app.picked=new Set([...app.picked].filter(id=>rows.some(x=>x.source.id===id)));
 return `<div class="agq-pane"><div class="agq-subbar">${questsSubnav(app.qv.nav,counts)}</div>${questsToolbar(app.qv,locations,{shown,total,filtersOpen:app.filtersOpen,levels,regions,givers})}${bulkBar(app.picked.size,shown)}<div class="ag-split agq-split"><aside class="ag-split__list agq-list" aria-label="Quests" data-ag-scroll="gm-list">${bulkHint(app.picked.size,shown)}<div id="ag-gm-cards">${questCards(groups,app.gmId,{total,picked:app.picked})}</div>${questsAdvanced()}</aside>
 <section class="ag-split__detail agq-edit${app.unsavedSource?' is-dirty':''}" data-ag-scroll="gm-edit:${E(selected?.source.id??'new')}">${questEditor(selected,rewardsHtml,{sections:app.gmPrefs.sections,dirty:app.unsavedSource})}</section></div></div>`;
}
function setupTab(){return setupPanel({playerAccess:game.settings.get(MOD,'playerAccessEnabled'),packIds:game.settings.get(MOD,'compendiumPackIds'),openForPlayers:game.settings.get(MOD,'openForPlayers')===true});}
const TABS=[['party','Party','fa-users',false],['individual','Individual','fa-user',false],['journal','Journal','fa-book',false],['quests','Quests','fa-scroll',true],['setup','GM Setup','fa-gears',true]];
/* ---- Game Journal: session notes for the party and each player (journal-core.mjs, journal-store.mjs, journal-ui.mjs).
   Players see it when Player Access is on and the Character Hub (if active) shows 'quests'. ---- */
function hubShowsQuests(){
 const hub=game.modules?.get?.('ashen-gate-character-hub'),vis=hub?.active?hub.api?.playerVisibility:null;
 if(typeof vis?.isShown!=='function')return true;
 try{return vis.isShown('quests')!==false;}catch{return true;}
}
const journalStore=createJournalStore({moduleId:MOD,users:()=>game.users,me:()=>game.user,entries:()=>game.journal??[],
 createEntry:data=>JournalEntry.create(data,{renderSheet:false}),folderId:()=>ensureFolder('Game Journal'),
 access:()=>game.settings.get(MOD,'playerAccessEnabled')===true,hubShown:hubShowsQuests,
 isPrimaryGM:()=>!!game.user?.isGM&&(game.users?.activeGM?.isSelf??true),get socket(){return game.socket;}});
const journalAllowed=()=>{try{return journalStore.allowed();}catch{return false;}};
// 0.17.0 Party and Individual: one full-width toolbar (search, Status, count, overlay toggle on the right), like the Quests tab.
// Individual picks its character in the toolbar; Party picks whose notes to show in the Character notes heading (QL-04).
function playerPane(tab,rows,detail,ctx){
 const actorSelect=label=>`<select id="ag-actor" aria-label="${label}"><option value="">Choose a character</option>${ctx.actorOption}</select>`;
 const overlay=trackerVisible()?'Hide objectives overlay':'Show objectives overlay';
 const picker=tab==='party'?`<label class="ag-field agq-notefor">Character${actorSelect('Character for notes')}</label>`:'';
 return `<div class="ag-toolbar agq-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="ag-quest-search" placeholder="Search quests" aria-label="Search visible quests" value="${E(ctx.filter)}"></label>
 <div class="ag-toolbar__filters"><select id="ag-player-filter" aria-label="Status">${options([['all','All statuses'],...STATUSES.filter(x=>x!=='Hidden').map(x=>[x,x])],ctx.statusFilter)}</select>${tab==='individual'?actorSelect('Character'):''}</div>
 <span class="ag-toolbar__count" id="ag-quest-count">${rows.length} ${rows.length===1?'quest':'quests'}</span>
 <div class="ag-toolbar__end">${safeButton(overlay,'toggle-overlay',{sm:true,kind:'ghost',icon:'fa-list-check',title:'Your tracked objectives on screen (only for you)'})}</div></div>
 <div class="ag-split agq-split"><aside class="ag-split__list agq-list" aria-label="Quests" data-ag-scroll="list:${tab}"><div id="ag-quest-cards">${cards(rows,ctx.selectedId)}</div></aside>
 <section class="ag-split__detail agq-reading" data-ag-scroll="read:${tab}:${E(ctx.selectedId??'')}">${readableDetail(detail,ctx.actorId,{picker})}</section></div>`;
}
const Base=appBase();
class QuestLogApplication extends Base {
 static DEFAULT_OPTIONS={id:'ag-quest-manager-window',classes:['ag-app','agq-app'],window:{title:'Ashen Gate | Quest Log',resizable:true,minimizable:true},position:{width:940,height:700}};
 // Compact size here; Comfortable scales it when the window opens (windowSize).
 constructor(options={}){super({...options,position:{...windowSize(QuestLogApplication.DEFAULT_OPTIONS.position),...options.position}});this.ui=uiState(MOD);this.filtersOpen=this.ui.get('filtersOpen',false,[true,false]);this.tab='party';this.actorId=actorsOwned()[0]?.id??null;this.selectedId=null;this.gmId=null;this.filter='';this.unsavedSource=false;this.sourceJsonEdited=false;this.statusFilter='all';
  // 0.15.0 The GM's last sub-view, sort, group and editor sections come back (User flag gmView); search starts empty.
  this.gmPrefs=gmViewState(hasGM()?game.user?.getFlag?.(MOD,'gmView'):null);this.qv={...DEFAULT_VIEW,nav:this.gmPrefs.nav,sort:this.gmPrefs.sort,group:this.gmPrefs.group};this.picked=new Set();this.shownIds=[];}
 // 0.17.0 The quest editor's unsaved state is a kit guardDirty: tab switch, picking another quest, New quest, Cancel and
 // closing the window all ask "Discard unsaved changes?" (Keep editing is the default).
 get guard(){return this._guard??=guardDirty({status:()=>this.element?.querySelector?.('[data-source-status]'),message:'Your quest changes have not been saved.'});}
 get unsavedSource(){return this.guard.dirty;}
 set unsavedSource(v){if(v)this.guard.markDirty();else this.guard.markClean();}
 saveGmView(patch){
  this.gmPrefs=gmViewState({...this.gmPrefs,...patch});
  if(hasGM()&&typeof game.user?.setFlag==='function')game.user.setFlag(MOD,'gmView',this.gmPrefs).catch(notifyError);
 }
 async _renderHTML(){assertUI(game.user,openAllowed());
  let rows=[],detail=null;
  if(this.tab==='journal'&&!journalAllowed())this.tab='party';
  const gmTab=this.tab==='quests'||this.tab==='setup'||this.tab==='journal';
  if(!gmTab){rows=roleViewList(this.tab,this.actorId).filter(x=>(this.statusFilter==='all'||x.view.status===this.statusFilter)&&[x.view.name,x.view.summary,x.view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));if(!rows.some(x=>x.view.id===this.selectedId))this.selectedId=rows[0]?.view.id??null;detail=rows.find(x=>x.view.id===this.selectedId)?.view??null;}
  const allowed=actorsOwned(),actorOption=options(allowed.map(a=>[a.id,a.name]),this.actorId);
  const version=game.modules.get(MOD)?.version||VERSION;
  const tabs=TABS.filter(([id,,,gm])=>(!gm||hasGM())&&(id!=='journal'||journalAllowed())).map(([id,label,ic,gm])=>{const on=this.tab===id;return `<button type="button" role="tab" id="agq-tab-${id}" data-tab="${id}" aria-selected="${on}" aria-controls="agq-panel" tabindex="${on?0:-1}" class="${[on?'active':'',gm?'ag-tab--gm':''].filter(Boolean).join(' ')}"><i class="fa-solid ${ic}" aria-hidden="true"></i> ${label}</button>`;}).join('');
  // 0.17.0 Header: brand, then version and Help only (QL-03). The overlay toggle lives in the Party and Individual toolbar.
  return `<div class="ag-window agq-root"><header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Quest Log</h1></div><div class="ag-header__meta"><span class="ag-version">v${E(version)}</span>${safeButton('Help','help',{kind:'ghost',sm:true,icon:'fa-circle-question'})}</div></header>
  <nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Quest Log sections">${tabs}</nav>
  <div class="agq-panel" id="agq-panel" role="tabpanel" aria-labelledby="agq-tab-${this.tab}">${this.tab==='journal'?this.journalHTML():this.tab==='quests'?questsPanel(this,await this.rewardsHtml()):this.tab==='setup'?setupTab():playerPane(this.tab,rows,detail,{filter:this.filter,statusFilter:this.statusFilter,actorOption,actorId:this.actorId,selectedId:this.selectedId})}</div></div>`;
 }
 // GM editor: the selected quest's Item rewards. A quest that can't be listed shows no section rather than breaking the editor.
 async rewardsHtml(){
  const row=this.gmId?getPrivate(this.gmId):null;if(!row)return '';
  // The note stays until another quest is picked: a hook re-render after the save must not wipe it.
  const status=this.rewardNote||'';
  try{
   const rows=await grantableRewards(this.gmId),individual=row.getFlag(MOD,'state')?.scope==='individual';
   const owed=rows.filter(r=>r.owed);if(!owed.length)this.grantOpen=false;
   this.rewardCache={rows,owed,individual};
   const grantHtml=this.grantOpen?grantPanel(owed,defaultChoices(owed),{individual,noParty:!individual&&!rows[0]?.party.length}):'';
   return rewardsSection(rows,{individual,status,grantHtml,canGive:rows.some(r=>r.grantable)});
  }catch(err){console.error(`[${MOD}]`,err);return '';}
 }
 // The panel's current choices, read from its controls.
 grantChoices(root){
  const out={};
  for(const tr of root.querySelectorAll('[data-grant-key]'))out[tr.dataset.grantKey]={give:!!tr.querySelector('[data-grant-give]')?.checked,
   actorId:tr.querySelector('[data-grant-actor]')?.value??'',actorIds:[...tr.querySelectorAll('[data-grant-each]:checked')].map(x=>x.value),
   split:Object.fromEntries([...tr.querySelectorAll('[data-grant-split]')].map(x=>[x.dataset.grantSplit,x.value===''?0:Number(x.value)]))};
  return out;
 }
 // Live "Will receive" list and the Grant button's hint, without redrawing the controls.
 updateGrantPanel(root){
  const panel=root.querySelector('[data-grant-panel]'),cache=this.rewardCache;if(!panel||!cache)return;
  const summary=grantSummary(cache.owed,this.grantChoices(panel),{individual:cache.individual});
  panel.querySelector('[data-grant-summary]').innerHTML=receiveList(summary);
  panel.querySelector('[data-grant-status]').textContent=summary.problems.join(' ');
  const go=panel.querySelector('[data-action="grant-rewards"]');if(go)go.disabled=summary.problems.length>0;
  for(const tr of panel.querySelectorAll('[data-grant-key]')){const st=tr.querySelector('[data-grant-split-status]');if(!st)continue;
   const row=cache.owed.find(r=>r.key===tr.dataset.grantKey),total=[...tr.querySelectorAll('[data-grant-split]')].reduce((t,x)=>t+(Number(x.value)||0),0);
   st.textContent=`${total} of ${row?.quantity??0} shared`;}
 }
 // Reward edits save at once (no footer); the section redraws from the saved quest and shows "Saved".
 bindRewards(root){
  const zone=root.querySelector('[data-reward-zone]');if(!zone)return;
  const done=()=>this.refreshRewards(root,'Saved');
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.querySelector('.agq-reward-drop')?.classList.add('is-over');});
  zone.addEventListener('dragleave',()=>zone.querySelector('.agq-reward-drop')?.classList.remove('is-over'));
  zone.addEventListener('drop',async e=>{
   e.preventDefault();e.stopPropagation();zone.querySelector('.agq-reward-drop')?.classList.remove('is-over');
   try{const res=await addFromDrop(this.gmId,readDrop(e));if(!res.ok)return res.reason&&ui.notifications.warn(res.reason);await done();}catch(err){notifyError(err);}
  });
  for(const el of zone.querySelectorAll('[data-reward-field]'))el.addEventListener('change',async()=>{
   try{const key=el.closest('[data-reward-key]').dataset.rewardKey,field=el.dataset.rewardField;
    await updateReward(this.gmId,key,{[field]:field==='quantity'?Number(el.value):el.value});await done();}
   catch(err){ui.notifications.warn(err.message??String(err));await this.refreshRewards(root);}
  });
  for(const b of zone.querySelectorAll('[data-action]'))b.addEventListener('click',()=>this.action(b,root));
  // Drag-out (D8): dropping a row on a character sheet gives it (dropActorSheetData hook below).
  for(const tr of zone.querySelectorAll('[data-reward-drag]'))tr.addEventListener('dragstart',e=>{
   const row=this.rewardCache?.rows.find(r=>r.key===tr.dataset.rewardKey);if(!row)return;
   e.dataTransfer?.setData('text/plain',JSON.stringify(rewardDragData(this.gmId,row)));
  });
  const panel=zone.querySelector('[data-grant-panel]');
  for(const ev of ['input','change'])panel?.addEventListener(ev,()=>this.updateGrantPanel(root));
 }
 // Redraw only the rewards section, so unsaved edits elsewhere in the editor are kept.
 async refreshRewards(root,note=''){
  this.rewardNote=note;const html=await this.rewardsHtml(),zone=root.querySelector('[data-reward-zone]');
  if(!zone)return;zone.outerHTML=html;this.bindRewards(root);
 }
 showHelp(){
  const gm=hasGM();
  return infoDialog('Quest Log Help',`<p><strong>Quest Log</strong> shows the quests, work orders and contracts your party is working on.</p>
  <h3>Party and Individual</h3><ul><li><strong>Party</strong> lists the quests the whole party can see. Pick one to read its objectives; choose a character in the <em>Character notes</em> heading to write that character's notes.</li><li><strong>Individual</strong> lists a character's own quests; choose the character in the toolbar.</li><li>Tick <em>Track</em> on a quest to show it in your objectives overlay. <em>Show objectives overlay</em> (right of the toolbar) shows or hides it. Drag the overlay by its header to move it; the slider fades its background (text stays solid); the minus button by a quest stops tracking it. Its place and fade are kept for you only.</li>${gm?'<li>Players see only the quests you reveal; Journal and Actor permissions apply.</li>':''}</ul>
  <h3>Journal</h3><p>Session notes. <em>New session</em> starts one with a party journal and a journal for each player${gm?'':' (a player needs a GM connected for this)'}. Pick a session on the left; ${gm?'choose <em>Whose journal</em> to read':'switch between <em>My journal</em> and <em>Party journal</em>'} above the book. Your own journal is only yours${gm?' (the GM can read it)':''}; everyone can write the party journal. Pages save when you click away and with <em>Save</em> (Ctrl+S). The GM and whoever started a session can rename it (pencil).${gm?' <em>Export Markdown</em> and <em>Archive session</em> sit under the session title.':''}</p>
  ${gm?`<h3>Quests (GM)</h3><ul><li>Every quest as a card. The views under the tabs (All, Drafts, Hidden, Active, Completed / Failed, Orders, Contracts) show counts and are remembered for you, with your sort and grouping. Search matches title, location, giver and tags; <em>Filters</em> opens type, location, level, region, giver and visibility; group by status, location, type, level, region or giver.</li><li>Tick cards to set status, hide, reveal, duplicate or delete several at once; the actions appear in a row above the list (drafts are never revealed that way).</li><li>Pick a card to edit it. Its sections fold open and closed, and one <em>Save changes</em> at the bottom saves the whole quest. Objective progress and rewards are GM controlled; nothing is granted automatically. Drafts stay GM only.</li><li>Item rewards save as you change them (<em>Applies now</em>). Delegated assignments have their own section and <em>Save assignment</em>.</li><li>General Manager is the usual way to import quest files. Quest Log's own <em>Import JSON…</em> is under <em>Advanced</em> at the end of the list; it shows what a file adds before writing anything.</li></ul>
  <h3>GM Setup</h3><p>Player access (whether players see the Quest Log) and other settings; they save together with <em>Save Changes</em>.</p>
  <p>Deleting a quest or an assignment, or leaving a quest with unsaved changes, asks you to confirm first.</p>`:''}`);
 }
 // Appearance is inherited: the kit's --ag-* tokens live on the document, kept in sync by General Manager when active.
 // 0.14.0 A redraw keeps each panel's scroll place and the field being typed in (view-state.mjs). Unsaved text is put
 // back only for a redraw someone else caused (updateWindows), and focus only while the same tab and quest are shown.
 viewScope(){return [this.tab,this.gmId,this.selectedId,this.actorId].map(x=>x??'').join('|');}
 _replaceHTML(result,content){
  this.scrollMemo??={};
  const focus=captureView(content,this.scrollMemo),keepText=this.externalRender===true,same=this.lastScope===this.viewScope();
  this.externalRender=false;for(const key of this.forgetScroll??[])delete this.scrollMemo[key];this.forgetScroll=[];
  content.innerHTML=result;this.bind(content);
  restoreView(content,this.scrollMemo,same?focus:null,{keepText});this.lastScope=this.viewScope();
  // A tab picked from the keyboard keeps focus on the tab row after the redraw.
  if(this.focusTab){content.querySelector?.(`#agq-tab-${this.focusTab}`)?.focus?.();this.focusTab=null;}
 }
 bind(root){
   const tablist=root.querySelector('nav.ag-tabs');if(tablist)bindTablist(tablist);
   for(const b of root.querySelectorAll('[data-tab]'))b.addEventListener('click',async e=>{const tab=e.currentTarget.dataset.tab;if(!await this.flushJournal())return;if(!await this.guard.confirm())return;this.tab=tab;this.focusTab=tab;this.sourceJsonEdited=false;await this.render();});
   root.querySelector('#ag-actor')?.addEventListener('change',async e=>{this.actorId=e.target.value;this.selectedId=null;await this.render();});
   root.querySelector('#ag-player-filter')?.addEventListener('change',async e=>{this.statusFilter=e.target.value;this.selectedId=null;await this.render();});
   this.bindToolbar(root);this.bindNav(root);
   this.bindPicks(root);
   bindFolds(root,this.ui);bindRadios(root.querySelector('.agq-subnav'));
   bindFileButtons(root,files=>this.importFile(files[0]).catch(notifyError));
   // QL-09 The individual character only shows for an individual quest.
   root.querySelector('#ag-scope')?.addEventListener('change',e=>{const f=root.querySelector('[data-actor-field]');if(f){f.hidden=e.target.value!=='individual';if(f.hidden)f.setAttribute?.('hidden','');else f.removeAttribute?.('hidden');}});
   root.querySelector('#ag-src-kind')?.addEventListener('change',e=>this.paintKind(root,e.target.value));
   for(const d of root.querySelectorAll('details[data-section]'))d.addEventListener('toggle',()=>{if(this.gmPrefs.sections[d.dataset.section]!==d.open)this.saveGmView({sections:{...this.gmPrefs.sections,[d.dataset.section]:d.open}});});
   const search=root.querySelector('#ag-quest-search');search?.addEventListener('input',()=>{
     this.filter=search.value;const wrap=root.querySelector('#ag-quest-cards');const filtered=roleViewList(this.tab,this.actorId).filter(({view})=>(this.statusFilter==='all'||view.status===this.statusFilter)&&[view.name,view.summary,view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));
     wrap.innerHTML=cards(filtered,this.selectedId);root.querySelector('#ag-quest-count').textContent=`${filtered.length} ${filtered.length===1?'match':'matches'}`;
     wrap.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
   });
   root.querySelector('#ag-source-json')?.addEventListener('input',()=>this.markJsonEdited(root));
   if(this.sourceJsonEdited)this.markJsonEdited(root);
   // Any edit in the quest editor (not item rewards or assignments, which save on their own) marks it unsaved.
   const editor=root.querySelector('.agq-source');
   for(const ev of ['input','change'])editor?.addEventListener(ev,e=>{if(e.target?.closest?.('[data-reward-zone],[data-assignments]'))return;if(e.target?.tagName==='DETAILS')return;this.markDirty(root);});
   const setupBody=root.querySelector('.agq-setup__body'),setupStatus=root.querySelector('.agq-setup .ag-footer__status');
   for(const ev of ['input','change'])setupBody?.addEventListener(ev,e=>{if(e.target?.id&&setupStatus)setupStatus.textContent='Unsaved changes';});
   for(const b of root.querySelectorAll('[data-action]:not([data-reward-zone] *)'))b.addEventListener('click',()=>this.action(b,root));
   this.bindRewards(root);
   if(this.tab==='journal')this.bindJournal(root);
 }
 // Unsaved journal text is saved before the window closes; unsaved quest edits ask first (QL-14).
 async close(options){
  if(!await this.guard.confirm())return this;
  try{await this.flushJournal();}catch(err){console.error(`[${MOD}]`,err);}
  this.jSelection?.abort?.();return super.close(options);
 }
 // QL-10 Once the source JSON is edited it is what Save changes saves: the save bar says so and the form fields are marked.
 markJsonEdited(root){
  const first=!this.sourceJsonEdited;this.sourceJsonEdited=true;if(first)this.markDirty(root);
  const st=root.querySelector('[data-source-status]');if(st)st.textContent='Saving from JSON; form edits are ignored';
  for(const el of root.querySelectorAll('.agq-source input, .agq-source select, .agq-source textarea'))if(el.id!=='ag-source-json'&&!el.closest?.('[data-reward-zone]'))el.setAttribute('aria-disabled','true');
 }
 // A new quest's Type change shows its own fields at once, in place, so typed edits, the unsaved note and focus stay.
 // An ID still on the old Type's prefix moves to the new one (QUEST-FOO becomes ORDER-FOO); any other typed ID stays.
 paintKind(root,kind){
  for(const f of root.querySelectorAll('[data-kind-field]')){f.hidden=f.dataset.kindField!==kind;if(f.hidden)f.setAttribute?.('hidden','');else f.removeAttribute?.('hidden');}
  const id=root.querySelector('#ag-src-id'),next=KIND_PREFIX[kind];
  if(id&&next&&id.getAttribute?.('readonly')==null){
   const m=String(id.value).match(/^(QUEST|ORDER|CONTRACT)-(.*)$/i);if(m&&m[1].toUpperCase()!==next)id.value=`${next}-${m[2]}`;
  }
  const hint=root.querySelector('details[data-section="basics"] .ag-fold__hint');if(hint)hint.textContent=KIND_LABELS[kind]||kind;
 }
 // The unsaved state shows in the save bar, the editor header and on the editor itself.
 markDirty(root){
  this.unsavedSource=true;
  const st=root.querySelector('[data-source-status]');if(st)st.textContent=this.sourceJsonEdited?'Saving from JSON; form edits are ignored':'Unsaved changes';
  root.querySelector('.agq-savebar')?.classList?.add('is-dirty');root.querySelector('.agq-edit')?.classList?.add('is-dirty');
  const badge=root.querySelector('.agq-dirty-badge');if(badge){badge.hidden=false;badge.removeAttribute?.('hidden');}
 }
 // Views, filters, sort and group redraw the list only, so the editor and its unsaved edits stay.
 bindToolbar(root){
  for(const [id,key] of [['type','type'],['location','location'],['level','level'],['region','region'],['giver','giver'],['visible','visible'],['sort','sort'],['group','group']])root.querySelector(`#ag-gm-${id}`)?.addEventListener('change',e=>{this.qv[key]=e.target.value;if(key==='sort'||key==='group')this.saveGmView({[key]:e.target.value});this.paintFilterCount(root);this.paintList(root);});
  const gmSearch=root.querySelector('#ag-gm-search');gmSearch?.addEventListener('input',()=>{this.qv.search=gmSearch.value;this.paintList(root);});
 }
 bindNav(root){
  for(const b of root.querySelectorAll('[data-qv-nav]'))b.addEventListener('click',()=>{this.qv.nav=b.dataset.qvNav;this.saveGmView({nav:this.qv.nav});this.paintNav(root);this.paintList(root);});
 }
 paintNav(root){for(const x of root.querySelectorAll('[data-qv-nav]')){const on=x.dataset.qvNav===this.qv.nav;x.setAttribute('aria-checked',String(on));x.setAttribute('tabindex',on?'0':'-1');}}
 // Clear filters puts the toolbar controls back too (redrawn and rebound), then the list.
 paintToolbar(root){
  const bar=root.querySelector('.agq-bars');if(!bar)return;
  const {locations,levels,regions,givers,shown,total}=gmList(this.qv);
  bar.outerHTML=questsToolbar(this.qv,locations,{shown,total,filtersOpen:this.filtersOpen,levels,regions,givers});
  for(const b of root.querySelector('.agq-bars')?.querySelectorAll('[data-action]')??[])b.addEventListener('click',()=>this.action(b,root));
  this.bindToolbar(root);this.paintNav(root);this.paintList(root);
 }
 paintFilterCount(root){const label=root.querySelector('[data-filter-label]');if(label)label.textContent=filterLabel(filterCount(this.qv));}
 // Filters (n) opens or closes the second toolbar row without a redraw; the choice is kept per user.
 toggleFilters(root){
  this.filtersOpen=!this.filtersOpen;this.ui.set('filtersOpen',this.filtersOpen);
  const row=root?.querySelector?.('#ag-gm-filters');if(row){row.hidden=!this.filtersOpen;if(row.hidden)row.setAttribute?.('hidden','');else row.removeAttribute?.('hidden');}
  root?.querySelector?.('#ag-gm-filters-toggle')?.setAttribute?.('aria-expanded',String(this.filtersOpen));
 }
 paintList(root){
  const {groups,shown,total,ids}=gmList(this.qv);this.shownIds=ids;
  const wrap=root.querySelector('#ag-gm-cards');if(!wrap)return;
  wrap.innerHTML=questCards(groups,this.gmId,{total,picked:this.picked});
  const count=root.querySelector('#ag-gm-count');if(count)count.textContent=`${shown} of ${total} quests`;
  this.paintBulk(root);
  wrap.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
  this.bindPicks(root,wrap);
 }
 paintBulk(root){
  for(const [sel,html] of [['#ag-gm-bulk',bulkBar(this.picked.size,this.shownIds.length)],['#ag-gm-bulkhint',bulkHint(this.picked.size,this.shownIds.length)]]){
   const bar=root.querySelector(sel);if(!bar)continue;bar.outerHTML=html;
   root.querySelector(sel)?.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
  }
 }
 bindPicks(root,scope=root){
  for(const box of scope.querySelectorAll('[data-pick]'))box.addEventListener('change',()=>{
   const id=box.dataset.pick;box.checked?this.picked.add(id):this.picked.delete(id);
   box.closest?.('.agq-card')?.classList?.[box.checked?'add':'remove']('is-picked');
   this.paintBulk(root);
  });
 }
 // 0.17.0 Import JSON… (QL-13): shows what the file adds, then imports through the same GM-only path as General Manager's
 // importer. Quests already in this world are kept as they are; no campaign state is overwritten.
 async importFile(file){
  assertGM(game.user);if(!file)return;
  let raw;try{raw=JSON.parse(await file.text());}catch{throw new Error('That file is not a JSON quest file. Nothing was imported.');}
  const plan=previewQuestImport(raw);
  if(plan.errors.length)return await infoDialog('Nothing imported',`<ul>${plan.errors.map(e=>`<li>${E(hideIds(e))}</li>`).join('')}</ul>`);
  const add=plan.rows.filter(r=>r.action==='new'),keep=plan.rows.filter(r=>r.action==='skip');
  if(!add.length)return await infoDialog('Nothing to import',`<p>Every quest in this file is already in this world (${keep.length}). Nothing was changed.</p>`);
  const q=n=>`${n} ${n===1?'quest':'quests'}`;
  const lines=[`Adds ${q(add.length)}: ${add.map(r=>r.name||UNTITLED).join(', ')}.`,keep.length?`Already here, kept as is: ${keep.map(r=>r.name||UNTITLED).join(', ')}.`:'',...plan.warnings.map(w=>hideIds(w,plan.rows)),'New quests start Hidden. No campaign state is overwritten.'].filter(Boolean);
  if(!await confirmDialog(lines.join('\n'),{title:`Import ${q(add.length)}?`,yes:`Import ${q(add.length)}`}))return;
  const report=await importQuests(raw,{mode:'skip'});
  const failed=report.failed.map(f=>hideIds(`${f.id}: ${f.reason}`,plan.rows));
  if(failed.length)await infoDialog('Import finished',`<p>${E(q(report.created.length))} imported.</p><ul>${failed.map(f=>`<li>${E(f)}</li>`).join('')}</ul>`);
  else ui.notifications.info(`${q(report.created.length)} imported. No campaign state was overwritten.`);
  return await this.render();
 }
 // 0.15.0 Bulk actions on the ticked quests. Each quest is saved through the same GM-checked store calls as the editor.
 async bulk(kind,root){
  if(kind==='all'){this.picked=new Set(this.shownIds);return this.paintList(root);}
  if(kind==='clear'){this.picked.clear();return this.paintList(root);}
  const entries=stateForGM(),ids=[...this.picked].filter(id=>entries.some(e=>e.source.id===id));
  if(!ids.length)throw new Error('Tick one or more quests first.');
  // A bulk action redraws the window; it never runs over unsaved edits in the editor.
  if(this.unsavedSource)throw new Error('Save or cancel your changes to the open quest first.');
  const status=kind==='status'?root.querySelector('#ag-bulk-status')?.value||null:null;
  const plan=planBulk(kind,entries,ids,{status});
  if(!plan.changes.length)return await infoDialog('Nothing to change',`<ul>${plan.skipped.map(s=>`<li><strong>${E(s.name)}</strong>: ${E(s.reason)}</li>`).join('')}</ul>`);
  const n=plan.changes.length,q=n===1?'quest':'quests';
  const ask={status:{title:`Set ${n} ${q} to ${status}?`,yes:`Set ${n} to ${status}`},reveal:{title:`Reveal ${n} ${q}?`,yes:`Reveal ${n} ${q}`},delete:{title:`Delete ${n} ${q}?`,yes:`Delete ${n} ${q}`,danger:true}}[kind];
  if(ask&&!await (ask.danger?confirmDanger:confirmDialog)(confirmText(kind,plan,{status}),ask))return;
  const res=await runBulk(kind,plan,{updateState,saveRecord,removeRecord,existingIds:new Set(entries.map(e=>e.source.id)),sourceOf:id=>getPrivate(id)?.getFlag(MOD,'source')});
  if(kind==='delete'||kind==='duplicate'){for(const d of res.done)this.picked.delete(d.id);}
  if(kind==='delete'&&res.done.some(d=>d.id===this.gmId)){this.gmId=null;this.unsavedSource=false;}
  const left=[...plan.skipped,...res.failed.map(f=>({...f,reason:`Not changed: ${f.reason}`}))];
  const verb={status:`set to ${status}`,hide:'hidden from players',reveal:'revealed',duplicate:'copied as drafts',delete:'deleted'}[kind];
  if(left.length)await infoDialog('Bulk action finished',`<p>${res.done.length} ${res.done.length===1?'quest':'quests'} ${E(verb)}.</p><ul>${left.map(s=>`<li><strong>${E(s.name)}</strong>: ${E(s.reason)}</li>`).join('')}</ul>`);
  else ui.notifications.info(`${res.done.length} ${res.done.length===1?'quest':'quests'} ${verb}.`);
  return await this.render();
 }
 async action(btn,root){
  try{const action=btn.dataset.action,id=btn.dataset.id;
   if(action==='select'){this.selectedId=id;return await this.render();}
   if(action==='open-location'){const api=game.modules.get('ashen-gate-locations')?.api;if(!api?.openLocation)throw new Error('Locations is not active.');return await api.openLocation(id);}
   if(action==='help')return await this.showHelp();
   if(action==='toggle-overlay'){assertUI(game.user,openAllowed());await changeTracking({visible:!trackerVisible()});return await this.render();}
   if(action==='track'){assertUI(game.user,openAllowed());if(!visibleById(id))throw new Error('Quest is no longer visible.');const ids=trackedIds();await changeTracking({ids:btn.checked?[...ids,id]:ids.filter(x=>x!==id)});return await this.render();}
   if(action==='save-note'){
     assertUI(game.user,openAllowed());await savePersonalNote(this.selectedId,this.actorId,root.querySelector('#ag-my-note')?.value||'');ui.notifications.info('Character notes saved.');return;
   }
   assertGM(game.user);
   if(action==='copy-id'){try{await navigator.clipboard.writeText(String(id));ui.notifications.info('ID copied.');}catch{ui.notifications.warn('Could not copy. Select the ID and copy it by hand.');}return;}
   if(action==='gm-select'){if(!await this.guard.confirm())return;this.gmId=id;this.rewardNote='';this.grantOpen=false;this.sourceJsonEdited=false;return await this.render();}
   if(action==='new'){if(!await this.guard.confirm())return;this.gmId=null;this.forgetScroll=['gm-edit:new'];this.rewardNote='';this.grantOpen=false;this.unsavedSource=false;this.sourceJsonEdited=false;return await this.render();}
   // 0.15.0 One save for the whole quest: definition and campaign state are written together (one record write).
   if(action==='save-quest'||action==='save-source'||action==='save-state'){
    const existing=this.gmId?getPrivate(this.gmId):null;
    if(this.gmId&&!existing)throw new Error('Objective not found.');
    const current=existing?.getFlag(MOD,'source')??null;
    const src=this.sourceJsonEdited?validSource(JSON.parse(root.querySelector('#ag-source-json').value)):sourceFromForm(root,current);
    if(this.gmId&&src.id!==this.gmId)throw new Error('Cannot change permanent ID of an existing Objective. Use New quest.');
    const state=stateFromForm(root,src,existing?.getFlag(MOD,'state')??initialState(src));
    await saveRecord(src,{replace:!!this.gmId,state});
    // A new quest gets its id now: its editor keeps the place it was drafted at, and focus stays where it was.
    const created=!this.gmId;this.gmId=src.id;
    if(created){this.scrollMemo??={};captureView(root,this.scrollMemo);if(this.scrollMemo['gm-edit:new'])this.scrollMemo[`gm-edit:${src.id}`]=this.scrollMemo['gm-edit:new'];this.lastScope=this.viewScope();}
    this.unsavedSource=false;this.sourceJsonEdited=false;
    // Completed with something still owed: open Give rewards (the status is already saved; Not now leaves it pending).
    if(state.status==='Completed'&&(await grantableRewards(this.gmId)).some(r=>r.grantable))this.grantOpen=true;
    ui.notifications.info(publicView(src,state)?'Quest saved. It is published to its audience.':'Quest saved. Players cannot see it.');return await this.render();
   }
   if(action==='add-objective'){
     const wrap=root.querySelector('#ag-source-objective-list');const used=new Set([...wrap.querySelectorAll('.ag-src-obj-key')].map(x=>x.value));let n=1;while(used.has(`step_${n}`))n++;wrap.insertAdjacentHTML('beforeend',objectiveFormRow({key:`step_${n}`,goal:'New objective',visibility:'player'}));return this.markDirty(root);
   }
   if(action.startsWith('bulk-'))return await this.bulk(action.slice(5),root);
   if(action==='cancel-edit'){if(!await this.guard.confirm())return;this.sourceJsonEdited=false;return await this.render();}
   if(action==='toggle-filters')return this.toggleFilters(root);
   if(action==='clear-filters'){this.qv={...DEFAULT_VIEW,sort:this.qv.sort,group:this.qv.group};this.saveGmView({nav:'all'});return root?.querySelector?.('.agq-toolbar')?this.paintToolbar(root):await this.render();}
   // GM Setup: every setting saves together with Save Changes (D4). Nothing is written until then; a bad pack ID saves nothing.
   if(action==='save-setup'){
     const access=!!root.querySelector('#ag-player-access')?.checked,ids=parsePackIds(root.querySelector('#ag-compendium-packs')?.value??'').join(',');
     const packsChanged=ids!==String(game.settings.get(MOD,'compendiumPackIds')||''),openFor=!!root.querySelector('#ag-open-for-players')?.checked;
     if(access!==!!game.settings.get(MOD,'playerAccessEnabled'))await game.settings.set(MOD,'playerAccessEnabled',access);
     if(openFor!==(game.settings.get(MOD,'openForPlayers')===true))await game.settings.set(MOD,'openForPlayers',openFor);
     if(packsChanged)await game.settings.set(MOD,'compendiumPackIds',ids);
     ui.notifications.info(packsChanged?'GM Setup saved. Reload Foundry to apply the compendium change.':'GM Setup saved.');return await this.render();
   }
   if(action==='cancel-setup')return await this.render();
   if(action==='remove-reward'){
    const name=btn.closest('[data-reward-key]')?.querySelector('.agq-reward__name')?.textContent||'this item';
    if(!await confirmDanger(`A held copy in the rewards folder is deleted too. Items already on characters are not touched.`,{title:`Remove ${name}?`,yes:'Remove reward'}))return;
    await removeReward(this.gmId,btn.dataset.key);return await this.refreshRewards(root,'Saved');
   }
   if(action==='open-grant'){this.grantOpen=true;return await this.refreshRewards(root,this.rewardNote);}
   if(action==='close-grant'){this.grantOpen=false;return await this.refreshRewards(root,this.rewardNote);}
   if(action==='grant-rewards'){
    const choices=this.grantChoices(root.querySelector('[data-grant-panel]')??root),cache=this.rewardCache;
    const summary=grantSummary(cache?.owed??[],choices,{individual:cache?.individual});
    if(summary.problems.length)throw new Error(summary.problems.join(' '));
    const lines=summary.receive.map(p=>`${p.name}: ${p.items.map(i=>`${i.quantity} × ${i.name}`).join(', ')}`);
    if(!await confirmDialog(`These characters receive new items:\n${lines.join('\n')}\nNothing is taken from anyone.`,{title:'Give these rewards?',yes:'Grant rewards'}))return;
    const res=await grantRewards(this.gmId,choices);this.grantOpen=false;
    const out=res.results.map(r=>`<li><strong>${E(r.name)}</strong>: ${r.ok?(r.items.length?r.items.map(i=>`${E(i.quantity)} × ${E(i.name)}`).join(', '):'already had everything'):`not given. ${E(r.reason)}`}</li>`).join('');
    await this.refreshRewards(root,'Saved');
    return await infoDialog('Rewards given',`<ul>${out||'<li>Nothing was given.</li>'}</ul>`);
   }
   if(action==='grant-again'){
    const name=btn.closest('[data-reward-key]')?.querySelector('.agq-reward__name')?.textContent||'this reward';
    if(!await confirmDialog(`Give ${name} again? It becomes grantable once more; what characters already have is kept.`,{title:'Give this reward again?',yes:'Grant again'}))return;
    await grantAgain(this.gmId,btn.dataset.key,{confirm:true});this.grantOpen=true;return await this.refreshRewards(root,'Saved');
   }
   // QL-07 Load into editor: the record goes into the assignment JSON, which takes focus and says what is being edited.
   if(action==='edit-assignment'){const record=getAssignment(id);const textarea=root.querySelector('#ag-assignment-json');if(!record||!textarea)throw new Error('Assignment unavailable');
    textarea.value=JSON.stringify(record,null,2);const st=root.querySelector('[data-assign-status]');if(st)st.textContent='Editing a saved assignment';
    textarea.scrollIntoView?.({block:'nearest'});textarea.focus?.();return;}
   if(action==='cancel-assignment'){const textarea=root.querySelector('#ag-assignment-json');if(textarea)textarea.value=JSON.stringify(blankAssignment(this.gmId),null,2);const st=root.querySelector('[data-assign-status]');if(st)st.textContent='New assignment';return;}
   if(action==='save-assignment'){const source=JSON.parse(root.querySelector('#ag-assignment-json').value);if(source.objective_id!==this.gmId)throw new Error('Assignment target must be the selected Objective');await saveAssignment(source,{replace:!!getAssignment(source.id),objectiveExists:id=>!!getPrivate(id),ensureFolder});ui.notifications.info('Delegated Assignment saved.');return await this.render();}
   if(action==='remove-assignment'){if(!await confirmDanger(`This cannot be undone.`,{title:'Delete this assignment?',yes:'Delete assignment'}))return;await removeAssignment(id);return await this.render();}
   if(action==='delete'){const name=getPrivate(this.gmId)?.getFlag(MOD,'source')?.name||'this quest';if(!await confirmDanger(`This removes its published Quest Log view. Character-owned notes are kept.`,{title:`Delete ${name}?`,yes:'Delete quest'}))return;await removeRecord(this.gmId);this.gmId=null;this.unsavedSource=false;this.sourceJsonEdited=false;return await this.render();}
   if(action==='export'){return dialogDownload('AG_Quest_Source_v0.4.0.json',JSON.stringify(exportPackage(allPrivate().map(x=>x.source)),null,2));}
  }catch(err){notifyError(err);}
 }
}
installJournal(QuestLogApplication,{store:journalStore,danger:confirmDanger,notify:notifyError,info:m=>ui.notifications?.info(m),download:dialogDownload});
// Per-user preferences only. Never store the authoritative progress, private source or player projection.
function trackedIds(){return trackingState(game.user?.getFlag?.(MOD,'tracking')).ids;}
function trackerVisible(){return trackingState(game.user?.getFlag?.(MOD,'tracking')).visible;}
async function changeTracking(patch){
 assertUI(game.user,openAllowed());
 if(typeof game.user?.setFlag!=='function')throw new Error('User flag persistence unavailable for Quest tracking.');
 const current=trackingState(game.user.getFlag(MOD,'tracking'));
 const next=trackingState({...current,...patch});
 for(const id of next.ids)if(!validTrackedId(id))throw new Error('Invalid tracked quest ID.');
 await game.user.setFlag(MOD,'tracking',next);renderTracker();
 return trackedSnapshot();
}
function trackedSnapshot(){
 assertUI(game.user,openAllowed());
 return structuredClone(selectTrackedViews(visibleViews().map(x=>x.view),trackedIds()));
}
// 0.14.0 The overlay can be dragged by its header (kept on screen), fades its background with the slider and has a
// remove button per quest. Its place and fade are this user's (User flag `overlay`); text and header stay opaque.
const overlayPrefs=()=>overlayState(game.user?.getFlag?.(MOD,'overlay'));
async function saveOverlay(patch){
 assertUI(game.user,openAllowed());
 if(typeof game.user?.setFlag!=='function')throw new Error('User flag persistence unavailable for the objectives overlay.');
 const next=overlayState({...overlayPrefs(),...patch});await game.user.setFlag(MOD,'overlay',next);return next;
}
const screenSize=()=>({width:globalThis.innerWidth||document.documentElement?.clientWidth||0,height:globalThis.innerHeight||document.documentElement?.clientHeight||0});
function moveTracker(el,pos){
 if(!el?.style)return null;
 const at=clampPosition(pos,{width:el.offsetWidth,height:el.offsetHeight},screenSize());
 el.style.left=`${at.left}px`;el.style.top=`${at.top}px`;el.style.right='auto';return at;
}
function placeTracker(el){const pos=overlayPrefs();if('left' in pos)moveTracker(el,pos);}
function fadeTracker(el,value){el?.style?.setProperty?.('--agq-tracker-alpha',`${clampOpacity(value)}%`);}
function bindTrackerDrag(el){
 const head=el.querySelector?.('.agq-tracker__head');if(typeof head?.addEventListener!=='function')return;
 head.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target?.closest?.('button,input,label'))return;
  e.preventDefault();
  const box=el.getBoundingClientRect(),dx=e.clientX-box.left,dy=e.clientY-box.top;let last=null;
  const move=ev=>{last=moveTracker(el,{left:ev.clientX-dx,top:ev.clientY-dy});};
  const up=()=>{for(const [ev,fn] of [['pointermove',move],['pointerup',up],['pointercancel',up]])globalThis.removeEventListener(ev,fn);
   el.classList?.remove('is-dragging');if(last)saveOverlay(last).catch(notifyError);};
  for(const [ev,fn] of [['pointermove',move],['pointerup',up],['pointercancel',up]])globalThis.addEventListener(ev,fn);
  el.classList?.add('is-dragging');
 });
}
const trackerTip=t=>` aria-label="${E(t)}" data-tooltip="${E(t)}" data-tooltip-class="ag-tooltip"`;
function renderTracker(){
 if(typeof document?.querySelector!=='function')return;
 const old=document.querySelector('#ag-quest-objectives-overlay');
 if(!openAllowed()||!trackerVisible()){old?.remove();return;}
 const views=trackedSnapshot(),prefs=overlayPrefs();
 if(!old&&typeof document.createElement!=='function')return;
 const el=old||document.createElement('aside');el.id='ag-quest-objectives-overlay';el.className='agq-tracker';
 el.setAttribute('aria-label','Tracked quest objectives');
 const mark=o=>o.complete?' <i class="fa-solid fa-check" role="img" aria-label="Complete"></i>':o.failed?' <i class="fa-solid fa-xmark" role="img" aria-label="Failed"></i>':'';
 const fade='Overlay background (only for you): 100% solid, 0% see-through. Text stays solid.';
 el.innerHTML=`<header class="agq-tracker__head"${tipAttr('Drag to move')}><strong>Tracked objectives</strong><span class="agq-tracker__tools"><label class="agq-tracker__fade"${tipAttr(fade)}><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i><input type="range" min="0" max="100" step="5" value="${prefs.opacity}" data-overlay-opacity aria-label="${E(fade)}"></label><button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agq-tracker__close" data-hide-tracker${trackerTip('Hide objectives overlay')}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></span></header><div class="agq-tracker__body">${views.length?views.map(v=>`<section data-quest="${E(v.id)}"><div class="agq-tracker__quest"><span><strong>${E(v.name)}</strong><small>${E(v.status)}</small></span><button type="button" class="ag-btn ag-btn--ghost ag-btn--icon ag-btn--sm" data-untrack="${E(v.id)}"${trackerTip(`Stop tracking ${v.name}`)}><i class="fa-solid fa-circle-minus" aria-hidden="true"></i></button></div><ul>${v.objectives.map(o=>`<li class="${o.complete?'is-complete':o.failed?'is-failed':''}">${E(o.goal)}${mark(o)}</li>`).join('')||'<li>No revealed objectives</li>'}</ul></section>`).join(''):'<p>No tracked quests are currently visible to you.</p>'}</div>`;
 const after=()=>instance?.rendered&&instance.render();
 el.querySelector('[data-hide-tracker]')?.addEventListener('click',()=>changeTracking({visible:false}).then(after).catch(notifyError));
 for(const b of el.querySelectorAll?.('[data-untrack]')??[])b.addEventListener('click',()=>changeTracking({ids:trackedIds().filter(x=>x!==b.dataset.untrack)}).then(after).catch(notifyError));
 const slider=el.querySelector?.('[data-overlay-opacity]');
 slider?.addEventListener?.('input',()=>fadeTracker(el,slider.value));
 slider?.addEventListener?.('change',()=>saveOverlay({opacity:clampOpacity(slider.value)}).catch(notifyError));
 fadeTracker(el,prefs.opacity);bindTrackerDrag(el);
 if(!old)document.body?.append(el);
 placeTracker(el);
}
async function open(){assertUI(game.user,openAllowed());if(!instance||!instance.rendered)instance=new QuestLogApplication();await instance.render({force:true});return instance;}
async function openObjective(id){assertUI(game.user,openAllowed());const found=visibleById(id);if(!found)return {status:'not_found'};await open();instance.tab=found.view.scope==='individual'?'individual':'party';instance.actorId=found.view.scope==='individual'?found.view.actorId:instance.actorId;instance.selectedId=id;await instance.render();return {status:'opened'};}
function locationList(id){return visibleViews().filter(x=>Array.isArray(x.view.locationIds)&&x.view.locationIds.includes(id)).map(x=>structuredClone(x.view));}
function refreshLaunchers(){
 if(!openAllowed()&&!hasGM())document.querySelectorAll?.('[data-ag-launcher="ashen-gate-quest-manager"]').forEach(x=>x.remove());
 if(ui?.actors?.element)addLauncher(ui.actors,ui.actors.element);
 if(!openAllowed()&&instance?.rendered&&!hasGM())instance.close();
 renderTracker();
}
function addLauncher(app,html){
 mountLauncher(launcherRoot(app,html),{moduleId:MOD,label:'Quest Log',title:'Quest Log',icon:'fa-solid fa-scroll',onClick:()=>open().catch(notifyError),visible:openAllowed()});
}
/* ---- 0.8.0: embed API. A partner module (Character Hub) mounts this character's quest view into its own element:
   the Party quests and the character's Individual quests, the selected quest's objectives, locations, party notes and
   character notes, with Track and Save Character Notes. Same functions and checks as the Quest Log window. ---- */
const EMBED_MODES=new Set(['character']);
const EMBED_ACTIONS=new Set(['select','track','save-note','open-location']);
const embeds=new Set();
function embedHTML(ctrl){
 if(!openAllowed())return emptyState('Quest Log is hidden','Your GM has hidden the Quest Log for now.',{iconName:'fa-eye-slash'});
 const party=roleViewList('party',ctrl.actorId),mine=ctrl.actorId?roleViewList('individual',ctrl.actorId):[];
 const q=ctrl.filter.trim().toLowerCase(),match=({view})=>!q||[view.name,view.summary,view.id].some(t=>String(t??'').toLowerCase().includes(q));
 const shownParty=party.filter(match),shownMine=mine.filter(match),all=[...shownParty,...shownMine];
 if(!all.some(x=>x.view.id===ctrl.selectedId))ctrl.selectedId=all[0]?.view.id??null;
 const detail=all.find(x=>x.view.id===ctrl.selectedId)?.view??null;
 const actor=ctrl.actorId?game.actors.get(ctrl.actorId):null;
 const none=["No quests here yet","Your GM hasn't revealed any yet."];
 return `<div class="agq-embed__main"><aside class="agq-embed__list"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="ag-quest-search" placeholder="Search quests" aria-label="Search visible quests" value="${E(ctrl.filter)}"></label>
  <h3 class="ag-eyebrow agq-group__head">Party <span class="agq-group__count">${party.length}</span></h3>${cards(shownParty,ctrl.selectedId,{empty:none})}
  <h3 class="ag-eyebrow agq-group__head">${E(actor?.name??'Character')} <span class="agq-group__count">${mine.length}</span></h3>${cards(shownMine,ctrl.selectedId,{empty:none})}
  <div>${safeButton('Open Quest Log','open-log',{sm:true,icon:'fa-up-right-from-square'})}</div></aside>
  <section class="agq-embed__reading">${readableDetail(detail,ctrl.actorId)}</section></div>`;
}
/** api.embed.mount(element, {actorId, mode:'character'}) → {unmount, refresh}. */
function mountEmbed(element,{actorId=null,mode='character'}={}){
 if(!element||typeof element.addEventListener!=='function')throw new TypeError('mount needs a DOM element.');
 if(!EMBED_MODES.has(mode))throw new Error(`Unknown embed mode "${mode}". Supported: ${[...EMBED_MODES].join(', ')}.`);
 const abort=new AbortController(),on=(ev,fn)=>element.addEventListener(ev,fn,{signal:abort.signal});
 const ctrl={actorId:actorId?String(actorId):null,selectedId:null,filter:'',mounted:true};
 // ag-quest-embed is the pre-0.10 name, kept for one release (no styles hang on it any more).
 element.classList?.add('agq-embed','ag-quest-embed');
 ctrl.render=async()=>{
  if(!ctrl.mounted)return;
  if(element.isConnected===false){ctrl.unmount();return;}
  const search=element.querySelector?.('#ag-quest-search'),at=search&&search===globalThis.document?.activeElement?search.selectionStart:null;
  const note=element.querySelector?.('#ag-my-note'),draft=note&&note===globalThis.document?.activeElement?note.value:null;
  element.innerHTML=embedHTML(ctrl);
  if(at!==null){const q=element.querySelector?.('#ag-quest-search');q?.focus?.();q?.setSelectionRange?.(at,at);}
  if(draft!==null){const n=element.querySelector?.('#ag-my-note');if(n){n.value=draft;n.focus?.();}}
 };
 ctrl.unmount=()=>{if(!ctrl.mounted)return;ctrl.mounted=false;abort.abort();embeds.delete(ctrl);element.innerHTML='';element.classList?.remove('agq-embed','ag-quest-embed');};
 on('click',e=>{
  const b=e.target?.closest?.('[data-action]');if(!b||!element.contains(b))return;
  const action=b.dataset.action;
  if(action==='open-log'){e.stopPropagation?.();(ctrl.selectedId?openObjective(ctrl.selectedId):open()).catch(notifyError);return;}
  if(!EMBED_ACTIONS.has(action))return;
  e.stopPropagation?.();
  QuestLogApplication.prototype.action.call(ctrl,b,element);
 });
 on('input',e=>{if(e.target?.id==='ag-quest-search'){ctrl.filter=e.target.value;ctrl.render().catch(notifyError);}});
 on('change',e=>e.stopPropagation?.());
 embeds.add(ctrl);ctrl.render().catch(notifyError);
 return {unmount:ctrl.unmount,refresh:()=>ctrl.render()};
}
const refreshEmbeds=()=>{for(const e of [...embeds])e.render().catch(notifyError);};
function updateWindows(){refreshLaunchers();renderTracker();refreshEmbeds();if(instance?.rendered&&instance.tab==='journal'){instance.journalExternal();return;}if(instance?.rendered&&!instance.unsavedSource){instance.externalRender=true;instance.render().catch(notifyError);}}
// 0.15.0 The GM's Quests view prefs are already shown; saving them needs no redraw.
const onlyGmView=change=>onlyOwnFlags(change)&&Object.keys(change.flags[MOD]??{}).every(k=>k==='gmView'||k==='-=gmView');
const onlyOwnFlags=change=>!!change&&typeof change==='object'&&Object.keys(change).every(k=>k==='_id'||k==='flags')&&!!change.flags&&Object.keys(change.flags).every(k=>k===MOD);
/* ---- 0.14.0 Quest Log never opens a journal on anyone's screen. Its journals are created with renderSheet:false; as a
   backstop a player's client closes a Quest Log journal sheet that opens by itself (first render) within a moment of
   another user writing that journal. Opt-in (GM Setup, off by default): a quest newly revealed to a player opens the
   Quest Log window at it, never the journal. ---- */
const AUTO_OPEN_MS=2000;
const writtenAt=new Map(),seenReveals=new Set();
const questJournal=doc=>{try{return ['public','private','notesFor','session'].some(k=>doc?.getFlag?.(MOD,k));}catch{return false;}};
const journalOf=doc=>doc?.documentName==='JournalEntryPage'?doc.parent:doc;
function noteWrite(doc,userId){const j=journalOf(doc);if(!hasGM()&&j?.id&&userId!==game.user?.id&&questJournal(j))writtenAt.set(j.id,Date.now());}
function closeAutoOpened(app,options){
 if(hasGM())return false;
 const j=journalOf(app?.document??app?.object),at=j?.id?writtenAt.get(j.id):null;
 if(!at||Date.now()-at>AUTO_OPEN_MS||!questJournal(j)||options?.isFirstRender===false)return false;
 app.close?.();return true;
}
function openRevealed(doc,userId){
 if(hasGM()||userId===game.user?.id||!openAllowed()||game.settings.get(MOD,'openForPlayers')!==true)return;
 const view=doc?.getFlag?.(MOD,'public')===true?doc.getFlag(MOD,'view'):null;
 if(!view?.id||seenReveals.has(view.id)||!doc.testUserPermission?.(game.user,'OBSERVER'))return;
 seenReveals.add(view.id);openObjective(view.id).catch(notifyError);
}
// Players have nothing to set for Quest Log: keep it out of their Configure Settings window.
export const PLAYER_SETTINGS_SELECTOR=[`[data-tab="${MOD}"]`,`[data-category="${MOD}"]`,`[data-namespace="${MOD}"]`,`[data-setting-id^="${MOD}."]`,`[data-key^="${MOD}."]`].join(',');
function hideFromPlayerSettings(app,html){
 if(hasGM())return;
 const root=html?.querySelectorAll?html:html?.[0]?.querySelectorAll?html[0]:app?.element;
 for(const el of root?.querySelectorAll?.(PLAYER_SETTINGS_SELECTOR)??[])el.remove();
}
Hooks.on('renderSettingsConfig',hideFromPlayerSettings);
for(const hook of ['renderJournalEntrySheet','renderJournalSheet','renderJournalEntryPageSheet'])Hooks.on(hook,(app,html,ctx,options)=>{closeAutoOpened(app,options);});
Hooks.once('init',()=>{
 game.settings.register(MOD,'compendiumPackIds',{name:'Quest Definitions: Compendium Pack IDs',hint:'GM only: exact compendium collection IDs separated by commas, semicolons or whitespace (e.g. world.quests). Sources are read through the bundled pinned definition resolver; reload required after setting changes.',scope:'world',config:false,type:String,default:''});
 game.settings.register(MOD,'playerAccessEnabled',{name:'Quest Log: Player Access',hint:'Show the player Quest Log interface (new module defaults Hidden). Does not change gameplay, documents or GM access.',scope:'world',config:false,type:Boolean,default:false,onChange:updateWindows});
 game.settings.register(MOD,'openForPlayers',{name:'Quest Log: Open newly revealed quests for players',hint:'GM Setup. Off by default: nothing opens on players\' screens.',scope:'world',config:false,type:Boolean,default:false});
});
Hooks.once('ready',()=>{
 const module=game.modules.get(MOD);
 // A separate, packaged Archie pinned reader is built on GM clients only.
 // Player clients never receive a general source/pack reader through Quest API.
 if(hasGM()) {
  try {
   questDefinitionReader=createQuestDefinitionReader({game,hooks:Hooks,packIds:parsePackIds(game.settings.get(MOD,'compendiumPackIds'))});
   void questDefinitionReader.refreshCompendiums().then(result=>{
    if(result.status!=='ok')console.warn(`[${MOD}] Compendium definitions unavailable (${result.status}).`);
   }).catch(notifyError);
  }catch(err){console.warn(`[${MOD}] Pinned definition resolver unavailable:`,err);}
 }
 objectiveConsumer=createObjectiveConsumer({game,localSource:id=>getPrivate(id)?.getFlag(MOD,'source')??null,
  visibleProjection:visibleById,playerAccessEnabled:()=>openAllowed(),
  definitionResolver:()=>questDefinitionReader?.reader??null,
  packDocumentByUuid:uuid=>questDefinitionReader?.packDocumentByUuid(uuid)??null,
  managerApi:()=>game.modules.get('ashen-gate-manager')?.active?game.modules.get('ashen-gate-manager')?.api?.definitions:null});
 module.api={contract:'ag-objectives/0.1-alpha',version:VERSION,
  open,openObjective,
  embed:{contract:'ag-quest-embed/1',modes:[...EMBED_MODES],mount:mountEmbed},
  tracking:{get:()=>trackedSnapshot(),getState:()=>{assertUI(game.user,openAllowed());return trackingState(game.user?.getFlag?.(MOD,'tracking'));},set:changeTracking},
  consumer:{contract:objectiveConsumer.contract,resolveObjective:objectiveConsumer.resolveObjective,
   refreshCompendiums:async()=>{assertGM(game.user);if(!questDefinitionReader)return {status:'unavailable'};return questDefinitionReader.refreshCompendiums();},
   getDefinitionReaderStatus:()=>{assertGM(game.user);return questDefinitionReader?.status()??{status:'unavailable'};}},
  resolveObjective:(id,options)=>objectiveConsumer.resolveObjective(id,options),
  assignments:{contract:ASSIGNMENT_CONTRACT,list:listAssignments,get:getAssignment,save:(value,options={})=>saveAssignment(value,{...options,objectiveExists:id=>!!getPrivate(id),ensureFolder}),remove:removeAssignment},
  listVisible:({locationId=null}={})=>{assertUI(game.user,openAllowed());return structuredClone(locationId?locationList(locationId):visibleViews().map(x=>x.view));},
  getVisibleObjective:(id)=>{assertUI(game.user,openAllowed());return structuredClone(visibleById(id)?.view??null);},
  // GM-only hand-off used by General Manager's single importer; Quest Log's own Import JSON keeps working.
  previewQuestImport:(payload,options)=>previewQuestImport(payload,options),
  importQuests:(payload,options)=>importQuests(payload,options),
  // Every Quest, Order and Contract regardless of reveal status (Hidden ones included). `status` is the play state; `definitionStatus` is the source's own (draft, approved...).
  listQuests:()=>{assertGM(game.user);return stateForGM().map(x=>({id:x.source.id,name:x.source.name,status:x.state.status,kind:x.source.objective_kind,definitionStatus:x.source.status}));},
  getGMSource:(id)=>{assertGM(game.user);return structuredClone(getPrivate(id)?.getFlag(MOD,'source')??null);},
  getGMState:(id)=>{assertGM(game.user);return structuredClone(getPrivate(id)?.getFlag(MOD,'state')??null);},
  setGMState:(id,patch)=>{assertGM(game.user);return updateState(id,patch);},
  rewards:rewardsApi(),
  // Game Journal (ag-quest-journal/1): every call checks the caller (journal-core.mjs rules) before reading or writing.
  journal:Object.freeze({contract:journalStore.contract,isAvailable:()=>journalAllowed(),list:o=>journalStore.list(o),get:id=>journalStore.get(id),
   pages:id=>journalStore.pages(id),read:(id,target)=>journalStore.read(id,target),write:(id,target,html,o)=>journalStore.write(id,target,html,o),
   create:o=>journalStore.create(o),rename:(id,o)=>journalStore.rename(id,o),archive:id=>journalStore.archive(id),restore:id=>journalStore.restore(id),
   search:q=>journalStore.search(q),exportMarkdown:id=>journalStore.exportMarkdown(id)}),
  playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:MOD,audience:'player',playerAccessEnabled:game.settings.get(MOD,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{assertGM(game.user);if(typeof enabled!=='boolean')throw new Error('Boolean required.');await game.settings.set(MOD,'playerAccessEnabled',enabled);return module.api.playerAccess.getState();}}
 };
 Hooks.on('renderActorDirectory',addLauncher);refreshLaunchers();
 // Drag-out of quest rewards (D8): a GM drop on a sheet is a recorded grant; returning false stops Foundry copying it too.
 Hooks.on('dropActorSheetData',(actor,sheet,data)=>onActorSheetDrop(actor,data));
 Hooks.on('createJournalEntry',(doc,options,userId)=>{noteWrite(doc,userId);openRevealed(doc,userId);updateWindows();});
 Hooks.on('updateJournalEntry',(doc,change,options,userId)=>{noteWrite(doc,userId);updateWindows();});Hooks.on('deleteJournalEntry',updateWindows);
 if(!hasGM())try{for(const {view} of visibleViews())seenReveals.add(view.id);}catch{}
 Hooks.on('updateActor',(actor,change)=>{if(hasGM()&&change?.ownership)reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('deleteActor',(actor)=>{if(hasGM())reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('updateJournalEntryPage',(page,change,options,userId)=>{noteWrite(page,userId);updateWindows();});
 globalThis.addEventListener?.('resize',()=>placeTracker(document.querySelector?.('#ag-quest-objectives-overlay')));
 Hooks.on('createActor',(actor)=>{if(hasGM())reconcileActorAudience().catch(notifyError);});
 // Overlay and tracking prefs are this module's own User flags: they change no audience, so no reconcile for them.
 Hooks.on('updateUser',(user,change)=>{if(user?.id===game.user?.id&&onlyGmView(change))return;if(hasGM()&&!onlyOwnFlags(change))reconcileActorAudience().catch(notifyError);updateWindows();});
  // Game Journal: the primary GM carries out players' New session / rename requests and adds missing player pages.
  game.socket?.on?.(`module.${MOD}`,(msg,senderId)=>{journalStore.onSocket(msg,senderId).catch(notifyError);});
  const addPages=()=>{if(hasGM()&&(game.users?.activeGM?.isSelf??true))journalStore.ensurePages().catch(notifyError);};
  addPages();Hooks.on('createUser',addPages);
  for(const hook of ['createJournalEntryPage','deleteJournalEntryPage'])Hooks.on(hook,updateWindows);
  Hooks.on('updateSetting',setting=>{if(setting?.key==='ashen-gate-character-hub.playerVisibility')updateWindows();});
  renderTracker();
  console.info(`${MOD} ${VERSION} ready (standalone, GM documents + sanitized Journal projections).`);
});
