/** 0.21.0 Vow feature Item. Mocked: data shapes and the data-layer rules, not the live Foundry UI. Synthetic [TEST] data only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertReusableDeitySource,vowBenefit} from '../scripts/source-allowlist.mjs';
import {makeDeity} from '../scripts/deity.mjs';
import {milestoneProjection,sourceDefinition} from '../scripts/core.mjs';
import {pickVowReward,buildVowItemData,bonusKey,vowEffectMatches,expireVowEffects,vowItemsOf} from '../scripts/vow-item.mjs';
import {swearVow,endVow,breakVow,getVow,ensureVowItems,attachVowToggle} from '../scripts/vow.mjs';
const MOD='ashen-gate-factions',src=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
let n=0;const newId=()=>String(++n).padStart(16,'x');
const gm={id:'gm',isGM:true},p1={id:'p1'},p2={id:'p2'};
const ben=(applies,extra={})=>({name:'Vow of [TEST]',bonus:'1d4',applies_to:applies,uses:{max:1,recovery:'lr'},summary:'Once per Long Rest, add 1d4.',requirement:'Keep the test.',...extra});
const reward=(b,extra={})=>({id:'rw-T-1',key:'rw_t_1',audience:'individual',milestone_id:'RENOWN-T-M1',name:'Seeker',teaser:'t',description:'d',kind:'custom',behavior:'passive',usage_limit:0,tags:['vow'],vow_benefit:b,...extra});
// Fixture table: one per shape the content uses.
const FIX={
  skill:ben([{kind:'skill',key:'inv'}]),
  twoSkills:ben([{kind:'skill',key:'ath'},{kind:'skill',key:'acr'}]),
  saveCond:ben([{kind:'save',key:'wis',condition:'against being Frightened'}]),
  save:ben([{kind:'save',key:'con'}]),
  check:ben([{kind:'check',key:'str'}]),tool:ben([{kind:'tool',key:'thief'}]),attack:ben([{kind:'attack',key:'any'}])
};
function actor(id='A1',owners=['p1']){
  const items=[],effects=[],flags={};
  const doc=(coll,data)=>({id:data._id??newId(),...structuredClone(data),getFlag(m,k){return this.flags?.[m]?.[k]}});
  return {id,name:id,items,effects,flags:{[MOD]:{}},
    getFlag(m,k){return this.flags[m]?.[k]},async setFlag(m,k,v){(this.flags[m]??={})[k]=structuredClone(v)},async unsetFlag(m,k){delete this.flags[m]?.[k]},
    testUserPermission(u){return owners.includes(u.id)},
    async createEmbeddedDocuments(t,rows){if(t!=='Item')throw Error('only items');for(const r of rows)items.push(doc(items,r));return rows},
    async deleteEmbeddedDocuments(t,ids){const c=t==='Item'?items:effects;for(const id of ids){const i=c.findIndex(x=>x.id===id);if(i>=0)c.splice(i,1)}}};
}
const dataFor=(b,deityId='DEITY-T',name='[TEST] God')=>buildVowItemData({deityId,godName:name,symbol:'assets/t.webp',reward:reward(b),benefit:b,moduleId:MOD,newId});
const ownItem=(a,name='Other')=>a.items.push({id:newId(),name,getFlag:()=>undefined,flags:{}});

test('Item data: one feat, uses 1 per Long Rest, one utility activity consuming 1 use linked to the one effect',()=>{
  const d=dataFor(FIX.skill);
  assert.equal(d.type,'feat');assert.equal(d.name,'Vow of [TEST]');assert.equal(d.img,'assets/t.webp');
  assert.deepEqual(d.system.uses,{max:'1',spent:0,recovery:[{period:'lr',type:'recoverAll'}]});
  const acts=Object.values(d.system.activities);assert.equal(acts.length,1);const a=acts[0];
  assert.equal(a.type,'utility');assert.equal(a.name,'Invoke your Vow');assert.equal(a._id,Object.keys(d.system.activities)[0]);assert.equal(a._id.length,16);
  assert.deepEqual(a.consumption.targets,[{type:'itemUses',target:'',value:'1',scaling:{mode:''}}]);
  assert.equal(d.effects.length,1);assert.deepEqual(a.effects,[{_id:d.effects[0]._id}]);assert.equal(d.effects[0]._id.length,16);
  const e=d.effects[0];assert.equal(e.transfer,false);assert.deepEqual(e.duration,{value:1,units:'hours'});
  assert.deepEqual(e.changes,[{key:'system.skills.inv.roll.bonus',type:'add',value:'+1d4',phase:'initial',priority:20}]);
  assert.deepEqual(d.flags[MOD].vowItem,{deityId:'DEITY-T',rewardId:'rw-T-1'});assert.equal(e.flags[MOD].vowEffect.deityId,'DEITY-T');
  assert.match(d.system.description.value,/Once per Long Rest/);assert.match(d.system.description.value,/Keep the test\./);
});
test('per-kind dnd5e 6.0.6 keys, two skills in one effect, save with a condition shown honestly',()=>{
  assert.equal(bonusKey({kind:'skill',key:'acr'}),'system.skills.acr.roll.bonus');
  assert.equal(bonusKey({kind:'tool',key:'thief'}),'system.tools.thief.roll.bonus');
  assert.equal(bonusKey({kind:'save',key:'wis'}),'system.abilities.wis.save.roll.bonus');
  assert.equal(bonusKey({kind:'check',key:'str'}),'system.abilities.str.check.roll.bonus');
  assert.equal(bonusKey({kind:'attack'}),'system.rolls.attack.bonus');assert.throws(()=>bonusKey({kind:'x'}));
  const two=dataFor(FIX.twoSkills);assert.equal(two.effects.length,1);assert.deepEqual(two.effects[0].changes.map(c=>c.key),['system.skills.ath.roll.bonus','system.skills.acr.roll.bonus']);
  assert.equal(vowEffectMatches(two.effects[0].flags[MOD].vowEffect.applies_to,{kind:'skill',key:'acr'}),true);
  assert.equal(vowEffectMatches(two.effects[0].flags[MOD].vowEffect.applies_to,{kind:'skill',key:'ste'}),false);
  assert.equal(vowEffectMatches(two.effects[0].flags[MOD].vowEffect.applies_to,{kind:'save',key:'ath'}),false);
  const sv=dataFor(FIX.saveCond);assert.equal(sv.effects[0].changes[0].key,'system.abilities.wis.save.roll.bonus');
  assert.match(sv.system.description.value,/Use only against being Frightened: Foundry cannot tell what a roll is against/);
  assert.doesNotMatch(dataFor(FIX.save).system.description.value,/Use only/);
  assert.equal(dataFor(FIX.attack).effects[0].changes[0].key,'system.rolls.attack.bonus');
  assert.equal(vowEffectMatches([{kind:'attack',key:'any'}],{kind:'attack',key:''}),true);
});
test('swear creates exactly one Item; repeat is idempotent; a manually deleted one is recreated',async()=>{
  const a=actor();ownItem(a);
  let r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:dataFor(FIX.skill)});
  assert.equal(r.item,true);assert.equal(vowItemsOf(a,MOD).length,1);assert.equal(a.items.length,2,'other Items are never touched');
  r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:dataFor(FIX.skill)});
  assert.equal(r.changed,false);assert.equal(r.item,false);assert.equal(vowItemsOf(a,MOD).length,1);
  a.items.splice(a.items.findIndex(i=>i.getFlag(MOD,'vowItem')),1);
  r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:dataFor(FIX.skill)});
  assert.equal(r.item,true);assert.equal(vowItemsOf(a,MOD).length,1);
  assert.deepEqual(a.getFlag(MOD,'vowLog').map(x=>x.event),['sworn']);
});
test('swap replaces the Item (and an applied effect); end and break remove them; other Items stay',async()=>{
  const a=actor();ownItem(a);
  await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-A',unlocked:true,itemData:dataFor(FIX.skill,'DEITY-A')});
  a.effects.push({id:'fx1',getFlag:(m,k)=>k==='vowEffect'?{deityId:'DEITY-A',applies_to:[{kind:'skill',key:'inv'}]}:undefined});
  await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-B',unlocked:true,itemData:dataFor(FIX.save,'DEITY-B')});
  const mine=vowItemsOf(a,MOD);assert.equal(mine.length,1);assert.equal(mine[0].flags[MOD].vowItem.deityId,'DEITY-B');assert.equal(a.effects.length,0);assert.equal(a.items.length,2);
  assert.deepEqual(a.getFlag(MOD,'vowLog').map(x=>x.event),['sworn','replaced']);
  await endVow({moduleId:MOD,actor:a,user:p1});assert.equal(vowItemsOf(a,MOD).length,0);assert.equal(a.items.length,1);
  await swearVow({moduleId:MOD,actor:a,user:gm,deityId:'DEITY-B',unlocked:true,itemData:dataFor(FIX.save,'DEITY-B')});
  const writes=[];await breakVow({moduleId:MOD,actor:a,user:gm,score:5,writePiety:async(...x)=>writes.push(x)});
  assert.equal(vowItemsOf(a,MOD).length,0);assert.equal(getVow(a,MOD),null);assert.equal(writes.length,1);assert.equal(a.getFlag(MOD,'vowLog').at(-1).event,'broken');
});
test('no vow_benefit yet: the Vow is still sworn, no Item is made',async()=>{
  const a=actor();const r=await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:null});
  assert.equal(r.changed,true);assert.equal(vowItemsOf(a,MOD).length,0);
  assert.equal(pickVowReward([reward(undefined)]),null);assert.equal(pickVowReward([reward({bonus:'x'})]),null);assert.equal(pickVowReward([reward(ben([{kind:'skill',key:'zzz'}]),{vow_benefit:ben([{kind:'bogus',key:'a'}])})]),null);
  assert.equal(pickVowReward(null),null);assert.equal(pickVowReward([reward(FIX.skill,{tags:[]})]),null);
  assert.equal(pickVowReward([reward(FIX.skill)],'RENOWN-OTHER'),null);assert.ok(pickVowReward([reward(FIX.skill)],'RENOWN-T-M1'));
});
test('permissions are enforced in the data layer for Item changes',async()=>{
  const a=actor();
  await assert.rejects(swearVow({moduleId:MOD,actor:a,user:p2,deityId:'D',unlocked:true,itemData:dataFor(FIX.skill)}),/owner or the GM/);assert.equal(a.items.length,0);
  await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:dataFor(FIX.skill)});
  await assert.rejects(endVow({moduleId:MOD,actor:a,user:p2}),/owner or the GM/);assert.equal(vowItemsOf(a,MOD).length,1);
  await assert.rejects(breakVow({moduleId:MOD,actor:a,user:p1,score:3,writePiety:async()=>{}}),/Only the GM/);assert.equal(vowItemsOf(a,MOD).length,1);
  await assert.rejects(swearVow({moduleId:MOD,actor:null,user:gm,deityId:'D',unlocked:true}),/Select a character/);
});
test('migration: a sworn Vow without an Item gets one; re-running changes nothing; no data, no Item',async()=>{
  const a=actor('A1'),b=actor('B1'),c=actor('C1'),d=actor('D1');
  await a.setFlag(MOD,'vow',{deity_id:'DEITY-T',sworn_at:null});await b.setFlag(MOD,'vow',{deity_id:'DEITY-NONE',sworn_at:null});
  await d.setFlag(MOD,'vow',{deity_id:'DEITY-T',sworn_at:null});await d.createEmbeddedDocuments('Item',[dataFor(FIX.skill)]);
  const forGod=(act,id)=>id==='DEITY-T'?dataFor(FIX.skill):null;
  assert.deepEqual(await ensureVowItems([a,b,c,d],MOD,forGod),['A1']);
  assert.equal(vowItemsOf(a,MOD).length,1);assert.equal(vowItemsOf(b,MOD).length,0);assert.equal(vowItemsOf(c,MOD).length,0);assert.equal(vowItemsOf(d,MOD).length,1);
  assert.deepEqual(await ensureVowItems([a,b,c,d],MOD,forGod),[]);assert.equal(getVow(a,MOD).deity_id,'DEITY-T');
  assert.match(src,/ensureVowItems\(vowActors,MODULE_ID,vowItemData\)/);
});
test('the applied effect ends after a matching roll only, and only Renown effects are considered',async()=>{
  const a=actor();const fx=(id,flag)=>({id,getFlag:(m,k)=>k==='vowEffect'?flag:undefined});
  a.effects.push(fx('v1',{deityId:'D',applies_to:[{kind:'skill',key:'ath'},{kind:'skill',key:'acr'}]}),{id:'other',getFlag:()=>undefined});
  assert.equal(await expireVowEffects(a,MOD,{kind:'skill',key:'ste'}),0);assert.equal(await expireVowEffects(a,MOD,{kind:'save',key:'ath'}),0);assert.equal(a.effects.length,2);
  assert.equal(await expireVowEffects(a,MOD,{kind:'skill',key:'acr'}),1);assert.deepEqual(a.effects.map(e=>e.id),['other']);
  for(const h of ['rollSkill','rollToolCheck','rollAbilityCheck','rollSavingThrow','rollAttack'])assert.match(src,new RegExp(`'dnd5e\\.${h}'`));
});
test('allowlist accepts the vow_benefit shapes and rejects anything else; other unknown fields still rejected',()=>{
  for(const b of Object.values(FIX))assert.doesNotThrow(()=>vowBenefit(b));
  const bad=[{...FIX.skill,extra:1},{...FIX.skill,bonus:'d4'},{...FIX.skill,bonus:'1d4+1'},{...FIX.skill,name:'x'.repeat(81)},{...FIX.skill,summary:'x'.repeat(401)},{...FIX.skill,requirement:'x'.repeat(301)},
    {...FIX.skill,applies_to:[]},{...FIX.skill,applies_to:Array(5).fill({kind:'skill',key:'inv'})},{...FIX.skill,applies_to:[{kind:'skill',key:'str'}]},{...FIX.skill,applies_to:[{kind:'save',key:'inv'}]},
    {...FIX.skill,applies_to:[{kind:'spell',key:'x'}]},{...FIX.skill,applies_to:[{kind:'skill',key:'inv',x:1}]},{...FIX.skill,applies_to:[{kind:'save',key:'wis',condition:'x'.repeat(201)}]},
    {...FIX.skill,uses:{max:0,recovery:'lr'}},{...FIX.skill,uses:{max:10,recovery:'lr'}},{...FIX.skill,uses:{max:1.5,recovery:'lr'}},{...FIX.skill,uses:{max:1,recovery:'week'}},{...FIX.skill,uses:{max:1,recovery:'lr',x:1}},
    {...FIX.skill,uses:undefined},null,[],'x'];
  for(const b of bad)assert.throws(()=>vowBenefit(b),undefined,JSON.stringify(b)?.slice(0,60));
  const deity=(r)=>{const d=makeDeity({id:'DEITY-QA-V',trackId:'RENOWN-QA-V',name:'[TEST] God'});d.rewards=[r];return sourceDefinition(d);};
  const m=makeDeity({id:'DEITY-QA-V',trackId:'RENOWN-QA-V',name:'[TEST] God'}).individual_track.milestones[0].id;
  const ok=deity(reward(FIX.twoSkills,{milestone_id:m}));assert.deepEqual(ok.rewards[0].vow_benefit,FIX.twoSkills);assert.doesNotThrow(()=>assertReusableDeitySource(ok));
  const nope=structuredClone(ok);nope.rewards[0].surprise=1;assert.throws(()=>assertReusableDeitySource(nope),/unclassified field surprise/);
  const nope2=structuredClone(ok);nope2.rewards[0].vow_benefit.extra=1;assert.throws(()=>assertReusableDeitySource(nope2),/unclassified field extra/);
});
test('vow_benefit is hidden until the rank is reached, and a passive reward with no limit still gets the toggle',()=>{
  const d=makeDeity({id:'DEITY-QA-V',trackId:'RENOWN-QA-V',name:'[TEST] God'}),m=d.individual_track.milestones[0];
  d.rewards=[reward(FIX.skill,{milestone_id:m.id})];
  const hidden=milestoneProjection({faction:d,scope:'individual',score:-1});
  assert.equal(hidden[0].rewards[0].vow_benefit,undefined);
  const shown=milestoneProjection({faction:d,scope:'individual',score:m.threshold});
  assert.deepEqual(shown[0].rewards[0].vow_benefit,FIX.skill);assert.equal(shown[0].rewards[0].canClaim,false,'passive: no Request service button');
  const ms=attachVowToggle(shown,{show:true,sworn:false,deityId:d.id});
  assert.ok(ms[0].vowToggle);assert.equal(ms[1]?.vowToggle,undefined);
  assert.equal(attachVowToggle(shown,{show:false})[0].vowToggle,undefined);
  assert.equal(milestoneProjection({faction:d,scope:'individual',score:m.threshold,gm:true})[0].rewards[0].vow_benefit.name,'Vow of [TEST]');
});
test('importing a deity never touches the actor: the Vow flag and Item survive',async()=>{
  const a=actor();await swearVow({moduleId:MOD,actor:a,user:p1,deityId:'DEITY-T',unlocked:true,itemData:dataFor(FIX.skill)});
  const before=JSON.stringify([a.flags,a.items]);
  const {planImport,IMPORT_SCHEMA}=await import('../scripts/import.mjs');
  const d=makeDeity({id:'DEITY-T',trackId:'RENOWN-T',name:'[TEST] God'});planImport({schema_version:IMPORT_SCHEMA,definitions:[sourceDefinition(d)]},new Set(['DEITY-T']),{});
  assert.equal(JSON.stringify([a.flags,a.items]),before);
  assert.doesNotMatch(readFileSync(new URL('../scripts/import.mjs',import.meta.url),'utf8'),/game\.actors|\.vow\b/);
});
