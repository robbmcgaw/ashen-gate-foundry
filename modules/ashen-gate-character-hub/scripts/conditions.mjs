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
 *   - a player, with Utilities' conditions API (contract ag-utilities-conditions/1): Utilities' rule decides (0.46.1: their own
 *     character and any actor that is not a player's character; the GM or a condition controller for another player's),
 *     through its canApply / canRemove / canChangeActor, and
 *     Utilities' apply / remove carry the change out (on the GM client when needed). Utilities works on world
 *     characters, so a token that is not linked to one is left to the GM;
 *   - a player without Utilities: only on characters they own (as the Hub's Conditions box allowed before).
 */
import {esc, dnd5eConfig, labelOf, MODULE_ID as MODULE_ID_FOR_SETTINGS} from './constants.mjs';
import {canEdit} from './actions.mjs';
import {conditionsData} from './data.mjs';
import {targetedTokens, requestGM} from './marks.mjs';
import {requirePart} from './visibility.mjs';

const refuse = error => ({ok: false, error});
const RECENT_SETTING = 'recentConditions', RECENT_MAX = 4;
const isGM = (user = globalThis.game?.user) => user?.isGM === true;
export const MODES = ['self', 'target'];
export const cleanMode = mode => mode === 'target' ? 'target' : 'self';

/**
 * The conditions offered. With Ashen Gate | Utilities active this is Utilities' own list (api.conditions.choices, the one its
 * tracker offers too, 0.45.2); otherwise dnd5e's list (conditionTypes) that are also Foundry status effects, by label.
 */
export function conditionChoices(actor) {
  let shared = null;
  try { shared = utilitiesConditions()?.choices?.(); } catch { shared = null; }
  if (Array.isArray(shared) && shared.length) return shared.filter(c => c?.id).map(({id, label, img}) => ({id, label: label || id, img: img || ''}));
  const base = conditionsData(actor ?? {}).map(({id, label, img}) => ({id, label, img}));
  // 0.46.1: Exhaustion is offered too (Utilities' tracker offers it), put on and off with the same toggleStatusEffect.
  const ex = statusConfigFor('exhaustion');
  if (ex && !base.some(c => c.id === 'exhaustion')) base.push({id: 'exhaustion', label: dnd5eConfig().conditionTypes?.exhaustion?.label ? labelOf(dnd5eConfig().conditionTypes.exhaustion) : 'Exhaustion', img: ex.img ?? ex.icon ?? ''});
  return base.sort((a, b) => a.label.localeCompare(b.label));
}
const statusConfigFor = id => { const reg = globalThis.CONFIG?.statusEffects; const list = Array.isArray(reg) ? reg : Object.entries(reg ?? {}).map(([k, v]) => ({...v, id: v?.id ?? k})); return list.find(e => e?.id === id) ?? null; };

/** The last conditions this user put on (most recent first), for one-click chips. Per browser (a client setting). */
export function recentConditions() {
  try { const v = globalThis.game?.settings?.get?.(MODULE_ID_FOR_SETTINGS, RECENT_SETTING); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
export async function rememberCondition(statusId) {
  try { await globalThis.game?.settings?.set?.(MODULE_ID_FOR_SETTINGS, RECENT_SETTING, [statusId, ...recentConditions().filter(x => x !== statusId)].slice(0, RECENT_MAX)); } catch { /* a convenience only */ }
}
export const registerConditionSettings = settings => settings.register(MODULE_ID_FOR_SETTINGS, RECENT_SETTING, {scope: 'client', config: false, type: Array, default: []});

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
    return actor ? {actor, name: t.name ?? t.document?.name ?? actor.name, uuid: actor.uuid, self: false, token: t} : null;
  }).filter(Boolean);
}

/** Why a player is refused: another player's character, else Player Access (the GM's switch in Utilities). */
function refusalText(actor, name, apply, utilities) {
  let pc = false;
  try { pc = utilities?.isPlayerCharacter?.(actor) === true; } catch { pc = false; }
  const verb = apply ? 'put conditions on' : 'take conditions off';
  return pc ? `You can't ${verb} ${name}: it is another player's character, so only the GM can change its conditions.`
    : `You can't ${verb} ${name}: the GM decides that in Ashen Gate | Utilities (Player Access).`;
}
const callOk = fn => { try { return fn() === true; } catch { return false; } };
/**
 * Whether `user` may put on (apply) or take off a condition on `actor`, and how: {ok, route: 'direct' | 'utilities'}
 * or {ok: false, error}. Pure apart from Utilities' own checks.
 */
export function conditionDecision({actor, name = actor?.name ?? 'that character', statusId, apply = true, user = globalThis.game?.user, utilities = utilitiesConditions(), valid = null, token = null} = {}) {
  if (!actor) return refuse('That character or token is gone.');
  if (valid && !valid.has(statusId)) return refuse('Pick a condition from the list.');
  if (isGM(user)) return {ok: true, route: 'direct'};
  if (utilities) {
    const world = worldActor(actor);
    if (!world) {
      // 0.46.1: a token that is not linked to a character (a monster): Utilities' rule decides, the GM client makes the change.
      const can = token && callOk(() => utilities.canChangeActor(actor, statusId, apply));
      return can ? {ok: true, route: 'gm'} : refuse(refusalText(actor, name, apply, utilities));
    }
    const allowed = apply ? callOk(() => utilities.canApply(world.id, statusId)) : callOk(() => utilities.canRemove(world.id, statusId));
    return allowed ? {ok: true, route: 'utilities', actorId: world.id} : refuse(refusalText(actor, name, apply, utilities));
  }
  return canEdit(actor, user) ? {ok: true, route: 'direct'} : refuse(`You don't own ${name}, so you can't change its conditions.`);
}

const hasStatus = (actor, id) => actor?.statuses?.has?.(id) === true;
async function change(decision, actor, statusId, active, {self = null, token = null} = {}) {
  if (decision.route === 'gm') {
    return requestGM('condition-toggle', {sourceUuid: self?.uuid, sceneId: token?.document?.parent?.id ?? token?.scene?.id ?? globalThis.canvas?.scene?.id, tokenId: token?.document?.id ?? token?.id, statusId, active});
  }
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
  if (!todo.length) return {ok: true, result: {applied: [], already: targets.map(t => t.name), label}, notice: appliedNotice(label, [], targets.map(t => t.name))};
  const plans = todo.map(t => ({t, d: conditionDecision({actor: t.actor, name: t.name, statusId, apply: true, valid, token: t.token})}));
  const no = plans.find(p => !p.d.ok);
  if (no) return no.d;
  for (const {t, d} of plans) {
    try { const r = await change(d, t.actor, statusId, true, {self, token: t.token}); if (r?.ok === false) return refuse(`${label} was not put on ${t.name}: ${r.error}`); } catch (err) { return refuse(`${label} was not put on ${t.name}: ${err?.message ?? err}`); }
  }
  void rememberCondition(statusId);
  const already = targets.filter(t => !todo.includes(t)).map(t => t.name);
  return {ok: true, result: {applied: plans.map(p => p.t.name), already, label}, notice: appliedNotice(label, plans.map(p => p.t.name), already)};
}

/**
 * Puts `statusId` on one target {actor, name} (the same checks as Apply: the GM, Utilities' rules, or ownership).
 * Used by marks (Topple puts Prone on the target after a failed save). {ok, result: {applied, already, label}}.
 */
export async function applyStatusTo(self, t, statusId) {
  if (!canEdit(self)) return refuse(`You don't own ${self?.name ?? 'this character'}, so you can't use its conditions.`);
  const choices = conditionChoices(self), valid = new Set(choices.map(c => c.id));
  if (!valid.has(statusId)) return refuse('Pick a condition from the list.');
  const label = choices.find(c => c.id === statusId)?.label ?? statusId;
  if (hasStatus(t.actor, statusId)) return {ok: true, result: {applied: [], already: [t.name], label}};
  const d = conditionDecision({actor: t.actor, name: t.name, statusId, apply: true, valid, token: t.token});
  if (!d.ok) return d;
  try { const r = await change(d, t.actor, statusId, true, {self, token: t.token}); if (r?.ok === false) return refuse(`${label} was not put on ${t.name}: ${r.error}`); } catch (err) { return refuse(`${label} was not put on ${t.name}: ${err?.message ?? err}`); }
  return {ok: true, result: {applied: [t.name], already: [], label}};
}

/** ✕ on a chip: takes `statusId` off this character or one of the current targets (`uuid` names which). */
export async function removeCondition(self, uuid, statusId) {
  if (!canEdit(self)) return refuse(`You don't own ${self?.name ?? 'this character'}, so you can't use its conditions.`);
  const valid = new Set(conditionChoices(self).map(c => c.id));
  const t = [...conditionTargets(self, 'self'), ...conditionTargets(self, 'target')].find(x => x.uuid === uuid);
  if (!t) return refuse('That token is no longer targeted.');
  if (!hasStatus(t.actor, statusId)) return {ok: true, result: null, notice: 'It was already gone.'};
  const d = conditionDecision({actor: t.actor, name: t.name, statusId, apply: false, valid, token: t.token});
  if (!d.ok) return d;
  try { const r = await change(d, t.actor, statusId, false, {self, token: t.token}); if (r?.ok === false) return refuse(`Could not take it off ${t.name}: ${r.error}`); } catch (err) { return refuse(`Could not take it off ${t.name}: ${err?.message ?? err}`); }
  const label = conditionChoices(self).find(c => c.id === statusId)?.label ?? statusId;
  return {ok: true, result: t.name, notice: `${label} taken off ${t.name}.`};
}

/** The line the Hub shows after Apply: who got it, who already had it. */
export function appliedNotice(label, applied, already) {
  const a = applied.length ? `${label} put on ${applied.join(', ')}.` : '';
  const b = already.length ? `${already.join(', ')} already ${already.length === 1 ? 'has' : 'have'} ${label}.` : '';
  return [a, b].filter(Boolean).join(' ');
}

/**
 * GM side of a condition change on a token that is not linked to a character (marks' socket, same receipt). Checks the
 * requester again: they own the source character, the Hub hotbars are shown to them, the status is on the list, and Utilities'
 * rule allows them (their own character or any actor that is not a player's character, Player Access on).
 */
export async function conditionToggleOnGM(msg, user) {
  const g = globalThis.game;
  if (!user.isGM && requirePart('hotbars', user)) throw new Error('The GM has hidden the hotbars from players.');
  const source = globalThis.fromUuidSync?.(String(msg.sourceUuid ?? ''));
  if (source?.documentName !== 'Actor') throw new Error('Character not found.');
  if (!canEdit(source, user)) throw new Error(`You don't own ${source.name}.`);
  const target = g.scenes?.get?.(String(msg.sceneId ?? ''))?.tokens?.get?.(String(msg.tokenId ?? ''))?.actor;
  if (!target) throw new Error('That token is gone.');
  const statusId = String(msg.statusId ?? ''), active = msg.active === true;
  if (!conditionChoices(source).some(c => c.id === statusId)) throw new Error('Pick a condition from the list.');
  if (!user.isGM) {
    const u = utilitiesConditions();
    if (!u || typeof u.canChangeActor !== 'function') throw new Error('Ashen Gate | Utilities is needed to change conditions on a token that is not yours.');
    if (!callOk(() => u.canChangeActor(target, statusId, active, user.id))) throw new Error(refusalText(target, target.name, active, u));
  }
  await target.toggleStatusEffect(statusId, {active});
  if (hasStatus(target, statusId) !== active) throw new Error(`${target.name} still ${active ? 'does not have' : 'has'} it: another effect or module keeps it.`);
  return active ? 'applied' : 'removed';
}

/** Chips: this character's conditions, then each target's (named), each with ✕ when this user may take it off. */
function chipsHtml(self, choices, off) {
  const valid = new Set(choices.map(c => c.id)), byId = new Map(choices.map(c => [c.id, c]));
  const seen = new Set(), rows = [];
  for (const t of [...conditionTargets(self, 'self'), ...conditionTargets(self, 'target')]) {
    if (seen.has(t.uuid)) continue;
    seen.add(t.uuid);
    for (const c of choices.filter(x => hasStatus(t.actor, x.id))) {
      const can = !off && conditionDecision({actor: t.actor, name: t.name, statusId: c.id, apply: false, valid, token: t.token}).ok;
      const lvl = c.id === 'exhaustion' ? Number(t.actor?.system?.attributes?.exhaustion) : 0, cl = lvl > 0 ? `${c.label} ${lvl}` : c.label;
      const what = t.self ? cl : `${t.name}: ${cl}`, take = `Take ${c.label} off ${t.name}`;
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
  const recent = recentConditions().map(id => choices.find(c => c.id === id)).filter(Boolean);
  const quick = recent.length ? `<span class="agch-conds__recent" role="group" aria-label="Recent conditions">${recent.map(c => `<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agch-conds__quick" data-action="cond-quick" data-status="${esc(c.id)}" data-tooltip="${esc(`${c.label}: put it on ${mode === 'self' ? actor.name : 'your targeted tokens'} now`)}"${off ? ' disabled' : ''}>${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span>${esc(c.label)}</span></button>`).join('')}</span>` : '';
  const select = `<select class="agch-conds__pick" data-edit="cond-pick" aria-label="Condition"${off ? ' disabled' : ''}><option value="">Condition…</option>${choices.map(c => `<option value="${esc(c.id)}"${c.id === pick ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`;
  const apply = `<button type="button" class="ag-btn ag-btn--sm agch-conds__apply" data-action="cond-apply" data-tooltip="${esc(mode === 'self' ? `Put the condition on ${actor.name}` : 'Put the condition on your targeted tokens')}"${off ? ' disabled' : ''}><i class="fa-solid fa-check" aria-hidden="true"></i><span>Apply</span></button>`;
  const help = 'Conditions: pick Self (this character) or Target (your targeted tokens, the same as marks), a condition, then Apply (or click a recent condition for one click). ✕ on a chip takes it off. They are real Foundry conditions, so the token and the Condition Manager show them. Players follow the GM\'s condition rules in Ashen Gate | Utilities.';
  const chips = chipsHtml(actor, choices, off);
  return `<section class="agch-hotbar agch-hotbar--conds" aria-label="Conditions"><div class="agch-marks agch-conds">
    <div class="agch-marks__list">${chips || '<span class="agch-muted agch-marks__empty">No conditions</span>'}</div>
    <div class="agch-marks__end agch-conds__end"><span class="ag-segmented agch-conds__mode" role="radiogroup" aria-label="Put the condition on">${MODES.map(seg).join('')}</span>${quick}${select}${apply}
      <span class="agch-marks__title">Conditions</span><button type="button" class="agch-marks__help" data-tooltip="${esc(help)}" aria-label="${esc(help)}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button></div></div></section>`;
}
