// 0.13.0 Imported item rewards (rewards brief Q3). Mocked Foundry: proves validation, notes, warnings and reimport, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MOD,validSource,planQuestImport,exportPackage,rewardRows,publicView} from '../scripts/core.mjs';
import {saveRecord,getPrivate,previewQuestImport,importQuests} from '../scripts/store.mjs';
import {updateReward,grantableRewards} from '../scripts/rewards.mjs';
import {rewardsSection} from '../scripts/rewards-ui.mjs';

const example=JSON.parse(fs.readFileSync(new URL('../docs/fixtures/item-rewards/quest-item-rewards.json',import.meta.url),'utf8'));
const quest=(...arg)=>{const r=structuredClone(example.records[0]);if(arg.length){if(arg[0]===undefined)delete r.outcomes.item_rewards;else r.outcomes.item_rewards=arg[0];}return r;};
const pkg=records=>({schema_version:'ag-quest-source/0.1',records});

test('validSource: item_rewards accept/refuse matrix, each error names the quest and the entry',()=>{
 assert.ok(validSource(quest()));
 assert.ok(validSource(quest(undefined)),'absent is valid');
 assert.ok(validSource(quest([])));
 assert.ok(validSource(quest([{item_id:'ITEM-TEST-A',quantity:3,visibility:'shown',recipient:'split',note:'x'.repeat(300)}])));
 const bad=[
  [[{item_id:'ITEM-TEST-A',uuid:'Item.x'}],'outcomes.item_rewards[0]: Use item_id, not a Foundry uuid.'],
  [[{item_id:'ITEM-TEST-A',quantity:0}],'[0]: quantity must be a whole number'],
  [[{item_id:'ITEM-TEST-A',quantity:1.5}],'[0]: quantity must be a whole number'],
  [[{item_id:'ITEM-TEST-A'},{item_id:'ITEM-TEST-B',visibility:'later'}],'[1]: visibility must be'],
  [[{item_id:'ITEM-TEST-A',recipient:'party'}],'[0]: recipient must be'],
  [[{item_id:'ITEM-TEST-A'},{item_id:'ITEM-TEST-A'}],'[1]: duplicate item_id ITEM-TEST-A'],
  [[{item_id:'ITEM-TEST-A',rarity:'rare'}],'[0]: unknown key "rarity"'],
  [[{item_id:'PERK-TEST-A'}],'[0]: item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'REC-'}],'[0]: item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'rec-test-a'}],'[0]: item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{quantity:2}],'[0]: item_id must be an ITEM-*, REC-* or MAT-* id.'],
  [[{item_id:'ITEM-TEST-A',note:'x'.repeat(301)}],'[0]: note must be text'],
  [['ITEM-TEST-A'],'[0] must be an object'],
  [{item_id:'ITEM-TEST-A'},'outcomes.item_rewards must be a list'],
  [Array.from({length:51},(_,i)=>({item_id:`ITEM-TEST-N${i}`})),'51 entries (at most 50)'],
 ];
 for(const [list,msg] of bad)assert.throws(()=>validSource(quest(list)),e=>e.message.startsWith('QUEST-TEST-BEAST-OF-THE-FEN: ')&&e.message.includes(msg),msg);
 assert.ok(validSource(quest(Array.from({length:50},(_,i)=>({item_id:`ITEM-TEST-N${i}`})))));
});

test('planQuestImport: one note per distinct item id; errors block',()=>{
 const other=quest([{item_id:'ITEM-TEST-HEALING-DRAUGHT'},{item_id:'ITEM-TEST-LANTERN'}]);other.id='QUEST-TEST-OTHER';
 const plan=planQuestImport(pkg([quest(),other]));
 assert.deepEqual(plan.errors,[]);
 assert.deepEqual(plan.notes,[
  'QUEST-TEST-BEAST-OF-THE-FEN: item reward ITEM-TEST-HEALING-DRAUGHT must be imported as an Item (in this file or already in the world).',
  'QUEST-TEST-BEAST-OF-THE-FEN: item reward ITEM-TEST-RUSTED-BLADE must be imported as an Item (in this file or already in the world).',
  'QUEST-TEST-OTHER: item reward ITEM-TEST-LANTERN must be imported as an Item (in this file or already in the world).']);
 const bad=planQuestImport(pkg([quest([{item_id:'ITEM-TEST-A',uuid:'x'}])]));
 assert.match(bad.errors[0],/Use item_id, not a Foundry uuid/);assert.deepEqual(bad.notes,[]);
 assert.deepEqual(planQuestImport(pkg([quest(undefined)])).notes,[]);
});

test('export round-trips item_rewards unchanged',()=>{
 const out=exportPackage([quest()]);
 assert.deepEqual(out.records[0].outcomes.item_rewards,example.records[0].outcomes.item_rewards);
 assert.deepEqual(planQuestImport(out).errors,[]);
});

function setup(worldItems=[]){
 const docs=[];let id=0;
 const gm={id:'gm',isGM:true};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async f=>{for(const [k,v] of Object.entries(f))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v] of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.default>=2;}}
 globalThis.JournalEntry={create:async data=>{const j=new Doc(data);docs.push(j);return j;}};
 const actors=[];actors.get=()=>null;
 globalThis.game={user:gm,users:[gm],journal:docs,actors,items:{contents:worldItems},folders:[],packs:{get:()=>null}};
 globalThis.foundry={utils:{randomID:n=>'R'.repeat(n)}};
 globalThis.fromUuid=async()=>null;
 return {docs};
}
const bound=(itemId,name)=>({documentName:'Item',id:itemId.toLowerCase(),name,img:`icons/${itemId}.webp`,uuid:`Item.${itemId.toLowerCase()}`,flags:{'ashen-gate-manager':{source:{sourceId:itemId}}},system:{}});

test('previewQuestImport and importQuests warn about item ids with no world binding; the quest still imports',async()=>{
 setup([bound('ITEM-TEST-HEALING-DRAUGHT','[TEST] Healing Draught')]);
 const prev=previewQuestImport(pkg([quest()]));
 assert.deepEqual(prev.errors,[]);
 assert.deepEqual(prev.warnings,['QUEST-TEST-BEAST-OF-THE-FEN: item reward ITEM-TEST-RUSTED-BLADE has no matching item in this world yet. Import the item first; the quest still imports.']);
 const report=await importQuests(pkg([quest()]));
 assert.deepEqual(report.created,['QUEST-TEST-BEAST-OF-THE-FEN']);assert.equal(report.warnings.length,1);
 setup([bound('ITEM-TEST-HEALING-DRAUGHT','a'),bound('ITEM-TEST-RUSTED-BLADE','b')]);
 assert.deepEqual(previewQuestImport(pkg([quest()])).warnings,[]);
 assert.deepEqual((await importQuests(pkg([quest()]))).warnings,[]);
});

test('reimport in update mode keeps reward overrides and grants; a dropped id keeps its history as "No longer in the quest"',async()=>{
 setup([bound('ITEM-TEST-HEALING-DRAUGHT','[TEST] Healing Draught'),bound('ITEM-TEST-RUSTED-BLADE','[TEST] Rusted Blade')]);
 await importQuests(pkg([quest()]));
 const id='QUEST-TEST-BEAST-OF-THE-FEN';
 await updateReward(id,'def:ITEM-TEST-HEALING-DRAUGHT',{quantity:5});
 const doc=getPrivate(id),st=structuredClone(doc.getFlag(MOD,'state'));
 st.rewards.grants=[{grantId:'g-1',at:0,by:'gm',lines:[{rewardKey:'def:ITEM-TEST-RUSTED-BLADE',round:1,actorId:'aria',quantity:1,itemIds:['x'],status:'granted'}]}];
 await doc.update({[`flags.${MOD}.state`]:st});
 const report=await importQuests(pkg([quest([{item_id:'ITEM-TEST-HEALING-DRAUGHT',quantity:2}])]),{mode:'update'});
 assert.deepEqual(report.updated,[id]);
 const after=getPrivate(id).getFlag(MOD,'state');
 assert.deepEqual(after.rewards.overrides['def:ITEM-TEST-HEALING-DRAUGHT'],{quantity:5});
 assert.equal(after.rewards.grants.length,1);
 const src=getPrivate(id).getFlag(MOD,'source');
 const rows=rewardRows(src,after);
 assert.deepEqual(rows.map(r=>[r.key,r.quantity,!!r.gone]),[['def:ITEM-TEST-HEALING-DRAUGHT',5,false],['def:ITEM-TEST-RUSTED-BLADE',1,true]]);
 const list=await grantableRewards(id);
 assert.equal(list.find(r=>r.gone).owed,false);
 const html=rewardsSection(list);
 assert.match(html,/<span class="ag-badge" data-tooltip="[^"]+" data-tooltip-class="ag-tooltip">No longer in the quest<\/span>/);
 assert.equal((html.match(/draggable="true"/g)||[]).length,1,'the gone row cannot be dragged out');
 const itemById=i=>({name:i==='ITEM-TEST-HEALING-DRAUGHT'?'[TEST] Healing Draught':'[TEST] Rusted Blade',img:null});
 assert.deepEqual(publicView(src,{...after,status:'Completed'},{itemById}).rewards.map(r=>r.name),['[TEST] Healing Draught'],'the gone row never reaches players');
});

test('the GM note travels to the GM list only; a quest saved with a bad entry before 0.13.0 still publishes',()=>{
 const rows=rewardRows(quest(),{status:'Completed',scope:'party',objectiveReveal:[],progress:{}});
 assert.equal(rows[1].note,'[TEST] If slain.');
 assert.match(rewardsSection(rows.map(r=>({...r,name:r.itemId,status:'ok'}))),/<span class="ag-field__hint">\[TEST\] If slain\.<\/span>/);
 const old=quest([{item_id:'ITEM-TEST-A',uuid:'Item.x'}]);
 const view=publicView(old,{status:'Active',scope:'party',revealed:true,objectiveReveal:[],progress:{}});
 assert.ok(view);assert.doesNotMatch(JSON.stringify(view),/If slain|note/);
});
