// 0.17.0: crafting awards the linked 2024 core item (Manager Core Links), else today's world item. Logic only, mocked Foundry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {craftResultData,coreResultData,coreLinkOf,LEDGER_SCOPE} from '../scripts/crafting.mjs';

const M='ashen-gate-manager';
const world=(link)=>({_id:'w1',name:"[TEST] Field Medic's Salve",type:'consumable',img:'icons/ag.webp',folder:'F1',ownership:{default:0},
  system:{quantity:1,description:{value:'<p>AG</p>'}},flags:{[M]:{source:{sourceId:'ITEM-TEST-SALVE',entityType:'Item'},...(link?{coreLink:link}:{})}}});
const coreItem={_id:'c1',name:'Potion of Healing',type:'consumable',img:'icons/core.webp',folder:'X',system:{quantity:3,rarity:'common',description:{value:'<p>Core</p>'}},flags:{plutonium:{source:'XDMG'}}};
const link={uuid:'Item.c1',name:'Potion of Healing',adopted:false};
const ids={recipeId:'REC-TEST-SALVE',resultId:'ITEM-TEST-SALVE'};

test('linked + setting on: a fresh copy of the core item, AG name/id/Manager flags kept', async()=>{
  const out=await craftResultData(world(link),{...ids,awardCore:true,loadCore:async uuid=>uuid==='Item.c1'?structuredClone(coreItem):null});
  assert.equal(out.core,true);
  const d=out.data;
  assert.equal(d.name,"[TEST] Field Medic's Salve");
  assert.equal(d.img,'icons/core.webp');
  assert.equal(d.system.description.value,'<p>Core</p>');
  assert.equal(d.system.quantity,1);
  assert.equal(d._id,undefined);assert.equal(d.folder,undefined);
  assert.equal(d.flags[M].source.sourceId,'ITEM-TEST-SALVE');
  assert.equal(d.flags[M].coreLink.uuid,'Item.c1');
  assert.deepEqual(d.flags[LEDGER_SCOPE],{entityType:'Item',sourceId:'ITEM-TEST-SALVE',craftedFrom:'REC-TEST-SALVE',coreItem:true});
});

test('falls back to the world item: unlinked, setting off, core missing, core cannot stack, loader throws', async()=>{
  const load=async()=>structuredClone(coreItem);
  for(const [w,opts,note] of [[world(null),{awardCore:true,loadCore:load},''],[world(link),{awardCore:false,loadCore:load},/off/],
    [world(link),{awardCore:true,loadCore:async()=>null},/missing/],[world(link),{awardCore:true,loadCore:async()=>({...coreItem,system:{}})},/cannot stack/],
    [world(link),{awardCore:true,loadCore:async()=>{throw Error('x');}},/missing/]]){
    const out=await craftResultData(w,{...ids,...opts});
    assert.equal(out.core,false);
    assert.equal(out.data.img,'icons/ag.webp');
    assert.equal(out.data.flags[LEDGER_SCOPE].sourceId,'ITEM-TEST-SALVE');
    if(note)assert.match(out.note,note);
  }
});

test('a crafted core item carries the AG id the Ledger stacks by; coreLinkOf reads the Manager link', ()=>{
  const data=coreResultData(world(link),coreItem,ids);
  // heldResult() matches flags['ashen-gate-manager'].source.sourceId, then the Ledger flag.
  assert.equal(data.flags[M].source.sourceId,'ITEM-TEST-SALVE');
  assert.equal(coreLinkOf(world(link)).uuid,'Item.c1');
  assert.equal(coreLinkOf(world(null)),null);
});

test('GM Setup has the setting, default on, saved with Save Changes', ()=>{
  const src=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
  assert.match(src,/register\(ID,CORE_AWARD_SETTING,\{[^}]*type:Boolean,default:true/);
  assert.match(src,/data-core-award/);
  assert.match(src,/craftResultData\(result,\{[^}]*awardCore:awardCoreItems\(\)/);
});
