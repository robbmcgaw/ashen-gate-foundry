/* ---- 0.20.0: merchant lists (design §3 Merchant list, brief 5). A named, ordered list of shops and services, usually
   one city, stored on the GM Data journal's lists page (meta.lists). The GM switches a list on to let every player
   browse it read only: shop-buy.mjs writes it to the Player View journal as one page all players can read. A list never
   lets anyone buy, sell or use a service; that still needs the GM to present the entry. Every call is GM only. ---- */
import {escapeHTML as E,normalizeMerchantList,shopIdFromName,validId,MLIST_NAME_MAX,shopPlace} from './core.mjs';
import {readAll,readServices,readMeta,writeMeta,queueShops,locationsApi,locationMap,icon,button,tip,shownBadge} from './shops.mjs';
import {syncPlayerView} from './shop-buy.mjs';
import {servicesAll,typeLabel} from './services.mjs';
import {confirmDialog} from './ag-dialogs.mjs';

const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const clone=v=>structuredClone(v);
const stamp=()=>({updatedAt:Date.now(),updatedBy:game.user?.id??null});
const lists=()=>readMeta().lists.map(l=>{try{return normalizeMerchantList(l);}catch{return null;}}).filter(Boolean);
const mustGetList=id=>{const l=lists().find(x=>x.id===id);if(!l)throw Error('That merchant list no longer exists.');return l;};

/* ---------- API (GM only) ---------- */
function list(){gmOnly();return lists().map(clone);}
function get(id){gmOnly();const l=lists().find(x=>x.id===id);return l?clone(l):null;}
/** Creates (no id) or updates a list. A new list is hidden unless `visible: true`. Writes the player view after. */
async function save(data={}){
 gmOnly();
 const saved=await queueShops(async()=>{
  const meta=readMeta(),old=data.id?meta.lists.find(l=>l.id===data.id):null;
  let id=data.id;
  if(!old){
   const taken=[...readAll().map(s=>s.id),...readServices().map(s=>s.id),...meta.lists.map(l=>l.id)];
   if(id){if(!validId(id,'MLIST'))throw Error('Merchant list id must be MLIST- and upper-case letters, digits and single hyphens.');if(taken.includes(id)||meta.retiredIds.includes(id))throw Error(`The merchant list id ${id} is already used.`);}
   else id=shopIdFromName(data.name,taken,'MLIST',meta.retiredIds);
  }
  const now=Date.now(),rec=normalizeMerchantList({...data,id,visible:data.visible===undefined?old?.visible===true:data.visible===true,createdAt:old?.createdAt??now,...stamp()});
  meta.lists=old?meta.lists.map(l=>l.id===id?rec:l):[...meta.lists,rec];
  await writeMeta(meta);return rec;
 });
 await syncPlayerView();return clone(saved);
}
async function setVisible(id,visible){
 gmOnly();
 if(typeof visible!=='boolean')throw TypeError('Boolean required.');
 const saved=await queueShops(async()=>{const meta=readMeta(),old=mustGetList(id),rec=normalizeMerchantList({...old,visible,...stamp()});meta.lists=meta.lists.map(l=>l.id===id?rec:l);await writeMeta(meta);return rec;});
 await syncPlayerView();return clone(saved);
}
/** Needs {confirm: true}. Its shops and services are not touched. The id is retired, never reused. */
async function remove(id,{confirm=false}={}){
 gmOnly();
 if(confirm!==true)throw Error('Deleting a merchant list needs {confirm: true}.');
 const gone=await queueShops(async()=>{const meta=readMeta(),old=mustGetList(id);meta.lists=meta.lists.filter(l=>l.id!==id);if(!meta.retiredIds.includes(id))meta.retiredIds.push(id);await writeMeta(meta);return {id,name:old.name};});
 await syncPlayerView();return gone;
}
export function merchantsApi(){return {list,get,save,setVisible,delete:remove};}

/* ---------- GM sub-tab: Merchant lists ---------- */
/** Saved shops and services by id, with what a list shows about each. */
function entryIndex(){
 const m=new Map();
 for(const s of readAll())m.set(s.id,{id:s.id,name:s.name,what:`Shop · ${(s.lines??[]).length} ${(s.lines??[]).length===1?'item':'items'}`,rec:s});
 for(const s of servicesAll())m.set(s.id,{id:s.id,name:s.name,what:s.known?typeLabel(s.service?.type):`${typeLabel(s.service?.type)}: not shown to players`,rec:s,unknown:!s.known});
 return m;
}
const cityName=(id,locations)=>id?shopPlace({locationId:id},locations).place:'';
function card(l,index,locations){
 const city=cityName(l.locationId,locations),entries=l.shopIds.map(id=>index.get(id)??{id,name:id,what:'Missing (deleted)',missing:true});
 const items=entries.map(e=>`<li>${E(e.name)} <span class="agu-note">${E(e.what)}</span>${e.rec?shownBadge(e.rec):''}</li>`).join('');
 return `<article class="ag-card agu-mlist" data-mlist="${E(l.id)}"><div class="ag-card__head"><h3 class="ag-card__title">${E(l.name)}</h3><span class="ag-card__meta">${E([city,`${entries.length} ${entries.length===1?'entry':'entries'}`].filter(Boolean).join(' · '))}</span></div>
 <p>${l.visible?`<span class="ag-badge ag-badge--ok">${icon('fa-eye')} Players can browse</span>`:`<span class="ag-badge">${icon('fa-eye-slash')} Hidden</span>`}</p>
 ${entries.length?`<ol class="ag-list">${items}</ol>`:'<p class="ag-field__hint">No shops or services yet. Edit the list to add some.</p>'}
 <label class="ag-field ag-field--inline"><input type="checkbox" role="switch" data-mlist-visible="${E(l.id)}"${l.visible?' checked':''}> Show to players (read only)</label>
 <div class="ag-card__actions">${button('mlist-edit','Edit',{kind:'sm',ic:'fa-pen',attrs:`data-mlist-id="${E(l.id)}" aria-label="Edit ${E(l.name)}"`})}${button('mlist-delete','Delete',{kind:'sm danger',ic:'fa-trash',attrs:`data-mlist-id="${E(l.id)}" aria-label="Delete ${E(l.name)}"`})}</div></article>`;
}
function editorHTML(d,index,locations){
 const loc=locationsApi(),locs=loc?[...locations.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name))):[];
 const opt=(v,label,sel)=>`<option value="${E(v)}"${String(v)===String(sel)?' selected':''}>${E(label)}</option>`;
 const city=loc?`<label class="ag-field">City<select data-mlist-field="locationId"><option value="">None</option>${locs.map(l=>opt(l.id,l.name,d.locationId)).join('')}${d.locationId&&!locs.some(l=>l.id===d.locationId)?opt(d.locationId,d.locationId,d.locationId):''}</select><span class="ag-field__hint">Players see the city's name only once it is revealed in Locations.</span></label>`:'';
 const rows=d.shopIds.map((id,i)=>{const e=index.get(id)??{name:id,what:'Missing (deleted)'};
  return `<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${E(e.name)}</span><span class="ag-row__meta">${E(e.what)}</span></div><div class="ag-row__end">
  ${button('mlist-up','',{kind:'icon sm',ic:'fa-arrow-up',disabled:i===0,attrs:`data-index="${i}" aria-label="Move ${E(e.name)} up" ${tip('Move up')}`})}${button('mlist-down','',{kind:'icon sm',ic:'fa-arrow-down',disabled:i===d.shopIds.length-1,attrs:`data-index="${i}" aria-label="Move ${E(e.name)} down" ${tip('Move down')}`})}${button('mlist-remove','',{kind:'icon sm danger',ic:'fa-xmark',attrs:`data-index="${i}" aria-label="Take ${E(e.name)} off the list" ${tip('Take off the list')}`})}</div></li>`;}).join('');
 const left=[...index.values()].filter(e=>!d.shopIds.includes(e.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 return `<div class="agu-shop-editor"><div class="agu-shop-editor__head"><h2>${E(d.id?d.name||'Unnamed list':'New merchant list')}</h2>${d.id?`<code>${E(d.id)}</code>`:''}</div>
 <div class="ag-form-grid"><label class="ag-field">List name<input type="text" maxlength="${MLIST_NAME_MAX}" data-mlist-field="name" value="${E(d.name)}" required><span class="ag-field__hint">Required. Players see it.</span></label>${city}</div>
 <section class="ag-section"><div class="ag-section__head"><h3 class="ag-section__title">Shops and services · ${d.shopIds.length}</h3></div>
 ${d.shopIds.length?`<ul class="ag-rows">${rows}</ul>`:'<p class="ag-field__hint">Nothing on this list yet. Add saved shops and services below; players see them in this order.</p>'}
 ${left.length?`<div class="ag-toolbar"><select data-mlist-add aria-label="Shop or service to add">${left.map(e=>opt(e.id,`${e.name} (${e.what})`,'')).join('')}</select><div class="ag-toolbar__end">${button('mlist-add','Add to list',{kind:'sm',ic:'fa-plus'})}</div></div>`:'<p class="ag-field__hint">Every saved shop and service is on this list.</p>'}</section></div>`;
}
export function listsView(app){
 const all=lists(),index=entryIndex(),locations=locationMap();
 if(app.listDraft)return editorHTML(app.listDraft,index,locations);
 const toolbar=`<div class="ag-toolbar"><span class="ag-toolbar__count">${all.length} ${all.length===1?'list':'lists'}</span><div class="ag-toolbar__end">${button('mlist-new','New merchant list',{ic:'fa-plus'})}</div></div>`;
 if(!all.length)return toolbar+`<div class="ag-empty">${icon('fa-list')}<p class="ag-empty__title">No merchant lists yet</p><p class="ag-empty__text">Group a city's shops and services with New merchant list, then switch on Show to players to let them browse it.</p>${button('mlist-new','New merchant list',{kind:'sm',ic:'fa-plus'})}</div>`;
 return toolbar+`<div class="ag-card-grid">${all.map(l=>card(l,index,locations)).join('')}</div>`;
}
export function listsFooter(app){
 if(!isGM()||app.shopSub!=='lists'||!app.listDraft)return null;
 return `<footer class="ag-footer agu-footer">${button('mlist-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status" data-mlist-status>${E(app.listStatus??'')}</span>${button('mlist-save','Save Changes',{kind:'primary'})}</footer>`;
}
const dirty=(app,root)=>{app.listDirty=true;app.listStatus='Unsaved changes';const st=root?.querySelector?.('[data-mlist-status]');if(st)st.textContent=app.listStatus;};
export function bindLists(app,root,{error,render}){
 if(app.tab!=='shops'||app.shopSub!=='lists'||!isGM())return;
 for(const el of root.querySelectorAll('[data-mlist-visible]'))el.addEventListener('change',()=>{
  setVisible(el.dataset.mlistVisible,el.checked).then(l=>{ui.notifications?.info(l.visible?`Players can browse ${l.name} (read only).`:`${l.name} is hidden from players.`);return render();}).catch(e=>{error(e);render();});
 });
 const d=app.listDraft;if(!d)return;
 for(const el of root.querySelectorAll('[data-mlist-field]'))el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{const f=el.dataset.mlistField;d[f]=f==='locationId'?(el.value||null):el.value;dirty(app,root);});
}
const discardOk=async app=>!app.listDirty||confirmDialog('Your changes to this merchant list are not saved. Discard them?',{title:'Discard unsaved changes?',yes:'Discard changes',no:'Keep editing',danger:true});
const openDraft=(app,l)=>{app.listDraft=l?{id:l.id,name:l.name,locationId:l.locationId,shopIds:[...l.shopIds],visible:l.visible}:{id:null,name:'',locationId:null,shopIds:[],visible:false};app.listDirty=false;app.listStatus='';};
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
  case 'mlist-cancel':if(!await discardOk(app))return true;app.listDraft=null;app.listDirty=false;app.listStatus='';break;
  case 'mlist-save':{if(!d)return true;const l=await save({id:d.id??undefined,name:d.name,locationId:d.locationId,shopIds:d.shopIds,visible:d.visible});app.listDraft=null;app.listDirty=false;app.listStatus='';ui.notifications?.info(`Saved ${l.name}.`);break;}
  case 'mlist-delete':{
   const l=mustGetList(b.dataset.mlistId);
   if(!await confirmDialog(`Delete the merchant list ${l.name}? Players can no longer browse it. Its shops and services are not changed.`,{title:'Delete this merchant list?',yes:'Delete list',danger:true}))return true;
   await remove(l.id,{confirm:true});if(app.listDraft?.id===l.id)app.listDraft=null;ui.notifications?.info(`Deleted ${l.name}.`);break;
  }
  default:return false;
 }
 await render();return true;
}
