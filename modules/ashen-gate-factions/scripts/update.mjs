/** Renown 0.18.0: update mode for the Factions/Deities import. Portable: no Foundry runtime here.
 *
 * `update` rewrites the DEFINITION of a faction or deity that is already in the world. Campaign state (standings, claims,
 * requests, uses, choices, discovery, party knowledge, personal records) lives in separate Journals keyed by the permanent
 * ids; none of it is read-modify-written here. This file only decides what changes (hash, diff) and what saved data an
 * id the new definition drops would leave behind (reported, never deleted).
 */
import {sourceDefinition} from './core.mjs';

const isObj=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
/** JSON with sorted keys, so two equal definitions always give the same text. */
export function stableStringify(v){
  if(Array.isArray(v))return `[${v.map(stableStringify).join(',')}]`;
  if(isObj(v))return `{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v)??'null';
}
/** 53-bit string hash (cyrb53). Not security: it only tells "same text" from "changed". */
export function hashText(text){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(16).padStart(14,'0');
}
/** The part of a definition an import owns. The folder a faction sits in is the GM's own organization, so it is left out. */
export function comparable(def){const d=sourceDefinition(def);delete d.folder_key;return d;}
export const definitionHash=def=>hashText(stableStringify(comparable(def)));

const same=(a,b)=>stableStringify(a)===stableStringify(b);
/** by-id comparison of two lists: ids only in the new list, only in the old list, and in both but different. */
function byId(oldList=[],newList=[]){
  const before=new Map(oldList.map(x=>[x.id,x])),after=new Map(newList.map(x=>[x.id,x]));
  return {added:[...after.keys()].filter(id=>!before.has(id)),removed:[...before.keys()].filter(id=>!after.has(id)),
    changed:[...after.keys()].filter(id=>before.has(id)&&!same(before.get(id),after.get(id)))};
}
const TRACKS=['renown_track','individual_track'],LISTS=['entries','rewards',...TRACKS];
/** What an update would change: field names and counts of milestones, rewards and entries. Pure. */
export function diffDefinitions(oldDef,newDef){
  const a=comparable(oldDef),b=comparable(newDef);
  const fields=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>!LISTS.includes(k)&&!same(a[k],b[k])).sort();
  const milestones={added:[],removed:[],changed:[]};
  for(const t of TRACKS){
    if(!same({...a[t],milestones:0},{...b[t],milestones:0}))fields.push(t);
    const d=byId(a[t]?.milestones,b[t]?.milestones);
    for(const k of Object.keys(milestones))milestones[k].push(...d[k]);
  }
  const rewards=byId(a.rewards,b.rewards),entries=byId(a.entries,b.entries);
  // The same entries in a different order are a real change to what the GM sees.
  const reordered=same([...(a.entries??[])].map(e=>e.id),[...(b.entries??[])].map(e=>e.id))?false:!entries.added.length&&!entries.removed.length;
  if(reordered)fields.push('entries order');
  const n=x=>x.added.length+x.removed.length+x.changed.length;
  const changed=fields.length>0||n(milestones)>0||n(rewards)>0||n(entries)>0;
  const part=(label,x)=>n(x)?`${label} ${[x.added.length&&`${x.added.length} added`,x.removed.length&&`${x.removed.length} removed`,x.changed.length&&`${x.changed.length} changed`].filter(Boolean).join(', ')}`:'';
  const summary=[fields.length&&`fields ${fields.join(', ')}`,part('milestones',milestones),part('rewards',rewards),part('entries',entries)].filter(Boolean).join('; ');
  return {changed,fields,milestones,rewards,entries,summary};
}

/**
 * Saved data that an update would leave behind because the new definition no longer has the id.
 * states: {group, personal: [..]} as stored (claims, requests, uses, choices, knowledge). Nothing is changed or deleted.
 * Returns [{kind:'reward'|'milestone'|'entry', id, held:'2 claims, 1 request'}].
 */
export function droppedState(oldDef,newDef,states={}){
  const a=comparable(oldDef),b=comparable(newDef),out=[];
  const scopes=[states.group,...(states.personal??[])].filter(isObj);
  const count=(n,one,many=`${one}s`)=>n?`${n} ${n===1?one:many}`:'';
  const rewardsGone=byId(a.rewards,b.rewards).removed;
  for(const id of rewardsGone){
    let claims=0,requests=0,uses=0,choices=0;
    for(const s of scopes){
      if(isObj(s.claims)&&s.claims[id])claims++;
      if(isObj(s.requests))requests+=Object.values(s.requests).filter(r=>r?.reward_id===id).length;
      if(isObj(s.uses)&&s.uses[id])uses++;
      if(isObj(s.choices))choices+=Object.values(s.choices).filter(v=>v===id).length;
    }
    const held=[count(claims,'claim'),count(requests,'request'),count(uses,'usage count'),count(choices,'choice')].filter(Boolean).join(', ');
    if(held)out.push({kind:'reward',id,held});
  }
  const goneMs=new Set(TRACKS.flatMap(t=>byId(a[t]?.milestones,b[t]?.milestones).removed));
  for(const id of goneMs){
    let choices=0,claims=0;
    for(const s of scopes){
      if(isObj(s.choices)&&s.choices[id]!==undefined&&s.choices[id]!==null)choices++;
      if(isObj(s.claims))claims+=Object.values(s.claims).filter(c=>c?.milestone_id===id).length;
    }
    const held=[count(choices,'choice'),count(claims,'claim')].filter(Boolean).join(', ');
    if(held)out.push({kind:'milestone',id,held});
  }
  for(const id of byId(a.entries,b.entries).removed){
    const k=states.group?.knowledge?.[id];
    if(k&&(k.party||k.actors?.length))out.push({kind:'entry',id,held:`what the party learned (${k.party?'the party':`${k.actors.length} character${k.actors.length===1?'':'s'}`})`});
  }
  return out;
}

/**
 * A copy of `next` for a Foundry document update that REPLACES `old`: Foundry merges plain objects, so a key that the old
 * object had and the new one does not would otherwise survive. Missing keys are deleted with the `-=key` marker; arrays and
 * values are taken as they are. When nothing is missing the result equals `next`.
 */
export function replaceDelta(old,next){
  if(!isObj(old)||!isObj(next))return next;
  const out={};
  for(const [k,v] of Object.entries(next))out[k]=isObj(v)&&isObj(old[k])?replaceDelta(old[k],v):v;
  for(const k of Object.keys(old))if(!(k in next)&&!k.startsWith('-='))out[`-=${k}`]=null;
  return out;
}
