/**
 * Profession and Recipe record shapes (0.48.0, Profession Ledger 0.28.0). Pure, no Foundry globals.
 *
 * Manager imports these records like any other: the definition is stored whole in the source flag, so new fields
 * (`kind`, `access`, `category`) round-trip. This file only reads them for the preview and Browse labels.
 *  - Profession: `profession_kind` crafting | gathering | creative, or `category: "creative"`.
 *  - Recipe: `kind` craft (default) | activity. An activity has no ingredients and no result item; it still imports
 *    as its recipe Item (the learnable item). For an activity `required_tools` are alternatives (any one).
 *  - 0.49.0 (Ledger 0.29.0), optional and display only: an activity's `effect_note` (or `effectNote`; up to 400 characters,
 *    a boon the GM decides) and a profession's `recipeLabel` / `recipeLabelPlural` (1–30 characters; its word for a recipe).
 *  - 0.73.0 (Ledger 0.38.0), display only: `gm_applied: true` on an activity (a GM-applied enchantment: the player brings an item named by
 *    `bring.text`, the GM adds the effect by hand, nothing is made) shows a "GM-applied" chip and a Bring line. The fields round-trip in the
 *    stored definition like every other; no validation is added here (the schema and the supplement's normalizer check them).
 *  - 0.70.8 (supplement recipes carry `required_tools` XOR `workstation`): a recipe shows ONE requirement row. A `workstation` shows
 *    "Workstation: <name>" and never the tools; tools show "Tools: A or B" (any-of, for crafts and activities alike); a recipe with
 *    neither shows "Tools: Profession default" (the Ledger's configured tool). Both present is a content defect: the station wins.
 *  - "Any musical instrument" (also "Musical instrument", "music") is a tool group. Manager does not check tool names
 *    (the Ledger resolves them), so a group passes import like any other text.
 */
import {goldFlavorText} from './recipe-definitions.js';
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
/** 0.73.0: `gm_applied: true` counts only on an activity Recipe (same reading as the Ledger). */
export const gmApplied = record => isActivityRecipe(record) && record?.gm_applied === true;
/** The player-facing "bring" text of a GM-applied enchantment: whitespace collapsed, 1 to 80 characters, else null. */
export function bringText(record) {
  const value = record?.bring?.text;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= 80 ? text : null;
}

const tierLabel = tier => tier === null || tier === undefined || tier === '' ? null
  : /^\d+$/.test(String(tier)) ? `Tier ${tier}` : capital(String(tier).replace(/[-_]+/g, ' '));
const effortLabel = effort => EFFORT_LABELS[lower(effort)] ?? (effort ? capital(String(effort)) : null);

/** Same rules as the Ledger's effectNoteOf and cleanRecipeLabel (copied: modules stay independent). */
export const EFFECT_NOTE_MAX = 400;
export const RECIPE_LABEL_MAX = 30;
/** An activity's effect note: whitespace collapsed, cut to 400 characters with "…"; null when missing or not text. */
export function effectNoteOf(record) {
  const value = record?.effect_note ?? record?.effectNote;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > EFFECT_NOTE_MAX ? `${text.slice(0, EFFECT_NOTE_MAX - 1).trimEnd()}…` : text;
}
/** A recipe label as shown: whitespace collapsed, 1–30 characters, else null (ignored). */
export function cleanRecipeLabel(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length >= 1 && text.length <= RECIPE_LABEL_MAX ? text : null;
}
/** "Formula / Formulas" (or just the one that is set) for a Profession record, or null. */
export function recipeLabelText(record) {
  const labels = [cleanRecipeLabel(record?.recipeLabel), cleanRecipeLabel(record?.recipeLabelPlural)].filter(Boolean);
  return labels.length ? labels.join(' / ') : null;
}

/**
 * Plain facts for a Profession or Recipe record (Manager's source definition), or null for other records.
 * {label: 'Activity' | 'Craft' | 'Creative' | ... | null, fields: [[label, value]], summary: 'Activity · Short effort · Apprentice',
 *  chips: [...], searchText: [...]}
 */
/** The one requirement row of a Recipe record: ['Workstation', name] or ['Tools', 'A or B' | 'Profession default']. */
export function recipeRequirement(record) {
  const f = professionFacts({...record, entity_type: 'Recipe'});
  return f?.fields.find(([k]) => k === 'Workstation' || k === 'Tools') ?? null;
}
export function professionFacts(record) {
  if (isRecipeRecord(record)) {
    const activity = isActivityRecipe(record);
    const label = activity ? 'Activity' : 'Craft';
    const effort = effortLabel(record.effort), tier = tierLabel(record.tier);
    const tools = Array.isArray(record.required_tools) ? record.required_tools.filter(t => typeof t === 'string' && t.trim()) : [];
    const station = typeof record.workstation === 'string' && record.workstation.trim() ? record.workstation.trim() : null;
    const requirement = station ? ['Workstation', station] : ['Tools', tools.length ? tools.map(t => t.trim()).join(' or ') : 'Profession default'];
    // 0.49.0: only activities carry an effect note (the Ledger shows it nowhere else).
    const note = activity ? effectNoteOf(record) : null;
    // 0.73.0 (Ledger 0.38.0): a GM-applied enchantment (`gm_applied` on an activity) makes no item; the player brings `bring.text`.
    const applied = gmApplied(record), bring = applied ? bringText(record) : null;
    const fields = [['Recipe kind', label], ['Effort', effort], ['Tier', tier],
      requirement, applied ? ['Applied by', 'GM'] : null, ['Bring', bring], ['Effect note', note], ['Additional gold', goldFlavorText(record)]].filter(f => f && f[1]);
    return {label, fields, summary: [label, applied ? 'GM-applied' : null, effort ? `${effort} effort` : null, tier, note ? 'Effect note' : null].filter(Boolean).join(' · '),
      chips: [label, applied ? 'GM-applied' : null, bring ? `Bring: ${bring}` : null, note ? 'Effect note' : null].filter(Boolean), searchText: [label, applied ? 'GM-applied enchantment' : null, bring, note].filter(Boolean)};
  }
  if (isProfessionRecord(record)) {
    const category = professionCategory(record), recipeLabel = recipeLabelText(record);
    if (!category && !recipeLabel) return null;
    const label = category ? CATEGORY_LABELS[category] : null;
    const fields = [['Profession category', label], ['Recipe label', recipeLabel]].filter(([, v]) => v);
    return {label, fields, summary: [label, recipeLabel ? `Recipe label: ${recipeLabel}` : null].filter(Boolean).join(' · '),
      chips: [label, recipeLabel ? `Recipe label: ${recipeLabel}` : null].filter(Boolean), searchText: [label, recipeLabel].filter(Boolean)};
  }
  return null;
}
