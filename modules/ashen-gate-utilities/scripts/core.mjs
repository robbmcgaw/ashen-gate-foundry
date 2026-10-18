/** Ashen Gate | Utilities 0.2.0-alpha pure session rules. No Foundry globals. */
export const ID = 'ashen-gate-utilities';
export const VERSION = '0.2.3';
export const SKILL_IDS = Object.freeze(['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel','slt','ste','sur']);
export const ABILITY_IDS = Object.freeze(['str','dex','con','int','wis','cha']);
export const MAX_PARTICIPANTS = 24;
export const MAX_CONTRIBUTIONS = 5;
export const MAX_HISTORY = 30;
export const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const unique = items => [...new Set(items)];
export const finished = slot => slot.status === 'accepted' || slot.status === 'skipped';
export function createSession({id,kind='group',name,actors,skills,rollsPerActor=1,dc=null,visibility='public',successText='',failureText='',createdBy,createdAt=Date.now()}) {
  if(!['group','request'].includes(kind))throw Error('Unknown interaction type.');
  const actorIds=unique(actors??[]).filter(s=>typeof s==='string'&&s.length>0);
  const allowed=unique(skills??[]).filter(s=>SKILL_IDS.includes(s)||ABILITY_IDS.includes(s));
  if(actorIds.length<1||actorIds.length>MAX_PARTICIPANTS)throw Error('Choose 1 to 24 characters.');
  if(allowed.length<1)throw Error('Select at least one permitted skill or ability.');
  if(!Number.isInteger(rollsPerActor)||rollsPerActor<1||rollsPerActor>MAX_CONTRIBUTIONS)throw Error('Invalid contribution count.');
  if(kind==='request'&&rollsPerActor!==1)throw Error('Roll Requests have one contribution per participant.');
  if(kind==='group'&&allowed.length<rollsPerActor)throw Error('The number of permitted skills must meet the contribution count.');
  if(dc!==null&&(!Number.isFinite(Number(dc))||Number(dc)<0||Number(dc)>100))throw Error('DC must be between 0 and 100.');
  if(!['public','private','blind'].includes(visibility))throw Error('Unknown visibility.');
  if(!id||!createdBy)throw Error('Missing session identity.');
  const slots=actorIds.flatMap(actorId=>Array.from({length:rollsPerActor},(_,index)=>({actorId,index,status:'pending',skill:null,total:null,userId:null,proofMessageId:null})));
  return {schema:'ag-utilities-session/0.1',id:String(id),kind,name:String(name||'Untitled Check').slice(0,120),actors:actorIds,skills:allowed,rollsPerActor,dc:dc===null?null:Number(dc),visibility,successText:String(successText).slice(0,1000),failureText:String(failureText).slice(0,1000),createdAt,createdBy,status:'active',slots,audit:[],closedAt:null};
}
export function summary(session) {
  const accepted=session.slots.filter(x=>x.status==='accepted');
  const skipped=session.slots.filter(x=>x.status==='skipped').length;
  const total=accepted.reduce((sum,x)=>sum+x.total,0);
  const average=accepted.length?total/accepted.length:null;
  const complete=session.slots.every(finished);
  const result=!complete?'pending':accepted.length===0?'no-result':session.kind==='request'?'completed':session.dc===null?'completed':average>=session.dc?'success':'failure';
  return {accepted:accepted.length,skipped,pending:session.slots.length-accepted.length-skipped,totalSlots:session.slots.length,average,result};
}
export function acceptRoll(session,{actorId,skill,total,userId,proofMessageId,at=Date.now()}) {
  if(session.status!=='active')throw Error('This interaction is closed.');
  if(!session.actors.includes(actorId))throw Error('Actor is not participating.');
  if(!session.skills.includes(skill))throw Error('Skill is not permitted.');
  if(!Number.isFinite(total)||total<-100||total>1000)throw Error('Roll total is invalid.');
  if(!userId||!proofMessageId)throw Error('Native roll evidence is required.');
  if(session.slots.some(s=>s.proofMessageId===proofMessageId))throw Error('Roll message was already used.');
  const own=session.slots.filter(s=>s.actorId===actorId);
  if(session.kind==='group'&&own.some(s=>s.status==='accepted'&&s.skill===skill))throw Error('A character cannot repeat a skill in one Group Check.');
  const slot=own.find(s=>s.status==='pending');
  if(!slot)throw Error('No pending contributions remain for this character.');
  slot.status='accepted';slot.skill=skill;slot.total=total;slot.userId=userId;slot.proofMessageId=proofMessageId;
  session.audit.push({type:'roll',actorId,slot:slot.index,skill,total,userId,proofMessageId,at});
  if(summary(session).pending===0){session.status='completed';session.closedAt=at;}
  return session;
}
export function skipRoll(session,{actorId,reason='',userId,at=Date.now()}) {
  if(session.status!=='active')throw Error('This interaction is closed.');
  const slot=session.slots.find(s=>s.actorId===actorId&&s.status==='pending');
  if(!slot)throw Error('No pending contributions to skip.');
  slot.status='skipped';
  session.audit.push({type:'skip',actorId,slot:slot.index,reason:String(reason).slice(0,240),userId,at});
  if(summary(session).pending===0){session.status='completed';session.closedAt=at;}
  return session;
}
/** GM early completion: account for every unfilled slot explicitly, never silently discard rolls. */
export function resolveNow(session,{userId,reason='GM ended early',at=Date.now()}){
  if(session.status!=='active')throw Error('Only an active check can be ended.');
  if(!userId)throw Error('GM identity is required.');
  const pending=session.slots.filter(slot=>slot.status==='pending');
  for(const slot of pending){
    slot.status='skipped';
    session.audit.push({type:'skip',actorId:slot.actorId,slot:slot.index,userId,reason:String(reason).slice(0,240),at});
  }
  session.status='completed';session.closedAt=at;
  session.audit.push({type:'resolve-now',userId,at,pendingClosed:pending.length});
  return session;
}
export function voidRoll(session,{actorId,slotIndex,reason,userId,at=Date.now()}){
  if(!String(reason??'').trim())throw Error('Provide an audit reason.');
  const slot=session.slots.find(s=>s.actorId===actorId&&s.index===slotIndex&&s.status==='accepted');
  if(!slot)throw Error('Accepted contribution not found.');
  const prior={...slot};
  Object.assign(slot,{status:'pending',skill:null,total:null,userId:null,proofMessageId:null});
  session.status='active';session.closedAt=null;
  session.audit.push({type:'void',actorId,slot:slotIndex,prior,reason:String(reason).slice(0,240),userId,at});
  return session;
}
export function cancelSession(session,{userId,at=Date.now()}){
  if(session.status!=='active')throw Error('Only active sessions may be cancelled.');
  session.status='cancelled';session.closedAt=at;session.audit.push({type:'cancel',userId,at});return session;
}
/** Player presentation projection: no private roll totals for unrelated players. */
export function projectSession(session,{userId,isGM=false,ownedActorIds=[]}={}){
  const own=new Set(ownedActorIds);
  return {...session,successText:session.status==='completed'?session.successText:'',failureText:session.status==='completed'?session.failureText:'',
    audit:isGM?session.audit:[],slots:session.slots.map(s=>{
      const visible=isGM||session.kind==='group'||session.visibility==='public'||(session.visibility==='private'&&s.userId===userId);
      if(visible)return {...s,proofMessageId:isGM?s.proofMessageId:null};
      return {...s,total:null,skill:null,userId:null,proofMessageId:null};
    })};
}
