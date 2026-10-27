// The Vow feature (0.21.0): one feat Item on the character per sworn Vow, with one Active Effect that adds the god's bonus
// (+1d4) to the roll the Vow names. No Foundry globals: the actor, ids and clock are passed in, so it is testable.
// The Item is owned by Renown (flag `vowItem`) and Renown never touches any other Item.
export const VOW_ITEM_FLAG = 'vowItem';
export const VOW_EFFECT_FLAG = 'vowEffect';
export const VOW_LOG_FLAG = 'vowLog';
const VOW_LOG_MAX = 30;
const DEFAULT_IMG = 'icons/svg/aura.svg';

/** dnd5e 6.0.6 Active Effect keys for a bonus to one kind of roll (verified in the system source, see CHANGELOG). */
export function bonusKey({kind, key}) {
  switch (kind) {
    case 'skill': return `system.skills.${key}.roll.bonus`;
    case 'tool': return `system.tools.${key}.roll.bonus`;
    case 'save': return `system.abilities.${key}.save.roll.bonus`;
    case 'check': return `system.abilities.${key}.check.roll.bonus`;
    case 'attack': return 'system.rolls.attack.bonus';
    default: throw Error(`Unknown roll kind "${kind}".`);
  }
}
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RECOVERY = {lr: 'lr', sr: 'sr', day: 'day'};

/** The first Seeker reward tagged `vow` that carries a usable vow_benefit, or null. Reads defensively: bad data means no Item, never an error.
 * `rewards` are a god's reward records (or a milestone's), `firstMilestoneId` limits it to the Seeker rank when known. */
export function pickVowReward(rewards, firstMilestoneId = null) {
  for (const r of rewards ?? []) {
    if (!r || typeof r !== 'object') continue;
    if (firstMilestoneId && r.milestone_id !== firstMilestoneId) continue;
    if (!(r.tags ?? []).includes('vow')) continue;
    const b = r.vow_benefit;
    if (!b || typeof b !== 'object' || !Array.isArray(b.applies_to) || !b.applies_to.length) continue;
    if (!/^\d+d\d+$/.test(String(b.bonus ?? ''))) continue;
    try { b.applies_to.forEach(bonusKey); } catch { continue; }
    return {reward: r, benefit: b};
  }
  return null;
}

/** Description HTML for the Item: the god's summary and requirement, and an honest note about conditions. */
export function vowDescription(benefit, godName) {
  const conds = [...new Set((benefit.applies_to ?? []).map(a => a.condition).filter(Boolean))];
  return `<p>${esc(benefit.summary ?? '')}</p><p><strong>Requirement.</strong> ${esc(benefit.requirement ?? '')}</p>`
    + `<p><strong>How it works.</strong> Use <em>Invoke your Vow</em> before the roll. The bonus applies to your next matching roll and then ends (or after one hour). `
    + `It recovers on ${benefit.uses?.recovery === 'sr' ? 'a Short Rest' : benefit.uses?.recovery === 'day' ? 'a new day' : 'a Long Rest'}.`
    + `${conds.length ? ` Use only ${conds.map(esc).join(' or ')}: Foundry cannot tell what a roll is against, so you decide.` : ''}</p>`
    + `<p>Vow to ${esc(godName)}. Managed by Renown: it is removed when the Vow ends.</p>`;
}

/** Embedded-create data for the Vow Item (feat) with its uses, one utility activity and the one linked Active Effect.
 * `newId()` must return a fresh 16-character document id. */
export function buildVowItemData({deityId, godName, symbol = '', reward, benefit, moduleId, newId}) {
  const effectId = newId(), activityId = newId();
  const name = (benefit.name && String(benefit.name).trim()) || `Vow of ${godName}`;
  const img = symbol || DEFAULT_IMG;
  const applies = benefit.applies_to.map(a => ({kind: a.kind, key: a.key ?? ''}));
  const changes = [...new Map(applies.map(a => [bonusKey(a), a])).keys()].map(key => ({key, type: 'add', value: `+${benefit.bonus}`, phase: 'initial', priority: 20}));
  const period = RECOVERY[benefit.uses?.recovery] ?? 'lr';
  return {
    name, type: 'feat', img,
    system: {
      description: {value: vowDescription(benefit, godName)},
      uses: {max: String(benefit.uses?.max ?? 1), spent: 0, recovery: [{period, type: 'recoverAll'}]},
      activities: {
        [activityId]: {
          _id: activityId, type: 'utility', name: 'Invoke your Vow', activation: {type: 'special'},
          consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {mode: ''}}]},
          description: {chatFlavor: name},
          effects: [{_id: effectId}]
        }
      }
    },
    effects: [{
      _id: effectId, name: `${name}: +${benefit.bonus}`, img, transfer: false, disabled: false,
      description: `<p>+${esc(benefit.bonus)} to ${applies.map(a => esc(a.key || a.kind)).join(' or ')}; ends after that roll is made.</p>`,
      duration: {value: 1, units: 'hours'}, changes,
      flags: {[moduleId]: {[VOW_EFFECT_FLAG]: {deityId, rewardId: reward.id, applies_to: applies}}}
    }],
    flags: {[moduleId]: {[VOW_ITEM_FLAG]: {deityId, rewardId: reward.id}}}
  };
}

/** Whether a finished roll is one the Vow effect names. `roll` is {kind:'skill'|'tool'|'save'|'check'|'attack', key}. */
export function vowEffectMatches(applies = [], roll = {}) {
  return applies.some(a => a.kind === roll.kind && (roll.kind === 'attack' || a.key === roll.key));
}

export const vowItemsOf = (actor, moduleId) => [...(actor?.items ?? [])].filter(i => i.getFlag?.(moduleId, VOW_ITEM_FLAG));
export const vowEffectsOf = (actor, moduleId) => [...(actor?.effects ?? [])].filter(e => e.getFlag?.(moduleId, VOW_EFFECT_FLAG));

/** Remove the Vow Items (and any applied Vow effect) for every god except `keepDeityId`. Only flagged documents are touched. */
export async function removeVowItems({actor, moduleId, keepDeityId = null}) {
  const items = vowItemsOf(actor, moduleId).filter(i => i.getFlag(moduleId, VOW_ITEM_FLAG).deityId !== keepDeityId);
  const effects = vowEffectsOf(actor, moduleId).filter(e => e.getFlag(moduleId, VOW_EFFECT_FLAG).deityId !== keepDeityId);
  if (items.length) await actor.deleteEmbeddedDocuments('Item', items.map(i => i.id));
  if (effects.length) await actor.deleteEmbeddedDocuments('ActiveEffect', effects.map(e => e.id));
  return {items: items.length, effects: effects.length};
}

/** Make the actor hold exactly one Vow Item, for `deityId` (null = none). `data` is buildVowItemData output, or null when the god has no vow_benefit.
 * Idempotent: an existing Item for that god is kept (extras are removed); a manually deleted one is recreated. */
export async function syncVowItem({actor, moduleId, deityId, data}) {
  const removed = await removeVowItems({actor, moduleId, keepDeityId: deityId});
  if (!deityId || !data) return {created: false, removed};
  const mine = vowItemsOf(actor, moduleId).filter(i => i.getFlag(moduleId, VOW_ITEM_FLAG).deityId === deityId);
  if (mine.length > 1) await actor.deleteEmbeddedDocuments('Item', mine.slice(1).map(i => i.id));
  if (mine.length) return {created: false, removed};
  await actor.createEmbeddedDocuments('Item', [data]);
  return {created: true, removed};
}

/** Append to the Vow history flag on the actor (newest last, capped). */
export async function logVow(actor, moduleId, event, deityId, now = () => new Date().toISOString()) {
  const log = [...(actor.getFlag?.(moduleId, VOW_LOG_FLAG) ?? []), {at: now(), event, deity_id: deityId}].slice(-VOW_LOG_MAX);
  await actor.setFlag(moduleId, VOW_LOG_FLAG, log);
}

/** dnd5e 6.0.6 has no "ends after this roll" expiry, so Renown ends the applied Vow effect itself once a matching roll is made.
 * Returns how many effects it removed. Only Renown's flagged effects on the actor are considered. */
export async function expireVowEffects(actor, moduleId, roll) {
  const hit = vowEffectsOf(actor, moduleId).filter(e => vowEffectMatches(e.getFlag(moduleId, VOW_EFFECT_FLAG).applies_to, roll));
  if (hit.length) await actor.deleteEmbeddedDocuments('ActiveEffect', hit.map(e => e.id));
  return hit.length;
}
