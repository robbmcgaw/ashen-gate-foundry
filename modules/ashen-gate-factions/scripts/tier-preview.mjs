/** Locked ranks for players (0.24.0 first unlock, 0.25.0 flavor-only locked cards). Pure JS, no Foundry runtime.
 * A player gets every rank card of a faction they can see and of a god shown to them. A rank the character or party has not
 * unlocked is projected GM-side into a locked card that carries only its order, threshold, id, a generic label and the
 * author's `flavor` line. The real name, benefit, rewards (names, teasers, descriptions, item links) never enter the player
 * payload, so nothing can be shown by editing a template.
 * World setting `lockedRanks` (GM Setup): 'flavor' (default) | 'hide' (the 0.24.0 behaviour) | 'all' (everything, as before 0.24.0). */
export const LOCKED_RANKS_SETTING='lockedRanks';
export const LOCKED_RANKS_MIGRATED_SETTING='lockedRanksMigrated';
/** The 0.24.0 Boolean setting. Still registered (never shown) so a world's old choice can be read once. */
export const HIDE_LATER_TIERS_SETTING='hideLaterTiers';
export const LOCKED_MODES=Object.freeze(['flavor','hide','all']);
export const DEFAULT_LOCKED_MODE='flavor';
export const LOCKED_MODE_LABELS=Object.freeze({flavor:'Flavor text only',hide:'Hide locked ranks',all:'Show everything'});
export const normalizeLockedMode=v=>LOCKED_MODES.includes(v)?v:DEFAULT_LOCKED_MODE;
/** One-time carry-over of the 0.24.0 switch: an explicit OFF (everything visible) becomes 'all'; ON or never touched becomes the new default. */
export const modeFromLegacyHide=hide=>hide===false?'all':DEFAULT_LOCKED_MODE;
export const UNLOCKS_WHEN_RECRUITED='Unlocks when recruited';
export const MORE_RANKS_HINT='More ranks unlock when you are recruited.';
export const MORE_TIERS_HINT='More tiers unlock when you swear a vow.';
export const GENERIC_RANK_FLAVOR='A further rank, earned through renown.';
export const GENERIC_TIER_FLAVOR='A further tier, opened by a sworn Vow.';
export const FLAVOR_MAX=400;
/** The score used to project a preview: below every threshold, so the tier is locked (teaser text, no claim, no benefit text). */
export const PREVIEW_SCORE=-1;

/** The first tier of a track: the lowest threshold (the first row; thresholds are validated to increase). [] for an empty track. */
export const firstTier=milestones=>{
  const list=Array.isArray(milestones)?milestones:[];
  if(!list.length)return [];
  return [list.reduce((low,m)=>(m.threshold<low.threshold?m:low),list[0])];
};

/** Marks projected (locked) milestones as a recruit-only preview: text flag, nothing claimable. */
export const markRecruitPreview=milestones=>milestones.map(m=>({
  ...m,unlocked:false,unlocksWhenRecruited:true,unlocksText:UNLOCKS_WHEN_RECRUITED,
  rewards:(m.rewards??[]).map(r=>({...r,unlocked:false,locked:true,canClaim:false}))
}));

/** The flavor line of a milestone, or the generic neutral line when the author wrote none. */
export const flavorOf=(m,deity=false)=>{
  const text=typeof m?.flavor==='string'?m.flavor.trim():'';
  return text||(deity?GENERIC_TIER_FLAVOR:GENERIC_RANK_FLAVOR);
};
/** The generic, content-free label of a locked rank ("Rank 3", "Tier 3"). */
export const lockedLabel=(order,deity=false)=>`${deity?'Tier':'Rank'} ${order}`;
/** The ONLY shape a locked rank takes in a player payload. Built field by field (never by spreading the milestone), so a field
 * added to milestones later cannot leak through it. */
export function lockedMilestone(m,order,{deity=false}={}){
  return {id:m.id,order,threshold:m.threshold,name:lockedLabel(order,deity),benefit:'',flavor:flavorOf(m,deity),
    locked:true,lockedCard:true,unlocked:false,rewards:[]};
}
/** Keeps the milestones `open(m,index)` accepts and turns every other one into a locked card. */
export const lockWhere=(milestones,open,opts={})=>(milestones??[]).map((m,i)=>open(m,i)?m:lockedMilestone(m,m.order??i+1,opts));
/** What a "next rank" pointer may say about a locked rank. */
export const lockedNext=(m,order,deity=false)=>m?{name:lockedLabel(order,deity),threshold:m.threshold}:null;
