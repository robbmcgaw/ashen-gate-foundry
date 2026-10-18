import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const pinned=JSON.parse(fs.readFileSync(path.join(root,'test-fixtures/professions/AG_WORK_0002_Material_Recipe_Item.json'),'utf8'));
const projected=JSON.parse(fs.readFileSync(path.join(root,'test-fixtures/professions/AG_Professions_PinnedChain_v0.1.1_ManagerImport.json'),'utf8'));
const byId=new Map(projected.records.map(r=>[r.id,r]));

test('pinned Material→Recipe→Item identities and source payload survive /0.2 projection',()=>{
  assert.equal(projected.manifest.schema_version,'ag-foundry-import/0.2');
  assert.equal(projected.records.length,9);
  assert.equal(byId.size,9);
  for(const original of pinned.records){
    const projection=byId.get(original.id);
    assert.ok(projection,original.id);
    const {foundry,...content}=projection;
    assert.deepEqual(content,original);
    assert.equal(foundry.document_type,'Item');
    assert.match(foundry.folder_path,/^Ashen Gate\/Professions\//);
  }
});
test('full import closes all required refs and retains native folder destinations',()=>{
  for(const r of projected.records){
    assert.ok(r.foundry?.folder_path,r.id);
    for(const ref of r.refs){
      if(ref.mode==='required')assert.ok(byId.has(ref.target_id),r.id+' → '+ref.target_id);
    }
  }
});
