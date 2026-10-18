import test from 'node:test';
import assert from 'node:assert/strict';
import {auditTypedReferences,renderGmReferenceMarkers,lookupSourceId} from '../scripts/manager-resolver-bridge.mjs';
const user={isGM:true};
const gm=()=>user;
function resolver(answers={}){return {contract:'ag-definition-resolver/0.1-prototype',resolve:id=>answers[id]??{status:'not_found'}};}
const native=id=>({status:'ok',binding:{kind:'native',id,uuid:'Item.ABC123',title:'Iron Ore'}});
const domain=id=>({status:'ok',binding:{kind:'domain',id,providerId:'locations',recordKey:id}});
const refs=[{relation:'material',target_id:'MAT-IRON',mode:'required'},{relation:'supplement',target_id:'MAT-MISSING',mode:'optional'}];
const records=[{id:'REC-RECIPE',refs}];
test('preserves canonical typed source references including missing optional',()=>{
const before=JSON.stringify(records);const r=auditTypedReferences({records,resolver:resolver({'MAT-IRON':native('MAT-IRON')}),currentUser:gm});
assert.equal(r.examined,2);assert.equal(r.unresolvedOptional.length,1);assert.equal(r.unresolvedRequired.length,0);assert.equal(r.findings[1].targetId,'MAT-MISSING');assert.equal(JSON.stringify(records),before);
});
test('required unresolved marked as error, not silently dropped',()=>{const result=auditTypedReferences({records:[{id:'REC-RECIPE',refs:[{relation:'result',target_id:'ITEM-MISSING',mode:'required'}]}],resolver:resolver(),currentUser:gm});assert.equal(result.unresolvedRequired[0].targetId,'ITEM-MISSING');});
test('conflicting canonical sources remain conflicts',()=>{const result=auditTypedReferences({records,resolver:resolver({'MAT-IRON':{status:'conflict',count:2}}),currentUser:gm});assert.equal(result.findings[0].status,'conflict');});
test('player cannot request diagnostic metadata',()=>{const result=auditTypedReferences({records,resolver:resolver({'MAT-IRON':native('MAT-IRON')}),currentUser:()=>({isGM:false})});assert.deepEqual(result,{status:'forbidden'});});
test('GM markers turn into native UUID links after resolving',()=>{const r=renderGmReferenceMarkers({text:'Use [[AGREF:MAT-IRON|Iron ore]].',resolver:resolver({'MAT-IRON':native('MAT-IRON')}),currentUser:gm});assert.equal(r.text,'Use @UUID[Item.ABC123]{Iron ore}.');assert.equal(r.resolved.length,1);});
test('domain pointer cannot be used as fabricated UUID',()=>{const r=renderGmReferenceMarkers({text:'[[AGREF:LOC-ONE|Town]]',resolver:resolver({'LOC-ONE':domain('LOC-ONE')}),currentUser:gm});assert.equal(r.text,'[[AGREF:LOC-ONE|Town]]');assert.equal(r.unresolved[0].status,'no_native_uuid');});
test('missing source remains visible to GM as unresolved marker',()=>{const r=renderGmReferenceMarkers({text:'[[AGREF:MAT-NOPE|Absent]]',resolver:resolver(),currentUser:gm});assert.equal(r.unresolved[0].id,'MAT-NOPE');assert.match(r.text,/AGREF/);});
test('unsafe uuid rejected; label injection sanitized',()=>{const r=renderGmReferenceMarkers({text:'[[AGREF:MAT-IRON|<b>{foo}</b>]]',resolver:resolver({'MAT-IRON':{status:'ok',binding:{kind:'native',uuid:'Item.foo]malicious'}}}),currentUser:gm});assert.equal(r.resolved.length,0);assert.match(r.text,/AGREF/);});
test('non-GM reference rendering denied',()=>{assert.deepEqual(renderGmReferenceMarkers({text:'abc',resolver:resolver(),currentUser:()=>({isGM:false})}),{status:'forbidden'});});
test('invalid or missing resolver is explicit and never guesses by display name',()=>{assert.throws(()=>lookupSourceId(null,'MAT-IRON'),/resolver prototype/); assert.deepEqual(lookupSourceId(resolver(),'bad'),{status:'invalid_id'});});
test('wrong resolver contract fails before world changes',()=>{assert.throws(()=>auditTypedReferences({records,resolver:{contract:'wrong',resolve:()=>({status:'ok'})},currentUser:gm}),/resolver prototype/);});
