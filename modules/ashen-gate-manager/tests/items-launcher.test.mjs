/**
 * General Manager's GM-only launcher stays alone in the Items sidebar; Locations' GM launcher
 * lives in the Scenes sidebar (0.25.1). The two never share or merge a shelf. Proves DOM logic
 * only, not live Foundry rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installDocument} from '../../../test-fixtures/mini-dom.mjs';
import {mountManagerLauncher} from '../scripts/items-launcher.js';
import {mountLocationLauncher} from '../../ashen-gate-locations/scripts/launcher.js';

const directory=id=>{
  const document=installDocument();
  const root=document.createElement('section');root.id=id;
  const header=document.createElement('header');header.className='directory-header';
  const list=document.createElement('ol');list.className='directory-list';
  root.append(header,list);document.body.append(root);
  return {root,header,list};
};
const group=(root,tab)=>root.querySelectorAll(`[data-ag-launch-group="${tab}"]`);
const names=g=>g.children.map(b=>b.dataset.agModule??b.dataset.agLaunch);

test('Items sidebar: Manager alone, one group above the header, idempotent',()=>{
  const {root,header}=directory('items');
  for(let pass=0;pass<4;pass++)assert.equal(mountManagerLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.equal(group(root,'items').length,1);
  assert.deepEqual(names(group(root,'items')[0]),['ashen-gate-manager']);
  assert.equal(root.children.indexOf(group(root,'items')[0]),root.children.indexOf(header)-1);
  assert.equal(root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
});

test('Scenes sidebar: Locations alone, one group above the header, idempotent, no Items group',()=>{
  const {root,header}=directory('scenes');
  for(let pass=0;pass<4;pass++)assert.equal(mountLocationLauncher(root,{isGM:true,onOpen:()=>{}}),true);
  assert.equal(group(root,'scenes').length,1);
  assert.deepEqual(names(group(root,'scenes')[0]),['ashen-gate-locations']);
  assert.equal(group(root,'items').length,0);
  assert.equal(root.children.indexOf(group(root,'scenes')[0]),root.children.indexOf(header)-1);
});

test('the two launchers never share a shelf',()=>{
  const items=directory('items'),scenes=directory('scenes');
  mountManagerLauncher(items.root,{isGM:true,onOpen:()=>{}});
  mountLocationLauncher(scenes.root,{isGM:true,onOpen:()=>{}});
  assert.equal(items.root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
  assert.equal(scenes.root.querySelectorAll('[data-ag-launch="manager"]').length,0);
});

test('players get no launchers and stale ones are removed',()=>{
  const items=directory('items'),scenes=directory('scenes');
  mountManagerLauncher(items.root,{isGM:true,onOpen:()=>{}});
  mountLocationLauncher(scenes.root,{isGM:true,onOpen:()=>{}});
  assert.equal(mountManagerLauncher(items.root,{isGM:false,onOpen:()=>{}}),false);
  assert.equal(mountLocationLauncher(scenes.root,{isGM:false,onOpen:()=>{}}),false);
  assert.equal(items.root.querySelectorAll('[data-ag-launch="manager"]').length,0);
  assert.equal(scenes.root.querySelectorAll('[data-ag-module="ashen-gate-locations"]').length,0);
  const fresh=directory('items');
  mountManagerLauncher(fresh.root,{isGM:false,onOpen:()=>{}});
  assert.equal(group(fresh.root,'items').length,0,'no group is created for a player');
});

test('clicks are refused for a non-GM even if a stale button survives',async()=>{
  const items=directory('items'),scenes=directory('scenes');const opened=[];
  mountManagerLauncher(items.root,{isGM:true,onOpen:()=>opened.push('manager')});
  mountLocationLauncher(scenes.root,{isGM:true,onOpen:()=>opened.push('locations')});
  globalThis.game={user:{isGM:false}};
  try{
    for(const g of [group(items.root,'items')[0],group(scenes.root,'scenes')[0]])
      for(const b of g.children){b.click?.();b.onclick?.({preventDefault(){}});}
    await new Promise(resolve=>setImmediate(resolve));
  }finally{delete globalThis.game;}
  assert.deepEqual(opened,[]);
});

test('GM clicks open the right module',async()=>{
  const items=directory('items'),scenes=directory('scenes');const opened=[];
  mountManagerLauncher(items.root,{isGM:true,onOpen:()=>opened.push('manager')});
  mountLocationLauncher(scenes.root,{isGM:true,onOpen:()=>opened.push('locations')});
  group(items.root,'items')[0].children[0].click();
  group(scenes.root,'scenes')[0].children[0].onclick({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(opened.sort(),['locations','manager']);
});
