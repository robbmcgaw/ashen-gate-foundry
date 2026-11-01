import {MODULE_ID,emptyState,applyOperation,activeLock,site,rankConfig,stageFor,facilities,owned,planFacilityImport,freeSpot} from './logic.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog,choiceDialog,formDialog} from './ag-dialogs.mjs';
import {buildStateExport} from './state-export.mjs';
import {createVaultRecovery} from './vault-recovery.mjs';
import {facilitiesPanel,facilityRow,listFacilitiesTab,plural,SUB_TABS,DEFAULT_VIEW as FAC_VIEW} from './facilities-tab.mjs';
import {rosterGroups,stationLabels,employmentLabel,perkStatus,historyEvent,localDate,STATUS_FILTERS,DEPARTURE_REASONS,DEFAULT_VIEW as HIRE_VIEW} from './hirelings-tab.mjs';
import {SETUP_FORM,setupChanges} from './setup-form.mjs';
import {windowSize,uiState,bindTablist,fold,bindFolds,fileButton,bindFileButtons,refPicker,pickerOptions,bindRefPickers} from './ag-html.mjs';
import {guildhallRecords,locationPickRecords,defaultCampaignKey} from './activation-links.mjs';
import {idDetails,plainToken} from './id-details.mjs';
import {ACCESS_CONTRACT,accessStatus,canOpenPlayerInterface,requireGMToSetAccess,requireInterfaceAccess} from './access.mjs';
import {createPlayerIntentBridge,REQUEST_PATH,RECEIPT_FLAG,checkIntent} from './player-intent-bridge.mjs';
import {createHQAuthoritativeWriter} from './hq-authoritative-writer.mjs';
import {previewPermanentVacancies,clearVerifiedDepartures} from './staffing-reconciliation.mjs';
import {inspectFacilityRef} from './source-resolver-adapter.mjs';
import {hirelingState,stationed,derivePerkStatuses,HIRE_REF} from './hirelings.mjs';
import {readNativeHirelingDefinitions} from './native-hireling-definitions.mjs';
import {createPrivateStateStore,projectPublicState,VAULT_POINTER} from './private-state.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {requirePlayerViewAccess,buildPlayerView} from './player-view.mjs';
import {createEmbed,EMBED_MODES,EMBED_CONTRACT} from './embed.mjs';
import {migrateFolders,SETTING as FOLDER_SETTING} from './folder-nesting.mjs';
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
 }else if(windowApp?.rendered)windowApp.refresh();
}
const pending=new Map();
let windowApp;
let sequence=Promise.resolve();
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
/** Partner lists for activation, feature-detected; null when the module is off or cannot list. */
const partnerApi = id => { const m = game.modules?.get?.(id); return m?.active ? m.api ?? null : null; };
const managerDefinitions = () => { try { const f = partnerApi('ashen-gate-manager')?.definitions?.list; return typeof f === 'function' ? f({}) : null; } catch { return null; } };
const locationsApi = () => { try { const f = partnerApi('ashen-gate-locations')?.listLocations; return typeof f === 'function' ? f() : null; } catch { return null; } };
const TIP='data-tooltip-class="ag-tooltip"';
const icon=name=>`<i class="fa-solid ${name}" aria-hidden="true"></i>`;
/** Shared window header: brand title on the left, version and Help on the right (no subtitle). */
const header=()=>`<header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Headquarters</h1></div><div class="ag-header__meta"><span class="ag-version">v${esc(uiVersion())}</span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help">${icon('fa-circle-question')} Help</button></div></header>`;
const TABS={builder:['Guildhall Builder','fa-building'],activation:['Activation','fa-flag'],quarters:['Personal Quarters','fa-bed'],benefits:['Benefits','fa-star'],hirelings:['Hirelings','fa-users',true],facilities:['Facilities','fa-warehouse',true],manage:['GM Setup','fa-gears',true]};
/** GM-only tabs (0.13.0: Hirelings too; players only ever saw an empty tab there). The data layer enforces GM regardless. */
const GM_TABS=['hirelings','facilities','manage'];
const tabIds=gm=>['builder','quarters','benefits',...(gm?GM_TABS:[])];
const PANEL='aghq-panel';
/** Tab strip; GM-only tabs carry .ag-tab--gm and come last. The Activation tab is the builder slot before activation. bindTablist adds the keys. */
const tabStrip=(ids,current)=>`<div class="ag-tabs ag-tabs--scroll aghq-maintabs" role="tablist" aria-label="Headquarters sections">${ids.map(id=>{const [label,fa,gmOnly]=TABS[id];const tab=id==='activation'?'builder':id;const on=tab===current;
 return `<button type="button" role="tab" id="aghq-tab-${tab}" data-tab="${tab}" aria-selected="${on}" aria-controls="${PANEL}" tabindex="${on?0:-1}" class="${[on?'active':'',gmOnly?'ag-tab--gm':''].filter(Boolean).join(' ')}">${icon(fa)}${label}</button>`;}).join('')}</div>`;
const panelOpen=(tab,tabs=true)=>`<main class="aghq-body"${tabs?` id="${PANEL}" role="tabpanel" aria-labelledby="aghq-tab-${tab}"`:''}>`;
const empty=(title,text,fa='')=>`<div class="ag-empty">${fa?icon(fa):''}<p class="ag-empty__title">${title}</p>${text?`<p class="ag-empty__text">${text}</p>`:''}</div>`;
const RECIPIENT={guild:'Guild',facility:'Facility',individual:'Individual',room_owner:'Room owner'};
// General Manager is optional: feature-detect its open() (never required to open Headquarters).
const managerApi=()=>{const m=game.modules?.get?.('ashen-gate-manager');return m?.active&&typeof m.api?.open==='function'?m.api:null;};
const managerCanOpen=()=>Boolean(managerApi());
const NUDGE={left:[-1,0,'Move left','fa-arrow-left'],up:[0,-1,'Move up','fa-arrow-up'],right:[1,0,'Move right','fa-arrow-right'],down:[0,1,'Move down','fa-arrow-down']};
// Focus survives re-renders (§9.6): the focused control is found again by its data-* keys (and its tab row).
const FOCUS_KEYS=['tab','room','installed','decoration','decorArt','action','dir','key','id','hireRef','facFilter','rank','catalogSearch','hireSearch','hireFilter','hireWorking'];
function focusSelector(root){
 const el=root?.ownerDocument?.activeElement;if(!el||el===root||!root.contains?.(el))return null;
 const attr=k=>`[data-${k.replace(/[A-Z]/g,c=>`-${c.toLowerCase()}`)}="${String(el.dataset[k]).replace(/["\\]/g,'\\$&')}"]`;
 const parts=FOCUS_KEYS.filter(k=>el.dataset?.[k]!==undefined).map(attr);
 if(!parts.length)return null;
 const scope=el.closest?.('.ag-tabs--sub')?'.ag-tabs--sub ':el.closest?.('.aghq-maintabs')?'.aghq-maintabs ':'';
 return `${scope}${el.tagName.toLowerCase()}${parts.join('')}`;
}
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
// 0.14.0: GM-only private-vault recovery. Opened on a failed start and again when the GM opens Headquarters; never automatic.
let vaultRecovery=null;
const toasted=new Set();
/** A warning that can repeat (every open, every click) shows once per session. */
function warnOnce(key,reason,consoleOnly=false){if(toasted.has(key))return;toasted.add(key);if(consoleOnly)console.warn(reason);else allowedOpsError(reason);}
function offerRecovery(){
 if(!game.user?.isGM||!privateStore||privateStore.isReady())return false;
 if(!vaultRecovery)vaultRecovery=createVaultRecovery({store:privateStore,isGM:()=>game.user?.isGM===true,dialogs:{choice:choiceDialog,form:formDialog},notify:{info:m=>ui.notifications?.info?.(m)},
  onRecovered:()=>{embed.refreshAll();if(windowApp?.rendered&&canView())windowApp.refresh();}});
 if(!vaultRecovery.available())return false;
 void vaultRecovery.run().catch(error=>console.error('Headquarters vault recovery failed',error));
 return true;
}
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
 if(game.user?.isGM&&!privateStore?.isReady()){if(!offerRecovery())warnOnce('not-initialized','Private Headquarters state is not initialized.');return false;}
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
 if(game.user?.isGM&&!privateStore?.isReady()){if(!offerRecovery())warnOnce('not-ready','Private Headquarters state is not ready. Finish the GM vault migration first.');return null;}
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
 constructor(options={}){super({...options,position:{...windowSize(HeadquartersApp.DEFAULT_OPTIONS.position),...options.position}});this.tab="builder";this.selectedRoom="";this.selectedCopy="";this.catalogSearch="";this.fv={...FAC_VIEW};this.hv={...HIRE_VIEW};this.managementScroll=0;this.focusCatalog=false;this.zoom=1;this.dragOffset={x:0,y:0};
  // Per-user UI memory (kit uiState): the Facilities sub-tab and open folds.
  this.ui=uiState(MODULE_ID);this.facSub=this.ui.get('facilitiesTab','facilities',SUB_TABS.map(([id])=>id));
  // GM Setup is one draft form: "Unsaved changes" in its footer, and a prompt before a tab switch or close discards it.
  this.setupGuard=guardDirty({status:()=>this.element?.querySelector?.('[data-setup-status]')});
  this.focusSel=null;this.focusAfter=null;
  this.leaseTimer=setInterval(()=>{try{if(privateStore?.isReady()&&isEditing(read()))request("renew");}catch(error){console.warn('Headquarters lease renewal postponed',error);}},60000);}
 async _preRender(context,options){await super._preRender?.(context,options);this.focusSel=focusSelector(this.element);}
 async _onRender(context,options){
  await super._onRender(context,options);
  if(game.user?.isGM&&!privateStore?.isReady()){
   const node=this.element?.querySelector('[data-aghq-content]');
   if(node)node.textContent='Headquarters private state is not ready. Close this window and open Headquarters again to see the recovery options. No private save was overwritten.';
   offerRecovery();
   return;
  }
  if(!canView()){
   const node=this.element?.querySelector('[data-aghq-content]');
   if(node)node.textContent='Headquarters Player Access is currently hidden by the GM.';
   await this.close();return;
  }
  if(!game.user.isGM && GM_TABS.includes(this.tab))this.tab='builder';
  const node=this.element?.querySelector('[data-aghq-content]');if(!node)return;
  node.innerHTML=this.page(read());this.bind(node);
  // Kit 2.2: tab keys (top tabs, room strip, Facilities sub-tabs), remembered folds, keyboard-reachable file picker.
  bindTablist(node);bindFolds(node,this.ui);bindRefPickers(node);bindFileButtons(node,async([file])=>this.importFile(file));
  if(this.tab==='manage')this.setupGuard.markClean(); // the form was just rebuilt from the saved state
   if(['manage','facilities'].includes(this.tab)){
     const scroll=this.element?.querySelector('.aghq-body');
     if(scroll){scroll.scrollTop=this.managementScroll;scroll.addEventListener('scroll',()=>{if(['manage','facilities'].includes(this.tab))this.managementScroll=scroll.scrollTop;},{passive:true});}
     if(this.focusCatalog){this.focusCatalog=false;node.querySelector('[data-hq-section="catalog"]')?.scrollIntoView?.({block:'nearest'});}
   }
  const sel=this.focusAfter??this.focusSel;this.focusAfter=this.focusSel=null;
  if(sel){try{node.querySelector(sel)?.focus?.({preventScroll:true});}catch{/* stale selector: leave focus alone */}}
 }
 /** Re-render after a saved change, unless that would throw away unsaved GM Setup edits. */
 refresh(){if(this.tab==='manage'&&this.setupGuard.dirty)return;return this.render();}
 async close(options={}){if(this.tab==='manage'&&!(await this.setupGuard.confirm()))return this;return super.close(options);}
 async selectTab(tab){
  if(this.tab==='manage'&&tab!=='manage'&&!(await this.setupGuard.confirm()))return;
  this.tab=tab;this.selectedCopy='';this.render();
 }
 page(s){
  const user=game.user;const gm=user.isGM;
  if(!s.active){
   const tab=gm&&this.tab==='facilities'?'facilities':'builder';
   return `${header()}${gm?tabStrip(['activation','facilities'],tab):''}${panelOpen(tab,gm)}${tab==='facilities'?this.facilities(s):this.activation(s,gm)}</main>`;
  }
  const lease=activeLock(s);const holder=lease?game.users.get(lease.user_id)?.name||"Unknown":"None";
  const isEditor=isEditing(s);
  const ids=tabIds(gm);if(!ids.includes(this.tab))this.tab='builder';
  const middle=this.tab==='builder'?this.builder(s,isEditor):this.tab==='quarters'?this.quarters(s):this.tab==='hirelings'?this.hirelings(s):this.tab==='benefits'?this.benefits(s):this.tab==='facilities'?this.facilities(s):this.management(s);
  const top=`${header()}${tabStrip(ids,this.tab)}`;
  // GM Setup: the pane and its footer are one form, so Save Changes writes Player Access, settings and ranks together (D4).
  if(this.tab==='manage'&&gm)return `${top}<form class="aghq-setup" data-aghq-form="${SETUP_FORM}">${panelOpen('manage')}${middle}</main><footer class="ag-footer"><button type="button" class="ag-btn ag-btn--ghost" data-action="cancel-setup">Cancel</button><span class="ag-footer__status" role="status" data-setup-status></span><button type="submit" class="ag-btn ag-btn--primary">${icon('fa-floppy-disk')} Save Changes</button></footer></form>`;
  // The editing lease only applies to the shared Guildhall, so only Guildhall Builder shows it.
  const footer=this.tab!=='builder'?`<footer class="ag-footer"><span class="ag-footer__status" role="status">Auto-saved</span></footer>`
   :`<footer class="ag-footer"><span class="ag-footer__status" role="status">Auto-saved · ${lease?`Editor: ${esc(holder)}`:'View only'}</span>${isEditor?`<button type="button" class="ag-btn" data-action="release">${icon('fa-check')} Finish Editing</button>`:`<button type="button" class="ag-btn" data-action="take-lock">${icon('fa-pen')} ${gm&&lease?'GM Take Over':'Edit Guildhall'}</button>`}</footer>`;
  return `${top}${panelOpen(this.tab)}${middle}</main>${footer}`;
 }
 activation(s,gm){
  if(!gm)return empty('The Guildhall is not open yet.','Your GM opens it from this window.','fa-building');
  // The GM picks the Guildhall and Location records by name (no one-click demo activation, and no ids to find or paste).
  const field=(label,name,value,hint='')=>`<label class="ag-field">${label}<input name="${name}" value="${esc(value)}" required>${hint?`<span class="ag-field__hint">${hint}</span>`:''}</label>`;
  const hq=guildhallRecords(managerDefinitions()),locs=locationPickRecords(locationsApi());
  const picker=(id,label,records,off,empty)=>records===null?`<div class="ag-field"><span>${label}</span><span class="ag-field__hint">${off}</span></div>`
   :refPicker({id,label,options:pickerOptions(records,{gm:true}),none:null,placeholder:'Search by name…',hint:records.length?undefined:empty});
  const library=s.catalog.length?`<ul class="ag-rows">${s.catalog.map(d=>`<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${esc(d.name)}</span></div>${idDetails(d.id)}</li>`).join('')}</ul>`
   :empty('No facility definitions yet.','Import a facilities file in Ashen Gate | General Manager.');
  return `<div class="aghq-pane aghq-activation"><section class="ag-card"><h3 class="ag-card__title">Guildhall not activated</h3><p>Link the Guildhall to an existing Guildhall record and Location from your campaign's source records before players can enter.</p><form data-aghq-form="activate"><div class="ag-form-grid">${picker('aghq-hq-ref','Guildhall record',hq,'Ashen Gate | General Manager is not active, so Guildhall records cannot be listed.','No Guildhall record found. Import your Guildhall record in General Manager first.')}${picker('aghq-location-ref','Location',locs,'Ashen Gate | Locations is not active, so locations cannot be listed.','No locations yet. Add the Guildhall place in Locations first.')}</div>${fold({key:'activation-keys',title:'Advanced: keys',hint:'Filled in for you',body:`<div class="ag-form-grid">${field('Campaign key','campaign_key',defaultCampaignKey(game.world),'Names this campaign in saved data.')}${field('Guild key','guild_key','primary','Lowercase letters, digits, - or _.')}</div>`})}<p class="aghq-hint">Pick the records by name. Activating does not create a Location.</p><div class="ag-card__actions"><button type="submit" class="ag-btn ag-btn--primary">Activate Guildhall</button></div></form></section><section class="ag-section" data-hq-section="library"><div class="ag-section__head"><h3 class="ag-section__title">Facility library (${s.catalog.length})</h3></div><p class="aghq-hint">Imported facility definitions. Nothing is unlocked or acquired until the Guildhall is activated (then the Facilities tab).</p>${library}</section></div>`;
 }
 /** Help, grouped by topic in the names the window uses. GM-only topics are shown to the GM only. */
 help(){const gm=game.user?.isGM===true;
  return `<p>Headquarters is where the guild lays out its Guildhall and personal rooms. Facility benefits are for information: character sheets and rolls don't change.</p>
<h4>Guildhall Builder</h4><p>Choose Edit Guildhall to arrange the shared Guildhall; one person edits at a time, and Finish Editing hands it back. Drag a facility from Available Facilities onto the grid, or select Place to put it in the first free space. Select a placed facility to rotate it, move it with the arrow buttons${gm?', upgrade it':''} or uninstall it.</p>
<h4>Personal Quarters</h4><p>Each player has a room they can arrange; everyone in the guild can look at it. Place a personal facility and decorations the same way: drag them, or use Place and the decoration buttons. Decorations don't use facility slots.${gm?' Create missing player rooms, at the top right of the tab, adds a room for every player who doesn\'t have one.':''}</p>
<h4>Benefits</h4><p>What the installed facilities offer, and whether each one is active right now.</p>
${gm?`<h4>Hirelings (GM)</h4><p>Add hirelings imported in General Manager to the roster, station them at a facility and tick whether they are working. A hireling who isn't working keeps their station. Permanent departure keeps their history.</p>
<h4>Facilities (GM)</h4><p>Unlock a facility, then Acquire +1 to get a copy that can be placed. Set the guild rank at the top of the tab; the rank decides how many shared facilities fit. The Decorations sub-tab holds the artwork players can place.</p>
<h4>GM Setup</h4><p>Player access, the Guildhall name and canvas, and the guild rank table. Hiding Headquarters from players keeps everything saved.</p>
<h4>If the private vault is lost (GM)</h4><p>If a GM-only Journal that Headquarters keeps its private details in is deleted or can't be found, a window explains it when you open Headquarters. Look again checks for the Journal and reconnects it. Pick a vault journal lets you choose it when one exists. Start a new private vault builds a fresh one from the public Guildhall copy after you type NEW VAULT; hireling rosters, notes and other private-only details can't be recovered that way. Nothing is deleted, and players never see this window.</p>`:''}
<h4>Keyboard</h4><p>Shift+H opens Headquarters. Arrow keys move between tabs. Tab to a placed piece and press Enter to select it; its Move buttons nudge it one square.</p>`;}
 /** A hireling's display name from its imported definition, never the HIRE id. */
 hirelingName(id){try{return this.nativeHirelingRecords().records.get(id)?.name||'this hireling';}catch{return 'this hireling';}}
 builder(s,editable){
 const st=site(s);const cell=Math.round(s.config.cell_px*this.zoom);
 const pieces=st.installations.filter(x=>x.room_key==='common');
 const items=s.inventory.filter(item=>!st.installations.some(i=>i.key===item.key)&&facilities(s).get(item.facility_ref)?.placements?.includes('shared'));
 const list=items.length?`<ul class="ag-rows">${items.map(x=>this.libraryCopy(s,x,editable)).join('')}</ul>`:empty('No facilities to place.',game.user.isGM?'Unlock and acquire one in the Facilities tab.':'Facilities appear here when your GM acquires them.');
 const tiles=pieces.map(x=>this.tile(s,x,cell,editable)).join('');
 const size=s.config.bounds,rank=s.core.guild_state.rank,rule=rankConfig(s);
 return `<div class="aghq-grid"><aside class="aghq-sidebar"><h3>Available Facilities</h3><p class="aghq-hint">${editable?'Drag a facility onto the grid, or select Place.':'Choose Edit Guildhall to place facilities.'}</p>${list}<h3>Canvas Tools</h3>${this.zoomTools()}<p class="aghq-hint">Collisions and boundaries are enforced.</p></aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${esc(s.config.name)}</strong><span>Guild rank ${rank} · ${pieces.length}/${rule.shared_facility_slots} shared facilities · ${plural(rule.orders_per_downtime,'order')} per downtime · ${editable?'Editing':'View only'}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="common" role="group" aria-label="Guildhall grid, ${size.width} × ${size.height}" style="--cell:${cell}px;width:${size.width*cell}px;height:${size.height*cell}px;${s.config.background?`--aghq-backdrop:url('${esc(s.config.background)}');--aghq-fit:${(s.config.background_fit||'contain')==='stretch'?'100% 100%':(s.config.background_fit||'contain')};--aghq-pos:${Number(s.config.background_x??50)}% ${Number(s.config.background_y??50)}%;--aghq-opacity:${Number(s.config.background_opacity??100)/100};`:''}">${tiles}</div></div></div><aside class="aghq-inspector"><h3>Selected Facility</h3>${this.inspector(s,editable,'common')}</aside></div>`;
 }
 zoomTools(){return `<div class="aghq-toolrow aghq-zoom"><button type="button" class="ag-btn ag-btn--icon ag-btn--sm" data-action="zoom-out" aria-label="Zoom out" data-tooltip="Zoom out" ${TIP}>${icon('fa-minus')}</button><span>${Math.round(this.zoom*100)}%</span><button type="button" class="ag-btn ag-btn--icon ag-btn--sm" data-action="zoom-in" aria-label="Zoom in" data-tooltip="Zoom in" ${TIP}>${icon('fa-plus')}</button></div>`;}
 /** An acquired copy waiting to be placed; Place is the keyboard alternative to dragging it onto the grid. */
 libraryCopy(s,x,enabled){const def=facilities(s).get(x.facility_ref);if(!def)return '';const {stage}=stageFor(s,x);return `<li class="ag-row aghq-copy${enabled?' is-draggable':''}" ${enabled?'draggable="true"':''} data-copy="${esc(x.key)}"><div class="ag-row__main"><span class="ag-row__title">${esc(def.name)}</span><span class="ag-row__meta">${esc(stage.label||plainToken(stage.key))} · ${stage.width}×${stage.height}</span></div>${enabled?`<div class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm" data-action="place" data-key="${esc(x.key)}" aria-label="Place ${esc(def.name)}">${icon('fa-arrow-right-to-bracket')} Place</button></div>`:''}</li>`;}
 /** A placed facility: a real button (Tab, Enter/Space selects it); dragging still moves it. */
 tile(s,item,cell,enabled){const copy=owned(s).get(item.key);if(!copy)return '';const {def,stage}=stageFor(s,copy);const p=item.placement;const isSelected=item.key===this.selectedCopy;const image=stage.art?`<img src="${esc(stage.art)}" draggable="false" alt="">`:`<i class="fa-solid ${def.category==='Profession'?'fa-hammer':def.category==='Personal'?'fa-pen':'fa-square'} aghq-tile-icon" aria-hidden="true"></i>`;
  return `<button type="button" class="aghq-tile ${isSelected?'selected':''}" data-installed="${esc(item.key)}" aria-pressed="${isSelected}" aria-label="${esc(def.name)}, ${p.width}×${p.height}, rotated ${p.rotation}°" ${enabled?'draggable="true"':''} style="left:${p.x*cell}px;top:${p.y*cell}px;width:${p.width*cell}px;height:${p.height*cell}px"><span class="aghq-tile-art">${image}</span><span class="aghq-tile-label">${esc(def.name)}</span><span class="aghq-rotation">${p.rotation}°</span></button>`;}
 /** Move left/up/right/down one square: the keyboard alternative to dragging a placed piece. */
 moveTools(){return `<div class="aghq-toolrow aghq-nudge" role="group" aria-label="Move one square"><span class="aghq-hint">Move</span>${Object.entries(NUDGE).map(([dir,[, ,label,fa]])=>`<button type="button" class="ag-btn ag-btn--icon ag-btn--sm" data-action="nudge" data-dir="${dir}" aria-label="${label}" data-tooltip="${label}" ${TIP}>${icon(fa)}</button>`).join('')}</div>`;}
 inspector(s,editable,roomKey){const st=site(s),ins=st.installations.find(x=>x.key===this.selectedCopy&&x.room_key===roomKey);if(!ins)return `<p class="aghq-hint">Select a placed facility (click it, or Tab to it and press Enter) for details, rotation, moving, upgrades and uninstalling.</p>`;
 const copy=owned(s).get(ins.key),{def,stage}=stageFor(s,copy);const target=roomKey==='common'?editable:roomAccess(st.rooms.find(x=>x.key===roomKey));
 const buttons=target?`<div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm" data-action="rotate">${icon('fa-rotate-right')} Rotate 90°</button><button type="button" data-action="uninstall" class="ag-btn ag-btn--sm ag-btn--danger">${icon('fa-box-archive')} Uninstall…</button></div>${this.moveTools()}`:'';
 const upgrades=game.user.isGM && def.stages.length>1?`<label class="ag-field">Upgrade stage <select data-upgrade-stage>${def.stages.map(x=>`<option value="${esc(x.key)}" ${x.key===copy.stage_key?'selected':''}>${esc(x.label||plainToken(x.key))} · ${x.width}×${x.height}</option>`).join('')}</select></label><div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm ag-btn--primary" data-action="upgrade">Apply upgrade</button></div>`:'';
 const bens=stage.benefits?.length?`<ul class="ag-rows">${stage.benefits.map(b=>`<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${esc(b.name)}</span><span class="ag-row__meta">${esc(b.description||'Informational only')} · ${esc(RECIPIENT[b.recipient]??'Configured recipient')}</span></div></li>`).join('')}</ul>`:'<p class="aghq-hint">No benefits defined.</p>';
 return `<div class="aghq-detail"><h4>${esc(def.name)}</h4><p>${esc(stage.label||'Stage')} · ${ins.placement.width}×${ins.placement.height} squares<br>Rotation: ${ins.placement.rotation}°</p>${game.user.isGM?idDetails(def.id):''}${buttons}${upgrades}<h4>Benefits (informational)</h4>${bens}${this.staffingInspector(s,ins)}<p class="aghq-hint">Staffing and hireling benefits are informational only; sheets and rolls are unchanged.</p></div>`;
 }
 quarters(s){const st=site(s);const gm=game.user.isGM;const rooms=st.rooms.filter(r=>r.kind==='personal');
 // HQ-02: creating rooms is content management, so it sits on this tab's toolbar (GM only), not in GM Setup.
 const addRooms=gm?`<div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="add-rooms">${icon('fa-plus')} Create missing player rooms</button></div>`:'';
 const bar=picker=>picker||addRooms?`<div class="ag-toolbar aghq-roomtabs">${picker}${addRooms}</div>`:'';
 if(!rooms.length)return `<div class="aghq-quarters">${bar('')}<div class="aghq-pane">${empty('No personal rooms yet.',gm?'Create them with Create missing player rooms, above.':'Ask your GM to create player rooms.','fa-bed')}</div></div>`;
 const current=rooms.find(x=>x.key===this.selectedRoom)||rooms.find(x=>x.owner_user_id===game.user.id)||rooms[0];this.selectedRoom=current.key;const mine=roomAccess(current);const layout=s.personal_layouts[current.key];
 const roomtabs=this.roomTabs(rooms,current);
 if(!layout)return `<div class="aghq-quarters">${bar(roomtabs)}<div class="aghq-pane"><p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')} This room's layout is missing. ${gm?'Its saved layout could not be found.':'Ask your GM to repair it.'}</p></div></div>`;
 const cell=Math.round(s.config.cell_px*this.zoom);
 const items=s.inventory.filter(x=>!st.installations.some(y=>y.key===x.key)&&facilities(s).get(x.facility_ref)?.placements?.includes('personal'));
 // Decoration art: a button adds it to the room (keyboard alternative); dragging still places it where you drop it.
 const decorators=(s.config.decoration_art||[]).map((url,i)=>mine?`<button type="button" class="aghq-decoration-card" data-decor-art="${esc(url)}" draggable="true" aria-label="Add decoration ${i+1} to this room" data-tooltip="Add to this room, or drag onto it" ${TIP}><img src="${esc(url)}" alt="" draggable="false"></button>`:`<span class="aghq-decoration-card"><img src="${esc(url)}" alt="Decoration ${i+1}" draggable="false"></span>`).join('');
 const pieces=st.installations.filter(x=>x.room_key===current.key).map(x=>this.tile(s,x,cell,mine)).join('');
 const arts=layout.decorations.map((d,i)=>{const on=d.key===this.selectedCopy;return `<button type="button" class="aghq-decoration ${on?'selected':''}" data-decoration="${esc(d.key)}" aria-pressed="${on}" aria-label="Decoration ${i+1}, ${d.width}×${d.height}, rotated ${d.rotation}°" ${mine?'draggable="true"':''} style="left:${d.x*cell}px;top:${d.y*cell}px;width:${d.width*cell}px;height:${d.height*cell}px;transform:none"><img src="${esc(d.art)}" alt="" draggable="false" style="transform:rotate(${d.rotation}deg)"></button>`;}).join('');
 const copies=items.map(x=>this.libraryCopy(s,x,mine)).join('');
 const strip=rooms.length<2||rooms.length>4;
 return `<div class="aghq-quarters">${bar(roomtabs)}<div class="aghq-grid"${strip?` id="aghq-room-panel" role="tabpanel" aria-labelledby="aghq-room-${esc(current.key)}"`:''}><aside class="aghq-sidebar"><h3>Personal Facility</h3>${copies?`<ul class="ag-rows">${copies}</ul>`:empty('No personal facilities yet.',gm?'Acquire one with personal placement in the Facilities tab.':'They appear here when your GM acquires them.')}<h3>Decorations</h3><p class="aghq-hint">Artwork chosen by your GM. Visual only; pieces may overlap.${mine&&decorators?' Select one to add it to the room, or drag it.':''}</p>${decorators?`<div class="aghq-artgrid">${decorators}</div>`:empty('No decorations yet.',gm?'Add artwork in the Facilities tab, under Decorations.':'Your GM adds artwork you can place here.')}</aside><div class="aghq-workspace"><div class="aghq-boardhead"><strong>${esc(game.users.get(current.owner_user_id)?.name||'Personal')} — ${layout.bounds.width}×${layout.bounds.height}</strong><span>${mine?'Editable':'View only'}</span></div><div class="aghq-board-scroll"><div class="aghq-board" data-board="${esc(current.key)}" role="group" aria-label="Room grid, ${layout.bounds.width} × ${layout.bounds.height}" style="--cell:${cell}px;width:${layout.bounds.width*cell}px;height:${layout.bounds.height*cell}px;${layout.background?`background-image:url('${esc(layout.background)}');background-size:cover;`:''}">${pieces}${arts}</div></div></div><aside class="aghq-inspector"><h3>Room Inspector</h3>${this.selectedCopy.startsWith('decor_')?this.decorInspector(s,current,mine):this.inspector(s,mine,current.key)}<p class="aghq-hint">Room artwork and furnishings are visible to guild members; only owner and GM can edit.</p></aside></div></div>`;
 }
 /** Room picker: a segmented control for 2–4 rooms, otherwise a scrolling tab strip. The pen marks rooms you can edit (with screen-reader text). */
 roomTabs(rooms,current){
  const label=r=>`${esc(game.users.get(r.owner_user_id)?.name||'Player')}${roomAccess(r)?` <i class="fa-solid fa-pen" aria-hidden="true"></i><span class="ag-sr-only">(you can edit)</span>`:''}`;
  if(rooms.length>=2&&rooms.length<=4)return `<div class="ag-segmented" role="radiogroup" aria-label="Rooms">${rooms.map(r=>{const on=r.key===current.key;return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on?0:-1}" data-room="${esc(r.key)}">${label(r)}</button>`;}).join('')}</div>`;
  return `<div class="ag-tabs ag-tabs--scroll aghq-roomstrip" role="tablist" aria-label="Rooms">${rooms.map(r=>{const on=r.key===current.key;return `<button type="button" role="tab" id="aghq-room-${esc(r.key)}" aria-controls="aghq-room-panel" aria-selected="${on}" tabindex="${on?0:-1}" class="${on?'active':''}" data-room="${esc(r.key)}">${label(r)}</button>`;}).join('')}</div>`;
 }
 decorInspector(s,room,mine){const entry=s.personal_layouts[room.key].decorations.find(x=>x.key===this.selectedCopy);if(!entry)return '';return `<h4>Decoration</h4><img class="aghq-detail-art" src="${esc(entry.art)}" alt=""><p>Size: ${entry.width}×${entry.height} · Rotation ${entry.rotation}°</p>${mine?`<div class="aghq-toolrow"><button class="ag-btn ag-btn--sm" data-action="rotate-decor" type="button">${icon('fa-rotate-right')} Rotate</button><button class="ag-btn ag-btn--sm ag-btn--danger" data-action="remove-decor" type="button">${icon('fa-trash')} Remove…</button></div>${this.moveTools()}`:''}`;}
 nativeHirelingRecords(){return readNativeHirelingDefinitions(game,game.user);}
 visibleHirelings(s){
  const {records,conflicts}=this.nativeHirelingRecords();
  const roster=(s.personnel?.hirelings??[]).filter(row=>game.user.isGM || records.has(row.hireling_ref));
  return {records,conflicts,roster};
 }
 /** Installed facilities that have staffing slots, with display names ("#2" only when names repeat). */
 stations(s){
  const list=site(s).installations.map(ins=>{
    const copy=s.inventory.find(x=>x.key===ins.key);if(!copy)return null;
    const {def,stage}=stageFor(s,copy);return {...ins,name:def.name,capacity:stage.staffing_slots};
  }).filter(x=>x && x.capacity>0);
  const labels=stationLabels(list);
  return list.map(x=>({...x,label:labels.get(x.key)}));
 }
 staffingInspector(s,installation){
  const st=site(s);const copy=s.inventory.find(x=>x.key===installation.key);if(!copy)return '';
  const {stage}=stageFor(s,copy);
  const slots=st.staffing_slots.filter(x=>x.installation_key===installation.key);
  if(!stage.staffing_slots)return '<h4>Staffing</h4><p class="aghq-hint">This facility has no staffing slots.</p>';
  if(!game.user.isGM)return '<h4>Staffing</h4><p class="aghq-hint">Staffing assignments and personnel details are managed privately by the GM.</p>';
  const {records}=this.visibleHirelings(s);
  const entries=slots.map((slot,i)=>{const ref=slot.occupant_hireling_ref;const hire=ref?hirelingState(s,ref):null;const name=records.get(ref)?.name||'Unnamed hireling';
   return `<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">Station ${i+1}: ${ref?esc(name):'Unstaffed'}</span>${ref?`<span class="ag-row__meta">${hire?.working?'Working':'Not working'}</span>`:''}</div>${ref?`<div class="ag-row__end"><button type="button" class="ag-btn ag-btn--sm ag-btn--danger" data-action="unassign-hireling" data-hire-ref="${esc(ref)}" aria-label="Unassign ${esc(name)}">Unassign…</button></div>`:''}</li>`;}).join('');
  return `<h4>Staffing · ${slots.filter(x=>x.occupant_hireling_ref).length}/${stage.staffing_slots}</h4>${entries?`<ul class="ag-rows">${entries}</ul>`:'<p class="aghq-hint">No stations yet. Assign a hireling to set them up.</p>'}<p class="aghq-hint">Station hirelings from the Hirelings tab, or drag a hireling card onto this piece.</p>`;
 }
 hirelings(s){
  if(!game.user.isGM)return ''; // HQ-06: GM-only tab; the data layer still refuses players.
  const {records,conflicts,roster}=this.visibleHirelings(s);
  const deployed=this.stations(s);
  const registered=new Set((s.personnel?.hirelings??[]).map(x=>x.hireling_ref));
  const sources=[...records.values()].filter(x=>x.entity_type==='Hireling' && !registered.has(x.id));
  const nameSeen=new Map();
  const sameName=n=>sources.filter(x=>x.name===n).length>1;
  const options=sources.length?sources.map(x=>{const n=(nameSeen.get(x.name)??0)+1;nameSeen.set(x.name,n);return `<option value="${esc(x.id)}">${esc(x.name||'Unnamed hireling')}${sameName(x.name)?` (${n})`:''}</option>`;}).join(''):'<option value="">None to add</option>';
  const add=`<form class="ag-toolbar__end" data-aghq-form="add-hireling"><label class="ag-field ag-field--inline">Hireling <select name="hireling_ref" ${sources.length?'':'disabled'}>${options}</select></label><button type="submit" class="ag-btn" ${sources.length?'':'disabled'}>${icon('fa-plus')} Add to roster</button></form>`;
  const rows=roster.map(h=>({...h,name:records.get(h.hireling_ref)?.name||'Unnamed hireling'}));
  const view=rosterGroups(rows,this.hv);
  const toolbar=`<div class="ag-toolbar"><label class="ag-search">${icon('fa-magnifying-glass')}<input type="search" data-hire-search value="${esc(this.hv.search)}" placeholder="Search hirelings" aria-label="Search hirelings"></label><div class="ag-toolbar__filters"><label class="ag-field ag-field--inline">Status <select data-hire-filter="status">${STATUS_FILTERS.map(([k,l])=>`<option value="${k}" ${k===this.hv.status?'selected':''}>${l}</option>`).join('')}</select></label></div><span class="ag-toolbar__count" data-hire-count>${view.shown} of ${plural(view.total,'hireling')}</span>${add}</div>`;
  const notice=conflicts.size?`<p class="ag-notice ag-notice--danger">${icon('fa-circle-exclamation')} ${plural(conflicts.size,'hireling')} ${conflicts.size===1?'has':'have'} conflicting source definitions. Resolve ${conflicts.size===1?'it':'them'} in General Manager before adding ${conflicts.size===1?'it':'them'}.</p>`:'';
  const perkMap=new Map([...records].filter(([,d])=>d.entity_type==='HirelingPerk'));
  const seenOverlapGroups=new Set();
  const card=h=>{
   const ref=h.hireling_ref,active=h.employment_status==='active';
   const profile=records.get(ref),placed=stationed(s,ref)[0];
   const station=placed?deployed.find(i=>i.key===placed.slot.installation_key)?.label:'';
   const role=profile?.role?esc(profile.role):'Role not recorded';
   const refs=(profile?.refs||[]).filter(x=>x.relation==='has_hireling_perk').map(x=>x.target_id);
   const perks=derivePerkStatuses(s,ref,profile,perkMap).map(p=>{
       if(p.status!=='eligible'||!p.overlap_group||p.allow_overlap)return p;
       if(seenOverlapGroups.has(p.overlap_group))return {...p,status:'nonstacking',reason:'Another eligible perk of the same kind already applies'};
       seenOverlapGroups.add(p.overlap_group);return p;
     });
   const perkRows=perks.length?`<ul class="ag-rows">${perks.map(p=>{const st=perkStatus(p.status);return `<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${esc(p.name||'Unnamed perk')}</span>${p.reason?`<span class="ag-row__meta">${esc(p.reason)}</span>`:''}</div><div class="ag-row__end"><span class="ag-badge${st.tone?` ag-badge--${st.tone}`:''}">${esc(st.label)}</span></div></li>`;}).join('')}</ul>`
     :`<p class="aghq-hint">${refs.length?'Perk details are not available.':'No perks recorded for this hireling.'}</p>`;
   const working=active?`<label class="ag-field ag-field--inline aghq-working"><input type="checkbox" data-hire-working data-hire-ref="${esc(ref)}" ${h.working?'checked':''}> Working</label>`:'';
   const staff=active?`<form data-aghq-form="staff-hireling" class="aghq-toolrow"><input type="hidden" name="hireling_ref" value="${esc(ref)}"><label class="ag-field ag-field--inline">Station <select name="installation_key"><option value="">Not stationed</option>${deployed.map(i=>`<option value="${esc(i.key)}" ${placed?.slot.installation_key===i.key?'selected':''}>${esc(i.label)}</option>`).join('')}</select></label><button type="submit" class="ag-btn ag-btn--sm">${placed?'Update station':'Assign station'}</button></form>`:'';
   const depart=active?fold({key:`hire-depart-${ref}`,title:'Permanent departure',body:`<form class="aghq-toolrow aghq-departure" data-aghq-form="depart-hireling"><input type="hidden" name="hireling_ref" value="${esc(ref)}"><label class="ag-field ag-field--inline">Reason <select name="status">${DEPARTURE_REASONS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><button type="submit" class="ag-btn ag-btn--sm ag-btn--danger">Record departure…</button></form><p class="aghq-hint">Clears their station and keeps their history.</p>`}):'';
   const history=h.history?.length?fold({key:`hire-history-${ref}`,title:'Personnel history',count:h.history.length,body:`<ul class="ag-rows">${h.history.map(e=>`<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${esc(historyEvent(e.event))} · ${esc(employmentLabel(e.status))}</span><span class="ag-row__meta">${esc(localDate(e.at,game.i18n?.lang))}</span></div></li>`).join('')}</ul>`}):'';
   const portrait=`<span class="ag-portrait${active?'':' is-warn'}">${profile?.img?`<img src="${esc(profile.img)}" alt="">`:`<span class="ag-portrait__initials">${icon('fa-user')}</span>`}</span>`;
   return `<article class="ag-card aghq-hire-card" data-hire-card="${esc(ref)}" data-hire-name="${esc(String(h.name).toLowerCase())}" ${active?'draggable="true"':''}>${portrait}<div class="aghq-hire-card-body"><h4 class="ag-card__title">${esc(h.name)}</h4><span class="ag-card__meta">${role}</span><p class="aghq-hire-station">${station?`Stationed at ${esc(station)}`:'Not stationed'}</p><p class="aghq-badges"><span class="ag-badge${active?' ag-badge--ok':' ag-badge--warn'}">${esc(employmentLabel(h.employment_status))}</span></p>${working}${staff}${fold({key:`hire-perks-${ref}`,title:'Individual perks',count:perks.length,body:perkRows})}${depart}${history}${idDetails(ref)}</div></article>`;
  };
  const groups=view.groups.map(g=>`<section class="aghq-hiregroup" data-hire-group="${g.key}"><h4 class="ag-eyebrow">${esc(g.label)} (${g.rows.length})</h4><div class="aghq-hire-grid">${g.rows.map(card).join('')}</div></section>`).join('');
  const body=!roster.length?empty('No hirelings on the roster yet.','Import hireling definitions in General Manager, then add them here with Add to roster.','fa-users')
   :groups||empty('Nothing matches.','Change the search or the status filter.');
  return `<div class="aghq-pane aghq-roster">${toolbar}${notice}<p class="aghq-hint">Perks and facility benefits are informational: character sheets and rolls don't change. A hireling who isn't working keeps their station.</p>${body}</div>`;
 }
 /** Search hides cards in place (no re-render, so typing keeps focus); the status filter re-renders. */
 filterHirelings(root,term){
  const q=String(term||'').trim().toLowerCase();let count=0;const cards=root.querySelectorAll('[data-hire-card]');
  cards.forEach(card=>{const visible=!q||String(card.dataset.hireName||'').includes(q);card.hidden=!visible;if(visible)count++;});
  root.querySelectorAll('[data-hire-group]').forEach(g=>{g.hidden=![...g.querySelectorAll('[data-hire-card]')].some(c=>!c.hidden);});
  const output=root.querySelector('[data-hire-count]');if(output)output.textContent=`${count} of ${plural(cards.length,'hireling')}`;
 }
 benefits(s){const st=site(s);
 const entries=st.installations.flatMap(ins=>{const copy=owned(s).get(ins.key);if(!copy)return [];const {def,stage}=stageFor(s,copy);
   const staff=st.staffing_slots.filter(x=>x.installation_key===ins.key&&x.occupant_hireling_ref).map(x=>hirelingState(s,x.occupant_hireling_ref)).filter(Boolean);
   return (stage.benefits||[]).map(b=>{
     const needed=!!(b.requires_staffing||b.requires_working||b.requires_presence);
     const eligible=staff.filter(h=>h.employment_status==='active');
     let reason='';
     if(needed&&!eligible.length)reason='Needs a hireling on staff';
     else if((b.requires_working||b.requires_presence)&&!eligible.some(h=>h.working))reason='Its staff are not working';
     return {source:def.name,...b,activation:reason?'Inactive':'Active',reason};
   });});
 const rows=entries.map(b=>`<li class="ag-row aghq-benefit"><span class="ag-row__icon">${icon('fa-star')}</span><div class="ag-row__main"><span class="ag-row__title">${esc(b.name)}</span><span class="ag-row__meta">${esc(b.source)} · ${esc(RECIPIENT[b.recipient]??'Configured recipient')}${b.reason?' · '+esc(b.reason):''}</span>${b.description?`<p class="aghq-row-text">${esc(b.description)}</p>`:''}</div><div class="ag-row__end"><span class="ag-badge${b.activation==='Active'?' ag-badge--ok':''}">${esc(b.activation)}</span></div></li>`).join('');
 return `<div class="aghq-pane"><h3>Informational Benefits</h3><p class="aghq-hint">Whether a benefit is active follows from where facilities are placed and who is working there. No character sheets, rolls, Profession XP or inventory are modified.</p>${rows?`<ul class="ag-rows">${rows}</ul>`:empty('No facility benefits yet.','Benefits appear here when facilities are installed in the Guildhall.','fa-star')}</div>`;}

 facilities(s){if(!game.user.isGM)return '';
  const list=listFacilitiesTab(this.facilityRows(s),this.fv);
  const guild=s.active?{rank:s.core.guild_state.rank,used:site(s).installations.filter(x=>x.room_key==='common').length,slots:rankConfig(s).shared_facility_slots,orders:rankConfig(s).orders_per_downtime}:null;
  return facilitiesPanel(this.fv,list,{active:Boolean(s.active),sub:this.facSub,guild,art:s.config.decoration_art||[],
   importHtml:fileButton({label:'Import facility definitions…',accept:'.json,application/json',className:'ag-btn'}),manager:managerCanOpen()});
 }
 facilityRows(s){const g=s.core?.guild_state,inst=s.active?site(s).installations:[];
  return s.catalog.map(d=>facilityRow(d,{active:Boolean(s.active),unlocked:Boolean(g?.unlocked_facility_refs?.includes(d.id)),owned:(s.inventory??[]).filter(x=>x.facility_ref===d.id).length,installed:inst.filter(i=>(owned(s).get(i.key)?.facility_ref)===d.id).length}));}
 /** GM Setup: settings only (HQ-02). Guild Rank moved to the Facilities tab, player rooms to Personal Quarters. */
 management(s){if(!game.user.isGM)return '';
 const known=new Set(s.catalog.map(d=>d.id));
 const unlockChecks=r=>{const boxes=s.catalog.map(d=>`<label class="ag-field ag-field--inline"><input type="checkbox" name="unlock_${r.rank}" value="${esc(d.id)}" ${r.unlock_refs.includes(d.id)?'checked':''}> ${esc(d.name||'Unnamed facility')}</label>`);const extra=r.unlock_refs.filter(x=>!known.has(x)).map(x=>`<label class="ag-field ag-field--inline"><input type="checkbox" name="unlock_${r.rank}" value="${esc(x)}" checked> Facility not in the catalog</label>`);const all=[...boxes,...extra];return all.length?`<div class="aghq-unlocks" role="group" aria-label="Rank ${r.rank} auto-unlocked facilities">${all.join('')}</div>`:'<span class="aghq-hint">No facilities imported yet</span>';};
 const ruleTable=s.config.rank_rules.map(r=>`<tr><th scope="row" class="is-num">${r.rank}</th><td><input type="number" min="0" max="100" name="slots_${r.rank}" value="${r.shared_facility_slots}" aria-label="Rank ${r.rank} shared slots"></td><td><input type="number" min="0" max="100" name="orders_${r.rank}" value="${r.orders_per_downtime}" aria-label="Rank ${r.rank} orders per downtime"></td><td>${unlockChecks(r)}</td></tr>`).join('');
 const num=(label,name,value,min,max)=>`<label class="ag-field">${label}<input type="number" min="${min}" max="${max}" name="${name}" value="${value}"></label>`;
 const fit=['contain','cover','stretch'].map(value=>`<option value="${value}" ${(s.config.background_fit||'contain')===value?'selected':''}>${{contain:'Fit entire image',cover:'Fill canvas (crop)',stretch:'Stretch'}[value]}</option>`).join('');
 return `<div class="aghq-management">
<section class="ag-card"><h3 class="ag-card__title">Player Access</h3><label class="ag-field ag-field--inline"><input type="checkbox" name="player_access_enabled" ${accessEnabled()?'checked':''}> Players can open Headquarters</label><p class="aghq-hint">Now ${accessEnabled()?'visible to':'hidden from'} players. Hiding removes the player launcher only; GM access and Guildhall records stay intact. Applies when you select Save Changes.</p></section>
<section class="ag-card aghq-wide"><h3 class="ag-card__title">Guildhall and canvas</h3><div class="ag-form-grid"><label class="ag-field">Guildhall name<input name="name" value="${esc(s.config.name)}"></label>${num('Canvas width','width',s.config.bounds.width,4,100)}${num('Canvas height','height',s.config.bounds.height,4,100)}</div>
<div class="aghq-toolrow aghq-bg-path"><label class="ag-field aghq-grow">Background asset path<input name="background" value="${esc(s.config.background)}" placeholder="worlds/my-world/assets/guildhall.webp"></label><button type="button" class="ag-btn ag-btn--sm" data-action="browse-background">${icon('fa-folder-open')} Browse…</button></div>
<div class="ag-form-grid"><label class="ag-field">Image fit<select name="background_fit">${fit}</select></label>${num('Horizontal %','background_x',s.config.background_x??50,0,100)}${num('Vertical %','background_y',s.config.background_y??50,0,100)}${num('Opacity %','background_opacity',s.config.background_opacity??100,0,100)}</div>
<p class="aghq-hint">Fit entire image shows the full image without cropping. Fill canvas permits positioning the crop. Sharpness still depends on the original uploaded image resolution.</p></section>
<section class="ag-card aghq-wide"><h3 class="ag-card__title">Guild ranks</h3><div class="ag-table-wrap"><table class="ag-table aghq-ranks"><thead><tr><th scope="col" class="is-num">Rank</th><th scope="col">Shared slots</th><th scope="col">Orders / downtime</th><th scope="col">Auto-unlocked facility IDs</th></tr></thead><tbody>${ruleTable}</tbody></table></div><p class="aghq-hint">What each guild rank allows. Set the guild's current rank on the Facilities tab.</p></section>
<details class="ag-devtools aghq-wide"><summary>Developer Tools</summary><p class="aghq-hint">Test-world helpers. They add records to the real Guildhall catalog.</p><div class="aghq-toolrow"><button type="button" class="ag-btn ag-btn--sm" data-action="load-demo">Seed Test Facility Records</button></div></details></div>`;
 }
 filterCatalog(root,term){
   const q=String(term||'').trim().toLowerCase();let count=0;
   root.querySelectorAll('.aghq-catalogrow').forEach(card=>{const visible=card.textContent.toLowerCase().includes(q);card.hidden=!visible;if(visible)count++;});
   const output=root.querySelector('[data-catalog-count]');if(output)output.textContent=`${count} of ${plural(root.querySelectorAll('.aghq-catalogrow').length,'facility','facilities')}`;
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
   if(e.target?.matches?.('[data-hire-search]')){this.hv.search=e.target.value;this.filterHirelings(root,this.hv.search);}
 });
 root.addEventListener('change',e=>{const f=e.target?.closest?.('[data-fac-filter]');if(f&&game.user.isGM){this.fv[f.dataset.facFilter]=f.value;this.render();return;}
  const h=e.target?.closest?.('[data-hire-filter]');if(h&&game.user.isGM){this.hv[h.dataset.hireFilter]=h.value;this.render();return;}
  if(e.target?.matches?.('[data-hire-working]')){this.setWorking(e.target);return;}
  this.markSetupDirty(e.target);});
 root.addEventListener('input',e=>this.markSetupDirty(e.target));
 // Room picker radio group: arrow keys move between rooms.
 root.addEventListener('keydown',e=>{const btn=e.target?.closest?.('[role="radio"][data-room]');if(!btn||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const all=[...btn.parentElement.querySelectorAll('[data-room]')];const next=all[(all.indexOf(btn)+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+all.length)%all.length];
  e.preventDefault();next?.click();});
 root.addEventListener('dragstart',e=>this.startDrag(e));
 root.addEventListener('dragover',e=>{if(e.target.closest('.aghq-board'))e.preventDefault();});
 root.addEventListener('drop',e=>this.drop(e));
 }
 /** GM Setup edits wait for Save Changes (D4); the guard shows "Unsaved changes" and asks before they are discarded. */
 markSetupDirty(target){if(!target?.closest?.(`form[data-aghq-form="${SETUP_FORM}"]`))return;this.setupGuard.markDirty();}
 /** Working applies at once (a toggle outside any draft form). */
 async setWorking(box){
  if(!game.user.isGM)return allowedOpsError('GM only.');
  const row=hirelingState(read(),box.dataset.hireRef);if(row&&row.working!==box.checked)await request('set_working',{hireling_ref:row.hireling_ref,working:box.checked});
 }
 /** The advanced importer (decision HQ-07): new facility ids are added, ids already in the catalog are kept, like General Manager's import. */
 async importFile(file){
  if(!game.user.isGM)return allowedOpsError('GM only.');
  try{
   const {errors,rows}=planFacilityImport(JSON.parse(await file.text()),new Set(facilities(read()).keys()));
   if(errors.length)throw Error(`Import blocked: ${errors[0]}`);
   const fresh=rows.filter(r=>r.action==='new'),kept=rows.length-fresh.length;
   if(!fresh.length){ui.notifications?.info?.('Nothing new to import: every facility in the file is already in the catalog.');return;}
   if(await request('import_definitions',{definitions:fresh.map(r=>r.definition)}))ui.notifications?.info?.(`Imported ${plural(fresh.length,'facility','facilities')}.${kept?` Kept ${plural(kept,'facility','facilities')} already in the catalog.`:''}`);
  }catch(e){allowedOpsError(friendly(e));}
 }
 async click(event,root){if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const hit=event.target.closest('[data-installed],[data-decoration]');if(hit){this.selectedCopy=hit.dataset.installed||hit.dataset.decoration;this.render();return;}const btn=event.target.closest('button');if(!btn)return;
 const s=read(),st=site(s);const tab=btn.dataset.tab,room=btn.dataset.room;
 if(tab&&btn.closest?.('.ag-tabs--sub')){if(!game.user.isGM)return;this.facSub=this.ui.set('facilitiesTab',tab);this.render();return;}
 if(tab){if(GM_TABS.includes(tab)&&!game.user.isGM)return allowedOpsError('Hirelings, Facilities and GM Setup require GM permissions.');await this.selectTab(tab);return;}
 if(room){this.selectedRoom=room;this.selectedCopy='';this.render();return;}
 if(btn.dataset.decorArt!==undefined){await this.addDecoration(s,btn.dataset.decorArt);return;}
 const op=btn.dataset.action;if(!op)return;event.preventDefault();
 if(op==='help'){await infoDialog('Headquarters help',this.help());return;}
 if(op==='cancel-setup'){this.setupGuard.markClean();this.render();return;}
 if(op==='zoom-in'||op==='zoom-out'){this.zoom=Math.max(.5,Math.min(1.75,this.zoom+(op==='zoom-in'?.15:-.15)));this.render();return;}
 if(op==='take-lock'){await request('lock');return;}
 if(op==='release'){await request('unlock_editor');return;}
 if(op==='load-demo'){
   this.catalogSearch=this.fv.search='';this.focusCatalog=true;
   if(await request('load_demo'))ui.notifications?.info?.('Test facilities added to the real Guildhall catalog. Next: Unlock → Acquire +1 → Guildhall Builder → Edit Guildhall.');
   return;
 }
 if(op==='add-rooms'){
   if(!game.user.isGM)return allowedOpsError('GM only.');
   const before=st.rooms.length;
   if(await request('add_rooms',{users:[...game.users.values()].filter(u=>!u.isGM).map(u=>({id:u.id}))})){const added=site(read()).rooms.length-before;ui.notifications?.info?.(added?`Created ${plural(added,'player room')}.`:'Every player already has a room.');}
   return;
 }
 if(op==='set-rank'){
   if(!game.user.isGM)return allowedOpsError('GM only.');
   const rank=Number(root.querySelector('[data-rank]')?.value);const current=s.core?.guild_state?.rank;
   if(!rank)return;
   if(rank===current){ui.notifications?.info?.(`The guild is already rank ${rank}.`);return;}
   if(!await confirmDialog('Shared facility slots and auto-unlocked facilities follow the guild rank table. Acquired facilities are kept.',{title:`Set Guild Rank to ${rank}?`,yes:`Set rank ${rank}`}))return;
   await request('set_rank',{rank});return;
 }
 if(op==='unlock-facility'){if(await request('unlock_facility',{facility_ref:btn.dataset.id}))ui.notifications?.info?.('Facility unlocked. Select Acquire +1 to obtain an installable copy.');return;}
 if(op==='acquire'){if(await request('acquire',{facility_ref:btn.dataset.id,key:idKey()}))ui.notifications?.info?.('Facility copy acquired. Find it in Guildhall Builder → Available Facilities, then Edit Guildhall to install.');return;}
 if(op==='copy-id'){const id=btn.dataset.copyId||'';try{await navigator.clipboard.writeText(id);ui.notifications?.info?.('Copied to the clipboard.');}catch{ui.notifications?.warn?.('Could not copy. Select the text and copy it by hand.');}return;}
 if(op==='open-manager'){const api=managerApi();if(api)await api.open();return;}
 if(op==='browse-background'||op==='browse-decoration'){const field=op==='browse-background'?root.querySelector('[name="background"]'):root.querySelector('form[data-aghq-form="decoration"] [name="art"]');const picker=foundry.applications.apps.FilePicker;new picker({type:'image',current:field.value,callback:path=>{field.value=path;if(op==='browse-background')this.setupGuard.markDirty();}}).render({force:true});return;}
 if(op==='unassign-hireling'){
   if(!game.user.isGM)return allowedOpsError('GM only.');
   const name=this.hirelingName(btn.dataset.hireRef);
   if(!await confirmDanger(`${name} stays on the roster.`,{title:`Unassign ${name}?`,yes:`Unassign ${name}`}))return;
   await request('unassign_staff',{hireling_ref:btn.dataset.hireRef});return;
 }
 if(op==='rotate'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(ins)await request('rotate',this.withRevision(s,ins.room_key,{key:ins.key}));return;}
 if(op==='uninstall'){const ins=st.installations.find(x=>x.key===this.selectedCopy);if(!ins)return;const name=facilities(s).get(ins.facility_ref)?.name||'this facility';const staffed=st.staffing_slots.filter(x=>x.installation_key===ins.key&&x.occupant_hireling_ref).length;
   if(!await confirmDanger(`It goes back to acquired facilities.${staffed?` ${plural(staffed,'hireling')} stationed there ${staffed===1?'is':'are'} unassigned.`:''}`,{title:`Uninstall ${name}?`,yes:'Uninstall facility'}))return;
   await request('uninstall',this.withRevision(s,ins.room_key,{key:ins.key,confirm_staff:true}));this.selectedCopy='';return;}
 if(op==='upgrade'){const stage_key=root.querySelector('[data-upgrade-stage]')?.value;if(stage_key)await request('upgrade',{key:this.selectedCopy,stage_key});return;}
 if(op==='rotate-decor'||op==='remove-decor'){const room_key=this.selectedRoom;if(op==='remove-decor'&&!await confirmDanger('It comes off the room; the artwork stays available.',{title:'Remove this decoration?',yes:'Remove decoration'}))return;await request(op==='rotate-decor'?'rotate_decoration':'remove_decoration',this.withRevision(s,room_key,{room_key,key:this.selectedCopy}));if(op==='remove-decor')this.selectedCopy='';return;}
 if(op==='place'){await this.place(s,btn.dataset.key);return;}
 if(op==='nudge'){await this.nudge(s,btn.dataset.dir);return;}
 }
 /** Keyboard alternative to dropping a copy on the grid: the first free space in the room on this tab. */
 async place(s,key){
  const roomKey=this.tab==='quarters'?this.selectedRoom:'common';
  const copy=owned(s).get(key);if(!copy)return;const {def,stage}=stageFor(s,copy);
  const spot=freeSpot(s,roomKey,stage.width,stage.height);
  if(!spot)return allowedOpsError(`No free space for ${def.name}. Move or uninstall a piece first.`);
  this.selectedCopy=key;this.focusAfter=`button[data-installed="${key}"]`;
  await request('install',this.withRevision(s,roomKey,{room_key:roomKey,key,...spot}));
 }
 /** Move the selected piece or decoration one square (keyboard alternative to dragging). */
 async nudge(s,dir){
  const [dx,dy]=NUDGE[dir]??[0,0];if(!dx&&!dy)return;
  if(this.selectedCopy.startsWith('decor_')){
   const room_key=this.selectedRoom,layout=s.personal_layouts[room_key],d=layout?.decorations.find(x=>x.key===this.selectedCopy);if(!d)return;
   const x=d.x+dx,y=d.y+dy;if(x<0||y<0||x+d.width>layout.bounds.width||y+d.height>layout.bounds.height)return allowedOpsError('The decoration is already at the edge of the room.');
   await request('move_decoration',this.withRevision(s,room_key,{room_key,key:d.key,x,y}));return;
  }
  const ins=site(s).installations.find(x=>x.key===this.selectedCopy);if(!ins)return;
  const bounds=ins.room_key==='common'?s.config.bounds:s.personal_layouts[ins.room_key]?.bounds;const p=ins.placement,x=p.x+dx,y=p.y+dy;
  if(!bounds||x<0||y<0||x+p.width>bounds.width||y+p.height>bounds.height)return allowedOpsError('The facility is already at the edge of the grid.');
  await request('move',this.withRevision(s,ins.room_key,{room_key:ins.room_key,key:ins.key,x,y}));
 }
 /** Keyboard alternative to dragging decoration art onto the room: adds it at the top-left corner (decorations may overlap). */
 async addDecoration(s,art){
  const room_key=this.selectedRoom;if(!s.personal_layouts[room_key])return;
  const key=`decor_${uuid().replace(/-/g,'').slice(0,12)}`;this.selectedCopy=key;this.focusAfter=`button[data-decoration="${key}"]`;
  await request('add_decoration',this.withRevision(s,room_key,{room_key,key,art,x:0,y:0,width:2,height:2}));
 }
 async submit(event){const form=event.target.closest('form[data-aghq-form]');if(!form)return;event.preventDefault();if(!canView())return allowedOpsError('Player Access is hidden by the GM.');const data=new FormData(form);if(form.dataset.aghqForm===SETUP_FORM){await this.saveSetup(data);return;}let op,payload;
 if(form.dataset.aghqForm==='activate'){op='activate';payload={...Object.fromEntries(data.entries()),hq_ref:form.querySelector('#aghq-hq-ref')?.value??'',location_ref:form.querySelector('#aghq-location-ref')?.value??''};}
 else if(form.dataset.aghqForm==='add-hireling'){
    if(!game.user.isGM)return allowedOpsError('GM only.');
    const id=String(data.get('hireling_ref')||'');
    const def=this.nativeHirelingRecords();
    if(!HIRE_REF.test(id)||def.conflicts.has(id)||def.records.get(id)?.entity_type!=='Hireling')return allowedOpsError('Choose an imported hireling that is not on the roster yet.');
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
    const name=this.hirelingName(id);const label=employmentLabel(status).toLowerCase();
    if(!await confirmDanger(`This clears their station and keeps their history. It can't be undone from Headquarters.`,{title:`Mark ${name} as ${label}?`,yes:'Record departure'}))return;
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
  if(!Object.keys(plan).length){this.setupGuard.markClean();if(status)status.textContent='No changes to save';return;}
  if(plan.config&&!await request('save_config',plan.config))return;
  if(plan.rules&&!await request('set_rank_table',{rules:plan.rules}))return;
  if('access' in plan){try{await setPlayerAccess(plan.access);}catch(e){allowedOpsError(friendly(e));return;}}
  this.setupGuard.markClean();
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
 game.settings.register(MODULE_ID,'state',{name:'Headquarters public layout projection (no private personnel)',scope:'world',config:false,type:Object,default:emptyState(),onChange:()=>{embed.refreshAll();if(windowApp?.rendered&&canView())windowApp.refresh();}});
 // 1 once Headquarters has filed its private vault under Ashen Gate (folder-nesting.mjs); config:false.
 game.settings.register(MODULE_ID,FOLDER_SETTING,{name:'Headquarters folder nesting',scope:'world',config:false,type:String,default:''});
 game.settings.register(MODULE_ID,VAULT_POINTER,{name:'GM private Headquarters state document ID (no payload)',scope:'world',config:false,restricted:true,type:String,default:''});
 game.settings.register(MODULE_ID,'playerAccessEnabled',{name:'Player Access — Headquarters',hint:'Show or hide the Headquarters launcher and interface for players. This does not disable game mechanics or delete Guildhall state.',scope:'world',config:true,restricted:true,type:Boolean,default:true,onChange:refreshPlayerAccess});
 // Publish the opening contract before any asynchronous private-state migration.
 // Manager tiles must never disappear merely because initialization failed.
 const mod=game.modules.get(MODULE_ID);
 if(mod)mod.api={apiVersion:'0.2',open,
  getState:()=>{if(!game.user.isGM)throw Error('Headquarters campaign-state API is GM-only.');return structuredClone(read());},
  // 0.16.0: plain JSON for General Manager's world backup (`ag-headquarters-state-export/0.1`): sorted, no timestamps, no facility text. See state-export.mjs.
  exportState:()=>{if(!game.user.isGM)throw Error('Headquarters export is GM-only.');return buildStateExport({isGM:game.user.isGM===true,state:read(),userNames:Object.fromEntries([...(game.users?.values?.()??game.users?.contents??[])].map(u=>[u.id,u.name]))});},
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
  if(game.user?.isGM){
   await privateStore.initialize();
   // File the loaded vault under Ashen Gate (only its folder changes; a failure here never affects the vault).
   void migrateFolders().catch(e=>console.warn('Headquarters: could not file the vault under Ashen Gate',e));
  }
 }catch(error){
  // A vault problem the GM can fix gets one plain dialog and one console note (no stack); anything else stays a console error and a toast.
  if(offerRecovery())warnOnce('vault-console','Headquarters: the private vault Journal is missing or can\'t be used. A recovery dialog is available: open Headquarters (Actors sidebar, or Shift+H) as GM. Nothing has been changed.',true);
  else{
   console.error('Headquarters private vault initialization failed',error);
   ui.notifications?.error?.(`Headquarters private save initialization failed: ${friendly(error)}. Open button remains available; GM editing is blocked until recovery.`);
  }
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
