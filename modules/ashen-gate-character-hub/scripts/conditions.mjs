/**
 * Conditions (0.34.0): one strip under Mastery & marks. A Self / Target switch picks who the condition goes on (Self:
 * this character; Target: the user's targeted tokens, the same targets marks use), a list picks the condition and Apply
 * puts it on. Conditions on this character and on the current targets show as chips (✕ takes one off), in the marks'
 * chip style. Replaces the Conditions box of the character column.
 *
 * The change is a real status effect through Foundry's own Actor#toggleStatusEffect, so the token icon, dnd5e and
 * Ashen Gate | Utilities' Condition Manager all see it. Only dnd5e conditions whose id is in CONFIG.statusEffects are
 * offered (never an id Foundry would refuse), exhaustion aside (it has levels: the pill beside HP).
 *
 * Who may change what (checked here, at the click, not only by hiding buttons):
 *   - the GM: anyone, linked or not;
 *   - a player, with Utilities' conditions API (contract ag-utilities-conditions/1): Utilities' rules decide (condition
 *     controllers, "owners manage conditions", the per-character unlock), through its canApply / canRemove, and
 *     Utilities' apply / remove carry the change out (on the GM client when needed). Utilities works on world
 *     characters, so a token that is not linked to one is left to the GM;
 *   - a player without Utilities: only on characters they own (as the Hub's Conditions box allowed before).
 */
import {esc} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {conditionsData} from './data.mjs';
import {targetedTokens} from './marks.mjs';

const refuse = error => ({ok: false, error});
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
export const MODES = ['self', 'target'];
export const cleanMode = mode => mode === 'target' ? 'target' : 'self';

/** The conditions offered: dnd5e's list (conditionTypes) that are also Foundry status effects, by label. */
export const conditionChoices = actor => conditionsData(actor ?? {}).map(({id, label, img}) => ({id, label, img}));

/** Utilities' conditions API when it is active and offers the calls the Hub uses, else null. */
export function utilitiesConditions() {
  const mod = globalThis.game?.modules?.get?.('ashen-gate-utilities');
  const c = mod?.active ? mod.api?.conditions : null;
  return c?.contract === 'ag-utilities-conditions/1' && ['canApply', 'apply', 'canRemove', 'remove'].every(k => typeof c[k] === 'function') ? c : null;
}

/** The world Actor behind `actor` when it is that Actor itself (a character, or a linked token's Actor), else null. */
export function worldActor(actor) {
  const a = actor?.id ? globalThis.game?.actors?.get?.(actor.id) : null;
  return a && a === actor ? a : null;
}

/** Who a condition goes on: [{actor, name, uuid}]: this character, or the Actor of each targeted token. */
export function conditionTargets(self, mode) {
  if (cleanMode(mode) === 'self') return self ? [{actor: self, name: self.name, uuid: self.uuid, self: true}] : [];
  return targetedTokens().map(t => {
    const actor = t?.actor ?? t?.document?.actor ?? null;
    return actor ? {actor, name: t.name ?? t.document?.name ?? actor.name, uuid: actor.uuid, self: false} : null;
  }).filter(Boolean);
}

const callOk = fn => { try { return fn() === true; } catch { return false; } };
/**
 * Whether `user` may put on (apply) or take off a condition on `actor`, and how: {ok, route: 'direct' | 'utilities'}
 * or {ok: false, error}. Pure apart from Utilities' own checks.
 */
export function conditionDecision({actor, name = actor?.name ?? 'that character', statusId, apply = true, user = globalThis.game?.user, utilities = utilitiesConditions(), valid = null} = {}) {
  if (!actor) return refuse('That character or token is gone.');
  if (valid && !valid.has(statusId)) return refuse('Pick a condition from the list.');
  if (isGM(user)) return {ok: true, route: 'direct'};
  if (utilities) {
    const world = worldActor(actor);
    if (!world) return refuse(`Only the GM can change conditions on ${name}: it is not linked to a character.`);
    const allowed = apply ? callOk(() => utilities.canApply(world.id, statusId)) : callOk(() => utilities.canRemove(world.id, statusId));
    return allowed ? {ok: true, route: 'utilities', actorId: world.id}
      : refuse(`You can't ${apply ? 'put conditions on' : 'take conditions off'} ${name}: the GM decides that in Ashen Gate | Utilities (Conditions).`);
  }
  return canEdit(actor, user) ? {ok: true, route: 'direct'} : refuse(`You don't own ${name}, so you can't change its conditions.`);
}

const hasStatus = (actor, id) => actor?.statuses?.has?.(id) === true;
async function change(decision, actor, statusId, active) {
  if (decision.route === 'utilities') {
    const u = utilitiesConditions();
    if (!u) throw new Error('Ashen Gate | Utilities is no longer active.');
    return active ? u.apply(decision.actorId, statusId) : u.remove(decision.actorId, statusId);
  }
  if (typeof actor?.toggleStatusEffect !== 'function') throw new Error('this Foundry version has no toggleStatusEffect()');
  return actor.toggleStatusEffect(statusId, {active});
}

/**
 * Apply: puts `statusId` on this character (mode 'self') or on every targeted token's Actor ('target'). Every target is
 * checked first; when one is refused nothing changes. Ones that already have it are skipped.
 */
export async function applyCondition(self, mode, statusId) {
  if (!canEdit(self)) return refuse(`You don't own ${self?.name ?? 'this character'}, so you can't use its conditions.`);
  const choices = conditionChoices(self), valid = new Set(choices.map(c => c.id));
  if (!statusId) return refuse('Pick a condition first.');
  if (!valid.has(statusId)) return refuse('Pick a condition from the list.');
  const targets = conditionTargets(self, mode);
  if (!targets.length) return refuse('Target a token first (hover it and press T, or right-click → Target), or switch to Self.');
  const todo = targets.filter(t => !hasStatus(t.actor, statusId));
  const label = choices.find(c => c.id === statusId)?.label ?? statusId;
  if (!todo.length) return {ok: true, result: {applied: [], label}};
  const plans = todo.map(t => ({t, d: conditionDecision({actor: t.actor, name: t.name, statusId, apply: true, valid})}));
  const no = plans.find(p => !p.d.ok);
  if (no) return no.d;
  for (const {t, d} of plans) {
    try { await change(d, t.actor, statusId, true); } catch (err) { return refuse(`${label} was not put on ${t.name}: ${err?.message ?? err}`); }
  }
  return {ok: true, result: {applied: plans.map(p => p.t.name), label}};
}

/** ✕ on a chip: takes `statusId` off this character or one of the current targets (`uuid` names which). */
export async function removeCondition(self, uuid, statusId) {
  if (!canEdit(self)) return refuse(`You don't own ${self?.name ?? 'this character'}, so you can't use its conditions.`);
  const valid = new Set(conditionChoices(self).map(c => c.id));
  const t = [...conditionTargets(self, 'self'), ...conditionTargets(self, 'target')].find(x => x.uuid === uuid);
  if (!t) return refuse('That token is no longer targeted.');
  if (!hasStatus(t.actor, statusId)) return {ok: true, result: null};
  const d = conditionDecision({actor: t.actor, name: t.name, statusId, apply: false, valid});
  if (!d.ok) return d;
  try { await change(d, t.actor, statusId, false); } catch (err) { return refuse(`Could not take it off ${t.name}: ${err?.message ?? err}`); }
  return {ok: true, result: t.name};
}

/** Chips: this character's conditions, then each target's (named), each with ✕ when this user may take it off. */
function chipsHtml(self, choices, off) {
  const valid = new Set(choices.map(c => c.id)), byId = new Map(choices.map(c => [c.id, c]));
  const seen = new Set(), rows = [];
  for (const t of [...conditionTargets(self, 'self'), ...conditionTargets(self, 'target')]) {
    if (seen.has(t.uuid)) continue;
    seen.add(t.uuid);
    for (const c of choices.filter(x => hasStatus(t.actor, x.id))) {
      const can = !off && conditionDecision({actor: t.actor, name: t.name, statusId: c.id, apply: false, valid}).ok;
      const what = t.self ? c.label : `${t.name}: ${c.label}`, take = `Take ${c.label} off ${t.name}`;
      rows.push(`<li class="${t.self ? 'is-self' : 'is-target'}">${byId.get(c.id)?.img ? `<img src="${esc(c.img)}" alt="">` : ''} ${esc(what)}${can
        ? `<button type="button" class="agch-placed__off" data-action="cond-remove" data-uuid="${esc(t.uuid)}" data-status="${esc(c.id)}" data-tooltip="${esc(take)}" aria-label="${esc(take)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ''}</li>`);
    }
  }
  return rows.length ? `<ul class="agch-placed" aria-label="Conditions on this character and your targets">${rows.join('')}</ul>` : '';
}

/**
 * The strip (Full and Compact): chips growing to the left, and in the right corner Self / Target, the condition list,
 * Apply and the title. `mode` and `pick` are the open Hub's choices (sheet.condMode, sheet.condPick).
 */
export function conditionsStripHtml(ctx) {
  const {actor, editable, sheet} = ctx, off = !editable;
  const choices = conditionChoices(actor);
  if (!choices.length) return '';
  const mode = cleanMode(sheet?.condMode), pick = choices.some(c => c.id === sheet?.condPick) ? sheet.condPick : '';
  const n = targetedTokens().length;
  const seg = m => {
    const on = m === mode, label = m === 'self' ? 'Self' : 'Target';
    const tip = m === 'self' ? `Put the condition on ${actor.name}` : `Put the condition on your targeted token${n === 1 ? '' : 's'} (${n ? `${n} now` : 'none yet: press T over a token'})`;
    return `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-action="cond-mode" data-mode="${m}" data-tooltip="${esc(tip)}"${off ? ' disabled' : ''}>${label}${m === 'target' && n ? ` <span class="ag-badge">${n}</span>` : ''}</button>`;
  };
  const select = `<select class="agch-conds__pick" data-edit="cond-pick" aria-label="Condition"${off ? ' disabled' : ''}><option value="">Condition…</option>${choices.map(c => `<option value="${esc(c.id)}"${c.id === pick ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`;
  const apply = `<button type="button" class="ag-btn ag-btn--sm agch-conds__apply" data-action="cond-apply" data-tooltip="${esc(mode === 'self' ? `Put the condition on ${actor.name}` : 'Put the condition on your targeted tokens')}"${off ? ' disabled' : ''}><i class="fa-solid fa-check" aria-hidden="true"></i><span>Apply</span></button>`;
  const help = 'Conditions: pick Self (this character) or Target (your targeted tokens, the same as marks), a condition, then Apply. ✕ on a chip takes it off. They are real Foundry conditions, so the token and the Condition Manager show them. Players follow the GM\'s condition rules in Ashen Gate | Utilities.';
  const chips = chipsHtml(actor, choices, off);
  return `<section class="agch-hotbar agch-hotbar--conds" aria-label="Conditions"><div class="agch-marks agch-conds">
    <div class="agch-marks__list">${chips || '<span class="agch-muted agch-marks__empty">No conditions</span>'}</div>
    <div class="agch-marks__end agch-conds__end"><span class="ag-segmented agch-conds__mode" role="radiogroup" aria-label="Put the condition on">${MODES.map(seg).join('')}</span>${select}${apply}
      <span class="agch-marks__title">Conditions</span><button type="button" class="agch-marks__help" data-tooltip="${esc(help)}" aria-label="${esc(help)}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button></div></div></section>`;
}
