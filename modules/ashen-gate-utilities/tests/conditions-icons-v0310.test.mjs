// 0.31.0: only toggleable conditions are offered (no "cover" group name), the icon chain, GM-only custom icons, friendly toggle errors.
// Mocked Foundry globals: proves the logic and the markup, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,statusEntries,statusIsToggleable,manualStatusEntries,statusGroups,sharedConditionChoices,applyDecision,CONDITION_ICON_FALLBACK,cleanIconPath,cleanConditionIcons,resolveConditionIcon,conditionIconChange,friendlyStatusError} from '../scripts/core.mjs';

// The shape of dnd5e 6.0.6's registry (keyed by id), cover trio included.
const registry={prone:{name:'Prone',img:'systems/dnd5e/icons/svg/statuses/prone.svg'},burning:{name:'Burning',img:'systems/dnd5e/icons/svg/statuses/burning.svg'},
 coverHalf:{name:'Half Cover',img:'h.svg',exclusiveGroup:'cover',order:2},coverThreeQuarters:{name:'Three-Quarters Cover',img:'t.svg',exclusiveGroup:'cover',order:3},coverTotal:{name:'Total Cover',img:'f.svg',exclusiveGroup:'cover',order:4},
 heavilyEncumbered:{name:'Heavily Encumbered',img:'e.svg',hud:false},cover:{name:'Cover',img:'c.svg'},'ag-strain-1':{name:'Strain',img:'s.svg'},exhaustion:{name:'Exhaustion'}};

test('toggleable: a registry key, in an object, a Map or an array; never a group name, alias or typo',()=>{
 assert.equal(statusIsToggleable(registry,'coverHalf'),true);
 assert.equal(statusIsToggleable({a:{}},'b'),false);
 assert.equal(statusIsToggleable({a:null},'a'),false);
 assert.equal(statusIsToggleable({},'toString'),false,'inherited names are not statuses');
 assert.equal(statusIsToggleable(new Map([['x',{}]]),'x'),true);
 assert.equal(statusIsToggleable([{id:'x'}],'x'),true);
 assert.equal(statusIsToggleable([{id:'x'}],'y'),false);
 assert.equal(statusIsToggleable(null,'x'),false);assert.equal(statusIsToggleable(registry,''),false);assert.equal(statusIsToggleable(registry,7),false);
});

test('the offered list: the group name "cover" and automatic effects are out, Half / Three-Quarters / Total Cover are separate choices',()=>{
 const entries=statusEntries(registry);
 const ids=manualStatusEntries(entries).map(e=>e.id);
 assert.ok(!ids.includes('cover'),'cover is the exclusive group, not a status to toggle');
 assert.ok(!ids.includes('heavilyEncumbered'));
 for(const id of ['coverHalf','coverThreeQuarters','coverTotal','prone','burning','exhaustion'])assert.ok(ids.includes(id),id);
 const list=sharedConditionChoices(entries,{registry,label:id=>registry[id].name});
 assert.deepEqual(list.map(c=>c.label),['Burning','Exhaustion','Half Cover','Prone','Three-Quarters Cover','Total Cover'].sort((a,b)=>a.localeCompare(b)));
 assert.ok(!list.some(c=>c.id==='ag-strain-1'),'read-only Strain chip stays out');
 assert.ok(list.every(c=>statusIsToggleable(registry,c.id)),'every offered id can be toggled');
 assert.deepEqual(statusGroups(entries),{cover:['coverHalf','coverThreeQuarters','coverTotal']});
});

test('an id the registry does not hold is never offered, even if an entry names it',()=>{
 const entries=[{id:'ghost',name:'Ghost'},{id:'prone',name:'Prone'}];
 assert.deepEqual(sharedConditionChoices(entries,{registry}).map(c=>c.id),['prone']);
});

test('apply is limited to the offered ids (applyIds), removal keeps every registry key',()=>{
 const actor={id:'a',name:'A',statuses:new Set(),testUserPermission:()=>true},user={id:'gm',isGM:true};
 const all=Object.keys(registry);
 assert.equal(applyDecision({user,actor,statusId:'cover',nativeIds:all,applyIds:['coverHalf'],users:[user]}).ok,false);
 assert.equal(applyDecision({user,actor,statusId:'coverHalf',nativeIds:all,applyIds:['coverHalf'],users:[user]}).ok,true);
 assert.equal(applyDecision({user,actor,statusId:'cover',nativeIds:all,users:[user]}).ok,true,'without applyIds the old rule holds');
});

test('icon chain: custom > the status image > generic',()=>{
 assert.equal(resolveConditionIcon({custom:'worlds/x/burn.webp',status:{img:'s.svg'}}),'worlds/x/burn.webp');
 assert.equal(resolveConditionIcon({custom:'',status:{img:'s.svg'}}),'s.svg');
 assert.equal(resolveConditionIcon({custom:'javascript:alert(1).png',status:{img:'s.svg'}}),'s.svg','a bad custom value is ignored');
 assert.equal(resolveConditionIcon({status:{icon:'old.png'}}),'old.png');
 assert.equal(resolveConditionIcon({status:{}}),CONDITION_ICON_FALLBACK);assert.equal(resolveConditionIcon(),CONDITION_ICON_FALLBACK);
 const list=sharedConditionChoices(statusEntries(registry),{registry,label:id=>registry[id].name,icons:{prone:'worlds/x/prone.webp'}});
 assert.deepEqual(list.find(c=>c.id==='prone'),{id:'prone',label:'Prone',img:'worlds/x/prone.webp',custom:true});
 assert.equal(list.find(c=>c.id==='exhaustion').img,CONDITION_ICON_FALLBACK);
});

test('icon paths: images only, relative or https, nothing scriptable',()=>{
 for(const ok of ['worlds/a/b.webp','modules/x/y.PNG','https://assets.forge-vtt.com/a/b.jpg','icons/svg/aura.svg?v=2','  worlds/a.avif  '])assert.ok(cleanIconPath(ok),ok);
 for(const bad of ['','worlds/a/b.txt','javascript:alert(1).png','data:image/png;base64,AA.png','http://x/y.png','//evil/y.png','worlds/a"onerror=1.png','a<b>.png','x\\y.png',null,7,{},'a'.repeat(400)+'.png'])assert.equal(cleanIconPath(bad),'',String(bad).slice(0,30));
});

test('saved icons: unknown conditions and bad values are ignored on read',()=>{
 assert.deepEqual(cleanConditionIcons({prone:'worlds/p.webp',ghost:'worlds/g.webp',burning:'nope.txt',x:{}},['prone','burning']),{prone:'worlds/p.webp'});
 for(const raw of [null,undefined,'x',[],7])assert.deepEqual(cleanConditionIcons(raw,['prone']),{});
});

test('setting an icon is GM only and only for a condition that exists',()=>{
 const gm={isGM:true},player={isGM:false},validIds=['prone','burning'];
 const set=conditionIconChange({user:gm,icons:{},id:'prone',path:'worlds/p.webp',validIds});
 assert.deepEqual([set.ok,set.icons],[true,{prone:'worlds/p.webp'}]);
 assert.equal(conditionIconChange({user:player,icons:{},id:'prone',path:'worlds/p.webp',validIds}).ok,false,'players are refused in the write');
 assert.equal(conditionIconChange({user:null,icons:{},id:'prone',path:'worlds/p.webp',validIds}).ok,false);
 assert.match(conditionIconChange({user:player,icons:{},id:'prone',path:'worlds/p.webp',validIds}).reason,/Only the GM/);
 assert.equal(conditionIconChange({user:gm,icons:{},id:'cover',path:'worlds/p.webp',validIds}).ok,false,'nothing is stored for a condition that does not exist');
 assert.equal(conditionIconChange({user:gm,icons:{},id:'prone',path:'worlds/p.txt',validIds}).ok,false);
 const reset=conditionIconChange({user:gm,icons:{prone:'worlds/p.webp',burning:'worlds/b.webp',ghost:'worlds/g.webp'},id:'prone',path:'',validIds});
 assert.deepEqual([reset.ok,reset.reset,reset.icons],[true,true,{burning:'worlds/b.webp'}],'reset drops only that one; stale ids are pruned');
});

test('friendly error: one line, the condition and the character named, no raw id or stack',()=>{
 const e=friendlyStatusError(new Error('Invalid status ID "cover" provided to Actor#toggleStatusEffect'),{label:'Half Cover',actorName:'Quest',verb:'apply'});
 assert.equal(e,"Couldn't apply Half Cover to Quest: Foundry doesn't recognise that condition.");
 assert.equal(friendlyStatusError(new Error('Invalid status ID "x"'),{label:'Burning',actorName:'Quest',verb:'remove'}),"Couldn't remove Burning from Quest: Foundry doesn't recognise that condition.");
 assert.equal(friendlyStatusError(new Error('Boom "abc"\n  at x (file.js:1)'),{label:'Prone',actorName:'Quest'}),"Couldn't apply Prone to Quest: Boom.");
 assert.equal(friendlyStatusError(new Error('y'.repeat(500)),{label:'Prone',actorName:'Quest'}),"Couldn't apply Prone to Quest.");
 assert.equal(friendlyStatusError(null),"Couldn't apply that condition to the character.");
});

/* ---- the module itself, with mocked Foundry ---- */
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true};
const users=[gm,alice];users.get=id=>users.find(u=>u.id===id);
const mk=(id,name,owner,statuses=[])=>{const a={id,name,type:'character',img:'',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
 testUserPermission:(u,level)=>u.isGM||u.id===owner||level==='LIMITED',
 toggleStatusEffect:async(s,{active})=>{await null;a.toggled.push([s,active]);if(!(s in CONFIG.statusEffects))throw new Error(`Invalid status ID "${s}" provided to Actor#toggleStatusEffect`);if(active)a.statuses.add(s);else a.statuses.delete(s);}};return a;};
const quest=mk('q1','[TEST] Quest','alice',['burning','mystery']);
const actors=[quest];actors.get=id=>actors.find(a=>a.id===id);
const settings=new Map(),handlers={once:new Map(),on:new Map()};
globalThis.HTMLElement=class {};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.element={style:{props:{},setProperty(k,v){this.props[k]=v;}}};}async render(){this.rendered=true;return this;}async close(){this.rendered=false;}}}}};
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit(){},on(){}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:{...registry}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api.conditions;
await game.settings.set(ID,'playerAccessEnabled',true);

test('the shared list the Hub reads offers no "cover" and carries icons (custom first)',async()=>{
 game.user=gm;
 const ids=api.choices().map(c=>c.id);
 assert.ok(!ids.includes('cover')&&!ids.includes('heavilyEncumbered')&&!ids.includes('ag-strain-1'));
 assert.ok(ids.includes('coverHalf')&&ids.includes('coverTotal'));
 assert.ok(api.choices().every(c=>typeof c.img==='string'&&c.img));
 await api.icons.set('prone','worlds/test/prone.webp');
 assert.equal(api.choices().find(c=>c.id==='prone').img,'worlds/test/prone.webp');
 assert.deepEqual(api.icons.get(),{prone:'worlds/test/prone.webp'});
});

test('icons: the GM sets and resets; a player is refused in the API; unknown conditions are refused',async()=>{
 game.user=gm;
 await api.icons.set('burning','worlds/test/burn.png');
 assert.equal(api.icons.get().burning,'worlds/test/burn.png');
 await api.icons.reset('burning');assert.equal(api.icons.get().burning,undefined);
 await api.icons.set('mystery','worlds/test/m.png');
 assert.equal(api.icons.get().mystery,'worlds/test/m.png','a Custom status that is on a character may hold an icon');
 await assert.rejects(()=>api.icons.set('cover','worlds/test/c.png'),/does not exist/);
 await assert.rejects(()=>api.icons.set('prone','notes.txt'),/image file/);
 assert.equal(api.icons.get().cover,undefined);
 game.user=alice;
 await assert.rejects(()=>api.icons.set('prone','worlds/test/x.png'),/Only the GM/);
 await assert.rejects(()=>api.icons.reset('prone'),/Only the GM/);
 assert.equal(api.icons.get().prone,'worlds/test/prone.webp','the player\'s attempts changed nothing');
 game.user=gm;
});

test('stored junk is ignored when read and never shown',async()=>{
 await game.settings.set(ID,'conditionIcons',{prone:'worlds/test/prone.webp',cover:'worlds/test/c.png',burning:'javascript:alert(1).png',coverHalf:{}});
 assert.deepEqual(api.icons.get(),{prone:'worlds/test/prone.webp'});
});

test('Apply refuses the group name "cover" and an Apply that Foundry rejects reads as one friendly line',async()=>{
 game.user=gm;
 await assert.rejects(()=>api.apply('q1','cover'),/Unknown native status/);
 assert.deepEqual(quest.toggled,[],'nothing was sent to Foundry');
 // A status that is offered but that the core then refuses (simulated: removed from the registry after the list was built).
 const keep=CONFIG.statusEffects.burning;quest.statuses.clear();
 const apply=api.apply('q1','prone');delete CONFIG.statusEffects.prone;
 await assert.rejects(apply,e=>{assert.match(e.message,/^Couldn't apply [Pp]rone to \[TEST\] Quest: Foundry doesn't recognise that condition\.$/);assert.doesNotMatch(e.message,/Invalid status|Actor#|"/);return true;});
 CONFIG.statusEffects.prone=registry.prone;CONFIG.statusEffects.burning=keep;
});

test('Remove that Foundry rejects reads as one friendly line too',async()=>{
 game.user=gm;quest.statuses=new Set(['burning']);const keep=CONFIG.statusEffects.burning;
 const rm=api.remove('q1','burning');delete CONFIG.statusEffects.burning;
 await assert.rejects(rm,e=>{assert.match(e.message,/^Couldn't remove .* from \[TEST\] Quest: Foundry doesn't recognise that condition\.$/);return true;});
 CONFIG.statusEffects.burning=keep;
});
