/** 0.21.0: one entry per profession in the tree picker, Tree Library and embed (pure view data, no Foundry globals). */
import {asArray,walletGroups,groupName,memberName} from './engine.mjs';

const byName=(a,b)=>String(a.name??'').localeCompare(String(b.name??''))||String(a.id).localeCompare(String(b.id));
/** Wallet groups with their display name; multi: a profession with more than one tree (trees sorted by name). */
export function professionGroups(trees) {
  return walletGroups(trees).map(g=>{
    const multi=g.kind==='profession'&&g.trees.length>1,list=multi?[...g.trees].sort(byName):g.trees;
    const name=multi?groupName(list):String(list[0]?.name??'');
    return {...g,multi,name,trees:list,members:list.map(t=>({id:t.id,label:multi?memberName(t,name):String(t.name??'')}))};
  });
}
/**
 * Tree picker: options for the Tree select (one per profession) and, when the selected tree's profession has several trees,
 * the sub-tabs between them. remembered(sourceRef) is the tree last chosen for that profession (per user).
 */
export function treePicker(trees,selectedId,remembered=()=>null) {
  const options=[];let tabs=null;
  for(const g of professionGroups(trees)){
    if(!g.multi){for(const t of g.trees)options.push({value:t.id,label:String(t.name??''),selected:t.id===selectedId});continue;}
    const inGroup=g.trees.some(t=>t.id===selectedId),last=remembered(g.sourceRef);
    const value=inGroup?selectedId:g.trees.some(t=>t.id===last)?last:g.trees[0].id;
    options.push({value,label:`${g.name} (${g.trees.length} trees)`,selected:inGroup,sourceRef:g.sourceRef});
    if(inGroup)tabs={sourceRef:g.sourceRef,name:g.name,selected:selectedId,tabs:g.members.map(m=>({id:m.id,label:m.label}))};
  }
  return {options,tabs};
}
/**
 * Tree Library: rows grouped by profession. A profession with several trees is one group (heading + wallet line);
 * every other tree is a group of one with no heading. rows: libraryRows() output; trees: the stored trees.
 */
export function libraryGroups(rows,trees,walletText=()=>'') {
  const byId=new Map(asArray(rows).map(r=>[r.id,r]));
  return professionGroups(trees).map(g=>({key:g.key,sourceRef:g.sourceRef,multi:g.multi,name:g.name,
    countText:`${g.trees.length} trees`,walletText:g.multi?walletText(g):'',
    rows:g.trees.map(t=>byId.get(t.id)).filter(Boolean).map(r=>g.multi?{...r,memberName:memberName({name:r.name},g.name)}:r)}))
    .filter(g=>g.rows.length)
    .sort((a,b)=>String(a.multi?a.name:a.rows[0].name).localeCompare(String(b.multi?b.name:b.rows[0].name)));
}
/** The same groups as one flat list for the template: a heading item ({head}) before each profession's rows ({…row, group}). */
export function libraryItems(groups) {
  return asArray(groups).flatMap(g=>g.multi
    ?[{head:{key:g.key,name:g.name,countText:g.countText,walletText:g.walletText}},...g.rows.map(r=>({...r,group:g.key}))]
    :g.rows.map(r=>({...r,group:null})));
}
/** "Artistry: 5 of 16 points used" (earned null: the Ledger is off, so only the points used are known). */
export function walletLine(name,{earned=null,spent=0,level=null}={}) {
  if(earned===null||earned===undefined)return `${name}: ${spent} point${spent===1?'':'s'} used (Profession Ledger not active)`;
  return `${name}: ${spent} of ${earned} point${earned===1?'':'s'} used${Number.isSafeInteger(level)?` at level ${level}`:''}`;
}
