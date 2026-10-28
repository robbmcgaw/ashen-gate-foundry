/** 0.13.0 UI pass: behaviour behind the new controls, in an in-memory Foundry V14-shaped harness (copied from
 * pantheon-runtime). NOT a browser test: it proves the logic, not the look. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeFaction,sourceDefinition,makeGroupRecord} from '../scripts/core.mjs';
import {makeDeity} from '../scripts/deity.mjs';
import {standingView,markCurrent} from '../scripts/standing-view.mjs';

const hooks=new Map(),socketHandlers=new Map();
globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn),once:(name,fn)=>hooks.set(name,fn)};
globalThis.HTMLElement=class{};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{NONE:0,OBSERVER:2,OWNER:3}};
class V2{constructor(options={}){this.options=options;this.renders=0;}async render(){this.rendered=true;this.renders++;return this;}async close(){this.rendered=false;return this;}async _prepareContext(){return{};}async _onRender(){}}
// Dialogs: every DialogV2.wait call is recorded and answered by `answer` ('cancel' | 'confirm' | 'ok' with a typed value).
const dialogs=[];let answer='cancel',typed='';
const DialogV2={wait:async o=>{dialogs.push(o);const b=o.buttons.find(x=>x.action===answer)??o.buttons[0];return b.callback({}, {form:{elements:[{name:'value',value:typed}]}});},prompt:async o=>{dialogs.push(o);}};
let ctr=1;
globalThis.foundry={applications:{api:{ApplicationV2:V2,HandlebarsApplicationMixin:C=>C,DialogV2}},utils:{randomID:()=>String(ctr++).padStart(24,'A')}};
const journal=[];journal.get=id=>journal.find(d=>d.id===id);
const folders=[];
globalThis.Folder={create:async data=>{const f={id:'F'+(folders.length+1),name:data.name,type:data.type,flags:structuredClone(data.flags??{}),getFlag(mod,key){return this.flags[mod]?.[key]}};folders.push(f);return f;}};
let count=0;
function makeDoc(data){const doc={id:'J'+(++count),name:data.name,folder:data.folder??null,flags:structuredClone(data.flags??{}),ownership:structuredClone(data.ownership??{default:0}),
  getFlag(mod,key){return this.flags[mod]?.[key]},
  async setFlag(mod,key,val){this.flags[mod]??={};this.flags[mod][key]=structuredClone(val);return this;},
  async update(p){if(p.name!==undefined)this.name=p.name;if(p.folder!==undefined)this.folder=p.folder;if(p.ownership)this.ownership=structuredClone(p.ownership);for(const [key,val] of Object.entries(p)){if(!key.startsWith('flags.'))continue;const [,mod,flag]=key.split('.');this.flags[mod]??={};this.flags[mod][flag]=structuredClone(val);}return this;},
  testUserPermission(user,level){return Boolean(user.isGM||(this.ownership[user.id]??this.ownership.default)>=level);}
};journal.push(doc);return doc;}
globalThis.JournalEntry={create:async x=>makeDoc(x),updateDocuments:async rows=>{for(const row of rows)await journal.get(row._id).update(row);return rows;}};
const gm={id:'gm',name:'GM',isGM:true,active:true},p1={id:'p1',name:'Player One',isGM:false,active:true};
const users=[gm,p1];users.get=id=>users.find(x=>x.id===id);
const actor1={id:'A1',name:'[TEST] Hero',type:'character',ownership:{p1:3},items:[],testUserPermission(user,level){return user.isGM||this.ownership[user.id]>=level;}};
const actors=[actor1];actors.get=id=>actors.find(x=>x.id===id);
const settings={},writes=[],notify=[];
const mod={api:null,version:'9.9.9'};
globalThis.game={user:gm,users,actors,journal,folders,modules:{get:()=>mod},settings:{register:(m,key,v)=>{settings[key]=v.default;},get:(m,key)=>settings[key],set:async(m,key,v)=>{writes.push(key);settings[key]=v;}},socket:{on:(id,fn)=>socketHandlers.set(id,fn),emit:(id,p)=>socketHandlers.get(id)?.(p)}};
globalThis.ui={actors:{},notifications:{info:s=>notify.push(s),warn:s=>notify.push(s),error:s=>notify.push('ERROR '+s)}};
const ns='ashen-gate-factions';
const guild=makeFaction({id:'FACTION-UI-G',trackId:'RENOWN-UI-G',name:'[TEST] Guild'});
guild.rewards.push({id:'rw-ui',key:'rw_ui',audience:'group',milestone_id:guild.renown_track.milestones[1].id,name:'[TEST] Boon',teaser:'[TEST] Boon',kind:'custom',description:'',tags:[],behavior:'one_time',usage_limit:0});
guild.entries.push({id:'info_ui',name:'[TEST] Rumor',text:'x',link_mode:'preview',unlock:'manual',threshold:0,discovered_party:false,discovered_actors:[]});
makeDoc({name:guild.name,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(guild)}}});
const sun=makeDeity({id:'DEITY-UI-SUN',trackId:'RENOWN-UI-SUN',name:'[TEST] Sun'});sun.deity.relations=[{deity_id:'DEITY-UI-MOON',resonance:1}];
makeDoc({name:sun.name,ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(sun)}}});
makeDoc({name:'[TEST] Moon',ownership:{default:0},flags:{[ns]:{faction:sourceDefinition(makeDeity({id:'DEITY-UI-MOON',trackId:'RENOWN-UI-MOON',name:'[TEST] Moon'}))}}});
await import('../scripts/module.mjs');hooks.get('init')();hooks.get('ready')();
await new Promise(r=>setTimeout(r,30));
const dashboard=mod.api.open(),actions=dashboard.constructor.DEFAULT_OPTIONS.actions;
const def=id=>journal.find(d=>d.getFlag(ns,'faction')?.id===id).getFlag(ns,'faction');
const groupDoc=id=>journal.find(d=>d.getFlag(ns,'groupClaims')?.faction_id===id);
const ask=async(mode,fn)=>{answer=mode;const before=dialogs.length;await fn();return dialogs.slice(before);};
const template=readFileSync(new URL('../templates/dashboard.hbs',import.meta.url),'utf8');
const code=readFileSync(new URL('../scripts/module.mjs',import.meta.url),'utf8');

test('D4: GM Setup writes Player Access, damping and group name only on Save Changes',async()=>{
  // Nothing in the window listens for changes to the setup inputs, so ticking a box writes nothing.
  assert.doesNotMatch(code,/player-access-enabled\][^;]*addEventListener|matches\('\[name=player-access-enabled\]'\)/);
  const values={'player-access-enabled':false,'group-name-enabled':true,'group-name':'[TEST] Wardens','pantheon-damping':'0.25','faction-damping':'0.5','locked-ranks':'flavor'};
  const form={querySelector:sel=>{const k=sel.match(/name="?([\w-]+)/)?.[1];return k in values?{value:String(values[k]),checked:values[k]===true}:null;}};
  dashboard.element={querySelector:sel=>sel==='[data-setup-form]'?form:null};
  writes.length=0;
  await actions.saveSetup.call(dashboard);
  assert.deepEqual(writes.sort(),['groupName','groupNameEnabled','pantheonDamping','playerAccessEnabled']);
  assert.equal(settings.playerAccessEnabled,false);assert.equal(settings.pantheonDamping,0.25);assert.equal(settings.groupName,'[TEST] Wardens');assert.equal(settings.groupNameEnabled,true);
  // Saving again with nothing changed writes nothing.
  writes.length=0;await actions.saveSetup.call(dashboard);assert.deepEqual(writes,[]);
  // An invalid value stops the whole save: nothing is written, including the valid Player Access change.
  values['player-access-enabled']=true;values['pantheon-damping']='5';writes.length=0;
  await actions.saveSetup.call(dashboard);
  assert.deepEqual(writes,[]);assert.equal(settings.playerAccessEnabled,false);assert.match(notify.at(-1),/Damping must be/);
  values['pantheon-damping']='0.25';await actions.saveSetup.call(dashboard);assert.equal(settings.playerAccessEnabled,true);
  // Players cannot save GM Setup.
  game.user=p1;writes.length=0;await actions.saveSetup.call(dashboard);game.user=gm;
  assert.deepEqual(writes,[]);assert.match(notify.at(-1),/GM authorization required/);
  // Same setting key; the old instant Save Player Access button is gone.
  assert.doesNotMatch(template,/savePlayerAccess|saveDamping|saveGroupLabel/);
  assert.match(template,/data-setup-form[\s\S]*name="player-access-enabled"[\s\S]*name="pantheon-damping"[\s\S]*name="group-name"[\s\S]*data-action="saveSetup">Save Changes</);
});

test('remove reward: asks first (red "Remove reward"); Cancel changes nothing',async()=>{
  await actions.select.call(dashboard,null,{dataset:{id:'FACTION-UI-G'}});
  let seen=await ask('cancel',()=>actions.removeReward.call(dashboard,null,{dataset:{reward:'rw-ui'}}));
  assert.equal(seen.length,1);assert.equal(seen[0].window.title,'Remove [TEST] Boon?');assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.deepEqual(seen[0].buttons.map(b=>b.label),['Cancel','Remove reward']);
  assert.deepEqual(seen[0].buttons.map(b=>Boolean(b.default)),[true,false],'Cancel is the default button (confirmDanger)');
  assert.ok(def('FACTION-UI-G').rewards.some(r=>r.id==='rw-ui'),'Cancel kept the reward');
  await ask('confirm',()=>actions.removeReward.call(dashboard,null,{dataset:{reward:'rw-ui'}}));
  assert.ok(!def('FACTION-UI-G').rewards.some(r=>r.id==='rw-ui'),'confirmed remove deletes it');
});

test('remove entry, reset charges, clear choice and remove relation are danger confirms; Cancel does nothing',async()=>{
  let seen=await ask('cancel',()=>actions.showEntry.call(dashboard,null,{dataset:{entry:'info_ui',mode:'remove'}}));
  assert.equal(seen[0].window.title,'Remove [TEST] Rumor?');assert.equal(seen[0].buttons.find(b=>b.default).label,'Cancel');assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.ok(def('FACTION-UI-G').entries.some(e=>e.id==='info_ui'));
  const milestone=def('FACTION-UI-G').renown_track.milestones[1].id,group=groupDoc('FACTION-UI-G');
  const before=JSON.stringify(group.getFlag(ns,'groupClaims'));
  seen=await ask('cancel',()=>actions.resetChoice.call(dashboard,null,{dataset:{audience:'group',milestone}}));
  assert.equal(seen[0].window.title,`Clear the choice for ${def('FACTION-UI-G').renown_track.milestones[1].name}?`);assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.equal(JSON.stringify(group.getFlag(ns,'groupClaims')),before);
  await actions.editDeity.call(dashboard,null,{dataset:{id:'DEITY-UI-SUN'}});
  seen=await ask('cancel',()=>actions.removeRelation.call(dashboard,null,{dataset:{target:'DEITY-UI-MOON'}}));
  assert.equal(seen[0].window.title,'Remove the relation to [TEST] Moon?');await actions.goto.call(dashboard,null,{dataset:{goto:'group'}});assert.ok(seen[0].classes.includes('ag-dialog--danger'));
  assert.equal(def('DEITY-UI-SUN').deity.relations.length,1);
});

test('deny request asks first; Cancel leaves the request pending',async()=>{
  const group=groupDoc('FACTION-UI-G'),state=structuredClone(group.getFlag(ns,'groupClaims'));
  const fx=def('FACTION-UI-G');fx.rewards.push({id:'rw-deny',key:'rw_deny',audience:'group',milestone_id:fx.renown_track.milestones[0].id,name:'[TEST] Favour',teaser:'',kind:'custom',description:'',tags:[],behavior:'one_time',usage_limit:0});
  await journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-UI-G').update({[`flags.${ns}.faction`]:fx});
  state.claims['rw-deny']={request_id:'AGF-CLAIM-UI',status:'pending',reward_id:'rw-deny',milestone_id:fx.renown_track.milestones[0].id};await group.setFlag(ns,'groupClaims',state);
  const press=()=>actions.resolveRequest.call(dashboard,null,{dataset:{doc:group.id,key:'rw-deny',claim:'1',mode:'deny'}});
  const seen=await ask('cancel',press);
  assert.equal(seen.length,1);assert.equal(seen[0].window.title,'Deny [TEST] Favour?');assert.deepEqual(seen[0].buttons.map(b=>b.label),['Cancel','Deny request']);
  assert.match(seen[0].content,/\[TEST\] Favour/);
  assert.equal(group.getFlag(ns,'groupClaims').claims['rw-deny'].status,'pending','Cancel denies nothing');
  await ask('confirm',press);
  assert.equal(group.getFlag(ns,'groupClaims').claims['rw-deny'].status,'denied');
});

test('New faction and New deity open a name dialog; Cancel creates nothing',async()=>{
  const n=journal.length;
  await ask('cancel',()=>actions.create.call(dashboard));await ask('cancel',()=>actions.createDeity.call(dashboard));
  assert.equal(journal.length,n);
  typed='[TEST] Fresh Guild';const seen=await ask('ok',()=>actions.create.call(dashboard));
  assert.equal(seen[0].window.title,'New faction');assert.ok(journal.some(d=>d.getFlag(ns,'faction')?.name==='[TEST] Fresh Guild'));
  typed='[TEST] Dawn';await ask('ok',()=>actions.createDeity.call(dashboard));
  assert.ok(journal.some(d=>d.getFlag(ns,'faction')?.name==='[TEST] Dawn'&&d.getFlag(ns,'faction').entity_type==='Deity'));
});

test('Factions search hides roster rows as you type, without re-rendering (an open editor keeps its edits)',async()=>{
  // A tiny DOM: two rows in one group, the count and the no-match notice.
  const el=(data={})=>({dataset:data,hidden:false});
  const rowA=el({agfSearch:'[test] guild\nhidden'}),rowB=el({agfSearch:'[test] fresh guild\nhidden'}),count={dataset:{total:'2'},textContent:''},none=el();
  const group={...el(),querySelectorAll:()=>[rowA,rowB]};
  const listeners={},root={dataset:{},addEventListener(type,fn){listeners[type]=fn;},contains:()=>true,
    querySelectorAll:sel=>sel.includes('[data-agf-search]')?[rowA,rowB]:sel.includes('[data-agf-group]')?[group]:[],
    querySelector:sel=>sel==='[data-agf-count]'?count:sel==='[data-agf-nomatch]'?none:null};
  dashboard.element=root;await dashboard._onRender({},{});
  const box={value:'fresh',closest:sel=>sel.includes('orgs-filter')?box:null};
  const start=dashboard.renders;
  listeners.input({target:box});
  assert.equal(dashboard.renders,start,'typing never re-renders');
  assert.deepEqual([rowA.hidden,rowB.hidden],[true,false]);assert.equal(count.textContent,'1 of 2');assert.equal(none.hidden,true);assert.equal(group.hidden,false);
  box.value='nothing';listeners.input({target:box});
  assert.equal(count.textContent,'0 of 2');assert.equal(none.hidden,false,'no-match notice shows');assert.equal(group.hidden,true);
  box.value='fresh g';listeners.input({target:box});
  await actions.goto.call(dashboard,null,{dataset:{goto:'orgs'}});
  // Show: Factions (New deity in an earlier test switched the roster to deities). The search text is kept.
  const kind={dataset:{orgsFilter:'kind'},value:'faction',matches:()=>false,closest:sel=>sel==='[data-orgs-filter]'?kind:null};
  listeners.change({target:kind});await new Promise(r=>setTimeout(r,10));
  const ctx=await dashboard._prepareContext();
  assert.equal(ctx.orgsView.search,'fresh g');assert.equal(ctx.orgs.shown,1);assert.equal(ctx.orgs.total,2);
assert.equal(ctx.orgs.groups.flatMap(g=>g.rows).filter(r=>r.hidden).length,1,'the next render hides the same rows');
  await actions.clearOrgFilters.call(dashboard);assert.equal((await dashboard._prepareContext()).orgsView.search,'');
  await actions.goto.call(dashboard,null,{dataset:{goto:'group'}});
});

test('FR-02: unsaved edits are never dropped silently: actions, tab switches and outside refreshes ask or wait',async()=>{
  const formListeners={},form={addEventListener(type,fn){formListeners[type]=fn;},removeEventListener(){}};
  const status={dataset:{},textContent:''};
  const listeners={},root={dataset:{},addEventListener(type,fn){listeners[type]=fn;},contains:()=>true,
    querySelectorAll:sel=>sel==='[data-agf-draft]'?[form]:[],querySelector:sel=>sel.includes('ag-footer__status')?status:null};
  await actions.select.call(dashboard,null,{dataset:{id:'FACTION-UI-G'}});
  dashboard.element=root;await dashboard._onRender({},{});
  assert.equal(dashboard.isDirty,false);
  formListeners.input();
  assert.equal(dashboard.isDirty,true);assert.equal(status.textContent,'Unsaved changes','footer status says so');
  // An outside change (a player request) waits instead of re-rendering over the typed edits.
  const r0=dashboard.renders;dashboard.refresh();assert.equal(dashboard.renders,r0);
  // A re-rendering action asks first; Keep editing changes nothing.
  const party=()=>JSON.stringify(groupDoc('FACTION-UI-G').getFlag(ns,'groupClaims'));
  const before=party();
  let seen=await ask('cancel',()=>actions.showEntry.call(dashboard,null,{dataset:{entry:'info_ui',mode:'party'}}));
  assert.equal(seen[0].window.title,'Discard unsaved changes?');assert.deepEqual(seen[0].buttons.map(b=>b.label),['Keep editing','Discard changes']);
  assert.equal(seen[0].buttons.find(b=>b.default).label,'Keep editing');
  assert.equal(party(),before,'Keep editing: nothing applied');assert.equal(dashboard.isDirty,true);
  // A top-level tab switch asks too.
  const clickView=page=>listeners.click({target:{closest:sel=>sel==='button[data-agf-view]'?{dataset:{agfView:page}}:null},preventDefault(){}});
  answer='cancel';const n=dialogs.length;clickView('pantheon');await new Promise(r=>setTimeout(r,10));
  assert.equal(dialogs.length,n+1);assert.equal((await dashboard._prepareContext()).tabPantheon,false,'kept editing: still on the same tab');
  // Discard changes: the action runs.
  await ask('confirm',()=>actions.showEntry.call(dashboard,null,{dataset:{entry:'info_ui',mode:'party'}}));
  assert.notEqual(party(),before,'Discard changes: the reveal is applied');
  // Submitting the draft itself (Save Changes) never asks.
  formListeners.input();assert.equal(dashboard.isDirty,true);
  const n2=dialogs.length;await actions.cancelEdit.call(dashboard);assert.equal(dialogs.length,n2);assert.equal(dashboard.isDirty,false);
  await actions.showEntry.call(dashboard,null,{dataset:{entry:'info_ui',mode:'party'}});
});

test('FR-03: the Requests tab lists open requests from every faction and deity with a count',async()=>{
  const group=groupDoc('FACTION-UI-G'),state=structuredClone(group.getFlag(ns,'groupClaims'));
  const fx=def('FACTION-UI-G');fx.rewards.push({id:'rw-queue',key:'rw_queue',audience:'group',milestone_id:fx.renown_track.milestones[0].id,name:'[TEST] Queued',teaser:'',kind:'custom',description:'',tags:[],behavior:'one_time',usage_limit:0});
  await journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-UI-G').update({[`flags.${ns}.faction`]:fx});
  state.claims['rw-queue']={request_id:'AGF-CLAIM-Q',status:'pending',reward_id:'rw-queue',milestone_id:fx.renown_track.milestones[0].id};await group.setFlag(ns,'groupClaims',state);
  await actions.goto.call(dashboard,null,{dataset:{goto:'requests'}});
  const ctx=await dashboard._prepareContext();
  assert.ok(ctx.tabRequests);assert.ok(ctx.requestCount>=1);
  const row=ctx.allRequests.find(g=>g.id==='FACTION-UI-G');
  assert.equal(row.kindLabel,'Faction');assert.ok(row.queue.some(q=>q.reward==='[TEST] Queued'&&q.pending));
  assert.match(row.openLink,/class="ag-link" data-action="openRecord" data-id="FACTION-UI-G" data-kind="faction">Open \[TEST\] Guild<\/button>/);
  await actions.openRecord.call(dashboard,null,{dataset:{id:'FACTION-UI-G',kind:'faction'}});
  const open=await dashboard._prepareContext();
  assert.ok(open.tabOrgs&&open.editor.sub.requests,'Open goes to that faction\'s Requests sub-tab');
  assert.match(open.editor.tabsHtml,/data-tab="requests"[^>]*aria-selected="true"/);
  // Players never get the tab or its data.
  game.user=p1;await actions.goto.call(dashboard,null,{dataset:{goto:'requests'}});const pc=await dashboard._prepareContext();game.user=gm;
  assert.equal(pc.tabRequests,false);assert.deepEqual(pc.allRequests,[]);
  await actions.goto.call(dashboard,null,{dataset:{goto:'group'}});
});

test('FR-11: Clear choice shows only on a Choose one level with a recorded choice',async()=>{
  const doc=journal.find(d=>d.getFlag(ns,'faction')?.id==='FACTION-UI-G'),fx=def('FACTION-UI-G');
  fx.renown_track.milestones[2].selection_mode='choose_one';await doc.update({[`flags.${ns}.faction`]:fx});
  const group=groupDoc('FACTION-UI-G'),state=structuredClone(group.getFlag(ns,'groupClaims'));
  await actions.goto.call(dashboard,null,{dataset:{goto:'orgs'}});await actions.select.call(dashboard,null,{dataset:{id:'FACTION-UI-G'}});
  let levels=(await dashboard._prepareContext()).gmGroupLevels;
  assert.deepEqual(levels.map(l=>l.hasChoice),[false,false,false,false,false]);
  state.choices[fx.renown_track.milestones[2].id]='rw-ui';await group.setFlag(ns,'groupClaims',state);
  levels=(await dashboard._prepareContext()).gmGroupLevels;
  assert.deepEqual(levels.map(l=>l.hasChoice),[false,false,true,false,false]);
  assert.match(template,/\{\{#if hasChoice\}\}<button[^>]*data-action="resetChoice"/);
  await actions.goto.call(dashboard,null,{dataset:{goto:'group'}});
});

test('context: version from module.json, character name (not id), standing meter and current milestone',async()=>{
  await actions.select.call(dashboard,null,{dataset:{id:'FACTION-UI-G'}});
  const ctx=await dashboard._prepareContext();
  assert.equal(ctx.version,'9.9.9');assert.equal(ctx.actorName,'[TEST] Hero');
  assert.ok(ctx.detail.groupView.steps.length===5&&typeof ctx.detail.groupView.percent==='number');
  assert.equal(ctx.detail.groupMs.filter(m=>m.isActive).length,1,'exactly one current milestone is highlighted');
  assert.doesNotMatch(template,/\{\{actorId\}\}/);
  assert.doesNotMatch(code,/BUILD_VERSION|const VERSION/);
});

test('standingView: rank dots, meter percent and the current step',()=>{
  const ms=[{id:'a',name:'A',threshold:0},{id:'b',name:'B',threshold:10},{id:'c',name:'C',threshold:30}];
  let v=standingView(ms,15);
  assert.equal(v.current,'B');assert.deepEqual(v.next,{name:'C',threshold:30});assert.equal(v.remaining,15);assert.equal(v.percent,25);
  assert.deepEqual(v.steps.map(s=>[s.done,s.current]),[[true,false],[true,true],[false,false]]);
  v=standingView(ms,99);assert.equal(v.percent,100);assert.equal(v.next,null);
  v=standingView([{id:'x',name:'X',threshold:5}],0);assert.equal(v.currentId,null);assert.equal(v.percent,0);
  assert.deepEqual(markCurrent(ms,12).map(m=>m.isActive),[false,true,false]);
});

test('template: kit header and tabs, labelled icons and buttons, no title= tooltips, one character picker',()=>{
  assert.match(template,/<div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate<\/span> \| Renown<\/h1><\/div>/,'FR-13: no subtitle');
  assert.match(template,/<span class="ag-version">v\{\{version\}\}<\/span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-action="help">/);
  assert.match(template,/class="ag-tabs ag-tabs--scroll agf-tabs" role="tablist"/);
  assert.equal((template.match(/role="tab"/g)||[]).length,6,'Group, Character, Pantheon, Factions, Requests, GM Setup');
  assert.equal((template.match(/class="ag-tab--gm/g)||[]).length,3);
  assert.match(template,/data-agf-view="player"[^>]*><i class="fa-solid fa-user" aria-hidden="true"><\/i> Character<\/button>/,'FR-12');
  assert.match(template,/> Factions<\/button>/,'FR-08: one word, Faction');assert.doesNotMatch(template,/Organization/);
  for(const icon of template.match(/<i class="fa-[^>]*>/g))assert.match(icon,/aria-hidden="true"/,icon);
  for(const b of template.match(/<button[^>]*ag-btn--icon[^>]*>/g)??[]){assert.match(b,/aria-label="/);assert.match(b,/data-tooltip="/);}
  assert.doesNotMatch(template,/<button\b[^>]*\stitle=/);assert.doesNotMatch(code,/<button\b[^>]*\stitle=/);
  assert.doesNotMatch(template,/>×<|agf-small|agf-primary|GM ·/);
  assert.equal((template.match(/name="actor-id"/g)||[]).length,1,'one picker partial');
  assert.equal((template.match(/\{\{> agfPicker\}\}/g)||[]).length,3,'Character, Pantheon and the Factions editor use it');
  assert.match(template,/<details class="ag-devtools"[^>]*><summary>Developer Tools<\/summary>[\s\S]*data-action="checkRewardIds"[\s\S]*data-action="seed">Load four \[TEST\] factions…</);
  // Each editor ends with Cancel (ghost) left, the status, and Save Changes right.
  for(const save of ['{{saveAction}}','saveSetup'])
    assert.match(template,new RegExp(`<footer class="ag-footer[^"]*"><button type="button" class="ag-btn ag-btn--ghost" data-action="cancelEdit">Cancel</button><span class="ag-footer__status" role="status"></span><button type="button" class="ag-btn ag-btn--primary" data-action="${save.replace(/[{}]/g,'\\$&')}">Save Changes</button></footer>`));
  // The create action sits in the toolbar's end slot, after Import (a kit file button) and Export.
  assert.match(template,/<div class="ag-toolbar__end">[\s\S]*?\{\{\{importButton\}\}\}[\s\S]*?data-action="exportAll"[\s\S]*?data-action="create"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> New faction…<\/button>/);
  // FR-14: the add-relation slider names its deity and the previews are announced.
  assert.match(template,/name="relation-resonance"[^>]*aria-label="Resonance with \{\{relationOptions\.0\.name\}\}"/);
  assert.equal((template.match(/data-resonance-preview aria-live="polite"/g)||[]).length,4);
});

test('FR-15 window size, FR-09 synthetic demo data, FR-06 maintenance out of GM Setup',async()=>{
  assert.deepEqual(dashboard.constructor.DEFAULT_OPTIONS.position,{width:980,height:760});
  const {TEST_FACTIONS_DEMO}=await import('../scripts/core.mjs');
  assert.equal(TEST_FACTIONS_DEMO.length,4);
  for(const g of TEST_FACTIONS_DEMO)for(const v of Object.values(g))assert.match(v,/^\[TEST\] /);
  const core=readFileSync(new URL('../scripts/core.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(core+code,/RECOVERED_GUILDS|Fosstryn|Lanterns|Gilt Compact|Hearthward|Iron March/);
  const n=journal.length;typed='';
  const seen=await ask('confirm',()=>actions.seed.call(dashboard));
  assert.equal(seen[0].window.title,'Add four [TEST] factions?');assert.equal(journal.filter(d=>/^\[TEST\] Guild [A-D]$/.test(d.getFlag(ns,'faction')?.name??'')).length,4);
  assert.ok(journal.length>n);
});

test('focus returns to the same control after a re-render (matched by its data keys)',async()=>{
  let focused=null;
  const make=(attrs)=>({tagName:'BUTTON',dataset:attrs,focus(){focused=this;}});
  const before=make({action:'showEntry',mode:'party',entry:'info_ui'}),after=make({action:'showEntry',mode:'party',entry:'info_ui'});
  const doc={activeElement:before};let asked=null;
  dashboard.element={ownerDocument:doc,contains:el=>el===before,querySelectorAll:()=>[],querySelector:sel=>{asked=sel;return sel==='button[data-action="showEntry"][data-entry="info_ui"][data-mode="party"]'?after:null;}};
  // render() replaces nothing in this harness; it looks the control up again by its keys and focuses it.
  await dashboard.render({force:true});
  assert.equal(asked,'button[data-action="showEntry"][data-entry="info_ui"][data-mode="party"]');assert.equal(focused,after);
});
