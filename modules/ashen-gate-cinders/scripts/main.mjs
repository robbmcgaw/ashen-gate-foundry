/** Ashen Gate | Cinders: Cinder instances, Push, Backfire and the shared Strain resource.
 * Depends one way on Skill Trees' public API (Cinder trees, points, unlocks), feature-detected; Skill Trees never depends on this module. */
import {createStrain} from './strain-runtime.mjs';
import {createCinders,CINDER_HOOK} from './cinder-runtime.mjs';
import {PLAYER_ACCESS_CONTRACT,PLAYER_ACCESS_SETTING,playerAccessAllowed,assertPlayerAccess,accessState,setPlayerAccess} from './player-access.mjs';
import {lookupWorldDefinition} from './definition-lookup.mjs';
import {launcherRoot,mountLauncher} from './ag-launchers.mjs';

const MODULE='ashen-gate-cinders';
const VERSION='0.4.0';
const SOCKET=`module.${MODULE}`;
const TREES_ID='ashen-gate-skill-trees';
const ACCOUNTS_CONTRACT='ag-tree-accounts/1';
const ADOPTED_SETTING='legacyAdopted';
const {ApplicationV2,HandlebarsApplicationMixin,DialogV2}=foundry.applications.api;

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
const escape=x=>foundry.utils.escapeHTML(String(x??''));
const notify=(s,error=false)=>error?ui.notifications.error(s):ui.notifications.info(s);
const sourceFlag=doc=>doc?.flags?.['ashen-gate-manager']?.source??null;

let app=null;
const rerender=()=>{if(app?.rendered)app.render();};
let cinders=null;
const strain=createStrain({module:MODULE,onConfigChange:rerender,recoveryBonus:actor=>cinders?.recoveryBonus(actor)??0,blocked});
cinders=createCinders({module:MODULE,socket:SOCKET,strain,escape,trees,blocked,playerAccess,lookup:id=>lookupWorldDefinition(game,id,{})});

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
const confirm=async(content,title='Confirm')=>Boolean(await DialogV2.confirm({window:{title},content,modal:true,rejectClose:false}));
const formValues=v=>v&&typeof v.entries==='function'?Object.fromEntries(v.entries()):v??{};
const input=async(title,content,label='Save')=>{const r=await DialogV2.input({window:{title},content,ok:{label}});return r?formValues(r):null;};
const download=(filename,data)=>{
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
function pickJsonFile(){
  return new Promise(resolve=>{
    const el=document.createElement('input');el.type='file';el.accept='.json,application/json';
    el.addEventListener('change',()=>resolve(el.files?.[0]??null),{once:true});
    el.addEventListener('cancel',()=>resolve(null),{once:true});
    el.click();
  });
}
const characters=()=>(game.actors?.contents??[]).filter(a=>a.type==='character'&&(game.user.isGM||a.isOwner)).sort((a,b)=>a.name.localeCompare(b.name));
/** Strain bar: fills to the guarantee point (10), then shows how far past it the character is. */
export function strainBar(s){
  const top=Math.max(1,s.guaranteeAt??10),over=Math.max(0,s.value-top);
  return {value:s.value,top,over,fill:Math.round(Math.min(s.value,top)/top*100),label:over?`${s.value} / ${top}+`:`${s.value} / ${top}`,
    band:s.band.label,chance:s.chance,guaranteed:s.guaranteed,normalUseBackfires:s.normalUseBackfires};
}
function cinderDefinitions(){
  return [...(game.items?.contents??[]),...(game.journal?.contents??[])].map(d=>({d,src:sourceFlag(d)}))
    .filter(({d,src})=>src?.sourceId?.startsWith('MUT-')&&lookupWorldDefinition(game,src.sourceId).document===d)
    .map(({d,src})=>({id:src.sourceId,name:d.name})).sort((a,b)=>a.name.localeCompare(b.name));
}
function manageView(){
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
  return {groups:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)),hasCinders:registry.instances.length>0,report,hasReport:report.length>0,
    sockets,hasSockets:sockets.length>0,socketDefault:game.settings.get(MODULE,'socketsPerCinder'),
    canRepair:report.some(r=>r.repair),migrate,legacy:legacyWaiting(),definitions:cinderDefinitions().length,
    limit:game.settings.get(MODULE,'maxCindersPerActor'),initial:game.settings.get(MODULE,'initialCinderPoints')};
}
const signed=v=>`${v>0?'+':''}${v}`;
const TARGET_WORDS={'push.cost':'Push cost','backfire.chance':'Backfire chance','backfire.severity':'Backfire severity','strain.recovery':'rest recovery','sockets.count':'sockets'};
/** One Cinder's sockets for the window: filled sockets (active or over capacity), then the empty ones. */
function socketView(h,fits){
  const empties=Array.from({length:h.free},(_,i)=>({index:i}));
  const spare=fits.filter(f=>!h.slots.some(x=>x.itemId===f.itemId));
  return {instanceId:h.instanceId,capacity:h.capacity,used:h.slots.filter(x=>x.active).length,locked:h.locked,canEdit:h.canEdit,
    slots:h.slots.map(x=>({...x,effects:x.modifiers.map(m=>`${m.label}: ${TARGET_WORDS[m.target]??m.target} ${signed(m.value)}`).join(' · ')})),
    empties,hasSlots:h.slots.length>0||empties.length>0,canAttach:h.canEdit&&spare.length>0&&h.free>0,canSwap:h.canEdit&&spare.length>0,
    overCapacity:h.slots.some(x=>!x.active)};
}
function setupView(){
  const c=strain.config();
  const pct=v=>c.backfire_schedule[Math.min(v,c.backfire_schedule.length-1)]??0;
  const shown=(v,top)=>v>=c.guarantee_at&&!c.allow_prevention_at_guarantee?100:pct(Math.min(v,top));
  return {
    bands:c.bands.map(b=>{const to=b.to??Math.max(b.from,c.backfire_schedule.length-1);const lo=shown(b.from,to),hi=shown(to,to);
      return {label:b.label,range:b.to===null?`${b.from}+`:b.from===b.to?`${b.from}`:`${b.from}–${b.to}`,chance:lo===hi?`${lo}%`:`${lo}–${hi}%`};}),
    guaranteeAt:c.guarantee_at,normalUseAt:c.normal_use_backfire_at,prevention:c.allow_prevention_at_guarantee,hardMax:c.hard_max??'none',
    restLong:c.rest_recovery.long,restShort:c.rest_recovery.short,
    effectBonus:c.effect_roll.strain_bonus.enabled?`+1 at Strain ${c.effect_roll.strain_bonus.from}, then +1 more every ${c.effect_roll.strain_bonus.per} Strain`:'off',
    playerAccess:playerAccess(),limit:game.settings.get(MODULE,'maxCindersPerActor'),initial:game.settings.get(MODULE,'initialCinderPoints')
  };
}
class CindersApp extends HandlebarsApplicationMixin(ApplicationV2){
  static DEFAULT_OPTIONS={id:'agc-window',classes:['ag-app','agc-window'],window:{title:'Ashen Gate | Cinders',resizable:true,icon:'fa-solid fa-fire'},position:{width:760,height:680}};
  static PARTS={main:{template:`modules/${MODULE}/templates/cinders.hbs`}};
  constructor(options={}){super(options);this.tab='cinders';this.actorId=options.actorId??null;}
  get actor(){return game.actors?.get(this.actorId)??null;}
  async _prepareContext(options){
    const ctx=await super._prepareContext(options),gm=game.user.isGM,why=blocked(),t=trees();
    if(!gm)this.tab='cinders';
    const choices=characters();if(!choices.some(a=>a.id===this.actorId))this.actorId=choices[0]?.id??null;
    const actor=this.actor;
    let bar=null,list=[],error=null;
    if(!why&&actor){
      try{bar=strainBar(strain.api.get(actor));list=cinders.api.list(actor);
        const hosts=cinders.socketsApi.hosts(actor),fits=cinders.socketsApi.socketable(actor);
        list=list.map(c=>{const h=hosts.find(x=>x.instanceId===c.instanceId);return h?{...c,sockets:socketView(h,fits)}:c;});
      }catch(e){error=e.message;}
    }
    return {...ctx,gm,version:VERSION,blocked:why,treesMessage:t.status==='missing'?t.message:null,canOpenTree:t.status==='ok'&&typeof t.api?.open==='function',
      tabCinders:this.tab==='cinders',tabManage:gm&&this.tab==='manage',tabSetup:gm&&this.tab==='setup',
      actors:choices.map(a=>({id:a.id,name:a.name,selected:a.id===this.actorId})),hasActor:Boolean(actor),actorName:actor?.name??'',
      bar,cinders:list,hasCinders:list.length>0,error,
      manage:gm&&this.tab==='manage'&&!why?manageView():null,setup:gm&&this.tab==='setup'&&!why?setupView():null};
  }
  async _onRender(context,options){
    await super._onRender?.(context,options);
    const el=this.element;
    el.querySelector('[data-agc-actor]')?.addEventListener('change',ev=>{this.actorId=ev.target.value;this.render();});
    for(const b of el.querySelectorAll('[data-act]'))b.addEventListener('click',ev=>this._act(ev.currentTarget));
    // GM drop target: drag an Item from the Items sidebar (or the bearer's sheet) onto a socket.
    for(const z of el.querySelectorAll('[data-agc-drop]')){
      z.addEventListener('dragover',ev=>{ev.preventDefault();z.classList.add('agc-drop-over');});
      z.addEventListener('dragleave',()=>z.classList.remove('agc-drop-over'));
      z.addEventListener('drop',ev=>{ev.preventDefault();z.classList.remove('agc-drop-over');this._drop(ev,z.dataset.instance,z.dataset.slot);});
    }
  }
  async _act(el){
    const act=el.dataset.act;
    try{
      switch(act){
        case 'tab':this.tab=game.user.isGM?el.dataset.tab:'cinders';break;
        case 'help':await this._help();return;
        case 'push':await this._push(el.dataset.instance,el.dataset.power,el.dataset.mode);break;
        case 'open-tree':{const t=trees(),actor=this.actor;const tree=t.status==='ok'&&game.user.isGM?cinders.cinderTree(el.dataset.definition):null;
          t.api?.open?.({actorId:actor?.id,...(tree?{treeId:tree.id}:{})});return;}
        case 'strain-adjust':await this._adjust(el.dataset.op);break;
        case 'socket-attach':await this._socket('attach',el.dataset.instance,null,el.dataset.actor);break;
        case 'socket-swap':await this._socket('swap',el.dataset.instance,Number(el.dataset.slot),el.dataset.actor);break;
        case 'socket-detach':await this._detach(el.dataset.instance,Number(el.dataset.slot),el.dataset.actor);break;
        case 'socket-lock':if(!game.user.isGM)throw Error('GM only');await cinders.socketsApi.setLocked(el.dataset.instance,el.dataset.locked!=='true');break;
        case 'socket-count':await this._socketCount(el.dataset.instance);break;
        case 'cinder-new':await this._new();break;
        case 'cinder-bind':await this._bind(el.dataset.instance,false);break;
        case 'cinder-transfer':await this._bind(el.dataset.instance,true);break;
        case 'cinder-unbind':await this._unbind(el.dataset.instance);break;
        case 'cinder-migrate':await this._migrate();break;
        case 'cinder-adopt':await adoptLegacy();break;
        case 'cinder-repair':{if(!game.user.isGM)throw Error('GM only');const done=await cinders.api.repair();notify(done.length?done.join('; '):'Nothing needed repair.');}break;
        case 'toggle-access':if(!game.user.isGM)throw Error('GM only');await setPlayerAccess(game,MODULE,!playerAccess());break;
        case 'strain-import':await this._strainImport();break;
        case 'strain-export':if(!game.user.isGM)throw Error('GM only');download('ag-strain-config.json',strain.config());return;
        case 'strain-reset':if(!game.user.isGM)throw Error('GM only');if(await confirm('<p>Reset the Strain config to the module defaults (neutral band names, default Backfire schedule)?</p><p>Character Strain is not changed.</p>','Reset Strain config')){await strain.api.resetConfig();notify('Strain config reset to defaults.');}break;
      }
      this.render();
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
  }
  async _help(){
    await confirm(`<p><strong>Strain</strong> is one number per character. Pushes, crafting, hazards, items and spells can change it; a long rest removes ${strain.config().rest_recovery.long}. The band name and Backfire chance come from the GM's Strain config.</p>
      <p><strong>Push</strong> a Cinder power for a stronger effect. Every Push gains Strain, and the Backfire chance uses the Strain after that gain. From Strain ${strain.config().guarantee_at} every Push backfires, and every normal use of a Cinder power does too. A Backfire never kills or removes a character.</p>
      <p><strong>A Cinder</strong> keeps its own points and powers. Only the GM binds, transfers or unbinds it (Manage tab). Unlock powers in the Skill Trees window.</p>`,'Cinders help');
  }
  async _push(instanceId,powerId,modeId){
    const actor=this.actor;if(!actor)throw Error('Choose a character');
    const pv=cinders.api.previewPush(actor,instanceId,powerId,modeId);
    const mods=pv.modifiers.length?`<p>Modifiers: ${pv.modifiers.map(m=>escape(`${m.label} (${m.value>0?'+':''}${m.value})`)).join(', ')}</p>`:'';
    if(!await confirm(`<p><strong>${escape(pv.powerName)}: ${escape(pv.label)}</strong></p>${pv.effect?`<p>${escape(pv.effect)}</p>`:''}<p>Strain ${pv.strain} → <strong>${pv.after}</strong> (+${pv.cost}). Backfire chance <strong>${pv.chance}%</strong>${pv.guaranteed?' (guaranteed)':''}.</p>${mods}<p>Every Push gains Strain. The result is posted to chat.</p>`,'Push'))return;
    await cinders.api.push(actor,powerId,modeId);
  }
  _socketActor(actorId){const actor=actorId?game.actors?.get(actorId):this.actor;if(!actor)throw Error('Choose a character');return actor;}
  async _socket(kind,instanceId,slot,actorId){
    const actor=this._socketActor(actorId),host=cinders.socketsApi.slots(actor,instanceId);if(!host)throw Error('That character does not bear this Cinder');
    const fits=cinders.socketsApi.socketable(actor).filter(f=>!host.slots.some(x=>x.itemId===f.itemId));
    if(!fits.length)throw Error(`${actor.name} has no item that fits a Cinder socket (an Ashen Gate ITEM-* with Cinder modifiers).`);
    const where=f=>f.attachedTo?' (in another Cinder\'s socket: it moves here)':'';
    const f=await input(kind==='swap'?'Swap socket item':'Attach to a socket',`<label>Item<select name="item">${fits.map(x=>`<option value="${escape(x.itemId)}">${escape(x.name)}${escape(where(x))}</option>`).join('')}</select></label><p>The item stays in ${escape(actor.name)}'s inventory. Its Cinder modifiers count while it is in an active socket.</p>`,kind==='swap'?'Swap':'Attach');
    if(!f?.item)return;
    await cinders.socketsApi[kind](actor,instanceId,...(kind==='swap'?[slot,f.item]:[f.item]));notify(kind==='swap'?'Item swapped.':'Item attached.');
  }
  async _detach(instanceId,slot,actorId){
    const actor=this._socketActor(actorId),x=cinders.socketsApi.slots(actor,instanceId)?.slots.find(s=>s.slot===slot);if(!x)throw Error('That socket is empty');
    if(!await confirm(`<p>Detach <strong>${escape(x.name)}</strong> from this Cinder?</p><p>The item stays in ${escape(actor.name)}'s inventory.</p>`,'Detach'))return;
    await cinders.socketsApi.detach(actor,instanceId,slot);notify('Item detached.');
  }
  async _socketCount(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const f=await input('Sockets on this Cinder',`<label>Sockets<input type="number" name="count" min="0" max="12" step="1" placeholder="default (${escape(game.settings.get(MODULE,'socketsPerCinder'))})"></label><p>Leave it empty to use the default from Configure Settings. Perks and items can add more. If the number drops, extra items stay attached but inactive until one is removed; nothing is deleted.</p>`,'Save');
    if(!f)return;const raw=String(f.count??'').trim();
    await cinders.socketsApi.setCount(instanceId,raw===''?null:Number(raw));
  }
  async _drop(ev,instanceId,slotRaw){
    try{
      if(!game.user.isGM)throw Error('GM only');
      let data=null;try{data=JSON.parse(ev.dataTransfer?.getData('text/plain')||'null');}catch{data=null;}
      if(data?.type!=='Item'||!data.uuid)throw Error('Drop an Item from the Items sidebar or the bearer\'s sheet');
      const doc=await (foundry.utils.fromUuid??globalThis.fromUuid)(data.uuid);
      const r=await cinders.socketsApi.attachDropped(instanceId,doc,{slot:slotRaw===''||slotRaw==null?null:Number(slotRaw)});
      notify(r.created?`${doc.name} copied to the bearer and attached.`:`${doc.name} attached.`);
    }catch(error){console.error(`[${MODULE}]`,error);notify(`Cinders: ${error.message}`,true);}
    this.render();
  }
  async _adjust(op){
    if(!game.user.isGM)throw Error('GM only');const actor=this.actor;if(!actor)throw Error('Choose a character');
    const label={add:'Add Strain',remove:'Remove Strain',set:'Set Strain'}[op];
    const f=await input(`${label}: ${actor.name}`,`<label>${op==='set'?'New value':'Amount'}<input type="number" name="amount" min="${op==='set'?0:1}" step="1" value="${op==='set'?strain.api.get(actor).value:1}"></label><label>Reason (recorded)<input type="text" name="reason" maxlength="200" required></label>`,label);
    if(!f)return;
    await strain.api[op](actor,Number(f.amount),{source:{module:MODULE,kind:'gm'},reason:String(f.reason??'').trim()||'GM adjustment'});
  }
  async _new(){
    if(!game.user.isGM)throw Error('GM only');
    const defs=cinderDefinitions();if(!defs.length)throw Error('No Cinder (MUT-*) definitions in this world. Import them through General Manager first.');
    const f=await input('New Cinder',`<label>Cinder<select name="def">${defs.map(d=>`<option value="${escape(d.id)}">${escape(d.name)} (${escape(d.id)})</option>`).join('')}</select></label><p>The new Cinder starts with no bearer. Bind it to a character next.</p>`,'Create');
    if(!f?.def)return;await cinders.api.create(f.def);notify('Cinder created.');
  }
  async _bind(instanceId,isTransfer){
    if(!game.user.isGM)throw Error('GM only');
    const inst=cinders.readRegistry().instances.find(i=>i.instanceId===instanceId);if(!inst)throw Error('Unknown Cinder');
    const choices=(game.actors?.contents??[]).filter(a=>a.type==='character'&&a.id!==inst.bearer?.actorId).sort((a,b)=>a.name.localeCompare(b.name));
    if(!choices.length)throw Error('No other characters to choose from');
    const name=cinders.definitionName(inst.definitionId);
    const note=isTransfer?'<p>The Cinder keeps its points and unlocked powers; its powers move to the new bearer. Strain and Backfire conditions stay with the previous bearer.</p>':`<p>A bearer cannot release a Cinder; only the GM can unbind or transfer it.${inst.firstBoundAt?'':' The first binding gives the starting point(s).'}</p>`;
    const f=await input(isTransfer?`Transfer ${name}`:`Bind ${name}`,`<label>Character<select name="actor">${choices.map(a=>`<option value="${a.id}">${escape(a.name)}</option>`).join('')}</select></label>${note}`,isTransfer?'Transfer':'Bind');
    const target=f?.actor?game.actors.get(f.actor):null;if(!target)return;
    if(isTransfer){await cinders.api.transfer(instanceId,target);notify(`${name} transferred to ${target.name}.`);}
    else{const r=await cinders.api.bind(instanceId,target);notify(`${name} bound to ${target.name}${r.initialAwarded?` (+${r.initialAwarded} starting point${r.initialAwarded>1?'s':''})`:''}.`);}
  }
  async _unbind(instanceId){
    if(!game.user.isGM)throw Error('GM only');
    const inst=cinders.readRegistry().instances.find(i=>i.instanceId===instanceId);if(!inst?.bearer)throw Error('That Cinder has no bearer');
    const name=cinders.definitionName(inst.definitionId),bearer=game.actors?.get(inst.bearer.actorId)?.name??'its bearer';
    if(!await confirm(`<p>Unbind <strong>${escape(name)}</strong> from <strong>${escape(bearer)}</strong>?</p><p>Its powers leave ${escape(bearer)}'s sheet. The Cinder keeps its points and unlocks. Strain is not changed.</p>`,'Unbind Cinder'))return;
    await cinders.api.unbind(instanceId);notify(`${name} unbound.`);
  }
  async _migrate(){
    if(!game.user.isGM)throw Error('GM only');
    const rows=await cinders.api.migrate({dryRun:true}),todo=rows.filter(r=>r.action==='create');
    if(!todo.length){notify('No per-character Cinder progress to move.');return;}
    const list=rows.map(r=>`<li><strong>${escape(r.name)}</strong> · ${escape(cinders.definitionName(r.definitionId))}: ${escape(r.reason)}</li>`).join('');
    if(!await confirm(`<p>Move existing Cinder tree progress onto Cinders bound to those characters:</p><ul>${list}</ul><p>Points, unlocks and power Items stay as they are. Safe to run again.</p>`,'Move existing Cinder progress'))return;
    await cinders.api.migrate({dryRun:false});notify(`${todo.length} Cinder${todo.length>1?'s':''} created from existing progress.`);
  }
  async _strainImport(){
    if(!game.user.isGM)throw Error('GM only');
    const file=await pickJsonFile();if(!file)return;
    let data;try{data=JSON.parse(await file.text());}catch{throw Error(`${file.name} is not valid JSON`);}
    const plan=strain.api.previewConfigImport(data);
    if(plan.errors.length)throw Error(`Strain config not imported: ${plan.errors.slice(0,5).join('; ')}`);
    const row=plan.rows[0];
    if(row.action==='skip'){notify('That Strain config is the same as the current one; nothing changed.');return;}
    const warn=plan.warnings.length?`<p>Warnings:</p><ul>${plan.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul>`:'';
    if(!await confirm(`<p>${escape(row.reason)}</p>${warn}`,'Import Strain config'))return;
    const result=await strain.api.importConfig(data);
    if(result.failed.length)throw Error(result.failed[0].reason);
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
  cinders.register();
  game.settings.register(MODULE,PLAYER_ACCESS_SETTING,{name:'Player Access — Cinders',hint:'GM only: show or hide the Cinders window and launcher for players. Strain and Cinders are unchanged.',scope:'world',config:true,type:Boolean,default:true,
    onChange:()=>{const d=globalThis.ui?.actors;if(d?.element)addDirectoryLauncher(d,d.element);if(!game.user?.isGM&&!playerAccess()){globalThis.document?.querySelectorAll?.(`[data-ag-launcher="${MODULE}"]`)?.forEach(b=>b.remove());app?.close?.();}rerender();}});
  game.settings.register(MODULE,ADOPTED_SETTING,{scope:'world',config:false,type:Boolean,default:false});
  Hooks.on('renderActorDirectory',addDirectoryLauncher);
  Hooks.on('closeApplicationV2',closed=>{if(closed===app)app=null;});
});
Hooks.once('ready',()=>{
  const mod=game.modules.get(MODULE);if(!mod)return;
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
    adoptLegacy:()=>adoptLegacy()
  };
  game.socket?.on?.(SOCKET,(message,senderId)=>cinders.onSocket(message,senderId));
  if(ui.actors?.rendered)addDirectoryLauncher(ui.actors,ui.actors.element);
  Hooks.on('updateActor',(actor,changes)=>{strain.onUpdateActor(actor,changes);if(app?.rendered&&app.actorId===actor.id)app.render();});
  Hooks.on('createChatMessage',message=>strain.onRestMessage(message));
  Hooks.on('deleteActor',actor=>cinders.onDeleteActor(actor));
  Hooks.on('createItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  Hooks.on('deleteItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  Hooks.on(CINDER_HOOK,rerender);
  Hooks.on('ashenGateSockets.changed',rerender);
  Hooks.on('updateItem',item=>{if(item?.parent&&app?.rendered&&app.actorId===item.parent.id)app.render();});
  // Skill Trees 0.17.0+ (hooks named in its api.accounts contract): keep Cinder records in step and let only a bearer progress.
  Hooks.on('ashenGateSkillTrees.progressChanged',data=>cinders.onProgressChanged(data));
  Hooks.on('ashenGateSkillTrees.checkProgress',check=>cinders.onCheckProgress(check));
  // Returns the Promise (never false), so dnd5e carries on with the use.
  Hooks.on('dnd5e.postUseActivity',activity=>cinders.onUseActivity(activity));
  // After every module's ready (Skill Trees sets its API in its own ready hook): warn the GM, then adopt any 0.15/0.16 data once.
  setTimeout(()=>{
    const t=trees();
    if(game.user?.isGM&&t.status!=='ok')ui.notifications?.warn?.(`Ashen Gate | Cinders: ${t.message}`,{permanent:t.status==='old'});
    if(game.user?.isGM&&game.users?.activeGM?.id===game.user.id&&t.status==='ok'&&(!game.settings.get(MODULE,ADOPTED_SETTING)||legacyWaiting()))
      adoptLegacy({quiet:true}).catch(error=>console.error(`[${MODULE}] Adopt from Skill Trees failed`,error));
  },0);
  console.info(`[${MODULE}] v${VERSION} ready.`);
});
