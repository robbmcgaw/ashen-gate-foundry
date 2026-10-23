// 0.18.2 Recipe (REC-*) and material (MAT-*) item rewards in quest files. Mocked Foundry: proves validation, resolution,
// the grant copy and the Ledger's recipe detection on that copy, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,validSource,planQuestImport,publicView} from '../scripts/core.mjs';
import {saveRecord,getPrivate,previewQuestImport,importQuests} from '../scripts/store.mjs';
import {grantableRewards,grantRewards,updateReward} from '../scripts/rewards.mjs';
import {classify,agSourceId} from '../../ashen-gate-profession-ledger/scripts/core.mjs';
import {canLearnRecipe} from '../../ashen-gate-profession-ledger/scripts/progression.mjs';

const QID='QUEST-TEST-RECIPE-REWARD';
const REC='REC-TEST-FIELD-TONIC',MAT='MAT-TEST-IRON-ORE',ITEM='ITEM-TEST-LANTERN';
const quest=item_rewards=>({id:QID,entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},
 visibility:'player',refs:[],name:'[TEST] Recipe reward',source:{},public_summary:'[TEST]',objectives:[{key:'one',goal:'One'}],locations:[],parameters:{},
 outcomes:{description:'[TEST]',item_rewards}});
const pkg=records=>({schema_version:'ag-quest-source/0.1',records});
const rewards=()=>[{item_id:REC,recipient:'each',visibility:'shown'},{item_id:MAT,quantity:3},{item_id:ITEM}];
// The Ledger's held-recipe check (profession-ledger main.js heldRecipeItems), using its own exported helpers.
const ledgerSeesRecipe=item=>classify(item)==='Recipe'&&/^REC-[A-Z0-9-]+$/.test(agSourceId(item)??'')&&Number(item.system?.quantity??0)>0;

function setup(){
 const docs=[];let id=0,seq=0;
 const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false},bob={id:'bob',isGM:false};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async f=>{for(const [k,v] of Object.entries(f))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v] of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.default>=2||this.ownership?.[user.id]>=2;}}
 globalThis.JournalEntry={create:async data=>{const j=new Doc(data);docs.push(j);return j;}};
 const mkItem=(iid,{type='loot',quantity=1,name,parent=null,flags={},system={}}={})=>{
  const data={_id:iid,name,img:`icons/${iid}.webp`,type,flags,folder:null,ownership:{default:0},system:{...system,quantity}};
  return {documentName:'Item',id:iid,name,img:data.img,type,flags,parent,pack:null,system:data.system,
   uuid:parent?`${parent.uuid}.Item.${iid}`:`Item.${iid}`,toObject:()=>structuredClone(data)};};
 const managed=(sourceId,entityType)=>({'ashen-gate-manager':{source:{sourceId,entityType,visibility:'player',status:'approved'}}});
 const recipe=mkItem('rec',{name:'[TEST] Recipe: Field Tonic',flags:managed(REC,'Recipe'),system:{description:{value:'[TEST]'}}});
 const ore=mkItem('ore',{name:'[TEST] Iron Ore',flags:managed(MAT,'Material')});
 const lantern=mkItem('lantern',{name:'[TEST] Lantern',type:'equipment',flags:managed(ITEM,'Item')});
 const worldItems=[recipe,ore,lantern];
 const mkActor=(aid,name,owner)=>{
  const items=[];items.get=i=>items.find(x=>x.id===i);
  const a={documentName:'Actor',id:aid,name,uuid:`Actor.${aid}`,items,flags:{},testUserPermission:(u)=>u.isGM||u.id===owner,
   createEmbeddedDocuments:async(type,data)=>data.map(d=>{const it=mkItem(d._id,{parent:a,type:d.type,quantity:d.system.quantity,name:d.name,flags:d.flags,system:d.system});items.push(it);return it;}),
   deleteEmbeddedDocuments:async(type,ids)=>{for(const i of ids){const at=items.findIndex(x=>x.id===i);if(at>=0)items.splice(at,1);}}};
  return a;};
 const aria=mkActor('aria','Aria','alice'),bram=mkActor('bram','Bram','bob');
 const actors=[aria,bram];actors.get=i=>actors.find(a=>a.id===i)??null;
 globalThis.game={user:gm,users:[gm,alice,bob],journal:docs,actors,items:{contents:worldItems},folders:[],packs:{get:()=>null},modules:{get:()=>null}};
 globalThis.foundry={utils:{randomID:(n=16)=>`R${String(++seq).padStart(n-1,'0')}`.slice(0,n)}};
 globalThis.fromUuid=async()=>null;
 globalThis.ChatMessage={create:async m=>m};
 return {aria,bram,recipe,worldItems};
}

test('item_id accepts ITEM-*, REC-* and MAT-* ids; other prefixes, uuids and duplicates are still refused',()=>{
 assert.ok(validSource(quest(rewards())));
 for(const [list,msg] of [
  [[{item_id:'PERK-TEST-A'}],'outcomes.item_rewards[0]: item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'PROF-TEST-A'}],'item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'REC-test-a'}],'item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'Item.abc123'}],'item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:REC,uuid:'Item.x'}],'Use item_id, not a Foundry uuid.'],
  [[{item_id:REC},{item_id:REC}],`[1]: duplicate item_id ${REC}.`],
 ])assert.throws(()=>validSource(quest(list)),e=>e.message.startsWith(`${QID}: `)&&e.message.includes(msg),msg);
});

test('import notes and Manager hand-off preview name REC/MAT rewards like ITEM ones',()=>{
 assert.deepEqual(planQuestImport(pkg([quest(rewards())])).notes,[REC,MAT,ITEM].map(id=>`${QID}: item reward ${id} must be imported as an Item (in this file or already in the world).`));
 const w=setup();
 assert.deepEqual(previewQuestImport(pkg([quest(rewards())])).warnings,[]);
 w.worldItems.splice(0,1);
 assert.deepEqual(previewQuestImport(pkg([quest(rewards())])).warnings,[`${QID}: item reward ${REC} has no matching item in this world yet. Import the item first; the quest still imports.`]);
});

test('a REC reward resolves to the world recipe Item, is given one copy per character with its source flags, and the Ledger can learn it',async()=>{
 const t=setup();
 await importQuests(pkg([quest(rewards())]));
 const st=structuredClone(getPrivate(QID).getFlag(MOD,'state'));st.status='Completed';
 await saveRecord(getPrivate(QID).getFlag(MOD,'source'),{state:st,replace:true});
 const list=await grantableRewards(QID);
 const row=list.find(r=>r.itemId===REC);
 assert.equal(row.status,'ok');assert.equal(row.name,'[TEST] Recipe: Field Tonic');assert.equal(row.uuid,'Item.rec');
 assert.equal(list.find(r=>r.itemId===MAT).name,'[TEST] Iron Ore');
 const res=await grantRewards(QID,{[`def:${REC}`]:{give:true,actorIds:['aria','bram']}});
 assert.ok(res.results.every(r=>r.ok),JSON.stringify(res.results));
 for(const actor of [t.aria,t.bram]){
  const copies=actor.items.filter(i=>agSourceId(i)===REC);
  assert.equal(copies.length,1,'one copy per character');
  const copy=copies[0];
  assert.equal(copy.system.quantity,1);
  assert.deepEqual(copy.flags['ashen-gate-manager'],t.recipe.flags['ashen-gate-manager'],'Manager source flags intact');
  assert.equal(copy.flags[MOD].reward.rewardKey,`def:${REC}`);
  assert.ok(ledgerSeesRecipe(copy),'Ledger lists it under Recipes to learn');
  assert.deepEqual(canLearnRecipe(actor,copy,agSourceId(copy)),{ok:true});
 }
 assert.equal(t.recipe.system.quantity,1,'the world recipe Item is untouched');
 // Players see name, picture and quantity only.
 const view=publicView(getPrivate(QID).getFlag(MOD,'source'),getPrivate(QID).getFlag(MOD,'state'),{itemById:id=>{const i=t.worldItems.find(x=>agSourceId(x)===id);return i?{name:i.name,img:i.img}:null;}});
 assert.deepEqual(view.rewards[0],{name:'[TEST] Recipe: Field Tonic',img:'icons/rec.webp',quantity:1});
 assert.doesNotMatch(JSON.stringify(view.rewards),/REC-|MAT-|Item\./);
});

test('reimport in update mode keeps the GM change and the grant on a REC reward',async()=>{
 setup();
 await importQuests(pkg([quest(rewards())]));
 await updateReward(QID,`def:${REC}`,{quantity:2});
 const doc=getPrivate(QID),st=structuredClone(doc.getFlag(MOD,'state'));
 st.rewards.grants=[{grantId:'g-1',at:0,by:'gm',lines:[{rewardKey:`def:${REC}`,round:1,actorId:'aria',quantity:2,itemIds:['x'],status:'granted'}]}];
 await doc.update({[`flags.${MOD}.state`]:st});
 assert.deepEqual((await importQuests(pkg([quest(rewards())]),{mode:'update'})).updated,[QID]);
 const after=getPrivate(QID).getFlag(MOD,'state');
 assert.deepEqual(after.rewards.overrides[`def:${REC}`],{quantity:2});
 assert.equal(after.rewards.grants.length,1);
});
