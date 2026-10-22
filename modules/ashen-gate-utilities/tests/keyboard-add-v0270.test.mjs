// 0.27.0 (UT-31): keyboard and click alternatives to drag and drop. Add to stash… (window and embed), Add item… and
// Choose Actor… in the shop editor. Each button picks in a kit form dialog, then hands the pick to the function the drop
// zone calls (stashListDrop → depositItem, dropIntoDraft, dropMerchant), so the result and the permission checks are the
// drop's own. Mocked Foundry globals (dnd5e's container model): proves the logic, not the live Foundry dialogs, focus
// or keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
import {itemChoices,folderChoices,stashSources,shopSources,pickOne,pickStashDeposit,pickShopItems,pickMerchantActor} from '../scripts/keyboard-add.mjs';
import {refocus} from '../scripts/ui-parts.mjs';

const handlers={once:new Map(),on:new Map()};const settings=new Map();const sent=[];let socketHandler=null;
globalThis.HTMLElement=class {};
let nextId=0;const freshId=()=>`id${String(++nextId).padStart(14,'0')}`;
// The kit's form dialog runs on DialogV2.wait: each answer is the picked value (null = Cancel). Every dialog is kept.
const dialogs=[];let answers=[];
const DialogV2={wait:async o=>{dialogs.push(o);const a=answers.shift();if(a===null||a===undefined)return o.buttons[0].callback();return o.buttons.at(-1).callback(null,{form:{elements:[{name:'pick',value:a}]}});}};
globalThis.foundry={utils:{randomID:freshId},applications:{api:{DialogV2,ApplicationV2:class{constructor(o){this.options=o;this.rendered=false;this.renders=0;}async render(){this.rendered=true;this.renders++;return this;}async close(){this.rendered=false;}}}}};
const gm={id:'gm',name:'GM',isGM:true,active:true},alice={id:'alice',name:'Alice',isGM:false,active:true},bob={id:'bob',name:'Bob',isGM:false,active:true};
const docs=new Map();
function mkItems(actor){const m=new Map();return {get:id=>m.get(id),get size(){return m.size;},get contents(){return [...m.values()];},[Symbol.iterator]:()=>m.values(),
 add(data){const id=data._id??freshId();const item={...structuredClone(data),id,documentName:'Item',parent:actor,
   toObject(){const {id:_i,documentName:_d,parent:_p,uuid:_u,toObject:_t,delete:_x,...rest}=this;return structuredClone({...rest,_id:this.id});},
   async delete(){m.delete(this.id);docs.delete(this.uuid);return this;}};
  item.uuid=actor?`Actor.${actor.id}.Item.${id}`:`Item.${id}`;m.set(id,item);docs.set(item.uuid,item);return item;}};}
function mkActor(id,name,owner,{flags={},type}={}){const a={id,name,uuid:`Actor.${id}`,img:`${id}.webp`,type:type??(owner?'character':'npc'),documentName:'Actor',statuses:new Set(),effects:[],flags,
 getFlag:(ns,k)=>flags[ns]?.[k],testUserPermission:u=>u.isGM||u.id===owner,
 async createEmbeddedDocuments(t,list,o={}){return list.map(d=>a.items.add(o.keepId?d:{...d,_id:undefined}));},
 async deleteEmbeddedDocuments(t,ids){return Promise.all(ids.map(i=>a.items.get(i)?.delete()));},
 update:async d=>{a.lastUpdate=d;}};a.items=mkItems(a);docs.set(a.uuid,a);return a;}
const stash=mkActor('stash','Party Stash',null,{flags:{[ID]:{partyStash:true}}});
const pcA=mkActor('pcA','[TEST] Wren','alice'),pcB=mkActor('pcB','[TEST] Ash','bob');
const backup=mkActor('pcA-bak','[TEST] Wren (level 2 backup)','alice',{flags:{'ashen-gate-character-hub':{levelBackup:true}}});
const brin=mkActor('brin','[TEST] Brin Tallow',null,{type:'npc'});
const users=[gm,alice,bob];users.get=id=>users.find(u=>u.id===id);
const actors=[stash,pcA,pcB,backup,brin];actors.get=id=>actors.find(a=>a.id===id);
const worldItems=mkItems(null);
const folders=[{id:'f1',name:'[TEST] Stock',type:'Item',uuid:'Folder.f1',folder:null,getSubfolders:()=>[]},{id:'f2',name:'[TEST] Tools',type:'Item',uuid:'Folder.f2',getSubfolders:()=>[]},{id:'fa',name:'[TEST] NPCs',type:'Actor',uuid:'Folder.fa'}];
folders[1].folder=folders[0];for(const f of folders)docs.set(f.uuid,{...f,documentName:'Folder'});
globalThis.fromUuid=async u=>docs.get(u)??null;globalThis.fromUuidSync=u=>docs.get(u)??null;
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
globalThis.JournalEntry={create:async()=>{throw Error('no journal writes here');}};
globalThis.game={user:gm,users,actors,items:worldItems,folders,journal:[],time:{worldTime:0},modules:new Map([[ID,{id:ID,active:true}]]),tables:[],messages:new Map(),i18n:{localize:x=>x},
 settings:{register:(ns,key,o)=>settings.set(`${ns}.${key}`,{value:o.default,onChange:o.onChange}),get:(ns,key)=>settings.get(`${ns}.${key}`)?.value,set:async(ns,key,v)=>{const x=settings.get(`${ns}.${key}`);x.value=v;x.onChange?.(v);}},
 socket:{emit:(ch,msg)=>sent.push(msg),on:(ch,fn)=>{socketHandler=fn;}}};
globalThis.CONFIG={DND5E:{skills:{}},statusEffects:[],Item:{typeLabels:{loot:'Loot',container:'Container',weapon:'Weapon'}}};
const notes=[];globalThis.ui={notifications:{info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])}};
globalThis.Hooks={once:(k,fn)=>handlers.once.set(k,fn),on:(k,fn)=>handlers.on.set(k,fn),off:()=>{},callAll:()=>{}};
globalThis.ChatMessage={create:async m=>m,getSpeaker:()=>({})};
await import('../scripts/main.mjs');
const shopsMod=await import('../scripts/shops.mjs');
handlers.once.get('init')();handlers.once.get('ready')();
const api=game.modules.get(ID).api;
await game.settings.set(ID,'playerAccessEnabled',true);await game.settings.set(ID,'stashEnabled',true);await game.settings.set(ID,'stashVoteRequired',false);
const tick=()=>new Promise(r=>setTimeout(r,5));
const byName=(actor,name)=>[...actor.items].find(i=>i.name===name);
const as=async(user,fn)=>{const was=game.user;game.user=user;try{return await fn();}finally{game.user=was;}};
const optionsOf=o=>[...String(o.content).matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
const reset=()=>{dialogs.length=0;answers=[];notes.length=0;sent.length=0;};
/** A Bag holding Rope ×3 on `actor`. */
function bagFor(actor){const bag=actor.items.add({name:'[TEST] Bag',type:'container',system:{quantity:1,container:null}});actor.items.add({name:'[TEST] Rope',type:'loot',system:{quantity:3,container:bag.id}});return bag;}
/** Window app on the Party Inventory tab; `root` stands in for its content element. */
const windowApp=async()=>{const app=await api.stash.open();app.tab='inventory';app.stashTab='items';return app;};
const root={querySelector:()=>null,contains:()=>true};
const click=(app,action,dataset={})=>app.handle(action,{disabled:false,dataset},root);

// ---- Pure pickers ----
test('itemChoices: A–Z, quantity, the type, "in <container>" and "with n inside" (any depth); the value is the uuid',()=>{
 const items=mkItems(mkActor('tmp','tmp','alice'));
 const bag=items.add({name:'Bag',type:'container',system:{quantity:1}}),pouch=items.add({name:'Pouch',type:'container',system:{container:bag.id}});
 items.add({name:'Gem',type:'loot',system:{quantity:2,container:pouch.id}});items.add({name:'Axe',type:'weapon',system:{}});
 assert.deepEqual(itemChoices(items).map(o=>o.label),['Axe · Weapon','Bag · Container · with 2 inside','Gem ×2 · Loot · in Pouch','Pouch · Container · in Bag · with 1 inside']);
 assert.equal(itemChoices(items)[0].value,[...items].find(i=>i.name==='Axe').uuid);
 assert.deepEqual(folderChoices(folders),[{value:'Folder.f1',label:'[TEST] Stock'},{value:'Folder.f2',label:'[TEST] Stock / [TEST] Tools'}],'Item folders only, with their path');
});
test('sources: a player gets only the characters passed in (never a level backup); the GM also gets the Items sidebar',()=>{
 assert.deepEqual(stashSources({characters:[pcA,backup]}),[{value:'pcA',label:'[TEST] Wren'}]);
 assert.deepEqual(stashSources({characters:[pcB,pcA],gm:true}).map(o=>o.value),['pcB','pcA','world']);
 worldItems.add({name:'[TEST] Lantern',type:'loot',system:{quantity:1}});
 assert.deepEqual(shopSources({actors,folders,worldItems}).map(o=>o.value),['world','folder','actor:pcB','actor:brin','actor:pcA','actor:stash'].filter(v=>v==='world'||v==='folder'||actors.find(a=>`actor:${a.id}`===v)?.items.size),'actors with items only');
});
test('pickOne: kit form dialog with Cancel left and the labelled action right; a value that was not offered is refused',async()=>{
 reset();answers=['b'];
 assert.equal(await pickOne('Pick','Thing',[{value:'a',label:'A'},{value:'b',label:'B'}],{ok:'Use thing'}),'b');
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Cancel','Use thing']);assert.deepEqual(dialogs[0].classes,['ag-app','ag-dialog']);
 answers=[null];assert.equal(await pickOne('Pick','Thing',[{value:'a',label:'A'}]),null,'Cancel');
 answers=['forged'];await assert.rejects(()=>pickOne('Pick','Thing',[{value:'a',label:'A'}]),/Choose one of the listed options/);
 assert.equal(await pickOne('Pick','Thing',[]),null,'nothing to pick: no dialog');
});

// ---- Party stash: Add to stash… ----
test('Add to stash… is in the stash toolbar (window and embed) for the GM and for a player with a character; Take stays',async()=>{
 pcA.items.add({name:'[TEST] Torch',type:'loot',system:{quantity:1}});stash.items.add({name:'[TEST] Shield',type:'loot',system:{quantity:1}});
 const app=await windowApp();const html=await app._renderHTML();
 assert.match(html,/<span class="ag-toolbar__count">[^<]*<\/span><div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--sm" data-action="stash-add" ><i class="fa-solid fa-plus" aria-hidden="true"><\/i> Add to stash…<\/button><\/div><\/div>/);
 assert.match(html,/data-action="stash-take"[^>]*aria-label="Take \[TEST\] Shield"/);
 const player=await as(alice,async()=>(await windowApp())._renderHTML());
 assert.match(player,/data-action="stash-add"/);assert.match(player,/Use Add to stash…, or drag an item from your character sheet/);
 const carol={id:'carol',name:'Carol',isGM:false,active:true};users.push(carol);
 try{assert.doesNotMatch(await as(carol,async()=>(await windowApp())._renderHTML()),/data-action="stash-add"/,'no character to add from: no button');}finally{users.pop();}
 const el={innerHTML:'',classList:{add(){},remove(){}},addEventListener(){},querySelector:()=>null,contains:()=>true,isConnected:true};
 const m=api.embed.mount(el,{});await tick();assert.match(el.innerHTML,/data-action="stash-add"/,'the embed has it too');m.unmount();
});
test('GM: Add to stash… moves the item (and a container\'s contents) exactly as a drop on the stash does',async()=>{
 const app=await windowApp();
 // The drop path, for comparison.
 reset();const dropped=bagFor(pcB);
 await handlers.on.get('dropActorSheetData')(stash,null,{type:'Item',uuid:dropped.uuid});await tick();
 const dropNote=notes.find(n=>n[0]==='info')?.[1],dropLog=api.stash.history().at(-1);
 // The button path.
 reset();const bag=bagFor(pcA);answers=['pcA',bag.uuid];
 await click(app,'stash-add');
 assert.deepEqual(dialogs.map(d=>d.window.title),['Add to stash','Add to stash from [TEST] Wren']);
 assert.deepEqual(dialogs.map(d=>d.buttons.map(b=>b.label)),[['Cancel','Choose item…'],['Cancel','Add to stash']]);
 assert.ok(optionsOf(dialogs[0]).includes('world'),'the GM may copy from the Items sidebar');
 assert.equal(byName(pcA,'[TEST] Bag'),undefined);assert.equal(byName(pcA,'[TEST] Rope'),undefined,'contents left with the container');
 const inStash=[...stash.items].find(i=>i.name==='[TEST] Bag'&&i.system.container===null&&[...stash.items].some(r=>r.name==='[TEST] Rope'&&r.system.container===i.id));
 assert.ok(inStash,'the container arrived with its contents');
 const log=api.stash.history().at(-1);
 assert.deepEqual([log.kind,log.approval,log.itemName],[dropLog.kind,dropLog.approval,'[TEST] Bag'],'logged like the drop');
 assert.equal(notes.find(n=>n[0]==='info')?.[1],dropNote.replace('[TEST] Ash','[TEST] Wren'),'the same result message');
 reset();const lantern=[...worldItems].find(i=>i.name==='[TEST] Lantern');answers=['world',lantern.uuid];
 await click(app,'stash-add');
 assert.ok(byName(stash,'[TEST] Lantern'));assert.ok(worldItems.get(lantern.id),'a world item is copied, not moved');
 reset();answers=[null];await click(app,'stash-add');assert.equal(dialogs.length,1,'Cancel stops there');
});
test('player: only their own characters are offered; the deposit goes to the GM client as the drop\'s request and is checked there',async()=>{
 const hat=pcA.items.add({name:'[TEST] Hat',type:'loot',system:{quantity:1}});
 // Alice owns one character: no From step, straight to the item.
 reset();answers=[hat.uuid];
 const pending=as(alice,async()=>{const app=await windowApp();return click(app,'stash-add');});
 await tick();
 assert.deepEqual(dialogs.map(d=>d.window.title),['Add to stash from [TEST] Wren']);
 assert.ok(optionsOf(dialogs[0]).every(u=>u.startsWith('Actor.pcA.')),'only Wren\'s items');
 const req=sent.find(m=>m.type==='stash-deposit');
 assert.deepEqual({type:req.type,itemUuid:req.itemUuid,userId:req.userId},{type:'stash-deposit',itemUuid:hat.uuid,userId:'alice'},'the same request a drop sends');
 await as(gm,()=>socketHandler(req,'alice'));await tick();
 const receipt=sent.find(m=>m.type==='receipt'&&m.requestId===req.requestId);assert.ok(receipt);
 await as(alice,async()=>{socketHandler(receipt,'gm');await pending;});
 assert.equal(pcA.items.get(hat.id),undefined);assert.ok(byName(stash,'[TEST] Hat'));
 // A forged pick (someone else's item) is refused by the same GM-side check a forged drop meets.
 const axe=pcB.items.add({name:'[TEST] Axe',type:'weapon',system:{quantity:1}});
 reset();await as(gm,()=>socketHandler({type:'stash-deposit',requestId:'x1',userId:'alice',itemUuid:axe.uuid},'alice'));await tick();
 assert.match(sent.find(m=>m.requestId==='x1')?.message??'',/only stash items from a character you own/);assert.ok(pcB.items.get(axe.id));
 // With two characters, a pick that wasn't offered is refused before anything is asked of the GM.
 reset();answers=['pcB'];const bobChar=mkActor('pcC','[TEST] Cass','alice');actors.push(bobChar);
 try{await as(alice,async()=>{const app=await windowApp();await assert.rejects(()=>click(app,'stash-add'),/Choose one of the listed options/);});}finally{actors.pop();}
 assert.deepEqual(optionsOf(dialogs[0]),['pcC','pcA'],'own characters only, no Items sidebar');assert.equal(sent.length,0);
 game.user=gm;// the overlapping as() calls above leave the player signed in
});
test('player: refused before any dialog while the stash is off for players',async()=>{
 reset();await game.settings.set(ID,'stashEnabled',false);
 try{await as(alice,async()=>{const app=new (Object.getPrototypeOf(await api.open()).constructor)();await assert.rejects(()=>click(app,'stash-add'),/turned the party stash off/);});}
 finally{await game.settings.set(ID,'stashEnabled',true);}
 assert.equal(dialogs.length,0);
});
test('Take is still the button for a stash item, through the same withdraw as a drag onto a sheet',async()=>{
 const app=await windowApp();const shield=byName(stash,'[TEST] Shield');
 const rootWith={querySelector:q=>q==='#agu-stash-target'?{value:'pcB'}:null,contains:()=>true};
 await app.handle('stash-take',{disabled:false,dataset:{item:shield.id}},rootWith);
 assert.ok(byName(pcB,'[TEST] Shield'));assert.equal(api.stash.history().at(-1).kind,'withdraw');
});

// ---- Shop editor: Add item… and Choose Actor… ----
const shopApp=()=>({tab:'shops',shopDraft:shopsMod.draftFrom(null),shopDirty:false});
const go=(app,action)=>shopsMod.handleShops(app,action,{dataset:{}},{render:async()=>{},root});
test('shop editor: Add item… sits in the items drop zone and Choose Actor… in the merchant drop zone',async()=>{
 const app=await api.open();app.tab='shops';app.shopDraft=shopsMod.draftFrom(null);
 app.shopEdTab='items';let html=await app._renderHTML();
 assert.match(html,/<div class="agu-dropzone agu-shop-drop" data-shop-drop><button type="button" class="ag-btn ag-btn--sm" data-action="shop-add-item" ><i class="fa-solid fa-plus" aria-hidden="true"><\/i> Add item…<\/button><span>or drop items here/);
 assert.match(html,/Use Add item… below, or drop items/);
 app.shopEdTab='details';html=await app._renderHTML();
 assert.match(html,/<div class="agu-dropzone agu-merchant__drop"><button type="button" class="ag-btn ag-btn--sm" data-action="shop-merchant-pick" ><i class="fa-solid fa-user-plus" aria-hidden="true"><\/i> Choose Actor…<\/button><span>or drop an Actor/);
 app.shopDraft=null;
});
test('Add item… adds the same lines as the drop: an item, a container with its contents, a whole folder; nothing changes at the source',async()=>{
 const viaDrop=shopApp(),viaButton=shopApp();
 const sword=pcA.items.add({name:'[TEST] Sword',type:'weapon',system:{quantity:1,price:{value:15,denomination:'gp'}}});
 await shopsMod.dropIntoDraft(viaDrop,{type:'Item',uuid:sword.uuid});
 reset();answers=['actor:pcA',sword.uuid];await go(viaButton,'shop-add-item');
 assert.deepEqual(dialogs.map(d=>d.window.title),['Add items to this shop','Add an item from [TEST] Wren\'s inventory']);
 assert.deepEqual(dialogs.map(d=>d.buttons.at(-1).label),['Choose item…','Add item']);
 const strip=d=>d.lines.map(({lineId,...l})=>l);
 assert.deepEqual(strip(viaButton.shopDraft),strip(viaDrop.shopDraft),'the same line as the drop');
 assert.equal(viaButton.shopDirty,true);assert.ok(pcA.items.get(sword.id),'the source keeps its item');
 assert.match(notes.find(n=>n[0]==='info')[1],/^Added 1 item: \[TEST\] Sword\.$/);
 const bag=bagFor(pcB);reset();answers=['actor:pcB',bag.uuid];await go(viaButton,'shop-add-item');
 assert.equal(viaButton.shopDraft.lines.at(-1).contents.length,1,'a container brings what is inside it');
 const a=worldItems.add({name:'[TEST] Nails',type:'loot',folder:'f1',system:{quantity:1}}),b=worldItems.add({name:'[TEST] Saw',type:'loot',folder:'f2',system:{quantity:1}});
 docs.get('Folder.f1').getSubfolders=()=>[folders[1]];
 reset();answers=['folder','Folder.f1'];const before=viaButton.shopDraft.lines.length;await go(viaButton,'shop-add-item');
 assert.deepEqual(viaButton.shopDraft.lines.slice(before).map(l=>l.item.name).sort(),[a.name,b.name].sort(),'the folder and its subfolder');
 reset();answers=[null];await go(viaButton,'shop-add-item');assert.equal(dialogs.length,1);
});
test('Choose Actor… sets the merchant exactly as an Actor drop does; level backups are not offered',async()=>{
 const viaDrop=shopApp(),viaButton=shopApp();
 await shopsMod.dropMerchant(viaDrop,{type:'Actor',uuid:brin.uuid});
 reset();answers=[brin.uuid];await go(viaButton,'shop-merchant-pick');
 assert.deepEqual(viaButton.shopDraft.merchant,viaDrop.shopDraft.merchant);
 assert.deepEqual(viaButton.shopDraft.merchant.actor,{uuid:'Actor.brin',id:'brin',name:'[TEST] Brin Tallow'});
 assert.ok(!optionsOf(dialogs[0]).includes(backup.uuid));assert.match(dialogs[0].content,/\[TEST\] Brin Tallow \(NPC\)/);
 assert.deepEqual(dialogs[0].buttons.map(b=>b.label),['Cancel','Use this Actor']);
});
test('shop editor buttons are GM only, enforced in the code (players get "GM only." and no dialog opens)',async()=>{
 reset();
 for(const action of ['shop-add-item','shop-merchant-pick'])await as(alice,()=>assert.rejects(()=>go(shopApp(),action),/^Error: GM only\.$/));
 await as(alice,()=>assert.rejects(()=>shopsMod.dropIntoDraft(shopApp(),{type:'Item',uuid:'Item.x'}),/GM only/));
 assert.equal(dialogs.length,0);
});
test('pickers alone: nothing to pick from tells you so; no dialog',async()=>{
 reset();
 assert.equal(await pickStashDeposit({characters:[],notify:ui.notifications}),null);
 assert.equal(await pickShopItems({actors:[],folders:[],worldItems:[],notify:ui.notifications}),null);
 assert.equal(await pickMerchantActor({actors:[],notify:ui.notifications}),null);
 assert.equal(dialogs.length,0);assert.equal(notes.length,3);
});
test('refocus: back to the first control still there; leaves focus alone when the user is elsewhere',()=>{
 const focused=[];const el=name=>({focus:()=>focused.push(name)});
 const r={querySelector:k=>k==='#b'?el('b'):null,contains:x=>x==='inside'};
 const was=globalThis.document;
 try{
  globalThis.document={body:'body',activeElement:'body'};assert.equal(refocus(r,['#a','#b']),true);assert.deepEqual(focused,['b']);
  globalThis.document.activeElement='elsewhere';assert.equal(refocus(r,['#b']),false);assert.deepEqual(focused,['b']);
  globalThis.document.activeElement='inside';assert.equal(refocus(r,['#b']),true);
 }finally{globalThis.document=was;}
});
