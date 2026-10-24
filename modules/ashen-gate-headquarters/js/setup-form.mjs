// GM Setup: one Save Changes for Player Access, Guildhall/canvas settings and the rank table (D4). No Foundry globals.
export const SETUP_FORM='setup';
const RANKS=[1,2,3,4,5];
const num=v=>Number(v);
/** The save_config payload read from the setup form (same shape the old config form sent). */
export function configPayload(data){
 return {name:data.get('name'),width:num(data.get('width')),height:num(data.get('height')),background:data.get('background'),background_fit:data.get('background_fit'),
  background_x:num(data.get('background_x')),background_y:num(data.get('background_y')),background_opacity:num(data.get('background_opacity'))};
}
/** The set_rank_table rules read from the setup form (same shape the old ranks form sent). */
export function rankRulesPayload(data){
 return RANKS.map(rank=>({shared_facility_slots:num(data.get(`slots_${rank}`)),orders_per_downtime:num(data.get(`orders_${rank}`)),
  unlock_refs:(typeof data.getAll==='function'?data.getAll(`unlock_${rank}`):[data.get(`unlock_${rank}`)]).map(v=>String(v||'')).join(',').split(',').map(x=>x.trim()).filter(Boolean)}));
}
const sameConfig=(c,p)=>String(p.name??'')===String(c.name??'')&&p.width===c.bounds?.width&&p.height===c.bounds?.height
 &&String(p.background??'')===String(c.background??'')&&String(p.background_fit??'')===String(c.background_fit||'contain')
 &&p.background_x===(c.background_x??50)&&p.background_y===(c.background_y??50)&&p.background_opacity===(c.background_opacity??100);
const sameRules=(rules,next)=>next.every((r,i)=>{const o=rules?.[i];return o&&r.shared_facility_slots===o.shared_facility_slots&&r.orders_per_downtime===o.orders_per_downtime
 &&r.unlock_refs.join(',')===(o.unlock_refs??[]).join(',');});
/**
 * What Save Changes must write: {access?, config?, rules?}. Only the parts that differ from the saved
 * state are included, so an unchanged section never adds a write. `data` is anything with get(name).
 */
export function setupChanges(state,accessEnabled,data){
 const out={};
 const access=data.get('player_access_enabled')==='on';
 if(access!==Boolean(accessEnabled))out.access=access;
 const config=configPayload(data);
 if(!sameConfig(state.config,config))out.config=config;
 const rules=rankRulesPayload(data);
 if(!sameRules(state.config.rank_rules,rules))out.rules=rules;
 return out;
}
