/** Ashen Gate | Cinders: Cinder instances, Push, Backfire and the shared Strain resource.
 * Depends one way on Skill Trees' public API (Cinder trees, points, unlocks), feature-detected; Skill Trees never depends on this module. */
import {createStrain} from './strain-runtime.mjs';
import {createStrainChip} from './strain-chip.mjs';
import {createCinders,CINDER_HOOK,MAX_CINDERS_SETTING,INITIAL_POINTS_SETTING,SOCKETS_SETTING} from './cinder-runtime.mjs';
import {isLevelBackup,CINDER_WALLET_CAP} from './cinder.mjs';
import {migrateFolders,SETTING as FOLDER_SETTING} from './folder-nesting.mjs';
import {MAX_SOCKETS} from './sockets.mjs';
import {CHIP_SETTING} from './strain-chip.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';
import {confirmDialog,confirmDanger,guardDirty,infoDialog,formDialog,choiceDialog,esc} from './ag-dialogs.mjs';
import {orbArt,strainTone,ringModel,orbitModel,ART_FOLDER} from './orb.mjs';
import {windowSize,uiState,subTabs,tabPanelAttrs,bindTablist,bindFolds,fileButton,bindFileButtons} from './ag-html.mjs';
import {draftFromConfig,draftDirty,setDraftField,addBand,removeBand,checkDraft,editorView} from './strain-editor.mjs';
import {openStageEditor} from './stage-editor.mjs';
import {confirmText,boundMessage} from './cinder-delete.mjs';
import {hideSettingsFromPlayers,stripSettingsCategory} from './gm-settings.mjs';

const MODULE='ashen-gate-cinders';
const VERSION='0.17.0';
const SOCKET=`module.${MODULE}`;
const TREES_ID='ashen-gate-skill-trees';
const ACCOUNTS_CONTRACT='ag-tree-accounts/1';
const ADOPTED_SETTING='legacyAdopted';
// 0.9.0: the Cinder art turns slowly (CSS only). World switch in GM Setup; each user can turn it off on their device in the Cinders tab.
export const ROTATE_SETTING='rotateArt',ROTATE_LOCAL_SETTING='rotateArtLocal';
// 0.10.0: using a Cinder's signature ability offers a Push. World switch in GM Setup; each user can turn it off on their device in the Cinders tab.
export const PUSH_OFFER_SETTING='pushOffer',PUSH_OFFER_LOCAL_SETTING='pushOfferLocal';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;

/** Skill Trees as seen right now: 'ok' (0.17.0+ with api.accounts), 'missing', or 'old' (0.15/0.16, which still run their own Strain and Cinders). */
function trees(){
  const mod=game.modules?.get?.(TREES_ID);
  if(!mod?.active)return {status:'missing',message:'Ashen Gate | Skill Trees is not active. Strain works without it, but Cinders need it for their trees, powers and points: enable Skill Trees 0.17.0 or later.'};
  const api=mod.api;
  if(api?.strain||api?.cinder)return {status:'old',message:'Update Ashen Gate | Skill Trees to 0.17.0 or later. This Skill Trees version still has its own Strain and Cinders, so Ashen Gate | Cinders stays off until it is updated.'};
  if(api?.accounts?.contract===ACCOUNTS_CONTRACT)return {status:'ok',accounts:api.accounts,api};
  if(!api)return {status:'missing',message:'Ashen Gate | Skill Trees has not finished loading. Reload if this stays.'};
  return {status:'old',message:'Update Ashen Gate | Skill Trees to 0.17.0 or later (Cinders needs its accounts API).'};
}
/** The whole module stays off next to an older Skill Trees, so the two never both handle Strain. */
const blocked=()=>{const t=trees();return t.status==='old'?t.message:null;};
const playerAccess=()=>game.settings.get(MODULE,PLAYER_ACCESS_SETTING)!==false;
const rotateWorld=()=>game.settings.get(MODULE,ROTATE_SETTING)!==false;
const rotateLocal=()=>game.settings.get(MODULE,ROTATE_LOCAL_SETTING)!==false;
const offerWorld=()=>game.settings.get(MODULE,PUSH_OFFER_SETTING)!==false;
const offerLocal=()=>game.settings.get(MODULE,PUSH_OFFER_LOCAL_SETTING)!==false;
/** The Push offer on a signature ability's use: Cinders' Push confirm. One mode: "Push [mode]?" with Push / Use without Push.
 * Several: one button per mode. Resolves the mode id, or null to use the ability without a Push. */
export async function offerPush({ability,modes}){
  const line=m=>`+${m.cost} Strain, Backfire ${m.chance}%${m.guaranteed?' (guaranteed)':''}`;
  const mods=m=>m.modifiers?.length?`Modifiers: ${m.modifiers.map(x=>`${x.label} (${x.value>0?'+':''}${x.value})`).join(', ')}`:'';
  if(modes.length===1){const m=modes[0];
    const text=[`${ability.name}: ${m.label}`,m.effect,`${line(m)}. Strain after: ${m.after}.`,mods(m),'Every Push gains Strain. The result is posted to chat.'].filter(Boolean).join('\n');
    const opts={title:`Push ${m.label}?`,yes:'Push',no:'Use without Push'};
    // A guaranteed Backfire is a danger confirm: "Use without Push" is the default button, never Push.
    return (m.guaranteed?await confirmDanger(text,opts):await confirmDialog(text,opts))?m.id:null;}
  const rows=modes.map(m=>`<li><strong>${esc(m.label)}</strong>: ${esc(line(m))}${m.effect?`<br>${esc(m.effect)}`:''}${mods(m)?`<br><small>${esc(mods(m))}</small>`:''}</li>`).join('');
  return choiceDialog(`Push ${ability.name}?`,`<p>${esc(ability.name)} was used. Push it? Every Push gains Strain; the result is posted to chat.</p><ul>${rows}</ul>`,
    modes.map(m=>({action:m.id,label:`Push ${m.label} (${line(m)})`,icon:'fa-solid fa-fire',danger:m.guaranteed})),{cancel:'Use without Push'});
}
/** The art turns only when there is art, the GM's switch is on and this user has not turned it off here. (Reduced motion: CSS stops it.) */
export const artSpins=({image,world,local})=>Boolean(image&&world&&local);
const escape=x=>foundry.utils.escapeHTML(String(x??''));
const notify=(s,error=false)=>error?ui.notifications.error(s):ui.notifications.info(s);
const sourceFlag=doc=>doc?.flags?.['ashen-gate-manager']?.source??null;

let app=null;
const rerender=()=>{if(app?.rendered)app.render();};
let cinders=null,chip=null;
const strain=createStrain({module:MODULE,onConfigChange:()=>{chip?.registerStatuses();chip?.syncAll();rerender();},recoveryBonus:actor=>cinders?.recoveryBonus(actor)??0,blocked});
chip=createStrainChip({module:MODULE,strain,blocked});
cinders=createCinders({module:MODULE,socket:SOCKET,strain,escape,trees,blocked,playerAccess,lookup:id=>lookupWorldDefinition(game,id,{}),
  pushOffer:()=>offerWorld()&&offerLocal(),offerPush});

/** One-time (re-runnable) adopt of what Skill Trees 0.15.0/0.16.0 saved: Strain config, Cinder limits, Cinder records, bearer pointers. */
async function adoptLegacy({quiet=false}={}){
  if(!game.user?.isGM||blocked())return null;
  const t=trees();if(t.status!=='ok'||typeof t.accounts.legacyData!=='function')return null;
  const legacy=t.accounts.legacyData(),done=[];
  if(legacy.settings?.strainConfig&&game.settings.get(MODULE,'strainConfig')==null){
    const r=strain.api.validateConfig(legacy.settings.strainConfig);
    if(r.config){await game.settings.set(MODULE,'strainConfig',r.config);done.push('Strain config');}
  }
  if(!game.settings.get(MODULE,ADOPTED_SETTING))for(const key of ['maxCindersPerActor','initialCinderPoints']){
    const v=legacy.settings?.[key];if(Number.isSafeInteger(v)){await game.settings.set(MODULE,key,v);done.push(key==='maxCindersPerActor'?'Cinders per character':'Starting Cinder points');}
  }
  const r=await cinders.api.adoptLegacy();
  if(r.instances)done.push(`${r.instances} Cinder record${r.instances>1?'s':''}`);
  if(r.pointers)done.push(`${r.pointers} bearer link${r.pointers>1?'s':''}`);
  await game.settings.set(MODULE,ADOPTED_SETTING,true);
  if(done.length)notify(`Ashen Gate | Cinders took over from Skill Trees: ${done.join(', ')}. Nothing in Skill Trees was changed.`);
  else if(!quiet)notify('Nothing from Skill Trees 0.15/0.16 left to take over.');
  return done;
}
const legacyWaiting=()=>{
  const t=trees();if(t.status!=='ok'||!game.user?.isGM||typeof t.accounts.legacyData!=='function')return false;
  const d=t.accounts.legacyData();
  const known=new Set(cinders.store()?cinders.readRegistry().instances.map(i=>i.instanceId):[]);
  return (d.registry?.instances??[]).some(i=>!known.has(i?.instanceId))||Boolean(d.settings?.strainConfig&&game.settings.get(MODULE,'strainConfig')==null);
};

// ---- Window ----
// Plain-text message (one paragraph per line); the action button repeats the verb, Cancel on the left.
const confirm=(message,{title='Confirm',yes='Confirm',danger=false}={})=>confirmDialog(message,{title,yes,danger});
// Small forms resolve {name: value}, or null when cancelled.
const input=(title,fields,label='Save')=>formDialog(title,fields,{ok:label});
const download=(filename,data)=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
const characters=()=>(game.actors?.contents??[]).filter(a=>a.type==='character'&&!isLevelBackup(a)&&(game.user.isGM||a.isOwner)).sort((a,b)=>a.name.localeCompare(b.name));
/** Strain bar: fills to the guarantee point (10), then shows how far past it the character is.
 * The same model and kit meter as Character Hub's Strain row: tone warn once a Push can backfire, danger when guaranteed or over. */
export function strainBar(s){
  const top=Math.max(1,s.guaranteeAt??10),over=Math.max(0,s.value-top),label=over?`${s.value} / ${top}+`:`${s.value} / ${top}`;
  return {value:s.value,now:Math.min(s.value,top),top,over,fill:Math.round(Math.min(s.value,top)/top*100),label,
    band:s.band.label,chance:s.chance,guaranteed:s.guaranteed,normalUseBackfires:s.normalUseBackfires,
    tone:over||s.guaranteed?'danger':s.chance>0?'warn':'',
    tip:`Strain ${label}: ${s.band.label}. Backfire on a Push from here: ${s.chance}%${s.guaranteed?' (guaranteed)':''}${s.normalUseBackfires?'. Every use of a Cinder power backfires at this Strain':''}.`};
}
// 0.11.0: Manage and GM Setup sub-tabs. The choice is remembered per user (kit uiState); switching never drops a draft.
export const MANAGE_TABS=[{id:'cinders',label:'Cinders'},{id:'sockets',label:'Sockets'},{id:'check',label:'Check'}];
export const SETUP_TABS=[{id:'general',label:'General'},{id:'strain',label:'Strain'}];
/** Sub-tab row html plus one attribute string per panel (the unselected ones hidden). */
export function subTabView(group,label,tabs,selected){
  const pick=tabs.some(t=>t.id===selected)?selected:tabs[0].id;
  return {selected:pick,tabsHtml:subTabs({group,label,tabs,selected:pick}),panels:Object.fromEntries(tabs.map(t=>[t.id,tabPanelAttrs(group,t.id,{hidden:t.id!==pick})]))};
}
// 0.11.0 (CN-03): the number settings GM Setup → General edits (same keys and ranges as their registration; staged until Save Changes).
export const NUMBER_SETTINGS=[
  {key:MAX_CINDERS_SETTING,label:'Cinders per character',min:1,max:9,hint:'The most Cinders one character can bear at once.'},
  {key:INITIAL_POINTS_SETTING,label:'Starting Cinder points',min:0,max:CINDER_WALLET_CAP,hint:'Given the first time a Cinder is bound; a transferred Cinder gets none.'},
  {key:SOCKETS_SETTING,label:'Sockets per Cinder',min:0,max:MAX_SOCKETS,hint:'The default; a Cinder can have its own count (Manage → Sockets).'}];
/** A staged number setting: null when it is a whole number in range, else the message shown next to the field. */
export function checkSettingNumber(raw,{min,max}){
  const text=String(raw??'').trim(),n=Number(text);
  return text!==''&&Number.isSafeInteger(n)&&n>=min&&n<=max?null:`Whole number from ${min} to ${max}.`;
}
/** Repair removes items (Cinder powers or bearer-item copies on the wrong character, or tree progress rewritten) for these report rows. */
export const repairRemoves=rows=>rows.some(r=>r.repair&&/does not bear|has an extra|tree progress differs/.test(r.text));
function cinderDefinitions(){
  return [...(game.items?.contents??[]),...(game.journal?.contents??[])].map(d=>({d,src:sourceFlag(d)}))
    .filter(({d,src})=>src?.sourceId?.startsWith('MUT-')&&lookupWorldDefinition(game,src.sourceId).document===d)
    .map(({d,src})=>({id:src.sourceId,name:d.name})).sort((a,b)=>a.name.localeCompare(b.name));
}
function manageView(manageTab='cinders'){
  const registry=cinders.readRegistry(),groups=new Map(),t=trees();
  for(const inst of registry.instances){
    const name=cinders.definitionName(inst.definitionId),tree=t.status==='ok'?cinders.cinderTree(inst.definitionId):null;
    const bearer=inst.bearer?game.actors?.get(inst.bearer.actorId):null,last=inst.lastBearer?game.actors?.get(inst.lastBearer):null;
    const spent=tree?tree.nodes.filter(n=>inst.progression.unlocks.includes(n.id)).reduce((s,n)=>s+(n.cost??1),0):0;
    const row={instanceId:inst.instanceId,bound:Boolean(inst.bearer),lost:inst.status==='lost',bearerName:bearer?.name??(inst.bearer?'(missing character)':null),lastName:last?.name??null,
      awarded:inst.progression.awarded,spent,unlocks:inst.progression.unlocks.length,migrated:Boolean(inst.migratedFrom)};
    if(!groups.has(inst.definitionId))groups.set(inst.definitionId,{definitionId:inst.definitionId,name,rows:[]});
    groups.get(inst.definitionId).rows.push(row);
  }
  const report=cinders.api.report();
  let migrate=0;try{migrate=t.status==='ok'?cinders.migrationPlan().filter(r=>r.action==='create').length:0;}catch{migrate=0;}
  const sockets=[];
  for(const inst of registry.instances){
    const bearer=inst.bearer?game.actors?.get(inst.bearer.actorId):null;if(!bearer)continue;
    let h=null;try{h=cinders.socketsApi.hosts(bearer).find(x=>x.instanceId===inst.instanceId)??null;}catch{h=null;}
    if(h)sockets.push({...socketView(h,cinders.socketsApi.socketable(bearer)),name:cinders.definitionName(inst.definitionId),bearerName:bearer.name,bearerId:bearer.id,
      own:inst.sockets.count,countLabel:inst.sockets.count==null?`default (${game.settings.get(MODULE,'socketsPerCinder')})`:`${inst.sockets.count} (this Cinder)`});
  }
  sockets.sort((a,b)=>a.name.localeCompare(b.name)||a.bearerName.localeCompare(b.bearerName));
  const initial=game.settings.get(MODULE,'initialCinderPoints');
  return {groups:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)),hasCinders:registry.instances.length>0,count:registry.instances.length,countOne:registry.instances.length===1,report,hasReport:report.length>0,
    sockets,hasSockets:sockets.length>0,oneSocketHost:sockets.length===1,socketDefault:game.settings.get(MODULE,'socketsPerCinder'),
    canRepair:report.some(r=>r.repair),migrate,migrateText:`${migrate} ${migrate===1?'character has':'characters have'} Cinder tree progress but no Cinder.`,legacy:legacyWaiting(),definitions:cinderDefinitions().length,
    limit:game.settings.get(MODULE,'maxCindersPerActor'),initial,initialOne:initial===1,
    kinds:cinderDefinitions().map(d=>kindArtView(d)),hasKinds:cinderDefinitions().length>0,
    ...subTabView('agc-manage','Manage sections',MANAGE_TABS.map(t=>t.id==='check'&&report.length?{...t,count:report.length}:t),manageTab)};
}
/** Manage → Cinders (0.13.0): one row per Cinder definition with the stage art it gives its bearers. */
function kindArtView({id,name}){
  let d=null;try{d=cinders.api.getDefinitionArtStages(id);}catch{d=null;}
  const n=d?.stages?.length??0;
  const text=!d?.stages?'No stage art yet':d.source==='world'?`${n} stages set for every bearer`:`${n} stages from the imported Cinder`;
  return {definitionId:id,name,text,has:Boolean(d?.stages)};
}
const signed=v=>`${v>0?'+':''}${v}`;
const TARGET_WORDS={'push.cost':'Push cost','backfire.chance':'Backfire chance','backfire.severity':'Backfire severity','strain.recovery':'rest recovery','sockets.count':'sockets'};
/** One Cinder's sockets for the window: filled sockets (active or over capacity), then the empty ones. */
function socketView(h,fits){
  const empties=Array.from({length:h.free},(_,i)=>({index:i}));
  const spare=fits.filter(f=>!h.slots.some(x=>x.itemId===f.itemId));
  return {instanceId:h.instanceId,capacity:h.capacity,used:h.slots.filter(x=>x.active).length,locked:h.locked,canEdit:h.canEdit,canDetach:h.canDetach===true,
    slots:h.slots.map(x=>({...x,effects:x.modifiers.map(m=>`${m.label}: ${TARGET_WORDS[m.target]??'modifier'} ${signed(m.value)}`).join(' · ')})),
    empties,hasSlots:h.slots.length>0||empties.length>0,canAttach:h.canEdit&&spare.length>0&&h.free>0,canSwap:h.canEdit&&spare.length>0,
    overCapacity:h.slots.some(x=>!x.active)};
}
/** GM (0.12.0): the Binding card's art-stage row from api.stages(instanceId); null when the Cinder has no stages. */
export function stageView(info){
  const st=info?.state;if(!st)return null;
  const held=st.held,here=`Stage ${st.index+1} of ${st.count}`;
  return {here,held,hasNext:st.next!=null&&!held,text:held?`${here}, held by the GM${st.auto!==st.index?` (automatic would be stage ${st.auto+1})`:''}`:`${here}, automatic`,
    unlocked:info.unlocked,detail:`${info.unlocked} node${info.unlocked===1?'':'s'} unlocked${!held&&st.next!=null?` · ${st.next} more to the next stage`:''}`,
    own:Boolean(info.own),options:Array.from({length:st.count},(_,i)=>({value:i+1,label:`Stage ${i+1}`,selected:i===st.index}))};
}
/** The Cinder sheet (0.6.0): orb, Strain ring, sockets on an orbit, and the sheet column. `c` is one api.cinder.list entry, `h` its api.sockets host. */
export function sheetView(actor,c,h,{fits=[],perks=[],strainState,gm=false,uuidOf=()=>null,maxSockets=12,rotate={world:true,local:true},offer={world:true,local:true},stages=null}={}){
  const top=Math.max(1,strainState.guaranteeAt??10),art=orbArt(c),orbit=orbitModel(h,maxSockets);
  const canEdit=Boolean(h?.canEdit),tip=x=>[x.name,...(x.modifiers??[]).map(m=>`${m.label}: ${TARGET_WORDS[m.target]??'modifier'} ${signed(m.value)}`)].join(' · ');
  const sockets=orbit.positions.map(p=>({...p,number:p.index+1,canEdit,tip:p.empty?(canEdit?'Empty socket: attach an item, or drag one here':'Empty socket'):tip(p),
    label:p.empty?`Socket ${p.index+1}: empty`:`Socket ${p.index+1}: ${tip(p)}`}));
  // 0.11.0 (CN-09): the orbit shows numbers; the filled sockets are listed by name under the stage.
  const filled=sockets.filter(x=>!x.empty);
  const inactive=orbit.inactive.map(x=>({...x,canEdit,tip:`${tip(x)} · inactive: over capacity`}));
  const spare=fits.filter(f=>!(h?.slots??[]).some(x=>x.itemId===f.itemId)).map(f=>({...f,uuid:uuidOf(f.itemId),elsewhere:Boolean(f.attachedTo)}));
  const effects=list=>list.map(m=>`${m.label}: ${TARGET_WORDS[m.target]??'modifier'} ${signed(m.value)}`).join(' · ');
  const perkRows=[];
  for(const p of perks){let row=perkRows.find(r=>r.sourceId===p.sourceId);if(!row)perkRows.push(row={sourceId:p.sourceId,name:p.name,kind:'Perk',mods:[]});row.mods.push(p);}
  const rows=[...perkRows.map(r=>({name:r.name,kind:r.kind,text:effects(r.mods)})),
    ...(c.enhancements??[]).map(e=>({name:e.name,kind:'Cinder power',text:''})),
    ...(h?.slots??[]).map(x=>({name:x.name,kind:x.active?'Socket item':'Socket item, inactive: over capacity',text:x.active?effects(x.modifiers??[]):'No effect while over capacity',inactive:!x.active}))];
  const modeRows=list=>(list??[]).map(m=>({...m,mods:m.modifiers?.length?m.modifiers.map(x=>`${x.label} ${signed(x.value)}`).join(', '):''}));
  const powers=(c.powers??[]).map(pw=>({...pw,modes:modeRows(pw.modes)}));
  // 0.11.0 (CN-05): the bearer items are the first rows of the Powers card. Their Push modes have no button: the Push is offered on use from the sheet.
  const sig=c.signature??{},signature=[
    sig.active?{label:'Signature ability',badge:'Signature',name:sig.active.name,summary:sig.active.summary,modes:modeRows(sig.active.modes)}:null,
    sig.passive?{label:'Passive',badge:'Passive',name:sig.passive.name,summary:sig.passive.summary,modes:[]}:null].filter(Boolean);
  const spinToggle=art.kind==='image'&&Boolean(rotate.world),offerToggle=Boolean(sig.active?.modes?.length)&&Boolean(offer.world);
  return {instanceId:c.instanceId,definitionId:c.definitionId,name:c.name,
    art,image:art.kind==='image',spin:artSpins({image:art.kind==='image',...rotate}),spinToggle,spinLocal:Boolean(rotate.local),tone:strainTone(strainState.value,top),ring:ringModel(strainState.value,top),
    sockets,filled,hasFilled:filled.length>0,inactive,hasInactive:inactive.length>0,capacity:orbit.capacity,used:sockets.filter(x=>!x.empty).length,locked:Boolean(h?.locked),canEdit,
    spare,hasSpare:spare.length>0,unspent:c.unspent,hasUnspent:Number.isSafeInteger(c.unspent),treeId:c.treeId??null,
    powers,hasPowers:powers.length>0,rows,hasRows:rows.length>0,
    signature,hasSignature:signature.length>0,offerToggle,offerLocal:Boolean(offer.local),hasDeviceOptions:spinToggle||offerToggle,
    gm:gm?{bearer:actor.name,since:c.bearerSince?new Date(c.bearerSince).toLocaleDateString():'not recorded',hasArt:Boolean(c.ownArt),artSource:c.artSource??null,stage:gm?stageView(stages):null}:null};
}
const chipWorld=()=>game.settings.get(MODULE,CHIP_SETTING)!==false;
/** The staged GM Setup values (null / {} = unchanged): Player Access, Rotate art, Push offer, Strain chip, the number settings
 * ({key: raw text}) and the Strain editor's draft (null = none, the saved config is shown). Nothing is written before Save Changes. */
const pendingOf=app=>({access:app.pendingAccess,rotate:app.pendingRotate,offer:app.pendingOffer,chip:app.pendingChip??null,numbers:app.pendingNumbers??{},strainDraft:app.strainDraft});
const numberChanged=numbers=>NUMBER_SETTINGS.some(d=>d.key in numbers&&(checkSettingNumber(numbers[d.key],d)||Number(numbers[d.key])!==game.settings.get(MODULE,d.key)));
const setupDirty=({access=null,rotate=null,offer=null,chip:chipOn=null,numbers={},strainDraft=null}={})=>(access!=null&&access!==playerAccess())||draftDirty(strainDraft,strain.config())||(rotate!=null&&rotate!==rotateWorld())||(offer!=null&&offer!==offerWorld())
  ||(chipOn!=null&&chipOn!==chipWorld())||numberChanged(numbers);
function setupView(pending,setupTab='general'){
  const saved=strain.config(),draft=pending.strainDraft??saved;
  return {
    strain:editorView(draft,checkDraft(draft)),
    rotateChecked:pending.rotate??rotateWorld(),offerChecked:pending.offer??offerWorld(),chipChecked:pending.chip??chipWorld(),chipHidden:chip.offReason()==='hidden',
    numbers:NUMBER_SETTINGS.map(d=>{const raw=d.key in pending.numbers?pending.numbers[d.key]:game.settings.get(MODULE,d.key);return {...d,value:String(raw??''),error:d.key in pending.numbers?checkSettingNumber(raw,d):null};}),
    playerAccess:playerAccess(),accessChecked:pending.access??playerAccess(),dirty:setupDirty(pending),
    importButton:fileButton({label:'Import Strain config…',accept:'.json,application/json'}),
    ...subTabView('agc-setup','GM Setup sections',SETUP_TABS,setupTab)
  };
}
/** A selector for the control that started an action, so focus goes back to it after the re-render. */
const focusKey=el=>{const d=el?.dataset;if(!d?.act)return null;
  return ['act','instance','slot','op','tab','index','item'].filter(k=>d[k]!=null&&d[k]!=='').map(k=>`[data-${k}="${String(d[k]).replace(/["\\]/g,'')}"]`).join('');};
class CindersApp extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'agc-window',classes:['ag-app','agc-window'],window:{title:'Ashen Gate | Cinders',resizable:true,icon:'fa-solid fa-fire'},position:{width:760,height:680}};
  static PARTS={main:{template:`modules/${MODULE}/templates/cinders.hbs`}};
  /** The default size follows the kit size set (Comfortable is 1.2x); an explicit position still wins. */
  constructor(options={}){super({...options,position:{...windowSize(CindersApp.DEFAULT_OPTIONS.position),...options.position}});this.tab='cinders';this.actorId=options.actorId??null;this.instanceId=null;this._clearSetup();
    this.ui=uiState(MODULE);this.manageTab=this.ui.get('manageTab','cinders',MANAGE_TABS.map(t=>t.id));this.setupTab=this.ui.get('setupTab','general',SETUP_TABS.map(t=>t.id));
    // GM Setup is one draft form: "Unsaved changes" in the footer, and a question before leaving the tab or closing the window drops it.
    this.guard=guardDirty({status:()=>this.element?.querySelector?.('[data-agc-status]')});}
  get actor(){return game.actors?.get(this.actorId)??null;}
  _clearSetup(){this.pendingAccess=null;this.strainDraft=null;this.pendingRotate=null;this.pendingOffer=null;this.pendingChip=null;this.pendingNumbers={};this.guard?.markClean();}
  async close(options){if(!(await this.guard.confirm()))return this;this._clearSetup();return super.close?.(options);}
  async _prepareContext(options){
    const ctx=await super._prepareContext(options),gm=game.user.isGM,why=blocked(),t=trees();
    if(!gm)this.tab='cinders';
    const choices=characters();if(!choices.some(a=>a.id===this.actorId))this.actorId=choices[0]?.id??null;
    const actor=this.actor;
    let bar=null,list=[],error=null,sheet=null;
    if(!why&&actor){
      try{const s=strain.api.get(actor);bar=strainBar(s);list=cinders.api.list(actor);
        if(!list.some(c=>c.instanceId===this.instanceId))this.instanceId=list[0]?.instanceId??null;
        const c=list.find(x=>x.instanceId===this.instanceId);
        if(c){
          const h=cinders.socketsApi.slots(actor,c.instanceId),fits=cinders.socketsApi.socketable(actor);
          let perks=[];try{perks=cinders.modifiersApi.forActor(actor);}catch{perks=[];}
          sheet=sheetView(actor,c,h,{fits,perks,strainState:s,gm,stages:gm?cinders.api.stages(c.instanceId):null,uuidOf:id=>actor.items?.get?.(id)?.uuid??null,maxSockets:cinders.socketsApi.maxSockets,rotate:{world:rotateWorld(),local:rotateLocal()},offer:{world:offerWorld(),local:offerLocal()}});
        }
      }catch(e){error=e.message;}
    }
    const setup=gm&&this.tab==='setup'&&!why?setupView(pendingOf(this),this.setupTab):null;
    if(setup){if(setup.dirty)this.guard.markDirty();else this.guard.markClean();}
    return {...ctx,gm,version:game.modules?.get?.(MODULE)?.version??VERSION,blocked:why,treesMessage:t.status==='missing'?t.message:null,canOpenTree:t.status==='ok'&&typeof t.api?.open==='function',
      tab:this.tab,tabCinders:this.tab==='cinders',tabManage:gm&&this.tab==='manage',tabSetup:gm&&this.tab==='setup',
      actors:choices.map(a=>({id:a.id,name:a.name,selected:a.id===this.actorId})),hasActor:Boolean(actor),actorName:actor?.name??'',
      bar,cinders:list.map(c=>({instanceId:c.instanceId,name:c.name,selected:c.instanceId===this.instanceId})),hasCinders:list.length>0,manyCinders:list.length>1,sheet,error,
      manage:gm&&this.tab==='manage'&&!why?manageView(this.manageTab):null,setup};
  }
  async _onRender(context,options){
    await super._onRender?.(context,options);
    const el=this.element;
    el.querySelector('[data-agc-actor]')?.addEventListener('change',ev=>{this.actorId=ev.target.value;this.instanceId=null;this.render();});
    el.querySelector('[data-agc-cinder]')?.addEventListener('change',ev=>{this.instanceId=ev.target.value;this.render();});
    // GM: double-click the orb to choose this Cinder's art (players get no handler; Binding → Change art… is the keyboard way).
    if(game.user.isGM)el.querySelector('[data-agc-orb]')?.addEventListener('dblclick',ev=>this._act({dataset:{act:'art-pick',instance:ev.currentTarget.dataset.instance}}));
    // Owners (unlocked) and the GM: drag an item chip onto a socket (or choose the chip: Attach…).
    for(const chip of el.querySelectorAll('[data-agc-chip]'))chip.addEventListener('dragstart',ev=>ev.dataTransfer?.setData('text/plain',JSON.stringify({type:'Item',uuid:chip.dataset.uuid})));
    // GM Setup: everything waits for Save Changes (D4); the footer says when something is unsaved.
    el.querySelector('[data-agc-access]')?.addEventListener('change',ev=>this._stageAccess(ev.target.checked));
    el.querySelector('[data-agc-rotate]')?.addEventListener('change',ev=>this._stageRotate(ev.target.checked));
    el.querySelector('[data-agc-offer]')?.addEventListener('change',ev=>this._stageOffer(ev.target.checked));
    el.querySelector('[data-agc-chip-setting]')?.addEventListener('change',ev=>this._stageChip(ev.target.checked));
    for(const f of el.querySelectorAll('[data-agc-setting]'))for(const type of ['input','change'])f.addEventListener(type,ev=>this._stageNumber(ev.target.dataset.agcSetting,ev.target.value));
    // On this device (client settings, saved at once): the Push offer and the art rotation.
    el.querySelector('[data-agc-offer-local]')?.addEventListener('change',ev=>this._setLocalOffer(ev.target.checked));
    el.querySelector('[data-agc-spin]')?.addEventListener('change',ev=>this._setLocalSpin(ev.target.checked));
    // GM Setup → Strain: every edit goes into the draft; the marks next to the fields update as you type.
    for(const f of el.querySelectorAll('[data-agc-strain]'))for(const type of f.type==='checkbox'?['change']:['input','change'])
      f.addEventListener(type,ev=>this._stageStrain(ev.target.dataset.agcStrain,ev.target.type==='checkbox'?ev.target.checked:ev.target.value));
    for(const b of el.querySelectorAll('[data-act]'))b.addEventListener('click',ev=>this._act(ev.currentTarget));
    bindFileButtons(el,async([file])=>{try{await this._strainImport(file);}catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}this.render();});
    // Kit tabs: arrow keys on the top row and the sub-tabs; sub-tabs switch in place (no re-render, so drafts and focus stay) and are remembered.
    const top=el.querySelector('.agc-tabs');if(top)bindTablist(top);
    for(const list of el.querySelectorAll('.ag-tabs--sub')){
      const key=list.querySelector('[data-tab]')?.id?.startsWith('agc-setup')?'setupTab':'manageTab';
      bindTablist(list,{state:this.ui,key});
      for(const b of list.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>this._showSubTab(list,b.dataset.tab,key));
    }
    bindFolds(el,this.ui);
    // GM drop target: drag an Item from the Items sidebar (or the bearer's sheet) onto a socket.
    for(const z of el.querySelectorAll('[data-agc-drop]')){
      z.addEventListener('dragover',ev=>{ev.preventDefault();z.classList.add('agc-drop-over');});
      z.addEventListener('dragleave',()=>z.classList.remove('agc-drop-over'));
      z.addEventListener('drop',ev=>{ev.preventDefault();z.classList.remove('agc-drop-over');this._drop(ev,z.dataset.instance,z.dataset.slot,z.dataset.filled==='true');});
    }
    // Save Changes refused: show the first marked field (its sub-tab and fold) and move focus to it. Else focus returns to the control used.
    const invalid=this._focusInvalid?el.querySelector('[aria-invalid="true"]'):null;this._focusInvalid=false;
    if(invalid){const list=el.querySelector('.ag-tabs--sub'),panel=invalid.closest('[role="tabpanel"][id^="agc-setup-panel-"]');
      if(list&&panel)this._showSubTab(list,panel.id.replace('agc-setup-panel-',''),'setupTab');
      const fold=invalid.closest('details');if(fold)fold.open=true;invalid.focus?.();}
    else if(this._focus){const target=el.querySelector(this._focus);target?.focus?.();}
    this._focus=null;
  }
  /** Show one sub-tab of a row in place: aria-selected, roving tabindex and the panels' hidden state. */
  _showSubTab(list,id,key){
    this[key]=id;this.ui.set(key,id);
    for(const t of list.querySelectorAll('[data-tab]')){const on=t.dataset.tab===id;t.setAttribute('aria-selected',String(on));t.setAttribute('tabindex',on?'0':'-1');
      const panel=this.element?.querySelector?.(`#${t.getAttribute('aria-controls')}`);if(panel)panel.hidden=!on;}
  }
  async _act(el){
    const act=el.dataset.act;
    try{
      switch(act){
        case 'tab':{const to=game.user.isGM?el.dataset.tab:'cinders';if(to===this.tab)return;
          if(this.tab==='setup'&&!(await this.guard.confirm()))return;
          this.tab=to;this._clearSetup();}break;
        case 'help':await this._help();return;
        case 'push':await this._push(el.dataset.instance,el.dataset.power,el.dataset.mode);break;
        case 'open-tree':{const t=trees(),actor=this.actor;t.api?.open?.({actorId:actor?.id,...(el.dataset.tree?{treeId:el.dataset.tree}:{})});return;}
        case 'socket-open':await this._socketMenu(el.dataset.instance,el.dataset.slot===''?null:Number(el.dataset.slot),el.dataset.empty==='true');break;
        case 'art-pick':await this._pickArt(el.dataset.instance);return;
        case 'art-reset':{if(!game.user.isGM)throw Error('GM only');
          const kindArt=this.actor?cinders.api.list(this.actor).find(x=>x.instanceId===el.dataset.instance)?.defaultArt:null;
          if(!await confirm(`${kindArt?'Show the default art for this kind of Cinder again (from its definition), on the Strain glow?':'Show the default orb for this Cinder again?'}\nThe image file stays in the Assets Library.`,{title:'Reset to the default orb?',yes:'Reset to default orb'}))return;
          await cinders.api.setArt(el.dataset.instance,null);notify('Cinder art reset to the default orb.');}break;
        case 'stages-edit':await this._stages(el.dataset.instance);return;
        case 'kind-stages':await this._kindStages(el.dataset.definition);return;
        case 'stage-hold':{if(!game.user.isGM)throw Error('GM only');
          const info=cinders.api.stages(el.dataset.instance),r=await cinders.api.setStageHold(el.dataset.instance,el.dataset.mode==='auto'?null:info.state.index+1);
          if(r.changed)notify(el.dataset.mode==='auto'?'Art stage follows the unlocks again.':`Art held at stage ${r.hold}.`);}break;
        case 'stage-set':await this._setStage(el.dataset.instance);return;
        case 'strain-adjust':await this._adjust(el.dataset.op);break;
        case 'socket-attach':await this._socket('attach',el.dataset.instance,el.dataset.slot==null||el.dataset.slot===''?null:Number(el.dataset.slot),el.dataset.actor,el.dataset.item);break;
        case 'socket-swap':await this._socket('swap',el.dataset.instance,Number(el.dataset.slot),el.dataset.actor);break;
        case 'socket-detach':await this._detach(el.dataset.instance,Number(el.dataset.slot),el.dataset.actor);break;
        case 'socket-lock':if(!game.user.isGM)throw Error('GM only');await cinders.socketsApi.setLocked(el.dataset.instance,el.dataset.locked!=='true');break;
        case 'socket-count':await this._socketCount(el.dataset.instance);break;
        case 'cinder-new':await this._new();break;
        case 'cinder-bind':await this._bind(el.dataset.instance,false);break;
        case 'cinder-transfer':await this._bind(el.dataset.instance,true);break;
        case 'cinder-unbind':await this._unbind(el.dataset.instance);break;
        case 'cinder-delete':{const gone=await this._deleteCinder(el.dataset.instance);
          // Deleted: the row is gone, so focus goes to New Cinder. Cancelled or refused: it stays on the button used.
          this._focus=gone?'[data-act="cinder-new"]':focusKey(el);this.render();return;}
        case 'cinder-migrate':await this._migrate();break;
        case 'cinder-adopt':await adoptLegacy();break;
        case 'cinder-repair':await this._repair();break;
        case 'setup-save':await this._saveSetup();break;
        case 'setup-cancel':this._clearSetup();break;
        case 'strain-band-add':if(!game.user.isGM)throw Error('GM only');this.strainDraft=addBand(this._draft());break;
        case 'strain-band-remove':if(!game.user.isGM)throw Error('GM only');this.strainDraft=removeBand(this._draft(),Number(el.dataset.index));break;
        case 'strain-export':if(!game.user.isGM)throw Error('GM only');download('ag-strain-config.json',strain.config());return;
        case 'strain-reset':if(!game.user.isGM)throw Error('GM only');if(await confirmDanger(`Reset the Strain config to the module defaults (neutral band names, default Backfire schedule)?\nCharacter Strain is not changed.${this._strainUnsaved()}`,{title:'Reset Strain settings?',yes:'Reset to defaults'})){await strain.api.resetConfig();this.strainDraft=null;notify('Strain config reset to defaults.');}break;
      }
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
    this._focus=focusKey(el);
    this.render();
  }
  /** Player Access box changed: remember it until Save Changes or Cancel; nothing is written yet. */
  _stageAccess(checked){
    this.pendingAccess=Boolean(checked);
    this._status();
  }
  _status(){
    if(setupDirty(pendingOf(this)))this.guard.markDirty();else this.guard.markClean();
  }
  /** GM Setup → Rotate Cinder art: waits for Save Changes like Player Access. */
  _stageRotate(checked){this.pendingRotate=Boolean(checked);this._status();}
  /** GM Setup → Push offer on use (0.10.0): waits for Save Changes like Player Access. */
  _stageOffer(checked){this.pendingOffer=Boolean(checked);this._status();}
  /** GM Setup → Show Strain chip on tokens (0.11.0, same setting key): waits for Save Changes. */
  _stageChip(checked){this.pendingChip=Boolean(checked);this._status();}
  /** GM Setup → a number setting (0.11.0, same setting keys): the raw text is staged and checked in place; nothing is written. */
  _stageNumber(key,raw){
    if(!game.user.isGM)return;const def=NUMBER_SETTINGS.find(d=>d.key===key);if(!def)return;
    this.pendingNumbers={...(this.pendingNumbers??{}),[key]:String(raw??'')};
    const msg=checkSettingNumber(raw,def),el=this.element;
    const mark=el?.querySelector?.(`[data-agc-error="setting.${key}"]`);if(mark){mark.textContent=msg??'';mark.hidden=!msg;}
    const field=el?.querySelector?.(`[data-agc-key="setting.${key}"]`);if(field){if(msg)field.setAttribute('aria-invalid','true');else field.removeAttribute('aria-invalid');}
    this._status();
  }
  /** This device only (client setting): any user may turn the Push offer off for themselves. */
  async _setLocalOffer(checked){
    try{await game.settings.set(MODULE,PUSH_OFFER_LOCAL_SETTING,Boolean(checked));}catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
    this._focus='[data-agc-offer-local]';this.render();
  }
  /** This device only (client setting): any user may turn the rotation off for themselves. */
  async _setLocalSpin(checked){
    try{await game.settings.set(MODULE,ROTATE_LOCAL_SETTING,Boolean(checked));}catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
    this._focus='[data-agc-spin]';this.render();
  }
  _draft(){return this.strainDraft??draftFromConfig(strain.config());}
  _strainUnsaved(){return draftDirty(this.strainDraft,strain.config())?'\nYour unsaved Strain edits are discarded.':'';}
  /** A Strain field changed: update the draft and the marks in place (no re-render, so the cursor stays). Nothing is written. */
  _stageStrain(path,raw){
    if(!game.user.isGM)return;
    this.strainDraft=setDraftField(this._draft(),path,raw);
    const check=checkDraft(this.strainDraft),el=this.element;
    if(el){
      for(const x of el.querySelectorAll('[data-agc-error]')){if(x.dataset.agcError.startsWith('setting.'))continue;const msg=(check.errors[x.dataset.agcError]??[]).join(' ');x.textContent=msg;x.hidden=!msg;}
      for(const x of el.querySelectorAll('[data-agc-key]')){if(x.dataset.agcKey.startsWith('setting.'))continue;if(check.errors[x.dataset.agcKey])x.setAttribute('aria-invalid','true');else x.removeAttribute('aria-invalid');}
      const w=el.querySelector('[data-agc-warnings]');if(w){w.textContent=check.warnings.join(' ');w.hidden=!check.warnings.length;}
    }
    this._status();
  }
  /** Save Changes in GM Setup (both sub-tabs): checks the Strain edits (validateConfig) and the number settings first and saves nothing
   * while a field is marked; then writes the Strain config through api.strain.importConfig and each setting (same keys) that changed. */
  async _saveSetup(){
    if(!game.user.isGM)throw Error('GM only');
    const p=pendingOf(this),draft=p.strainDraft;
    const strainChanged=draftDirty(draft,strain.config()),accessChanged=p.access!=null&&p.access!==playerAccess(),rotateChanged=p.rotate!=null&&p.rotate!==rotateWorld(),offerChanged=p.offer!=null&&p.offer!==offerWorld(),chipChanged=p.chip!=null&&p.chip!==chipWorld();
    const numbers=NUMBER_SETTINGS.filter(d=>d.key in p.numbers),badNumber=numbers.find(d=>checkSettingNumber(p.numbers[d.key],d));
    const numberWrites=numbers.filter(d=>!checkSettingNumber(p.numbers[d.key],d)&&Number(p.numbers[d.key])!==game.settings.get(MODULE,d.key));
    if(!strainChanged&&!accessChanged&&!rotateChanged&&!offerChanged&&!chipChanged&&!numberWrites.length&&!badNumber){this._clearSetup();notify('No changes to save.');return;}
    if(badNumber){this._focusInvalid=true;throw Error(`GM Setup not saved: ${badNumber.label} needs a whole number from ${badNumber.min} to ${badNumber.max}. Nothing was changed.`);}
    if(strainChanged){
      const check=checkDraft(draft);
      if(!check.ok){this._focusInvalid=true;throw Error('Strain not saved: fix the marked fields first. Nothing was changed.');}
      const result=await strain.api.importConfig(draft);
      if(result.failed.length)throw Error(`Strain not saved: ${result.failed[0].reason}`);
      if(result.warnings.length)ui.notifications?.warn?.(`Strain saved with warnings: ${result.warnings.join(' ')}`);
    }
    this.strainDraft=null;
    if(accessChanged)await setPlayerAccess(game,MODULE,p.access);
    this.pendingAccess=null;
    if(rotateChanged)await game.settings.set(MODULE,ROTATE_SETTING,p.rotate);
    this.pendingRotate=null;
    if(offerChanged)await game.settings.set(MODULE,PUSH_OFFER_SETTING,p.offer);
    this.pendingOffer=null;
    if(chipChanged)await game.settings.set(MODULE,CHIP_SETTING,p.chip);
    this.pendingChip=null;
    for(const d of numberWrites)await game.settings.set(MODULE,d.key,Number(p.numbers[d.key]));
    this._clearSetup();
    notify('GM Setup saved.');
  }
  /** Manage → Check → Repair… (CN-04): asks first, listing what it fixes; a danger confirmation (Cancel is the default) when it removes items. */
  async _repair(){
    if(!game.user.isGM)throw Error('GM only');
    const rows=cinders.api.report().filter(r=>r.repair);
    if(!rows.length){notify('Nothing needed repair.');return;}
    const removes=repairRemoves(rows);
    const message=[...rows.map(r=>`${r.name}: ${r.text}`),removes?'Items are taken off characters who should not have them.':'',"A Cinder's points and unlocks are never changed. Safe to run again."].filter(Boolean).join('\n');
    const ok=removes?await confirmDanger(message,{title:'Repair Cinders?',yes:'Repair'}):await confirmDialog(message,{title:'Repair Cinders?',yes:'Repair'});
    if(!ok)return;
    const done=await cinders.api.repair();notify(done.length?done.join('; '):'Nothing needed repair.');
  }
  async _help(){
    const gm=game.user.isGM?`<h3>Managing Cinders (GM)</h3>
      <p>Each Cinder keeps its own points and unlocked powers and moves between bearers with them. A bearer cannot release a Cinder; only the GM binds, transfers, unbinds or deletes it (Manage → Cinders). Delete Cinder… lists what it removes first and refuses a Cinder that still has a bearer (Unbind… it first). Strain stays with each character.</p>
      <p><strong>Sockets</strong> (Manage → Sockets): drag an Item from the Items sidebar onto a socket to copy it to the bearer and attach it, or use Attach…. Attached items stay in the bearer's inventory; on a transfer or unbind they stay with the old bearer, detached. Only the GM can detach an item; players can attach and swap.</p>
      <p><strong>Stage art</strong> (Manage → Cinders): give a whole Cinder its art stages, with or without a bearer. Every bearer follows them unless their own Cinder has Stages… (Binding card); a re-import keeps them. General Manager's Assets tab fills them from files such as Echo_Cinder_Stage_1.webp.</p>
      <p><strong>Check</strong> (Manage → Check) lists anything out of step; Repair… fixes it after asking.</p>
      <p><strong>GM Setup</strong>: General holds Player Access, the Cinder limits, the Strain chip, art rotation and the Push offer; Strain holds the Strain editor. Both save with one Save Changes.</p>`:'';
    await infoDialog('Cinders help',`<h3>Strain</h3><p>Strain is one number per character. Pushes, crafting, hazards, items and spells can change it; a long rest removes ${strain.config().rest_recovery.long}. The band name and Backfire chance come from the GM's Strain config.</p>
      <h3>Push</h3><p>Push a Cinder power for a stronger effect. Every Push gains Strain, and the Backfire chance uses the Strain after that gain. From Strain ${strain.config().guarantee_at} every Push backfires, and every normal use of a Cinder power does too. A Backfire never kills or removes a character.</p>
      <h3>Cinders</h3><p>A Cinder keeps its own points and powers. Only the GM binds, transfers or unbinds it. Unlock powers in the Skill Trees window.</p>
      <h3>Signature ability and passive</h3><p>From the moment a Cinder is bound, its bearer has its signature ability and its always-on passive as items on their sheet (no points, not on the tree). They are the first rows of Powers. Use the signature ability from the character sheet: you are offered a Push, or use it without one. Only the GM can change these items.</p>
      <h3>On this device</h3><p>Under the orb: turn off the art rotation or the Push offer for your own browser only. These save at once.</p>${gm}`);
  }
  async _push(instanceId,powerId,modeId){
    const actor=this.actor;if(!actor)throw Error('Choose a character');
    const pv=cinders.api.previewPush(actor,instanceId,powerId,modeId);
    const mods=pv.modifiers.length?`\nModifiers: ${pv.modifiers.map(m=>`${m.label} (${m.value>0?'+':''}${m.value})`).join(', ')}`:'';
    if(!await confirm(`${pv.powerName}: ${pv.label}${pv.effect?`\n${pv.effect}`:''}\nStrain ${pv.strain} → ${pv.after} (+${pv.cost}). Backfire chance ${pv.chance}%${pv.guaranteed?' (guaranteed)':''}.${mods}\nEvery Push gains Strain. The result is posted to chat.`,{title:`Push ${pv.powerName}?`,yes:'Push',danger:pv.guaranteed}))return;
    await cinders.api.push(actor,powerId,modeId);
  }
  _socketActor(actorId){const actor=actorId?game.actors?.get(actorId):this.actor;if(!actor)throw Error('Choose a character');return actor;}
  /** Attach (or swap) through a small form. `preItem`: the tray chip that was chosen (CN-10), preselected when it fits. */
  async _socket(kind,instanceId,slot,actorId,preItem=null){
    const actor=this._socketActor(actorId),host=cinders.socketsApi.slots(actor,instanceId);if(!host)throw Error('That character does not bear this Cinder');
    const fits=cinders.socketsApi.socketable(actor).filter(f=>!host.slots.some(x=>x.itemId===f.itemId));
    if(!fits.length)throw Error(`${actor.name} has no item that fits a Cinder socket (an Ashen Gate item with Cinder modifiers).`);
    const where=f=>f.attachedTo?' (in another Cinder\'s socket: it moves here)':'';
    const f=await input(kind==='swap'?'Swap socket item':'Attach to a socket',[{name:'item',label:'Item',type:'select',value:fits.some(x=>x.itemId===preItem)?preItem:fits[0].itemId,options:fits.map(x=>({value:x.itemId,label:`${x.name}${where(x)}`})),
      hint:`The item stays in ${actor.name}'s inventory. Its Cinder modifiers count while it is in an active socket.`}],kind==='swap'?'Swap':'Attach');
    if(!f?.item)return;
    await cinders.socketsApi[kind](actor,instanceId,...(kind==='swap'?[slot,f.item]:[f.item,{slot}]));notify(kind==='swap'?'Item swapped.':'Item attached.');
  }
  async _detach(instanceId,slot,actorId){
    const actor=this._socketActor(actorId),x=cinders.socketsApi.slots(actor,instanceId)?.slots.find(s=>s.slot===slot);if(!x)throw Error('That socket is empty');
    if(!await confirmDanger(`Detach ${x.name} from this Cinder?\nThe item stays in ${actor.name}'s inventory.`,{title:`Detach ${x.name}?`,yes:'Detach item'}))return;
    await cinders.socketsApi.detach(actor,instanceId,slot);notify('Item detached.');
  }
  async _socketCount(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const f=await input('Sockets on this Cinder',[{name:'count',label:'Sockets',type:'number',value:'',
      hint:`0 to 12. Leave it empty to use the default (${game.settings.get(MODULE,'socketsPerCinder')}) from GM Setup → General. Perks and items can add more. If the number drops, extra items stay attached but inactive until one is removed; nothing is deleted.`}],'Save');
    if(!f)return;const raw=String(f.count??'').trim();
    await cinders.socketsApi.setCount(instanceId,raw===''?null:Number(raw));
  }
  /** Drop on a socket. GM: any Item (a world Item is copied to the bearer: attachDropped). Owner: an item from this character's inventory. */
  async _drop(ev,instanceId,slotRaw,filled=false){
    try{
      let data=null;try{data=JSON.parse(ev.dataTransfer?.getData('text/plain')||'null');}catch{data=null;}
      if(data?.type!=='Item'||!data.uuid)throw Error(game.user.isGM?'Drop an Item from the Items sidebar or the bearer\'s sheet':'Drag an item from this character\'s inventory');
      const doc=await (foundry.utils.fromUuid??globalThis.fromUuid)(data.uuid);
      const slot=slotRaw===''||slotRaw==null?null:Number(slotRaw);
      if(game.user.isGM){
        const r=await cinders.socketsApi.attachDropped(instanceId,doc,{slot});
        notify(r.created?`${doc.name} copied to the bearer and attached.`:`${doc.name} attached.`);
      }else{
        const actor=this.actor;if(!actor||doc?.parent?.id!==actor.id)throw Error(`Drag an item from ${actor?.name??'this character'}'s inventory`);
        if(filled&&slot!=null)await cinders.socketsApi.swap(actor,instanceId,slot,doc.id);else await cinders.socketsApi.attach(actor,instanceId,doc.id,{slot});
        notify(filled?`${doc.name} swapped in.`:`${doc.name} attached.`);
      }
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
    this.render();
  }
  /** A socket on the orbit: empty → Attach; filled or inactive → Swap or Detach. */
  async _socketMenu(instanceId,slot,empty){
    if(empty)return this._socket('attach',instanceId,slot);
    const actor=this._socketActor(),x=cinders.socketsApi.slots(actor,instanceId)?.slots.find(s=>s.slot===slot);if(!x)throw Error('That socket is empty');
    if(!game.user.isGM)return this._socket('swap',instanceId,slot); // only the GM may detach (data layer enforces it too)
    const mods=x.modifiers.map(m=>`<li>${esc(m.label)}: ${esc(TARGET_WORDS[m.target]??m.target)} ${esc(signed(m.value))}</li>`).join('');
    const pick=await choiceDialog(x.name,`<p>${x.active?'In an active socket: its Cinder modifiers count.':'Inactive: over capacity. It does nothing until another item is removed.'}</p>${mods?`<ul>${mods}</ul>`:''}`,
      [{action:'swap',label:'Swap item…',icon:'fa-solid fa-right-left'},{action:'detach',label:'Detach item',icon:'fa-solid fa-link-slash',danger:true}]);
    if(pick==='swap')await this._socket('swap',instanceId,slot);
    else if(pick==='detach')await this._detach(instanceId,slot);
  }
  /** GM: the file picker (Forge: the Assets Library) for this Cinder's orb image. */
  async _pickArt(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const c=cinders.api.list(this.actor).find(x=>x.instanceId===instanceId);if(!c)throw Error('That character does not bear this Cinder');
    await this._filePicker(c.art,path=>cinders.api.setArt(instanceId,path)
      .then(r=>{if(r.changed)notify('Cinder art saved.');}).catch(error=>notify(`Cinders: ${error.message}`,true)));
  }
  /** GM: the file picker, opened beside this window when it is popped out (Foundry's renderChild), else as usual. */
  async _filePicker(current,callback){
    const FP=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker?.implementation??globalThis.FilePicker;
    if(!FP)throw Error('The file picker is not available');
    const picker=new FP({type:'image',current:current||ART_FOLDER,callback});
    const out=this.element?.ownerDocument&&this.element.ownerDocument!==globalThis.document;
    if(out&&typeof this.renderChild==='function')await this.renderChild(picker);else await picker.render?.({force:true});
  }
  /** GM: the Stages… editor for one Cinder (2 to 5 images; Save Changes / Cancel; unsaved edits ask first). */
  async _stages(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const c=cinders.api.list(this.actor).find(x=>x.instanceId===instanceId);if(!c)throw Error('That character does not bear this Cinder');
    await openStageEditor({info:cinders.api.stages(instanceId),art:c.defaultArt??c.ownArt,name:c.name,
      pickImage:(current,setPath)=>this._filePicker(current,setPath),
      save:async stages=>{const r=await cinders.api.setArtStages(instanceId,stages);notify(stages?'Cinder art stages saved.':'This Cinder uses its definition\'s stages again.');return r;}});
    this.render();
  }
  /** GM (0.13.0): the stage art of a whole kind of Cinder (no bearer needed); every bearer without stages of their own follows it. */
  async _kindStages(definitionId){
    if(!game.user.isGM)throw Error('GM only');
    const d=cinders.api.getDefinitionArtStages(definitionId);
    await openStageEditor({info:{own:d.world,definition:d.record,stages:d.stages,unlocked:0},name:d.name,scope:'kind',
      pickImage:(current,setPath)=>this._filePicker(current,setPath),
      save:async stages=>{const r=await cinders.api.setDefinitionArtStages(definitionId,stages);notify(stages?`${d.name} stage art saved.`:`${d.name} uses its imported stages again.`);return r;}});
    this.render();
  }
  async _setStage(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const info=cinders.api.stages(instanceId),v=stageView(info);if(!v)throw Error('This Cinder has no art stages');
    const f=await input('Set stage',[{name:'stage',label:'Show stage',type:'select',value:info.state.index+1,options:v.options,hint:'The Cinder stays at this stage until you choose Auto again.'}],'Set stage');
    if(!f)return;
    const r=await cinders.api.setStageHold(instanceId,Number(f.stage));if(r.changed)notify(`Art held at stage ${r.hold}.`);
  }
  async _adjust(op){
    if(!game.user.isGM)throw Error('GM only');const actor=this.actor;if(!actor)throw Error('Choose a character');
    const label={add:'Add Strain',remove:'Remove Strain',set:'Set Strain'}[op];
    const f=await input(`${label}: ${actor.name}`,[{name:'amount',label:op==='set'?'New value':'Amount',type:'number',value:op==='set'?strain.api.get(actor).value:1},{name:'reason',label:'Reason (recorded)',value:''}],label);
    if(!f)return;
    await strain.api[op](actor,Number(f.amount),{source:{module:MODULE,kind:'gm'},reason:String(f.reason??'').trim()||'GM adjustment'});
  }
  async _new(){
    if(!game.user.isGM)throw Error('GM only');
    const defs=cinderDefinitions();if(!defs.length)throw Error('No Cinder definitions in this world. Import them through General Manager first.');
    const f=await input('New Cinder',[{name:'def',label:'Cinder',type:'select',value:defs[0].id,options:defs.map(d=>({value:d.id,label:d.name})),hint:'The new Cinder starts with no bearer. Bind it to a character next.'}],'Create');
    if(!f?.def)return;await cinders.api.create(f.def);notify('Cinder created.');
  }
  async _bind(instanceId,isTransfer){
    if(!game.user.isGM)throw Error('GM only');
    const inst=cinders.readRegistry().instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
    const choices=(game.actors?.contents??[]).filter(a=>a.type==='character'&&!isLevelBackup(a)&&a.id!==inst.bearer?.actorId).sort((a,b)=>a.name.localeCompare(b.name));
    if(!choices.length)throw Error('No other characters to choose from');
    const name=cinders.definitionName(inst.definitionId);
    const note=isTransfer?'The Cinder keeps its points and unlocked powers; its powers move to the new bearer. Strain and Backfire conditions stay with the previous bearer.':`A bearer cannot release a Cinder; only the GM can unbind or transfer it.${inst.firstBoundAt?'':' The first binding gives the starting point(s).'}`;
    const f=await input(isTransfer?`Transfer ${name}`:`Bind ${name}`,[{name:'actor',label:'Character',type:'select',value:choices[0].id,options:choices.map(a=>({value:a.id,label:a.name})),hint:note}],isTransfer?'Transfer':'Bind');
    const target=f?.actor?game.actors.get(f.actor):null;if(!target)return;
    const r=isTransfer?await cinders.api.transfer(instanceId,target):await cinders.api.bind(instanceId,target);
    notify(isTransfer?`${name} transferred to ${target.name}.`:`${name} bound to ${target.name}${r.initialAwarded?` (+${r.initialAwarded} starting point${r.initialAwarded>1?'s':''})`:''}.`);
    if(r.bearerItems?.problems?.length)ui.notifications?.warn?.(`${name}: ${r.bearerItems.problems.join(' ')} Then run Manage → Check → Repair….`,{permanent:true});
  }
  async _unbind(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const inst=cinders.readRegistry().instances.find(i=>i.instanceId===instanceId);if(!inst?.bearer)throw Error('That Cinder has no bearer');
    const name=cinders.definitionName(inst.definitionId),bearer=game.actors?.get(inst.bearer.actorId)?.name??'its bearer';
    if(!await confirmDanger(`Unbind ${name} from ${bearer}?\nIts powers, signature ability and passive leave ${bearer}'s sheet. The Cinder keeps its points and unlocks. Strain is not changed.`,{title:`Unbind ${name}?`,yes:'Unbind Cinder'}))return;
    await cinders.api.unbind(instanceId);notify(`${name} unbound.`);
  }
  /** GM: Delete Cinder… Plan first (nothing written), a refusal while a character still bears it, then a danger confirmation listing what goes. */
  async _deleteCinder(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const plan=cinders.api.planDeleteCinder(instanceId);
    if(plan.blocked){await infoDialog(`${plan.name} cannot be deleted yet`,`<p>${escape(boundMessage(plan))}</p>`);return false;}
    if(!await confirmDanger(confirmText(plan),{title:`Delete ${plan.name}?`,yes:`Delete ${plan.name}`}))return false;
    const r=await cinders.api.deleteCinder(instanceId,{confirm:true});
    notify(`Deleted ${r.name}. Removed ${r.removed.total} record${r.removed.total===1?'':'s'}.`);
    return true;
  }
  async _migrate(){
    if(!game.user.isGM)throw Error('GM only');
    const rows=await cinders.api.migrate({dryRun:true}),todo=rows.filter(r=>r.action==='create');
    if(!todo.length){notify('No per-character Cinder progress to move.');return;}
    const list=rows.map(r=>`${r.name} · ${cinders.definitionName(r.definitionId)}: ${r.reason}`).join('\n');
    if(!await confirm(`Move existing Cinder tree progress onto Cinders bound to those characters:\n${list}\nPoints, unlocks and power Items stay as they are. Safe to run again.`,{title:'Move existing Cinder progress?',yes:'Move progress'}))return;
    await cinders.api.migrate({dryRun:false});notify(`${todo.length} Cinder${todo.length>1?'s':''} created from existing progress.`);
  }
  /** GM Setup → Strain → Import Strain config… (a kit file button hands over the picked file). */
  async _strainImport(file){
    if(!game.user.isGM)throw Error('GM only');
    if(!file)return;
    let data;try{data=JSON.parse(await file.text());}catch{throw Error(`${file.name} is not valid JSON`);}
    const plan=strain.api.previewConfigImport(data);
    if(plan.errors.length)throw Error(`Strain config not imported: ${plan.errors.slice(0,5).join('; ')}`);
    const row=plan.rows[0];
    if(row.action==='skip'){notify('That Strain config is the same as the current one; nothing changed.');return;}
    const warn=plan.warnings.length?`\nWarnings:\n${plan.warnings.join('\n')}`:'';
    if(!await confirm(`${row.reason}${warn}${this._strainUnsaved()}`,{title:'Import this Strain config?',yes:'Import'}))return;
    const result=await strain.api.importConfig(data);
    if(result.failed.length)throw Error(result.failed[0].reason);
    this.strainDraft=null;
    notify('Strain config imported.');
  }
}
function open({actorId=null}={}){
  assertPlayerAccess(game,MODULE);
  if(!app)app=new CindersApp({actorId});else if(actorId)app.actorId=actorId;
  return app.render({force:true});
}
function addDirectoryLauncher(directory,html){
  return mountLauncher(launcherRoot(directory,html),{moduleId:MODULE,label:'Cinders',icon:'fa-solid fa-fire',
    onClick:()=>{try{open();}catch(error){notify(error.message,true);}},visible:playerAccessAllowed(game,MODULE)});
}

Hooks.once('init',()=>{
  strain.register();
  chip.register(rerender);
  cinders.register();
  game.settings.register(MODULE,PLAYER_ACCESS_SETTING,{name:'Player Access — Cinders',hint:'GM only: show or hide the Cinders window and launcher for players. Strain and Cinders are unchanged.',scope:'world',config:true,type:Boolean,default:true,
    onChange:()=>{const d=globalThis.ui?.actors;if(d?.element)addDirectoryLauncher(d,d.element);if(!game.user?.isGM&&!playerAccess()){globalThis.document?.querySelectorAll?.(`[data-ag-launcher="${MODULE}"]`)?.forEach(b=>b.remove());app?.close?.();}rerender();}});
  // 1 once Cinders has filed its own journal under Ashen Gate (folder-nesting.mjs); config:false.
  game.settings.register(MODULE,FOLDER_SETTING,{scope:'world',config:false,type:String,default:''});
  game.settings.register(MODULE,ADOPTED_SETTING,{scope:'world',config:false,type:Boolean,default:false});
  // Shown in GM Setup and the Cinders tab, not Configure Settings (players see no Cinders settings there).
  game.settings.register(MODULE,ROTATE_SETTING,{scope:'world',config:false,type:Boolean,default:true,onChange:rerender});
  game.settings.register(MODULE,ROTATE_LOCAL_SETTING,{scope:'client',config:false,type:Boolean,default:true,onChange:rerender});
  game.settings.register(MODULE,PUSH_OFFER_SETTING,{scope:'world',config:false,type:Boolean,default:true,onChange:rerender});
  game.settings.register(MODULE,PUSH_OFFER_LOCAL_SETTING,{scope:'client',config:false,type:Boolean,default:true,onChange:rerender});
  // 0.10.0: players use a Cinder's signature ability and passive but never change, remove or copy them (GM only).
  for(const [ev,fn] of Object.entries(cinders.itemGuards))Hooks.on(ev,fn);
  Hooks.on('renderActorDirectory',addDirectoryLauncher);
  // Players: nothing of Cinders in Configure Settings (every setting here is the GM's).
  Hooks.on('renderSettingsConfig',(settingsApp,html)=>stripSettingsCategory(game,MODULE,html?.querySelectorAll?html:html?.[0]??settingsApp?.element));
  Hooks.on('closeApplicationV2',closed=>{if(closed===app)app=null;});
  // Strain chip: refuse chip writes that don't come from Cinders' own sync, on every client.
  for(const ev of ['preCreateActiveEffect','preUpdateActiveEffect','preDeleteActiveEffect'])Hooks.on(ev,chip.hooks[ev]);
});
Hooks.once('setup',()=>{chip.registerStatuses();hideSettingsFromPlayers(game,MODULE);});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE);if(!mod)return;
  hideSettingsFromPlayers(game,MODULE);
  void migrateFolders().catch(e=>console.warn(`${MODULE} | could not file the journal under Ashen Gate`,e));
  mod.api={
    version:VERSION,open,
    playerAccess:{contract:PLAYER_ACCESS_CONTRACT,getState:()=>accessState(game,MODULE),setEnabled:enabled=>setPlayerAccess(game,MODULE,enabled)},
    /** Skill Trees as Cinders sees it: {status: 'ok'|'missing'|'old', message}. */
    status:()=>{const t=trees();return {status:t.status,message:t.message??null};},
    /** The shared Strain door (contract ag-strain/1). Reads: GM or owner. add/remove/set: GM client only. */
    strain:strain.api,
    /** Cinder instances, Push and Backfire (contract ag-cinder/1). Bind / transfer / unbind and the registry are GM only. */
    cinder:cinders.api,
    /** Cinder modifiers (contract ag-modifier/1, scope cinder): validate (pure, for Manager's import) and forActor (GM or owner). */
    modifiers:cinders.modifiersApi,
    /** Cinder sockets (contract ag-sockets/1): hosts, slots, socketable, canAttach, attach / detach / swap; GM: setLocked, setCount, attachDropped. */
    sockets:cinders.socketsApi,
    adoptLegacy:()=>adoptLegacy(),
    /** 0.17.0, GM only: instances, stage art, Strain and rule settings as plain JSON (ag-cinders-state-export/0.1). Read-only; used by General Manager's world backup. */
    exportState:()=>cinders.exportState()
  };
  game.socket?.on?.(SOCKET,(message,senderId)=>cinders.onSocket(message,senderId));
  if(ui.actors?.rendered)addDirectoryLauncher(ui.actors,ui.actors.element);
  Hooks.on('updateActor',(actor,changes)=>{strain.onUpdateActor(actor,changes);chip.hooks.updateActor(actor,changes);if(app?.rendered&&app.actorId===actor.id)app.render();});
  Hooks.on('createChatMessage',message=>strain.onRestMessage(message));
  Hooks.on('deleteActor',actor=>cinders.onDeleteActor(actor));
  Hooks.on('createActor',chip.hooks.createActor);
  for(const ev of ['createSetting','updateSetting'])Hooks.on(ev,chip.hooks.updateSetting);
  Hooks.on('createItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  Hooks.on('deleteItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  Hooks.on(CINDER_HOOK,rerender);
  Hooks.on('ashenGateSockets.changed',rerender);
  Hooks.on('updateItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  // Skill Trees 0.17.0+ (hooks named in its api.accounts contract): keep Cinder records in step and let only a bearer progress.
  Hooks.on('ashenGateSkillTrees.progressChanged',data=>cinders.onProgressChanged(data));
  Hooks.on('ashenGateSkillTrees.checkProgress',check=>cinders.onCheckProgress(check));
  // Returns the Promise (never false), so dnd5e carries on with the use. dnd5e 6.0.6: postUseActivity(activity, usageConfig, results) runs once
  // per use after the use is done (preUseActivity is synchronous, so it cannot wait for the Push offer). A signature ability offers its Push here.
  Hooks.on('dnd5e.postUseActivity',(activity,usageConfig,results)=>cinders.onUseActivity(activity,usageConfig,results));
  // After every module's ready (Skill Trees sets its API in its own ready hook): warn the GM, then adopt any 0.15/0.16 data once.
  setTimeout(()=>{
    const t=trees();
    // Strain chips: statuses again (Skill Trees' status is known now), then a repair pass on the active GM.
    chip.registerStatuses();chip.syncAll();
    if(game.user?.isGM&&t.status!=='ok')ui.notifications?.warn?.(`Ashen Gate | Cinders: ${t.message}`,{permanent:t.status==='old'});
    if(game.user?.isGM&&game.users?.activeGM?.id===game.user.id&&t.status==='ok'&&(!game.settings.get(MODULE,ADOPTED_SETTING)||legacyWaiting()))
      adoptLegacy({quiet:true}).catch(error=>console.error(`[${MODULE}] Adopt from Skill Trees failed`,error));
  },0);
  console.info(`[${MODULE}] v${VERSION} ready.`);
});
