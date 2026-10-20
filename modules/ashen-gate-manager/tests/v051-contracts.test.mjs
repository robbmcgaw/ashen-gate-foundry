import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyDelivery,validateSourceManifest,domainHandoff} from '../scripts/delivery.js';
import {compilePackage,planLifecycle,buildSourceReplacementPatch} from '../scripts/workflows.js';
import {validatePackage,planRecord} from '../scripts/core.js';
import {systemOf} from '../scripts/browser.js';
import {checkContractGraph} from '../scripts/contract.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../samples/AG_SourcePackage_Manifest_v0.1.0_Example.json',import.meta.url)));
const source=(id,type,refs=[])=>({id,entity_type:type,status:'draft',version:'0.1.0',visibility:'gm',scope:'generic_rules',owner_system_id:'SYS-HIRE',
  provenance:{sources:['Synthetic v0.5.1 contract fixture']},refs,foundry:{document_type:'Item',data:{name:id,type:'feat'}}});
const pack=records=>({manifest:{schema_version:'ag-foundry-import/0.2',package_id:'AG-HIRE-TEST',version:'0.1.0'},records});
const perk=()=>({...source('HPERK-DEMO-001','HirelingPerk'),name:'Test hireling perk',contexts:['headquarters','passive'],
  conditions:{requires_working:true,required_capability_keys:[]},stacking:{allow_overlap:false,overlap_group:'synthetic'},implementation:'informational'});
test('approved source manifest example matches basic v1 contract fields',()=>{
  assert.deepEqual(validateSourceManifest(manifest),[]);
  assert.equal(classifyDelivery(manifest).kind,'source_package');
  assert.match(classifyDelivery(manifest).notice,/foundry-import\.json/);
});
test('source manifest never silently enters Foundry import pipeline',()=>{
  assert.throws(()=>compilePackage(manifest),/not a Foundry import/);
  assert.throws(()=>compilePackage({manifest,records:[]}),/not a Foundry import/);
});
test('source manifests reject unsafe paths, duplicate paths, campaign state and unsupported versions',()=>{
  const a=structuredClone(manifest); a.files[0].path='../world.db';a.files.push({...a.files[1]});a.includes_campaign_state=true;
  assert.match(validateSourceManifest(a).join(' '),/path/);
  assert.match(validateSourceManifest(a).join(' '),/duplicate/);
  assert.match(validateSourceManifest(a).join(' '),/includes_campaign_state/);
  const b=structuredClone(manifest);b.schema_version='ag-source-package/1.0';assert.ok(validateSourceManifest(b).length);
});
test('campaign-state contracts routed to owners, never imported',()=>{
  for (const [data,type] of [
    [{guild_state:{},headquarters_states:[]},'Guildhall'],
    [{campaign_key:'demo',track_ref:'RENOWN-X',scopes:[]},'Renown'],
    [{location_ref:'LOC-X',base_world_revision:1,world_revision:2},'Location']
  ]) {
    assert.equal(classifyDelivery(data).kind,'domain_state');
    assert.throws(()=>compilePackage(data),new RegExp(type));
  }
});
test('Locations including Regions are review-only, while ordinary Items are still creatable',()=>{
  for (const record of [source('LOC-REGION-1','Location'),source('LOC-OTHER-1','Location'),source('REGION-OLD-1','Region')]) {
    assert.ok(domainHandoff(record));
    assert.equal(planRecord(record,[],false,true).action,'blocked');
  }
  const ordinary=source('HIRE-TEST-1','Hireling');
  assert.equal(domainHandoff(ordinary),null);
  assert.equal(planRecord(ordinary,[],false,true).action,'create');
});
test('Hireling perks use reserved HPERK namespace and project to feat Items',()=>{
  const good=perk();
  assert.deepEqual(validatePackage(pack([good])),[]);
  assert.equal(systemOf({sourceId:good.id}).key,'SYS-HIRE');
  const invalid={...good,id:'PERK-DEMO-001'};
  assert.match(validatePackage(pack([invalid])).join(' '),/HPERK-/);
  const invalid2={...good,entity_type:'ProfessionPerk'};
  assert.match(validatePackage(pack([invalid2])).join(' '),/HirelingPerk/);
  const invalid3=structuredClone(good);invalid3.foundry.data.type='loot';
  assert.match(validatePackage(pack([invalid3])).join(' '),/feat/);
});
test('HirelingPerk prerequisites validate and HIRE to HPERK refs resolve',()=>{
 const h=source('HIRE-DEMO-001','Hireling',[{relation:'has_hireling_perk',target_id:'HPERK-DEMO-001',mode:'required'}]);
 assert.deepEqual(validatePackage(pack([h,perk()])),[]);
 const broken={...h,refs:[{relation:'has_hireling_perk',target_id:'HIRE-DEMO-002',mode:'required'}]};
 assert.match(checkContractGraph([broken,source('HIRE-DEMO-002','Hireling')]).errors.join(' '),/expects HirelingPerk/);
});
test('v0.2 profession test package remains eligible (no specialists auto-migrated)',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('../samples/archie-contract-v02.json',import.meta.url)));
 assert.deepEqual(validatePackage(fixture),[]);
});

test('existing Manager-managed Locations cannot be overwritten, archived or staged through generic lifecycle',()=>{
 const loc=source('LOC-DEMO-001','Location');
 assert.equal(planLifecycle({managed:true,kind:'JournalEntry',entityType:'Location',sourceId:loc.id,action:'delete',archived:true}).allowed,false);
 assert.equal(planLifecycle({managed:true,kind:'JournalEntry',entityType:'Location',sourceId:loc.id,action:'archive'}).allowed,false);
 assert.equal(buildSourceReplacementPatch(loc,{type:'feat',flag:{managedFields:{name:'old'}},get:()=>null},{allowLocalEdits:true}).action,'blocked');
});
