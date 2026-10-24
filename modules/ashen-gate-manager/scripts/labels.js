/** Friendly wording for machine tokens (relation names, status/visibility values, entity types). Display only: stored values never change. */
const RELATIONS = {also_available_as_journal: 'Also available as a journal', starting_recipe: 'Starting recipe', transformed_form_of: 'Transformed form of',
  related: 'Related', references: 'References', legacy_reference: 'References', requires_material: 'Requires material'};
const TOKENS = {gm: 'GM only', reveal_gated: 'Revealed by the GM', player: 'Players', example_only: 'Example only', hard_requirement: 'Required',
  optional_integration: 'Optional', required: 'Required', optional: 'Optional', npc: 'NPC', gm_only: 'GM only'};
const words = s => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
/** "reveal_gated" -> "Revealed by the GM", "HandoutItem" -> "Handout item", "approved" -> "Approved". */
export function tokenLabel(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value);
  if (TOKENS[raw]) return TOKENS[raw];
  const w = words(raw).toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}
/** "also_available_as_journal" -> "Also available as a journal". */
export const relationLabel = value => RELATIONS[String(value)] ?? tokenLabel(value);
export const modeLabel = value => tokenLabel(value);
