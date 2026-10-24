// 0.23.0 conditions: owners apply and remove native conditions on their own characters (GM Setup switch or the
// character's unlock), GM-chosen condition controllers on every character, the overlay background slider, and no
// Configure Settings entry. Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,applyDecision,removalDecision,conditionRole,isController,withController,clampOverlayOpacity,OVERLAY_OPACITY_DEFAULT} from '../scripts/core.mjs';

const gm={id:'gm',name:'GM',isGM:true,active:true};
const alice={id:'alice',name:'Alice',isGM:false,active:true};
const bob={id:'bob',name:'Bob',isGM:false,active:true};
const carol={id:'carol',name:'Carol',isGM:false,active:true};
const mkActor=(id,name,owner,statuses,{limited=true}={})=>{const a={id,name,type:'character',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
  testUserPermission:(u,level)=>u.isGM||u.id===owner||(limited&&level==='LIMITED'),
  toggleStatusEffect:async(s,{active})=>{a.toggled.push([s,active]);if(active)a.statuses.add(s);else a.statuses.delete(s);}};return a;};

test('controller helpers: off by default, grant and revoke',()=>{
 assert.equal(isController({},'bob'),false);assert.equal(isController(undefined,'bob'),false);assert.equal(isController({bob:true},undefined),false);
 const c=withController({},'bob',true);assert.equal(isController(c,'bob'),true);
 assert.deepEqual(withController(c,'bob',false),{});assert.throws(()=>withController({},'',true),/id required/);
});
test('apply decision (0.29.2): GM anywhere; a player on their own character and on any non-player actor; not on another player\'s; controllers anywhere; native only; never read-only',()=>{
 const actor=mkActor('a1','Wren','alice',['prone']);const nativeIds=['prone','blinded','ag-strain-2'];
 const users=[gm,alice,bob,carol];
 const npc={...mkActor('n1','Goblin',null,[]),type:'npc'};
 const d=(user,statusId,o={})=>applyDecision({user,actor,statusId,nativeIds,users,...o});
 assert.equal(d(gm,'blinded').ok,true);
 assert.equal(d(alice,'blinded').ok,true,'own character: no unlock or switch needed any more');
 assert.match(d(bob,'blinded').reason,/another player's character/,'never another player\'s character');
 assert.equal(applyDecision({user:bob,actor:npc,statusId:'blinded',nativeIds,users}).ok,true,'a monster or NPC: any player');
 assert.equal(applyDecision({user:alice,actor:{...npc,type:'character'},statusId:'blinded',nativeIds,users}).ok,true,'a Character nobody plays counts as a non-player actor');
 assert.equal(d(bob,'blinded',{controllers:{bob:true}}).ok,true,'controller on any character');
 assert.match(d(gm,'thinking').reason,/Unknown native/,'Custom statuses are never applied');
 assert.match(d(gm,'ag-strain-2').reason,/Strain/,'Strain chip read only, GM too');
 assert.match(d(bob,'ag-strain-2',{controllers:{bob:true}}).reason,/Strain/);
 assert.match(d(gm,'prone').reason,/already has/);
 assert.match(applyDecision({user:gm,actor:{...actor,flags:{'ashen-gate-character-hub':{levelBackup:true}}},statusId:'blinded',nativeIds}).reason,/level backup/);
 assert.match(applyDecision({user:null,actor,statusId:'blinded'}).reason,/Unknown user/);
});
test('removal decision (0.29.2): owners and controllers remove native only; Custom stays GM; Strain refused for all',()=>{
 const actor=mkActor('a1','Wren','alice',['prone','thinking','ag-strain-1']);const nativeIds=['prone'];const users=[gm,alice,bob,carol];
 const d=(user,statusId,o={})=>removalDecision({user,actor,statusId,nativeIds,users,...o});
 assert.equal(d(alice,'prone').ok,true);
 assert.equal(d(bob,'prone',{controllers:{bob:true}}).ok,true);
 assert.match(d(bob,'thinking',{controllers:{bob:true}}).reason,/Custom/);
 assert.match(d(bob,'ag-strain-1',{controllers:{bob:true}}).reason,/Strain/);
 assert.match(d(bob,'prone',{controllers:{carol:true}}).reason,/another player's character/);
 assert.equal(conditionRole({user:{...gm,id:'bob'},actor,controllers:{}}).role,'gm');
 assert.equal(conditionRole({user:alice,actor,users}).role,'owner');
 assert.equal(conditionRole({user:bob,actor:{...actor,type:'npc'},users}).role,'player');
 assert.equal(conditionRole({user:alice,actor:{...actor,testUserPermission:()=>false}}).role,'','without a user list every Character counts as a player character');
});
test('overlay opacity clamps to 0-100 and defaults to the old 25 % look',()=>{
 assert.equal(OVERLAY_OPACITY_DEFAULT,25);assert.equal(clampOverlayOpacity(undefined),25);assert.equal(clampOverlayOpacity(''),25);assert.equal(clampOverlayOpacity('abc'),25);
 assert.equal(clampOverlayOpacity(0),0);assert.equal(clampOverlayOpacity(-5),0);assert.equal(clampOverlayOpacity(140),100);assert.equal(clampOverlayOpacity('62.4'),62);
});

// ---- Integration through main.mjs with a mocked socket ----
const handlers={once:new Map(),on:new Map()};
const settings=new Map();const registered=new Map();
const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.element={style:{props:{},setProperty(k,v){this.props[k]=v;}}};}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
const wren=mkActor('a1','Wren','alice',['prone']);
const ash=mkActor('b1','Ash','bob',['blinded']);
const hidden=mkActor('c1','Quill','carol',[],{limited:false});
const users=[gm,alice,bob,carol];users.get=id=>users.find(u=>u.id===id);
const goblin=mkActor('n1','Goblin',null,[]);goblin.type='npc';
const actors=[wren,ash,hidden,goblin];actors.get=id=>actors.find(a=>a.id===id);
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>{registered.set(key,o);settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange});},get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push([ch,msg]),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[{id:'prone',name:'Prone'},{id:'blinded',name:'Blinded'},{id:'ag-strain-1',name:'Strain 1'}]};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);
const lastReceipt=()=>sent.filter(([,m])=>m.type==='receipt').at(-1)?.[1];
const deliver=async(msg,senderId=msg.userId)=>{await socketHandler(msg,senderId);await new Promise(r=>setTimeout(r,5));};
const reset=()=>{wren.statuses=new Set(['prone']);ash.statuses=new Set(['blinded']);hidden.statuses=new Set();for(const a of actors)a.toggled.length=0;goblin.statuses=new Set();};

test('no Utilities setting is shown in Foundry\'s Configure Settings (for players or anyone)',()=>{
 assert.deepEqual([...registered].filter(([,o])=>o.config!==false).map(([k])=>k),[]);
 assert.equal(registered.get('ownersManageConditions').scope,'world');assert.equal(registered.get('ownersManageConditions').default,false);
 assert.equal(registered.get('conditionControllers').scope,'world');assert.deepEqual(registered.get('conditionControllers').default,{});
 assert.equal(registered.get('overlayOpacity').scope,'client','overlay opacity is remembered per user');
});
test('permission matrix at the GM client: own character yes, another player\'s no, linked NPC yes; refused locally too',async()=>{
 reset();game.user=gm;
 await deliver({type:'apply-status',requestId:'p1',userId:'alice',actorId:'a1',statusId:'blinded'});
 assert.deepEqual(wren.toggled,[['blinded',true]]);assert.equal(lastReceipt().ok,true,'own character, no unlock');
 await deliver({type:'apply-status',requestId:'p1b',userId:'bob',actorId:'a1',statusId:'prone'});
 assert.equal(lastReceipt().ok,false);assert.match(lastReceipt().message,/another player's character/);
 await deliver({type:'apply-status',requestId:'p1c',userId:'bob',actorId:'n1',statusId:'prone'});
 assert.equal(lastReceipt().ok,true,'a linked NPC: any player');assert.deepEqual(goblin.toggled,[['prone',true]]);
 game.user=bob;await assert.rejects(api.conditions.apply('a1','blinded'),/another player's character/,'refused locally too');game.user=gm;
});
test('only the GM can turn on owner management; then the GM client applies and removes for the owner, own character only',async()=>{
 reset();game.user=alice;await assert.rejects(api.conditions.setOwnersManage(true),/GM only/);
 game.user=gm;await api.conditions.setOwnersManage(true);assert.equal(api.conditions.ownersManage(),true);
 await deliver({type:'apply-status',requestId:'p2',userId:'alice',actorId:'a1',statusId:'blinded'});
 assert.equal(lastReceipt().ok,true);assert.match(lastReceipt().message,/Applied Blinded to Wren/);assert.ok(wren.statuses.has('blinded'));
 await deliver({type:'remove-status',requestId:'p3',userId:'alice',actorId:'a1',statusId:'prone'});
 assert.equal(lastReceipt().ok,true);assert.ok(!wren.statuses.has('prone'));
 await deliver({type:'apply-status',requestId:'p4',userId:'alice',actorId:'b1',statusId:'prone'});
 assert.match(lastReceipt().message,/another player's character/);assert.deepEqual(ash.toggled,[]);
 await deliver({type:'apply-status',requestId:'p5',userId:'alice',actorId:'a1',statusId:'ag-strain-1'});
 assert.match(lastReceipt().message,/Strain/);
 await deliver({type:'apply-status',requestId:'p6',userId:'alice',actorId:'a1',statusId:'thinking'});
 assert.match(lastReceipt().message,/Unknown native/);
 await api.conditions.setOwnersManage(false);
});
test('per-character unlock also allows apply for that character\'s owner',async()=>{
 reset();game.user=gm;await api.conditions.setUnlocked('a1',true);
 await deliver({type:'apply-status',requestId:'u1',userId:'alice',actorId:'a1',statusId:'blinded'});
 assert.equal(lastReceipt().ok,true);
 await api.conditions.setUnlocked('a1',false);
});
test('player client sends apply to the GM and never edits the Actor itself',async()=>{
 reset();game.user=gm;await api.conditions.setOwnersManage(true);game.user=alice;
 const pending=api.conditions.apply('a1','blinded');const [,req]=sent.at(-1);
 assert.equal(req.type,'apply-status');assert.equal(req.userId,'alice');assert.deepEqual(wren.toggled,[]);
 await socketHandler({type:'receipt',requestId:req.requestId,userId:'alice',ok:true,message:'Applied Blinded to Wren.'});
 assert.equal(await pending,'Applied Blinded to Wren.');
 game.user=gm;await api.conditions.setOwnersManage(false);
});
test('a player apply is refused while Player Access is off, and a forged sender is refused',async()=>{
 reset();game.user=gm;await api.conditions.setOwnersManage(true);await game.settings.set(ID,'playerAccessEnabled',false);
 await deliver({type:'apply-status',requestId:'h1',userId:'alice',actorId:'a1',statusId:'blinded'});
 assert.match(lastReceipt().message,/hidden/);assert.deepEqual(wren.toggled,[]);
 await game.settings.set(ID,'playerAccessEnabled',true);
 await deliver({type:'apply-status',requestId:'h2',userId:'alice',actorId:'a1',statusId:'blinded'},'bob');
 assert.match(lastReceipt().message,/mismatch/);assert.deepEqual(wren.toggled,[]);
 await api.conditions.setOwnersManage(false);
});
test('condition controllers: GM only, never a GM, listed, and can be revoked',async()=>{
 game.user=bob;await assert.rejects(api.conditions.setController('bob',true),/GM only/);assert.throws(()=>api.conditions.controllers(),/GM only/);
 game.user=gm;await assert.rejects(api.conditions.setController('gm',true),/GM already/);await assert.rejects(api.conditions.setController('nobody',true),/not found/);
 await api.conditions.setController('bob',true);
 assert.deepEqual(api.conditions.controllers(),[{id:'bob',name:'Bob'}]);assert.equal(api.conditions.isController('bob'),true);
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 const html=await app._renderHTML();assert.match(html,/Condition controllers: <span class="ag-badge">Bob<button[^>]*data-action="revoke-controller"[^>]*data-user="bob"/);
 app.tab='setup';const setup=await app._renderHTML();
 assert.match(setup,/<input type="checkbox" name="agu-controller" value="bob" data-setup-field checked>Bob/);assert.match(setup,/name="agu-controller" value="alice" data-setup-field >Alice/);
 assert.doesNotMatch(setup,/agu-owner-conditions/,'0.29.2: the owners-manage switch no longer decides anything and is gone from GM Setup');
 await api.conditions.setController('bob',false);assert.deepEqual(api.conditions.controllers(),[]);
});
test('a controller applies and removes native conditions on every character, sees them all, but not Custom or Strain',async()=>{
 reset();game.user=gm;await api.conditions.setController('bob',true);wren.statuses.add('thinking');wren.statuses.add('ag-strain-1');
 await deliver({type:'apply-status',requestId:'c1',userId:'bob',actorId:'a1',statusId:'blinded'});assert.equal(lastReceipt().ok,true);
 await deliver({type:'remove-status',requestId:'c2',userId:'bob',actorId:'a1',statusId:'prone'});assert.equal(lastReceipt().ok,true);
 await deliver({type:'apply-status',requestId:'c3',userId:'bob',actorId:'c1',statusId:'prone'});assert.equal(lastReceipt().ok,true,'even a character Bob cannot see');
 await deliver({type:'remove-status',requestId:'c4',userId:'bob',actorId:'a1',statusId:'thinking'});assert.match(lastReceipt().message,/Custom/);
 await deliver({type:'remove-status',requestId:'c5',userId:'bob',actorId:'a1',statusId:'ag-strain-1'});assert.match(lastReceipt().message,/Strain/);
 game.user=bob;const app=await api.open();app.tab='conditions';app.actorId='c1';
 const html=await app._renderHTML();
 assert.ok(html.includes('Quill'),'controller sees every character');assert.ok(html.includes('Condition controller'));
 assert.ok(html.includes('data-action="add-status"'),'Apply row on another player\'s character');assert.ok(!html.includes('toggle-lock'));assert.ok(!html.includes('revoke-controller'));
 assert.ok(!/<option value="ag-strain-1"/.test(html),'Strain never in the Apply list');
 const overlay=await api.conditions.openOverlay();const ov=await overlay._renderHTML();
 assert.match(ov,/data-actor="a1" data-status="blinded"/);assert.ok(!/data-status="thinking"/.test(ov));assert.ok(!/data-status="ag-strain-1"/.test(ov));
 await api.conditions.closeOverlay();
 game.user=gm;await api.conditions.setController('bob',false);
 await deliver({type:'apply-status',requestId:'c6',userId:'bob',actorId:'a1',statusId:'prone'});assert.match(lastReceipt().message,/another player's character/,'revoked at once');
 game.user=bob;app.actorId='a1';assert.ok(!(await app._renderHTML()).includes('data-action="add-status"'));assert.ok(!(await app._renderHTML()).includes('Quill'),'back to visible characters only');
 game.user=gm;
});
test('GM Setup Save Changes writes the owner switch and the controller list; nothing before',async()=>{
 game.user=gm;const app=await api.open();app.tab='setup';
 const box=(id,checked)=>({checked,id});
 const ctrl=[{name:'agu-controller',value:'alice',checked:true},{name:'agu-controller',value:'bob',checked:false}];
 const root={querySelector:sel=>{const m=/^#(.+)$/.exec(sel);if(m?.[1]==='agu-owner-conditions')return box(m[1],true);if(m?.[1]==='agu-access')return box(m[1],true);return null;},querySelectorAll:sel=>sel.includes('agu-controller')?ctrl:[]};
 assert.equal(api.conditions.ownersManage(),false);
 await app.handle('save-access',{disabled:false},root);
 assert.equal(api.conditions.ownersManage(),true);assert.deepEqual(game.settings.get(ID,'conditionControllers'),{alice:true});
 game.user=bob;await assert.rejects(app.handle('save-access',{disabled:false},root),/GM only/);game.user=gm;
 await api.conditions.setOwnersManage(false);await game.settings.set(ID,'conditionControllers',{});
});
test('owner view: Apply row on own character, never on another player\'s; Strain chip stays read only; no lock control',async()=>{
 reset();wren.statuses.add('ag-strain-1');game.user=alice;const app=await api.open();app.tab='conditions';app.actorId='a1';
 let html=await app._renderHTML();assert.ok(html.includes('data-action="add-status"'),'own character: Apply, no unlock needed');
 assert.ok(!html.includes('toggle-lock')&&!html.includes('Owner manages')&&!html.includes('Locked'));
 assert.ok(html.includes('Read only'));assert.ok(!html.includes('data-status="ag-strain-1"'),'no Remove for the Strain chip');
 app.actorId='b1';html=await app._renderHTML();assert.ok(!html.includes('data-action="add-status"'),'not her character');
 game.user=gm;
});
test('overlay: background slider set from the per-user value; header/text stay opaque (CSS variable only)',async()=>{
 game.user=alice;await game.settings.set(ID,'overlayOpacity',60);
 const overlay=await api.conditions.openOverlay();const html=await overlay._renderHTML();
 assert.match(html,/<input type="range" min="0" max="100" step="5" value="60" data-ov-opacity/);
 let fade=null;const content={innerHTML:'',querySelector:s=>s==='[data-ov-opacity]'?fade:null,querySelectorAll:()=>[]};
 const listeners={};fade={value:'60',addEventListener:(ev,fn)=>{listeners[ev]=fn;}};
 overlay._replaceHTML(html,content);assert.equal(overlay.element.style.props['--agu-ov-alpha'],'60%');
 fade.value='0';listeners.input();assert.equal(overlay.element.style.props['--agu-ov-alpha'],'0%');assert.equal(game.settings.get(ID,'overlayOpacity'),60,'input only previews');
 listeners.change();assert.equal(game.settings.get(ID,'overlayOpacity'),0,'saved on release');
 await api.conditions.closeOverlay();game.user=gm;
});
