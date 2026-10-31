// 0.38.0: GM-applied enchantments (recipe kind "activity" + gm_applied + bring). Record parsing, the loose bring filter, the
// Request enchanting… button (and no Craft / Complete activity button for these recipes), the request card, and the GM's
// Done (uses up the materials, re-checked on the GM client) and Decline (uses nothing). Mocked Foundry: logic and markup
// only, not the live UI. The table rule (one enchantment per item, attunement, magical) is text on the GM card, nothing more.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeRecipe,normalizeLibrary,isActivity} from '../scripts/core.mjs';
import {cleanBring,isGmApplied,matchesBring,itemFacts,bringCandidates,bringBlocker,hasBringFilter,requestRecord,enchantOf,TABLE_RULE} from '../scripts/enchanting.mjs';
import {executeConsume,planCraft} from '../scripts/crafting.mjs';
import {suggestActivityXP} from '../scripts/progression.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const ID='ashen-gate-profession-ledger';

// ---- pure: records and the loose filter ----------------------------------------------------------------------------
const rec=(id,extra)=>({id,entity_type:'Recipe',status:'approved',version:'0.4.0',visibility:'player',scope:'generic_rules',provenance:{sources:['[TEST]']},refs:[],name:id,...extra});
test('normalizeRecipe reads gm_applied and bring only on an activity; bad bring text is dropped',()=>{
  const glow=normalizeRecipe({id:'REC-TEST-GLOW',name:'[TEST] Glow',sourceDefinition:rec('REC-TEST-GLOW',{kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}],
    bring:{text:'  a  dagger ',item_types:['weapon','spell'],categories:[],base_items:['dagger']},effect_note:'Sheds light.'})});
  assert.equal(glow.kind,'activity');assert.equal(glow.gmApplied,true);assert.equal(isGmApplied(glow),true);assert.equal(isActivity(glow),true);
  assert.deepEqual(glow.bring,{text:'a dagger',itemTypes:['weapon'],categories:[],baseItems:['dagger']},'text squashed; unknown item types dropped');
  assert.equal(glow.hasStructuredIngredients,true,'the ingredients are read, so they can be used up');assert.equal(glow.resultItemId,null);assert.equal(glow.effectNote,'Sheds light.');
  const notActivity=normalizeRecipe({id:'REC-TEST-C',name:'C',sourceDefinition:rec('REC-TEST-C',{gm_applied:true,bring:{text:'a dagger'}})});
  assert.equal(notActivity.gmApplied,false,'gm_applied without kind activity is ignored');assert.equal(notActivity.bring,null);assert.equal(isGmApplied(notActivity),false);
  for(const bad of [{text:''},{text:'x'.repeat(81)},{},null,'a dagger',['a dagger']])assert.equal(cleanBring(bad),null,JSON.stringify(bad));
  assert.equal(normalizeRecipe({id:'REC-TEST-P',name:'P',sourceDefinition:rec('REC-TEST-P',{kind:'activity',profession_id:'PROF-TEST-ENCH'})}).gmApplied,false,'a plain activity is unchanged');
  const lib=normalizeLibrary({manifest:{schema_version:'ag-foundry-import/0.2'},records:[rec('REC-TEST-GLOW',{kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}],bring:{text:'a dagger'}})]});
  assert.equal(lib.recipes[0].gmApplied,true);assert.equal(lib.importSummary.unmappedRecipes,0);
});
test('bring filter is loose: every list that is set must pass; empty lists do not filter; materials and recipes are never offered',()=>{
  const bring=cleanBring({text:'a dagger',item_types:['weapon'],base_items:['dagger']});
  const dagger={id:'d',name:'Dagger',type:'weapon',system:{type:{value:'simpleM',baseItem:'dagger'}}};
  const sword={id:'s',name:'Sword',type:'weapon',system:{type:{value:'martialM',baseItem:'longsword'}}};
  assert.equal(matchesBring(itemFacts(dagger),bring),true);assert.equal(matchesBring(itemFacts(sword),bring),false);
  assert.equal(matchesBring(itemFacts({name:'Armor',type:'equipment',system:{type:{value:'light',baseItem:'leather'}}}),cleanBring({text:'leather armor',item_types:['equipment'],categories:['light'],base_items:['leather']})),true);
  assert.equal(matchesBring(itemFacts(sword),cleanBring({text:'anything'})),true,'only text: nothing filters');assert.equal(hasBringFilter(cleanBring({text:'anything'})),false);assert.equal(hasBringFilter(bring),true);
  const actor={name:'A',items:[dagger,sword,{id:'m',name:'Dust',type:'loot',flags:{'ashen-gate-manager':{source:{sourceId:'MAT-X'}}},system:{}},{id:'r',name:'Recipe: Glow',type:'loot',system:{}},{id:'f',name:'Feature',type:'feat',system:{}}]};
  const c=bringCandidates(actor,bring);
  assert.deepEqual(c.matches.map(i=>i.id),['d']);assert.deepEqual(c.others.map(i=>i.id),['s'],'other gear is offered (the GM decides); material, recipe and feature are not');
  assert.equal(bringBlocker(bring,c,'A'),'');assert.equal(bringBlocker(bring,{matches:[],others:[sword]},'A'),'','a filter that finds nothing still allows other items');
  assert.equal(bringBlocker(bring,bringCandidates({items:[]},bring),'A'),'Bring a dagger; A carries nothing to bring.');
  const r=requestRecord({actor:{id:'a',name:'A'},recipe:{id:'REC-X',name:'X',tier:'apprentice',effort:'long',bring:{text:'a dagger'}},item:{id:'d',name:'Dagger',uuid:'Actor.a.Item.d'},materials:[{materialId:'MAT-X',name:'Dust',quantity:1}],fee:30,effect:'e',check:{label:'Arcana',total:14,mode:0},userId:'u1',now:5});
  assert.equal(r.status,'requested');assert.deepEqual(r.materials,[{materialId:'MAT-X',name:'Dust',quantity:1}]);assert.equal(r.fee,30);assert.equal(enchantOf({flags:{[ID]:{enchant:r}}}).recipeId,'REC-X');assert.equal(enchantOf({flags:{[ID]:{enchant:{status:'weird'}}}}),null);
  assert.match(TABLE_RULE,/one enchantment per item/i);assert.match(TABLE_RULE,/not attuned by default/i);assert.match(TABLE_RULE,/not magical unless you say so/i);
});
test('executeConsume uses up the ingredients and restores them if a write fails; it creates nothing',async()=>{
  const item=(id,qty)=>({id,name:`Dust ${id}`,system:{quantity:qty},toObject(){return {_id:id,name:this.name,system:{quantity:this.system.quantity}};}});
  const mk=(items,failOn=null)=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);
    return {id:'a',name:'A',items:inv,updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){if(u._id===failOn)throw Error('write failed');inv.get(u._id).system.quantity=u['system.quantity'];}},
      deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids){if(i===failOn)throw Error('write failed');inv.splice(inv.findIndex(x=>x.id===i),1);}},
      createEmbeddedDocuments:async(t,docs)=>{for(const d of docs)inv.push(item(d._id,d.system.quantity));return docs;}};};
  const recipe={name:'R',ingredients:[{materialId:'MAT-A',name:'A',quantity:3}]};
  const alloc=[{materialId:'MAT-A',name:'A',quantity:2,actorId:'a',actorName:'A',itemId:'i1',own:true},{materialId:'MAT-A',name:'A',quantity:1,actorId:'a',actorName:'A',itemId:'i2',own:true}];
  let a=mk([item('i1',2),item('i2',5)]);
  const out=await executeConsume({crafter:a,recipe,allocations:alloc,actorOf:()=>a,canWrite:()=>true});
  assert.deepEqual(a.items.map(i=>[i.id,i.system.quantity]),[['i2',4]],'i1 used up and deleted, i2 reduced');assert.equal(out.consumed.reduce((n,c)=>n+c.quantity,0),3);assert.equal(out.created,undefined,'nothing is made');
  a=mk([item('i1',2),item('i2',5)],'i2');
  await assert.rejects(()=>executeConsume({crafter:a,recipe,allocations:alloc,actorOf:()=>a,canWrite:()=>true}),/materials were restored: write failed/);
  assert.deepEqual(a.items.map(i=>[i.id,i.system.quantity]).sort(),[['i1',2],['i2',5]],'rolled back');
  a=mk([item('i1',1),item('i2',5)]);
  await assert.rejects(()=>executeConsume({crafter:a,recipe,allocations:alloc,actorOf:()=>a,canWrite:()=>true}),/has only 1 × A/,'verified before anything is written');
  assert.deepEqual(a.items.map(i=>i.system.quantity),[1,5]);
  await assert.rejects(()=>executeConsume({crafter:a,recipe,allocations:alloc,actorOf:()=>a,canWrite:()=>false}),/You need to own/);
});

// ---- the Ledger window and the request card (mocked Foundry) ---------------------------------------------------------
const hooks={},chats=[],rolls=[],xpHooks=[],errors=[];let api;
const values={partyRoster:['ench','poor','bare'],playerAccessEnabled:true,libraryData:{schema:'ag-ledger/0.1',recipes:[],materials:[]}};
const gm={id:'gm',isGM:true,name:'GM',active:true},alice={id:'u1',isGM:false,name:'Alice',active:true},bob={id:'u2',isGM:false,name:'Bob',active:true};
const users=[gm,alice,bob];
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const dialogs=[];
class FakeDialog{constructor(o){this.opts=o;}render(){return this;}async close(){}static answer=true;static async wait(opts){dialogs.push(opts);return FakeDialog.answer;}}
globalThis.foundry={applications:{api:{ApplicationV2:class{async _prepareContext(){return {};}render(){this.rendered=true;return this;}},HandlebarsApplicationMixin:c=>c,DialogV2:FakeDialog}},utils:{escapeHTML:esc,randomID:()=>`id${Math.random().toString(36).slice(2,10)}`}};
globalThis.Hooks={once:(n,f)=>hooks[n]=f,on:()=>{},callAll:(name,data)=>xpHooks.push({name,data})};
globalThis.ui={notifications:{info:()=>{},error:e=>errors.push(String(e))}};
let failMessageUpdate=false;
globalThis.ChatMessage={create:async x=>{const m={id:`m${chats.length}`,author:{id:game.user.id},...structuredClone(x),update:async u=>{if(failMessageUpdate)throw Error('update failed');for(const [k,v] of Object.entries(u)){const parts=k.split('.');let o=m;while(parts.length>1){const p=parts.shift();o=o[p]??={};}o[parts[0]]=v;}}};chats.push(m);return m;},getSpeaker:({actor}={})=>({alias:actor?.name})};
const src=(id,type,{visibility='player',status='approved',definition=null}={})=>({'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility,status,version:'0.1.0',refs:[],...(definition?{definition}:{})}}});
const def=(id,type,extra={})=>({id,entity_type:type,version:'0.1.0',refs:[],...extra});
const worldDoc=(id,name,flags)=>({id,uuid:`Item.${id}`,name,img:'',type:'loot',flags,system:{description:{value:''}},testUserPermission:u=>u.isGM||flags['ashen-gate-manager'].source.visibility==='player',
  toObject(){return {_id:this.id,name:this.name,img:this.img,type:this.type,flags:structuredClone(this.flags),system:{description:{value:''}}};}});
const glow=def('REC-TEST-GLOW','Recipe',{name:'[TEST] Glow Etching',kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',tier:'apprentice',effort:'long',additional_gp:30,
  ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}],bring:{text:'a dagger',item_types:['weapon'],categories:[],base_items:['dagger']},effect_note:'The dagger sheds dim light in a 10-foot radius while unsheathed.',
  rules_summary:'Bring a dagger. The GM adds the effect to it; nothing new is made.'});
const ward=def('REC-TEST-WARD','Recipe',{name:'[TEST] Faint Ward',kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',tier:'apprentice',effort:'short',workstation:'Enchanting Chamber',
  ingredients:[{material_id:'MAT-TEST-DUST',quantity:2}],bring:{text:'a worn item',item_types:['equipment','loot']},effect_note:'Once per Long Rest, add +1 to a failed save.'});
const chalk=def('REC-TEST-CHALK','Recipe',{name:'[TEST] Chalk',profession_id:'PROF-TEST-ENCH',result_item_id:'ITEM-TEST-CHALK',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}]});
const world=[
  worldDoc('wdust','[TEST] Dust',src('MAT-TEST-DUST','Material',{definition:def('MAT-TEST-DUST','Material',{name:'[TEST] Dust'})})),
  worldDoc('wglow','Recipe: [TEST] Glow Etching',src('REC-TEST-GLOW','Recipe',{definition:glow})),
  worldDoc('wward','Recipe: [TEST] Faint Ward',src('REC-TEST-WARD','Recipe',{definition:ward})),
  worldDoc('wchalk','Recipe: [TEST] Chalk',src('REC-TEST-CHALK','Recipe',{definition:chalk})),
  worldDoc('wchalki','[TEST] Chalk',src('ITEM-TEST-CHALK','Item',{definition:def('ITEM-TEST-CHALK','Item',{name:'[TEST] Chalk'})})),
  worldDoc('wench','[TEST] Enchanting — Profession',src('PROF-TEST-ENCH','Profession',{definition:def('PROF-TEST-ENCH','Profession',{name:'[TEST] Enchanting'})}))];
world.get=id=>world.find(x=>x.id===id);
const held=(id,name,flags,qty=1,extra={})=>({id,name,type:'loot',system:{quantity:qty,description:{value:''}},flags,...extra,toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags)};}});
const profItem=(id,name,prof)=>held(id,`${name} — Profession`,src(prof,'Profession',{definition:def(prof,'Profession',{name})}),1,{type:'feat'});
const weapon=(id,name,baseItem)=>held(id,name,{},1,{type:'weapon',system:{quantity:1,type:{value:'simpleM',baseItem},description:{value:''}}});
const makeActor=(id,name,ownerId,items,known,system)=>{const inv=[...items];inv.get=i=>inv.find(x=>x.id===i);let n=0;
  const a={id,name,type:'character',hasPlayerOwner:true,items:inv,flags:{[ID]:{knownRecipes:known}},system,
    testUserPermission:(u,role)=>u.isGM||u.id===ownerId||(role==='LIMITED'||role==='OBSERVER'),
    setFlag:async(scope,key,v)=>{a.flags[scope]??={};a.flags[scope][key]=structuredClone(v);},
    updateEmbeddedDocuments:async(t,ups)=>{for(const u of ups){const it=inv.get(u._id);for(const [k,v] of Object.entries(u))if(k!=='_id'){const parts=k.split('.');let o=it;while(parts.length>1)o=o[parts.shift()];o[parts[0]]=v;}}return ups;},
    deleteEmbeddedDocuments:async(t,ids)=>{for(const i of ids)inv.splice(inv.findIndex(x=>x.id===i),1);return ids;},
    createEmbeddedDocuments:async(t,docs)=>{const out=docs.map(d=>held(`${id}-new${n++}`,d.name,d.flags,d.system?.quantity??1));inv.push(...out);return out;},
    rollSkill:async cfg=>{rolls.push({actor:id,skill:cfg.skill});return [{total:14}];},
    rollToolCheck:async cfg=>{rolls.push({actor:id,tool:cfg.tool});return [{total:15}];}};
  return a;};
const ench=makeActor('ench','[TEST] Enchanter','u1',[profItem('eprof','[TEST] Enchanting','PROF-TEST-ENCH'),held('edust','[TEST] Dust',src('MAT-TEST-DUST','Material'),3),weapon('edag','Fine Dagger','dagger'),weapon('esword','Old Sword','longsword'),held('ecloak','Traveler’s Cloak',{},1,{type:'equipment'})],
  ['REC-TEST-GLOW','REC-TEST-WARD','REC-TEST-CHALK'],{skills:{arc:{value:1,total:5}},tools:{},abilities:{int:{mod:3}}});
const poor=makeActor('poor','[TEST] Poor','u2',[profItem('pprof','[TEST] Enchanting','PROF-TEST-ENCH'),weapon('pdag','Dagger','dagger')],['REC-TEST-GLOW'],{skills:{arc:{value:0,total:1}},tools:{},abilities:{int:{mod:1}}});
const bare=makeActor('bare','[TEST] Bare','u2',[profItem('bprof','[TEST] Enchanting','PROF-TEST-ENCH'),held('bdust','[TEST] Dust',src('MAT-TEST-DUST','Material'),1)],['REC-TEST-GLOW'],{skills:{arc:{value:0,total:1}},tools:{},abilities:{int:{mod:1}}});
const actors=[ench,poor,bare];
const mod={active:true,version:'0.41.1',get api(){return api},set api(v){api=v}};
globalThis.game={user:gm,users:{contents:users,get:id=>users.find(u=>u.id===id)},items:{contents:world,get:world.get},actors:{contents:actors,get:id=>actors.find(a=>a.id===id)},
  socket:{emit(){},on(){}},modules:{get:id=>id===ID?mod:undefined},settings:{register(){},registerMenu(){},get:(i,k)=>values[k],set:async(i,k,v)=>{values[k]=v;}}};
await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));hooks.init();hooks.ready();
const {_test}=await import(pathToFileURL(path.resolve(here,'../scripts/main.js')));
const app=api.open({view:'individual'});
app.element={querySelector:()=>null,querySelectorAll:()=>[]};
const html=async actorId=>{app.view='individual';app.actorId=actorId;return (await app._prepareContext({})).html;};
const cardOf=(h,name)=>h.slice(h.lastIndexOf('<article',h.indexOf(name)),h.indexOf('</article>',h.indexOf(name)));
const dust=()=>ench.items.get('edust')?.system.quantity??0;
const decorate=(message,user)=>{game.user=user;
  const btn=()=>({disabled:false,fn:{},addEventListener(t,f){this.fn[t]=f;}});
  const slot={innerHTML:'',done:null,decline:null,
    querySelector(sel){if(sel==='[data-agl-enchant-done]'&&/data-agl-enchant-done/.test(this.innerHTML))return this.done??=btn();
      if(sel==='[data-agl-enchant-decline]'&&/data-agl-enchant-decline/.test(this.innerHTML))return this.decline??=btn();return null;},
    querySelectorAll(){return [this.done,this.decline].filter(Boolean);}};
  _test.decorateEnchantCard(message,{querySelector:s=>s==='[data-agl-enchant]'?slot:null});return slot;};
const settle=()=>new Promise(r=>setTimeout(r,25));

test('Individual view: a GM-applied recipe shows Request enchanting…, Bring, the fee and Check: Arcana; no Craft and no Complete activity',async()=>{
  game.user=alice;
  const h=await html('ench'),row=cardOf(h,'[TEST] Glow Etching');
  assert.match(row,/data-action="request-enchanting" data-id="REC-TEST-GLOW" data-actor="ench"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"><\/i> Request enchanting…<\/button>/);
  assert.doesNotMatch(row,/data-action="craft"|data-action="complete-activity"|Complete activity|>\s*Craft\s*<|Makes/);
  assert.match(row,/Enchantment<\/span>/);
  assert.match(row,/<span class="agl-label">Bring<\/span><div>a dagger<\/div>/);
  assert.match(row,/1 ×<\/span>.*\[TEST\] Dust.*\(3 on hand/s,'the materials, with what is on hand');
  assert.match(row,/Fee: 30 gp \(the GM collects it\)/);
  assert.doesNotMatch(row,/not deducted automatically/);
  assert.match(row,/Check<\/span> <span>Arcana<\/span>/,'a short recipe with no tool or station still names its check');
  assert.match(row,/sheds dim light/,'the effect text');
  const wardRow=cardOf(h,'[TEST] Faint Ward');
  assert.match(wardRow,/Station<\/span> <span>Enchanting Chamber/);assert.match(wardRow,/Check<\/span> <span>Arcana<\/span>/);assert.match(wardRow,/data-action="request-enchanting" data-id="REC-TEST-WARD"/);
  assert.match(cardOf(h,'[TEST] Chalk'),/data-action="craft" data-id="REC-TEST-CHALK"/,'a standalone Enchanting recipe is still crafted');
});
test('the button is disabled with the reason when the materials are missing or there is nothing to bring',async()=>{
  game.user=bob;
  let row=cardOf(await html('poor'),'[TEST] Glow Etching');
  assert.match(row,/<button type="button" class="ag-btn" disabled aria-describedby="[^"]+">/);assert.doesNotMatch(row,/data-action="request-enchanting"/);
  assert.match(row,/Missing 1 × \[TEST\] Dust/);
  row=cardOf(await html('bare'),'[TEST] Glow Etching');
  assert.doesNotMatch(row,/data-action="request-enchanting"/);assert.match(row,/Bring a dagger; \[TEST\] Bare carries nothing to bring\./);
  game.user=gm;
});
test('Craft and Complete activity refuse a GM-applied recipe, for everyone including the GM',async()=>{
  for(const user of [alice,gm]){game.user=user;
    await assert.rejects(()=>_test.performAction('craft',{id:'REC-TEST-GLOW',actorId:'ench'}),/is an enchantment: use Request enchanting/);
    await assert.rejects(()=>_test.performAction('complete-activity',{id:'REC-TEST-GLOW',actorId:'ench'}),/is an enchantment: use Request enchanting/);
    await assert.rejects(()=>api.completeActivity(ench,'REC-TEST-GLOW',{confirm:false}),/use Request enchanting/);}
  game.user=gm;
  await assert.rejects(()=>_test.performAction('request-enchanting',{id:'REC-TEST-CHALK',actorId:'ench'}),/is not an enchantment/,'a normal craft is not requested');
  game.user=bob;
  await assert.rejects(()=>_test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'}),/You need to own that character/);
  await assert.rejects(()=>_test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'poor'}),/Missing 1 × \[TEST\] Dust/,'materials are checked at request time too');
  await assert.rejects(()=>_test.performAction('request-enchanting',{id:'REC-TEST-WARD',actorId:'poor'}),/has not learned/);
  assert.equal(chats.length,0,'nothing was posted');game.user=gm;
});
let request;
test('Request enchanting: the dialog shows what is needed; the card goes to the GM and the owner; nothing is used or made yet',async()=>{
  game.user=alice;FakeDialog.answer={item:'edag',mode:'0',check:undefined};
  const items=ench.items.length;
  const out=await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});
  FakeDialog.answer=true;
  assert.equal(out.ok,true);assert.match(out.message,/asked the GM to enchant Fine Dagger with \[TEST\] Glow Etching\. Nothing is used until the GM marks it done\./);
  const d=dialogs.at(-1);
  assert.match(d.window.title,/Request \[TEST\] Glow Etching\?/);
  assert.match(d.content,/Bring a dagger\./);assert.match(d.content,/The dagger sheds dim light/);
  assert.match(d.content,/<optgroup label="Matches “a dagger”"><option value="edag" selected>Fine Dagger<\/option><\/optgroup>/,'the dagger matches');
  assert.match(d.content,/<optgroup label="Other items \(the GM decides\)">.*Old Sword.*Traveler’s Cloak/s,'other gear is offered, advisory only');
  assert.doesNotMatch(d.content,/Dust<\/option>|Recipe:/,'materials and recipes are not bringable');
  assert.match(d.content,/None of these — settle it at the table/);
  assert.match(d.content,/used up only when the GM marks the request done/);assert.match(d.content,/1 × \[TEST\] Dust <small>\(3 on hand\)/);assert.match(d.content,/Fee: 30 gp — the GM collects it\./);
  assert.match(d.content,/Arcana check/);
  assert.deepEqual(rolls.at(-1),{actor:'ench',skill:'arc'});
  assert.equal(dust(),3,'no materials used at request');assert.equal(ench.items.length,items,'no item created');assert.ok(ench.items.get('edag'),'the dagger is untouched');
  assert.equal(chats.length,1);request=chats[0];
  assert.deepEqual([...request.whisper].sort(),['gm','u1'],'whispered to the GM and the character’s owner only');
  const e=request.flags[ID].enchant;
  assert.equal(e.status,'requested');assert.equal(e.recipeId,'REC-TEST-GLOW');assert.equal(e.actorId,'ench');assert.deepEqual(e.item,{id:'edag',uuid:null,name:'Fine Dagger'});
  assert.deepEqual(e.materials,[{materialId:'MAT-TEST-DUST',name:'[TEST] Dust',quantity:1}]);assert.equal(e.fee,30);assert.equal(e.check.label,'Arcana');assert.equal(e.requesterId,'u1');
  assert.match(request.content,/\[TEST\] Enchanter asks to enchant: \[TEST\] Glow Etching/);assert.match(request.content,/<strong>Bring:<\/strong> a dagger — <em>Fine Dagger<\/em>/);
  assert.match(request.content,/Fee: 30 gp, collected by the GM \(not deducted automatically\)\./);assert.match(request.content,/Arcana check:<\/strong> 14/);
  assert.doesNotMatch(request.content,/Table rule/,'the table rule is added for the GM when the card renders, not stored');
  assert.equal(xpHooks.filter(h=>h.name==='ashenGateLedger.xpOpportunity').length,0,'no XP opportunity until the GM marks it done');
});
test('the card: the GM sees Done and Decline and the table rule; the player sees that the GM has not answered',()=>{
  const gmSlot=decorate(request,gm);
  assert.match(gmSlot.innerHTML,/Table rule: one enchantment per item\. An enchanted item is not attuned by default and is not magical unless you say so\./);
  assert.match(gmSlot.innerHTML,/data-agl-enchant-decline><i class="fa-solid fa-xmark" aria-hidden="true"><\/i> Decline…<\/button>/);assert.match(gmSlot.innerHTML,/data-agl-enchant-done><i class="fa-solid fa-check" aria-hidden="true"><\/i> Done<\/button>/);
  assert.ok(gmSlot.innerHTML.indexOf('Decline')<gmSlot.innerHTML.indexOf('>',gmSlot.innerHTML.indexOf('data-agl-enchant-done'))+40,'Decline on the left, Done (primary) on the right');
  const playerSlot=decorate(request,alice);
  assert.match(playerSlot.innerHTML,/Waiting for the GM\. Nothing is used up until they mark it done\./);assert.doesNotMatch(playerSlot.innerHTML,/<button|Table rule/);
  game.user=gm;
});
test('permissions are enforced in the API: a player cannot mark Done or Decline, and a card that is not a request is refused',async()=>{
  game.user=alice;
  await assert.rejects(()=>api.resolveEnchantRequest(request,'done',{confirm:false}),/Only the GM can resolve/);
  await assert.rejects(()=>api.resolveEnchantRequest(request,'declined',{confirm:false}),/Only the GM can resolve/);
  assert.equal(dust(),3);assert.equal(request.flags[ID].enchant.status,'requested');
  game.user=gm;
  await assert.rejects(()=>api.resolveEnchantRequest({id:'x',flags:{}},'done',{confirm:false}),/not an enchanting request/);
  await assert.rejects(()=>api.resolveEnchantRequest(request,'maybe',{confirm:false}),/Choose Done or Decline/);
});
test('Done: re-checks on the GM client, uses up the materials, marks the card, opens the XP award; a second Done is refused',async()=>{
  game.user=gm;
  const out=await api.resolveEnchantRequest(request,'done');
  assert.equal(out.ok,true);assert.match(out.message,/done for \[TEST\] Enchanter: used 1 × \[TEST\] Dust\. Add the effect to the item by hand\./);
  assert.match(dialogs.at(-1).window.title,/Mark enchanting done\?/);assert.match(dialogs.at(-1).content,/Fine Dagger/);assert.match(dialogs.at(-1).content,/30 gp fee/);
  assert.equal(dust(),2,'3 − 1');assert.ok(ench.items.get('edag'),'the player’s item is not touched or renamed');assert.equal(ench.items.get('edag').name,'Fine Dagger');
  const e=request.flags[ID].enchant;
  assert.equal(e.status,'done');assert.equal(e.resolvedBy,'gm');assert.deepEqual(e.consumed,[{actorId:'ench',actorName:'[TEST] Enchanter',name:'[TEST] Dust',quantity:1}]);
  const xp=request.flags[ID].xp;assert.equal(xp.kind,'activity');assert.equal(xp.actorId,'ench');assert.equal(xp.suggested,suggestActivityXP('apprentice','long').xp,'the suggested XP for Apprentice, Long effort');assert.equal(xp.awarded,null);
  assert.equal(xpHooks.filter(h=>h.name==='ashenGateLedger.xpOpportunity').length,1);
  const slot=decorate(request,gm);assert.match(slot.innerHTML,/Done\.<\/strong> GM applied the enchantment; used up: 1 × \[TEST\] Dust/);assert.doesNotMatch(slot.innerHTML,/<button/);
  assert.match(decorate(request,alice).innerHTML,/applied the enchantment/);
  const note=chats.at(-1);assert.deepEqual([...note.whisper].sort(),['gm','u1']);assert.match(note.content,/done<\/strong>.*The GM adds the effect to Fine Dagger\. Used: 1 × \[TEST\] Dust/s);
  game.user=gm;
  await assert.rejects(()=>api.resolveEnchantRequest(request,'done',{confirm:false}),/already done/);
  await assert.rejects(()=>api.resolveEnchantRequest(request,'declined',{confirm:false}),/already done/);
  assert.equal(dust(),2,'not used twice');
  await _test.awardXpFromCard(request,2);
  assert.equal(api.getProfessionProgress(ench,'PROF-TEST-ENCH').xp,2,'the existing XP award works from the enchanting card');
});
test('Decline: asks for an optional reason, uses nothing, tells the player',async()=>{
  game.user=alice;FakeDialog.answer={item:'',mode:'0'};
  await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});
  const card=chats.at(-1);FakeDialog.answer=true;
  assert.equal(card.flags[ID].enchant.item,null,'None of these: settled at the table');assert.match(card.content,/no item chosen; settle it at the table/);
  game.user=gm;const before=dust();
  FakeDialog.answer=null;assert.equal(await api.resolveEnchantRequest(card,'declined'),null,'cancel leaves the card as it was');assert.equal(card.flags[ID].enchant.status,'requested');
  FakeDialog.answer={reason:'  Not   this   week  '};
  const out=await api.resolveEnchantRequest(card,'declined');FakeDialog.answer=true;
  assert.equal(out.ok,true);assert.match(out.message,/Declined \[TEST\] Glow Etching for \[TEST\] Enchanter\. Nothing was used\./);
  assert.equal(dust(),before,'nothing consumed');assert.equal(card.flags[ID].enchant.status,'declined');assert.equal(card.flags[ID].enchant.reason,'Not this week');
  assert.equal(card.flags[ID].xp,undefined,'no XP slot for a declined request');
  assert.match(decorate(card,alice).innerHTML,/Declined<\/strong> by GM: Not this week\. Nothing was used\./);game.user=gm;
  assert.match(chats.at(-1).content,/declined by the GM.*Not this week · Nothing was used/s);
  await assert.rejects(()=>api.resolveEnchantRequest(card,'done',{confirm:false}),/already declined/);
});
test('Done is refused, and nothing is used, when the materials are gone, the recipe is no longer an enchantment, or the card does not fit its author',async()=>{
  game.user=alice;FakeDialog.answer={item:'edag',mode:'0'};
  await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});FakeDialog.answer=true;
  const card=chats.at(-1);game.user=gm;
  // forged flag: another actor the author does not own
  const forged=structuredClone(card.flags[ID].enchant);forged.actorId='poor';
  const fake={id:'fake',author:{id:'u1'},flags:{[ID]:{enchant:forged}},update:async()=>{throw Error('must not update');}};
  await assert.rejects(()=>api.resolveEnchantRequest(fake,'done',{confirm:false}),/does not own \[TEST\] Poor/);
  const wrongAuthor={...card,author:{id:'u2'},update:card.update};
  await assert.rejects(()=>api.resolveEnchantRequest(wrongAuthor,'done',{confirm:false}),/does not match the player who posted it/);
  // the player spends the materials before the GM answers
  const keep=ench.items.get('edust').system.quantity;ench.items.get('edust').system.quantity=0;
  await assert.rejects(()=>api.resolveEnchantRequest(card,'done',{confirm:false}),/Missing 1 × \[TEST\] Dust\. Nothing was used\./);
  assert.equal(card.flags[ID].enchant.status,'requested','the card stays open');ench.items.get('edust').system.quantity=keep;
  // the recipe is no longer known
  ench.flags[ID].knownRecipes=['REC-TEST-WARD'];
  await assert.rejects(()=>api.resolveEnchantRequest(card,'done',{confirm:false}),/has not learned/);ench.flags[ID].knownRecipes=['REC-TEST-GLOW','REC-TEST-WARD','REC-TEST-CHALK'];
  // GM cancels the confirmation: nothing used
  FakeDialog.answer=false;assert.equal(await api.resolveEnchantRequest(card,'done'),null);FakeDialog.answer=true;
  assert.equal(dust(),keep,'nothing used by any refused Done');assert.equal(card.flags[ID].enchant.status,'requested');
  // a failed card update after the materials were used does not lose the work or throw
  failMessageUpdate=true;const out=await api.resolveEnchantRequest(card,'done',{confirm:false});failMessageUpdate=false;
  assert.equal(out.ok,true);assert.equal(dust(),keep-1,'materials were used once');
});
test('a request needs a bring item only when the character has none: the filter is advisory, other gear is allowed',async()=>{
  ench.items.get('edust').system.quantity=9;
  game.user=alice;
  const out=await api.requestEnchanting(ench,'REC-TEST-WARD',{confirm:false,itemId:'ecloak'});
  assert.equal(out.ok,true);const card=chats.at(-1);assert.equal(card.flags[ID].enchant.item.name,'Traveler’s Cloak');assert.equal(card.flags[ID].enchant.materials[0].quantity,2);
  assert.match(card.content,/<strong>Bring:<\/strong> a worn item — <em>Traveler’s Cloak<\/em>/);
  const none=await api.requestEnchanting(ench,'REC-TEST-WARD',{confirm:false});
  assert.equal(chats.at(-1).flags[ID].enchant.item.name,'Traveler’s Cloak','no itemId: the first match is used');assert.equal(none.ok,true);
  const odd=await api.requestEnchanting(ench,'REC-TEST-GLOW',{confirm:false,itemId:'esword'});
  assert.equal(odd.ok,true);assert.equal(chats.at(-1).flags[ID].enchant.item.name,'Old Sword','the GM decides whether a sword will do');
  game.user=gm;
});
test('Done on a two-material recipe uses both and is verified before anything is written',async()=>{
  game.user=alice;await api.requestEnchanting(ench,'REC-TEST-WARD',{confirm:false,itemId:'ecloak'});const card=chats.at(-1);game.user=gm;
  const left=dust();
  const out=await api.resolveEnchantRequest(card,'done',{confirm:false});
  assert.equal(out.ok,true);assert.equal(dust(),left-2);
  // the request in the GM-applied path never touches Items other than the materials
  assert.deepEqual(ench.items.map(i=>i.id).filter(i=>i!=='edust'),['eprof','edag','esword','ecloak']);
});
test('a Ledger older than this version cannot be confused with the new one: gm_applied recipes still count as activities with their ingredients readable',()=>{
  const r=normalizeRecipe({id:'REC-TEST-GLOW',name:'G',sourceDefinition:glow});
  assert.equal(r.kind,'activity');assert.equal(r.ingredients.length,1,'ingredients are kept so Done can use them up');assert.equal(r.hasStructuredIngredients,true);
});
test('the GM’s buttons on the card run the same API: Done uses the materials, Decline… asks for a reason; both buttons lock while it works',async()=>{
  ench.items.get('edust').system.quantity=5;
  game.user=alice;FakeDialog.answer={item:'edag',mode:'0'};await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});FakeDialog.answer=true;
  const card=chats.at(-1);
  let slot=decorate(card,gm);
  slot.done.fn.click({preventDefault(){}});
  assert.equal(slot.done.disabled,true);assert.equal(slot.decline.disabled,true,'both locked while it works');
  await settle();
  assert.equal(card.flags[ID].enchant.status,'done');assert.equal(dust(),4);
  // Decline… through its button
  game.user=alice;FakeDialog.answer={item:'edag',mode:'0'};await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});FakeDialog.answer=true;
  const card2=chats.at(-1);slot=decorate(card2,gm);
  FakeDialog.answer={reason:'Busy'};slot.decline.fn.click({preventDefault(){}});await settle();FakeDialog.answer=true;
  assert.equal(card2.flags[ID].enchant.status,'declined');assert.equal(card2.flags[ID].enchant.reason,'Busy');assert.equal(dust(),4);
  // Cancelling the Done confirmation re-enables the buttons
  game.user=alice;FakeDialog.answer={item:'edag',mode:'0'};await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'});
  const card3=chats.at(-1);slot=decorate(card3,gm);FakeDialog.answer=false;slot.done.fn.click({preventDefault(){}});await settle();FakeDialog.answer=true;
  assert.equal(card3.flags[ID].enchant.status,'requested');assert.equal(slot.done.disabled,false);assert.equal(slot.decline.disabled,false);
  game.user=gm;
});
