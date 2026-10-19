/** DEC-0072 / ag-player-access/1 — Manager reads capability, never owns access state. */
export const ACCESS_CONTRACT = 'ag-player-access/1';
export const EXPECTED_ACCESS_MODULES = Object.freeze([
  {id:'ashen-gate-profession-ledger',title:'Profession Ledger'},
  {id:'ashen-gate-skill-trees',title:'Skill Trees'},
  {id:'ashen-gate-factions',title:'Factions & Renown'},
  {id:'ashen-gate-locations',title:'Locations'}
]);
function isAshenModule(mod) {
  const id=String(mod?.id??'').toLowerCase();
  return id.startsWith('ashen-gate-') || id.startsWith('ag-') || /^ashen gate[\s:—–-]/i.test(mod?.title??'');
}
export function isGmOnlyModule(mod) {
  // GM-only editors cannot be revealed even if another code path returns a bad audience.
  const id=String(mod?.id??'').toLowerCase();
  const title=String(mod?.title??'').toLowerCase();
  // Locations itself is player-capable (Actors-sidebar launcher and viewer behind its own Player Access setting);
  // only the Manager and a separate Location Builder editor are GM-only.
  return id==='ashen-gate-manager' || /(?:^|[-_])location-builder(?:[-_]|$)/.test(id)
    || /(?:general manager|location builder|locations editor)/.test(title);
}
export function enumerateAccessModules(modules,expected=EXPECTED_ACCESS_MODULES) {
  const found=new Map([...modules].filter(isAshenModule).map(mod=>[mod.id,mod]));
  for(const entry of expected) if(!found.has(entry.id))found.set(entry.id,{id:entry.id,title:entry.title,missing:true});
  return [...found.values()].sort((a,b)=>String(a.title??a.id).localeCompare(String(b.title??b.id)));
}
/** No secret data are copied from provider responses. Failed/invalid capability is Unsupported. */
export async function inspectPlayerModule(mod) {
  const base={id:String(mod?.id??''),title:String(mod?.title??mod?.id??'Unknown'),version:mod?.version??'—',
    installed:!mod?.missing,active:Boolean(mod?.active),audience:'—',state:'Unsupported',
    status:'Unsupported',playerAccessEnabled:null,canToggle:false,reason:'No compatible Player Access API exposed.'};
  if(mod?.missing) return {...base,status:'Not installed',state:'Not installed',reason:'Not installed in this world.'};
  if(!mod?.active) return {...base,status:'Installed but Disabled',state:'Unavailable',reason:'Module is disabled. Enable it in Foundry Module Management first.'};
  const installed={...base,status:'Installed & Enabled'};
  if(isGmOnlyModule(mod))return {...installed,audience:'GM only',state:'GM only',playerAccessEnabled:false,
    reason:'This editor is GM-only and has no player interface toggle.'};
  const access=mod.api?.playerAccess;
  if(access?.contract!==ACCESS_CONTRACT || typeof access.getState!=='function') return {...installed,reason:'This version does not publish ag-player-access/1.'};
  try {
    const state=await access.getState();
    if(state?.contract!==ACCESS_CONTRACT || state.moduleId!==mod.id ||
       !['player','gm-only'].includes(state.audience) || typeof state.playerAccessEnabled!=='boolean' ||
       typeof state.configurable!=='boolean') throw new Error('Invalid or mismatched capability response.');
    if(state.audience==='gm-only') return {...installed,audience:'GM only',state:'GM only',playerAccessEnabled:false,
      reason:'Only the module owner can create a separate player-facing interface.'};
    const validWritable=!state.configurable || typeof access.setEnabled==='function';
    const supported=state.configurable && validWritable;
    return {...installed,audience:'Player',playerAccessEnabled:state.playerAccessEnabled,
      state:validWritable ? (state.playerAccessEnabled?'Visible':'Hidden') : 'Unsupported',
      canToggle:supported,reason:supported?'Controlled by the specialist module’s own world setting.':
        !state.configurable?'Module reports read-only Player Access; no GM toggle available.':
        'Module is missing its required setEnabled method.'};
  } catch(error) {return {...installed,reason:`Capability check failed: ${error?.message??String(error)}`};}
}
export async function collectPlayerAccess(modules,expected=EXPECTED_ACCESS_MODULES) {
  return Promise.all(enumerateAccessModules(modules,expected).map(inspectPlayerModule));
}
/** Recheck eligibility *at click time* and verify persisted state afterward. No direct settings writes. */
export async function changePlayerAccess(module,enabled,{isGM=false}={}) {
  if(!isGM)throw new Error('Only GMs can configure Player Access.');
  if(typeof enabled!=='boolean')throw new TypeError('Player Access value must be Boolean.');
  const current=await inspectPlayerModule(module);
  if(!current.canToggle)throw new Error(`${current.title}: ${current.reason}`);
  if(current.playerAccessEnabled===enabled)return {...current,changed:false};
  await module.api.playerAccess.setEnabled(enabled);
  const updated=await inspectPlayerModule(module);
  if(!updated.canToggle || updated.playerAccessEnabled!==enabled)throw new Error(`${current.title}: provider did not confirm saved Player Access state.`);
  return {...updated,changed:true};
}
/** Sequential and honest: unsupported/disabled skipped, partial successes reported. */
export async function hideAllPlayerInterfaces(modules,{isGM=false}={}) {
  if(!isGM)throw new Error('Only GMs can configure Player Access.');
  const rows=await collectPlayerAccess(modules);
  const report={changed:[],alreadyHidden:[],skipped:[],failed:[]};
  for(const row of rows) {
    if(!row.canToggle){report.skipped.push({id:row.id,title:row.title,reason:row.state});continue;}
    if(!row.playerAccessEnabled){report.alreadyHidden.push({id:row.id,title:row.title});continue;}
    const module=[...modules].find(m=>m.id===row.id);
    try {await changePlayerAccess(module,false,{isGM});report.changed.push({id:row.id,title:row.title});}
    catch(error){report.failed.push({id:row.id,title:row.title,error:error?.message??String(error)});}
  }
  return report;
}
