// 0.11.0 Item rewards (rewards brief Q1). Mocked Foundry: proves data, permissions and markup, not the live look.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,validState,rewardRows,publicView,emptyRewards} from '../scripts/core.mjs';
import {saveRecord,getPrivate} from '../scripts/store.mjs';
import {listRewards,addFromDrop,updateReward,removeReward,HOLDING_FOLDER} from '../scripts/rewards.mjs';
import {rewardsSection,playerRewardsSection} from '../scripts/rewards-ui.mjs';

const source=(extra={})=>({id:'QUEST-TEST-REWARDS',entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},
 visibility:'player',refs:[],name:'[TEST] Rewards',source:{},public_summary:'[TEST]',objectives:[{key:'one',goal:'One'}],locations:[],parameters:{},outcomes:{},...extra});
const state=(extra={})=>({status:'Active',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false,...extra});
const ref=(extra={})=>({schema:'ag-item-ref/1',uuid:'Item.w1',itemId:'ITEM-TEST-BLADE',name:'[TEST] Blade',img:'icons/blade.webp',type:'weapon',quantity:1,sourceKind:'world',packId:null,parentUuid:null,contents:0,...extra});
const added=(key,extra={})=>({key,ref:ref(),visibility:'on_complete',recipient:'chosen',...extra});

test('validState: a missing rewards block is valid; a good block passes; bad blocks are refused',()=>{
 const s=source();
 assert.equal(validState(s,state()),true);
 assert.equal(validState(s,state({rewards:emptyRewards()})),true);
 assert.equal(validState(s,state({rewards:{v:1,added:[added('rw-a1')],overrides:{'def:ITEM-TEST-DRAUGHT':{quantity:2,visibility:'shown',recipient:'each',removed:false,round:1},'rw-a1':{quantity:3}},grants:[]}})),true);
 const bad=[
  {v:2,added:[]},
  {v:1,added:'x'},
  {v:1,added:[added('rw-a1',{visibility:'later'})]},
  {v:1,added:[added('rw-a1',{recipient:'party'})]},
  {v:1,added:[added('rw-a1',{ref:ref({quantity:0})})]},
  {v:1,added:[added('rw-a1',{ref:ref({quantity:1.5})})]},
  {v:1,added:[added('rw-a1'),added('rw-a1')]},
  {v:1,added:[added('bad key')]},
  {v:1,added:Array.from({length:101},(_,i)=>added(`rw-k${i}`))},
  {v:1,added:[],overrides:{'def:not-an-id':{}}},
  {v:1,added:[],overrides:{'def:ITEM-TEST-X':{quantity:0}}},
  {v:1,added:[],overrides:{'def:ITEM-TEST-X':{removed:'yes'}}},
  {v:1,added:[],grants:{}},
 ];
 for(const rewards of bad)assert.throws(()=>validState(s,state({rewards})),/Invalid item rewards/,JSON.stringify(rewards).slice(0,80));
 assert.equal(validState(s,state({rewards:{v:1,added:Array.from({length:100},(_,i)=>added(`rw-k${i}`))}})),true);
});

test('rewardRows merges imported and GM rows; overrides and removed are applied; malformed imports skipped',()=>{
 const s=source({outcomes:{item_rewards:[{item_id:'ITEM-TEST-DRAUGHT',quantity:2,recipient:'each'},{item_id:'ITEM-TEST-DRAUGHT'},{item_id:'uuid-like'},null,{item_id:'ITEM-TEST-CLOAK',visibility:'gm',quantity:-1}]}});
 const rows=rewardRows(s,state({rewards:{v:1,added:[added('rw-a1',{visibility:'shown'})],overrides:{'def:ITEM-TEST-CLOAK':{removed:true},'def:ITEM-TEST-DRAUGHT':{quantity:5,visibility:'shown'},'rw-a1':{round:2}}}}));
 assert.deepEqual(rows.map(r=>[r.key,r.origin,r.quantity,r.visibility,r.recipient,r.removed,r.round]),[
  ['def:ITEM-TEST-DRAUGHT','import',5,'shown','each',false,1],
  ['def:ITEM-TEST-CLOAK','import',1,'gm','chosen',true,1],
  ['rw-a1','gm',1,'shown','chosen',false,2]]);
 assert.equal(rows[0].itemId,'ITEM-TEST-DRAUGHT');assert.equal(rows[2].ref.uuid,'Item.w1');
 assert.deepEqual(rewardRows(source(),state()),[]);
});

test('publicView rewards: gm never, shown while visible, on_complete only when Completed; no uuid, id, key or recipient',()=>{
 const s=source({outcomes:{item_rewards:[{item_id:'ITEM-TEST-DRAUGHT',visibility:'shown'},{item_id:'ITEM-TEST-UNBOUND',visibility:'shown'}]}});
 const rewards={v:1,added:[added('rw-gm',{visibility:'gm',ref:ref({name:'[TEST] Secret'})}),added('rw-show',{visibility:'shown',ref:ref({name:'[TEST] Teaser',quantity:2})}),
  added('rw-done',{ref:ref({name:'[TEST] Prize'})}),added('rw-gone',{visibility:'shown',ref:ref({name:'[TEST] Gone'})})],overrides:{'rw-gone':{removed:true}}};
 const itemById=id=>id==='ITEM-TEST-DRAUGHT'?{name:'[TEST] Draught',img:'icons/d.webp',uuid:'Item.d'}:null;
 const active=publicView(s,state({rewards}),{itemById});
 assert.deepEqual(active.rewards,[{name:'[TEST] Draught',img:'icons/d.webp',quantity:1},{name:'[TEST] Teaser',img:'icons/blade.webp',quantity:2}]);
 const done=publicView(s,state({status:'Completed',rewards}),{itemById});
 assert.deepEqual(done.rewards.map(r=>r.name),['[TEST] Draught','[TEST] Teaser','[TEST] Prize']);
 for(const v of [active,done]){
  const json=JSON.stringify(v.rewards);
  for(const leak of ['uuid','Item.','ITEM-TEST','rw-','def:','recipient','chosen','Secret','Gone','itemId','key'])assert.ok(!json.includes(leak),`player view leaks ${leak}`);
 }
 assert.deepEqual(publicView(s,state()).rewards,[],'imported rows without a bound world Item are left out');
 assert.equal(publicView(s,state({status:'Hidden',rewards})),null);
});

function setup(){
 const docs=[],calls=[];let id=0,seq=0;
 const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async f=>{for(const [k,v] of Object.entries(f))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v] of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.default>=2;}}
 globalThis.JournalEntry={create:async data=>{const j=new Doc(data);docs.push(j);return j;}};
 const worldItems=[],folders=[],uuids={};
 const mkItem=(iid,{parent=null,pack=null,container=null,quantity=1,flags={},type='loot',name}={})=>{
  const data={_id:iid,name:name??`[TEST] ${iid}`,img:`icons/${iid}.webp`,type,flags,folder:null,ownership:{default:0},system:{container,quantity}};
  const it={documentName:'Item',id:iid,name:data.name,img:data.img,type,flags,parent,pack,system:data.system,
   uuid:pack?`Compendium.${pack}.Item.${iid}`:parent?`${parent.uuid}.Item.${iid}`:`Item.${iid}`,toObject:()=>structuredClone(data),
   update:async()=>calls.push(['item.update',iid]),delete:async()=>calls.push(['item.delete',iid])};
  uuids[it.uuid]=it;return it;};
 const npc={documentName:'Actor',uuid:'Actor.npc',items:[],update:async()=>calls.push(['actor.update']),
  updateEmbeddedDocuments:async()=>calls.push(['actor.updateEmbedded']),deleteEmbeddedDocuments:async()=>calls.push(['actor.deleteEmbedded'])};
 const sword=mkItem('sword',{parent:npc,type:'weapon',flags:{'ashen-gate-manager':{source:{sourceId:'ITEM-TEST-SWORD'}}}});npc.items.push(sword);
 const world=mkItem('w1'),comp=mkItem('c1',{pack:'world.gear',type:'consumable'});
 const pack=mkItem('bag',{type:'container'}),inner=mkItem('rope',{container:'bag'});worldItems.push(world,pack,inner);
 const actor={documentName:'Actor',uuid:'Actor.pc',id:'pc'};uuids['Actor.pc']=actor;
 const folder={documentName:'Folder',type:'Item',uuid:'Folder.f1',id:'f1'};uuids['Folder.f1']=folder;
 const actors=[];actors.get=()=>null;
 globalThis.game={user:gm,users:[gm,alice],journal:docs,actors,items:{contents:worldItems},folders,packs:{get:()=>null}};
 globalThis.foundry={utils:{randomID:(n=16)=>`R${String(++seq).padStart(n-1,'0')}`.slice(0,n)}};
 globalThis.fromUuid=async u=>uuids[u]??null;
 globalThis.Folder={create:async data=>{const f={...data,id:`fold${folders.length+1}`};folders.push(f);calls.push(['folder.create',data.name]);return f;}};
 globalThis.Item={implementation:{fromDropData:async raw=>uuids[raw.uuid]??null},
  createDocuments:async(data,opts)=>{calls.push(['item.create',data.length,opts]);return data.map(d=>{const it=mkItem(d._id,{type:d.type,flags:d.flags,container:d.system.container,quantity:d.system.quantity,name:d.name});it.folder=d.folder;it.ownership=d.ownership;worldItems.push(it);return it;});},
  deleteDocuments:async ids=>{calls.push(['item.deleteDocuments',ids]);for(const i of ids){const at=worldItems.findIndex(x=>x.id===i);if(at>=0)worldItems.splice(at,1);}}};
 return {docs,calls,gm,alice,worldItems,folders,uuids,npc,sword,world,comp,pack,inner};
}
const drop=uuid=>({type:'Item',uuid});
const stateOf=id=>getPrivate(id).getFlag(MOD,'state');

test('addFromDrop: world and compendium items need no holding copy',async()=>{
 const t=setup();const s=source();await saveRecord(s,{state:state()});
 const a=await addFromDrop(s.id,drop('Item.w1'));assert.equal(a.ok,true);assert.equal(a.row.ref.sourceKind,'world');assert.match(a.row.key,/^rw-[A-Za-z0-9]{8}$/);
 const b=await addFromDrop(s.id,drop('Compendium.world.gear.Item.c1'));assert.equal(b.ok,true);assert.equal(b.row.ref.sourceKind,'compendium');
 assert.equal(t.calls.filter(c=>c[0]==='item.create'||c[0]==='folder.create'&&c[1]===HOLDING_FOLDER).length,0);
 assert.deepEqual(stateOf(s.id).rewards.added.map(x=>[x.visibility,x.recipient]),[['on_complete','chosen'],['on_complete','chosen']]);
 const b2=await addFromDrop(s.id,drop('Item.bag'));assert.equal(b2.ok,true);assert.equal(b2.row.ref.contents,1);
});

test('addFromDrop: an embedded item gets a GM-only holding copy in the flagged folder; the NPC is untouched',async()=>{
 const t=setup();const s=source();await saveRecord(s,{state:state()});
 const res=await addFromDrop(s.id,drop('Actor.npc.Item.sword'));
 assert.equal(res.ok,true);
 const itemFolders=()=>t.folders.filter(f=>f.type==='Item');
 assert.deepEqual(itemFolders().map(f=>[f.name,f.flags[MOD].store]),[[HOLDING_FOLDER,'reward-holding']]);
 const copy=t.worldItems.find(x=>x.flags?.[MOD]?.holding);
 assert.ok(copy);assert.equal(copy.folder,itemFolders()[0].id);assert.deepEqual(copy.ownership,{default:0});
 assert.equal(copy.flags[MOD].holding.from,'Actor.npc');assert.equal(typeof copy.flags[MOD].holding.at,'number');
 assert.equal(res.row.ref.sourceKind,'holding');assert.equal(res.row.ref.uuid,copy.uuid);assert.equal(res.row.ref.itemId,'ITEM-TEST-SWORD');
 assert.deepEqual(t.calls.filter(c=>/^actor\.|^item\.(update|delete)$/.test(c[0])),[],'source NPC and its item never changed');
 assert.equal(t.npc.items.length,1);
 // Second embedded drop reuses the folder.
 await addFromDrop(s.id,drop('Actor.npc.Item.sword'));assert.equal(itemFolders().length,1);
});

test('addFromDrop refuses folders and Actors with plain text, storing nothing',async()=>{
 setup();const s=source();await saveRecord(s,{state:state()});
 assert.deepEqual(await addFromDrop(s.id,{type:'Folder',uuid:'Folder.f1'}),{ok:false,reason:'Drop items one at a time.'});
 assert.deepEqual(await addFromDrop(s.id,{type:'Actor',uuid:'Actor.pc'}),{ok:false,reason:'Drop an item.'});
 assert.deepEqual(await addFromDrop(s.id,drop('Item.nope')),{ok:false,reason:"That item no longer exists or you can't see it."});
 assert.equal(stateOf(s.id).rewards,undefined);
});

test('update: GM rows change in place, imported rows through overrides; bad values refused',async()=>{
 setup();const s=source({outcomes:{item_rewards:[{item_id:'ITEM-TEST-DRAUGHT'}]}});await saveRecord(s,{state:state()});
 const {row}=await addFromDrop(s.id,drop('Item.w1'));
 await updateReward(s.id,row.key,{quantity:3,visibility:'gm',recipient:'split'});
 const a=stateOf(s.id).rewards.added[0];assert.deepEqual([a.ref.quantity,a.visibility,a.recipient],[3,'gm','split']);
 await updateReward(s.id,'def:ITEM-TEST-DRAUGHT',{quantity:2,visibility:'shown'});
 assert.deepEqual(stateOf(s.id).rewards.overrides['def:ITEM-TEST-DRAUGHT'],{quantity:2,visibility:'shown'});
 await assert.rejects(()=>updateReward(s.id,row.key,{quantity:0}),/whole number/);
 await assert.rejects(()=>updateReward(s.id,row.key,{visibility:'later'}),/Unknown visibility/);
 await assert.rejects(()=>updateReward(s.id,'rw-missing',{quantity:1}),/Reward not found/);
});

test('remove: def: rows are marked removed; rw- rows are deleted with their holding copy',async()=>{
 const t=setup();const s=source({outcomes:{item_rewards:[{item_id:'ITEM-TEST-DRAUGHT'}]}});await saveRecord(s,{state:state()});
 await removeReward(s.id,'def:ITEM-TEST-DRAUGHT');
 assert.equal(stateOf(s.id).rewards.overrides['def:ITEM-TEST-DRAUGHT'].removed,true);
 assert.equal(rewardRows(s,stateOf(s.id))[0].removed,true);
 const {row}=await addFromDrop(s.id,drop('Actor.npc.Item.sword'));
 const copy=t.worldItems.find(x=>x.uuid===row.ref.uuid);assert.ok(copy);
 await removeReward(s.id,row.key);
 assert.equal(stateOf(s.id).rewards.added.length,0);
 assert.equal(t.worldItems.some(x=>x.uuid===row.ref.uuid),false,'holding copy deleted');
 assert.equal(t.npc.items.length,1);
 // A world item that is not a holding copy is never deleted.
 const w=await addFromDrop(s.id,drop('Item.w1'));await removeReward(s.id,w.row.key);assert.ok(t.worldItems.some(x=>x.id==='w1'));
});

test('list reports resolve status; every rewards call refuses non-GMs',async()=>{
 const t=setup();const s=source({outcomes:{item_rewards:[{item_id:'ITEM-TEST-NOWHERE'}]}});await saveRecord(s,{state:state()});
 await addFromDrop(s.id,drop('Item.w1'));
 const rows=await listRewards(s.id);
 assert.deepEqual(rows.map(r=>[r.key.slice(0,3),r.status]),[['def','missing'],['rw-','ok']]);
 game.user=t.alice;
 for(const call of [()=>listRewards(s.id),()=>addFromDrop(s.id,drop('Item.w1')),()=>updateReward(s.id,'x',{}),()=>removeReward(s.id,'x')])
  await assert.rejects(call,/GM only\./);
});

test('editor markup: kit table, labelled icon Remove, tooltips not title, empty state and drop zone',()=>{
 const rows=[{key:'rw-a1',origin:'gm',name:'[TEST] <Blade>',img:'icons/b.webp',itemId:'ITEM-TEST-BLADE',quantity:2,visibility:'shown',recipient:'each',removed:false,status:'ok'},
  {key:'def:ITEM-TEST-X',origin:'import',name:'ITEM-TEST-X',img:null,itemId:'ITEM-TEST-X',quantity:1,visibility:'on_complete',recipient:'chosen',removed:false,status:'missing',reason:'Gone'},
  {key:'rw-b2',origin:'gm',name:'[TEST] Rope',img:null,itemId:null,quantity:1,visibility:'gm',recipient:'chosen',removed:false,status:'ok'},
  {key:'def:ITEM-TEST-Y',origin:'import',name:'Y',itemId:'ITEM-TEST-Y',quantity:1,visibility:'gm',recipient:'chosen',removed:true,status:'ok'}];
 const html=rewardsSection(rows,{status:'Saved'});
 assert.match(html,/<section class="agq-rewards ag-section" data-reward-zone>/);
 assert.match(html,/<h3 class="ag-section__title">Item rewards<\/h3>/);
 assert.match(html,/role="status" data-reward-status>Saved</);
 assert.match(html,/<div class="ag-table-wrap"><table class="ag-table/);
 assert.equal((html.match(/<th scope="col"/g)||[]).length,6);
 assert.equal((html.match(/data-reward-key=/g)||[]).length,3,'removed rows are hidden');
 assert.ok(html.includes('&lt;Blade&gt;')&&!html.includes('<Blade>'));
 assert.match(html,/class="agq-mono">ITEM-TEST-BLADE</);
 assert.match(html,/<span class="ag-badge" data-tooltip="No permanent id[^"]*" data-tooltip-class="ag-tooltip">No permanent id<\/span>/);
 assert.match(html,/<span class="ag-badge ag-badge--danger" data-tooltip="Gone"[^>]*>Missing<\/span>/);
 assert.match(html,/<input type="number" class="agq-reward__qty" data-reward-field="quantity" min="1" step="1" value="2"/);
 assert.match(html,/<option value="shown" selected>While the quest is visible<\/option>/);
 assert.match(html,/<option value="each" selected>Each character<\/option>/);
 const remove=html.match(/<button[^>]*data-action="remove-reward"[^>]*>/g);
 assert.equal(remove.length,3);for(const b of remove){assert.match(b,/ag-btn--icon/);assert.match(b,/aria-label="Remove /);assert.match(b,/data-tooltip=/);}
 assert.match(html,/class="agq-reward-drop"><i class="fa-solid fa-gift" aria-hidden="true"><\/i> <span>Drop items here: from a character or NPC sheet, a compendium or the Items sidebar\.<\/span>/);
 assert.doesNotMatch(html,/\stitle=/);
 const individual=rewardsSection(rows,{individual:true});
 assert.equal((individual.match(/data-reward-field="recipient"[^>]*disabled/g)||[]).length,3);
 assert.match(individual,/Individual quest: goes to its character\./);
 const empty=rewardsSection([]);
 assert.match(empty,/<div class="ag-empty"><i class="fa-solid fa-gift" aria-hidden="true"><\/i><p class="ag-empty__title">No item rewards yet<\/p><p class="ag-empty__text">Drop an item here to add it\.<\/p>/);
 assert.match(empty,/agq-reward-drop/);assert.doesNotMatch(empty,/ag-table/);
});

test('player Rewards section: names and quantities only, nothing when empty',()=>{
 assert.equal(playerRewardsSection([]),'');assert.equal(playerRewardsSection(undefined),'');
 const html=playerRewardsSection([{name:'[TEST] Draught',img:'icons/d.webp',quantity:2}]);
 assert.match(html,/<section class="ag-section agq-rewards-view"><div class="ag-section__head"><h3 class="ag-section__title">Rewards<\/h3><\/div><ul class="ag-rows">/);
 assert.match(html,/<span class="ag-row__title">\[TEST\] Draught<\/span><\/span><span class="ag-row__end">× 2<\/span>/);
 assert.doesNotMatch(html,/\stitle=/);
});
