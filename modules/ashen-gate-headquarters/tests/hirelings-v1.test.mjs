import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,demoCatalog} from '../js/logic.mjs';
import {hirelingState,stationed,derivePerkStatuses,markNonStacking} from '../js/hirelings.mjs';
import {readNativeHirelingDefinitions} from '../js/native-hireling-definitions.mjs';
const gm={id:'gm',isGM:true};const player={id:'player',isGM:false};
const step=(s,op,p={})=>applyOperation(s,gm,op,p,1711000000000);
const initialize=()=>{
 let s=emptyState();
 s=step(s,'activate',{hq_ref:'HQ-TEST',location_ref:'LOC-TEST',campaign_key:'campaign',guild_key:'main'});
 s=step(s,'load_demo');s=step(s,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
 s=step(s,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'forge_a'});
 s=step(s,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'forge_b'});
 s=step(s,'lock');
 s=step(s,'install',{room_key:'common',key:'forge_a',x:0,y:0});
 s=step(s,'install',{room_key:'common',key:'forge_b',x:8,y:0});
 return s;
};
const register=(s,id)=>step(s,'register_hireling',{hireling_ref:id});
const assign=(s,id,key)=>step(s,'assign_staff',{hireling_ref:id,installation_key:key});
const profile={refs:[{relation:'has_hireling_perk',target_id:'HPERK-ONE',mode:'required'},{relation:'has_hireling_perk',target_id:'HPERK-TWO',mode:'required'}],capabilities:[{key:'smith'}]};
const perks=new Map([
 ['HPERK-ONE',{name:'Smith at Work',contexts:['headquarters'],conditions:{requires_working:true,requires_presence:true,eligible_facility_refs:['FAC-DEMO-FORGE'],required_capability_keys:['smith']},stacking:{overlap_group:'smithing'}}],
 ['HPERK-TWO',{name:'Quiet Wisdom',contexts:['passive'],conditions:{},stacking:{overlap_group:'smithing'}}]
]);
test('HQR-01: existing 0.4 state adds separate personnel domain without altering Guildhall installs',()=>{
 let s=initialize();delete s.personnel;const old=structuredClone(s.core);
 s=register(s,'HIRE-TEST-001');assert.deepEqual(s.core,old);
 assert.equal(s.personnel.format,'aghq-personnel/0.1');
 assert.equal(hirelingState(s,'HIRE-TEST-001').working,true);
});
test('HQR-02/03: Working OFF reserves station; ON restores informational eligibility',()=>{
 let s=assign(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-001','forge_a');
 let pre=derivePerkStatuses(s,'HIRE-TEST-001',profile,perks);
 assert.equal(pre[0].status,'eligible');assert.equal(pre[1].status,'eligible');
 const slot=stationed(s,'HIRE-TEST-001')[0].slot.key;
 s=step(s,'set_working',{hireling_ref:'HIRE-TEST-001',working:false});
 assert.equal(stationed(s,'HIRE-TEST-001')[0].slot.key,slot);
 pre=derivePerkStatuses(s,'HIRE-TEST-001',profile,perks);
 assert.equal(pre[0].status,'inactive');assert.equal(pre[1].status,'eligible');
 s=step(s,'set_working',{hireling_ref:'HIRE-TEST-001',working:true});
 assert.equal(derivePerkStatuses(s,'HIRE-TEST-001',profile,perks)[0].status,'eligible');
});
test('HQR-04: unstationed roster member retains independent passive perk',()=>{
 const s=register(initialize(),'HIRE-TEST-004');const result=derivePerkStatuses(s,'HIRE-TEST-004',profile,perks);
 assert.equal(stationed(s,'HIRE-TEST-004').length,0);
 assert.equal(result[0].status,'inactive');assert.equal(result[1].status,'eligible');
});
test('HQR-05: overlapping groups flagged nonstacking, not auto-granted',()=>{
 const s=register(initialize(),'HIRE-TEST-004');const result=markNonStacking(derivePerkStatuses(s,'HIRE-TEST-004',profile,perks));
 assert.equal(result[1].status,'eligible');
 const s2=assign(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-001','forge_a');
 const stacked=markNonStacking(derivePerkStatuses(s2,'HIRE-TEST-001',profile,perks));
 assert.equal(stacked[1].status,'nonstacking');
});
test('HQR-06: explicit departure clears only occupied slot with one history event, idempotent',()=>{
 let s=assign(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-001','forge_a');
 assert.throws(()=>applyOperation(s,player,'depart_hireling',{hireling_ref:'HIRE-TEST-001',status:'deceased',confirm:true}),/GM/);
 assert.throws(()=>step(s,'depart_hireling',{hireling_ref:'HIRE-TEST-001',status:'deceased'}),/confirmation/);
 s=step(s,'depart_hireling',{hireling_ref:'HIRE-TEST-001',status:'deceased',confirm:true});
 assert.equal(stationed(s,'HIRE-TEST-001').length,0);
 assert.equal(hirelingState(s,'HIRE-TEST-001').history.length,1);
 s=step(s,'depart_hireling',{hireling_ref:'HIRE-TEST-001',status:'deceased',confirm:true});
 assert.equal(hirelingState(s,'HIRE-TEST-001').history.length,1);
 assert.throws(()=>step(s,'assign_staff',{hireling_ref:'HIRE-TEST-001',installation_key:'forge_b'}),/departure/);
});
test('HQR-09: staffing/transfer changes no ASSIGN state; transaction leaves single HQ slot',()=>{
 let s=assign(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-001','forge_a');
 s=assign(s,'HIRE-TEST-001','forge_b');
 assert.equal(stationed(s,'HIRE-TEST-001').length,1);
 assert.equal(stationed(s,'HIRE-TEST-001')[0].slot.installation_key,'forge_b');
 assert.equal(s.assignments,undefined);
});
test('HQR-09: full destination fails without moving source',()=>{
 let s=register(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-002');
 s=assign(assign(s,'HIRE-TEST-001','forge_a'),'HIRE-TEST-002','forge_b');
 assert.throws(()=>assign(s,'HIRE-TEST-001','forge_b'),/No open/);
 assert.equal(stationed(s,'HIRE-TEST-001')[0].slot.installation_key,'forge_a');
});
test('HQR-10: no active benefit cache/duplicate personnel in installation state',()=>{
 const s=assign(register(initialize(),'HIRE-TEST-001'),'HIRE-TEST-001','forge_a');
 assert.equal(Object.keys(s.core.headquarters_states[0].installations[0]).includes('working'),false);
 assert.equal(JSON.stringify(s.core).includes('active_benefits'),false);
});
test('HQR-08: native source visibility and archive rules are enforced',()=>{
 const doc=(id,type,visibility,archived=false)=>({name:id,uuid:`Item.${id}`,img:'icons/a.svg',flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:type,visibility},lifecycle:{archived}}},testUserPermission:(u)=>u.id==='player'});
 const game={items:{contents:[doc('HIRE-TEST-001','Hireling','gm'),doc('HIRE-TEST-002','Hireling','player'),doc('HIRE-TEST-003','Hireling','player',true)]},journal:{contents:[]}};
 const {records}=readNativeHirelingDefinitions(game,player);
 assert.equal(records.has('HIRE-TEST-001'),false);
 assert.equal(records.has('HIRE-TEST-002'),true);
 assert.equal(records.has('HIRE-TEST-003'),false);
});
test('HQR-01: duplicate source refs require conflict resolution, never auto merge',()=>{
 const doc=()=>({name:'Hire',flags:{'ashen-gate-manager':{source:{sourceId:'HIRE-TEST-001',entityType:'Hireling',visibility:'player'}}},testUserPermission:()=>true});
 const game={items:{contents:[doc(),doc()]},journal:{contents:[]}};
 const a=readNativeHirelingDefinitions(game,gm);
 assert.equal(a.records.has('HIRE-TEST-001'),false);assert.equal(a.conflicts.has('HIRE-TEST-001'),true);
});

test('DEC-0077/0079: Manager campaign_state cannot be treated as native Hireling definition',()=>{
 const mk=(id,type,scope,rec)=>({name:'Hidden Candidate',flags:{'ashen-gate-manager':{source:{sourceId:id,entityType:type,scope,visibility:'player',record:rec}}},testUserPermission:()=>true});
 const valid={id:'HIRE-TEST-READY',entity_type:'Hireling',scope:'setting_adapter',role:'Guard',refs:[]};
 const items={contents:[
  mk('HIRE-TEST-STATE','Hireling','campaign_state',{id:'HIRE-TEST-STATE',entity_type:'Hireling',scope:'campaign_state'}),
  mk('HIRE-TEST-MISMATCH','Hireling','setting_adapter',{id:'HIRE-TEST-MISMATCH',entity_type:'HirelingPerk',scope:'setting_adapter'}),
  mk('HIRE-TEST-READY','Hireling','setting_adapter',valid)
 ]};
 const {records}=readNativeHirelingDefinitions({items,journal:{contents:[]}},player);
 assert.equal(records.size,1);assert.equal(records.has('HIRE-TEST-READY'),true);
 assert.equal(records.has('HIRE-TEST-STATE'),false);assert.equal(records.has('HIRE-TEST-MISMATCH'),false);
});
