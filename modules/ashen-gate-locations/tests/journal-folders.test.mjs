import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureLocationJournalFolder, JOURNAL_FOLDER_PATHS} from '../scripts/journal-folders.js';
function context(){
 const folders={contents:[]};let n=0;
 class Folder {static async create(data){const f={...data,id:`JF-${++n}`};folders.contents.push(f);return f;}}
 return {folders,FolderClass:Folder};
}
test('create three segments, reuse parents and specific leaves',async()=>{
 const deps=context();
 const a=await ensureLocationJournalFolder('source',deps);
 const b=await ensureLocationJournalFolder('source',deps);
 const c=await ensureLocationJournalFolder('projection',deps);
 const d=await ensureLocationJournalFolder('map_registry',deps);
 assert.equal(a,b);
 assert.notEqual(a,c);assert.notEqual(c,d);
 assert.equal(deps.folders.contents.length,5); // Ashen Gate, Locations, three leaves
 assert.equal(deps.folders.contents.find(f=>f.id===a).name,'Source Records');
 assert.equal(JOURNAL_FOLDER_PATHS.source,'Ashen Gate/Locations/Source Records');
});
test('typed folders do not adopt an Item folder with the same name/path',async()=>{
 const deps=context();
 deps.folders.contents.push({id:'item-root',name:'Ashen Gate',type:'Item',folder:null});
 const created=await ensureLocationJournalFolder('source',deps);
 assert.ok(created);assert.equal(deps.folders.contents.length,4);
 assert.equal(deps.folders.contents.find(f=>f.name==='Ashen Gate'&&f.type==='JournalEntry').folder,null);
});
test('duplicate exact matches reject instead of silently choosing',async()=>{
 const deps=context();
 deps.folders.contents.push({id:'A',name:'Ashen Gate',type:'JournalEntry',folder:null},{id:'B',name:'Ashen Gate',type:'JournalEntry',folder:null});
 await assert.rejects(()=>ensureLocationJournalFolder('source',deps),/Ambiguous Journal folder/);
});
test('unknown role and inaccessible Folder API refuse creation',async()=>{
 const deps=context();
 await assert.rejects(()=>ensureLocationJournalFolder('missing',deps),/Unknown/);
 await assert.rejects(()=>ensureLocationJournalFolder('source',{folders:null,FolderClass:null}),/unavailable/);
});
