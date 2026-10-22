/**
 * Profession and Recipe record shapes (0.48.0, Profession Ledger 0.28.0). Pure, no Foundry globals.
 *
 * Manager imports these records like any other: the definition is stored whole in the source flag, so new fields
 * (`kind`, `access`, `category`) round-trip. This file only reads them for the preview and Browse labels.
 *  - Profession: `profession_kind` crafting | gathering | creative, or `category: "creative"`.
 *  - Recipe: `kind` craft (default) | activity. An activity has no ingredients and no result item; it still imports
 *    as its recipe Item (the learnable item). For an activity `required_tools` are alternatives (any one).
 *  - "Any musical instrument" (also "Musical instrument", "music") is a tool group. Manager does not check tool names
 *    (the Ledger resolves them), so a group passes import like any other text.
 */
export const PROFESSION_CATEGORIES = Object.freeze(['crafting', 'gathering', 'creative']);
export const RECIPE_KINDS = Object.freeze(['craft', 'activity']);
const CATEGORY_LABELS = Object.freeze({crafting: 'Crafting', gathering: 'Gathering', creative: 'Creative'});
const EFFORT_LABELS = Object.freeze({short: 'Short', long: 'Long', extended: 'Extended'});
const lower = value => String(value ?? '').trim().toLowerCase();
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : '';

/** The profession category a record declares, or null. Same reading as the Ledger: `category` counts only for "creative". */
export function professionCategory(record) {
  const kind = lower(record?.profession_kind);
  if (PROFESSION_CATEGORIES.includes(kind)) return kind;
  return lower(record?.category) === 'creative' ? 'creative' : null;
}
export const isProfessionRecord = record => record?.entity_type === 'Profession' || /^PROF-/.test(String(record?.id ?? ''));
export const isRecipeRecord = record => record?.entity_type === 'Recipe' || /^REC-/.test(String(record?.id ?? ''));
/** 'activity' or 'craft' for a Recipe record; null for anything else. */
export function recipeKind(record) {
  if (!isRecipeRecord(record)) return null;
  return lower(record?.kind) === 'activity' ? 'activity' : 'craft';
}
export const isActivityRecipe = record => recipeKind(record) === 'activity';

const tierLabel = tier => tier === null || tier === undefined || tier === '' ? null
  : /^\d+$/.test(String(tier)) ? `Tier ${tier}` : capital(String(tier).replace(/[-_]+/g, ' '));
const effortLabel = effort => EFFORT_LABELS[lower(effort)] ?? (effort ? capital(String(effort)) : null);

/**
 * Plain facts for a Profession or Recipe record (Manager's source definition), or null for other records.
 * {label: 'Activity' | 'Craft' | 'Creative' | ..., fields: [[label, value]], summary: 'Activity · Short effort · Apprentice'}
 */
export function professionFacts(record) {
  if (isRecipeRecord(record)) {
    const activity = isActivityRecipe(record);
    const label = activity ? 'Activity' : 'Craft';
    const effort = effortLabel(record.effort), tier = tierLabel(record.tier);
    const tools = Array.isArray(record.required_tools) ? record.required_tools.filter(t => typeof t === 'string' && t.trim()) : [];
    const fields = [['Recipe kind', label], ['Effort', effort], ['Tier', tier],
      ['Tools', tools.length ? tools.join(activity ? ' or ' : ', ') : null]].filter(([, v]) => v);
    return {label, fields, summary: [label, effort ? `${effort} effort` : null, tier].filter(Boolean).join(' · ')};
  }
  if (isProfessionRecord(record)) {
    const category = professionCategory(record);
    if (!category) return null;
    const label = CATEGORY_LABELS[category];
    return {label, fields: [['Profession category', label]], summary: label};
  }
  return null;
}
