// 0.79.0 Show players only the Players folder in the Actors tab. Mocked Foundry; proves logic and wiring, not the live V14 directory DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,PLAYERS_FOLDER_KEY,DEFAULT_PLAYERS_FOLDER} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {listedUnder,applyDirectorySetting,installDirectoryFilter,directoryRows,DIRECTORIES} from '../scripts/directory-filter.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const CFG=DIRECTORIES.actors;
const folders=[
  {id:'fP',name:' players ',folder:null,type:'Actor'},{id:'fPc',name:'Level 3',folder:{id:'fP'},type:'Actor'},
  {id:'fEmpty',name:'Retired',folder:'fP',type:'Actor'},{id:'fNpc',name:'NPCs',folder:null,type:'Actor'},
  {id:'fWrap',name:'Archive',folder:null,type:'Actor'},{id:'fNest',name:'Players',folder:'fWrap',type:'Actor'},
  {id:'fItemPlayers',name:'Players',folder:null,type:'Item'}
];
const actors=[{id:'aRoot',folder:'fP'},{id:'aSub',folder:{id:'fPc'}},{id:'aNpc',folder:'fNpc'},{id:'aNone',folder:null},{id:'aNest',folder:'fNest'}];
function ctl({isGM=true,value}={}){
  const store=new Map(value===undefined?[]:[[PLAYERS_FOLDER_KEY,value]]),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes};
}
// A directory with list rows plus header and footer controls (the Ashen Gate player launchers) that must never be touched.
function dir(){
  const rows=[...folders.filter(f=>f.type==='Actor').map(f=>({hidden:false,dataset:{folderId:f.id}})),...actors.map(a=>({hidden:false,dataset:{entryId:a.id}}))];
  const launchers=[{hidden:false,dataset:{action:'ag-open-quests'}},{hidden:false,dataset:{action:'ag-open-locations'}}];
  const root={querySelectorAll:sel=>{root.sel=sel;return sel.startsWith('.directory-list')?rows:[...rows,...launchers];}};
  return {root,rows,launchers,by:id=>rows.find(r=>r.dataset.folderId===id||r.dataset.entryId===id)};
}

test('setting: hidden restricted world Boolean, off by default, hint covers the empty case and the launchers',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===PLAYERS_FOLDER_KEY).v;
  assert.equal(PLAYERS_FOLDER_KEY,'playersFolderOnly');assert.equal(DEFAULT_PLAYERS_FOLDER,false);
  assert.deepEqual([s.scope,s.config,s.restricted,s.type,s.default],['world',false,true,Boolean,false]);
  assert.equal(s.name,'Show players only the Players folder in the Actors tab');
  assert.match(s.hint,/list is empty/);assert.match(s.hint,/Ashen Gate buttons/);
  assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|playersFolderOnly|[A-Z]{3,}-/i);
});

test('controller: unset is off, GM sets it, player refused',async()=>{
  assert.equal(ctl().c.getState().playersFolderOnly,false);
  const g=ctl();await g.c.setPlayersFolderOnly(true);assert.deepEqual(g.writes,[[PLAYERS_FOLDER_KEY,true]]);
  const p=ctl({isGM:false});await assert.rejects(()=>p.c.setPlayersFolderOnly(true),/Only GMs/);assert.deepEqual(p.writes,[]);
});

test('listed: root, nested subfolder, other folder, no folder, matching folder inside another, Item folders ignored',()=>{
  const r=listedUnder({folders:folders.filter(f=>f.type==='Actor'),docs:actors,folderName:'Players'});
  assert.deepEqual([...r.docIds].sort(),['aNest','aRoot','aSub']);
  assert.deepEqual([...r.folderIds].sort(),['fNest','fP','fPc','fWrap'],'empty and other folders are not listed');
  const cfg=applyDirectorySetting({game:{user:{isGM:false},folders,actors},root:dir().root,appearance:ctl({isGM:false,value:true}).c,config:CFG});
  assert.equal(cfg,true);
});

test('player with setting on: only Players rows listed, launchers and other controls untouched; selector skips header and footer',()=>{
  const d=dir();
  applyDirectorySetting({game:{user:{isGM:false},folders,actors},root:d.root,appearance:ctl({isGM:false,value:true}).c,config:CFG});
  assert.equal(d.by('aRoot').hidden,false);assert.equal(d.by('aSub').hidden,false);assert.equal(d.by('aNpc').hidden,true);
  assert.equal(d.by('aNone').hidden,true);assert.equal(d.by('fNpc').hidden,true);assert.equal(d.by('fEmpty').hidden,true);assert.equal(d.by('fP').hidden,false);
  assert.ok(d.launchers.every(l=>!l.hidden&&!l.dataset.agmDirHidden),'launcher buttons remain');
  directoryRows(d.root);assert.match(d.root.sel,/^\.directory-list /,'rows are looked up only inside the list');
});

test('GM unaffected; setting off unaffected; no Players folder hides every row but never the launchers',()=>{
  let d=dir();applyDirectorySetting({game:{user:{isGM:true},folders,actors},root:d.root,appearance:ctl({isGM:true,value:true}).c,config:CFG});
  assert.ok(d.rows.every(r=>!r.hidden));
  d=dir();applyDirectorySetting({game:{user:{isGM:false},folders,actors},root:d.root,appearance:ctl({isGM:false,value:false}).c,config:CFG});
  assert.ok(d.rows.every(r=>!r.hidden));
  d=dir();applyDirectorySetting({game:{user:{isGM:false},folders:[],actors},root:d.root,appearance:ctl({isGM:false,value:true}).c,config:CFG});
  assert.ok(d.rows.every(r=>r.hidden));assert.ok(d.launchers.every(l=>!l.hidden));
});

test('install: renderActorDirectory and live change; the Items and Actors filters are independent',()=>{
  const d=dir();let handler;const hooks={on:(n,fn)=>{assert.equal(n,'renderActorDirectory');handler=fn;return 3;},off(){}};
  const g=ctl({isGM:false});
  installDirectoryFilter({game:{user:{isGM:false},folders,actors},hooks,getUi:()=>({actors:{element:d.root}}),appearance:g.c,config:CFG});
  handler({},d.root);assert.ok(d.rows.every(r=>!r.hidden));
  g.c.noteChange(PLAYERS_FOLDER_KEY,true);assert.equal(d.by('aNpc').hidden,true);
  g.c.noteChange(PLAYERS_FOLDER_KEY,false);assert.equal(d.by('aNpc').hidden,false);
  assert.equal(CFG.stateKey,'playersFolderOnly');assert.equal(DIRECTORIES.items.stateKey,'playerHandoutsOnly');
});

test('GM Setup form, save and wiring',async()=>{
  const form=b=>({querySelector:s=>s==='[data-ag-setup-players-only]'?b:null,querySelectorAll:()=>[]});
  assert.equal(readGmSetupForm(form({checked:true})).playersFolderOnly,true);assert.equal(readGmSetupForm(form(null)).playersFolderOnly,undefined);
  const mk=(isGM,cur)=>{const w=[];return {w,ctx:{game:{user:{isGM},settings:{get:()=>false}},moduleId:'m',codexAccessKey:'k',
    appearance:{listSkins:()=>[],getState:()=>({playersFolderOnly:cur,worldDefault:'ag-default'}),setPlayersFolderOnly:async v=>w.push(v)}}};};
  let t=mk(true,false);await saveGmSetup({playersFolderOnly:true},t.ctx);assert.deepEqual(t.w,[true]);
  t=mk(true,true);await saveGmSetup({playersFolderOnly:true},t.ctx);assert.deepEqual(t.w,[]);
  t=mk(false,false);await assert.rejects(()=>saveGmSetup({playersFolderOnly:true},t.ctx),/Only the GM/);
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js');
  assert.match(tpl,/data-ag-setup-players-only \{\{#if playersFolderOnly\}\}checked\{\{\/if\}\}> Show players only the Players folder in the Actors tab/);
  assert.match(main,/for\(const config of Object\.values\(DIRECTORIES\)\)/);
  assert.match(main,/<em>Show players only the Players folder in the Actors tab<\/em>/);
  assert.match(main,/playersFolderOnly: this\.tab === "setup"/);
});
