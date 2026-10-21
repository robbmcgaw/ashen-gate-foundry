import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFaction,validateFaction,sourceDefinition,overlayCampaign,extractCampaignDiscovery,makeGroupRecord,blankStanding,adjustStanding} from '../scripts/core.mjs';
import {OBJECTIVE_RELATIONS,objectiveRefs,addObjectiveRef,removeObjectiveRef,checkObjectiveRefs,validateObjectiveRef} from '../scripts/objective-refs.mjs';
const fresh=()=>makeFaction({id:'FACTION-TEST',trackId:'RENOWN-TEST',name:'Draft Test Faction'});
const offer={relation:'offers_objective',target_id:'QUEST-TEST-001',mode:'optional'};
const assoc={relation:'associated_objective',target_id:'CONTRACT-TEST-001',mode:'required'};
test('typed Objective refs are stable, source-exportable, non-mutating and preserve unrelated refs',()=>{
  const original=fresh(); original.refs=[{relation:'controls_location',target_id:'LOC-TEST',mode:'optional'}];
  const first=addObjectiveRef(original,offer),second=addObjectiveRef(first,assoc);
  assert.equal(original.refs.length,1);
  assert.equal(second.refs.length,3);
  assert.deepEqual(objectiveRefs(second),[offer,assoc]);
  assert.deepEqual(sourceDefinition(second).refs,second.refs);
  assert.equal(validateFaction(second).length,0);
  const removed=removeObjectiveRef(second,offer);
  assert.deepEqual(removed.refs,[original.refs[0],assoc]);
  assert.deepEqual(second.refs,[original.refs[0],offer,assoc]);
});
test('Objective identity and relation validation rejects unsafe/ambiguous references',()=>{
  for(const id of ['QUEST-ALPHA-1','ORDER-ABC','CONTRACT-A0'])assert.deepEqual(validateObjectiveRef({...offer,target_id:id}).target_id,id);
  for(const id of ['JournalEntry.abc','Actor.123','QUEST-', 'QUEST-test', 'QUEST-SECRET/1', 'QUEST-LOREM IPSUM', 'FACTION-ABC', 'QUEST-ABC\\"'])assert.throws(()=>validateObjectiveRef({...offer,target_id:id}));
  for(const relation of ['grants_objective','reveal_objective','for_faction'])assert.throws(()=>validateObjectiveRef({...offer,relation}));
  for(const mode of [undefined,'yes','private',1])assert.throws(()=>validateObjectiveRef({...offer,mode}));
  assert.throws(()=>addObjectiveRef(addObjectiveRef(fresh(),offer),offer),/already exists/);
  assert.ok(checkObjectiveRefs({...fresh(),refs:[offer,offer]}).some(x=>x.includes('Duplicate')));
  assert.ok(validateFaction({...fresh(),refs:[{...offer,mode:'invalid'}]}).some(x=>x.includes('mode')));
  assert.ok(!OBJECTIVE_RELATIONS.includes('reveals_objective'));
});
test('campaign discovery/knowledge, Group standing, and Objective source refs remain separately owned',()=>{
  const f=addObjectiveRef(fresh(),offer);f.discovery.party=true;
  f.entries=[{id:'note1',name:'Rumor',text:'Only GM knows',unlock:'manual',threshold:0,link_mode:'preview',discovered_party:true,discovered_actors:[]}];
  const campaign=extractCampaignDiscovery(f),source=sourceDefinition(f);
  assert.equal(source.discovery.party,undefined);
  assert.equal(source.entries[0].discovered_party,undefined);
  assert.deepEqual(source.refs,[offer]);
  const group=makeGroupRecord({factionId:f.id,standing:blankStanding()});
  group.standing=adjustStanding(group.standing,{delta:4,reason:'Past job',eventId:'RENOWN-EVT-OBJECTIVETEST',when:'2026-10-16'}).standing;
  assert.equal(group.standing.score,4);
  assert.equal(group.standing.events.length,1);
  assert.equal(Object.hasOwn(source,'groupClaims'),false);
  assert.equal(Object.hasOwn(source,'history'),false);
  assert.equal(Object.hasOwn(source,'state'),false);
  const again=overlayCampaign(source,{...group,...campaign});
  assert.equal(again.discovery.party,true);
  assert.equal(again.entries[0].discovered_party,true);
  assert.deepEqual(again.refs,[offer]);
  assert.deepEqual(sourceDefinition(again).refs,[offer]);
});
test('players never receive GM-only Objective refs through faction projections',async()=>{
  const {readFileSync}=await import('node:fs');
  const runtime=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
  const template=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
  const start=runtime.indexOf('function maskedFaction('),end=runtime.indexOf('\nfunction buildPlayerPayload(',start);
  const project=runtime.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.doesNotMatch(project,/refs\s*:/);
  assert.doesNotMatch(project,/objectiveRefs\(/);
  assert.ok(template.indexOf('Related quests and contracts')>template.indexOf('{{#if tabOrgs}}'));
  assert.match(template,/\{\{#if tabOrgs\}\}[\s\S]*\{\{#if detail\}\}[\s\S]*Related quests and contracts/);
  assert.match(runtime,/assertGM\(\);const doc=definition\(this\.#selected\)/);
});
test('theme styling is local and tolerates absent optional appearance controller',async()=>{
  const {readFileSync}=await import('node:fs');const css=readFileSync(new URL('../styles/module.css',import.meta.url),'utf8');
  // Token defaults ship in the shared kit (styles/ag-ui.css, loaded first), so module CSS uses
  // the tokens directly and never redefines them (a local value would block Manager's skin).
  for(const token of ['--ag-surface','--ag-text','--ag-muted','--ag-border','--ag-accent'])assert.ok(css.includes(`var(${token})`),token);
  assert.doesNotMatch(css,/--ag-[a-z-]+\s*:/);
  const kit=readFileSync(new URL('../styles/ag-ui.css',import.meta.url),'utf8');
  for(const token of ['--ag-surface','--ag-text','--ag-accent','--ag-focus'])assert.match(kit,new RegExp(`${token}:\\s*#`));
  assert.doesNotMatch(css,/(^|\})\s*(body|html|:root)\s*\{/);
  assert.match(css,/\.ashen-gate-factions/);
  // Kit tokens only: no legacy aliases, no module re-aliases of kit tokens.
  assert.doesNotMatch(css,/var\(--ag-(?:bg|panel)\)/);
  assert.doesNotMatch(css,/--agf-(?:gold|ink|muted|border)\b/);
});
