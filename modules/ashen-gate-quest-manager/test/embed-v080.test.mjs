// 0.8.0: api.embed.mount(element, {actorId, mode}). Mocked Foundry and a fake element: proves visibility, routing and checks, not the live UI.
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
const notes=[];globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),error:m=>notes.push(['error',m])}};
globalThis.game={user:gm,settings:{register:(module,name,def)=>settingsDefs.set(name,def),get:(module,key)=>key==='playerAccessEnabled'?playerAccess:packIds,set:async(module,key,val)=>{if(key==='playerAccessEnabled')playerAccess=val;else packIds=val;settingsDefs.get(key)?.onChange?.();}},journal:questDocs,actors,users:[gm,alice,bob],modules:{get:id=>id===MOD?module:null}};
await import('../scripts/main.mjs');
once.get('init')();once.get('ready')();

const api=module.api;
const tick=()=>new Promise(r=>setTimeout(r,0));
const origError=console.error;console.error=()=>{};
function fakeElement(){
 const listeners=[];
 const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
  classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
  addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
  contains:()=>true,querySelector:()=>null,
  fire(type,target){for(const l of listeners.filter(x=>x.type===type))l.fn({target,stopPropagation(){},preventDefault(){}});}};
 return el;
}
const button=(action,data={},extra={})=>{const b={dataset:{action,...data},...extra};b.closest=sel=>sel==='[data-action]'?b:null;return b;};

test('owner: party and own individual quests, first one selected with its objectives',async()=>{
 game.user=alice;playerAccess=true;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA',mode:'character'});await tick();
 assert.ok(el.classes.has('ag-quest-embed'));
 assert.match(el.innerHTML,/Safe &amp; Public/);
 assert.match(el.innerHTML,/Find &lt;trail&gt;/,'objectives escaped');
 assert.match(el.innerHTML,/Alice actor <small>0<\/small>/,'secret individual quest is not visible to Alice (no permission on its projection)');
 assert.match(el.innerHTML,/data-action="open-log"/);
 view.unmount();assert.equal(el.innerHTML,'');assert.equal(el.listeners.length,0);
});

test('GM sees the individual quest for that character',async()=>{
 game.user=gm;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA'});await tick();
 assert.match(el.innerHTML,/Not for Bob/);
 view.unmount();
});

test('Bob (no permission on either projection) sees no quests; Player Access off hides everything',async()=>{
 game.user=bob;playerAccess=true;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA'});await tick();
 assert.doesNotMatch(el.innerHTML,/Safe|Not for Bob/);
 playerAccess=false;view.refresh();await tick();
 assert.match(el.innerHTML,/hidden the Quest Log/);
 playerAccess=true;view.unmount();
});

test('Track goes through the same tracking store; select and search re-render',async()=>{
 game.user=alice;playerAccess=true;alice.savedFlag=null;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA'});await tick();
 el.fire('click',button('track',{id:'QUEST-PUBLIC'},{checked:true}));for(let i=0;i<4;i++)await tick();
 assert.deepEqual(alice.savedFlag.ids,['QUEST-PUBLIC']);
 el.fire('input',{id:'ag-quest-search',value:'zzz'});await tick();
 assert.doesNotMatch(el.innerHTML,/Safe &amp; Public/);
 view.unmount();
});

test('window-only and GM actions are ignored by the embed; Track of an invisible quest is refused',async()=>{
 game.user=bob;playerAccess=true;notes.length=0;bob.savedFlag=null;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA'});await tick();
 el.fire('click',button('delete'));await tick();
 assert.equal(notes.length,0,'GM-only delete is not routed from the embed');
 el.fire('click',button('track',{id:'QUEST-SECRET'},{checked:true}));for(let i=0;i<4;i++)await tick();
 assert.ok(notes.some(([k,m])=>k==='error'&&/no longer visible/.test(m)),JSON.stringify(notes));
 assert.equal(bob.savedFlag,null);
 view.unmount();
});

test('detached element unmounts itself; bad arguments throw',async()=>{
 game.user=alice;
 const el=fakeElement();const view=api.embed.mount(el,{actorId:'actorA'});await tick();
 el.isConnected=false;await view.refresh();assert.equal(el.listeners.length,0);
 assert.throws(()=>api.embed.mount(null),/DOM element/);
 assert.throws(()=>api.embed.mount(fakeElement(),{mode:'gm'}),/Unknown embed mode/);
 assert.deepEqual(api.embed.modes,['character']);
 console.error=origError;
});
