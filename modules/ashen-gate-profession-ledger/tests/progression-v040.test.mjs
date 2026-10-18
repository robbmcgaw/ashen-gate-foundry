import test from 'node:test';
import assert from 'node:assert/strict';
import {GATHERING_PROFESSIONS,LEVEL_COSTS,PROGRESSION_SCHEMA,ACCESS_LEVELS,TIERS,
  levelForXP,xpForLevel,tierForLevel,gatherXP,validateProgressState,progressOf,emptyProgress,
  nextProgress,knownRecipesOf,canLearnRecipe,isMaterialAwardCandidate} from '../scripts/progression.mjs';

test('Tim XP thresholds: 5 -> 47, 15 level transitions to level 16',()=>{
 assert.equal(LEVEL_COSTS.length,15);
 assert.deepEqual([...LEVEL_COSTS],[5,8,11,14,17,20,23,26,29,32,35,38,41,44,47]);
 assert.equal(levelForXP(0),1);
 assert.equal(levelForXP(4),1);
 assert.equal(levelForXP(5),2);
 assert.equal(levelForXP(12),2);
 assert.equal(levelForXP(13),3);
 assert.equal(xpForLevel(16),390);
 assert.equal(levelForXP(389),15);
 assert.equal(levelForXP(390),16);
 assert.equal(levelForXP(9999),16);
 assert.throws(()=>levelForXP(-1));
 assert.throws(()=>xpForLevel(17));
});

test('tier gates and gather XP use approved independent Profession levels',()=>{
 assert.deepEqual(ACCESS_LEVELS,{Apprentice:1,Journeyman:4,Expert:7,Artisan:10,Master:13});
 assert.deepEqual(TIERS,['Apprentice','Journeyman','Expert','Artisan','Master']);
 assert.equal(tierForLevel(3),'Apprentice');
 assert.equal(tierForLevel(4),'Journeyman');
 assert.equal(tierForLevel(9),'Expert');
 assert.equal(tierForLevel(16),'Master');
 assert.deepEqual(TIERS.map(gatherXP),[1,2,3,4,5]);
 assert.equal(GATHERING_PROFESSIONS.length,5);
 assert.throws(()=>gatherXP('fictional'));
});

test('actor flags are keyed by stable PROF IDs and leave selected perks alone',()=>{
 const base=emptyProgress();
 const a=nextProgress(base,'PROF-HERBALISM',13);
 assert.deepEqual(base.professions,{});
 assert.equal(a.previousLevel,1);assert.equal(a.level,3);
 assert.equal(a.state.schema,PROGRESSION_SCHEMA);
 assert.equal(a.state.professions['PROF-HERBALISM'].xp,13);
 assert.deepEqual(a.state.professions['PROF-HERBALISM'].selectedPerkIds,[]);
 const b=nextProgress(a.state,'PROF-HERBALISM',1);
 assert.equal(b.level,3);
 const actor={flags:{'ashen-gate-profession-ledger':{professionProgress:b.state}}};
 assert.deepEqual(progressOf(actor,'PROF-HERBALISM'),{id:'PROF-HERBALISM',xp:14,level:3,tier:'Apprentice',selectedPerkIds:[],unspentPerkChoices:3});
 assert.equal(progressOf(actor,'PROF-UNKNOWN'),null);
 assert.throws(()=>nextProgress(base,'NOT-PROF',1));
 assert.throws(()=>nextProgress(base,'PROF-HERBALISM',-1));
 assert.throws(()=>validateProgressState({schema:PROGRESSION_SCHEMA,professions:{'PROF-ABC':{xp:1,selectedPerkIds:['PERK-A','PERK-A']}}}));
});

test('known recipes are Actor-owned immutable IDs, never inferred from catalog',()=>{
 const actor={id:'A',flags:{'ashen-gate-profession-ledger':{knownRecipes:['REC-A','REC-A','garbage','REC-B']}}};
 assert.deepEqual(knownRecipesOf(actor),['REC-A','REC-B']);
 const item={id:'I',system:{quantity:2},flags:{'ashen-gate-manager':{source:{visibility:'player'}}}};
 actor.items=[item];
 assert.deepEqual(canLearnRecipe(actor,item,'REC-A'),{ok:false,reason:'Recipe already learned'});
 assert.equal(canLearnRecipe(actor,item,'REC-C').ok,true);
 assert.equal(canLearnRecipe(actor,{id:'missing',system:{quantity:2}},'REC-C').ok,false);
 item.flags['ashen-gate-manager'].source.visibility='gm';
 assert.equal(canLearnRecipe(actor,item,'REC-C').ok,false);
});

test('material award candidates reject invalid IDs, secret sources and retired definitions',()=>{
 const x={id:'X',type:'loot',flags:{'ashen-gate-manager':{source:{sourceId:'MAT-X',entityType:'Material',visibility:'player',status:'approved'}}}};
 const id=o=>o.flags?.['ashen-gate-manager']?.source?.sourceId;
 assert.equal(isMaterialAwardCandidate(x,id),true);
 x.flags['ashen-gate-manager'].source.visibility='gm';assert.equal(isMaterialAwardCandidate(x,id),false);
 x.flags['ashen-gate-manager'].source.visibility='player';x.flags['ashen-gate-manager'].source.status='retired';assert.equal(isMaterialAwardCandidate(x,id),false);
 x.flags['ashen-gate-manager'].source.status='approved';x.flags['ashen-gate-manager'].source.sourceId='RES-X';assert.equal(isMaterialAwardCandidate(x,id),false);
});
