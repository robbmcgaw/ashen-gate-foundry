/** DEC-0067 source-package preflight. Canonical source is not an installable Foundry projection. */
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/;
const roles=new Set(['canonical_records','foundry_projection','documentation','asset','validator']);
export const SOURCE_SCHEMA='ag-source-package/0.1';
export function validateSourceManifest(m) {
  const errors=[];
  if(!obj(m)) return ['Source package manifest must be a JSON object.'];
  const keys=new Set(['schema_version','package_id','version','domain','content_set','visibility','files','source_commit','includes_campaign_state']);
  for(const key of Object.keys(m))if(!keys.has(key)) errors.push(`manifest.${key}: unsupported key.`);
  if(m.schema_version!==SOURCE_SCHEMA) errors.push('manifest.schema_version: only ag-source-package/0.1 is supported for preflight.');
  if(!/^AG-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(m.package_id??'')) errors.push('manifest.package_id: expected AG-... stable package ID.');
  if(!/^\d+\.\d+\.\d+$/.test(m.version??'')) errors.push('manifest.version: expected SemVer x.y.z.');
  for(const k of ['domain','content_set'])if(!/^[a-z][a-z0-9_-]*$/.test(m[k]??''))errors.push(`manifest.${k}: invalid identifier.`);
  if(!['gm','player','mixed'].includes(m.visibility)) errors.push('manifest.visibility: expected gm/player/mixed.');
  if(m.includes_campaign_state!==false) errors.push('manifest.includes_campaign_state must be false.');
  if(own(m,'source_commit') && m.source_commit!==null && typeof m.source_commit!=='string') errors.push('manifest.source_commit: string or null expected.');
  if(!Array.isArray(m.files)||!m.files.length) errors.push('manifest.files: nonempty array required.');
  else {
    const seen=new Set();
    for(const [i,f] of m.files.entries()){
      const label=`manifest.files[${i}]`;
      if(!obj(f)){errors.push(`${label}: object required.`);continue;}
      if(Object.keys(f).some(k=>!['path','role','schema_version'].includes(k)))errors.push(`${label}: unsupported key.`);
      if(typeof f.path!=='string'||!PATH.test(f.path))errors.push(`${label}.path: unsafe or unsupported relative path.`);
      if(!roles.has(f.role))errors.push(`${label}.role: unrecognized file role.`);
      if(typeof f.schema_version!=='string'||!f.schema_version.trim())errors.push(`${label}.schema_version required.`);
      if(seen.has(f.path))errors.push(`${label}.path: duplicate file entry.`);
      seen.add(f.path);
    }
  }
  return errors;
}
export function classifyDelivery(input) {
  if(!obj(input)) return null;
  const manifest=input.schema_version===SOURCE_SCHEMA ? input : input.manifest?.schema_version===SOURCE_SCHEMA ? input.manifest : null;
  if(manifest) {
    const errors=validateSourceManifest(manifest);
    const projection=Array.isArray(manifest.files) ? manifest.files.find(f=>f.role==='foundry_projection')?.path : null;
    return {kind:'source_package',errors,notice:errors.length
      ? `Source package manifest has ${errors.length} issue(s): ${errors.join(' | ')} No world changes made.`
      : `Valid canonical source manifest ${manifest.package_id} v${manifest.version}. This is not a Foundry import. ${projection ? `Extract the generated ${projection} (ag-foundry-import/0.2) and select that JSON.` : 'Ask the content author for an ag-foundry-import/0.2 projection.'} ZIP installation is not supported.`};
  }
  if(own(input,'guild_state')&&own(input,'headquarters_states'))return{kind:'domain_state',notice:'Guildhall and Headquarters campaign-state payloads must be imported by their owning module; Manager will not modify them.'};
  if(own(input,'campaign_key')&&own(input,'track_ref')&&own(input,'scopes'))return{kind:'domain_state',notice:'Factions/Renown campaign standing and claims belong to Factions; Manager will not import them.'};
  if(own(input,'location_ref')&&own(input,'base_world_revision')&&own(input,'world_revision'))return{kind:'domain_state',notice:'Location revision/sync payloads belong to the standalone Locations module; Manager will not import or publish them.'};
  return null;
}
/** Definition data is never a substitute for a domain owner's revision-aware world editor. */
export function domainHandoff(record) {
  if(record?.entity_type==='Location'||record?.entity_type==='Region'||String(record?.id??'').startsWith('LOC-'))
    return 'Location records are not Foundry documents Manager creates itself: its import passes them to the Locations module (enable it). Region records and existing Manager-bound records stay browseable; direct create/update is disabled.';
  return null;
}
