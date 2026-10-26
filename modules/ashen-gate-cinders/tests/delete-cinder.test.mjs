import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const steady={power:{modifiers:[{target:'backfire.chance',value:-10,stack:'steady',label:'[TEST] Steady Hands'}]}};
// Delete Cinder (0.14.0): pure plan rules and the runtime with mocked Foundry globals. Proves logic and permission checks, not the live Forge window.
import {matchCinder,planCinderDelete,confirmText,boundMessage} from '../scripts/cinder-delete.mjs';
import {fakeSkillTrees} from './fake-skill-trees.mjs';
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),called=[],saved=new Map(),socketHandlers=[],emitted=[],messages=[],rolls=[];
const Hooks_={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,d)=>{called.push([e,d]);for(const fn of hooks.get(e)??[])fn(d);}};
globalThis.Hooks=Hooks_;
let counter=0;
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2:{confirm:async()=>true}}},utils:{escapeHTML:x=>String(x),randomID:()=>`R${String(++counter).padStart(15,'0')}`}};
globalThis.Roll=class{constructor(f){this.formula=f;}async evaluate(){const t=rolls.shift();if(t==null)throw Error(`unexpected roll ${this.formula}`);this.total=t;return this;}};
globalThis.ChatMessage={create:async d=>{messages.push(d);return d;},getSpeaker:({actor})=>({actor:actor.id})};
globalThis.CONFIG={statusEffects:[{id:'poisoned',name:'Poisoned',img:'poisoned.svg'}]};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};
const MOD='ashen-gate-cinders',DEF='MUT-TEST-EMBER';
const node=(id,perkId,x)=>({id,perkId,x,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:16},
  nodes:[node('NODE1','POWER-TEST-SPARK',100),node('NODE2','POWER-TEST-STEADY',300),node('NODE3','POWER-TEST-REACH',500)]};
const legacyTree={id:'TEST-LEGACY-TREE',name:'[TEST] Legacy',sourceRef:'MUT-TEST-LEGACY',provider:{kind:'cinder_milestone',maxPoints:13},nodes:[]};
const source=(sourceId,entityType,definition)=>({'ashen-gate-manager':{source:{sourceId,entityType,status:'approved',visibility:'player',definition:{id:sourceId,entity_type:entityType,point_cost:1,...definition}}}});
const worldItem=(id,sourceId,name,entityType,definition)=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:null,ownership:{default:2},system:{description:{value:''}},
  testUserPermission:()=>true,flags:source(sourceId,entityType,definition),
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,flags:this.flags});}});
const bfJournal=(id,sourceId,label,entries)=>({id,uuid:`JournalEntry.${id}`,documentName:'JournalEntry',name:label,ownership:{default:0},testUserPermission:u=>u.isGM,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'BackfireTable',status:'approved',visibility:'gm',definition:{id:sourceId,entity_type:'BackfireTable',backfire:{schema:'ag-backfire/0.1',label,entries}}}}}});
const items=[
  worldItem('W0',DEF,'[TEST] Ember Cinder','Mutation',{cinder:{schema:'ag-cinder/0.1',backfire_categories:['BF-TEST-BODY','BF-TEST-MIND']}}),
  worldItem('W9','MUT-TEST-LEGACY','[TEST] Legacy Cinder','Mutation',{}),
  worldItem('W1','POWER-TEST-SPARK','[TEST] Spark','Power',{power:{schema:'ag-power/0.1',kind:'power',standard:{summary:'[TEST] normal'},
    push_modes:[{id:'amplify',label:'[TEST] Amplify',strain_cost:2,effect:'[TEST] bigger'},{id:'overreach',label:'[TEST] Overreach',strain_cost:3,requires:{powers:['POWER-TEST-REACH']}}]}}),
  worldItem('W2','POWER-TEST-STEADY','[TEST] Steady','Power',{power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:steady.power.modifiers}}),
  worldItem('W3','POWER-TEST-REACH','[TEST] Reach','Power',{power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:[{target:'strain.recovery',value:1,label:'[TEST] Deep Rest'}]}})];
const tables=[bfJournal('J1','BF-TEST-BODY','[TEST] Body',[{id:'jolt',text:'[TEST] A jolt.',effect:{status:'poisoned',rounds:1}},{id:'ache',text:'[TEST] An ache.'},{id:'scar',text:'[TEST] A scar.'}]),
  bfJournal('J2','BF-TEST-MIND','[TEST] Mind',[{id:'whisper',text:'[TEST] A whisper.'},{id:'omen',text:'[TEST] An omen.'}])];
const setPath=(obj,path,value)=>{const k=path.split('.');let o=obj;for(const p of k.slice(0,-1))o=o[p]??={};o[k.at(-1)]=structuredClone(value);};
const gm={id:'gm',isGM:true,name:'GM'},alice={id:'u1',isGM:false,name:'Alice'},bob={id:'u2',isGM:false,name:'Bob'};
function makeActor(id,ownerId){
  const actor={id,name:`[TEST] ${id}`,type:'character',flags:{},items:[],effects:[],system:{attributes:{hp:{value:20}}},
    get isOwner(){return game.user.isGM||game.user.id===ownerId;},testUserPermission:(u)=>u.isGM||u.id===ownerId,
    async update(data){const diff={};for(const [k,v] of Object.entries(data)){setPath(this,k,v);setPath(diff,k,v);}for(const fn of hooks.get('updateActor')??[])fn(this,diff);return this;},
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(type,data){
      if(type==='ActiveEffect'){const docs=data.map(d=>({...structuredClone(d),id:`AE${++counter}`}));actor.effects.push(...docs);return docs;}
      const docs=data.map(d=>{const doc={...structuredClone(d),id:`EMB${++counter}`,parent:actor,actor,documentName:'Item',async delete(){actor.items=actor.items.filter(x=>x!==doc);},
        async setFlag(m,k,v){this.flags??={};this.flags[m]??={};this.flags[m][k]=structuredClone(v);}};return doc;});
      actor.items.push(...docs);return docs;}};
  actor.items.get=function(id){return actor.items.find(i=>i.id===id);};
  return actor;
}
// items.get must survive the filter in delete(): keep it on every array the actor holds.
const withGet=a=>{const fix=()=>{if(!a.items.get)a.items.get=id=>a.items.find(i=>i.id===id);};const orig=a.createEmbeddedDocuments;a.createEmbeddedDocuments=async(...x)=>{fix();const r=await orig(...x);fix();return r;};
  return new Proxy(a,{get(t,p){if(p==='items')fix();return t[p];}});};
const A=withGet(makeActor('A','u1')),B=withGet(makeActor('B','u2')),C=withGet(makeActor('C','u2'));
const st=fakeSkillTrees({trees:[tree,legacyTree],worldItem:id=>items.find(i=>i.flags['ashen-gate-manager'].source.sourceId===id),hooks:Hooks_});
st.seed(C,legacyTree.id,{awarded:2,unlocks:[],grants:[{key:'old',amount:2}]});
const treesModule={id:'ashen-gate-skill-trees',active:true,api:st.api};
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-skill-trees',treesModule]]),i18n:{localize:x=>x},
  settings:{register:(_m,k,o)=>{if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[...tables]},items:{contents:items},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A,B,C],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,alice,bob],get:id=>[gm,alice,bob].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.JournalEntry={create:async data=>{const d={...structuredClone(data),documentName:'JournalEntry',async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};game.journal.contents.push(d);return d;}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:()=>{},warn:()=>{}}};
saved.set('strainChip',false); // the Strain chip (0.8.0) has its own tests; keep these effect lists to Backfire effects
await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5)); // the deferred Skill Trees check and adopt
const api=game.modules.get(MOD).api,cinder=api.cinder,strain=api.strain;
const wallet=a=>st.api.accounts.account(a,tree.id);
const powersOn=a=>a.items.map(i=>i.flags['ashen-gate-skill-trees']?.grant?.perkId).filter(Boolean).sort();
const gmSet=async(a,n)=>strain.set(a,n,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] set'});
const fire=async(e,...args)=>{for(const fn of hooks.get(e)??[])await fn(...args);};
const settle=()=>new Promise(r=>setTimeout(r,5));
const giveItem=(actor,id,name,flags={})=>{const item={id,name,flags,parent:actor,documentName:'Item',async delete(){actor.items.splice(actor.items.indexOf(item),1);},
  async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);}};actor.items.push(item);return item;};
const tag=(instanceId,slot='passive')=>({[MOD]:{bearerItem:{instanceId,definitionId:DEF,slot,sourceId:'POWER-TEST-SPARK'}}});
const withDialogs=async(fn,answer)=>{const D=foundry.applications.api,before=D.DialogV2,seen=[];D.DialogV2={wait:async o=>{seen.push(o);return answer(o);},prompt:async o=>{seen.push({...o,info:true});}};try{await fn();}finally{D.DialogV2=before;}return seen;};

test('pure rules: a Cinder is found by its id or by a name that fits one Cinder; the plan counts only what is its own',()=>{
  const list=[{instanceId:'cinst_AAAAAAAA1',name:'Ember Cinder'},{instanceId:'cinst_AAAAAAAA2',name:'Echo'},{instanceId:'cinst_AAAAAAAA3',name:'Echo'}];
  assert.equal(matchCinder(list,'cinst_AAAAAAAA2'),'cinst_AAAAAAAA2');assert.equal(matchCinder(list,'ember'),'cinst_AAAAAAAA1');
  assert.equal(matchCinder(list,'cinst_ZZZZZZZZ9'),'cinst_ZZZZZZZZ9','a well-formed id is kept so leftovers can be cleaned');
  assert.throws(()=>matchCinder(list,'Echo'),/2 Cinders are called Echo/);assert.throws(()=>matchCinder(list,'Frost'),/No Cinder named Frost/);assert.throws(()=>matchCinder(list,' '),/Choose a Cinder/);
  const record={instanceId:'cinst_AAAAAAAA1',definitionId:'MUT-TEST-EMBER',status:'unbound',bearer:null,progression:{awarded:1,unlocks:[]},sockets:{attached:[]},art:null,artStages:null};
  const plan=planCinderDelete({instanceId:record.instanceId,record,name:'[TEST] Ember'});
  assert.deepEqual(plan.counts,{record:1,links:0,bearerItems:0,marks:0,total:1});assert.equal(plan.blocked,null);assert.equal(plan.empty,false);
  assert.match(confirmText(plan),/will be deleted for good/);assert.match(confirmText(plan),/Stays: The Cinder definition imported by General Manager/);assert.match(confirmText(plan),/re-import brings back the Cinder definition, never this Cinder/);
  const bound=planCinderDelete({instanceId:record.instanceId,record:{...record,status:'bound',bearer:{actorId:'A'}},name:'[TEST] Ember',bearer:{actorId:'A',name:'[TEST] A'}});
  assert.deepEqual(bound.blocked,{characters:['[TEST] A']});assert.equal(bound.counts.total,0);assert.match(boundMessage(bound),/still bound to \[TEST\] A\. Unbind it first/);
  assert.equal(planCinderDelete({instanceId:'cinst_GHOSTGHOST1'}).empty,true);
});
test('an unbound Cinder: the plan lists it, Delete removes only its record; definition, kind stage art and sheets stay',async()=>{
  game.user=gm;
  const stages=[{art:'ashen-gate/cinders/[TEST]-1.webp',at:0},{art:'ashen-gate/cinders/[TEST]-2.webp',at:3}];
  await cinder.setDefinitionArtStages(DEF,stages);
  const other=await cinder.create(DEF),stuck=await cinder.create(DEF,{art:'ashen-gate/cinders/own.png'});
  const plan=cinder.planDeleteCinder(stuck.instanceId);
  assert.deepEqual([plan.counts.record,plan.counts.total,plan.blocked,plan.hasRecord],[1,1,null,true]);assert.equal(plan.name,'[TEST] Ember Cinder');
  assert.match(plan.lines[0],/own art and stages/);
  assert.equal(cinder.instances().length,2,'planning writes nothing');
  await assert.rejects(cinder.deleteCinder(stuck.instanceId),/needs \{confirm: true\}/);await assert.rejects(cinder.deleteCinder(stuck.instanceId,{confirm:'yes'}),/needs \{confirm: true\}/);
  await assert.rejects(cinder.deleteCinder('cinst_NOPENOPE1',{confirm:true}),/Unknown Cinder/);
  const before=called.length;
  const r=await cinder.deleteCinder(stuck.instanceId,{confirm:true});
  assert.deepEqual([r.deleted,r.removed.total,r.name],[true,1,'[TEST] Ember Cinder']);
  assert.deepEqual(cinder.instances().map(i=>i.instanceId),[other.instanceId],'the other Cinder of the same kind is untouched');
  assert.deepEqual(saved.get('definitionArtStages'),{[DEF]:stages},'the kind\'s stage art stays');
  assert.ok(items.some(i=>i.flags['ashen-gate-manager'].source.sourceId===DEF),'the imported definition stays');
  assert.ok(called.slice(before).some(([e,d])=>e==='ashenGateCinder.changed'&&d.kind==='delete'&&d.instanceId===stuck.instanceId));
  await assert.rejects(cinder.deleteCinder(stuck.instanceId,{confirm:true}),/Unknown Cinder/,'a second delete finds nothing');
  await cinder.deleteCinder(other.instanceId,{confirm:true});assert.deepEqual(cinder.instances(),[]);
  await cinder.setDefinitionArtStages(DEF,null);
});
test('a Cinder with a bearer is refused, naming the character; after Unbind it can go, and the character keeps its own items',async()=>{
  game.user=gm;const c=await cinder.create(DEF);await cinder.bind(c.instanceId,A);await settle();
  const mine=giveItem(A,'OWN1','[TEST] Own sword');
  const plan=cinder.planDeleteCinder(c.instanceId);assert.deepEqual(plan.blocked,{characters:['[TEST] A']});assert.equal(plan.counts.total,0);
  await assert.rejects(cinder.deleteCinder(c.instanceId,{confirm:true}),/still bound to \[TEST\] A\. Unbind it first/);
  assert.equal(cinder.instances().length,1);assert.equal(A.flags[MOD].cinders.length,1,'nothing was removed from the sheet');
  await assert.rejects(cinder.deleteCinder('[TEST] Ember',{confirm:true}),/still bound/,'also by name');
  await cinder.unbind(c.instanceId);await settle();
  await cinder.deleteCinder(c.instanceId,{confirm:true});
  assert.deepEqual(cinder.instances(),[]);assert.ok(A.items.includes(mine),'items the character otherwise uses stay');
  A.items.splice(0,A.items.length);
});
test('GM only, in the data layer: a player cannot plan or delete, and nothing changes',async()=>{
  game.user=gm;const c=await cinder.create(DEF);
  for(const user of [alice,bob]){game.user=user;
    assert.throws(()=>cinder.planDeleteCinder(c.instanceId),/GM only/);await assert.rejects(cinder.deleteCinder(c.instanceId,{confirm:true}),/GM only/);}
  game.user=gm;assert.equal(cinder.instances().length,1);
  await cinder.deleteCinder(c.instanceId,{confirm:true});
});
test('leftovers (partial records): a record whose definition is gone, and records that exist only as marks on characters, are cleaned; unrelated things stay',async()=>{
  game.user=gm;
  const c=await cinder.create(DEF);const defItem=items.shift();
  try{assert.equal(cinder.planDeleteCinder(c.instanceId).name,'Unnamed Cinder');}finally{items.unshift(defItem);}
  // Leftovers that name a Cinder with no record at all (a registry entry lost, a character restored from a backup).
  const GHOST='cinst_GHOSTGHOST1';
  B.flags[MOD]={cinders:[{instanceId:GHOST,definitionId:DEF,name:'[TEST] Ember Cinder'},{instanceId:c.instanceId,definitionId:DEF}]};
  const passive=giveItem(B,'BI1','[TEST] Ember passive',tag(GHOST)),sword=giveItem(B,'SW1','[TEST] Sword',{[MOD]:{attachedTo:{instanceId:GHOST,slot:0}}}),
    perk=giveItem(B,'PK1','[TEST] Perk',{'ashen-gate-skill-trees':{grant:{perkId:'POWER-TEST-SPARK'}}}),keepMark=giveItem(B,'SW2','[TEST] Ring',{[MOD]:{attachedTo:{instanceId:'cinst_OTHEROTHER1',slot:1}}});
  const plan=cinder.planDeleteCinder(GHOST);
  assert.deepEqual([plan.hasRecord,plan.status,plan.counts],[false,'leftover',{record:0,links:1,bearerItems:1,marks:1,total:3}]);
  assert.match(plan.lines.join('\n'),/\[TEST\] Ember passive on \[TEST\] B/);assert.match(plan.lines.join('\n'),/\[TEST\] Sword \(\[TEST\] B\); the items stay/);
  const r=await cinder.deleteCinder(GHOST,{confirm:true});assert.equal(r.removed.total,3);
  assert.ok(!B.items.includes(passive),'the Cinder\'s own bearer copy is removed');
  assert.ok(B.items.includes(sword)&&B.items.includes(perk)&&B.items.includes(keepMark),'every other item stays');
  assert.equal(sword.flags[MOD].attachedTo,null);assert.deepEqual(keepMark.flags[MOD].attachedTo,{instanceId:'cinst_OTHEROTHER1',slot:1},'another Cinder\'s mark is kept');
  assert.deepEqual(B.flags[MOD].cinders.map(p=>p.instanceId),[c.instanceId],'only this Cinder\'s link goes');
  await assert.rejects(cinder.deleteCinder(GHOST,{confirm:true}),/Unknown Cinder/,'nothing left: nothing to do');
  assert.equal(cinder.instances().length,1,'the record was never part of it');
  await cinder.deleteCinder(c.instanceId,{confirm:true});B.items.splice(0,B.items.length);B.flags[MOD]={cinders:[]};
});
test('a failure while cleaning a character keeps the Cinder and can be run again',async()=>{
  game.user=gm;const c=await cinder.create(DEF);
  const copy=giveItem(C,'BI2','[TEST] Stuck copy',tag(c.instanceId)),del=copy.delete;
  copy.delete=async()=>{throw Error('[TEST] locked');};
  try{await assert.rejects(cinder.deleteCinder(c.instanceId,{confirm:true}),/was not deleted because \[TEST\] Stuck copy on \[TEST\] C: \[TEST\] locked/);}finally{copy.delete=del;}
  assert.equal(cinder.instances().length,1,'the record stays so it can be found and deleted again');
  await cinder.deleteCinder(c.instanceId,{confirm:true});assert.deepEqual(cinder.instances(),[]);assert.ok(!C.items.includes(copy));
});
test('a Cinder whose bearer is no longer in this world can be deleted',async()=>{
  game.user=gm;const c=await cinder.create(DEF);await cinder.bind(c.instanceId,B);await settle();
  const gone=game.actors.contents.filter(a=>a!==B);const all=game.actors.contents;game.actors.contents=gone;
  try{const plan=cinder.planDeleteCinder(c.instanceId);assert.deepEqual([plan.blocked,plan.bearerMissing],[null,true]);
    await cinder.deleteCinder(c.instanceId,{confirm:true});assert.deepEqual(cinder.instances(),[]);}finally{game.actors.contents=all;}
  B.flags[MOD]={cinders:[]};B.items.splice(0,B.items.length);
});
test('Manage: every row has Delete Cinder…; the dialog lists what goes, Cancel is the default, Delete <Cinder> is the danger action; a bound Cinder gets an explanation, not a confirm',async()=>{
  game.user=gm;
  const hbs=fs.readFileSync(new URL('../templates/cinders.hbs',import.meta.url),'utf8');
  assert.match(hbs,/data-act="cinder-delete" data-instance="\{\{instanceId\}\}"[^>]*><i[^>]*><\/i><span class="agc-lab ag-sr-only"> Delete Cinder…<\/span><\/button>/);
  const c=await cinder.create(DEF);const app=api.open();app.tab='manage';
  let seen=await withDialogs(()=>app._act({dataset:{act:'cinder-delete',instance:c.instanceId}}),o=>o.buttons.find(b=>b.action==='cancel').callback());
  assert.equal(seen.length,1);const d=seen[0];
  assert.deepEqual(d.buttons.map(b=>b.label),['Cancel','Delete [TEST] Ember Cinder']);assert.equal(d.window.title,'Delete [TEST] Ember Cinder?');
  assert.equal(d.buttons.find(b=>b.action==='cancel').default,true);assert.equal(d.buttons.find(b=>b.action==='confirm').default,false);assert.ok(d.classes.includes('ag-dialog--danger'));
  assert.match(d.content,/will be deleted for good/);assert.match(d.content,/never this Cinder/);
  assert.equal(cinder.instances().length,1,'Cancel changes nothing');
  await withDialogs(()=>app._act({dataset:{act:'cinder-delete',instance:c.instanceId}}),o=>o.buttons.find(b=>b.action==='confirm').callback());
  assert.deepEqual(cinder.instances(),[],'the labelled Delete button removes it');
  const b=await cinder.create(DEF);await cinder.bind(b.instanceId,A);await settle();
  seen=await withDialogs(()=>app._act({dataset:{act:'cinder-delete',instance:b.instanceId}}),o=>undefined);
  assert.equal(seen.length,1);assert.ok(seen[0].info,'an explanation with Close, not a delete confirm');assert.match(seen[0].content??'',/still bound to \[TEST\] A/);
  assert.equal(cinder.instances().length,1);
  await cinder.unbind(b.instanceId);await cinder.deleteCinder(b.instanceId,{confirm:true});
  game.user=alice;await app._act({dataset:{act:'cinder-delete',instance:'cinst_AAAAAAAA1'}});game.user=gm;
});
test('no machine ids in the dialog text a GM reads',async()=>{
  const {assertNoMachineText}=await import('../../../scripts/test-helpers/no-ids.mjs');
  const record={instanceId:'cinst_AAAAAAAA1',definitionId:'MUT-TEST-EMBER',status:'unbound',bearer:null,progression:{awarded:2,unlocks:['N1']},sockets:{attached:[{slot:0,itemId:'x'}]},art:'a.png',artStages:null};
  assertNoMachineText(confirmText(planCinderDelete({instanceId:record.instanceId,record,name:'[TEST] Ember',leftovers:{links:[{actorName:'[TEST] A'}],bearerItems:[{actorName:'[TEST] A',itemName:'[TEST] Passive'}],marks:[{actorName:'[TEST] A',itemName:'[TEST] Ring'}]}})),'delete dialog');
});
test('Manage Cinders rows (0.15.0): one line, icon buttons with names, steps by window width',()=>{
  const hbs=fs.readFileSync(new URL('../templates/cinders.hbs',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../styles/cinders.css',import.meta.url),'utf8');
  for(const a of ['cinder-transfer','cinder-unbind','cinder-bind','cinder-delete'])assert.match(hbs,new RegExp(`data-act="${a}"[^>]*aria-label="[^"]+…"[^>]*data-tooltip="`),a);
  assert.match(hbs,/class="agc-sub agc-meta"/,'Points and Powers have a fallback line');
  for(const w of ['30rem','40rem','52rem'])assert.match(css,new RegExp(`@container \\(min-width:${w}\\)`),w);
  assert.match(css,/\.agc-manage-table tr\{display:grid/);assert.doesNotMatch(css,/data-label/);
});
