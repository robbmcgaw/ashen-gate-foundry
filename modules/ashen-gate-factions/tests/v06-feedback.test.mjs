import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,fieldDisclosure,disclosedField,revealField,sourceDefinition,overlayCampaign,extractCampaignDiscovery} from '../scripts/core.mjs';
const manifest=JSON.parse(readFileSync(new URL('../module.json',import.meta.url),'utf8'));
const code=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');
const template=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
const source=()=>makeFaction({id:'FACTION-PLAYTEST-TEST',trackId:'RENOWN-PLAYTEST-TEST',name:'Secret Herald',leader:'Hidden Captain',public_role:'Protects a trade road.'});
test('Module actually requests a Foundry socket namespace for player-to-GM messages',()=>{
 assert.equal(manifest.id,'ashen-gate-factions');assert.equal(manifest.version,'0.19.1');assert.equal(manifest.socket,true);
 assert.match(code,/game\.socket\.on\(SOCKET/);assert.match(code,/game\.socket\.emit\(SOCKET/);
});
test('Player action receipt is correlated to request ID and user rather than broadcasting private action data',()=>{
 assert.match(code,/pendingReplies\.has\(msg\.requestId\)/);assert.match(code,/msg\.userId!==game\.user\?\.id/);
 assert.match(code,/requestAuthorized\(msg\)/);assert.match(code,/if\(\!\['share','request'\]\.includes\(msg\?\.type\)/);
});
test('Legacy discovery retains complete profile fields before enabling selective mode',()=>{
 const f=source();for(const key of ['name','leader','public_role'])assert.equal(disclosedField(f,key,['A1']),f[key]);
 const def=sourceDefinition(f);assert.ok(!('field_reveals' in def));
});
test('Selective disclosure sends no hidden name or leader, but can show description alone',()=>{
 const f=source();let v=fieldDisclosure({mode:'selective'});v=revealField(v,'public_role',{actorId:'A1'});
 assert.equal(disclosedField(f,'name',['A1'],v),'');assert.equal(disclosedField(f,'leader',['A1'],v),'');
 assert.equal(disclosedField(f,'public_role',['A1'],v),f.public_role);
 assert.equal(disclosedField(f,'public_role',['A2'],v),'');
});
test('Party disclosure and per-character disclosure have independent, revocable flags',()=>{
 const f=source();let v=fieldDisclosure({mode:'selective'});
 v=revealField(v,'leader',{party:true});v=revealField(v,'name',{actorId:'A1'});
 assert.equal(disclosedField(f,'leader',['A2'],v),f.leader);
 assert.equal(disclosedField(f,'name',['A2'],v),'');
 assert.equal(disclosedField(f,'name',['A1'],v),f.name);
 v=revealField(v,'leader',{party:true,visible:false});assert.equal(disclosedField(f,'leader',['A2'],v),'');
});
test('Field configuration is campaign state only, not in exported definitions',()=>{
 let f=source();const v=revealField(fieldDisclosure({mode:'selective'}),'name',{party:true});f.field_reveals=v;
 const state=extractCampaignDiscovery(f);assert.equal(state.field_reveals.mode,'selective');
 assert.equal(overlayCampaign(source(),{field_reveals:state.field_reveals}).field_reveals.fields.name.party,true);
 assert.equal(JSON.stringify(sourceDefinition(f)).includes('field_reveals'),false);
});
test('Only supported fields are selectable and missing access scope is rejected',()=>{
 assert.throws(()=>revealField({},'contactInfo',{party:true}),/Invalid faction information field/);
 assert.throws(()=>revealField({},'name',{}),/Party or Actor/);
});
test('Player projections remove Objective metadata and hidden UUIDs',()=>{
 assert.match(code,/scrubMilestones\(milestoneProjection/);
 assert.match(code,/nativeReadableUuid\(e\.uuid,user\)/);
 assert.match(code,/name:disclosedField\(f,'name'/);
 assert.match(code,/const safeLabels=new Map\(visibleFactions/);
 assert.ok(!/gmObjectiveRefs/.test(template.split('{{#if tabOrgs}}')[0]));
});
test('GM field reveals and player-access controls are separately permission-gated',()=>{
 assert.match(code,/static async saveFieldReveals\(\)\{try\{\s*assertGM/);
 // 0.15.0: the editor footer's Save Changes runs the open sub-tab's save (Visibility → saveFieldReveals).
 assert.match(template,/data-action="\{\{saveAction\}\}">Save Changes</);assert.match(code,/selected==='visibility'\?'saveFieldReveals'/);
 assert.match(code,/static async saveSetup\(\)\{try\{\s*assertGM/);
});
test('Group disclosure action is offered from Player view only, not both tabs',()=>{
 assert.match(template,/\{\{#if tabPlayer\}\}\{\{#unless isGM\}\}\{\{#if detail\.canShare\}\}/);
 assert.match(code,/sendClientAction\(request\)/);
});
test('GM UI has editor sub-tabs and kit folds, the actor picker in the editor head and no invalid Handlebars tags',()=>{
 // 0.15.0 (FR-01): no long page of <details>; the editor uses kit sub-tabs and kit folds (no fold inside a fold).
 assert.doesNotMatch(template,/agf-config-section|agf-inner-section/);
 assert.equal((template.match(/\{\{#agfFold /g)||[]).length,4);
 assert.match(template,/\{\{\{tabsHtml\}\}\}/);assert.match(code,/subTabs\(\{group:'agf-editor'/);
 assert.doesNotMatch(template,/\{\{\/details\}\}/);
 assert.match(template,/<header class="agf-editor__head">[\s\S]*?\{\{> agfPicker\}\}[\s\S]*?<\/header>/);assert.match(code,/x\.scrollTop=top/);
});
test('Document link checks do not grant source access automatically',()=>{
 assert.match(code,/d\.testUserPermission\?\.\(user,OBS\)/);
 assert.match(code,/Document access is not permitted/);
 assert.doesNotMatch(code,/\.update\(\{ownership:\{default:OBS\}\}\)/);
});
test('Test fixtures use real documents and safe deletion markers, no new canonical content',async()=>{
 const file=readFileSync(new URL('../fixtures/setup.mjs',import.meta.url),'utf8');
 assert.match(file,/JournalEntry\.create/);assert.match(file,/\[kind\]\.deleteDocuments/);
 assert.match(file,/FIXTURE='AG-FACTIONS-PLAYTEST-2026-10-17'/);
 assert.match(file,/refreshPlayerViews/);
 assert.match(file,/Two|two separate non-GM/);
});

test('Only an Actor owner sees the granted embedded Item link; original source permissions remain independent',()=>{
 assert.match(code,/function grantedItemUuid\(claim,user,actorIds\)/);
 assert.match(code,/claim\?\.request_id/);
 assert.match(code,/canActor\(user,actor\)/);
 assert.match(template,/View granted item/);
 assert.match(code,/doc\.parent\?\.documentName==='Actor'/);
});
