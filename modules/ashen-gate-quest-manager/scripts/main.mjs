import {MOD,assertGM,assertUI,cleanText,publicView,validSource,exportPackage,STATUSES} from './core.mjs';
import {getPrivate,allPrivate,visibleViews,visibleById,saveRecord,updateState,removeRecord,importSources,previewQuestImport,importQuests,savePersonalNote,reconcileActorAudience,noteText,ensureFolder} from './store.mjs';
import {createObjectiveConsumer} from './resolver-consumer.mjs';
import {createQuestDefinitionReader,parsePackIds} from './pinned-runtime.mjs';
import {ASSIGNMENT_CONTRACT,listAssignments,getAssignment,saveAssignment,removeAssignment} from './assignments.mjs';
import {selectTrackedViews,validTrackedId,trackingState} from './tracking.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';

const VERSION='0.6.1';
let instance=null;
let objectiveConsumer=null;
let questDefinitionReader=null;
const E=cleanText;
const appBase=()=>foundry?.applications?.api?.ApplicationV2;
const openAllowed=()=>game.user?.isGM||game.settings.get(MOD,'playerAccessEnabled');
const hasGM=()=>!!game.user?.isGM;
function actorsOwned(){return [...game.actors].filter(a=>hasGM()||a.testUserPermission(game.user,'OWNER'));}
function notifyError(err){console.error(`[${MOD}]`,err);ui.notifications?.error(err.message??String(err));}
function dialogDownload(name,text){const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function blankTemplate(){return {
 id:'QUEST-',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',
 provenance:{sources:['GM-authored world draft; not approved canon']},visibility:'reveal_gated',refs:[],
 name:'',public_summary:'',source:{description:'GM to specify source'},
 objectives:[{key:'first',goal:'',visibility:'player'}],locations:[],parameters:{},outcomes:{}
};}
function blankAssignment(objectiveId){return {id:'ASSIGN-REPLACE-ME',entity_type:'Assignment',status:'draft',version:'0.1.0',provenance:{sources:['GM-authored campaign assignment']},visibility:'gm',refs:[{relation:'executes_objective',target_id:objectiveId,mode:'required'}],scope:'campaign_state',owner_system_id:'SYS-QUEST',objective_id:objectiveId,execution_status:'pending',participants:[],results:{}};}
function stateForGM(){return allPrivate().sort((a,b)=>String(a.source.name??a.source.id).localeCompare(String(b.source.name??b.source.id)));}
function roleViewList(tab,actorId){return visibleViews().filter(x=>x.view.scope===(tab==='individual'?'individual':'party')&&(tab!=='individual'||x.view.actorId===actorId)).sort((a,b)=>a.view.name.localeCompare(b.view.name));}
function safeButton(label,action,{disabled=false,kind='',title=''}={}){return `<button type="button" data-action="${E(action)}" class="${E(kind)}" ${disabled?'disabled':''} title="${E(title)}">${E(label)}</button>`;}
function options(items,value){return items.map(([v,n])=>`<option value="${E(v)}" ${v===value?'selected':''}>${E(n)}</option>`).join('');}
function cards(list,sel){return list.map(({view})=>`<div class="ag-quest-card-row"><button type="button" class="ag-quest-card ${view.id===sel?'selected':''}" data-action="select" data-id="${E(view.id)}"><strong>${E(view.name)}</strong><small>${E(view.objective_kind.replace('_',' '))} · ${E(view.status)}</small></button><label class="ag-quest-track-toggle" title="Track quest in on-screen objectives overlay"><input type="checkbox" data-action="track" data-id="${E(view.id)}" ${trackedIds().includes(view.id)?'checked':''}><span>Track</span></label></div>`).join('')||'<div class="ag-quest-empty">No quests are visible here yet. Ask your GM to reveal one in GM Setup.</div>';}
// Optional Locations link: ids the GM listed on the quest plus locations that list this quest.
// Feature-detected; Locations decides what the current user may see.
function locationLinks(view){
 const loc=game.modules.get('ashen-gate-locations');if(!loc?.active||typeof loc.api?.getLocation!=='function')return '';
 try{
  const ids=[...new Set([...(view.locationIds||[]),...(loc.api.locationsForQuest?.(view.id)??[]).map(x=>x.id)])];
  const links=ids.map(id=>[id,loc.api.getLocation(id)?.name]).filter(([,name])=>name)
   .map(([id,name])=>`<li><a class="ag-quest-location" data-action="open-location" data-id="${E(id)}"><i class="fa-solid fa-map-location-dot"></i> ${E(name)}</a></li>`);
  return links.length?`<h3>Locations</h3><ul>${links.join('')}</ul>`:'';
 }catch{return '';}
}
function readableDetail(view,actorId){
 if(!view)return '<div class="ag-quest-empty">Select an objective to see its details.</div>';
 const state=STATUSES.includes(view.status)?view.status:'Unknown';
 const items=view.objectives.map(o=>`<li><span>${E(o.goal)}</span><span class="ag-quest-pill">${o.complete?'Complete':o.failed?'Failed':'Pending'}</span></li>`).join('');
 const actor=actorId?game.actors.get(actorId):null;const notes=actor?noteText(view.id,actor.id):'';
 const canNote=actor&&(hasGM()||actor.testUserPermission(game.user,'OWNER'))&&(view.scope==='party'||view.actorId===actorId);
 return `<div class="ag-quest-detail"><h2>${E(view.name)}</h2><div class="ag-quest-tags">${E(view.objective_kind.replace('_',' '))} · ${E(state)}</div><p>${E(view.summary||'No public summary.')}</p><h3>Objectives</h3><ul>${items||'<li>No objectives currently revealed.</li>'}</ul>${locationLinks(view)}<h3>Shared party notes</h3><p class="ag-quest-note">${E(view.partyNotes||'No shared notes yet.')}</p><h3>Character notes</h3>${canNote?`<label for="ag-my-note">Notes for ${E(actor.name)}</label><textarea id="ag-my-note" rows="5">${E(notes)}</textarea>${safeButton('Save Character Notes','save-note',{kind:'secondary'})}`:'<p>Select one of your Actors to keep character notes.</p>'}</div>`;
}
function sourceForm(source,existing){
 const type=source.objective_kind;
 const kinds=[['quest','Quest'],['work_order','Work Order (crafting or production)'],['contract','Contract']];
 return `<section class="ag-quest-source-form"><h3>${existing?'Edit':'Create'} Quest Definition</h3>
 <p>Write what the job is, and what the players can learn. Permanent IDs are never renamed after creation.</p>
 <div class="ag-quest-fields"><label>Type<select id="ag-src-kind" ${existing?'disabled':''}>${options(kinds,type)}</select></label><label>Permanent ID<input id="ag-src-id" value="${E(source.id)}" ${existing?'readonly':''} placeholder="QUEST-NEW-JOB"></label></div>
 <label>Title<input id="ag-src-name" value="${E(source.name)}" placeholder="Name this quest"></label>
 <label>Public description<textarea id="ag-src-summary" rows="3">${E(source.public_summary??'')}</textarea></label>
 <label>GM-only source / issuer notes<textarea id="ag-src-description" rows="2">${E(source.source?.description??'')}</textarea></label>
 <label>Suggested rewards / outcomes (informational; GM grants separately)<textarea id="ag-src-outcome" rows="2">${E(source.outcomes?.description??'')}</textarea></label>
 <label>Related Location IDs (optional LOC-* IDs, one per line)<textarea id="ag-src-locations" rows="2">${E((source.locations||[]).filter(x=>typeof x==='string').join('\n'))}</textarea></label>
 <label>Definition visibility<select id="ag-src-visibility">${options([['reveal_gated','Reveal when GM approves'],['player','Player-visible when not Hidden'],['gm','GM only (never publish)']],source.visibility)}</select></label>
 ${source.visibility==='gm'?'<p class="ag-quest-warning">This is a GM-only source. Campaign status/reveal cannot publish it until you change Definition visibility.</p>':''}
 <h4>Objectives</h4><p>Give each objective a stable key. Mark secret steps Reveal Later; only the GM can reveal them.</p>
 <div id="ag-source-objective-list">${source.objectives.map(o=>objectiveFormRow(o)).join('')}</div>
 <div class="ag-quest-actions">${safeButton('Add Objective','add-objective',{kind:'secondary'})}</div>
 ${type==='work_order'?`<label>Work order domain<select id="ag-src-workdomain">${options([['crafting','Crafting'],['production','Production']],source.work_order_domain||'crafting')}</select></label>`:''}
 <div class="ag-quest-actions">${safeButton(existing?'Save Quest Definition':'Create Quest','save-source',{kind:'primary'})}</div>
 <details class="ag-quest-advanced"><summary>Advanced: canonical source JSON (optional)</summary><p>Only edit JSON if you need additional references, issuer fields, terms or provenance. Edited JSON takes precedence over the form when saved.</p><textarea id="ag-source-json" rows="12" spellcheck="false">${E(JSON.stringify(source,null,2))}</textarea></details></section>`;
}
function objectiveFormRow(o){return `<div class="ag-quest-source-objective" data-key="${E(o.key)}"><label>Key<input class="ag-src-obj-key" value="${E(o.key)}" readonly></label><label>Objective<input class="ag-src-obj-goal" value="${E(o.goal)}" placeholder="What must be done?"></label><label>Reveal<select class="ag-src-obj-visibility">${options([['player','When quest is visible'],['reveal_gated','Reveal later'],['gm','GM only']],o.visibility||'player')}</select></label></div>`;}
function sourceFromForm(root,current){
 const src=structuredClone(current||blankTemplate());
 src.id=root.querySelector('#ag-src-id').value.trim().toUpperCase();
 src.objective_kind=root.querySelector('#ag-src-kind').value;
 src.name=root.querySelector('#ag-src-name').value.trim();
 src.public_summary=root.querySelector('#ag-src-summary').value.trim();
 src.source={...src.source,description:root.querySelector('#ag-src-description').value.trim()};
 src.visibility=root.querySelector('#ag-src-visibility').value;
 src.outcomes={...src.outcomes,description:root.querySelector('#ag-src-outcome').value.trim()};
 const locationIds=root.querySelector('#ag-src-locations').value.split(/\s+/).map(x=>x.trim()).filter(Boolean);
 const unchanged=(src.locations||[]).filter(x=>typeof x==='string');
 if(JSON.stringify(unchanged)!==JSON.stringify(locationIds))src.locations=[...(src.locations||[]).filter(x=>typeof x!=='string'),...locationIds];
 else src.locations=src.locations||[];
 if(locationIds.some(x=>!/^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(x)))throw new Error('Location IDs must use LOC-* format.');
 src.objectives=[...root.querySelectorAll('.ag-quest-source-objective')].map(row=>{
  const key=row.querySelector('.ag-src-obj-key').value.trim();
  const old=(current?.objectives||[]).find(x=>x.key===key)||{};
  return {...old,key,goal:row.querySelector('.ag-src-obj-goal').value.trim(),visibility:row.querySelector('.ag-src-obj-visibility').value};
 });
 if(src.objective_kind==='work_order')src.work_order_domain=root.querySelector('#ag-src-workdomain')?.value||src.work_order_domain||'crafting';
 else delete src.work_order_domain;
 return validSource(src);
}
function gmStatePanel(row){
 if(!row)return '<div class="ag-quest-empty">Save a Quest Definition, then choose its audience and reveal it here.</div>';
 const {source:s,state:t}=row;
 const actorChoices=actorsOwned().map(a=>[a.id,a.name]);
 const isPublic=!!publicView(s,t);
 return `<section class="ag-quest-gm-state"><h3>Manage Quest · ${E(s.name)}</h3>
 <p class="ag-quest-visibility ${isPublic?'':'ag-quest-warning'}">${isPublic?'Published to authorized players.':s.visibility==='gm'?'Not published: this definition is GM only. Change Definition visibility above.':t.status==='Hidden'?'Not published: set status to Available or Active, then save.':s.visibility==='reveal_gated'&&!t.revealed?'Not published: tick Reveal Quest below and save.':'Not published: check audience and source permissions.'}</p>
 <div class="ag-quest-fields"><label>Campaign status<select id="ag-status">${options(STATUSES.map(x=>[x,x]),t.status)}</select></label>
 <label>Audience<select id="ag-scope">${options([['party','Party'],['individual','Individual Actor']],t.scope)}</select></label></div>
 <label>Individual Actor<select id="ag-state-actor"><option value="">Select Actor</option>${options(actorChoices,t.actorId)}</select></label>
 <label class="ag-check"><input id="ag-state-revealed" type="checkbox" ${t.revealed?'checked':''} ${s.visibility==='gm'?'disabled':''}> Reveal Quest to selected audience (when status is not Hidden)</label>
 <h4>Objective progress and reveals</h4>
 ${s.objectives.map(o=>`<div class="ag-quest-objective-control" data-key="${E(o.key)}"><strong>${E(o.goal)}</strong><label class="ag-check"><input type="checkbox" class="ag-obj-reveal" ${t.objectiveReveal.includes(o.key)?'checked':''}> Reveal this objective (never overrides GM-only)</label><select class="ag-obj-progress">${options([['pending','Pending'],['complete','Complete'],['failed','Failed']],t.progress[o.key]||'pending')}</select></div>`).join('')}
 <details class="ag-quest-advanced"><summary>Notes, locations & reward tracking</summary>
 <label>Public Location IDs (one LOC-* per line)<textarea id="ag-public-locations" rows="2">${E((t.publicLocationIds||[]).join('\n'))}</textarea></label>
 <label>Shared party notes<textarea id="ag-party-notes" rows="3">${E(t.partyNotes||'')}</textarea></label>
 <label>GM-only notes<textarea id="ag-gm-notes" rows="3">${E(t.gmNotes||'')}</textarea></label>
 <label class="ag-check"><input id="ag-reward-recorded" type="checkbox" ${t.rewardRecorded?'checked':''}> Reward handled by GM (no automatic grants)</label></details>
 <div class="ag-quest-actions">${safeButton('Save Progress & Reveal','save-state',{kind:'primary'})}${safeButton('Delete Quest','delete',{kind:'danger'})}</div>
 <details class="ag-quest-advanced"><summary>Delegated Assignments (GM only)</summary><p>Separate ASSIGN-* execution records, not HQ staffing.</p>
 ${listAssignments({objectiveId:s.id}).map(a=>`<div class="ag-assignment-row"><strong>${E(a.id)}</strong> · ${E(a.execution_status)} ${safeButton('Edit','edit-assignment',{kind:'secondary'}).replace('data-action="edit-assignment"',`data-action="edit-assignment" data-id="${E(a.id)}"`)} ${safeButton('Delete','remove-assignment',{kind:'danger'}).replace('data-action="remove-assignment"',`data-action="remove-assignment" data-id="${E(a.id)}"`)}</div>`).join('')||'<p>No delegated Assignments.</p>'}
 <label>Assignment JSON<textarea id="ag-assignment-json" rows="8">${E(JSON.stringify(blankAssignment(s.id),null,2))}</textarea></label>${safeButton('Save Assignment','save-assignment',{kind:'secondary'})}</details></section>`;
}
function gmPanel(selectedId,statusFilter='all'){
 const rows=stateForGM(),selected=rows.find(x=>x.source.id===selectedId)||null;
 const filtered=rows.filter(x=>statusFilter==='all'||x.state.status===statusFilter);
 const source=selected?.source||blankTemplate();
 return `<div class="ag-quest-gm-body"><aside class="ag-quest-gm-left">
 <div class="ag-quest-toolbar">${safeButton('New Quest','new',{kind:'primary'})}</div>
 <label>Campaign status<select id="ag-gm-filter">${options([['all','All statuses'],...STATUSES.map(x=>[x,x])],statusFilter)}</select></label>
 <div class="ag-quest-scroll">${filtered.map(x=>`<button class="ag-quest-card ${selectedId===x.source.id?'selected':''}" type="button" data-action="gm-select" data-id="${E(x.source.id)}"><strong>${E(x.source.name)}</strong><small>${E(x.source.id)} · ${E(x.state.status)}</small></button>`).join('')||'<p>No matching Quests.</p>'}</div>
 <section class="ag-quest-admin"><h3>Player Interface</h3><label class="ag-check"><input type="checkbox" id="ag-player-access" ${game.settings.get(MOD,'playerAccessEnabled')?'checked':''}> Show Quest Log to players</label><p>This controls the player interface, not discovery or individual quest visibility. Use the reveal controls on each quest.</p>${safeButton('Save Player Access','save-player-access',{kind:'secondary'})}</section>
 <details class="ag-quest-advanced"><summary>Advanced import and source libraries</summary><div class="ag-quest-toolbar">${safeButton('Import JSON','import',{kind:'secondary'})}${safeButton('Export Sources','export',{kind:'secondary'})}</div><p>Compendium IDs identify optional read-only Objective definitions, not player quests. Leave blank unless you use a custom Quest compendium.</p><label>Compendium pack IDs<input id="ag-compendium-packs" value="${E(game.settings.get(MOD,'compendiumPackIds')||'')}"></label>${safeButton('Save Pack Configuration (reload required)','save-pack-ids',{kind:'secondary'})}</details></aside>
 <div class="ag-quest-gm-edit">${sourceForm(source,!!selected)}${gmStatePanel(selected)}</div></div>`;
}
const Base=appBase();
class QuestLogApplication extends Base {
 static DEFAULT_OPTIONS={id:'ag-quest-manager-window',classes:['ag-app','ag-quest-app'],window:{title:'Ashen Gate | Quest Manager',resizable:true,minimizable:true},position:{width:940,height:700}};
 constructor(options={}){super(options);this.tab='party';this.actorId=actorsOwned()[0]?.id??null;this.selectedId=null;this.gmId=null;this.filter='';this.unsavedSource=false;this.sourceJsonEdited=false;this.gmFilter='all';this.statusFilter='all';}
 async _renderHTML(){assertUI(game.user,openAllowed());
  let rows=[],detail=null;
  if(this.tab!=='gm'){rows=roleViewList(this.tab,this.actorId).filter(x=>(this.statusFilter==='all'||x.view.status===this.statusFilter)&&[x.view.name,x.view.summary,x.view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));if(!rows.some(x=>x.view.id===this.selectedId))this.selectedId=rows[0]?.view.id??null;detail=rows.find(x=>x.view.id===this.selectedId)?.view??null;}
  const allowed=actorsOwned(),actorOption=options(allowed.map(a=>[a.id,a.name]),this.actorId);
  const html=`<div class="ag-quest-root"><header class="ag-header ag-quest-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Quest Log</h1><p>Quests · Work Orders · Contracts</p></div><div class="ag-header__meta ag-quest-heading-actions">${safeButton(trackerVisible()?'Hide Objectives Overlay':'Show Objectives Overlay','toggle-overlay',{kind:'secondary'})}<span class="ag-quest-version">v${VERSION}</span></div></header>
  <nav class="ag-tabs ag-quest-tabs" aria-label="Quest sections"><button data-tab="party" class="${this.tab==='party'?'active':''}">Party</button><button data-tab="individual" class="${this.tab==='individual'?'active':''}">Individual</button>${hasGM()?`<button data-tab="gm" class="${this.tab==='gm'?'active':''}">GM Setup</button>`:''}</nav>
  <main class="ag-quest-main">${this.tab==='gm'?gmPanel(this.gmId,this.gmFilter):`<aside class="ag-quest-list"><label>Search<input id="ag-quest-search" placeholder="Search visible objectives" value="${E(this.filter)}"></label><label>Status<select id="ag-player-filter">${options([['all','All visible quests'],...STATUSES.filter(x=>x!=='Hidden').map(x=>[x,x])],this.statusFilter)}</select></label><label>${this.tab==='individual'?'Individual Quest Actor':'Character Notes Actor'}<select id="ag-actor"><option value="">Select Actor</option>${actorOption}</select></label><div class="ag-quest-scroll" id="ag-quest-cards">${cards(rows,this.selectedId)}</div><small id="ag-quest-count">${rows.length} visible objectives</small></aside><section class="ag-quest-reading">${readableDetail(detail,this.actorId)}</section>`}</main>
  <footer class="ag-footer ag-quest-footer"><span>Player content follows Foundry Journal/Actor permissions.</span>${hasGM()?'<span>Objective progress and rewards: GM controlled</span>':''}</footer></div>`;
  return html;
 }
 // Appearance is inherited: the kit's --ag-* tokens live on the document, kept in sync by General Manager when active.
 _replaceHTML(result,content){content.innerHTML=result;this.bind(content);}
 bind(root){
   for(const b of root.querySelectorAll('[data-tab]'))b.addEventListener('click',async e=>{if(this.unsavedSource&&!confirm('Discard unsaved source changes?'))return;this.tab=e.currentTarget.dataset.tab;this.unsavedSource=false;this.sourceJsonEdited=false;await this.render();});
   root.querySelector('#ag-actor')?.addEventListener('change',async e=>{this.actorId=e.target.value;this.selectedId=null;await this.render();});
   root.querySelector('#ag-player-filter')?.addEventListener('change',async e=>{this.statusFilter=e.target.value;this.selectedId=null;await this.render();});
   root.querySelector('#ag-gm-filter')?.addEventListener('change',async e=>{this.gmFilter=e.target.value;await this.render();});
   const search=root.querySelector('#ag-quest-search');search?.addEventListener('input',()=>{
     this.filter=search.value;const wrap=root.querySelector('#ag-quest-cards');const filtered=roleViewList(this.tab,this.actorId).filter(({view})=>(this.statusFilter==='all'||view.status===this.statusFilter)&&[view.name,view.summary,view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));
     wrap.innerHTML=cards(filtered,this.selectedId);root.querySelector('#ag-quest-count').textContent=`${filtered.length} matches`;
     wrap.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
   });
   root.querySelector('#ag-source-json')?.addEventListener('input',()=>{this.unsavedSource=true;this.sourceJsonEdited=true;});
   for(const el of root.querySelectorAll('.ag-quest-source-form input,.ag-quest-source-form textarea,.ag-quest-source-form select'))el.addEventListener('input',()=>this.unsavedSource=true);
   for(const b of root.querySelectorAll('[data-action]'))b.addEventListener('click',()=>this.action(b,root));
 }
 async action(btn,root){
  try{const action=btn.dataset.action,id=btn.dataset.id;
   if(action==='select'){this.selectedId=id;return await this.render();}
   if(action==='open-location'){const api=game.modules.get('ashen-gate-locations')?.api;if(!api?.openLocation)throw new Error('Locations is not active.');return await api.openLocation(id);}
   if(action==='toggle-overlay'){assertUI(game.user,openAllowed());await changeTracking({visible:!trackerVisible()});return await this.render();}
   if(action==='track'){assertUI(game.user,openAllowed());if(!visibleById(id))throw new Error('Quest is no longer visible.');const ids=trackedIds();await changeTracking({ids:btn.checked?[...ids,id]:ids.filter(x=>x!==id)});return await this.render();}
   if(action==='save-note'){
     assertUI(game.user,openAllowed());await savePersonalNote(this.selectedId,this.actorId,root.querySelector('#ag-my-note')?.value||'');ui.notifications.info('Character notes saved.');return;
   }
   assertGM(game.user);
   if(action==='gm-select'){if(this.unsavedSource&&!confirm('Discard unsaved source changes?'))return;this.gmId=id;this.unsavedSource=false;return await this.render();}
   if(action==='new'){if(this.unsavedSource&&!confirm('Discard unsaved source changes?'))return;this.gmId=null;this.gmFilter='all';this.unsavedSource=false;this.sourceJsonEdited=false;return await this.render();}
   if(action==='save-source'){
    const src=this.sourceJsonEdited?validSource(JSON.parse(root.querySelector('#ag-source-json').value)):sourceFromForm(root,this.gmId?getPrivate(this.gmId)?.getFlag(MOD,'source'):null);
    if(this.gmId&&src.id!==this.gmId)throw new Error('Cannot change permanent ID of an existing Objective. Use New Draft.');
    await saveRecord(src,{replace:!!this.gmId});this.gmId=src.id;this.unsavedSource=false;this.sourceJsonEdited=false;ui.notifications.info('Quest definition saved. Choose campaign status and reveal below.');return await this.render();
   }
   if(action==='add-objective'){
     const wrap=root.querySelector('#ag-source-objective-list');const used=new Set([...wrap.querySelectorAll('.ag-src-obj-key')].map(x=>x.value));let n=1;while(used.has(`step_${n}`))n++;wrap.insertAdjacentHTML('beforeend',objectiveFormRow({key:`step_${n}`,goal:'New objective',visibility:'player'}));this.unsavedSource=true;return;
   }
   if(action==='save-player-access'){
     await game.settings.set(MOD,'playerAccessEnabled',root.querySelector('#ag-player-access').checked);
     ui.notifications.info('Player interface visibility saved. Individual quests still require publishing.');return await this.render();
   }
   if(action==='save-pack-ids'){
     const ids=parsePackIds(root.querySelector('#ag-compendium-packs').value);await game.settings.set(MOD,'compendiumPackIds',ids.join(','));ui.notifications.info('Quest compendium configuration saved. Reload Foundry to apply.');return await this.render();
   }
   if(action==='save-state'){
     if(this.unsavedSource)throw new Error('Save the Quest Definition before updating campaign progress.');
    const s=getPrivate(this.gmId)?.getFlag(MOD,'state');if(!s)throw new Error('Select an Objective.');
    const progress={},objectiveReveal=[];root.querySelectorAll('.ag-quest-objective-control').forEach(el=>{const key=el.dataset.key;progress[key]=el.querySelector('.ag-obj-progress').value;if(el.querySelector('.ag-obj-reveal').checked)objectiveReveal.push(key);});
    await updateState(this.gmId,{status:root.querySelector('#ag-status').value,scope:root.querySelector('#ag-scope').value,actorId:root.querySelector('#ag-state-actor').value||null,revealed:root.querySelector('#ag-state-revealed').checked,objectiveReveal,progress,publicLocationIds:root.querySelector('#ag-public-locations')?.value.split(/\s+/).map(s=>s.trim()).filter(Boolean)??s.publicLocationIds??[],partyNotes:root.querySelector('#ag-party-notes')?.value??s.partyNotes,gmNotes:root.querySelector('#ag-gm-notes')?.value??s.gmNotes,rewardRecorded:root.querySelector('#ag-reward-recorded')?.checked??s.rewardRecorded});
    ui.notifications.info('Quest updated. Check the Published/Not published message and player audience.');return await this.render();
   }
   if(action==='edit-assignment'){const record=getAssignment(id);const textarea=root.querySelector('#ag-assignment-json');if(!record||!textarea)throw new Error('Assignment unavailable');textarea.value=JSON.stringify(record,null,2);return;}
   if(action==='save-assignment'){const source=JSON.parse(root.querySelector('#ag-assignment-json').value);if(source.objective_id!==this.gmId)throw new Error('Assignment target must be the selected Objective');await saveAssignment(source,{replace:!!getAssignment(source.id),objectiveExists:id=>!!getPrivate(id),ensureFolder});ui.notifications.info('Delegated Assignment saved.');return await this.render();}
   if(action==='remove-assignment'){if(!confirm(`Delete delegated Assignment ${id}?`))return;await removeAssignment(id);return await this.render();}
   if(action==='delete'){if(!confirm(`Delete ${this.gmId}? Removes its published Quest Log view. Character-owned notes are retained.`))return;await removeRecord(this.gmId);this.gmId=null;return await this.render();}
   if(action==='export'){return dialogDownload('AG_Quest_Source_v0.4.0.json',JSON.stringify(exportPackage(allPrivate().map(x=>x.source)),null,2));}
   if(action==='import'){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const raw=JSON.parse(await input.files[0].text());const imported=await importSources(raw);ui.notifications.info(`Imported ${imported.length} Objective sources. No campaign state was overwritten.`);await this.render();}catch(e){notifyError(e);}};input.click();return;
   }
  }catch(err){notifyError(err);}
 }
}
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
function renderTracker(){
 if(typeof document?.querySelector!=='function')return;
 const old=document.querySelector('#ag-quest-objectives-overlay');
 if(!openAllowed()||!trackerVisible()){old?.remove();return;}
 const views=trackedSnapshot();
 if(!old&&typeof document.createElement!=='function')return;
 const el=old||document.createElement('aside');el.id='ag-quest-objectives-overlay';el.className='ag-quest-tracker';
 el.setAttribute('aria-label','Tracked quest objectives');
 el.innerHTML=`<header><strong>Tracked Objectives</strong><button type="button" data-hide-tracker aria-label="Hide objectives overlay">✕</button></header><div class="ag-quest-tracker-body">${views.length?views.map(v=>`<section><strong>${E(v.name)}</strong><small>${E(v.status)}</small><ul>${v.objectives.map(o=>`<li class="${o.complete?'complete':o.failed?'failed':''}">${E(o.goal)} ${o.complete?'✓':o.failed?'✕':''}</li>`).join('')||'<li>No revealed objectives</li>'}</ul></section>`).join(''):'<p>No tracked quests are currently visible to you.</p>'}</div>`;
 el.querySelector('[data-hide-tracker]')?.addEventListener('click',()=>changeTracking({visible:false}).then(()=>instance?.rendered&&instance.render()).catch(notifyError));
 if(!old)document.body?.append(el);
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
 mountLauncher(launcherRoot(app,html),{moduleId:MOD,label:'Quests',title:'Quest Log',icon:'fa-solid fa-scroll',onClick:()=>open().catch(notifyError),visible:openAllowed()});
}
function updateWindows(){refreshLaunchers();renderTracker();if(instance?.rendered&&!instance.unsavedSource)instance.render().catch(notifyError);}
Hooks.once('init',()=>{
 game.settings.register(MOD,'compendiumPackIds',{name:'Quest Definitions: Compendium Pack IDs',hint:'GM only: exact compendium collection IDs separated by commas, semicolons or whitespace (e.g. world.quests). Sources are read through the bundled pinned definition resolver; reload required after setting changes.',scope:'world',config:false,type:String,default:''});
 game.settings.register(MOD,'playerAccessEnabled',{name:'Quest Log: Player Access',hint:'Show the player Quest Log interface (new module defaults Hidden). Does not change gameplay, documents or GM access.',scope:'world',config:false,type:Boolean,default:false,onChange:updateWindows});
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
  playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:MOD,audience:'player',playerAccessEnabled:game.settings.get(MOD,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{assertGM(game.user);if(typeof enabled!=='boolean')throw new Error('Boolean required.');await game.settings.set(MOD,'playerAccessEnabled',enabled);return module.api.playerAccess.getState();}}
 };
 Hooks.on('renderActorDirectory',addLauncher);refreshLaunchers();
 Hooks.on('createJournalEntry',updateWindows);Hooks.on('updateJournalEntry',updateWindows);Hooks.on('deleteJournalEntry',updateWindows);
 Hooks.on('updateActor',(actor,change)=>{if(hasGM()&&change?.ownership)reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('deleteActor',(actor)=>{if(hasGM())reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('updateJournalEntryPage',updateWindows);
 Hooks.on('createActor',(actor)=>{if(hasGM())reconcileActorAudience().catch(notifyError);});
 Hooks.on('updateUser',(user)=>{if(hasGM())reconcileActorAudience().catch(notifyError);updateWindows();});
  renderTracker();
  console.info(`${MOD} ${VERSION} ready (standalone, GM documents + sanitized Journal projections).`);
});
