// Based on approved shared_contract.schema.json. Only validates the common envelope;
// use canonical system-specific JSON Schema for domain fields and migrations.
const ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const STATUS = new Set(['proposed','draft','approved','superseded','retired']);
const VISIBILITY = new Set(['player','gm','reveal_gated']);
const SCOPE = new Set(['generic_rules','setting_adapter','campaign_state','publication']);
export const TEMPORARY_CONTRACT = 'ag-definition-resolver/0.1-prototype';
export const CANONICAL_FIELDS = Object.freeze(['id','entity_type','status','version','provenance','visibility','refs']);
export function validateEnvelope(record, {allowState = false} = {}) {
  const problems = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['record_must_be_object'];
  if (typeof record.id !== 'string' || !ID.test(record.id)) problems.push('invalid_id');
  if (typeof record.entity_type !== 'string' || !record.entity_type.trim()) problems.push('invalid_entity_type');
  if (!STATUS.has(record.status)) problems.push('invalid_status');
  if (typeof record.version !== 'string' || !record.version.trim()) problems.push('invalid_version');
  if (!record.provenance || !Array.isArray(record.provenance.sources) ||
      !record.provenance.sources.every(x => typeof x === 'string')) problems.push('invalid_provenance');
  if (!VISIBILITY.has(record.visibility)) problems.push('invalid_visibility');
  if (record.scope !== undefined && !SCOPE.has(record.scope)) problems.push('invalid_scope');
  if (!allowState && record.scope === 'campaign_state') problems.push('campaign_state_not_definition');
  if (!Array.isArray(record.refs)) problems.push('invalid_refs');
  else for (let i=0;i<record.refs.length;i++) {
    const r=record.refs[i];
    if (!r || typeof r !== 'object' || Array.isArray(r) ||
        Object.keys(r).sort().join(',') !== 'mode,relation,target_id' ||
        typeof r.relation !== 'string' || !r.relation.trim() ||
        typeof r.target_id !== 'string' || !ID.test(r.target_id) ||
        !['required','optional'].includes(r.mode)) problems.push(`invalid_ref_${i}`);
  }
  return problems;
}
