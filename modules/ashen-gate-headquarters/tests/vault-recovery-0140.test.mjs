// 0.14.0 private-vault recovery: store rules and the dialog flow, against mocked Foundry objects.
// These prove the logic only; the live Foundry dialogs and Journal sidebar are verified by hand in Forge.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation,site,MODULE_ID} from '../js/logic.mjs';
import {createPrivateStateStore,VAULT_POINTER,VAULT_FLAG,VAULT_MARKER,VAULT_TITLE,NEW_VAULT_PHRASE,isPublicProjectionSafe} from '../js/private-state.mjs';
import {createVaultRecovery,pickLabel} from '../js/vault-recovery.mjs';

const GM={id:'gm',isGM:true},PLAYER={id:'p1',isGM:false};
function legacy(){
 let s=applyOperation(emptyState(),GM,'activate',{hq_ref:'HQ-TEST',location_ref:'LOC-TEST',campaign_key:'campaign',guild_key:'guild'});
 s=applyOperation(s,GM,'load_demo');
 s.personnel={format:'aghq-personnel/0.1',hirelings:[{hireling_ref:'HIRE-SECRET',working:false,employment_status:'active',gm_notes:'[TEST] private note',history:[],earned_perk_refs:[]}]};
 return s;
}
function world(){
 const records=new Map([['state',legacy()],[VAULT_POINTER,'']]);
 const writes=[];let n=0,deletes=0;
 const settings={get:(ns,k)=>structuredClone(records.get(k)),set:async(ns,k,v)=>{writes.push(k);records.set(k,structuredClone(v));}};
 const journals=[];
 const game={user:GM,users:new Map([[GM.id,GM],[PLAYER.id,PLAYER]]),settings,journal:{get contents(){return game.user.isGM?journals:[];},get:id=>game.user.isGM?journals.find(x=>x.id===id):undefined}};
 const make=(data,id)=>{const doc={id:id||`j${++n}`,name:data.name,folder:data.folder,ownership:structuredClone(data.ownership),flags:structuredClone(data.flags),getFlag:(ns,k)=>doc.flags[ns]?.[k],update:async()=>{},delete:async()=>{deletes++;}};journals.push(doc);return doc;};
 const JournalEntryClass={create:async data=>make(data)};
 const store=()=>createPrivateStateStore({game,settings,JournalEntryClass});
 return {game,records,journals,writes,settings,JournalEntryClass,store,make,deletes:()=>deletes};
}
/** A world that migrated once, then lost its vault Journal. Returns the old private state too. */
async function lostVault(){
 const w=world();const first=w.store();await first.initialize();
 const privateState=first.read();
 w.journals.splice(0);
 const store=w.store();
 await assert.rejects(()=>store.initialize(),/inaccessible\/missing/);
 return {w,store,privateState};
}
const vaultData=(state,extra={})=>({name:VAULT_TITLE,ownership:{default:0},flags:{[MODULE_ID]:{[VAULT_MARKER]:true,[VAULT_FLAG]:state}},...extra});

test('initialize failure carries a code; missing pointer is still fail-closed and recoverable',async()=>{
 const {store,w}=await lostVault();
 assert.equal(store.lastFailure(),'vault-missing');
 assert.equal(store.isReady(),false);assert.throws(()=>store.read(),/not loaded/);
 const d=store.diagnose();
 assert.equal(d.problem,'missing');assert.equal(d.canLookAgain,true);assert.equal(d.canStartNew,true);assert.equal(d.canPick,false);
 assert.equal(w.journals.length,0,'nothing auto-recreated');
});

test('(a) Look again re-points to exactly one vault Journal found by marker, and adopts it',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'restored1');
 assert.equal(store.diagnose().canPick,true);assert.equal(store.diagnose().canStartNew,false,'cannot start a second vault');
 await store.rescan();
 assert.equal(store.isReady(),true);assert.equal(w.records.get(VAULT_POINTER),'restored1');
 assert.deepEqual(store.read(),privateState,'private details intact');
});

test('(a) Look again also works when the original Journal comes back under the same id',async()=>{
 const {store,w,privateState}=await lostVault();
 const ptr=w.records.get(VAULT_POINTER);
 w.make(vaultData(privateState),ptr);
 await store.rescan();assert.equal(store.isReady(),true);assert.equal(w.records.get(VAULT_POINTER),ptr);
});

test('(a) Look again with nothing found changes nothing and stays blocked',async()=>{
 const {store,w}=await lostVault();
 const before=[...w.records.entries()];w.writes.length=0;
 await assert.rejects(()=>store.rescan(),/No private vault Journal/);
 assert.equal(store.isReady(),false);assert.equal(w.writes.length,0);assert.deepEqual([...w.records.entries()],before);
});

test('(b) pick: only a marked Journal can be chosen; unmarked or unknown ids are refused',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make({name:'Some other note',ownership:{default:0},flags:{}},'plain');
 w.make(vaultData(privateState),'real');
 await assert.rejects(()=>store.relinkToVault('plain'),/not a Headquarters private vault/);
 await assert.rejects(()=>store.relinkToVault('nope'),/not a Headquarters private vault/);
 assert.equal(store.isReady(),false);
 await store.relinkToVault('real');
 assert.equal(store.isReady(),true);assert.equal(w.records.get(VAULT_POINTER),'real');
});

test('(b) pick refuses a vault with player permissions or an unreadable body, and does not move the pointer',async()=>{
 const {store,w}=await lostVault();
 const ptr=w.records.get(VAULT_POINTER);
 const bad=w.make({name:VAULT_TITLE,ownership:{default:2},flags:{[MODULE_ID]:{[VAULT_MARKER]:true,[VAULT_FLAG]:legacy()}}},'open');
 await assert.rejects(()=>store.relinkToVault('open'),/public document permissions/);
 bad.ownership.default=0;bad.flags[MODULE_ID][VAULT_FLAG]={format:'other'};
 await assert.rejects(()=>store.relinkToVault('open'),/empty or in a format/);
 assert.equal(w.records.get(VAULT_POINTER),ptr);assert.equal(store.isReady(),false);
});

test('multiple vaults stay blocked: initialize, Look again, pick and start-new all refuse; nothing is chosen for the GM',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'a');w.make(vaultData(privateState),'b');
 const ptr=w.records.get(VAULT_POINTER);
 await assert.rejects(()=>w.store().initialize(),/Multiple Headquarters private vaults/);
 await assert.rejects(()=>store.rescan(),/Multiple Headquarters private vaults/);
 await assert.rejects(()=>store.relinkToVault('a'),/More than one private vault/);
 await assert.rejects(()=>store.startNewVault({confirmation:NEW_VAULT_PHRASE}),/Nothing was changed/);
 const d=store.diagnose();assert.equal(d.problem,'multiple');assert.equal(d.canPick,false);assert.equal(d.canStartNew,false);assert.equal(d.canLookAgain,true);
 assert.equal(w.records.get(VAULT_POINTER),ptr);assert.equal(w.journals.length,2);assert.equal(store.isReady(),false);
});

test('empty or incompatible vault is reported, never overwritten, and not replaceable by a new vault',async()=>{
 const w=world();w.make(vaultData({format:'something-else'}),'old');w.records.set(VAULT_POINTER,'old');
 const store=w.store();
 await assert.rejects(()=>store.initialize(),/empty or incompatible/);
 assert.equal(store.lastFailure(),'vault-incompatible');
 const d=store.diagnose();assert.equal(d.problem,'incompatible');assert.equal(d.canStartNew,false);assert.equal(d.canPick,false);
 await assert.rejects(()=>store.startNewVault({confirmation:NEW_VAULT_PHRASE}),/Nothing was changed/);
 assert.deepEqual(w.journals[0].flags[MODULE_ID][VAULT_FLAG],{format:'something-else'});
});

test('(c) start new: typed confirmation is required (missing, wrong, empty all refuse and change nothing)',async()=>{
 const {store,w}=await lostVault();
 w.writes.length=0;
 for(const bad of [undefined,'','yes','NEW','new vault please'])await assert.rejects(()=>store.startNewVault({confirmation:bad}),/Type NEW VAULT/);
 await assert.rejects(()=>store.startNewVault(),/Type NEW VAULT/);
 assert.equal(w.journals.length,0);assert.equal(w.writes.length,0);assert.equal(store.isReady(),false);
});

test('(c) start new: restricted Journal (default 0), pointer set, revision bumped once, public copy only, nothing deleted',async()=>{
 const {store,w,privateState}=await lostVault();
 const publicBefore=w.records.get('state');const oldRevision=publicBefore.state_revision;
 const result=await store.startNewVault({confirmation:'  new vault '});
 assert.equal(w.journals.length,1);const j=w.journals[0];
 assert.equal(j.ownership.default,0);assert.deepEqual(Object.keys(j.ownership),['default']);
 assert.equal(j.name,VAULT_TITLE);assert.equal(j.flags[MODULE_ID][VAULT_MARKER],true);
 assert.equal(w.records.get(VAULT_POINTER),j.id);
 assert.equal(result.state_revision,oldRevision+1);assert.equal(store.read().state_revision,oldRevision+1);
 assert.equal(w.records.get('state').state_revision,oldRevision+1);
 assert.ok(w.records.get('state').state_revision>privateState.state_revision-1,'monotonic');
 assert.equal(store.isReady(),true);
 // Private-only details are gone and the new copy has no roster.
 assert.deepEqual(store.read().personnel.hirelings,[]);
 assert.ok(!JSON.stringify(w.journals[0].flags).includes('HIRE-SECRET'));
 assert.ok(isPublicProjectionSafe(w.records.get('state')));
 // Layout from the public copy is kept.
 assert.deepEqual(store.read().inventory,publicBefore.inventory);
 assert.equal(w.deletes(),0);
 // The next load finds exactly one vault and works.
 const again=w.store();await again.initialize();assert.equal(again.read().state_revision,oldRevision+1);
});

test('(c) start new is refused if the vault already loaded or the public copy is unreadable',async()=>{
 const {store,w}=await lostVault();
 w.records.set('state',{format:'broken'});
 await assert.rejects(()=>store.startNewVault({confirmation:NEW_VAULT_PHRASE}),/public Guildhall copy/);
 assert.equal(w.journals.length,0);assert.equal(w.records.get(VAULT_POINTER)!=='',true);
 const ok=world();const s=ok.store();await s.initialize();
 await assert.rejects(()=>s.startNewVault({confirmation:NEW_VAULT_PHRASE}),/already loaded/);
});

test('non-GM cannot diagnose, look again, pick or start a new vault; players see no change',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'real');
 w.game.user=PLAYER;
 assert.throws(()=>store.diagnose(),/GM-only/);
 await assert.rejects(()=>store.rescan(),/GM-only/);
 await assert.rejects(()=>store.relinkToVault('real'),/GM-only/);
 await assert.rejects(()=>store.startNewVault({confirmation:NEW_VAULT_PHRASE}),/GM-only/);
 assert.equal(w.records.get(VAULT_POINTER)!=='real',true);
 const run=createVaultRecovery({store,isGM:()=>false,dialogs:{choice:async()=>{throw Error('dialog must not open');},form:async()=>null},notify:{info(){}}});
 assert.deepEqual(await run.run(),{status:'not-gm'});assert.equal(run.available(),false);
 assert.equal(store.publicRead().format,w.records.get('state').format,'player reads the public copy');
});

test('no recovery path deletes any Journal',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'a');await store.rescan();
 const x=await lostVault();await x.store.startNewVault({confirmation:NEW_VAULT_PHRASE});
 assert.equal(w.deletes(),0);assert.equal(x.w.deletes(),0);
});

// ---- the dialog flow ----
function flow({store,answers,forms=[],isGM=true}){
 const shown=[],infos=[];let recovered=[];
 const dialogs={choice:async(title,html,choices)=>{shown.push({title,html,choices});return answers.shift()??null;},form:async(title,fields)=>{shown.push({title,fields});return forms.shift()??null;}};
 const r=createVaultRecovery({store,isGM:()=>isGM,dialogs,notify:{info:m=>infos.push(m)},onRecovered:a=>recovered.push(a)});
 return {r,shown,infos,recovered};
}

test('flow: Cancel changes nothing; offers Look again and Start new, no ids shown',async()=>{
 const {store,w}=await lostVault();
 const f=flow({store,answers:[null]});w.writes.length=0;
 assert.equal(f.r.available(),true);
 assert.deepEqual(await f.r.run(),{status:'cancelled'});
 assert.deepEqual(f.shown[0].choices.map(c=>c.action),['look-again','start-new']);
 assert.equal(f.shown[0].choices.find(c=>c.action==='start-new').danger,true);
 assert.equal(f.shown[0].choices.find(c=>c.action==='look-again').default,true);
 assert.match(f.shown[0].html,/Nothing has been changed or deleted/);
 assert.ok(!/j\d|vault\d/.test(f.shown[0].html));
 assert.equal(w.writes.length,0);assert.equal(w.journals.length,0);
});

test('flow: Look again that finds nothing shows a note and re-offers the dialog',async()=>{
 const {store}=await lostVault();
 const f=flow({store,answers:['look-again',null]});
 assert.deepEqual(await f.r.run(),{status:'cancelled'});
 assert.equal(f.shown.length,2);assert.match(f.shown[1].html,/Still no private vault Journal was found/);
});

test('flow: Look again recovers an existing vault',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'only');
 const f=flow({store,answers:['look-again']});
 assert.deepEqual(await f.r.run(),{status:'recovered',via:'look-again'});
 assert.deepEqual(f.recovered,['look-again']);assert.equal(f.infos.length,1);assert.equal(store.isReady(),true);
});

test('flow: Pick offers marked journals with number and folder, no ids',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState,{folder:{name:'Archive'}}),'secretid123');
 const f=flow({store,answers:['pick'],forms:[{journal:'secretid123'}]});
 assert.deepEqual(f.shown.length,0);
 assert.deepEqual(await f.r.run(),{status:'recovered',via:'pick'});
 const form=f.shown.find(s=>s.fields);
 assert.match(form.fields[0].options[0].label,/Vault Journal 1 in folder "Archive"/);
 assert.ok(!form.fields[0].options[0].label.includes('secretid123'));
 assert.equal(f.shown[0].choices.some(c=>c.action==='start-new'),false,'cannot start new while a vault Journal exists');
 assert.equal(w.records.get(VAULT_POINTER),'secretid123');
});

test('flow: Start new needs the typed phrase; a wrong phrase is refused with a note and nothing created',async()=>{
 const {store,w}=await lostVault();
 const f=flow({store,answers:['start-new','start-new',null],forms:[{phrase:'nope'},null]});
 assert.deepEqual(await f.r.run(),{status:'cancelled'});
 assert.match(f.shown.find(s=>s.html&&/Type NEW VAULT/.test(s.html)).html,/Type NEW VAULT/);
 assert.equal(w.journals.length,0);
 const form=f.shown.find(s=>s.fields);
 assert.match(form.fields[0].label,/NEW VAULT/);assert.match(form.fields[0].hint,/cannot be recovered/);assert.match(form.fields[0].hint,/Nothing is deleted/);
});

test('flow: Start new with the phrase succeeds and says to add hirelings again',async()=>{
 const {store,w}=await lostVault();
 const f=flow({store,answers:['start-new'],forms:[{phrase:NEW_VAULT_PHRASE}]});
 assert.deepEqual(await f.r.run(),{status:'recovered',via:'start-new'});
 assert.match(f.infos[0],/new private vault.*hirelings/i);assert.equal(w.journals.length,1);assert.equal(w.journals[0].ownership.default,0);
});

test('flow: multiple vaults offers Look again only (still blocked); incompatible likewise',async()=>{
 const {store,w,privateState}=await lostVault();
 w.make(vaultData(privateState),'a');w.make(vaultData(privateState),'b');
 const f=flow({store,answers:[null]});await f.r.run();
 assert.deepEqual(f.shown[0].choices.map(c=>c.action),['look-again']);assert.match(f.shown[0].html,/more than one/i);
 const g=flow({store,answers:['look-again',null]});await g.r.run();
 assert.match(g.shown[1].html,/Multiple Headquarters private vaults/);assert.equal(store.isReady(),false);
 const w2=world();w2.make(vaultData({format:'x'}),'old');w2.records.set(VAULT_POINTER,'old');
 const s2=w2.store();await assert.rejects(()=>s2.initialize());
 const h=flow({store:s2,answers:[null]});await h.r.run();
 assert.deepEqual(h.shown[0].choices.map(c=>c.action),['look-again']);assert.match(h.shown[0].html,/empty or in a format/);
});

test('flow: only one dialog at a time',async()=>{
 const {store}=await lostVault();
 let release;const gate=new Promise(r=>{release=r;});let opened=0;
 const r=createVaultRecovery({store,isGM:()=>true,dialogs:{choice:async()=>{opened++;await gate;return null;},form:async()=>null},notify:{info(){}}});
 const a=r.run(),b=r.run(),c=r.run();assert.equal(a,b);assert.equal(b,c);release();await a;assert.equal(opened,1);
});

test('pickLabel never contains an id',()=>{
 assert.equal(pickLabel({number:2,folder:'',valid:false,revision:0}),'Vault Journal 2 (cannot be read)');
});
