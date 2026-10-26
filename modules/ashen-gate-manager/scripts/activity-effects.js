/**
 * Activity -> effect links (0.71.0). Pure; no Foundry globals.
 *
 * A package cannot know the `_id` Foundry gives an ActiveEffect, but dnd5e links an activity to an Item's effect by that `_id`
 * (activity.effects = [{_id, level?}]; a `transfer: false` effect is only ever applied through such a link, from the activity's
 * "apply effect" button in chat). So a package activity says which effect it means by the effect's permanent `eff_id`:
 *
 *   system.activities.<activityId>.effects: [{ "eff_id": "EFF-PANACEA-RESIST" }]        (optional "level": {min, max})
 *
 * Manager never writes that raw form: it is held back from the Item data (and from the managed-field baseline and the Sync
 * comparison), and after the effects exist each entry is rewritten to dnd5e's real shape [{_id: "<live effect _id>"}] by
 * looking the effect up by flags.ashen-gate-manager.effect.effId on the same Item. Re-resolved every run, so a world whose
 * effects have random ids is fixed by the next import or sync. An eff_id with no effect on the Item is reported, never dropped.
 */
export const MODULE_ID = 'ashen-gate-manager';
const isObj = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const refOf = e => isObj(e) && typeof e.eff_id === 'string' ? e.eff_id : null;

/** [{key, effects}] for each activity of an Item's `system` whose `effects` mention an eff_id. */
export function activityEffectRefs(system) {
  const acts = system?.activities;
  if (!isObj(acts)) return [];
  const out = [];
  for (const [key, act] of Object.entries(acts)) {
    if (!isObj(act) || !Array.isArray(act.effects) || !act.effects.some(e => refOf(e))) continue;
    out.push({key, name: typeof act.name === 'string' ? act.name : key, effects: act.effects});
  }
  return out;
}
/** The `system` object without the raw eff_id links (the key is removed, so an existing live link is never compared or blanked). Other activities are untouched. */
export function withoutActivityEffectRefs(system) {
  const refs = activityEffectRefs(system);
  if (!refs.length) return system;
  const copy = structuredClone(system);
  for (const {key} of refs) delete copy.activities[key].effects;
  return copy;
}
const effIdOf = e => e?.flags?.[MODULE_ID]?.effect?.effId ?? null;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What to write so every activity of the record points at the live effects.
 * `liveEffects`: the Item's effects as plain data ({_id, flags}); `liveSystem`: the Item's current `system` (to skip what is already right).
 * Returns {updates: {'system.activities.<key>.effects': [...]}, unknown: [{activity, effId}], linked: n}.
 */
export function resolveActivityEffects(system, liveEffects = [], liveSystem = null) {
  const byEff = new Map();
  for (const e of liveEffects) { const id = effIdOf(e); if (id && e._id && !byEff.has(id)) byEff.set(id, e._id); }
  const updates = {}, unknown = [];
  let linked = 0;
  for (const {key, name, effects} of activityEffectRefs(system)) {
    const list = [];
    for (const e of effects) {
      const effId = refOf(e);
      if (effId === null) { if (isObj(e) && typeof e._id === 'string') list.push(e); continue; }   // an entry already in dnd5e's form is kept
      const _id = byEff.get(effId);
      if (!_id) { unknown.push({activity: name, effId}); continue; }
      const {eff_id, ...rest} = e;
      list.push({_id, ...rest});
      linked++;
    }
    const path = `system.activities.${key}.effects`;
    const current = liveSystem?.activities?.[key]?.effects;
    const norm = a => (Array.isArray(a) ? a : []).map(x => ({_id: x?._id, ...(x?.level ? {level: x.level} : {})}));
    if (unknown.length && list.length === 0 && Array.isArray(current) && current.length) continue; // do not blank a link we cannot re-make
    if (!same(norm(current), norm(list))) updates[path] = list;
  }
  return {updates, unknown, linked};
}
/** One plain sentence per record for the import report. */
export function unknownEffectWarning(name, unknown) {
  if (!unknown.length) return null;
  const list = unknown.slice(0, 4).map(u => `${u.activity}: ${u.effId}`).join('; ');
  return `${name}: ${unknown.length} activity effect link(s) point at an effect this Item does not have (${list}${unknown.length > 4 ? '; …' : ''}). They were not linked; add the effect to the record or fix the eff_id.`;
}

/**
 * True when an existing Item's activities do not yet point at its effects as the package says (a metadata-style refresh, no content change).
 * `raw` is the world Item as plain data ({system, effects}).
 */
export function activityLinksNeeded(record, raw) {
  const system = record?.foundry?.data?.system;
  if (!activityEffectRefs(system).length || !raw) return false;
  return Object.keys(resolveActivityEffects(system, raw.effects ?? [], raw.system ?? null).updates).length > 0;
}
/** Preview warnings for eff_ids that name no effect in the record itself. */
export function activityEffectWarnings(record) {
  const data = record?.foundry?.data;
  const have = new Set((Array.isArray(data?.effects) ? data.effects : []).map(e => e?.eff_id).filter(Boolean));
  const out = [];
  for (const {key, name, effects} of activityEffectRefs(data?.system))
    for (const e of effects) { const id = refOf(e); if (id && !have.has(id)) out.push(`${record.id}: activity ${name} links to effect ${id}, which is not in this record's effects.`); }
  return out;
}
