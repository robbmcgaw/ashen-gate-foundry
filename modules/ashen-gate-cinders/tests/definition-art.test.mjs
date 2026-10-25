import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Definition-level art stages (0.13.0): the pure rules, the editor wording, and the wiring in the source. The live Forge window is proved by hand.
import {cleanOverrides,withOverride,resolveStages,matchDefinition,isCinderDefinitionId,DEFINITION_ART_SETTING} from '../scripts/definition-art.mjs';
import {editorHtml,draftFromStages} from '../scripts/stage-editor.mjs';

const S=(prefix,...ats)=>ats.map((at,i)=>({art:`ashen-gate/cinders/[TEST]-${prefix}${i+1}.webp`,at}));
const DEFS=[{id:'MUT-TEST-ECHO',name:'Echo Cinder'},{id:'MUT-TEST-EMBER',name:'Ember'},{id:'MUT-TEST-TWIN-A',name:'Twin'},{id:'MUT-TEST-TWIN-B',name:'Twin Cinder'}];

test('order of stages for one Cinder: its own, then the GM\'s stage art, then the imported record, then nothing',()=>{
  const own=S('own',0,2),world=S('w',0,3,6),record=S('r',0,4);
  assert.deepEqual(resolveStages({own,override:world,record}),{stages:own,source:'cinder'});
  assert.deepEqual(resolveStages({override:world,record}),{stages:world,source:'world'});
  assert.deepEqual(resolveStages({record}),{stages:record,source:'definition'});
  assert.deepEqual(resolveStages({}),{stages:null,source:null});
  assert.equal(resolveStages({own:S('x',5,7),override:world}).source,'world','a broken list reads as none and falls through');
});
test('stored map: keyed by the permanent id; broken entries are ignored; other definitions are kept',()=>{
  const raw={'MUT-TEST-ECHO':S('e',0,3),'echo':S('b',0,3),'MUT-TEST-BAD':S('c',1,3),'MUT-TEST-ONE':S('d',0),'MUT-TEST-ARR':'x'};
  assert.deepEqual(Object.keys(cleanOverrides(raw)),['MUT-TEST-ECHO']);
  for(const bad of [null,undefined,[],'x',5])assert.deepEqual(cleanOverrides(bad),{});
  const m=withOverride(raw,'MUT-TEST-EMBER',S('m',0,2));
  assert.deepEqual(Object.keys(m).sort(),['MUT-TEST-ECHO','MUT-TEST-EMBER']);
  assert.deepEqual(Object.keys(withOverride(m,'MUT-TEST-ECHO',null)),['MUT-TEST-EMBER'],'null removes only that Cinder');
  assert.equal(DEFINITION_ART_SETTING,'definitionArtStages');assert.equal(isCinderDefinitionId('MUT-ECHO'),true);assert.equal(isCinderDefinitionId('NPC-ECHO'),false);
});
test('which Cinder a key means: a permanent id, or a name with or without "Cinder"; no guessing',()=>{
  assert.equal(matchDefinition(DEFS,'MUT-TEST-ECHO'),'MUT-TEST-ECHO');
  assert.equal(matchDefinition(DEFS,'echo'),'MUT-TEST-ECHO');assert.equal(matchDefinition(DEFS,'Echo Cinder'),'MUT-TEST-ECHO');assert.equal(matchDefinition(DEFS,' EMBER '),'MUT-TEST-EMBER');
  assert.throws(()=>matchDefinition(DEFS,'Twin'),/More than one Cinder is called Twin/);
  assert.throws(()=>matchDefinition(DEFS,'Frost'),/No Cinder named Frost is in this world/);
  assert.throws(()=>matchDefinition(DEFS,'MUT-TEST-NOPE'),/not in this world/);
  assert.throws(()=>matchDefinition(DEFS,''),/Choose a Cinder/);assert.throws(()=>matchDefinition(DEFS,'Cinder'),/No Cinder named/);
});
test('the editor says which stages it edits: a whole Cinder, or one bearer\'s copy',()=>{
  const d=draftFromStages(S('a',0,3));
  const kind=editorHtml(d,{source:'definition',scope:'kind',definitionHas:true}),bound=editorHtml(d,{source:'definition',definitionHas:true});
  assert.match(kind,/every bearer/);assert.match(editorHtml(d,{source:'cinder',scope:'kind',definitionHas:true}),/Use the imported stages/);assert.doesNotMatch(kind,/gives this Cinder its own copy/);
  assert.match(bound,/gives this Cinder its own copy/);assert.match(editorHtml(d,{source:'cinder',definitionHas:true}),/Use the definition(&#39;|')s stages/);
  assert.match(editorHtml(d,{source:'cinder',scope:'kind',definitionHas:false}),/Remove these stages/);
});
test('wiring: GM-only API on api.cinder, a world setting, bearers refreshed, no player path',()=>{
  const rt=fs.readFileSync(new URL('../scripts/cinder-runtime.mjs',import.meta.url),'utf8');
  assert.match(rt,/setArt,stages:stagesInfo,setArtStages,setStageHold,getDefinitionArtStages,setDefinitionArtStages,/);
  for(const fn of ['getDefinitionArtStages','setDefinitionArtStages']){
    const body=rt.slice(rt.indexOf(`function ${fn}(`)>=0?rt.indexOf(`function ${fn}(`):rt.indexOf(`async function ${fn}(`));
    assert.match(body.slice(0,120),/requireGM\(\)/,`${fn} refuses non-GMs in the data layer`);
  }
  assert.match(rt,/register\(module,DEFINITION_ART_SETTING,\{scope:'world',config:false,type:Object,default:\{\}\}\)/);
  assert.match(rt,/stagesOf=inst=>resolveStages\(\{own:inst\.artStages,override:overrideStages\(inst\.definitionId\),record:recordStages\(inst\.definitionId\)\}\)\.stages/);
  assert.match(rt,/await mirrorSockets\(updated\);changed\('stages',updated,\{definition:true\}\)/,'bearers get the new art copy at once');
  assert.match(rt,/stageHold>count/,'a hold past the new count is cleared');
  const mod=JSON.parse(fs.readFileSync(new URL('../module.json',import.meta.url),'utf8'));
  assert.match(mod.version,/^0\./);assert.ok(mod.download.includes(`-v${mod.version}/`));
  assert.ok(fs.readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8').includes(`VERSION='${mod.version}'`));
});
