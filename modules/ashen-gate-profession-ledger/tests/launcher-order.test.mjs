import test from 'node:test';import assert from 'node:assert/strict';
import {ACTORS_LAUNCHER_RANK,ITEM_LAUNCHER_RANK,arrangeLaunchers} from '../scripts/launcher-order.mjs';
const button=rank=>({dataset:rank==null?{}:{agLauncherRank:String(rank)}});
test('AG-WORK-0016 default Actors order matches approved v1.6',()=>{
 assert.deepEqual(Object.keys(ACTORS_LAUNCHER_RANK),[
  'ashen-gate-profession-ledger','ashen-gate-factions','ashen-gate-skill-trees','ashen-gate-headquarters','ashen-gate-quest-manager']);
 assert.deepEqual(Object.values(ACTORS_LAUNCHER_RANK),[10,20,30,40,50]);
 assert.deepEqual(Object.values(ITEM_LAUNCHER_RANK),[10,20]);
});
test('sorts only opted-in launcher buttons without deleting unrelated UI',()=>{
 const a=button(30),b=button(10),c=button(20),unrelated=button();
 const host={children:[unrelated,a,b,c],append(x){this.children.splice(this.children.indexOf(x),1);this.children.push(x);}};
 arrangeLaunchers(host);assert.deepEqual(host.children,[unrelated,b,c,a]);
});
test('re-rendering the group order is idempotent',()=>{
 const a=button(30),b=button(10),host={children:[a,b],append(x){this.children.splice(this.children.indexOf(x),1);this.children.push(x);}};
 arrangeLaunchers(host);const first=[...host.children];arrangeLaunchers(host);assert.deepEqual(host.children,first);
});
