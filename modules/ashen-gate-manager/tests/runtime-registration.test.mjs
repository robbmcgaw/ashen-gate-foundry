import test from "node:test";
import assert from "node:assert/strict";

test("V14-shaped runtime registers GM-only settings menu and exposes launcher", async()=>{
  const callbacks=new Map();
  const menu=[];
  const fakeModule={};
  class ApplicationV2 {
    constructor(options){this.options=options}
    async render(){return this}
    async _prepareContext(){return {}}
    async _onRender(){}
  }
  globalThis.foundry={applications:{api:{ApplicationV2,HandlebarsApplicationMixin:(Parent)=>Parent, DialogV2:{confirm:async()=>true}}}};
  globalThis.Hooks={once:(event,fn)=>callbacks.set(event,fn)};
  globalThis.game={
    user:{isGM:true},
    modules:new Map([["ashen-gate-manager",fakeModule]]),
    settings:{
      register:(id,key,opt)=>assert.equal(id,"ashen-gate-manager"),
      registerMenu:(id,key,opt)=>menu.push({id,key,...opt})
    }
  };
  await import("../scripts/main.js");
  assert.ok(callbacks.has("init"));
  callbacks.get("init")();
  assert.equal(menu.length,3);
  assert.equal(menu[2].key,"npcCodex");
  assert.equal(menu[2].restricted,true,"0.45.0: hidden from players until the GM shares the Codex (then ready/onChange lift it)");
  assert.equal(menu[0].key,"manager");
  assert.equal(menu[1].key,"myAppearance");
  assert.equal(menu[1].restricted,true,"0.45.0: players open My Appearance from Utilities, not Game Settings");
  assert.equal(menu[0].restricted,true);
  assert.equal(typeof menu[0].type,"function");
  callbacks.get("ready")();
  assert.equal(typeof fakeModule.api.open,"function");
  assert.ok(await fakeModule.api.open());
});
