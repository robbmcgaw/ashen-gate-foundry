import {MODULE_ID,emptyState,applyOperation,activeLock,site,rankConfig,stageFor,facilities,owned,validateDefinition,planFacilityImport} from './logic.mjs';
import {confirmDialog,infoDialog} from './ag-dialogs.mjs';
import {facilitiesPanel,facilityRow,listFacilitiesTab,DEFAULT_VIEW as FAC_VIEW} from './facilities-tab.mjs';
import {SETUP_FORM,setupChanges} from './setup-form.mjs';
import {windowSize} from './ag-html.mjs';
import {ACCESS_CONTRACT,accessStatus,canOpenPlayerInterface,requireGMToSetAccess,requireInterfaceAccess} from './access.mjs';
import {createPlayerIntentBridge,REQUEST_PATH,RECEIPT_FLAG,checkIntent} from './player-intent-bridge.mjs';
import {createHQAuthoritativeWriter} from './hq-authoritative-writer.mjs';
import {previewPermanentVacancies,clearVerifiedDepartures} from './staffing-reconciliation.mjs';
import {inspectFacilityRef} from './source-resolver-adapter.mjs';
import {hirelingState,stationed,derivePerkStatuses,markNonStacking,HIRE_REF} from './hirelings.mjs';
import {readNativeHirelingDefinitions} from './native-hireling-definitions.mjs';
import {createPrivateStateStore,projectPublicState,VAULT_POINTER} from './private-state.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {requirePlayerViewAccess,buildPlayerView} from './player-view.mjs';
import {createEmbed,EMBED_MODES,EMBED_CONTRACT} from './embed.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
// Player edits are transported by server-attributed Actor document updates, not module socket packets.
const ACK_TIMEOUT_MS=16000;
const RECEIPT_PATH=`flags.${MODULE_ID}.${RECEIPT_FLAG}`;
let playerBridge=null;
const uiVersion=()=>game.modules.get(MODULE_ID)?.version ?? "";
// Existing v0.2.0 already exposed player canvas access. The first rollout must
// preserve that access until the GM explicitly changes this world setting.
const accessEnabled=()=>game.settings.get(MODULE_ID,'playerAccessEnabled');
// 0.10.0: compact read-only view for partner modules (embed.mjs); same checks and data as api.playerView.
const embed=createEmbed({canOpen:()=>canOpenPlayerInterface(game.user,accessEnabled()),isGM:()=>game.user?.isGM===true,
 userOwns:actor=>actor?.testUserPermission?.(game.user,'OWNER')===true,view:actor=>buildPlayerView(read(),actor,game.users),
 actorById:id=>game.actors?.get?.(id)??null,open:()=>open(),notifyError:e=>{console.error(e);ui.notifications?.error(friendly(e));}});
const canView=()=>canOpenPlayerInterface(game.user,accessEnabled());
const playerAccessState=()=>accessStatus(MODULE_ID,accessEnabled());
function requireView(user=game.user){return requireInterfaceAccess(user,accessEnabled());}
async function setPlayerAccess(enabled){
 requireGMToSetAccess(game.user,enabled);
 if(accessEnabled()!==enabled)await game.settings.set(MODULE_ID,'playerAccessEnabled',enabled);
 return playerAccessState();
}
function refreshPlayerAccess(){
 embed.refreshAll();
 // Settings onChange runs on connected clients; never trust the DOM for access.
 document.querySelectorAll('[data-ag-launcher="ashen-gate-headquarters"]').forEach(button=>{
  if(!canView())button.remove();
 });
 const actorTab=ui?.sidebar?.tabs?.actors ?? ui?.actors;
 if(actorTab?.element)mountActorsLauncher(actorTab,actorTab.element);
 if(!canView()&&windowApp?.rendered){
  windowApp.close().catch(err=>console.warn(`${MODULE_ID} access gate close`,err));
 }else if(windowApp?.rendered)windowApp.render();
}
const pending=new Map();
let windowApp;
let sequence=Promise.resolve();
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const TIP='data-tooltip-class="ag-tooltip"';
const icon=name=>`<i class="fa-solid ${name}" aria-hidden="true"></i>`;
/** Shared window header: brand title, optional subtitle (the Guildhall), version and Help. */
const header=sub=>`<header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Headquarters</h1>${sub?`<p>${sub}</p>`:''}</div><div class="ag-header__meta"><span class="ag-version">v${esc(uiVersion())}</span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help">${icon('fa-circle-question')} Help</button></div></header>`;
const TABS={builder:['Guildhall Builder','fa-building'],activation:['Activation','fa-flag'],quarters:['Personal Quarters','fa-bed'],hirelings:['Hirelings','fa-users'],benefits:['Benefits','fa-star'],facilities:['Facilities','fa-warehouse',true],manage:['GM Setup','fa-gears',true]};
/** Tab strip; GM-only tabs carry .ag-tab--gm and come last. The Activation tab is the builder slot before activation. */
const tabStrip=(ids,current)=>`<nav class="ag-tabs ag-tabs--scroll" role="tablist" aria-label="Headquarters sections">${ids.map(id=>{const [label,fa,gmOnly]=TABS[id];const tab=id==='activation'?'builder':id;const on=tab===current;
 return `<button type="button" role="tab" data-tab="${tab}" aria-selected="${on}" class="${[on?'active':'',gmOnly?'ag-tab--gm':''].filter(Boolean).join(' ')}">${icon(fa)}${label}</button>`;}).join('')}</nav>`;
const empty=(title,text,fa='')=>`<div class="ag-empty">${fa?icon(fa):''}<p class="ag-empty__title">${title}</p>${text?`<p class="ag-empty__text">${text}</p>`:''}</div>`;
const uuid = () => {
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
};
const idKey = () => `copy_${uuid().replace(/-/g,"").slice(0,14)}`;
// V14 may provide namespaced Document classes and mount sidebar tabs before ready.
// Do not block registration of launch controls/APIs on a private-save migration.
let privateStore=null;
const read=()=>{
 if(privateStore)return privateStore.read();
 if(game.user?.isGM)throw Error('Headquarters private state is not initialized.');
 return projectPublicState(game.settings.get(MODULE_ID,'state')??emptyState());
};
const primaryGM=()=>game.users.activeGM ?? game.users.find(x=>x.isGM&&x.active);
const friendly=e=>e instanceof Error?e.message:String(e);
const isEditing=(s)=>activeLock(s)?.user_id===game.user?.id;
function mountActorsLauncher(app,html){
 mountLauncher(launcherRoot(app,html),{moduleId:MODULE_ID,label:'Headquarters',icon:'fa-solid fa-building',onClick:()=>open(),visible:canView()});
}

const roomAccess=(r)=>game.user.isGM || r?.owner_user_id===game.user.id;
function allowedOpsError(reason){ui.notifications?.warn(`Headquarters: ${reason}`);}
async function saveLocal(actor,op,payload){
 requireInterfaceAccess(actor,accessEnabled());
 const prior=read();
 const st=site(prior);
 if(st){
  if(payload.expected_shared_revision!==undefined && st.shared_revision!==payload.expected_shared_revision)throw Error("Layout changed while you were editing. Refresh and try again.");
  if(payload.expected_room_revision!==undefined){const room=st.rooms.find(x=>x.key===payload.room_key);if(!room || room.revision!==payload.expected_room_revision)throw Error("This room was updated elsewhere. Refresh and try again.");}
 }
 const next=applyOperation(prior,actor,op,payload);
 await privateStore.save(next);
 return {ok:true,state_revision:next.state_revision};
}
// Pending responses are *UI feedback*, never authorization. Only the GM-authored
// Actor update hook may acknowledge an edit. HQ state is written exclusively by GM.
function acknowledgement(actor,changes,_options,serverUserId){
 const gm=primaryGM();
 if(!gm || serverUserId!==gm.id)return;
 const receipt=changes?.flags?.[MODULE_ID]?.[RECEIPT_FLAG]
     ?? changes?.[RECEIPT_PATH]
     ?? changes?.[`flags.${MODULE_ID}`]?.[RECEIPT_FLAG];
 if(!receipt || typeof receipt!=='object')return;
 const pendingRecord=pending.get(receipt.id);
 if(!pendingRecord || actor?.id!==pendingRecord.actorId)return;
 clearTimeout(pendingRecord.timer);pending.delete(receipt.id);
 if(receipt.ok)pendingRecord.resolve(receipt);
 else pendingRecord.reject(Error(receipt.error||'GM rejected Headquarters edit.'));
}
function playerTransportActor(){
 // Authorized room owner binds an authenticated Foundry Actor update to their User.
 // Roster ownership alone never grants Actor document permission.
 const s=read();
 if(!s.active || !site(s)?.rooms?.some(r=>r.kind==='personal'&&r.owner_user_id===game.user.id))return null;
 const actors=game.actors?.contents ?? (typeof game.actors?.values==='function'?[...game.actors.values()]:[]);
 return actors.find(a=>a?.testUserPermission?.(game.user,'OWNER'))??null;
}
async function request(op,payload={}){
 if(game.user?.isGM&&!privateStore?.isReady()){allowedOpsError('Private Headquarters state is not initialized.');return false;}
 try{requireView();}catch(e){allowedOpsError(friendly(e));return false;}
 const gm=primaryGM();if(!gm){allowedOpsError('An active GM must be online to save changes.');return false;}
 try{
  if(game.user.isGM){
   const step=sequence.then(()=>saveLocal(game.user,op,payload));sequence=step.catch(()=>{});await step;
  }else{
   if(!playerBridge)throw Error('Headquarters edit transport is unavailable. Ask the GM to reconnect.');
   const actor=playerTransportActor();
   if(!actor)throw Error('The GM must create your Guildhall room and you must own a Foundry Actor to edit.');
   const intent={id:uuid().replace(/-/g,''),op,payload,createdMs:Date.now()};checkIntent(intent);
   let timer;
   const receipt=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{pending.delete(intent.id);reject(Error('No GM confirmation yet. Check your connection and refresh before retrying.'));},ACK_TIMEOUT_MS);
    pending.set(intent.id,{resolve,reject,actorId:actor.id,timer});
   });
   try{await playerBridge.submit(actor,intent);await receipt;}
   catch(err){if(pending.has(intent.id)){clearTimeout(timer);pending.delete(intent.id);}throw err;}
  }
  return true;
 }catch(e){allowedOpsError(friendly(e));return false;}
}
async function reconcileDepartures(snapshots,{expectedStateRevision}={}){
 if(!game.user?.isGM)throw Error('Only GM may reconcile confirmed Hireling departures.');
 const step=sequence.then(async()=>{
 if(!game.user?.isGM)throw Error('GM authorization required.');
 const prior=read();if(!prior.active)throw Error('Guildhall is not activated.');
 if(expectedStateRevision!==undefined&&prior.state_revision!==expectedStateRevision)throw Error('Guildhall data changed; refresh before reconciling.');
 const changes=previewPermanentVacancies(prior.core,snapshots,{isGM:true});
 if(changes.length===0)return {cleared:0,stateRevision:prior.state_revision};
 // Hosted personnel entries require one atomic history+vacancy action;
 // the older snapshots-only API must never bypass that authoritative lifecycle.
 if(changes.some(c=>hirelingState(prior,c.hireling_ref)))throw Error('Use the Hirelings roster permanent-departure action for registered personnel.');
 const {next,cleared}=clearVerifiedDepartures(prior.core,changes);
 if(cleared){
   const updated={...prior,core:next,state_revision:prior.state_revision+1};
   await privateStore.save(updated);
 }
 return {cleared,stateRevision:cleared?prior.state_revision+1:prior.state_revision};
 });
 sequence=step.catch(()=>{});
 return step;
}
function open(){
 if(game.user?.isGM&&!privateStore?.isReady()){allowedOpsError('Private Headquarters state is not ready. Finish the GM vault migration first.');return null;}
 try{requireView();}catch(e){allowedOpsError(friendly(e));return null;}
 // A closed ApplicationV2 instance must never be reused, including when
 // closing asynchronously after a shared editor lease release.
 if(windowApp?.rendered){windowApp.bringToFront();return windowApp;}
 if(windowApp)windowApp=null;
 const app=new HeadquartersApp();windowApp=app;
 try{const rendered=app.render({force:true});if(rendered?.catch)rendered.catch(error=>{
   if(windowApp===app)windowApp=null;
   console.error('Headquarters open failed',error);
   allowedOpsError(friendly(error));
 });}catch(error){if(windowApp===app)windowApp=null;allowedOpsError(friendly(error));return null;}
 return app;
}
class HeadquartersApp extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={id:"ashen-gate-headquarters-window",window:{title:"Ashen Gate | Headquarters",resizable:true},position:{width:1150,height:790},classes:["ag-app","aghq-app"]}; // Compact; Comfortable scales it when the window opens (windowSize)
 static PARTS={main:{template:`modules/${MODULE_ID}/templates/main.hbs`}};
 constructor(options={}){super({...options,position:{...windowSize(HeadquartersApp.DEFAULT_OPTIONS.position),...options.position}});this.tab="builder";this.selectedRoom="";this.selectedCopy="";this.catalogSearch="";this.fv={...FAC_VIEW};this.managementScroll=0;this.focusCatalog=false;this.zoom=1;this.dragOffset={x:0,y:0};this.leaseTimer=setInterval(()=>{try{if(privateStore?.isReady()&&isEditing(read()))request("renew");}catch(error){console.warn('Headquarters lease renewal postponed',error);}},60000);}
 async _onRender(context,options){
  await super._onRender(context,options);
  if(game.user?.isGM&&!privateStore?.isReady()){
   const node=this.element?.querySelector('[data-aghq-content]');
   if(node)node.textContent='Headquarters private state is not ready. Check Foundry notifications/console for the migration error. No private save was overwritten.';
   return;
  }
  if(!canView()){
   const node=this.element?.querySelector('[data-aghq-content]');
   if(node)node.textContent='Headquarters Player Access is currently hidden by the GM.';
   await this.close();return;
  }
  if(!game.user.isGM && ['manage','facilities'].includes(this.tab))this.tab='builder';
  const node=this.element?.querySelector('[data-aghq-content]');if(!node)return;
  node.innerHTML=this.page(read());this.bind(node);
   if(['manage','facilities'].includes(this.tab)){
     const scroll=this.element?.querySelector('.aghq-body');
     if(scroll){scroll.scrollTop=this.managementScroll;scroll.addEventListener('scroll',()=>{if(['manage','facilities'].includes(this.tab))this.managementScroll=scroll.scrollTop;},{passive:true});}
     if(this.focusCatalog){this.focusCatalog=false;node.querySelector('[data-hq-section="catalog"]')?.scrollIntoView?.({block:'nearest'});}
   }
 }
 page(s){
  const user=game.user;const gm=user.isGM;
  if(!s.active&&gm&&this.tab==='facilities')return `${header('Guildhall not activated')}${tabStrip(['activation','facilities'],'facilities')}<main class="aghq-body">${this.facilities(s)}</main>`;
  if(!s.active)return `${header('Guildhall not activated')}${gm?tabStrip(['activation','facilities'],'builder'):''}<main class="aghq-body">${this.activation(s,gm)}</main>`;
  const st=site(s);const rank=s.core.guild_state.rank, cap=rankConfig(s).shared_facility_slots;
  const n=st.installations.filter(x=>x.room_key==="common").length;
  const lease=activeLock(s);const holder=lease?game.users.get(lease.user_id)?.name||"Unknown":"None";
  const isEditor=isEditing(s);
  const ids=['builder','quarters','hirelings','benefits',...(gm?['facilities','manage']:[])];
  let middle=this.tab==='builder'?this.builder(s,isEditor):this.tab==='quarters'?this.quarters(s):this.tab==='hirelings'?this.hirelings(s):this.tab==='benefits'?this.benefits(s):this.tab==='facilities'?this.facilities(s):this.management(s);
  const sub=`${esc(s.config.name)} · Guild Rank ${rank} · ${n}/${cap} shared facilities · ${rankConfig(s).orders_per_downtime} Orders / downtime`;
  const top=`${header(sub)}${tabStrip(ids,this.tab)}`;
  // GM Setup: the pane and its footer are one form, so Save Changes writes Player Access, settings and ranks together (D4).
  if(this.tab==='manage'&&gm)return `${top}<form class="aghq-setup" data-aghq-form="${SETUP_FORM}"><main class="aghq-body">${middle}</main><footer class="ag-footer"><button type="button" class="ag-btn ag-btn--ghost" data-action="cancel-setup">Cancel</button><span class="ag-footer__status" role="status" data-setup-status></span><button type="submit" class="ag-btn ag-btn--primary">${icon('fa-floppy-disk')} Save Changes</button></footer></form>`;
  const edit=this.tab!=='builder'?'':isEditor?`<button type="button" class="ag-btn" data-action="release">${icon('fa-check')} Finish Editing</button>`:`<button type="button" class="ag-btn" data-action="take-lock">${icon('fa-pen')} ${gm&&lease?'GM Take Over':'Edit Guildhall'}</button>`;
  return `${top}<main class="aghq-body">${middle}</main><footer class="ag-footer"><span role="status">Auto-saved · ${lease?`Editor: ${esc(holder)}`:'View only'}</span>${edit}</footer>`;
 }
 activation(s,gm){
  if(!gm)return empty('The Guildhall is not open yet.','Your GM opens it from this window.','fa-building');
  const field=(label,name,value)=>`<label class="ag-field">${label}<input name="${name}" value="${value}" required></label>`;
  const library=s.catalog.length?`<ul class="ag-rows">${s.catalog.map(d=>`<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${esc(d.name)}</span><span class="ag-row__meta aghq-coderef">${esc(d.id)}</span></div></li>`).join('')}</ul>`
   :empty('No facility definitions yet.','Import a facilities file in Ashen Gate | General Manager.');
  return `<div class="aghq-pane aghq-activation"><section class="ag-card"><h3 class="ag-card__title">Guildhall not activated</h3><p>Link the Guildhall to an existing HQ-* and LOC-* identity before players can enter.</p><form data-aghq-form="activate"><div class="ag-form-grid">${field('Guildhall HQ ID','hq_ref','HQ-DEMO-001')}${field('Location ID','location_ref','LOC-DEMO-001')}${field('Campaign key','campaign_key','local-campaign')}${field('Guild key','guild_key','primary')}</div><p class="aghq-hint">Use your campaign's real HQ- and LOC- source IDs. The demo IDs shown here do not create Location records.</p><div class="ag-card__actions"><button type="submit" class="ag-btn ag-btn--primary">Activate Guildhall</button></div></form></section><section class="ag-section" data-hq-section="library"><div class="ag-section__head"><h3 class="ag-section__title">Facility library (${s.catalog.length})</h3></div><p class="aghq-hint">Imported facility definitions. Nothing is unlocked or acquired until the Guildhall is activated (then the Facilities tab).</p>${library}</section></div>`;
 }
 help(){return `<p>Headquarters is a Guildhall layout editor. Facility effects are informational only.</p><h4>Guildhall Builder</h4><p>The GM unlocks and acquires facility copies in the Facilities tab. In Guildhall Builder, choose Edit Guildhall, drag copies from Available Facilities to the grid, and click an installed piece to rotate, upgrade or uninstall it. One person can edit the shared layout at a time.</p><h4>Personal Quarters</h4><p>The GM creates player rooms from GM Setup. Each owner may arrange their own room; all guild members can view it. Decorative images do not use facility slots.</p><h4>Hirelings and access</h4><p>Shift+H also opens the Headquarters window. Hirelings v1 personnel state and facility staffing are managed here: GM Working toggle, roster and confirmed departures. Source HIRE/HPERK definitions remain in Manager-imported Foundry documents; eligibility cannot be confirmed when structured metadata is missing. Orders and Assignments are not implemented. The GM can hide this player interface through GM Setup or Manager → Player Access; this does not delete Guildhall state.</p>`;}
 /** A hireling's display name from its imported definition, never the HIRE id. */
 hirelingName(id){try{return this.nativeHirelingRecords().records.get(id)?.name||'this hireling';}catch{return 'this hireling';}}
 builder(s,editable){
 const st=site(s);const cell=Math.round(s.config.cell_px*this.zoom);
 const pieces=st.installations.filter(x=>x.room_key==='common');
 const items=s.inventory.filter(item=>!st.installations.some(i=>i.key===item.key)&&facilities(s).get(item.facility_ref)?.placements?.includes('shared'));
 const list=items.length?`<ul class="ag-rows">${items.map(x=>this.libraryCopy(s,x,editable)).join('')}</ul>`:empty('No facilities to place.',game.user.isGM?'Unlock and acquire one in the Facilities tab.':'Facilities appear here when your GM acquires them.');
 const tiles=pieces.map(x=>this.tile(s,x,cell,editable)).join('');
 const size=s.config.bounds;
 return `<div class="aghq-grid"><aside class="aghq-sidebar"><h3>Available Facilities</h3><p class="aghq-hint">Drag a facility onto the grid.</p>${list}<h3>Canvas Tools</h3>${this.zoomTools()}<p class="aghq-hint">Move any building piece. Rotation is handled in its inspector. Collisions and boundaries are enforced.</p></aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${size.width} × ${size.height} grid</strong><span>${editable?'Editing shared Guildhall':'Read-only · take editing lock to place pieces'}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="common" style="--cell:${cell}px;width:${size.width*cell}px;height:${size.height*cell}px;${s.config.background?`--aghq-backdrop:url('${esc(s.config.background)}');--aghq-fit:${(s.config.background_fit||'contain')==='stretch'?'100% 100%':(s.config.background_fit||'contain')};--aghq-pos:${Number(s.config.background_x??50)}% ${Number(s.config.background_y??50)}%;--aghq-opacity:${Number(s.config.background_opacity??100)/100};`:''}">${tiles}</div></div></div><aside class="aghq-inspector"><h3>Selected Facility</h3>${this.inspector(s,editable,'common')}</aside></div>`;
 }
 zoomTools(){return `<div class="aghq-toolrow aghq-zoom"><button type="button" class="ag-btn ag-btn--icon ag-btn--sm" data-action="zoom-out" aria-label="Zoom out" data-tooltip="Zoom out" ${TIP}>${icon('fa-minus')}</button><span>${Math.round(this.zoom*100)}%</span><button type="button" class="ag-btn ag-btn--icon ag-btn--sm" data-action="zoom-in" aria-label="Zoom in" data-tooltip="Zoom in" ${TIP}>${icon('fa-plus')}</button></div>`;}
 libraryCopy(s,x,enabled){const def=facilities(s).get(x.facility_ref);if(!def)return '';const {stage}=stageFor(s,x);return `<li class="ag-row aghq-copy${enabled?' is-draggable':''}" ${enabled?'draggable="true"':''} data-copy="${esc(x.key)}"><div class="ag-row__main"><span class="ag-row__title">${esc(def.name)}</span><span class="ag-row__meta">${esc(stage.label||stage.key)} · ${stage.width}×${stage.height}</span>${game.user.isGM?`<span class="ag-row__meta aghq-coderef">${esc(x.key)}</span>`:''}</div></li>`;}
 tile(s,item,cell,enabled){const copy=owned(s).get(item.key);if(!copy)return '';const {def,stage}=stageFor(s,copy);const p=item.placement;const isSelected=item.key===this.selectedCopy;const image=stage.art?`<img src="${esc(stage.art)}" draggable="false" alt="">`:`<i class="fa-solid ${def.category==='Profession'?'fa-hammer':def.category==='Personal'?'fa-pen':'fa-square'} aghq-tile-icon" aria-hidden="true"></i>`;return `<div class="aghq-tile ${isSelected?'selected':''}" data-installed="${esc(item.key)}" ${enabled?'draggable="true"':''} style="left:${p.x*cell}px;top:${p.y*cell}px;width:${p.width*cell}px;height:${p.height*cell}px"><div class="aghq-tile-art">${image}</div><span class="aghq-tile-label">${esc(def.name)}</span><span class="aghq-rotation">${p.rotation}°</span></div>`;}
 inspector(s,editable,roomKey){const st=site(s),ins=st.installations.find(x=>x.key===this.selectedCopy&&x.room_key===roomKey);if(!ins)return '<p class="aghq-hint">Select a placed facility for details, rotation, upgrades and uninstallation.</p>';
 const copy=owned(s).get(ins.key),{def,stage}=stageFor(s,copy);const target=roomKey==='common'?editable:roomAccess(st.rooms.find(x=>x.key===roomKey));
 const buttons=target?`<div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm" data-action="rotate">${icon('fa-rotate-right')} Rotate 90°</button><button type="button" data-action="uninstall" class="ag-btn ag-btn--sm ag-btn--danger">${icon('fa-box-archive')} Uninstall</button></div>`:'';
 const upgrades=game.user.isGM && def.stages.length>1?`<label class="ag-field">Upgrade copy <select data-upgrade-stage>${def.stages.map(x=>`<option value="${esc(x.key)}" ${x.key===copy.stage_key?'selected':''}>${esc(x.label||x.key)} · ${x.width}×${x.height}</option>`).join('')}</select></label><div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm ag-btn--primary" data-action="upgrade">Apply Upgrade</button></div>`:'';
 const bens=stage.benefits?.map(b=>`<li><strong>${esc(b.name)}</strong><br><small>${esc(b.description||'Informational only')} · ${esc(b.recipient||'configured recipient')}</small></li>`).join('')||'<li>No benefits defined.</li>';
 return `<div class="aghq-detail"><h4>${esc(def.name)}</h4><p>${game.user.isGM?`<span class="aghq-coderef">${esc(def.id)}</span><br>`:''}${esc(stage.label||stage.key)} · ${ins.placement.width}×${ins.placement.height} cells<br>Rotation: ${ins.placement.rotation}°</p>${buttons}${upgrades}<h4>Benefits (informational)</h4><ul>${bens}</ul>${this.staffingInspector(s,ins)}<p class="aghq-hint">Staffing and Hireling benefits are informational only; sheets and rolls are unchanged.</p></div>`;
 }
 quarters(s){const st=site(s);const rooms=st.rooms.filter(r=>r.kind==='personal');if(!rooms.length)return `<div class="aghq-pane">${empty('No personal rooms yet.',game.user.isGM?'Create them with Create Missing Player Rooms in the GM Setup tab.':'Ask your GM to create player rooms in the GM Setup tab.','fa-bed')}</div>`;
 const current=rooms.find(x=>x.key===this.selectedRoom)||rooms.find(x=>x.owner_user_id===game.user.id)||rooms[0];this.selectedRoom=current.key;const mine=roomAccess(current);const layout=s.personal_layouts[current.key];if(!layout)return `<div class="aghq-pane"><p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')} This room's layout is missing. ${game.user.isGM?'Recreate it from GM Setup.':'Ask your GM to repair it.'}</p></div>`;
 const cell=Math.round(s.config.cell_px*this.zoom);
 const roomtabs=this.roomTabs(rooms,current);
 const items=s.inventory.filter(x=>!st.installations.some(y=>y.key===x.key)&&facilities(s).get(x.facility_ref)?.placements?.includes('personal'));
 const decorators=(s.config.decoration_art||[]).map((url,i)=>`<div class="aghq-decoration-card" data-decor-art="${esc(url)}" ${mine?'draggable="true"':''} data-tooltip="Decoration ${i+1}${mine?': drag onto your room':''}" ${TIP}><img src="${esc(url)}" alt="Decoration ${i+1}" draggable="false"></div>`).join('');
 const pieces=st.installations.filter(x=>x.room_key===current.key).map(x=>this.tile(s,x,cell,mine)).join('');
 const arts=layout.decorations.map(d=>`<div class="aghq-decoration ${d.key===this.selectedCopy?'selected':''}" data-decoration="${esc(d.key)}" ${mine?'draggable="true"':''} style="left:${d.x*cell}px;top:${d.y*cell}px;width:${d.width*cell}px;height:${d.height*cell}px;transform:none"><img src="${esc(d.art)}" alt="" draggable="false" style="transform:rotate(${d.rotation}deg)"></div>`).join('');
 const copies=items.map(x=>this.libraryCopy(s,x,mine)).join('');
 return `<div class="aghq-quarters"><div class="aghq-roomtabs">${roomtabs}</div><div class="aghq-grid"><aside class="aghq-sidebar"><h3>Personal Facility</h3>${copies?`<ul class="ag-rows">${copies}</ul>`:empty('No personal facilities yet.',game.user.isGM?'Acquire one with personal placement in the Facilities tab.':'They appear here when your GM acquires them.')}<h3>Decorations</h3><p class="aghq-hint">Artwork chosen by your GM. Visual only; pieces may overlap.</p>${decorators?`<div class="aghq-artgrid">${decorators}</div>`:empty('No decorations yet.',game.user.isGM?'Add artwork in the Facilities tab.':'Your GM adds artwork you can place here.')}</aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${esc(game.users.get(current.owner_user_id)?.name||'Personal')} — ${layout.bounds.width}×${layout.bounds.height}</strong><span>${mine?'Editable':'View only'}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="${esc(current.key)}" style="--cell:${cell}px;width:${layout.bounds.width*cell}px;height:${layout.bounds.height*cell}px;${layout.background?`background-image:url('${esc(layout.background)}');background-size:cover;`:''}">${pieces}${arts}</div></div></div><aside class="aghq-inspector"><h3>Room Inspector</h3>${this.selectedCopy.startsWith('decor_')?this.decorInspector(s,current,mine):this.inspector(s,mine,current.key)}<p class="aghq-hint">Room artwork and furnishings are visible to guild members; only owner and GM can edit.</p></aside></div></div>`;
 }
 /** Room picker: a segmented control for 2–4 rooms, otherwise a scrolling tab strip. The pen marks rooms you can edit. */
 roomTabs(rooms,current){
  const label=r=>`${esc(game.users.get(r.owner_user_id)?.name||r.owner_user_id)}${roomAccess(r)?` <i class="fa-solid fa-pen" aria-hidden="true" data-tooltip="You can edit this room" ${TIP}></i>`:''}`;
  if(rooms.length>=2&&rooms.length<=4)return `<div class="ag-segmented" role="radiogroup" aria-label="Rooms">${rooms.map(r=>{const on=r.key===current.key;return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on?0:-1}" data-room="${esc(r.key)}">${label(r)}</button>`;}).join('')}</div>`;
  return `<nav class="ag-tabs ag-tabs--scroll aghq-roomstrip" role="tablist" aria-label="Rooms">${rooms.map(r=>{const on=r.key===current.key;return `<button type="button" role="tab" aria-selected="${on}" class="${on?'active':''}" data-room="${esc(r.key)}">${label(r)}</button>`;}).join('')}</nav>`;
 }
 decorInspector(s,room,mine){const entry=s.personal_layouts[room.key].decorations.find(x=>x.key===this.selectedCopy);if(!entry)return '';return `<h4>Decoration</h4><img class="aghq-detail-art" src="${esc(entry.art)}" alt=""><p>Size: ${entry.width}×${entry.height} · Rotation ${entry.rotation}°</p>${mine?`<div class="aghq-toolrow"><button class="ag-btn ag-btn--sm" data-action="rotate-decor" type="button">${icon('fa-rotate-right')} Rotate</button><button class="ag-btn ag-btn--sm ag-btn--danger" data-action="remove-decor" type="button">${icon('fa-trash')} Remove</button></div>`:''}`;}
 nativeHirelingRecords(){return readNativeHirelingDefinitions(game,game.user);}
 visibleHirelings(s){
  const {records,conflicts}=this.nativeHirelingRecords();
  const roster=(s.personnel?.hirelings??[]).filter(row=>game.user.isGM || records.has(row.hireling_ref));
  return {records,conflicts,roster};
 }
 staffingInspector(s,installation){
  const st=site(s);const copy=s.inventory.find(x=>x.key===installation.key);if(!copy)return '';
  const {stage}=stageFor(s,copy);
  const slots=st.staffing_slots.filter(x=>x.installation_key===installation.key);
  if(!stage.staffing_slots)return '<h4>Staffing</h4><p class="aghq-hint">This facility has no staffing slots.</p>';
  if(!game.user.isGM)return '<h4>Staffing</h4><p class="aghq-hint">Staffing assignments and personnel details are managed privately by the GM.</p>';
  const {records}=this.visibleHirelings(s);
  // A hidden definition must not reveal an ID, status or occupancy count to players.
  // Unresolved/GM-only staff cannot be distinguished from absent staff in this panel.
  const canShowCount=game.user.isGM || slots.every(x=>!x.occupant_hireling_ref||records.has(x.occupant_hireling_ref));
  const entries=slots.map((slot,i)=>{const ref=slot.occupant_hireling_ref;const hire=ref?hirelingState(s,ref):null;const profile=records.get(ref);return `<li>Station ${i+1}: ${ref?(!game.user.isGM&&!profile?'Details unavailable':`${esc(profile?.name||ref)} · ${hire?.working?'Working':'Working OFF'}${game.user.isGM?` <button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="unassign-hireling" data-hire-ref="${esc(ref)}">Unassign</button>`:''}`):'Unstaffed'}</li>`;}).join('');
  const countLabel=canShowCount?`${slots.filter(x=>x.occupant_hireling_ref).length}/${stage.staffing_slots}`:'details unavailable';
  return `<h4>Staffing · ${countLabel}</h4><ul class="aghq-staff-list">${entries||'<li>No station records yet — GM may assign to initialize them.</li>'}</ul>${game.user.isGM?'<p class="aghq-hint">GM: use the Hirelings tab to place or transfer roster members, or drag a Hireling card onto this piece.</p>':''}`;
 }
 hirelings(s){
  const {records,conflicts,roster}=this.visibleHirelings(s);const gm=game.user.isGM;
  if(!gm)return `<div class="aghq-pane">${empty('Hirelings are kept by your GM.','Your GM manages the roster, who is working and where they are stationed.','fa-users')}</div>`;
  const deployed=site(s).installations.map(ins=>{
    const copy=s.inventory.find(x=>x.key===ins.key);if(!copy)return null;
    const {def,stage}=stageFor(s,copy);return {...ins,name:def.name,capacity:stage.staffing_slots};
  }).filter(x=>x && x.capacity>0);
  const registered=new Set((s.personnel?.hirelings??[]).map(x=>x.hireling_ref));
  const sources=[...records.values()].filter(x=>x.entity_type==='Hireling' && !registered.has(x.id));
  const options=sources.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`).join('');
  const setup=gm?`<section class="ag-card"><h3 class="ag-card__title">Add from imported Hireling definitions</h3><p class="aghq-hint">Imports are handled by General Manager. This action only adds a permanent HIRE-* reference to the roster; it never copies or edits its definition.</p><form data-aghq-form="add-hireling" class="aghq-toolrow"><select name="hireling_ref" aria-label="Imported Hireling">${options}</select><button type="submit" class="ag-btn" ${!sources.length?'disabled':''}>${icon('fa-plus')} Add to roster</button></form>${sources.length?'':'<p class="aghq-hint">Nothing to add: every imported hireling is already on the roster.</p>'}${conflicts.size?`<p class="ag-notice ag-notice--danger" role="alert">${icon('fa-circle-exclamation')} Conflicting source IDs: ${esc([...conflicts].join(', '))}. Resolve them in Manager before registering.</p>`:''}<p class="aghq-hint">${sources.length} available imported profiles · ${roster.length} roster records</p></section>`:'';
  const seenOverlapGroups=new Set();
  const cards=roster.map(h=>{
   const profile=records.get(h.hireling_ref),placed=stationed(s,h.hireling_ref)[0];
   const position=placed?`Station: ${esc(deployed.find(i=>i.key===placed.slot.installation_key)?.name||placed.slot.installation_key)} (${esc(placed.slot.key)})`:'Unstationed';
   const role=profile?.role?esc(profile.role):'Role metadata unavailable';
   const refs=(profile?.refs||[]).filter(x=>x.relation==='has_hireling_perk' && (gm||records.has(x.target_id))).map(x=>x.target_id);
   const perkMap=new Map([...records].filter(([,d])=>d.entity_type==='HirelingPerk'));
   const perks=derivePerkStatuses(s,h.hireling_ref,profile,perkMap)
     .filter(p=>gm || perkMap.has(p.id))
     .map(p=>{
       if(p.status!=='eligible'||!p.overlap_group||p.allow_overlap)return p;
       if(seenOverlapGroups.has(p.overlap_group))return {...p,status:'nonstacking',reason:`Overlaps existing eligible group ${p.overlap_group}; default nonstacking`};
       seenOverlapGroups.add(p.overlap_group);return p;
     });
   const perkText=perks.length?perks.map(p=>`<li>${esc(p.name||p.id)} — <strong>${esc(p.status)}</strong>${p.reason?`: ${esc(p.reason)}`:''}</li>`).join(''):(refs.length?'<li>Perk source details unavailable.</li>':'<li>No verified source perk references.</li>');
   const staff=gm&&h.employment_status==='active'?`<form data-aghq-form="staff-hireling" class="aghq-toolrow"><input type="hidden" name="hireling_ref" value="${esc(h.hireling_ref)}"><select name="installation_key" aria-label="Staffing facility"><option value="">Unassigned</option>${deployed.map(i=>`<option value="${esc(i.key)}" ${placed?.slot.installation_key===i.key?'selected':''}>${esc(i.name)} (${esc(i.key)})</option>`).join('')}</select><button type="submit" class="ag-btn ag-btn--sm">${placed?'Transfer / Update':'Assign'} Station</button></form>`:'';
   const tools=gm?`<div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm" data-action="toggle-hireling-working" data-hire-ref="${esc(h.hireling_ref)}" ${h.employment_status!=='active'?'disabled':''}>${icon('fa-power-off')} Working: ${h.working?'ON':'OFF'} — toggle</button>${h.employment_status!=='active'?'<span class="aghq-hint">Only active hirelings can work.</span>':''}</div>${staff}${h.employment_status==='active'?`<form class="aghq-toolrow aghq-departure" data-aghq-form="depart-hireling"><input type="hidden" name="hireling_ref" value="${esc(h.hireling_ref)}"><select name="status" aria-label="Permanent departure reason"><option value="dismissed">Dismissed</option><option value="retired">Retired</option><option value="departed">Permanently Departed</option><option value="deceased">Deceased</option></select><button type="submit" class="ag-btn ag-btn--sm ag-btn--danger">Confirm Permanent Departure…</button></form>`:''}`:'';
   const history=gm&&h.history?.length?`<details><summary>Personnel history (${h.history.length})</summary><ul>${h.history.map(e=>`<li>${esc(e.event)} · ${esc(e.status)} · ${esc(e.at)}</li>`).join('')}</ul></details>`:'';
   return `<article class="ag-card aghq-hire-card" data-hire-card="${esc(h.hireling_ref)}" ${gm&&h.employment_status==='active'?'draggable="true"':''}><div class="aghq-hire-photo">${profile?.img?`<img src="${esc(profile.img)}" alt="">`:icon('fa-user')}</div><div class="aghq-hire-card-body"><h4 class="ag-card__title">${esc(profile?.name||h.hireling_ref)}</h4><span class="ag-card__meta"><span class="aghq-coderef">${esc(h.hireling_ref)}</span> · ${role}</span><p class="aghq-hire-station">${position}</p><p class="aghq-badges"><span class="ag-badge${h.employment_status==='active'?'':' ag-badge--warn'}">${esc(h.employment_status)}</span><span class="ag-badge${h.working?' ag-badge--ok':''}">${h.working?'Working ON':'Working OFF'}</span></p><details><summary>Individual perks (${perks.length})</summary><ul>${perkText}</ul></details>${tools}${history}</div></article>`;
  }).join('');
  return `<div class="aghq-roster"><section class="aghq-roster__list"><h3>Hirelings Roster</h3><p class="aghq-hint">Working and personnel history belong to Hirelings state hosted by Headquarters. Assigned stations remain reserved while Working is OFF. All perks and facility benefits are informational; no character/roll modifications.</p>${roster.length?cards:empty('No hirelings on the roster yet.','Import HIRE-* definitions in General Manager, then add them with Add to roster.','fa-users')}</section>${setup}</div>`;
 }
 benefits(s){const st=site(s);
 const entries=st.installations.flatMap(ins=>{const copy=owned(s).get(ins.key);if(!copy)return [];const {def,stage}=stageFor(s,copy);
   const staff=st.staffing_slots.filter(x=>x.installation_key===ins.key&&x.occupant_hireling_ref).map(x=>hirelingState(s,x.occupant_hireling_ref)).filter(Boolean);
   return (stage.benefits||[]).map(b=>{
     const needed=!!(b.requires_staffing||b.requires_working||b.requires_presence);
     const eligible=staff.filter(h=>h.employment_status==='active');
     let reason='';
     if(needed&&!eligible.length)reason='No eligible staffed Hireling';
     else if((b.requires_working||b.requires_presence)&&!eligible.some(h=>h.working))reason='Staffed Hirelings are Working OFF';
     return {source:def.name,...b,activation:reason?'Inactive':'Active',reason};
   });});
 const rows=entries.map(b=>`<li class="ag-row aghq-benefit"><span class="ag-row__icon">${icon('fa-star')}</span><div class="ag-row__main"><span class="ag-row__title">${esc(b.name)}</span><span class="ag-row__meta">${esc(b.source)} · ${esc(b.recipient||'configured')}${b.reason?' · '+esc(b.reason):''}</span>${b.description?`<p class="aghq-row-text">${esc(b.description)}</p>`:''}</div><div class="ag-row__end"><span class="ag-badge${b.activation==='Active'?' ag-badge--ok':''}">${esc(b.activation)}</span></div></li>`).join('');
 return `<div class="aghq-pane"><h3>Informational Benefits</h3><p class="aghq-hint">Conditions are derived from placement and the GM Working toggle. No character sheets, rolls, Profession XP or inventory are modified.</p>${rows?`<ul class="ag-rows">${rows}</ul>`:empty('No facility benefits yet.','Benefits appear here when facilities are installed in the Guildhall.','fa-star')}</div>`;}

 facilities(s){if(!game.user.isGM)return '';
  const list=listFacilitiesTab(this.facilityRows(s),this.fv);
  return facilitiesPanel(this.fv,list,{active:Boolean(s.active)});
 }
 facilityRows(s){const g=s.core?.guild_state,inst=s.active?site(s).installations:[];
  return s.catalog.map(d=>facilityRow(d,{active:Boolean(s.active),unlocked:Boolean(g?.unlocked_facility_refs?.includes(d.id)),owned:(s.inventory??[]).filter(x=>x.facility_ref===d.id).length,installed:inst.filter(i=>(owned(s).get(i.key)?.facility_ref)===d.id).length}));}
 management(s){if(!game.user.isGM)return '';
 const ruleTable=s.config.rank_rules.map(r=>`<tr><th scope="row" class="is-num">${r.rank}</th><td><input type="number" min="0" max="100" name="slots_${r.rank}" value="${r.shared_facility_slots}" aria-label="Rank ${r.rank} shared slots"></td><td><input type="number" min="0" max="100" name="orders_${r.rank}" value="${r.orders_per_downtime}" aria-label="Rank ${r.rank} orders per downtime"></td><td><input name="unlock_${r.rank}" value="${esc(r.unlock_refs.join(', '))}" placeholder="FAC-* IDs, comma separated" aria-label="Rank ${r.rank} auto-unlocked facility IDs"></td></tr>`).join('');
 const num=(label,name,value,min,max)=>`<label class="ag-field">${label}<input type="number" min="${min}" max="${max}" name="${name}" value="${value}"></label>`;
 const fit=['contain','cover','stretch'].map(value=>`<option value="${value}" ${(s.config.background_fit||'contain')===value?'selected':''}>${{contain:'Fit entire image',cover:'Fill canvas (crop)',stretch:'Stretch'}[value]}</option>`).join('');
 return `<div class="aghq-management">
<section class="ag-card"><h3 class="ag-card__title">Player Access</h3><label class="ag-field ag-field--inline"><input type="checkbox" name="player_access_enabled" ${accessEnabled()?'checked':''}> Players can open Headquarters</label><p class="aghq-hint">Now ${accessEnabled()?'visible to':'hidden from'} players. Hiding removes the player launcher only; GM access and Guildhall records stay intact. Applies when you select Save Changes.</p></section>
<section class="ag-card"><h3 class="ag-card__title">Guild Rank</h3><p class="aghq-hint">Rank changes are manual and apply at once; lowering capacity never removes acquired copies.</p><div class="aghq-toolrow"><label class="ag-field ag-field--inline">Guild Rank <select data-rank>${[1,2,3,4,5].map(i=>`<option value="${i}" ${i===s.core.guild_state.rank?'selected':''}>${i}</option>`).join('')}</select></label><button type="button" class="ag-btn" data-action="set-rank">Set Rank</button></div></section>
<section class="ag-card"><h3 class="ag-card__title">Player rooms</h3><p class="aghq-hint">Adds a Personal Quarters room for every player who does not have one yet.</p><div class="aghq-toolrow"><button type="button" class="ag-btn" data-action="add-rooms">${icon('fa-plus')} Create Missing Player Rooms</button></div></section>
<section class="ag-card aghq-wide"><h3 class="ag-card__title">Guildhall and canvas</h3><div class="ag-form-grid"><label class="ag-field">Guildhall name<input name="name" value="${esc(s.config.name)}"></label>${num('Canvas width','width',s.config.bounds.width,4,100)}${num('Canvas height','height',s.config.bounds.height,4,100)}</div>
<div class="aghq-toolrow aghq-bg-path"><label class="ag-field aghq-grow">Background asset path<input name="background" value="${esc(s.config.background)}" placeholder="worlds/my-world/assets/guildhall.webp"></label><button type="button" class="ag-btn ag-btn--sm" data-action="browse-background">${icon('fa-folder-open')} Browse / Upload</button></div>
<div class="ag-form-grid"><label class="ag-field">Image fit<select name="background_fit">${fit}</select></label>${num('Horizontal %','background_x',s.config.background_x??50,0,100)}${num('Vertical %','background_y',s.config.background_y??50,0,100)}${num('Opacity %','background_opacity',s.config.background_opacity??100,0,100)}</div>
<p class="aghq-hint">Fit entire image shows the full image without cropping. Fill canvas permits positioning the crop. Sharpness still depends on the original uploaded image resolution.</p></section>
<section class="ag-card aghq-wide"><h3 class="ag-card__title">Five-Rank Configuration</h3><div class="ag-table-wrap"><table class="ag-table aghq-ranks"><thead><tr><th scope="col" class="is-num">Rank</th><th scope="col">Shared slots</th><th scope="col">Orders / downtime</th><th scope="col">Auto-unlocked facility IDs</th></tr></thead><tbody>${ruleTable}</tbody></table></div><p class="aghq-hint">Rank 2–5 defaults stay unchanged until the GM configures new capacity or facility unlocks.</p></section>
<details class="ag-devtools aghq-wide"><summary>Developer Tools</summary><p class="aghq-hint">Test-world helpers. They add records to the real Guildhall catalog.</p><div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm" data-action="load-demo">Seed Test Facility Records</button></div></details></div>`;
 }
 filterCatalog(root,term){
   const q=String(term||'').trim().toLowerCase();let count=0;
   root.querySelectorAll('.aghq-catalogrow').forEach(card=>{const visible=card.textContent.toLowerCase().includes(q);card.hidden=!visible;if(visible)count++;});
   const output=root.querySelector('[data-catalog-count]');if(output)output.textContent=`${count} of ${root.querySelectorAll('.aghq-catalogrow').length} facilities`;
 }
 bind(root){
 if(root.dataset.aghqBound==='1')return;
 root.dataset.aghqBound='1';
 root.addEventListener('click',e=>this.click(e,root));
 root.addEventListener('submit',e=>this.submit(e));
 root.addEventListener('input',e=>{
   if(e.target?.matches?.('[data-catalog-search]')){
     this.catalogSearch=this.fv.search=e.target.value;
     this.filterCatalog(root,this.catalogSearch);
   }
 });
 root.addEventListener('change',e=>{const f=e.target?.closest?.('[data-fac-filter]');if(f&&game.user.isGM){this.fv[f.dataset.facFilter]=f.value;this.render();return;}this.markSetupDirty(e.target);});
 root.addEventListener('input',e=>this.markSetupDirty(e.target));
 // Room picker radio group: arrow keys move between rooms.
 root.addEventListener('keydown',e=>{const btn=e.target?.closest?.('[role="radio"][data-room]');if(!btn||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const all=[...btn.parentElement.querySelectorAll('[data-room]')];const next=all[(all.indexOf(btn)+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+all.length)%all.length];
  e.preventDefault();next?.click();});
 root.addEventListener('dragstart',e=>this.startDrag(e));
 root.addEventListener('dragover',e=>{if(e.target.closest('.aghq-board'))e.preventDefault();});
 root.addEventListener('drop',e=>this.drop(e));
 }
 /** GM Setup edits wait for Save Changes (D4); the footer only says there is something to save. */
 markSetupDirty(target){if(!target?.closest?.(`form[data-aghq-form="${SETUP_FORM}"]`)||target.matches?.('[data-rank]'))return;const status=target.closest('form').querySelector('[data-setup-status]');if(status)status.textContent='Unsaved changes';}
 async click(event,root){if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const hit=event.target.closest('[data-installed],[data-decoration]');if(hit){this.selectedCopy=hit.dataset.installed||hit.dataset.decoration;this.render();return;}const btn=event.target.closest('button');if(!btn)return;
 const s=read(),st=site(s);const tab=btn.dataset.tab,room=btn.dataset.room;
 if(tab){if(['manage','facilities'].includes(tab)&&!game.user.isGM)return allowedOpsError('GM Setup and Facilities require GM permissions.');this.tab=tab;this.selectedCopy='';this.render();return;}
 if(room){this.selectedRoom=room;this.selectedCopy='';this.render();return;}
 const op=btn.dataset.action;if(!op)return;event.preventDefault();
 if(op==='help'){await infoDialog('Headquarters help',this.help());return;}
 if(op==='cancel-setup'){this.render();return;}
 if(op==='zoom-in'||op==='zoom-out'){this.zoom=Math.max(.5,Math.min(1.75,this.zoom+(op==='zoom-in'?.15:-.15)));this.render();return;}
 if(op==='take-lock'){await request('lock');return;}
 if(op==='release'){await request('unlock_editor');return;}
 if(op==='load-demo'){
   this.catalogSearch=this.fv.search='';this.focusCatalog=true;
   if(await request('load_demo'))ui.notifications?.info?.('Test facilities added to the real Guildhall catalog. Next: Unlock → Acquire +1 → Guildhall Builder → Edit Guildhall.');
   return;
 }
 if(op==='add-rooms'){await request('add_rooms',{users:[...game.users.values()].filter(u=>!u.isGM).map(u=>({id:u.id}))});return;}
 if(op==='set-rank'){const rank=Number(root.querySelector('[data-rank]').value);await request('set_rank',{rank});return;}
 if(op==='unlock-facility'){if(await request('unlock_facility',{facility_ref:btn.dataset.id}))ui.notifications?.info?.('Facility unlocked. Select Acquire +1 to obtain an installable copy.');return;}
 if(op==='acquire'){if(await request('acquire',{facility_ref:btn.dataset.id,key:idKey()}))ui.notifications?.info?.('Facility copy acquired. Find it in Guildhall Builder → Available Facilities, then Edit Guildhall to install.');return;}
 if(op==='import-defs'){const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.addEventListener('change',async()=>{try{if(!file.files?.[0])return;const parsed=JSON.parse(await file.files[0].text());const defs=Array.isArray(parsed)?parsed:parsed.records;for(const def of defs)validateDefinition(def);await request('import_definitions',{definitions:defs});}catch(e){allowedOpsError(friendly(e));}});file.click();return;}
 if(op==='browse-background'||op==='browse-decoration'){const field=op==='browse-background'?root.querySelector('[name="background"]'):root.querySelector('form[data-aghq-form="decoration"] [name="art"]');const picker=foundry.applications.apps.FilePicker;new picker({type:'image',current:field.value,callback:path=>{field.value=path;}}).render({force:true});return;}
 if(op==='toggle-hireling-working'){
   if(!game.user.isGM)return allowedOpsError('GM only.');
   const row=hirelingState(s,btn.dataset.hireRef);if(row)await request('set_working',{hireling_ref:row.hireling_ref,working:!row.working});return;
 }
 if(op==='unassign-hireling'){
   if(!game.user.isGM)return allowedOpsError('GM only.');
   const name=this.hirelingName(btn.dataset.hireRef);
   if(!await confirmDialog(`Unassign ${name} from this station? They stay on the roster.`,{title:`Unassign ${name}?`,yes:`Unassign ${name}`,danger:true}))return;
   await request('unassign_staff',{hireling_ref:btn.dataset.hireRef});return;
 }
 if(op==='rotate'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(ins)await request('rotate',this.withRevision(s,ins.room_key,{key:ins.key}));return;}
 if(op==='uninstall'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(!ins)return;const staffed=st.staffing_slots.filter(x=>x.installation_key===ins.key&&x.occupant_hireling_ref);const msg=staffed.length?`Uninstall this facility and unassign ${staffed.length} Hireling(s)?`:'Return this facility to acquired inventory?';if(!await confirmDialog(msg,{title:staffed.length?'Uninstall this facility?':'Return this facility?',yes:staffed.length?'Uninstall facility':'Return to inventory',danger:true}))return;await request('uninstall',this.withRevision(s,ins.room_key,{key:ins.key,confirm_staff:true}));this.selectedCopy='';return;}
 if(op==='upgrade'){const stage_key=root.querySelector('[data-upgrade-stage]')?.value;if(stage_key)await request('upgrade',{key:this.selectedCopy,stage_key});return;}
 if(op==='rotate-decor'||op==='remove-decor'){const room_key=this.selectedRoom;if(op==='remove-decor'&&!await confirmDialog('Remove this decoration from the room?',{title:'Remove this decoration?',yes:'Remove decoration',danger:true}))return;await request(op==='rotate-decor'?'rotate_decoration':'remove_decoration',this.withRevision(s,room_key,{room_key,key:this.selectedCopy}));if(op==='remove-decor')this.selectedCopy='';return;}
 }
 async submit(event){const form=event.target.closest('form[data-aghq-form]');if(!form)return;event.preventDefault();if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const data=new FormData(form);if(form.dataset.aghqForm===SETUP_FORM){await this.saveSetup(data);return;}let op,payload;
 if(form.dataset.aghqForm==='activate'){op='activate';payload=Object.fromEntries(data.entries());}
 else if(form.dataset.aghqForm==='add-hireling'){
    if(!game.user.isGM)return allowedOpsError('GM only.');
    const id=String(data.get('hireling_ref')||'');
    const def=this.nativeHirelingRecords();
    if(!HIRE_REF.test(id)||def.conflicts.has(id)||def.records.get(id)?.entity_type!=='Hireling')return allowedOpsError('Select a unique imported HIRE-* source definition.');
    op='register_hireling';payload={hireling_ref:id};
 }
 else if(form.dataset.aghqForm==='staff-hireling'){
    if(!game.user.isGM)return allowedOpsError('GM only.');
    const id=String(data.get('hireling_ref')||'');const key=String(data.get('installation_key')||'');
    op=key?'assign_staff':'unassign_staff';payload={hireling_ref:id,...(key?{installation_key:key}:{})};
 }
 else if(form.dataset.aghqForm==='depart-hireling'){
    if(!game.user.isGM)return allowedOpsError('GM only.');
    const id=String(data.get('hireling_ref')||'');const status=String(data.get('status')||'');
    const name=this.hirelingName(id);
    if(!await confirmDialog(`Permanently mark ${name} as ${status}, clear their Headquarters station, and keep their history? This cannot be undone automatically.`,{title:`Mark ${name} as ${status}?`,yes:`Mark ${status}`,danger:true}))return;
    op='depart_hireling';payload={hireling_ref:id,status,confirm:true};
 }
 else if(form.dataset.aghqForm==='decoration'){op='add_decoration_art';payload={art:data.get('art')};}
 if(op)await request(op,payload);
 }
 /** GM Setup's one Save Changes: settings and ranks first (they can be refused), Player Access last. Unchanged parts are not written. */
 async saveSetup(data){
  if(!game.user.isGM)return allowedOpsError('GM only.');
  const plan=setupChanges(read(),accessEnabled(),data);
  const status=this.element?.querySelector?.('[data-setup-status]');
  if(!Object.keys(plan).length){if(status)status.textContent='No changes to save';return;}
  if(plan.config&&!await request('save_config',plan.config))return;
  if(plan.rules&&!await request('set_rank_table',{rules:plan.rules}))return;
  if('access' in plan){try{await setPlayerAccess(plan.access);}catch(e){allowedOpsError(friendly(e));return;}}
  ui.notifications?.info?.(`Headquarters settings saved.${'access' in plan?` Player interface ${accessEnabled()?'visible':'hidden'}.`:''}`);
  this.render();
 }
 startDrag(event){if(!canView())return;const s=read();const node=event.target.closest('[data-installed],[data-copy],[data-decoration],[data-decor-art],[data-hire-card]');if(!node)return;
 let kind,key;
 if(node.dataset.installed){kind='installed';key=node.dataset.installed;const rect=node.getBoundingClientRect();this.dragOffset={x:event.clientX-rect.left,y:event.clientY-rect.top};}
 else if(node.dataset.copy){kind='copy';key=node.dataset.copy;this.dragOffset={x:0,y:0};}
 else if(node.dataset.decoration){kind='decoration';key=node.dataset.decoration;this.dragOffset={x:event.clientX-node.getBoundingClientRect().left,y:event.clientY-node.getBoundingClientRect().top};}
 else if(node.dataset.hireCard){kind='hireling';key=node.dataset.hireCard;this.dragOffset={x:0,y:0};}
 else {kind='newdecor';key=node.dataset.decorArt;this.dragOffset={x:0,y:0};}
 event.dataTransfer?.setData('text/plain',JSON.stringify({kind,key}));if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
 }
 withRevision(s,roomKey,payload){const st=site(s),room=st.rooms.find(x=>x.key===roomKey);return roomKey==='common'?{...payload,expected_shared_revision:st.shared_revision}:{...payload,room_key:roomKey,expected_room_revision:room?.revision};}
 async drop(event){if(!canView())return;const board=event.target.closest('[data-board]');if(!board)return;event.preventDefault();const s=read();if(!s.active)return;let obj;try{obj=JSON.parse(event.dataTransfer.getData('text/plain'));}catch{return;}
 const target=event.target.closest('[data-installed]');
  if(obj.kind==='hireling'){
   if(!game.user.isGM)return allowedOpsError('Only the GM may manage Hireling staffing in this release.');
   if(!target)return allowedOpsError('Drop a Hireling portrait onto an installed facility.');
   await request('assign_staff',{hireling_ref:obj.key,installation_key:target.dataset.installed});return;
  }
 const roomKey=board.dataset.board;const rect=board.getBoundingClientRect();const cell=Math.round(s.config.cell_px*this.zoom);
 const x=Math.max(0,Math.round((event.clientX-rect.left-this.dragOffset.x)/cell)),y=Math.max(0,Math.round((event.clientY-rect.top-this.dragOffset.y)/cell));
 const p=this.withRevision(s,roomKey,{room_key:roomKey,key:obj.key,x,y});
 if(obj.kind==='copy')await request('install',p);
 else if(obj.kind==='installed'){const ins=site(s).installations.find(x=>x.key===obj.key);if(ins?.room_key!==roomKey)return allowedOpsError('Use Uninstall before changing a facility to another room.');await request('move',p);}
 else if(obj.kind==='newdecor'&&roomKey!=='common'){await request('add_decoration',this.withRevision(s,roomKey,{room_key:roomKey,key:`decor_${uuid().replace(/-/g,'').slice(0,12)}`,art:obj.key,x,y,width:2,height:2}));}
 else if(obj.kind==='decoration'&&roomKey!=='common'){await request('move_decoration',p);}
 }
 async _onClose(options){
   // Release the active window pointer before any asynchronous lease cleanup.
   // The old implementation waited for a GM state write while Foundry was
   // closing; a write-triggered render could revive the closing ApplicationV2.
   if(windowApp===this)windowApp=null;
   clearInterval(this.leaseTimer);
   try{await super._onClose(options);}finally{
     if(privateStore?.isReady()&&canView()){
       try{if(isEditing(read()))void request('unlock_editor').catch(error=>console.warn('Headquarters lease release failed',error));}
       catch(error){console.warn('Headquarters lease cleanup deferred',error);}
     }
   }
 }
}
Hooks.once('init',()=>{
 game.settings.register(MODULE_ID,'state',{name:'Headquarters public layout projection (no private personnel)',scope:'world',config:false,type:Object,default:emptyState(),onChange:()=>{embed.refreshAll();if(windowApp?.rendered&&canView())windowApp.render();}});
 game.settings.register(MODULE_ID,VAULT_POINTER,{name:'GM private Headquarters state document ID (no payload)',scope:'world',config:false,restricted:true,type:String,default:''});
 game.settings.register(MODULE_ID,'playerAccessEnabled',{name:'Player Access — Headquarters',hint:'Show or hide the Headquarters launcher and interface for players. This does not disable game mechanics or delete Guildhall state.',scope:'world',config:true,restricted:true,type:Boolean,default:true,onChange:refreshPlayerAccess});
 // Publish the opening contract before any asynchronous private-state migration.
 // Manager tiles must never disappear merely because initialization failed.
 const mod=game.modules.get(MODULE_ID);
 if(mod)mod.api={apiVersion:'0.2',open,
  getState:()=>{if(!game.user.isGM)throw Error('Headquarters campaign-state API is GM-only.');return structuredClone(read());},
  exportState:()=>{if(!game.user.isGM)throw Error('Headquarters export is GM-only.');return structuredClone(read());},
  playerAccess:{contract:ACCESS_CONTRACT,getState:playerAccessState,setEnabled:setPlayerAccess},
  reconcileDepartures,
  // 0.9.0: player-safe, read-only Guildhall view for one character (GM or the Actor's owner; Player Access applies). See player-view.mjs.
  playerView:actor=>{requirePlayerViewAccess(actor,game.user,accessEnabled());return buildPlayerView(read(),actor,game.users);},
  // 0.10.0: compact read-only Guildhall view for partner windows (see embed.mjs and the README).
  embed:Object.freeze({contract:EMBED_CONTRACT,modes:EMBED_MODES,mount:embed.mount}),
  getPersonnel:()=>{if(!game.user.isGM)throw Error('Personnel state API is GM-only.');return structuredClone(read().personnel??{format:'aghq-personnel/0.1',hirelings:[]});},
  // GM-only hand-off used by General Manager's single importer. Adds new facility definitions; existing ids are kept.
  previewFacilityImport:payload=>{
   if(!game.user.isGM)throw Error('Headquarters facility import is GM-only.');
   const {errors,rows}=planFacilityImport(payload,new Set(facilities(read()).keys()));
   return {errors,rows:rows.map(({id,name,action,reason})=>({id,name,action,reason}))};
  },
  importFacilities:async payload=>{
   if(!game.user.isGM)throw Error('Headquarters facility import is GM-only.');
   const {errors,rows}=planFacilityImport(payload,new Set(facilities(read()).keys()));
   if(errors.length)throw Error(`Import blocked: ${errors[0]}`);
   const fresh=rows.filter(r=>r.action==='new');
   const report={created:[],updated:[],skipped:rows.filter(r=>r.action==='skip').map(r=>({id:r.id,reason:r.reason})),failed:[]};
   if(!fresh.length)return report;
   // Definitions only: no Guildhall activation needed. Save directly so a refusal comes back as a reason, not a toast.
   try{
    if(!privateStore?.isReady())throw Error('Private Headquarters state is not initialized. Reload Foundry as GM and try again.');
    const step=sequence.then(()=>saveLocal(game.user,'import_definitions',{definitions:fresh.map(r=>r.definition)}));sequence=step.catch(()=>{});await step;
   }catch(e){return {...report,failed:fresh.map(r=>({id:r.id,reason:friendly(e)}))};}
   report.created=fresh.map(r=>r.id);return report;
  },
  inspectFacilityRef:async(ref,resolve)=>{if(!game.user.isGM)throw Error('GM diagnostics only.');return inspectFacilityRef(ref,resolve);}
 };
 // Foundry V14 can render the Actor Directory before the ready hook.
 Hooks.on('renderActorDirectory',mountActorsLauncher);
 // Optional launch conveniences must not break startup if Foundry rejects one.
 try{
  game.keybindings.register(MODULE_ID,'open',{name:'Open Headquarters',hint:'Open the independent Guildhall builder.',editable:[{key:'KeyH',modifiers:['SHIFT']}],onDown:()=>{open();return true;},restricted:false});
 }catch(error){console.warn('Headquarters keyboard shortcut unavailable',error);}
 try{
  game.settings.registerMenu?.(MODULE_ID,'openHeadquarters',{
   name:'Ashen Gate | Headquarters',label:'Open Headquarters',
   hint:'GM fallback for the Headquarters window. Normal player/GM launcher is in Actors.',
   icon:'fa-solid fa-building',type:HeadquartersApp,restricted:true
  });
 }catch(error){console.warn('Headquarters Settings fallback unavailable',error);}
});
Hooks.once('ready',async()=>{
 try{
  const JournalEntryClass=foundry?.documents?.JournalEntry ?? globalThis.JournalEntry ?? game.journal?.documentClass;
  privateStore=createPrivateStateStore({game,JournalEntryClass});
  if(game.user?.isGM)await privateStore.initialize();
 }catch(error){
  ui.notifications?.error?.(`Headquarters private save initialization failed: ${friendly(error)}. Open button remains available; GM editing is blocked until recovery.`);
  console.error('Headquarters private vault initialization failed',error);
 }
 // Restore launcher immediately even when the private vault cannot initialize.
 const actorTab=ui?.sidebar?.tabs?.actors ?? ui?.actors;
 if(actorTab?.element)mountActorsLauncher(actorTab,actorTab.element);
 // A client-supplied socket sender is not an authenticated player identity.
 // Do not re-enable the v0.3.0 mutation socket under any fallback condition.
 const writer=createHQAuthoritativeWriter({readState:read,saveState:s=>privateStore.save(s),applyOperation});
 playerBridge=createPlayerIntentBridge({
  game,hooks:Hooks,
  playerAccessEnabled:accessEnabled,
  isGuildMember:(user,actor)=>!!read().active && !!site(read())?.rooms?.some(r=>r.kind==='personal'&&r.owner_user_id===user.id),
  alreadyProcessed:writer.alreadyProcessed,
  apply:(context)=>{
   // Serialize BOTH GM edits and authenticated player requests through one
   // writer queue so a simultaneous GM edit cannot overwrite the player save.
   const step=sequence.then(()=>{
    if(!accessEnabled())throw Error('Headquarters Player Access is hidden by the GM.');
    return writer.apply(context);
   });
   sequence=step.catch(()=>{});
   return step;
  },
  recordReceipt:async({actor,requestId,ok,error})=>{
   // Actor-flag receipt is transport metadata, NOT an authoritative Guildhall record.
   await actor?.update?.({[RECEIPT_PATH]:{id:requestId,ok:!!ok,...(!ok?{error:String(error||'Denied').slice(0,180)}:{})}});
  }
 });
 Hooks.on('updateActor',acknowledgement);
});
