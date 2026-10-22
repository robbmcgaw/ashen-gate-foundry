// 0.15.0 GM Quests tab redesign. Mocked Foundry and a fake DOM: proves the logic and wiring, not the live Foundry UI.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MOD,initialState,publicView} from '../scripts/core.mjs';
import {SUBVIEWS,questRow,listQuestsTab,filterRows,sortRows,groupRows,navCounts,gmViewState,changedLabel,rewardSummary,questGivers,EDITOR_SECTIONS,CONTENT_ACTIONS} from '../scripts/quests-tab.mjs';
import {questCard,questsSubnav,bulkBar,editorSection} from '../scripts/gm-panels.mjs';
import {planBulk,runBulk,duplicateSource,confirmText} from '../scripts/bulk.mjs';
import {El} from './helpers/fake-dom.mjs';

const src=(id,name,o={})=>({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER')?'work_order':id.startsWith('CONTRACT')?'contract':'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],name,public_summary:'',source:{},objectives:[{key:'a',goal:'[TEST] goal',visibility:'player'}],locations:[],parameters:{},outcomes:{},...(id.startsWith('ORDER')?{work_order_domain:'crafting'}:{}),...o});
const entry=(s,st={},changed=null)=>({source:s,state:{...initialState(s),...st},changed});

// ---------- pure logic ----------
const data=[
 entry(src('QUEST-T-DRAFT','[TEST] Draft',{status:'draft'})),
 entry(src('QUEST-T-HID','[TEST] Hidden',{refs:[{relation:'quest_giver',target_id:'NPC-TEST-DOVA',mode:'optional'}]}),{},1000),
 entry(src('QUEST-T-AVAIL','[TEST] Available',{locations:['LOC-TEST-MILL'],tags:['harvest']}),{status:'Available',revealed:true},5000),
 entry(src('QUEST-T-ACT','[TEST] Active',{refs:[{relation:'offered_by_faction',target_id:'FAC-TEST-POST',mode:'optional'}]}),{status:'Active',revealed:true,publicLocationIds:['LOC-TEST-PIER'],scope:'individual',actorId:'aria'},3000),
 entry(src('QUEST-T-DONE','[TEST] Done'),{status:'Completed',revealed:true}),
 entry(src('QUEST-T-FAIL','[TEST] Failed'),{status:'Failed'}),
 entry(src('ORDER-T-FORGE','[TEST] Forge'),{status:'Active'}),
 entry(src('CONTRACT-T-ESCORT','[TEST] Escort',{visibility:'gm'}),{status:'Active',revealed:true}),
];
const ctx={actorName:id=>({aria:'[TEST] Aria'})[id]??null,locationName:id=>({'LOC-TEST-MILL':'[TEST] Old Mill'})[id]??null};
const rows=data.map(e=>questRow(e,ctx));

test('sub-views: All, Drafts, Hidden, Active, Completed / Failed, Orders, Contracts with counts',()=>{
 assert.deepEqual(SUBVIEWS.map(v=>v.label),['All','Drafts','Hidden','Active','Completed / Failed','Orders','Contracts']);
 assert.deepEqual(navCounts(rows),{all:8,drafts:1,hidden:1,active:4,closed:2,orders:1,contracts:1});
 assert.deepEqual(filterRows(rows,{nav:'drafts'}).map(r=>r.id),['QUEST-T-DRAFT']);
 assert.deepEqual(filterRows(rows,{nav:'closed'}).map(r=>r.id),['QUEST-T-DONE','QUEST-T-FAIL']);
 assert.deepEqual(filterRows(rows,{nav:'contracts'}).map(r=>r.id),['CONTRACT-T-ESCORT']);
 assert.equal(filterRows(rows,{nav:'nonsense'}).length,8,'an unknown view shows everything');
 const html=questsSubnav('active',navCounts(rows));
 assert.match(html,/data-qv-nav="active" aria-checked="true"[^>]*>Active<span class="ag-tab__count">4<\/span>/);
 assert.match(html,/data-qv-nav="all" aria-checked="false"/);
});
test('search matches title, id, location id or name, giver, tags and the audience character',()=>{
 const find=q=>filterRows(rows,{search:q}).map(r=>r.id);
 assert.deepEqual(find('forge'),['ORDER-T-FORGE']);
 assert.deepEqual(find('quest-t-fail'),['QUEST-T-FAIL']);
 assert.deepEqual(find('old mill'),['QUEST-T-AVAIL']);assert.deepEqual(find('loc-test-pier'),['QUEST-T-ACT']);
 assert.deepEqual(find('npc-test-dova'),['QUEST-T-HID']);assert.deepEqual(find('fac-test-post'),['QUEST-T-ACT']);
 assert.deepEqual(find('harvest'),['QUEST-T-AVAIL']);assert.deepEqual(find('aria'),['QUEST-T-ACT']);
 assert.deepEqual(find('  '),rows.map(r=>r.id),'blank search shows all');
});
test('givers come from typed refs (giver/issuer/faction relations) or a giver string; nothing is guessed from text',()=>{
 assert.deepEqual(questGivers(src('QUEST-X','x',{refs:[{relation:'targets_location',target_id:'LOC-A',mode:'required'},{relation:'issued_by',target_id:'NPC-B',mode:'optional'}]})),['NPC-B']);
 assert.deepEqual(questGivers(src('QUEST-X','x',{source:{description:'The miller asked',giver:'[TEST] Miller'}})),['[TEST] Miller']);
 assert.deepEqual(questGivers(src('QUEST-X','x',{source:{description:'Given by the guild'}})),[]);
});
test('group by status, type, location (by name) and giver, with "No location" / "No giver" last; sort by location and recent change',()=>{
 assert.deepEqual(groupRows(rows,'location').map(g=>[g.label,g.rows.length]),[['[TEST] Old Mill',1],['LOC-TEST-PIER',1],['No location',6]]);
 assert.deepEqual(groupRows(rows,'giver').map(g=>g.label),['FAC-TEST-POST','NPC-TEST-DOVA','No giver']);
 assert.deepEqual(groupRows(rows,'type').map(g=>g.label),['Quest','Order','Contract']);
 assert.deepEqual(sortRows(rows,'changed').slice(0,3).map(r=>r.id),['QUEST-T-AVAIL','QUEST-T-ACT','QUEST-T-HID'],'newest first, never-changed last');
 assert.deepEqual(sortRows(rows,'location').slice(0,2).map(r=>r.id),['QUEST-T-AVAIL','QUEST-T-ACT']);
 const r=listQuestsTab(data,{nav:'active',group:'none'},ctx);
 assert.equal(r.total,8);assert.equal(r.shown,4);assert.equal(r.counts.all,8);assert.deepEqual(r.ids.length,4);
});
test('remembered view: sub-view, sort, group and section open state, with safe defaults',()=>{
 assert.deepEqual(gmViewState(null),{nav:'all',sort:'name',group:'status',sections:Object.fromEntries(EDITOR_SECTIONS.map(([k,,o])=>[k,o]))});
 const v=gmViewState({nav:'orders',sort:'changed',group:'giver',sections:{rewards:true,basics:false,bogus:true},search:'kept?'});
 assert.equal(v.nav,'orders');assert.equal(v.sort,'changed');assert.equal(v.group,'giver');
 assert.equal(v.sections.rewards,true);assert.equal(v.sections.basics,false);assert.equal('bogus' in v.sections,false);assert.equal('search' in v,false);
 assert.deepEqual(gmViewState({nav:'x',sort:1,group:[]}),gmViewState({}));
 assert.deepEqual(EDITOR_SECTIONS.map(s=>s[1]),['Basics','Audience','Objectives','Rewards','Campaign status and reveal','GM notes']);
});
test('last changed reads as a short relative time',()=>{
 const now=Date.parse('2026-10-22T12:00:00Z');
 assert.equal(changedLabel(now-10e3,now),'just now');assert.equal(changedLabel(now-5*60e3,now),'5 min ago');
 assert.equal(changedLabel(now-3*3600e3,now),'3 h ago');assert.equal(changedLabel(now-86400e3,now),'1 day ago');
 assert.equal(changedLabel(Date.parse('2026-09-01T00:00:00Z'),now),'2026-09-01');assert.equal(changedLabel(null,now),'');
});
test('reward summary: item rewards (not removed) with quantities, plus the suggested rewards text for coin',()=>{
 const s=src('QUEST-R','[TEST] R',{outcomes:{description:'[TEST] 10 gp',item_rewards:[{item_id:'ITEM-TEST-ROPE',quantity:2}]}});
 const st={...initialState(s),rewards:{v:1,added:[{key:'rw-a',ref:{schema:'ag-item-ref/1',name:'[TEST] Potion',quantity:3},visibility:'shown',recipient:'chosen'},{key:'rw-b',ref:{schema:'ag-item-ref/1',name:'[TEST] Gone',quantity:1},visibility:'shown',recipient:'chosen'}],overrides:{'rw-b':{removed:true}},grants:[]}};
 assert.deepEqual(rewardSummary(s,st,id=>id==='ITEM-TEST-ROPE'?'[TEST] Rope':null),{items:[{name:'[TEST] Rope',quantity:2},{name:'[TEST] Potion',quantity:3}],text:'[TEST] 10 gp'});
 assert.deepEqual(rewardSummary(src('QUEST-N','n'),initialState(src('QUEST-N','n'))),{items:[],text:''});
});
test('quest card: type badge, status chip, location, giver, audience character, progress, rewards, visible indicator, last changed',()=>{
 const s=src('CONTRACT-T-CARD','[TEST] Card',{locations:['LOC-TEST-MILL'],refs:[{relation:'quest_giver',target_id:'NPC-TEST-DOVA',mode:'optional'}],outcomes:{description:'[TEST] 25 gp on delivery'},objectives:[{key:'a',goal:'g'},{key:'b',goal:'h'},{key:'c',goal:'i'}]});
 const r=questRow(entry(s,{status:'Active',revealed:true,scope:'individual',actorId:'aria',progress:{a:'complete',b:'complete'}},Date.now()-120e3),ctx);
 const html=questCard(r,{picked:true});
 assert.match(html,/agq-card is-picked/);assert.match(html,/data-pick="CONTRACT-T-CARD" checked/);
 assert.match(html,/agq-kind--contract"><i class="fa-solid fa-file-signature" aria-hidden="true"><\/i>Contract/);
 assert.match(html,/ag-badge--accent">Active/);assert.match(html,/Visible to players/);
 assert.match(html,/Location: <\/span>\[TEST\] Old Mill/);assert.match(html,/Giver: <\/span>NPC-TEST-DOVA/);
 assert.match(html,/Audience: <\/span>Individual: \[TEST\] Aria/);
 assert.match(html,/>2\/3</);assert.match(html,/Rewards: <\/span>\[TEST\] 25 gp on delivery/);assert.match(html,/Changed 2 min ago/);
 const hidden=questCard(questRow(entry(src('QUEST-T-H','[TEST] H',{status:'draft'})),ctx));
 assert.match(hidden,/fa-eye-slash" aria-hidden="true"><\/i>Draft/);assert.match(hidden,/GM only/);assert.doesNotMatch(hidden,/Visible to players|Changed/);
 assert.match(questCard(questRow(entry(src('QUEST-T-I','[TEST] I'),{scope:'individual',actorId:'ghost'}),{})),/Individual: ghost/,'an unknown actor shows its id, not nothing');
});
test('cards never clip actionable text: wrapping styles, no ellipsis anywhere in the Quest Log stylesheet',()=>{
 const css=fs.readFileSync(new URL('../styles/quest.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/text-overflow|line-clamp/);
 assert.match(css,/\.agq-card__main \{[^}]*white-space: normal/);assert.match(css,/\.agq-card__fact \{[^}]*overflow-wrap: anywhere/);
 assert.match(css,/\.agq-subnav \{[^}]*flex-wrap: wrap/);
 assert.match(css,/\.agq-savebar \{[^}]*position: sticky; bottom: 0/);
});
test('bulk bar: idle hint, then count, select all / clear, status, hide, reveal, duplicate and a red Delete',()=>{
 assert.match(bulkBar(0,5),/agq-bulk--idle[\s\S]*Select all 5 shown/);assert.doesNotMatch(bulkBar(0,5),/bulk-delete/);
 const html=bulkBar(2,5);
 assert.match(html,/2 selected/);
 for(const a of ['bulk-all','bulk-clear','bulk-status','bulk-hide','bulk-reveal','bulk-duplicate','bulk-delete'])assert.match(html,new RegExp(`data-action="${a}"`));
 assert.match(html,/data-action="bulk-delete" class="ag-btn ag-btn--danger ag-btn--sm"/);
 for(const a of ['bulk-status','bulk-hide','bulk-reveal','bulk-duplicate','bulk-delete','save-quest'])assert.ok(CONTENT_ACTIONS.includes(a),a);
 assert.equal(editorSection('rewards','Rewards','<p>x</p>',{open:false,summary:'2 items'}),'<details class="agq-sec" data-section="rewards"><summary class="agq-sec__head"><span class="agq-sec__title">Rewards</span><span class="agq-sec__summary">2 items</span></summary><div class="agq-sec__body"><p>x</p></div></details>');
});
test('bulk reveal never publishes a draft or a GM-only definition; hide takes the reveal back (and Hidden when needed)',()=>{
 const ids=data.map(e=>e.source.id);
 const reveal=planBulk('reveal',data,ids);
 const reasons=Object.fromEntries(reveal.skipped.map(s=>[s.id,s.reason]));
 assert.match(reasons['QUEST-T-DRAFT'],/drafts stay GM only/);assert.match(reasons['CONTRACT-T-ESCORT'],/GM-only definition/);
 assert.ok(!reveal.changes.some(c=>c.id==='QUEST-T-DRAFT'||c.id==='CONTRACT-T-ESCORT'));
 assert.deepEqual(reveal.changes.find(c=>c.id==='QUEST-T-HID').patch,{revealed:true});
 assert.match(reasons['QUEST-T-HID'],/stays GM only while Hidden/,'revealed but still Hidden is said plainly');
 assert.deepEqual([...reveal.willShow].sort(),['[TEST] Failed','[TEST] Forge'],'only quests out of Hidden can show; never the draft');
 const pv=entry(src('QUEST-T-PV','[TEST] Player-visible',{visibility:'player'}),{status:'Active'});
 const hide=planBulk('hide',[...data,pv],['QUEST-T-ACT','QUEST-T-PV','QUEST-T-DRAFT']);
 assert.deepEqual(hide.changes.map(c=>[c.id,c.patch]),[['QUEST-T-ACT',{revealed:false}],['QUEST-T-PV',{revealed:false,status:'Hidden'}]]);
 assert.deepEqual(hide.skipped.map(s=>s.id),['QUEST-T-DRAFT']);assert.deepEqual(hide.willHide.sort(),['[TEST] Active','[TEST] Player-visible']);
});
test('bulk status says who will newly see what; delete and duplicate cover every selected quest',()=>{
 const st=planBulk('status',data,['QUEST-T-HID','QUEST-T-DRAFT','QUEST-T-DONE'],{status:'Active'});
 assert.deepEqual(st.changes.map(c=>c.id),['QUEST-T-DRAFT','QUEST-T-HID','QUEST-T-DONE']);
 assert.deepEqual(st.willShow,[],'unrevealed reveal-gated quests stay GM only even when Active');
 const text=confirmText('status',planBulk('status',[...data,entry(src('QUEST-T-PV','[TEST] PV',{visibility:'player'}))],['QUEST-T-PV','ORDER-T-FORGE'],{status:'Active'}),{status:'Active'});
 assert.match(text,/Set 1 quest to Active\./);assert.match(text,/Players will now see: \[TEST\] PV\./);assert.match(text,/Left as is: \[TEST\] Forge \(Already Active\.\)/);
 assert.throws(()=>planBulk('status',data,['QUEST-T-HID'],{status:'Bogus'}),/Choose a status/);
 assert.throws(()=>planBulk('explode',data,[]),/Unknown bulk action/);
 assert.equal(planBulk('delete',data,['QUEST-T-HID','ORDER-T-FORGE','NOPE']).changes.length,2);
 assert.match(confirmText('delete',planBulk('delete',data,['QUEST-T-HID'])),/Delete 1 quest\..*cannot be undone/);
});
test('duplicate: new permanent id (-COPY, -COPY-2), "(copy)" title, draft status; never the campaign state',()=>{
 const s=src('QUEST-T-ACT','[TEST] Active',{status:'approved',outcomes:{item_rewards:[{item_id:'ITEM-TEST-ROPE'}]}});
 const a=duplicateSource(s,new Set(['QUEST-T-ACT']));
 assert.equal(a.id,'QUEST-T-ACT-COPY');assert.equal(a.name,'[TEST] Active (copy)');assert.equal(a.status,'draft');
 assert.deepEqual(a.objectives,s.objectives);assert.deepEqual(a.outcomes,s.outcomes);
 assert.equal(duplicateSource(s,new Set(['QUEST-T-ACT-COPY','QUEST-T-ACT-COPY-2'])).id,'QUEST-T-ACT-COPY-3');
 assert.equal(s.name,'[TEST] Active','the original is untouched');
});
test('runBulk keeps going after a refusal and reports it',async()=>{
 const calls=[];
 const plan={changes:[{id:'A',name:'a',patch:{status:'Active'}},{id:'B',name:'b',patch:{status:'Active'}},{id:'C',name:'c',patch:{status:'Active'}}]};
 const res=await runBulk('status',plan,{updateState:async(id,p)=>{calls.push(id);if(id==='B')throw new Error('Individual quests require an Actor ID.');}});
 assert.deepEqual(calls,['A','B','C']);assert.deepEqual(res.done.map(d=>d.id),['A','C']);assert.deepEqual(res.failed,[{id:'B',name:'b',reason:'Individual quests require an Actor ID.'}]);
});

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
await store.saveRecord(src('QUEST-TEST-A','[TEST] Alpha draft',{status:'draft'}));
await store.saveRecord(src('QUEST-TEST-B','[TEST] Bravo',{visibility:'player',objectives:[{key:'a',goal:'[TEST] one',visibility:'player'},{key:'b',goal:'[TEST] two',visibility:'player'}]}));
await store.updateState('QUEST-TEST-B',{status:'Active'});
await store.saveRecord(src('ORDER-TEST-C','[TEST] Charlie order'));
const gmRecord=id=>docs.find(d=>d.flags?.[MOD]?.private&&d.flags[MOD].source.id===id);
const published=id=>docs.some(d=>d.flags?.[MOD]?.public&&d.flags[MOD].view.id===id);
const content=new El();
const draw=async app=>{app._replaceHTML(await app._renderHTML(),content);return content;};
const reset=()=>{dialogs.length=0;notes.length=0;answer='confirm';game.user=gm;};

test('window: sub-views with counts; picking one is remembered for this GM and comes back in a new window',async()=>{
 reset();await mod.api.open();const app=lastApp;app.tab='quests';await draw(app);
 const count=k=>content.querySelector(`[data-qv-nav="${k}"]`).querySelector('.ag-tab__count');
 assert.ok(count('all')&&count('drafts'));
 assert.match(content.innerHTML,/data-qv-nav="all" aria-checked="true"[^>]*>All<span class="ag-tab__count">3</);
 assert.match(content.innerHTML,/data-qv-nav="drafts"[^>]*>Drafts<span class="ag-tab__count">1</);
 assert.match(content.innerHTML,/data-qv-nav="orders"[^>]*>Orders<span class="ag-tab__count">1</);
 content.querySelector('[data-qv-nav="drafts"]').fire('click');await new Promise(r=>setTimeout(r,0));
 assert.equal(app.qv.nav,'drafts');assert.equal(gm.flags.gmView.nav,'drafts');
 await draw(app);assert.deepEqual(content.querySelectorAll('[data-pick]').map(b=>b.dataset.pick),['QUEST-TEST-A']);
 content.querySelector('#ag-gm-sort').value='changed';content.querySelector('#ag-gm-sort').fire('change');await new Promise(r=>setTimeout(r,0));
 assert.equal(gm.flags.gmView.sort,'changed');
 app.rendered=false;await mod.api.open();assert.notEqual(lastApp,app);
 assert.equal(lastApp.qv.nav,'drafts');assert.equal(lastApp.qv.sort,'changed');assert.equal(lastApp.qv.search,'','search is not kept');
 // Saving the view prefs causes no redraw of its own.
 const before=lastApp.renders??0;for(const fn of hooks.get('updateUser'))fn(gm,{_id:'gm',flags:{[MOD]:{gmView:{nav:'all'}}}});
 assert.equal(lastApp.renders??0,before);
 for(const fn of hooks.get('updateUser'))fn(gm,{_id:'gm',flags:{[MOD]:{tracking:{}}}});await new Promise(r=>setTimeout(r,0));
 assert.ok((lastApp.renders??0)>before,'other flag changes still redraw');
 lastApp.qv.nav='all';gm.flags.gmView.nav='all';
});
test('editor: collapsible sections remember open/closed; one sticky save bar shows a clear unsaved state',async()=>{
 reset();const app=lastApp;app.tab='quests';app.gmId='QUEST-TEST-B';app.unsavedSource=false;await draw(app);
 const secs=content.querySelectorAll('details[data-section]');
 assert.deepEqual(secs.map(d=>[d.dataset.section,d.open]),[['basics',true],['audience',true],['objectives',true],['rewards',false],['status',true],['gmnotes',false]]);
 const rewards=content.querySelector('[data-section="rewards"]');rewards.open=true;rewards.fire('toggle');
 assert.equal(gm.flags.gmView.sections.rewards,true);
 await draw(app);assert.equal(content.querySelector('[data-section="rewards"]').open,true,'kept open after a redraw');
 const bar=content.querySelector('.agq-savebar');
 assert.match(content.innerHTML,/data-source-status>No unsaved changes</);assert.equal(content.querySelector('.agq-dirty-badge').hidden,true);
 // An edit to an item reward (it saves on its own) is not an unsaved change; a field edit is.
 content.querySelector('[data-reward-zone]').fire('input');assert.equal(app.unsavedSource,false);
 const title=content.querySelector('#ag-src-name');title.value='[TEST] Bravo renamed';title.fire('input');
 assert.equal(app.unsavedSource,true);assert.equal(content.querySelector('[data-source-status]').textContent,'Unsaved changes');
 assert.ok(bar.classList.contains('is-dirty'));assert.equal(content.querySelector('.agq-dirty-badge').hidden,false);
 // Views, sort, filters and Clear filters redraw the list only: the typed title survives, nothing re-renders.
 const renders=app.renders??0;
 content.querySelector('[data-qv-nav="orders"]').fire('click');
 assert.equal(app.qv.nav,'orders');assert.equal(content.querySelector('[data-qv-nav="orders"]').getAttribute('aria-checked'),'true');
 assert.deepEqual(content.querySelectorAll('[data-pick]').map(b=>b.dataset.pick),['ORDER-TEST-C']);
 const sort=content.querySelector('#ag-gm-sort');sort.value='status';sort.fire('change');
 const search=content.querySelector('#ag-gm-search');search.value='zzz';search.fire('input');
 assert.match(content.querySelector('#ag-gm-cards').innerHTML,/Nothing matches/);
 await app.action({dataset:{action:'clear-filters'}},content);
 assert.equal(app.qv.nav,'all');assert.equal(app.qv.search,'');assert.equal(content.querySelector('#ag-gm-search').value,'');
 assert.equal(content.querySelector('[data-qv-nav="all"]').getAttribute('aria-checked'),'true');assert.equal(content.querySelectorAll('[data-pick]').length,3);
 assert.equal(app.renders??0,renders,'no full redraw');assert.equal(content.querySelector('#ag-src-name').value,'[TEST] Bravo renamed');
 assert.equal(app.unsavedSource,true);
 app.picked=new Set(['ORDER-TEST-C']);await app.action({dataset:{action:'bulk-hide'}},content);
 assert.match(notes.at(-1)[1],/Save or cancel your changes/,'no bulk action over unsaved edits, even on another quest');app.picked.clear();
 // Another client's change does not redraw over unsaved edits.
 const before=app.renders??0;for(const fn of hooks.get('updateJournalEntry'))fn({getFlag:()=>undefined},{},{},'other');assert.equal(app.renders??0,before);
});
test('Save changes writes the definition and the campaign state together, and keeps objective progress per key',async()=>{
 reset();const app=lastApp;
 content.querySelector('#ag-status').value='Completed';
 const rows=content.querySelectorAll('.agq-srcobj');rows[0].querySelector('.ag-obj-progress').value='complete';
 content.querySelector('#ag-party-notes').value='[TEST] shared';content.querySelector('#ag-gm-notes').value='[TEST] secret';
 const writes=clock;await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const rec=gmRecord('QUEST-TEST-B');
 assert.equal(rec.flags[MOD].source.name,'[TEST] Bravo renamed');
 assert.equal(rec.flags[MOD].state.status,'Completed');assert.deepEqual(rec.flags[MOD].state.progress,{a:'complete',b:'pending'});
 assert.equal(rec.flags[MOD].state.partyNotes,'[TEST] shared');assert.equal(rec.flags[MOD].state.gmNotes,'[TEST] secret');
 assert.equal(app.unsavedSource,false);assert.ok(rec._stats.modifiedTime>writes);
 const pub=docs.find(d=>d.flags?.[MOD]?.public&&d.flags[MOD].view.id==='QUEST-TEST-B');
 assert.ok(pub,'published');assert.equal(JSON.stringify(pub.flags[MOD].view).includes('[TEST] secret'),false,'GM notes never reach the player view');
 await draw(app);assert.match(content.innerHTML,/data-source-status>No unsaved changes</);
});
test('a new quest is created as a GM-only draft: Hidden, unpublished, whatever its definition visibility',async()=>{
 reset();const app=lastApp;await app.action({dataset:{action:'new'}},content);await draw(app);
 assert.match(content.innerHTML,/data-action="save-quest" class="ag-btn ag-btn--primary">Create quest</);
 assert.match(content.innerHTML,/a new quest is saved Hidden unless you choose another status/);
 content.querySelector('#ag-src-id').value='QUEST-TEST-NEW';content.querySelector('#ag-src-name').value='[TEST] New';
 content.querySelector('#ag-src-visibility').value='player';content.querySelector('.ag-src-obj-goal').value='[TEST] first';
 await app.action({dataset:{action:'save-quest'}},content);
 assert.deepEqual(notes.filter(x=>x[0]==='error'),[]);
 const rec=gmRecord('QUEST-TEST-NEW');assert.equal(rec.flags[MOD].source.status,'draft');assert.equal(rec.flags[MOD].state.status,'Hidden');
 assert.equal(published('QUEST-TEST-NEW'),false);assert.equal(publicView(rec.flags[MOD].source,rec.flags[MOD].state),null);
 assert.match(notes.at(-1)[1],/Players cannot see it/);assert.equal(app.gmId,'QUEST-TEST-NEW');
});
test('picks and bulk bar: tick, select all shown, clear; a player can never run a bulk action',async()=>{
 reset();const app=lastApp;app.qv={...app.qv,nav:'all',search:''};app.picked.clear();await draw(app);
 const box=content.querySelector('[data-pick="ORDER-TEST-C"]');box.checked=true;box.fire('change');
 assert.deepEqual([...app.picked],['ORDER-TEST-C']);assert.ok(content.querySelector('#ag-gm-bulk .agq-bulk__count'),'the bar now shows the selection');assert.ok(content.querySelector('[data-action="bulk-delete"]'));
 await app.action({dataset:{action:'bulk-all'}},content);assert.equal(app.picked.size,4);
 await app.action({dataset:{action:'bulk-clear'}},content);assert.equal(app.picked.size,0);
 app.picked=new Set(['QUEST-TEST-B']);game.user=alice;
 await app.action({dataset:{action:'bulk-delete'}},content);
 assert.match(notes.at(-1)[1],/GM permission required/);assert.ok(gmRecord('QUEST-TEST-B'),'nothing deleted');
 game.user=gm;
});
test('bulk hide, reveal (drafts stay GM only), set status and duplicate',async()=>{
 reset();const app=lastApp;
 app.picked=new Set(['QUEST-TEST-B','QUEST-TEST-A']);await app.action({dataset:{action:'bulk-hide'}},content);
 assert.equal(gmRecord('QUEST-TEST-B').flags[MOD].state.status,'Hidden','a player-visible definition is hidden with Hidden');
 assert.equal(published('QUEST-TEST-B'),false);
 assert.match(JSON.stringify(dialogs.at(-1)),/Alpha draft[^"]*Already GM only/);
 dialogs.length=0;app.picked=new Set(['QUEST-TEST-A','ORDER-TEST-C']);
 await app.action({dataset:{action:'bulk-reveal'}},content);
 const ask=dialogs[0];assert.equal(ask.window.title,'Reveal 1 quest?');assert.deepEqual(ask.buttons.map(b=>b.label),['Cancel','Reveal 1 quest']);
 assert.match(ask.content,/Left as is: \[TEST\] Alpha draft \(Draft: drafts stay GM only/);
 assert.equal(gmRecord('QUEST-TEST-A').flags[MOD].state.revealed,false);assert.equal(published('QUEST-TEST-A'),false);
 assert.equal(gmRecord('ORDER-TEST-C').flags[MOD].state.revealed,true);
 dialogs.length=0;answer='cancel';app.picked=new Set(['ORDER-TEST-C']);
 const statusRoot={querySelector:s=>s==='#ag-bulk-status'?{value:'Available'}:content.querySelector(s)};
 await app.action({dataset:{action:'bulk-status'}},statusRoot);
 assert.equal(dialogs[0].window.title,'Set 1 quest to Available?');assert.match(dialogs[0].content,/Players will now see: \[TEST\] Charlie order/);
 assert.equal(gmRecord('ORDER-TEST-C').flags[MOD].state.status,'Hidden','Cancel changes nothing');
 answer='confirm';await app.action({dataset:{action:'bulk-status'}},statusRoot);
 assert.equal(gmRecord('ORDER-TEST-C').flags[MOD].state.status,'Available');assert.equal(published('ORDER-TEST-C'),true);
 app.picked=new Set(['QUEST-TEST-B']);await app.action({dataset:{action:'bulk-duplicate'}},content);
 const copy=gmRecord('QUEST-TEST-B-COPY');assert.ok(copy);assert.equal(copy.flags[MOD].source.status,'draft');assert.equal(copy.flags[MOD].state.status,'Hidden');
 assert.equal(copy.flags[MOD].state.partyNotes,'','campaign notes are not copied');assert.equal(published('QUEST-TEST-B-COPY'),false);
 assert.equal(app.picked.size,0,'duplicated quests are unticked');
});
test('bulk delete asks in red with a labelled button; Cancel deletes nothing; the open quest closes when deleted',async()=>{
 reset();const app=lastApp;app.gmId='QUEST-TEST-B-COPY';app.unsavedSource=false;
 app.picked=new Set(['QUEST-TEST-B-COPY','QUEST-TEST-NEW']);answer='cancel';
 await app.action({dataset:{action:'bulk-delete'}},content);
 const ask=dialogs[0];assert.equal(ask.window.title,'Delete 2 quests?');assert.deepEqual(ask.buttons.map(b=>b.label),['Cancel','Delete 2 quests']);
 assert.ok(ask.classes.includes('ag-dialog--danger'));assert.match(ask.content,/cannot be undone/);
 assert.ok(gmRecord('QUEST-TEST-B-COPY')&&gmRecord('QUEST-TEST-NEW'),'Cancel deletes nothing');
 answer='confirm';await app.action({dataset:{action:'bulk-delete'}},content);
 assert.equal(gmRecord('QUEST-TEST-B-COPY'),undefined);assert.equal(gmRecord('QUEST-TEST-NEW'),undefined);
 assert.equal(app.gmId,null);assert.equal(app.picked.size,0);assert.match(notes.at(-1)[1],/2 quests deleted/);
 // Unsaved edits on the open quest block a bulk action on it.
 app.gmId='QUEST-TEST-A';app.unsavedSource=true;app.picked=new Set(['QUEST-TEST-A']);
 await app.action({dataset:{action:'bulk-hide'}},content);assert.match(notes.at(-1)[1],/Save or cancel your changes/);
 app.unsavedSource=false;console.error=origError;
});
