// 0.23.0 The GM never types an ID or pastes one for a link: the quest ID is made from the title, links are picked by name.
// Pure link logic first, then the Quest Log window with mocked Foundry and partner APIs. Mocked: proves logic and wiring, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,validSource} from '../scripts/core.mjs';
import {newQuestId,readLinks,applyLinks,rememberLinkNames,locationRecords,npcRecords,factionRecords,questRecords,linkOptions} from '../scripts/quest-links.mjs';
import {El} from './helpers/fake-dom.mjs';
import {assertNoIds} from '../../../scripts/test-helpers/no-ids.mjs';

const base=(over={})=>({id:'QUEST-TEST-BASE',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],name:'[TEST] Base',public_summary:'',source:{description:''},objectives:[{key:'first',goal:'[TEST] go'}],locations:[],parameters:{},outcomes:{},...over});

test('newQuestId: prefix by type, made from the title, unique, and an Advanced id is checked',()=>{
 assert.equal(newQuestId({kind:'quest',name:'[TEST] The Gate',taken:[]}),'QUEST-TEST-THE-GATE');
 assert.equal(newQuestId({kind:'work_order',name:'[TEST] The Gate',taken:['QUEST-TEST-THE-GATE']}),'ORDER-TEST-THE-GATE');
 assert.equal(newQuestId({kind:'contract',name:'[TEST] The Gate',taken:[]}),'CONTRACT-TEST-THE-GATE');
 assert.equal(newQuestId({kind:'quest',name:'[TEST] The Gate',taken:['QUEST-TEST-THE-GATE','QUEST-TEST-THE-GATE-2']}),'QUEST-TEST-THE-GATE-3');
 assert.equal(newQuestId({kind:'quest',name:'x',custom:' quest-my-own ',taken:[]}),'QUEST-MY-OWN');
 assert.throws(()=>newQuestId({kind:'quest',name:'x',custom:'ORDER-WRONG',taken:[]}),/QUEST-/);
 assert.throws(()=>newQuestId({kind:'quest',name:'x',custom:'QUEST-A',taken:['QUEST-A']}),/already used/);
 assert.throws(()=>newQuestId({kind:'quest',name:'x',custom:'QUEST-a b',taken:[]}),/Advanced id/);
 assert.throws(()=>newQuestId({kind:'nonsense',name:'x'}),/type/);
});

test('readLinks reads links where the quest file keeps them, including relation names older files use',()=>{
 const s=base({refs:[{relation:'issuer',target_id:'NPC-TEST-ALDER',mode:'optional'},{relation:'faction_sponsor',target_id:'FACTION-TEST-WATCH',mode:'optional'},
  {relation:'prerequisite',target_id:'QUEST-TEST-FIRST',mode:'required'},{relation:'associated_location',target_id:'LOC-TEST-ELSEWHERE',mode:'optional'}],
  locations:['LOC-TEST-ASHFORD',{target_id:'LOC-TEST-OBJECT'}]});
 assert.deepEqual(readLinks(s,{publicLocationIds:['LOC-TEST-ASHFORD']}),{giver:'NPC-TEST-ALDER',faction:'FACTION-TEST-WATCH',prerequisites:['QUEST-TEST-FIRST'],locations:['LOC-TEST-ASHFORD'],publicLocations:['LOC-TEST-ASHFORD']});
 assert.deepEqual(readLinks(base()),{giver:'',faction:'',prerequisites:[],locations:[],publicLocations:[]});
});

test('applyLinks: an unchanged form leaves the stored quest exactly as it was (existing ids keep working)',()=>{
 const s=base({refs:[{relation:'issuer',target_id:'NPC-TEST-ALDER',mode:'optional'},{relation:'associated_location',target_id:'LOC-TEST-ELSEWHERE',mode:'optional'}],locations:['LOC-TEST-ASHFORD',{target_id:'LOC-TEST-OBJECT'}]});
 const l=readLinks(s,{});
 const {source}=applyLinks(s,{...l});
 assert.deepEqual(source,s);
 assert.deepEqual(applyLinks(s,{giver:l.giver,faction:l.faction}).source,s,'fields not drawn are left alone');
});

test('applyLinks: changes write typed refs and the location list, keeping other refs and non-text locations',()=>{
 const s=base({refs:[{relation:'associated_location',target_id:'LOC-TEST-ELSEWHERE',mode:'optional'}],locations:[{target_id:'LOC-TEST-OBJECT'}]});
 const {source}=applyLinks(s,{giver:'NPC-TEST-ALDER',faction:'FACTION-TEST-WATCH',prerequisites:['QUEST-TEST-A','QUEST-TEST-B'],locations:['LOC-TEST-ASHFORD']});
 assert.deepEqual(source.refs,[{relation:'associated_location',target_id:'LOC-TEST-ELSEWHERE',mode:'optional'},
  {relation:'quest_giver',target_id:'NPC-TEST-ALDER',mode:'optional'},{relation:'issuing_faction',target_id:'FACTION-TEST-WATCH',mode:'optional'},
  {relation:'prerequisite',target_id:'QUEST-TEST-A',mode:'required'},{relation:'prerequisite',target_id:'QUEST-TEST-B',mode:'required'}]);
 assert.deepEqual(source.locations,[{target_id:'LOC-TEST-OBJECT'},'LOC-TEST-ASHFORD']);
 validSource(source);
 const swapped=applyLinks(source,{giver:'NPC-TEST-OTHER'}).source;
 assert.equal(swapped.refs.find(r=>r.relation==='quest_giver').target_id,'NPC-TEST-OTHER');
 const cleared=applyLinks(source,{giver:'',faction:'',prerequisites:['QUEST-TEST-B']}).source;
 assert.deepEqual(cleared.refs.map(r=>r.relation),['associated_location','prerequisite']);
 assert.throws(()=>applyLinks(s,{locations:['not a location']}),/not a valid location/);
 assert.equal(applyLinks(s,{publicLocations:['LOC-A']},{}).publicLocationIds.length,1);
});

test('rememberLinkNames keeps last known names; a name that cannot be found now is kept from before',()=>{
 const names=rememberLinkNames({'LOC-OLD':'[TEST] Old Mill','LOC-X':'drop'},['LOC-OLD','LOC-NEW','LOC-NONE'],id=>({'LOC-NEW':'[TEST] New Hall'})[id]);
 assert.deepEqual(names,{'LOC-OLD':'[TEST] Old Mill','LOC-NEW':'[TEST] New Hall'});
});

test('picker options: only the kinds a field accepts, grouped, GM-only records hidden from players, self excluded',()=>{
 const locs=locationRecords([{id:'LOC-B',name:'[TEST] Brook',region:'[TEST] March',type:'Town'},{id:'LOC-A',name:'[TEST] Ash',region:'[TEST] March'},{id:'LOC-R',name:'[TEST] March',isRegion:true},{id:'LOC-N',name:''}]);
 assert.deepEqual(linkOptions('locations',locs).map(o=>[o.label,o.group,o.hint]),[['[TEST] Ash','[TEST] March',''],['[TEST] Brook','[TEST] March','Town'],['[TEST] March','Regions','Region']]);
 const quests=questRecords([base(),base({id:'QUEST-TEST-B',name:'[TEST] B'}),base({id:'ORDER-TEST-C',objective_kind:'work_order',name:'[TEST] C'}),base({id:'QUEST-TEST-SECRET',name:'[TEST] Secret',visibility:'gm'})],'QUEST-TEST-BASE');
 assert.deepEqual(linkOptions('prerequisites',quests,{gm:true}).map(o=>o.label),['[TEST] B','[TEST] Secret','[TEST] C']);
 assert.deepEqual(linkOptions('prerequisites',quests,{gm:false}).map(o=>o.label),['[TEST] B','[TEST] C'],'players never get GM records');
 assert.equal(linkOptions('giver',[...npcRecords([{id:'NPC-A',name:'[TEST] Alder',role:'Warden'}]),...locs]).length,1,'a giver is an NPC, never a location');
 assert.equal(linkOptions('faction',[...factionRecords([{id:'FACTION-A',name:'[TEST] Watch',public_role:'Guards'}]),...locs])[0].hint,'Guards');
});

// ---------- the Quest Log window, mocked Foundry and partner APIs ----------
const once=new Map(),hooks=new Map();
globalThis.Hooks={once:(e,fn)=>once.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),off:()=>{}};
let lastApp;
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){lastApp=this;}async render(){this.rendered=true;return this._renderHTML();}async close(){this.rendered=false;}},
 DialogV2:{wait:async o=>o.buttons.find(b=>b.action==='confirm')?.callback(),prompt:async()=>{}}}}};
const gm={id:'gm',isGM:true,flags:{}};
gm.getFlag=(m,k)=>m===MOD?structuredClone(gm.flags[k]):undefined;gm.setFlag=async(m,k,v)=>{gm.flags[k]=structuredClone(v);};
const docs=[];let n=0,clock=1_700_000_000_000;
const setPath=(o,path,v)=>{const ks=path.split('.');let t=o;for(const k of ks.slice(0,-1))t=t[k]??={};t[ks.at(-1)]=structuredClone(v);};
class Doc{constructor(d){this.id=`j${++n}`;this.name=d.name;this.flags=structuredClone(d.flags??{});this.ownership=d.ownership;this._stats={modifiedTime:++clock};this.pages=(d.pages??[]).map(p=>({...p,update:async()=>{}}));}
 getFlag(m,k){return structuredClone(this.flags?.[m]?.[k]);}
 async update(data){for(const [k,v] of Object.entries(data)){if(k.startsWith('flags.'))setPath(this,k,v);else this[k]=v;}this._stats.modifiedTime=++clock;return this;}
 async delete(){docs.splice(docs.indexOf(this),1);}
 testUserPermission(u){return u.isGM;}}
globalThis.JournalEntry={create:async(data)=>{const d=new Doc(data);docs.push(d);return d;}};
const actors=[];actors.get=()=>null;
const settings={playerAccessEnabled:true,compendiumPackIds:'',openForPlayers:false};
const mod={active:true,api:null,version:'0.23.0'};
const LOCS=[{id:'LOC-TEST-ASHFORD',name:'[TEST] Ashford',region:'[TEST] Marches',type:'Town'},{id:'LOC-TEST-BROOK',name:'[TEST] Brook',region:'[TEST] Marches',type:'Village'},{id:'LOC-TEST-ROAD',name:'[TEST] Old Road',region:'[TEST] Dales',type:'Route'}];
const partners={
 'ashen-gate-locations':{active:true,api:{listLocations:()=>structuredClone(LOCS),getLocation:id=>LOCS.find(l=>l.id===id)??null}},
 'ashen-gate-manager':{active:true,api:{codex:{list:()=>[{id:'NPC-TEST-ALDER',name:'[TEST] Alder',role:'Warden'},{id:'NPC-TEST-BRIN',name:'[TEST] Brin',role:'Smith'}]}}},
 'ashen-gate-factions':{active:true,api:{getFactions:()=>[{id:'FACTION-TEST-WATCH',name:'[TEST] Night Watch',public_role:'Guards'}]}}};
const notes=[];
// The shared fake DOM only parses markup; the add-a-link list builds elements, so give it just enough to do that.
const setAttr=El.prototype.setAttribute;
El.prototype.setAttribute=function(k,v){setAttr.call(this,k,v);if(k==='class')for(const c of String(v).split(' ').filter(Boolean))this.classList.add(c);if(k==='id')this.id=v;};
El.prototype.append=function(...kids){for(const c of kids){c.parent=this;this.children.push(c);}};
El.prototype.replaceWith=function(el){const p=this.parent,at=p.children.indexOf(this);el.parent=p;p.children.splice(at,1,el);this.parent=null;};
globalThis.document={querySelectorAll:()=>[],querySelector:()=>null,createElement:tag=>new El({},{tag:tag.toUpperCase()})};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,users:[gm],journal:docs,actors,folders:[],items:{contents:[]},packs:{get:()=>null},
 settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{settings[k]=v;}},modules:{get:id=>id===MOD?mod:partners[id]??null}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();
console.error=origError;
const rec=id=>docs.find(d=>d.flags?.[MOD]?.source?.id===id)?.flags[MOD];

let app,content;
const draw=async()=>{app._replaceHTML(await app._renderHTML(),content);return content;};
async function openEditor(gmId=null){
 await mod.api.open();app=lastApp;app.tab='quests';content=new El();app.gmId=gmId;app.unsavedSource=false;await draw();
 if(!gmId){await app.action({dataset:{action:'new'}},content);await draw();}
}
const pickIn=(id,label)=>{const o=content.querySelectorAll(`#${id}-list [role="option"]`).find(x=>x.getAttribute('data-label')===label);assert.ok(o,`option ${label} in ${id}`);o.fire('click');};
const putQuest=(source,state={})=>{docs.push(new Doc({name:source.name,flags:{[MOD]:{private:true,source,state:{status:'Hidden',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false,...state}}}}));};

test('new quest: the ID is made from the title; the Links section lists names, never ids; links are picked, not typed',async()=>{
 putQuest(base({id:'QUEST-TEST-FIRST',name:'[TEST] First steps'}));
 await openEditor();
 const title=content.querySelector('#ag-src-name');title.value='[TEST] Linked job';title.fire('input');
 assert.equal(content.querySelector('#ag-src-id').value,'QUEST-TEST-LINKED-JOB');
 assert.equal(content.querySelector('#ag-src-id').getAttribute('readonly'),'');
 const links=content.querySelector('[data-section="links"]');
 assert.ok(links);
 assert.equal(content.querySelector('#ag-src-locations'),null,'no id text boxes any more');
 assert.equal(content.querySelector('#ag-public-locations'),null);
 const labels=id=>content.querySelectorAll(`#${id}-list [role="option"]`).map(o=>o.getAttribute('data-label'));
 assert.deepEqual(labels('ag-link-giver'),['None','[TEST] Alder','[TEST] Brin']);
 assert.deepEqual(labels('ag-link-faction'),['None','[TEST] Night Watch']);
 assert.deepEqual(labels('ag-link-locations-add'),['[TEST] Old Road','[TEST] Ashford','[TEST] Brook'],'grouped by region; a list has no None; kinds are locations only');
 assert.deepEqual(labels('ag-link-prerequisites-add'),['[TEST] First steps']);
 assert.deepEqual(content.querySelectorAll('#ag-link-locations-add-list .ag-picker__group').map(g=>g.getAttribute('data-group')),['[TEST] Dales','[TEST] Marches']);
 assertNoIds(content.innerHTML.slice(content.innerHTML.indexOf('data-section="links"'),content.innerHTML.indexOf('data-section="audience"')),'the Links section');
 pickIn('ag-link-giver','[TEST] Alder');pickIn('ag-link-faction','[TEST] Night Watch');
 pickIn('ag-link-prerequisites-add','[TEST] First steps');
 assert.equal(content.querySelector('#ag-link-giver').value,'NPC-TEST-ALDER');
 assert.equal(app.unsavedSource,true,'choosing a link marks the form unsaved');
 content.querySelector('.ag-src-obj-goal').value='[TEST] Do it';
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const r=rec('QUEST-TEST-LINKED-JOB');assert.ok(r,'saved under the made id');
 assert.deepEqual(r.source.refs,[{relation:'quest_giver',target_id:'NPC-TEST-ALDER',mode:'optional'},{relation:'issuing_faction',target_id:'FACTION-TEST-WATCH',mode:'optional'},{relation:'prerequisite',target_id:'QUEST-TEST-FIRST',mode:'required'}]);
 assert.deepEqual(r.state.linkNames,{'NPC-TEST-ALDER':'[TEST] Alder','FACTION-TEST-WATCH':'[TEST] Night Watch','QUEST-TEST-FIRST':'[TEST] First steps'});
});

test('a second quest with the same title gets -2; an invalid Advanced id is refused and nothing is saved',async()=>{
 await openEditor();
 const t=content.querySelector('#ag-src-name');t.value='[TEST] Linked job';t.fire('input');
 assert.equal(content.querySelector('#ag-src-id').value,'QUEST-TEST-LINKED-JOB-2');
 content.querySelector('.ag-src-obj-goal').value='[TEST] again';
 const custom=content.querySelector('#ag-src-id-custom');custom.value='QUEST-TEST-LINKED-JOB';
 notes.length=0;
 await app.action({dataset:{action:'save-quest'}},content);
 assert.match(notes.at(-1)[1],/Advanced id: That id is already used/);assert.equal(notes.at(-1)[0],'error');
 assert.equal(rec('QUEST-TEST-LINKED-JOB-2'),undefined);
 custom.value='';notes.length=0;
 await app.action({dataset:{action:'save-quest'}},content);
 assert.ok(rec('QUEST-TEST-LINKED-JOB-2'));
});

test('renaming a saved quest never changes its ID or its links',async()=>{
 const before=structuredClone(rec('QUEST-TEST-LINKED-JOB'));
 await openEditor('QUEST-TEST-LINKED-JOB');
 assert.equal(content.querySelector('#ag-src-id').value,'QUEST-TEST-LINKED-JOB');
 assert.equal(content.querySelector('#ag-src-id-custom'),null,'Advanced: set ID is for a new quest only');
 const t=content.querySelector('#ag-src-name');t.value='[TEST] Totally renamed';t.fire('input');
 assert.equal(content.querySelector('#ag-src-id').value,'QUEST-TEST-LINKED-JOB');
 await app.action({dataset:{action:'save-quest'}},content);
 const after=rec('QUEST-TEST-LINKED-JOB');
 assert.equal(after.source.id,'QUEST-TEST-LINKED-JOB');assert.equal(after.source.name,'[TEST] Totally renamed');
 assert.deepEqual(after.source.refs,before.source.refs);assert.deepEqual(after.source.locations,before.source.locations);
 assert.equal(docs.filter(d=>d.flags?.[MOD]?.source?.id==='QUEST-TEST-LINKED-JOB').length,1);
});

test('a quest stored by an older version opens with its links shown by name and saves unchanged',async()=>{
 notes.length=0;
 const legacy=base({id:'QUEST-TEST-LEGACY',name:'[TEST] Legacy',refs:[{relation:'issuer',target_id:'NPC-TEST-BRIN',mode:'optional'},{relation:'associated_location',target_id:'LOC-TEST-ROAD',mode:'optional'}],locations:['LOC-TEST-ASHFORD',{target_id:'LOC-TEST-BROOK'}]});
 putQuest(legacy,{publicLocationIds:['LOC-TEST-ASHFORD']});
 await openEditor('QUEST-TEST-LEGACY');
 assert.match(content.querySelector('#ag-link-giver-text').getAttribute('value'),/^\[TEST\] Brin$/);
 assert.equal(content.querySelector('#ag-link-giver').value,'NPC-TEST-BRIN');
 assert.deepEqual(content.querySelectorAll('#ag-link-locations .ag-reflist__item').map(li=>li.getAttribute('data-label')),['[TEST] Ashford']);
 assert.deepEqual(content.querySelectorAll('#ag-link-public-locations .ag-reflist__item').map(li=>li.getAttribute('data-label')),['[TEST] Ashford']);
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const r=rec('QUEST-TEST-LEGACY');
 assert.deepEqual(r.source.refs,legacy.refs);assert.deepEqual(r.source.locations,legacy.locations);assert.deepEqual(r.state.publicLocationIds,['LOC-TEST-ASHFORD']);
});

test('a link to a deleted record reads "Missing: <last known name>" with Replace…, never the id, and is kept until replaced',async()=>{
 putQuest(base({id:'QUEST-TEST-GONE',name:'[TEST] Gone',refs:[{relation:'quest_giver',target_id:'NPC-TEST-DELETED',mode:'optional'}],locations:['LOC-TEST-DELETED']}),{linkNames:{'NPC-TEST-DELETED':'[TEST] Old Smith','LOC-TEST-DELETED':'[TEST] Old Mill'}});
 await openEditor('QUEST-TEST-GONE');
 const html=content.innerHTML;
 assert.match(html,/Missing: \[TEST\] Old Smith/);assert.match(html,/Missing: \[TEST\] Old Mill/);
 assert.match(html,/data-ag-picker-replace>Replace…</);assert.match(html,/data-ag-reflist-replace/);
 assertNoIds(html.slice(html.indexOf('data-section="links"'),html.indexOf('data-section="audience"')),'broken links');
 assert.equal(content.querySelector('#ag-link-giver').value,'NPC-TEST-DELETED');
 await app.action({dataset:{action:'save-quest'}},content);
 const r=rec('QUEST-TEST-GONE');
 assert.equal(r.source.refs[0].target_id,'NPC-TEST-DELETED');assert.deepEqual(r.source.locations,['LOC-TEST-DELETED']);
 assert.equal(r.state.linkNames['LOC-TEST-DELETED'],'[TEST] Old Mill','the last known name is kept');
 content.querySelector('#ag-link-giver-list [data-label="[TEST] Brin"]');
 await openEditor('QUEST-TEST-GONE');
 pickIn('ag-link-giver','[TEST] Brin');
 await app.action({dataset:{action:'save-quest'}},content);
 assert.equal(rec('QUEST-TEST-GONE').source.refs[0].target_id,'NPC-TEST-BRIN');
});

test('when a partner module is off its links are kept read-only, not shown as missing, and survive a save',async()=>{
 putQuest(base({id:'QUEST-TEST-OFF',name:'[TEST] Off',refs:[{relation:'quest_giver',target_id:'NPC-TEST-ALDER',mode:'optional'}],locations:['LOC-TEST-ASHFORD']}),{linkNames:{'LOC-TEST-ASHFORD':'[TEST] Ashford'}});
 partners['ashen-gate-locations'].active=false;partners['ashen-gate-manager'].active=false;
 try{
  await openEditor('QUEST-TEST-OFF');
  const html=content.innerHTML;
  assert.doesNotMatch(html,/Missing:/);assert.match(html,/Ashen Gate \| Locations is not active/);assert.match(html,/General Manager is not active/);
  assert.match(html,/\[TEST\] Ashford/);
  assert.equal(content.querySelector('#ag-link-giver').value,'NPC-TEST-ALDER');
  await app.action({dataset:{action:'save-quest'}},content);
  const r=rec('QUEST-TEST-OFF');assert.equal(r.source.refs[0].target_id,'NPC-TEST-ALDER');assert.deepEqual(r.source.locations,['LOC-TEST-ASHFORD']);
 }finally{partners['ashen-gate-locations'].active=true;partners['ashen-gate-manager'].active=true;}
});
