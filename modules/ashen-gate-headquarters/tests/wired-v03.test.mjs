import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,site,FORMAT} from '../js/logic.mjs';
import {createHQAuthoritativeWriter} from '../js/hq-authoritative-writer.mjs';
import {previewPermanentVacancies,clearVerifiedDepartures} from '../js/staffing-reconciliation.mjs';

const GM={id:'gm',isGM:true}, ALICE={id:'alice',isGM:false};
function start(){
 let s=emptyState();
 s=applyOperation(s,GM,'activate',{hq_ref:'HQ-SAMPLE',location_ref:'LOC-SAMPLE',campaign_key:'demo',guild_key:'guild'});
 s=applyOperation(s,GM,'load_demo');
 s=applyOperation(s,GM,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
 s=applyOperation(s,GM,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'copy_forge'});
 s=applyOperation(s,GM,'add_rooms',{users:[{id:'alice'}]});
 return s;
}
test('v0.3.0 state format remains unchanged; player writer uses actual v0.3 operation authority',async()=>{
 let s=start();let writes=0;
 const writer=createHQAuthoritativeWriter({readState:()=>s,saveState:async v=>{writes++;s=v;},applyOperation,now:()=>1234567});
 await writer.apply({user:ALICE,operation:'lock',payload:{},requestId:'nonce1234567890'});
 assert.equal(s.format,FORMAT);assert.equal(s.editor_lease.user_id,'alice');
 assert.equal(s.core.guild_state.rank,1);assert.equal(site(s).rooms.length,2);
 assert.equal(writes,1);assert.equal(s.processed_player_requests.length,1);
 await writer.apply({user:ALICE,operation:'lock',payload:{},requestId:'nonce1234567890'});
 assert.equal(writes,1,'duplicate prevented');
 await assert.rejects(()=>writer.apply({user:ALICE,operation:'set_rank',payload:{rank:5},requestId:'nonce9999999999'}),/GM/);
 assert.equal(s.core.guild_state.rank,1);
});
test('permanent departure integration clears only verified occupancy, never staff Working OFF',()=>{
 const s=start();
 site(s).staffing_slots.push({key:'forge_staff',room_key:'common',installation_key:'copy_forge',occupant_hireling_ref:'HIRE-ALPHA'});
 const live=previewPermanentVacancies(s.core,[{hirelingRef:'HIRE-ALPHA',verified:true,status:'working_off'}],{isGM:true});
 assert.equal(live.length,0);
 const departed=previewPermanentVacancies(s.core,[{hirelingRef:'HIRE-ALPHA',verified:true,status:'deceased'}],{isGM:true});
 assert.equal(departed.length,1);
 const cleared=clearVerifiedDepartures(s.core,departed);
 assert.equal(cleared.cleared,1);
 assert.equal(cleared.next.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,null);
 assert.equal(s.core.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,'HIRE-ALPHA');
});
test('personal room departure bumps personal revision, not shared revision',()=>{
 const s=start(),hq=site(s),room=hq.rooms.find(r=>r.owner_user_id==='alice');
 hq.staffing_slots.push({key:'s1',room_key:room.key,installation_key:'dummy',occupant_hireling_ref:'HIRE-ABC'});
 const priorShared=hq.shared_revision,priorPersonal=room.revision;
 const changes=previewPermanentVacancies(s.core,[{hirelingRef:'HIRE-ABC',status:'departed',verified:true}],{isGM:true});
 const {next,cleared}=clearVerifiedDepartures(s.core,changes);
 assert.equal(cleared,1);
 assert.equal(next.headquarters_states[0].shared_revision,priorShared);
 assert.equal(next.headquarters_states[0].rooms.find(r=>r.key===room.key).revision,priorPersonal+1);
});
