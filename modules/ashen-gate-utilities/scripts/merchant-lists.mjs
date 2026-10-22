/* ---- 0.20.0: merchant lists (design §3 Merchant list, brief 5). A named, ordered list of shops and services, usually
   one city, stored on the GM Data journal's lists page (meta.lists). shop-buy.mjs writes a shared list to the Player View
   journal as one page its players can read. Browsing a list never lets anyone buy, sell or use a service; that still
   needs the entry presented. 0.25.0: a list is shared with nobody (hidden), the whole party or chosen players
   (`audience`), and each entry has an Open switch that presents it to that audience (Present) or stops showing it, plus
   Open all / Close all. Every call is GM only. ---- */
import {escapeHTML as E,normalizeMerchantList,normalizeAudience,migrateMerchantLists,listNeedsMigration,presentedCovers,presentedBeyond,mergePresented,audienceText,
 shopIdFromName,validId,MLIST_NAME_MAX,shopPlace} from './core.mjs';
import {readAll,readServices,readMeta,writeMeta,queueShops,locationMap,icon,button,tip,settlementSelect} from './shops.mjs';
import {emptyState} from './ui-parts.mjs';
import {fold} from './ag-html.mjs';
import {syncPlayerView,setPresentations,getRecord} from './shop-buy.mjs';
import {servicesAll,typeLabel} from './services.mjs';
import {confirmDanger,formDialog} from './ag-dialogs.mjs';

const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const clone=v=>structuredClone(v);
const stamp=()=>({updatedAt:Date.now(),updatedBy:game.user?.id??null});
const lists=()=>readMeta().lists.map(l=>{try{return normalizeMerchantList(l);}catch{return null;}}).filter(Boolean);
const mustGetList=id=>{const l=lists().find(x=>x.id===id);if(!l)throw Error('That merchant list no longer exists.');return l;};

/* ---------- API (GM only) ---------- */
const players=()=>[...(game.users??[])].filter(u=>u?.id&&!u.isGM);
const userName=id=>game.users?.get?.(id)?.name??id;
/** An audience from the API: {mode: 'hidden' | 'party' | 'users', userIds}. Chosen players must be player users. */
function cleanAudience(a){
 const mode=a?.mode;
 if(!['hidden','party','users'].includes(mode))throw Error("Share a merchant list with mode 'hidden', 'party' or 'users'.");
 if(mode!=='users')return normalizeAudience({mode});
 const known=new Set(players().map(u=>u.id)),ids=[...new Set([].concat(a.userIds??[]))].filter(u=>known.has(u));
 if(!ids.length)throw Error('Choose at least one player.');
 return normalizeAudience({mode,userIds:ids});
}
function list(){gmOnly();return lists().map(clone);}
function get(id){gmOnly();const l=lists().find(x=>x.id===id);return l?clone(l):null;}
/**
 * Creates (no id) or updates a list. Who it is shared with: `audience`, else the 0.20 `visible` (true = whole party),
 * else as it was (a new list is hidden). Writes the player view after.
 */
async function save(data={}){
 gmOnly();
 const audience=data.audience!==undefined?cleanAudience(data.audience):data.visible!==undefined?normalizeAudience({mode:data.visible===true?'party':'hidden'}):null;
 const saved=await queueShops(async()=>{
  const meta=readMeta(),old=data.id?meta.lists.find(l=>l.id===data.id):null;
  let id=data.id;
  if(!old){
   const taken=[...readAll().map(s=>s.id),...readServices().map(s=>s.id),...meta.lists.map(l=>l.id)];
   if(id){if(!validId(id,'MLIST'))throw Error('Merchant list id must be MLIST- and upper-case letters, digits and single hyphens.');if(taken.includes(id)||meta.retiredIds.includes(id))throw Error(`The merchant list id ${id} is already used.`);}
   else id=shopIdFromName(data.name,taken,'MLIST',meta.retiredIds);
  }
  const was=old?(()=>{try{return normalizeMerchantList(old).audience;}catch{return null;}})():null;
  const {visible,...rest}=data;
  const now=Date.now(),rec=normalizeMerchantList({...rest,id,audience:audience??was??{mode:'hidden'},createdAt:old?.createdAt??now,...stamp()});
  meta.lists=old?meta.lists.map(l=>l.id===id?rec:l):[...meta.lists,rec];
  await writeMeta(meta);return rec;
 });
 await syncPlayerView();return clone(saved);
}
/** 0.25.0: who the list is shared with. Its entries' Open state is not changed (close them with Close all). */
async function setAudience(id,audience){
 gmOnly();
 const a=cleanAudience(audience);
 const saved=await queueShops(async()=>{const meta=readMeta(),old=mustGetList(id),rec=normalizeMerchantList({...old,audience:a,...stamp()});meta.lists=meta.lists.map(l=>l.id===id?rec:l);await writeMeta(meta);return rec;});
 await syncPlayerView();return clone(saved);
}
/** 0.20.0 call, kept: true shares the list with the whole party, false hides it. */
async function setVisible(id,visible){
 if(typeof visible!=='boolean'){gmOnly();throw TypeError('Boolean required.');}
 return setAudience(id,{mode:visible?'party':'hidden'});
}
/** What a list's entry is right now: {id, name, kind, open (shown to the whole audience), presented, canOpen, reason}. */
function entryState(l,id){
 let rec=null;try{rec=getRecord(id);}catch{rec=null;}
 if(!rec)return {id,name:id,open:false,presented:null,canOpen:false,reason:'Missing (deleted)'};
 const base={id,name:rec.name,kind:rec.kind==='service'?'service':'shop',presented:clone(rec.presented??null),open:presentedCovers(rec.presented,l.audience)};
 if(rec.kind==='service'&&!rec.known)return {...base,canOpen:false,reason:'Unknown service type: never shown to players'};
 if(l.audience.mode==='hidden')return {...base,canOpen:false,reason:'Share the list first'};
 return {...base,canOpen:true,reason:''};
}
function entries(id){gmOnly();const l=mustGetList(id);return l.shopIds.map(e=>entryState(l,e));}
const notOnList=(l,entryId)=>{if(!l.shopIds.includes(entryId))throw Error('That shop or service is not on this merchant list.');};
const hiddenRefusal="Share this merchant list with the party or chosen players first; Open shows a store to the list's players.";
/**
 * 0.25.0: open (present) or close (stop showing) one entry for the list's players. Opening adds the list's players to
 * whoever the store is already shown to; closing stops showing it to everyone. Returns the entry's new state.
 */
async function setOpen(id,entryId,open){
 gmOnly();
 if(typeof open!=='boolean')throw TypeError('Boolean required.');
 const l=mustGetList(id);notOnList(l,entryId);
 const st=entryState(l,entryId);
 if(open&&!st.canOpen)throw Error(l.audience.mode==='hidden'?hiddenRefusal:`${st.name}: ${st.reason}.`);
 const r=await setPresentations([{id:entryId,presented:open?mergePresented(st.presented,l.audience):null}]);
 if(r.skipped.length)throw Error(r.skipped[0].reason);
 return entryState(mustGetList(id),entryId);
}
/** 0.25.0: Open all / Close all. Entries that can't be opened (missing, unknown type) are skipped and named. */
async function setAllOpen(id,open){
 gmOnly();
 if(typeof open!=='boolean')throw TypeError('Boolean required.');
 const l=mustGetList(id);
 if(open&&l.audience.mode==='hidden')throw Error(hiddenRefusal);
 const states=l.shopIds.map(e=>entryState(l,e)),skipped=[];
 const changes=states.flatMap(st=>{
  if(open){if(!st.canOpen){skipped.push({id:st.id,reason:st.reason});return [];}return st.open?[]:[{id:st.id,presented:mergePresented(st.presented,l.audience)}];}
  return st.presented?[{id:st.id,presented:null}]:[];
 });
 const r=await setPresentations(changes);
 return {changed:r.changed.map(c=>c.id),skipped:[...skipped,...r.skipped]};
}
/** Needs {confirm: true}. Its shops and services are not touched. The id is retired, never reused. */
async function remove(id,{confirm=false}={}){
 gmOnly();
 if(confirm!==true)throw Error('Deleting a merchant list needs {confirm: true}.');
 const gone=await queueShops(async()=>{const meta=readMeta(),old=mustGetList(id);meta.lists=meta.lists.filter(l=>l.id!==id);if(!meta.retiredIds.includes(id))meta.retiredIds.push(id);await writeMeta(meta);return {id,name:old.name};});
 await syncPlayerView();return gone;
}
/**
 * 0.25.0 migration (GM, on ready): writes `audience` on lists saved before it (`visible: true` → whole party, else
 * hidden). Re-runnable: writes nothing when every list already has it. Returns how many lists it changed.
 */
export async function migrateLists(){
 if(!isGM())return 0;
 const n=await queueShops(async()=>{const meta=readMeta(),count=meta.lists.filter(listNeedsMigration).length;if(!count)return 0;meta.lists=migrateMerchantLists(meta.lists);await writeMeta(meta);return count;});
 if(n)await syncPlayerView();
 return n;
}
export function merchantsApi(){return {list,get,save,setVisible,setAudience,entries,setOpen,setAllOpen,delete:remove};}

/* ---------- GM sub-tab: Merchant lists ---------- */
/** Saved shops and services by id, with what a list shows about each. */
function entryIndex(){
 const m=new Map();
 for(const s of readAll())m.set(s.id,{id:s.id,name:s.name,what:`Shop · ${(s.lines??[]).length} ${(s.lines??[]).length===1?'item':'items'}`,rec:s});
 for(const s of servicesAll())m.set(s.id,{id:s.id,name:s.name,what:s.known?typeLabel(s.service?.type):`${typeLabel(s.service?.type)}: not shown to players`,rec:s,unknown:!s.known});
 return m;
}
const cityName=(id,locations)=>id?shopPlace({locationId:id},locations).place:'';
const shareBadge=a=>a.mode==='hidden'?`<span class="ag-badge">${icon('fa-eye-slash')} Hidden</span>`:`<span class="ag-badge ag-badge--ok">${icon(a.mode==='party'?'fa-users':'fa-user-check')} ${E(audienceText(a,userName))}</span>`;
/**
 * 0.26.0: what closing these entries does beyond this list: stores also shown to players outside its audience
 * (presented on their own, or through another list) and other shared lists that hold them. Names only; nothing changes.
 */
export function closeEffects(listId,entryIds){
 const all=lists(),l=all.find(x=>x.id===listId);if(!l)return [];
 return [].concat(entryIds).map(id=>{
  const st=entryState(l,id);if(!st.presented)return null;
  const others=all.filter(o=>o.id!==l.id&&o.audience.mode!=='hidden'&&o.shopIds.includes(id)).map(o=>o.name);
  const beyond=presentedBeyond(st.presented,l.audience);
  return beyond||others.length?{id,name:st.name,beyond,others}:null;
 }).filter(Boolean);
}
const effectsText=effects=>effects.map(e=>`${e.name}${e.others.length?` (also on ${e.others.join(', ')})`:' (also shown on its own)'}`).join('; ');
/** A summary card: name, settlement, who it is shared with, how many stores are open, its actions; the stores in a fold. */
function card(l,index,locations){
 const city=cityName(l.locationId,locations),states=l.shopIds.map(id=>({...entryState(l,id),...(index.get(id)??{what:'Missing (deleted)'})}));
 const openN=states.filter(s=>s.open).length,canN=states.filter(s=>s.canOpen).length,hidden=l.audience.mode==='hidden';
 const items=states.map(e=>`<li class="ag-row agu-mlist__entry"><div class="ag-row__main"><span class="ag-row__title">${E(e.name)}</span>${e.canOpen||hidden?'':`<span class="ag-row__meta">${E(e.reason)}</span>`}</div>
  <div class="ag-row__end"><label class="ag-field ag-field--inline agu-mlist__open"><input type="checkbox" role="switch" data-mlist-open="${E(l.id)}" data-entry="${E(e.id)}"${e.open?' checked':''}${e.canOpen?'':' disabled'} aria-label="Open ${E(e.name)} to this list's players"> ${e.open?'Open':'Closed'}</label></div></li>`).join('');
 const stores=states.length?fold({key:`mlist-stores:${l.id}`,title:'Stores',count:states.length,body:`<ul class="ag-rows">${items}</ul>`}):'<p class="ag-field__hint">No shops or services yet. Edit the list to add some.</p>';
 return `<article class="ag-card ag-card--compact agu-mlist" data-mlist="${E(l.id)}"><div class="ag-card__head"><h3 class="ag-card__title">${E(l.name)}</h3><span class="ag-card__meta">${E([city,`${states.length} ${states.length===1?'entry':'entries'}`].filter(Boolean).join(' · '))}</span></div>
 <div class="agu-line agu-mlist__share"><span>Shared with: ${shareBadge(l.audience)}</span>${states.length?`<span class="ag-toolbar__count">${E(`${openN} of ${states.length} open`)}</span>`:''}</div>
 ${stores}
 <div class="ag-card__actions">${button('mlist-share','Share…',{kind:'sm',ic:'fa-share-nodes',attrs:`data-mlist-id="${E(l.id)}" aria-label="Choose who sees ${E(l.name)}"`})}${states.length?`${button('mlist-open-all','Open all',{kind:'sm',ic:'fa-door-open',disabled:hidden||!canN||openN===canN,attrs:`data-mlist-id="${E(l.id)}" aria-label="Open every store on ${E(l.name)}"`})}${button('mlist-close-all','Close all…',{kind:'sm',ic:'fa-door-closed',disabled:!states.some(s=>s.presented),attrs:`data-mlist-id="${E(l.id)}" aria-label="Close every store on ${E(l.name)}"`})}`:''}${button('mlist-edit','Edit',{kind:'sm',ic:'fa-pen',attrs:`data-mlist-id="${E(l.id)}" aria-label="Edit ${E(l.name)}"`})}${button('mlist-delete','Delete…',{kind:'sm danger',ic:'fa-trash',attrs:`data-mlist-id="${E(l.id)}" aria-label="Delete ${E(l.name)}"`})}</div></article>`;
}
function editorHTML(d,index,locations){
 const opt=(v,label,sel)=>`<option value="${E(v)}"${String(v)===String(sel)?' selected':''}>${E(label)}</option>`;
 // 0.26.0: the same Settlement select as the shop editor (Locations' settlements only).
 const city=settlementSelect(d,{attr:'data-mlist-field',hint:'Optional. Players see its name only once it is revealed in Locations.'})??'';
 const rows=d.shopIds.map((id,i)=>{const e=index.get(id)??{name:id,what:'Missing (deleted)'};
  return `<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${E(e.name)}</span><span class="ag-row__meta">${E(e.what)}</span></div><div class="ag-row__end">
  ${button('mlist-up','',{kind:'icon sm',ic:'fa-arrow-up',disabled:i===0,attrs:`data-index="${i}" aria-label="Move ${E(e.name)} up" ${tip('Move up')}`})}${button('mlist-down','',{kind:'icon sm',ic:'fa-arrow-down',disabled:i===d.shopIds.length-1,attrs:`data-index="${i}" aria-label="Move ${E(e.name)} down" ${tip('Move down')}`})}${button('mlist-remove','',{kind:'icon sm danger',ic:'fa-xmark',attrs:`data-index="${i}" aria-label="Take ${E(e.name)} off the list" ${tip('Take off the list')}`})}</div></li>`;}).join('');
 const left=[...index.values()].filter(e=>!d.shopIds.includes(e.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const saved=d.id?lists().find(l=>l.id===d.id)??null:null;
 const back=button('mlist-back','All merchant lists',{kind:'ghost sm',ic:'fa-arrow-left',attrs:'aria-label="Back to all merchant lists"'});
 const share=saved?`<span class="agu-now-group"><span class="ag-badge ag-badge--warn agu-now" ${tip('Sharing changes the saved list now; it does not wait for Save Changes')}>${icon('fa-bolt')} Applies now</span>${shareBadge(saved.audience)}${button('mlist-share','Share…',{kind:'sm',ic:'fa-share-nodes',attrs:`data-mlist-id="${E(saved.id)}" aria-label="Choose who sees ${E(saved.name)}"`})}</span>`:'';
 return `<div class="agu-shop-editor"><div class="agu-shop-editor__head">${back}<h2>${E(d.id?d.name||'Unnamed list':'New merchant list')}</h2>${d.id?`<code>${E(d.id)}</code>`:''}${share}</div>
 <div class="ag-form-grid"><label class="ag-field">List name<input type="text" maxlength="${MLIST_NAME_MAX}" data-mlist-field="name" value="${E(d.name)}" required><span class="ag-field__hint">Required. Players see it.</span></label>${city}</div>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Shops and services · ${d.shopIds.length}</h3></div>
 ${d.shopIds.length?`<ul class="ag-rows">${rows}</ul>`:'<p class="ag-field__hint">Nothing on this list yet. Add saved shops and services below; players see them in this order.</p>'}
 ${left.length?`<div class="ag-toolbar"><label class="ag-field ag-field--inline agu-mlist-add">Add<select data-mlist-add>${left.map(e=>opt(e.id,`${e.name} (${e.what})`,'')).join('')}</select></label><div class="ag-toolbar__end">${button('mlist-add','Add to list',{kind:'sm',ic:'fa-plus'})}</div></div>`:'<p class="ag-field__hint">Every saved shop and service is on this list.</p>'}</section>
 ${saved?`<section class="ag-section agu-danger-zone"><div class="ag-section__head"><h3 class="ag-section__title">Danger zone</h3></div><p class="ag-field__hint">Deleting removes the list; its shops and services are not changed. Its id is never reused.</p>${button('mlist-delete','Delete list…',{kind:'danger',ic:'fa-trash',attrs:`data-mlist-id="${E(saved.id)}"`})}</section>`:''}</div>`;
}
export function listsView(app){
 const all=lists(),index=entryIndex(),locations=locationMap();
 if(app.listDraft)return editorHTML(app.listDraft,index,locations);
 const toolbar=`<div class="ag-toolbar"><span class="ag-toolbar__count">${all.length} ${all.length===1?'list':'lists'}</span><div class="ag-toolbar__end">${button('mlist-new','New merchant list',{ic:'fa-plus'})}</div></div>`;
 if(!all.length)return toolbar+emptyState('No merchant lists yet','Group the shops and services of a settlement, a faction or anything else with New merchant list, then Share it with the party or chosen players and open its stores.',{icon:'fa-list',action:button('mlist-new','New merchant list',{kind:'sm',ic:'fa-plus'})});
 return toolbar+`<div class="ag-card-grid">${all.map(l=>card(l,index,locations)).join('')}</div>`;
}
export function listsFooter(app){
 if(!isGM()||!app.listDraft)return null;
 return `<footer class="ag-footer agu-footer">${button('mlist-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-mlist-status>${E(app.listStatus??'')}</span>${button('mlist-save','Save Changes',{kind:'primary'})}</footer>`;
}
const dirty=(app,root)=>{app.listDirty=true;app.listStatus='Unsaved changes';const st=root?.querySelector?.('[data-mlist-status]');if(st)st.textContent=app.listStatus;};
export function bindLists(app,root,{error,render}){
 if(app.tab!=='shops'||app.shopSub!=='lists'||!isGM())return;
 for(const el of root.querySelectorAll('[data-mlist-open]'))el.addEventListener('change',async()=>{
  // 0.26.0: closing a store that is also shown to players outside this list asks first (it closes for them too).
  if(!el.checked){const fx=closeEffects(el.dataset.mlistOpen,el.dataset.entry);
   if(fx.length&&!(await confirmDanger(`${effectsText(fx)}. Closing stops showing it to every player, there too.`,{title:`Close ${fx[0].name} for every player?`,yes:'Close store'}))){el.checked=true;return;}}
  el.disabled=true;
  setOpen(el.dataset.mlistOpen,el.dataset.entry,el.checked).then(st=>{ui.notifications?.info(st.open?`${st.name} is open to this list's players.`:`${st.name} is closed (no longer shown to players).`);return render();}).catch(e=>{error(e);render();});
 });
 const d=app.listDraft;if(!d)return;
 for(const el of root.querySelectorAll('[data-mlist-field]'))el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const f=el.dataset.mlistField;d[f]=f==='locationId'?(el.value||null):el.value;dirty(app,root);});
}
const discardOk=async app=>!app.listDirty||confirmDanger('Your changes to this merchant list are not saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing'});
const openDraft=(app,l)=>{app.listDraft=l?{id:l.id,name:l.name,locationId:l.locationId,shopIds:[...l.shopIds]}:{id:null,name:'',locationId:null,shopIds:[]};app.listDirty=false;app.listStatus='';};
/** Share…: Hidden, Whole party, or Chosen players (ticked). */
async function shareDialog(l){
 const pl=players();
 const form=await formDialog(`Share ${l.name}`,[
  {name:'mode',label:'Players who see this list',type:'select',value:l.audience.mode,options:[{value:'hidden',label:'Nobody (hidden)'},{value:'party',label:'Whole party (also players who log in later)'},...(pl.length?[{value:'users',label:'Chosen players (tick them below)'}]:[])]},
  ...(pl.length?[{name:'users',label:'Chosen players',type:'checklist',options:pl.map(u=>({value:u.id,label:u.name,checked:l.audience.userIds.includes(u.id)})),hint:'Only these players see the list, and Open shows its stores to them.'}]:[])
 ],{ok:'Save sharing'});
 if(!form)return null;
 return setAudience(l.id,{mode:form.mode,userIds:[].concat(form.users??[])});
}
/** Merchant list actions. Returns false when the action isn't one of these. */
export async function handleLists(app,action,b,{render,root}){
 if(!action.startsWith('mlist-'))return false;
 gmOnly();
 const d=app.listDraft,i=Number(b.dataset.index);
 switch(action){
  case 'mlist-new':if(!await discardOk(app))return true;openDraft(app,null);break;
  case 'mlist-edit':if(!await discardOk(app))return true;openDraft(app,mustGetList(b.dataset.mlistId));break;
  case 'mlist-add':{const v=root?.querySelector?.('[data-mlist-add]')?.value;if(!d||!v||d.shopIds.includes(v))return true;d.shopIds=[...d.shopIds,v];dirty(app);break;}
  case 'mlist-up':case 'mlist-down':{if(!d)return true;const j=action==='mlist-up'?i-1:i+1;if(j<0||j>=d.shopIds.length)return true;const ids=[...d.shopIds];[ids[i],ids[j]]=[ids[j],ids[i]];d.shopIds=ids;dirty(app);break;}
  case 'mlist-remove':if(!d)return true;d.shopIds=d.shopIds.filter((_,n)=>n!==i);dirty(app);break;
  case 'mlist-back':case 'mlist-cancel':if(!await discardOk(app))return true;app.listDraft=null;app.listDirty=false;app.listStatus='';break;
  case 'mlist-share':{const l=await shareDialog(mustGetList(b.dataset.mlistId));if(!l)return true;ui.notifications?.info(`${l.name}: ${audienceText(l.audience,userName)}.`);break;}
  case 'mlist-open-all':case 'mlist-close-all':{
   const l=mustGetList(b.dataset.mlistId),open=action==='mlist-open-all';
   // 0.26.0: Close all stops showing every store on the list to every player, so it asks first and names the side effects.
   if(!open){
    const shown=l.shopIds.filter(id=>entryState(l,id).presented),fx=closeEffects(l.id,shown);
    if(!shown.length)return true;
    const n=`${shown.length} ${shown.length===1?'store':'stores'}`;
    if(!await confirmDanger(`Players can no longer buy, sell or use ${shown.length===1?'it':'them'} until you open ${shown.length===1?'it':'them'} again.${fx.length?` This also closes them for players outside this list: ${effectsText(fx)}.`:''}`,{title:`Close ${n} for every player?`,yes:`Close ${n}`}))return true;
   }
   const r=await setAllOpen(l.id,open);
   ui.notifications?.info(`${l.name}: ${r.changed.length} ${r.changed.length===1?'store':'stores'} ${open?'opened':'closed'}.`);
   if(r.skipped.length)ui.notifications?.warn(`Not opened: ${r.skipped.map(x=>`${x.id} (${x.reason})`).join(', ')}.`);
   break;
  }
  case 'mlist-save':{if(!d)return true;const l=await save({id:d.id??undefined,name:d.name,locationId:d.locationId,shopIds:d.shopIds});app.listDraft=null;app.listDirty=false;app.listStatus='';ui.notifications?.info(`Saved ${l.name}.`);break;}
  case 'mlist-delete':{
   const l=mustGetList(b.dataset.mlistId);
   if(!await confirmDanger(`Delete the merchant list ${l.name}? Players can no longer browse it. Its shops and services are not changed.`,{title:`Delete ${l.name}?`,yes:'Delete list'}))return true;
   await remove(l.id,{confirm:true});if(app.listDraft?.id===l.id)app.listDraft=null;ui.notifications?.info(`Deleted ${l.name}.`);break;
  }
  default:return false;
 }
 await render();return true;
}
