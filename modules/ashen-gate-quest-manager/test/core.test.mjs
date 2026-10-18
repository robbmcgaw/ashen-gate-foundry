import test from 'node:test';import assert from 'node:assert/strict';
import {validSource,initialState,validState,publicView,projectionOwnership,accessSignature,normalizePackage,exportPackage,associatedLocationIds,assertGM,assertUI,cleanText} from '../scripts/core.mjs';
const sample=(kind='quest')=>{const prefix={quest:'QUEST',work_order:'ORDER',contract:'CONTRACT'}[kind];return {
 id:prefix+'-TEST-ONE',entity_type:'Objective',objective_kind:kind,status:'draft',version:'0.1.0',provenance:{sources:['synthetic test']},visibility:'player',refs:[{relation:'associated_objective_location',target_id:'LOC-TEST-ONE',mode:'optional'}],name:'Synthetic Test',public_summary:'Visible summary',source:{description:'self'},
 objectives:[{key:'start',goal:'First objective'},{key:'secret',goal:'Secret objective',visibility:'reveal_gated'}],locations:[{target_id:'LOC-TEST-ONE'}],parameters:{},outcomes:{},...(kind==='work_order'?{work_order_domain:'crafting'}:{})};};
test('canonical variants validate',()=>{for(const k of ['quest','work_order','contract'])assert.ok(validSource(sample(k)));});
test('kind cannot cross permanent ID prefix',()=>{const x=sample();x.objective_kind='contract';assert.throws(()=>validSource(x));});
test('typed refs enforce mode/target',()=>{const x=sample();x.refs=[{relation:'at',target_id:'Actor.abc',mode:'optional'}];assert.throws(()=>validSource(x));});
test('source requires authorship and schema metadata',()=>{const x=sample();delete x.provenance;assert.throws(()=>validSource(x));});
test('work order domain required',()=>{const x=sample('work_order');delete x.work_order_domain;assert.throws(()=>validSource(x));});
test('rejects duplicate objective keys',()=>{const x=sample();x.objectives.push({...x.objectives[0]});assert.throws(()=>validSource(x));});
test('new objective Hidden default',()=>{assert.equal(initialState(sample()).status,'Hidden');});
test('individual requires Actor',()=>{assert.throws(()=>initialState(sample(),{scope:'individual'}));});
test('hidden source never generates player Journal',()=>{assert.equal(publicView(sample(),initialState(sample())),null);});
test('GM-only source never published',()=>{const x=sample();x.visibility='gm';const state={...initialState(x),status:'Active'};assert.equal(publicView(x,state),null);});
test('reveal-gated requires GM release',()=>{const x=sample();x.visibility='reveal_gated';const s={...initialState(x),status:'Available'};assert.equal(publicView(x,s),null);s.revealed=true;assert.equal(publicView(x,s).status,'Available');});
test('unrevealed objective and count are hidden',()=>{const x=sample();const s={...initialState(x),status:'Active',gmNotes:'SECRET NOTES'};const v=publicView(x,s);assert.equal(v.objectives.length,1);assert.ok(!JSON.stringify(v).includes('Secret objective'));assert.ok(!JSON.stringify(v).includes('SECRET NOTES'));});
test('independent secret objective reveal',()=>{const x=sample();const s={...initialState(x),status:'Active',objectiveReveal:['secret']};assert.equal(publicView(x,s).objectives.length,2);});
test('state progress visible only for revealed objectives',()=>{const x=sample();const s={...initialState(x),status:'Active',progress:{secret:'complete',start:'failed'}};const view=publicView(x,s);assert.equal(view.objectives.length,1);assert.equal(view.objectives[0].failed,true);});
test('unsafe progress key refused',()=>{const x=sample(),s=initialState(x);s.progress.x='complete';assert.throws(()=>validState(x,s));});
test('party view has no individual Actor identity',()=>{const s={...initialState(sample()),status:'Available'};assert.equal(publicView(sample(),s).actorId,null);});
test('Actor-owned view scoped',()=>{const s={...initialState(sample(),{scope:'individual',actorId:'act01'}),status:'Available'};assert.equal(publicView(sample(),s).actorId,'act01');});
test('party ownership default observer',()=>{const s=initialState(sample());assert.deepEqual(projectionOwnership(s,null,[]),{default:2});});
test('individual ownership is only Actor owners',()=>{const s=initialState(sample(),{scope:'individual',actorId:'act01'}),actor={testUserPermission:(u)=>u.id==='allowed'};assert.deepEqual(projectionOwnership(s,actor,[{id:'allowed'},{id:'denied'}]),{default:0,allowed:2});});
test('private journal docs are never made by projection',()=>{const s=initialState(sample(),{scope:'individual',actorId:'a'});assert.throws(()=>projectionOwnership(s,null,[]));});
test('scope change changes signature; must recreate Journal not merge permissions',()=>{const s=initialState(sample(),{scope:'individual',actorId:'a'});const a=accessSignature(s,{default:0,former:2});const b=accessSignature({...s,scope:'party',actorId:null},{default:2});assert.notEqual(a,b);});
test('owner switch changes signature, revoking former owner',()=>{const s=initialState(sample(),{scope:'individual',actorId:'a'});assert.notEqual(accessSignature(s,{default:0,userA:2}),accessSignature({...s,actorId:'b'},{default:0,userB:2}));});
test('export+import no loss',()=>{const rows=[sample(),sample('contract')];assert.deepEqual(normalizePackage(exportPackage(rows)),rows);});
test('import refuses duplicate IDs',()=>{assert.throws(()=>normalizePackage([sample(),sample()]));});
test('does not import a manifest as records',()=>{assert.throws(()=>normalizePackage({schema_version:'ag-source-package/0.1',files:[]}));});
test('location refs derivable without writes',()=>{assert.deepEqual(associatedLocationIds(sample()),['LOC-TEST-ONE']);});
test('explicit public location IDs only',()=>{const x=sample(),s={...initialState(x),status:'Active',publicLocationIds:['LOC-TEST-ONE']};assert.deepEqual(publicView(x,s).locationIds,['LOC-TEST-ONE']);});
test('without explicit opt-in, no Location IDs leaked',()=>{const x=sample(),s={...initialState(x),status:'Active'};assert.deepEqual(publicView(x,s).locationIds,[]);assert.ok(!JSON.stringify(publicView(x,s)).includes('LOC-TEST-ONE'));});
test('GM protected actions',()=>{assert.throws(()=>assertGM({isGM:false}));assert.doesNotThrow(()=>assertGM({isGM:true}));});
test('Player Access denies direct API opening',()=>{assert.throws(()=>assertUI({isGM:false},false));assert.doesNotThrow(()=>assertUI({isGM:true},false));});
test('html injection escaped in previews',()=>{assert.equal(cleanText('<script>'),'&lt;script&gt;');});

test('explicit reveal cannot publish a GM-only objective',()=>{const x=sample();x.objectives[1].visibility='gm';const s={...initialState(x),status:'Active',objectiveReveal:['secret']};assert.ok(!JSON.stringify(publicView(x,s)).includes('Secret objective'));});
