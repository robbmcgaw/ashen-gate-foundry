import {MOD,assertGM,assertUI,cleanText,publicView,validSource,exportPackage,STATUSES} from './core.mjs';
import {safeButton,options,questCards,questsToolbar,setupPanel,emptyState,statusBadge,progressMeter} from './gm-panels.mjs';
import {DEFAULT_VIEW,listQuestsTab} from './quests-tab.mjs';
import {getPrivate,allPrivate,visibleViews,visibleById,saveRecord,updateState,removeRecord,importSources,previewQuestImport,importQuests,savePersonalNote,reconcileActorAudience,noteText,ensureFolder} from './store.mjs';
import {createObjectiveConsumer} from './resolver-consumer.mjs';
import {createQuestDefinitionReader,parsePackIds} from './pinned-runtime.mjs';
import {ASSIGNMENT_CONTRACT,listAssignments,getAssignment,saveAssignment,removeAssignment} from './assignments.mjs';
import {selectTrackedViews,validTrackedId,trackingState} from './tracking.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,infoDialog} from './ag-dialogs.mjs';
import {windowSize} from './ag-html.mjs';
import {readDrop} from './ag-item-drop.mjs';
import {rewardsApi,grantableRewards,addFromDrop,updateReward,removeReward,grantRewards,grantAgain,rewardDragData,onActorSheetDrop} from './rewards.mjs';
import {rewardsSection,playerRewardsSection,grantPanel,grantSummary,receiveList,defaultChoices} from './rewards-ui.mjs';

const VERSION='0.12.0';
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
   .map(([id,name])=>`<li><a class="agq-location" data-action="open-location" data-id="${E(id)}"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> ${E(name)}</a></li>`);
  return links.length?`<h3 class="agq-h">Locations</h3><ul class="agq-locations">${links.join('')}</ul>`:'';
 }catch{return '';}
}
const OBJ_BADGE={complete:'<span class="ag-badge ag-badge--ok">Complete</span>',failed:'<span class="ag-badge ag-badge--danger">Failed</span>',pending:'<span class="ag-badge">Pending</span>'};
function readableDetail(view,actorId){
 if(!view)return emptyState('No quest selected','Pick a quest from the list to read its objectives.',{iconName:'fa-book-open'});
 const state=STATUSES.includes(view.status)?view.status:'Unknown';
 const items=view.objectives.map(o=>`<li class="ag-row agq-objective"><span class="ag-row__main">${E(o.goal)}</span><span class="ag-row__end">${OBJ_BADGE[o.complete?'complete':o.failed?'failed':'pending']}</span></li>`).join('');
 const actor=actorId?game.actors.get(actorId):null;const notes=actor?noteText(view.id,actor.id):'';
 const canNote=actor&&(hasGM()||actor.testUserPermission(game.user,'OWNER'))&&(view.scope==='party'||view.actorId===actorId);
 return `<div class="agq-detail"><h2 class="agq-detail__title">${E(view.name)}</h2><div class="agq-detail__meta">${E(view.objective_kind.replace('_',' '))} ${statusBadge(state)}</div><p class="agq-prose">${E(view.summary||'No public summary.')}</p>
 <h3 class="agq-h">Objectives</h3>${items?`<ul class="ag-rows agq-objectives">${items}</ul>`:'<p class="ag-field__hint">No objectives revealed yet.</p>'}${playerRewardsSection(view.rewards)}${locationLinks(view)}
 <h3 class="agq-h">Shared party notes</h3><p class="agq-note agq-prose">${E(view.partyNotes||'No shared notes yet.')}</p>
 <h3 class="agq-h">Character notes</h3>${canNote?`<label class="ag-field">Notes for ${E(actor.name)}<textarea id="ag-my-note" rows="5">${E(notes)}</textarea></label><div class="agq-actions">${safeButton('Save character notes','save-note',{kind:'primary',sm:true})}</div>`:'<p class="ag-field__hint">Choose one of your characters to keep character notes.</p>'}</div>`;
}
function sourceForm(source,existing){
 const type=source.objective_kind;
 const kinds=[['quest','Quest'],['work_order','Work Order (crafting or production)'],['contract','Contract']];
 return `<section class="agq-source ag-section"><div class="ag-section__head"><h3 class="ag-section__title">${existing?'Edit':'Create'} Quest Definition</h3></div>
 <p class="ag-field__hint">Write what the job is, and what the players can learn. Permanent IDs are never renamed after creation.</p>
 <div class="ag-form-grid"><label class="ag-field">Type<select id="ag-src-kind" ${existing?'disabled':''}>${options(kinds,type)}</select></label><label class="ag-field">Permanent ID<input id="ag-src-id" value="${E(source.id)}" ${existing?'readonly':''} placeholder="QUEST-NEW-JOB"></label>
 <label class="ag-field ag-field--wide">Title<input id="ag-src-name" value="${E(source.name)}" placeholder="Name this quest"></label>
 <label class="ag-field ag-field--wide">Public description<textarea id="ag-src-summary" rows="3">${E(source.public_summary??'')}</textarea></label>
 <label class="ag-field">GM-only source / issuer notes<textarea id="ag-src-description" rows="2">${E(source.source?.description??'')}</textarea></label>
 <label class="ag-field">Suggested rewards / outcomes<textarea id="ag-src-outcome" rows="2">${E(source.outcomes?.description??'')}</textarea><span class="ag-field__hint">Informational; the GM grants rewards separately.</span></label>
 <label class="ag-field">Related Location IDs<textarea id="ag-src-locations" rows="2">${E((source.locations||[]).filter(x=>typeof x==='string').join('\n'))}</textarea><span class="ag-field__hint">Optional LOC-* IDs, one per line.</span></label>
 <label class="ag-field">Definition visibility<select id="ag-src-visibility">${options([['reveal_gated','Reveal when GM approves'],['player','Player-visible when not Hidden'],['gm','GM only (never publish)']],source.visibility)}</select></label></div>
 ${source.visibility==='gm'?'<p class="ag-notice ag-notice--warn"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> This is a GM-only source. Campaign status/reveal cannot publish it until you change Definition visibility.</p>':''}
 <h4 class="agq-h">Objectives</h4><p class="ag-field__hint">Give each objective a stable key. Mark secret steps Reveal Later; only the GM can reveal them.</p>
 <div id="ag-source-objective-list">${source.objectives.map(o=>objectiveFormRow(o)).join('')}</div>
 <div class="agq-actions">${safeButton('Add objective','add-objective',{sm:true,icon:'fa-plus'})}</div>
 ${type==='work_order'?`<label class="ag-field">Work order domain<select id="ag-src-workdomain">${options([['crafting','Crafting'],['production','Production']],source.work_order_domain||'crafting')}</select></label>`:''}
 <details class="agq-advanced"><summary>Advanced: canonical source JSON (optional)</summary><p class="ag-field__hint">Only edit JSON if you need additional references, issuer fields, terms or provenance. Edited JSON takes precedence over the form when saved.</p><textarea id="ag-source-json" class="agq-code" rows="12" spellcheck="false" aria-label="Canonical source JSON">${E(JSON.stringify(source,null,2))}</textarea></details>
 <footer class="ag-footer agq-footer">${safeButton('Cancel','cancel-edit',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-source-status></span>${safeButton(existing?'Save quest definition':'Create quest','save-source',{kind:'primary'})}</footer></section>`;
}
function objectiveFormRow(o){return `<div class="agq-srcobj" data-key="${E(o.key)}"><label class="ag-field">Key<input class="ag-src-obj-key" value="${E(o.key)}" readonly></label><label class="ag-field">Objective<input class="ag-src-obj-goal" value="${E(o.goal)}" placeholder="What must be done?"></label><label class="ag-field">Reveal<select class="ag-src-obj-visibility">${options([['player','When quest is visible'],['reveal_gated','Reveal later'],['gm','GM only']],o.visibility||'player')}</select></label></div>`;}
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
 src.objectives=[...root.querySelectorAll('.agq-srcobj')].map(row=>{
  const key=row.querySelector('.ag-src-obj-key').value.trim();
  const old=(current?.objectives||[]).find(x=>x.key===key)||{};
  return {...old,key,goal:row.querySelector('.ag-src-obj-goal').value.trim(),visibility:row.querySelector('.ag-src-obj-visibility').value};
 });
 if(src.objective_kind==='work_order')src.work_order_domain=root.querySelector('#ag-src-workdomain')?.value||src.work_order_domain||'crafting';
 else delete src.work_order_domain;
 return validSource(src);
}
function gmStatePanel(row,rewardsHtml=''){
 if(!row)return emptyState('Not saved yet','Save the quest definition, then choose its audience and reveal it here.',{iconName:'fa-floppy-disk'});
 const {source:s,state:t}=row;
 const actorChoices=actorsOwned().map(a=>[a.id,a.name]);
 const isPublic=!!publicView(s,t);
 const why=s.visibility==='gm'?'Not published: this definition is GM only. Change Definition visibility above.':t.status==='Hidden'?'Not published: set status to Available or Active, then save.':s.visibility==='reveal_gated'&&!t.revealed?'Not published: tick Reveal quest below and save.':'Not published: check audience and source permissions.';
 return `<section class="agq-state ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Campaign status and reveal</h3></div>
 <p class="ag-notice ${isPublic?'ag-notice--ok':'ag-notice--warn'}"><i class="fa-solid ${isPublic?'fa-eye':'fa-eye-slash'}" aria-hidden="true"></i> ${isPublic?'Published to authorized players.':why}</p>
 <div class="ag-form-grid"><label class="ag-field">Campaign status<select id="ag-status">${options(STATUSES.map(x=>[x,x]),t.status)}</select></label>
 <label class="ag-field">Audience<select id="ag-scope">${options([['party','Party'],['individual','Individual character']],t.scope)}</select></label>
 <label class="ag-field">Individual character<select id="ag-state-actor"><option value="">Choose a character</option>${options(actorChoices,t.actorId)}</select></label></div>
 <label class="ag-field ag-field--inline"><input id="ag-state-revealed" type="checkbox" ${t.revealed?'checked':''} ${s.visibility==='gm'?'disabled':''}> Reveal quest to the selected audience (when status is not Hidden)</label>
 <h4 class="agq-h">Objective progress and reveals</h4>
 <div class="ag-rows agq-objctls">${s.objectives.map(o=>`<div class="ag-row agq-objctl" data-key="${E(o.key)}"><span class="ag-row__main"><span class="ag-row__title">${E(o.goal)}</span><label class="ag-field ag-field--inline"><input type="checkbox" class="ag-obj-reveal" ${t.objectiveReveal.includes(o.key)?'checked':''}> Reveal this objective (never overrides GM-only)</label></span><span class="ag-row__end"><select class="ag-obj-progress" aria-label="Progress: ${E(o.goal)}">${options([['pending','Pending'],['complete','Complete'],['failed','Failed']],t.progress[o.key]||'pending')}</select></span></div>`).join('')}</div>
 <details class="agq-advanced"><summary>Notes, locations and reward tracking</summary>
 <label class="ag-field">Public Location IDs<textarea id="ag-public-locations" rows="2">${E((t.publicLocationIds||[]).join('\n'))}</textarea><span class="ag-field__hint">One LOC-* ID per line.</span></label>
 <label class="ag-field">Shared party notes<textarea id="ag-party-notes" rows="3">${E(t.partyNotes||'')}</textarea></label>
 <label class="ag-field">GM-only notes<textarea id="ag-gm-notes" rows="3">${E(t.gmNotes||'')}</textarea></label>
 <label class="ag-field ag-field--inline"><input id="ag-reward-recorded" type="checkbox" ${t.rewardRecorded?'checked':''}> Rewards handled outside Quest Log</label></details>
 <footer class="ag-footer agq-footer">${safeButton('Cancel','cancel-edit',{kind:'ghost'})}<span class="ag-footer__status" role="status"></span>${safeButton('Save progress & reveal','save-state',{kind:'primary'})}</footer>
 ${rewardsHtml}
 <details class="agq-advanced"><summary>Delegated assignments (GM only)</summary><p class="ag-field__hint">Separate ASSIGN-* execution records, not HQ staffing.</p>
 ${(()=>{const list=listAssignments({objectiveId:s.id});return list.length?`<div class="ag-rows agq-assignments">${list.map(a=>`<div class="ag-row"><span class="ag-row__main"><span class="ag-row__title agq-mono">${E(a.id)}</span><span class="ag-row__meta">${E(a.execution_status)}</span></span><span class="ag-row__end">${safeButton('Edit','edit-assignment',{sm:true,icon:'fa-pen',data:{id:a.id}})}${safeButton('Delete','remove-assignment',{kind:'danger',sm:true,icon:'fa-trash',data:{id:a.id}})}</span></div>`).join('')}</div>`:'<p class="ag-field__hint">No delegated assignments.</p>';})()}
 <label class="ag-field">Assignment JSON<textarea id="ag-assignment-json" rows="8" class="agq-code">${E(JSON.stringify(blankAssignment(s.id),null,2))}</textarea></label><div class="agq-actions">${safeButton('Save assignment','save-assignment',{sm:true})}</div></details></section>`;
}
function editorHead(selected){
 const name=selected?.source?.name||selected?.source?.id;
 return `<header class="agq-edit__head"><h2 class="agq-detail__title">${selected?E(name):'New quest'}</h2>${selected?safeButton('Delete quest','delete',{kind:'danger',sm:true,icon:'fa-trash'}):''}</header>`;
}
const GM_NOTICE='<p class="ag-notice ag-notice--info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Objective progress and rewards are GM controlled; nothing is granted automatically.</p>';
function questsPanel(selectedId,view,rewardsHtml=''){
 const rows=stateForGM(),selected=rows.find(x=>x.source.id===selectedId)||null;
 const {groups,locations,shown,total}=listQuestsTab(rows,view);
 const source=selected?.source||blankTemplate();
 return `<div class="agq-pane">${questsToolbar(view,locations,{shown,total})}<div class="ag-split agq-split"><aside class="ag-split__list agq-list" id="ag-gm-cards" aria-label="Quests">${questCards(groups,selectedId,{total})}</aside>
 <section class="ag-split__detail agq-edit">${editorHead(selected)}${GM_NOTICE}${sourceForm(source,!!selected)}${gmStatePanel(selected,rewardsHtml)}</section></div></div>`;
}
function setupTab(){return setupPanel({playerAccess:game.settings.get(MOD,'playerAccessEnabled'),packIds:game.settings.get(MOD,'compendiumPackIds'),overlayVisible:trackerVisible()});}
const TABS=[['party','Party','fa-users',false],['individual','Individual','fa-user',false],['quests','Quests','fa-scroll',true],['setup','GM Setup','fa-gears',true]];
function playerPane(tab,rows,detail,ctx){
 const actorLabel=tab==='individual'?'Character':'Notes for character';
 return `<div class="ag-split agq-split"><aside class="ag-split__list agq-list"><div class="agq-filters"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="ag-quest-search" placeholder="Search quests" aria-label="Search visible quests" value="${E(ctx.filter)}"></label>
 <label class="ag-field">Status<select id="ag-player-filter">${options([['all','All visible quests'],...STATUSES.filter(x=>x!=='Hidden').map(x=>[x,x])],ctx.statusFilter)}</select></label>
 <label class="ag-field">${actorLabel}<select id="ag-actor"><option value="">Choose a character</option>${ctx.actorOption}</select></label>
 <span class="ag-toolbar__count" id="ag-quest-count">${rows.length} ${rows.length===1?'quest':'quests'}</span></div>
 <div id="ag-quest-cards">${cards(rows,ctx.selectedId)}</div></aside>
 <section class="ag-split__detail agq-reading">${hasGM()?'<p class="ag-notice ag-notice--info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Players see only the quests you reveal; Journal and Actor permissions apply.</p>':''}${readableDetail(detail,ctx.actorId)}</section></div>`;
}
const Base=appBase();
class QuestLogApplication extends Base {
 static DEFAULT_OPTIONS={id:'ag-quest-manager-window',classes:['ag-app','agq-app'],window:{title:'Ashen Gate | Quest Log',resizable:true,minimizable:true},position:{width:940,height:700}};
 // Compact size here; Comfortable scales it when the window opens (windowSize).
 constructor(options={}){super({...options,position:{...windowSize(QuestLogApplication.DEFAULT_OPTIONS.position),...options.position}});this.tab='party';this.actorId=actorsOwned()[0]?.id??null;this.selectedId=null;this.gmId=null;this.filter='';this.unsavedSource=false;this.sourceJsonEdited=false;this.qv={...DEFAULT_VIEW};this.statusFilter='all';}
 async _renderHTML(){assertUI(game.user,openAllowed());
  let rows=[],detail=null;
  const gmTab=this.tab==='quests'||this.tab==='setup';
  if(!gmTab){rows=roleViewList(this.tab,this.actorId).filter(x=>(this.statusFilter==='all'||x.view.status===this.statusFilter)&&[x.view.name,x.view.summary,x.view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));if(!rows.some(x=>x.view.id===this.selectedId))this.selectedId=rows[0]?.view.id??null;detail=rows.find(x=>x.view.id===this.selectedId)?.view??null;}
  const allowed=actorsOwned(),actorOption=options(allowed.map(a=>[a.id,a.name]),this.actorId);
  const version=game.modules.get(MOD)?.version||VERSION;
  const tabs=TABS.filter(([,,,gm])=>!gm||hasGM()).map(([id,label,ic,gm])=>{const on=this.tab===id;return `<button type="button" role="tab" data-tab="${id}" aria-selected="${on}" class="${[on?'active':'',gm?'ag-tab--gm':''].filter(Boolean).join(' ')}"><i class="fa-solid ${ic}" aria-hidden="true"></i> ${label}</button>`;}).join('');
  const overlay=trackerVisible()?'Hide objectives overlay':'Show objectives overlay';
  return `<div class="ag-window agq-root"><header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Quest Log</h1><p>Quests · Work orders · Contracts</p></div><div class="ag-header__meta">${safeButton(overlay,'toggle-overlay',{kind:'ghost',sm:true,icon:'fa-list-check',title:'Your tracked objectives on screen (only for you)'})}<span class="ag-version">v${E(version)}</span>${safeButton('Help','help',{kind:'ghost',sm:true,icon:'fa-circle-question'})}</div></header>
  <nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Quest sections">${tabs}</nav>
  ${this.tab==='quests'?questsPanel(this.gmId,this.qv,await this.rewardsHtml()):this.tab==='setup'?setupTab():playerPane(this.tab,rows,detail,{filter:this.filter,statusFilter:this.statusFilter,actorOption,actorId:this.actorId,selectedId:this.selectedId})}</div>`;
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
 showHelp(){return infoDialog('Quest Log Help',`<p><strong>Quest Log</strong> shows the quests, work orders and contracts your party is working on.</p><ul><li><strong>Party</strong> lists the quests the whole party can see. Pick one to read its objectives and write your character's notes.</li><li><strong>Individual</strong> lists a character's own quests; choose the character on the left.</li>${hasGM()?'<li><strong>Quests</strong> (GM) lists every quest with search, filters and sorting. Pick one to edit it, or press <em>New quest</em>. Import and Export are in its toolbar.</li><li><strong>GM Setup</strong> holds Player Access (whether players see the Quest Log) and other settings; they save together with <em>Save Changes</em>.</li>':''}</ul><p>The <em>Objectives Overlay</em> button shows or hides your tracked objectives on screen.</p>${hasGM()?'<p>Deleting a quest or an assignment, or leaving a tab with unsaved source changes, asks you to confirm first.</p>':''}`);}
 // Appearance is inherited: the kit's --ag-* tokens live on the document, kept in sync by General Manager when active.
 _replaceHTML(result,content){content.innerHTML=result;this.bind(content);}
 bind(root){
   for(const b of root.querySelectorAll('[data-tab]'))b.addEventListener('click',async e=>{if(this.unsavedSource&&!await confirmDialog('Your quest changes have not been saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true}))return;this.tab=e.currentTarget.dataset.tab;this.unsavedSource=false;this.sourceJsonEdited=false;await this.render();});
   root.querySelector('#ag-actor')?.addEventListener('change',async e=>{this.actorId=e.target.value;this.selectedId=null;await this.render();});
   root.querySelector('#ag-player-filter')?.addEventListener('change',async e=>{this.statusFilter=e.target.value;this.selectedId=null;await this.render();});
   for(const [id,key] of [['type','type'],['location','location'],['visible','visible'],['sort','sort'],['group','group']])root.querySelector(`#ag-gm-${id}`)?.addEventListener('change',async e=>{this.qv[key]=e.target.value;await this.render();});
   const gmSearch=root.querySelector('#ag-gm-search');gmSearch?.addEventListener('input',()=>{
     this.qv.search=gmSearch.value;const {groups,shown,total}=listQuestsTab(stateForGM(),this.qv);const wrap=root.querySelector('#ag-gm-cards');
     wrap.innerHTML=questCards(groups,this.gmId,{total});root.querySelector('#ag-gm-count').textContent=`${shown} of ${total} quests`;
     wrap.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
   });
   const search=root.querySelector('#ag-quest-search');search?.addEventListener('input',()=>{
     this.filter=search.value;const wrap=root.querySelector('#ag-quest-cards');const filtered=roleViewList(this.tab,this.actorId).filter(({view})=>(this.statusFilter==='all'||view.status===this.statusFilter)&&[view.name,view.summary,view.id].some(t=>t.toLowerCase().includes(this.filter.toLowerCase())));
     wrap.innerHTML=cards(filtered,this.selectedId);root.querySelector('#ag-quest-count').textContent=`${filtered.length} ${filtered.length===1?'match':'matches'}`;
     wrap.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>this.action(b,root)));
   });
   root.querySelector('#ag-source-json')?.addEventListener('input',()=>{this.unsavedSource=true;this.sourceJsonEdited=true;const st=root.querySelector('[data-source-status]');if(st)st.textContent='Unsaved changes';});
   const sourceStatus=root.querySelector('[data-source-status]'),dirty=()=>{this.unsavedSource=true;if(sourceStatus)sourceStatus.textContent='Unsaved changes';};
   for(const el of root.querySelectorAll('.agq-source input,.agq-source textarea,.agq-source select'))el.addEventListener('input',dirty);
   // Status chips: one at a time; pressing the pressed chip shows every status again.
   for(const c of root.querySelectorAll('[data-qv-status]'))c.addEventListener('click',async()=>{const v=c.dataset.qvStatus;this.qv.status=this.qv.status===v?'all':v;await this.render();});
   const setupBody=root.querySelector('.agq-setup__body'),setupStatus=root.querySelector('.agq-setup .ag-footer__status');
   for(const ev of ['input','change'])setupBody?.addEventListener(ev,e=>{if(e.target?.id&&setupStatus)setupStatus.textContent='Unsaved changes';});
   for(const b of root.querySelectorAll('[data-action]:not([data-reward-zone] *)'))b.addEventListener('click',()=>this.action(b,root));
   this.bindRewards(root);
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
   if(action==='gm-select'){if(this.unsavedSource&&!await confirmDialog('Your quest changes have not been saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true}))return;this.gmId=id;this.rewardNote='';this.grantOpen=false;this.unsavedSource=false;return await this.render();}
   if(action==='new'){if(this.unsavedSource&&!await confirmDialog('Your quest changes have not been saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true}))return;this.gmId=null;this.rewardNote='';this.grantOpen=false;this.unsavedSource=false;this.sourceJsonEdited=false;return await this.render();}
   if(action==='save-source'){
    const src=this.sourceJsonEdited?validSource(JSON.parse(root.querySelector('#ag-source-json').value)):sourceFromForm(root,this.gmId?getPrivate(this.gmId)?.getFlag(MOD,'source'):null);
    if(this.gmId&&src.id!==this.gmId)throw new Error('Cannot change permanent ID of an existing Objective. Use New quest.');
    await saveRecord(src,{replace:!!this.gmId});this.gmId=src.id;this.unsavedSource=false;this.sourceJsonEdited=false;ui.notifications.info('Quest definition saved. Choose campaign status and reveal below.');return await this.render();
   }
   if(action==='add-objective'){
     const wrap=root.querySelector('#ag-source-objective-list');const used=new Set([...wrap.querySelectorAll('.ag-src-obj-key')].map(x=>x.value));let n=1;while(used.has(`step_${n}`))n++;wrap.insertAdjacentHTML('beforeend',objectiveFormRow({key:`step_${n}`,goal:'New objective',visibility:'player'}));this.unsavedSource=true;const st=root.querySelector('[data-source-status]');if(st)st.textContent='Unsaved changes';return;
   }
   if(action==='cancel-edit'){if(this.unsavedSource&&!await confirmDialog('Your quest changes have not been saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true}))return;this.unsavedSource=false;this.sourceJsonEdited=false;return await this.render();}
   if(action==='clear-filters'){this.qv={...DEFAULT_VIEW};return await this.render();}
   // GM Setup: every setting saves together with Save Changes (D4). Nothing is written until then; a bad pack ID saves nothing.
   if(action==='save-setup'){
     const access=!!root.querySelector('#ag-player-access')?.checked,ids=parsePackIds(root.querySelector('#ag-compendium-packs')?.value??'').join(',');
     const packsChanged=ids!==String(game.settings.get(MOD,'compendiumPackIds')||'');
     if(access!==!!game.settings.get(MOD,'playerAccessEnabled'))await game.settings.set(MOD,'playerAccessEnabled',access);
     if(packsChanged)await game.settings.set(MOD,'compendiumPackIds',ids);
     ui.notifications.info(packsChanged?'GM Setup saved. Reload Foundry to apply the compendium change.':'GM Setup saved.');return await this.render();
   }
   if(action==='cancel-setup')return await this.render();
   if(action==='save-state'){
     if(this.unsavedSource)throw new Error('Save the Quest Definition before updating campaign progress.');
    const s=getPrivate(this.gmId)?.getFlag(MOD,'state');if(!s)throw new Error('Select an Objective.');
    const progress={},objectiveReveal=[];root.querySelectorAll('.agq-objctl').forEach(el=>{const key=el.dataset.key;progress[key]=el.querySelector('.ag-obj-progress').value;if(el.querySelector('.ag-obj-reveal').checked)objectiveReveal.push(key);});
    await updateState(this.gmId,{status:root.querySelector('#ag-status').value,scope:root.querySelector('#ag-scope').value,actorId:root.querySelector('#ag-state-actor').value||null,revealed:root.querySelector('#ag-state-revealed').checked,objectiveReveal,progress,publicLocationIds:root.querySelector('#ag-public-locations')?.value.split(/\s+/).map(s=>s.trim()).filter(Boolean)??s.publicLocationIds??[],partyNotes:root.querySelector('#ag-party-notes')?.value??s.partyNotes,gmNotes:root.querySelector('#ag-gm-notes')?.value??s.gmNotes,rewardRecorded:root.querySelector('#ag-reward-recorded')?.checked??s.rewardRecorded});
    // Completed with something still owed: open Give rewards (the status is already saved; Not now leaves it pending).
    if(root.querySelector('#ag-status').value==='Completed'&&(await grantableRewards(this.gmId)).some(r=>r.grantable))this.grantOpen=true;
    ui.notifications.info('Quest updated. Check the Published/Not published message and player audience.');return await this.render();
   }
   if(action==='remove-reward'){
    const name=btn.closest('[data-reward-key]')?.querySelector('.agq-reward__name')?.textContent||'this item';
    if(!await confirmDialog(`Remove ${name} from this quest's rewards? A held copy in the rewards folder is deleted too. Items already on characters are not touched.`,{title:'Remove this reward?',yes:'Remove reward',danger:true}))return;
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
   if(action==='edit-assignment'){const record=getAssignment(id);const textarea=root.querySelector('#ag-assignment-json');if(!record||!textarea)throw new Error('Assignment unavailable');textarea.value=JSON.stringify(record,null,2);return;}
   if(action==='save-assignment'){const source=JSON.parse(root.querySelector('#ag-assignment-json').value);if(source.objective_id!==this.gmId)throw new Error('Assignment target must be the selected Objective');await saveAssignment(source,{replace:!!getAssignment(source.id),objectiveExists:id=>!!getPrivate(id),ensureFolder});ui.notifications.info('Delegated Assignment saved.');return await this.render();}
   if(action==='remove-assignment'){if(!await confirmDialog(`Delete the delegated assignment ${id}? This cannot be undone.`,{title:'Delete this assignment?',yes:'Delete assignment',danger:true}))return;await removeAssignment(id);return await this.render();}
   if(action==='delete'){if(!await confirmDialog(`Delete ${getPrivate(this.gmId)?.getFlag(MOD,'source')?.name||'this quest'}? This removes its published Quest Log view. Character-owned notes are kept.`,{title:`Delete ${getPrivate(this.gmId)?.getFlag(MOD,'source')?.name||'this quest'}?`,yes:'Delete quest',danger:true}))return;await removeRecord(this.gmId);this.gmId=null;return await this.render();}
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
 const el=old||document.createElement('aside');el.id='ag-quest-objectives-overlay';el.className='agq-tracker';
 el.setAttribute('aria-label','Tracked quest objectives');
 const mark=o=>o.complete?' <i class="fa-solid fa-check" role="img" aria-label="Complete"></i>':o.failed?' <i class="fa-solid fa-xmark" role="img" aria-label="Failed"></i>':'';
 el.innerHTML=`<header class="agq-tracker__head"><strong>Tracked objectives</strong><button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agq-tracker__close" data-hide-tracker aria-label="Hide objectives overlay" data-tooltip="Hide objectives overlay" data-tooltip-class="ag-tooltip"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header><div class="agq-tracker__body">${views.length?views.map(v=>`<section><strong>${E(v.name)}</strong><small>${E(v.status)}</small><ul>${v.objectives.map(o=>`<li class="${o.complete?'is-complete':o.failed?'is-failed':''}">${E(o.goal)}${mark(o)}</li>`).join('')||'<li>No revealed objectives</li>'}</ul></section>`).join(''):'<p>No tracked quests are currently visible to you.</p>'}</div>`;
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
function updateWindows(){refreshLaunchers();renderTracker();refreshEmbeds();if(instance?.rendered&&!instance.unsavedSource)instance.render().catch(notifyError);}
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
  playerAccess:{contract:'ag-player-access/1',getState:()=>({contract:'ag-player-access/1',moduleId:MOD,audience:'player',playerAccessEnabled:game.settings.get(MOD,'playerAccessEnabled'),configurable:true}),setEnabled:async enabled=>{assertGM(game.user);if(typeof enabled!=='boolean')throw new Error('Boolean required.');await game.settings.set(MOD,'playerAccessEnabled',enabled);return module.api.playerAccess.getState();}}
 };
 Hooks.on('renderActorDirectory',addLauncher);refreshLaunchers();
 // Drag-out of quest rewards (D8): a GM drop on a sheet is a recorded grant; returning false stops Foundry copying it too.
 Hooks.on('dropActorSheetData',(actor,sheet,data)=>onActorSheetDrop(actor,data));
 Hooks.on('createJournalEntry',updateWindows);Hooks.on('updateJournalEntry',updateWindows);Hooks.on('deleteJournalEntry',updateWindows);
 Hooks.on('updateActor',(actor,change)=>{if(hasGM()&&change?.ownership)reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('deleteActor',(actor)=>{if(hasGM())reconcileActorAudience(actor.id).catch(notifyError);updateWindows();});
 Hooks.on('updateJournalEntryPage',updateWindows);
 Hooks.on('createActor',(actor)=>{if(hasGM())reconcileActorAudience().catch(notifyError);});
 Hooks.on('updateUser',(user)=>{if(hasGM())reconcileActorAudience().catch(notifyError);updateWindows();});
  renderTracker();
  console.info(`${MOD} ${VERSION} ready (standalone, GM documents + sanitized Journal projections).`);
});
