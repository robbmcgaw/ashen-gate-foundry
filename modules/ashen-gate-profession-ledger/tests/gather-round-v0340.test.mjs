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
const ledgerModule={active:true,version:'0.35.0',set api(v){api=v},get api(){return api}};
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
 assert.match(h,/Can roll \(3\): \[TEST\] Ana \(.*Herbalism\), \[TEST\] Bo/);assert.doesNotMatch(h,/Can roll[^<]*\[TEST\] Cy/);
 assert.match(h,/placeholder="12"/,'the DC of the highest chosen tier');
 assert.match(h,/data-action="gather-start" ><i class="fa-solid fa-seedling" aria-hidden="true"><\/i> Start gather…/);
 assert.doesNotMatch(h,/Lead gatherer|Helpers|data-gather-helper|Active checks/);
 app.gather.professions=[];assert.match(await html(),/Choose which professions can roll\./);assert.match(await html(),/data-action="gather-start" disabled/);
 app.gather.professions=['fishing'];assert.doesNotMatch(await html(),/data-action="gather-start" disabled/);assert.match(await html(),/Can roll \(1\): \[TEST\] Gus/);
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
 assert.match(rows[0].status,/can’t pick a common material: give it by hand/);
 const pop=dialogs.find(d=>d.opts.window?.title==='Hand out loot');
 assert.ok(pop,'the pop-up opens by itself');assert.match(pop.opts.content,/\[TEST\] Gus/);assert.match(pop.opts.content,/14 vs DC 10 · Met the DC · May receive: Common/);assert.match(pop.opts.content,/data-handout-give="gus">Give…</);
 const view=await html();assert.match(view,/could not settle every drop/);assert.match(view,/data-action="gather-give-open" data-id="gus">Give…</);
 // The Add flow: materials of that quality, matching professions and tiers first, otherwise all of that quality.
 const give=_test.giveChoices(_test.openRound(),_test.openRound().result.rows[0]);
 assert.equal(give.matching,false);assert.ok(give.materials.every(m=>m.quality==='Common'));assert.ok(give.materials.some(m=>m.id==='MAT-TG-H1'));assert.ok(!give.materials.some(m=>m.id==='MAT-TG-HR'),'no Rare for a Common-only row');
 const dlg=await _test.openGiveDialog(round.id,'gus');assert.match(dlg.opts.content,/data-give-material="MAT-TG-H1">Add</);
 game.user=bob;await assert.rejects(()=>_test.giveByHand(round.id,'gus','MAT-TG-H1',1),/Only the GM/);await assert.rejects(()=>_test.openHandoutDialog(round.id),/Only the GM/);game.user=gm;
 await assert.rejects(()=>_test.giveByHand(round.id,'ana','MAT-TG-H1',1),/did not meet the DC|Reveal/,'only a character who met the DC');
 await assert.rejects(()=>_test.giveByHand(round.id,'gus','MAT-TG-GONE',1),/Not imported in this world/);
 await api.gathering.giveByHand(round.id,'gus','MAT-TG-H1',1);
 assert.equal(of(gus,'MAT-TG-H1'),1);assert.equal(_test.handoutRows(_test.openRound())[0].needsHand,false);
 await api.gathering.give(round.id);
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
 assert.deepEqual(Object.keys(values).filter(k=>/lead|gather/i.test(k)),[],'no setting holds gather state');
 // The old resolve(sessionId,{total}) shape: with one character left to roll it records for them.
 const solo=await api.gathering.start({node:adhoc,professions:['fishing'],tiers:[1],dc:10});
 assert.equal(api.gathering.resolve(solo.id,{total:12}).total,12);
 api.gathering.cancel(solo.id);
});
