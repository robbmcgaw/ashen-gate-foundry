// 0.10.0 UI pass. Mocked Foundry: proves the markup contract, D4 saving and confirm wiring, not the live look.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
const callbacks=new Map(),dialogs=[],sets=[],notes=[];let answer='cancel';
globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn),on:()=>{},off:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(o){this.options=o;}async render(){this.rendered=true;return this._renderHTML();}},
  DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();}}}}};
const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false};
const settings={playerAccessEnabled:false,compendiumPackIds:'world.old'};
const quest={getFlag:(mod,key)=>mod===MOD?({private:true,source:{id:'QUEST-TEST-WELL',entity_type:'Objective',name:'[TEST] The Old Well',objective_kind:'quest',status:'approved',version:'1',provenance:{sources:['[TEST]']},visibility:'reveal_gated',refs:[],public_summary:'',source:{},objectives:[{key:'a',goal:'[TEST] Look down the well',visibility:'player'}],locations:[],parameters:{},outcomes:{}},
   state:{status:'Hidden',scope:'party',actorId:null,revealed:false,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false}})[key]:null,
  testUserPermission:u=>u.isGM};
const module={active:true,api:null};const actors=[];actors.get=()=>null;
globalThis.game={user:gm,settings:{register:()=>{},get:(m,k)=>settings[k],set:async(m,k,v)=>{sets.push([k,v]);settings[k]=v;}},journal:[quest],actors,users:[gm],modules:{get:id=>id===MOD?module:null}};
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info:m=>notes.push(['info',m]),error:m=>notes.push(['error',m])}};
const origError=console.error;console.error=()=>{};
await import('../scripts/main.mjs');
callbacks.get('init')();callbacks.get('ready')();
const app=await module.api.open();
// A GM Setup form as the GM left it: what is ticked/typed, not yet saved.
const setupForm=({access,packs})=>({querySelector:sel=>sel==='#ag-player-access'?{checked:access}:sel==='#ag-compendium-packs'?{value:packs}:null});
const reset=()=>{sets.length=0;notes.length=0;dialogs.length=0;settings.playerAccessEnabled=false;settings.compendiumPackIds='world.old';game.user=gm;};

test('header: brand, overlay toggle, then version, then Help; tabs are typed, labelled tabs; GM tabs last',async()=>{
 reset();app.tab='party';const html=await app.render();
 const head=html.slice(html.indexOf('<header class="ag-header"'),html.indexOf('</header>'));
 assert.match(head,/<h1><span class="ag-header__brand">Ashen Gate<\/span> \| Quest Log<\/h1>/);
 const at=k=>head.indexOf(k);
 assert.ok(at('toggle-overlay')<at('ag-version')&&at('ag-version')<at('data-action="help"'),'overlay, version, Help');
 assert.match(head,/data-action="help" class="ag-btn ag-btn--ghost ag-btn--sm"/);
 assert.match(head,/<span class="ag-version">v0\.10\.0<\/span>/);
 assert.match(html,/<nav class="ag-tabs ag-tabs--scroll" role="tablist"/);
 const tabs=[...html.matchAll(/<button type="button" role="tab" data-tab="(\w+)" aria-selected="(true|false)" class="([^"]*)">/g)].map(m=>[m[1],m[2],m[3]]);
 assert.deepEqual(tabs.map(t=>t[0]),['party','individual','quests','setup']);
 assert.deepEqual(tabs.map(t=>t[1]),['true','false','false','false']);
 assert.ok(tabs.slice(2).every(t=>t[2].includes('ag-tab--gm')));
 assert.doesNotMatch(html,/<button\b[^>]*\stitle=/,'no native title tooltips');
 assert.doesNotMatch(html,/<footer class="ag-footer[^"]*"><span>/,'the permission strip is a notice now, not a footer');
 assert.match(html,/ag-notice ag-notice--info/);
});
test('players do not see GM tabs or the GM notice',async()=>{
 reset();settings.playerAccessEnabled=true;game.user=alice;app.tab='party';
 const html=await app.render();
 assert.doesNotMatch(html,/data-tab="quests"|data-tab="setup"|ag-notice--info/);
 assert.match(html,/No quests yet/);
 game.user=gm;
});
test('D4: GM Setup has one Save Changes footer; Player Access has no save of its own',async()=>{
 reset();app.tab='setup';const html=await app.render();
 assert.match(html,/<footer class="ag-footer"><button type="button" data-action="cancel-setup" class="ag-btn ag-btn--ghost">Cancel<\/button><span class="ag-footer__status" role="status"><\/span><button type="button" data-action="save-setup" class="ag-btn ag-btn--primary">Save Changes<\/button><\/footer>/);
 assert.doesNotMatch(html,/save-player-access|save-pack-ids/);
 assert.match(html,/<input type="checkbox" id="ag-player-access" >/,'checkbox carries no action: ticking it saves nothing');
});
test('D4: Save Changes writes Player Access (and only what changed)',async()=>{
 reset();
 await app.action({dataset:{action:'save-setup'}},setupForm({access:true,packs:'world.old'}));
 assert.deepEqual(sets,[['playerAccessEnabled',true]]);
 assert.equal(notes.at(-1)[1],'GM Setup saved.');
});
test('D4: Save Changes saves pack IDs with Player Access and says to reload',async()=>{
 reset();
 await app.action({dataset:{action:'save-setup'}},setupForm({access:false,packs:'world.quests, world.more'}));
 assert.deepEqual(sets,[['compendiumPackIds','world.quests,world.more']]);
 assert.match(notes.at(-1)[1],/Reload Foundry/);
});
test('D4: a bad pack ID saves nothing, not even Player Access',async()=>{
 reset();
 await app.action({dataset:{action:'save-setup'}},setupForm({access:true,packs:'not a pack'}));
 assert.deepEqual(sets,[]);assert.equal(notes.at(-1)[0],'error');
});
test('D4: Cancel saves nothing',async()=>{
 reset();
 await app.action({dataset:{action:'cancel-setup'}},setupForm({access:true,packs:'world.new'}));
 assert.deepEqual(sets,[]);
});
test('D4: a player cannot save GM Setup, through the window or the API',async()=>{
 reset();settings.playerAccessEnabled=true;game.user=alice;
 await app.action({dataset:{action:'save-setup'}},setupForm({access:false,packs:''}));
 assert.deepEqual(sets,[]);assert.match(notes.at(-1)[1],/GM permission/);
 await assert.rejects(()=>module.api.playerAccess.setEnabled(false),/GM permission/);
 assert.equal(settings.playerAccessEnabled,true);
 game.user=gm;
});
test('editor: Cancel bottom-left, Save bottom-right; Delete quest sits in the editor header, away from Save',async()=>{
 reset();app.tab='quests';app.gmId='QUEST-TEST-WELL';
 const html=await app.render();
 const head=html.slice(html.indexOf('<header class="agq-edit__head"'),html.indexOf('</header>',html.indexOf('agq-edit__head')));
 assert.match(head,/\[TEST\] The Old Well/);assert.match(head,/data-action="delete" class="ag-btn ag-btn--danger ag-btn--sm"/);
 const footers=[...html.matchAll(/<footer class="ag-footer agq-footer">([\s\S]*?)<\/footer>/g)].map(m=>m[1]);
 assert.equal(footers.length,2);
 assert.match(footers[0],/^<button type="button" data-action="cancel-edit" class="ag-btn ag-btn--ghost">Cancel<\/button>.*data-action="save-source" class="ag-btn ag-btn--primary">Save quest definition<\/button>$/);
 assert.match(footers[1],/^<button type="button" data-action="cancel-edit"[^>]*>Cancel<\/button>.*data-action="save-state" class="ag-btn ag-btn--primary">Save progress &amp; reveal<\/button>$/);
 for(const f of footers)assert.doesNotMatch(f,/data-action="delete"|remove-assignment/);
 assert.match(html,/<label class="ag-field">Permanent ID<input id="ag-src-id"/);
 assert.match(html,/class="ag-form-grid"/);
 assert.match(html,/<aside class="ag-split__list agq-list" id="ag-gm-cards"/);
});
test('editor Cancel with unsaved changes asks first; Keep editing keeps them, Discard drops them',async()=>{
 reset();app.tab='quests';app.unsavedSource=true;answer='cancel';
 await app.action({dataset:{action:'cancel-edit'}},null);
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Keep editing','Discard changes']);
 assert.equal(app.unsavedSource,true);
 answer='confirm';await app.action({dataset:{action:'cancel-edit'}},null);
 assert.equal(app.unsavedSource,false);assert.equal(app.gmId,'QUEST-TEST-WELL');
 answer='cancel';
});
test('Delete assignment asks in red first; Cancel deletes nothing',async()=>{
 reset();answer='cancel';
 await app.action({dataset:{action:'remove-assignment',id:'ASSIGN-TEST-ONE'}},null);
 assert.equal(dialogs.length,1);assert.ok(dialogs[0].classes.includes('ag-dialog--danger'));
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Cancel','Delete assignment']);
 assert.equal(notes.length,0,'nothing removed, no error');
});
test('Clear filters puts the Quests list back to every quest',async()=>{
 reset();app.qv={...app.qv,search:'zzz',status:'Failed'};
 await app.action({dataset:{action:'clear-filters'}},null);
 assert.equal(app.qv.search,'');assert.equal(app.qv.status,'all');
 console.error=origError;
});
