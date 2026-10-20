/**
 * Player-safe read of the Guildhall for one character (0.9.0), for partner modules such as Character Hub.
 * Always built from the public projection (projectPublicState), for players and the GM alike, so it can
 * never carry personnel, staffing occupants or other GM-only state. Read-only.
 */
import {site,stageFor,facilities} from './logic.mjs';
import {projectPublicState} from './private-state.mjs';
import {requireInterfaceAccess} from './access.mjs';

const userList=users=>users?.contents??Array.from(users?.values?.()??users??[]);

/** Throws unless `user` may read `actor`'s view: the GM, or the Actor's owner while Headquarters Player Access is on. */
export function requirePlayerViewAccess(actor,user,accessEnabled){
 if(!actor)throw Error('No Actor given');
 requireInterfaceAccess(user,accessEnabled);
 if(!user?.isGM&&actor.testUserPermission?.(user,'OWNER')!==true)throw Error('Actor access denied');
}

/**
 * {active, guildhall:{name,rank}|null, facilities:[{key,facilityId,name,category,stage,room,roomOwner,benefits}], hirelings:[], hirelingsPublished:false}
 * Facilities: installed in the shared Guildhall, plus those in personal rooms of the (non-GM) users who own the Actor.
 * Hirelings are guild personnel kept private by the GM; Headquarters does not publish them to players, so the list is always empty.
 */
export function buildPlayerView(state,actor,users){
 const s=projectPublicState(state);
 const empty={active:false,guildhall:null,facilities:[],hirelings:[],hirelingsPublished:false};
 const st=s.active?site(s):null;
 if(!st)return empty;
 const owners=new Map(userList(users).filter(u=>!u.isGM&&actor.testUserPermission?.(u,'OWNER')===true).map(u=>[u.id,u.name??u.id]));
 const rooms=new Map(st.rooms.filter(r=>r.kind==='shared'||owners.has(r.owner_user_id)).map(r=>[r.key,r]));
 const defs=facilities(s),copies=new Map((s.inventory??[]).map(c=>[c.key,c]));
 const rows=st.installations.filter(ins=>rooms.has(ins.room_key)).flatMap(ins=>{
  const copy=copies.get(ins.key);if(!copy||!defs.has(copy.facility_ref))return [];
  const {def,stage}=stageFor(s,copy),room=rooms.get(ins.room_key);
  return [{key:ins.key,facilityId:def.id,name:def.name,category:def.category??null,stage:stage.label||stage.key,
   room:room.kind==='shared'?'shared':'personal',roomOwner:room.kind==='shared'?null:owners.get(room.owner_user_id),
   benefits:(stage.benefits??[]).map(b=>({name:b.name,description:b.description??'',recipient:b.recipient}))}];
 }).sort((a,b)=>a.room.localeCompare(b.room)||a.name.localeCompare(b.name));
 return {active:true,guildhall:{name:s.config?.name??'Guildhall',rank:s.core?.guild_state?.rank??null},facilities:rows,hirelings:[],hirelingsPublished:false};
}
