/**
 * Specialist file hand-off. Manager recognises a specialist module's own file by its shape and passes it to that
 * module's public, GM-only import API (feature-detected, like location-handoff.js). The owning module keeps
 * ownership of its data; Manager only previews and forwards. Existing records are kept unless the module can update.
 */

const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const SPECIALISTS = Object.freeze({
  quests: {kind: 'Quest', label: 'Quest Log', moduleId: 'ashen-gate-quest-manager', preview: 'previewQuestImport', run: 'importQuests', canUpdate: true},
  'skill-trees': {kind: 'Skill Tree', label: 'Skill Trees', moduleId: 'ashen-gate-skill-trees', preview: 'previewTreeImport', run: 'importTrees', canUpdate: true},
  headquarters: {kind: 'Facility', label: 'Headquarters', moduleId: 'ashen-gate-headquarters', preview: 'previewFacilityImport', run: 'importFacilities', canUpdate: false},
  factions: {kind: 'Faction', label: 'Factions & Renown', moduleId: 'ashen-gate-factions', preview: 'previewFactionsImport', run: 'importFactions', canUpdate: false}
});

const QUEST_SCHEMAS = ['ag-quest-source/0.1', 'ag-source-records/0.1'];
const allType = (list, type) => list.length > 0 && list.every(r => r?.entity_type === type);

/** Which specialist module a file belongs to, judged by shape only; null when it is not one. */
export function detectSpecialistFile(input) {
  if (Array.isArray(input)) return allType(input, 'Facility') ? 'headquarters' : null;
  if (!isObj(input) || input.manifest !== undefined) return null;
  if (Array.isArray(input.trees) && /^ag-skill-trees\//.test(String(input.schema ?? ''))) return 'skill-trees';
  if (Array.isArray(input.definitions) && /^ag-factions-/.test(String(input.schema_version ?? ''))) return 'factions';
  if (QUEST_SCHEMAS.includes(input.schema_version) && Array.isArray(input.records) && allType(input.records, 'Objective')) return 'quests';
  if (Array.isArray(input.records) && allType(input.records, 'Facility') && input.schema_version === undefined) return 'headquarters';
  return null;
}

/** Number of records the file carries, for the preview header. */
export function specialistCount(kind, input) {
  const list = kind === 'skill-trees' ? input.trees : kind === 'factions' ? input.definitions : Array.isArray(input) ? input : input.records;
  return Array.isArray(list) ? list.length : 0;
}

/** The module's API when it is active and new enough to import; otherwise null. */
export function specialistApi(game, kind) {
  const spec = SPECIALISTS[kind];
  const mod = game?.modules?.get?.(spec.moduleId);
  const api = mod?.active ? mod.api : null;
  return api && typeof api[spec.preview] === 'function' && typeof api[spec.run] === 'function' ? api : null;
}

/** Plain description of what a rejected file looks like and where it should go. */
export function describeUnrecognized(input) {
  const fix = 'Manager imports its own package (a manifest plus records), or a Quest, Skill Tree, Headquarters facility or Factions file.';
  if (Array.isArray(input)) {
    const types = [...new Set(input.map(r => r?.entity_type ?? typeof r))].slice(0, 5).join(', ') || 'empty';
    return `This file is a list of ${input.length} item(s) (types: ${types}). ${fix} A list of Facility records belongs to Headquarters; this one is not.`;
  }
  if (!isObj(input)) return `This file's top level is ${input === null ? 'null' : typeof input}, not an object or list. ${fix}`;
  const keys = Object.keys(input).slice(0, 10).join(', ') || '(none)';
  const schema = input.schema_version ?? input.schema ?? input.manifest?.schema_version;
  const head = `This file has top-level keys: ${keys}${schema ? `; schema ${schema}` : ''}.`;
  if (Array.isArray(input.records)) {
    const types = [...new Set(input.records.map(r => r?.entity_type ?? typeof r))].slice(0, 5).join(', ') || 'none';
    const owner = types === 'Objective' ? ` Objective records belong to Quest Log, but its schema_version must be ${QUEST_SCHEMAS.join(' or ')}.`
      : types === 'Facility' ? ' Facility records belong to Headquarters, but a schema_version is not expected on that file.' : '';
    return `${head} It has ${input.records.length} record(s) of type ${types} but no manifest, so it is not a Manager package.${owner} ${fix}`;
  }
  if (Array.isArray(input.trees)) return `${head} trees[] belongs to Skill Trees, whose schema must start with ag-skill-trees/. ${fix}`;
  if (Array.isArray(input.definitions)) return `${head} definitions[] belongs to Factions, whose schema_version must start with ag-factions-. ${fix}`;
  return `${head} ${fix}`;
}

/** Preview rows (Manager import-table shape) for a specialist file. */
export function planSpecialist(kind, input, api, {updateExisting = false} = {}) {
  const spec = SPECIALISTS[kind];
  if (!api) return {errors: [], rows: [{id: spec.moduleId, name: spec.label, kind: spec.kind, lifecycle: '', action: 'skipped',
    reason: `${spec.label} is not active (or too old to import): enable or update it to import this file.`, patch: {}}]};
  const result = api[spec.preview](input, spec.canUpdate ? {mode: updateExisting ? 'update' : 'skip'} : undefined);
  const rows = result.rows.map(r => {
    const action = r.action === 'new' ? 'create' : r.action === 'update' ? 'update' : 'skipped';
    return {id: r.id, name: r.name, kind: spec.kind, lifecycle: '', action, patch: {},
      reason: action === 'create' ? `New; imported through ${spec.label}.` : r.reason};
  });
  return {errors: result.errors ?? [], rows};
}

/** The part of the file that covers only the chosen record ids. */
export function filterSpecialist(kind, input, ids) {
  const keep = new Set(ids);
  const pick = list => list.filter(r => keep.has(r?.id));
  if (kind === 'skill-trees') return {...input, trees: pick(input.trees)};
  if (kind === 'factions') return {...input, definitions: pick(input.definitions),
    ...(Array.isArray(input.starting_state) ? {starting_state: input.starting_state.filter(s => keep.has(s?.faction_id))} : {})};
  if (Array.isArray(input)) return pick(input);
  return {...input, records: pick(input.records)};
}

/** Sends the chosen records to the owning module in one call and turns its report into import-log results. */
export async function applySpecialist(kind, input, api, {ids, updateExisting = false} = {}) {
  const spec = SPECIALISTS[kind];
  const chosen = ids ? [...ids] : [];
  const fail = (list, message) => list.map(id => ({id, kind: spec.kind, action: 'create', status: 'error', message}));
  if (!api) return chosen.map(id => ({id, kind: spec.kind, status: 'skipped', message: `${spec.label} is not active: enable it.`}));
  if (!chosen.length) return [];
  let report;
  try { report = await api[spec.run](filterSpecialist(kind, input, chosen), spec.canUpdate ? {mode: updateExisting ? 'update' : 'skip'} : undefined); }
  catch (error) { return fail(chosen, String(error?.message ?? error)); }
  const idOf = x => typeof x === 'string' ? x : x.id;
  const created = report.created ?? report.added ?? [];
  const results = [
    ...created.map(x => ({id: idOf(x), kind: spec.kind, action: 'create', status: 'ok'})),
    ...(report.updated ?? []).map(x => ({id: idOf(x), kind: spec.kind, action: 'update', status: 'ok'})),
    ...(report.skipped ?? []).map(s => ({id: s.id, kind: spec.kind, status: 'skipped', message: s.reason})),
    ...(report.failed ?? []).map(s => ({id: s.id, kind: spec.kind, action: 'create', status: 'error', message: s.reason}))
  ];
  for (const note of report.notes ?? []) results.push({id: spec.moduleId, kind: spec.kind, status: 'note', message: note});
  for (const warning of report.warnings ?? []) results.push({id: spec.moduleId, kind: spec.kind, status: 'warning', message: warning});
  if (report.missingActors?.length) results.push({id: spec.moduleId, kind: spec.kind, status: 'skipped',
    message: `No character named: ${report.missingActors.join(', ')}. Import the Manager package first; their personal Renown was skipped.`});
  return results;
}
