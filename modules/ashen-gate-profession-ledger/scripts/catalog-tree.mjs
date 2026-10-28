/** Ashen Gate Profession Ledger: the recipe tree (0.37.0): profession folders with tier groups inside, in ladder order. Pure HTML builders; no Foundry globals.
 * A profession is a native <details> folder; its tiers are sub-headers whose button collapses a panel (aria-expanded), not a second <details>:
 * the UI guidelines forbid a fold inside a fold, and one kind of collapse per level keeps keyboard behaviour the same everywhere.
 * Open/closed state is kept by the caller (`isOpen(key, default)`), per user, so a re-render restores it. */
import {TIERS,ACCESS_LEVELS} from './progression.mjs';
import {norm} from './core.mjs';

export const OTHER_TIER='Other';
/** The tier of a recipe, as the recipe card's chip reads it: its tier name; else the highest tier whose level it asks for (minimum_profession_level); else null. */
export function recipeTierName(recipe){
  const t=String(recipe?.tier??'').trim();
  const named=TIERS.find(x=>norm(x)===norm(t));
  if(named)return named;
  const n=Number(t);
  if(Number.isInteger(n)&&n>=1&&n<=TIERS.length)return TIERS[n-1];
  const level=Number(recipe?.sourceDefinition?.minimum_profession_level??recipe?.minimumProfessionLevel);
  if(Number.isFinite(level)&&level>=1)return [...TIERS].reverse().find(x=>ACCESS_LEVELS[x]<=level)??null;
  return null;
}
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'x';
/** rows: [{group (profession name), recipe, html}] -> [{key, name, rows, tiers:[{key, name, rows}]}], professions by name, tiers in ladder order, "Other" last (empty tiers omitted). */
export function buildTree(rows){
  const profs=new Map();
  for(const row of rows){
    const key=slug(row.group)||'unassigned';
    if(!profs.has(key))profs.set(key,{key,name:row.group||'Unassigned profession',rows:[],tierMap:new Map()});
    const p=profs.get(key),tier=recipeTierName(row.recipe)??OTHER_TIER;
    p.rows.push(row);
    if(!p.tierMap.has(tier))p.tierMap.set(tier,[]);
    p.tierMap.get(tier).push(row);
  }
  const order=[...TIERS,OTHER_TIER];
  return [...profs.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({key:p.key,name:p.name,rows:p.rows,
    tiers:order.filter(t=>p.tierMap.has(t)).map(t=>({key:`${p.key}:${slug(t)}`,name:t,rows:p.tierMap.get(t).sort((a,b)=>String(a.recipe?.name).localeCompare(String(b.recipe?.name)))}))}));
}
/** Every folder and tier key of a tree: what Expand all and Collapse all set. */
export const treeKeys=tree=>({folders:tree.map(p=>p.key),tiers:tree.flatMap(p=>p.tiers.map(t=>t.key))});
/**
 * The tree as HTML. `isOpen(key, fallback)` gives the remembered state (profession folders default closed, tiers open); `countText(profession)` is the
 * badge text of a profession ("12 recipes"); `esc` escapes. Data attributes let the search show matches: data-tree (folder), data-tier-group, data-total.
 */
export function treeHtml(tree,{isOpen=(k,d)=>d,countText=p=>String(p.rows.length),esc=s=>String(s??'')}={}){
  return tree.map(p=>{
    const open=isOpen(`p:${p.key}`,false);
    return `<details class="agl-folder agl-tree-folder" data-folder="${esc(p.key)}" data-tree="p:${esc(p.key)}" data-stored-open="${open?1:0}" data-total="${p.rows.length}" ${open?'open':''}>
    <summary><i class="fa-solid fa-folder-open" aria-hidden="true"></i> <strong>${esc(p.name)}</strong> <span class="ag-badge" data-folder-count>${esc(countText(p))}</span></summary>
    <div class="agl-folder-body">${p.tiers.map(t=>{
      const tOpen=isOpen(`t:${t.key}`,true),id=`agl-tier-${esc(t.key.replace(/:/g,'-'))}`;
      return `<section class="agl-tier-group" data-tier-group="${esc(t.key)}" data-stored-open="${tOpen?1:0}" data-total="${t.rows.length}">
        <h4 class="agl-tier-head"><button type="button" class="agl-tier-toggle" data-action="tier-toggle" data-id="${esc(t.key)}" aria-expanded="${tOpen}" aria-controls="${id}"><i class="fa-solid fa-chevron-down agl-tier-chev" aria-hidden="true"></i> <span>${esc(t.name)}</span> <span class="ag-badge" data-tier-count>${t.rows.length}</span></button></h4>
        <div class="agl-tier-body" id="${id}" ${tOpen?'':'hidden'}>${t.rows.map(r=>r.html).join('')}</div></section>`;}).join('')}</div></details>`;
  }).join('');
}

/**
 * The search over one tree folder (a DOM element): hides tier groups and the folder when nothing matches, opens what matches and shows "n of total" in the badges;
 * with an empty query it puts back what was remembered (data-stored-open). Rows are the elements with [data-recipe-search] that the caller already hid or showed.
 */
export function applyTreeSearch(folder,query){
  const rows=[...folder.querySelectorAll('[data-recipe-search]')];
  const shown=rows.filter(r=>!r.hidden).length,total=Number(folder.dataset.total)||rows.length;
  folder.hidden=Boolean(query)&&rows.length>0&&shown===0;
  const count=folder.querySelector('[data-folder-count]');
  if(count){if(count.dataset.plain===undefined)count.dataset.plain=count.textContent;count.textContent=query?`${shown} of ${total}`:count.dataset.plain;}
  for(const group of folder.querySelectorAll('[data-tier-group]')){
    const g=[...group.querySelectorAll('[data-recipe-search]')],gs=g.filter(r=>!r.hidden).length,gt=Number(group.dataset.total)||g.length;
    const panel=group.querySelector('.agl-tier-body'),btn=group.querySelector('.agl-tier-toggle'),badge=group.querySelector('[data-tier-count]');
    group.hidden=Boolean(query)&&gs===0;
    const open=query?gs>0:group.dataset.storedOpen==='1';
    if(panel)panel.hidden=!open;
    if(btn)btn.setAttribute('aria-expanded',String(open));
    if(badge)badge.textContent=query?`${gs} of ${gt}`:String(gt);
  }
  folder.open=query?!folder.hidden:folder.dataset.storedOpen==='1';
}

/** Opens or closes one tier group in place (no re-render): the panel, the button's aria-expanded and the remembered flag. Returns the new state. */
export function toggleTierGroup(group,open=null){
  const panel=group.querySelector('.agl-tier-body'),btn=group.querySelector('.agl-tier-toggle');
  const next=open==null?Boolean(panel?.hidden):Boolean(open);
  if(panel)panel.hidden=!next;
  if(btn)btn.setAttribute('aria-expanded',String(next));
  return next;
}
/** Expand all / Collapse all in place: every profession folder and tier group under `root`. Returns {folders:[keys], tiers:[keys]} it changed. */
export function setAllTree(root,on){
  const folders=[],tiers=[];
  for(const f of root.querySelectorAll('details[data-tree]')){f.dataset.storedOpen=on?'1':'0';if(f.open!==on)f.open=on;folders.push(f.dataset.folder);}
  for(const g of root.querySelectorAll('[data-tier-group]')){g.dataset.storedOpen=on?'1':'0';toggleTierGroup(g,on);tiers.push(g.dataset.tierGroup);}
  return {folders,tiers};
}
