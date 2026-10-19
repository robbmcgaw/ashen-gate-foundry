/**
 * GM-only native Foundry fixture installer. Creates actual world Item documents
 * with Manager-compatible source bindings. It does NOT create campaign personnel
 * membership, mutate profession XP, or pretend to be canonical published content.
 * Run from the GM console in a disposable world only.
 */
import {confirmDialog} from '../js/dialogs.mjs';
const MOD='ashen-gate-headquarters';
const MARK='v0.6.0-synthetic-test';
const fixtureIds=['HIRE-AGTEST-SMITH','HPERK-AGTEST-WORKING'];
const url=`modules/${MOD}/fixtures/HQ_Test_Hireling_Definitions_v0.6.0.json`;
function requireGM(){if(!game?.user?.isGM)throw Error('Headquarters fixture setup/reset is GM-only.');}
const alreadyManaged=doc=>fixtureIds.includes(doc?.flags?.['ashen-gate-manager']?.source?.sourceId);
async function getFixtureRecords(){
 const res=await fetch(url,{cache:'no-store'});
 if(!res.ok)throw Error(`Fixture request failed: ${res.status} ${url}`);
 const records=await res.json();
 if(!Array.isArray(records)||records.length!==2||records.some(x=>!fixtureIds.includes(x.id)))throw Error('Unexpected fixture identities');
 return records;
}
async function fixtureFolder(){
 let parent=null;
 for(const name of ['Ashen Gate','Headquarters','Test Fixtures']){
  let found=(game.folders?.contents||[]).find(f=>f.type==='Item'&&f.name===name&&String(f.folder?.id??'')===String(parent?.id??''));
  if(!found)found=await Folder.create({name,type:'Item',folder:parent?.id??null});
  parent=found;
 }
 return parent;
}
export async function install(){
 requireGM();
 const records=await getFixtureRecords();
 const conflicts=(game.items?.contents||[]).filter(alreadyManaged);
 if(conflicts.length)throw Error('Fixture source IDs already exist. Run reset() or inspect records first; refusing overwrite.');
 const folder=await fixtureFolder();
 const docs=[];
 for(const record of records){
  const created=await Item.create({name:record.name,type:'feat',folder:folder.id,ownership:{default:0},img:'icons/svg/gear.svg',flags:{
   [MOD]:{testFixture:MARK},
   'ashen-gate-manager':{source:{sourceId:record.id,entityType:record.entity_type,visibility:'player',scope:record.scope,version:record.version,refs:record.refs,record}}
  }});
  docs.push({id:created.id,name:created.name,sourceId:record.id});
 }
 ui.notifications?.info?.('Created two real TEST ONLY Item documents in Ashen Gate/Headquarters/Test Fixtures.');
 return docs;
}
export async function reset(){
 requireGM();
 const docs=(game.items?.contents||[]).filter(doc=>doc.flags?.[MOD]?.testFixture===MARK&&alreadyManaged(doc));
 if(!docs.length)return {deleted:0,notice:'No tagged fixture Items. Headquarters campaign data unchanged.'};
 if(!await confirmDialog(`Delete ${docs.length} TEST ONLY Headquarters fixture Item(s)? Guildhall room, roster, catalog and staff records will NOT be changed.`,{title:'Delete fixture Items',yes:'Delete fixture Items'}))return {deleted:0,cancelled:true};
 for(const doc of docs)await doc.delete();
 return {deleted:docs.length,notice:'Only tagged Item definitions deleted. For a full HQ campaign-state reset, restore a saved test-world backup.'};
}
