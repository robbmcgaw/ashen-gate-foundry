/** Ashen Gate Profession Ledger: the colour of a tier name (0.32.0). Display only; no Foundry globals.
 * The project's colouring standard is "rarity by tier" (decided 2026-10-21): a tier is drawn with the kit's item-rarity hues,
 * so no palette is added here. The tier name stays visible in the badge (colour is never the only signal), and the kit's
 * `.ag-rarity-badge` puts the rarity "ink" on a tinted fill so it reads on every skin.
 *   Apprentice = common, Journeyman = uncommon, Artisan = rare, Expert = very rare, Master = legendary (artifact is not used).
 * The values are the kit's `data-rarity` keys (camel case, see ag-ui.css). */
export const TIER_RARITY=Object.freeze({apprentice:'common',journeyman:'uncommon',artisan:'rare',expert:'veryRare',master:'legendary'});
const key=tier=>String(tier??'').trim().toLowerCase();
/** The kit rarity key for a tier name ("Expert" → "veryRare"), or null for a missing or unknown tier. */
export const tierRarity=tier=>TIER_RARITY[key(tier)]??null;
/** The tier as the kit's rarity badge (name always shown); an unknown tier is plain text, a missing one is ''. `esc` escapes HTML. */
export function tierBadge(tier,esc=s=>String(s??'')){
  const text=String(tier??'').trim();
  if(!text)return '';
  const rarity=tierRarity(text);
  return rarity?`<span class="ag-rarity-badge agl-tier" data-rarity="${rarity}">${esc(text)}</span>`:`<span class="agl-tier">${esc(text)}</span>`;
}
