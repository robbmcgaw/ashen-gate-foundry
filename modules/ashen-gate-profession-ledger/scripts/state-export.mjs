/** Profession Ledger backup export (0.44.0). Pure JS, no Foundry runtime: main.js hands it what it read through its own readers.
 * `ag-ledger-state-export/0.1` is campaign PLAY STATE (each character's professions, recipes and favourites, the party roster) plus the
 * GM-edited gathering node templates. It is not the node file format (`ag-gathering-nodes/1`) or any definition format, so General Manager's
 * importers never read a backup file as content. No timestamps of its own, no recipe or profession text (ids and names only). */
import {plainTemplate} from './nodes.mjs';
export const STATE_EXPORT_SCHEMA='ag-ledger-state-export/0.1';
const byText=(a,b)=>String(a??'').localeCompare(String(b??''));
const ids=list=>[...new Set((Array.isArray(list)?list:[]).filter(x=>typeof x==='string'))].sort(byText);
/**
 * @param {object} args
 * @param {boolean} args.isGM  refused unless true (the API checks too; this is the service-level guard)
 * @param {{id:string,name:string}[]} args.roster  the party roster selection (name null when the character is gone)
 * @param {{id:string,name:string,professions:object[],knownRecipeIds:string[],favorites:{professions:string[],recipes:string[]}}[]} args.characters
 * @param {{nodes:object[],retiredIds:string[]}} args.nodeStore  the GM node store (normalised)
 */
export function buildStateExport({isGM,roster=[],characters=[],nodeStore=null}){
  if(isGM!==true)throw Error('GM authorization required.');
  const store=nodeStore&&typeof nodeStore==='object'?nodeStore:{};
  return {
    schema_version:STATE_EXPORT_SCHEMA,
    roster:(roster??[]).map(r=>({actor_id:r.id,actor_name:r.name??null})).sort((a,b)=>byText(a.actor_name,b.actor_name)||byText(a.actor_id,b.actor_id)),
    characters:(characters??[]).map(c=>({actor_id:c.id,actor_name:c.name??null,
      professions:(c.professions??[]).map(p=>({profession_id:p.professionId,name:p.name??null,level:p.level??null,xp:p.xp??0,tier:p.tier??null,tracked:p.tracked===true,
        selected_perk_ids:ids(p.selectedPerkIds),unspent_perk_choices:p.unspentPerkChoices??0,history_length:p.historyLength??0}))
        .sort((a,b)=>byText(a.profession_id,b.profession_id)),
      known_recipe_ids:ids(c.knownRecipeIds),
      favorites:{professions:ids(c.favorites?.professions),recipes:ids(c.favorites?.recipes)}}))
      .sort((a,b)=>byText(a.actor_name,b.actor_name)||byText(a.actor_id,b.actor_id)),
    gathering_nodes:{
      templates:(Array.isArray(store.nodes)?store.nodes:[]).map(n=>({...structuredClone(plainTemplate(n)),origin:n.meta?.origin??null,edited:n.meta?.edited===true}))
        .sort((a,b)=>byText(a.id,b.id)),
      retired_ids:ids(store.retiredIds)
    }
  };
}
