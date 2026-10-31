// 0.41.0: (1) the pop-up Roll no longer fails when the Ledger window has to be opened; presentation is separate from the roll,
// (3) the reel is 2 s longer (one constant), (4) the GM's Last gather can be cleared at once from the GM's own view.
// Mocked Foundry: logic and markup only, not the live window or the animation. Synthetic [TEST] data.
import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {SKILL_IDS} from '../scripts/checks.mjs';
import {normalizeNode} from '../scripts/gathering.mjs';
import {revealHtml,REEL_SPIN_MS,STAGGER,DURATION} from '../scripts/reel.mjs';

/* ---- Mocked Foundry: the real round flow ------------------------------------------------------ */
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const hooks={},errors=[],infos=[],chats=[],sent=[],dialogs=[];let api;
const values={partyRoster:['ana','bo','cy','dee','eli','fay','gus'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},exoticChance:2};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true},cat={id:'u3',isGM:false,name:'Cat',active:true};
const users=[gm,alice,bob,cat];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;dialogs.push(this);}render(){this.rendered=true;return this;}async close(){this.closed=true;}static async wait(){return true;}}
let renderCalls=0,renderMode='ok',frontMode='ok';
const warns=[];console.warn=(...a)=>warns.push(a.map(String).join(' '));
class RealApp{
  #el;get element(){return this.#el;}set element(v){this.#el=v;}
  async _prepareContext(){return {};}
  async render(){renderCalls++;if(renderMode==='reject')throw Error('render failed');await Promise.resolve();await Promise.resolve();this.#el={style:{},querySelector:()=>null,querySelectorAll:()=>[]};this.rendered=true;return this;}
  bringToFront(){if(frontMode==='throw')throw Error('front failed');this.#el.style.zIndex='9';}// core: this.#element.style (undefined before the first render finishes)
  async close(){this.#el=undefined;this.rendered=false;}
}
globalThis.foundry={applications:{api:{ApplicationV2:RealApp,HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,...structuredClone(x),update:async()=>{}};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,definition,{visibility='player',status='approved'}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:definition?.refs??[],definition}}});
const mat=(id,name,{quality='Common',tierId='apprentice',prof='PROF-TG-HERBALISM'}={})=>({id,entity_type:'Material',version:'0.1.0',name,quality,tierId,source_profession_id:prof,refs:[{relation:'gathered_by',target_id:prof,mode:'required'}]});
const worldDoc=(id,name,flags,img='')=>({id,uuid:`Item.${id}`,name,img,type:'loot',flags,system:{},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:'loot',flags:structuredClone(this.flags),system:{}};}});
const matDoc=(id,name,opts,srcOpts)=>worldDoc(`w${id}`,name,src(id,'Material',mat(id,name,opts),srcOpts),`icons/${id}.webp`);
const world=[
 matDoc('MAT-TG-H1','[TEST] Moss'),matDoc('MAT-TG-H2','[TEST] Fern'),matDoc('MAT-TG-H3','[TEST] Thyme',{tierId:'journeyman'}),
 matDoc('MAT-TG-HR','[TEST] Rare Orchid',{quality:'Rare'}),matDoc('MAT-TG-HX','[TEST] Star Bloom',{quality:'Exotic'}),
 matDoc('MAT-TG-HD','[TEST] Draft Bloom',{},{status:'draft'}),
 matDoc('MAT-TG-M1','[TEST] Tin',{prof:'PROF-TG-MINING'})];
const profItem=(id,name,prof)=>({id,name:`${name} — Profession`,type:'feat',system:{quantity:1},flags:src(prof,'Profession',{id:prof,entity_type:'Profession',version:'0.1.0',refs:[],name})});
const held=(id,name,flags,qty,img)=>({id,name,img,type:'loot',system:{quantity:qty},flags,toObject(){return {_id:id,name,type:'loot',system:structuredClone(this.system),flags:structuredClone(flags)};}});
let made=0;const rolls=[];
const makeActor=(id,name,ownerId,professions)=>{const inv=professions.map(([k,n])=>profItem(`${id}-${k}`,n,`PROF-TG-${k.toUpperCase()}`));inv.get=i=>inv.find(x=>x.id===i);
 const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{},system:{skills:Object.fromEntries(SKILL_IDS.map(k=>[k,{total:2,value:1}])),tools:{},abilities:{int:{mod:1},wis:{mod:2},dex:{mod:0},str:{mod:0}}},
  testUserPermission:(u,role)=>u.isGM||u.id===ownerId||role==='LIMITED',
  updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups)inv.get(u._id).system.quantity=u['system.quantity'];return ups;},
  createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`${id}-n${made++}`,d.name,d.flags,d.system.quantity,d.img));inv.push(...out);return out;},
  rollSkill:async cfg=>{rolls.push({actor:id,...cfg});return [{total:a.nextRoll??10}];},rollToolCheck:async cfg=>{rolls.push({actor:id,...cfg});return [{total:a.nextRoll??10}];}};
 return a;};
const H=['herbalism','[TEST] Herbalism'],M=['mining','[TEST] Mining'],F=['fishing','[TEST] Fishing'],A=['alchemy','[TEST] Alchemy'];
const ana=makeActor('ana','[TEST] Ana','u1',[H,M]),bo=makeActor('bo','[TEST] Bo','u2',[H]),cy=makeActor('cy','[TEST] Cy','u3',[M]),dee=makeActor('dee','[TEST] Dee','u1',[]),
  eli=makeActor('eli','[TEST] Eli','u2',[A]),fay=makeActor('fay','[TEST] Fay','u3',[H]),gus=makeActor('gus','[TEST] Gus','u2',[F]);
const all=[ana,bo,cy,dee,eli,fay,gus];
const ledgerModule={active:true,version:'0.43.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
 actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:(name,msg)=>sent.push(msg),on:()=>{}},
 modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
let app;
const html=async()=>{app??=api.open({view:'gathering'});app.view='gathering';return (await app._prepareContext({})).html;};
const flush=()=>new Promise(r=>setImmediate(r));
const of=(a,id)=>a.items.filter(i=>(i.flags?.['ashen-gate-manager']?.source?.sourceId??i.flags?.['ashen-gate-profession-ledger']?.sourceId)===id).reduce((n,i)=>n+i.system.quantity,0);
const sentOf=type=>sent.filter(m=>m.type===type);
const adhoc={label:'[TEST] Patch',skill:'Herbalism',tier:1,dcVisible:true};
const nodeOf=(id,extra={})=>normalizeNode({...adhoc,id,finite:false,...extra},{locationId:null});
const noRoll=()=>{throw Error('no dice expected');};
// Scripted dice: the d100 (Exotic chance) reads the list; a pick between materials always takes the first.
const dice=(...vals)=>{let i=0;return f=>f===100?vals[i++%vals.length]:1;};
beforeEach(()=>{game.user=gm;for(const id of [..._test.gatherRounds.keys()])_test.cancelRound(id);values.partyRoster=['ana','bo','cy','dee','eli','fay','gus'];_test.setReducedMotion(null);});
const finish=async round=>{const out=await _test.giveRound(round.id);return out;};

const unhandled=[];process.on('unhandledRejection',e=>unhandled.push(String(e?.message??e)));
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r));};
/** The player's side of a gather: the GM opens it, the player's pop-up appears, Roll as is pressed. Returns what the player saw. */
async function popupRoll({total=14}={}){
  game.user=gm;sent.length=0;dialogs.length=0;_test.setExoticRoll(dice(50,50));
  const round=await _test.startRound({node:nodeOf('adhoc-v41'),professions:['herbalism'],tiers:[1],dc:10});
  const prompt=sentOf('gather-round').find(p=>p.toUserIds[0]==='u1');sent.length=0;
  game.user=alice;errors.length=0;infos.length=0;warns.length=0;unhandled.length=0;
  await _test.onSocket(prompt,'gm');
  const popup=dialogs.find(d=>d.opts?.window?.title==='Gather — roll your check');
  assert.ok(popup,'the pop-up appears');
  ana.nextRoll=total;
  popup.opts.buttons.find(b=>b.action==='roll:ana').callback();
  await settle();
  return {round,popup};
}

test('1. Roll in the pop-up with the Ledger closed: no error for the player, the roll counts, the window opens on Gathering',async()=>{
  renderMode='ok';frontMode='ok';
  const {round}=await popupRoll();
  assert.deepEqual(errors,[],'no error notification (it used to read: Profession Ledger: Cannot read properties of undefined (reading \'style\'))');
  assert.ok(infos.some(i=>/rolled 14\. The GM reveals the results\./.test(i)),'the roll line still appears');
  assert.deepEqual(unhandled,[]);
  const rolled=sentOf('gather-rolled');assert.equal(rolled.length,1);assert.equal(rolled[0].total,14,'the roll reached the GM');
  assert.equal(_test.incomingRounds.get(round.id).rollers[0].rolled,14);
  const w=_test.showPlayerGathering();
  await settle();
  assert.equal(w.view,'gathering');assert.ok(w.element,'the window finished drawing');assert.equal(w.element.style.zIndex,'9','and was raised once it had an element');
  game.user=gm;_test.cancelRound(round.id);
});

test('1. the cause: core fails if a window with no element is raised; showPlayerGathering never does that',async()=>{
  const fresh=new (foundry.applications.api.ApplicationV2)();
  assert.throws(()=>fresh.bringToFront(),/Cannot read properties of undefined \(reading 'style'\)/,'this is the error the player saw');
  // The old order, reproduced: ask for the render without waiting, then raise at once.
  const old=new (foundry.applications.api.ApplicationV2)();
  void old.render({force:true});
  assert.throws(()=>old.bringToFront(),/reading 'style'/,'what 0.40.0 did on a closed window');
  game.user=alice;
  const w=_test.showPlayerGathering();
  assert.ok(w,'the new order returns the window at once');
  await settle();assert.ok(w.element);
  game.user=gm;
});

test('1. presentation failures are warnings only: a render that rejects, or a window that cannot be raised, never aborts or reports the roll',async()=>{
  for(const [render,front] of [['reject','ok'],['ok','throw']]){
    renderMode=render;frontMode=front;
    if(_test.showPlayerGathering)game.user=alice;
    const {round}=await popupRoll({total:12});
    assert.deepEqual(errors,[],`no error shown (render ${render}, front ${front})`);
    assert.equal(sentOf('gather-rolled').length,1,'the roll was sent');
    assert.ok(infos.some(i=>/rolled 12/.test(i)));
    assert.ok(warns.some(w=>/Could not (show|bring)/.test(w)),`logged for the console: ${warns.join(' | ')}`);
    assert.deepEqual(unhandled,[]);
    game.user=gm;_test.cancelRound(round.id);
  }
  renderMode='ok';frontMode='ok';
});

test('1. a real roll failure is still reported, once',async()=>{
  renderMode='ok';frontMode='ok';
  game.user=gm;sent.length=0;dialogs.length=0;_test.setExoticRoll(dice(50,50));
  const round=await _test.startRound({node:nodeOf('adhoc-v41b'),professions:['herbalism'],tiers:[1],dc:10});
  const prompt=sentOf('gather-round').find(p=>p.toUserIds[0]==='u1');
  game.user=alice;errors.length=0;await _test.onSocket(prompt,'gm');
  const popup=dialogs.at(-1);
  ana.rollSkill=async()=>{throw Error('dnd5e could not roll');};ana.rollToolCheck=ana.rollSkill;
  popup.opts.buttons.find(b=>b.action==='roll:ana').callback();await settle();
  assert.equal(errors.length,1);assert.match(errors[0],/Profession Ledger: .*(could not roll|dnd5e)/);
  game.user=gm;_test.cancelRound(round.id);
});

test('1. the reveal screen is guarded the same way: results are kept and no error shows even if the window cannot be drawn',async()=>{
  renderMode='reject';
  game.user=gm;sent.length=0;dialogs.length=0;_test.setExoticRoll(dice(50,50));
  const round=await _test.startRound({node:nodeOf('adhoc-v41c'),professions:['herbalism'],tiers:[1],dc:10});
  const prompt=sentOf('gather-round').find(p=>p.toUserIds[0]==='u1');
  game.user=alice;await _test.onSocket(prompt,'gm');
  game.user=gm;_test.recordRoll(round.id,{actorId:'ana',total:15});_test.recordRoll(round.id,{actorId:'bo',total:12});_test.recordRoll(round.id,{actorId:'fay',total:3});sent.length=0;
  _test.revealRound(round.id);const reveal=sentOf('gather-round-reveal').find(m=>m.toUserIds.includes('u1'));
  game.user=alice;errors.length=0;warns.length=0;unhandled.length=0;
  await _test.onSocket(reveal,'gm');await settle();
  assert.deepEqual(errors,[]);assert.ok(_test.playerResults.has(round.id),'the results are kept');assert.deepEqual(unhandled,[]);
  renderMode='ok';game.user=gm;_test.cancelRound(round.id);
});

test('1. the GM never has the window forced open by a gather',()=>{
  game.user=gm;const before=renderCalls;assert.equal(_test.showPlayerGathering(),null);assert.equal(renderCalls,before);
});

/* ---- 3. the reel -------------------------------------------------------------------------------- */
test('3. the reel spins 2 s longer, from one constant; the stagger is unchanged; reduced motion shows a plain list',()=>{
  assert.equal(REEL_SPIN_MS,4800,'2800 ms before, plus 2000');assert.equal(DURATION,REEL_SPIN_MS/1000);assert.equal(STAGGER,0.7);
  const view={title:'[TEST]',dcText:'DC 10',reel:[{img:'a.webp',name:'A'}],rows:[1,2,3].map(n=>({id:`p${n}`,name:`P${n}`,total:14,result:'common',drops:[{name:'[TEST] Herb',img:'h.webp',quantity:1,kind:'common',hidden:false}],undetermined:false}))};
  const h=revealHtml(view,{elapsed:0});
  assert.match(h,/style="--agl-dur:4\.8s"/,'the markup carries the one duration to the stylesheet');
  assert.match(h,/--agl-delay:0\.00s/);assert.match(h,/--agl-delay:0\.70s/);assert.match(h,/--agl-delay:1\.40s/,'reels still start 0.7 s apart');
  const total=view.rows.length*STAGGER+DURATION;
  assert.doesNotMatch(revealHtml(view,{elapsed:total-0.05}),/is-played/);assert.match(revealHtml(view,{elapsed:total}),/is-played/,'finished after the longer time');
  assert.doesNotMatch(revealHtml(view,{elapsed:2.8*0+ (3*0.7+2.8) +0.1}),/is-played/,'the old finish time is no longer the end');
  const plain=revealHtml(view,{reduced:true});assert.doesNotMatch(plain,/agl-reel|Skip animation/);assert.match(plain,/is-plain/);
  const css=fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../styles/ledger.css'),'utf8');
  assert.match(css,/--agl-dur:4\.8s/,'the stylesheet default matches the constant');assert.doesNotMatch(css,/--agl-dur:2\.8s/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.agl-reel__strip\{animation:none\}\.agl-reel\{display:none\}\}/,'reduced motion still turns the reel off');
});

/* ---- 4. the GM's Last gather ------------------------------------------------------------------------- */
async function giveAGather(label){
  game.user=gm;_test.setExoticRoll(dice(50,50,50,50));
  const round=await _test.startRound({node:nodeOf(label),professions:['herbalism'],tiers:[1],dc:10});
  _test.recordRoll(round.id,{actorId:'ana',total:12});_test.recordRoll(round.id,{actorId:'bo',total:16});_test.recordRoll(round.id,{actorId:'fay',total:9});
  _test.revealRound(round.id);await _test.giveRound(round.id);await flush();return round;
}
test('4. the GM sees the last gather, labelled with who gathered, and Clear hides it at once from the GM’s view only',async()=>{
  _test.resetLastGather();
  const r=await giveAGather('adhoc-last1');
  let h=await html();
  assert.match(h,/Last gather, /);assert.match(h,/\[TEST\] Ana 12/);assert.match(h,/\[TEST\] Bo 16/);assert.match(h,/\[TEST\] Fay 9 — nothing/);
  assert.match(h,/data-action="gather-dismiss-last"[^>]*><i[^>]*><\/i> Clear<\/button>/,'a labelled Clear');
  assert.match(h,/data-action="gather-clear-last"[^>]*><i[^>]*><\/i> Clear for everyone…/,'the older global clear keeps its confirmation');
  const historyBefore=_test.getHistory().length;sent.length=0;
  await app._click('gather-dismiss-last');
  assert.equal(app.rendered,true);
  h=await html();assert.doesNotMatch(h,/Last gather, /,'gone at once, no dialog');
  assert.equal(sentOf('gather-last-cleared').length,0,'nothing is sent to players');
  assert.equal(_test.getHistory().length,historyBefore,'History keeps the gather');assert.ok(_test.getHistory().some(e=>e.id===r.id));
  // A newer gather shows again.
  await giveAGather('adhoc-last2');h=await html();assert.match(h,/Last gather, /);
});

test('4. after a reload (nothing in memory) the GM still sees the newest gather from History; Clear keeps it hidden, and it does not come back',async()=>{
  _test.resetLastGather();
  let h=await html();assert.match(h,/Last gather, /,'read from the History setting');assert.match(h,/\[TEST\] Ana 12/);
  await app._click('gather-dismiss-last');h=await html();assert.doesNotMatch(h,/Last gather, /);
  assert.ok([...memory.entries()].some(([k,v])=>/lastGatherDismissed/.test(v)),'remembered per user on this device');
  // The same after another "reload": the dismissal is read back.
  _test.resetLastGather();h=await html();assert.doesNotMatch(h,/Last gather, /);
});

test('4. Clear for everyone… keeps its semantics: players’ panels are cleared by a message, History stays unless asked',async()=>{
  _test.resetLastGather();
  await giveAGather('adhoc-last3');sent.length=0;
  const out=_test.clearLastGather({alsoHistory:false});
  assert.equal(out.cleared,true);assert.equal(sentOf('gather-last-cleared').length,1);
  assert.doesNotMatch(await html(),/Last gather, /,'and it is not offered again from History');
  assert.ok(_test.getHistory().length>=1);
});

test('4. players: their Last gather is theirs; the GM’s Clear does not touch it; players never get the GM panel or its actions',async()=>{
  _test.resetLastGather();_test.incomingRounds.clear();_test.playerResults.clear();
  // A player's client has a revealed, closed gather.
  game.user=gm;sent.length=0;dialogs.length=0;_test.setExoticRoll(dice(50,50));
  const round=await _test.startRound({node:nodeOf('adhoc-last4'),professions:['herbalism'],tiers:[1],dc:10});
  const prompt=sentOf('gather-round').find(p=>p.toUserIds[0]==='u1');
  game.user=alice;await _test.onSocket(prompt,'gm');
  game.user=gm;_test.recordRoll(round.id,{actorId:'ana',total:15});_test.recordRoll(round.id,{actorId:'bo',total:12});_test.recordRoll(round.id,{actorId:'fay',total:3});sent.length=0;
  _test.revealRound(round.id);const reveal=sentOf('gather-round-reveal').find(m=>m.toUserIds.includes('u1'));
  game.user=alice;await _test.onSocket(reveal,'gm');
  game.user=gm;await _test.giveRound(round.id);const closed=sentOf('gather-round-closed').at(-1);
  game.user=alice;await _test.onSocket(closed,'gm');
  let h=await html();assert.match(h,/Last gather: /,'the player’s panel');assert.doesNotMatch(h,/gather-dismiss-last|gather-clear-last|Clear for everyone|Last gather, /,'no GM controls or GM text for a player');
  // The GM clears their own view.
  game.user=gm;await app._click('gather-dismiss-last');
  game.user=alice;h=await html();assert.match(h,/Last gather: /,'the player’s panel is still there');
  // Players are refused in the data layer and in the click handler.
  assert.throws(()=>_test.dismissLastGather(),/Only the GM/);assert.equal(_test.gmLastGather(),null);
  errors.length=0;await app._click('gather-dismiss-last');assert.ok(errors.some(e=>/Only the GM/.test(e)));
  game.user=gm;
});
