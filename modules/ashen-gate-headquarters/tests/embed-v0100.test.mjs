// 0.10.0: embed (embed.mjs) on synthetic state with injected checks and a fake element. Proves gates, data and routing; not the live Foundry UI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../js/logic.mjs';
import {buildPlayerView} from '../js/player-view.mjs';
import {createEmbed,embedHTML,EMBED_MODES} from '../js/embed.mjs';
const gm={id:'gm',isGM:true,name:'GM'},owner={id:'u1',isGM:false,name:'Owner'},other={id:'u2',isGM:false,name:'Other'};
const users=[gm,owner,other];
const step=(s,op,p={})=>applyOperation(s,gm,op,p,1711000000000);
const actor={id:'hero',name:'[TEST] Hero',testUserPermission:(u,level)=>u.isGM||(u.id==='u1'&&['OWNER','OBSERVER','LIMITED'].includes(level))};
function guildhall(){
 let s=emptyState();
 s=step(s,'activate',{hq_ref:'HQ-TEST',location_ref:'LOC-TEST',campaign_key:'campaign',guild_key:'main'});
 s=step(s,'load_demo');
 for(const f of ['FAC-DEMO-FORGE','FAC-DEMO-DESK'])s=step(s,'unlock_facility',{facility_ref:f});
 s=step(s,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'forge_a'});
 s=step(s,'acquire',{facility_ref:'FAC-DEMO-DESK',key:'desk_mine'});
 s=step(s,'acquire',{facility_ref:'FAC-DEMO-DESK',key:'desk_theirs'});
 s=step(s,'add_rooms',{users:[{id:'u1'},{id:'u2'}]});
 s=step(s,'lock');
 s=step(s,'install',{room_key:'common',key:'forge_a',x:0,y:0});
 const room=id=>s.core.headquarters_states[0].rooms.find(r=>r.owner_user_id===id).key;
 s=step(s,'install',{room_key:room('u1'),key:'desk_mine',x:0,y:0});
 s=step(s,'install',{room_key:room('u2'),key:'desk_theirs',x:0,y:0});
 s=step(s,'register_hireling',{hireling_ref:'HIRE-TEST-001'});
 s=step(s,'assign_staff',{hireling_ref:'HIRE-TEST-001',installation_key:'forge_a'});
 return s;
}

let user=owner,enabled=true,state=null;
const opened=[],errors=[];
const deps={canOpen:()=>user.isGM||enabled,isGM:()=>user.isGM,userOwns:a=>a.testUserPermission(user,'OWNER'),view:a=>buildPlayerView(state,a,users),
 actorById:id=>id==='hero'?actor:null,open:()=>opened.push('open'),notifyError:e=>errors.push(e.message)};
function fakeElement(){
 const listeners=[];
 const el={innerHTML:'',isConnected:true,classes:new Set(),listeners,
  classList:{add:c=>el.classes.add(c),remove:c=>el.classes.delete(c)},
  addEventListener(type,fn,{signal}={}){const l={type,fn};listeners.push(l);signal?.addEventListener('abort',()=>listeners.splice(listeners.indexOf(l),1));},
  contains:()=>true,fire(type,target){return Promise.all(listeners.filter(x=>x.type===type).map(l=>l.fn({target,stopPropagation(){},preventDefault(){}})));}};
 return el;
}

test('owner: Guildhall and rank, shared and own facilities with stage and benefits; never another room or hirelings',()=>{
 state=guildhall();user=owner;enabled=true;
 const html=embedHTML(deps,'hero');
 assert.match(html,/Guildhall<\/strong><span class="aghq-embed__stage">Rank 1/);
 assert.match(html,/<h4>Guildhall <small>1<\/small>[\s\S]*Demo Forge[\s\S]*Basic[\s\S]*Workshop Access \(demo\)/);
 assert.match(html,/<h4>Personal <small>1<\/small>[\s\S]*Owner's room/);
 assert.doesNotMatch(html,/desk_theirs|HIRE-TEST|Other's room/);
 assert.match(html,/Hirelings are managed by the GM/);
});
test('refusals: Player Access off, not the owner, unknown actor; GM sees it while access is off',()=>{
 state=guildhall();
 user=owner;enabled=false;assert.match(embedHTML(deps,'hero'),/hidden Headquarters/);
 user=other;enabled=true;assert.match(embedHTML(deps,'hero'),/Only \[TEST\] Hero&#39;s owner and the GM/);
 assert.doesNotMatch(embedHTML(deps,'hero'),/Forge/);
 assert.match(embedHTML(deps,'nobody'),/no longer exists/);
 user=gm;enabled=false;assert.match(embedHTML(deps,'hero'),/Demo Forge/);
});
test('Guildhall not open yet: a note and Open',()=>{
 state=emptyState();user=owner;enabled=true;
 const html=embedHTML(deps,'hero');
 assert.match(html,/isn't open yet/);assert.match(html,/data-aghq-embed="open"/);
});
test('mount: Open routes to the window; refreshAll redraws; detached unmounts; bad arguments throw',async()=>{
 state=guildhall();user=owner;enabled=true;opened.length=0;
 const e=createEmbed(deps),el=fakeElement();
 const view=e.mount(el,{actorId:'hero',mode:'character'});
 assert.ok(el.classes.has('aghq-embed'));
 const b={dataset:{aghqEmbed:'open'}};b.closest=()=>b;
 await el.fire('click',b);
 assert.deepEqual(opened,['open']);
 enabled=false;e.refreshAll();assert.match(el.innerHTML,/hidden Headquarters/);
 enabled=true;view.refresh();assert.match(el.innerHTML,/Demo Forge/);
 el.isConnected=false;e.refreshAll();assert.equal(el.listeners.length,0);
 assert.throws(()=>e.mount(null),/DOM element/);
 assert.throws(()=>e.mount(fakeElement(),{mode:'builder'}),/Unknown embed mode/);
 assert.deepEqual([...EMBED_MODES],['character']);
});
