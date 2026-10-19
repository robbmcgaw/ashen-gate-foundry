import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACCESS_CONTRACT,collectPlayerAccess,inspectPlayerModule,changePlayerAccess,hideAllPlayerInterfaces,isGmOnlyModule} from '../scripts/player-access.js';
function makeModule(id='ashen-gate-profession-ledger',initial=true,opts={}) {
  let enabled=initial, calls=0;
  const mod={id,title:opts.title??id,version:'0.3.0',active:true,api:{open:()=>true,
    playerAccess:{contract:ACCESS_CONTRACT,
      getState:async()=>({contract:ACCESS_CONTRACT,moduleId:id,audience:opts.audience??'player',playerAccessEnabled:enabled,configurable:opts.configurable??true}),
      setEnabled:async(v)=>{calls++;if(opts.fail)throw Error('specialist denied');enabled=v;}}
  }};
  return {mod,get enabled(){return enabled},get calls(){return calls}};
}
test('player access: async provider state, visible vs hidden, and no duplicate state',async()=>{
 const x=makeModule();
 assert.deepEqual((await inspectPlayerModule(x.mod)).state,'Visible');
 const r=await changePlayerAccess(x.mod,false,{isGM:true});
 assert.equal(r.changed,true);assert.equal(r.state,'Hidden');assert.equal(x.calls,1);
 assert.equal((await changePlayerAccess(x.mod,false,{isGM:true})).changed,false);
 assert.equal(x.calls,1);
});
test('player access: non-GM and invalid inputs refused before provider called',async()=>{
 const x=makeModule();await assert.rejects(changePlayerAccess(x.mod,false),/Only GMs/);
 await assert.rejects(changePlayerAccess(x.mod,'false',{isGM:true}),/Boolean/);
 assert.equal(x.calls,0);
});
test('player access: installed, missing, inactive and unsupported states correctly distinguished',async()=>{
 const list=await collectPlayerAccess([{id:'ashen-gate-profession-ledger',title:'Ledger',active:true,api:{}},{id:'ashen-gate-skill-trees',title:'Trees',active:false}]);
 assert.equal(list.find(r=>r.id==='ashen-gate-profession-ledger').state,'Unsupported');
 assert.equal(list.find(r=>r.id==='ashen-gate-skill-trees').status,'Installed but Disabled');
 assert.equal(list.find(r=>r.id==='ashen-gate-factions').status,'Not installed');
 assert.equal(list.filter(r=>r.canToggle).length,0);
});
test('player access: module and state identity must match, invalid/failed providers are unsupported',async()=>{
 const x=makeModule();x.mod.api.playerAccess.getState=()=>({contract:ACCESS_CONTRACT,moduleId:'wrong',audience:'player',playerAccessEnabled:true,configurable:true});
 assert.equal((await inspectPlayerModule(x.mod)).state,'Unsupported');
 await assert.rejects(changePlayerAccess(x.mod,false,{isGM:true}),/Invalid or mismatched/);
 x.mod.api.playerAccess.getState=()=>Promise.reject(new Error('broken provider'));
 assert.equal((await inspectPlayerModule(x.mod)).state,'Unsupported');
});
test('player access: GM-only Manager and Locations cannot be revealed even with malicious capability',async()=>{
 for(const id of ['ashen-gate-manager','ashen-gate-locations','ashen-gate-location-builder']) {
  const x=makeModule(id,true);
  assert.equal(isGmOnlyModule(x.mod),true);
  assert.equal((await inspectPlayerModule(x.mod)).state,'GM only');
  await assert.rejects(changePlayerAccess(x.mod,true,{isGM:true}),/GM-only/);
  assert.equal(x.calls,0);
 }
});
test('player access: GM-only provider declaration never allows player toggle',async()=>{
 const x=makeModule('ashen-gate-headquarters',false,{audience:'gm-only'});
 assert.equal((await inspectPlayerModule(x.mod)).state,'GM only');
 assert.equal((await inspectPlayerModule(x.mod)).canToggle,false);
});
test('player access: Hide All skips unsupported/GM-only/disabled and reports partial failures honestly',async()=>{
 const a=makeModule('ashen-gate-profession-ledger');
 const b=makeModule('ashen-gate-skill-trees',true,{fail:true});
 const c=makeModule('ashen-gate-factions',false);
 const d=makeModule('ashen-gate-locations',true);
 const report=await hideAllPlayerInterfaces([a.mod,b.mod,c.mod,d.mod],{isGM:true});
 assert.equal(report.changed.length,1);assert.equal(report.failed.length,1);
 assert.equal(report.alreadyHidden.length,1);assert.equal(report.skipped.length,1);
 assert.match(report.failed[0].error,/specialist denied/);
 assert.equal(a.enabled,false);assert.equal(b.enabled,true);assert.equal(d.calls,0);
});
test('player access: Hide All non-GM call does not mutate specialist modules',async()=>{
 const x=makeModule();await assert.rejects(hideAllPlayerInterfaces([x.mod]),/Only GMs/);assert.equal(x.calls,0);
});
test('player access: UI remains GM-only and no Manager-owned access setting is registered',()=>{
 const main=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
 const tpl=readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
 assert.match(main,/if\(!game\.user\?\.isGM\) throw new Error\('Only GMs can change Player Access/);
 assert.match(main,/hideAllPlayerInterfaces\(modules,/);
 assert.doesNotMatch(main,/settings\.register\(MODULE_ID,\s*["']playerAccessEnabled/);
 assert.doesNotMatch(tpl,/data-ag-tab="player-access"/,'Player Access now lives under Appearance');
 assert.ok(tpl.indexOf('agmanager-access-compact')>tpl.indexOf('data-ag-world-skin'),'access section sits beneath the appearance selector');
 assert.match(tpl,/data-ag-action="player-access-hide-all"/);
});

test('player access: valid read-only player state displays honestly without an actionable toggle',async()=>{
 const x=makeModule('ashen-gate-read-only',false,{configurable:false});
 const row=await inspectPlayerModule(x.mod);assert.equal(row.state,'Hidden');assert.equal(row.canToggle,false);
 await assert.rejects(changePlayerAccess(x.mod,true,{isGM:true}),/read-only/);
 assert.equal(x.calls,0);
});
