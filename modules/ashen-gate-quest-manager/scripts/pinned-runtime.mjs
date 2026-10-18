// Quest's standalone bridge to the vendored Archie 0.1-prototype resolver.
// Explicit pack IDs only, no Manager required and no second writable catalog.
import {createFoundryLiveResolver} from './vendor/archie-resolver/foundry-live-resolver.mjs';
const distinct=values=>[...new Set(values)];
export function parsePackIds(value){
 const ids=typeof value==='string'?value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean):[];
 if(ids.some(id=>!/^[a-z0-9][a-z0-9_.-]*\.[a-z0-9][a-z0-9_.-]*$/i.test(id)))throw new Error('Compendium pack IDs must be exact collection IDs, e.g. world.my-quests');
 if(distinct(ids).length!==ids.length)throw new Error('Duplicate configured compendium pack ID');
 return ids;
}
export function createQuestDefinitionReader({game,hooks,packIds=[]}={}){
 if(!game?.user?.isGM)throw new Error('Quest definition reader is a GM-only adapter');
 const reader=createFoundryLiveResolver({game,hooks,compendiumPackIds:packIds,currentViewer:()=>game.user,
   isRevealed:()=>false});
 let packDocs=new Map(),generation=0,disposed=false,lastPackStatus='not_loaded';
 async function refreshCompendiums(){
   if(disposed)return {status:'unavailable'};
   if(!game.user?.isGM)return {status:'forbidden'};
   const mine=++generation;
   packDocs=new Map();lastPackStatus='loading';
   const result=await reader.refreshCompendiums();
   if(disposed||mine!==generation)return {status:'superseded'};
   if(result.status!=='ok'){lastPackStatus=result.status;return result;}
   try {
     const loaded=new Map();
     for(const id of packIds){
       const pack=game.packs?.get?.(id);
       if(typeof pack?.getDocuments!=='function')throw new Error('Configured pack unavailable');
       const docs=await pack.getDocuments();
       if(!Array.isArray(docs))throw new Error('Invalid pack documents');
       for(const doc of docs){
         if(typeof doc.uuid==='string'&&doc.uuid.startsWith('Compendium.')&&
            doc.flags?.['ashen-gate-manager']?.lifecycle?.archived!==true)loaded.set(doc.uuid,doc);
       }
     }
     if(disposed||mine!==generation)return {status:'superseded'};
     packDocs=loaded;lastPackStatus='ok';
     return {status:'ok',count:result.count,packIds:packIds.slice()};
   }catch{
     // Cache errors must not make a successfully indexed pack readable without
     // Quest's domain-specific kind validation; fail closed on missing metadata.
     packDocs=new Map();lastPackStatus='unavailable';return {status:'unavailable'};
   }
 }
 return Object.freeze({reader,refreshCompendiums,
   packDocumentByUuid(uuid){return lastPackStatus==='ok'?packDocs.get(uuid)??null:null;},
   status(){return Object.freeze({contract:reader.contract,packIds:packIds.slice(),packStatus:lastPackStatus});},
   dispose(){if(disposed)return;disposed=true;generation++;packDocs.clear();reader.dispose();}});
}
