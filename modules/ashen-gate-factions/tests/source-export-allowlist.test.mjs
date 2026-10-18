/** AG-WORK-0021 source-only regressions. Published v0.6.0 ZIP is unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,sourceDefinition,fieldDisclosure,disclosedField,revealField,extractCampaignDiscovery,overlayCampaign} from '../scripts/core.mjs';
import {assertReusableFactionSource,assertPrivateFieldReveals} from '../scripts/source-allowlist.mjs';
const base=()=>makeFaction({id:'FACTION-QA-ALLOWLIST',trackId:'RENOWN-QA-ALLOWLIST',name:'GM secret',leader:'Private leader',public_role:'Known to some'});
const grant=()=>({mode:'selective',fields:{name:{party:false,actors:['ACTOR-QA-1']},leader:{party:true,actors:[]},public_role:{party:false,actors:[]}}});
const reward=f=>({id:'QA-RW',key:'qa_rw',audience:'group',milestone_id:f.renown_track.milestones[0].id,name:'QA only',teaser:'Test',description:'Test',kind:'custom',tags:[],behavior:'one_time',usage_limit:0});
test('approved v0.1 allowlist: unmodified source exports and validates without state',()=>{
 const clean=sourceDefinition(base());assert.equal(assertReusableFactionSource(clean),clean);
 assert.deepEqual(clean.discovery,{placeholder:false,sharing_enabled:true});
});
test('REGRESSION: unknown top-level campaign fields MUST fail closed on actual sourceDefinition export',()=>{
 const f=base();f.unclassified_campaign_data={privateActorId:'ACTOR-SECRET',renown:900};
 assert.throws(()=>sourceDefinition(f),/Faction: unclassified field unclassified_campaign_data/);
 assert.throws(()=>assertReusableFactionSource(f),/unclassified field unclassified_campaign_data/);
});
test('REGRESSION: nested reward-claim fields MUST fail closed on actual sourceDefinition export',()=>{
 const f=base();f.rewards.push({...reward(f),player_claims:['ACTOR-SECRET']});
 assert.throws(()=>sourceDefinition(f),/Faction\.rewards\[0\]: unclassified field player_claims/);
 const r=base();r.rewards.push({...reward(r),granted_to:'ACTOR-SECRET'});
 assert.throws(()=>sourceDefinition(r),/Faction\.rewards\[0\]: unclassified field granted_to/);
});
test('known legacy campaign state is removed without losing authorized reusable source fields',()=>{
 const f=base();f.state={party:{score:8}};f.field_reveals=grant();f.discovery.party=true;f.discovery.actors=['ACTOR-QA-1'];
 f.entries.push({id:'QA-I',name:'QA info',unlock:'manual',link_mode:'preview',discovered_party:true,discovered_actors:['ACTOR-QA-1']});
 const clean=sourceDefinition(f);assertReusableFactionSource(clean);
 assert.equal(clean.name,f.name);assert.equal(clean.entries[0].name,'QA info');
 for(const key of ['state','field_reveals'])assert.equal(Object.hasOwn(clean,key),false);
 for(const key of ['party','actors'])assert.equal(Object.hasOwn(clean.discovery,key),false);
 for(const key of ['discovered_party','discovered_actors'])assert.equal(Object.hasOwn(clean.entries[0],key),false);
 assert.deepEqual(f.discovery.actors,['ACTOR-QA-1']);
});
test('unknown nested Renown, information, refs and provenance fields are also rejected',()=>{
 for(const apply of [
  f=>{f.renown_track.milestones[0].personalClaim=true;},
  f=>{f.renown_track.campaign_score=10;},
  f=>{f.entries.push({id:'QA-I',name:'Info',unlock:'manual',link_mode:'preview',extra_private_state:true});},
  f=>{f.provenance.unknown_state={secret:true};},
  f=>{f.refs.push({relation:'offers_objective',target_id:'QUEST-QA-TEST',mode:'optional',unrevealed_name:'SECRET'});}
 ]){const f=base();apply(f);assert.throws(()=>sourceDefinition(f),/unclassified field/);}
});
test('approved reveal shape is private; party and Actor grants remain separate',()=>{
 const state=grant();assertPrivateFieldReveals(state);
 const f=base();const withState=overlayCampaign(f,{discovery:{party:false,actors:['ACTOR-QA-1']},field_reveals:state});
 assert.equal(withState.discovery.party,false);assert.deepEqual(withState.discovery.actors,['ACTOR-QA-1']);
 assert.equal(disclosedField(withState,'name',['ACTOR-QA-1'],withState.field_reveals),'GM secret');
 assert.equal(disclosedField(withState,'name',['ACTOR-QA-2'],withState.field_reveals),'');
 assert.equal(disclosedField(withState,'leader',['ACTOR-QA-2'],withState.field_reveals),'Private leader');
 const exported=sourceDefinition(withState);assert.equal(Object.hasOwn(exported,'field_reveals'),false);
 assert.equal(extractCampaignDiscovery(withState).field_reveals.fields.name.party,false);
 const next=revealField(fieldDisclosure(state),'name',{actorId:'ACTOR-QA-2'});
 assert.deepEqual(next.fields.name.actors,['ACTOR-QA-1','ACTOR-QA-2']);
});
test('reject invalid field-reveal Actor duplicates and unknown state keys',()=>{
 const dup=grant();dup.fields.name.actors.push('ACTOR-QA-1');assert.throws(()=>assertPrivateFieldReveals(dup),/duplicate Actor ID/);
 const extra=grant();extra.fields.leader.rewardClaims=['QA'];assert.throws(()=>assertPrivateFieldReveals(extra),/unclassified field/);
});
test('GM definition writers and exporter both use guarded sourceDefinition; no runtime release files edited',()=>{
 const code=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
 assert.match(code,/const clean=sourceDefinition\(record\),f=upgradeFaction\(record\),faults=validateFaction\(clean\)/);
 assert.match(code,/definitions:defs\(\)\.map\(d=>sourceDefinition\(getFaction\(d\)\)\)/);
});

test('legacy document_type is normalized out of source but Item UUID semantics remain available',()=>{
 const f=base();f.rewards.push({...reward(f),kind:'uuid',uuid:'Item.QA-ITEM',document_type:'Item'});
 const clean=sourceDefinition(f);assertReusableFactionSource(clean);
 assert.equal(clean.rewards[0].uuid,'Item.QA-ITEM');
 assert.equal('document_type' in clean.rewards[0],false);
 const code=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
 assert.match(code,/const linkedItem=r=>/);
 assert.match(code,/\.split\('\.'\)\.at\(-2\)==='Item'/);
 assert.doesNotMatch(code,/uuid,document_type:linked\.documentName/);
});
test('unknown keys in typed refs are rejected before legacy upgrade drops them',()=>{
 for(const at of [f=>f.refs,f=>f.renown_track.refs,f=>f.individual_track.refs]){
  const f=base();at(f).push({relation:'offers_objective',target_id:'QUEST-QA-TEST',mode:'optional',unrevealed_name:'SECRET'});
  assert.throws(()=>sourceDefinition(f),/unclassified field unrevealed_name/);
 }
});

test('legacy null optional Journal UUID normalizes to omission, never a player link',()=>{
 const f=base();f.entries.push({id:'QA-PRIVATE',name:'Private',link_mode:'document',unlock:'manual',uuid:null,text:'No public document'});
 const clean=sourceDefinition(f);assertReusableFactionSource(clean);
 assert.equal(Object.hasOwn(clean.entries[0],'uuid'),false);
});
