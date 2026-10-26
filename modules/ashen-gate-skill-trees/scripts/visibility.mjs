/**
 * 0.23.3: which published trees a player may see. Pure rules (no Foundry globals); main.js gathers the facts and filters
 * every player path (window, API, embed, unlock) through holdsTree(). The GM is never filtered.
 * A character holds a tree when:
 *  - it has bought a node in it (always visible, even if the profession or Cinder was later lost), or
 *  - profession tree: the Profession Ledger says its level in that profession is 1 or more,
 *  - Cinder tree: a Cinder made from the tree's source is bound to the character (or the tree holds Cinder points for it),
 *  - any other tree: the GM has awarded the character points in it.
 * Unknown (no Ledger, no Cinders) fails closed: the tree is hidden.
 */
import {cleanAccount} from './engine.mjs';

export const EMPTY_PLAYER_TREES='No skill trees yet. Trees appear when your character gains a profession or Cinder.';

/** Set of Cinder source ids (MUT-*) from a character's Cinder pointers, or null when the Cinders module is unavailable. */
export function cinderSourceIds(pointers,available=true) {
  if(!available)return null;
  return new Set((Array.isArray(pointers)?pointers:[]).map(p=>p?.definitionId).filter(id=>typeof id==='string'&&id));
}

/**
 * level: Profession Ledger level (0 = no such profession, null/undefined = Ledger unavailable).
 * cinderIds: cinderSourceIds() (null = Cinders unavailable). account: the character's account on this tree.
 */
export function holdsTree(tree,{level=null,cinderIds=null,account=null}={}) {
  if(!tree)return false;
  const a=cleanAccount(account);
  if(a.unlocks.length)return true;
  switch(tree.provider?.kind){
    case 'profession': return Number.isSafeInteger(level)&&level>=1;
    case 'cinder_milestone': return a.awarded>0||(cinderIds instanceof Set&&typeof tree.sourceRef==='string'&&cinderIds.has(tree.sourceRef));
    default: return a.awarded>0;
  }
}
