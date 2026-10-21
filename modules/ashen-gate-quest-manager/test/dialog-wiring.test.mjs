import test from 'node:test';import assert from 'node:assert/strict';
import {MOD} from '../scripts/core.mjs';
// Help and the delete confirm go through ag-dialogs.mjs; Cancel deletes nothing.
const callbacks=new Map(),dialogs=[];let answer='cancel',deleted=0;
globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn),on:()=>{},off:()=>{}};
globalThis.foundry={applications:{api:{ApplicationV2:class{render(){this.rendered=true;return this;}},
  DialogV2:{wait:async o=>{dialogs.push(o);return o.buttons.find(b=>b.action===answer).callback();},prompt:async o=>{dialogs.push(o);}}}}};
const gm={id:'gm',isGM:true};
const quest={getFlag:(mod,key)=>mod===MOD?({private:true,source:{id:'QUEST-TEST-WELL',name:'[TEST] The Old Well',objective_kind:'quest',status:'approved'},state:{status:'Hidden'}})[key]:null,
  testUserPermission:u=>u.isGM,delete:async()=>{deleted++;},update:async()=>{deleted++;}};
const module={active:true,api:null};const actors=[];actors.get=()=>null;
globalThis.game={user:gm,settings:{register:()=>{},get:()=>true,set:async()=>{}},journal:[quest],actors,users:[gm],modules:{get:id=>id===MOD?module:null}};
globalThis.document={querySelectorAll:()=>[]};
globalThis.ui={actors:{element:null},notifications:{info:()=>{},error:()=>{}}};
await import('../scripts/main.mjs');
callbacks.get('init')();callbacks.get('ready')();
const app=await module.api.open();
test('Help opens an info dialog with one Close button in the Ashen Gate style',async()=>{
 dialogs.length=0;await app.action({dataset:{action:'help'}},null);
 assert.equal(dialogs.length,1);assert.equal(dialogs[0].ok.label,'Close');assert.ok(dialogs[0].classes.includes('ag-app'));
});
test('Delete quest names the quest, is red, and Cancel deletes nothing',async()=>{
 dialogs.length=0;app.gmId='QUEST-TEST-WELL';answer='cancel';
 await app.action({dataset:{action:'delete'}},null);
 const d=dialogs[0];
 assert.equal(d.window.title,'Delete [TEST] The Old Well?');
 assert.deepEqual(d.buttons.map(b=>b.label),['Cancel','Delete quest']);
 assert.ok(d.classes.includes('ag-dialog--danger'));assert.ok(!d.content.includes('QUEST-TEST-WELL'),'no id in the message');
 assert.equal(deleted,0);assert.equal(app.gmId,'QUEST-TEST-WELL');
});
test('unsaved changes ask Discard changes / Keep editing; Keep editing stays put',async()=>{
 dialogs.length=0;app.unsavedSource=true;answer='cancel';
 await app.action({dataset:{action:'new'}},null);
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Keep editing','Discard changes']);
 assert.ok(dialogs[0].classes.includes('ag-dialog--danger'));
 assert.equal(app.gmId,'QUEST-TEST-WELL');assert.equal(app.unsavedSource,true);
});
