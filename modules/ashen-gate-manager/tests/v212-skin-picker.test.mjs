// Appearance cards replace the dropdowns. Proves picker logic, template markup and save wiring with fakes, not live Foundry rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindSkinPicker,nextRadioIndex} from '../scripts/skin-picker.js';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const SKINS=['ag-default','ag-slate','ag-ember','ag-verdigris','ag-parchment','ag-stone-tablet','ag-tome-pages'];

function fakePicker(values,selected){
  const listeners={};
  const radios=values.map(v=>{const attrs=new Map([['aria-checked',v===selected?'true':'false'],['tabindex',v===selected?'0':'-1']]);const classes=new Set();
    const r={dataset:{agSkinValue:v},focused:false,setAttribute:(k,x)=>attrs.set(k,x),getAttribute:k=>attrs.get(k),
      classList:{toggle:(c,on)=>on?classes.add(c):classes.delete(c),has:c=>classes.has(c)},focus(){r.focused=true;},closest:s=>s==='[role="radio"]'?r:null};return r;});
  const group={querySelectorAll:()=>radios,contains:()=>true,addEventListener:(t,f)=>{listeners[t]=f;}};
  const fire=(t,target,extra={})=>{const e={target,key:extra.key,prevented:false,preventDefault(){this.prevented=true;}};listeners[t](e);return e;};
  return {group,radios,fire,checked:()=>radios.filter(r=>r.getAttribute('aria-checked')==='true').map(r=>r.dataset.agSkinValue)};
}

test('clicking a card selects it, only one stays checked, and the value is reported',()=>{
  const p=fakePicker(['',...SKINS],'ag-slate');let got;bindSkinPicker(p.group,v=>{got=v;});
  p.fire('click',p.radios[6]);
  assert.equal(got,'ag-stone-tablet');assert.deepEqual(p.checked(),['ag-stone-tablet']);
  assert.equal(p.radios[6].getAttribute('tabindex'),'0');assert.equal(p.radios[2].getAttribute('tabindex'),'-1');
  assert.equal(p.radios[6].classList.has('is-selected'),true);assert.equal(p.radios[2].classList.has('is-selected'),false);
});
test('the Inherit card reports an empty value',()=>{
  const p=fakePicker(['',...SKINS],'ag-ember');let got='unset';bindSkinPicker(p.group,v=>{got=v;});
  p.fire('click',p.radios[0]);assert.equal(got,'');assert.deepEqual(p.checked(),['']);
});
test('arrow keys move and select with wrap, move focus, and ignore other keys',()=>{
  assert.equal(nextRadioIndex('ArrowRight',7,8),0);assert.equal(nextRadioIndex('ArrowLeft',0,8),7);
  assert.equal(nextRadioIndex('ArrowDown',1,8),2);assert.equal(nextRadioIndex('ArrowUp',1,8),0);
  assert.equal(nextRadioIndex('Home',4,8),0);assert.equal(nextRadioIndex('End',4,8),7);
  assert.equal(nextRadioIndex('a',1,8),null);assert.equal(nextRadioIndex('ArrowRight',0,0),null);
  const p=fakePicker(['',...SKINS],'');let got;bindSkinPicker(p.group,v=>{got=v;});
  const e=p.fire('keydown',p.radios[0],{key:'ArrowRight'});
  assert.equal(e.prevented,true);assert.equal(got,'ag-default');assert.equal(p.radios[1].focused,true);assert.deepEqual(p.checked(),['ag-default']);
  const tab=p.fire('keydown',p.radios[1],{key:'Tab'});assert.equal(tab.prevented,false);
});

for(const [name,path] of [['My Appearance','../templates/my-appearance.hbs'],['Manager world default','../templates/manager.hbs']]){
  test(`${name}: picker is a radiogroup of radio cards and no <select> remains for it`,()=>{
    let t=read(path);
    if(path.includes('manager'))t=t.slice(t.indexOf('data-ag-appearance-pop'),t.indexOf('For all players'));
    assert.match(t,/role="radiogroup"/);assert.match(t,/role="radio"/);assert.match(t,/aria-checked=/);assert.match(t,/aria-describedby=/);
    assert.doesNotMatch(t,/<select/);assert.doesNotMatch(t,/<option/);
  });
}
test('My Appearance has a labelled Inherit card and keeps its status lines and Save button',()=>{
  const t=read('../templates/my-appearance.hbs');
  assert.match(t,/data-ag-skin-value=""/);assert.match(t,/Inherit world default/);
  assert.match(t,/GM world default: <strong>\{\{worldDefault\}\}<\/strong> · Currently displayed: <strong>\{\{effective\}\}<\/strong>/);
  assert.match(t,/role="status"[^>]*>\{\{status\}\}/);assert.match(t,/data-ag-my-save/);
});

test('both pickers feed the existing selection state; save semantics are unchanged; GM gate intact',()=>{
  const m=read('../scripts/main.js');
  assert.match(m,/bindSkinPicker\(root\.querySelector\('\[data-ag-skin-picker="world"\]'\),value=>\{this\.appearanceSelection=value;\}\)/);
  assert.match(m,/bindSkinPicker\(this\.element\.querySelector\('\[data-ag-skin-picker="my"\]'\),value=>\{this\.selection=value;\}\)/);
  assert.match(m,/const chosen=this\.selection===null \? \(appearanceController\.getState\(\)\.userOverride\?\?''\) : this\.selection;\s*await appearanceController\.setUserOverride\(chosen\)/);
  assert.match(m,/const choice=this\.appearanceSelection\?\?appearanceController\?\.getState\(\)\?\.worldDefault;\s*await appearanceController\.setWorldDefault\(choice\)/);
  assert.doesNotMatch(m,/data-ag-world-skin|data-ag-my-skin/);
});
test('every skin renders as a card source and the picker styles wrap and show focus',()=>{
  const css=read('../styles/manager.css');
  // 0.43.0: module prefix (agm-); the kit draws the focus ring on every button in an .ag-app window.
  assert.match(css,/\.agm-skin-picker\{[^}]*auto-fill/);assert.match(css,/\.agm-skin-card\.is-selected/);
  assert.match(read('../styles/ag-ui.css'),/:where\(\.ag-app\) :where\(button, input, select, textarea, summary, a, \[tabindex\]\):focus-visible/);
});
