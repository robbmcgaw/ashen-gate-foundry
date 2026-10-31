import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Stages… window (0.16.3): proves the markup and the wiring against a mocked DialogV2 and CSS text. It does NOT prove the live Foundry window; that is checked by hand in Forge.
import {editorHtml,draftFromStages,openStageEditor} from '../scripts/stage-editor.mjs';

const css=readFileSync(new URL('../styles/cinders.css',import.meta.url),'utf8');
const hbs=readFileSync(new URL('../templates/cinders.hbs',import.meta.url),'utf8');
const empty=()=>editorHtml(draftFromStages(null,null),{source:'cinder'});

test('markup: no nested <form> (DialogV2 already wraps content in one, and the parser drops a nested form tag)',()=>{
  const html=empty();
  assert.doesNotMatch(html,/<form/i);
  assert.match(html,/<div class="agc-stages" data-agc-stages>/);
});
test('new Cinder with no stages: two empty stage rows, every row has an enabled Choose image… button, Add stage is enabled',()=>{
  const html=empty();
  assert.equal((html.match(/class="agc-stage-row"/g)||[]).length,2);
  for(const i of [0,1])assert.match(html,new RegExp(`<button type="button"[^>]*data-agc-spick="${i}"[^>]*>(?:(?!<button)[\\s\\S])*?Choose image…`));
  for(const m of html.matchAll(/<button[^>]*data-agc-(?:spick|sadd)[^>]*>/g))assert.doesNotMatch(m[0],/disabled/);
  assert.equal((html.match(/No image/g)||[]).length,2);
});
test('rows do not reuse the orb stage class .agc-stage (it carried aspect-ratio:1, which made each row a tall square and pushed the buttons off-screen)',()=>{
  assert.doesNotMatch(empty(),/class="agc-stage"/);
  assert.match(hbs,/class="agc-stage"/,'the sheet still uses .agc-stage for the orb');
  const editorRule=css.split('\n').find(l=>l.startsWith('.agc-stage-row{'));
  assert.ok(editorRule);assert.doesNotMatch(editorRule,/aspect-ratio/);
  for(const l of css.split('\n').filter(l=>/^\.agc-stage\{/.test(l)))assert.match(l,/aspect-ratio:1/,'the only .agc-stage rule is the orb stage');
  assert.equal(css.split('\n').filter(l=>/^\.agc-stage\{/.test(l)).length,1,'one .agc-stage rule, not a second one for the editor');
});
test('CSS: the dialog body is the scroll region, the footer is not inside it and stays pinned, the window is capped to the screen',()=>{
  const rule=sel=>{const m=css.match(new RegExp(`${sel.replace(/[.[\]]/g,'\\$&')}\\{([^}]*)\\}`));assert.ok(m,`missing rule ${sel}`);return m[1];};
  assert.match(rule('.application.agc-stage-dialog'),/max-height:90vh/);
  assert.match(rule('.application.agc-stage-dialog .dialog-content'),/overflow-y:auto/);
  assert.match(rule('.application.agc-stage-dialog .dialog-content'),/min-height:0/);
  assert.match(rule('.application.agc-stage-dialog .dialog-form'),/flex-direction:column/);
  assert.match(rule('.application.agc-stage-dialog .form-footer'),/flex:none/);
  assert.doesNotMatch(rule('.application.agc-stage-dialog .form-footer'),/overflow/);
});

// A tiny stand-in for the DOM: it reproduces the one browser rule that bit us. Setting innerHTML on an element that sits inside a <form>
// drops any <form> start tag in the markup, so querySelector('[data-agc-stages]') finds nothing when the markup used <form data-agc-stages>.
function fakeDialog(){
  const log={buttons:[],picked:0,saved:null,options:null,listeners:[]};
  const stub=(attrs={})=>{const ls={};return {attrs,ls,dataset:Object.fromEntries(Object.entries(attrs).map(([k,v])=>[k.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])),addEventListener:(t,f)=>{(ls[t]??=[]).push(f);log.listeners.push(t);},click(){(ls.click??[]).forEach(f=>f({target:this}));},focus(){},removeAttribute(){},setAttribute(){},querySelector:()=>null,hidden:false,textContent:''};};
  const rootNodes={};
  const root={_html:'',set innerHTML(h){root._html=h;for(const k of Object.keys(rootNodes))delete rootNodes[k];},get innerHTML(){return root._html;},
    querySelector(sel){
      if(sel==='[data-agc-stages]')return /<form[^>]*data-agc-stages/i.test(root._html)?null:(rootNodes.form??=stub());
      const m=/^\[(data-agc-[a-z]+)(?:="([^"]*)")?\]/.exec(sel);
      if(m){const re=new RegExp(`${m[1]}(?:="([^"]*)")?`);return re.test(root._html)?(rootNodes[sel]??=stub({[m[1]]:m[2]??re.exec(root._html)[1]??''})):null;}
      return null;},
    querySelectorAll(sel){const m=/^\[(data-agc-[a-z]+)\]/.exec(sel);if(!m)return [];return [...root._html.matchAll(new RegExp(`${m[1]}="([^"]*)"`,'g'))].map(x=>(rootNodes[`${m[1]}${x[1]}`]??=stub({[m[1]]:x[1]})));},_nodes:rootNodes};
  const D={wait:async o=>{log.options=o;const d={element:{querySelector:s=>s==='[data-agc-stage-root]'?root:null},close:async()=>{}};o.render({target:d},d);log.buttons=o.buttons;log.root=root;log.dlg=d;return 'cancel';}};
  return {D,log};
}

test('openStageEditor on a new Cinder (no stages): renders without throwing, is not modal, has Cancel then Save Changes, and Choose image… opens the picker',async()=>{
  const {D,log}=fakeDialog();let picked=null;
  await openStageEditor({info:{stages:null,own:false},art:null,name:'Crimson',dialog:D,pickImage:(cur,set)=>{picked={cur};set('ashen-gate/cinders/crimson-1.webp');},save:async()=>{}});
  assert.equal(log.options.modal,false,'a modal (showModal) window leaves the file picker behind it, unclickable');
  assert.deepEqual(log.options.classes,['ag-app','ag-dialog','agc-stage-dialog']);
  assert.equal(log.options.window.resizable,true);
  assert.deepEqual(log.buttons.map(b=>b.label),['Cancel','Save Changes']);
  assert.equal(log.buttons[1].default,true);
  assert.match(log.root.innerHTML,/data-agc-spick="0"/);
  // The buttons were wired: clicking Choose image… on stage 1 reaches pickImage, and the chosen path lands in the draft (the editor re-renders with it).
  log.root.querySelectorAll('[data-agc-spick]')[0].click();
  await new Promise(r=>setImmediate(r));
  assert.ok(picked,'pickImage was called');
  assert.match(log.root.innerHTML,/crimson-1\.webp/);
  assert.ok(log.listeners.includes('click'));
});
test('openStageEditor: Add stage is wired and adds a row',async()=>{
  const {D,log}=fakeDialog();
  await openStageEditor({info:{stages:null,own:false},name:'Crimson',dialog:D,pickImage(){},save:async()=>{}});
  log.root.querySelector('[data-agc-sadd]').click();
  assert.equal((log.root.innerHTML.match(/class="agc-stage-row"/g)||[]).length,3);
});
test('openStageEditor: Enter in a field does not submit the window (it would press Save Changes)',async()=>{
  const {D,log}=fakeDialog();
  await openStageEditor({info:{stages:null,own:false},name:'Crimson',dialog:D,pickImage(){},save:async()=>{}});
  let prevented=false;
  log.root.querySelector('[data-agc-stages]').ls.keydown[0]({key:'Enter',target:{tagName:'INPUT'},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
});
