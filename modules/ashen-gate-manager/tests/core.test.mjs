import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validatePackage, planRecord, exportedFields, canonical} from "../scripts/core.js";
const fixture = JSON.parse(fs.readFileSync(new URL("../samples/demo-package.json", import.meta.url), "utf8"));
const clone = x => structuredClone(x);
const item = fixture.records[0];
function mockDoc(record, {fieldOverrides={}, metaOverrides={}} = {}) {
  const data = clone(record.foundry.data);
  const flag = {
    managedFields:exportedFields(record),
    pagesDefinition: record.foundry.document_type === "JournalEntry" ? (data.pages ?? []) : [],
    ...metaOverrides
  };
  return {
    documentName:record.foundry.document_type,
    type:data.type,
    flag,
    get:path => Object.prototype.hasOwnProperty.call(fieldOverrides,path) ? fieldOverrides[path] : path.split(".").reduce((v,k)=>v?.[k],data)
  };
}
test("demo schema validates and links resolve within its own package",()=>{
  assert.deepEqual(validatePackage(fixture),[]);
});
test("malformed source data and duplicate IDs are rejected",()=>{
  const bad=clone(fixture);bad.records[1].id=bad.records[0].id;
  assert.match(validatePackage(bad).join("\n"),/duplicate ID/);
  const unsafe=clone(fixture);unsafe.records[0].foundry.data.ownership={default:3};
  assert.match(validatePackage(unsafe).join("\n"),/unsupported keys: ownership/);
});
test("unknown required references fail validation, optional references may be omitted",()=>{
  const bad=clone(fixture);bad.records[1].refs=["MAT-MISSING-001"];
  assert.match(validatePackage(bad).join("\n"),/unresolved required reference/);
  bad.records[1].refs=[{id:"MAT-MISSING-001",optional:true}];
  assert.deepEqual(validatePackage(bad),[]);
});
test("draft/example records are skipped until specifically opted in",()=>{
  assert.equal(planRecord(item,[],false,false).action,"skipped");
  assert.equal(planRecord(item,[],false,true).action,"create");
  assert.equal(planRecord(item,[],true,true).action,"blocked");
});
test("baseline matches means unchanged",()=>{
  assert.equal(planRecord(item,[mockDoc(item)],false,true).action,"unchanged");
});
test("source-only changes update just the modified leaf",()=>{
  const changed=clone(item);
  changed.foundry.data.system.description.value="<p>Revised</p>";
  const plan=planRecord(changed,[mockDoc(item)],false,true);
  assert.equal(plan.action,"update");
  assert.deepEqual(plan.patch,{"system.description.value":"<p>Revised</p>"});
});
test("local-only changes are preserved",()=>{
  const doc=mockDoc(item,{fieldOverrides:{"system.description.value":"<p>Custom GM description</p>"}});
  const plan=planRecord(item,[doc],false,true);
  assert.equal(plan.action,"local");
});
test("overlapping source and local edits are blocked with a conflict",()=>{
  const changed=clone(item);changed.foundry.data.system.description.value="<p>New approved source</p>";
  const doc=mockDoc(item,{fieldOverrides:{"system.description.value":"<p>Custom GM description</p>"}});
  const plan=planRecord(changed,[doc],false,true);
  assert.equal(plan.action,"conflict");
});
test("disjoint source and local edits produce a safe partial patch",()=>{
  const changed=clone(item);changed.foundry.data.name="Renamed From Source";
  const doc=mockDoc(item,{fieldOverrides:{"system.description.value":"<p>Custom GM description</p>"}});
  const plan=planRecord(changed,[doc],false,true);
  assert.equal(plan.action,"update");
  assert.deepEqual(plan.patch,{name:"Renamed From Source"});
});
test("source cannot silently remove managed data fields",()=>{
  const changed=clone(item);delete changed.foundry.data.img;
  const plan=planRecord(changed,[mockDoc(item)],false,true);
  assert.equal(plan.action,"blocked");
});
test("duplicate source ID bindings and subtype changes are blocked",()=>{
  const doc=mockDoc(item);
  assert.equal(planRecord(item,[doc,doc],false,true).action,"blocked");
  assert.equal(planRecord(item,[{...doc,type:"weapon"}],false,true).action,"blocked");
});
test("ordinary Journal page data remains create-only",()=>{
  const j=clone(fixture.records[2]);
  j.id="JOURNAL-DEMO"; j.entity_type="Lore";
  assert.equal(planRecord(j,[mockDoc(j)],false,true).action,"unchanged");
  const change=clone(j);change.foundry.data.pages[0].text.content="<p>changed</p>";
  assert.equal(planRecord(change,[mockDoc(j)],false,true).action,"blocked");
});
test("canonical comparison is key-order-independent",()=>{
  assert.equal(canonical({a:1,b:2}),canonical({b:2,a:1}));
});
