import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
// 0.35.1: the Give… buttons in the hand-out pop-ups did nothing in Forge. This drives the real click path in a real browser DOM
// (headless Chromium) against stand-ins for the ways a DialogV2 can deliver a click. It is skipped where Playwright is not installed.
const here=path.dirname(fileURLToPath(import.meta.url));
let chromium=null;
for(const base of ['/opt/node-tools/node_modules/x.js',import.meta.url]){try{chromium=createRequire(base)('playwright').chromium;break;}catch{}}
const source=fs.readFileSync(path.resolve(here,'../scripts/dialog-actions.mjs'),'utf8').replace('export function','function');

// How a DialogV2 may deliver a click, as stand-ins running in the page.
const SIM=`
class SimDialog{
  constructor(options){this.options=options;this.element=null;}
  async render(){
    const el=document.createElement('div');el.className='window';
    el.innerHTML='<form>'+this.options.content+'<footer><button type="submit" data-action="close">Close</button></footer></form>';
    el.querySelector('form').addEventListener('submit',e=>e.preventDefault());document.body.append(el);this.element=el;
    // Variant "actions": ApplicationV2 routes a click on any [data-action] to options.actions[name].
    if(SimDialog.variant==='actions'||SimDialog.variant==='both')el.addEventListener('click',e=>{const t=e.target.closest('[data-action]');const h=t&&this.options.actions?.[t.dataset.action];if(h)h.call(this,e,t);});
    // Variant "render": the render callback is called as (event, dialog).
    if(SimDialog.variant==='render'||SimDialog.variant==='both')this.options.render?.(new Event('render'),this);
    return this;
  }
}`;
for(const variant of ['actions','render','neither','both']){
  test(`real DOM: a content button runs its handler exactly once when the dialog delivers clicks via "${variant}"`,{skip:!chromium&&'Playwright is not installed here'},async()=>{
    const browser=await chromium.launch();
    try{
      const page=await browser.newPage();
      await page.setContent('<body></body>');
      const result=await page.evaluate(async({source,SIM,variant})=>{
        const factory=new Function(`${source}\n${SIM}\nSimDialog.variant=${JSON.stringify(variant)};return {makeActionDialog,SimDialog};`);
        const {makeActionDialog,SimDialog}=factory();
        const calls=[],errors=[];
        const {dialog,attach}=makeActionDialog(SimDialog,{id:'t',title:'T',buttons:[],onError:e=>errors.push(String(e)),
          content:'<ul><li><button type="button" data-action="agl-handout-give" data-actor="gus"><i class="icon"></i>Give…</button></li><li><button type="button" data-action="agl-give-material" data-material="MAT-X">Add</button></li></ul>',
          handlers:{'agl-handout-give':d=>calls.push(['give',d.actor]),'agl-give-material':async d=>{calls.push(['add',d.material]);}}});
        await dialog.render({force:true});attach(dialog);
        document.querySelector('[data-actor="gus"] .icon').click();   // a click on the icon inside the button
        document.querySelector('[data-material]').click();
        document.querySelector('[data-action="close"]').click();       // the dialog's own button is not ours
        await new Promise(r=>setTimeout(r,20));
        return {calls,errors};
      },{source,SIM,variant});
      assert.deepEqual(result.calls,[['give','gus'],['add','MAT-X']],'each click handled once, in any delivery');
      assert.deepEqual(result.errors,[]);
    }finally{await browser.close();}
  });
}
test('real DOM: a handler that throws is reported, not lost',{skip:!chromium&&'Playwright is not installed here'},async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();await page.setContent('<body></body>');
    const errors=await page.evaluate(async({source,SIM})=>{
      const {makeActionDialog,SimDialog}=new Function(`${source}\n${SIM}\nSimDialog.variant='neither';return {makeActionDialog,SimDialog};`)();
      const errors=[];
      const {dialog,attach}=makeActionDialog(SimDialog,{id:'t',title:'T',buttons:[],onError:e=>errors.push(e.message),content:'<button type="button" data-action="x">x</button>',handlers:{x:async()=>{throw Error('Only the GM can give gathering loot');}}});
      await dialog.render();attach(dialog);document.querySelector('[data-action="x"]').click();await new Promise(r=>setTimeout(r,20));return errors;
    },{source,SIM});
    assert.deepEqual(errors,['Only the GM can give gathering loot']);
  }finally{await browser.close();}
});
