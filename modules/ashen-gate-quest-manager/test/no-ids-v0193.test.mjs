// 0.19.3 Canonical ids (QUEST-, ORDER-, LOC-, NPC-, ITEM-...) never show in the Quest Log UI. Renders the main views with
// sample records and asserts with assertNoIds. The Details and source-JSON folds are the GM's deliberate place for ids and are
// taken out of the GM editor first. Mocked Foundry: proves the markup, not the live look.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
import {listQuestsTab,questRow,hideIds,UNTITLED,SORTS,GROUPS} from '../scripts/quests-tab.mjs';
import {questCards,questCard} from '../scripts/gm-panels.mjs';
import {planBulk,confirmText,duplicateSource} from '../scripts/bulk.mjs';
import {rewardsSection,grantPanel,grantSummary,defaultChoices} from '../scripts/rewards-ui.mjs';
import {journalPaneHTML} from '../scripts/journal-ui.mjs';
import {El} from './helpers/fake-dom.mjs';
import {assertNoIds,assertNoMachineText,findId} from '../../../scripts/test-helpers/no-ids.mjs';

const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':id.startsWith('CONTRACT')?'contract':'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'player',refs:[],name,public_summary:'[TEST] summary',source:{description:'[TEST] issuer'},objectives:[{key:'a',goal:'[TEST] one',visibility:'player'}],locations:[],parameters:{},outcomes:{},...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),...o});

const BARE={status:'Hidden',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false};
// ---------- the Quest Log window, mocked Foundry ----------
// ---------- the Quest Log window, mocked Foundry ----------
const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
let lastApp;const dialogs=[];let answer='confirm';
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;this.renders=(this.renders??0)+1;return this._renderHTML();}async close(){this.rendered=false;}},
 DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialogs.push(o);}}}}};
const gm={id:'gm',isGM:true,flags:{}},alice={id:'alice',isGM:false,flags:{}};
for(const u of [gm,alice]){u.getFlag=(m,k)=>m===MOD?structuredClone(u.flags[k]):undefined;u.setFlag=async(m,k,v)=>{u.flags[k]=structuredClone(v);};}
const docs=[];let n=0,clock=1_700_000_000_000;
const setPath=(o,path,v)=>{const ks=path.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k]??={};t[ks.at(-1)]=structuredClone(v);};
class Doc{constructor(d){this.id=`j${++n}`;this.name=d.name;this.flags=structuredClone(d.flags??{});this.ownership=d.ownership;this._stats={modifiedTime:++clock};this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
 getFlag(m,k){return structuredClone(this.flags?.[m]?.[k]);}
 async update(data){for(const [k,v] of Object.entries(data)){if(k.startsWith('flags.'))setPath(this,k,v);else this[k]=v;}this._stats.modifiedTime=++clock;return this;}
 async delete(){docs.splice(docs.indexOf(this),1);}
 testUserPermission(u){return u.isGM||this.ownership?.[u.id]>=2||this.ownership?.default>=2;}}
globalThis.JournalEntry={create:async(data)=>{const d=new Doc(data);docs.push(d);return d;}};
const actors=[{id:'aria',name:'[TEST] Aria',type:'character',flags:{},testUserPermission:u=>u.isGM||u.id==='alice'}];actors.get=id=>actors.find(a=>a.id===id)??null;
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const mod={active:true,api:null,version:'0.15.0'};const notes=[];
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users:[gm,alice],journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:null}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();

const store=await import('../scripts/store.mjs');
// Sample records: a giver and a location by id, unreadable item rewards, an individual quest for a missing character, an assignment.
await store.saveRecord(src('QUEST-TEST-MILL','[TEST] The Old Mill',{locations:['LOC-TEST-MILL'],refs:[{relation:'quest_giver',target_id:'NPC-TEST-DOVA',mode:'optional'},{relation:'offered_by_faction',target_id:'FAC-TEST-POST',mode:'optional'}],
 outcomes:{item_rewards:[{item_id:'ITEM-TEST-LANTERN',quantity:2},{item_id:'REC-TEST-FIELD-TONIC'}]}}));
await store.updateState('QUEST-TEST-MILL',{status:'Active',revealed:true,publicLocationIds:['LOC-TEST-MILL']});
await store.saveRecord(src('CONTRACT-TEST-ESCORT','[TEST] Escort the pedlar',{locations:['LOC-TEST-PIER']}));
await store.updateState('CONTRACT-TEST-ESCORT',{status:'Active',revealed:true,scope:'individual',actorId:'aria'});
await store.saveRecord(src('ORDER-TEST-FORGE','[TEST] Forge order',{status:'draft'}));
const assignment={id:'ASSIGN-TEST-ONE',entity_type:'Assignment',status:'draft',version:'0.1.0',provenance:{sources:['[TEST]']},visibility:'gm',refs:[{relation:'executes_objective',target_id:'QUEST-TEST-MILL',mode:'required'}],scope:'campaign_state',owner_system_id:'SYS-QUEST',objective_id:'QUEST-TEST-MILL',execution_status:'pending',participants:[],results:{}};
await mod.api.assignments.save(assignment);

// The GM's editor keeps ids in two deliberate places (Details, source JSON); take them out, then nothing else may show one.
const stripDeliberate=html=>html.replace(/<details[^>]*data-section="(?:details|json)"[\s\S]*?<\/details>/g,'').replace(/<textarea id="ag-assignment-json"[\s\S]*?<\/textarea>/g,'');
const reset=()=>{dialogs.length=0;notes.length=0;answer='confirm';game.user=gm;};

test('GM Quests tab: list and toolbar, every sort and group, with sample records',async()=>{
 reset();await mod.api.open();const app=lastApp;app.tab='quests';app.filtersOpen=true;
 assert.ok(!SORTS.some(([,label])=>label==='ID'),'no Sort by ID');
 for(const group of GROUPS.map(g=>g[0]))for(const sort of SORTS.map(s=>s[0])){
  app.qv={...app.qv,group,sort};
  assertNoMachineText(stripDeliberate(await app._renderHTML()),`Quests tab, group ${group}, sort ${sort}`);
 }
});
test('GM editor: no id outside Details and the source JSON, for saved quests and a new one',async()=>{
 reset();await mod.api.open();const app=lastApp;app.tab='quests';
 for(const id of ['QUEST-TEST-MILL','CONTRACT-TEST-ESCORT','ORDER-TEST-FORGE',null]){
  app.gmId=id;const html=await app._renderHTML();
  assertNoMachineText(stripDeliberate(html),`quest editor ${id??'new'}`);
 }
 app.gmId='QUEST-TEST-MILL';const html=await app._renderHTML();
 assert.match(html,/data-section="details"/,'the Details fold exists');
 assert.match(html,/data-action="copy-id"/,'with a Copy ID button for a saved quest');
 assert.ok(findId(html),'the ids are still reachable in Details');
});
test('Filters: a Location or Giver filter that no longer matches reads as words, not ids',async()=>{
 reset();await mod.api.open();const app=lastApp;app.tab='quests';app.filtersOpen=true;app.gmId=null;
 app.qv={...app.qv,location:'LOC-TEST-GONE',giver:'NPC-TEST-GONE'};
 assertNoMachineText(stripDeliberate(await app._renderHTML()),'filter row with values that no longer match');
});
test('quest cards: untitled and unknown-location records use neutral labels',()=>{
 const e=(s,st={})=>({source:s,state:{...BARE,...st},changed:null});
 const rows=[e({...src('QUEST-TEST-BARE','x',{locations:['LOC-TEST-NOWHERE']}),name:''},{scope:'individual',actorId:'ghost'})];
 const {groups}=listQuestsTab(rows,{group:'location'},{});
 const html=questCards(groups,null,{total:1});
 assertNoIds(html,'card with no name and an unknown location');assert.match(html,new RegExp(UNTITLED));
 assertNoIds(questCard(questRow(rows[0],{})),'card');
});
test('rewards: an item that cannot be found reads "Item not found" in the editor and the Give rewards panel',()=>{
 const party=[{id:'aria',name:'[TEST] Aria',given:false}];
 const rows=[{key:'def:ITEM-TEST-LANTERN',origin:'import',name:'ITEM-TEST-LANTERN',itemId:'ITEM-TEST-LANTERN',quantity:2,visibility:'on_complete',recipient:'each',removed:false,status:'missing',reason:"That item no longer exists or can't be found.",img:null,grantable:false,owed:true,party},
  {key:'rw-1',origin:'gm',name:'[TEST] Lantern',itemId:'ITEM-TEST-LANTERN',quantity:1,visibility:'shown',recipient:'each',removed:false,status:'ok',img:null,grantable:true,owed:true,party}];
 const editor=rewardsSection(rows,{canGive:true});
 assertNoIds(editor,'rewards editor');assert.match(editor,/Item not found/);
 assertNoIds(grantPanel(rows,defaultChoices(rows),{}),'give rewards panel');
 const sum=grantSummary(rows,defaultChoices(rows),{});assertNoIds(sum.problems.join(' ')+JSON.stringify(sum.receive),'grant problems');
});
test('bulk actions, duplicates and confirmations name quests, never ids',()=>{
 const e=(s,st={})=>({source:s,state:{...BARE,...st}});
 const data=[e(src('QUEST-TEST-A','[TEST] Alpha',{status:'draft'})),e({...src('QUEST-TEST-B','x'),name:''}),e(src('ORDER-TEST-C','[TEST] Charlie'),{status:'Active',revealed:true})];
 for(const [action,opts] of [['status',{status:'Active'}],['hide',{}],['reveal',{}],['duplicate',{}],['delete',{}]]){
  const plan=planBulk(action,data,data.map(d=>d.source.id),opts);
  assertNoIds(confirmText(action,plan,opts)+'\n'+plan.skipped.map(s=>`${s.name}: ${s.reason}`).join('\n'),`bulk ${action}`);
 }
 assertNoIds(duplicateSource(src('QUEST-TEST-A','[TEST] Alpha')).name,'duplicate title');
});
test('import messages: ids in warnings and errors become names',()=>{
 reset();
 const payload={schema_version:'ag-quest-source/0.1',records:[src('QUEST-TEST-NEWER','[TEST] Newer',{outcomes:{item_rewards:[{item_id:'ITEM-TEST-MISSING'}]}})]};
 const plan=mod.api.previewQuestImport(payload);
 assert.ok(findId(plan.warnings.join(' ')),'the API warning keeps its ids (contract unchanged)');
 const shown=plan.warnings.map(w=>hideIds(w,plan.rows)).join('\n');
 assertNoIds(shown,'import warning shown to the GM');assert.match(shown,/Newer/);
 assertNoIds(hideIds('Objective QUEST-TEST-NEWER exists; use Edit. Duplicate source ID ORDER-TEST-X',plan.rows),'import error');
});
test('assignment actions and notifications show no ids',async()=>{
 reset();await mod.api.open();const app=lastApp;
 await app.action({dataset:{action:'remove-assignment',id:'ASSIGN-TEST-ONE'}},new El());
 assert.equal(dialogs.at(-1)?.window?.title,'Delete this assignment?');
 for(const d of dialogs)assertNoIds(JSON.stringify(d.window??{})+String(d.content??''),'assignment dialog');
 for(const [,m] of notes)assertNoIds(m,'notification');
 await app.action({dataset:{action:'save-quest'}},new El());
 for(const [,m] of notes)assertNoIds(m,'error notification');
});
test('player views: Party and Individual lists, reading pane and search show no ids',async()=>{
 reset();game.user=alice;
 const app=lastApp;app.tab='party';
 for(const tab of ['party','individual']){app.tab=tab;app.actorId='aria';app.selectedId=null;assertNoMachineText(await app._renderHTML(),`player ${tab} tab`);}
 app.tab='party';app.filter='mill';assertNoMachineText(await app._renderHTML(),'player search');
 game.user=gm;
});
test('Game Journal: session list, search hits and the open page show no ids',()=>{
 const session={id:'SESSION-001',number:1,name:'Session 1',subtitle:'',current:true,archived:false,canRename:true,createdAt:null};
 const model={isGM:true,sessions:[session],session,pages:[{target:'party',label:'Party journal'}],page:{html:'<p>[TEST] notes</p>',canWrite:true,label:'Party journal'},error:'',hits:null,query:'',showArchived:false,renaming:null,target:'party',stale:false,dirty:false};
 assertNoMachineText(journalPaneHTML(model),'journal pane');
 assertNoIds(journalPaneHTML({...model,query:'x',hits:[{sessionId:'SESSION-404',target:'party',label:'Party journal',snippet:'[TEST]'}]}),'journal search hit for an unknown session');
});
test('the helper really catches ids (guards this test against going blind)',()=>{
 assert.throws(()=>assertNoIds('<span title="Open QUEST-TEST-MILL">x</span>'));
 assert.throws(()=>assertNoIds('<p>LOC-TEST-MILL</p>'));
});
