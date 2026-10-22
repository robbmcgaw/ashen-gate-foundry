/** Ashen Gate Profession Ledger: what each profession calls its recipes (0.29.0). Display only.
 * A Profession record may say `recipeLabel` (singular, e.g. "Formula") and `recipeLabelPlural` ("Formulas"), 1–30 characters
 * each. The entity type, REC-* ids, API names, saved data and imports never change: this is only the word shown where the
 * Ledger shows recipes of one profession. Lists that mix professions keep the generic "Recipe"/"Recipes".
 * Layers, highest first: the GM's edit (GM Setup), the imported Profession record, the draft built-in defaults below, "Recipe".
 * Pure data and helpers; no Foundry globals.
 */
export const GENERIC_RECIPE_LABEL=Object.freeze({singular:'Recipe',plural:'Recipes'});
export const RECIPE_LABEL_MAX=30;
/** DRAFT built-in fallbacks, awaiting Robb's approval: not canon and not stored anywhere. Any imported `recipeLabel` (or a GM
 * edit in GM Setup) wins over these. Keyed by profession key (see professionKey). Remove or change a row here freely. */
export const DRAFT_RECIPE_LABEL_DEFAULTS=Object.freeze({
  alchemy:Object.freeze({singular:'Formula',plural:'Formulas'}),
  blacksmithing:Object.freeze({singular:'Blueprint',plural:'Blueprints'}),
  artistry:Object.freeze({singular:'Composition',plural:'Compositions'})
});
/** A label as shown: whitespace collapsed, 1–30 characters, else null (ignored, so the next layer applies). */
export function cleanRecipeLabel(value){
  if(typeof value!=='string')return null;
  const text=value.replace(/\s+/g,' ').trim();
  return text.length>=1&&text.length<=RECIPE_LABEL_MAX?text:null;
}
/** The labels one record carries ({singular, plural}, each a clean label or null), or null when it carries none. */
export function recipeLabelsOf(record){
  if(!record||typeof record!=='object')return null;
  const singular=cleanRecipeLabel(record.recipeLabel),plural=cleanRecipeLabel(record.recipeLabelPlural);
  return singular||plural?{singular,plural}:null;
}
/** Simple English plural for a label given only in the singular ("Formula" → "Formulas", "Recipe Book" → "Recipe Books"). */
export function pluralLabel(singular){
  const s=String(singular??'');
  if(!s)return s;
  if(/(s|x|z|ch|sh)$/i.test(s))return `${s}es`;
  if(/[^aeiou]y$/i.test(s))return `${s.slice(0,-1)}ies`;
  return `${s}s`;
}
/** The singular of a plural-only label: the trailing "s" dropped ("Scores" → "Score"), else the plural as given. */
const singularOf=plural=>/[^s]s$/i.test(plural)?plural.slice(0,-1):plural;
/** First letter upper case (capitalize) or lower case for use inside a sentence; an all-caps start ("DIY plan") is left alone. */
export function caseLabel(label,capitalize=true){
  const s=String(label??'');
  if(!s)return s;
  if(capitalize)return s[0].toUpperCase()+s.slice(1);
  return /^[A-Z][A-Z]/.test(s)?s:s[0].toLowerCase()+s.slice(1);
}
/** Resolve the {singular, plural} pair from layers (highest first, each {singular?, plural?} or null). The singular comes from the
 * highest layer that sets one, the plural from the highest layer that sets one at or above it, else it is made from the singular.
 * A plural set with no singular anywhere above "Recipe" gives the singular too ("Scores" → "Score"). */
export function resolveRecipeLabels(layers=[]){
  const list=[...layers.map(l=>l&&typeof l==='object'?{singular:cleanRecipeLabel(l.singular),plural:cleanRecipeLabel(l.plural)}:null),GENERIC_RECIPE_LABEL];
  const si=list.findIndex(l=>l?.singular),pi=list.findIndex(l=>l?.plural);
  if(si===list.length-1&&pi<si)return {singular:singularOf(list[pi].plural),plural:list[pi].plural,layer:pi};
  return {singular:list[si].singular,plural:pi<=si?list[pi].plural:pluralLabel(list[si].singular),layer:Math.min(si,pi)};
}
/** One label: {plural?: false, capitalize?: true}. */
export function pickRecipeLabel(labels,{plural=false,capitalize=true}={}){
  return caseLabel(plural?labels.plural:labels.singular,capitalize);
}
/** The GM's saved edits ({[professionKey]: {singular?, plural?}}), cleaned; anything else is dropped. */
export function cleanLabelStore(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const [key,value] of Object.entries(raw)){
    if(!/^[a-z0-9]{1,40}$/.test(key)||!value||typeof value!=='object')continue;
    const singular=cleanRecipeLabel(value.singular),plural=cleanRecipeLabel(value.plural);
    if(singular||plural)out[key]={...(singular?{singular}:{}),...(plural?{plural}:{})};
  }
  return out;
}
