import test from 'node:test';
import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';

const once=new Map(), hooks=new Map(),settingsDefs=new Map();
globalThis.Hooks={once:(event,fn)=>once.set(event,fn),on:(event,fn)=>{hooks.set(event,[...(hooks.get(event)||[]),fn]);},off:()=>{}};
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{
 constructor(){lastApp=this;this.rendered=false;}
 async render(){this.rendered=true;return this._renderHTML();}
 async close(){this.rendered=false;}
}}}};
let playerAccess=false,packIds='';
const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false},bob={id:'bob',isGM:false};
for(const user of [gm,alice,bob]){
 user.savedFlag=null;
 user.getFlag=(module,key)=>module===MOD&&key==='tracking'?user.savedFlag:undefined;
 user.setFlag=async(module,key,val)=>{assert.equal(module,MOD);assert.equal(key,'tracking');user.savedFlag=structuredClone(val);};
}
const publicView={id:'QUEST-PUBLIC',entity_type:'Objective',objective_kind:'quest',name:'Safe & Public',status:'Active',scope:'party',actorId:null,summary:'Visible description',objectives:[{key:'first',goal:'Find <trail>',complete:false}],locationIds:[]};
const secretView={id:'QUEST-SECRET',entity_type:'Objective',objective_kind:'quest',name:'Not for Bob',status:'Active',scope:'individual',actorId:'actorA',objectives:[{key:'secret',goal:'GM has a secret'}]};
let questDocs=[{getFlag:(module,key)=>module===MOD?{public:true,view:publicView}[key]:null,testUserPermission:(u)=>u.id==='alice'||u.isGM},
 {getFlag:(module,key)=>module===MOD?{public:true,view:secretView}[key]:null,testUserPermission:(u)=>u.isGM}];
const actors=[{id:'actorA',name:'Alice actor',testUserPermission:(who)=>who.isGM||who.id==='alice'}];actors.get=id=>actors.find(a=>a.id===id);
const module={active:true,api:null};
let overlay=null;
globalThis.document={
 querySelectorAll:()=>[],querySelector:(selector)=>selector==='#ag-quest-objectives-overlay'?overlay:null,
 createElement:(tag)=>({tag,id:'',innerHTML:'',setAttribute(){},remove(){overlay=null;},querySelector:()=>({addEventListener(){}})}),
 body:{append(el){overlay=el;}}
};
globalThis.ui={actors:{element:null},notifications:{info:()=>{},error:()=>{}}};
globalThis.game={user:gm,settings:{register:(module,name,def)=>settingsDefs.set(name,def),get:(module,key)=>key==='playerAccessEnabled'?playerAccess:packIds,set:async(module,key,val)=>{if(key==='playerAccessEnabled')playerAccess=val;else packIds=val;settingsDefs.get(key)?.onChange?.();}},journal:questDocs,actors,users:[gm,alice,bob],modules:{get:id=>id===MOD?module:null}};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();

test('v0.4.0 preserves original APIs, hides both advanced world settings in Game Settings',()=>{
 assert.equal(module.api.version,'0.29.0');
 assert.equal(module.api.assignments.contract,'ag-quest-assignments/0.1-alpha');
 assert.equal(module.api.consumer.contract,'ag-objective-consumer/0.2-alpha');
 assert.equal(settingsDefs.get('playerAccessEnabled').config,false);
 assert.equal(settingsDefs.get('compendiumPackIds').config,false);
});
test('GM Setup is settings-only and the Quests tab holds the authoring form',async()=>{
 game.user=gm;
 await module.api.open();
 const html=await lastApp.render();
 assert.match(html,/Track/);
 assert.match(html,/Show objectives overlay/);
 assert.match(html,/data-tab="quests"/);
 lastApp.tab='setup';
 const setupHtml=await lastApp.render();
 assert.match(setupHtml,/data-action="save-setup"[^>]*>Save Changes/);
 assert.doesNotMatch(setupHtml,/save-player-access|Save Player Access/,'Player Access has no separate save (D4)');
 assert.match(setupHtml,/Compendium pack IDs/);
 assert.match(setupHtml,/Quest Log/);
 assert.doesNotMatch(setupHtml,/Create Quest Definition|data-action="import"|data-action="export"|canonical source JSON/);
 lastApp.tab='quests';
 const questsHtml=await lastApp.render();
 assert.match(questsHtml,/New quest/);
 assert.match(questsHtml,/data-action="save-quest"[^>]*>Create quest/);
 assert.match(questsHtml,/Advanced: source JSON/);
 assert.match(questsHtml,/Reveal when GM approves/);
 assert.match(questsHtml,/Advanced: import here, or use General Manager[\s\S]*data-ag-file-button[^>]*>.*Import JSON…/,'Quest Log\'s own importer sits under Advanced (QL-13)');
 assert.match(questsHtml,/data-action="export"/);
 assert.doesNotMatch(questsHtml,/save-setup|ag-player-access/);
});
test('player tracking is per-user, permission-filtered, and escapes objective markup in overlay',async()=>{
 playerAccess=true;game.user=alice;
 let result=await module.api.tracking.set({ids:['QUEST-PUBLIC','QUEST-SECRET'],visible:true});
 assert.deepEqual(result.map(v=>v.id),['QUEST-PUBLIC']);
 assert.deepEqual(module.api.tracking.getState().ids,['QUEST-PUBLIC','QUEST-SECRET']);
 assert.equal(overlay?.innerHTML.includes('Find &lt;trail&gt;'),true);
 assert.equal(overlay?.innerHTML.includes('Find <trail>'),false);
 assert.equal(overlay?.innerHTML.includes('Not for Bob'),false);
 game.user=bob;
 result=await module.api.tracking.set({ids:['QUEST-PUBLIC'],visible:true});
 assert.deepEqual(result,[]);
 assert.equal(module.api.tracking.getState().visible,true);
 assert.deepEqual(alice.savedFlag.ids,['QUEST-PUBLIC','QUEST-SECRET']);
 assert.deepEqual(bob.savedFlag.ids,['QUEST-PUBLIC']);
});
test('revoke player access: direct tracking API denies and on-screen overlay disappears',async()=>{
 game.user=alice;playerAccess=false;
 for(const fn of hooks.get('updateJournalEntry')||[])fn();
 assert.equal(document.querySelector('#ag-quest-objectives-overlay'),null); // overlay removed or denied
 assert.throws(()=>module.api.tracking.get(),/hidden by the GM/);
 await assert.rejects(()=>module.api.tracking.set({visible:true}),/hidden by the GM/);
 assert.deepEqual(module.api.resolveObjective('QUEST-SECRET'),{status:'not_found'});
});
test('reveal withdrawn or account permission changed: overlay only reads current published projection',async()=>{
 playerAccess=true;game.user=alice;game.journal=[];
 for(const fn of hooks.get('updateJournalEntry')||[])fn();
 assert.equal(overlay?.innerHTML.includes('Safe &amp; Public'),false);
 assert.deepEqual(module.api.tracking.get(),[]);
});
test('non-GM cannot change Player Access or query GM-only quest state or assignment API',async()=>{
 game.user=alice;
 await assert.rejects(()=>module.api.playerAccess.setEnabled(true),/GM permission/);
 assert.throws(()=>module.api.getGMState('QUEST-PUBLIC'),/GM permission/);
 assert.throws(()=>module.api.assignments.list(),/GM permission/);
});
