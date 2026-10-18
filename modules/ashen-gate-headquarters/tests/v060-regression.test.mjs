import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,site} from '../js/logic.mjs';
import {createPlayerIntentBridge,REQUEST_PATH} from '../js/player-intent-bridge.mjs';
import {projectPublicState,isPublicProjectionSafe} from '../js/private-state.mjs';
const GM={id:'test-gm',isGM:true,active:true};
const PLAYER={id:'test-owner',isGM:false,active:true};
const activated=()=>applyOperation(emptyState(),GM,'activate',{hq_ref:'HQ-TEST-LAB',location_ref:'LOC-TEST-LAB',campaign_key:'test_campaign',guild_key:'test_guild'});
test('v0.6.0 new saves default to full-frame opaque image, with independent placement metadata',()=>{
  const s=emptyState();
  assert.equal(s.config.background_fit,'contain');
  assert.equal(s.config.background_opacity,100);
  assert.equal(s.config.background_x,50);
  assert.equal(s.config.background_y,50);
});
test('v0.6.0 GM image fitting, pan, opacity and bounds persist, preserving existing state',()=>{
  const s=activated(), priorRank=s.core.guild_state.rank;
  const next=applyOperation(s,GM,'save_config',{name:'Test Guildhall',width:30,height:20,background:'worlds/test/map.webp',background_fit:'cover',background_x:25,background_y:72,background_opacity:90});
  assert.equal(next.config.background_fit,'cover');
  assert.equal(next.config.background_x,25);assert.equal(next.config.background_y,72);assert.equal(next.config.background_opacity,90);
  assert.equal(next.core.guild_state.rank,priorRank);
  assert.deepEqual(site(next).installations,site(s).installations);
  assert.equal(projectPublicState(next).config.background_fit,'cover');
  assert.ok(isPublicProjectionSafe(projectPublicState(next)));
});
test('v0.6.0 legacy saved image settings absent: save preserves valid defaults',()=>{
  const s=activated();delete s.config.background_fit;delete s.config.background_x;delete s.config.background_y;delete s.config.background_opacity;
  const next=applyOperation(s,GM,'save_config',{name:'Legacy Guildhall',width:24,height:18,background:''});
  assert.equal(next.config.background_fit,'contain');assert.equal(next.config.background_opacity,100);
});
test('v0.6.0 reject malformed image metadata, leave state unchanged',()=>{
  const s=activated(),baseline=structuredClone(s);
  const data={name:'Test',width:24,height:18,background:'',background_fit:'cover',background_x:50,background_y:50,background_opacity:100};
  for(const invalid of [{background_fit:'javascript:evil'},{background_x:-2},{background_y:101},{background_opacity:120}])
    assert.throws(()=>applyOperation(s,GM,'save_config',{...data,...invalid}));
  assert.deepEqual(s,baseline);
});
test('v0.6.0 authenticated player Actor update processes with active-GM collection fallback',async()=>{
  const users=new Map([[GM.id,GM],[PLAYER.id,PLAYER]]);users.find=predicate=>[...users.values()].find(predicate);
  const game={user:GM,users};let handle;
  const hooks={on:(_event,callback)=>{handle=callback;return 'hook';},off:()=>{}};
  const actor={id:'owned-pc',testUserPermission:(user,level)=>user.id===PLAYER.id&&level==='OWNER',update:async()=>{}};
  const receipts=[],applied=[];
  const bridge=createPlayerIntentBridge({game,hooks,playerAccessEnabled:()=>true,isGuildMember:()=>true,
    alreadyProcessed:()=>false,apply:async context=>{applied.push(context);},recordReceipt:async x=>receipts.push(x),now:()=>100_000});
  const intent={id:'safe_nonce_0000001',op:'lock',payload:{},createdMs:100_000};
  await handle(actor,{[REQUEST_PATH]:intent},{},PLAYER.id);await bridge.idle();
  assert.equal(applied.length,1);assert.equal(applied[0].user.id,PLAYER.id);assert.equal(receipts[0].ok,true);
  bridge.dispose();
});
test('v0.6.0 anonymous or spoofed player flag cannot gain GM authorization with activeGM fallback',async()=>{
  const users=new Map([[GM.id,GM],[PLAYER.id,PLAYER]]);users.find=predicate=>[...users.values()].find(predicate);
  const game={user:GM,users};let handle;const hooks={on:(_event,callback)=>{handle=callback;return 'hook';},off:()=>{}};
  const actor={id:'pc',testUserPermission:()=>true};const applied=[],receipts=[];
  const bridge=createPlayerIntentBridge({game,hooks,playerAccessEnabled:()=>true,isGuildMember:()=>true,
    alreadyProcessed:()=>false,apply:async x=>applied.push(x),recordReceipt:async x=>receipts.push(x),now:()=>100_000});
  const intent={id:'safe_nonce_0000002',op:'lock',payload:{from:PLAYER.id,userId:GM.id},createdMs:100_000};
  await handle(actor,{[REQUEST_PATH]:intent},{},'fake-nonexistent');await bridge.idle();
  assert.equal(applied.length,0);assert.match(receipts[0].error,/Requester unavailable/);
  bridge.dispose();
});

test('v0.6.0 fixture facilities are real canonical records accepted by HQ import validator',async()=>{
  const {readFile}=await import('node:fs/promises');const {validateDefinition}=await import('../js/logic.mjs');
  const rows=JSON.parse(await readFile(new URL('../fixtures/HQ_Test_Facility_Catalog_v0.6.0.json',import.meta.url),'utf8'));
  assert.equal(rows.length,2);
  for(const d of rows){assert.equal(validateDefinition(d),true);assert.match(d.name,/^TEST ONLY/);}
});
test('v0.6.0 real native Item fixture installer is explicitly GM-only, checks duplicates and resets only tagged records',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {install,reset}=await import('../fixtures/test-records.mjs');
  const {readNativeHirelingDefinitions}=await import('../js/native-hireling-definitions.mjs');
  const defs=JSON.parse(await readFile(new URL('../fixtures/HQ_Test_Hireling_Definitions_v0.6.0.json',import.meta.url),'utf8'));
  const prev={game:globalThis.game,fetch:globalThis.fetch,Item:globalThis.Item,Folder:globalThis.Folder,window:globalThis.window,ui:globalThis.ui};
  const docs=[],folders=[];const gm={id:'gm',isGM:true};const player={id:'alice',isGM:false};
  const fakeGame={user:player,items:{contents:docs},folders:{contents:folders},journal:{contents:[]}};
  globalThis.game=fakeGame;globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(defs)});
  globalThis.Item={create:async data=>{const doc={...data,id:'item'+(docs.length+1),testUserPermission:()=>false,delete:async()=>{docs.splice(docs.indexOf(doc),1);}};docs.push(doc);return doc;}};
  globalThis.Folder={create:async data=>{const doc={...data,id:'folder'+(folders.length+1),folder:folders.find(f=>f.id===data.folder)||null};folders.push(doc);return doc;}};
  globalThis.window={confirm:()=>true};globalThis.ui={notifications:{info:()=>{}}};
  try{
    await assert.rejects(install(),/GM-only/);
    fakeGame.user=gm;
    const created=await install();assert.equal(created.length,2);assert.equal(docs.length,2);
    const lib=readNativeHirelingDefinitions(fakeGame,gm);
    assert.equal(lib.records.size,2);
    assert.ok(lib.records.has('HIRE-AGTEST-SMITH'));
    assert.ok(lib.records.has('HPERK-AGTEST-WORKING'));
    await assert.rejects(install(),/already exist/);
    fakeGame.user=player;await assert.rejects(reset(),/GM-only/);
    fakeGame.user=gm;const done=await reset();assert.equal(done.deleted,2);assert.equal(docs.length,0);
  }finally{for(const [k,v] of Object.entries(prev))globalThis[k]=v;}
});
