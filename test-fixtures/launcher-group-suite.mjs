/**
 * Shared tests for the Ashen Gate Actors launcher group (ag-launchers.mjs). Each
 * player-facing module runs this suite against its own copy of the helper; the copies
 * are identical (scripts/check.mjs), so one copy standing in for all six modules is
 * the same code Foundry runs. Proves DOM logic only, not live Foundry rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installDocument,actorsDirectory} from './mini-dom.mjs';

const EXPECTED=['ashen-gate-profession-ledger','ashen-gate-skill-trees','ashen-gate-quest-manager',
  'ashen-gate-factions','ashen-gate-headquarters','ashen-gate-utilities'];
const LABELS={'ashen-gate-profession-ledger':'Profession Ledger','ashen-gate-skill-trees':'Skill Trees',
  'ashen-gate-quest-manager':'Quest Log','ashen-gate-factions':'Factions & Renown',
  'ashen-gate-headquarters':'Headquarters','ashen-gate-utilities':'Utilities'};

function permutations(list){
  if(list.length<=1)return [list];
  return list.flatMap((item,i)=>permutations([...list.slice(0,i),...list.slice(i+1)]).map(rest=>[item,...rest]));
}

export function launcherGroupSuite(helper,moduleId){
  const {LAUNCHER_GROUP_ID,LAUNCHER_ORDER,launcherRoot,mountLauncher}=helper;
  const opened=[];
  const mount=(root,id,visible=true)=>mountLauncher(root,{moduleId:id,label:LABELS[id],icon:'fa-solid fa-star',
    onClick:()=>opened.push(id),visible});
  const ids=group=>[...group.children].map(node=>node.dataset.agLauncher);
  const setup=()=>{installDocument();return actorsDirectory();};

  test(`${moduleId}: order table lists the six modules in the agreed order`,()=>{
    assert.ok(EXPECTED.includes(moduleId));
    assert.deepEqual(Object.keys(LAUNCHER_ORDER).sort((a,b)=>LAUNCHER_ORDER[a]-LAUNCHER_ORDER[b]),EXPECTED);
  });

  test(`${moduleId}: fixed order whatever the module load order`,()=>{
    for(const loadOrder of permutations(EXPECTED)){
      const {root,header,actions,search}=setup();
      for(const id of loadOrder)assert.equal(mount(root,id),true);
      const groups=root.querySelectorAll(`#${LAUNCHER_GROUP_ID}`);
      assert.equal(groups.length,1,`one group for load order ${loadOrder}`);
      assert.deepEqual(ids(groups[0]),EXPECTED,`order for load order ${loadOrder}`);
      assert.deepEqual(header.children,[groups[0],actions,search],'group sits at the top; Foundry controls untouched');
    }
  });

  test(`${moduleId}: any subset keeps the same relative order`,()=>{
    for(const skip of EXPECTED){
      const {root}=setup();
      const enabled=EXPECTED.filter(id=>id!==skip);
      for(const id of [...enabled].reverse())mount(root,id);
      assert.deepEqual(ids(root.querySelector(`#${LAUNCHER_GROUP_ID}`)),enabled);
    }
  });

  test(`${moduleId}: no duplicate buttons or groups on repeated re-render`,()=>{
    const {root}=setup();
    for(let pass=0;pass<5;pass++)for(const id of pass%2?EXPECTED:[...EXPECTED].reverse())mount(root,id);
    assert.equal(root.querySelectorAll(`#${LAUNCHER_GROUP_ID}`).length,1);
    for(const id of EXPECTED)assert.equal(root.querySelectorAll(`[data-ag-launcher="${id}"]`).length,1,id);
    assert.deepEqual(ids(root.querySelector(`#${LAUNCHER_GROUP_ID}`)),EXPECTED);
  });

  test(`${moduleId}: a stray duplicate from an earlier render is removed`,()=>{
    const {root}=setup();
    for(const id of EXPECTED)mount(root,id);
    const group=root.querySelector(`#${LAUNCHER_GROUP_ID}`);
    const stray=root.querySelector(`[data-ag-launcher="${moduleId}"]`);
    const copy=document.createElement('button');copy.dataset.agLauncher=moduleId;group.append(copy);
    mount(root,moduleId);
    assert.deepEqual(root.querySelectorAll(`[data-ag-launcher="${moduleId}"]`),[stray]);
    assert.deepEqual(ids(group),EXPECTED);
  });

  test(`${moduleId}: re-render that replaces the header rebuilds one clean group`,()=>{
    const {root,header}=setup();
    for(const id of EXPECTED)mount(root,id);
    header.remove();
    const fresh=document.createElement('header');fresh.className='directory-header';root.prepend(fresh);
    for(const id of EXPECTED)mount(root,id);
    assert.equal(root.querySelectorAll(`#${LAUNCHER_GROUP_ID}`).length,1);
    assert.deepEqual(ids(fresh.children[0]),EXPECTED);
  });

  test(`${moduleId}: hidden modules show no button and an empty group disappears`,()=>{
    const {root}=setup();
    for(const id of EXPECTED)mount(root,id);
    assert.equal(mount(root,moduleId,false),true);
    const group=root.querySelector(`#${LAUNCHER_GROUP_ID}`);
    assert.deepEqual(ids(group),EXPECTED.filter(id=>id!==moduleId));
    mount(root,moduleId,true);
    assert.deepEqual(ids(group),EXPECTED,'revealing restores the button in its slot');
    for(const id of EXPECTED)mount(root,id,false);
    assert.equal(root.querySelector(`#${LAUNCHER_GROUP_ID}`),null);
    mount(root,moduleId,false);
    assert.equal(root.querySelector(`#${LAUNCHER_GROUP_ID}`),null,'hidden module never creates the group');
  });

  test(`${moduleId}: every button has the same markup and opens its module`,()=>{
    const {root}=setup();
    for(const id of EXPECTED)mount(root,id);
    for(const button of root.querySelector(`#${LAUNCHER_GROUP_ID}`).children){
      const id=button.dataset.agLauncher;
      assert.equal(button.tagName,'BUTTON');
      assert.equal(button.type,'button');
      assert.equal(button.className,'ag-launcher');
      assert.deepEqual(button.children.map(c=>c.tagName),['I','SPAN']);
      assert.equal(button.textContent,LABELS[id]);
      assert.equal(button.getAttribute('aria-label'),`Open ${LABELS[id]}`);
    }
    opened.length=0;
    const event=root.querySelector(`[data-ag-launcher="${moduleId}"]`).click();
    assert.deepEqual(opened,[moduleId]);
    assert.equal(event.defaultPrevented,true);
  });

  test(`${moduleId}: click errors become a warning, not an uncaught throw`,async()=>{
    const {root}=setup();
    const warnings=[];globalThis.ui={notifications:{warn:message=>warnings.push(message)}};
    const quiet=console.error;console.error=()=>{};
    try{
      mountLauncher(root,{moduleId,label:'X',icon:'fa-solid fa-star',onClick:()=>{throw new Error('hidden by GM');}});
      root.querySelector(`[data-ag-launcher="${moduleId}"]`).click();
      root.querySelector(`[data-ag-launcher="${moduleId}"]`).remove();
      mountLauncher(root,{moduleId,label:'X',icon:'fa-solid fa-star',onClick:async()=>{throw new Error('async fail');}});
      root.querySelector(`[data-ag-launcher="${moduleId}"]`).click();
      await new Promise(resolve=>setImmediate(resolve));
    }finally{console.error=quiet;delete globalThis.ui;}
    assert.deepEqual(warnings,['hidden by GM','async fail']);
  });

  test(`${moduleId}: tolerant of missing directory and jQuery-wrapped elements`,()=>{
    const {root}=setup();
    assert.equal(mount(null,moduleId),false);
    assert.equal(mount(document.createElement('div'),moduleId),false,'no header: nothing mounted, no throw');
    assert.equal(launcherRoot({element:root}),root);
    assert.equal(launcherRoot({},Object.assign([root],{jquery:'3'})),root);
    assert.equal(launcherRoot(undefined,undefined),null);
  });
}
