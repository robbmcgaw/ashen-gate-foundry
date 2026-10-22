/* ---- 0.27.0 (UT-31): keyboard and click alternatives to drag and drop. Each picker only chooses what a drop would
   carry and resolves that drop data ({type, uuid}), or null on Cancel. The caller hands it to the very function its
   drop zone calls (stashListDrop, dropIntoDraft, dropMerchant), so the rules, permissions and messages stay the
   drop's own; nothing here moves, copies or saves anything. ---- */
import {isLevelBackup} from './core.mjs';
import {formDialog} from './ag-dialogs.mjs';

const byName=(a,b)=>String(a?.name??'').localeCompare(String(b?.name??''));
const typeLabel=t=>{const l=globalThis.CONFIG?.Item?.typeLabels?.[t];return l?globalThis.game?.i18n?.localize?.(l)??l:t||'Item';};
const listOf=c=>[...(c?.contents??c??[])];

/** How many Items sit inside `item`, at any depth (dnd5e keeps a container's contents as Items pointing at it). */
function insideCount(item,all){
 const seen=new Set([item.id]);let n=0;
 for(let grew=true;grew;){grew=false;for(const c of all)if(!seen.has(c.id)&&seen.has(c.system?.container)){seen.add(c.id);n++;grew=true;}}
 return n;
}
/**
 * One option per Item, A–Z: "Rope ×2 · Loot", with "· in Backpack" for an item inside a container and
 * "· with 3 inside" for a container (it brings them, as a drop does). The value is the Item's uuid.
 */
export function itemChoices(items){
 const all=listOf(items).filter(i=>i?.uuid);
 const byId=new Map(all.map(i=>[i.id,i]));
 return [...all].sort(byName).map(i=>{
  const q=Number(i.system?.quantity)||1,box=byId.get(i.system?.container),n=insideCount(i,all);
  return {value:i.uuid,label:`${i.name}${q>1?` ×${q}`:''} · ${typeLabel(i.type)}${box?` · in ${box.name}`:''}${n?` · with ${n} inside`:''}`};
 });
}
/** Item folders of the Items sidebar as "Parent / Child" options (the value is the Folder's uuid). */
export function folderChoices(folders){
 const path=f=>{const names=[];for(let x=f,i=0;x&&i<20;x=x.folder,i++)names.unshift(x.name);return names.join(' / ');};
 return listOf(folders).filter(f=>f?.type==='Item'&&f.uuid).map(f=>({value:f.uuid,label:path(f)})).sort((a,b)=>a.label.localeCompare(b.label));
}

/**
 * Pick one of `options` ([{value,label}]) in the kit's form dialog (Cancel left, `ok` right). Resolves the value, or
 * null on Cancel. A value that was not offered is refused, never trusted.
 */
export async function pickOne(title,label,options,{ok,hint,value}={}){
 if(!options.length)return null;
 const start=options.some(o=>o.value===value)?value:options[0].value;
 const r=await formDialog(title,[{name:'pick',label,type:'select',value:start,options,hint}],{ok});
 if(!r)return null;
 const v=String(r.pick??'');
 if(!options.some(o=>String(o.value)===v))throw Error('Choose one of the listed options.');
 return v;
}

/* ---------- Party stash: Add to stash… (the same as dropping an item on the stash) ---------- */
export const STASH_WORLD='world';
/** Where a deposit can come from: the given characters (a player's own; the GM's every one), plus the Items sidebar for the GM. */
export function stashSources({characters=[],gm=false}={}){
 const out=listOf(characters).filter(a=>a&&!isLevelBackup(a)).sort(byName).map(a=>({value:a.id,label:a.name}));
 if(gm)out.push({value:STASH_WORLD,label:'Items sidebar (a copy goes in the stash)'});
 return out;
}
/**
 * Add to stash…: From (skipped when there is one choice), then Item. Resolves {type:'Item', uuid} for the stash's
 * drop path, or null. `characters` must already be the ones this user may stash from.
 */
export async function pickStashDeposit({characters=[],gm=false,worldItems=[],preferred='',notify=globalThis.ui?.notifications}={}){
 const sources=stashSources({characters,gm});
 if(!sources.length){notify?.warn?.('You don\'t own a character to add items from.');return null;}
 const from=sources.length===1?sources[0].value:await pickOne('Add to stash','From',sources,{ok:'Choose item…',value:preferred});
 if(from===null)return null;
 const actor=from===STASH_WORLD?null:listOf(characters).find(a=>a.id===from);
 if(from!==STASH_WORLD&&!actor)throw Error('Choose a character you own.');
 const choices=itemChoices(actor?actor.items:worldItems);
 if(!choices.length){notify?.info?.(`${actor?actor.name:'The Items sidebar'} has no items to add.`);return null;}
 const hint=actor?`The whole stack moves from ${actor.name} to the stash, and a container brings what is inside it, as when you drag it.`:'A copy goes in the stash; the Items sidebar keeps its item.';
 const uuid=await pickOne(`Add to stash from ${actor?actor.name:'the Items sidebar'}`,'Item',choices,{ok:'Add to stash',hint});
 return uuid?{type:'Item',uuid}:null;
}

/* ---------- Shop editor: Add item… and Choose Actor… (the same as the editor's drop zones) ---------- */
const SHOP_WORLD='world',SHOP_FOLDER='folder';
/** Where shop items can come from: the Items sidebar, one of its folders, or an Actor's inventory (not level backups). */
export function shopSources({actors=[],folders=[],worldItems=[]}={}){
 const out=[];
 if(listOf(worldItems).length)out.push({value:SHOP_WORLD,label:'Items sidebar'});
 if(folderChoices(folders).length)out.push({value:SHOP_FOLDER,label:'A whole folder from the Items sidebar'});
 for(const a of listOf(actors).filter(a=>a&&!isLevelBackup(a)&&listOf(a.items).length).sort(byName))out.push({value:`actor:${a.id}`,label:`${a.name}'s inventory`});
 return out;
}
/**
 * Add item…: From, then Item (or Folder). Resolves {type:'Item'|'Folder', uuid} for the editor's drop path, or null.
 * Compendium items are not listed: drag those, or bring them into the Items sidebar first.
 */
export async function pickShopItems({actors=[],folders=[],worldItems=[],notify=globalThis.ui?.notifications}={}){
 const sources=shopSources({actors,folders,worldItems});
 if(!sources.length){notify?.info?.('There are no items to add: the Items sidebar and every inventory are empty.');return null;}
 const from=sources.length===1?sources[0].value:await pickOne('Add items to this shop','From',sources,{ok:'Choose item…'});
 if(from===null)return null;
 if(from===SHOP_FOLDER){
  const uuid=await pickOne('Add a folder to this shop','Folder',folderChoices(folders),{ok:'Add items',hint:'Every item in the folder and its subfolders is added, as when you drop the folder.'});
  return uuid?{type:'Folder',uuid}:null;
 }
 const actor=from===SHOP_WORLD?null:listOf(actors).find(a=>`actor:${a.id}`===from);
 if(from!==SHOP_WORLD&&!actor)throw Error('Choose one of the listed options.');
 const uuid=await pickOne(`Add an item from ${actor?`${actor.name}'s inventory`:'the Items sidebar'}`,'Item',itemChoices(actor?actor.items:worldItems),{ok:'Add item',hint:'A container brings what is inside it. The source item is not changed.'});
 return uuid?{type:'Item',uuid}:null;
}
/** Choose Actor…: the merchant's name and portrait from an Actor in the Actors sidebar. Resolves {type:'Actor', uuid}, or null. */
export async function pickMerchantActor({actors=[],notify=globalThis.ui?.notifications}={}){
 const options=listOf(actors).filter(a=>a?.uuid&&!isLevelBackup(a)).sort(byName).map(a=>({value:a.uuid,label:a.type==='npc'?`${a.name} (NPC)`:a.name}));
 if(!options.length){notify?.info?.('There are no Actors in the Actors sidebar.');return null;}
 const uuid=await pickOne('Choose the merchant','Actor',options,{ok:'Use this Actor',hint:'Its name and portrait become the merchant\'s. You can still change both by hand.'});
 return uuid?{type:'Actor',uuid}:null;
}
