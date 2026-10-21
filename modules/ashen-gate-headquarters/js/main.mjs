import {MODULE_ID,emptyState,applyOperation,activeLock,site,rankConfig,stageFor,facilities,owned,validateDefinition,planFacilityImport} from './logic.mjs';
import {confirmDialog} from './ag-dialogs.mjs';
import {facilitiesPanel,facilityRow,listFacilitiesTab,DEFAULT_VIEW as FAC_VIEW} from './facilities-tab.mjs';
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
const uiVersion=()=>game.modules.get(MODULE_ID)?.version || "0.6.0";
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
 static DEFAULT_OPTIONS={id:"ashen-gate-headquarters-window",window:{title:"Ashen Gate | Headquarters",resizable:true},position:{width:1150,height:790},classes:["ag-app","aghq-app"]};
 static PARTS={main:{template:`modules/${MODULE_ID}/templates/main.hbs`}};
 constructor(options){super(options);this.tab="builder";this.previousTab="builder";this.selectedRoom="";this.selectedCopy="";this.catalogSearch="";this.fv={...FAC_VIEW};this.managementScroll=0;this.focusCatalog=false;this.zoom=1;this.dragOffset={x:0,y:0};this.leaseTimer=setInterval(()=>{try{if(privateStore?.isReady()&&isEditing(read()))request("renew");}catch(error){console.warn('Headquarters lease renewal postponed',error);}},60000);}
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
  if(!s.active && this.tab==='help')return `<header class="ag-header aghq-top"><div class="aghq-heading"><h2>Ashen Gate | Headquarters</h2></div><div class="ag-header__meta aghq-header-actions"><span class="aghq-version">v${esc(uiVersion())} · Alpha</span><button type="button" data-action="help">Back</button></div></header>${this.help()}`;
  if(!s.active&&gm&&this.tab==='facilities')return `<header class="ag-header aghq-top"><div class="aghq-heading"><h2>Ashen Gate | Headquarters</h2></div><div class="ag-header__meta aghq-header-actions"><span class="aghq-version">v${esc(uiVersion())} · Alpha</span><button type="button" data-action="help">Help</button></div></header><nav class="ag-tabs aghq-tabs" aria-label="Headquarters sections"><button type="button" data-tab="builder" class="">Activation</button><button type="button" data-tab="facilities" class="active">Facilities</button></nav><main class="aghq-body">${this.facilities(s)}</main>`;
  if(!s.active)return `<header class="ag-header aghq-top"><div class="aghq-heading"><h2>Ashen Gate | Headquarters</h2></div><div class="ag-header__meta aghq-header-actions"><span class="aghq-version">v${esc(uiVersion())} · Alpha</span><button type="button" data-action="help">Help</button></div></header>${gm?`<nav class="ag-tabs aghq-tabs" aria-label="Headquarters sections"><button type="button" data-tab="builder" class="active">Activation</button><button type="button" data-tab="facilities" class="">Facilities</button></nav>`:''}<section class="aghq-empty"><h3>Guildhall not activated</h3><p>The GM must associate the Guildhall with an existing HQ-* and LOC-* identity before players can enter.</p>${gm?`<form data-aghq-form="activate" class="aghq-stack"><label>Guildhall HQ ID<input name="hq_ref" value="HQ-DEMO-001" required></label><label>Location ID<input name="location_ref" value="LOC-DEMO-001" required></label><label>Campaign key<input name="campaign_key" value="local-campaign" required></label><label>Guild key<input name="guild_key" value="primary" required></label><button type="submit">Activate Guildhall</button></form><p class="aghq-hint">Use actual existing HQ-/LOC- source IDs for your campaign. Demo IDs shown here do not create Location records.</p><section class="aghq-panel" data-hq-section="library"><h3>Facility library (${s.catalog.length})</h3><p class="aghq-hint">Imported facility definitions. Nothing is unlocked or acquired until the Guildhall is activated (then the Facilities tab).</p>${s.catalog.length?`<ul>${s.catalog.map(d=>`<li><strong>${esc(d.name)}</strong> <small>${esc(d.id)}</small></li>`).join('')}</ul>`:'<p class="aghq-hint">No facility definitions yet. Import a facilities file in Ashen Gate | General Manager.</p>'}</section>`:`<p class="aghq-hint">Waiting for GM activation.</p>`}</section>`;
  const st=site(s);const rank=s.core.guild_state.rank, cap=rankConfig(s).shared_facility_slots;
  const n=st.installations.filter(x=>x.room_key==="common").length;
  const lease=activeLock(s);const holder=lease?game.users.get(lease.user_id)?.name||"Unknown":"None";
  const isEditor=isEditing(s);
  const nav=[['builder','Guildhall Builder'],['quarters','Personal Quarters'],['hirelings','Hirelings'],['benefits','Benefits'],['facilities','Facilities'],['manage','GM Setup']];
  const navbar=nav.filter(x=>!['manage','facilities'].includes(x[0])||gm).map(([id,title])=>`<button type="button" data-tab="${id}" class="${id===this.tab?'active':''}">${title}</button>`).join('');
  let middle=this.tab==='help'?this.help():this.tab==='builder'?this.builder(s,isEditor):this.tab==='quarters'?this.quarters(s):this.tab==='hirelings'?this.hirelings(s):this.tab==='benefits'?this.benefits(s):this.tab==='facilities'?this.facilities(s):this.management(s);
  return `<header class="ag-header aghq-top"><div class="aghq-heading"><h2>${esc(s.config.name)}</h2><small>Guild Rank ${rank} · ${n}/${cap} shared facilities · ${rankConfig(s).orders_per_downtime} Orders / downtime (test default)</small></div><div class="ag-header__meta aghq-header-actions"><span class="aghq-version">v${esc(uiVersion())} · Alpha</span><button type="button" data-action="help">${this.tab==='help'?'Back':'Help'}</button></div></header><nav class="ag-tabs aghq-tabs" aria-label="Headquarters sections">${navbar}</nav><main class="aghq-body">${middle}</main><footer class="aghq-footer"><span>Auto-saved · Shared revision ${st.shared_revision} · state revision ${s.state_revision} · ${lease?`Editor: ${esc(holder)}`:'View-only'}</span><div class="aghq-footer-actions">${this.tab==='builder'?`${isEditor?`<button type="button" data-action="release">Finish Editing</button>`:`<button type="button" data-action="take-lock">${gm&&lease?'GM Take Over':'Edit Guildhall'}</button>`}`:''}</div></footer>`;
 }
 help(){return `<section class="aghq-panel aghq-help"><h3>Headquarters — Help</h3><p>This Alpha is a standalone Guildhall layout editor. Facility effects are informational only, and all example facilities are synthetic test content.</p><h4>Guildhall Builder</h4><p>The GM unlocks and acquires facility copies in the Facilities tab. In Guildhall Builder, choose Edit Guildhall, drag copies from Available Facilities to the grid, and click an installed piece to rotate, upgrade or uninstall it. One person can edit the shared layout at a time.</p><h4>Personal Quarters</h4><p>The GM creates player rooms from GM Setup. Each owner may arrange their own room; all guild members can view it. Decorative images do not use facility slots.</p><h4>Support and safety</h4><p>Use a disposable test world. No Foundry V14 live verification has been performed. Shift+H also opens this window. Hirelings v1 personnel state and facility staffing are managed here: GM Working toggle, roster and confirmed departures. Source HIRE/HPERK definitions remain in Manager-imported Foundry documents; eligibility cannot be confirmed when structured metadata is missing. Orders and Assignments are not implemented. The GM can hide this player interface through GM Setup or Manager → Player Access; this does not delete Guildhall state.</p><button type="button" data-action="help">Back to ${esc(this.previousTab)}</button></section>`;}
 builder(s,editable){
 const st=site(s);const cell=Math.round(s.config.cell_px*this.zoom);
 const pieces=st.installations.filter(x=>x.room_key==='common');
 const items=s.inventory.filter(item=>!st.installations.some(i=>i.key===item.key)&&facilities(s).get(item.facility_ref)?.placements?.includes('shared'));
 const list=items.length?items.map(x=>this.libraryCopy(s,x,editable)).join(''):'<p class="aghq-emptycopy">No uninstalled acquired shared facilities.</p>';
 const tiles=pieces.map(x=>this.tile(s,x,cell,editable)).join('');
 const size=s.config.bounds;
 return `<div class="aghq-grid"><aside class="aghq-sidebar"><h3>Available Facilities</h3><p class="aghq-hint">GM must unlock and acquire copies. Drag onto the grid.</p>${list}<h3>Canvas Tools</h3><div class="aghq-toolrow"><button type="button" data-action="zoom-out">−</button><span>${Math.round(this.zoom*100)}%</span><button type="button" data-action="zoom-in">+</button></div><p class="aghq-hint">Move any building piece. Rotation is handled in its inspector. Collisions and boundaries are enforced.</p></aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${size.width} × ${size.height} grid</strong><span>${editable?'Editing shared Guildhall':'Read-only · take editing lock to place pieces'}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="common" style="--cell:${cell}px;width:${size.width*cell}px;height:${size.height*cell}px;${s.config.background?`--aghq-backdrop:url('${esc(s.config.background)}');--aghq-fit:${(s.config.background_fit||'contain')==='stretch'?'100% 100%':(s.config.background_fit||'contain')};--aghq-pos:${Number(s.config.background_x??50)}% ${Number(s.config.background_y??50)}%;--aghq-opacity:${Number(s.config.background_opacity??100)/100};`:''}">${tiles}</div></div></div><aside class="aghq-inspector"><h3>Selected Facility</h3>${this.inspector(s,editable,'common')}</aside></div>`;
 }
 libraryCopy(s,x,enabled){const def=facilities(s).get(x.facility_ref);if(!def)return '';const {stage}=stageFor(s,x);return `<div class="aghq-copy" ${enabled?'draggable="true"':''} data-copy="${esc(x.key)}"><strong>${esc(def.name)}</strong><small>${esc(stage.label||stage.key)} · ${stage.width}×${stage.height}</small><small class="aghq-coderef">${esc(x.key)}</small></div>`;}
 tile(s,item,cell,enabled){const copy=owned(s).get(item.key);if(!copy)return '';const {def,stage}=stageFor(s,copy);const p=item.placement;const isSelected=item.key===this.selectedCopy;const image=stage.art?`<img src="${esc(stage.art)}" draggable="false" alt="">`:`<span class="aghq-tile-icon">${def.category==='Profession'?'⚒':def.category==='Personal'?'✎':'▣'}</span>`;return `<div class="aghq-tile ${isSelected?'selected':''}" data-installed="${esc(item.key)}" ${enabled?'draggable="true"':''} style="left:${p.x*cell}px;top:${p.y*cell}px;width:${p.width*cell}px;height:${p.height*cell}px"><div class="aghq-tile-art">${image}</div><span class="aghq-tile-label">${esc(def.name)}</span><span class="aghq-rotation">${p.rotation}°</span></div>`;}
 inspector(s,editable,roomKey){const st=site(s),ins=st.installations.find(x=>x.key===this.selectedCopy&&x.room_key===roomKey);if(!ins)return '<p class="aghq-hint">Select a placed facility for details, rotation, upgrades and uninstallation.</p>';
 const copy=owned(s).get(ins.key),{def,stage}=stageFor(s,copy);const target=roomKey==='common'?editable:roomAccess(st.rooms.find(x=>x.key===roomKey));
 const buttons=target?`<div class="aghq-toolrow"><button type="button" data-action="rotate">Rotate 90°</button><button type="button" data-action="uninstall" class="aghq-danger">Uninstall</button></div>`:'';
 const upgrades=game.user.isGM && def.stages.length>1?`<label>Upgrade copy <select data-upgrade-stage>${def.stages.map(x=>`<option value="${esc(x.key)}" ${x.key===copy.stage_key?'selected':''}>${esc(x.label||x.key)} · ${x.width}×${x.height}</option>`).join('')}</select></label><button type="button" data-action="upgrade">Apply Upgrade (GM)</button>`:'';
 const bens=stage.benefits?.map(b=>`<li><strong>${esc(b.name)}</strong><br><small>${esc(b.description||'Informational only')} · ${esc(b.recipient||'configured recipient')}</small></li>`).join('')||'<li>No benefits defined.</li>';
 return `<div class="aghq-detail"><h4>${esc(def.name)}</h4><p>${esc(def.id)}<br>${esc(stage.label||stage.key)} · ${ins.placement.width}×${ins.placement.height} cells<br>Rotation: ${ins.placement.rotation}°</p>${buttons}${upgrades}<h4>Benefits (informational)</h4><ul>${bens}</ul>${this.staffingInspector(s,ins)}<p class="aghq-hint">Staffing and Hireling benefits are informational only; sheets and rolls are unchanged.</p></div>`;
 }
 quarters(s){const st=site(s);const rooms=st.rooms.filter(r=>r.kind==='personal');if(!rooms.length)return '<div class="aghq-empty"><h3>No personal rooms yet</h3><p>Ask the GM to create rooms for the current players in the Management tab.</p></div>';
 const current=rooms.find(x=>x.key===this.selectedRoom)||rooms.find(x=>x.owner_user_id===game.user.id)||rooms[0];this.selectedRoom=current.key;const mine=roomAccess(current);const layout=s.personal_layouts[current.key];if(!layout)return '<p>Room layout missing; GM repair required.</p>';
 const cell=Math.round(s.config.cell_px*this.zoom);
 const roomtabs=rooms.map(r=>`<button type="button" data-room="${esc(r.key)}" class="${r.key===current.key?'active':''}">${esc(game.users.get(r.owner_user_id)?.name||r.owner_user_id)} ${roomAccess(r)?'✎':''}</button>`).join('');
 const items=s.inventory.filter(x=>!st.installations.some(y=>y.key===x.key)&&facilities(s).get(x.facility_ref)?.placements?.includes('personal'));
 const decorators=(s.config.decoration_art||[]).map((url,i)=>`<div class="aghq-decoration-card" data-decor-art="${esc(url)}" ${mine?'draggable="true"':''}><img src="${esc(url)}" alt="Decoration ${i+1}" draggable="false"></div>`).join('');
 const pieces=st.installations.filter(x=>x.room_key===current.key).map(x=>this.tile(s,x,cell,mine)).join('');
 const arts=layout.decorations.map(d=>`<div class="aghq-decoration ${d.key===this.selectedCopy?'selected':''}" data-decoration="${esc(d.key)}" ${mine?'draggable="true"':''} style="left:${d.x*cell}px;top:${d.y*cell}px;width:${d.width*cell}px;height:${d.height*cell}px;transform:none"><img src="${esc(d.art)}" alt="" draggable="false" style="transform:rotate(${d.rotation}deg)"></div>`).join('');
 return `<nav class="aghq-roomtabs">${roomtabs}</nav><div class="aghq-grid"><aside class="aghq-sidebar"><h3>Personal Facility</h3>${items.map(x=>this.libraryCopy(s,x,mine)).join('')||'<p class="aghq-hint">No personal facilities acquired.</p>'}<h3>Decorations</h3><p class="aghq-hint">GM-curated artwork. Visual only; pieces may overlap.</p><div class="aghq-artgrid">${decorators||'<span class="aghq-hint">No decoration assets.</span>'}</div></aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${esc(game.users.get(current.owner_user_id)?.name||'Personal')} — ${layout.bounds.width}×${layout.bounds.height}</strong><span>${mine?'Editable':'View only'} · revision ${current.revision}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="${esc(current.key)}" style="--cell:${cell}px;width:${layout.bounds.width*cell}px;height:${layout.bounds.height*cell}px;${layout.background?`background-image:url('${esc(layout.background)}');background-size:cover;`:''}">${pieces}${arts}</div></div></div><aside class="aghq-inspector"><h3>Room Inspector</h3>${this.selectedCopy.startsWith('decor_')?this.decorInspector(s,current,mine):this.inspector(s,mine,current.key)}<p class="aghq-hint">Room artwork and furnishings are visible to guild members; only owner and GM can edit.</p></aside></div>`;
 }
 decorInspector(s,room,mine){const entry=s.personal_layouts[room.key].decorations.find(x=>x.key===this.selectedCopy);if(!entry)return '';return `<h4>Decoration</h4><img class="aghq-detail-art" src="${esc(entry.art)}" alt=""><p>Size: ${entry.width}×${entry.height} · Rotation ${entry.rotation}°</p>${mine?`<div class="aghq-toolrow"><button data-action="rotate-decor" type="button">Rotate</button><button data-action="remove-decor" type="button">Remove</button></div>`:''}`;}
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
  const entries=slots.map((slot,i)=>{const ref=slot.occupant_hireling_ref;const hire=ref?hirelingState(s,ref):null;const profile=records.get(ref);return `<li>Station ${i+1}: ${ref?(!game.user.isGM&&!profile?'Details unavailable':`${esc(profile?.name||ref)} · ${hire?.working?'Working':'Working OFF'}${game.user.isGM?` <button type="button" data-action="unassign-hireling" data-hire-ref="${esc(ref)}">Unassign</button>`:''}`):'Unstaffed'}</li>`;}).join('');
  const countLabel=canShowCount?`${slots.filter(x=>x.occupant_hireling_ref).length}/${stage.staffing_slots}`:'details unavailable';
  return `<h4>Staffing · ${countLabel}</h4><ul class="aghq-staff-list">${entries||'<li>No station records yet — GM may assign to initialize them.</li>'}</ul>${game.user.isGM?'<p class="aghq-hint">GM: use the Hirelings tab to place or transfer roster members, or drag a Hireling card onto this piece.</p>':''}`;
 }
 hirelings(s){
  const {records,conflicts,roster}=this.visibleHirelings(s);const gm=game.user.isGM;
  if(!gm)return '<section class="aghq-panel"><h3>Hirelings</h3><p>Hireling roster, Working status and personnel history are managed privately by the GM. Their presence in the Guildhall is not published to players in this Alpha.</p></section>';
  const deployed=site(s).installations.map(ins=>{
    const copy=s.inventory.find(x=>x.key===ins.key);if(!copy)return null;
    const {def,stage}=stageFor(s,copy);return {...ins,name:def.name,capacity:stage.staffing_slots};
  }).filter(x=>x && x.capacity>0);
  const registered=new Set((s.personnel?.hirelings??[]).map(x=>x.hireling_ref));
  const sources=[...records.values()].filter(x=>x.entity_type==='Hireling' && !registered.has(x.id));
  const options=sources.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.id)})</option>`).join('');
  const setup=gm?`<section class="aghq-panel"><h3>Add from imported Hireling definitions</h3><p class="aghq-hint">Imports are handled by General Manager. This action only adds a permanent HIRE-* reference to the roster; it never copies or edits its definition.</p><form data-aghq-form="add-hireling" class="aghq-toolrow"><select name="hireling_ref" aria-label="Imported Hireling">${options}</select><button type="submit" ${!sources.length?'disabled':''}>Add to roster</button></form>${conflicts.size?`<p class="aghq-error">Conflicting source IDs: ${esc([...conflicts].join(', '))}. Resolve them in Manager before registering.</p>`:''}<p class="aghq-hint">${sources.length} available imported profiles · ${roster.length} roster records</p></section>`:'';
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
   const staff=gm&&h.employment_status==='active'?`<form data-aghq-form="staff-hireling" class="aghq-toolrow"><input type="hidden" name="hireling_ref" value="${esc(h.hireling_ref)}"><select name="installation_key" aria-label="Staffing facility"><option value="">Unassigned</option>${deployed.map(i=>`<option value="${esc(i.key)}" ${placed?.slot.installation_key===i.key?'selected':''}>${esc(i.name)} (${esc(i.key)})</option>`).join('')}</select><button type="submit">${placed?'Transfer / Update':'Assign'} Station</button></form>`:'';
   const tools=gm?`<div class="aghq-toolrow"><button type="button" data-action="toggle-hireling-working" data-hire-ref="${esc(h.hireling_ref)}" ${h.employment_status!=='active'?'disabled':''}>Working: ${h.working?'ON':'OFF'} — toggle</button></div>${staff}${h.employment_status==='active'?`<form class="aghq-toolrow aghq-departure" data-aghq-form="depart-hireling"><input type="hidden" name="hireling_ref" value="${esc(h.hireling_ref)}"><select name="status" aria-label="Permanent departure reason"><option value="dismissed">Dismissed</option><option value="retired">Retired</option><option value="departed">Permanently Departed</option><option value="deceased">Deceased</option></select><button type="submit" class="aghq-danger">Confirm Permanent Departure…</button></form>`:''}`:'';
   const history=gm&&h.history?.length?`<details><summary>Personnel history (${h.history.length})</summary><ul>${h.history.map(e=>`<li>${esc(e.event)} · ${esc(e.status)} · ${esc(e.at)}</li>`).join('')}</ul></details>`:'';
   return `<article class="aghq-hire-card" data-hire-card="${esc(h.hireling_ref)}" ${gm&&h.employment_status==='active'?'draggable="true"':''}><div class="aghq-hire-photo">${profile?.img?`<img src="${esc(profile.img)}" alt="">`:'♙'}</div><div class="aghq-hire-card-body"><h4>${esc(profile?.name||h.hireling_ref)}</h4><small>${esc(h.hireling_ref)} · ${role}</small><p>${esc(position)} · ${esc(h.employment_status)} · ${h.working?'Working ON':'Working OFF'}</p><details><summary>Individual perks (${perks.length})</summary><ul>${perkText}</ul></details>${tools}${history}</div></article>`;
  }).join('');
  return `<div class="aghq-roster"><section class="aghq-panel"><h3>Hirelings Roster</h3><p class="aghq-hint">Working and personnel history belong to Hirelings state hosted by Headquarters. Assigned stations remain reserved while Working is OFF. All perks and facility benefits are informational; no character/roll modifications.</p>${roster.length?cards:'<p>No visible registered Hirelings. The GM can import HIRE-* sources through General Manager, then add them here.</p>'}</section>${setup}</div>`;
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
 return `<section class="aghq-panel"><h3>Informational Benefits</h3><p>Conditions are derived from placement and the GM Working toggle. No character sheets, rolls, Profession XP or inventory are modified.</p>${entries.length?entries.map(b=>`<article class="aghq-benefit"><strong>${esc(b.name)}</strong><small>${esc(b.source)} · ${esc(b.recipient||'configured')} · ${esc(b.activation)}${b.reason?' — '+esc(b.reason):''}</small><p>${esc(b.description||'')}</p></article>`).join(''):'<p class="aghq-hint">No installed facility benefits yet.</p>'}</section>`;}

 facilities(s){if(!game.user.isGM)return '';
  const list=listFacilitiesTab(this.facilityRows(s),this.fv);
  return facilitiesPanel(this.fv,list,{active:Boolean(s.active)});
 }
 facilityRows(s){const g=s.core?.guild_state,inst=s.active?site(s).installations:[];
  return s.catalog.map(d=>facilityRow(d,{active:Boolean(s.active),unlocked:Boolean(g?.unlocked_facility_refs?.includes(d.id)),owned:(s.inventory??[]).filter(x=>x.facility_ref===d.id).length,installed:inst.filter(i=>(owned(s).get(i.key)?.facility_ref)===d.id).length}));}
 management(s){if(!game.user.isGM)return '';
 const defs=s.catalog;const ruleTable=s.config.rank_rules.map(r=>`<tr><td>${r.rank}</td><td><input type="number" min="0" max="100" name="slots_${r.rank}" value="${r.shared_facility_slots}"></td><td><input type="number" min="0" max="100" name="orders_${r.rank}" value="${r.orders_per_downtime}"></td><td><input name="unlock_${r.rank}" value="${esc(r.unlock_refs.join(', '))}" placeholder="FAC-* IDs, comma separated"></td></tr>`).join('');
  return `<div class="aghq-management"><section class="aghq-panel aghq-compact-panel"><h3>Player Access</h3><p class="aghq-hint">Hides the player launcher only; GM access and Guildhall records remain intact.</p><form data-aghq-form="player-access" class="aghq-inline-controls"><label class="aghq-access-toggle"><input type="checkbox" name="player_access_enabled" ${accessEnabled()?'checked':''}> Players can open Headquarters</label><button type="submit">Save Player Access</button></form><p class="aghq-hint">${accessEnabled()?'Visible to players':'Hidden from players'} · Contract ${ACCESS_CONTRACT} · Manager integration optional</p></section><section class="aghq-panel"><h3>Guild / Canvas Settings</h3><p class="aghq-hint">Rank changes are manual; lowering capacity never removes acquired copies.</p><div class="aghq-inline-controls"><label>Guild Rank <select data-rank>${[1,2,3,4,5].map(i=>`<option value="${i}" ${i===s.core.guild_state.rank?'selected':''}>${i}</option>`).join('')}</select></label><button type="button" data-action="set-rank">Set Rank</button></div><form data-aghq-form="config" class="aghq-stack"><label>Guildhall name <input name="name" value="${esc(s.config.name)}"></label><div class="aghq-inline-controls aghq-canvas-dims"><label>Canvas width <input type="number" min="4" max="100" name="width" value="${s.config.bounds.width}"></label><label>Canvas height <input type="number" min="4" max="100" name="height" value="${s.config.bounds.height}"></label></div><label>Background asset path <input name="background" value="${esc(s.config.background)}" placeholder="worlds/my-world/assets/guildhall.webp"></label><div class="aghq-inline-controls aghq-image-settings"><label>Image fit <select name="background_fit">${['contain','cover','stretch'].map(value=>`<option value="${value}" ${(s.config.background_fit||'contain')===value?'selected':''}>${{contain:'Fit entire image',cover:'Fill canvas (crop)',stretch:'Stretch'}[value]}</option>`).join('')}</select></label><label>Horizontal % <input type="number" name="background_x" min="0" max="100" value="${s.config.background_x??50}"></label><label>Vertical % <input type="number" name="background_y" min="0" max="100" value="${s.config.background_y??50}"></label><label>Opacity % <input type="number" name="background_opacity" min="0" max="100" value="${s.config.background_opacity??100}"></label></div><p class="aghq-hint">Fit entire image shows the full image without cropping. Fill canvas permits positioning the crop. Sharpness still depends on the original uploaded image resolution.</p><div class="aghq-toolrow"><button type="button" data-action="browse-background">Browse / Upload</button><button type="submit">Save Changes</button></div></form><button type="button" data-action="add-rooms">Create Missing Player Rooms</button></section><section class="aghq-panel"><h3>Five-Rank Configuration</h3><form data-aghq-form="ranks"><table><thead><tr><th>Rank</th><th>Shared slots</th><th>Orders / downtime</th><th>Auto-unlocked facility IDs</th></tr></thead><tbody>${ruleTable}</tbody></table><button type="submit">Save Changes</button></form><p class="aghq-hint">Rank 2–5 defaults stay unchanged until the GM configures new capacity or facility unlocks.</p></section></div>`;
 }
 filterCatalog(root,term){
   const q=String(term||'').trim().toLowerCase();let count=0;
   root.querySelectorAll('.aghq-catalogrow').forEach(card=>{const visible=card.textContent.toLowerCase().includes(q);card.hidden=!visible;if(visible)count++;});
   const output=root.querySelector('[data-catalog-count]');if(output)output.textContent=`${count} matching facilities`;
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
 root.addEventListener('change',e=>{const f=e.target?.closest?.('[data-fac-filter]');if(f&&game.user.isGM){this.fv[f.dataset.facFilter]=f.value;this.render();}});
 root.addEventListener('dragstart',e=>this.startDrag(e));
 root.addEventListener('dragover',e=>{if(e.target.closest('.aghq-board'))e.preventDefault();});
 root.addEventListener('drop',e=>this.drop(e));
 }
 async click(event,root){if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const hit=event.target.closest('[data-installed],[data-decoration]');if(hit){this.selectedCopy=hit.dataset.installed||hit.dataset.decoration;this.render();return;}const btn=event.target.closest('button');if(!btn)return;
 const s=read(),st=site(s);const tab=btn.dataset.tab,room=btn.dataset.room;
 if(tab){if(['manage','facilities'].includes(tab)&&!game.user.isGM)return allowedOpsError('GM Setup and Facilities require GM permissions.');this.tab=tab;this.selectedCopy='';this.render();return;}
 if(room){this.selectedRoom=room;this.selectedCopy='';this.render();return;}
 const op=btn.dataset.action;if(!op)return;event.preventDefault();
 if(op==='help'){if(this.tab==='help'){this.tab=this.previousTab||'builder';}else{this.previousTab=this.tab;this.tab='help';}this.render();return;}
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
   await request('unassign_staff',{hireling_ref:btn.dataset.hireRef});return;
 }
 if(op==='rotate'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(ins)await request('rotate',this.withRevision(s,ins.room_key,{key:ins.key}));return;}
 if(op==='uninstall'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(!ins)return;const staffed=st.staffing_slots.filter(x=>x.installation_key===ins.key&&x.occupant_hireling_ref);const msg=staffed.length?`Uninstall this facility and unassign ${staffed.length} Hireling(s)?`:'Return this facility to acquired inventory?';if(!await confirmDialog(msg,{title:staffed.length?'Uninstall facility':'Return facility',yes:staffed.length?'Uninstall facility':'Return to inventory'}))return;await request('uninstall',this.withRevision(s,ins.room_key,{key:ins.key,confirm_staff:true}));this.selectedCopy='';return;}
 if(op==='upgrade'){const stage_key=root.querySelector('[data-upgrade-stage]')?.value;if(stage_key)await request('upgrade',{key:this.selectedCopy,stage_key});return;}
 if(op==='rotate-decor'||op==='remove-decor'){const room_key=this.selectedRoom;await request(op==='rotate-decor'?'rotate_decoration':'remove_decoration',this.withRevision(s,room_key,{room_key,key:this.selectedCopy}));if(op==='remove-decor')this.selectedCopy='';return;}
 }
 async submit(event){const form=event.target.closest('form[data-aghq-form]');if(!form)return;event.preventDefault();if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const data=new FormData(form);if(form.dataset.aghqForm==='player-access'){try{await setPlayerAccess(data.get('player_access_enabled')==='on');ui.notifications?.info?.(`Headquarters player interface ${accessEnabled()?'visible':'hidden'}.`);}catch(e){allowedOpsError(friendly(e));}return;}let op,payload;
 if(form.dataset.aghqForm==='activate'){op='activate';payload=Object.fromEntries(data.entries());}
 else if(form.dataset.aghqForm==='config'){op='save_config';payload={name:data.get('name'),width:Number(data.get('width')),height:Number(data.get('height')),background:data.get('background'),background_fit:data.get('background_fit'),background_x:Number(data.get('background_x')),background_y:Number(data.get('background_y')),background_opacity:Number(data.get('background_opacity'))};}
 else if(form.dataset.aghqForm==='ranks'){const rules=[1,2,3,4,5].map(rank=>({shared_facility_slots:Number(data.get(`slots_${rank}`)),orders_per_downtime:Number(data.get(`orders_${rank}`)),unlock_refs:String(data.get(`unlock_${rank}`)||'').split(',').map(x=>x.trim()).filter(Boolean)}));op='set_rank_table';payload={rules};}
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
    if(!await confirmDialog(`Permanently mark ${id} as ${status}, clear its Headquarters station, and preserve its history? This cannot be undone automatically.`,{title:'Mark hireling departed',yes:`Mark ${status}`}))return;
    op='depart_hireling';payload={hireling_ref:id,status,confirm:true};
 }
 else if(form.dataset.aghqForm==='decoration'){op='add_decoration_art';payload={art:data.get('art')};}
 if(op)await request(op,payload);
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
   icon:'fas fa-building',type:HeadquartersApp,restricted:true
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
