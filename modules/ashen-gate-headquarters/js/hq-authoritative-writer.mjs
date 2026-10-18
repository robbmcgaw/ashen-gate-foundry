/**
 * HQ-owned transaction adapter: complete the same state setting write that
 * persists a player operation with its replay receipt. No second campaign store.
 * Integrate into v0.5.x AFTER reviewing current saveLocal/applyOperation code.
 */
const RECEIPT_CAP=2048;
const DEFAULT_MAX_AGE_MS=90000;
const clone=x=>structuredClone(x);
export function createHQAuthoritativeWriter({readState,saveState,applyOperation,now=()=>Date.now(),receiptMaxAgeMs=DEFAULT_MAX_AGE_MS}={}){
 for(const [name,fn] of Object.entries({readState,saveState,applyOperation,now}))if(typeof fn!=='function')throw TypeError(`${name} must be a function`);
 // Invoked only by primary GM bridge; parent MUST serialize calls and verify
 // trusted user, Actor ownership, guild membership and player access.
 const alreadyProcessed=async id=>{
   const state=await readState();
   return !!(state?.processed_player_requests||[]).find(r=>r.id===id);
 };
 const apply=async({user,operation,payload,requestId})=>{
   if(!user?.id || user.isGM)throw Error('Expected an authenticated player principal');
   const prior=await readState();
   if((prior.processed_player_requests||[]).some(x=>x.id===requestId))return {duplicate:true};
   const hq=prior?.core?.headquarters_states?.[0];
   if(hq && payload.expected_shared_revision!==undefined && hq.shared_revision!==payload.expected_shared_revision)
     throw Error('Guildhall layout changed; refresh and retry');
   if(hq && payload.expected_room_revision!==undefined){
     const room=hq.rooms.find(r=>r.key===payload.room_key);
     if(!room || room.revision!==payload.expected_room_revision)throw Error('Personal room changed; refresh and retry');
   }
   const receipts=(prior.processed_player_requests||[]).filter(x=>Number.isSafeInteger(x.timestamp)&&now()-x.timestamp<=receiptMaxAgeMs+30000);
   if(receipts.length>=RECEIPT_CAP)throw Error('Player edit request capacity reached; wait and retry');
   const next=applyOperation(prior,user,operation,payload);
   if(!next || typeof next!=='object')throw Error('Invalid Headquarters state returned');
   next.processed_player_requests=[...receipts,{id:requestId,timestamp:now()}];
   // Receipt and gameplay change MUST persist together in one authoritative
   // private Journal state operation. Public world setting is a derived redacted projection.
   await saveState(clone(next));
   return {duplicate:false,stateRevision:next.state_revision};
 };
 return Object.freeze({alreadyProcessed,apply});
}
