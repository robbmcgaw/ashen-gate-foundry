// 0.26.1 conditions fixes: (1) the Apply list reads CONFIG.statusEffects keyed by id (Foundry V14 / dnd5e 6), marks
// exactly one option selected (every option used to carry `selected`, so the browser showed the last one and Apply sent
// it after any re-render), and Apply passes Foundry's toggleStatusEffect an id it knows; (2) the overlay slider sets the
// window background inline and again after a pop-out to its own browser window.
// Mocked Foundry globals: proves the logic, not the live Foundry UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,statusEntries,resolveStatusId,STATUS_ALIASES,overlayBackground} from '../scripts/core.mjs';

test('statusEntries reads the V14 record, an older array and a Map; each id once; the record key is the id',()=>{
 assert.deepEqual(statusEntries({prone:{name:'Prone'},blinded:{id:'blinded',name:'Blinded'}}).map(x=>x.id),['prone','blinded']);
 assert.deepEqual(statusEntries([{id:'prone'},{id:'prone'},{name:'no id'},null,{id:'dead'}]).map(x=>x.id),['prone','dead']);
 assert.deepEqual(statusEntries(new Map([['stunned',{name:'Stunned'}]])).map(x=>x.id),['stunned']);
 assert.equal(statusEntries({oops:{id:'other',name:'X'}})[0].id,'oops','the key Foundry looks up wins');
 assert.deepEqual(statusEntries(undefined),[]);assert.deepEqual(statusEntries('x'),[]);
});
test('aliases map older status ids only when the given id is not native and the alias is',()=>{
 const ids=['blinded','prone'];
 assert.equal(resolveStatusId('blind',ids),'blinded');assert.equal(resolveStatusId('prone',ids),'prone');
 assert.equal(resolveStatusId('stun',ids),'stun','alias target absent: unchanged, refused later as unknown');
 assert.equal(resolveStatusId('blind',['blind','blinded']),'blind','a native id is never remapped');
 assert.equal(STATUS_ALIASES.paralysis,'paralyzed');
});

// ---- Integration through main.mjs; toggleStatusEffect behaves like Foundry V14 (looks the id up by key) ----
const gm={id:'gm',name:'GM',isGM:true,active:true};
const handlers={once:new Map(),on:new Map()};const settings=new Map();
const mkActor=(id,name,statuses)=>{const a={id,name,type:'character',statuses:new Set(statuses),effects:[],items:[],toggled:[],getFlag:()=>null,
 testUserPermission:()=>true,
 toggleStatusEffect:async(s,{active})=>{if(!CONFIG.statusEffects[s])throw Error(`Invalid status ID "${s}" provided to Actor#toggleStatusEffect`);a.toggled.push([s,active]);if(active)a.statuses.add(s);else a.statuses.delete(s);}};return a;};
globalThis.HTMLElement=class {};
const mkElement=()=>{const content={style:{props:{},setProperty(k,v,p){this.props[k]=p?`${v} !${p}`:v;}}};let fade=null;
 return {content,setFade:f=>{fade=f;},style:{props:{},setProperty(k,v,p){this.props[k]=p?`${v} !${p}`:v;}},querySelector:s=>s==='.window-content'?content:s==='[data-ov-opacity]'?fade:null};};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.element=mkElement();}async render(){this.rendered=true;return this;}async close(){this.rendered=false;this._onClose?.({});}}}}};
const wren=mkActor('a1','Wren',[]);
const users=[gm];users.get=id=>users.find(u=>u.id===id);
const actors=[wren];actors.get=id=>actors.find(a=>a.id===id);
globalThis.game={user:gm,users,actors,modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:()=>{},on:()=>{}}};
// dnd5e 6 on V14: a record keyed by id (no array methods), with the Cinders Strain chip and a status listed last.
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:{prone:{id:'prone',name:'Prone'},blinded:{id:'blinded',name:'Blinded'},'ag-strain-1':{id:'ag-strain-1',name:'Strain 1'},stable:{id:'stable',name:'Stable'}}};
globalThis.ui={notifications:{info:()=>{},warn:()=>{},error:()=>{}}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
await import('../scripts/main.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;

/** What a browser shows as a single select's value: the last option marked selected, else the first option. */
const browserValue=html=>{const sel=/<select id="agu-condition-status">([\s\S]*?)<\/select>/.exec(html)?.[1]??'';
 const opts=[...sel.matchAll(/<option value="([^"]*)" (selected)?/g)];return (opts.filter(o=>o[2]).at(-1)??opts[0])?.[1];};
const optionIds=html=>[...(/<select id="agu-condition-status">([\s\S]*?)<\/select>/.exec(html)?.[1]??'').matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);

test('the Apply list renders from the V14 record: every native status once, Strain left out, one option selected',async()=>{
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 const html=await app._renderHTML();
 assert.deepEqual(optionIds(html),['blinded','prone','stable'],'0.29.1: A to Z by name, the one list the Hub also offers');
 assert.equal((/<select id="agu-condition-status">[\s\S]*?<\/select>/.exec(html)[0].match(/ selected/g)||[]).length,1,'exactly one selected option');
 assert.equal(browserValue(html),'blinded','first status by default, not the last');
});
test('the chosen status survives a re-render and is the one Apply passes to toggleStatusEffect',async()=>{
 wren.statuses=new Set();wren.toggled.length=0;
 const app=await api.open();app.tab='conditions';app.actorId='a1';
 // The select's change listener remembers the pick (bound on render).
 let onChange=null;const select={value:'prone',addEventListener:(ev,fn)=>{if(ev==='change')onChange=fn;}};
 app.bind({querySelector:s=>s==='#agu-condition-status'?select:null,querySelectorAll:()=>[]});
 assert.ok(onChange,'change listener bound');select.value='blinded';onChange({target:select});
 const html=await app._renderHTML();// an actor or effect update re-renders the window before Apply is clicked
 assert.equal(browserValue(html),'blinded');
 await app.handle('add-status',{disabled:false,dataset:{}},{querySelector:s=>s==='#agu-condition-status'?{value:browserValue(html)}:null,querySelectorAll:()=>[]});
 assert.deepEqual(wren.toggled,[['blinded',true]]);assert.ok(wren.statuses.has('blinded'));
});
test('every offered status applies and removes with the native toggle (GM)',async()=>{
 wren.statuses=new Set();wren.toggled.length=0;game.user=gm;
 for(const id of ['prone','blinded','stable']){
  assert.match(await api.conditions.apply('a1',id),/^Applied /);assert.ok(wren.statuses.has(id));
  assert.match(await api.conditions.remove('a1',id),/^Removed /);assert.ok(!wren.statuses.has(id));
 }
 assert.deepEqual(wren.toggled.map(t=>t.join(':')),['prone:true','prone:false','blinded:true','blinded:false','stable:true','stable:false']);
});
test('older ids map to the native one; unknown and Strain ids are refused before reaching Foundry',async()=>{
 wren.statuses=new Set();wren.toggled.length=0;
 assert.equal(api.conditions.canApply('a1','blind'),true);
 assert.match(await api.conditions.apply('a1','blind'),/Applied Blinded/);assert.deepEqual(wren.toggled,[['blinded',true]]);
 await assert.rejects(api.conditions.apply('a1','turned'),/Unknown native status/);
 await assert.rejects(api.conditions.apply('a1','ag-strain-1'),/Strain/);
 assert.equal(wren.toggled.length,1,'nothing else reached toggleStatusEffect');
});
test('overlay: the slider sets the window background inline, and again after popping out to a browser window',async()=>{
 await game.settings.set(ID,'overlayOpacity',40);
 const overlay=await api.conditions.openOverlay();const html=await overlay._renderHTML();
 const el=overlay.element;const listeners={};const fade={value:'40',addEventListener:(ev,fn)=>{listeners[ev]=fn;}};el.setFade(fade);
 overlay._replaceHTML(html,{innerHTML:'',querySelector:s=>s==='[data-ov-opacity]'?fade:null,querySelectorAll:()=>[]});
 assert.equal(el.style.props['--agu-ov-alpha'],'40%');
 assert.equal(el.style.props.background,`${overlayBackground(40)} !important`);
 assert.equal(el.content.style.props.background,'transparent !important','content area stays clear');
 fade.value='10';listeners.input();assert.equal(el.style.props.background,`${overlayBackground(10)} !important`,'dragging previews');
 el.style.props={};overlay._onDetach({},{});// popped out: a new document, the dragged value is applied there
 assert.equal(el.style.props.background,`${overlayBackground(10)} !important`);assert.equal(el.style.props['--agu-ov-alpha'],'10%');
 listeners.change();assert.equal(game.settings.get(ID,'overlayOpacity'),10,'saved per user on release');
 el.style.props={};overlay._onAttach({},{});assert.equal(el.style.props['--agu-ov-alpha'],'10%','back in Foundry');
 await api.conditions.closeOverlay();
});
