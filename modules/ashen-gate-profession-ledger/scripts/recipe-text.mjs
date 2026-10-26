/** Ashen Gate Profession Ledger: the written text of a recipe card, each fact once (0.33.4). Display only; pure, no Foundry globals.
 * A recipe record can carry a `description` that already contains its `effect_note` (and a generated first sentence such as
 * "X is an apprentice performance composition made through short effort." that only repeats the tier and effort badges).
 * recipeTexts() works out what is left to show: a short summary (distinct text only) and the effect, never both saying the same.
 * The record is never changed. */
const squash=s=>String(s??'').replace(/\s+/g,' ').trim();
/** Comparison form: lower case, punctuation and quote styles dropped, whitespace collapsed. */
export const normalizeText=s=>squash(s).toLowerCase().replace(/[’‘'"“”`]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Leading sentence that only restates the badges ("<Name> is a(n) <tier> ... made through <effort> effort."), or null. */
function leadSentence(text,{name,tier,effort}){
  const m=/^[^.!?]*[.!?](?:\s+|$)/.exec(text);
  if(!m||!name)return null;
  const s=normalizeText(m[0]);
  if(!s.startsWith(`${normalizeText(name)} is a`))return null;
  const t=normalizeText(tier);
  if(t&&!s.split(' ').includes(t))return null;
  const e=normalizeText(effort);
  if(e&&!s.split(' ').includes(e))return null;
  if(!t&&!e)return null;
  return m[0];
}
/** Remove `part` from `text` where it occurs as a run (case, spacing and punctuation-insensitive); returns the text left, or null when it is not in there. */
function cutOut(text,part){
  const words=squash(part).split(' ').filter(Boolean);
  if(!words.length)return null;
  const re=new RegExp(words.map(escRe).join('\\s+'),'i');
  if(re.test(text))return text.replace(re,' ');
  return normalizeText(text).includes(normalizeText(part))?'':null;
}
/** {summary, effect}: summary is the description with the badge-restating first sentence and any effect text taken out (null when nothing
 * distinct is left); effect is the effect note (null when none, or when it only repeats the summary). */
export function recipeTexts({name='',tier='',effort='',description='',effect=null}={}){
  let summary=squash(description),effectText=squash(effect)||null;
  const lead=leadSentence(summary,{name,tier,effort});
  if(lead)summary=squash(summary.slice(lead.length));
  if(summary&&effectText){
    if(normalizeText(summary)===normalizeText(effectText))summary='';
    else if(normalizeText(effectText).includes(normalizeText(summary)))summary='';
    else{const rest=cutOut(summary,effectText);if(rest!==null)summary=squash(rest);}
  }
  return {summary:normalizeText(summary)?summary:null,effect:effectText};
}
