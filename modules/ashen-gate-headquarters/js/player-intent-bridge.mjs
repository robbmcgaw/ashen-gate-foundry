/**
 * AG-WORK-0005 player edit transport candidate.
 * Transport is a Foundry Actor Document update: the authoritative Foundry hook
 * receives the server-supplied `userId`; no packet-supplied `from` is trusted.
 * Only the primary active GM processes requests and writes HQ world settings.
 * Existing Headquarters applyOperation remains the sole operation validator.
 * Does NOT register a new shared API, gameplay state, or actor progression.
 * Requires live Foundry V14 hook/permissions verification before acceptance.
 */
export const MODULE_ID = 'ashen-gate-headquarters';
export const REQUEST_FLAG = 'playerEditRequest';
export const RECEIPT_FLAG = 'playerEditReceipt';
export const REQUEST_PATH = `flags.${MODULE_ID}.${REQUEST_FLAG}`;
export const PLAYER_OPS = Object.freeze(new Set([
  'lock','unlock_editor','renew','install','move','rotate','uninstall',
  'add_decoration','move_decoration','rotate_decoration','remove_decoration'
]));
const VALID_NONCE = /^[a-zA-Z0-9_-]{12,80}$/;
const isPlainObject = x => x !== null && typeof x==='object' && !Array.isArray(x) && (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
export function extractIntent(changes) {
  if (!changes || typeof changes!=='object') return null;
  const nested=changes.flags?.[MODULE_ID]?.[REQUEST_FLAG];
  const dotted=changes[REQUEST_PATH];
  const other=changes[`flags.${MODULE_ID}`]?.[REQUEST_FLAG];
  return nested===undefined ? (dotted===undefined ? (other??null):dotted) : nested;
}
export function checkIntent(x) {
  if (!isPlainObject(x)) throw Error('Malformed player edit request');
  if (!VALID_NONCE.test(x.id||'')) throw Error('Invalid request identifier');
  if (!PLAYER_OPS.has(x.op)) throw Error('Operation is not player-authorized');
  if (!isPlainObject(x.payload)) throw Error('Malformed request payload');
  if (!Number.isSafeInteger(x.createdMs)||x.createdMs<=0) throw Error('Invalid request timestamp');
  // Limit size BEFORE applying legacy core handlers. Their own validation still applies.
  if (JSON.stringify(x).length>8192) throw Error('Request too large');
  return x;
}
function asUser(game,userId) {
  return game?.users?.get?.(userId) || game?.users?.find?.(u=>u.id===userId) || null;
}
const isOwner=(actor,user)=> typeof actor?.testUserPermission==='function'
 ? actor.testUserPermission(user,'OWNER') : false;

/**
 * Integration accepts trusted callbacks rather than defining a competing HQ API.
 * `apply` MUST check current state, player permissions, edit lease and revisions,
 * AND durably mark request id processed in the SAME world-setting update.
 * `alreadyProcessed` reads the GM-owned durable receipt list, never Actor flags.
 */
export function createPlayerIntentBridge({
 game, hooks, playerAccessEnabled, isGuildMember, alreadyProcessed,
 apply, recordReceipt = async()=>{}, now=()=>Date.now(), maxAgeMs=90000
}={}) {
 for(const [k,v] of Object.entries({playerAccessEnabled,isGuildMember,alreadyProcessed,apply,recordReceipt,now}))
   if(typeof v!=='function')throw new TypeError(`${k} must be a function`);
 if(!game||!hooks?.on||!hooks?.off)throw new TypeError('Foundry game/Hooks required');
 const processing=new Set();
 let sequence=Promise.resolve(); let stopped=false;
 async function handle(actor,changes,_options,serverUserId){
   // Foundry hosts differ in whether users.activeGM is populated during
   // startup. Use the same active-GM discovery as the HQ request writer.
   // This fallback still requires the current connected user to BE that GM;
   // it never accepts a caller-supplied sender identity.
   const primary=game.users?.activeGM ?? game.users?.find?.(u=>u?.isGM&&u?.active);
   if(stopped || !game.user?.isGM || !primary || primary.id!==game.user.id)return;
   const raw=extractIntent(changes); if(raw===null)return;
   const task=sequence.then(async()=>{
     let requestId='invalid';
     try {
       const intent=checkIntent(raw); requestId=intent.id;
       if(processing.has(intent.id) || await alreadyProcessed(intent.id))return;
       processing.add(intent.id);
       const requester=asUser(game,serverUserId); // Trust ONLY the hook's userId.
       if(!requester||!requester.active||requester.isGM)throw Error('Requester unavailable or not a player');
       if(!actor || !isOwner(actor,requester))throw Error('Actor ownership verification failed');
       if(!(await isGuildMember(requester,actor)))throw Error('Player is not a Guildhall member');
       if(!playerAccessEnabled(requester))throw Error('Headquarters Player Access is hidden');
       const age=now()-intent.createdMs;
       if(age < -30000 || age > maxAgeMs)throw Error('Request expired or has an invalid clock');
       // Do not permit userId, principal, GM role, or Actor identity in payload
       // to override the principal derived from the Foundry hook.
       await apply({user:requester,actor,operation:intent.op,payload:intent.payload,requestId:intent.id});
       await recordReceipt({actor,requestId:intent.id,ok:true});
     } catch(error) {
       try{await recordReceipt({actor,requestId,ok:false,error:String(error?.message||error).slice(0,180)});}
       catch(receiptError){console.warn('Headquarters could not acknowledge a player request',receiptError);}
     } finally {processing.delete(requestId);}
   });
   sequence=task.catch(()=>{});
   await task;
 }
 const token=hooks.on('updateActor',handle);
 return Object.freeze({
   dispose(){stopped=true;hooks.off('updateActor',token??handle);},
   idle:()=>sequence,
   /** Player sends only an intent using an Actor they already own in Foundry. */
   async submit(actor,intent){
     checkIntent(intent);
     if(!playerAccessEnabled(game.user)&&!game.user?.isGM)throw Error('Player Access hidden');
     if(!isOwner(actor,game.user))throw Error('Player does not own this Actor');
     if(!(await isGuildMember(game.user,actor)))throw Error('Not a Guildhall member');
     // updateActor on the GM receives actual serverUserId, not intent.from.
     return actor.update({[REQUEST_PATH]:intent});
   }
 });
}
