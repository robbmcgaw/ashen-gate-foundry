// 0.59.0 compact pause: world setting (GM only, off by default), html[data-ag-paused] mirrors game.paused both ways,
// CSS scoped to html[data-ag-pause="compact"]. Proves logic and CSS text with mocked Foundry, not how it looks in Forge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAppearanceController,registerAppearanceSettings,PAUSE_KEY,DEFAULT_PAUSE,SKIN_TOKEN_NAMES} from '../scripts/appearance.js';
import {mirrorPaused,ensurePausePill,installPauseMirror,PAUSE_PILL_ID} from '../scripts/pause-indicator.js';
import {readGmSetupForm,saveGmSetup} from '../scripts/gm-setup.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const css=read('../styles/pause.css').replace(/\/\*[\s\S]*?\*\//g,'');
const root=()=>({style:{setProperty(){}},dataset:{}});
function ctl({isGM=true,value}={}){
  const store=new Map(value===undefined?[]:[[PAUSE_KEY,value]]),writes=[];
  const c=createAppearanceController({currentUser:()=>({id:'u',isGM}),
    getSetting:k=>k==='worldSkin'?'ag-default':store.get(k),
    setSetting:async(k,v)=>{writes.push([k,v]);store.set(k,v);}});
  return {c,writes};
}

test('compactPause is a hidden, restricted world Boolean, off by default, with a plain hint',()=>{
  const reg=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>reg.push({k,v})}},namespace:'m'});
  const s=reg.find(r=>r.k===PAUSE_KEY).v;
  assert.equal(PAUSE_KEY,'compactPause');assert.equal(DEFAULT_PAUSE,false);
  assert.equal(s.scope,'world');assert.equal(s.type,Boolean);assert.equal(s.default,false);
  assert.equal(s.config,false,'set in GM Setup');assert.equal(s.restricted,true);
  assert.doesNotMatch(`${s.name} ${s.hint}`,/\b(new|beta|alpha|preview)\b|compactPause|[A-Z]{3,}-/i);
  const seen=[];registerAppearanceSettings({game:{settings:{register:(n,k,v)=>{if(k===PAUSE_KEY)v.onChange(true);}}},namespace:'m',onSettingChange:(k,v)=>seen.push([k,v])});
  assert.deepEqual(seen,[[PAUSE_KEY,true]]);
});
test('default off: no data-ag-pause attribute, unset reads as off; on writes it; off removes it',()=>{
  let r=root();ctl().c.applyTo(r);assert.equal('agPause' in r.dataset,false);
  r=root();ctl({value:true}).c.applyTo(r);assert.equal(r.dataset.agPause,'compact');
  r=root();r.dataset.agPause='compact';ctl({value:false}).c.applyTo(r);assert.equal('agPause' in r.dataset,false);
  assert.equal(ctl().c.getState().compactPause,false);
});
test('only a GM can change it (rejected in the data layer); a change from another client is picked up',async()=>{
  const p=ctl({isGM:false});
  await assert.rejects(()=>p.c.setCompactPause(true),/Only GMs/);assert.deepEqual(p.writes,[]);
  const g=ctl();await g.c.setCompactPause(true);assert.deepEqual(g.writes,[[PAUSE_KEY,true]]);assert.equal(g.c.getState().compactPause,true);
  // a player's client hears the world change through onChange -> noteChange, before game.settings.get is current
  const seen=[];p.c.subscribe(s=>seen.push(s.compactPause));p.c.noteChange(PAUSE_KEY,true);
  assert.deepEqual(seen,[true]);assert.equal(p.c.getState().compactPause,true);
});
test('GM Setup reads the box and saves only on change, GM only, no migration needed',async()=>{
  const box=checked=>({checked});
  const form=el=>({querySelector:s=>s==='[data-ag-setup-pause]'?el:null,querySelectorAll:()=>[]});
  assert.equal(readGmSetupForm(form(box(true))).compactPause,true);
  assert.equal(readGmSetupForm(form(null)).compactPause,undefined,'missing control leaves the setting alone');
  const mk=(isGM,on)=>{const w=[];let cur=on;return {w,ctx:{game:{user:{isGM},settings:{get(){},set(){}}},moduleId:'m',codexAccessKey:'k',
    appearance:{listSkins:()=>[],getState:()=>({compactPause:cur,worldDefault:'ag-default'}),setCompactPause:async v=>{w.push(v);cur=v;}}}};};
  let t=mk(true,false);await saveGmSetup({compactPause:true},t.ctx);assert.deepEqual(t.w,[true]);
  t=mk(true,true);await saveGmSetup({compactPause:true},t.ctx);assert.deepEqual(t.w,[],'unchanged: no write');
  t=mk(false,false);await assert.rejects(()=>saveGmSetup({compactPause:true},t.ctx),/Only the GM/);assert.deepEqual(t.w,[]);
  assert.doesNotMatch(read('../scripts/main.js'),/compactPause[^\n]*migrat/i);
});

// ---- the mirror ----
function fakeDoc(){
  const byId=new Map();
  const mk=tag=>({tag,children:[],dataset:{},attrs:{},id:'',className:'',textContent:'',hidden:false,
    setAttribute(k,v){this.attrs[k]=v;},append(...c){this.children.push(...c);}});
  const body=mk('body');body.append=function(...c){this.children.push(...c);c.forEach(x=>byId.set(x.id,x));};
  return {documentElement:mk('html'),body,createElement:mk,getElementById:id=>byId.get(id)??null};
}
function fakeHooks(){const m=new Map();let n=0;return {on(h,f){m.set(++n,[h,f]);return n;},off(h,id){m.delete(id);},
  call(h,...a){for(const [x,f] of m.values())if(x===h)f(...a);},count:()=>m.size};}

test('data-ag-paused mirrors game.paused both ways, on load and on pauseGame',()=>{
  const doc=fakeDoc(),hooks=fakeHooks(),game={paused:true};
  installPauseMirror({game,hooks,doc});
  assert.equal(doc.documentElement.dataset.agPaused,'true','already paused on first load / after reconnect');
  game.paused=false;hooks.call('pauseGame',false);assert.equal('agPaused' in doc.documentElement.dataset,false);
  game.paused=true;hooks.call('pauseGame',true);assert.equal(doc.documentElement.dataset.agPaused,'true');
  hooks.call('pauseGame');assert.equal(doc.documentElement.dataset.agPaused,'true','no argument falls back to game.paused');
  assert.equal(mirrorPaused(doc.documentElement,0),false);assert.equal('agPaused' in doc.documentElement.dataset,false);
});
test('the mirror only reads state: it adds one listener and removes it, never touches game.paused or the native element',()=>{
  const doc=fakeDoc(),hooks=fakeHooks(),game=Object.freeze({paused:false});
  const stop=installPauseMirror({game,hooks,doc});assert.equal(hooks.count(),1);stop();assert.equal(hooks.count(),0);
  const src=read('../scripts/pause-indicator.js').replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(src,/togglePause|game\.togglePause|\.paused\s*=[^=]|#pause|getElementById\(['"]pause/);
});
test('the indicator has the word Paused, an aria-hidden icon, status role, is created once and starts hidden',()=>{
  const doc=fakeDoc();const a=ensurePausePill(doc),b=ensurePausePill(doc);
  assert.equal(a,b);assert.equal(a.id,PAUSE_PILL_ID);assert.equal(a.attrs.role,'status');assert.equal(a.hidden,true);
  const [icon,label]=a.children;assert.equal(label.textContent,'Paused');assert.equal(icon.attrs['aria-hidden'],'true');
  assert.equal(ensurePausePill({}),null);
});

// ---- the CSS ----
test('pause.css is listed in module.json after the kit',()=>{
  const m=JSON.parse(read('../module.json'));
  assert.ok(m.styles.includes('styles/pause.css'));assert.ok(m.styles.indexOf('styles/ag-ui.css')<m.styles.indexOf('styles/pause.css'));
});
test('every rule is scoped to html[data-ag-pause="compact"] and to the pause markup',()=>{
  const sels=[...css.matchAll(/([^{}@;]+)\{/g)].map(m=>m[1].trim());
  assert.ok(sels.length>=3);
  for(const sel of sels)for(const part of sel.split(',').map(x=>x.trim())){
    assert.ok(part.startsWith('html[data-ag-pause="compact"]'),`unscoped: ${part}`);
    assert.match(part,/#pause\b|#ag-pause-pill/,`not pause markup: ${part}`);
  }
  assert.match(css,/html\[data-ag-pause="compact"\] #pause \{ display: none !important; \}/,'the native banner (figure#pause, image and caption) is hidden');
  assert.match(css,/html\[data-ag-pause="compact"\]\[data-ag-paused="true"\] #ag-pause-pill \{[^}]*display: inline-flex/,'shown only while paused');
});
test('the indicator is out of the way, quiet, token-coloured and has no animation',()=>{
  const pill=css.match(/\[data-ag-paused="true"\] #ag-pause-pill \{([^}]*)\}/)[1];
  assert.match(pill,/pointer-events: none/);assert.match(pill,/position: fixed/);assert.match(pill,/top: var\(--ag-space-3\)/);
  assert.match(pill,/left: 50%/);assert.match(pill,/font-size: var\(--ag-text-xs\)/);
  assert.doesNotMatch(css,/animation|transition|@keyframes/);
  assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b|\brgba?\(/,'no colour literals');
  for(const t of new Set([...css.matchAll(/var\((--ag-[a-z0-9-]+)\)/g)].map(m=>m[1]))){
    if(/^--ag-(text|space)-|^--ag-font-body$|^--ag-radius/.test(t))continue;
    assert.ok(SKIN_TOKEN_NAMES.includes(t),`${t} is not a base skin token`);
  }
});
test('GM Setup shows the control in the Game pause section, reflecting the draft',()=>{
  const tpl=read('../templates/manager.hbs');
  assert.match(tpl,/aria-label="Game pause"[\s\S]*data-ag-setup-pause \{\{#if compactPause\}\}checked\{\{\/if\}\}> Show the pause as a small indicator/);
  assert.match(read('../scripts/main.js'),/compactPause: this\.tab === "setup" \? Boolean\(this\.setupDraft\?\.compactPause \?\? /);
  assert.match(read('../scripts/main.js'),/installPauseMirror\(\{game,hooks:Hooks,doc:document\}\)/);
});
