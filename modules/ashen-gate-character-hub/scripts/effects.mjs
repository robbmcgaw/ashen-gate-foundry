/**
 * Effects tab (0.68.0): the character's Active Effects, like the Effects tab of the standard dnd5e 6.0.6 character sheet.
 *
 * What it lists: Actor#allApplicableEffects() (the Actor's own effects plus the transferred effects of its Items), grouped by dnd5e's own
 * EffectsElement.prepareCategories (Temporary, Passive, Inactive, Unavailable, and the enchantment groups when there are any). When that
 * helper is missing the Hub groups the same way itself (fallbackCategories). Each row: icon, name, source, duration (temporary effects),
 * an on/off switch (effect.disabled, saved at once) and Edit / Delete for the Actor's own effects.
 *
 * Who may do what (decided in effectAccess, which every action calls again; hiding a button is only a courtesy):
 *   - owners and the GM: toggle, add, edit, delete. Observers and Limited viewers see the list and nothing else.
 *   - the document's own permission is checked too (canUserModify), so a player cannot reach an effect they could not edit natively.
 *   - an effect transferred from an Item belongs to the Item: toggle and edit work (as on the native sheet), Delete is refused with
 *     "comes from <item>: edit it there".
 *   - a concentration effect is ended from dnd5e's concentration control, as on the native sheet: no toggle, no delete.
 *   - effects Ashen Gate modules manage (any flag scope starting "ashen-gate": Cinders, Strain, Skill Trees, marks ...) are the GM's to change,
 *     like the managed Items in row-delete.mjs.
 *   - a status effect (a condition) follows the Conditions strip's rule (conditions.mjs conditionDecision: Utilities' Player Access).
 */
import {esc} from './constants.mjs';
import {btn} from './buttons.mjs';
import {canEdit} from './actions.mjs';
import {confirmDanger} from './ag-dialogs.mjs';
import {conditionDecision} from './conditions.mjs';
import {sectionHtml, sectionKey} from './collapse.mjs';

const refuse = error => ({ok: false, error});
const done = (result = null) => ({ok: true, result});
const isGM = user => (user ?? globalThis.game?.user)?.isGM === true;
const loc = (key, fallback) => { try { const v = globalThis.game?.i18n?.localize?.(key); return v && v !== key ? v : fallback; } catch { return fallback; } };

/** Category order and the labels used when dnd5e's helper is missing (its own labels win otherwise). */
export const CATEGORY_ORDER = ['enchantment', 'temporary', 'activeEnchantment', 'passive', 'inactiveEnchantment', 'inactive', 'suppressed'];
const FALLBACK_LABELS = {enchantment: 'Enchantments', temporary: 'Temporary Effects', activeEnchantment: 'Active Enchantments', passive: 'Passive Effects', inactiveEnchantment: 'Inactive Enchantments', inactive: 'Inactive Effects', suppressed: 'Unavailable Effects'};
const ALWAYS_SHOWN = new Set(['temporary', 'passive', 'inactive']);

/** All effects that apply to the character (its own and its Items' transferred ones). */
export function allEffects(actor) {
  try { return typeof actor?.allApplicableEffects === 'function' ? [...actor.allApplicableEffects()] : [...(actor?.effects ?? [])]; } catch { return []; }
}
/** The effect with this id on the Actor, or on the Item `parentId` when given. */
export function findEffect(actor, id, parentId = '') {
  if (!id) return null;
  const coll = parentId ? actor?.items?.get?.(parentId)?.effects : actor?.effects;
  return coll?.get?.(id) ?? null;
}
export const isItemEffect = effect => effect?.parent?.documentName === 'Item';
const parentItem = effect => (isItemEffect(effect) ? effect.parent : null);

/** The same grouping as dnd5e's EffectsElement.prepareCategories, used only when dnd5e's helper cannot be reached. */
export function fallbackCategories(effects) {
  const cats = Object.fromEntries(CATEGORY_ORDER.map(type => [type, {type, label: FALLBACK_LABELS[type], effects: [], hidden: !ALWAYS_SHOWN.has(type)}]));
  for (const e of effects) {
    if (e.isConcealed) continue;
    if (e.type === 'condition' && !e.statuses?.has?.('concentrating')) continue;
    if (e.isAppliedEnchantment) (e.disabled || e.duration?.expired ? cats.inactiveEnchantment : cats.activeEnchantment).effects.push(e);
    else if (e.type === 'enchantment') cats.enchantment.effects.push(e);
    else if (e.duration?.expired) cats.inactive.effects.push(e);
    else if (e.isSuppressed) cats.suppressed.effects.push(e);
    else if (e.disabled) cats.inactive.effects.push(e);
    else if (e.isTemporary) cats.temporary.effects.push(e);
    else cats.passive.effects.push(e);
  }
  for (const c of Object.values(cats)) if (c.effects.length) c.hidden = false;
  return cats;
}
/** dnd5e's own EffectsElement.prepareCategories when this dnd5e exposes it (the custom element registered as dnd5e-effects). */
export function dnd5eCategoriesFn() {
  const fn = globalThis.customElements?.get?.('dnd5e-effects')?.prepareCategories;
  return typeof fn === 'function' ? fn : null;
}
/** The categories in display order, each {type, label, effects, hidden?, info?}. */
export function categoriesFor(actor, effects = allEffects(actor)) {
  let cats = null;
  const prepare = dnd5eCategoriesFn();
  if (prepare) { try { cats = prepare(effects, {parent: actor}); } catch (err) { console.warn('ashen-gate-character-hub | dnd5e effect categories', err); } }
  cats ??= fallbackCategories(effects);
  return CATEGORY_ORDER.map(k => cats[k]).filter(Boolean).map(c => ({...c, type: c.type ?? '', label: c.label || FALLBACK_LABELS[c.type] || 'Effects', effects: [...(c.effects ?? [])]}));
}

// ---------- Rules (the data layer) ----------

const isConcentration = (actor, effect) => { try { return actor?.concentration?.effects?.has?.(effect) === true; } catch { return false; } };
/** The Ashen Gate module scope that manages this effect (a flag scope starting "ashen-gate"), or ''. */
export const managedBy = effect => Object.keys(effect?.flags ?? {}).find(k => /^ashen-gate/.test(k) && effect.flags[k] && typeof effect.flags[k] === 'object' && Object.keys(effect.flags[k]).length) ?? '';
const statusIds = effect => { try { return [...(effect?.statuses ?? [])].filter(s => s !== 'concentrating'); } catch { return []; } };
const docAllows = (effect, user, action) => { try { return typeof effect?.canUserModify === 'function' ? effect.canUserModify(user, action) !== false : true; } catch { return true; } };

/**
 * What `user` may do with this effect on `actor`: {toggle, edit, delete}, each {ok: true} or {ok: false, reason}.
 * Every action runs this again, so a hidden or enabled button changes nothing about what is allowed.
 */
export function effectAccess(actor, effect, user = globalThis.game?.user) {
  const no = reason => ({ok: false, reason}), yes = {ok: true};
  if (!actor || !effect) return {toggle: no('That effect is gone.'), edit: no('That effect is gone.'), delete: no('That effect is gone.')};
  if (!canEdit(actor, user)) { const r = `You don't own ${actor.name ?? 'this character'}, so you can only look at its effects.`; return {toggle: no(r), edit: no(r), delete: no(r)}; }
  const gm = isGM(user), item = parentItem(effect), out = {toggle: yes, edit: yes, delete: yes};
  if (!docAllows(effect, user, 'update')) { out.toggle = no(`You can't change ${effect.name}.`); out.edit = out.toggle; }
  if (!docAllows(effect, user, 'delete')) out.delete = no(`You can't delete ${effect.name}.`);
  if (isConcentration(actor, effect)) {
    out.toggle = no('Concentration ends from the concentration control or the spell, not here.');
    out.delete = out.toggle;
  }
  if (item && out.delete.ok) out.delete = no(`${effect.name} comes from ${item.name}: edit it there.`);
  const managed = managedBy(effect);
  if (managed && !gm) {
    const r = `${effect.name} is managed by an Ashen Gate module. Ask your GM to change it.`;
    for (const k of ['toggle', 'edit', 'delete']) if (out[k].ok) out[k] = no(r);
  }
  const statuses = statusIds(effect);
  if (statuses.length && !gm) {
    for (const [k, apply] of [['toggle', effect.disabled === true], ['edit', false], ['delete', false]]) {
      if (!out[k].ok) continue;
      const bad = statuses.map(statusId => conditionDecision({actor, statusId, apply, user})).find(d => !d.ok);
      if (bad) out[k] = no(bad.error);
    }
  }
  return out;
}

/** The effect and the permission for one action, or a refusal. */
function resolve(actor, id, parentId, action, user) {
  const effect = findEffect(actor, id, parentId);
  if (!effect) return refuse('That effect is no longer on this character.');
  const access = effectAccess(actor, effect, user)[action];
  return access.ok ? {ok: true, effect} : refuse(access.reason);
}

/** Turns an effect on or off (effect.disabled), saved at once. */
export async function toggleEffect(actor, id, {parentId = '', user = globalThis.game?.user} = {}) {
  const r = resolve(actor, id, parentId, 'toggle', user);
  if (!r.ok) return r;
  try { await r.effect.update({disabled: !r.effect.disabled}); return done(!r.effect.disabled); } catch (err) {
    console.error('ashen-gate-character-hub | toggle effect', err);
    return refuse(`Could not change ${r.effect.name}: ${err?.message ?? err}`);
  }
}
/** Opens Foundry's / dnd5e's own configuration window for the effect (no custom change editor). */
export async function editEffect(actor, id, {parentId = '', user = globalThis.game?.user} = {}) {
  const r = resolve(actor, id, parentId, 'edit', user);
  if (!r.ok) return r;
  try { await r.effect.sheet.render({force: true}); return done(id); } catch (err) {
    console.error('ashen-gate-character-hub | edit effect', err);
    return refuse(`Could not open ${r.effect.name}: ${err?.message ?? err}`);
  }
}
/** Why `user` cannot add an effect to the character, or '' when they can. */
export function addReason(actor, user = globalThis.game?.user) {
  if (!actor) return 'There is no character.';
  if (!canEdit(actor, user)) return `You don't own ${actor.name ?? 'this character'}, so you can't add effects.`;
  try { if (typeof actor.canUserModify === 'function' && actor.canUserModify(user, 'update') === false) return `You can't change ${actor.name}.`; } catch { /* the owner check above stands */ }
  return '';
}
/** A new plain effect on the character, with its native configuration window open (what the native Effects tab's + does). */
export async function addEffect(actor, {user = globalThis.game?.user} = {}) {
  const why = addReason(actor, user);
  if (why) return refuse(why);
  try {
    const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{name: loc('DND5E.EFFECT.New', 'New Effect'), icon: 'icons/svg/aura.svg'}], {renderSheet: true});
    return done(effect?.id ?? null);
  } catch (err) {
    console.error('ashen-gate-character-hub | add effect', err);
    return refuse(`Could not add an effect: ${err?.message ?? err}`);
  }
}
/** Deletes an effect on the Actor after a "Delete <name>?" confirmation (Cancel is the default). */
export async function deleteEffect(actor, id, {parentId = '', user = globalThis.game?.user, confirm = confirmDanger} = {}) {
  const r = resolve(actor, id, parentId, 'delete', user);
  if (!r.ok) return r;
  const {effect} = r, warn = managedBy(effect) ? `${effect.name} is managed by an Ashen Gate module, which may put it back or lose track of it.\n\n` : '';
  try {
    const ok = await confirm(`${warn}This removes it from ${actor.name}.`, {title: `Delete ${effect.name}?`, yes: 'Delete effect'});
    if (!ok) return done(null);
    await effect.delete();
    return done(id);
  } catch (err) {
    console.error('ashen-gate-character-hub | delete effect', err);
    return refuse(`Could not delete ${effect.name}: ${err?.message ?? err}`);
  }
}

// ---------- Rows ----------

/** Where the effect comes from: the Item that carries it, the Actor for one added by hand, else the origin document's name. */
export function sourceOf(effect, actor) {
  const item = parentItem(effect);
  if (item) return {name: item.name ?? 'an item', kind: 'item'};
  if (!effect.origin) return {name: actor?.name ?? 'This character', kind: 'actor'};
  let origin = null;
  try { origin = globalThis.fromUuidSync?.(effect.origin) ?? null; } catch { origin = null; }
  if (origin?.documentName === 'ActiveEffect') origin = origin.parent?.documentName === 'Item' ? origin.parent.parent ?? origin.parent : origin.parent;
  if (origin?.documentName === 'Actor' && origin === actor) return {name: actor.name, kind: 'actor'};
  const name = origin?.name ?? effect.sourceName;
  return {name: name && name !== 'None' ? name : 'Unknown', kind: origin?.documentName === 'Actor' ? 'actor' : 'other'};
}
/** The remaining duration of a temporary effect, as dnd5e words it, or ''. */
export function durationText(effect) {
  try {
    if (!effect.isTemporary) return '';
    effect.updateDuration?.();
    const parts = typeof effect.getDurationParts === 'function' ? effect.getDurationParts() : [effect.duration?.label];
    return (parts ?? []).filter(Boolean).join(', ');
  } catch { return ''; }
}
/** One row's facts for the view and the tests. */
export function effectRow(actor, effect, user = globalThis.game?.user) {
  const item = parentItem(effect), access = effectAccess(actor, effect, user);
  return {id: effect.id, parentId: item?.id ?? '', name: effect.name || 'Unnamed effect', img: effect.img ?? effect.icon ?? 'icons/svg/aura.svg', disabled: effect.disabled === true,
    suppressed: effect.isSuppressed === true, source: sourceOf(effect, actor), duration: durationText(effect), transferred: !!item, itemName: item?.name ?? '',
    concentration: isConcentration(actor, effect), managed: !!managedBy(effect), access};
}
/** The tab's data: categories (shown ones) with their rows, and the total. */
export function effectsData(actor, user = globalThis.game?.user) {
  const cats = categoriesFor(actor).filter(c => !c.hidden || c.effects.length).map(c => ({type: c.type, label: c.label, info: c.info ?? '', rows: c.effects.map(e => effectRow(actor, e, user))}));
  return {categories: cats, total: cats.reduce((n, c) => n + c.rows.length, 0)};
}

// ---------- View ----------

const rowKey = r => `${r.parentId}:${r.id}`;
function switchHtml(r, editable) {
  const ok = editable && r.access.toggle.ok, why = !editable ? '' : r.access.toggle.reason ?? '';
  const label = `${r.name}: ${r.disabled ? 'off' : 'on'}`;
  return `<button type="button" role="switch" class="agch-fxswitch${r.disabled ? '' : ' is-on'}" data-action="effect-toggle" data-id="${esc(r.id)}" data-parent="${esc(r.parentId)}" aria-checked="${!r.disabled}" aria-label="${esc(label)}"${why ? ` data-tooltip="${esc(why)}"` : ` data-tooltip="${r.disabled ? 'Turn on' : 'Turn off'} ${esc(r.name)}"`}${ok ? '' : ' disabled'}><span class="agch-fxswitch__knob" aria-hidden="true"></span><span class="ag-sr-only">${r.disabled ? 'Off' : 'On'}</span></button>`;
}
function rowHtml(r, editable) {
  const note = r.transferred ? `Comes from ${r.itemName}: edit it there.` : r.concentration ? 'Concentration: end it from the concentration control.' : r.managed ? 'Managed by an Ashen Gate module.' : '';
  const edit = editable ? btn('effect-edit', '', {kind: 'ghost', icon: 'fa-solid fa-pen-to-square', data: {id: r.id, parent: r.parentId}, title: r.access.edit.ok ? `Edit ${r.name}…` : r.access.edit.reason, aria: `Edit ${r.name}`, disabled: !r.access.edit.ok}) : '';
  const del = editable ? btn('effect-delete', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {id: r.id, parent: r.parentId}, title: r.access.delete.ok ? `Delete ${r.name}…` : r.access.delete.reason, aria: `Delete ${r.name}`, disabled: !r.access.delete.ok}) : '';
  const state = r.suppressed ? '<span class="ag-badge">Unavailable</span>' : '';
  return `<li class="agch-fxrow${r.disabled ? ' is-off' : ''}" data-effect-key="${esc(rowKey(r))}">
    <img class="agch-fxrow__icon" src="${esc(r.img)}" alt="" width="28" height="28">
    <span class="agch-fxrow__main"><span class="agch-fxrow__name">${esc(r.name)}</span> ${state}${note ? `<span class="agch-muted agch-fxrow__note">${esc(note)}</span>` : ''}</span>
    <span class="agch-fxrow__source" data-tooltip="Source"><i class="fa-solid ${r.source.kind === 'item' ? 'fa-suitcase' : r.source.kind === 'actor' ? 'fa-user' : 'fa-link'}" aria-hidden="true"></i> <span class="ag-sr-only">Source: </span>${esc(r.source.name)}</span>
    <span class="agch-fxrow__dur">${r.duration ? `<i class="fa-solid fa-clock" aria-hidden="true"></i> <span class="ag-sr-only">Duration: </span>${esc(r.duration)}` : ''}</span>
    <span class="agch-fxrow__ctl">${switchHtml(r, editable)}${edit}${del}</span></li>`;
}
/** The Effects tab. `ctx.editable` is the Hub's own owner / GM check; each control also carries its own access result. */
export function effectsTab(ctx) {
  const {actor, editable} = ctx, d = effectsData(actor), why = editable ? addReason(actor) : (addReason(actor) || 'You can only add to a character you own.');
  const add = btn('effect-add', 'Add effect', {kind: 'sm', icon: 'fa-solid fa-plus', title: why || 'Add a new effect to this character', aria: 'Add effect', disabled: !!why});
  const head = '<div class="agch-fxhead" aria-hidden="true"><span></span><span>Effect</span><span>Source</span><span>Duration</span><span>On / off</span></div>';
  const sections = d.categories.map(c => sectionHtml(sectionKey('effects', c.type), `${esc(c.label)} <span class="ag-badge">${c.rows.length}</span>`,
    `${c.info ? `<p class="agch-muted">${esc(c.info)}</p>` : ''}${c.rows.length ? `<ul class="agch-fxlist" aria-label="${esc(c.label)}">${c.rows.map(r => rowHtml(r, editable)).join('')}</ul>` : '<p class="agch-muted agch-fxnone">None.</p>'}`)).join('');
  const body = d.total ? `${head}${sections}` : `<div class="ag-empty"><p class="ag-empty__title">No effects on this character.</p><p class="ag-empty__text">Spells, features, items and the GM add effects here. ${editable ? 'Use Add effect to make one yourself.' : ''}</p>${editable ? add : ''}</div>`;
  return `<div class="agch-sticky"><div class="ag-toolbar agch-toolbar"><span class="ag-badge" data-tooltip="Turning an effect on or off saves at once">Switches apply now</span><div class="ag-toolbar__end">${d.total || !editable ? add : ''}</div></div></div>${body}
    <p class="agch-muted agch-hint">The switch turns an effect on or off at once. Edit opens dnd5e's own effect window. An effect that comes from an item is changed on the item; you can still switch it here. Conditions are on the Conditions strip at the bottom.</p>`;
}
