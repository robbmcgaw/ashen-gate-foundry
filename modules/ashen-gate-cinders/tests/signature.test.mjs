import test from 'node:test';import assert from 'node:assert/strict';
// 0.10.0: every Cinder gives its bearer a signature ability and a passive (cinder.bearer_items, ag-cinder/0.2). Pure rules, then the
// runtime with mocked Foundry globals and a stand-in Skill Trees: proves the logic (bind / transfer / unbind / rehook / Check / Repair,
// the Push offer on dnd5e.postUseActivity, the edit guards), not the live Foundry UI, dnd5e's real use flow or transferring effects on a real Actor.
import {validateDefinition} from '../scripts/cinder.mjs';
import {planBearerItems,bearerTag,bearerItemData,playerUpdateProblem,bearerItemsOf} from '../scripts/bearer-items.mjs';
import {fakeSkillTrees} from './fake-skill-trees.mjs';

const MOD='ashen-gate-cinders',DEF='MUT-TEST-EMBER';
const mut=(cinder)=>({id:DEF,entity_type:'Mutation',cinder});
const pw=(id,power,data={})=>({id,entity_type:'Power',power:{schema:'ag-power/0.1',...power},foundry:{document_type:'Item',data:{name:`[TEST] ${id}`,type:'feat',...data}}});
const ACTIVITIES={system:{activities:{act1:{type:'utility',activation:{type:'action'},uses:{max:'2',recovery:[{period:'lr'}]}}}}};
const WARD_EFFECT={effects:[{eff_id:'ward',name:'[TEST] Ward',transfer:true,changes:[{key:'system.attributes.ac.bonus',mode:'add',value:1}]}]};

test('definition check (ag-cinder/0.2): bearer_items, the two signature kinds and their mistakes',()=>{
  assert.deepEqual(validateDefinition(mut({schema:'ag-cinder/0.2',bearer_items:{active:'POWER-TEST-FLARE',passive:'POWER-TEST-WARD'}})),{errors:[],warnings:[]});
  assert.deepEqual(validateDefinition(mut({schema:'ag-cinder/0.1'})).errors,[],'0.1 stays valid');
  assert.deepEqual(validateDefinition(mut({schema:'ag-cinder/0.2'})).errors,[],'bearer_items is optional');
  const e=c=>validateDefinition(mut(c)).errors.join('\n');
  assert.match(e({schema:'ag-cinder/0.1',bearer_items:{active:'POWER-TEST-FLARE'}}),/needs cinder\.schema "ag-cinder\/0\.2"/);
  assert.match(e({schema:'ag-cinder/0.3'}),/ag-cinder\/0\.1" or "ag-cinder\/0\.2/);
  assert.match(e({schema:'ag-cinder/0.2',bearer_items:{active:'PERK-TEST-X'}}),/active must be a POWER-\* id/);
  assert.match(e({schema:'ag-cinder/0.2',bearer_items:{active:'POWER-TEST-X',extra:'POWER-TEST-Y'}}),/only takes active and passive/);
  assert.match(e({schema:'ag-cinder/0.2',bearer_items:['POWER-TEST-X']}),/must be an object/);
  assert.match(e({schema:'ag-cinder/0.2',bearer_items:{active:'POWER-TEST-X',passive:'POWER-TEST-X'}}),/different powers/);
  // Kinds.
  const active=pw('POWER-TEST-FLARE',{kind:'signature_active',standard:{summary:'[TEST] A flare.'},push_modes:[{id:'blaze',label:'[TEST] Blaze',strain_cost:2}]},ACTIVITIES);
  assert.deepEqual(validateDefinition(active),{errors:[],warnings:[]});
  const passive=pw('POWER-TEST-WARD',{kind:'signature_passive',standard:{summary:'[TEST] Always warded.'}},WARD_EFFECT);
  assert.deepEqual(validateDefinition(passive),{errors:[],warnings:[]});
  assert.match(validateDefinition(pw('POWER-TEST-X',{kind:'aura'})).errors.join(),/power\.kind must be power, enhancement, signature_active or signature_passive/);
  assert.match(validateDefinition(pw('POWER-TEST-WARD',{kind:'signature_passive',push_modes:[{id:'x',label:'x',strain_cost:1}]},WARD_EFFECT)).errors.join(),/signature_passive has no push_modes/);
  // Warnings, not errors: no use button, no transferring effect, modifiers that do not count.
  assert.match(validateDefinition(pw('POWER-TEST-FLARE',{kind:'signature_active'})).warnings.join(),/no foundry\.data\.system\.activities/);
  assert.match(validateDefinition(pw('POWER-TEST-WARD',{kind:'signature_passive'},{effects:[{eff_id:'w',name:'w',transfer:false,changes:[]}]})).warnings.join(),/no transferring Active Effect/);
  assert.match(validateDefinition(pw('POWER-TEST-WARD',{kind:'signature_passive',modifiers:[{target:'push.cost',value:-1,label:'x'}]},WARD_EFFECT)).warnings.join(),/not counted/);
  const journal=pw('POWER-TEST-FLARE',{kind:'signature_active'});journal.foundry.document_type='JournalEntry';
  assert.match(validateDefinition(journal).errors.join(),/must be an Item record/);
});

test('bearer item plan: one copy per Cinder and slot, duplicates / replaced / not borne removed, unreadable definitions left alone',()=>{
  const tag=(instanceId,slot,sourceId)=>({instanceId,slot,sourceId,definitionId:DEF});
  const items=[{id:'i1',tag:tag('c1','active','POWER-A')},{id:'i2',tag:tag('c1','active','POWER-A')},{id:'i3',tag:tag('c1','passive','POWER-OLD')},
    {id:'i4',tag:tag('c9','active','POWER-A')},{id:'perk',tag:null},{id:'i5',tag:tag('c2','passive','POWER-Q')}];
  const p=planBearerItems(items,[{instanceId:'c1',definitionId:DEF,items:{active:'POWER-A',passive:'POWER-B'}},{instanceId:'c2',definitionId:'MUT-TEST-X',items:null}]);
  assert.deepEqual(p.keep.map(k=>k.id),['i1','i5']);
  assert.deepEqual(p.remove.map(r=>[r.id,r.why]),[['i2','duplicate'],['i3','replaced'],['i4','not borne']]);
  assert.deepEqual(p.create,[{instanceId:'c1',definitionId:DEF,slot:'passive',sourceId:'POWER-B'}]);
  assert.deepEqual(planBearerItems(items.filter(i=>['i1','i5'].includes(i.id)),[{instanceId:'c1',definitionId:DEF,items:{active:'POWER-A'}},{instanceId:'c2',items:null}]),
    {keep:[{id:'i1',instanceId:'c1',slot:'active'},{id:'i5',instanceId:'c2',slot:'passive'}],remove:[],create:[]},'already right: nothing to do');
  // Tags: ours only; Skill Trees' grant copies never count, even if they carry our flag.
  assert.equal(bearerTag({flags:{[MOD]:{bearerItem:{instanceId:'c1',slot:'active'}},'ashen-gate-skill-trees':{grant:{perkId:'POWER-A'}}}},MOD),null);
  assert.equal(bearerTag({flags:{[MOD]:{bearerItem:{instanceId:'c1',slot:'other'}}}},MOD),null);
  const data=bearerItemData({_id:'W1',name:'x',folder:'F',sort:1,ownership:{default:2},flags:{'ashen-gate-manager':{source:{sourceId:'POWER-A'}},[MOD]:{attachedTo:{}}}},MOD,{instanceId:'c1',definitionId:DEF,slot:'active',sourceId:'POWER-A'});
  assert.deepEqual(Object.keys(data).sort(),['flags','name']);assert.deepEqual(data.flags[MOD],{bearerItem:{instanceId:'c1',definitionId:DEF,slot:'active',sourceId:'POWER-A'}});
  assert.ok(data.flags['ashen-gate-manager'],'the Manager source stays, so the power block can be read');
  assert.deepEqual(bearerItemsOf({cinder:{bearer_items:{active:'POWER-A',passive:'nope'}}}),{active:'POWER-A'});
  // What a player may change: use (spent uses), not mechanics.
  for(const ok of [{system:{uses:{spent:1}}},{'system.uses.spent':2},{system:{activities:{act1:{uses:{spent:1}}}}},{sort:5},{flags:{'tidy5e-sheet':{favorite:true}}}])assert.equal(playerUpdateProblem(ok),null,JSON.stringify(ok));
  for(const bad of [{name:'x'},{system:{uses:{max:'9'}}},{system:{activities:{act1:{damage:{parts:[]}}}}},{flags:{[MOD]:{bearerItem:null}}},{flags:{'ashen-gate-manager':{source:{}}}},{effects:[]},{'flags.-=ashen-gate-cinders':null}])
    assert.match(playerUpdateProblem(bad)??'',/Only the GM/,JSON.stringify(bad));
});

// ---- Runtime with mocked Foundry and a stand-in Skill Trees 0.17.0 ----
class FakeApplication {static DEFAULT_OPTIONS={};render(){return this;}async _prepareContext(){return {};}}
const oneTime=new Map(),hooks=new Map(),saved=new Map(),socketHandlers=[],emitted=[],messages=[],rolls=[],dialogs=[],answers=[],warnings=[];
const Hooks_={once:(e,fn)=>oneTime.set(e,fn),on:(e,fn)=>hooks.set(e,[...(hooks.get(e)??[]),fn]),callAll:(e,d)=>{for(const fn of hooks.get(e)??[])fn(d);}};
globalThis.Hooks=Hooks_;
let counter=0;
const DialogV2={wait:async o=>{dialogs.push(o);const a=answers.shift();const b=o.buttons.find(x=>x.action===a);return b?b.callback():null;}};
globalThis.foundry={applications:{api:{ApplicationV2:FakeApplication,HandlebarsApplicationMixin:B=>B,DialogV2}},utils:{escapeHTML:x=>String(x),randomID:()=>`R${String(++counter).padStart(15,'0')}`}};
globalThis.Roll=class{constructor(f){this.formula=f;}async evaluate(){const t=rolls.shift();if(t==null)throw Error(`unexpected roll ${this.formula}`);this.total=t;return this;}};
globalThis.ChatMessage={create:async d=>{messages.push(d);return d;},getSpeaker:({actor})=>({actor:actor.id})};
globalThis.CONFIG={statusEffects:[{id:'poisoned',name:'Poisoned',img:'poisoned.svg'}]};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0}};

const source=(sourceId,entityType,definition)=>({'ashen-gate-manager':{source:{sourceId,entityType,status:'approved',visibility:'player',definition:{id:sourceId,entity_type:entityType,...definition}}}});
const worldItem=(id,sourceId,name,entityType,definition,extra={})=>({id,uuid:`Item.${id}`,documentName:'Item',type:'feat',name,img:null,ownership:{default:2},system:{description:{value:''},...extra.system},effects:extra.effects??[],
  testUserPermission:()=>true,flags:source(sourceId,entityType,definition),
  toObject(){return structuredClone({_id:this.id,name:this.name,type:this.type,img:this.img,system:this.system,effects:this.effects,folder:'F1',sort:7,ownership:this.ownership,flags:this.flags});}});
const bf=(id,sourceId,label,entries)=>({id,uuid:`JournalEntry.${id}`,documentName:'JournalEntry',name:label,ownership:{default:0},testUserPermission:u=>u.isGM,
  flags:{'ashen-gate-manager':{source:{sourceId,entityType:'BackfireTable',status:'approved',visibility:'gm',definition:{id:sourceId,entity_type:'BackfireTable',backfire:{schema:'ag-backfire/0.1',label,entries}}}}}});
const node=(id,perkId,x)=>({id,perkId,x,y:100,requiresAll:[],requiresAny:[],excludes:[],status:'approved',visibility:'player',display:'shown'});
const tree={id:'TEST-EMBER-TREE',name:'[TEST] Ember',sourceRef:DEF,provider:{kind:'cinder_milestone',maxPoints:16},
  nodes:[node('NODE1','POWER-TEST-SPARK',100),node('NODE2','POWER-TEST-STEADY',300),node('NODE3','POWER-TEST-REACH',500)]};
const otherTree={id:'TEST-ASH-TREE',name:'[TEST] Ash',sourceRef:'MUT-TEST-ASH',provider:{kind:'cinder_milestone',maxPoints:16},nodes:[]};
const items=[
  worldItem('W0',DEF,'[TEST] Ember Cinder','Mutation',{cinder:{schema:'ag-cinder/0.2',backfire_categories:['BF-TEST-BODY'],bearer_items:{active:'POWER-TEST-FLARE',passive:'POWER-TEST-WARD'}}}),
  worldItem('W5','MUT-TEST-ASH','[TEST] Ash Cinder','Mutation',{cinder:{schema:'ag-cinder/0.2',bearer_items:{active:'POWER-TEST-GONE',passive:'POWER-TEST-FLARE'}}}),
  worldItem('W1','POWER-TEST-SPARK','[TEST] Spark','Power',{power:{schema:'ag-power/0.1',kind:'power',push_modes:[{id:'amplify',label:'[TEST] Amplify',strain_cost:2}]}}),
  worldItem('W2','POWER-TEST-STEADY','[TEST] Steady','Power',{power:{schema:'ag-power/0.1',kind:'enhancement',modifiers:[{target:'push.cost',value:-1,label:'[TEST] Light Touch'}]}}),
  worldItem('W3','POWER-TEST-REACH','[TEST] Reach','Power',{power:{schema:'ag-power/0.1',kind:'enhancement'}}),
  worldItem('W6','POWER-TEST-FLARE','[TEST] Flare','Power',{power:{schema:'ag-power/0.1',kind:'signature_active',standard:{summary:'[TEST] A flare of light.'},
    push_modes:[{id:'blaze',label:'[TEST] Blaze',strain_cost:2,effect:'[TEST] Brighter.'},{id:'inferno',label:'[TEST] Inferno',strain_cost:3,requires:{powers:['POWER-TEST-REACH']}}]}},ACTIVITIES),
  worldItem('W7','POWER-TEST-WARD','[TEST] Ward','Power',{power:{schema:'ag-power/0.1',kind:'signature_passive',standard:{summary:'[TEST] Always warded.'}}},WARD_EFFECT)];
const tables=[bf('J1','BF-TEST-BODY','[TEST] Body',[{id:'jolt',text:'[TEST] A jolt.'},{id:'ache',text:'[TEST] An ache.'}])];
const setPath=(obj,path,value)=>{const k=path.split('.');let o=obj;for(const p of k.slice(0,-1))o=o[p]??={};o[k.at(-1)]=structuredClone(value);};
const gm={id:'gm',isGM:true,name:'GM'},alice={id:'u1',isGM:false,name:'Alice'},bob={id:'u2',isGM:false,name:'Bob'};
class Items extends Array {get(id){return this.find(i=>i.id===id);}}
const ops={created:0,deleted:0};
function makeActor(id,ownerId){
  const actor={id,name:`[TEST] ${id}`,type:'character',flags:{},items:new Items(),effects:[],system:{},
    get isOwner(){return game.user.isGM||game.user.id===ownerId;},testUserPermission:u=>u.isGM||u.id===ownerId,
    async update(data){for(const [k,v] of Object.entries(data))setPath(this,k,v);return this;},
    async setFlag(m,k,v){this.flags[m]??={};this.flags[m][k]=structuredClone(v);},
    async createEmbeddedDocuments(type,data){
      if(type==='ActiveEffect'){const docs=data.map(d=>({...structuredClone(d),id:`AE${++counter}`}));actor.effects.push(...docs);return docs;}
      const docs=data.map(d=>{ops.created++;const doc={...structuredClone(d),id:`EMB${++counter}`,parent:actor,actor,documentName:'Item',
        async delete(){ops.deleted++;actor.items=Items.from(actor.items.filter(x=>x!==doc));},async setFlag(m,k,v){this.flags??={};this.flags[m]??={};this.flags[m][k]=structuredClone(v);}};return doc;});
      actor.items.push(...docs);return docs;}};
  return actor;
}
const A=makeActor('A','u1'),B=makeActor('B','u2'),C=makeActor('C','u2');
const st=fakeSkillTrees({trees:[tree,otherTree],worldItem:id=>items.find(i=>i.flags['ashen-gate-manager'].source.sourceId===id),hooks:Hooks_});
globalThis.game={modules:new Map([[MOD,{id:MOD,active:true}],['ashen-gate-skill-trees',{id:'ashen-gate-skill-trees',active:true,api:st.api}]]),i18n:{localize:x=>x},
  settings:{register:(_m,k,o)=>{if(o?.default!==undefined&&!saved.has(k))saved.set(k,o.default);},registerMenu:()=>{},get:(_m,k)=>saved.get(k),set:async(_m,k,v)=>{saved.set(k,v);return v;}},
  journal:{contents:[...tables]},items:{contents:items},tables:{contents:[]},macros:{contents:[]},
  actors:{contents:[A,B,C],get(id){return this.contents.find(a=>a.id===id)??null;}},
  user:gm,users:{contents:[gm,alice,bob],get:id=>[gm,alice,bob].find(u=>u.id===id),activeGM:gm},
  socket:{on:(_n,fn)=>socketHandlers.push(fn),emit:(_n,msg)=>emitted.push(msg)}};
globalThis.JournalEntry={create:async data=>{const d={...structuredClone(data),documentName:'JournalEntry',async setFlag(m,k,v){this.flags[m][k]=structuredClone(v);}};game.journal.contents.push(d);return d;}};
globalThis.ui={actors:null,notifications:{info:()=>{},error:m=>warnings.push(m),warn:m=>warnings.push(m)}};
saved.set('strainChip',false);
const main=await import('../scripts/main.mjs');
oneTime.get('init')();oneTime.get('ready')();
await new Promise(r=>setTimeout(r,5));
const api=game.modules.get(MOD).api,cinder=api.cinder,strain=api.strain;
const settle=()=>new Promise(r=>setTimeout(r,5));
const gmSet=async(a,n)=>strain.set(a,n,{source:{module:'ashen-gate-test',kind:'gm'},reason:'[TEST] set'});
const tagged=a=>[...a.items].filter(i=>i.flags?.[MOD]?.bearerItem).map(i=>[i.flags[MOD].bearerItem.slot,i.flags[MOD].bearerItem.sourceId]).sort();
const grants=a=>[...a.items].filter(i=>i.flags?.['ashen-gate-skill-trees']?.grant).map(i=>i.flags['ashen-gate-skill-trees'].grant.perkId).sort();
const bearerItem=(a,slot)=>a.items.find(i=>i.flags?.[MOD]?.bearerItem?.slot===slot);
let msgN=0;
/** dnd5e 6.0.6 calls Hooks.call('dnd5e.postUseActivity', activity, usageConfig, results) once per use, after the use (activity.item is a clone). */
const use=async(item,{message=`MSG${++msgN}`}={})=>{for(const fn of hooks.get('dnd5e.postUseActivity')??[])await fn({item:{...item}},{},{message:{id:message}});};
const guard=(ev,...args)=>(hooks.get(ev)??[]).map(fn=>fn(...args)).find(r=>r===false)??true;
let ember;

test('bind gives the bearer its signature ability and passive, tagged with the Cinder, at no points',async()=>{
  game.user=gm;ember=await cinder.create(DEF);
  const r=await cinder.bind(ember.instanceId,A);
  assert.deepEqual(r.bearerItems.problems,[]);
  assert.deepEqual(tagged(A),[['active','POWER-TEST-FLARE'],['passive','POWER-TEST-WARD']]);
  const act=bearerItem(A,'active');
  assert.deepEqual(act.flags[MOD].bearerItem,{instanceId:ember.instanceId,definitionId:DEF,slot:'active',sourceId:'POWER-TEST-FLARE'});
  assert.deepEqual(act.system.activities.act1.uses.recovery,[{period:'lr'}],'the item keeps its dnd5e use button, uses and recovery');
  assert.equal(bearerItem(A,'passive').effects[0].transfer,true,'the passive keeps its transferring effect');
  assert.equal(act.folder,undefined);assert.equal(act.ownership,undefined);
  assert.equal(st.api.accounts.account(A,tree.id).awarded,1,'only the starting point: the bearer items cost nothing');
  assert.deepEqual(grants(A),[],'not tree nodes');
  // Again: nothing doubles.
  await cinder.rehook(A);assert.equal(tagged(A).length,2);
});
test('list (additive): the signature ability with its Push modes, the passive with its summary; tree powers modify the Push',async()=>{
  game.user=gm;await gmSet(A,3);
  let [c]=cinder.list(A);
  assert.deepEqual({...c.signature.active,modes:c.signature.active.modes.map(m=>[m.id,m.cost,m.after,m.chance])},
    {powerId:'POWER-TEST-FLARE',name:'[TEST] Flare',itemId:bearerItem(A,'active').id,summary:'[TEST] A flare of light.',modes:[['blaze',2,5,35]]});
  assert.deepEqual(c.signature.passive,{powerId:'POWER-TEST-WARD',name:'[TEST] Ward',itemId:bearerItem(A,'passive').id,summary:'[TEST] Always warded.'});
  assert.equal(c.powers.length,0,'the signature ability is not listed among tree powers');
  // Unlock Steady (push.cost -1) and Reach (opens Inferno through requires.powers): the tree extends the signature ability.
  await st.api.grantPoints(A,tree.id,3,'[TEST] m');await st.api.unlock(A,tree.id,'NODE1');await st.api.unlock(A,tree.id,'NODE2');await st.api.unlock(A,tree.id,'NODE3');await settle();
  [c]=cinder.list(A);
  assert.deepEqual(c.signature.active.modes.map(m=>[m.id,m.cost]),[['blaze',1],['inferno',2]]);
  assert.deepEqual(grants(A),['POWER-TEST-REACH','POWER-TEST-SPARK','POWER-TEST-STEADY']);
  game.user=alice;assert.equal(cinder.list(A)[0].signature.active.modes.length,2,'the owner reads it from their own items');
  assert.equal(cinder.previewPush(A,ember.instanceId,'POWER-TEST-FLARE','blaze').cost,1);
  game.user=bob;assert.throws(()=>cinder.list(A),/Actor access denied/);
  game.user=gm;
  const view=main.sheetView(A,cinder.list(A)[0],null,{strainState:strain.get(A),offer:{world:true,local:true}});
  assert.deepEqual(view.signature.map(s=>[s.label,s.name,s.summary]),[['Signature ability','[TEST] Flare','[TEST] A flare of light.'],['Passive','[TEST] Ward','[TEST] Always warded.']]);
  assert.equal(view.offerToggle,true);
  assert.deepEqual(view.signature.map(s=>s.badge),['Signature','Passive'],'0.11.0: the first rows of Powers, badged');
  assert.ok(view.signature[0].modes.length>0&&view.signature[0].modes.every(m=>typeof m.cost==='number'&&'mods' in m),'the same mode stats as tree powers');
  assert.equal(view.hasDeviceOptions,true,'the Push offer switch sits in "On this device"');
  assert.equal(main.sheetView(A,cinder.list(A)[0],null,{strainState:strain.get(A),offer:{world:false,local:true}}).offerToggle,false,'no device switch while the GM has it off');
});
test('using the signature ability offers a Push once; choosing a mode runs the Push; "Use without Push" leaves the use alone',async()=>{
  game.user=gm;await gmSet(A,2);const flare=bearerItem(A,'active');
  dialogs.length=0;messages.length=0;answers.push('blaze');rolls.push(99);
  await use(flare,{message:'M-1'});
  assert.equal(dialogs.length,1);assert.equal(dialogs[0].window.title,'Push [TEST] Flare?');
  assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Use without Push','Push [TEST] Blaze (+1 Strain, Backfire 20%)','Push [TEST] Inferno (+2 Strain, Backfire 25%)']);
  assert.equal(strain.get(A).value,3);assert.equal(messages.length,1);assert.match(messages[0].content,/Push: \[TEST\] Flare/);
  const last=strain.history(A).at(-1);assert.deepEqual([last.source.kind,last.source.ref],['push','POWER-TEST-FLARE']);
  await use(flare,{message:'M-1'});assert.equal(dialogs.length,1,'never twice for one use');
  answers.push('cancel');await use(flare);
  assert.equal(dialogs.length,2);assert.equal(strain.get(A).value,3,'Use without Push: no Strain');assert.equal(messages.length,1,'and no card below the normal-use point');
  // Not for other items: a Cinder tree power or the passive.
  const spark=A.items.find(i=>i.flags?.['ashen-gate-skill-trees']?.grant?.perkId==='POWER-TEST-SPARK');
  await use(spark);await use(bearerItem(A,'passive'));await use({id:'X',name:'[TEST] Sword',flags:{},actor:A});
  assert.equal(dialogs.length,2);assert.equal(messages.length,1);
});
test('one mode: Cinders\' Push confirm (Push / Use without Push); at the normal-use point the automatic Backfire still applies',async()=>{
  game.user=gm;
  // Lose Reach for this test: only Blaze is left.
  const reach=A.items.find(i=>i.flags?.['ashen-gate-skill-trees']?.grant?.perkId==='POWER-TEST-REACH');const acc=st.api.accounts.account(A,tree.id);
  await st.api.accounts.setAccount(A,tree.id,{...acc,unlocks:acc.unlocks.filter(n=>n!=='NODE3')});await settle();assert.ok(reach);
  await gmSet(A,10);dialogs.length=0;messages.length=0;
  answers.push('cancel');rolls.push(1);await use(bearerItem(A,'active'));
  assert.equal(dialogs[0].window.title,'Push [TEST] Blaze?');assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Use without Push','Push']);
  assert.match(dialogs[0].content,/\+1 Strain, Backfire 100% \(guaranteed\)/);
  assert.equal(messages.length,1,'automatic Backfire on the normal use');assert.match(messages[0].content,/\[TEST\] Flare: Backfire/);assert.equal(strain.get(A).value,10,'no Strain added');
  answers.push('confirm');rolls.push(1);await use(bearerItem(A,'active'));
  assert.equal(messages.length,2,'a Push instead: one card, not a Push and a normal-use Backfire');assert.equal(strain.get(A).value,11);
  await gmSet(A,2);
});
test('the offer is a world switch (default on) and a per-device switch; off means a normal use',async()=>{
  game.user=gm;dialogs.length=0;
  assert.equal(saved.get(main.PUSH_OFFER_SETTING),true);assert.equal(saved.get(main.PUSH_OFFER_LOCAL_SETTING),true);
  saved.set(main.PUSH_OFFER_SETTING,false);await use(bearerItem(A,'active'));assert.equal(dialogs.length,0);
  saved.set(main.PUSH_OFFER_SETTING,true);saved.set(main.PUSH_OFFER_LOCAL_SETTING,false);await use(bearerItem(A,'active'));assert.equal(dialogs.length,0);
  saved.set(main.PUSH_OFFER_LOCAL_SETTING,true);
  await gmSet(A,10);messages.length=0;saved.set(main.PUSH_OFFER_SETTING,false);rolls.push(1);await use(bearerItem(A,'active'));
  assert.equal(messages.length,1,'offer off: the normal-use Backfire still applies');saved.set(main.PUSH_OFFER_SETTING,true);await gmSet(A,2);
});
test('a player\'s Push from the use button is rolled on the GM client',async()=>{
  game.user=gm;await gmSet(A,2);dialogs.length=0;emitted.length=0;
  game.user=alice;answers.push('confirm');
  const done=use(bearerItem(A,'active'));await settle();
  const msg=emitted.at(-1);assert.deepEqual([msg.type,msg.powerId,msg.modeId],['cinder-push','POWER-TEST-FLARE','blaze']);
  game.user=gm;rolls.push(99);for(const h of socketHandlers)await h(msg,'u1');const reply=emitted.at(-1);assert.equal(reply.ok,true,reply.message);
  game.user=alice;for(const h of socketHandlers)await h(reply,'gm');await done;
  game.user=gm;assert.equal(strain.get(A).value,3);
  // Player Access off: no offer for players.
  game.user=alice;saved.set('playerAccessEnabled',false);dialogs.length=0;
  try{await use(bearerItem(A,'active'));assert.equal(dialogs.length,0);}finally{saved.set('playerAccessEnabled',true);game.user=gm;}
});
test('players can use the items but not change their mechanics, remove, copy or re-effect them; the GM can',()=>{
  const act=bearerItem(A,'active'),spark=A.items.find(i=>i.flags?.['ashen-gate-skill-trees']?.grant);warnings.length=0;
  game.user=alice;
  assert.equal(guard('preUpdateItem',act,{system:{uses:{spent:1}}},{},'u1'),true);
  assert.equal(guard('preUpdateItem',act,{system:{activities:{act1:{uses:{spent:1}}}}},{},'u1'),true);
  assert.equal(guard('preUpdateItem',act,{name:'[TEST] Mine now'},{},'u1'),false);
  assert.equal(guard('preUpdateItem',act,{system:{activities:{act1:{consumption:{targets:[]}}}}},{},'u1'),false);
  assert.equal(guard('preDeleteItem',act,{},'u1'),false);
  assert.equal(guard('preCreateItem',{flags:{}},{flags:{[MOD]:{bearerItem:{instanceId:'x',slot:'active'}}}},{},'u1'),false);
  assert.equal(guard('preUpdateActiveEffect',{parent:bearerItem(A,'passive')},{disabled:true},{},'u1'),false);
  assert.equal(guard('preDeleteActiveEffect',{parent:bearerItem(A,'passive')},{},'u1'),false);
  assert.equal(guard('preUpdateItem',spark,{name:'x'},{},'u1'),true,'other items are not ours to guard');
  assert.ok(warnings.some(w=>/Only the GM/.test(w)));
  game.user=gm;
  assert.equal(guard('preUpdateItem',act,{name:'[TEST] GM rename'},{},'gm'),true);assert.equal(guard('preDeleteItem',act,{},'gm'),true);
});
test('Check reports missing and extra bearer items; Repair (re-runnable) fixes them and leaves Skill Trees\' perk copies alone',async()=>{
  game.user=gm;const perksBefore=grants(A);
  assert.deepEqual(cinder.report().filter(r=>/signature|passive/.test(r.text)),[]);
  // A second copy, a lost passive and a stray copy on someone who does not bear the Cinder.
  await A.createEmbeddedDocuments('Item',[structuredClone({name:'[TEST] Flare',flags:bearerItem(A,'active').flags})]);
  await bearerItem(A,'passive').delete();
  await B.createEmbeddedDocuments('Item',[{name:'[TEST] Flare',flags:{[MOD]:{bearerItem:{instanceId:ember.instanceId,definitionId:DEF,slot:'active',sourceId:'POWER-TEST-FLARE'}}}}]);
  const rows=cinder.report().filter(r=>r.repair&&/signature|passive/.test(r.text)).map(r=>r.text).sort();
  assert.deepEqual(rows,['[TEST] A has an extra signature ability item (a second copy).','[TEST] A is missing this Cinder\'s passive.',
    '[TEST] B has an extra signature ability item (does not bear that Cinder).']);
  const keep=bearerItem(A,'active').id;
  await cinder.repair();
  assert.deepEqual(tagged(A),[['active','POWER-TEST-FLARE'],['passive','POWER-TEST-WARD']]);assert.deepEqual(tagged(B),[]);
  assert.equal(bearerItem(A,'active').id,keep,'the first copy is kept (its spent uses with it)');
  assert.deepEqual(grants(A),perksBefore,'Skill Trees\' tagged perk copies untouched');
  assert.deepEqual(cinder.report().filter(r=>/signature|passive/.test(r.text)),[]);
  const before={...ops};await cinder.repair();assert.deepEqual(ops,before,'nothing left to do: no writes');
});
// 0.11.0 (CN-04): Manage → Check → Repair… asks first, listing the rows; it removes items here, so Cancel is the default.
test('Repair… asks first ("Repair Cinders?", Cancel default when it removes items); Cancel changes nothing',async()=>{
  game.user=gm;
  await B.createEmbeddedDocuments('Item',[{name:'[TEST] Flare',flags:{[MOD]:{bearerItem:{instanceId:ember.instanceId,definitionId:DEF,slot:'active',sourceId:'POWER-TEST-FLARE'}}}}]);
  assert.equal(main.repairRemoves(cinder.report()),true);
  const app=api.open();dialogs.length=0;answers.push('cancel');
  const before={...ops};await app._act({dataset:{act:'cinder-repair'}});
  assert.equal(dialogs.length,1);const d=dialogs[0];
  assert.equal(d.window.title,'Repair Cinders?');assert.deepEqual(d.buttons.map(b=>[b.label,b.default]),[['Cancel',true],['Repair',false]]);
  assert.match(d.content,/\[TEST\] B has an extra signature ability item/);assert.match(d.content,/Items are taken off characters/);
  assert.deepEqual(ops,before,'Cancel: nothing removed');assert.equal(tagged(B).length,1);
  answers.push('confirm');await app._act({dataset:{act:'cinder-repair'}});
  assert.deepEqual(tagged(B),[],'Repair ran after the confirmation');
  dialogs.length=0;await app._act({dataset:{act:'cinder-repair'}});assert.equal(dialogs.length,0,'nothing to repair: no question');
  assert.equal(main.repairRemoves([{repair:true,text:'[TEST] A is missing this Cinder\'s passive.'}]),false,'only giving items is not a removal');
});
test('transfer moves the bearer items; unbind removes them; Hub Restore (rehook) recreates them',async()=>{
  game.user=gm;
  const r=await cinder.transfer(ember.instanceId,B);await settle();
  assert.deepEqual(r.bearerItems.problems,[]);
  assert.deepEqual(tagged(A),[]);assert.deepEqual(tagged(B),[['active','POWER-TEST-FLARE'],['passive','POWER-TEST-WARD']]);
  assert.ok(grants(B).length,'tree powers moved too');
  // Level-backup Restore replaces the Actor's items (here: they are gone); rehook gives them back.
  for(const i of [...B.items])if(i.flags?.[MOD]?.bearerItem)await i.delete();
  const back=await cinder.rehook(B);assert.ok(back.done.some(t=>/gained \[TEST\] Flare/.test(t)));assert.equal(tagged(B).length,2);
  await cinder.unbind(ember.instanceId);assert.deepEqual(tagged(B),[]);
  await cinder.bind(ember.instanceId,B);assert.equal(tagged(B).length,2);
});
test('a source missing or of the wrong kind never blocks a bind: it is named, and Check says so without offering Repair',async()=>{
  game.user=gm;const ash=await cinder.create('MUT-TEST-ASH');
  const r=await cinder.bind(ash.instanceId,C);
  assert.equal(r.instance.bearer.actorId,'C');
  assert.equal(r.bearerItems.problems.length,2);
  assert.match(r.bearerItems.problems.join('\n'),/The Cinder's signature ability is not in this world/);
  assert.match(r.bearerItems.problems.join('\n'),/The Cinder's passive is a signature_active, not a signature_passive/);
  assert.deepEqual(tagged(C),[]);
  const rows=cinder.report().filter(r=>r.instanceId===ash.instanceId);
  assert.equal(rows.length,2);assert.ok(rows.every(r=>!r.repair));
});
test('the definition unreadable for a moment strips nothing; a deleted bearer (Cinder Lost) needs nothing',async()=>{
  game.user=gm;
  // The MUT-* record archived for a moment: Repair and Check leave B's copies as they are.
  const mutDoc=items.find(i=>i.id==='W0');mutDoc.flags['ashen-gate-manager'].lifecycle={archived:true};
  try{let before={...ops};await cinder.repair();assert.deepEqual(ops,before);assert.equal(tagged(B).length,2);
    assert.deepEqual(cinder.report().filter(r=>r.actorId==='B'&&/signature|passive/.test(r.text)),[]);}
  finally{delete mutDoc.flags['ashen-gate-manager'].lifecycle;}
  const before={...ops};
  for(const fn of hooks.get('deleteActor')??[])await fn(B);await settle();
  assert.deepEqual(ops,before,'no item writes');
  assert.equal(cinder.instances().find(i=>i.instanceId===ember.instanceId).status,'lost');
});
