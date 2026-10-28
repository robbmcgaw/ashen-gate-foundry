/** Known vs Recruited (0.23.0). Pure JS, no Foundry runtime.
 * `discovery` keeps meaning KNOWN: the player may see the faction's profile and information entries.
 * `membership` is the second, narrower state: only a member sees standing, ranks, milestones, rewards, claims and history.
 * Both are campaign state (the faction's group state record); neither is ever part of a reusable definition.
 * Recruiting implies Known. Removing Known removes membership. Removing membership keeps Known and keeps all stored standing. */
export const KNOWN_NOT_RECRUITED='Known (not recruited)';
const ids=a=>Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'&&x))]:[];
export const blankMembership=()=>({party:false,actors:[]});
export const normalizeMembership=m=>({party:Boolean(m?.party),actors:ids(m?.actors)});
/** The one-time migration rule: a state with no membership field starts as a copy of its discovery. */
export const membershipFromDiscovery=d=>normalizeMembership(d);
export const hasMembershipField=state=>Boolean(state&&typeof state==='object'&&state.membership&&typeof state.membership==='object');
/** Stored membership when present; otherwise the migration copy of the effective discovery; otherwise nobody. */
export const resolveMembership=(state,discovery)=>hasMembershipField(state)?normalizeMembership(state.membership):membershipFromDiscovery(discovery);
const knows=(f,actorId)=>Boolean(f?.discovery?.party||(actorId&&f?.discovery?.actors?.includes(actorId)));
/** A member is always Known too: membership without discovery counts for nothing. */
export const isPartyMember=f=>Boolean(f?.membership?.party&&f?.discovery?.party);
export const isMember=(f,actorId)=>Boolean(isPartyMember(f)||(actorId&&f?.membership?.actors?.includes(actorId)&&knows(f,actorId)));
export const memberActorIds=(f,actorIds=[])=>actorIds.filter(id=>isMember(f,id));
/** Group standing belongs to the party: it is shown to anyone recruited, as a party member or as a character. */
export const hasAnyMember=(f,actorIds=null)=>isPartyMember(f)||(actorIds??f?.membership?.actors??[]).some(id=>isMember(f,id));
function party(f,on){f.discovery.party=on;}
function put(list,id,on){const s=new Set(list);if(on)s.add(id);else s.delete(id);return [...s];}
const ready=f=>{f.discovery??={party:false,actors:[]};f.discovery.actors??=[];f.membership=normalizeMembership(f.membership);return f;};
/** Show to / hide from the party or one character. Hiding also removes membership for that scope. Mutates and returns f. */
export function setKnown(f,{party:isParty=false,actorId=null,on=true}={}){
  ready(f);
  if(isParty){party(f,on);if(!on)f.membership.party=false;}
  else if(actorId){f.discovery.actors=put(f.discovery.actors,actorId,on);if(!on)f.membership.actors=put(f.membership.actors,actorId,false);}
  else throw Error('Party or character required.');
  return f;
}
/** Recruit (on) or remove from members (off). Recruiting also makes the scope Known. Standing data is never touched. */
export function setMember(f,{party:isParty=false,actorId=null,on=true}={}){
  ready(f);
  if(isParty){if(on)party(f,true);f.membership.party=on;}
  else if(actorId){if(on&&!f.discovery.party)f.discovery.actors=put(f.discovery.actors,actorId,true);f.membership.actors=put(f.membership.actors,actorId,on);}
  else throw Error('Party or character required.');
  return f;
}
/** Would hiding this scope from the players also remove a membership? (The GM is asked first.) */
export function hidingRemovesMembership(f,{party:isParty=false,actorId=null}={}){
  return isParty?Boolean(f?.membership?.party):Boolean(actorId&&f?.membership?.actors?.includes(actorId));
}
/** Faction-wide chip for the GM list and editor. Text, never colour alone. */
export function recruitChip(f){
  if(isPartyMember(f))return 'Recruited: party';
  return (f?.membership?.actors??[]).some(id=>isMember(f,id))?'Recruited: characters':'Not recruited';
}
export const recruitBadge=chip=>chip==='Recruited: party'?'ag-badge--ok':chip==='Recruited: characters'?'ag-badge--accent':'';
export const showLabel=(known,who)=>`${known?'Hide from':'Show to'} ${who}`;
/** One scope (the party, or one character) as the GM sees it: chips and the label of the Recruit button. */
export function scopeStatus(f,{party:isParty=false,actorId=null,who=''}={}){
  const known=isParty?Boolean(f?.discovery?.party):knows(f,actorId),member=isParty?isPartyMember(f):isMember(f,actorId);
  const viaParty=!isParty&&member&&isPartyMember(f);
  return {known,member,viaParty,
    knownChip:known?`Known to ${who}`:`Not shown to ${who}`,memberChip:member?`Recruited: ${who}`:'Not recruited',
    knownLabel:showLabel(known,who),recruitLabel:member?(viaParty?'Recruited with the party':`Remove ${who} from members…`):`Recruit ${who}`,
    recruitDisabled:viaParty};
}
