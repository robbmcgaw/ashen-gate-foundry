// 0.22.1: the Cinders Strain chip (`ag-strain-<band>`) is shown read only: no Remove, not in the Apply list, refused by
// the remove API on the GM client, and a remove/apply that another module refuses is not reported as done.
// Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,isReadOnlyStatus,removalDecision,conditionGroups} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
// `refuse` = statuses a guard (like Cinders') refuses to change: the write resolves without error and changes nothing.
const refuse=new Set();
const mkActor=(id,name,owner,statuses)=>{const a={id,name,type:'character',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||u.id===owner||(level==='LIMITED'),
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(refuse.has(s))return undefined;if(active)a.statuses.add(s);else a.statuses.delete(s);return true;}};return a;};

test('read-only ids: only the ag-strain- prefix',()=>{
 assert.equal(isReadOnlyStatus('ag-strain-0'),true);assert.equal(isReadOnlyStatus('ag-strain-12'),true);
 for(const id of ['prone','ag-strain','strain-1','xag-strain-1','',null,undefined,3])assert.equal(isReadOnlyStatus(id),false,String(id));
});
test('removal decision refuses the Strain chip for the GM and for an unlocked owner',()=>{
 const actor=mkActor('a1','[TEST] Wren','alice',['prone','ag-strain-2']);const nativeIds=['prone','ag-strain-2'];
 const gmD=removalDecision({user:gm,actor,statusId:'ag-strain-2',unlocks:{},nativeIds});
 assert.equal(gmD.ok,false);assert.match(gmD.reason,/Strain chip.*Cinders.*Strain bar/);
 assert.equal(removalDecision({user:alice,actor,statusId:'ag-strain-2',unlocks:{a1:true},nativeIds}).ok,false);
 assert.equal(removalDecision({user:gm,actor,statusId:'prone',unlocks:{},nativeIds}).ok,true,'other statuses unchanged');
});
test('overlay groups mark the chip read only and never removable',()=>{
 const a=mkActor('a1','[TEST] Wren','alice',['prone','ag-strain-1']);
 const g=conditionGroups([a],{isNative:()=>true,canRemove:()=>true});
 assert.deepEqual(g[0].conditions,[{id:'prone',label:'prone',custom:false,readOnly:false,removable:true},{id:'ag-strain-1',label:'ag-strain-1',custom:false,readOnly:true,removable:false}]);
});

// ---- Integration through main.mjs with mocked globals ----
const handlers={once:new Map(),on:new Map()};
const settings=new Map();
const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
const wren=mkActor('a1','[TEST] Wren','alice',['prone','ag-strain-2']);
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const actors=[wren];actors.get=id=>actors.find(a=>a.id===id);
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push([ch,msg]),on:(ch,fn)=>{socketHandler=fn;}}};
// As Cinders registers them: one status per Strain band, after the native ones.
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'},{id:'ag-strain-0',name:'Strain: Band 1',hud:false},{id:'ag-strain-2',name:'Strain: Band 3',hud:false}]};
const notes=[];
globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
globalThis.confirm=()=>true;
const origConsoleError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);
const lastReceipt=()=>sent.filter(([,m])=>m.type==='receipt').at(-1)?.[1];
const deliver=async(msg,senderId=msg.userId)=>{await socketHandler(msg,senderId);await new Promise(r=>setTimeout(r,5));};
const root=value=>({querySelector:q=>q==='#agu-condition-status'?{value}:null,querySelectorAll:()=>[]});

test('Conditions view: chip listed read only with the hint, no Remove for GM or unlocked owner; Apply list leaves it out',async()=>{
 game.user=gm;await api.conditions.setUnlocked('a1',true);
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 let html=await app._renderHTML();
 assert.ok(html.includes('Strain: Band 3'),'chip shown');assert.ok(html.includes('Read only'));assert.ok(html.includes('Changed in Ashen Gate | Cinders or the Character Hub Strain bar'));
 assert.ok(html.includes('data-status="prone"'));assert.ok(!html.includes('data-status="ag-strain-2"'),'GM: no Remove');
 const select=html.match(/<select id="agu-condition-status">(.*?)<\/select>/s)[1];
 assert.ok(select.includes('value="prone"'));assert.ok(!select.includes('ag-strain-'),'not in the Apply dropdown');
 game.user=alice;html=await app._renderHTML();
 assert.ok(html.includes('data-status="prone"'));assert.ok(!html.includes('data-status="ag-strain-2"'),'owner: no Remove');
 game.user=gm;
});
test('overlay: chip shown as read only, no ×',async()=>{
 game.user=gm;const overlay=await api.conditions.openOverlay();const html=await overlay._renderHTML();
 assert.match(html,/Strain: Band 3 <small[^>]*data-tooltip="Changed in Ashen Gate \| Cinders or the Character Hub Strain bar"[^>]*>\(Read only\)<\/small><\/span><\/li>/);
 assert.ok(!html.includes('data-status="ag-strain-2"'));assert.ok(html.includes('data-status="prone"'));
 await api.conditions.closeOverlay();
});
test('API on the GM client refuses the chip before writing anything',async()=>{
 game.user=gm;wren.toggled.length=0;
 assert.equal(api.conditions.canRemove('a1','ag-strain-2'),false);
 await assert.rejects(api.conditions.remove('a1','ag-strain-2'),/Strain chip.*Cinders/);
 assert.deepEqual(wren.toggled,[]);assert.ok(wren.statuses.has('ag-strain-2'));
});
test('a forged player socket request for the chip is refused by the GM client',async()=>{
 game.user=gm;wren.toggled.length=0;
 await deliver({type:'remove-status',requestId:'s1',userId:'alice',actorId:'a1',statusId:'ag-strain-2'});
 assert.equal(lastReceipt().ok,false);assert.match(lastReceipt().message,/Strain chip/);assert.deepEqual(wren.toggled,[]);
});
test('Apply refuses a chip id even if the dropdown is tampered with',async()=>{
 game.user=gm;wren.toggled.length=0;
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 await assert.rejects(app.handle('add-status',{disabled:false,dataset:{}},root('ag-strain-0')),/can't be applied here/);
 assert.deepEqual(wren.toggled,[]);
});
test('a remove that something refuses is not reported as done',async()=>{
 game.user=gm;wren.statuses.add('prone');refuse.add('prone');
 try{
  await assert.rejects(api.conditions.remove('a1','prone'),/Prone is still on \[TEST\] Wren/);
  await deliver({type:'remove-status',requestId:'s2',userId:'alice',actorId:'a1',statusId:'prone'});
  assert.equal(lastReceipt().ok,false);assert.match(lastReceipt().message,/still on/);
 }finally{refuse.delete('prone');}
 assert.equal(await api.conditions.remove('a1','prone'),'Removed Prone from [TEST] Wren.','normal removal still reports success');
});
test('an apply that something refuses reports an error, not silence',async()=>{
 game.user=gm;refuse.add('blinded');
 try{
  const app=await api.open();app.tab='conditions';app.actorId='a1';
  await assert.rejects(app.handle('add-status',{disabled:false,dataset:{}},root('blinded')),/Blinded was not applied/);
  assert.ok(!wren.statuses.has('blinded'));
 }finally{refuse.delete('blinded');}
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 await app.handle('add-status',{disabled:false,dataset:{}},root('blinded'));
 assert.ok(wren.statuses.has('blinded'));
 console.error=origConsoleError;
});
