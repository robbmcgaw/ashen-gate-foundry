import test from 'node:test';
import assert from 'node:assert/strict';
import {createObjectiveConsumer} from '../scripts/resolver-consumer.mjs';
const META=(id='QUEST-EXAMPLE')=>({sourceId:id,entityType:'Objective',status:'approved',sourceVersion:'1.0.0',provenance:{sources:['synthetic']},visibility:'player',refs:[],definition:{objective_kind:id.split('-')[0]==='ORDER'?'work_order':id.split('-')[0]==='CONTRACT'?'contract':'quest'}});
const SRC=(id='QUEST-EXAMPLE')=>({id,entity_type:'Objective',objective_kind:id.startsWith('ORDER-')?'work_order':id.startsWith('CONTRACT-')?'contract':'quest',status:'approved',version:'1.0.0'});
const STATE=(id='QUEST-EXAMPLE')=>({id,entity_type:'Objective',objective_kind:'quest',status:'Active',scope:'party',objectives:[{key:'one',goal:'Public'}],locationIds:[]});
function env({gm=true,manager=false,local=null,natives=[],projection=null,managerResult=null}={}){
 const game={user:{isGM:gm},journal:natives,items:[],actors:[],tables:[],macros:[]};
 let calls=0;
 const owner=createObjectiveConsumer({game,localSource:id=>local?.id===id?local:null,visibleProjection:id=>projection?.id===id?{view:projection}:null,
 managerApi:()=>manager?{contract:'ag-definition-resolver/0.1-prototype',resolve:()=>{calls++;return managerResult??{status:'ok'};}}:null});
 return {game,owner,calls:()=>calls};
}
function doc(id='QUEST-EXAMPLE',{archived=false,kind='Objective',status='approved',name='UNTRUSTED DISPLAY NAME'}={}){
 return {uuid:'JournalEntry.Synthetic1',name,flags:{'ashen-gate-manager':{source:{...META(id),entityType:kind,status},lifecycle:{archived}}}};
}
test('exact source ID + logical type resolves native Manager projection with Manager enabled',()=>{
 const e=env({natives:[doc()],manager:true});const r=e.owner.resolveObjective('QUEST-EXAMPLE',{entityType:'Objective'});
 assert.equal(r.status,'ok');assert.equal(r.binding.uuid,'JournalEntry.Synthetic1');assert.equal(r.binding.entityType,'Objective');assert.equal(e.calls(),1);
});
test('exact same binding resolves with Manager absent/disabled',()=>{
 const r=env({natives:[doc()],manager:false}).owner.resolveObjective('QUEST-EXAMPLE',{entityType:'Objective'});
 assert.equal(r.status,'ok');assert.equal(r.binding.uuid,'JournalEntry.Synthetic1');
});
test('display-name fallback explicitly rejected',()=>{
 const r=env({natives:[doc('QUEST-REAL',{name:'QUEST-GUESS'})]}).owner.resolveObjective('QUEST-GUESS');
 assert.equal(r.status,'not_found');
});
test('logical type mismatch is not silently coerced from Foundry JournalEntry',()=>{
 const r=env({natives:[doc()]}).owner.resolveObjective('QUEST-EXAMPLE',{entityType:'Faction'});assert.equal(r.status,'type_mismatch');
});
test('native logical type mismatch fails closed',()=>{
 const r=env({natives:[doc('QUEST-EXAMPLE',{kind:'Item'})]}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'type_mismatch');
});
test('multiple world bindings return conflict, do not pick first',()=>{
 const r=env({natives:[doc(),doc()]}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'conflict');
});
test('archived Manager projection is ignored',()=>{
 const r=env({natives:[doc('QUEST-EXAMPLE',{archived:true})]}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'not_found');
});
test('archived duplicate does not conflict with active source',()=>{
 const r=env({natives:[doc(),doc('QUEST-EXAMPLE',{archived:true})]}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'ok');
});
test('Manager resolver explicitly reports conflict',()=>{
 const r=env({manager:true,natives:[doc()],managerResult:{status:'conflict'}}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'conflict');
});
test('native source + independent Quest-owned domain copy fails closed',()=>{
 const r=env({local:SRC(),natives:[doc()]}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'conflict');
});
test('Quest-owned source resolves without any Manager',()=>{
 const r=env({local:SRC()}).owner.resolveObjective('QUEST-EXAMPLE');assert.deepEqual(r.binding,{id:'QUEST-EXAMPLE',entityType:'Objective',kind:'domain',providerId:'ashen-gate-quest-manager',recordKey:'QUEST-EXAMPLE',version:'1.0.0'});
});
test('source lifecycle inactive is separate from Active player campaign state',()=>{
 const x=SRC();x.status='retired';const r=env({local:x,projection:STATE()}).owner.resolveObjective('QUEST-EXAMPLE');assert.equal(r.status,'inactive');
});
test('source version mismatch reported to GM only',()=>{
 const r=env({local:SRC()}).owner.resolveObjective('QUEST-EXAMPLE',{expectedVersion:'3.0.0'});assert.equal(r.status,'stale');
});
test('player with a permission-safe published projection resolves sanitized data',()=>{
 const e=env({gm:false,projection:STATE(),natives:[doc('QUEST-EXAMPLE',{status:'approved'})]});const r=e.owner.resolveObjective('QUEST-EXAMPLE');
 assert.equal(r.status,'ok');assert.equal(r.binding.kind,'domain');assert.equal(r.view.status,'Active');assert.equal(r.view.objectives.length,1);
});
test('player cannot infer GM source via direct API without permitted published projection',()=>{
 const e=env({gm:false,natives:[doc()]});assert.deepEqual(e.owner.resolveObjective('QUEST-EXAMPLE'),{status:'not_found'});
});
test('player cannot infer hidden record through type probing',()=>{
 const e=env({gm:false,natives:[doc()]});assert.deepEqual(e.owner.resolveObjective('QUEST-EXAMPLE',{entityType:'Faction'}),{status:'not_found'});
});
test('player cannot infer Manager conflicts through direct API',()=>{
 const e=env({gm:false,natives:[doc(),doc()]});assert.deepEqual(e.owner.resolveObjective('QUEST-EXAMPLE'),{status:'not_found'});
});
test('player cannot infer a reveal-gated Manager doc without Quest publish',()=>{
 const j=doc();j.flags['ashen-gate-manager'].source.visibility='reveal_gated';const e=env({gm:false,natives:[j]});assert.deepEqual(e.owner.resolveObjective('QUEST-EXAMPLE'),{status:'not_found'});
});
test('player scope/typed variant cannot be spoofed with a mismatched projection',()=>{
 const v={...STATE(),objective_kind:'contract'};const e=env({gm:false,projection:v});assert.equal(e.owner.resolveObjective('QUEST-EXAMPLE').status,'not_found');
});
test('invalid ID does not trigger best-effort name match',()=>{
 const e=env({natives:[doc()]});assert.equal(e.owner.resolveObjective('Quest Example').status,'invalid_id');
});
test('Player Access Hidden blocks direct consumer read of otherwise published view',()=>{
 const game={user:{id:'p',isGM:false}};
 const c=createObjectiveConsumer({game,localSource:()=>null,visibleProjection:()=>({view:STATE()}),playerAccessEnabled:()=>false});
 assert.deepEqual(c.resolveObjective('QUEST-EXAMPLE'),{status:'not_found'});
});
test('duplicate domain source reader fails closed with explicit GM conflict',()=>{
 const game={user:{isGM:true},journal:[],items:[],actors:[],tables:[],macros:[]};
 const c=createObjectiveConsumer({game,localSource:()=>{throw new Error('Duplicate Quest source ID');},visibleProjection:()=>null});
 assert.equal(c.resolveObjective('QUEST-EXAMPLE').status,'conflict');
});

test('native Manager kind must match permanent ID variant',()=>{const j=doc();j.flags['ashen-gate-manager'].source.definition.objective_kind='contract';assert.equal(env({natives:[j]}).owner.resolveObjective('QUEST-EXAMPLE').status,'type_mismatch');});
test('native Manager Objective without structured kind is not guessed',()=>{const j=doc();delete j.flags['ashen-gate-manager'].source.definition;assert.equal(env({natives:[j]}).owner.resolveObjective('QUEST-EXAMPLE').status,'invalid_metadata');});
