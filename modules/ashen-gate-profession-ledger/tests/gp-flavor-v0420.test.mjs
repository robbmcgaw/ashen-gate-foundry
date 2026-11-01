// 0.42.0: recipes may carry the display-only `additional_gp_flavor`; the Ledger shows "75 gp (ash and vials)" wherever it shows a
// recipe's additional gold cost (recipe cards in every list, the Craft / Complete / Request dialogs, the craft chat card, the enchant
// request card and the GM's Done confirmation) and exactly as before when there is no flavor or the amount is 0. Cost maths and payment
// are untouched. Mocked Foundry: logic and markup only, not the live UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {normalizeRecipe} from '../scripts/core.mjs';
import {cleanGpFlavor,gpText,GP_FLAVOR_MAX} from '../scripts/recipe-text.mjs';
import {requestRecord} from '../scripts/enchanting.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const ID='ashen-gate-profession-ledger';

test('gpText / cleanGpFlavor: "75 gp (ash and vials)" with a usable flavor, exactly "75 gp" otherwise',()=>{
  assert.equal(gpText(75,'ash and vials'),'75 gp (ash and vials)');
  assert.equal(gpText(75,'  ash   and\nvials '),'75 gp (ash and vials)','whitespace collapsed');
  for(const none of [undefined,null,'','   ',42,{},['x'],true])assert.equal(gpText(75,none),'75 gp',`no flavor: ${JSON.stringify(none)}`);
  assert.equal(GP_FLAVOR_MAX,40);
  assert.equal(cleanGpFlavor('x'.repeat(40)),'x'.repeat(40),'40 characters is the limit');
  assert.equal(cleanGpFlavor('x'.repeat(41)),null,'longer than the contract allows: ignored, never cut mid-word');
  assert.equal(gpText(75,'x'.repeat(41)),'75 gp');
});
test('requestRecord keeps the flavor only with a fee; the normalized recipe keeps the stored definition untouched',()=>{
  const base={actor:{id:'a',name:'A'},recipe:{id:'REC-X',name:'X'},item:null,materials:[]};
  assert.equal(requestRecord({...base,fee:30,feeFlavor:'ash and vials'}).feeFlavor,'ash and vials');
  assert.equal(requestRecord({...base,fee:null,feeFlavor:'ash and vials'}).feeFlavor,null);
  assert.equal(requestRecord({...base,fee:30}).feeFlavor,null);
  assert.equal(requestRecord({...base,fee:30,feeFlavor:'y'.repeat(80)}).feeFlavor,null);
  const n=normalizeRecipe({id:'REC-TEST-A',name:'A',sourceDefinition:{id:'REC-TEST-A',entity_type:'Recipe',additional_gp:75,additional_gp_flavor:'ash and vials'}});
  assert.equal(n.sourceDefinition.additional_gp_flavor,'ash and vials');assert.equal(n.sourceDefinition.additional_gp,75);
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
const glow=def('REC-TEST-GLOW','Recipe',{name:'[TEST] Glow Etching',kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',tier:'apprentice',effort:'long',additional_gp:30,additional_gp_flavor:'ash and vials',
  ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}],bring:{text:'a dagger',item_types:['weapon'],categories:[],base_items:['dagger']},effect_note:'The dagger sheds dim light in a 10-foot radius while unsheathed.',
  rules_summary:'Bring a dagger. The GM adds the effect to it; nothing new is made.'});
const ward=def('REC-TEST-WARD','Recipe',{name:'[TEST] Faint Ward',kind:'activity',gm_applied:true,profession_id:'PROF-TEST-ENCH',tier:'apprentice',effort:'short',workstation:'Enchanting Chamber',additional_gp:15,additional_gp_flavor:'<b onclick=x>"&</b>',
  ingredients:[{material_id:'MAT-TEST-DUST',quantity:2}],bring:{text:'a worn item',item_types:['equipment','loot']},effect_note:'Once per Long Rest, add +1 to a failed save.'});
const chalk=def('REC-TEST-CHALK','Recipe',{name:'[TEST] Chalk',profession_id:'PROF-TEST-ENCH',result_item_id:'ITEM-TEST-CHALK',tier:'apprentice',effort:'short',additional_gp:75,additional_gp_flavor:'ash and vials',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}]});
const craft=(id,name,extra)=>def(id,'Recipe',{name,profession_id:'PROF-TEST-ENCH',result_item_id:'ITEM-TEST-CHALK',tier:'apprentice',effort:'short',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}],...extra});
const tea=craft('REC-TEST-TEA','[TEST] Plain Tea',{additional_gp:20});
const zero=craft('REC-TEST-ZERO','[TEST] Zero Cost',{additional_gp:0,additional_gp_flavor:'should not show'});
const longf=craft('REC-TEST-LONG','[TEST] Long Flavor',{additional_gp:10,additional_gp_flavor:'a very long description of what this gold pays for'});
const maxf=craft('REC-TEST-MAX','[TEST] Max Flavor',{additional_gp:11,additional_gp_flavor:'x'.repeat(40)});
const jest=def('REC-TEST-JEST','Recipe',{name:'[TEST] Painted Jest',kind:'activity',profession_id:'PROF-TEST-ENCH',tier:'apprentice',effort:'short',additional_gp:12,additional_gp_flavor:'stage paint',ingredients:[{material_id:'MAT-TEST-DUST',quantity:1}]});
const world=[
  ...[tea,zero,longf,maxf,jest].map(r=>worldDoc(`w${r.id}`,`Recipe: ${r.name}`,src(r.id,'Recipe',{definition:r}))),
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
const ench=makeActor('ench','[TEST] Enchanter','u1',[profItem('eprof','[TEST] Enchanting','PROF-TEST-ENCH'),held('edust','[TEST] Dust',src('MAT-TEST-DUST','Material'),12),weapon('edag','Fine Dagger','dagger'),weapon('esword','Old Sword','longsword'),held('ecloak','Traveler’s Cloak',{},1,{type:'equipment'})],
  ['REC-TEST-GLOW','REC-TEST-WARD','REC-TEST-CHALK','REC-TEST-TEA','REC-TEST-ZERO','REC-TEST-LONG','REC-TEST-MAX','REC-TEST-JEST'],{skills:{arc:{value:1,total:5}},tools:{},abilities:{int:{mod:3}}});
const poor=makeActor('poor','[TEST] Poor','u2',[profItem('pprof','[TEST] Enchanting','PROF-TEST-ENCH'),weapon('pdag','Dagger','dagger')],['REC-TEST-GLOW'],{skills:{arc:{value:0,total:1}},tools:{},abilities:{int:{mod:1}}});
const bare=makeActor('bare','[TEST] Bare','u2',[profItem('bprof','[TEST] Enchanting','PROF-TEST-ENCH'),held('bdust','[TEST] Dust',src('MAT-TEST-DUST','Material'),1)],['REC-TEST-GLOW'],{skills:{arc:{value:0,total:1}},tools:{},abilities:{int:{mod:1}}});
const actors=[ench,poor,bare];
const mod={active:true,version:'0.44.0',get api(){return api},set api(v){api=v}};
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

// ---- recipe cards, every list ---------------------------------------------------------------------------------------
const htmlView=async(view,actorId='ench')=>{app.view=view;app.actorId=actorId;return (await app._prepareContext({})).html;};
const gpLines=row=>[...row.matchAll(/<small class="agl-sub">((?:Fee|Also costs)[^<]*)<\/small>/g)].map(m=>m[1]);
const checkCards=(h,who)=>{
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Chalk')),['Also costs 75 gp (ash and vials) (not deducted automatically)'],`${who}: with a flavor`);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Glow Etching')),['Fee: 30 gp (ash and vials) (the GM collects it)'],`${who}: enchantment fee with a flavor`);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Plain Tea')),['Also costs 20 gp (not deducted automatically)'],`${who}: without a flavor, exactly as before`);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Zero Cost')),[],`${who}: amount 0 shows no cost line and no flavor`);
  assert.doesNotMatch(h,/should not show/);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Long Flavor')),['Also costs 10 gp (not deducted automatically)'],`${who}: a flavor over 40 characters is ignored, never cut`);
  assert.doesNotMatch(h,/a very long description/);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Max Flavor')),[`Also costs 11 gp (${'x'.repeat(40)}) (not deducted automatically)`],`${who}: 40 characters is shown in full`);
  const ward=gpLines(cardOf(h,'[TEST] Faint Ward'))[0];
  assert.equal(ward,'Fee: 15 gp (&lt;b onclick=x&gt;&quot;&amp;&lt;/b&gt;) (the GM collects it)',`${who}: markup in the flavor is escaped as text`);
  assert.doesNotMatch(h,/<b onclick/);
  assert.deepEqual(gpLines(cardOf(h,'[TEST] Painted Jest')),['Also costs 12 gp (stage paint) (not deducted automatically)'],`${who}: an activity`);
};
test('Individual recipe cards (player): flavor, none, amount 0, long, 40-character, HTML, activity',async()=>{
  game.user=alice;checkCards(await htmlView('individual'),'individual');
});
test('Recipe Catalog (GM) and Party tab use the same card text',async()=>{
  game.user=gm;
  checkCards(await htmlView('catalog'),'catalog');
  checkCards(await htmlView('party'),'party');
  game.user=alice;checkCards(await htmlView('party'),'party (player)');
  game.user=gm;
});
test('a stored definition without the field shows nothing extra; the catalog data and cost maths are unchanged',async()=>{
  const n=normalizeRecipe({id:'REC-TEST-TEA',name:'T',sourceDefinition:tea});
  assert.equal(n.sourceDefinition.additional_gp_flavor,undefined);assert.equal(n.sourceDefinition.additional_gp,20);
  const flavored=normalizeRecipe({id:'REC-TEST-CHALK',name:'C',sourceDefinition:chalk});
  assert.equal(flavored.sourceDefinition.additional_gp,75,'the amount is never touched by the flavor');
});

// ---- dialogs and chat cards ----------------------------------------------------------------------------------------
const gpItems=content=>[...content.matchAll(/<li>((?:Also costs|Fee:)[^<]*)<\/li>/g)].map(m=>m[1]);
test('Craft dialog and craft chat card print the flavor; a recipe without one is unchanged',async()=>{
  game.user=alice;dialogs.length=0;chats.length=0;
  FakeDialog.answer={mode:'0',check:undefined};
  const out=await _test.performAction('craft',{id:'REC-TEST-CHALK',actorId:'ench'});
  assert.equal(out?.ok,true,out?.message);
  assert.deepEqual(gpItems(dialogs.at(-1).content),['Also costs 75 gp (ash and vials) — not deducted automatically.'],'Craft dialog');
  const card=chats.at(-1).content;
  assert.match(card,/also lists 75 gp \(ash and vials\) of additional cost \(not deducted automatically\)\./,'crafted chat card');
  dialogs.length=0;chats.length=0;
  assert.equal((await _test.performAction('craft',{id:'REC-TEST-TEA',actorId:'ench'}))?.ok,true);
  assert.deepEqual(gpItems(dialogs.at(-1).content),['Also costs 20 gp — not deducted automatically.']);
  assert.match(chats.at(-1).content,/also lists 20 gp of additional cost \(not deducted automatically\)\./);
  dialogs.length=0;chats.length=0;
  assert.equal((await _test.performAction('craft',{id:'REC-TEST-ZERO',actorId:'ench'}))?.ok,true);
  assert.deepEqual(gpItems(dialogs.at(-1).content),[],'amount 0: no line');assert.doesNotMatch(chats.at(-1).content,/additional cost|should not show/);
  dialogs.length=0;chats.length=0;
  assert.equal((await _test.performAction('craft',{id:'REC-TEST-LONG',actorId:'ench'}))?.ok,true);
  assert.deepEqual(gpItems(dialogs.at(-1).content),['Also costs 10 gp — not deducted automatically.'],'long flavor ignored');
  FakeDialog.answer=true;
});
test('Complete activity dialog prints the flavor', async()=>{
  game.user=alice;dialogs.length=0;
  FakeDialog.answer={mode:'0',check:undefined};
  const out=await _test.performAction('complete-activity',{id:'REC-TEST-JEST',actorId:'ench'});
  assert.equal(out?.ok,true,out?.message);
  assert.deepEqual(gpItems(dialogs.at(-1).content),['Also costs 12 gp (stage paint) — not deducted automatically.']);
  FakeDialog.answer=true;
});
test('Request enchanting dialog, request card and Done confirmation print the flavor; HTML in it is escaped everywhere',async()=>{
  game.user=alice;dialogs.length=0;chats.length=0;
  FakeDialog.answer={item:'edag',mode:'0',check:undefined};
  assert.equal((await _test.performAction('request-enchanting',{id:'REC-TEST-GLOW',actorId:'ench'}))?.ok,true);
  assert.deepEqual(gpItems(dialogs.at(-1).content),['Fee: 30 gp (ash and vials) — the GM collects it.'],'request dialog');
  const req=chats.at(-1);
  assert.equal(req.flags[ID].enchant.fee,30);assert.equal(req.flags[ID].enchant.feeFlavor,'ash and vials');
  assert.match(req.content,/Fee: 30 gp \(ash and vials\), collected by the GM \(not deducted automatically\)\./,'request card');
  game.user=gm;dialogs.length=0;
  FakeDialog.answer=true;
  assert.equal((await api.resolveEnchantRequest(req,'done'))?.ok,true);
  assert.match(dialogs.at(-1).content,/collect the 30 gp \(ash and vials\) fee\./,'Done confirmation');
  // Markup in a flavor never reaches the markup unescaped (dialog and card).
  game.user=alice;dialogs.length=0;chats.length=0;
  FakeDialog.answer={item:'ecloak',mode:'0',check:undefined};
  assert.equal((await _test.performAction('request-enchanting',{id:'REC-TEST-WARD',actorId:'ench'}))?.ok,true,'ward request');
  const esc2='&lt;b onclick=x&gt;&quot;&amp;&lt;/b&gt;';
  assert.deepEqual(gpItems(dialogs.at(-1).content),[`Fee: 15 gp (${esc2}) — the GM collects it.`]);
  assert.doesNotMatch(dialogs.at(-1).content,/<b onclick/);
  assert.match(chats.at(-1).content,new RegExp(`Fee: 15 gp \\(${esc2.replace(/[()]/g,'\\$&')}\\), collected by the GM`));
  assert.doesNotMatch(chats.at(-1).content,/<b onclick/);
  FakeDialog.answer=true;game.user=gm;
});
