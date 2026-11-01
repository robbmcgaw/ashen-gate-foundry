import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {SKILL_IDS} from '../scripts/checks.mjs';
import {normalizeNode} from '../scripts/gathering.mjs';
import {selectionKeys,selectionTiers,tiersText,roundDC,eligibleRollers,catalogPool,nodePool,planRound,needsManual,stripLead} from '../scripts/round.mjs';
import {revealHtml,reelStrip,FALLBACK_IMG} from '../scripts/reel.mjs';
// 0.34.0: the gather round. No lead gatherer: holders of the chosen professions roll; the Ledger settles drops; a reel only pictures them.
// All names are synthetic ([TEST]).

test('pure: profession and tier selection, default DC, eligibility by held profession, no lead',()=>{
 assert.deepEqual(selectionKeys(['Herbalism','herbalism','PROF-TG-MINING','Alchemy',null,'Skinning & Harvesting']),['herbalism','mining','huntingskinning'],'gathering professions only, once each');
 assert.deepEqual(selectionTiers([3,'Apprentice',9,'x',3]),[1,3]);assert.deepEqual(selectionTiers({min:2,max:4}),[2,3,4]);
 assert.equal(tiersText([1,2,3,5]),'Tiers 1–3, Tier 5');assert.equal(tiersText([2]),'Tier 2');
 assert.equal(roundDC('',[1,3]),15,'the DC of the highest chosen tier');assert.equal(roundDC('13',[1]),13);assert.equal(roundDC('',[]),null);
 assert.deepEqual(stripLead({leadId:'a',helperIds:['b'],dc:12}),{dc:12});
 const held={a:['herbalism'],b:['mining','herbalism'],c:['alchemy'],d:[]};
 const actors=Object.keys(held).map(id=>({id}));
 assert.deepEqual(eligibleRollers(actors,['herbalism'],a=>held[a.id]).map(r=>r.actor.id),['a','b'],'only holders');
 assert.deepEqual(eligibleRollers(actors,['mining','herbalism'],a=>held[a.id]).map(r=>[r.actor.id,r.professionKey]),[['a','herbalism'],['b','mining']],'a holder of several rolls with the first chosen one');
 assert.deepEqual(eligibleRollers(actors,[],a=>held[a.id]),[]);
});

test('pure: planRound: DC pass/fail, rare by 5+, no-rare fallback, distinct drops, undetermined rows, manual data',()=>{
 const pool={common:[{materialId:'MAT-A',quantity:1,chance:null},{materialId:'MAT-B',quantity:1,chance:null},{materialId:'MAT-C',quantity:1,chance:null}],rare:[{materialId:'MAT-R',quantity:1,chance:null}]};
 const rolls=[10,12,14,15,9].map((total,i)=>({actorId:`p${i}`,actorName:`P${i}`,total}));
 const seq=[1,1,1,1];let n=0;
 const out=planRound({pool,rolls,dc:10,roll:()=>seq[n++%seq.length]});
 assert.deepEqual(out.rows.map(r=>r.result),['common','common','common','rare','fail'],'at DC, DC+4, DC+5 is rare, below DC fails');
 assert.deepEqual(out.rows.map(r=>r.drops.map(d=>d.materialId)),[['MAT-A'],['MAT-B'],['MAT-C'],['MAT-R'],[]],'a different common material per success while the pool allows');
 assert.deepEqual(out.rows[3].mayReceive,['Rare']);assert.deepEqual(out.rows[4].mayReceive,[]);
 // More winners than materials: repeats only after the pool has been given out.
 const more=planRound({pool:{common:pool.common.slice(0,2),rare:[]},rolls:[12,12,12].map((total,i)=>({actorId:`p${i}`,actorName:`P${i}`,total})),dc:10,roll:()=>1});
 assert.deepEqual(more.rows.map(r=>r.drops[0].materialId),['MAT-A','MAT-B','MAT-A']);
 // No rare material: success by 5+ gives the common one and says so.
 const noRare=planRound({pool:{common:pool.common,rare:[]},rolls:[{actorId:'x',actorName:'X',total:25}],dc:10,roll:()=>1});
 assert.deepEqual([noRare.rows[0].result,noRare.rows[0].noRareFallback,noRare.rows[0].drops[0].kind,noRare.rows[0].mayReceive],['rare',true,'common',['Common']]);
 // Nothing to draw from: the row is undetermined and the round needs the GM.
 const none=planRound({pool:{common:[],rare:[]},rolls:[{actorId:'x',actorName:'X',total:12},{actorId:'y',actorName:'Y',total:3}],dc:10,roll:()=>1});
 assert.deepEqual(none.rows[0].undetermined,['common']);assert.deepEqual(none.rows[0].drops,[]);assert.equal(needsManual(none.rows),true);
 assert.equal(needsManual(out.rows),false);
 // A weighted table still draws by its chances, one d100 per pick.
 const faces=[];
 const weighted=planRound({pool:{common:[{materialId:'MAT-A',quantity:1,chance:70},{materialId:'MAT-B',quantity:3,chance:30}],rare:[]},rolls:[{actorId:'x',actorName:'X',total:12}],dc:10,roll:f=>{faces.push(f);return 71;}});
 assert.deepEqual([weighted.rows[0].drops[0].materialId,weighted.rows[0].drops[0].quantity,faces],['MAT-B',3,[100]]);
});

test('pure: pools: a saved node keeps its tables; an ad-hoc pool is the materials of the chosen professions and tiers, by quality',()=>{
 const node={materialId:'MAT-A',quantity:2,rareMaterialId:'MAT-R',rareQuantity:1,tables:null};
 assert.deepEqual(nodePool(node),{common:[{materialId:'MAT-A',quantity:2,chance:null}],rare:[{materialId:'MAT-R',quantity:1,chance:null}]});
 assert.deepEqual(nodePool({}),{common:[],rare:[]});
 const m=(id,quality,tier,profs)=>({id,name:id,quality,tier,professionIds:profs,state:'ok'});
 const catalog=[m('MAT-H1','Common',1,['PROF-TG-HERBALISM']),m('MAT-H2','Common',2,['PROF-TG-HERBALISM']),m('MAT-HR','Rare',1,['PROF-TG-HERBALISM']),m('MAT-HX','Exotic',1,['PROF-TG-HERBALISM']),
  m('MAT-M1','Common',1,['PROF-TG-MINING']),{...m('MAT-HD','Common',1,['PROF-TG-HERBALISM']),state:'draft'}];
 const pool=catalogPool(catalog,{professions:['herbalism'],tiers:[1],usable:x=>x.state==='ok'});
 assert.deepEqual(pool.common.map(e=>e.materialId),['MAT-H1']);assert.deepEqual(pool.rare.map(e=>e.materialId),['MAT-HR']);assert.deepEqual(pool.exotics.map(e=>e.materialId),['MAT-HX']);
 assert.deepEqual(catalogPool(catalog,{professions:['herbalism','mining'],tiers:[1,2],usable:x=>x.state==='ok'}).common.map(e=>e.materialId),['MAT-H1','MAT-H2','MAT-M1']);
 assert.deepEqual(catalogPool(catalog,{professions:['herbalism'],tiers:[1]}).common.map(e=>e.materialId),['MAT-H1','MAT-HD'],'the caller decides whether a draft is usable');
});

test('pure: the reel: one strip per winner ending on the real drop; a plain list for reduced motion; re-renders join the animation',()=>{
 const reel=[{img:'a.webp',name:'A'},{img:'b.webp',name:'B'},{img:'c.webp',name:'C'}];
 const strip=reelStrip(reel,{img:'win.webp'},'p0');
 assert.equal(strip.at(-1).img,'win.webp');assert.ok(strip.length>5);assert.deepEqual(reelStrip(reel,{img:'win.webp'},'p0'),strip,'the same picture on every re-render');
 const view={title:'[TEST] Patch',dcText:'DC 10',reel,rows:[
  {id:'p0',name:'P0',total:14,result:'common',drops:[{name:'[TEST] Herb',img:'herb.webp',quantity:1,kind:'common',hidden:false}],undetermined:false},
  {id:'p1',name:'P1',total:3,result:'fail',drops:[],undetermined:false},
  {id:'p2',name:'P2',total:12,result:'common',drops:[],undetermined:true}]};
 const motion=revealHtml(view,{elapsed:0});
 assert.match(motion,/class="agl-reel"/);assert.match(motion,/Skip animation/);assert.match(motion,/win\.webp|herb\.webp/);
 assert.match(motion,/\[TEST\] Herb/,'the result is always written out too');assert.match(motion,/Nothing found/);assert.match(motion,/gives it by hand/);
 assert.match(motion,/role="status" aria-live="polite">P0: 1|aria-live="polite">P0: \[TEST\] Herb/);
 const plain=revealHtml(view,{reduced:true});
 assert.doesNotMatch(plain,/agl-reel|Skip animation/);assert.match(plain,/is-plain/);assert.match(plain,/\[TEST\] Herb/);
 assert.match(revealHtml(view,{elapsed:999}),/is-played/);assert.doesNotMatch(revealHtml(view,{elapsed:999}),/Skip animation/,'nothing to skip once it has played');
 assert.match(revealHtml(view,{elapsed:1.5}),/--agl-delay:-1\.50s/,'a re-render joins the spin where it is');
 const hidden=revealHtml({...view,rows:[{...view.rows[0],drops:[{name:'',img:'',quantity:1,kind:'common',hidden:true}]}]},{});
 assert.match(hidden,/A special find/);assert.ok(hidden.includes(FALLBACK_IMG),'a hidden drop uses the generic icon');assert.doesNotMatch(hidden,/herb\.webp/);
 assert.match(revealHtml({...view,rows:[{...view.rows[0],drops:[{name:'X',img:'',quantity:1,kind:'common',hidden:false}]}]},{}),new RegExp(FALLBACK_IMG.replace('.','\\.')),'a material with no picture falls back to a generic icon');
});

/* ---- Mocked Foundry: the real round flow ------------------------------------------------------ */
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const hooks={},errors=[],infos=[],chats=[],sent=[],dialogs=[];let api;
const values={partyRoster:['ana','bo','cy','dee','eli','fay','gus'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},exoticChance:2};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true},cat={id:'u3',isGM:false,name:'Cat',active:true};
const users=[gm,alice,bob,cat];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;dialogs.push(this);}render(){this.rendered=true;return this;}async close(){this.closed=true;}static async wait(){return true;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
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
const ledgerModule={active:true,version:'0.45.0',set api(v){api=v},get api(){return api}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
 actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:(name,msg)=>sent.push(msg),on:()=>{}},
 modules:{get:id=>id==='ashen-gate-profession-ledger'?ledgerModule:null},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'gathering'});
const html=async()=>{app.view='gathering';return (await app._prepareContext({})).html;};
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

test('eligibility: only party characters holding a chosen profession are listed and sent a roll; others are not offered one',async()=>{
 game.user=gm;sent.length=0;_test.setExoticRoll(noRoll);
 const round=await api.gathering.start({node:adhoc,professions:['Herbalism'],tiers:[1],dc:10,leadId:'eli',helperIds:['bo']});
 assert.deepEqual(round.rollers.map(r=>r.actorId),['ana','bo','fay'],'holders of Herbalism only; leadId and helperIds are ignored');
 const prompts=sentOf('gather-round');
 assert.deepEqual(prompts.map(p=>p.toUserIds[0]).sort(),['u1','u2','u3']);
 const forBob=prompts.find(p=>p.toUserIds[0]==='u2');assert.deepEqual(forBob.rollers.map(r=>r.actorId),['bo'],'a player is sent only their own characters');
 assert.ok(!/materialId|pool/.test(JSON.stringify(prompts)),'no pool or ids in what players are sent');
 assert.equal(forBob.dc,10);
 await assert.rejects(()=>api.gathering.start({node:adhoc,professions:['herbalism']}),/gather is already open/,'one round at a time');
 api.gathering.cancel(round.id);
 const second=await api.gathering.start({node:adhoc,professions:['mining','herbalism'],tiers:[1],dc:10});
 assert.deepEqual(second.rollers.map(r=>[r.actorId,r.professionKey]),[['ana','mining'],['bo','herbalism'],['cy','mining'],['fay','herbalism']],'a holder of several rolls with the first chosen profession');
 api.gathering.cancel(second.id);
 await assert.rejects(()=>api.gathering.start({node:{...adhoc,skill:''},professions:[],tiers:[1],dc:10}),/Choose which professions can roll/);
 await assert.rejects(()=>api.gathering.start({node:{...adhoc,skill:'',tier:null},professions:['herbalism'],dc:10}),/Choose at least one tier/);
 await assert.rejects(()=>api.gathering.start({node:adhoc,professions:['alchemy'],tiers:[1],dc:10}),/Choose which professions can roll/,'Alchemy is not a gathering profession');
 values.partyRoster=['bo'];await assert.rejects(()=>api.gathering.start({node:adhoc,professions:['mining'],tiers:[1],dc:10}),/No party character holds any of the chosen professions \(Mining\)/);
 values.partyRoster=['ana','bo','cy','dee','eli','fay','gus'];
});

test('the setup form: professions and tiers to tick, a DC, who can roll, one primary action; no lead or helpers',async()=>{
 game.user=gm;Object.assign(app.gather,{source:'adhoc',professions:['herbalism'],tiers:[1,2],dc:'',label:''});
 const h=await html();
 assert.match(h,/Professions that can roll/);assert.match(h,/data-gather-prof="herbalism" checked/);assert.match(h,/data-gather-tier="2" checked/);assert.match(h,/data-gather-dc /);
 assert.match(h,/Can roll \(3\):/);assert.match(h,/agl-can-roll__list.*\[TEST\] Ana.*\[TEST\] Bo.*\[TEST\] Fay/s);assert.doesNotMatch(h.slice(h.indexOf('agl-can-roll__list')),/\[TEST\] Cy/);
 assert.match(h,/placeholder="12"/,'the DC of the highest chosen tier');
 assert.match(h,/data-action="gather-start" ><i class="fa-solid fa-seedling" aria-hidden="true"><\/i> Start gather…/);
 assert.doesNotMatch(h,/Lead gatherer|Helpers|data-gather-helper|Active checks/);
 app.gather.professions=[];assert.match(await html(),/Choose which professions can roll\./);assert.match(await html(),/data-action="gather-start" disabled/);
 app.gather.professions=['fishing'];assert.doesNotMatch(await html(),/data-action="gather-start" disabled/);assert.match(await html(),/Can roll \(1\):[^]*\[TEST\] Gus/);
 app.gather.professions=['archaeology'];assert.match(await html(),/Nobody in the party holds those professions/);assert.match(await html(),/data-action="gather-start" disabled/);
 app.gather.professions=['herbalism'];
 // The change handlers keep the selection.
 app.element={querySelector:()=>null,querySelectorAll:()=>[]};
});

test('DC pass/fail and distinct drops: one roll each, the Ledger settles every drop before anything is given, loot only on Give',async()=>{
 game.user=gm;sent.length=0;chats.length=0;_test.setExoticRoll(dice(1,1,1,1,1,1));
 const round=await _test.startRound({node:nodeOf('adhoc-1'),professions:['herbalism'],tiers:[1],dc:10});
 _test.setExoticRoll(dice(50,50,50,1));
 _test.recordRoll(round.id,{actorId:'ana',total:12,by:'Alice'});
 assert.throws(()=>_test.recordRoll(round.id,{actorId:'ana',total:20}),/already rolled/,'one roll per character per round');
 assert.throws(()=>_test.recordRoll(round.id,{actorId:'cy',total:20}),/does not hold a profession/);
 assert.throws(()=>_test.revealRound('nope'),/no longer open/);
 _test.recordRoll(round.id,{actorId:'bo',total:16});
 _test.recordRoll(round.id,{actorId:'fay',total:9});
 const before=[of(ana,'MAT-TG-H1'),of(ana,'MAT-TG-H2'),of(bo,'MAT-TG-HR')];
 const out=_test.revealRound(round.id);
 assert.deepEqual(out.rows.map(r=>[r.actorId,r.result]),[['ana','common'],['bo','rare'],['fay','fail']]);
 assert.ok(['MAT-TG-H1','MAT-TG-H2'].includes(out.rows[0].drops[0].materialId),'Common from the herbalism, tier 1 pool; the draft, tier 2 and other professions are not in it');
 assert.equal(out.rows[1].drops[0].materialId,'MAT-TG-HR','success by 5+ gives the Rare one');
 assert.deepEqual(out.rows[2].drops,[]);
 assert.deepEqual([of(ana,'MAT-TG-H1'),of(ana,'MAT-TG-H2'),of(bo,'MAT-TG-HR')],before,'revealing gives nothing');
 assert.equal(out.needsManual,false);
 assert.throws(()=>_test.recordRoll(round.id,{actorId:'fay',total:30}),/no longer open for rolls/,'rolls close at the reveal');
 // The same result again after any number of re-renders: it is stored, not recomputed.
 assert.deepEqual(_test.roundView(_test.openRound()).rows.map(r=>r.drops.map(d=>d.materialId??d.name)),_test.roundView(_test.openRound()).rows.map(r=>r.drops.map(d=>d.materialId??d.name)));
 const given=await finish(round);
 assert.equal(of(ana,out.rows[0].drops[0].materialId),1);assert.equal(of(bo,'MAT-TG-HR'),1);
 assert.equal(chats.length,3,'one card per rolling character');
 assert.match(chats[0].content,/\[TEST\] Ana gathered 1 × \[TEST\] (Moss|Fern)/);assert.equal(chats[0].flags['ashen-gate-profession-ledger'].xp.kind,'gather');
 assert.match(chats[2].content,/found nothing usable/);
 assert.equal(_test.gatherRounds.size,0);
 await assert.rejects(()=>_test.giveRound(round.id),/Reveal the results/,'loot is never given twice');
 assert.ok(given.rows.length===3);
});

test('a different drop for each successful player; tiers widen the pool; repeats only when the pool runs out',async()=>{
 game.user=gm;chats.length=0;_test.setExoticRoll(dice(50,50,50,50,50,50));
 const run=async(tiers,totals)=>{const round=await _test.startRound({node:nodeOf(`adhoc-${Math.random()}`),professions:['herbalism'],tiers,dc:10});
  for(const [id,t] of Object.entries(totals))_test.recordRoll(round.id,{actorId:id,total:t});
  const out=_test.revealRound(round.id);_test.cancelRound(round.id);return out.rows.map(r=>r.drops[0]?.materialId);};
 const two=await run([1],{ana:12,bo:12,fay:12});
 assert.notEqual(two[0],two[1],'the first two are different');assert.equal(new Set(two).size,2,'only two Common materials exist at tier 1: the third repeats');
 const three=await run([1,2],{ana:12,bo:12,fay:12});
 assert.equal(new Set(three).size,3,'with tier 2 chosen too there are three, so all differ');assert.ok(three.includes('MAT-TG-H3'));
});

test('Exotic: only by the existing chance, from the Exotic materials of the chosen professions and tiers; players see it only once found',async()=>{
 game.user=gm;sent.length=0;
 const round=await _test.startRound({node:nodeOf('adhoc-x'),professions:['herbalism'],tiers:[1],dc:10});
 _test.recordRoll(round.id,{actorId:'ana',total:12});_test.recordRoll(round.id,{actorId:'bo',total:12});
 _test.setExoticRoll(dice(2,50,1,50));
 const out=_test.revealRound(round.id);
 const exo=out.rows.map(r=>r.drops.find(d=>d.kind==='exotic')?.materialId??null);
 assert.deepEqual(exo,['MAT-TG-HX',null],'d100 2 hits the 2% chance; 50 misses');
 const reveal=sentOf('gather-round-reveal')[0];
 assert.deepEqual(reveal.toUserIds.sort(),['u1','u2','u3']);
 assert.ok(!JSON.stringify(reveal.view).includes('materialId'),'a player copy carries no ids');
 _test.cancelRound(round.id);
});

test('fallback: when tier and DC cannot settle a drop, the GM gets who rolled, who met the DC and what each may receive, with Give… for each',async()=>{
 game.user=gm;chats.length=0;dialogs.length=0;_test.setExoticRoll(noRoll);
 Object.assign(app.gather,{source:'adhoc',professions:['fishing'],tiers:[1],dc:'10',label:''});
 await app._click('gather-start');
 const round=_test.openRound();assert.deepEqual(round.rollers.map(r=>r.actorId),['gus']);
 const panel=await html();assert.match(panel,/0 of 1 have rolled/);assert.match(panel,/data-action="gather-reveal"[^>]*disabled/);
 _test.recordRoll(round.id,{actorId:'gus',total:14});
 await app._click('gather-reveal',round.id);
 const rows=_test.handoutRows(_test.openRound());
 assert.deepEqual(rows.map(r=>({n:r.name,met:r.met,may:r.mayReceive,hand:r.needsHand,total:r.total,dc:r.dc})),[{n:'[TEST] Gus',met:true,may:['Common'],hand:true,total:14,dc:10}]);
 assert.match(rows[0].status,/No imported Common materials for Fishing, tier 1\. Import them with General Manager\. Give it by hand\./,'a specific reason, not a generic line');
 const pop=dialogs.find(d=>d.opts.window?.title==='Hand out loot');
 assert.ok(pop,'the pop-up opens by itself');assert.match(pop.opts.content,/\[TEST\] Gus/);assert.match(pop.opts.content,/14 vs DC 10 · Met the DC · May receive: Common/);assert.match(pop.opts.content,/data-action="agl-handout-give" data-actor="gus">Give…</);
 const view=await html();assert.match(view,/could not settle every drop/);assert.match(view,/data-action="gather-give-open" data-id="gus">Give…</);
 // The Add flow: materials of that quality, matching professions and tiers first, otherwise all of that quality.
 const give=_test.giveChoices(_test.openRound(),_test.openRound().result.rows[0]);
 assert.equal(give.matching,false);assert.ok(give.materials.every(m=>m.quality==='Common'));assert.ok(give.materials.some(m=>m.id==='MAT-TG-H1'));assert.ok(!give.materials.some(m=>m.id==='MAT-TG-HR'),'no Rare for a Common-only row');
 const dlg=await _test.openGiveDialog(round.id,'gus');assert.match(dlg.opts.content,/data-action="agl-give-material" data-material="MAT-TG-H1">Add</);
 game.user=bob;await assert.rejects(()=>_test.giveByHand(round.id,'gus','MAT-TG-H1',1),/Only the GM/);await assert.rejects(()=>_test.openHandoutDialog(round.id),/Only the GM/);game.user=gm;
 await assert.rejects(()=>_test.giveByHand(round.id,'ana','MAT-TG-H1',1),/did not meet the DC|Reveal/,'only a character who met the DC');
 await assert.rejects(()=>_test.giveByHand(round.id,'gus','MAT-TG-GONE',1),/Not imported in this world/);
 // The buttons really work: ApplicationV2 routes a click on [data-action] to options.actions (what Foundry does), with no render callback needed.
 const click=(dialog,action,data)=>{const el={dataset:{action,...data},closest:()=>el};dialog.opts.actions[action]({preventDefault(){}},el);return el;};
 const before=chats.length;
 const giveDlg=dialogs.length;click(pop,'agl-handout-give',{actor:'gus'});await flush();
 assert.equal(dialogs.length,giveDlg+1,'Give… in the pop-up opens the Add picker');
 const picker=dialogs.at(-1);assert.match(picker.opts.window.title,/Give loot — \[TEST\] Gus/);
 const addBtn=click(picker,'agl-give-material',{material:'MAT-TG-H1'});await flush();await flush();
 assert.equal(of(gus,'MAT-TG-H1'),1,'Add gives the item to that character');assert.equal(addBtn.disabled,true);
 assert.match(chats.at(-1).content,/\[TEST\] Gus<\/strong> was given 1 × \[TEST\] Moss by the GM/);assert.ok(chats.length>before);
 const row=_test.openRound().result.rows[0];assert.equal(row.drops.at(-1).given,true);assert.equal(_test.handoutRows(_test.openRound())[0].needsHand,false,'the row is marked as given');
 assert.match(dialogs.at(-1).opts.content,/The Ledger picked/,'the hand-out list refreshed itself');
 game.user=bob;const bad=click(picker,'agl-give-material',{material:'MAT-TG-H2'});await flush();await flush();assert.equal(of(gus,'MAT-TG-H2'),0,'a player cannot give');game.user=gm;
 await api.gathering.giveByHand(round.id,'gus','MAT-TG-H2',1);
 assert.equal(of(gus,'MAT-TG-H2'),1);await api.gathering.give(round.id);
 assert.match(chats.at(-1).content,/\[TEST\] Gus gathered 1 × \[TEST\] Moss/);
 assert.equal(_test.gatherRounds.size,0);
});

test('permissions: the GM starts, reveals, gives and cancels; a player rolls only for a character they own; forged messages are ignored',async()=>{
 game.user=gm;sent.length=0;_test.setExoticRoll(dice(50));
 const round=await _test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10});
 const prompts=sentOf('gather-round');sent.length=0;
 game.user=alice;
 await assert.rejects(()=>_test.startRound({node:adhoc,professions:['herbalism']}),/Only the GM/);
 for(const call of [()=>_test.revealRound(round.id),()=>_test.cancelRound(round.id),()=>_test.recordRoll(round.id,{actorId:'ana',total:20}),()=>api.gathering.round()])
   assert.throws(call,/Only the GM/);
 await assert.rejects(()=>_test.giveRound(round.id),/Only the GM/);await assert.rejects(()=>api.gathering.start({node:adhoc,professions:['herbalism']}),/Only the GM/);
 await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'ana',total:20}),/Only the GM can record/,'a player cannot hand in a total');
 // The prompt reaches Alice only for her own character.
 await _test.onSocket(prompts.find(p=>p.toUserIds[0]==='u1'),'gm');
 assert.equal(_test.incomingRounds.get(round.id).rollers.length,1);
 await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'bo'}),/only roll for a character you own/);
 await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'dee'}),/does not hold a profession for this gather/);
 ana.nextRoll=13;rolls.length=0;
 const mine=await api.gathering.roll(round.id,{actorId:'ana'});
 assert.equal(mine.total,13);assert.deepEqual(rolls.at(-1),{actor:'ana',skill:'nat',advantage:false,disadvantage:false},'her own check from her own mapping');
 await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'ana'}),/already rolled/);
 const rolled=sentOf('gather-rolled')[0];assert.equal(rolled.total,13);
 // GM side: a roll from the wrong user, for the wrong character, or an unknown choice is ignored; the right one is recorded.
 game.user=gm;
 assert.equal(await _test.receiveGatherRoll({...rolled,actorId:'bo'},'u1'),false,'Alice does not own Bo');
 assert.equal(await _test.receiveGatherRoll({...rolled,choice:'skill:nope'},'u1'),false);
 assert.equal(await _test.receiveGatherRoll(rolled,'gm'),false,'not from the GM through the player path');
 assert.equal(await _test.receiveGatherRoll(rolled,'u1'),true);
 assert.equal(_test.openRound().rollers.find(r=>r.actorId==='ana').rolled.total,13);
 assert.equal(await _test.receiveGatherRoll(rolled,'u1'),false,'once');
 // Players never read the round or its pool through the API.
 game.user=alice;assert.throws(()=>api.gathering.round(),/Only the GM/);
 game.user=gm;assert.deepEqual(api.gathering.round().rollers.map(r=>r.rolled),[13,null,null]);
 assert.ok(!JSON.stringify(api.gathering.round()).includes('pool'));
 // Loot is only ever given by the GM action.
 const bag=of(ana,'MAT-TG-H1')+of(ana,'MAT-TG-H2');
 _test.revealRound(round.id);assert.equal(of(ana,'MAT-TG-H1')+of(ana,'MAT-TG-H2'),bag);
 // A player cannot receive or forge the GM-only messages.
 game.user=bob;await _test.onSocket({type:'gather-round-reveal',toUserIds:['u2'],roundId:round.id,view:{rows:[],reel:[],title:'x'}},'u1');assert.equal(_test.playerResults.size,0,'only the GM can send a reveal');
 game.user=gm;await finish(round);
});

test('unreleased materials: players never see them in the reel or by name until the GM gives them',async()=>{
 game.user=gm;sent.length=0;_test.setExoticRoll(dice(50,50));
 const round=await _test.startRound({node:nodeOf('adhoc-d'),professions:['herbalism'],tiers:[1],dc:10,allowDraft:true});
 for(const id of ['ana','bo','fay'])_test.recordRoll(round.id,{actorId:id,total:12});
 _test.revealRound(round.id);
 const gmView=_test.roundView(_test.openRound(),{players:false}),pv=_test.roundView(_test.openRound(),{players:true});
 assert.ok(JSON.stringify(gmView).includes('Draft Bloom'),'the GM sees the draft material in the pool or drops');
 assert.doesNotMatch(JSON.stringify(sentOf('gather-round-reveal')[0].view),/Draft Bloom/);
 assert.doesNotMatch(JSON.stringify(pv),/Draft Bloom|materialId/);
 assert.ok(pv.rows.flatMap(r=>r.drops).filter(d=>d.hidden).every(d=>d.name===''&&d.img===''));
 assert.ok(!pv.reel.some(r=>/Draft/.test(r.name)));
 await finish(round);
});

test('reduced motion: the reveal is a plain list; otherwise a reel with Skip animation; a skipped or finished one shows the end state',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50,50));
 const round=await _test.startRound({node:nodeOf('adhoc-m'),professions:['herbalism'],tiers:[1],dc:10});
 _test.recordRoll(round.id,{actorId:'ana',total:12});_test.revealRound(round.id);
 _test.setReducedMotion(true);
 let h=await html();assert.match(h,/is-plain/);assert.doesNotMatch(h,/class="agl-reel"|Skip animation/);assert.match(h,/\[TEST\] Ana<\/strong>/);assert.match(h,/data-action="gather-give"/);
 _test.setReducedMotion(false);
 h=await html();assert.match(h,/class="agl-reel"/);assert.match(h,/data-action="skip-reveal"/);assert.doesNotMatch(h,/is-played/);
 await app._click('skip-reveal');
 h=await html();assert.match(h,/is-played/);assert.doesNotMatch(h,/Skip animation/);
 assert.match(h,/Nothing is given yet\. <b>Give loot<\/b> puts the 1 listed item on the characters/,'the UI says loot is given on confirm');
 _test.setReducedMotion(null);
 await app._click('gather-give',round.id);
 assert.equal(_test.gatherRounds.size,0);assert.match(await html(),/Last gather/);
});

test('the window closing mid-spin loses nothing: the settled round lives on the GM client until it is given',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50,50));
 const round=await _test.startRound({node:nodeOf('adhoc-w'),professions:['herbalism'],tiers:[1],dc:10});
 _test.recordRoll(round.id,{actorId:'bo',total:14});const out=_test.revealRound(round.id);
 const drop=out.rows[0].drops[0].materialId;
 app.element=null;// the window is closed
 const reopened=api.open({view:'gathering'});assert.equal(reopened,app);
 assert.equal(_test.openRound().result.rows[0].drops[0].materialId,drop,'the same result after reopening');
 const before=of(bo,drop);await finish(round);assert.equal(of(bo,drop),before+1);
});

test('no lead: old callers still work (leadId, helperIds ignored), an old remembered “Active checks” tab opens Gather, nothing persisted references a lead',async()=>{
 game.user=gm;
 const round=await api.gathering.start({node:{label:'[TEST] Old call',skill:'Herbalism',tier:1},leadId:'someone-who-left',helperIds:['bo','nobody']});
 assert.ok(round.rollers.length>0);assert.ok(round.rollers.every(r=>!('leadId' in r)));assert.equal('leadId' in round,false);
 api.gathering.cancel(round.id);
 // An older Ledger remembered the Active checks sub-tab per user; it is not a tab now.
 app._ui.set('gatherTab','active');app.gatherTab=null;
 assert.equal(app._gatherTabNow(),'start');
 app._ui.set('gatherTab','requests');app.gatherTab=null;assert.equal(app._gatherTabNow(),'requests','a still-valid remembered tab is kept');
 app._ui.set('gatherTab','start');app.gatherTab=null;
 assert.deepEqual(Object.keys(values).filter(k=>/lead|gather/i.test(k)),['gatherHistory'],'only the history (0.37.8) holds gather state');assert.ok(!/lead/i.test(JSON.stringify(values.gatherHistory)));
 // The old resolve(sessionId,{total}) shape: with one character left to roll it records for them.
 const solo=await api.gathering.start({node:adhoc,professions:['fishing'],tiers:[1],dc:10});
 assert.equal(api.gathering.resolve(solo.id,{total:12}).total,12);
 api.gathering.cancel(solo.id);
});

/* ---- 0.35.1: why a pool was empty, and older or thinner imports ------------------------------- */
const withWorld=async(docs,fn)=>{world.push(...docs);try{return await fn();}finally{for(const d of docs)world.splice(world.indexOf(d),1);}};
const fishRound=async(allowDraft=false)=>{
 const round=await _test.startRound({node:nodeOf('adhoc-f'),professions:['fishing'],tiers:[1],dc:10,allowDraft});
 _test.recordRoll(round.id,{actorId:'gus',total:14});
 const out=_test.revealRound(round.id);_test.cancelRound(round.id);return out;
};
const withDesc=(doc,html)=>{doc.system={description:{value:html}};return doc;};

test('an import with only the flag envelope still matches: quality, tier and profession come from the flag refs and the description line',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 const thin=withDesc(worldDoc('wthin','[TEST] Reedfin',{'ashen-gate-manager':{source:{sourceId:'MAT-TG-THIN',entityType:'Material',status:'approved',visibility:'player',refs:[{relation:'gathered_by',target_id:'PROF-TG-FISHING',mode:'required'}]}}},'icons/thin.webp'),
  '<section><h2>Reedfin</h2><p><em>common · Apprentice · Fishing</em></p></section>');
 await withWorld([thin],async()=>{
  const out=await fishRound();
  assert.deepEqual(out.rows[0].drops.map(d=>d.materialId),['MAT-TG-THIN'],'a thin import is found by its refs and description line, case aside');
  assert.equal(out.needsManual,false);
 });
});

test('a released material the world Item is not Observer for every player is still given by the GM (a permission detail, not a release state)',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 const hidden=matDoc('MAT-TG-F1','[TEST] Reedfin',{prof:'PROF-TG-FISHING'});hidden.testUserPermission=u=>u.isGM;
 await withWorld([hidden],async()=>{
  assert.equal(_test.materialState('MAT-TG-F1').state,'not-visible');
  const round=await _test.startRound({node:nodeOf('adhoc-nv'),professions:['fishing'],tiers:[1],dc:10});
  _test.recordRoll(round.id,{actorId:'gus',total:14});
  const out=_test.revealRound(round.id);
  assert.equal(out.rows[0].drops[0].materialId,'MAT-TG-F1');
  assert.ok(_test.roundView(_test.openRound(),{players:true}).rows[0].drops.every(d=>!d.hidden),'released by status and visibility, so players may see it');
  await _test.giveRound(round.id);assert.equal(of(gus,'MAT-TG-F1'),1);
 });
});

test('an empty pool says exactly why: nothing imported, draft only, duplicate, or unreadable imports',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 const reason=async(allow=false)=>(await fishRound(allow)).rows[0].reason;
 assert.equal(await reason(),'No imported Common materials for Fishing, tier 1. Import them with General Manager.');
 const draft=matDoc('MAT-TG-F2','[TEST] Draft Carp',{prof:'PROF-TG-FISHING'},{status:'draft'});
 await withWorld([draft],async()=>{
  assert.equal(await reason(),'1 Common material matches Fishing, tier 1 but is draft/unreleased: approve it in General Manager, or tick Use draft materials anyway.');
  const out=await fishRound(true);assert.deepEqual(out.rows[0].drops.map(d=>d.materialId),['MAT-TG-F2'],'ticking Use draft materials anyway uses it');
 });
 const a=matDoc('MAT-TG-F3','[TEST] Carp',{prof:'PROF-TG-FISHING'}),b=matDoc('MAT-TG-F3','[TEST] Carp again',{prof:'PROF-TG-FISHING'});b.id='wdup2';
 await withWorld([a,b],async()=>assert.match(await reason(),/1 Common material matches Fishing, tier 1 but is imported more than once: remove the duplicate in General Manager\./));
 const odd=worldDoc('wodd','[TEST] Mystery',{'ashen-gate-manager':{source:{sourceId:'MAT-TG-ODD',entityType:'Material',status:'approved',visibility:'player',definition:{id:'MAT-TG-ODD',entity_type:'Material',name:'[TEST] Mystery'}}}});
 await withWorld([odd],async()=>assert.match(await reason(),/^No imported Common materials for Fishing, tier 1\. Import them with General Manager\. 1 imported material has no readable quality, tier or profession \(an older import\): re-import it with General Manager\.$/));
 // A saved spot with no Common material of its own says so.
 const round=await _test.startRound({node:nodeOf('adhoc-s',{materialId:'MAT-TG-H1'}),professions:['fishing'],tiers:[1],dc:10});
 assert.equal(_test.poolReason(round,'rare'),'This spot lists no Rare material.');
 _test.cancelRound(round.id);
 const view=await (async()=>{const r=await _test.startRound({node:nodeOf('adhoc-v'),professions:['fishing'],tiers:[1],dc:10});_test.recordRoll(r.id,{actorId:'gus',total:14});_test.revealRound(r.id);return _test.roundView(_test.openRound(),{players:false});})();
 assert.match(view.rows[0].reason,/No imported Common materials for Fishing/);
 assert.match(await html(),/No imported Common materials for Fishing, tier 1\. Import them with General Manager\. Give it by hand\./,'shown on the Gather panel');
 assert.doesNotMatch(JSON.stringify(_test.roundView(_test.openRound(),{players:true})),/Import them|reason/,'players never get the reason');
});

/* ---- 0.35.4: who rolls with Advantage (from tools): the lists and the roll use one function ------------ */
const toolItem=(id,name,base,extra={})=>({id,name,type:'tool',system:{quantity:1,type:{baseItem:base,...(extra.type??{})},...(extra.system??{})},flags:{}});
const setAdv=advantageTools=>{values.checkMapping={advantageTools};};
const canRollRow=(h,name)=>{const i=h.indexOf('agl-can-roll__list');const list=h.slice(i,h.indexOf('</ul>',i));const li=list.split('<li').find(x=>x.includes(`>${name}<`))??'';return li;};
/** Everything a GM sees and the roll does for one character in one gather: the setup list, the round row, the roll prompt's preset, the dice. */
const advantageFor=async(name,actorId,professions)=>{
 Object.assign(app.gather,{source:'adhoc',professions,tiers:[1],dc:'10',label:''});
 const row=canRollRow(await html(),name);
 const round=await _test.startRound({node:nodeOf(`adhoc-adv-${Math.random()}`),professions,tiers:[1],dc:10});
 const roller=round.rollers.find(r=>r.actorId===actorId);
 const panel=(await html()).slice((await html()).indexOf('agl-round'));
 const actor=game.actors.get(actorId),preset=_test.presetOfProjection(actor,roller.plan);
 rolls.length=0;actor.nextRoll=14;
 await api.gathering.roll(round.id,{actorId});                       // no mode given: the roll must follow the preset
 const rolled=rolls.at(-1);
 const rowAfter=(await html()).slice((await html()).indexOf('agl-round'));
 _test.revealRound(round.id);
 const reveal=_test.roundView(_test.openRound(),{players:false}).rows.find(r=>r.id===actorId);
 const handout=_test.handoutRows(_test.openRound()).find(r=>r.actorId===actorId);
 _test.cancelRound(round.id);
 return {row,panel,preset,rolled,rowAfter,reveal,handout,professionKey:roller.professionKey};
};

test('advantage from a carried tool: the Can roll list, the round row, the prompt preset, the dice, the reveal and the hand-out all agree',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));setAdv({herbalism:['herb']});
 const kit=toolItem('kit','Herbalism Kit','herb');bo.items.push(kit);
 try{
  const r=await advantageFor('[TEST] Bo','bo',['herbalism']);
  assert.equal(r.preset.mode,1);
  assert.match(r.row,/data-mode="1"[^>]*aria-label="\[TEST\] Bo: Advantage: Herbalism Kit"[^>]*>.*Advantage: Herbalism Kit/s,'text, with an aria label, not colour alone');
  assert.match(r.panel,/Advantage: Herbalism Kit/);assert.equal(r.rolled.advantage,true,'the dice are rolled with advantage');
  assert.match(r.rowAfter,/Advantage: Herbalism Kit/,'still shown after rolling');
  assert.equal(r.reveal.advantage,'Advantage: Herbalism Kit');assert.equal(r.handout.advantage,'Advantage: Herbalism Kit');
 }finally{bo.items.splice(bo.items.indexOf(kit),1);}
});

test('advantage: a missing tool shows nothing and rolls normally; a tool in a container counts; a GM mapping change shows at once',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));setAdv({herbalism:['herb']});
 let r=await advantageFor('[TEST] Bo','bo',['herbalism']);
 assert.equal(r.preset.mode,0);assert.doesNotMatch(r.row,/agl-adv|Advantage/);assert.doesNotMatch(r.panel,/agl-adv/);assert.equal(r.rolled.advantage,false);assert.equal(r.reveal.advantage,'');
 const bag={id:'bag',name:'Explorer’s Pack',type:'container',system:{quantity:1},flags:{}};
 const inBag=toolItem('kit2','Herbalism Kit','herb',{system:{container:'bag'}});bo.items.push(bag,inBag);
 try{
  r=await advantageFor('[TEST] Bo','bo',['herbalism']);
  assert.match(r.row,/Advantage: Herbalism Kit/);assert.equal(r.rolled.advantage,true,'carried is carried, in a container or not');
  // GM override: the per-profession Tool for Advantage list is read live; clearing it removes the marker and the advantage.
  setAdv({});r=await advantageFor('[TEST] Bo','bo',['herbalism']);
  assert.doesNotMatch(r.row,/agl-adv/);assert.equal(r.rolled.advantage,false);
  setAdv({herbalism:['herb']});r=await advantageFor('[TEST] Bo','bo',['herbalism']);assert.match(r.row,/Advantage: Herbalism Kit/);
 }finally{bo.items.splice(bo.items.indexOf(inBag),1);bo.items.splice(bo.items.indexOf(bag),1);}
});

test('advantage with two professions: the list shows the check the character will actually roll, and the ticks change it live',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 setAdv({mining:['smith']});// only Mining has an advantage tool
 const anvil=toolItem('sm','Smith’s Tools','smith');ana.items.push(anvil);
 try{
  // Ana holds Herbalism and Mining; ticked in the form (Ledger order) she rolls Herbalism, the first one she holds: no advantage.
  let r=await advantageFor('[TEST] Ana','ana',['herbalism','mining']);
  assert.equal(r.professionKey,'herbalism');assert.doesNotMatch(r.row,/Advantage/);assert.equal(r.rolled.advantage,false,'the list and the dice agree');
  r=await advantageFor('[TEST] Ana','ana',['mining','herbalism']);// an API caller's order decides: Mining first
  assert.equal(r.professionKey,'mining');assert.match(r.row,/Advantage: Smith.s Tools/);assert.equal(r.rolled.advantage,true);
  // Tick only Mining: she rolls Mining, and the tool gives Advantage.
  r=await advantageFor('[TEST] Ana','ana',['mining']);
  assert.equal(r.professionKey,'mining');assert.match(r.row,/Advantage: Smith.s Tools/);assert.equal(r.rolled.advantage,true);
  assert.match(r.row,/\[TEST\] Ana.*Mining/s,'the row names the profession being rolled');
 }finally{ana.items.splice(ana.items.indexOf(anvil),1);}
});

test('advantage from a tool group (any musical instrument) and from proficiency; advantage and disadvantage cancel in words',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 setAdv({herbalism:['music']});
 const lute=toolItem('lute','Lute','lute',{type:{value:'music'}});bo.items.push(lute);
 try{
  let r=await advantageFor('[TEST] Bo','bo',['herbalism']);
  assert.match(r.row,/Advantage: Any musical instrument/);assert.equal(r.rolled.advantage,true);
 }finally{bo.items.splice(bo.items.indexOf(lute),1);}
 // Proficiency with the tool also counts (the same rule the roll prompt always had).
 setAdv({herbalism:['herb']});bo.system.tools={herb:{value:1}};
 try{const r=await advantageFor('[TEST] Bo','bo',['herbalism']);assert.match(r.row,/Advantage: Herbalism Kit/);assert.equal(r.rolled.advantage,true);}
 finally{delete bo.system.tools;}
 // A sheet effect giving disadvantage next to the tool's advantage: the roll is normal and the words say so.
 const kit=toolItem('kit3','Herbalism Kit','herb');bo.items.push(kit);bo.system.tools={herb:{roll:{mode:-1}}};
 try{const r=await advantageFor('[TEST] Bo','bo',['herbalism']);assert.equal(r.preset.mode,0);assert.match(r.row,/data-mode="0"[^>]*>.*Advantage and disadvantage cancel/s);assert.equal(r.rolled.advantage,false);assert.equal(r.rolled.disadvantage,false);}
 finally{bo.items.splice(bo.items.indexOf(kit),1);delete bo.system.tools;setAdv({});}
});

test('players never get the advantage lists or reasons in the reveal they are sent',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));setAdv({herbalism:['herb']});
 const kit=toolItem('kit4','Herbalism Kit','herb');bo.items.push(kit);
 try{
  const round=await _test.startRound({node:nodeOf('adhoc-adv-p'),professions:['herbalism'],tiers:[1],dc:10});
  _test.recordRoll(round.id,{actorId:'bo',total:14});_test.revealRound(round.id);
  assert.doesNotMatch(JSON.stringify(_test.roundView(_test.openRound(),{players:true})),/Advantage|advantage/);
  _test.cancelRound(round.id);
 }finally{bo.items.splice(bo.items.indexOf(kit),1);setAdv({});}
});

/* ---- 0.37.8: gather history and clearing ------------------------------------------------------------ */
import {readHistory,upsertEntry,setRowXp,HISTORY_MAX,humanWhen} from '../scripts/gather-history.mjs';
const histRound=async(totals={ana:14,bo:12})=>{
 const round=await _test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10});
 for(const [id,t] of Object.entries(totals))_test.recordRoll(round.id,{actorId:id,total:t});
 return round;
};
const clearHistoryNow=()=>{game.user=gm;api.gathering.clearHistory({alsoLast:true});};

test('history, pure: capped at 10, newest first, no duplicates; malformed stored data is dropped without throwing; dates are human',()=>{
 let list=[];
 for(let i=0;i<13;i++)list=upsertEntry(list,{id:`g${i}`,at:1000+i,title:'[TEST] Spot',tiers:[1],dc:10,professions:['Herbalism'],rows:[{actorId:'ana',name:'Ana',total:12,result:'common',drops:[{name:'Leaf',quantity:1,kind:'common',given:true}]}]});
 assert.equal(list.length,HISTORY_MAX);assert.deepEqual(list.map(e=>e.id).slice(0,2),['g12','g11']);assert.ok(!list.some(e=>e.id==='g0'||e.id==='g2'),'the oldest were dropped');
 assert.deepEqual(upsertEntry(list,{id:'g12',at:5000,title:'again',rows:[]}).filter(e=>e.id==='g12').length,1,'same id replaces');
 assert.deepEqual(readHistory(undefined),[]);assert.deepEqual(readHistory('x'),[]);assert.deepEqual(readHistory({entries:[null,{},{id:'a'},{id:'b',at:'z'},{id:'ok',at:1,rows:[{name:'A',total:'7',result:'bogus',drops:[{name:'L',quantity:-3}]}]}]}).map(e=>e.id),['ok']);
 const clean=readHistory({entries:[{id:'ok',at:1,rows:[{name:'A',total:'7',result:'bogus',drops:[{name:'L',quantity:-3}]}]}]})[0];
 assert.deepEqual([clean.rows[0].total,clean.rows[0].result,clean.rows[0].drops[0].quantity,clean.given],[7,'fail',1,false]);
 const noon=new Date(2026,9,28,21,42).getTime();
 assert.match(humanWhen(noon,noon),/^Today, 9:42\s?PM$/);assert.equal(humanWhen(new Date(2026,9,20,10,0).getTime(),noon),'Oct 20');
 assert.doesNotMatch(humanWhen(noon,noon),/\d{10}/);
});

test('history: written at Reveal, “Given” updates when loot is given, cancelled gathers are not listed, newest first, capped at 10',async()=>{
 clearHistoryNow();_test.setExoticRoll(dice(50,50));
 const r1=await histRound();_test.revealRound(r1.id);
 let h=api.gathering.history();assert.equal(h.length,1);assert.equal(h[0].given,false,'revealed, nothing given yet');
 assert.ok(h[0].rows.some(r=>r.drops.length&&r.drops.every(d=>!d.given)));
 await _test.giveRound(r1.id);
 h=api.gathering.history();assert.equal(h[0].given,true,'Given after Give loot');assert.deepEqual(h[0].rows.map(r=>r.name).sort(),['[TEST] Ana','[TEST] Bo']);
 // Cancelled before the reveal: never listed. Cancelled after the reveal: taken out.
 const r2=await histRound();_test.cancelRound(r2.id);assert.equal(api.gathering.history().length,1);
 const r3=await histRound();_test.revealRound(r3.id);assert.equal(api.gathering.history().length,2);_test.cancelRound(r3.id);assert.equal(api.gathering.history().length,1);
 // Order and cap.
 for(let i=0;i<11;i++){const r=await histRound();_test.revealRound(r.id);await _test.giveRound(r.id);}
 h=api.gathering.history();assert.equal(h.length,10);assert.ok(h.every((e,i)=>i===0||h[i-1].at>=e.at));
 assert.equal(JSON.parse(JSON.stringify(values.gatherHistory)).entries.length,10,'persisted in the world setting, same cap');
 clearHistoryNow();
});

test('history: the gather card carries the history id, and XP awarded or taken back lands on that row',async()=>{
 clearHistoryNow();chats.length=0;_test.setExoticRoll(dice(50,50));
 const r=await histRound({ana:14});_test.revealRound(r.id);await _test.giveRound(r.id);
 const card=chats.find(m=>m.flags?.['ashen-gate-profession-ledger']?.xp?.kind==='gather');
 assert.equal(card.flags['ashen-gate-profession-ledger'].historyId,r.id,'the card points at its history entry');
 const e=api.gathering.history()[0];assert.equal(e.id,r.id);assert.equal(e.rows.find(x=>x.actorId==='ana').xp,null);
 const withXp=setRowXp(readHistory({entries:[e]}),r.id,'ana',3);assert.equal(withXp[0].rows.find(x=>x.actorId==='ana').xp,3);
 assert.equal(setRowXp(withXp,r.id,'ana',null)[0].rows.find(x=>x.actorId==='ana').xp,null,'taken back');
 assert.equal(upsertEntry(withXp,{...withXp[0]})[0].rows.find(x=>x.actorId==='ana').xp,3,'a refresh keeps the XP');
 clearHistoryNow();
});

test('history and clearing: GM only in the data layer; the banner and the entry are cleared per the tick box; players see no history and their copy is cleared; nothing else changes',async()=>{
 clearHistoryNow();_test.setExoticRoll(dice(50,50));
 const r=await histRound();_test.revealRound(r.id);const bag=of(ana,'MAT-TG-H1')+of(ana,'MAT-TG-H2');await _test.giveRound(r.id);
 const after=of(ana,'MAT-TG-H1')+of(ana,'MAT-TG-H2');
 // Players: refused in the API, and no History tab.
 game.user=alice;
 assert.throws(()=>api.gathering.history(),/Only the GM/);assert.throws(()=>api.gathering.clearHistory(),/Only the GM/);assert.throws(()=>api.gathering.clearLast(),/Only the GM/);
 assert.throws(()=>_test.clearGatherHistory(),/Only the GM/);assert.throws(()=>_test.clearLastGather(),/Only the GM/);
 game.user=gm;
 // GM view: the tab, the entry (human date, no raw timestamp), the banner button.
 app.gatherTab='history';let h=await html();
 assert.match(h,/>History</);assert.match(h,/<details class="agl-history-entry" open>/);assert.match(h,/Today, \d{1,2}:\d{2}\s?[AP]M/);assert.doesNotMatch(h,/\b1[67]\d{11}\b/);
 assert.match(h,/data-action="gather-clear-history"[^>]*><i[^>]*><\/i> Clear history…/);
 app.gatherTab='start';h=await html();assert.match(h,/Last gather,/);assert.match(h,/data-action="gather-clear-last"/);
 // Clear last gather: banner gone, entry kept (default tick off).
 sent.length=0;const out=api.gathering.clearLast();assert.deepEqual([out.cleared,out.historyRemoved],[true,false]);
 assert.equal(api.gathering.history().length,1);app.gatherTab='start';assert.doesNotMatch(await html(),/Last gather,/);assert.equal(sentOf('gather-last-cleared').length,1);
 // Players: their own copy goes when told.
 game.user=bob;const keep=_test.playerResults.size;await _test.onSocket({type:'gather-last-cleared'},'gm');game.user=gm;
 // Ticked: the entry goes too (a banner must be present to know the entry).
 const r2=await histRound();_test.revealRound(r2.id);await _test.giveRound(r2.id);
 assert.deepEqual([api.gathering.clearLast({alsoHistory:true}).historyRemoved,api.gathering.history().length],[true,1]);
 // Clear history: default also clears the banner; the option keeps it.
 const r3=await histRound();_test.revealRound(r3.id);await _test.giveRound(r3.id);
 api.gathering.clearHistory({alsoLast:false});assert.equal(api.gathering.history().length,0);app.gatherTab='start';assert.match(await html(),/Last gather,/,'banner kept when unticked');
 app.gatherTab='history';assert.match(await html(),/No gathers yet\./);
 const r4=await histRound();_test.revealRound(r4.id);await _test.giveRound(r4.id);api.gathering.clearHistory();app.gatherTab='start';assert.doesNotMatch(await html(),/Last gather,/);
 assert.ok(of(ana,'MAT-TG-H1')+of(ana,'MAT-TG-H2')>=after&&after>=bag,'loot already given is never taken back');
 // The labelled confirmation: Cancel is the default; nothing happens unless the action is chosen.
 const W=foundry.applications.api.DialogV2,orig=W.wait;let seen;
 try{
  const r5=await histRound();_test.revealRound(r5.id);await _test.giveRound(r5.id);
  W.wait=async o=>{seen=o;return null;};app.gatherTab='history';await app._click('gather-clear-history');
  assert.equal(api.gathering.history().length,1,'cancelled: nothing cleared');assert.equal(seen.window.title,'Clear gather history?');
  assert.deepEqual(seen.buttons.map(b=>[b.label,Boolean(b.default)]),[['Cancel',true],['Clear history',false]]);assert.match(seen.content,/name="last" checked/,'ticked by default');
  W.wait=async o=>{seen=o;return {history:true};};await app._click('gather-clear-last');
  assert.equal(seen.window.title,'Clear the last gather?');assert.equal(seen.buttons[1].label,'Clear last gather');assert.doesNotMatch(seen.content,/name="history" checked/,'unticked by default');
  assert.equal(api.gathering.history().length,0,'ticked: entry removed too');
 }finally{W.wait=orig;}
 clearHistoryNow();
});

test('history: a stored setting from before (missing or of another shape) reads as empty and is not rewritten until a gather is recorded',()=>{
 const was=values.gatherHistory;
 try{
  values.gatherHistory=undefined;_test.getHistory();game.user=gm;
  assert.deepEqual(readHistory(values.gatherHistory),[]);
  values.gatherHistory={schema:'something-else',entries:'nope'};assert.deepEqual(readHistory(values.gatherHistory),[]);
 }finally{values.gatherHistory=was;}
});

test('player flow: Roll as <name> from the pop-up opens the Ledger on Gathering and shows the player’s roll; the reveal opens it with the reel; the GM is untouched',async()=>{
 game.user=gm;sent.length=0;dialogs.length=0;_test.setExoticRoll(dice(50,50));
 const round=await _test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10});
 const prompt=sentOf('gather-round').find(p=>p.toUserIds[0]==='u1');sent.length=0;
 game.user=alice;
 await _test.onSocket(prompt,'gm');
 const popup=dialogs.find(d=>d.opts?.window?.title==='Gather — roll your check');assert.ok(popup,'the small pop-up still appears');
 const btn=popup.opts.buttons.find(b=>b.action==='roll:ana');
 ana.nextRoll=14;btn.callback();
 for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r));
 const app=api.open();   // the same window the flow used
 assert.equal(app.view,'gathering','the Ledger is on Gathering');
 let h=(await app._prepareContext({})).html;
 assert.match(h,/Gather at /);assert.match(h,/Rolled 14/,'her own roll, as the tab shows it');
 assert.doesNotMatch(h,/data-agl-reveal/,'no reel before the reveal');
 // The GM reveals: the reel appears on the player’s screen, from the public view only.
 game.user=gm;const rolled=sent.find(m=>m.type==='gather-rolled');
 assert.equal(await _test.receiveGatherRoll(rolled,'u1'),true);_test.recordRoll(round.id,{actorId:'bo',total:12});sent.length=0;
 _test.revealRound(round.id);const reveal=sentOf('gather-round-reveal').find(m=>m.toUserIds.includes('u1'));
 game.user=alice;app.view='individual';
 await _test.onSocket(reveal,'gm');
 assert.equal(app.view,'gathering','opened on Gathering at the reveal');
 h=(await app._prepareContext({})).html;assert.match(h,/data-agl-reveal/);
 assert.ok(!/materialId|pool|Exotic chance/i.test(JSON.stringify(reveal.view)),'nothing hidden travels with the reveal');
 // GM client: the same socket message never opens a window for the GM.
 game.user=gm;app.view='individual';await _test.onSocket(reveal,'gm');assert.equal(app.view,'individual');
 _test.cancelRound(round.id);
});

/* ---- 0.37.12: who is included in a gather -------------------------------------------------------------- */
test('include: only the chosen characters are offered a roll; excluded rolls are refused in the data layer; the panel and banner say N of M; alsoInclude adds the requester',async()=>{
 game.user=gm;sent.length=0;_test.setExoticRoll(dice(50,50));
 const round=await _test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10,include:['ana']});
 assert.deepEqual(round.rollers.map(r=>[r.actorId,r.included]),[['ana',true],['bo',false],['fay',false]]);
 const prompts=sentOf('gather-round');
 assert.deepEqual(prompts.map(p=>p.toUserIds[0]).sort(),['u1'],'only Ana’s owner is prompted: Bo’s and Fay’s owners get nothing');
 assert.deepEqual(prompts[0].rollers.map(r=>r.actorId),['ana']);
 // GM side data layer.
 assert.throws(()=>_test.recordRoll(round.id,{actorId:'bo',total:14}),/The GM did not include \[TEST\] Bo in this gather\./);
 sent.length=0;ana.nextRoll=13;
 const forged={type:'gather-rolled',roundId:round.id,actorId:'bo',total:20,choice:round.rollers.find(r=>r.actorId==='bo').plan.selected};
 assert.equal(await _test.receiveGatherRoll(forged,'u2'),false,'Bo’s owner cannot roll for an excluded character');
 const refusal=sentOf('gather-roll-refused')[0];assert.deepEqual([refusal.toUserIds,refusal.message],[['u2'],'The GM did not include [TEST] Bo in this gather.']);
 // The player client learns it and refuses the API roll too.
 game.user=bob;await _test.onSocket({type:'gather-round',toUserIds:['u2'],roundId:round.id,title:'x',summary:'',professions:['Herbalism'],dc:null,rollers:[{roundId:round.id,actorId:'bo',actorName:'[TEST] Bo',professionName:'Herbalism',options:round.rollers[1].plan.options,selected:round.rollers[1].plan.selected,advantageTools:[],advantageItems:[],assists:[]}]},'gm');
 await _test.onSocket(refusal,'gm');
 await assert.rejects(()=>api.gathering.roll(round.id,{actorId:'bo'}),/The GM did not include \[TEST\] Bo in this gather\./);
 game.user=gm;
 // Panel: checkboxes with labels, the count, include all / none.
 let h=await html();
 assert.match(h,/1 of 3 included · 0 of 1 have rolled/);assert.match(h,/<input type="checkbox" data-gather-include="ana" checked[^>]*> Included<span class="ag-sr-only"> in this gather: \[TEST\] Ana/);
 assert.match(h,/<input type="checkbox" data-gather-include="bo"  ?>/);assert.match(h,/Not included/);assert.match(h,/data-action="gather-include-all"/);assert.match(h,/data-action="gather-include-none"/);
 // Add while open: Bo is prompted then; withdraw: he is told.
 sent.length=0;_test.setIncluded(round.id,'bo',true);
 assert.deepEqual(sentOf('gather-round').map(p=>[p.toUserIds[0],p.rollers.map(r=>r.actorId)]),[['u2',['bo']]]);
 sent.length=0;_test.setIncluded(round.id,'bo',false);
 assert.deepEqual(sentOf('gather-round-withdraw').map(m=>[m.toUserIds,m.actorId]),[[['u2'],'bo']]);
 // Someone who rolled stays recorded.
 _test.recordRoll(round.id,{actorId:'ana',total:14});
 assert.throws(()=>_test.setIncluded(round.id,'ana',false),/has already rolled/);
 // Include all / none (none leaves the one who rolled).
 _test.setAllIncluded(round.id,true);assert.ok(_test.openRound().rollers.every(r=>r.included));
 _test.setAllIncluded(round.id,false);assert.deepEqual(_test.openRound().rollers.filter(r=>r.included).map(r=>r.actorId),['ana']);
 // Only GMs change it.
 game.user=alice;assert.throws(()=>_test.setIncluded(round.id,'bo',true),/Only the GM/);assert.throws(()=>api.gathering.include(round.id,'bo'),/Only the GM/);game.user=gm;
 // Reveal counts only the included who rolled; "did not roll" lists only included ones.
 const out=_test.revealRound(round.id);assert.deepEqual(out.rows.map(r=>r.actorId),['ana']);assert.deepEqual(_test.openRound().result.unrolled,[]);
 _test.cancelRound(round.id);
 // alsoInclude (an approved request’s character) is always in, even when the list leaves them out.
 const second=await _test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10,include:['bo'],alsoInclude:['ana']});
 assert.deepEqual(second.rollers.filter(r=>r.included).map(r=>r.actorId).sort(),['ana','bo']);_test.cancelRound(second.id);
 await assert.rejects(()=>_test.startRound({node:nodeOf('adhoc-p'),professions:['herbalism'],tiers:[1],dc:10,include:['nobody']}),/Include at least one character/);
});

test('include: the setup form lists everyone with an Included box, Include all / none work, the choice is remembered and a start with nobody included is blocked',async()=>{
 game.user=gm;app.gather.excluded=new Set();app.gather.source='adhoc';app.gather.professions=['herbalism'];app.gather.tiers=[1];app.gatherTab='start';
 let h=await html();
 assert.match(h,/Can roll \(3\):/);assert.match(h,/data-gather-setup-include="ana" checked/);
 await app._click('gather-setup-include','none');
 h=await html();assert.match(h,/Can roll \(0 of 3 included\):/);assert.match(h,/Include at least one character\./);assert.match(h,/data-action="gather-start" disabled/);
 assert.deepEqual([...app._ui.get('gatherExcluded',[])].sort(),['ana','bo','fay'],'remembered on this device');
 app.gather.excluded.delete('bo');app._ui.set('gatherExcluded',[...app.gather.excluded]);
 h=await html();assert.match(h,/Can roll \(1 of 3 included\):/);
 await app._click('gather-start');
 assert.deepEqual(_test.openRound().rollers.filter(r=>r.included).map(r=>r.actorId),['bo'],'the form’s choice reaches the round');
 assert.match(app.notice,/Gather open: \[TEST\] Bo can roll\./);
 _test.cancelRound(_test.openRound().id);
 await app._click('gather-setup-include','all');assert.equal(app.gather.excluded.size,0);
});

// 0.41.1: a released material whose world Item is not Observer for every player ('not-visible') is not labelled Unreleased.
test('0.41.1: the GM badge is empty for ok and not-visible; draft, gm-only, missing, duplicate and retired keep their labels',async()=>{
 game.user=gm;
 const ok=matDoc('MAT-TG-B1','[TEST] Ok Moss',{}),nv=matDoc('MAT-TG-B2','[TEST] Hidden Moss',{});nv.testUserPermission=u=>u.isGM;
 const draft=matDoc('MAT-TG-B3','[TEST] Draft Moss',{},{status:'draft'}),gmOnly=matDoc('MAT-TG-B4','[TEST] Secret Moss',{},{visibility:'gm'});
 const d1=matDoc('MAT-TG-B5','[TEST] Twin',{}),d2=matDoc('MAT-TG-B5','[TEST] Twin again',{});d2.id='wdup-b5';
 const retired=matDoc('MAT-TG-B6','[TEST] Old Moss',{},{status:'retired'});
 await withWorld([ok,nv,draft,gmOnly,d1,d2,retired],async()=>{
  const label=id=>(_test.materialBadge(id).match(/>([^<]+)<\/(?:span|b)>/)??[])[1]?.trim()??'';
  assert.equal(_test.materialState('MAT-TG-B2').state,'not-visible');
  assert.equal(_test.materialBadge('MAT-TG-B1'),'');assert.equal(_test.materialBadge('MAT-TG-B2'),'','not-visible is released: no warning');
  assert.equal(_test.materialBadge(''),'');
  assert.equal(label('MAT-TG-B3'),'Draft');assert.equal(label('MAT-TG-B4'),'Unreleased');assert.equal(label('MAT-TG-NOPE'),'Not imported');
  assert.equal(label('MAT-TG-B5'),'Imported twice');assert.equal(label('MAT-TG-B6'),'Retired');
  // Option labels: the not-visible one sits with the released materials, unmarked; the draft and GM-only ones stay marked.
  const opts=_test.materialOptions('',{blank:'Choose…'});
  const released=opts.slice(opts.indexOf('<optgroup label="Released">'),opts.indexOf('<optgroup label="Draft'));
  assert.match(released,/Hidden Moss · Common Tier 1<\/option>/,'unmarked and in Released');
  assert.doesNotMatch(opts,/not visible to every player/);
  assert.match(opts,/Draft Moss[^<]*— draft \(draft\)/);assert.match(opts,/Secret Moss[^<]*— GM-only/);
 });
});

test('0.41.1: the node editor shows the quiet permission line only when a material is not-visible; awarding is unchanged',async()=>{
 game.user=gm;_test.setExoticRoll(dice(50));
 const nv=matDoc('MAT-TG-B2','[TEST] Hidden Moss',{prof:'PROF-TG-FISHING'});nv.testUserPermission=u=>u.isGM;
 const ok=matDoc('MAT-TG-B1','[TEST] Ok Moss',{prof:'PROF-TG-FISHING'});
 const LINE='Players cannot open these materials in Foundry, but the Ledger still awards them.';
 const editor=async ids=>{app.nodeDraft=null;await app._click('node-new');
  ids.forEach((id,i)=>{app.nodeDraft.data.common[i]={materialId:id,quantity:'1',chance:''};});
  app.view='nodes';return (await app._prepareContext({})).html;};
 await withWorld([nv,ok],async()=>{
  const both=await editor(['MAT-TG-B1','MAT-TG-B2']);
  assert.ok(both.includes(LINE));assert.doesNotMatch(both,/Unreleased|Draft<|ag-badge--warn/,'no warning label for it');
  assert.doesNotMatch(LINE,/MAT-/);
  const onlyOk=await editor(['MAT-TG-B1']);assert.ok(!onlyOk.includes(LINE),'not shown when no material is not-visible');
  app.nodeDraft=null;
  const round=await _test.startRound({node:nodeOf('adhoc-b2'),professions:['fishing'],tiers:[1],dc:10});
  _test.recordRoll(round.id,{actorId:'gus',total:14});
  const out=_test.revealRound(round.id);
  assert.equal(out.rows[0].drops.length,1);
  await _test.giveRound(round.id);assert.equal(of(gus,out.rows[0].drops[0].materialId),1,'still awarded');
 });
 // A gm-only material in the editor does not get the line.
 const gmOnly=matDoc('MAT-TG-B4','[TEST] Secret Moss',{},{visibility:'gm'});
 await withWorld([gmOnly],async()=>{const h=await editor(['MAT-TG-B4']);assert.ok(!h.includes(LINE));assert.match(h,/Unreleased/);app.nodeDraft=null;});
});
