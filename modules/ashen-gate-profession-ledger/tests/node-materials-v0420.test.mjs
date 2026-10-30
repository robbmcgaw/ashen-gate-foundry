import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {scaleTable,auditMaterials,auditWarning,poolNote,emptyPoolMessage,releasePlan,releaseConfirmText,importReport,templateMaterialIds,templateMaterialTables,isReleasedState} from '../scripts/node-materials.mjs';
import {planRound} from '../scripts/round.mjs';
import {checkTemplate,templatePlayerView,planNodeImport,normalizeStore,NODE_SCHEMA} from '../scripts/nodes.mjs';
// 0.42.0: node templates never reward unreleased or missing materials; the GM sees which ones; Release materials…; import reports.

const S={ok:{state:'ok',status:'approved'},draft:{state:'draft',status:'draft'},gm:{state:'gm-only',status:'approved'},missing:{state:'missing',status:''},
  retired:{state:'retired',status:'retired'},nv:{state:'not-visible',status:'approved'}};
const states=map=>id=>map[id]??S.missing;
const e=(materialId,chance=null,quantity=1)=>({materialId,quantity,chance});

test('scaleTable: unreleased and missing entries are dropped and the remaining chances are scaled in proportion to add up to 100',()=>{
  const keep=ids=>id=>ids.includes(id);
  // Nothing dropped: untouched.
  let r=scaleTable([e('A',70),e('B',30)],keep(['A','B']));
  assert.deepEqual([r.dropped,r.scaled,r.table.map(x=>x.chance)],[[],false,[70,30]]);
  // 70/30 with B dropped: one entry left, it needs no chance.
  r=scaleTable([e('A',70),e('B',30)],keep(['A']));
  assert.deepEqual([r.table.map(x=>x.materialId),r.table[0].chance,r.dropped,r.scaled],[['A'],null,['B'],false]);
  // 50/30/20 with C dropped: 62.5 / 37.5 become 63 / 37 (largest remainder, ties by table order); the sum is exactly 100.
  r=scaleTable([e('A',50),e('B',30),e('C',20)],keep(['A','B']));
  assert.deepEqual(r.table.map(x=>x.chance),[63,37]);assert.equal(r.scaled,true);
  assert.deepEqual(r.changes,[{materialId:'A',from:50,to:63},{materialId:'B',from:30,to:37}]);
  // 40/40/10/10 with the last 10 dropped: 44.4 / 44.4 / 11.1 -> floors 44 / 44 / 11 and the spare point goes to the first biggest remainder: 45 / 44 / 11.
  r=scaleTable([e('A',40),e('B',40),e('C',10),e('D',10)],keep(['A','B','C']));
  assert.deepEqual(r.table.map(x=>x.chance),[45,44,11]);
  // Everything dropped: empty table.
  r=scaleTable([e('A',60),e('B',40)],keep([]));assert.deepEqual([r.table,r.dropped],[[],['A','B']]);
  // Older Location tables without chances stay equally likely.
  r=scaleTable([e('A'),e('B'),e('C')],keep(['A','C']));assert.deepEqual(r.table.map(x=>x.chance),[null,null]);
  // The input is never changed.
  const input=[e('A',50),e('B',50)];scaleTable(input,keep(['A']));assert.deepEqual(input.map(x=>x.chance),[50,50]);
});

test('planRound: only releasable materials are drawn; a table with nothing releasable rewards nothing and asks for no hand-out',()=>{
  const faces=[];
  const roll=v=>f=>{faces.push(f);return v;};
  // Scaled table 63/37: a d100 picks A up to 63, B above.
  const pool={common:[e('A',63),e('B',37)],rare:[]};
  const draw=(total,v)=>planRound({pool,rolls:[{actorId:'x',actorName:'X',total}],dc:10,roll:roll(v)}).rows[0];
  assert.equal(draw(12,63).drops[0].materialId,'A');assert.equal(draw(12,64).drops[0].materialId,'B');assert.deepEqual([...new Set(faces)],[100]);
  // No Rare material left: a success by 5+ falls back to the Common one (existing rule).
  const fall=planRound({pool:{common:[e('A')],rare:[],empty:{rare:true}},rolls:[{actorId:'x',actorName:'X',total:17}],dc:10,roll:roll(1)}).rows[0];
  assert.deepEqual([fall.drops[0].materialId,fall.noRareFallback,fall.noReward],['A',true,[]]);
  // The table names materials but none is releasable: no reward, no "undetermined", and a success that fails stays a failure.
  const none=planRound({pool:{common:[],rare:[],empty:{common:true}},rolls:[{actorId:'x',actorName:'X',total:12},{actorId:'y',actorName:'Y',total:5}],dc:10,roll:roll(1)});
  assert.deepEqual([none.rows[0].drops,none.rows[0].undetermined,none.rows[0].noReward,none.rows[0].mayReceive],[[],[],['common'],[]]);
  assert.deepEqual([none.rows[1].result,none.rows[1].noReward],['fail',[]]);
  // A node that simply lists nothing is still the GM's by-hand case.
  const hand=planRound({pool:{common:[],rare:[]},rolls:[{actorId:'x',actorName:'X',total:12}],dc:10,roll:roll(1)}).rows[0];
  assert.deepEqual([hand.undetermined,hand.noReward],[['common'],[]]);
});

test('audit and wording: unreleased, not imported and stuck materials are named (no ids), with the tables they sit in',()=>{
  const t=checkTemplate({id:'NODE-TEST-MIX',name:'[TEST] Mix',activity:'herbalism',tier:{min:1,max:1},materials:{
    common:[e('MAT-A',50),e('MAT-B',30),e('MAT-C',20)],rare:[e('MAT-D')],exotic:[{materialId:'MAT-E',mode:'discovery'}]}}).node;
  const stateOf=states({'MAT-A':S.ok,'MAT-B':S.draft,'MAT-C':S.missing,'MAT-D':S.gm,'MAT-E':S.retired});
  const names={'MAT-A':'Alpha','MAT-B':'Beta','MAT-C':'Gamma','MAT-D':'Delta','MAT-E':'Epsilon'};
  const a=auditMaterials(templateMaterialTables(t),stateOf,id=>names[id]);
  assert.deepEqual([a.total,a.released,a.unreleased.map(r=>r.name),a.missing.map(r=>r.name),a.stuck.map(r=>r.name),a.releasable],[5,1,['Beta','Delta'],['Gamma'],['Epsilon'],['MAT-B','MAT-D']]);
  assert.deepEqual(a.emptyTables,['rare','exotic'],'a table with no released material is called out');
  const w=auditWarning(a);
  assert.match(w,/Unreleased: Beta \(Common\), Delta \(Rare\)\./);assert.match(w,/Not imported: Gamma \(Common\)\./);assert.match(w,/Needs fixing in General Manager.*Epsilon \(Exotic\)/);
  assert.match(w,/Nothing can be rewarded from the Rare and Exotic tables/);assert.doesNotMatch(w,/MAT-/);
  assert.equal(auditWarning(auditMaterials(templateMaterialTables(t),()=>S.ok)),'','all released: no warning');
  assert.equal(isReleasedState('not-visible'),true,'approved and player-visible counts as released even if the world Item is not readable by everyone');
  assert.deepEqual(templateMaterialIds(t),['MAT-A','MAT-B','MAT-C','MAT-D','MAT-E']);
  assert.match(emptyPoolMessage('[TEST] Mix','common',['Beta']),/every Common material this node lists is unreleased or not imported \(Beta\), so nothing was rewarded for it\. Use Release materials…/);
  const note=poolNote('[TEST] Mix',[{kind:'common',dropped:['MAT-B','MAT-C'],changes:[{materialId:'MAT-A',from:50,to:100}]}],id=>names[id]);
  assert.match(note,/Common left out \(unreleased or not imported\): Beta, Gamma\. The remaining chances were scaled up in proportion so they add up to 100 \(Alpha 50% to 100%\)\./);
});

test('releasePlan: only draft or not-player-visible materials that exist once are released; missing and stuck ones are reported, not touched',()=>{
  const stateOf=states({'MAT-A':S.ok,'MAT-B':S.draft,'MAT-C':S.missing,'MAT-D':S.gm,'MAT-E':S.retired,'MAT-F':S.nv});
  const p=releasePlan(['MAT-A','MAT-B','MAT-C','MAT-D','MAT-E','MAT-F','MAT-B'],stateOf,id=>id.slice(-1));
  assert.deepEqual([p.release.map(r=>r.id),p.alreadyReleased,p.missing,p.stuck],[['MAT-B','MAT-D'],2,['C'],['E']]);
  const text=releaseConfirmText(p);
  assert.match(text,/B \(draft\), D \(not player-visible\)/);assert.match(text,/Nothing is given to anyone/);assert.match(text,/Not imported, so not released: C/);
});

test('importReport: unknown and unreleased materials are report lines, never errors; the node still imports',()=>{
  const nodes=[
    checkTemplate({id:'NODE-TEST-ONE',name:'[TEST] One',activity:'mining',tier:{min:1,max:1},materials:{common:[e('MAT-A')]}}).node,
    checkTemplate({id:'NODE-TEST-TWO',name:'[TEST] Two',activity:'mining',tier:{min:1,max:1},materials:{common:[e('MAT-B',60),e('MAT-C',40)],rare:[e('MAT-D')]}}).node];
  const r=importReport(nodes,states({'MAT-A':S.ok,'MAT-B':S.draft}),id=>id);
  assert.equal(r.lines.length,2);assert.match(r.lines[0],/2 materials named by 1 of these nodes are not imported in this world yet \(MAT-C, MAT-D\)\. Those nodes still import/);
  assert.match(r.lines[1],/1 imported material used by these nodes is not released to players \(MAT-B\)/);
  assert.deepEqual(r.perNode.map(p=>p.id),['NODE-TEST-TWO']);
  assert.deepEqual(importReport(nodes,()=>S.ok).lines,[]);
  const plan=planNodeImport(normalizeStore({}),{schema:NODE_SCHEMA,nodes:nodes.map(n=>({id:n.id,name:n.name,activity:n.activity,tier:n.tier,materials:n.materials}))});
  assert.equal(plan.ok,true,'unknown materials are not an import error');assert.equal(plan.add.length,2);
});

test('players: a template shown to players names only released materials',()=>{
  const t=checkTemplate({id:'NODE-TEST-VIEW',name:'[TEST] View',activity:'mining',tier:{min:1,max:1},materials:{common:[e('MAT-A',50),e('MAT-B',50)],rare:[e('MAT-C')]}}).node;
  const rel=id=>id==='MAT-B';
  const v=templatePlayerView(t,{released:rel});
  assert.deepEqual([v.materialId,v.rareMaterialId],['MAT-B',''],'the first released Common material; no unreleased Rare one');
  assert.equal(templatePlayerView(t).materialId,'MAT-A','without the Ledger’s rule the old behaviour stays');
});

/* ---- Mocked Foundry: node rows and editor warnings, roll filtering, Release materials…, permissions, import preview ---- */
const hooks={},errors=[],infos=[],chats=[],sent=[];let api,confirmAnswer=true,lastConfirm=null;
const values={partyRoster:['belwar'],libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]},exoticChance:2};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true};
const users=[gm,alice];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}close(){}static async wait(o){lastConfirm=o;return confirmAnswer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:()=>{}};
globalThis.ui={notifications:{info:m=>infos.push(String(m)),error:e=>errors.push(String(e))}};
globalThis.ChatMessage={create:async x=>{chats.push(structuredClone(x));return x;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const matDef=(id,name,quality='Common')=>({id,entity_type:'Material',version:'0.1.0',refs:[{relation:'gathered_by',target_id:'PROF-TG-HERBALISM',mode:'required'}],name,quality,tierId:'apprentice',source_profession_id:'PROF-TG-HERBALISM'});
const setPath=(o,k,v)=>{const parts=k.split('.');while(parts.length>1){const p=parts.shift();o[p]??={};o=o[p];}o[parts[0]]=v;};
const updates=[];
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  update:async u=>{updates.push([id,structuredClone(u)]);for(const [k,v] of Object.entries(u))setPath(this_,k,v);},
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
let this_;
const mat=(id,name,opts={})=>{const d=worldDoc(`w-${id}`,name,src(id,'Material',{...opts,definition:matDef(id,name,opts.quality)}));
  const u=d.update;d.update=async up=>{this_=d;await u(up);};return d;};
const world=[mat('MAT-TG-HERB','[TEST] Herb'),mat('MAT-TG-MOSS','[TEST] Moss'),mat('MAT-TG-RARE','[TEST] Rare Herb',{quality:'Rare'}),
  mat('MAT-TG-FISH','[TEST] Ford Fish',{status:'draft'}),mat('MAT-TG-SEAL','[TEST] Gm Seal',{visibility:'gm'}),mat('MAT-TG-PEARL','[TEST] Draft Pearl',{status:'draft',quality:'Exotic'})];
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra});
const inv=[held('bprof','[TEST] Herbalism — Profession',src('PROF-TG-HERBALISM','Profession',{definition:{id:'PROF-TG-HERBALISM',entity_type:'Profession',version:'0.1.0',refs:[],name:'[TEST] Herbalism'}}),1,{type:'feat'})];
inv.get=i=>inv.find(x=>x.id===i);let made=0;
const belwar={id:'belwar',name:'[TEST] Belwar',type:'character',hasPlayerOwner:true,items:inv,flags:{},
  system:{skills:{nat:{total:3},sur:{total:5}},tools:{},abilities:{wis:{mod:2},int:{mod:0}}},testUserPermission:(u,role)=>u.isGM||u.id==='u1'||role==='LIMITED',
  setFlag:async()=>{},updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups)inv.get(u._id).system.quantity=u['system.quantity'];return ups;},
  createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`new${made++}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;}};
const journals=[];
const makeJournal=data=>{const j={...structuredClone(data),getFlag:(scope,key)=>j.flags?.[scope]?.[key],update:async u=>{for(const [k,v] of Object.entries(u))setPath(j,k,structuredClone(v));}};return j;};
globalThis.JournalEntry={create:async data=>{const j=makeJournal(data);journals.push(j);return j;}};
const ledgerModule={active:true,version:'0.42.0',set api(v){api=v},get api(){return api}};
const modules={'ashen-gate-profession-ledger':ledgerModule};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id),get activeGM(){return gm;}},items:{contents:world,get:id=>world.find(x=>x.id===id)},
  actors:{contents:[belwar],get:id=>id==='belwar'?belwar:null},journal:journals,socket:{emit:(n,m)=>sent.push(m),on:()=>{}},
  modules:{get:id=>modules[id]},settings:{register:()=>{},registerMenu:()=>{},get:(id,k)=>values[k],set:async(id,k,v)=>{values[k]=v;}}};
const entry=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/main.js');
const {_test}=await import(pathToFileURL(entry));hooks.init();hooks.ready();
await new Promise(r=>setTimeout(r,5));
const app=api.open({view:'gathering'});
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async view=>{app.view=view;return (await app._prepareContext({})).html;};
const T=api.gathering.templates;
const tpl=(id,common,rare=[],extra={})=>({id,name:`[TEST] ${id.slice(10)}`,activity:'herbalism',tier:{min:1,max:1},materials:{common,rare,exotic:[]},...extra});
const faces=[];
const rollBelwar=async(node,total)=>{
  const round=await _test.startRound({node,professions:['herbalism']});
  _test.recordRoll(round.id,{actorId:'belwar',total});
  const out=_test.revealRound(round.id);
  const notes=[..._test.openRound().result.gmNotes];
  _test.cancelRound(round.id);
  return {...out,row:out.rows[0],notes};
};

test('roll time: unreleased and missing materials are left out, chances are scaled to 100, and the GM is told how',async()=>{
  game.user=gm;
  await T.create(tpl('NODE-TEST-MIXED',[e('MAT-TG-HERB',50),e('MAT-TG-MOSS',30),e('MAT-TG-FISH',20)],[e('MAT-TG-RARE')]));
  await T.create(tpl('NODE-TEST-GONE',[e('MAT-TG-HERB',60),e('MAT-TG-NOPE',40)]));
  const node=id=>T.resolve({nodeId:id,tier:1});
  _test.setExoticRoll(f=>{faces.push(f);return 63;});
  let r=await rollBelwar(node('NODE-TEST-MIXED'),12);
  assert.equal(r.row.drops[0].materialId,'MAT-TG-HERB');assert.deepEqual(faces,[100],'one d100 over the scaled 63/37 table (50/30 of the 80 that remain)');
  _test.setExoticRoll(()=>64);
  r=await rollBelwar(node('NODE-TEST-MIXED'),12);assert.equal(r.row.drops[0].materialId,'MAT-TG-MOSS');
  assert.match(r.notes.join(' '),/Common left out \(unreleased or not imported\): \[TEST\] Ford Fish\. The remaining chances were scaled up in proportion so they add up to 100 \(\[TEST\] Herb 50% to 63%, \[TEST\] Moss 30% to 37%\)/);
  // A success by 5+ gives the Rare material (released).
  r=await rollBelwar(node('NODE-TEST-MIXED'),17);assert.equal(r.row.drops[0].materialId,'MAT-TG-RARE');
  // One released and one missing: the missing one is never rolled, whatever the die says.
  _test.setExoticRoll(()=>1);
  for(const total of [12,12])assert.equal((await rollBelwar(node('NODE-TEST-GONE'),total)).row.drops[0].materialId,'MAT-TG-HERB');
  assert.match((await rollBelwar(node('NODE-TEST-GONE'),12)).notes.join(' '),/left out.*Tg Nope/s);
});

test('roll time: nothing releasable left for a tier gives the GM a message (not an error) and no reward; the gather still starts',async()=>{
  game.user=gm;
  await T.create(tpl('NODE-TEST-EMPTY',[e('MAT-TG-FISH',70),e('MAT-TG-NOPE',30)]));
  await T.create(tpl('NODE-TEST-NORARE',[e('MAT-TG-HERB')],[e('MAT-TG-SEAL')]));
  const node=id=>T.resolve({nodeId:id,tier:1});
  errors.length=0;
  const r=await rollBelwar(node('NODE-TEST-EMPTY'),12);
  assert.deepEqual(r.row.drops,[]);assert.deepEqual(r.row.noReward,['common']);assert.equal(r.needsManual,false,'not handed to the GM as an undetermined drop');
  assert.match(r.row.reason,/\[TEST\] EMPTY: every Common material this node lists is unreleased or not imported \(\[TEST\] Ford Fish, Tg Nope\), so nothing was rewarded for it\. Use Release materials… on the node/);
  assert.deepEqual(errors,[],'no error was raised');
  // The Rare table is all unreleased: a success by 5+ falls back to the Common material and says what was left out.
  const f=await rollBelwar(node('NODE-TEST-NORARE'),17);
  assert.equal(f.row.drops[0].materialId,'MAT-TG-HERB');assert.equal(f.row.noRareFallback,true);assert.match(f.notes.join(' '),/Rare left out.*Gm Seal/);
  // “Use draft materials anyway” stays the GM's explicit choice for a draft (not for a missing material).
  const round=await _test.startRound({node:node('NODE-TEST-EMPTY'),professions:['herbalism'],allowDraft:true});
  _test.setExoticRoll(()=>1);_test.recordRoll(round.id,{actorId:'belwar',total:12});
  assert.equal(_test.revealRound(round.id).rows[0].drops[0].materialId,'MAT-TG-FISH');_test.cancelRound(round.id);
  // The start form warns instead of blocking.
  app.gather.source='template';app.gather.templateId='NODE-TEST-EMPTY';app.gather.allowDraft=false;
  const h=await html('gathering');
  assert.match(h,/Unreleased: \[TEST\] Ford Fish \(Common\)\. Not imported: Tg Nope \(Common\)\./);assert.doesNotMatch(h,/data-action="gather-start" disabled/);
});

test('node rows and the editor warn the GM, naming the materials, with Release materials… only where something can be released',async()=>{
  game.user=gm;
  let h=await html('nodes');
  const row=id=>{const i=h.indexOf(`data-action="node-edit" data-id="${id}"`);const s=h.lastIndexOf('<article',i);return h.slice(s,h.indexOf('</article>',i));};
  assert.match(row('NODE-TEST-MIXED'),/Unreleased: \[TEST\] Ford Fish \(Common\)\./);
  assert.match(row('NODE-TEST-MIXED'),/data-action="node-release" data-id="NODE-TEST-MIXED"[^>]*>.*Release materials…/s);
  assert.match(row('NODE-TEST-GONE'),/Not imported: Tg Nope \(Common\)\./);assert.doesNotMatch(row('NODE-TEST-GONE'),/node-release/,'a not-imported material cannot be released from here');
  assert.doesNotMatch(row('NODE-TEST-MIXED'),/MAT-TG/,'names, not raw ids, in the warning');
  await T.create(tpl('NODE-TEST-FINE',[e('MAT-TG-HERB',50),e('MAT-TG-MOSS',50)]));
  h=await html('nodes');assert.doesNotMatch(row('NODE-TEST-FINE'),/ag-notice--warn|Release materials/,'a node with only released materials has no warning');
  // The editor shows the same warning for what is on screen.
  await app._click('node-edit','NODE-TEST-MIXED');h=await html('nodes');
  assert.match(h,/agl-node-mats[^>]*>.*Unreleased: \[TEST\] Ford Fish \(Common\)/s);assert.match(h,/data-action="node-release" data-draft="1"/);
  await app._click('node-cancel');
});

test('Release materials…: asks first, releases exactly the node’s releasable materials, is GM only, and never happens by itself',async()=>{
  const ids=['MAT-TG-HERB','MAT-TG-FISH','MAT-TG-SEAL','MAT-TG-NOPE'];
  // Players: refused in the data layer for every entry point.
  game.user=alice;
  assert.throws(()=>T.materials('NODE-TEST-MIXED'),/Only the GM/);assert.throws(()=>T.releasePreview(ids),/Only the GM/);
  await assert.rejects(async()=>T.releaseMaterials(ids,{confirm:true}),/Only the GM/);
  game.user=gm;
  await assert.rejects(async()=>T.releaseMaterials(ids),/needs the GM’s confirmation/,'no confirm, no release');
  await assert.rejects(async()=>T.releaseMaterials(ids,{confirm:'yes'}),/needs the GM’s confirmation/);
  assert.equal(updates.length,0,'nothing was written by any of that');
  assert.deepEqual(T.materials('NODE-TEST-MIXED').releasable,['MAT-TG-FISH']);
  assert.deepEqual(T.releasePreview(ids).release.map(r=>r.id),['MAT-TG-FISH','MAT-TG-SEAL']);
  // The button: Cancel changes nothing.
  confirmAnswer=false;
  await app._click('node-release','NODE-TEST-MIXED');
  assert.equal(lastConfirm.window.title,'Release 1 material?');assert.equal(updates.length,0);assert.equal(_test.materialState('MAT-TG-FISH').state,'draft');
  // Confirm: exactly the one draft material this node uses; the Seal, the Pearl and anything else stay as they are.
  confirmAnswer=true;chats.length=0;
  await app._click('node-release','NODE-TEST-MIXED');
  assert.deepEqual(lastConfirm.buttons.map(b=>b.label),['Cancel','Release materials']);
  assert.match(lastConfirm.content,/\[TEST\] Ford Fish \(draft\)/);assert.match(lastConfirm.content,/Nothing is given to anyone/);
  assert.deepEqual(updates.map(u=>u[0]),['w-MAT-TG-FISH']);
  assert.deepEqual(updates[0][1],{'flags.ashen-gate-manager.source.status':'approved','flags.ashen-gate-manager.source.visibility':'player'});
  assert.equal(_test.materialState('MAT-TG-FISH').state,'ok');assert.equal(_test.materialState('MAT-TG-SEAL').state,'gm-only');assert.equal(_test.materialState('MAT-TG-PEARL').state,'draft');
  assert.deepEqual(chats.at(-1).whisper,['gm']);assert.match(chats.at(-1).content,/released 1 material for gathering: \[TEST\] Ford Fish \(was draft\)/);
  // The warning is gone, the node now rolls the material, and a second click has nothing to release.
  let h=await html('nodes');const i=h.indexOf('data-action="node-edit" data-id="NODE-TEST-MIXED"');assert.doesNotMatch(h.slice(h.lastIndexOf('<article',i),h.indexOf('</article>',i)),/ag-notice--warn/);
  const before=updates.length;await app._click('node-release','NODE-TEST-MIXED');assert.equal(updates.length,before);assert.match(app.notice,/Nothing here can be released/);
  // A GM-only (not player-visible) material is released too, when a node uses it; the multi-material API reports what it skipped.
  const out=await T.releaseMaterials(ids,{confirm:true});
  assert.deepEqual(out.released.map(r=>r.id),['MAT-TG-SEAL']);assert.deepEqual(out.missing,['Tg Nope']);assert.equal(out.alreadyReleased,2);
  assert.equal(_test.materialState('MAT-TG-SEAL').state,'ok');
});

test('import preview and result report unknown or unreleased materials as lines, not errors',async()=>{
  game.user=gm;
  const file={schema:NODE_SCHEMA,nodes:[tpl('NODE-TEST-IMPORTED',[e('MAT-TG-HERB',50),e('MAT-TG-UNKNOWN',50)],[e('MAT-TG-PEARL')])]};
  const plan=T.preview(file);
  assert.equal(plan.ok,true);assert.deepEqual(plan.errors,[]);
  assert.match(plan.materials.lines[0],/1 material named by 1 of these nodes is not imported in this world yet \(Tg Unknown\)/);
  assert.match(plan.materials.lines[1],/1 imported material used by these nodes is not released to players \(\[TEST\] Draft Pearl\)/);
  app.nodeImport={fileName:'x.json',data:file,plan};
  const h=await html('nodes');assert.match(h,/ag-notice--warn[^>]*>.*not imported in this world yet/s);app.nodeImport=null;
  const out=await T.import(file);
  assert.deepEqual(out.added,['NODE-TEST-IMPORTED']);assert.equal(out.materials.lines.length,2);
  game.user=alice;assert.throws(()=>T.preview(file),/Only the GM/);await assert.rejects(async()=>T.import(file),/Only the GM/);
  game.user=gm;
});
