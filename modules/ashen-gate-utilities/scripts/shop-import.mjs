/* ---- 0.21.0: import and export of shops, services and merchant lists (design §8, brief 6). Records come in an
   ag-foundry-import/0.2 package (entity_type Shop, Service, MerchantList), from General Manager or from Shops → Import
   JSON. Lines name an item by its permanent id (flags.ashen-gate-manager.source.sourceId on a world Item), then by
   item_uuid; a line whose item isn't found is skipped and reported, the rest of the shop imports. Import writes
   definitions only (core planShopImport): never who a shop is shown to, stock left, the shop purse now or the sales
   log. Every call is GM only. ---- */
import {ID,escapeHTML as E,shopImportRecords,importItemRefs,planShopImport,exportShopsPackage,normalizeMerchantList} from './core.mjs';
import {readAll,readServices,readMeta,writeShop,writeService,writeMeta,queueShops,randomId,icon,button} from './shops.mjs';
import {syncPlayerView} from './shop-buy.mjs';
import {bundleOf} from './ag-item-drop.mjs';

const isGM=()=>Boolean(game.user?.isGM);
const gmOnly=()=>{if(!isGM())throw Error('GM only.');};
const electrum=()=>game.settings.get(ID,'electrumEnabled')===true;
const clone=v=>structuredClone(v);
const sourceIdOf=item=>item?.flags?.['ashen-gate-manager']?.source?.sourceId??item?.getFlag?.('ashen-gate-manager','source')?.sourceId??null;

/** Looks up every item the lines name: `id:` among world Items by permanent id, `uuid:` with fromUuid. Missing ones are left out. */
export async function resolveItems(keys){
 const out=new Map(),bySource=new Map();
 // Indexed once: a trainer file names 100+ items and a world can hold thousands.
 for(const i of game.items??[]){const sid=sourceIdOf(i);if(sid&&!bySource.has(sid))bySource.set(sid,i);}
 for(const key of keys){
  let item=null;
  if(key.startsWith('id:')){const id=key.slice(3);item=bySource.get(id)??null;}
  else{try{item=await fromUuid(key.slice(5));}catch{item=null;}if(item&&item.documentName!=='Item')item=null;}
  if(!item)continue;
  const contents=(await bundleOf(item)).slice(1);
  out.set(key,{data:item.toObject(),contents:contents.map(c=>c.toObject()),uuid:item.uuid??null});
 }
 return out;
}
const world=()=>({shops:readAll(),services:readServices(),lists:readMeta().lists,retiredIds:readMeta().retiredIds});
async function plan(input,mode){
 const {records,ignored}=shopImportRecords(input);
 const items=await resolveItems(importItemRefs(records));
 return {records,ignored,items,...planShopImport(records,{mode,...world(),items,electrum:electrum(),randomId,now:Date.now(),userId:game.user?.id??null})};
}
/** What an import would do, record by record. Nothing is written. */
export async function previewShops(input,{mode='create'}={}){gmOnly();const p=await plan(input,mode);return {results:p.results,ignored:p.ignored};}
/**
 * Imports Shop, Service and MerchantList records (a package or a list of records). mode 'create' (default) keeps an
 * existing id as it is; 'update' replaces name, merchant, flavour and lines (GM-added lines, stock left, the shop
 * purse now and who it is shown to stay). Returns [{id, type, name, result, reason?, lines?, notes}] per record.
 */
export async function importShops(input,{mode='create'}={}){
 gmOnly();
 const {records,ignored}=shopImportRecords(input);
 const items=await resolveItems(importItemRefs(records));
 const results=await queueShops(async()=>{
  const now=Date.now(),{results,writes}=planShopImport(records,{mode,...world(),items,electrum:electrum(),randomId,now,userId:game.user?.id??null});
  const had=new Set(readAll().map(s=>s.id));
  for(const s of writes.services)await writeService(s);
  for(const s of writes.shops)await writeShop(s,had.has(s.id)?{}:{log:[]});
  if(writes.lists.length){
   const meta=readMeta(),byId=new Map(writes.lists.map(l=>[l.id,l]));
   meta.lists=[...meta.lists.map(l=>byId.get(l.id)??l),...writes.lists.filter(l=>!meta.lists.some(x=>x.id===l.id))].map(l=>normalizeMerchantList(l));
   await writeMeta(meta);
  }
  return results;
 });
 if(results.some(r=>r.result==='created'||r.result==='updated'))await syncPlayerView().catch(e=>console.warn(`${ID} | Could not update the shop player view`,e));
 return Object.assign(clone(results),{ignored});
}
/** Every shop, service and merchant list (or only `ids`) as an ag-foundry-import/0.2 package importShops reads back. */
export function exportShops(ids){gmOnly();return exportWithNotes(ids).package;}
function exportWithNotes(ids){
 const only=ids?new Set([].concat(ids)):null,pick=x=>!only||only.has(x.id);
 return exportShopsPackage({shops:readAll().filter(pick),services:readServices().filter(pick),lists:readMeta().lists.filter(pick)});
}
export const importApi=()=>({importShops,exportShops,previewImport:previewShops});

/* ---------- Shops tab: Import JSON preview and Export ---------- */
const BADGES={created:['ag-badge--ok','fa-plus','Create'],updated:['ag-badge--accent','fa-rotate','Update'],kept:['','fa-lock','Kept'],skipped:['ag-badge--danger','fa-ban','Skipped']};
const TYPE_LABEL={Shop:'Shop',Service:'Service',MerchantList:'Merchant list'};
const countOf=results=>results.filter(r=>r.result==='created'||r.result==='updated').length;
function row(r){
 const [tone,ic,label]=BADGES[r.result]??BADGES.skipped;
 const skipped=r.lines?.skipped??[];
 // A trainer shop can have a dozen unresolved lines: more than three fold into one "not found" disclosure instead of a dozen rows of text.
 const long=skipped.length>3,why=[r.reason,...(long?[]:skipped.map(s=>`Line ${s.ref}: ${s.reason}`)),...(r.notes??[])].filter(Boolean);
 const fold=long?`<details class="ag-row__meta agu-import-skipped"><summary>${skipped.length} items not found in this world</summary><ul>${skipped.map(s=>`<li>${E(s.ref)}</li>`).join('')}</ul></details>`:'';
 const lines=r.lines?`${r.lines.imported} ${r.lines.imported===1?'item':'items'}${r.lines.skipped.length?`, ${r.lines.skipped.length} not found`:''}`:'';
 return `<li class="ag-row"><div class="ag-row__main"><span class="ag-row__title">${E(r.name||r.id)}</span><span class="ag-row__meta">${E([TYPE_LABEL[r.type]??'Record',lines].filter(Boolean).join(' · '))}</span>
 ${why.map(w=>`<span class="ag-row__meta">${E(w)}</span>`).join('')}${fold}</div><div class="ag-row__end"><span class="${['ag-badge',tone].filter(Boolean).join(' ')}">${icon(ic)} ${label}</span>${r.lines?.skipped.length&&r.result!=='skipped'?`<span class="ag-badge ag-badge--warn">${icon('fa-triangle-exclamation')} ${r.lines.skipped.length} ${r.lines.skipped.length===1?'line':'lines'} skipped</span>`:''}</div></li>`;
}
/** The preview pane shown in place of the Shops list while a file is open. */
export function importView(app){
 const st=app.shopImport,res=st.results??[];
 const ignored=st.ignored?`<p class="ag-notice ag-notice--info">${icon('fa-circle-info')}<span>${st.ignored} other ${st.ignored===1?'record in this file (an Item or another type) is':'records in this file (Items and other types) are'} not read here. Import the whole file with General Manager to create its Items first.</span></p>`:'';
 const missing=res.reduce((n,r)=>n+(r.lines?.skipped.length??0),0);
 const absent=missing?`<p class="ag-notice ag-notice--warn">${icon('fa-triangle-exclamation')}<span>${missing} ${missing===1?'item line names an item':'item lines name items'} that ${missing===1?"isn't":"aren't"} in this world yet, so ${missing===1?'it is':'they are'} skipped. Import the file's Items (and the crafting packs they need) with General Manager first, then import this file again with <em>Update shops that already exist</em> on.</span></p>`:'';
 const none=!res.length?`<div class="ag-empty">${icon('fa-file-import')}<p class="ag-empty__title">No shops in this file</p><p class="ag-empty__text">The file has no Shop, Service or MerchantList records.</p></div>`:'';
 return `<section class="ag-section agu-shop-import" aria-label="Import preview"><div class="ag-section__head"><h3 class="ag-section__title">Import ${E(st.fileName||'file')}</h3></div>
 ${ignored}${absent}
 <label class="ag-field ag-field--inline"><input type="checkbox" role="switch" data-shop-import-mode${st.mode==='update'?' checked':''}> Update shops that already exist</label>
 <p class="ag-field__hint">${st.mode==='update'?'Name, merchant, flavour and items come from the file. Items you added by hand, stock left, the merchant\'s coins now and who it is shown to stay as they are.':'Shops, services and lists already in this world are kept as they are.'} Imported merchant lists start hidden.</p>
 ${none}${res.length?`<ul class="ag-rows">${res.map(row).join('')}</ul>`:''}</section>`;
}
export function importFooter(app){
 const n=countOf(app.shopImport?.results??[]);
 return `<footer class="ag-footer agu-footer">${button('shop-import-cancel','Cancel',{kind:'ghost'})}<span class="ag-footer__status" role="status">${E(app.shopImport?.busy?'Working…':'')}</span>${button('shop-import-apply',`Import ${n}`,{kind:'primary',ic:'fa-file-import',disabled:!n||app.shopImport?.busy})}</footer>`;
}
/** Reads the picked file and opens the preview. */
export async function openImportFile(app,file){
 gmOnly();if(!file)return;
 let data;try{data=JSON.parse(await file.text());}catch{throw Error('Import failed: the file is not JSON.');}
 const p=await previewShops(data,{mode:'create'});
 app.shopImport={fileName:file.name??'',data,mode:'create',...p};app.shopSub='list';
}
async function download(pkg){
 const text=JSON.stringify(pkg,null,2),name='ashen-gate-shops.json';
 const save=globalThis.foundry?.utils?.saveDataToFile??globalThis.saveDataToFile;
 if(typeof save==='function')return save(text,'application/json',name);
 const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([text],{type:'application/json'})),download:name});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/** Import / Export actions on the Shops tab. Returns false when the action isn't one of these. */
export async function handleImport(app,action,{render,root}){
 switch(action){
  case 'shop-import':root?.querySelector?.('#agu-shop-import-file')?.click();return true;
  case 'shop-export':{
   gmOnly();const {package:pkg,notes}=exportWithNotes();
   if(!pkg.records.length){ui.notifications?.warn('No shops, services or merchant lists to export.');return true;}
   await download(pkg);
   ui.notifications?.info(`Exported ${pkg.records.length} ${pkg.records.length===1?'record':'records'}.`);
   if(notes.length)ui.notifications?.warn(`Left out: ${notes.join(' ')}`);
   return true;
  }
  case 'shop-import-cancel':app.shopImport=null;await render();return true;
  case 'shop-import-apply':{
   const st=app.shopImport;if(!st||st.busy)return true;
   st.busy=true;await render();
   try{
    const r=await importShops(st.data,{mode:st.mode});
    const n=k=>r.filter(x=>x.result===k).length,lines=r.reduce((t,x)=>t+(x.lines?.skipped.length??0),0);
    ui.notifications?.info(`Imported: ${n('created')} created, ${n('updated')} updated, ${n('kept')} kept, ${n('skipped')} skipped.${lines?` ${lines} ${lines===1?'line':'lines'} skipped (item not found).`:''}`);
    const bad=r.filter(x=>x.result==='skipped');
    if(bad.length)ui.notifications?.warn(`Skipped: ${bad.map(x=>`${x.id} (${x.reason})`).join('; ')}`);
    app.shopImport=null;
   }finally{if(app.shopImport)app.shopImport.busy=false;}
   await render();return true;
  }
  default:return false;
 }
}
export function bindImport(app,root,{error,render}){
 root.querySelector?.('#agu-shop-import-file')?.addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';openImportFile(app,f).then(()=>render()).catch(error);});
 root.querySelector?.('[data-shop-import-mode]')?.addEventListener('change',e=>{
  const st=app.shopImport;if(!st)return;st.mode=e.target.checked?'update':'create';
  previewShops(st.data,{mode:st.mode}).then(p=>{Object.assign(st,p);return render();}).catch(error);
 });
}
