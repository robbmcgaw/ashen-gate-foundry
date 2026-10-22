// 0.12.0 Giving rewards (rewards brief Q2). Mocked Foundry: proves the grant logic, records and markup, not the live UI.
import test from 'node:test';import assert from 'node:assert/strict';
import {MOD,publicView,rewardRows} from '../scripts/core.mjs';
import {saveRecord,getPrivate} from '../scripts/store.mjs';
import {addFromDrop,updateReward,grantPlan,executeGrant,grantableRewards,grantRewards,grantAgain,isGranted,onActorSheetDrop,cardWhisper,rewardDragData} from '../scripts/rewards.mjs';
import {rewardsSection,grantPanel,defaultChoices,grantSummary} from '../scripts/rewards-ui.mjs';

const QID='QUEST-TEST-GRANT';
const source=()=>({id:QID,entity_type:'Objective',objective_kind:'quest',status:'draft',version:'0.1.0',provenance:{sources:['synthetic']},
 visibility:'player',refs:[],name:'[TEST] Grant',source:{},public_summary:'[TEST]',objectives:[{key:'one',goal:'One'}],locations:[],parameters:{},outcomes:{}});
const state=(extra={})=>({status:'Completed',scope:'party',actorId:null,revealed:true,objectiveReveal:[],progress:{},partyNotes:'',gmNotes:'',rewardRecorded:false,...extra});
const tick=()=>new Promise(r=>setImmediate(r));

function setup({hub}={}){
 const docs=[],calls=[],chat=[],journey=[];let id=0,seq=0;
 const gm={id:'gm',isGM:true},alice={id:'alice',isGM:false},bob={id:'bob',isGM:false},carl={id:'carl',isGM:false};
 function pathSet(obj,path,value){const x=path.split('.');for(let i=0;i<x.length-1;i++)obj=obj[x[i]]??={};obj[x.at(-1)]=value;}
 class Doc{constructor(data){this._id=String(++id);this.name=data.name;this.flags=data.flags??{};this.ownership=data.ownership??{default:0};this.pages=(data.pages||[]).map(p=>{const page={text:p.text,update:async f=>{for(const [k,v] of Object.entries(f))pathSet(page,k,v);}};return page;});}
  getFlag(mod,key){return this.flags?.[mod]?.[key];}
  async update(fields){for(const [k,v] of Object.entries(fields))pathSet(this,k,v);return this;}
  async delete(){docs.splice(docs.indexOf(this),1);}
  testUserPermission(user){return user.isGM||this.ownership?.default>=2||this.ownership?.[user.id]>=2;}}
 globalThis.JournalEntry={create:async data=>{const j=new Doc(data);docs.push(j);return j;}};
 const uuids={},worldItems=[];
 const mkItem=(iid,{type='loot',container=null,quantity=1,name,parent=null,flags={}}={})=>{
  const data={_id:iid,name:name??`[TEST] ${iid}`,img:`icons/${iid}.webp`,type,flags,folder:null,ownership:{default:0},system:{container,quantity}};
  const it={documentName:'Item',id:iid,name:data.name,img:data.img,type,flags,parent,pack:null,system:data.system,
   uuid:parent?`${parent.uuid}.Item.${iid}`:`Item.${iid}`,toObject:()=>structuredClone(data),
   update:async()=>calls.push(['source.update',iid]),delete:async()=>calls.push(['source.delete',iid])};
  if(!parent)uuids[it.uuid]=it;return it;};
 const potion=mkItem('potion',{type:'consumable',quantity:1}),sword=mkItem('sword',{type:'weapon'}),bag=mkItem('bag',{type:'container'}),rope=mkItem('rope',{container:'bag'});
 worldItems.push(potion,sword,bag,rope);
 const mkActor=(aid,name,owner)=>{
  const items=[];items.get=i=>items.find(x=>x.id===i);
  const a={documentName:'Actor',id:aid,name,uuid:`Actor.${aid}`,items,mode:'ok',
   testUserPermission:(u,lvl)=>u.isGM||u.id===owner,
   createEmbeddedDocuments:async(type,data,opts)=>{calls.push(['create',aid,data.length,opts]);
    if(a.mode==='throw-after-one'){items.push(mkItem(data[0]._id,{parent:a,flags:data[0].flags}));throw new Error('disk full');}
    const made=(a.mode==='partial'?data.slice(0,1):data).map(d=>{const it=mkItem(d._id,{parent:a,type:d.type,container:d.system.container,quantity:d.system.quantity,name:d.name,flags:d.flags});items.push(it);return it;});
    return made;},
   deleteEmbeddedDocuments:async(type,ids)=>{calls.push(['delete',aid,ids]);for(const i of ids){const at=items.findIndex(x=>x.id===i);if(at>=0)items.splice(at,1);}}};
  return a;};
 const aria=mkActor('aria','Aria','alice'),bram=mkActor('bram','Bram','bob'),npc=mkActor('npc','[TEST] Beast',null);
 const actors=[aria,bram,npc];actors.get=i=>actors.find(a=>a.id===i)??null;
 const hubApi=hub==='throw'?{recordReward:async()=>{throw new Error('hub broke');}}:{recordReward:async(actor,r)=>{journey.push([actor.id,r]);return {ok:true};}};
 globalThis.game={user:gm,users:[gm,alice,bob,carl],journal:docs,actors,items:{contents:worldItems},folders:[],packs:{get:()=>null},
  modules:{get:mid=>mid==='ashen-gate-character-hub'&&hub?{active:true,api:{journey:hubApi}}:null}};
 globalThis.foundry={utils:{randomID:(n=16)=>`R${String(++seq).padStart(n-1,'0')}`.slice(0,n)}};
 globalThis.fromUuid=async u=>uuids[u]??null;
 globalThis.Folder={create:async d=>({...d,id:'f'})};
 globalThis.Item={implementation:{fromDropData:async raw=>uuids[raw.uuid]??null}};
 globalThis.ChatMessage={create:async m=>{chat.push(m);return m;}};
 return {docs,calls,chat,journey,gm,alice,bob,carl,aria,bram,npc,potion,sword,bag,uuids};
}
const stateOf=()=>getPrivate(QID).getFlag(MOD,'state');
async function questWith(t,extra={}){
 await saveRecord(source(),{state:state(extra)});
 const p=(await addFromDrop(QID,{type:'Item',uuid:'Item.potion'})).row;
 await updateReward(QID,p.key,{quantity:2,recipient:'each',visibility:'shown'});
 const s=(await addFromDrop(QID,{type:'Item',uuid:'Item.sword'})).row;
 const b=(await addFromDrop(QID,{type:'Item',uuid:'Item.bag'})).row;
 return {potion:p.key,sword:s.key,bag:b.key};
}
const created=t=>t.calls.filter(c=>c[0]==='create');

test('grantPlan: chosen, each, split and individual; bad choices refused',()=>{
 const rows=[{key:'rw-c',name:'Sword',quantity:1,recipient:'chosen',round:1},{key:'rw-e',name:'Potion',quantity:2,recipient:'each',round:1},{key:'rw-s',name:'Arrows',quantity:5,recipient:'split',round:1}];
 const party=['aria','bram'],st=state();
 const plan=grantPlan(rows,st,{'rw-c':{give:true,actorId:'aria'},'rw-e':{give:true,actorIds:['aria','bram']},'rw-s':{give:true,split:{aria:3,bram:2}}},{party});
 assert.deepEqual(plan,[{actorId:'aria',lines:[{rewardKey:'rw-c',round:1,quantity:1},{rewardKey:'rw-e',round:1,quantity:2},{rewardKey:'rw-s',round:1,quantity:3}]},
  {actorId:'bram',lines:[{rewardKey:'rw-e',round:1,quantity:2},{rewardKey:'rw-s',round:1,quantity:2}]}]);
 assert.throws(()=>grantPlan(rows,st,{'rw-s':{give:true,split:{aria:3,bram:1}}},{party}),/must add up to 5 \(now 4\)/);
 assert.throws(()=>grantPlan(rows,st,{'rw-s':{give:true,split:{aria:2.5,bram:2.5}}},{party}),/whole numbers/);
 assert.throws(()=>grantPlan(rows,st,{'rw-c':{give:true,actorId:''}},{party}),/Choose a character for Sword/);
 assert.throws(()=>grantPlan(rows,st,{'rw-c':{give:true,actorId:'npc'}},{party}),/not in the party/);
 assert.throws(()=>grantPlan(rows,st,{'rw-e':{give:true,actorIds:[]}},{party}),/Tick at least one character/);
 assert.deepEqual(grantPlan(rows,st,{'rw-c':{give:false,actorId:'aria'}},{party}),[]);
 const ind=grantPlan(rows,state({scope:'individual',actorId:'bram'}),{'rw-s':{give:true,split:{aria:5}},'rw-c':{give:true,actorId:'aria'}},{party:['bram']});
 assert.deepEqual(ind,[{actorId:'bram',lines:[{rewardKey:'rw-c',round:1,quantity:1},{rewardKey:'rw-s',round:1,quantity:5}]}],'individual: full quantity to the quest character');
 const given=state({rewards:{v:1,added:[],grants:[{grantId:'g-1',lines:[{rewardKey:'rw-c',round:1,actorId:'aria',status:'granted'}]}]}});
 assert.throws(()=>grantPlan(rows,given,{'rw-c':{give:true,actorId:'aria'}},{party,nameOf:id=>id==='aria'?'Aria':id}),/already given to Aria/);
});

test('grant: one create per character, quantity on the root, contents arrive, sources untouched; Journey and whisper card',async()=>{
 const t=setup({hub:true});const k=await questWith(t);
 const res=await grantRewards(QID,{[k.potion]:{give:true,actorIds:['aria','bram']},[k.sword]:{give:true,actorId:'aria'},[k.bag]:{give:true,actorId:'bram'}});
 assert.deepEqual(res.results.map(r=>[r.actorId,r.ok,r.items.map(i=>`${i.quantity}×${i.name}`)]),[
  ['aria',true,['2×[TEST] potion','1×[TEST] sword']],['bram',true,['2×[TEST] potion','1×[TEST] bag']]]);
 assert.deepEqual(created(t).map(c=>[c[1],c[2],c[3]]),[['aria',2,{keepId:true,renderSheet:false}],['bram',3,{keepId:true,renderSheet:false}]]);
 const ariaPotion=t.aria.items.find(i=>i.name==='[TEST] potion');assert.equal(ariaPotion.system.quantity,2);
 assert.deepEqual(ariaPotion.flags[MOD].reward,{questId:QID,rewardKey:k.potion,round:1,grantId:res.grantId});
 const bramBag=t.bram.items.find(i=>i.name==='[TEST] bag'),bramRope=t.bram.items.find(i=>i.name==='[TEST] rope');
 assert.ok(bramRope);assert.equal(bramRope.system.container,bramBag.id);assert.equal(bramBag.system.container,null);
 assert.deepEqual(t.calls.filter(c=>c[0].startsWith('source.')),[],'sources never updated or deleted');
 const g=stateOf().rewards.grants;assert.equal(g.length,1);assert.equal(g[0].grantId,res.grantId);
 assert.ok(g[0].lines.every(l=>l.status==='granted'&&l.itemIds.length));
 assert.deepEqual(t.journey.map(([a,r])=>[a,r.questId,r.questName,r.grantId,r.items.map(i=>i.quantity)]),[['aria',QID,'[TEST] Grant',res.grantId,[2,1]],['bram',QID,'[TEST] Grant',res.grantId,[2,1]]]);
 assert.equal(t.chat.length,1,'one message per grant');
 assert.deepEqual(t.chat[0].whisper.sort(),['alice','bob','gm']);
 assert.match(t.chat[0].content,/Quest reward: \[TEST\] Grant/);assert.match(t.chat[0].content,/2 × \[TEST\] potion/);
 assert.doesNotMatch(t.chat[0].content,/Item\.|rw-|QUEST-/);
 // Completing twice gives nothing twice.
 assert.equal((await grantableRewards(QID)).some(r=>r.owed),false);
 await assert.rejects(()=>grantRewards(QID,{[k.potion]:{give:true,actorIds:['aria']}}),/Nothing to give/);
 const again=await executeGrant(QID,[{actorId:'aria',lines:[{rewardKey:k.sword,round:1,quantity:1}]}]);
 assert.equal(again.grantId,null);assert.equal(created(t).length,2,'no new create call');
 assert.equal(publicView(source(),stateOf()).rewardRecorded,true,'every visible row given');
});

test('a failure mid-way deletes what was made and records failed; a missing source fails only that character',async()=>{
 const t=setup();const k=await questWith(t);
 t.aria.mode='partial';
 const r1=await executeGrant(QID,[{actorId:'aria',lines:[{rewardKey:k.potion,round:1,quantity:2},{rewardKey:k.sword,round:1,quantity:1}]}]);
 assert.equal(r1.results[0].ok,false);assert.equal(t.aria.items.length,0,'partial create undone');
 assert.ok(stateOf().rewards.grants.at(-1).lines.every(l=>l.status==='failed'&&l.reason));
 t.aria.mode='throw-after-one';
 const r2=await executeGrant(QID,[{actorId:'aria',lines:[{rewardKey:k.sword,round:1,quantity:1}]}]);
 assert.equal(r2.results[0].ok,false);assert.match(r2.results[0].reason,/disk full/);assert.equal(t.aria.items.length,0);
 t.aria.mode='ok';
 delete t.uuids['Item.sword'];game.items.contents.splice(game.items.contents.indexOf(t.sword),1);
 const r3=await executeGrant(QID,[{actorId:'aria',lines:[{rewardKey:k.sword,round:1,quantity:1},{rewardKey:k.potion,round:1,quantity:2}]},{actorId:'bram',lines:[{rewardKey:k.potion,round:1,quantity:2}]}]);
 assert.deepEqual(r3.results.map(r=>[r.actorId,r.ok]),[['aria',false],['bram',true]]);
 assert.match(r3.results[0].reason,/no longer exists/);assert.equal(t.aria.items.length,0);assert.equal(t.bram.items.length,1);
});

test('crash recovery: a tagged item without a record repairs the record and creates nothing',async()=>{
 const t=setup();const k=await questWith(t);
 t.aria.items.push({id:'left',name:'[TEST] sword',flags:{[MOD]:{reward:{questId:QID,rewardKey:k.sword,round:1,grantId:'g-lost'}}},system:{}});
 assert.equal(isGranted(stateOf(),t.aria,k.sword,1,QID),true);
 const res=await executeGrant(QID,[{actorId:'aria',lines:[{rewardKey:k.sword,round:1,quantity:1}]}]);
 assert.equal(created(t).length,0);
 const line=stateOf().rewards.grants.at(-1).lines[0];
 assert.deepEqual([line.status,line.actorId,line.itemIds,line.repaired],['granted','aria',['left'],true]);
 assert.equal(res.results[0].ok,true);
});

test('Grant again raises the round, so the reward is given once more (and only once)',async()=>{
 const t=setup();const k=await questWith(t);
 await grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}});
 await assert.rejects(()=>grantAgain(QID,k.sword),/confirm: true/);
 await assert.rejects(()=>grantAgain(QID,k.bag,{confirm:true}),/not been given yet/);
 assert.deepEqual(await grantAgain(QID,k.sword,{confirm:true}),{ok:true,round:2});
 assert.equal(rewardRows(source(),stateOf()).find(r=>r.key===k.sword).round,2);
 await grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}});
 assert.equal(t.aria.items.filter(i=>i.name==='[TEST] sword').length,2);
 await assert.rejects(()=>grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}}),/Nothing to give/);
});

test('Journey: absent Hub is skipped; a throwing Hub never fails the grant',async()=>{
 let t=setup();let k=await questWith(t);
 assert.equal((await grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}})).results[0].ok,true);
 const warn=console.warn;const warned=[];console.warn=(...a)=>warned.push(a);
 t=setup({hub:'throw'});k=await questWith(t);
 assert.equal((await grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}})).results[0].ok,true);
 console.warn=warn;assert.ok(warned.length>=1);
});

test('chat whisper: every GM plus the owners of the recipients, nobody else',()=>{
 const t=setup();
 assert.deepEqual(cardWhisper([t.aria]).sort(),['alice','gm']);
 assert.deepEqual(cardWhisper([t.npc]),['gm']);
});

test('dropActorSheetData: GM drop grants and returns false; second drop warns; players refused; other drops ignored',async()=>{
 const t=setup();const k=await questWith(t);
 const rows=await grantableRewards(QID),sword=rows.find(r=>r.key===k.sword);
 const data=rewardDragData(QID,sword);
 assert.deepEqual([data.type,data.uuid,data.agQuestReward],['Item','Item.sword',{questId:QID,rewardKey:k.sword}]);
 const notes=[];const notify={info:m=>notes.push(['info',m]),warn:m=>notes.push(['warn',m]),error:m=>notes.push(['error',m])};
 assert.equal(onActorSheetDrop(t.aria,data,{notify}),false);
 for(let i=0;i<20&&!notes.length;i++)await tick();
 assert.deepEqual(notes,[['info','Given to Aria: 1 × [TEST] sword.']]);assert.equal(created(t).length,1);
 notes.length=0;
 assert.equal(onActorSheetDrop(t.aria,data,{notify}),false);
 assert.deepEqual(notes,[['warn','Already given to Aria.']]);await tick();assert.equal(created(t).length,1);
 notes.length=0;game.user=t.alice;
 assert.equal(onActorSheetDrop(t.bram,data,{notify}),false);
 assert.deepEqual(notes,[['warn','Only the GM can give quest rewards.']]);
 game.user=t.gm;
 assert.equal(onActorSheetDrop(t.aria,{type:'Item',uuid:'Item.sword'},{notify}),undefined);
 assert.equal(created(t).length,1);
});

test('every new rewards call refuses non-GMs',async()=>{
 const t=setup();await questWith(t);game.user=t.alice;
 for(const call of [()=>grantableRewards(QID),()=>grantRewards(QID,{}),()=>grantAgain(QID,'rw-x',{confirm:true})])await assert.rejects(call,/GM only\./);
 assert.throws(()=>executeGrant(QID,[]),/GM only\./);
});

test('markup: Given to badge, Grant again, draggable rows; Give rewards panel uses kit parts and a disabled Grant has visible hint text',async()=>{
 const t=setup();const k=await questWith(t);
 await grantRewards(QID,{[k.sword]:{give:true,actorId:'aria'}});
 const rows=await grantableRewards(QID);
 const html=rewardsSection(rows,{canGive:true});
 assert.match(html,/<span class="ag-badge ag-badge--ok agq-given">Given to Aria<\/span>/);
 assert.match(html,/<span class="ag-badge">Not yet<\/span>/);
 assert.equal((html.match(/data-action="grant-again"/g)||[]).length,1);
 assert.equal((html.match(/draggable="true" data-reward-drag/g)||[]).length,3);
 assert.match(html,/data-action="open-grant" class="ag-btn"[^>]*><i class="fa-solid fa-gift" aria-hidden="true"><\/i> Give rewards<\/button>/);
 const owed=rows.filter(r=>r.owed);
 const panel=grantPanel(owed,defaultChoices(owed));
 assert.match(panel,/<div class="agq-grant" data-grant-panel role="group" aria-labelledby="agq-grant-title">/);
 assert.match(panel,/<div class="ag-table-wrap"><table class="ag-table">/);
 assert.match(panel,/<ul class="ag-list" data-grant-summary>/);
 assert.match(panel,/<footer class="ag-footer agq-grant__footer"><button type="button" data-action="close-grant" class="ag-btn ag-btn--ghost">Not now<\/button><span class="ag-footer__status" role="status" data-grant-status>Choose a character for \[TEST\] bag\.<\/span><button type="button" data-action="grant-rewards" class="ag-btn ag-btn--primary" disabled>/);
 assert.match(panel,/<select data-grant-actor aria-label="Character for \[TEST\] bag"><option value="">Choose a character<\/option>/);
 assert.match(panel,/data-grant-each value="aria" checked/);
 assert.doesNotMatch(panel,/\stitle=/);assert.doesNotMatch(html,/\stitle=/);
 const ok=grantSummary(owed,{...defaultChoices(owed),[k.bag]:{give:true,actorId:'bram'}});
 assert.deepEqual(ok.problems,[]);
 assert.deepEqual(ok.receive.map(p=>[p.name,p.items.map(i=>i.quantity)]),[['Aria',[2]],['Bram',[2,1]]]);
 const split=grantSummary([{key:'rw-s',name:'Arrows',quantity:5,recipient:'split',grantable:true,party:[{id:'aria',name:'Aria',given:false},{id:'bram',name:'Bram',given:false}]}],{'rw-s':{give:true,split:{aria:3,bram:1}}});
 assert.deepEqual(split.problems,['Arrows: 4 of 5 shared.']);
});
