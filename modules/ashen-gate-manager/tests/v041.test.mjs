import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compilePackage} from '../scripts/workflows.js';
import {validatePackage} from '../scripts/core.js';
import {loadMacroSources,validateMacroManifest,validateUserMacroRegistry} from '../scripts/macros.js';
const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
test('Tim-shaped specialist catalog gives descriptive, safe error, not raw generic records error',()=>{
 assert.throws(()=>compilePackage({schema_version:'ag-professions/1',professions:[{id:'PROF-1'}]}),/structured specialist catalog/);
 assert.throws(()=>compilePackage({manifest:{},records:{professions:[]}}),/records=object/);
});
test('oversized archive compatible count 556 passes package size guard when valid',async()=>{
 const base=await load('samples/archie-contract-v02.json');
 const r=base.records[0];
 // Avoid internal refs: make 556 independent draft Materials with explicit Foundry projection.
 const source={manifest:{schema_version:'ag-foundry-import/0.2',package_id:'TEST-556',version:'0.1'},records:Array.from({length:556},(_,i)=>({...r,id:`MAT-TEST-${i+1}`,refs:[],scope:'generic_rules',resource_opportunities:undefined}))};
 assert.deepEqual(validatePackage(compilePackage(source)),[]);
});
test('manifest macro library preserves v0.3 commands byte for byte and IDs',async()=>{
 const manifest=await load('macros/manifest.json');
 const legacy=await load('samples/macro-registry.json');
 assert.deepEqual(manifest.entries.map(x=>x.id),legacy.entries.map(x=>x.id));
 const entries=await loadMacroSources(manifest,async source=>readFile(new URL('../'+source,import.meta.url),'utf8'));
 assert.deepEqual(entries.map(x=>x.command),legacy.entries.map(x=>x.command));
 assert.ok(entries.every(x=>x.status==='experimental'));
});
test('macro manifest rejects traversal, duplicate IDs, unsafe path and rogue fields',()=>{
 const b={schema_version:'ag-macro-manifest/0.1',entries:[{id:'ag-good',name:'Good',version:'0.1',description:'okay',category:'Test',status:'experimental',source:'macros/tools/a.js'}]};
 assert.equal(validateMacroManifest(b).length,1);
 assert.throws(()=>validateMacroManifest({...b,entries:[b.entries[0],b.entries[0]]}),/Duplicate/);
 assert.throws(()=>validateMacroManifest({...b,entries:[{...b.entries[0],source:'macros/../evil.js'}]}),/source/);
 assert.throws(()=>validateMacroManifest({...b,entries:[{...b.entries[0],command:'doBad();'}]}),/fields/);
});
test('custom macro registry only loads metadata and source, no code execution',async()=>{
 const r=await load('macros/custom-registry-example.json');
 assert.equal(validateUserMacroRegistry(r)[0].category,'GM-imported');
 assert.throws(()=>validateUserMacroRegistry({...r,entries:[r.entries[0],r.entries[0]]}),/Duplicate/);
 assert.throws(()=>validateUserMacroRegistry({...r,entries:[{...r.entries[0],command:''}]}),/command/);
});

test('same macro script with changed registered version requests metadata refresh',async()=>{
 const {checkMacroUpdate}=await import('../scripts/workflows.js');
 assert.equal(checkMacroUpdate({command:'hi()',flag:{lastCommand:'hi()',version:'0.3'}},{command:'hi()',version:'0.4'}).action,'update');
 assert.equal(checkMacroUpdate({command:'hi()',flag:{lastCommand:'hi()',version:'0.4'}},{command:'hi()',version:'0.4'}).action,'unchanged');
 assert.equal(checkMacroUpdate({command:'local()',flag:{lastCommand:'hi()',version:'0.3'}},{command:'next()',version:'0.4'}).action,'conflict');
});
