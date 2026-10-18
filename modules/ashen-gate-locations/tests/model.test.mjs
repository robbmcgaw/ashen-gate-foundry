import test from "node:test";
import assert from "node:assert/strict";
import {createLocation,validateLocation,nextResourceId,nextPoiKey,playerHtml,emptyState,parseImport,syncDecision,SOURCE_FORMAT,validRef} from "../scripts/model.js";
function record(){let r=createLocation("LOC-TEST-SITE");r.kind="location";r.name="Test Site";return r;}
test("default Location meets the seven-field contract and validation",()=>assert.deepEqual(validateLocation(record()),[]));
test("one Region link allowed, duplicate rejected",()=>{let r=record();r.refs=[{relation:"belongs_to_region",target_id:"LOC-REGION",mode:"optional"}];assert.deepEqual(validateLocation(r),[]);r.refs.push({...r.refs[0]});assert.match(validateLocation(r).join(),/one primary Region/);});
test("typed refs reject other field formats",()=>{assert.equal(validRef({relation:"x",target_id:"MAT-ORE",mode:"optional"}),true);assert.equal(validRef({id:"MAT-ORE",role:"material"}),false);});
test("resources use permanent RES IDs and validate abundance",()=>{const r=record();let id=nextResourceId(r);r.resources.push({id,material_ref:"MAT-IRON",abundance:"scarce"});assert.deepEqual(validateLocation(r),[]);assert.notEqual(nextResourceId(r),id);r.resources[0].abundance="many";assert.match(validateLocation(r).join(),/Resources require/);});
test("POI keys remain stable when adding",()=>{const r=record();r.points_of_interest=[{key:"poi-1",title:"Stairs",description:"",reference:""}];assert.equal(nextPoiKey(r),"poi-2");});
test("player preview excludes unrevealed content and all GM notes",()=>{
 let r=record();r.description={player:"A quiet site",gm:"secret password <private>"};
 r.resources=[{id:"RES-TEST-SITE-001",material_ref:"MAT-IRON",abundance:"abundant"}];
 r.points_of_interest=[{key:"poi-1",title:"Hidden Door",description:"Secret entry",reference:""}];
 r.refs=[{relation:"faction_present",target_id:"FACTION-SECRET",mode:"optional"}];
 const hidden=playerHtml(r,emptyState());assert.match(hidden,/A quiet site/);for(const text of ["password","MAT-IRON","Hidden Door","FACTION-SECRET"])assert.ok(!hidden.includes(text),text);
 const reveal={revealed_resources:["RES-TEST-SITE-001"],revealed_pois:["poi-1"],revealed_refs:["faction_present::FACTION-SECRET"]};
 const shown=playerHtml(r,reveal);assert.match(shown,/MAT-IRON/);assert.match(shown,/Hidden Door/);assert.match(shown,/FACTION-SECRET/);assert.ok(!shown.includes("password"));
});
test("malicious description is escaped from journal output",()=>{let r=record();r.description.player='<script>alert("test")</script>';let html=playerHtml(r,emptyState());assert.ok(!html.includes("<script>"));assert.match(html,/&lt;script&gt;/);});
test("transport: exact format, unique IDs, valid records",()=>{const r=record();let p={format:SOURCE_FORMAT,locations:[r],base_revisions:{[r.id]:3}};assert.equal(parseImport(p).locations.length,1);assert.throws(()=>parseImport({...p,format:"other"}),/Expected/);assert.throws(()=>parseImport({...p,locations:[r,r]}),/Duplicate/);});
test("sync requires matching exported base revision or explicit conflict",()=>{
 const r=record(), world={record:r,revision:5};assert.equal(syncDecision(r,world,0),"unchanged");
 const updated={...r,name:"New Name"}; assert.equal(syncDecision(updated,world,5),"update");assert.equal(syncDecision(updated,world,3),"conflict");assert.equal(syncDecision(updated,world,undefined),"conflict");assert.equal(syncDecision(updated,null,null),"create");
});
