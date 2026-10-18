import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'qa/fixtures/AG_Professions_PinnedChain_v033_Source.json'),'utf8'));
const imported=JSON.parse(fs.readFileSync(path.join(root,'qa/fixtures/AG_Professions_PinnedChain_v033_ManagerImport.json'),'utf8'));
const byId=new Map(source.records.map(r=>[r.id,r]));
test('source fixture is original pinned chain with complete required reference closure',()=>{
 assert.equal(source.records.length,9);
 assert.equal(imported.records.length,9);
 assert.equal(byId.size,9);
 assert.equal(source.provenance_checkpoint.source_zip_sha256,'c9b892e7ea369da39733d4a244e26383de1348f0e4d5ce23c5d5bfc6466c9deb');
 assert.equal(source.provenance_checkpoint.source_canonical_sha256,'b653111f72ff488210dd46752bac587a6ac286b81118f12636e3e2b6d54f0356');
 for(const record of source.records){
   assert.equal(record.status,'draft');
   for(const ref of record.refs){
     assert.equal(ref.mode,'required');
     assert.ok(byId.has(ref.target_id),`${record.id}: missing required ref ${ref.target_id}`);
   }
 }
});
test('projected native Items retain full original structured definitions, IDs, types, provenance, and folder destinations',()=>{
 assert.equal(imported.manifest.schema_version,'ag-foundry-import/0.2');
 for(const record of imported.records){
  const {foundry,...structured}=record;
  assert.deepEqual(structured,byId.get(record.id));
  assert.equal(foundry.document_type,'Item');
  assert.match(foundry.folder_path,/^Ashen Gate\/Professions\//);
  assert.ok(['feat','loot'].includes(foundry.data.type));
 }
});
test('specific pinned Hearthleaf material and Field Medic recipe values remain unchanged',()=>{
 const material=byId.get('MAT-HERBALISM-APPRENTICE-COMMON');
 const recipe=byId.get('REC-ALCHEMY-FIELD-MEDIC-S-SALVE');
 const item=byId.get('ITEM-ALCHEMY-FIELD-MEDIC-S-SALVE');
 assert.equal(material.tierId,'apprentice');
 assert.equal(material.quality,'Common');
 assert.equal(material.priceGp,5);
 assert.equal(material.weightLb,0.5);
 assert.deepEqual(recipe.ingredients,[{material_id:material.id,quantity:1,material_value_gp:5}]);
 assert.equal(recipe.profession_id,'PROF-ALCHEMY');
 assert.equal(recipe.result_item_id,item.id);
 assert.equal(recipe.craft_gp,25);
 assert.equal(item.created_by_recipe_id,recipe.id);
});
