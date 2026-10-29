// 0.79.0 Show players only Player Handouts in the Items tab. Mocked Foundry: proves logic and wiring, not the live V14 directory DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,PLAYER_HANDOUTS_KEY,DEFAULT_PLAYER_HANDOUTS} from '../scripts/appearance.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';
import {isFolderNamed,shouldFilter,listedUnder,directoryRows,applyDirectoryFilter,applyDirectorySetting,installDirectoryFilter,DIRECTORIES} from '../scripts/directory-filter.js';
const CFG=DIRECTORIES.items;
const isHandoutsFolderName=n=>isFolderNamed(n,'Player Handouts');
const listedHandouts=({folders,items})=>{const r=listedUnder({folders,docs:items,folderName:'Player Handouts'});return {itemIds:r.docIds,folderIds:r.folderIds};};

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const folders=[
  {id:'fH',name:'  player HANDOUTS ',folder:null,type:'Item'},
  {id:'fSub',name:'Maps',folder:{id:'fH'},type:'Item'},
  {id:'fDeep',name:'Deep',folder:'fSub',type:'Item'},
  {id:'fEmpty',name:'Empty',folder:'fH',type:'Item'},
  {id:'fOther',name:'Gear',folder:null,type:'Item'},
  {id:'fWrap',name:'Session 1',folder:null,type:'Item'},
  {id:'fNested',name:'Player Handouts',folder:'fWrap',type:'Item'},
  {id:'fNear',name:'Player Handouts Old',folder:null,type:'Item'}
];
const items=[{id:'iRoot',folder:{id:'fH'}},{id:'iSub',folder:'fSub'},{id:'iDeep',folder:'fDeep'},{id:'iOther',folder:'fOther'},
  {id:'iNone',folder:null},{id:'iNested',folder:'fNested'},{id:'iNear',folder:'fNear'}];

function ctl({isGM=true,value}={}){
  const store=new Map(value===undefined?[]:[[PLAYER_HANDOUTS_KEY,value]]),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),
    getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes};
}
function dir(){
  const rows=[];
  for(const f of folders)rows.push({hidden:false,dataset:{folderId:f.id}});
  for(const i of items)rows.push({hidden:false,dataset:{entryId:i.id}});
  const by=id=>rows.find(r=>r.dataset.folderId===id||r.dataset.entryId===id);
  return {root:{querySelectorAll:sel=>{dir.sel=sel;return rows;}},by,rows};
}

test('setting is a hidden, restricted world Boolean, off by default; the hint covers the empty case',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===PLAYER_HANDOUTS_KEY).v;
  assert.equal(PLAYER_HANDOUTS_KEY,'playerHandoutsOnly');assert.equal(DEFAULT_PLAYER_HANDOUTS,false);
  assert.equal(s.scope,'world');assert.equal(s.config,false);assert.equal(s.restricted,true);assert.equal(s.type,Boolean);assert.equal(s.default,false);
  assert.equal(s.name,'Show players only Player Handouts in the Items tab');
  assert.match(s.hint,/empty Items tab/);
  assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|playerHandoutsOnly|[A-Z]{3,}-/i);
});

test('controller: unset is off; GM sets it; player refused; changes notify',async()=>{
  assert.equal(ctl().c.getState().playerHandoutsOnly,false);
  const g=ctl();await g.c.setPlayerHandoutsOnly(true);assert.deepEqual(g.writes,[[PLAYER_HANDOUTS_KEY,true]]);
  const p=ctl({isGM:false});await assert.rejects(()=>p.c.setPlayerHandoutsOnly(true),/Only GMs/);assert.deepEqual(p.writes,[]);
  const seen=[];p.c.subscribe(s=>seen.push(s.playerHandoutsOnly));p.c.noteChange(PLAYER_HANDOUTS_KEY,true);assert.deepEqual(seen,[true]);
});

test('folder name matching: exact, trimmed, case-insensitive',()=>{
  assert.equal(isHandoutsFolderName('Player Handouts'),true);
  assert.equal(isHandoutsFolderName('  player HANDOUTS  '),true);
  assert.equal(isHandoutsFolderName('Player Handouts Old'),false);
  assert.equal(isHandoutsFolderName('Handouts'),false);
  assert.equal(isHandoutsFolderName(undefined),false);
});

test('listed: root match, nested subfolder, non-matching folder, item with no folder',()=>{
  const {itemIds,folderIds}=listedHandouts({folders,items});
  assert.deepEqual([...itemIds].sort(),['iDeep','iNested','iRoot','iSub'],'root, subfolder, deep subfolder, and a handouts folder nested in another folder');
  assert.ok(!itemIds.has('iOther'),'non-matching folder');assert.ok(!itemIds.has('iNone'),'no folder');assert.ok(!itemIds.has('iNear'),'name must match exactly');
  assert.deepEqual([...folderIds].sort(),['fDeep','fH','fNested','fSub','fWrap'],'listed folders keep their parents; empty and other folders are not listed');
  assert.deepEqual([...listedHandouts({folders:folders.slice(4,5),items:items.filter(i=>i.id==='iOther')}).itemIds],[],'no Player Handouts folder: nothing listed');
  const loop=[{id:'a',name:'x',folder:'b'},{id:'b',name:'y',folder:'a'}];
  assert.equal(listedHandouts({folders:loop,items:[{id:'i',folder:'a'}]}).itemIds.size,0,'a folder loop ends');
});

test('the DOM selector lives in one function',()=>{
  const d=dir();directoryRows(d.root);assert.equal(dir.sel,'.directory-list li[data-entry-id], .directory-list li[data-folder-id]');
  assert.equal((read('../scripts/directory-filter.js').replace(/\/\*[\s\S]*?\*\//g,'').match(/querySelector/g)||[]).length,1);
});

test('apply hides unlisted rows and restores exactly what it hid',()=>{
  const d=dir();d.by('iRoot').hidden=true; // a listed row hidden by something else
  const n=applyDirectoryFilter(d.root,listedUnder({folders,docs:items,folderName:'Player Handouts'}));
  assert.ok(n>0);assert.equal(d.by('iSub').hidden,false);assert.equal(d.by('iOther').hidden,true);assert.equal(d.by('iNone').hidden,true);
  assert.equal(d.by('fEmpty').hidden,true);assert.equal(d.by('fH').hidden,false);
  applyDirectoryFilter(d.root,null);
  assert.equal(d.by('iOther').hidden,false);assert.equal(d.by('fEmpty').hidden,false);assert.equal(d.by('iRoot').hidden,true,'not ours to un-hide');
});

test('player vs GM, setting on vs off',()=>{
  assert.equal(shouldFilter({isGM:true,setting:true}),false);
  const run=(isGM,value)=>{const d=dir();const r=applyDirectorySetting({config:CFG,game:{user:{isGM},folders,items},root:d.root,appearance:ctl({isGM,value}).c});return {r,d};};
  let x=run(false,true);assert.equal(x.r,true);assert.equal(x.d.by('iOther').hidden,true);assert.equal(x.d.by('iRoot').hidden,false);
  x=run(true,true);assert.equal(x.r,false);assert.ok(x.d.rows.every(r=>!r.hidden),'GM sees everything');
  x=run(false,false);assert.ok(x.d.rows.every(r=>!r.hidden));
  x=run(false,undefined);assert.ok(x.d.rows.every(r=>!r.hidden),'default off');
  const noFolder=dir();applyDirectorySetting({config:CFG,game:{user:{isGM:false},folders:[],items},root:noFolder.root,appearance:ctl({isGM:false,value:true}).c});
  assert.ok(noFolder.rows.every(r=>r.hidden),'no Player Handouts folder: empty list');
});

test('install: runs on renderItemDirectory and live on a change; stops cleanly; data is not written',()=>{
  const d=dir();let handler,offs=[];
  const hooks={on:(n,fn)=>{assert.equal(n,'renderItemDirectory');handler=fn;return 7;},off:(n,id)=>offs.push([n,id])};
  const g=ctl({isGM:false});
  const stop=installDirectoryFilter({config:CFG,game:{user:{isGM:false},folders,items},hooks,getUi:()=>({items:{element:d.root}}),appearance:g.c});
  handler({}, d.root);assert.ok(d.rows.every(r=>!r.hidden),'off by default');
  g.c.noteChange(PLAYER_HANDOUTS_KEY,true);assert.equal(d.by('iOther').hidden,true,'live');
  handler({}, [d.root]);assert.equal(d.by('iOther').hidden,true,'jQuery-style array accepted');
  g.c.noteChange(PLAYER_HANDOUTS_KEY,false);assert.equal(d.by('iOther').hidden,false);
  stop();assert.deepEqual(offs,[['renderItemDirectory',7]]);
  assert.doesNotMatch(read('../scripts/directory-filter.js').replace(/\/\*[\s\S]*?\*\//g,''),/ownership|permission|setFlag|\.update\(|updateDocuments|settings\.set/);
});

test('GM Setup form, save and wiring',async()=>{
  const form=b=>({querySelector:s=>s==='[data-ag-setup-handouts-only]'?b:null,querySelectorAll:()=>[]});
  assert.equal(readGmSetupForm(form({checked:true})).playerHandoutsOnly,true);
  assert.equal(readGmSetupForm(form(null)).playerHandoutsOnly,undefined);
  const mk=(isGM,cur)=>{const w=[];return {w,ctx:{game:{user:{isGM},settings:{get:()=>false}},moduleId:'m',codexAccessKey:'k',
    appearance:{listSkins:()=>[],getState:()=>({playerHandoutsOnly:cur,worldDefault:'ag-default'}),setPlayerHandoutsOnly:async v=>w.push(v)}}};};
  let t=mk(true,false);await saveGmSetup({playerHandoutsOnly:true},t.ctx);assert.deepEqual(t.w,[true]);
  t=mk(true,true);await saveGmSetup({playerHandoutsOnly:true},t.ctx);assert.deepEqual(t.w,[]);
  t=mk(false,false);await assert.rejects(()=>saveGmSetup({playerHandoutsOnly:true},t.ctx),/Only the GM/);assert.deepEqual(t.w,[]);
  const tpl=read('../templates/manager.hbs'),main=read('../scripts/main.js');
  assert.match(tpl,/data-ag-setup-handouts-only \{\{#if playerHandoutsOnly\}\}checked\{\{\/if\}\}> Show players only Player Handouts in the Items tab/);
  assert.match(main,/installDirectoryFilter\(\{game,hooks:Hooks/);
  assert.match(main,/playerHandoutsOnly: this\.tab === "setup" \? Boolean\(this\.setupDraft\?\.playerHandoutsOnly \?\? /);
  assert.match(main,/<em>Show players only Player Handouts in the Items tab<\/em>/);
});
