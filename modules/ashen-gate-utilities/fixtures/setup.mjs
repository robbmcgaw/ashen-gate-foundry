/**
 * Utilities v0.2.0 disposable Foundry fixture — actual native Actors, Item and RollTables.
 * Run ONLY from the GM browser console in a disposable backed-up test world.
 * Invocation: await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).setup()
 * Cleanup:    await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).reset()
 * Full cleanup including GM-created stash: reset({deleteStash:true}) only after backup.
 * No runtime module automatically executes this file.
 */
import {confirmDialog} from '../scripts/dialogs.mjs';
const MODULE='ashen-gate-utilities';
const F='AG-UTILITIES-V020-DISPOSABLE';
const entries=[['AG TEST | Bridge Scout','pc-scout'],['AG TEST | Field Warden','pc-warden']];
const flag=(id)=>({[MODULE]:{fixtureId:F,fixtureRole:id}});
const guard=()=>{if(!game?.user?.isGM)throw Error('Only a GM can create or reset Utilities fixtures.');if(!game.modules.get(MODULE)?.active)throw Error('Enable Ashen Gate | Utilities first.');};
const tagged=(doc)=>doc?.flags?.[MODULE]?.fixtureId===F;
export async function setup(){
 guard();
 const players=[...game.users].filter(u=>!u.isGM);
 if(!players.length)throw Error('Create at least one non-GM user before setup; two player logins are recommended.');
 const actors=[];
 for(let i=0;i<entries.length;i++){
  const [name,role]=entries[i];
  let actor=[...game.actors].find(a=>tagged(a)&&a.flags[MODULE].fixtureRole===role);
  if(!actor){
   const owner=players[i%players.length];
   actor=await Actor.create({name,type:'character',img:'icons/svg/mystery-man.svg',ownership:{default:0,[owner.id]:3},flags:flag(role)});
  }
  actors.push({id:actor.id,name:actor.name,ownedBy:players[i%players.length].name});
 }
 let item=[...game.items].find(x=>tagged(x)&&x.flags[MODULE].fixtureRole==='item');
 if(!item)item=await Item.create({name:'AG TEST | Sealed Travel Ledger',type:'loot',img:'icons/svg/book.svg',system:{quantity:2},flags:flag('item')});
 const textType=globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT??'text';
 const documentType=globalThis.CONST?.TABLE_RESULT_TYPES?.DOCUMENT??'document';
 const textRows=[{type:textType,range:[1,1],weight:1,text:'AG TEST | The bridge is clear.'},{type:textType,range:[2,2],weight:1,text:'AG TEST | Storm clouds gather at the pass.'}];
 const documentRows=[{type:documentType,range:[1,1],weight:1,text:'AG TEST | Item document result',documentCollection:'Item',documentId:item.id}];
 const definitions=[['text-table','AG TEST | Crossing Reports',textRows,'1d2'],['document-table','AG TEST | Unsafe Document Result',documentRows,'1d1']];
 const tables=[];
 for(const [role,name,results,formula] of definitions){
  let table=[...game.tables].find(t=>tagged(t)&&t.flags[MODULE].fixtureRole===role);
  if(!table)table=await RollTable.create({name,formula,replacement:true,displayRoll:false,results,flags:flag(role)});
  tables.push({id:table.id,name});
 }
 ui.notifications?.info('Utilities v0.2.0 created native TEST Actors, Item and RollTables. Open the module and test the normal click paths.');
 return {fixture:F,actors,tables,item:{id:item.id,name:item.name},instructions:'Use GM Setup > Enable Player Access; use Actors > Utilities to create checks. Stash creation is manual through Party Inventory.'};
}
export async function reset({deleteStash=false}={}){
 guard();
 if(!await confirmDialog('Reset Utilities disposable fixture? This deletes tagged TEST Actors, Item and RollTables and clears active check/history. Do this only in a disposable test world.',{title:'Reset fixture',yes:'Reset fixture'}))return {cancelled:true};
 // Delete only items/Actors/Tables stamped by this fixture; no name-only deletion.
 const active=[...game.tables].filter(tagged);for(const x of active)await x.delete();
 const items=[...game.items].filter(tagged);for(const x of items)await x.delete();
 const actors=[...game.actors].filter(tagged);for(const x of actors)await x.delete();
 await game.settings.set(MODULE,'activeSession',{});
 await game.settings.set(MODULE,'history',[]);
 let stashDeleted=false;
 if(deleteStash){
  const stash=[...game.actors].find(a=>a.getFlag(MODULE,'partyStash')===true&&a.name==='Ashen Gate | Party Stash');
  if(stash){if(!await confirmDialog('Also delete the native Party Stash Actor AND all its test items?',{title:'Delete Party Stash',yes:'Delete Party Stash'}))return {fixtureDeleted:true,stashDeleted:false};await stash.delete();stashDeleted=true;}
 }
 ui.notifications?.info('Utilities fixture reset completed.');
 return {fixture:F,deleted:{actors:actors.length,items:items.length,tables:active.length},stashDeleted};
}
