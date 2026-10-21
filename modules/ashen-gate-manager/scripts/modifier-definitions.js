/**
 * Record-level modifiers and implementation (0.40.0). Format: docs/modifiers-schema.md.
 * Manager checks the shared ag-modifier/1 shape; each entry's target, value range, applies and requires belong to the
 * module that owns its scope, so Manager hands them to that module's public api.modifiers.validate (feature-detected).
 * Nothing here applies a modifier: the owning module reads the imported definition at play time.
 */
export const MODIFIERS_SCHEMA = 'ag-modifiers/0.1';
export const MODIFIER_CONTRACT = 'ag-modifier/1';
export const MAX_MODIFIERS = 20;
/** Scopes that may appear in a record-level modifiers block, and the module that interprets each (decision 3: cinder only). */
export const MODIFIER_SCOPES = Object.freeze({
  cinder: Object.freeze({moduleId: 'ashen-gate-cinders', title: 'Ashen Gate | Cinders', aliases: Object.freeze(['powers', 'modes'])})
});
/** Optional, display-only. HPERK-* keeps Headquarters' own required field (which also allows hybrid). */
export const IMPLEMENTATIONS = Object.freeze(['automatic', 'informational', 'gm_resolved']);
const MODIFIER_PREFIX = /^(ITEM|PERK)-/;
const ENTRY_KEYS = ['target', 'value', 'label', 'scope', 'op', 'applies', 'stack', 'requires'];
const TARGET = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const KEY = /^[a-z][a-z0-9_-]{0,40}$/;
const REF = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const scopeList = Object.keys(MODIFIER_SCOPES).join(', ');

function entryProblems(m, blockScope, at) {
  if (!plain(m)) return [`${at} must be an object.`];
  const errors = [];
  const scope = m.scope ?? blockScope;
  const owner = MODIFIER_SCOPES[scope];
  if (scope == null) errors.push(`${at}: scope is required (on the entry or on the modifiers block): one of ${scopeList}.`);
  else if (!owner) errors.push(`${at}: scope "${scope}" is not one Manager knows (${scopeList}).`);
  const allowed = [...ENTRY_KEYS, ...(owner?.aliases ?? [])];
  const extra = Object.keys(m).filter(k => !allowed.includes(k));
  if (extra.length) errors.push(`${at}: unknown field(s) ${extra.join(', ')}.`);
  if (typeof m.target !== 'string' || m.target.length > 60 || !TARGET.test(m.target)) errors.push(`${at}: target must be a dotted lower-case key from the scope's list (e.g. push.cost).`);
  if (!Number.isSafeInteger(m.value) || m.value === 0) errors.push(`${at}: value must be a whole number, not 0.`);
  if (!text(m.label, 80)) errors.push(`${at}: label (1–80 characters) is required, it is shown to players.`);
  if (m.op !== undefined && m.op !== 'add') errors.push(`${at}: op must be "add" (the only operation).`);
  if (m.stack !== undefined && !KEY.test(String(m.stack))) errors.push(`${at}: stack must be a short lower-case name.`);
  if (m.applies !== undefined && !plain(m.applies)) errors.push(`${at}: applies must be an object (keys defined by the scope).`);
  if (m.requires !== undefined) {
    if (!plain(m.requires)) errors.push(`${at}: requires must be an object of id lists, e.g. {"powers": ["POWER-…"]}.`);
    else for (const [k, v] of Object.entries(m.requires))
      if (!KEY.test(k) || !Array.isArray(v) || v.some(x => !REF.test(String(x)))) errors.push(`${at}: requires.${k} must list canonical ids.`);
  }
  return errors;
}

/** Shape errors for a record's modifiers block and implementation field. label: how messages name the record. */
export function modifierRecordProblems(record, label = record?.id ?? 'record') {
  if (!plain(record)) return [];
  const errors = [];
  const isHireling = record.entity_type === 'HirelingPerk' || String(record.id ?? '').startsWith('HPERK-');
  if (record.implementation !== undefined && !isHireling && !IMPLEMENTATIONS.includes(record.implementation))
    errors.push(`${label}.implementation must be one of ${IMPLEMENTATIONS.join(', ')} (display only).`);
  const block = record.modifiers;
  if (block === undefined) return errors;
  if (!MODIFIER_PREFIX.test(String(record.id ?? ''))) {
    errors.push(`${label}.modifiers: a modifiers block is read only on ITEM-* and PERK-* records (a POWER-* record uses power.modifiers).`);
    return errors;
  }
  if (!plain(block)) return [...errors, `${label}.modifiers must be an object {schema, scope?, list}.`];
  const extra = Object.keys(block).filter(k => !['schema', 'scope', 'list'].includes(k));
  if (extra.length) errors.push(`${label}.modifiers: unknown field(s) ${extra.join(', ')}.`);
  if (block.schema !== MODIFIERS_SCHEMA) errors.push(`${label}.modifiers.schema must be "${MODIFIERS_SCHEMA}".`);
  if (block.scope !== undefined && !MODIFIER_SCOPES[block.scope]) errors.push(`${label}.modifiers.scope "${block.scope}" is not one Manager knows (${scopeList}).`);
  if (!Array.isArray(block.list) || !block.list.length || block.list.length > MAX_MODIFIERS)
    errors.push(`${label}.modifiers.list must hold 1 to ${MAX_MODIFIERS} modifiers.`);
  else block.list.forEach((m, i) => errors.push(...entryProblems(m, block.scope, `${label}.modifiers.list[${i}]`)));
  return errors;
}

/** Well-formed entries of a record's block, each with its scope worked out: [{index, scope, modifier}]. */
export function resolvedModifiers(record) {
  const block = record?.modifiers;
  if (!plain(block) || !Array.isArray(block.list) || !MODIFIER_PREFIX.test(String(record.id ?? ''))) return [];
  return block.list.flatMap((m, index) => {
    const scope = plain(m) ? (m.scope ?? block.scope) : null;
    return MODIFIER_SCOPES[scope] ? [{index, scope, modifier: {...m, scope}}] : [];
  });
}

/**
 * {errors, warnings}: each scope's entries go to its owner's api.modifiers.validate(entries, {recordId, record}),
 * which returns {errors, warnings}. Owner errors block the import; a missing or older owner is a warning, never a block.
 */
export function modifierDefinitionChecks(game, records) {
  const errors = [], warnings = [];
  const byScope = new Map();
  for (const r of Array.isArray(records) ? records : []) for (const e of resolvedModifiers(r)) {
    const perRecord = byScope.get(e.scope) ?? new Map();
    perRecord.set(r, [...(perRecord.get(r) ?? []), e]);
    byScope.set(e.scope, perRecord);
  }
  for (const [scope, perRecord] of byScope) {
    const owner = MODIFIER_SCOPES[scope];
    const mod = game?.modules?.get?.(owner.moduleId);
    const validate = mod?.active ? mod.api?.modifiers?.validate : null;
    if (typeof validate !== 'function') {
      const n = [...perRecord.values()].reduce((s, l) => s + l.length, 0);
      warnings.push(`${n} "${scope}" modifier(s) on ${perRecord.size} record(s): ${owner.title} is not active or does not check modifiers yet, so their targets and values were not checked. They import; only ${owner.title} applies them.`);
      continue;
    }
    for (const [record, entries] of perRecord) {
      try { const v = validate(entries, {recordId: record.id, record}); errors.push(...(v?.errors ?? [])); warnings.push(...(v?.warnings ?? [])); }
      catch (error) { errors.push(`${record.id}: ${owner.title} could not check its modifiers (${error?.message ?? error}).`); }
    }
  }
  return {errors, warnings};
}
