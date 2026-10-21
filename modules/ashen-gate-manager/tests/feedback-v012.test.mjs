import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePackage, planRecord} from '../scripts/core.js';
import {localEdits, checkMacroUpdate} from '../scripts/workflows.js';
import {downloadJson} from '../scripts/download.js';

const read=name=>JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));

test('valid Foundry RollTable fixture validates and repeat import explains why it is blocked',()=>{
  const pkg=read('AG_WORK_0018_valid_import.json');
  assert.deepEqual(validatePackage(pkg),[]);
  const planned=planRecord(pkg.records[0],[{documentName:'RollTable'}],false,true);
  assert.equal(planned.action,'blocked');
  assert.match(planned.reason,/never overwritten.*owning Foundry interface/i);
});

test('invalid Foundry TableResult type fails whole-package validation before import',()=>{
  const pkg=read('AG_WORK_0018_blocked_import.json');
  const errors=validatePackage(pkg);
  assert.match(errors.join('\n'),/results\[0\]\.type must be "document" or "text"/);
});

test('library local-edit detection compares serialized Foundry documents, not live objects',()=>{
  const doc={
    system:{uncloneable:Promise.resolve('live facade')},
    getFlag:()=>({source:{managedFields:{system:{stable:true}}}}),
    toObject:()=>({system:{stable:true}})
  };
  assert.deepEqual(localEdits(doc),[]);
});

test('macro re-import tolerates Foundry CRLF normalization but preserves local-edit conflict',()=>{
  const incoming={command:'console.log("safe")\n',version:'1.0.0'};
  assert.equal(checkMacroUpdate({command:'console.log("safe")\r\n',flag:{lastCommand:'console.log("safe")\n',version:'1.0.0'}},incoming).action,'unchanged');
  assert.equal(checkMacroUpdate({command:'console.log("edited")',flag:{lastCommand:'console.log("safe")\n',version:'1.0.0'}},incoming).action,'conflict');
});

test('JSON exports use Foundry file-save dialog API',()=>{
  const calls=[];
  const result=downloadJson('template.json',{schema_version:'test/1'}, {foundryApi:{saveDataToFile:(...args)=>calls.push(args)}});
  assert.equal(result,'foundry');
  assert.equal(calls[0][1],'application/json');
  assert.equal(calls[0][2],'template.json');
  assert.deepEqual(JSON.parse(calls[0][0]),{schema_version:'test/1'});
});

test('header uses current version, module shortcuts, and no redundant workflow subtitle',()=>{
  const template=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
  assert.match(template,/v0\.41\.0 Beta/);
  assert.match(template,/data-ag-module-open="\{\{id\}\}"/);
  assert.doesNotMatch(template,/Upload → Preview → Import/);
});

test('header has no module launcher row; emblem uses a real icon',()=>{
  const template=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
  assert.doesNotMatch(template,/fa-gate\b/);
  assert.doesNotMatch(template,/header-launchers|headerLaunchers/);
  assert.match(template,/data-ag-tab="modules"/,'the Modules tab still opens modules');
});
