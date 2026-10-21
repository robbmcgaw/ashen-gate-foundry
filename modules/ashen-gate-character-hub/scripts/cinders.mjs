/**
 * Strain bar and the Cinders panel, read only through Ashen Gate | Cinders' public API (game.modules.get('ashen-gate-cinders').api:
 * strain, contract ag-strain/1, and cinder, contract ag-cinder/1). The Hub stores nothing: Strain and Cinders stay Cinders' state.
 * Players only see their own character (Cinders refuses others); Strain changes for players happen only through allowed actions
 * (a Push); the GM gets − / + here, each recorded with a reason by Cinders.
 * 0.19.0: each Cinder's sockets are shown read-only from Cinders' api.sockets (contract ag-sockets/1, Cinders 0.3.0+);
 * attaching, detaching and swapping happen in Cinders.
 */
import {MODULE_ID, esc, num} from './constants.mjs';
import {btn} from './buttons.mjs';

export const CINDERS_ID = 'ashen-gate-cinders';
const cindersApi = () => {const m = globalThis.game?.modules?.get?.(CINDERS_ID);return m?.active ? m.api ?? null : null;};
/** api.strain when Cinders is active and offers the expected contract, else null. */
export const strainApi = () => {const s = cindersApi()?.strain;return s?.contract === 'ag-strain/1' ? s : null;};
const cinderApi = () => {const c = cindersApi()?.cinder;return c?.contract === 'ag-cinder/1' ? c : null;};
const isGM = () => globalThis.game?.user?.isGM === true;
const refuse = error => ({ok: false, error});

/** Bar model: fills to the guarantee point (10), then says how far past it the character is. Null when Strain can't be read. */
export function strainModel(actor) {
  const api = strainApi();
  if (!api || !actor) return null;
  let s;
  try { s = api.get(actor); } catch { return null; }
  const top = Math.max(1, num(s.guaranteeAt) || 10), value = num(s.value), over = Math.max(0, value - top);
  return {value, top, over, fill: Math.round(Math.min(value, top) / top * 100), label: over ? `${value} / ${top}+` : `${value} / ${top}`,
    band: String(s.band?.label ?? ''), chance: num(s.chance), guaranteed: s.guaranteed === true, normalUseBackfires: s.normalUseBackfires === true};
}

/** The Strain row under hit points. GM: − and + (one step each, recorded by Cinders with a reason). */
export function strainHtml(actor, off) {
  const m = strainModel(actor);
  if (!m) return '';
  const tip = `Strain ${m.label}: ${m.band}. Backfire on a Push from here: ${m.chance}%${m.guaranteed ? ' (guaranteed)' : ''}${m.normalUseBackfires ? '. Every use of a Cinder power backfires at this Strain' : ''}.`;
  const gm = isGM() && !off;
  return `<div class="agch-strain${m.over ? ' is-over' : ''}" role="group" aria-label="Strain">
    <span class="agch-strain__label"><i class="fa-solid fa-fire" aria-hidden="true"></i> Strain</span>
    ${gm ? btn('strain-step', '', {kind: 'ghost', icon: 'fa-solid fa-minus', data: {step: -1}, title: 'Remove 1 Strain (GM, recorded)', disabled: m.value <= 0}) : ''}
    <span class="agch-strain__bar" role="meter" aria-valuemin="0" aria-valuemax="${m.top}" aria-valuenow="${m.value}" aria-label="${esc(tip)}" title="${esc(tip)}">
      <span class="agch-strain__fill" style="width:${m.fill}%"></span><span class="agch-strain__text">${esc(m.label)}</span></span>
    ${gm ? btn('strain-step', '', {kind: 'ghost', icon: 'fa-solid fa-plus', data: {step: 1}, title: 'Add 1 Strain (GM, recorded)'}) : ''}
    <span class="agch-strain__band">${esc(m.band)}</span><span class="agch-strain__chance" title="Backfire chance on a Push from this Strain">${m.chance}%</span>
    ${m.over ? `<span class="ag-badge ag-badge--danger">+${m.over} over</span>` : ''}
  </div>`;
}

/** GM only: one step of Strain up or down through Cinders' api.strain (source: this module, kind gm, with a reason). */
export async function stepStrain(actor, step) {
  if (!isGM()) return refuse('Only the GM can change Strain here.');
  const api = strainApi();
  if (!api) return refuse('Ashen Gate | Cinders is not active.');
  const op = Number(step) < 0 ? 'remove' : 'add';
  try { return {ok: true, result: await api[op](actor, 1, {source: {module: MODULE_ID, kind: 'gm'}, reason: 'GM adjustment (Character Hub)'})}; }
  catch (error) { return refuse(String(error?.message ?? error)); }
}

const TARGET_WORDS = {'push.cost': 'Push cost', 'backfire.chance': 'Backfire chance', 'backfire.severity': 'Backfire severity', 'strain.recovery': 'rest recovery', 'sockets.count': 'sockets'};
const signed = v => `${num(v) > 0 ? '+' : ''}${num(v)}`;
/** The character's Cinder sockets by instance id, read through api.sockets.hosts. Empty when Cinders is older or refuses. */
export function socketHosts(actor, api) {
  const s = api?.sockets;
  if (s?.contract !== 'ag-sockets/1' || typeof s.hosts !== 'function') return new Map();
  try { return new Map((s.hosts(actor) ?? []).map(h => [h.instanceId, h])); } catch { return new Map(); }
}
/** Read-only sockets of one Cinder: what is attached, which items are active, and empty sockets. */
export function socketsHtml(h) {
  if (!h) return '';
  const capacity = num(h.capacity), slots = Array.isArray(h.slots) ? h.slots : [], used = slots.filter(x => x.active).length;
  const items = slots.map(x => {
    const effects = (x.modifiers ?? []).map(m => `${m.label}: ${TARGET_WORDS[m.target] ?? m.target} ${signed(m.value)}`).join(' · ');
    return `<li class="agch-socket${x.active ? '' : ' is-inactive'}"><span><strong>${esc(x.name)}</strong>${x.active ? '' : ' <span class="ag-badge ag-badge--danger">inactive: over capacity</span>'}${effects ? `<br><span class="agch-muted">${esc(effects)}</span>` : ''}</span></li>`;
  });
  for (let i = 0; i < num(h.free); i++) items.push('<li class="agch-socket is-empty"><span class="agch-muted">Empty socket</span></li>');
  const head = `<p class="agch-cinder__sockets-head"><strong>Sockets</strong> <span class="agch-muted">${used} of ${capacity} in use${h.locked ? ' · locked by the GM' : ''}</span></p>`;
  return `<div class="agch-cinder__sockets" aria-label="Sockets">${head}${items.length ? `<ul class="agch-plist">${items.join('')}</ul>` : '<p class="agch-muted">This Cinder has no sockets.</p>'}
    ${slots.some(x => !x.active) ? '<p class="agch-muted">More items are attached than this Cinder has sockets; the extra ones do nothing until one is removed.</p>' : ''}
    <p class="agch-muted">Attach, swap or detach socket items in the Cinders window.</p></div>`;
}

/** Cinders panel summary: each Cinder the character bears, its powers and their Push modes with cost and Backfire chance, and its sockets. */
export function cindersSummary(actor, api) {
  const c = api?.cinder;
  if (c?.contract !== 'ag-cinder/1') return '<p class="agch-muted">Update Ashen Gate | Cinders to see Cinders here.</p>';
  const list = c.list(actor) ?? [];
  const sockets = socketHosts(actor, api);
  if (!list.length) return '<p class="agch-muted">No Cinder bound to this character.</p>';
  return list.map(ci => {
    const powers = (ci.powers ?? []).map(p => `<li><strong>${esc(p.name)}</strong>${p.standard ? ` <span class="agch-muted">${esc(p.standard)}</span>` : ''}
      ${(p.modes ?? []).length ? `<ul class="agch-plist agch-cinder__modes">${p.modes.map(m => `<li><span>${esc(m.label)} <span class="agch-muted">+${num(m.cost)} Strain → ${num(m.after)} · Backfire ${num(m.chance)}%${m.guaranteed ? ' (guaranteed)' : ''}</span></span>
        ${btn('cinder-push', 'Push', {kind: 'sm', icon: 'fa-solid fa-fire', data: {instance: ci.instanceId, power: p.powerId, mode: m.id}, title: `Push ${p.name}: ${m.label}`})}</li>`).join('')}</ul>` : ''}</li>`).join('');
    const perks = (ci.enhancements ?? []).map(e => esc(e.name)).join(', ');
    return `<div class="agch-cinder"><h4>${esc(ci.name)}</h4>${powers ? `<ul class="agch-plist">${powers}</ul>` : '<p class="agch-muted">No powers unlocked yet (Skill Trees).</p>'}${perks ? `<p class="agch-muted">Perks: ${perks}</p>` : ''}${socketsHtml(sockets.get(ci.instanceId))}</div>`;
  }).join('');
}

/** Push from the Hub: Cinders' own preview, a confirmation, then Cinders' push (a player's is rolled by the GM client). */
export async function pushFromHub(actor, data, confirm) {
  const api = cinderApi();
  if (!api) return refuse('Ashen Gate | Cinders is not active.');
  try {
    const pv = api.previewPush(actor, data.instance, data.power, data.mode);
    const mods = (pv.modifiers ?? []).length ? `<p>Modifiers: ${pv.modifiers.map(m => esc(`${m.label} (${m.value > 0 ? '+' : ''}${m.value})`)).join(', ')}</p>` : '';
    const ok = await confirm(`<p><strong>${esc(pv.powerName)}: ${esc(pv.label)}</strong></p>${pv.effect ? `<p>${esc(pv.effect)}</p>` : ''}<p>Strain ${num(pv.strain)} → <strong>${num(pv.after)}</strong> (+${num(pv.cost)}). Backfire chance <strong>${num(pv.chance)}%</strong>${pv.guaranteed ? ' (guaranteed)' : ''}.</p>${mods}<p>Every Push gains Strain. The result is posted to chat.</p>`);
    if (!ok) return {ok: true, result: null};
    return {ok: true, result: await api.push(actor, data.power, data.mode)};
  } catch (error) { return refuse(String(error?.message ?? error)); }
}
