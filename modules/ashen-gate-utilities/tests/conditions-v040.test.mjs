// v0.4.0 conditions: per-character removal locks enforced by the GM client, the shared player view
// and the overlay markup. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,isUnlocked,withUnlocked,removalDecision,conditionGroups} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const bob={id:'bob',name:'Bob',isGM:false,active:true};
const mkActor=(id,name,owner,statuses)=>{const a={id,name,type:'character',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||u.id===owner||(level==='LIMITED'),
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(!active)a.statuses.delete(s);}};return a;};

test('lock helpers: locked by default, unlock and relock',()=>{
 assert.equal(isUnlocked({},'a1'),false);assert.equal(isUnlocked(undefined,'a1'),false);
 const u=withUnlocked({},'a1',true);assert.equal(isUnlocked(u,'a1'),true);
 assert.deepEqual(withUnlocked(u,'a1',false),{});
 assert.throws(()=>withUnlocked({},'',true),/id required/);
});
test('removal decision (0.29.2): GM always, owner on their own character, native only, never for another player\'s',()=>{
 const actor=mkActor('a1','Wren','alice',['prone','thinking']);const nativeIds=['prone'];const users=[gm,alice,bob];
 const d=(user,statusId)=>removalDecision({user,actor,statusId,nativeIds,users});
 assert.equal(d(gm,'prone').ok,true);assert.equal(d(gm,'thinking').ok,true,'GM can always remove Custom');
 assert.equal(d(alice,'prone').ok,true,'no unlock needed');
 assert.match(d(alice,'thinking').reason,/Custom/);
 assert.match(d(bob,'prone').reason,/another player's character/);
 assert.match(d(gm,'blinded').reason,/does not have/);
 assert.match(removalDecision({user:null,actor,statusId:'prone'}).reason,/Unknown user/);
});
test('overlay groups only list characters with conditions and mark removable/custom',()=>{
 const a=mkActor('a1','Wren','alice',['prone','thinking']),b=mkActor('b1','Ash','bob',[]);
 const g=conditionGroups([a,b],{label:x=>x.toUpperCase(),isNative:x=>x==='prone',canRemove:(_,x)=>x==='prone'});
 assert.deepEqual(g,[{actorId:'a1',name:'Wren',conditions:[{id:'prone',label:'PRONE',custom:false,readOnly:false,removable:true},{id:'thinking',label:'THINKING',custom:true,readOnly:false,removable:false}]}]);
});

// ---- Integration through main.mjs with a mocked socket ----
const handlers={once:new Map(),on:new Map()};
const settings=new Map();
const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
const wren=mkActor('a1','Wren','alice',['prone','thinking']);
const ash=mkActor('b1','Ash','bob',['blinded']);
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[wren,ash];actors.get=id=>actors.find(a=>a.id===id);
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push([ch,msg]),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'}]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{}};
globalThis.confirm=()=>true;
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);
const lastReceipt=()=>sent.filter(([,m])=>m.type==='receipt').at(-1)?.[1];
const deliver=async(msg,senderId=msg.userId)=>{await socketHandler(msg,senderId);await new Promise(r=>setTimeout(r,5));};

test('module socket channel is registered',()=>{assert.equal(typeof socketHandler,'function');});
test('GM client lets an owner remove a native condition from their own character',async()=>{
 game.user=gm;
 await deliver({type:'remove-status',requestId:'r1',userId:'alice',actorId:'a1',statusId:'prone'});
 assert.deepEqual(wren.toggled,[['prone',false]]);assert.equal(lastReceipt().ok,true);assert.equal(lastReceipt().userId,'alice');
});
test('only a GM can set the old unlock (kept harmlessly); it changes nothing about who may remove',async()=>{
 game.user=alice;await assert.rejects(api.conditions.setUnlocked('a1',true),/GM only/);
 game.user=gm;await api.conditions.setUnlocked('a1',true);assert.equal(api.conditions.isUnlocked('a1'),true);
 wren.statuses.add('prone');wren.toggled.length=0;
 await deliver({type:'remove-status',requestId:'r2',userId:'alice',actorId:'a1',statusId:'prone'});
 assert.deepEqual(wren.toggled,[['prone',false]]);assert.equal(lastReceipt().ok,true);
});
test('another player cannot remove a player character\'s conditions',async()=>{
 wren.statuses.add('prone');wren.toggled.length=0;
 await deliver({type:'remove-status',requestId:'r3',userId:'bob',actorId:'a1',statusId:'prone'});
 assert.deepEqual(wren.toggled,[]);assert.match(lastReceipt().message,/another player's character/);
});
test('a forged requester id is rejected when the sender id disagrees',async()=>{
 await deliver({type:'remove-status',requestId:'r4',userId:'alice',actorId:'a1',statusId:'prone'},'bob');
 assert.deepEqual(wren.toggled,[]);assert.match(lastReceipt().message,/mismatch/);
});
test('Custom statuses stay GM-only even when unlocked',async()=>{
 await deliver({type:'remove-status',requestId:'r5',userId:'alice',actorId:'a1',statusId:'thinking'});
 assert.match(lastReceipt().message,/Custom/);
});
test('non-primary GM clients and player clients ignore removal requests',async()=>{
 game.user=alice;const before=sent.length;
 await deliver({type:'remove-status',requestId:'r6',userId:'bob',actorId:'b1',statusId:'blinded'});
 assert.equal(sent.length,before);assert.deepEqual(ash.toggled,[]);game.user=gm;
});
test('player API asks the GM for their own character and refuses locally for another player\'s',async()=>{
 game.user=alice;
 await assert.rejects(api.conditions.remove('b1','blinded'),/another player's character/);
 game.user=bob;
 const pending=api.conditions.remove('b1','blinded');
 const [,req]=sent.at(-1);assert.equal(req.type,'remove-status');assert.equal(req.userId,'bob');assert.deepEqual(ash.toggled,[],'player client never edits the Actor itself');
 await socketHandler({type:'receipt',requestId:req.requestId,userId:'bob',ok:true,message:'Removed Blinded from Ash.'});
 assert.equal(await pending,'Removed Blinded from Ash.');
 game.user=gm;
});
test('players get the same conditions view, with Remove only where permitted and no lock control',async()=>{
 wren.statuses=new Set(['prone','thinking']);ash.statuses=new Set(['blinded']);
 game.user=alice;const app=await api.open();app.tab='conditions';app.actorId='a1';
 let html=await app._renderHTML();
 assert.ok(html.includes('Party Characters')&&html.includes('Wren')&&html.includes('Ash'),'sees visible party characters');
 assert.ok(html.includes('data-status="prone"'));assert.ok(!html.includes('data-status="thinking"'),'no Remove for Custom');
 assert.ok(!html.includes('toggle-lock'));assert.ok(!html.includes('Unlocked'));
 app.actorId='b1';html=await app._renderHTML();assert.ok(!html.includes('data-action="remove-status"'),'not owner: no Remove');
 game.user=gm;html=await app._renderHTML();assert.ok(!html.includes('toggle-lock'),'the lock control is gone for the GM too');
});
test('overlay: a card per character with condition chips, × only where removal is permitted',async()=>{
 game.user=alice;
 const overlay=await api.conditions.openOverlay();assert.equal(game.settings.get(ID,'overlayOpen'),true);
 const html=await overlay._renderHTML();
 assert.match(html,/<span class="agu-ov-name">Wren<\/span>[\s\S]*<li class="agu-ov-chip"><img class="agu-status-icon" src="[^"]*" alt=""><span>Prone<\/span><button[^>]*data-ov-remove[^>]*data-status="prone"/);
 assert.match(html,/<li class="agu-ov-chip"><img class="agu-status-icon" src="[^"]*" alt=""><span>thinking <small>\(Custom\)<\/small><\/span><\/li>/,'Custom shown without ×');
 assert.match(html,/<span class="agu-ov-name">Ash<\/span>[\s\S]*?<li class="agu-ov-chip"><img class="agu-status-icon" src="[^"]*" alt=""><span>Blinded<\/span><\/li>/,'another player\'s character: no ×');
 game.user=gm;const gmHtml=await overlay._renderHTML();assert.equal((gmHtml.match(/data-ov-remove/g)||[]).length,3,'GM can remove everything');
 game.user=alice;
});
test('overlay is a per-user setting, remembers its position and closing it turns it off',async()=>{
 const overlay=await api.conditions.openOverlay();
 overlay._onPosition({left:40,top:60,width:250,height:'auto'});await new Promise(r=>setTimeout(r,450));
 assert.deepEqual(game.settings.get(ID,'overlayPosition'),{left:40,top:60,width:250});
 assert.equal(settings.get(`${ID}.overlayOpen`)!==undefined,true);
 await overlay.close();assert.equal(game.settings.get(ID,'overlayOpen'),false);
 const again=await api.conditions.openOverlay();assert.notEqual(again,overlay);assert.deepEqual(again.options.position,{left:40,top:60,width:250});
 await api.conditions.closeOverlay();game.user=gm;
});
test('live updates: Actor and effect changes re-render the open overlay',async()=>{
 const overlay=await api.conditions.openOverlay();let renders=0;const orig=overlay.render.bind(overlay);overlay.render=async(...a)=>{renders++;return orig(...a);};
 handlers.on.get('deleteActiveEffect')();handlers.on.get('updateActor')();
 assert.equal(renders,2);
});
