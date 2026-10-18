import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,site,MODULE_ID} from '../js/logic.mjs';
import {projectPublicState,isPublicProjectionSafe,requirePrivateVaultPermissions,createPrivateStateStore,VAULT_POINTER,VAULT_FLAG,VAULT_MARKER} from '../js/private-state.mjs';

const GM={id:'gm',isGM:true},PLAYER={id:'p1',isGM:false};
function legacy(){
 let s=applyOperation(emptyState(),GM,'activate',{hq_ref:'HQ-TEST',location_ref:'LOC-TEST',campaign_key:'campaign',guild_key:'guild'});
 s=applyOperation(s,GM,'load_demo');
 s=applyOperation(s,GM,'unlock_facility',{facility_ref:'FAC-DEMO-FORGE'});
 s=applyOperation(s,GM,'acquire',{facility_ref:'FAC-DEMO-FORGE',key:'forge_copy'});
 s=applyOperation(s,GM,'add_rooms',{users:[PLAYER]});
 s.personnel={format:'aghq-personnel/0.1',hirelings:[{hireling_ref:'HIRE-SECRET',working:false,employment_status:'active',gm_notes:'The hidden employer is a spy',history:[{at:'2026',event:'private_note',text:'Secret mission'}],earned_perk_refs:['HPERK-SECRET']} ]};
 site(s).staffing_slots=[{key:'hidden_staff',room_key:'common',installation_key:'forge_copy',occupant_hireling_ref:'HIRE-SECRET'}];
 s.processed_player_requests=[{id:'secret_nonce',timestamp:100,gm_user_id:'gm'}];
 return s;
}
function fake(initial=legacy()){
 const records=new Map([['state',structuredClone(initial)],['playerAccessEnabled',true],[VAULT_POINTER,'']]);
 let persistWrites=0,failOnPublic=false,failOnCreate=false;
 const settings={get:(ns,k)=>{assert.equal(ns,MODULE_ID);return structuredClone(records.get(k));},set:async(ns,k,v)=>{assert.equal(ns,MODULE_ID);if(k==='state'&&failOnPublic)throw Error('public projection write unavailable');records.set(k,structuredClone(v));}};
 const journals=[];
 let n=0;
 const game={user:GM,users:new Map([[GM.id,GM],[PLAYER.id,PLAYER]]),settings,journal:{get contents(){return game.user.isGM?journals:[];},get:id=>game.user.isGM?journals.find(x=>x.id===id):undefined}};
 const JournalEntryClass={create:async data=>{
  if(failOnCreate)throw Error('Journal creation failed');
  const doc={id:`vault${++n}`,ownership:structuredClone(data.ownership),flags:structuredClone(data.flags),getFlag:(ns,key)=>doc.flags[ns]?.[key],update:async patch=>{
   if(!game.user.isGM)throw Error('Foundry permission denied');
   for(const [k,v] of Object.entries(patch)){
    assert.equal(k,`flags.${MODULE_ID}.${VAULT_FLAG}`);
    doc.flags[MODULE_ID][VAULT_FLAG]=structuredClone(v);
   }
   persistWrites++;
  }};
  journals.push(doc);return doc;
 }};
 const getStore=()=>createPrivateStateStore({game,settings,JournalEntryClass});
 return {game,records,journals,getStore,settings,JournalEntryClass,stats:()=>({persistWrites}),denyCreate:x=>failOnCreate=x,denyPublic:x=>failOnPublic=x};
}

test('legacy v0.5.1 save migrates intact to restricted Journal before settings projection, with no new ASSIGN state',async()=>{
 const e=fake(),before=e.settings.get(MODULE_ID,'state'),store=e.getStore();
 const result=await store.initialize();
 assert.equal(result.migrated,true);assert.equal(e.journals.length,1);
 assert.equal(e.journals[0].ownership.default,0);
 const secure=store.read();assert.deepEqual(secure,before,'GM canonical state exact same fields and revisions');
 assert.deepEqual(secure.personnel.hirelings,before.personnel.hirelings);
 assert.deepEqual(site(secure).staffing_slots,site(before).staffing_slots);
 assert.equal(secure.state_revision,before.state_revision);
 assert.equal(secure.ASSIGN,undefined);
 assert.ok(e.records.get(VAULT_POINTER));
 const pub=e.settings.get(MODULE_ID,'state');assert.ok(isPublicProjectionSafe(pub));
 assert.equal(pub.personnel.hirelings.length,0);assert.equal(site(pub).staffing_slots[0].occupant_hireling_ref,null);
 const serialized=JSON.stringify(pub);
 for(const val of ['HIRE-SECRET','HPERK-SECRET','secret_nonce','The hidden employer is a spy','Secret mission'])assert.equal(serialized.includes(val),false,`${val} leaked`);
});

test('direct non-GM world-setting reads, public store reads and Journal reads never reveal private values after migration',async()=>{
 const e=fake(),store=e.getStore();await store.initialize();e.game.user=PLAYER;
 const fromSettings=e.game.settings.get(MODULE_ID,'state'),fromStore=store.read();
 assert.ok(isPublicProjectionSafe(fromSettings));assert.deepEqual(fromStore,fromSettings);
 assert.equal(fromSettings.personnel.hirelings.length,0);
 assert.equal(fromSettings.core.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,null);
 await assert.rejects(()=>store.initialize(),/GM-only/);await assert.rejects(()=>store.save(legacy()),/GM-only/);
 assert.throws(()=>requirePrivateVaultPermissions({ownership:{default:1}},e.game.users),/public/);
 assert.equal(e.journals[0].ownership.default,0,'Foundry must exclude this GM-only document from player collections');
 assert.equal(e.game.journal.get(e.records.get(VAULT_POINTER)),undefined);
 assert.equal(e.game.journal.contents.length,0);
});

test('writes persist full private history and atomic staffing vacancy without restoring it to settings',async()=>{
 const e=fake(),store=e.getStore();await store.initialize();const prev=store.read();
 const next=structuredClone(prev);next.personnel.hirelings[0].employment_status='retired';next.personnel.hirelings[0].history.push({event:'permanent_departure',reason:'retired'});
 next.core.headquarters_states[0].staffing_slots[0].occupant_hireling_ref=null;next.state_revision++;
 await store.save(next);
 assert.equal(store.read().personnel.hirelings[0].history.length,2);
 assert.equal(store.read().core.headquarters_states[0].staffing_slots[0].occupant_hireling_ref,null);
 assert.ok(isPublicProjectionSafe(e.records.get('state')));
 assert.equal(e.journals[0].flags[MODULE_ID][VAULT_FLAG].state_revision,next.state_revision);
 assert.equal(e.stats().persistWrites,1);
});

test('migration retries without data loss if public projection update failed after creating vault',async()=>{
 const e=fake(),original=e.records.get('state');e.denyPublic(true);
 await assert.rejects(()=>e.getStore().initialize(),/public projection write/);
 assert.deepEqual(e.records.get('state'),original,'legacy remains until redaction succeeds');
 assert.equal(e.journals.length,1);assert.ok(e.records.get(VAULT_POINTER));
 e.denyPublic(false);const refreshed=e.getStore();const result=await refreshed.initialize();
 assert.equal(result.migrated,false);assert.equal(e.journals.length,1,'no duplicate vaults');
 assert.deepEqual(refreshed.read(),original);assert.ok(isPublicProjectionSafe(e.records.get('state')));
});

test('failure before vault creation leaves the existing save untouched',async()=>{
 const e=fake(),original=e.records.get('state');e.denyCreate(true);
 await assert.rejects(()=>e.getStore().initialize(),/Journal creation failed/);
 assert.deepEqual(e.records.get('state'),original);assert.equal(e.records.get(VAULT_POINTER),'');
});

test('insecure or missing private vault refuses access and never promotes public snapshot to authority',async()=>{
 const e=fake(),store=e.getStore();await store.initialize();e.journals[0].ownership[PLAYER.id]=1;
 assert.throws(()=>store.read(),/non-GM document permission/);
 await assert.rejects(()=>store.save(legacy()),/non-GM document permission/);
 e.journals[0].ownership[PLAYER.id]=0;const pointer=e.records.get(VAULT_POINTER);e.journals.splice(0);
 await assert.rejects(()=>e.getStore().initialize(),/inaccessible\/missing/);
 assert.equal(e.records.get(VAULT_POINTER),pointer);
});

test('public projection sanitization is detached, idempotent and preserves layout & gameplay without roster leaks',()=>{
 const original=legacy();const a=projectPublicState(original),b=projectPublicState(a);
 assert.deepEqual(a,b);assert.ok(isPublicProjectionSafe(a));
 assert.deepEqual(a.inventory,original.inventory);assert.deepEqual(a.personal_layouts,original.personal_layouts);assert.deepEqual(a.config,original.config);
 assert.equal(a.state_revision,original.state_revision);assert.equal(original.personnel.hirelings.length,1);assert.equal(site(original).staffing_slots[0].occupant_hireling_ref,'HIRE-SECRET');
});

test('non-GM cannot access private snapshot via app API export style guard',async()=>{
 const e=fake(),store=e.getStore();await store.initialize();
 const exportState=()=>{if(!e.game.user.isGM)throw Error('Headquarters export is GM-only.');return structuredClone(store.read());};
 const getState=()=>{if(!e.game.user.isGM)throw Error('Headquarters campaign-state API is GM-only.');return store.read();};
 const getPersonnel=()=>{if(!e.game.user.isGM)throw Error('Personnel state API is GM-only.');return store.read().personnel;};
 e.game.user=PLAYER;
 assert.throws(exportState,/GM-only/);assert.throws(getState,/GM-only/);assert.throws(getPersonnel,/GM-only/);
});
