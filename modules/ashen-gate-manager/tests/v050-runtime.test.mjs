import test from 'node:test';
import assert from 'node:assert/strict';

function mockDoc(i=0){
 const id=i?'POWER-EXAMPLE':'MUT-EXAMPLE',name=i?'Example Power':'Example Mutation';
 const source={sourceId:id,entityType:i?'Power':'Mutation',ownerSystemId:'SYS-MUT',version:'0.1.0',
   status:'draft',visibility:'gm',packageId:'AG-CINDERS-TEST',refs:i?[{relation:'belongs_to',target_id:'MUT-EXAMPLE',mode:'required'}]:[],managedFields:{name},provenance:{sources:['example']}};
 return {id:'abc'+i,uuid:'Item.abc'+i,name,type:'feat',documentName:'Item',getFlag:(module,key)=> module==='ashen-gate-manager' && key==='source'?source:null};
}
test('Manager v0.5 context renders library filters, inspector and launcher inventory without mutating documents',async()=>{
 const callbacks=new Map(),menu=[];
 class ApplicationV2 {async render(){} async _prepareContext(){return {};} async _onRender(){}}
 globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:(Parent)=>Parent,DialogV2:{}}}};
 globalThis.Hooks={once:(name,cb)=>callbacks.set(name,cb)};
 const m0={id:'ashen-gate-manager',title:'Ashen Gate Manager',active:true},m1={id:'ag-ledger',title:'Ashen Gate Profession Ledger',active:true,api:{open(){}}};
 const modules=new Map([[m0.id,m0],[m1.id,m1]]);
 const items=[mockDoc(0),mockDoc(1)];
 const world={items:{contents:items},journal:{contents:[]},macros:{contents:[]},actors:{contents:[]},modules,
  user:{isGM:true},settings:{menus:new Map(),get:()=>[],register:()=>{},registerMenu:(id,key,opts)=>menu.push(opts)}};
 globalThis.game=world;
 await import('../scripts/main.js');
 callbacks.get('init')();
 const app=new menu[0].type();
 let c=await app._prepareContext({});
 assert.equal(c.libraryTotal,2);
 assert.equal(c.libraryRows.length,2);
 assert.equal(c.launcherRows.length,1);
 assert.equal(c.launcherRows[0].canOpen,true);
 app.tab='library';app.libraryFocus='Item.abc0';app.librarySystem='SYS-MUT';
 c=await app._prepareContext({});
 assert.equal(c.libraryActive,true);
 assert.equal(c.libraryHasDetail,true);
 assert.equal(c.libraryDetail.inboundCount,1);
 assert.equal(c.libraryRows[0].systemLabel,'Cinders');
 app.librarySearch='no matches';
 c=await app._prepareContext({});assert.equal(c.libraryRows.length,0);
 assert.equal(c.libraryHasDetail,true); // inspector remains stable until explicitly cleared
});
