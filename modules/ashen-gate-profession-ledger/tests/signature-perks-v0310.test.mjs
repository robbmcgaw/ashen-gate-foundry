import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {signatureOf,tiersCrossed,signaturePlan} from '../scripts/signature-perks.mjs';
import {xpForLevel} from '../scripts/progression.mjs';
// 0.31.0: signature perks. Mocked Foundry: these prove the rules and wiring, not the live UI.
const listeners={},hooks={},infos=[],warns=[],errors=[],chats=[];let api,confirmAnswer=true,failFor=null;
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}static async wait(o){FakeDialog.last=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:(n,f)=>(listeners[n]??=[]).push(f),callAll:(n,...a)=>{for(const f of listeners[n]??[])f(...a);}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e)),warn:m=>warns.push(String(m))}};
globalThis.ChatMessage={create:async d=>{chats.push(d);return d;},getSpeaker:()=>({})};
const src=(id,type,{visibility='player',status='draft',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const perk=(id,name,prof,tier,{visibility='player',signature=true}={})=>{const definition={id,entity_type:'ProfessionPerk',version:'0.1.0',refs:[],name,profession_id:prof,tier,point_cost:0,...(signature?{signature:true}:{})};
  return {id:`w-${id}`,uuid:`Item.${id}`,name,type:'feat',flags:src(id,'ProfessionPerk',{visibility,definition}),system:{description:{value:''}},testUserPermission:u=>u.isGM,
    toObject(){return {_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system)};}};};
const MINE='PROF-TEST-MINING',FISH='PROF-TEST-FISHING',ALCH='PROF-TEST-ALCHEMY';
const world=[
  perk('PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01','[TEST] Read Rock',MINE,'journeyman'),
  perk('PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-02','[TEST] Tap Ore',MINE,'journeyman'),
  perk('PERK-TEST-MINING-SIGNATURE-EXPERT-01','[TEST] Deep Ear',MINE,'expert'),
  perk('PERK-TEST-MINING-SIGNATURE-EXPERT-02','[TEST] Vein Sense',MINE,'expert'),
  perk('PERK-TEST-MINING-ORDINARY','[TEST] Not Signature',MINE,'journeyman',{signature:false}),
  perk('PERK-TEST-ALCHEMY-SIGNATURE-JOURNEYMAN-01','[TEST] Secret Brew',ALCH,'journeyman',{visibility:'gm'}),
];
const held=(id,name,flags,type='feat')=>({id,name,type,system:{quantity:1,description:{value:''}},flags});
const prof=(pid,name)=>held(`p-${pid}`,name,src(pid,'Profession'));
let n=0;
const makeActor=(id,name,items,{owner=true}={})=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);
  const a={id,name,type:'character',hasPlayerOwner:owner,items:inv,flags:{'ashen-gate-profession-ledger':{}},testUserPermission:u=>u.isGM||u.id==='u1',
    setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
    createEmbeddedDocuments:async(type,data)=>{if(failFor===id)throw Error('[TEST] disk full');for(const d of data)inv.push({...structuredClone(d),id:`n${++n}`});return data;},
    updateEmbeddedDocuments:async()=>[],deleteEmbeddedDocuments:async()=>{throw Error('perks are never removed');}};
  return a;};
const ana=makeActor('ana','[TEST] Ana',[prof(MINE,'Mining')]);
const bo=makeActor('bo','[TEST] Bo',[prof(MINE,'Mining')]);
const cy=makeActor('cy','[TEST] Cy',[prof(FISH,'Fishing')]);
const di=makeActor('di','[TEST] Di',[prof(ALCH,'Alchemy')]);
const all=[ana,bo,cy,di];
const values={partyRoster:['ana','bo','cy','di'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},checkMapping:{}};
const ledgerModule={active:true,version:'0.35.3',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:()=>{},on:()=>{}},
  modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(m,k)=>values[k],set:async(m,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const settle=()=>new Promise(r=>setTimeout(r,25));
const owns=(a,id)=>a.items.filter(i=>i.flags?.['ashen-gate-manager']?.source?.sourceId===id).length;
const sigNames=a=>a.items.filter(i=>i.type==='feat'&&i.flags['ashen-gate-manager'].source.definition?.signature).map(i=>i.name).sort();
const signatureChats=()=>chats.filter(c=>/earned (a signature perk|signature perks)/.test(c.content));
const reset=()=>{for(const a of all){a.items.splice(0,a.items.length,...a.items.filter(i=>i.type!=='feat'||!i.flags['ashen-gate-manager'].source.definition?.signature));a.flags['ashen-gate-profession-ledger']={};}
  chats.length=0;warns.length=0;errors.length=0;failFor=null;confirmAnswer=true;game.user=gm;};

test('pure rules: only `signature: true` with a journeyman/expert tier and a PROF id counts; tiers crossed upward, even in a jump',()=>{
  assert.deepEqual(signatureOf({id:'PERK-X-1',entity_type:'ProfessionPerk',name:'X',signature:true,tier:'Expert',profession_id:'PROF-MINING'}),{id:'PERK-X-1',name:'X',professionId:'PROF-MINING',tier:'expert',level:7});
  assert.equal(signatureOf({id:'PERK-X-1',entity_type:'ProfessionPerk',signature:'true',tier:'expert',profession_id:'PROF-MINING'}),null);
  assert.equal(signatureOf({id:'PERK-X-1',entity_type:'ProfessionPerk',signature:true,tier:'master',profession_id:'PROF-MINING'}),null);
  assert.equal(signatureOf({id:'PERK-X-1',entity_type:'ProfessionPerk',signature:true,tier:'expert'}),null);
  assert.equal(signatureOf({id:'PERK-X-1',entity_type:'Item',signature:true,tier:'expert',profession_id:'PROF-MINING'}),null);
  assert.deepEqual(tiersCrossed(3,4),['journeyman']);assert.deepEqual(tiersCrossed(4,6),[]);assert.deepEqual(tiersCrossed(6,7),['expert']);
  assert.deepEqual(tiersCrossed(1,9),['journeyman','expert']);assert.deepEqual(tiersCrossed(7,3),[],'lowering crosses nothing');assert.deepEqual(tiersCrossed(4,4),[]);
  const rows=signaturePlan([{id:'a',name:'A'}],[{id:'PERK-1',name:'One',professionId:'PROF-M',tier:'expert',level:7}],{professions:()=>[{id:'PROF-M',name:'M',level:6}],holds:()=>false,unreleased:()=>''});
  assert.deepEqual(rows,[],'level below the tier: nothing');
});

test('reaching Journeyman grants that tier’s signature perks once, with one chat note; Expert adds its own later',async()=>{
  reset();
  await api.awardProfessionXP(ana,MINE,xpForLevel(3));await settle();
  assert.deepEqual(sigNames(ana),[],'level 3: nothing yet');
  await api.awardProfessionXP(ana,MINE,xpForLevel(4)-xpForLevel(3));await settle();
  assert.deepEqual(sigNames(ana),['[TEST] Read Rock','[TEST] Tap Ore'],'only journeyman, never the ordinary perk');
  assert.equal(signatureChats().length,1);
  assert.match(signatureChats()[0].content,/\[TEST\] Ana earned signature perks in Mining/);assert.match(signatureChats()[0].content,/Journeyman: \[TEST\] Read Rock, \[TEST\] Tap Ore/);
  await api.awardProfessionXP(ana,MINE,1);await settle();
  assert.equal(owns(ana,'PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01'),1,'a later award in the same tier adds nothing');assert.equal(signatureChats().length,1);
  await api.awardProfessionXP(ana,MINE,xpForLevel(7)-xpForLevel(4));await settle();
  assert.deepEqual(sigNames(ana),['[TEST] Deep Ear','[TEST] Read Rock','[TEST] Tap Ore','[TEST] Vein Sense']);
  assert.equal(signatureChats().length,2);assert.match(signatureChats()[1].content,/Expert: \[TEST\] Deep Ear, \[TEST\] Vein Sense/);
  assert.ok(chats.every(c=>!c.whisper||c.whisper.includes('gm')));
});

test('a multi-level jump grants every tier crossed, in one note; an already-owned perk is not doubled',async()=>{
  reset();
  bo.items.push(world[0].toObject&&{id:'pre',name:'[TEST] Read Rock',type:'feat',flags:structuredClone(world[0].flags),system:{}});
  await api.awardProfessionXP(bo,MINE,xpForLevel(9));await settle();
  assert.deepEqual(sigNames(bo),['[TEST] Deep Ear','[TEST] Read Rock','[TEST] Tap Ore','[TEST] Vein Sense']);
  assert.equal(owns(bo,'PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01'),1);
  assert.equal(signatureChats().length,1);
  assert.match(signatureChats()[0].content,/Journeyman: \[TEST\] Tap Ore.*Expert: /s,'the pre-held perk is not announced');
});

test('lowering XP removes nothing and flags perks held beyond the level in the GM notice',async()=>{
  reset();
  await api.awardProfessionXP(ana,MINE,xpForLevel(8));await settle();
  assert.equal(sigNames(ana).length,4);
  chats.length=0;
  const r=await _test.performAction('adjust-xp',{id:MINE,actorId:'ana',set:'0',reason:'Mistake'});await settle();
  assert.equal(sigNames(ana).length,4,'all four kept');
  assert.match(FakeDialog.last.content,/4 held Mining signature perks .*Deep Ear, Expert.*need a higher level than 1\. They are kept, not removed\./);
  assert.match(r.message,/signature perks/);
  assert.equal(signatureChats().length,0,'lowering posts no grant note');
  // Back up across the same tiers: still no duplicates.
  await api.awardProfessionXP(ana,MINE,xpForLevel(8));await settle();
  assert.equal(sigNames(ana).length,4);assert.equal(owns(ana,'PERK-TEST-MINING-SIGNATURE-EXPERT-01'),1);
  assert.equal(signatureChats().length,0,'nothing new was granted, so nothing is announced');
});

test('not imported or not released: nothing is granted and the GM is told once',async()=>{
  reset();
  await api.awardProfessionXP(cy,FISH,xpForLevel(4));await settle();
  assert.deepEqual(sigNames(cy),[]);assert.equal(warns.length,1);assert.match(warns[0],/\[TEST\] Cy reached Journeyman in Fishing, but no Journeyman signature perk for Fishing is imported/);
  await api.awardProfessionXP(cy,FISH,1);await api.awardProfessionXP(cy,FISH,xpForLevel(7)-xpForLevel(4));await settle();
  assert.equal(warns.length,2,'Expert is a separate, once-only notice');
  await api.adjustProfessionXP(cy,FISH,{set:0});await api.awardProfessionXP(cy,FISH,xpForLevel(4));await settle();
  assert.equal(warns.length,2,'the same tier is not repeated');
  reset();
  await api.awardProfessionXP(di,ALCH,xpForLevel(4));await settle();
  assert.deepEqual(sigNames(di),[],'a GM-only perk is not given to a player');assert.match(warns[0],/aren't released to players \(GM-only/);
  reset();
  const dummy=makeActor('zz','[TEST] Zed',[prof('PROF-TEST-COOKING','Cooking')]);all.push(dummy);values.partyRoster.push('zz');
  try{await api.awardProfessionXP(dummy,'PROF-TEST-COOKING',xpForLevel(4));await settle();assert.equal(warns.length,0,'a profession with no signature perks at all is not nagged');}
  finally{all.pop();values.partyRoster.pop();}
});

test('the hook only acts on a GM client',async()=>{
  reset();
  game.user=alice;
  listeners['ashenGateLedger.progressionChanged'].forEach(f=>f({actorId:'ana',profId:MINE,previousLevel:1,level:5,xp:30}));await settle();
  game.user=gm;
  assert.deepEqual(sigNames(ana),[]);
});

test('catch-up preview writes nothing; grant adds the missing perks once, re-run adds nothing',async()=>{
  reset();
  ana.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{[MINE]:{xp:xpForLevel(5),selectedPerkIds:[]}}};
  bo.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{[MINE]:{xp:xpForLevel(7),selectedPerkIds:[]}}};
  const before=ana.items.length+bo.items.length;
  const p=api.signaturePerks.preview();
  assert.equal(ana.items.length+bo.items.length,before,'preview writes nothing');assert.equal(chats.length,0);
  const st=(a,id)=>p.rows.find(r=>r.actorId===a&&r.perkId===id)?.status;
  assert.equal(st('ana','PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01'),'new');
  assert.equal(st('ana','PERK-TEST-MINING-SIGNATURE-EXPERT-01'),undefined,'Ana is level 5: not Expert');
  assert.equal(st('bo','PERK-TEST-MINING-SIGNATURE-EXPERT-02'),'new');
  assert.equal(st('di','PERK-TEST-ALCHEMY-SIGNATURE-JOURNEYMAN-01'),undefined,'Di is level 1');
  assert.equal(p.signaturePerks,5);
  const out=await api.signaturePerks.grant({rowIds:['ana:PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01']});
  assert.deepEqual(out.granted.map(g=>[g.actorName,g.perks.map(x=>x.name)]),[['[TEST] Ana',['[TEST] Read Rock']]]);
  assert.deepEqual(sigNames(bo),[],'rowIds limit it');
  const all2=await api.signaturePerks.grant({});
  assert.deepEqual(all2.granted.map(g=>[g.actorName,g.perks.length]),[['[TEST] Ana',1],['[TEST] Bo',4]]);
  assert.equal(signatureChats().length,3);
  const again=await api.signaturePerks.grant({});
  assert.deepEqual(again.granted,[]);assert.equal(owns(bo,'PERK-TEST-MINING-SIGNATURE-EXPERT-01'),1);assert.equal(signatureChats().length,3);
  assert.equal(api.signaturePerks.preview().rows.find(r=>r.actorId==='bo'&&r.perkId==='PERK-TEST-MINING-SIGNATURE-EXPERT-01').status,'held');
});

test('a failing character is reported; the others still get their perks',async()=>{
  reset();
  for(const a of [ana,bo])a.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{[MINE]:{xp:xpForLevel(4),selectedPerkIds:[]}}};
  failFor='ana';
  const out=await api.signaturePerks.grant({});
  assert.deepEqual(out.failed.map(f=>f.actorName),['[TEST] Ana']);assert.match(out.failed[0].error,/disk full/);
  assert.deepEqual(out.granted.map(g=>g.actorName),['[TEST] Bo']);
  failFor=null;
  assert.equal((await api.signaturePerks.grant({})).granted[0].actorName,'[TEST] Ana','re-running finishes the job');
});

test('GM-only in the API: players are refused, and NPC/unowned/backup targets are not valid',async()=>{
  reset();
  game.user=alice;
  try{
    await assert.rejects(async()=>api.signaturePerks.preview(),/Only the GM can grant signature perks/);
    await assert.rejects(api.signaturePerks.grant({actorIds:['ana']}),/Only the GM can grant signature perks/);
  }finally{game.user=gm;}
  const loner=makeActor('loner','[TEST] Hireling',[prof(MINE,'Mining')],{owner:false});all.push(loner);
  try{assert.throws(()=>api.signaturePerks.preview({actorIds:['loner']}),/not a player character: signature perks go to player-owned characters only/);}finally{all.pop();}
  assert.equal(sigNames(ana).length,0);
});

test('Assign has a Signature perks sub-tab: preview, confirm, grant, then the result; players never see it',async()=>{
  reset();
  ana.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{[MINE]:{xp:xpForLevel(4),selectedPerkIds:[]}}};
  const app=api.open({view:'assign'});app.view='assign';
  let html=(await app._prepareContext({})).html;
  assert.match(html,/role="tab" id="agl-assign-tab-signature"[^>]*>Signature perks</);
  assert.match(html,/<h2>Grant signature perks<\/h2>/);
  await app._click('signature-preview');
  assert.deepEqual([...app.signatureState.selected].sort(),['ana:PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01','ana:PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-02']);
  html=(await app._prepareContext({})).html;
  assert.match(html,/\[TEST\] Ana <span class="agl-sub">— 2 perks to grant<\/span>/);assert.match(html,/Will grant/);
  assert.match(html,/class="ag-btn ag-btn--primary" data-action="signature-apply" data-id="all" >Grant all new \(2\)…<\/button>/);
  assert.doesNotMatch(html,/\b(Alpha|Beta|Preview build|New!)\b/);
  confirmAnswer=false;await app._click('signature-apply','all');confirmAnswer=true;
  assert.equal(sigNames(ana).length,0,'declined: nothing granted');
  await app._click('signature-apply','all');
  assert.match(FakeDialog.last.content,/\[TEST\] Ana: \[TEST\] Read Rock, \[TEST\] Tap Ore/);assert.equal(FakeDialog.last.buttons.at(-1).label,'Grant perks');assert.equal(FakeDialog.last.buttons[0].label,'Cancel');
  assert.equal(sigNames(ana).length,2);assert.equal(app.notice,'Granted 2 signature perks to 1 character.');
  html=(await app._prepareContext({})).html;
  assert.match(html,/<h3>Granted<\/h3><ul><li><b>\[TEST\] Ana<\/b> \(2\): \[TEST\] Read Rock, \[TEST\] Tap Ore<\/li><\/ul>/);
  assert.match(html,/Already held/);
  game.user=alice;
  try{app.view='assign';const p=(await app._prepareContext({})).html;assert.doesNotMatch(p,/Grant signature perks/);}finally{game.user=gm;}
});

test('malformed or unknown rowIds are rejected like the other grants, never widened to every row; [] means none',async()=>{
  reset();
  ana.flags['ashen-gate-profession-ledger'].professionProgress={schema:'ag-profession-actor-progress/0.1',professions:{[MINE]:{xp:xpForLevel(4),selectedPerkIds:[]}}};
  for(const bad of ['all','PERK-X',{},7,true])await assert.rejects(api.signaturePerks.grant({rowIds:bad}),/rowIds must be a list/,JSON.stringify(bad));
  for(const bad of [[7],['nope'],['ana:PERK-TEST-NOPE'],['ana:PERK-TEST-MINING-SIGNATURE-JOURNEYMAN-01','bad']])await assert.rejects(api.signaturePerks.grant({rowIds:bad}),/Unknown row id/,JSON.stringify(bad));
  assert.deepEqual(sigNames(ana),[],'nothing was granted by a rejected call');
  assert.deepEqual((await api.signaturePerks.grant({rowIds:[]})).granted,[]);assert.deepEqual(sigNames(ana),[]);
  assert.equal((await api.signaturePerks.grant({rowIds:null})).granted[0].perks.length,2,'null still means every new row');
});

test('0.31.2: a character name in the "perk not granted" notice is escaped (notifications show HTML)',async()=>{
  reset();
  const name=di.name;di.name='<img src=x onerror=alert(1)> Di';
  try{
    await api.awardProfessionXP(di,ALCH,xpForLevel(7));await settle();
    assert.equal(warns.length,1,'Alchemy Expert had not been announced yet');
    assert.doesNotMatch(warns[0],/<img/);assert.match(warns[0],/&lt;img src=x onerror=alert\(1\)(&gt;|>) Di reached Expert/);
  }finally{di.name=name;reset();}
});
