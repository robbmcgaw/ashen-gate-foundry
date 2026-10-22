import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {nodeBlocker,startBlocker,playerBlocker,GATHER_FIX,gatherOutcome,gatherReward,exhaustsNode,normalizeNode,tierNumber,defaultDC,checkGatherRequest,helperEligibility,stackMaterial,canRunGathering} from '../scripts/gathering.mjs';
import {effectiveMapping,toolRef,rollModeFor,checkOption,professionKey} from '../scripts/checks.mjs';
import {xpForLevel} from '../scripts/progression.mjs';
// 0.10.0: node-based gathering (Locations), player requests with GM approval, tool requirement on recipes, XP from chat cards.
const hooks={},errors=[],infos=[],chats=[],sent=[],dialogs=[],xpHooks=[];let api;
const values={partyRoster:['belwar','tarra'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let confirmAnswer=true,waitForm=null;
class FakeDialog{constructor(opts){this.opts=opts;dialogs.push(this);}render(){this.rendered=true;return this;}async close(){this.closed=true;}
  // waitForm set: run the default button's real callback against these form elements (what Foundry does on click).
  static async wait(opts){FakeDialog.last=opts;if(!waitForm)return confirmAnswer;const b=opts.buttons.find(x=>x.default);return b.callback({},{form:{elements:waitForm}});}
  click(action,form={}){return this.opts.buttons.find(b=>b.action===action).callback?.({},{form:{elements:form}});}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:(name,data)=>xpHooks.push({name,data})};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,...structuredClone(x),update:async u=>{for(const [k,v] of Object.entries(u)){const parts=k.split('.');let o=m;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
// Approved player materials are observable by every player (Manager's player-visible projection).
const worldDoc=(id,name,flags,img='')=>({id,uuid:`Item.${id}`,name,img,type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,folder:'f1',flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const brew=def('REC-TG-BREW','Recipe',{name:'[TEST] Brew',profession_id:'PROF-TG-ALCHEMY',result_item_id:'ITEM-TG-BREW',tier:'apprentice',tool:'alchemist',additional_gp:5,ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]});
const stew=def('REC-TG-STEW','Recipe',{name:'[TEST] Stew',profession_id:'PROF-TG-ALCHEMY',result_item_id:'ITEM-TG-BREW',tier:'apprentice',workstation:'[TEST] Kitchen',ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]});
const tonic=def('REC-TG-TONIC','Recipe',{name:'[TEST] Tonic',profession_id:'PROF-TG-ALCHEMY',result_item_id:'ITEM-TG-BREW',tier:'apprentice',ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]});
const world=[
 worldDoc('wherb','[TEST] Herb',src('MAT-TG-HERB','Material',{definition:def('MAT-TG-HERB','Material',{name:'[TEST] Herb'})}),'icons/herb.webp'),
 worldDoc('wrare','[TEST] Rare Herb',src('MAT-TG-RARE','Material',{definition:def('MAT-TG-RARE','Material',{name:'[TEST] Rare Herb'})})),
 worldDoc('wsecret','[TEST] Secret Ore',src('MAT-TG-SECRET','Material',{visibility:'gm'})),
 worldDoc('wbrew','Recipe: [TEST] Brew',src('REC-TG-BREW','Recipe',{definition:brew})),
 worldDoc('wstew','Recipe: [TEST] Stew',src('REC-TG-STEW','Recipe',{definition:stew})),
 worldDoc('wtonic','Recipe: [TEST] Tonic',src('REC-TG-TONIC','Recipe',{definition:tonic})),
 worldDoc('walch','[TEST] Alchemy — Profession',src('PROF-TG-ALCHEMY','Profession',{definition:def('PROF-TG-ALCHEMY','Profession',{name:'[TEST] Alchemy'})})),
 worldDoc('wbrewitem','[TEST] Brew',src('ITEM-TG-BREW','Item',{definition:def('ITEM-TG-BREW','Item',{name:'[TEST] Brew'})})),
];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
const rolls=[];
const makeActor=(id,name,ownerId,items,known=[])=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);let n=0;
 const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{'ashen-gate-profession-ledger':{knownRecipes:known}},
  system:{skills:{nat:{total:3,value:1},sur:{total:1,value:0}},tools:{},abilities:{int:{mod:1},wis:{mod:2},dex:{mod:0},str:{mod:0}}},
  testUserPermission:(u,role)=>u.isGM||u.id===ownerId||role==='LIMITED',
  setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
  updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){const it=inv.get(u._id);for(const [k,v] of Object.entries(u))if(k!=='_id'){const parts=k.split('.');let o=it;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}return ups;},
  deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);return ids;},
  createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`${id}-new${n++}`,d.name,d.flags,d.system?.quantity??1,{img:d.img}));inv.push(...out);return out;},
  rollSkill:async(cfg)=>{rolls.push({actor:id,...cfg});return [{total:a.nextRoll??10}];},
  rollToolCheck:async(cfg)=>{rolls.push({actor:id,...cfg});return [{total:a.nextRoll??10}];}};
 return a;};
const profItem=(id,name,prof)=>held(id,`${name} — Profession`,src(prof,'Profession',{definition:def(prof,'Profession',{name})}),1,{type:'feat'});
const belwar=makeActor('belwar','[TEST] Belwar','u1',[held('bherb','[TEST] Herb',src('MAT-TG-HERB','Material'),1),
 profItem('bprof','[TEST] Herbalism','PROF-TG-HERBALISM'),profItem('balch','[TEST] Alchemy','PROF-TG-ALCHEMY'),
 held('bherb2','[TEST] Herb',src('MAT-TG-HERB','Material'),5)],['REC-TG-BREW','REC-TG-STEW','REC-TG-TONIC']);
const tarra=makeActor('tarra','[TEST] Tarra','u2',[held('tkit','Herbalism Kit',{},1,{type:'tool',system:{quantity:1,type:{baseItem:'herb'}}})]);
const vex=makeActor('vex','[TEST] Vex','u2',[]);
const all=[belwar,tarra,vex];
// Locations module stand-in (1.1.0 shape). Player calls get only revealed locations and visible entries.
const locs=[
 {id:'LOC-TG-MEADOW',name:'[TEST] Meadow',revealed:true,resources:[
  {id:'n1',label:'Herb patch',skill:'Herbalism',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',rareMaterialId:'MAT-TG-RARE',quantity:2,rareQuantity:1,finite:true,exhausted:false,available:true,visible:true,note:''},
  {id:'n2',label:'[TEST] Hidden grove',skill:'Herbalism',tier:2,materialId:'MAT-TG-HERB',visible:false,available:true},
  {id:'n3',label:'Picked patch',skill:'Herbalism',tier:1,materialId:'MAT-TG-HERB',exhausted:true,visible:true},
  {id:'n4',label:'Endless reeds',skill:'Skinning & Harvesting',tier:3,dc:13,dcVisible:false,materialId:'MAT-TG-HERB',finite:false,visible:true},
  {id:'n5',label:'Common-only bush',skill:'Herbalism',tier:1,materialId:'MAT-TG-HERB',finite:true,visible:true}]},
 {id:'LOC-TG-CAVE',name:'[TEST] Unrevealed Cave',revealed:false,resources:[{id:'c1',label:'[TEST] Cave moss',skill:'Herbalism',tier:1,materialId:'MAT-TG-HERB',visible:true}]}];
const exhaustCalls=[];
const locApi={
 listLocations:()=>game.user.isGM?structuredClone(locs):structuredClone(locs.filter(l=>l.revealed).map(({revealed,...l})=>l)),
 resourcesAt:id=>{const l=locs.find(x=>x.id===id);if(!l||(!game.user.isGM&&!l.revealed))return [];
  return structuredClone(game.user.isGM?l.resources:l.resources.filter(r=>r.visible!==false).map(({visible,dcVisible,dc,...r})=>dcVisible===false?r:{...r,dc}));},
 markNodeExhausted:async(locId,entryId,ex)=>{if(!game.user.isGM)throw Error('Only the GM');exhaustCalls.push([locId,entryId,ex]);locs.find(l=>l.id===locId).resources.find(r=>r.id===entryId).exhausted=ex;}};
const ledgerModule={active:true,version:'0.10.0',set api(v){api=v},get api(){return api}};
const modules={'ashen-gate-profession-ledger':ledgerModule,'ashen-gate-locations':{active:true,api:locApi}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:world.get},
 actors:{contents:all,get:id=>all.find(a=>a.id===id)},socket:{emit:(name,msg)=>sent.push({name,msg}),on:()=>{}},
 modules:{get:id=>modules[id]},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
const app=api.open({view:'gathering'});
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const flush=()=>new Promise(r=>setImmediate(r));
const nextSent=type=>{const i=sent.findIndex(s=>s.msg.type===type);return i<0?null:sent.splice(i,1)[0].msg;};
const herbTotal=a=>a.items.filter(i=>i.flags?.['ashen-gate-manager']?.source?.sourceId==='MAT-TG-HERB'||i.flags?.['ashen-gate-profession-ledger']?.sourceId==='MAT-TG-HERB').reduce((n,i)=>n+i.system.quantity,0);
const nodeOf=(loc,id)=>normalizeNode(locs.find(l=>l.id===loc).resources.find(r=>r.id===id),{locationId:loc,locationName:'x',locationRevealed:true});
const slot=()=>{const s={innerHTML:'',querySelector:()=>null};return {querySelector:sel=>sel==='[data-agl-xp]'?s:null,slot:s};};

test('outcomes: fail below DC, common at DC to DC+4, rare at DC+5; failure or a finite node exhausts',()=>{
 assert.equal(gatherOutcome(9,10).result,'fail');
 assert.equal(gatherOutcome(10,10).result,'common');assert.equal(gatherOutcome(14,10).result,'common');
 assert.equal(gatherOutcome(15,10).result,'rare');assert.equal(gatherOutcome(15,10).margin,5);
 const node=nodeOf('LOC-TG-MEADOW','n1');
 assert.equal(gatherReward(node,gatherOutcome(9,10)),null,'failure gives nothing');
 assert.deepEqual(gatherReward(node,gatherOutcome(12,10)),{materialId:'MAT-TG-HERB',quantity:2,rare:false,noRareFallback:false});
 assert.deepEqual(gatherReward(node,gatherOutcome(15,10)),{materialId:'MAT-TG-RARE',quantity:1,rare:true,noRareFallback:false},'rare instead of common, not as well');
 assert.equal(gatherReward(nodeOf('LOC-TG-MEADOW','n5'),gatherOutcome(20,10)).noRareFallback,true,'no rare material: the common bundle');
 assert.equal(exhaustsNode(node,gatherOutcome(12,10)),true,'finite node is spent by a success');
 const endless=nodeOf('LOC-TG-MEADOW','n4');
 assert.equal(exhaustsNode(endless,gatherOutcome(20,13)),false);assert.equal(exhaustsNode(endless,gatherOutcome(2,13)),true,'failure exhausts any node');
});

test('nodes tolerate missing fields: DC by tier 10/12/15/18/20 (0.15.0), quantity 1, finite by default',()=>{
 assert.deepEqual([1,2,3,4,5].map(defaultDC),[10,12,15,18,20]);
 assert.equal(tierNumber('Journeyman'),2);assert.equal(tierNumber('expert'),3);assert.equal(tierNumber(9),null);
 const n=normalizeNode({id:'x',skill:'Mining',tier:'3',materialId:'MAT-TG-HERB'});
 assert.equal(n.dc,15);assert.equal(normalizeNode({id:'o',tier:3,dc:13,materialId:'MAT-TG-HERB'}).dc,13,'an explicit node DC is kept');assert.equal(n.quantity,1);assert.equal(n.rareQuantity,1);assert.equal(n.finite,true);assert.equal(n.gatherable,true);
 assert.equal(normalizeNode({id:'y',materialId:'MAT-TG-HERB'}).gatherable,false,'no tier and no DC: not gatherable');
 assert.equal(normalizeNode({id:'z',tier:1,materialId:'not-an-id'}).gatherable,false);
 assert.equal(normalizeNode({id:'e',tier:1,materialId:'MAT-TG-HERB',exhausted:true}).why,'Already gathered (exhausted)');
});

test('request rules: owner, party member, revealed location, visible and available node; GM-only decisions',()=>{
 const node=nodeOf('LOC-TG-MEADOW','n1'),ok={ownsActor:true,inParty:true,location:{revealed:true},node};
 assert.deepEqual(checkGatherRequest(ok),{ok:true});
 assert.match(checkGatherRequest({...ok,ownsActor:false}).reason,/own that character/);
 assert.match(checkGatherRequest({...ok,inParty:false}).reason,/not in the party/);
 const hidden='That gathering spot is not available';
 assert.equal(checkGatherRequest({...ok,location:{revealed:false}}).reason,hidden);
 assert.equal(checkGatherRequest({...ok,location:null}).reason,hidden);
 assert.equal(checkGatherRequest({...ok,node:{...node,visible:false}}).reason,hidden,'hidden and unknown read the same');
 assert.match(checkGatherRequest({...ok,node:nodeOf('LOC-TG-MEADOW','n3')}).reason,/exhausted/);
 assert.match(checkGatherRequest({...ok,busy:true}).reason,/already gathering/);
 assert.equal(canRunGathering(gm),true);assert.equal(canRunGathering(alice),false);assert.equal(canRunGathering(null),false);
});

test('helpers: a different character carrying a suitable tool gives advantage, preset with the sheet',()=>{
 const refs=[{key:'herb'}];
 assert.deepEqual(helperEligibility(tarra,{leadId:'belwar',toolRefs:refs}),{eligible:true,reason:'Carries Herbalism Kit'});
 assert.equal(helperEligibility(vex,{leadId:'belwar',toolRefs:refs}).eligible,false);
 assert.equal(helperEligibility(belwar,{leadId:'belwar',toolRefs:refs}).eligible,false,'the lead cannot assist themself');
 assert.equal(helperEligibility(vex,{leadId:'belwar',hasProfession:()=>true}).eligible,true,'no tool applies: the profession counts');
 assert.deepEqual(rollModeFor(belwar,{kind:'skill',key:'nat'},{assists:['[TEST] Tarra']}),{mode:1,sources:['Advantage: assisted by [TEST] Tarra']});
 const dis={...belwar,system:{...belwar.system,skills:{nat:{total:3,roll:{mode:-1}}}}};
 assert.equal(rollModeFor(dis,{kind:'skill',key:'nat'},{assists:['T']}).mode,0,'advantage and disadvantage cancel');
 assert.equal(checkOption(belwar,{kind:'skill',key:'nat'}).bonus,3);
 assert.equal(checkOption(tarra,{kind:'tool',key:'herb'}).bonus,1,'unproficient tool check uses the ability modifier');
});

test('stacking: a gathered material adds to the Item already held',async()=>{
 const a=makeActor('s','S','u1',[held('h','[TEST] Herb',src('MAT-TG-HERB','Material'),3)]);
 const out=await stackMaterial(a,world.get('wherb'),2,{sourceIdOf:i=>i?.flags?.['ashen-gate-manager']?.source?.sourceId??i?.flags?.['ashen-gate-profession-ledger']?.sourceId,flagScope:'ashen-gate-profession-ledger'});
 assert.equal(out.stacked,true);assert.equal(a.items.length,1);assert.equal(a.items.get('h').system.quantity,5);
 const b=makeActor('t','T','u1',[]);
 const made=await stackMaterial(b,world.get('wherb'),2,{sourceIdOf:i=>i?.flags?.['ashen-gate-manager']?.source?.sourceId,flagScope:'ashen-gate-profession-ledger'});
 assert.equal(made.stacked,false);assert.equal(b.items[0].system.quantity,2);assert.equal(b.items[0].flags['ashen-gate-profession-ledger'].sourceId,'MAT-TG-HERB');
});

test('player view: only revealed locations and visible nodes; no GM controls; player cannot start or resolve',async()=>{
 game.user=alice;
 const h=await html('gathering');
 assert.match(h,/Request gathering/);assert.match(h,/Herb patch/);assert.match(h,/\[TEST\] Meadow/);
 assert.doesNotMatch(h,/Unrevealed Cave|Cave moss|Hidden grove|MAT-TG-/);
 assert.doesNotMatch(h,/data-action="gather-start"|data-action="gather-gm-roll"/);
 assert.match(h,/value="LOC-TG-MEADOW\|n3"\s+disabled/,'exhausted spots are shown but cannot be picked');
 const reeds=h.slice(h.indexOf('Endless reeds'),h.indexOf('</label>',h.indexOf('Endless reeds')));
 assert.match(reeds,/Tier 3/);assert.doesNotMatch(reeds,/DC/,'a DC the GM has not shown stays hidden');
 await assert.rejects(()=>_test.startGather({node:nodeOf('LOC-TG-MEADOW','n1'),leadId:'belwar'}),/Only the GM/);
 await assert.rejects(()=>_test.resolveGather('nope',{total:20}),/Only the GM/);
 await assert.rejects(()=>api.gathering.start({locationId:'LOC-TG-MEADOW',nodeId:'n1',leadId:'belwar'}),/Only the GM/);
});

test('player requests: unrevealed, hidden, foreign and exhausted are refused without a GM popup',async()=>{
 game.user=gm;
 const ask=async(extra,from='u1')=>{const before=dialogs.length;sent.length=0;
  const out=await _test.handleGatherRequest({type:'gather-request',requestId:'r',requesterId:from,actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n1',...extra},from);
  return {out,popup:dialogs.length>before};};
 let r=await ask({locationId:'LOC-TG-CAVE',nodeId:'c1'});assert.equal(r.out.ok,false);assert.equal(r.out.message,'That gathering spot is not available');assert.equal(r.popup,false);
 r=await ask({nodeId:'n2'});assert.equal(r.out.message,'That gathering spot is not available','hidden node');
 r=await ask({nodeId:'n3'});assert.match(r.out.message,/exhausted/);
 r=await ask({},'u2');assert.match(r.out.message,/own that character/,'Bob cannot request for Belwar');
 r=await ask({actorId:'vex'},'u2');assert.match(r.out.message,/not in the party/);
 r=await ask({requesterId:'u1'},'u2');assert.match(r.out.message,/could not be verified/,'sender must be the requester');
 assert.equal(nextSent('gather-request-result')?.toUserId,'u1');
});

test('player request → GM queue (0.21.0): decline with a reason tells the player; one per character, rate limited; approve sends the roll prompt to the lead’s owner',async()=>{
 _test.setGatherRequestCooldown(0);
 const ask=async()=>{game.user=alice;sent.length=0;const pending=api.gathering.request({actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n1',helperIds:['tarra']});await flush();
  const req=nextSent('gather-request');game.user=gm;await _test.onSocket(req,'u1');const res=nextSent('gather-request-result');game.user=alice;await _test.onSocket(res,'gm');return {res,out:await pending};};
 // Queued: no popup, the player is told it waits, the GM sees it in the Gathering tab.
 const popups=dialogs.length;
 let {res,out}=await ask();
 assert.equal(dialogs.length,popups,'no approval popup any more');
 assert.equal(res.status,'queued');assert.equal(out.ok,true);assert.equal(out.status,'queued');
 assert.match(await html('gathering'),/\[TEST\] Belwar’s request \(Herb patch at \[TEST\] Meadow\) is waiting for the GM/);
 assert.match(await html('gathering'),/data-action="gather-request" disabled/);
 assert.deepEqual(await api.gathering.request({actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n1'}),{ok:false,status:'refused',message:'[TEST] Belwar already has a gathering request waiting for the GM.'});
 game.user=gm;
 let h=await html('gathering');
 assert.match(h,/Alice<\/strong> asks for <strong>\[TEST\] Belwar<\/strong> to gather/);assert.match(h,/\[TEST\] Tarra \(Carries Herbalism Kit — gives advantage\)/);
 assert.match(h,/data-action="gather-approve"/);assert.match(h,/data-action="gather-decline"/);
 const [q]=api.gathering.requests();assert.deepEqual([q.actorName,q.requesterName,q.title],['[TEST] Belwar','Alice','Herb patch']);
 assert.equal((await _test.handleGatherRequest({type:'gather-request',requestId:'dup',requesterId:'u1',actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n1'},'u1')).ok,false,'a forged second request is refused on the GM side too');
 // Players cannot see, approve or decline the queue.
 game.user=alice;
 assert.throws(()=>api.gathering.requests(),/Only the GM/);await assert.rejects(api.gathering.approve(q.requestId),/Only the GM/);assert.throws(()=>api.gathering.decline(q.requestId),/Only the GM/);
 // Decline with a reason (plain text only).
 game.user=gm;sent.length=0;
 app.element={querySelector:sel=>sel===`[data-gather-decline-reason="${q.requestId}"]`?{value:'Not <b>tonight</b>'}:null,querySelectorAll:()=>[]};
 await app._click('gather-decline',q.requestId);
 res=nextSent('gather-request-result');
 assert.deepEqual([res.toUserId,res.status,res.ok],['u1','declined',false]);assert.equal(res.message,'The GM declined [TEST] Belwar’s gathering request: Not btonight/b');
 assert.deepEqual(api.gathering.requests(),[],'cleared when handled');assert.equal(_test.gatherSessions.size,0);
 game.user=alice;await _test.onSocket({...res,message:'forged'},'u2');assert.equal(_test.myGatherRequests.size,1,'a result from a player is ignored');
 errors.length=0;await _test.onSocket(res,'gm');
 assert.equal(_test.myGatherRequests.size,0);assert.ok(errors.includes(res.message),'the player is notified');
 // Rate limit per character.
 _test.setGatherRequestCooldown(60000);
 ({res,out}=await ask());assert.equal(out.ok,false);assert.match(out.message,/Wait \d+ s before asking again for \[TEST\] Belwar/);
 _test.setGatherRequestCooldown(0);
 // Approve: starts the gather exactly like the GM's Start.
 ({res,out}=await ask());assert.equal(out.status,'queued');
 game.user=gm;sent.length=0;
 await app._click('gather-approve',api.gathering.requests()[0].requestId);
 assert.equal(_test.gatherSessions.size,1);assert.deepEqual(api.gathering.requests(),[]);
 const prompt=nextSent('gather-roll');assert.deepEqual(prompt.toUserIds,['u1'],'only Belwar’s owner is asked to roll');
 assert.equal(prompt.title,'Herb patch at [TEST] Meadow');assert.equal(prompt.dc,10);assert.deepEqual(prompt.assists,['[TEST] Tarra']);
 assert.equal(prompt.selected,'skill:nat','no herbalism kit on Belwar: Nature is preselected');
 res=nextSent('gather-request-result');assert.equal(res.status,'approved');
 game.user=alice;infos.length=0;await _test.onSocket(res,'gm');
 assert.equal(_test.myGatherRequests.size,0);assert.ok(infos.some(m=>/Approved\. \[TEST\] Belwar’s gathering check is ready to roll/.test(m)));
 // Bob is not addressed and gets no popup; Alice does.
 game.user=bob;const n=dialogs.length;await _test.onSocket(prompt,'gm');assert.equal(dialogs.length,n);
 game.user=alice;await _test.onSocket(prompt,'gm');
 const rollDialog=dialogs.at(-1);assert.match(rollDialog.opts.content,/Nature/);assert.match(rollDialog.opts.content,/assisted by \[TEST\] Tarra/);
 assert.match(rollDialog.opts.content,/<option value="1" selected>Advantage/,'advantage preselected from the helper');
 assert.match(await html('gathering'),/Your gathering check/);
 // A forged roll from Bob is ignored; Alice's roll resolves (12 vs DC 10: success, common bundle).
 game.user=gm;
 assert.equal(await _test.receiveGatherRoll({type:'gather-rolled',sessionId:prompt.sessionId,actorId:'belwar',total:30,choice:'skill:nat',mode:1},'u2'),false);
 assert.equal(_test.gatherSessions.size,1);
 game.user=alice;belwar.nextRoll=12;rolls.length=0;sent.length=0;
 rollDialog.click('roll',{check:{value:'skill:nat'},mode:{value:'1'}});await flush();await flush();
 assert.deepEqual(rolls.at(-1),{actor:'belwar',skill:'nat',advantage:true,disadvantage:false},'native dnd5e roll with advantage');
 const rolled=nextSent('gather-rolled');assert.equal(rolled.total,12);
 game.user=gm;const before=herbTotal(belwar),chatCount=chats.length;
 await _test.onSocket(rolled,'u1');
 assert.equal(_test.gatherSessions.size,0);
 assert.equal(herbTotal(belwar),before+2,'2 × common herb');
 assert.equal(belwar.items.filter(i=>i.name==='[TEST] Herb').length,2,'stacked onto an existing Item, no new Item');
 assert.deepEqual(exhaustCalls.at(-1),['LOC-TG-MEADOW','n1',true],'finite node exhausted through the Locations API');
 const card=chats[chatCount];
 assert.equal(card.whisper,undefined,'gather card is for everyone');
 assert.match(card.content,/\[TEST\] Belwar gathered 2 × \[TEST\] Herb/);assert.match(card.content,/Nature check:<\/strong> 12 with advantage vs DC 10 — <strong>Success/);
 assert.match(card.content,/Assisted by \[TEST\] Tarra/);assert.match(card.content,/now exhausted/);
 assert.deepEqual({...card.flags['ashen-gate-profession-ledger'].xp},{kind:'gather',actorId:'belwar',actorName:'[TEST] Belwar',professionId:'PROF-TG-HERBALISM',professionName:'[TEST] Herbalism',suggested:1,awarded:null});
 assert.equal(xpHooks.at(-1).name,'ashenGateLedger.xpOpportunity');assert.equal(xpHooks.at(-1).data.outcome,'common');
 // The spent node cannot be requested or started again.
 await assert.rejects(()=>_test.startGather({node:_test.gatherLocations().locations[0].nodes.find(x=>x.id==='n1'),leadId:'belwar'}),/exhausted|already/);
});

test('XP from a card: no automatic award, GM-only button, one award per card',async()=>{
 const card=chats.find(c=>c.flags?.['ashen-gate-profession-ledger']?.xp?.kind==='gather');
 assert.equal(belwar.flags['ashen-gate-profession-ledger'].professionProgress,undefined,'gathering awarded no XP by itself');
 game.user=alice;let el=slot();_test.decorateChatCard(card,el);assert.equal(el.slot.innerHTML,'','players see no XP control');
 await assert.rejects(()=>_test.awardXpFromCard(card,3),/Only the GM/);
 game.user=gm;el=slot();_test.decorateChatCard(card,el);assert.match(el.slot.innerHTML,/data-agl-xp-award/);assert.match(el.slot.innerHTML,/value="1"/);
 await _test.awardXpFromCard(card,3);
 assert.equal(api.getProfessionProgress(belwar,'PROF-TG-HERBALISM').xp,3);
 assert.deepEqual(card.flags['ashen-gate-profession-ledger'].xp.awarded.points,3);
 await assert.rejects(()=>_test.awardXpFromCard(card,3),/already awarded/);
 game.user=alice;el=slot();_test.decorateChatCard(card,el);assert.match(el.slot.innerHTML,/\+3 \[TEST\] Herbalism XP awarded/);
});

test('0.12.0: undo award, adjust/set XP, perks kept and flagged, history GM-only',async()=>{
 const card=chats.find(c=>c.flags?.['ashen-gate-profession-ledger']?.xp?.kind==='gather');
 const flag=()=>belwar.flags['ashen-gate-profession-ledger'].professionProgress.professions['PROF-TG-HERBALISM'];
 const P='PROF-TG-HERBALISM';
 // Players cannot undo, adjust, or read history.
 game.user=alice;
 await assert.rejects(()=>_test.undoAwardFromCard(card),/Only the GM/);
 await assert.rejects(()=>_test.adjustXP(belwar,P,{delta:-1}),/Only the GM/);
 await assert.rejects(()=>_test.performAction('adjust-xp',{id:P,actorId:'belwar',delta:-1}),/GM only/);
 assert.throws(()=>api.getProfessionXPHistory(belwar,P),/Only the GM/);
 assert.equal('history' in api.getProfessionProgress(belwar,P),false,'player progress never carries history');
 // GM: the card offers Undo; undo restores XP, re-enables Award, is idempotent and traceable.
 game.user=gm;let el=slot();_test.decorateChatCard(card,el);assert.match(el.slot.innerHTML,/data-agl-xp-undo/);
 { // Undo award button: labelled, red confirm; Cancel takes nothing back.
   let handler;const btn={addEventListener:(t,f)=>{handler=f;}};const s={innerHTML:'',querySelector:sel=>sel==='[data-agl-xp-undo]'?btn:null};
   _test.decorateChatCard(card,{querySelector:sel=>sel==='[data-agl-xp]'?s:null});
   const before=flag().xp;confirmAnswer=false;await handler({});confirmAnswer=true;
   assert.equal(FakeDialog.last.window.title,'Undo XP award?');assert.equal(FakeDialog.last.buttons[0].label,'Cancel');assert.equal(FakeDialog.last.buttons.at(-1).label,'Undo award');
   assert.ok(FakeDialog.last.classes.includes('ag-dialog--danger'));assert.ok(FakeDialog.last.classes.includes('ag-app'));
   assert.equal(flag().xp,before,'Cancel changes nothing');assert.equal(btn.disabled,false);assert.ok(card.flags['ashen-gate-profession-ledger'].xp.awarded);
 }
 const out=await _test.undoAwardFromCard(card);
 assert.match(out.message,/3 \[TEST\] Herbalism XP taken back → 0 XP, level 1/);
 assert.equal(flag().xp,0);assert.equal(card.flags['ashen-gate-profession-ledger'].xp.awarded,null);
 assert.equal(card.flags['ashen-gate-profession-ledger'].xp.undone.points,3);
 await assert.rejects(()=>_test.undoAwardFromCard(card),/no XP award/);
 assert.equal(flag().xp,0,'second undo changed nothing');
 el=slot();_test.decorateChatCard(card,el);assert.match(el.slot.innerHTML,/data-agl-xp-award/,'Award XP is back');
 game.user=alice;el=slot();_test.decorateChatCard(card,el);assert.equal(el.slot.innerHTML,'','players see nothing again');
 game.user=gm;
 assert.deepEqual(api.getProfessionXPHistory(belwar,P).map(h=>[h.kind,h.delta,h.by]),[['award',3,'gm'],['undo',-3,'gm']]);
 assert.ok(api.getProfessionXPHistory(belwar,P).every(h=>h.messageId===card.id));
 // Award 7 from the card again, then lower it by 4 and set it exactly; derived level/sheet text follow.
 await _test.awardXpFromCard(card,7);
 assert.equal(flag().xp,7);
 let r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',delta:'-4',reason:'Misclick'});
 assert.match(r.message,/XP 7 → 3, level 1/);assert.equal(flag().xp,3);
 const note=chats.at(-1);assert.match(note.content,/adjusted by the GM \(−4\)/);assert.match(note.content,/Misclick/);assert.ok(note.whisper.includes('gm'));
 assert.match(FakeDialog.last.content,/→ 3\. Level 2 → 1\./);assert.equal(FakeDialog.last.buttons.at(-1).label,"Adjust XP");assert.equal(FakeDialog.last.buttons[0].label,"Cancel");
 await assert.rejects(()=>_test.performAction('adjust-xp',{id:P,actorId:'belwar',delta:'1',set:'5'}),/either/);
 r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',set:'-5'}).catch(e=>e);assert.match(String(r),/0 or more/);
 // Below zero clamps to 0; above the cap clamps to 390.
 r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',delta:'-50'});assert.equal(flag().xp,0);
 r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',set:'99999'});assert.equal(flag().xp,390);
 assert.equal(api.getProfessionProgress(belwar,P).level,16);
 // Perks held beyond a lower level are kept, flagged, and the progress stays valid.
 belwar.flags['ashen-gate-profession-ledger'].professionProgress.professions[P].selectedPerkIds=['PERK-TG-A','PERK-TG-B','PERK-TG-C'];
 r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',set:'3'});
 assert.deepEqual(flag().selectedPerkIds,['PERK-TG-A','PERK-TG-B','PERK-TG-C'],'nothing deleted');
 assert.match(r.message,/2 held \[TEST\] Herbalism perks \(PERK-TG-B, PERK-TG-C\) now exceed level 1\. They are kept/);
 assert.match(FakeDialog.last.content,/PERK-TG-B, PERK-TG-C/);assert.match(chats.at(-1).content,/PERK-TG-B/);
 const prog=api.getProfessionProgress(belwar,P);
 assert.deepEqual([prog.xp,prog.level,prog.unspentPerkChoices,prog.perksBeyondLevel],[3,1,0,['PERK-TG-B','PERK-TG-C']]);
 // Cancelling the confirmation changes nothing.
 confirmAnswer=false;assert.equal(await _test.performAction('adjust-xp',{id:P,actorId:'belwar',delta:'-1'}),null);confirmAnswer=true;
 assert.equal(flag().xp,3);
 assert.ok(api.getProfessionXPHistory(belwar,P).at(-1).reason==='' && api.getProfessionXPHistory(belwar,P).at(-1).kind==='set');
});

test('GM-initiated: success by 5+ gives the rare bundle instead; failure gives nothing and exhausts a renewable node',async()=>{
 game.user=gm;
 let s=await _test.startGather({node:_test.gatherLocations().locations[0].nodes.find(x=>x.id==='n5'),leadId:'tarra'});
 assert.equal(s.plan.selected,'tool:herb','Tarra carries a herbalism kit: the tool check is preselected');
 let out=await _test.resolveGather(s.id,{total:16,choice:'tool:herb'});
 assert.equal(out.outcome.result,'rare');assert.equal(out.reward.noRareFallback,true);assert.equal(herbTotal(tarra),1);
 assert.match(chats.at(-1).content,/no rare material, so it gave its common bundle/);
 assert.match(chats.at(-1).content,/Success by 5\+<\/strong> <span class="ag-rarity-badge" data-rarity="common">Quality: Common<\/span>/,'D6: the common bundle it gave is badged Common');
 assert.doesNotMatch(chats.at(-1).content,/rare bundle\)/);
 // Rare bundle replaces the common one.
 locs[0].resources.push({id:'n6',label:'Rich patch',skill:'Herbalism',tier:2,materialId:'MAT-TG-HERB',rareMaterialId:'MAT-TG-RARE',quantity:3,rareQuantity:1,finite:true,visible:true});
 s=await _test.startGather({node:_test.gatherLocations().locations[0].nodes.find(x=>x.id==='n6'),leadId:'tarra'});
 out=await _test.resolveGather(s.id,{total:17,choice:'tool:herb'});
 assert.equal(out.outcome.result,'rare');assert.equal(herbTotal(tarra),1,'no common herb as well');
 assert.equal(tarra.items.find(i=>i.name==='[TEST] Rare Herb').system.quantity,1);
 assert.match(chats.at(-1).content,/<span class="ag-rarity-badge" data-rarity="rare">Quality: Rare<\/span>/,'D6: a rare bundle uses the rare colour');
 // Failure on a non-finite node.
 const n4=_test.gatherLocations().locations[0].nodes.find(x=>x.id==='n4');
 s=await _test.startGather({node:n4,leadId:'tarra'});
 const items=tarra.items.length;
 out=await _test.resolveGather(s.id,{total:5,choice:'tool:herb'});
 assert.equal(out.outcome.result,'fail');assert.equal(out.award,null);assert.equal(tarra.items.length,items);
 assert.notDeepEqual(exhaustCalls.at(-1),['LOC-TG-MEADOW','n4',true],'Locations cannot exhaust a renewable node');
 assert.match(chats.at(-1).content,/used up for now/);assert.doesNotMatch(chats.at(-1).content,/vs DC/,'a hidden DC stays off the public card');
 await assert.rejects(()=>_test.startGather({node:_test.gatherLocations().locations[0].nodes.find(x=>x.id==='n4'),leadId:'tarra'}),/exhausted/,'blocked for this session');
 assert.match(chats.at(-1).content,/found nothing usable/);assert.match(chats.at(-1).content,/Failed/);
 await assert.rejects(()=>_test.resolveGather(s.id,{total:20}),/no longer open/,'one check per node');
});

test('unrevealed location in a public card is not named; ad-hoc node works without Locations',async()=>{
 game.user=gm;
 sent.length=0;
 const cave=_test.gatherLocations().locations.find(l=>l.id==='LOC-TG-CAVE').nodes[0];
 let s=await _test.startGather({node:cave,leadId:'belwar'});
 assert.equal(nextSent('gather-roll').title,'a gathering spot');
 await _test.resolveGather(s.id,{total:11,choice:'skill:nat'});
 assert.doesNotMatch(chats.at(-1).content,/Cave/);
 modules['ashen-gate-locations']=undefined;
 assert.equal(_test.gatherLocations().ok,false);
 assert.match(await html('gathering'),/Ad-hoc node/);
 s=await api.gathering.start({node:{label:'[TEST] Ditch',skill:'Herbalism',tier:2,materialId:'MAT-TG-HERB'},leadId:'belwar'});
 assert.equal(s.node.dc,12,'ad-hoc DC defaults by tier');
 await assert.rejects(()=>api.gathering.start({node:{label:'x',tier:1,materialId:'MAT-TG-SECRET'},leadId:'belwar'}),/player-visible/);
 assert.equal(_test.cancelGather(s.id),true);assert.equal(_test.gatherSessions.size,0);
 modules['ashen-gate-locations']={active:true,api:locApi};
});

test('recipes: tool, workstation or the profession’s tool; warning when not carried; craft rolls the tool check',async()=>{
 assert.deepEqual(toolRef('alchemist'),{key:'alchemist',uuid:null,name:null});
 assert.deepEqual(toolRef('Compendium.dnd5e.items.Item.abc'),{key:null,uuid:'Compendium.dnd5e.items.Item.abc',name:null});
 assert.equal(professionKey('[TEST] Alchemy'),'alchemy');
 assert.equal(effectiveMapping({}).tools.alchemy,'alchemist');assert.equal(effectiveMapping({tools:{alchemy:''}}).tools.alchemy,'');
 assert.equal(effectiveMapping({tools:{alchemy:'<x>'}}).tools.alchemy,'alchemist','invalid saved values are ignored');
 game.user=alice;app.actorId='belwar';
 const h=await html('individual');
 const row=name=>h.slice(h.indexOf(`<strong>${name}</strong>`),h.indexOf('</article>',h.indexOf(`<strong>${name}</strong>`)));
 assert.match(row('[TEST] Brew'),/Alchemist’s Supplies.*doesn’t carry this/);
 assert.match(row('[TEST] Stew'),/Workstation: \[TEST\] Kitchen/);assert.doesNotMatch(row('[TEST] Stew'),/Alchemist/,'workstation recipes need no tool');
 assert.match(row('[TEST] Tonic'),/Alchemist’s Supplies/,'no tool given: the profession’s tool');
 belwar.nextRoll=14;rolls.length=0;
 // 0.22.0: advantage tools configured for a crafting profession are ignored (Belwar is proficient with this one).
 const savedMapping=values.checkMapping;values.checkMapping={...(savedMapping??{}),advantageTools:{alchemy:['herb']}};
 belwar.system.tools??={};const savedHerb=belwar.system.tools.herb;belwar.system.tools.herb={value:1};
 await app._click('craft','REC-TG-BREW',{actor:'belwar'});
 belwar.system.tools.herb=savedHerb;if(savedHerb===undefined)delete belwar.system.tools.herb;values.checkMapping=savedMapping;
 assert.match(FakeDialog.last.content,/Alchemist’s Supplies check/);assert.match(FakeDialog.last.content,/also costs 5 gp — not deducted/i);
 assert.doesNotMatch(FakeDialog.last.content,/Advantage: Herbalism Kit/,'no advantage hint on a craft');
 assert.deepEqual(rolls.at(-1),{actor:'belwar',tool:'alchemist',advantage:false,disadvantage:false});
 const card=chats.at(-1);assert.match(card.content,/crafted \[TEST\] Brew/);assert.match(card.content,/Alchemist’s Supplies check:<\/strong> 14/);
 assert.equal(card.flags['ashen-gate-profession-ledger'].xp.kind,'craft');assert.equal(card.flags['ashen-gate-profession-ledger'].xp.professionId,'PROF-TG-ALCHEMY');
 assert.equal(belwar.flags['ashen-gate-profession-ledger'].professionProgress.professions['PROF-TG-ALCHEMY'],undefined,'crafting awards no XP by itself');
});

test('GM Setup maps profession → tool and gathering skill; saved with Save Changes',async()=>{
 game.user=gm;
 const h=await html('gm');
 assert.match(h,/Tools and checks/);assert.match(h,/data-map-cell="qualifyTools" data-map-prof="alchemy"/);assert.match(h,/data-map-cell="qualifySkills" data-map-prof="herbalism"/);
 app.element={querySelector:()=>null,querySelectorAll:s=>s.includes('roster-actor')?[{dataset:{rosterActor:'belwar'},checked:true},{dataset:{rosterActor:'tarra'},checked:true}].filter(x=>s.endsWith(']')||x.checked):[]};
 app._rememberMapDraft({dataset:{mapCell:'qualifyTools',mapProf:'alchemy'},value:'herb'});
 assert.equal(app.mapDirty,true);assert.equal(app.setupStatus,'Unsaved tool and check changes');
 await app._click('roster-save');
 assert.equal(values.checkMapping.tools.alchemy,'herb');assert.deepEqual(values.partyRoster,['belwar','tarra']);
 assert.equal(app.mapDirty,false);
 game.user=alice;await app._click('roster-save');assert.ok(errors.some(e=>e.includes('GM only')));
});

// 0.10.2: Enchanting is the profession; Arcana is the skill it checks by default.
test('Enchanting: old Arcana data resolves to it; the default check is the Arcana skill, a recipe tool is offered beside it',async()=>{
 assert.equal(professionKey('Arcana'),'enchanting');assert.equal(professionKey('[TEST] Enchanting'),'enchanting');
 assert.equal(effectiveMapping({}).skills.enchanting,'arc');assert.equal(effectiveMapping({}).tools.enchanting,'');
 assert.equal(effectiveMapping({tools:{arcana:'jeweler'}}).tools.enchanting,'jeweler','a setting saved under the old name is still read');
 assert.equal(effectiveMapping({skills:{enchanting:''}}).skills.enchanting,'','the GM can clear the skill');
 const ring=def('REC-TG-RING','Recipe',{name:'[TEST] Spellbound Ring',profession_id:'PROF-TG-ENCHANTING',result_item_id:'ITEM-TG-BREW',tier:'apprentice',tool:'jeweler',ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]});
 const charm=def('REC-TG-CHARM','Recipe',{name:'[TEST] Plain Charm',profession_id:'PROF-TG-ENCHANTING',result_item_id:'ITEM-TG-BREW',tier:'apprentice',ingredients:[{material_id:'MAT-TG-HERB',quantity:1}]});
 world.push(worldDoc('wenc','[TEST] Enchanting — Profession',src('PROF-TG-ENCHANTING','Profession',{definition:def('PROF-TG-ENCHANTING','Profession',{name:'[TEST] Enchanting'})})),
  worldDoc('wring','Recipe: [TEST] Spellbound Ring',src('REC-TG-RING','Recipe',{definition:ring})),worldDoc('wcharm','Recipe: [TEST] Plain Charm',src('REC-TG-CHARM','Recipe',{definition:charm})));
 belwar.items.push(profItem('benc','[TEST] Enchanting','PROF-TG-ENCHANTING'));
 belwar.flags['ashen-gate-profession-ledger'].knownRecipes.push('REC-TG-RING','REC-TG-CHARM');
 game.user=alice;app.actorId='belwar';
 const h=await html('individual');
 const row=name=>h.slice(h.indexOf(`<strong>${name}</strong>`),h.indexOf('</article>',h.indexOf(`<strong>${name}</strong>`)));
 assert.match(h,/Enchanting/);assert.doesNotMatch(h,/Arcana — Profession/);
 assert.match(row('[TEST] Spellbound Ring'),/Jeweler’s Tools.*doesn’t carry this/,'a missing recipe tool keeps the warning');
 assert.doesNotMatch(row('[TEST] Plain Charm'),/doesn’t carry|Uses/,'no tool: the Arcana skill needs no tool');
 // Without the tool the Arcana skill is rolled, and both are offered.
 belwar.nextRoll=12;rolls.length=0;
 await app._click('craft','REC-TG-RING',{actor:'belwar'});
 assert.match(FakeDialog.last.content,/<select name="check">/);assert.match(FakeDialog.last.content,/value="skill:arc" selected/);assert.match(FakeDialog.last.content,/Jeweler’s Tools \(tool\)/);
 assert.deepEqual(rolls.at(-1),{actor:'belwar',skill:'arc',advantage:false,disadvantage:false});
 assert.match(chats.at(-1).content,/Arcana check:<\/strong> 12/);
 // Carrying the tool makes it the default again.
 belwar.items.push(held('bjewel',"Jeweler’s Tools",{},1,{type:'tool',system:{quantity:1,type:{baseItem:'jeweler'}}}));
 rolls.length=0;await app._click('craft','REC-TG-RING',{actor:'belwar'});
 assert.match(FakeDialog.last.content,/value="tool:jeweler" selected/);assert.equal(rolls.at(-1).tool,'jeweler');
 // A recipe with no tool of its own rolls Arcana only.
 rolls.length=0;await app._click('craft','REC-TG-CHARM',{actor:'belwar'});
 assert.doesNotMatch(FakeDialog.last.content,/<select name="check">/);assert.match(FakeDialog.last.content,/Arcana check/);assert.equal(rolls.at(-1).skill,'arc');
});

// 0.25.1: the check picked in the Craft dialog is the one rolled and shown on the card (it used to be dropped).
test('craft: the check picked in the dialog is rolled and recorded; no pick keeps the default',async()=>{
 game.user=alice;app.actorId='belwar';
 try{
  // Belwar carries Jeweler’s Tools (previous test), so the tool is the default; the player picks Arcana with advantage.
  waitForm={check:{value:'skill:arc'},mode:{value:'1'}};belwar.nextRoll=17;rolls.length=0;
  await app._click('craft','REC-TG-RING',{actor:'belwar'});
  assert.match(FakeDialog.last.content,/value="tool:jeweler" selected/);
  assert.deepEqual(rolls.at(-1),{actor:'belwar',skill:'arc',advantage:true,disadvantage:false});
  assert.match(chats.at(-1).content,/Arcana check:<\/strong> 17 with advantage/);
  // A form with no check field (single-check recipes have none) rolls the default.
  waitForm={mode:{value:'0'}};rolls.length=0;
  await app._click('craft','REC-TG-RING',{actor:'belwar'});
  assert.equal(rolls.at(-1).tool,'jeweler');assert.match(chats.at(-1).content,/Jeweler’s Tools check:<\/strong>/);
  // An unknown value is ignored, not rolled.
  waitForm={check:{value:'skill:nope'},mode:{value:'0'}};rolls.length=0;
  await app._click('craft','REC-TG-RING',{actor:'belwar'});
  assert.equal(rolls.at(-1).tool,'jeweler');
 }finally{waitForm=null;}
});

// 0.10.2: every blocked gathering path says why and how to fix it.
test('gathering blockers: pure reasons, each with its fix',()=>{
 assert.match(startBlocker({rosterCount:0}),/^No party set: Ledger > GM Setup > tick the characters/);
 assert.match(startBlocker({rosterCount:2,partyCount:0}),/party characters were not found/);
 assert.match(startBlocker({rosterCount:2,partyCount:2,leadInParty:false}),/Choose a lead gatherer/);
 const ok=normalizeNode({id:'x',tier:1,materialId:'MAT-A-B'});
 assert.match(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:null}),/Choose a gathering node/);
 // 0.25.0: the reason names "not imported" apart from "draft/unreleased" (which the GM may use anyway).
 assert.equal(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialFound:false}),'Material MAT-A-B is not imported in this world: import it with General Manager.');
 assert.equal(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialState:'missing'}),'Material MAT-A-B is not imported in this world: import it with General Manager.');
 assert.match(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialState:'draft',materialStatus:'proposed'}),/^Material MAT-A-B is draft\/unreleased \(status: proposed\): approve it in General Manager, or tick “Use draft materials anyway”/);
 assert.match(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialState:'gm-only'}),/unreleased \(GM-only\)/);
 assert.equal(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialState:'draft',allowDraft:true}),'','the GM uses it anyway');
 assert.match(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialState:'missing',allowDraft:true}),/not imported/,'use anyway never covers a missing material');
 assert.equal(nodeBlocker(ok,{materialState:'draft',forPlayer:true}),'The GM has not released this material yet.');
 assert.equal(nodeBlocker(ok,{materialState:'missing',forPlayer:true}),'The GM has not imported this material yet.');
 assert.equal(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialFound:true}),'');
 assert.match(startBlocker({rosterCount:1,partyCount:1,leadInParty:true,node:ok,materialFound:true,busy:true}),/already being gathered/);
 assert.match(nodeBlocker(normalizeNode({id:'x',tier:1})),/^No material id set: award by hand.*Locations/);
 assert.match(nodeBlocker(normalizeNode({id:'x',tier:1,materialId:'MAT-A-B',exhausted:true})),/exhausted.*untick Exhausted in Locations/);
 assert.match(nodeBlocker(normalizeNode({id:'x',tier:1,materialId:'MAT-A-B',available:false})),/tick Available/);
 assert.match(nodeBlocker(normalizeNode({id:'x',materialId:'MAT-A-B'})),/No DC or tier.*Locations/);
 assert.doesNotMatch(nodeBlocker(ok,{materialFound:false,forPlayer:true}),/MAT-/,'players never see ids');
 assert.match(playerBlocker({rosterCount:0}),/GM has not set the party.*GM Setup/);
 assert.match(playerBlocker({rosterCount:2,mine:0}),/Owner permission/);
 assert.match(playerBlocker({rosterCount:2,mine:1,where:{ok:false,reason:GATHER_FIX.noLocations,locations:[]}}),/Locations module is not active/);
 assert.match(playerBlocker({rosterCount:2,mine:1,where:{ok:false,reason:'Locations is hidden from players. Ask your GM to enable Player Access.',locations:[]}}),/Player Access/);
 assert.match(playerBlocker({rosterCount:2,mine:1,where:{ok:true,locations:[]}}),/reveal a location/);
 assert.equal(playerBlocker({rosterCount:2,mine:1,where:{ok:true,locations:[{}]}}),'');
});

test('gathering blockers in Forge: GM tab, GM start and player tab each name the fix',async()=>{
 const roster=values.partyRoster;
 locs[0].resources.push({id:'n9',label:'Fresh patch',skill:'Herbalism',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',visible:true});
 // No party set.
 values.partyRoster=[];game.user=gm;
 let h=await html('gathering');
 assert.match(h,/No party set: Ledger > GM Setup > tick the characters/);
 await assert.rejects(()=>_test.startGather({node:nodeOf('LOC-TG-MEADOW','n9'),leadId:'belwar'}),/No party set: Ledger > GM Setup > tick the characters/);
 game.user=alice;h=await html('gathering');
 assert.match(h,/The GM has not set the party yet/);
 // A party the player has no character in.
 values.partyRoster=['tarra'];game.user=alice;h=await html('gathering');
 assert.match(h,/Owner permission on your character/);
 // Party set, material not in the world: the node is shown with the reason, start is refused with the same line.
 values.partyRoster=roster;game.user=gm;
 const missing=world.splice(world.findIndex(w=>w.id==='wherb'),1)[0];
 try{
  h=await html('gathering');app.gather.source='location';app.gather.nodeRef='LOC-TG-MEADOW|n9';
  h=await html('gathering');
  assert.match(h,/Material MAT-TG-HERB is not imported in this world: import it with General Manager/);
  assert.match(h,/data-action="gather-start" disabled/);
  await assert.rejects(()=>_test.startGather({node:nodeOf('LOC-TG-MEADOW','n9'),leadId:'belwar'}),/Material MAT-TG-HERB is not imported in this world/);
  // A player request is refused before the GM is bothered; the player gets no id, the GM gets the exact fix.
  const before=dialogs.length;errors.length=0;sent.length=0;
  const out=await _test.handleGatherRequest({type:'gather-request',requestId:'rm',requesterId:'u1',actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n9'},'u1');
  assert.equal(out.ok,false);assert.equal(dialogs.length,before,'no approval popup');
  assert.doesNotMatch(out.message,/MAT-/);assert.match(out.message,/GM can’t start this yet/);
  assert.ok(errors.some(e=>/MAT-TG-HERB is not imported in this world/.test(e)),'the GM sees the fix');
 }finally{world.push(missing);}
 // Locations inactive.
 const loc=modules['ashen-gate-locations'];loc.active=false;
 h=await html('gathering');assert.match(h,/Locations module is not active: enable Ashen Gate \| Locations in Manage Modules/);
 game.user=alice;h=await html('gathering');assert.match(h,/Locations module is not active: ask the GM to enable/);
 loc.active=true;game.user=gm;
 assert.match(checkGatherRequest({ownsActor:false}).reason,/Owner permission/);
 assert.match(checkGatherRequest({ownsActor:true,inParty:false}).reason,/GM Setup/);
});

test('0.14.0: progression read contract, level-changed hook, Skill Trees report in the lower-level text',async()=>{
 const P='PROF-TG-HERBALISM';
 game.user=gm;
 assert.equal(api.progression.contract,'ag-ledger-progression/1');
 const before=api.progression.level(belwar,P);
 assert.deepEqual(Object.keys(before).sort(),['level','profId','tier','xp'],'no history or perk choices');
 // An owned Profession with no XP row is level 1; a Profession the Actor does not own is null.
 assert.deepEqual(api.progression.level(belwar,'PROF-TG-ALCHEMY'),{profId:'PROF-TG-ALCHEMY',xp:0,level:1,tier:'Apprentice'});
 assert.equal(api.progression.level(tarra,P),null);
 // Players: own/observed Actors only; works even with Ledger Player Access off.
 values.playerAccessEnabled=false;
 game.user=alice;assert.equal(api.progression.level(belwar,P).level,before.level);
 game.user=bob;assert.throws(()=>api.progression.level(belwar,P),/access denied/);
 delete values.playerAccessEnabled;game.user=gm;
 // Every XP write announces the level change on the writing client.
 xpHooks.length=0;
 await _test.adjustXP(belwar,P,{set:xpForLevel(7)});
 await _test.adjustXP(belwar,P,{set:xpForLevel(3),reason:'test'});
 const fired=xpHooks.filter(h=>h.name==='ashenGateLedger.progressionChanged').map(h=>h.data);
 assert.deepEqual(fired.map(d=>[d.actorId,d.profId,d.previousLevel,d.level]),[['belwar',P,before.level,7],['belwar',P,7,3]]);
 assert.equal(api.hooks.progressionChanged,'ashenGateLedger.progressionChanged');
 // With Skill Trees present, the lower-level dialog lists its over-level nodes instead of Ledger perk choices.
 modules['ashen-gate-skill-trees']={active:true,api:{professionReport:(a,id,{level})=>a.id==='belwar'&&id===P&&level<7?{nodesAboveLevel:[{nodeId:'n7',name:'[TEST] Deep Roots',threshold:7}],overSpent:0}:null}};
 await _test.adjustXP(belwar,P,{set:xpForLevel(7)});
 const r=await _test.performAction('adjust-xp',{id:P,actorId:'belwar',set:String(xpForLevel(2))});
 assert.match(r.message,/1 \[TEST\] Herbalism Skill Tree perk \(\[TEST\] Deep Roots\) needs a higher level than 2\. They are kept, not removed\. Resolve them in Skill Trees\./);
 // A broken partner never blocks the XP change.
 modules['ashen-gate-skill-trees']={active:true,api:{professionReport:()=>{throw Error('boom');}}};
 await _test.performAction('adjust-xp',{id:P,actorId:'belwar',set:String(xpForLevel(1))});
 assert.equal(api.progression.level(belwar,P).level,1);
 delete modules['ashen-gate-skill-trees'];
});

test('0.14.1: a Locations node with no material reads "award by hand" for the GM; players get no DC and no GM menus',async()=>{
 const M=await import('../../ashen-gate-locations/scripts/model.mjs');
 const raw=M.resourcesOf(M.normalizeLocation({id:'LOC-TG-WOODS',name:'[TEST] Woods',resources:[{label:'[TEST] Hunter remains',skill:'Skinning & Harvesting',tier:1,dc:12,note:'[TEST] skin it, award by hand'}]}),{gm:true})[0];
 assert.equal(raw.materialId,'');assert.equal(raw.dcVisible,false);
 locs.push({id:'LOC-TG-WOODS',name:'[TEST] Woods',revealed:true,resources:[raw]});
 try{
  game.user=gm;app.gather.source='location';app.gather.nodeRef='';
  let h=await html('gathering');
  const opt=h.match(new RegExp(`<option value="LOC-TG-WOODS\\|${raw.id}"[^>]*>[^<]*</option>`))[0];
  assert.doesNotMatch(opt,/disabled/,'the GM can pick it to read why');assert.match(opt,/no material: award by hand/);
  app.gather.nodeRef=`LOC-TG-WOODS|${raw.id}`;h=await html('gathering');
  assert.match(h,/No material id set: award by hand\. \[TEST\] skin it, award by hand \(To let the Ledger award it/);
  assert.match(h,/data-action="gather-start" disabled/);
  await assert.rejects(()=>_test.startGather({node:normalizeNode(raw,{locationId:'LOC-TG-WOODS'}),leadId:'belwar'}),/award by hand/);
  game.user=alice;h=await html('gathering');
  assert.match(h,/The GM handles this spot at the table: ask them\./);
  assert.match(h,/\[TEST\] Hunter remains/,'free-text skill does not break the list');
  assert.doesNotMatch(h,/DC 12/);assert.doesNotMatch(h,/Locations > Gathering/);
  game.user=gm;sent.length=0;const before=dialogs.length;
  const out=await _test.handleGatherRequest({type:'gather-request',requestId:'rh',requesterId:'u1',actorId:'belwar',locationId:'LOC-TG-WOODS',nodeId:raw.id},'u1');
  assert.equal(out.ok,false);assert.equal(dialogs.length,before);
  assert.equal(out.message,'The GM handles this spot at the table: ask them.');
 }finally{locs.pop();game.user=gm;app.gather.nodeRef='';}
});

test('0.21.0: GM Send label, GM cannot request, stale approvals are removed, a GM reload clears players’ waiting requests',async()=>{
 locs[0].resources.push({id:'n10',label:'Late patch',skill:'Herbalism',tier:1,dc:10,dcVisible:true,materialId:'MAT-TG-HERB',finite:true,visible:true});
 game.user=gm;for(const id of [..._test.gatherSessions.keys()])_test.cancelGather(id);_test.resetGatherRequests();_test.setGatherRequestCooldown(0);
 app.gather.source='location';app.gather.actorId='belwar';app.gather.nodeRef='LOC-TG-MEADOW|n10';
 assert.match(await html('gathering'),/Send gathering check to Alice/);
 await assert.rejects(api.gathering.request({actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n10'}),/The GM starts gathering directly/);
 sent.length=0;
 const q=await _test.handleGatherRequest({type:'gather-request',requestId:'stale',requesterId:'u1',actorId:'belwar',locationId:'LOC-TG-MEADOW',nodeId:'n10'},'u1');
 assert.equal(q.status,'queued',q.message);
 values.partyRoster=['tarra'];
 try{await assert.rejects(api.gathering.approve('stale'),/Request removed: That character is not in the party/);}
 finally{values.partyRoster=['belwar','tarra'];}
 assert.deepEqual(api.gathering.requests(),[]);assert.equal(_test.gatherSessions.size,0);
 assert.equal(sent.filter(s=>s.msg.type==='gather-request-result').at(-1).msg.status,'declined','the player is told it cannot go ahead');
 game.user=alice;_test.myGatherRequests.set('belwar',{requestId:'x',title:'t'});infos.length=0;
 await _test.onSocket({type:'gather-requests-cleared'},'u2');assert.equal(_test.myGatherRequests.size,1,'only the GM can clear');
 await _test.onSocket({type:'gather-requests-cleared'},'gm');assert.equal(_test.myGatherRequests.size,0);assert.ok(infos.some(m=>/GM reloaded/.test(m)));
 game.user=gm;app.gather.nodeRef='';locs[0].resources.pop();
});

test('0.22.0: a re-render keeps the scroll position of the same tab (Gathering, GM Setup tables); a new tab starts at the top',async()=>{
 // 0.26.2: the screen is read from the DOM (data-agl-screen on .agl-main).
 const fakeEl=(top=0,lefts=[0],screen='gathering')=>{const wraps=lefts.map(scrollLeft=>({scrollLeft}));const main={scrollTop:top,dataset:{aglScreen:screen},querySelectorAll:s=>s==='.agl-map-wrap'?wraps:[]};
  return {main,wraps,querySelector:s=>s==='.agl-main'?main:null,querySelectorAll:()=>[]};};
 const saved=app.element;
 try{
  app.element=fakeEl(640,[]);await app._preRender({},{});
  let next=fakeEl();app.element=next;app._restoreScroll();
  assert.equal(next.main.scrollTop,640,'Gathering stays put after an action');
  app.element=fakeEl(900,[120],'gm');await app._preRender({},{});
  next=fakeEl(0,[0],'gm');app.element=next;app._restoreScroll();
  assert.equal(next.main.scrollTop,900);assert.equal(next.wraps[0].scrollLeft,120,'the Tools and checks table keeps its sideways scroll');
  app.element=fakeEl(500,[],'gm');await app._preRender({},{});
  next=fakeEl(0,[0],'party');app.element=next;app._restoreScroll();
  assert.equal(next.main.scrollTop,0,'switching tab starts at the top');
 }finally{app.element=saved;}
});
