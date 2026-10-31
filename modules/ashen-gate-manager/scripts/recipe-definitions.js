/**
 * Recipe gold flavour (0.89.0). A Recipe record may carry `additional_gp` (gold paid on top of the materials) and, optionally,
 * `additional_gp_flavor`: a short plain phrase for what that gold pays for ("ash and vials"). Display flavour only: Manager stores
 * the record's definition exactly as written and never applies it; a module that shows the cost may print "75 gp (ash and vials)".
 *
 * Rule (the same text is in docs/recipe-gold-flavor-schema.md and scripts/validate-content.mjs reuses this function):
 *  - absent is fine; every other value is checked;
 *  - a string of 1 to 40 characters made only of lower-case letters a-z, digits, spaces, commas, apostrophes (') and hyphens, with no
 *    leading or trailing space (so no markup, no punctuation such as < > & . ; : / " or line breaks);
 *  - only valid on a Recipe whose `additional_gp` is a number above 0.
 * Pure, no Foundry globals.
 */
export const GOLD_FLAVOR_FIELD = 'additional_gp_flavor';
export const GOLD_FLAVOR_MAX = 40;
export const GOLD_FLAVOR_PATTERN = /^[a-z0-9,'-](?:[a-z0-9 ,'-]*[a-z0-9,'-])?$/;
const isRecipe = record => record?.entity_type === 'Recipe' || /^REC-/.test(String(record?.id ?? ''));

/** Error strings for a record's `additional_gp_flavor` (an empty list when absent or valid). Other record types are not checked. */
export function recipeGoldFlavorProblems(record, label = record?.id ?? 'record') {
  if (!record || typeof record !== 'object' || !isRecipe(record) || !Object.hasOwn(record, GOLD_FLAVOR_FIELD) || record[GOLD_FLAVOR_FIELD] === undefined) return [];
  const value = record[GOLD_FLAVOR_FIELD];
  const at = `${label}.${GOLD_FLAVOR_FIELD}`;
  if (typeof value !== 'string') return [`${at} must be text (1-${GOLD_FLAVOR_MAX} characters), or left out.`];
  const errors = [];
  if (!value.length) errors.push(`${at} is empty: write 1-${GOLD_FLAVOR_MAX} characters, or leave the field out.`);
  else if (value.length > GOLD_FLAVOR_MAX) errors.push(`${at} is ${value.length} characters; the most is ${GOLD_FLAVOR_MAX}.`);
  else if (!GOLD_FLAVOR_PATTERN.test(value)) errors.push(`${at} may only use lower-case letters, digits, spaces, commas, apostrophes and hyphens, with no markup and no space at either end (e.g. "ash and vials").`);
  const gp = record.additional_gp;
  if (!(typeof gp === 'number' && Number.isFinite(gp) && gp > 0)) errors.push(`${at} is only valid when additional_gp is above 0 (it says what that gold pays for).`);
  return errors;
}

/** The flavour as a display phrase, or null when absent/invalid/no extra gold. Read-only, for previews. */
export function goldFlavorText(record) {
  if (!isRecipe(record) || typeof record?.[GOLD_FLAVOR_FIELD] !== 'string' || recipeGoldFlavorProblems(record).length) return null;
  return `${record.additional_gp} gp (${record[GOLD_FLAVOR_FIELD]})`;
}
