// 0.9.0: api.playerView(actor) — player-safe, read-only. Pure logic with synthetic state; not the live Foundry UI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../js/logic.mjs';
import {requirePlayerViewAccess,buildPlayerView} from '../js/player-view.mjs';
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

test('shared facilities plus the owner\'s own room; never another player\'s room',()=>{
 const v=buildPlayerView(guildhall(),actor,users);
 assert.equal(v.active,true);assert.deepEqual(v.guildhall,{name:'Guildhall',rank:1});
 assert.deepEqual(v.facilities.map(f=>[f.key,f.room,f.roomOwner]),[['desk_mine','personal','Owner'],['forge_a','shared',null]]);
 const forge=v.facilities.find(f=>f.key==='forge_a');
 assert.deepEqual(forge,{key:'forge_a',facilityId:'FAC-DEMO-FORGE',name:'Demo Forge',category:'Profession',stage:'Basic',room:'shared',roomOwner:null,
  benefits:[{name:'Workshop Access (demo)',description:'Informational demonstration only.',recipient:'guild'}]});
});
test('never exposes personnel or staffing, even built from the GM\'s full state',()=>{
 const full=guildhall();
 assert.equal(full.personnel.hirelings.length,1,'fixture has a private hireling');
 const v=buildPlayerView(full,actor,users);
 assert.deepEqual(v.hirelings,[]);assert.equal(v.hirelingsPublished,false);
 const text=JSON.stringify(v);
 for(const secret of ['HIRE-TEST-001','occupant','personnel','history','editor_lease','u2'])assert.ok(!text.includes(secret),`no ${secret}`);
});
test('permission: GM and owner allowed; other player refused; Player Access off refuses players only',()=>{
 assert.doesNotThrow(()=>requirePlayerViewAccess(actor,gm,true));
 assert.doesNotThrow(()=>requirePlayerViewAccess(actor,owner,true));
 assert.throws(()=>requirePlayerViewAccess(actor,other,true),/Actor access denied/);
 assert.throws(()=>requirePlayerViewAccess(actor,owner,false),/hidden by the GM/);
 assert.doesNotThrow(()=>requirePlayerViewAccess(actor,gm,false));
 assert.throws(()=>requirePlayerViewAccess(null,gm,true),/No Actor/);
});
test('no data: a Guildhall not yet activated returns an empty view',()=>{
 assert.deepEqual(buildPlayerView(emptyState(),actor,users),{active:false,guildhall:null,facilities:[],hirelings:[],hirelingsPublished:false});
});
test('a character with no player owner sees only shared facilities',()=>{
 const npc={id:'npc',testUserPermission:u=>Boolean(u.isGM)};
 assert.deepEqual(buildPlayerView(guildhall(),npc,users).facilities.map(f=>f.key),['forge_a']);
});
