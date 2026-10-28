/** First unlock only (0.24.0). Pure JS, no Foundry runtime.
 * While a faction is Known but not recruited, or a deity is known but no Vow is sworn to it, a player's payload carries ONLY
 * the first tier. Later tiers are never put in the payload (built GM-side), so nothing can be shown by editing a template.
 * World setting `hideLaterTiers` (GM Setup, default ON). OFF restores the 0.23.0 payloads exactly. */
export const HIDE_LATER_TIERS_SETTING = 'hideLaterTiers';
export const UNLOCKS_WHEN_RECRUITED = 'Unlocks when recruited';
export const MORE_RANKS_HINT = 'More ranks unlock when you are recruited.';
export const MORE_TIERS_HINT = 'More tiers unlock when you swear a vow.';
/** The score used to project a preview: below every threshold, so the tier is locked (teaser text, no claim, no benefit text). */
export const PREVIEW_SCORE = -1;

/** The first tier of a track: the lowest threshold (the first row; thresholds are validated to increase). [] for an empty track. */
export const firstTier = milestones => {
  const list = Array.isArray(milestones) ? milestones : [];
  if (!list.length) return [];
  return [list.reduce((low, m) => (m.threshold < low.threshold ? m : low), list[0])];
};

/** Marks projected (locked) milestones as a recruit-only preview: text flag, nothing claimable. */
export const markRecruitPreview = milestones => milestones.map(m => ({
  ...m, unlocked: false, unlocksWhenRecruited: true, unlocksText: UNLOCKS_WHEN_RECRUITED,
  rewards: (m.rewards ?? []).map(r => ({...r, unlocked: false, locked: true, canClaim: false}))
}));
