import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPEARANCE_CONTRACT,DEFAULT_SKIN_ID,createAppearanceController,registerAppearanceSettings} from '../scripts/appearance.js';
import {auditTypedReferences,renderGmReferenceMarkers} from '../scripts/manager-resolver-bridge.mjs';

function world(){
  const world=new Map([['worldSkin','ag-default']]),users=new Map(),listeners=new Set();
  function session(id,isGM=false){
    const u={id,isGM},store=users.get(id)??new Map();users.set(id,store);
    return createAppearanceController({currentUser:()=>u,getSetting:key=>key==='worldSkin'?world.get(key):store.get(key)??'',
      setSetting:async(key,v)=>{if(key==='worldSkin'){if(!isGM)throw Error('denied');world.set(key,v);for(const l of listeners)l();}else store.set(key,v);},
      subscribeSettings:fn=>{listeners.add(fn);return ()=>listeners.delete(fn)}
    });
  }
  return {session,world,users};
}
const fakeRoot=()=>({style:{values:new Map(),setProperty(k,v){this.values.set(k,v);}},dataset:{}});
test('theme contract reports only current-user override and skin state',()=>{
  const w=world(),a=w.session('alice'),b=w.session('bob');
  assert.equal(a.contract,APPEARANCE_CONTRACT);
  assert.equal(a.getState().effective,DEFAULT_SKIN_ID);
  assert.equal(b.getState().userOverride,null);
  assert.equal(a.listSkins().length>=2,true);
  assert.equal(a.listSkins().some(s=>'tokens'in s),false);
});
test('GM world default propagates to inheriting players, not an overriding user',async()=>{
  const w=world(),gm=w.session('gm',true),alice=w.session('alice'),bob=w.session('bob');
  await bob.setUserOverride('ag-ember');
  await gm.setWorldDefault('ag-slate');
  assert.equal(alice.getState().effective,'ag-slate');
  assert.equal(bob.getState().effective,'ag-ember');
  assert.equal(gm.getState().effective,'ag-slate');
  await bob.setUserOverride('');
  assert.equal(bob.getState().effective,'ag-slate');
  assert.equal(bob.getState().source,'world');
});
test('normal player cannot change default through public API',async()=>{
  const w=world(),player=w.session('player');
  await assert.rejects(player.setWorldDefault('ag-ember'),/Only GMs/);
  assert.equal(w.world.get('worldSkin'),'ag-default');
});
test('malformed or unknown skin identifiers never persist',async()=>{
  const w=world(),gm=w.session('gm',true),p=w.session('p');
  await assert.rejects(gm.setWorldDefault('hidden-secret-theme'),/Unknown/);
  await assert.rejects(p.setUserOverride('__proto__'),/Unknown/);
  assert.equal(p.getState().effective,'ag-default');
});
test('theme writes only two authorized setting keys; never gameplay or access state',async()=>{
  const w=world(),gm=w.session('gm',true),p=w.session('p');
  await gm.setWorldDefault('ag-slate');await p.setUserOverride('ag-ember');
  assert.deepEqual([...w.world.keys()],['worldSkin']);
  assert.deepEqual([...w.users.get('p').keys()],['userSkin']);
});
test('per-user override survives controller reconstruction as persistent user-scope state',async()=>{
  const w=world();await w.session('player').setUserOverride('ag-slate');
  const again=w.session('player');assert.equal(again.getState().userOverride,'ag-slate');
});
test('missing/obsolete skin falls back safely without rewriting stored preferences',()=>{
  const w=world();w.world.set('worldSkin','uninstalled');
  w.users.set('player',new Map([['userSkin','obsolete']]));
  const p=w.session('player'),state=p.getState();
  assert.equal(state.effective,'ag-default');assert.equal(state.invalidWorld,true);assert.equal(state.invalidUser,true);
  assert.equal(w.users.get('player').get('userSkin'),'obsolete');
});
test('applyTo changes only scoped application root CSS properties',async()=>{
  const w=world(),p=w.session('p'),root=fakeRoot();
  await p.setUserOverride('ag-slate');const state=p.applyTo(root);
  assert.equal(root.dataset.agSkin,'ag-slate');assert.equal(state.effective,'ag-slate');
  assert.ok(root.style.values.has('--ag-bg'));
  assert.throws(()=>p.applyTo({}),/application root/);
});
test('live settings change publishes updates; disposed controller unsubscribes',async()=>{
  const w=world(),gm=w.session('gm',true),p=w.session('p');let calls=0;
  p.subscribe(()=>calls++);await gm.setWorldDefault('ag-ember');assert.ok(calls>=1);
  const count=calls;p.dispose();await gm.setWorldDefault('ag-slate');assert.equal(calls,count);
});
test('registers world default as GM restricted and override as user scoped',()=>{
  const registered=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>registered.push({n,k,v})}},namespace:'ashen-gate-manager'});
  assert.equal(registered.length,3,'world skin, user skin and the kit 2 size');
  assert.equal(registered[0].v.scope,'world');assert.equal(registered[0].v.restricted,true);
  assert.equal(registered[1].v.scope,'user');assert.equal(registered[1].v.config,false);
  assert.equal(registered[2].k,'uiSize');assert.equal(registered[2].v.scope,'client');
});
test('player-safe appearance template cannot reach Import, Library or Player Access controls',()=>{
  const text=readFileSync(new URL('../templates/my-appearance.hbs',import.meta.url),'utf8');
  const source=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(text,/data-ag-my-save/);assert.doesNotMatch(text,/data-ag-action="apply"|data-ag-tab="import"|data-ag-tab="player-access"/);
  assert.match(source,/restricted:false/);assert.match(source,/restricted:true/);
  assert.match(source,/if\(!game\.user\?\.isGM\)throw new Error\('Only GMs can open the General Manager/);
});
test('resolver bridge remains GM-only and refuses missing ambiguous references',()=>{
 const r={contract:'ag-definition-resolver/0.1-prototype',resolve:id=>id==='MAT-ONE'?{status:'conflict'}:{status:'not_found'}};
 const rec=[{id:'REC-ONE',refs:[{relation:'requires',target_id:'MAT-ONE',mode:'required'},{relation:'could_use',target_id:'MAT-MISSING',mode:'optional'}]}];
 assert.deepEqual(auditTypedReferences({records:rec,resolver:r,currentUser:()=>({id:'player',isGM:false})}),{status:'forbidden'});
 const report=auditTypedReferences({records:rec,resolver:r,currentUser:()=>({id:'gm',isGM:true})});
 assert.equal(report.unresolvedRequired[0].status,'conflict');assert.equal(report.unresolvedOptional[0].status,'not_found');
 assert.equal(renderGmReferenceMarkers({text:'[[AGREF:MAT-ONE|One]]',resolver:r,currentUser:()=>({isGM:true})}).unresolved.length,1);
});
