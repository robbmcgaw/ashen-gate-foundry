// 0.13.0: api.rolls.open prefills the Start Rolls form (GM only). Mocked Foundry globals: proves the gate,
// the prefill and that nothing starts until Start Rolls, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,rollPrefill} from '../scripts/core.mjs';


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

test('rollPrefill normalises requests and refuses unclear ones',()=>{
 const ids=['pc1','pc2'];
 assert.deepEqual(rollPrefill({skills:['sur'],mode:'group'},{characterIds:ids}),{mode:'group',skills:['sur'],dc:15,actorIds:null,title:''});
 assert.deepEqual(rollPrefill({skills:['sur','prc','bogus'],mode:'individual',dc:'',actorIds:['pc2','ghost'],title:'[TEST] Forage'},{characterIds:ids}),{mode:'individual',skills:['sur'],dc:null,actorIds:['pc2'],title:'[TEST] Forage'});
 assert.equal(rollPrefill({skills:'sur',dc:12}).dc,12);
 assert.throws(()=>rollPrefill({skills:['sur'],mode:'solo'}),/group' or 'individual/);
 assert.throws(()=>rollPrefill({skills:['bogus']}),/at least one skill/);
 assert.throws(()=>rollPrefill({skills:['sur'],dc:101}),/DC must/);
 assert.throws(()=>rollPrefill({skills:['sur'],dc:'x'}),/DC must/);
});
test('api.rolls.open is GM only',async()=>{
 await reset();game.user=player;
 await assert.rejects(api().rolls.open({skills:['sur'],mode:'group'}),/GM only/);
 game.user=gm;
 assert.equal(api().rolls.contract,'ag-utilities-rolls/1');assert.deepEqual(api().rolls.modes,['group','individual']);
});
test('api.rolls.open fills in the form and starts nothing; Start Rolls uses the form',async()=>{
 await reset();
 const out=await api().rolls.open({skills:['sur'],mode:'individual',dc:14,actorIds:['pc3'],title:'[TEST] Navigate'});
 assert.equal(out.busy,false);assert.deepEqual(game.settings.get(ID,'activeSession'),{});
 const html=await out.app._renderHTML();
 assert.ok(html.includes('value="individual" checked'));
 assert.match(html,/data-skill="sur" aria-pressed="true"/);assert.doesNotMatch(html,/data-skill="ath" aria-pressed="true"/);
 assert.match(html,/value="pc3" checked/);assert.doesNotMatch(html,/value="pc1" checked/);
 assert.match(html,/id="agu-dc"[^>]*value="14"/);assert.match(html,/value="\[TEST\] Navigate"/);
 await start(out.app,{mode:'individual',title:'[TEST] Navigate',actors:['pc3'],skills:['nat'],dc:'14'});
 const s=game.settings.get(ID,'activeSession');assert.deepEqual(s.skills,['nat'],'the GM can change the skill before starting');
 assert.equal(out.app.rollPrefill,null,'the prefill is used once');
 const again=await api().rolls.open({skills:['sur'],mode:'group',dc:null});
 assert.equal(again.busy,true);
 const html2=await again.app._renderHTML();assert.doesNotMatch(html2,/data-action="start"/,'a running roll is not replaced');
 assert.equal(game.settings.get(ID,'activeSession').id,s.id);
});
