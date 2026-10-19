// v0.9.0: Group Checks and Roll Requests share one Rolls tab and one start form.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,rollFormSession,normalizeTab,createSession,summary,acceptRoll} from '../scripts/core.mjs';

test('Group result builds a Group Check with the DC, several skills and rolls per character',()=>{
 const s=rollFormSession({mode:'group',title:'[TEST] Cross',actors:['a','b'],skills:['ath','acr'],rollsPerActor:'2',dc:12,id:'r1',createdBy:'gm'});
 assert.equal(s.kind,'group');assert.equal(s.dc,12);assert.deepEqual(s.skills,['ath','acr']);assert.equal(s.slots.length,4);assert.equal(s.visibility,'public');
 for(const [i,[actor,skill]] of [['a','ath'],['a','acr'],['b','ath'],['b','acr']].entries())acceptRoll(s,{actorId:actor,skill,total:13,userId:'p',proofMessageId:`m${i}`});
 assert.equal(summary(s).result,'success');
});
test('Individual rolls builds a Roll Request: one skill, one roll each, no group verdict',()=>{
 const s=rollFormSession({mode:'individual',actors:['a','b'],skills:['prc'],rollsPerActor:3,dc:15,id:'r2',createdBy:'gm'});
 assert.equal(s.kind,'request');assert.equal(s.rollsPerActor,1);assert.equal(s.slots.length,2);assert.equal(s.name,'New Roll Request');
 acceptRoll(s,{actorId:'a',skill:'prc',total:20,userId:'p',proofMessageId:'x1'});acceptRoll(s,{actorId:'b',skill:'prc',total:2,userId:'p',proofMessageId:'x2'});
 assert.equal(summary(s).result,'completed');
});
test('start form rejects an unclear request instead of guessing',()=>{
 const base={actors:['a'],id:'r3',createdBy:'gm'};
 assert.throws(()=>rollFormSession({...base,mode:'individual',skills:['prc','ath']}),/exactly one/);
 assert.throws(()=>rollFormSession({...base,mode:'individual',skills:[]}),/exactly one/);
 assert.throws(()=>rollFormSession({...base,mode:'other',skills:['prc']}),/Group result or Individual/);
 assert.throws(()=>rollFormSession({...base,mode:'group',skills:['prc'],rollsPerActor:2}),/permitted skills/);
 assert.equal(rollFormSession({...base,mode:'group',skills:['prc'],title:'  '}).name,'New Group Check');
 assert.equal(rollFormSession({...base,mode:'group',skills:['prc'],dc:null}).dc,null);
});
test('old tab ids map to the one Rolls tab; other tabs are untouched',()=>{
 assert.equal(normalizeTab('checks'),'rolls');assert.equal(normalizeTab('rolls'),'rolls');assert.equal(normalizeTab(undefined),'rolls');
 for(const t of ['inventory','tables','conditions','history','setup'])assert.equal(normalizeTab(t),t);
});

// ---- Window-level behaviour with mocked Foundry globals ----
const handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},player={id:'p1',name:'P1',isGM:false,active:true};
const settings=new Map();
const actors=[{id:'pc1',name:'[TEST] Ash',type:'character',getFlag:()=>null,statuses:new Set(),items:[],testUserPermission:u=>u.id==='p1'},{id:'pc2',name:'[TEST] Brand',type:'character',getFlag:()=>null,statuses:new Set(),items:[],testUserPermission:()=>false},{id:'pc3',name:'[TEST] Cinder',type:'character',getFlag:()=>null,statuses:new Set(),items:[],testUserPermission:()=>false}];
actors.get=id=>actors.find(a=>a.id===id);
const users=[gm,player];users.get=id=>users.find(u=>u.id===id);
const party={name:'[TEST] Party',system:{members:[{actor:actors[0]},{actor:actors[1]}]}};
globalThis.game={user:gm,users,actors:Object.assign(actors,{party}),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,opts)=>settings.set(`${ns}.${key}`,{value:opts.default,onChange:opts.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 modules:new Map([[ID,{id:ID,api:{},active:true}]])};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[]};
const notes=[];globalThis.ui={actors:null,notifications:{info:m=>notes.push(m),warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>{handlers.on.set(k,fn);return 1;},off:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
globalThis.confirm=()=>true;
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=()=>game.modules.get(ID).api;
/** A stand-in for the rendered start form. */
const form=({mode,title='',actors=['pc1','pc2'],skills=['ath'],dc='15',count='1'})=>({
 querySelectorAll(q){if(q.includes('agu-mode'))return mode?[{value:mode}]:[];if(q.includes('participant'))return actors.map(value=>({value}));if(q.includes('agu-skill'))return skills.map(value=>({value}));return [];},
 querySelector(q){return {'#agu-title':{value:title},'#agu-dc':{value:dc},'#agu-roll-count':{value:count}}[q]??null;}});
const start=async(app,opts)=>app.handle('start',{disabled:false},form(opts));
const reset=async()=>{game.user=gm;await game.settings.set(ID,'activeSession',{});await game.settings.set(ID,'lastResult',{});await game.settings.set(ID,'history',[]);};

test('the window has one Rolls tab and its start form offers both modes with the party ticked',async()=>{
 await reset();const app=await api().open();
 const html=await app._renderHTML();
 assert.equal((html.match(/data-tab="rolls"/g)||[]).length,1);assert.ok(!html.includes('data-tab="checks"'));
 assert.ok(!html.includes('Group Checks')&&!html.includes('Roll Requests'));
 assert.ok(html.includes('value="group" checked')&&html.includes('value="individual"'));
 assert.match(html,/value="pc1" checked/);assert.match(html,/value="pc2" checked/);assert.doesNotMatch(html,/value="pc3" checked/);
 assert.ok(html.includes('data-action="start"')&&html.includes('Start Rolls'));
});
test('Start Rolls in Group result mode starts a Group Check; Individual starts a Roll Request',async()=>{
 await reset();const app=await api().open();
 await start(app,{mode:'group',title:'[TEST] Wall',skills:['ath','acr'],count:'2',dc:'12'});
 let s=game.settings.get(ID,'activeSession');assert.equal(s.kind,'group');assert.equal(s.dc,12);assert.equal(s.slots.length,4);assert.equal(s.name,'[TEST] Wall');
 await app.handle('cancel',{disabled:false},{});
 await start(app,{mode:'individual',skills:['prc'],dc:''});
 s=game.settings.get(ID,'activeSession');assert.equal(s.kind,'request');assert.equal(s.dc,null);assert.equal(s.slots.length,2);assert.deepEqual(s.skills,['prc']);
 assert.match(notes.at(-1),/Roll Request sent/);
});
test('one active slot across modes: a second start of either mode is refused and the running one is unchanged',async()=>{
 await reset();const app=await api().open();
 await start(app,{mode:'individual',title:'[TEST] Look',skills:['prc']});
 const before=structuredClone(game.settings.get(ID,'activeSession'));
 for(const mode of ['group','individual'])await assert.rejects(start(app,{mode,title:'[TEST] Second',skills:['prc']}),/Resolve or cancel the active interaction first/);
 assert.deepEqual(game.settings.get(ID,'activeSession'),before);
 const html=await app._renderHTML();assert.ok(!html.includes('Start Rolls'));assert.ok(html.includes('[TEST] Look'));
});
test('a player cannot start, end or cancel rolls',async()=>{
 await reset();game.user=player;await game.settings.set(ID,'playerAccessEnabled',true);const app=await api().open();
 await assert.rejects(start(app,{mode:'group'}),/GM only/);assert.deepEqual(game.settings.get(ID,'activeSession'),{});
 game.user=gm;await start(app,{mode:'group'});game.user=player;
 for(const a of ['resolve','cancel'])await assert.rejects(app.handle(a,{disabled:false},{}),/GM only/);
 assert.equal(game.settings.get(ID,'activeSession').status,'active');
 const html=await app._renderHTML();assert.ok(html.includes('Roll Now'));assert.ok(!html.includes('Start Rolls'));
 game.user=gm;
});
test('End & Record files the roll in History; pre-0.9 history entries still render with their kind',async()=>{
 await reset();
 const oldGroup=createSession({id:'old-g',kind:'group',name:'[TEST] Old Group',actors:['pc1'],skills:['ath'],dc:10,createdBy:'gm',createdAt:1});
 acceptRoll(oldGroup,{actorId:'pc1',skill:'ath',total:14,userId:'p1',proofMessageId:'o1'});
 const oldReq=createSession({id:'old-r',kind:'request',name:'[TEST] Old Request',actors:['pc1'],skills:['prc'],dc:15,createdBy:'gm',createdAt:2});
 acceptRoll(oldReq,{actorId:'pc1',skill:'prc',total:9,userId:'p1',proofMessageId:'o2'});
 await game.settings.set(ID,'history',[oldReq,oldGroup]);
 const app=await api().open();await start(app,{mode:'group',title:'[TEST] New'});
 await app.handle('resolve',{disabled:false},{});
 assert.equal(game.settings.get(ID,'history')[0].name,'[TEST] New');
 app.tab='history';const html=await app._renderHTML();
 assert.ok(html.includes('[TEST] Old Group')&&html.includes('Group Check · Success'));
 assert.ok(html.includes('[TEST] Old Request')&&html.includes('Roll Request · Recorded')&&html.includes('Failure vs DC 15'));
 assert.ok(html.includes('[TEST] New')&&html.includes('Group Check · No Result'));
});
test('public API keeps the same names (no start/request functions existed to wrap)',()=>{
 assert.deepEqual(Object.keys(api()).sort(),['awardGold','conditions','contract','gold','open','playerAccess','stash','undoGoldAward','version']);
});
