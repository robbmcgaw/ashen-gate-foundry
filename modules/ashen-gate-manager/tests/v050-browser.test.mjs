import test from 'node:test';
import assert from 'node:assert/strict';
import {systemOf,normalizeSourceRef,browseLibrary,inspectLibrary,isAshenModule,describeLaunchers} from '../scripts/browser.js';
import {openAshenLauncher} from '../scripts/launchers.js';

const rows=[
 {uuid:'Item.1',sourceId:'MUT-CARAPACE',name:'Living Carapace',entityType:'Mutation',kind:'Item',ownerSystemId:'SYS-MUT',status:'draft',packageId:'AG-CINDER-TEST',refs:[{relation:'grants_power',target_id:'POWER-ONE',mode:'required'}],systemKey:'SYS-MUT',systemLabel:'Cinders',archived:false,edited:1,editedFields:[{path:'name'}],version:'0.1'},
 {uuid:'Item.2',sourceId:'POWER-ONE',name:'Shellshift',entityType:'Power',kind:'Item',ownerSystemId:'SYS-MUT',status:'approved',packageId:'AG-CINDER-TEST',refs:[{relation:'part_of',target_id:'MUT-CARAPACE',mode:'optional'}],systemKey:'SYS-MUT',systemLabel:'Cinders',archived:false,edited:0},
 {uuid:'Item.3',sourceId:'PERK-ONE',name:'Other perk',entityType:'ProfessionPerk',kind:'Item',ownerSystemId:'SYS-PROF',status:'draft',packageId:'AG-PROF-TEST',refs:[],systemKey:'SYS-PROF',systemLabel:'Professions',archived:true,edited:0}
];
test('explicit owning system beats ambiguous PERK identifier',()=>{
 assert.equal(systemOf({sourceId:'PERK-ONE',ownerSystemId:'SYS-PROF'}).key,'SYS-PROF');
 assert.equal(systemOf({sourceId:'PERK-OTHER'}).key,'unclassified');
 assert.equal(systemOf({sourceId:'PERK-CINDER',packageId:'AG-CINDER-TEST'}).key,'SYS-MUT');
});
test('library filter by status, package, category, and text respects archived',()=>{
 assert.equal(browseLibrary(rows,{showArchived:false}).rows.length,2);
 assert.deepEqual(browseLibrary(rows,{showArchived:true,system:'SYS-PROF'}).rows.map(x=>x.sourceId),['PERK-ONE']);
 assert.deepEqual(browseLibrary(rows,{showArchived:true,status:'approved'}).rows.map(x=>x.sourceId),['POWER-ONE']);
 assert.deepEqual(browseLibrary(rows,{showArchived:true,package:'AG-PROF-TEST'}).rows.map(x=>x.sourceId),['PERK-ONE']);
 assert.deepEqual(browseLibrary(rows,{showArchived:true,search:'shell'}).rows.map(x=>x.sourceId),['POWER-ONE']);
});
test('library inspector resolves incoming and outgoing stable IDs',()=>{
 const ins=inspectLibrary(rows,'Item.1');
 assert.equal(ins.outgoing[0].name,'Shellshift');
 assert.equal(ins.incoming[0].name,'Shellshift');
 assert.equal(ins.edited,1);
 assert.equal(ins.outgoing[0].mode,'required');
 assert.equal(ins.refCount,1);
 assert.equal(ins.inboundCount,1);
 assert.equal(inspectLibrary(rows,'not-found'),null);
});
test('legacy typed refs normalize safely',()=>{
 assert.deepEqual(normalizeSourceRef({relation:'requires',target_id:'MAT-1',mode:'optional'}),{relation:'requires',targetId:'MAT-1',mode:'optional'});
 assert.equal(normalizeSourceRef({id:'REC-1',optional:true}).mode,'optional');
});
test('only Ashen Gate modules are listed, inactive and unavailable launchers explicit',()=>{
 const mods=[
 {id:'ashen-gate-manager',title:'Ashen Gate Manager',active:true},
 {id:'ag-profession-ledger',title:'Ashen Gate Profession Ledger',active:true,api:{open(){}}},
 {id:'ag-factions',title:'Ashen Gate Factions',active:true},
 {id:'ashen-gate-hirelings',title:'Ashen Gate Hirelings',active:false},
 {id:'some-other-module',title:'Other Module',active:true}
 ];
 assert.equal(isAshenModule({id:'ag-profession-ledger'}),true);
 const arr=describeLaunchers(mods,[['ag-factions.manager',{type:class Config{}}]]);
 assert.equal(arr.length,3);
 assert.equal(arr.find(x=>x.id==='ag-profession-ledger').launchMethod,'api');
 assert.equal(arr.find(x=>x.id==='ag-factions').launchMethod,'menu');
 assert.equal(arr.find(x=>x.id==='ashen-gate-hirelings').canOpen,false);
});
test('launch module with published API, then settings menu fallback, reject inactive',async()=>{
 let called=0;
 const modules=new Map([
 ['ag-ledger',{id:'ag-ledger',active:true,api:{open(){called++;return 'opened';}}}],
 ['ag-factions',{id:'ag-factions',active:true}],
 ['ag-hirelings',{id:'ag-hirelings',active:false}]
 ]);
 const menus=new Map([['ag-factions.manager',{type:class Sheet{render({force}){assert.equal(force,true);called++;return 'menu';}}}]]);
 assert.equal(await openAshenLauncher('ag-ledger',modules,menus),'opened');
 assert.equal(await openAshenLauncher('ag-factions',modules,menus),'menu');
 await assert.rejects(openAshenLauncher('ag-hirelings',modules,menus),/not active/);
 await assert.rejects(openAshenLauncher('not-here',modules,menus),/not active/);
 assert.equal(called,2);
});
