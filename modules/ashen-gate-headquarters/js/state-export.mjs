/** Headquarters backup export (0.16.0). Pure JS, no Foundry runtime: main.mjs hands it the GM's private campaign state.
 * `ag-headquarters-state-export/0.1` is campaign PLAY STATE (guild rank and unlocks, rooms, installed facilities, staffing, personal layouts,
 * the Hireling roster with the GM's notes) plus the GM's layout settings. It is not a definition format and not the `aghq-state/0.1` save, so
 * General Manager's importers never read a backup file as content. No timestamps of its own. Facility definitions are not copied (the
 * content pack holds them): `facilities` lists only each catalog entry's id, name, category, status and version. The editing lease and
 * the processed player-request nonces are session plumbing and are left out. */
export const STATE_EXPORT_SCHEMA='ag-headquarters-state-export/0.1';
const byText=(a,b)=>String(a??'').localeCompare(String(b??''));
const clone=x=>x===undefined?undefined:structuredClone(x);
const sortedStrings=list=>[...new Set((Array.isArray(list)?list:[]).filter(x=>typeof x==='string'))].sort(byText);
const sortedBy=(list,key)=>(Array.isArray(list)?list:[]).map(clone).sort((a,b)=>byText(a?.[key],b?.[key]));
/**
 * @param {object} args
 * @param {boolean} args.isGM  refused unless true (the API checks too; this is the service-level guard)
 * @param {object|null} args.state  the GM's complete private state (aghq-state/0.1), as the module's own reader returns it
 * @param {Object<string,string>} args.userNames  user id -> user name, so a personal room shows who owns it
 */
export function buildStateExport({isGM,state=null,userNames={}}){
  if(isGM!==true)throw Error('GM authorization required.');
  const s=state&&typeof state==='object'?state:{};
  const core=s.core&&typeof s.core==='object'?s.core:null;
  const guild=core?.guild_state?{...clone(core.guild_state),unlocked_facility_refs:sortedStrings(core.guild_state.unlocked_facility_refs)}:null;
  const cfg=s.config&&typeof s.config==='object'?clone(s.config):null;
  if(cfg){cfg.manual_unlock_refs=sortedStrings(cfg.manual_unlock_refs);cfg.decoration_art=sortedStrings(cfg.decoration_art);}
  return {
    schema_version:STATE_EXPORT_SCHEMA,
    format:s.format??null,
    active:s.active===true,
    state_revision:Number.isSafeInteger(s.state_revision)?s.state_revision:0,
    guild,
    config:cfg,
    headquarters:(Array.isArray(core?.headquarters_states)?core.headquarters_states:[]).map(h=>({
      ...clone(h),
      rooms:sortedBy(h.rooms,'key').map(r=>({...r,owner_user_name:r.owner_user_id?userNames[r.owner_user_id]??null:null})),
      installations:sortedBy(h.installations,'key'),
      staffing_slots:sortedBy(h.staffing_slots,'key')
    })).sort((a,b)=>byText(a.hq_ref,b.hq_ref)),
    inventory:sortedBy(s.inventory,'key'),
    personal_layouts:Object.entries(s.personal_layouts&&typeof s.personal_layouts==='object'?s.personal_layouts:{}).map(([room_key,layout])=>({
      room_key,...clone(layout),decorations:sortedBy(layout?.decorations,'key')})).sort((a,b)=>byText(a.room_key,b.room_key)),
    facilities:(Array.isArray(s.catalog)?s.catalog:[]).map(f=>({id:f.id,name:f.name??null,category:f.category??null,status:f.status??null,version:f.version??null}))
      .sort((a,b)=>byText(a.id,b.id)),
    hirelings:sortedBy(s.personnel?.hirelings,'hireling_ref')
  };
}
