/**
 * GM-only Items sidebar launchers: General Manager first, Locations second, in one shared
 * group whichever module renders first. Each launcher file is exercised on its own and
 * together. Proves DOM logic only, not live Foundry rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installDocument} from '../../../test-fixtures/mini-dom.mjs';
import {mountManagerLauncher} from '../scripts/items-launcher.js';
import {mountLocationLauncher} from '../../ashen-gate-locations/scripts/launcher.js';

const itemsDirectory=()=>{
  const document=installDocument();
  const root=document.createElement('section');root.id='items';
  const header=document.createElement('header');header.className='directory-header';
  const list=document.createElement('ol');list.className='directory-list';
  root.append(header,list);document.body.append(root);
  return {root,header,list};
};
const group=root=>root.querySelectorAll('[data-ag-launch-group="items"]');
const names=g=>g.children.map(b=>b.dataset.agModule);
const mountBoth=(root,{isGM=true,managerFirst=true}={})=>{
  let opened=[];
  const manager=()=>mountManagerLauncher(root,{isGM,onOpen:()=>opened.push('manager')});
  const locations=()=>mountLocationLauncher(root,{isGM,onOpen:()=>opened.push('locations')});
  for(const mount of managerFirst?[manager,locations]:[locations,manager])mount();
  return opened;
};

for(const managerFirst of [true,false]){
  test(`Items group (${managerFirst?'Manager':'Locations'} renders first): one group, Manager then Locations, above the header`,()=>{
    const {root,header}=itemsDirectory();
    mountBoth(root,{managerFirst});
    assert.equal(group(root).length,1);
    assert.deepEqual(names(group(root)[0]),['ashen-gate-manager','ashen-gate-locations']);
    assert.equal(root.children.indexOf(group(root)[0]),root.children.indexOf(header)-1);
  });
}

test('Items group is idempotent across repeated re-renders in either order',()=>{
  const {root}=itemsDirectory();
  for(let pass=0;pass<4;pass++)mountBoth(root,{managerFirst:pass%2===0});
  assert.equal(group(root).length,1);
  assert.deepEqual(names(group(root)[0]),['ashen-gate-manager','ashen-gate-locations']);
  assert.equal(root.querySelectorAll('[data-ag-launch="manager"]').length,1);
  assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,1);
});

test('each launcher works alone',()=>{
  let {root}=itemsDirectory();
  assert.equal(mountManagerLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.deepEqual(names(group(root)[0]),['ashen-gate-manager']);
  ({root}=itemsDirectory());
  assert.equal(mountLocationLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.deepEqual(names(group(root)[0]),['ashen-gate-locations']);
});

test('players get no Items launchers and stale ones are removed',()=>{
  const {root}=itemsDirectory();
  mountBoth(root);
  const opened=mountBoth(root,{isGM:false});
  assert.deepEqual(opened,[]);
  assert.equal(root.querySelectorAll('[data-ag-launch="manager"]').length,0);
  assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
  const fresh=itemsDirectory();
  mountBoth(fresh.root,{isGM:false});
  assert.equal(group(fresh.root).length,0,'no group is created for a player');
});

test('clicks are refused for a non-GM even if a stale button survives',async()=>{
  const {root}=itemsDirectory();
  const opened=mountBoth(root);
  globalThis.game={user:{isGM:false}};
  try{
    for(const b of group(root)[0].children){b.click?.();b.onclick?.({preventDefault(){}});}
    await new Promise(resolve=>setImmediate(resolve));
  }finally{delete globalThis.game;}
  assert.deepEqual(opened,[]);
});

test('GM clicks open the right module',async()=>{
  const {root}=itemsDirectory();
  const opened=mountBoth(root);
  const [manager,locations]=group(root)[0].children;
  manager.click();locations.onclick({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(opened.sort(),['locations','manager']);
});
