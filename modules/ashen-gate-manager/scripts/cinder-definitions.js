/**
 * Cinder, Power and Backfire-table definitions (0.39.0). Manager imports them as ordinary documents; their typed blocks
 * (cinder / power / backfire) belong to Skill Trees, so Manager asks Skill Trees' public validator (feature-detected).
 * Importing a definition never touches Cinder instances, bearers, progress or Strain: those are Skill Trees' live state.
 */
export const CINDER_ENTITY_TYPES = Object.freeze(['Mutation', 'Power', 'BackfireTable']);
const typedBlock = r => (r?.entity_type === 'Mutation' && r.cinder != null) || (r?.entity_type === 'Power' && r.power != null) || r?.entity_type === 'BackfireTable';

/** {errors, warnings} for the records with a typed block. Errors block the import, as other validation errors do. */
export function cinderDefinitionChecks(game, records) {
  const typed = (Array.isArray(records) ? records : []).filter(typedBlock);
  if (!typed.length) return {errors: [], warnings: []};
  const mod = game?.modules?.get?.('ashen-gate-skill-trees');
  const validate = mod?.active ? mod.api?.cinder?.validateDefinition : null;
  if (typeof validate !== 'function')
    return {errors: [], warnings: [`${typed.length} Cinder / Power / Backfire definition(s): Skill Trees 0.16.0+ is not active, so their cinder, power and backfire blocks were not checked. They import as documents; Push and Backfire need Skill Trees.`]};
  const errors = [], warnings = [];
  for (const r of typed) {
    try { const v = validate(r); errors.push(...(v?.errors ?? [])); warnings.push(...(v?.warnings ?? [])); }
    catch (error) { errors.push(`${r.id}: Skill Trees could not check this definition (${error?.message ?? error}).`); }
  }
  return {errors, warnings};
}
