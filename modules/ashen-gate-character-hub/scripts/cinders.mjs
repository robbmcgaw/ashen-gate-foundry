/**
 * Strain bar and the Cinders panel, read only through Ashen Gate | Cinders' public API (game.modules.get('ashen-gate-cinders').api:
 * strain, contract ag-strain/1, and cinder, contract ag-cinder/1). The Hub stores nothing: Strain and Cinders stay Cinders' state.
 * Players only see their own character (Cinders refuses others); Strain changes for players happen only through allowed actions
 * (a Push); the GM gets − / + here, each recorded with a reason by Cinders.
 * 0.19.0: each Cinder's sockets from Cinders' api.sockets (contract ag-sockets/1, Cinders 0.3.0+).
 * 0.24.0: a compact orb per Cinder (Cinders 0.6.0's look: Strain ring, art or default orb, socket dots) and Attach / Swap / Detach /
 * drop on each socket row through api.sockets. Cinders checks every change again; the Hub only offers what it would allow.
 * 0.31.0: Cinders 0.9.0's look on every mini orb (art on a still Strain-toned glow, turning slowly), a small orb + name per
 * Cinder in the character header (opens Ashen Gate → Cinders) and Open skill tree in the Cinders panel head.
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
  // Kit meter: the number sits beside the track (never on the fill); the tone follows the band (warn, then danger).
  const tone = m.over || m.guaranteed ? 'danger' : m.chance > 0 ? 'warn' : '';
  return `<div class="agch-strain${m.over ? ' is-over' : ''}" role="group" aria-label="Strain">
    <span class="agch-strain__label"><i class="fa-solid fa-fire" aria-hidden="true"></i> Strain</span>
    ${gm ? btn('strain-step', '', {kind: 'ghost', extra: 'ag-btn--icon ag-btn--sm', icon: 'fa-solid fa-minus', data: {step: -1}, title: 'Remove 1 Strain (GM, recorded)', disabled: m.value <= 0}) : ''}
    <span class="ag-meter${tone ? ` ag-meter--${tone}` : ''} agch-strain__meter" data-tooltip="${esc(tip)}"><span class="ag-meter__track agch-strain__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.top}" aria-valuenow="${Math.min(m.value, m.top)}" aria-valuetext="${esc(m.label)}" aria-label="${esc(tip)}" style="--ag-meter:${m.fill}%"><span class="ag-meter__fill agch-strain__fill"></span></span></span>
    <span class="ag-meter__value agch-strain__text">${esc(m.label)}</span>
    ${gm ? btn('strain-step', '', {kind: 'ghost', extra: 'ag-btn--icon ag-btn--sm', icon: 'fa-solid fa-plus', data: {step: 1}, title: 'Add 1 Strain (GM, recorded)'}) : ''}
    <span class="agch-strain__band">${esc(m.band)}</span><span class="agch-strain__chance" data-tooltip="Backfire chance on a Push from this Strain">${m.chance}%</span>
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

/**
 * Strain next to hit points (0.30.0): a compact read-only pill in the HP block (small bar, value, band; hover for the
 * Push Backfire chance). Used where the GM's − / + row is not shown, i.e. for players. Nothing when Strain can't be read.
 */
export function strainPillHtml(actor, {steps = false} = {}) {
  const m = strainModel(actor);
  if (!m) return '';
  const gm = steps && isGM();
  const tone = m.over || m.guaranteed ? 'danger' : m.chance > 0 ? 'warn' : '';
  const tip = `Strain ${m.label}${m.band ? `: ${m.band}` : ''}. Backfire on a Push from here: ${m.chance}%${m.guaranteed ? ' (guaranteed)' : ''}${m.normalUseBackfires ? '. Every use of a Cinder power backfires at this Strain' : ''}.${gm ? '' : ' Read only.'}`;
  // 0.34.0: Compact's GM pill carries − and + (the Strain row is left out there), like the exhaustion pill.
  const step = (n, icon, title, disabled = false) => gm ? btn('strain-step', '', {kind: 'ghost', icon, data: {step: n}, title, disabled}) : '';
  return `<span class="ag-badge agch-pill agch-pill--strain${tone ? ` ag-badge--${tone}` : ''}" role="group" aria-label="${esc(tip)}" data-tooltip="${esc(tip)}"><i class="fa-solid fa-fire" aria-hidden="true"></i><span class="ag-sr-only">Strain</span>
    ${step(-1, 'fa-solid fa-minus', 'Remove 1 Strain (GM, recorded)', m.value <= 0)}<span class="ag-meter${tone ? ` ag-meter--${tone}` : ''} agch-pill__meter" aria-hidden="true"><span class="ag-meter__track" style="--ag-meter:${m.fill}%"><span class="ag-meter__fill"></span></span></span><b>${esc(m.label)}</b>${step(1, 'fa-solid fa-plus', 'Add 1 Strain (GM, recorded)')}${m.band ? `<span class="agch-pill__band">${esc(m.band)}</span>` : ''}</span>`;
}

const TARGET_WORDS = {'push.cost': 'Push cost', 'backfire.chance': 'Backfire chance', 'backfire.severity': 'Backfire severity', 'strain.recovery': 'rest recovery', 'sockets.count': 'sockets'};
const signed = v => `${num(v) > 0 ? '+' : ''}${num(v)}`;
const effectsOf = x => (x.modifiers ?? []).map(m => `${m.label}: ${TARGET_WORDS[m.target] ?? m.target} ${signed(m.value)}`).join(' · ');
/** api.sockets when Cinders offers contract ag-sockets/1 with the calls the Hub uses, else null (older Cinders: no socket rows). */
const socketsOf = api => {const s = api?.sockets;return s?.contract === 'ag-sockets/1' && typeof s.hosts === 'function' ? s : null;};
/** The character's Cinder sockets by instance id, read through api.sockets.hosts. Empty when Cinders is older or refuses. */
export function socketHosts(actor, api) {
  const s = socketsOf(api);
  if (!s) return new Map();
  try { return new Map((s.hosts(actor) ?? []).map(h => [h.instanceId, h])); } catch { return new Map(); }
}
/** Cinders' Player Access is on (an older Cinders without the state counts as on; its API still refuses players when it is off). */
const playerAccessOn = api => { try { return api?.playerAccess?.getState?.()?.playerAccessEnabled !== false; } catch { return false; } };
/** Who may change this Cinder's sockets from the Hub: the GM always; the owner while Player Access is on and the GM has not locked it. Cinders checks again. */
export const canChangeSockets = (host, api) => Boolean(host) && (isGM() || (host.canEdit === true && !host.locked && playerAccessOn(api)));

/** A saved art path the Hub may show, else null (same rule as Cinders: a relative path or http(s), nothing that could break out of an attribute). */
export function cleanArt(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 1024 || /[\u0000-\u001f"'<>`\\]/.test(s)) return null;
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return scheme && scheme !== 'http' && scheme !== 'https' ? null : s;
}
/** Default orb tone from Strain only (Cinders' rule): calm at 0, warm, ember from half the guarantee point, hot at it. */
export function strainTone(value, top = 10) {
  const t = Math.max(1, num(top) || 10), v = num(value);
  return v >= t ? 'hot' : v >= Math.ceil(t / 2) ? 'ember' : v > 0 ? 'warm' : 'calm';
}

/**
 * Socket rows in the order Cinders' orbit uses: active items in slot order, then the free sockets (each with the lowest unused slot
 * number, which an attach uses), then items over capacity (inactive, off the orbit). A position past the Cinder's base count is an
 * extra socket ("+1"). An older Cinders without `base` shows no "+1".
 */
export function socketRows(host, maxSockets = 12) {
  if (!host) return {rows: [], capacity: 0, used: 0};
  const capacity = Math.max(0, num(host.capacity)), base = Number.isSafeInteger(host.base) ? host.base : capacity;
  const slots = Array.isArray(host.slots) ? host.slots : [], active = slots.filter(x => x.active), taken = new Set(slots.map(x => x.slot));
  const free = [];
  for (let s = 0; s < maxSockets && free.length < Math.max(0, capacity - active.length); s++) if (!taken.has(s)) free.push(s);
  const onOrbit = [...active.map(x => ({...x, empty: false})), ...free.map(slot => ({slot, empty: true, active: true}))].slice(0, capacity)
    .map((x, i) => ({...x, number: i + 1, extra: i >= base}));
  return {rows: [...onOrbit, ...slots.filter(x => !x.active).map(x => ({...x, empty: false, number: null, extra: false}))], capacity, used: active.length};
}

/**
 * Does Cinder art turn? Cinders 0.9.0's "Rotate Cinder art" (world, GM Setup) and "Rotate the art on this device" (client),
 * read only. A setting this Cinders doesn't have counts as on (Cinders' default). Reduced motion is honoured in the CSS.
 */
export function artSpins() {
  const on = key => { try { return globalThis.game?.settings?.get?.(CINDERS_ID, key) !== false; } catch { return true; } };
  return on('rotateArt') && on('rotateArtLocal');
}
/**
 * The orb core, in Cinders 0.9.0's markup: art sits on the Strain-toned orb as a blurred glow (agch-corb__orb--art) and,
 * when spin is on, turns slowly (agch-corb__orb--spin, CSS only). No art: the default orb.
 */
export function orbCoreHtml(art, tone, spin = false) {
  const src = cleanArt(art);
  return `<span class="agch-corb__orb${src ? ' agch-corb__orb--art' : ''}${src && spin ? ' agch-corb__orb--spin' : ''}" data-tone="${esc(tone)}">${src
    ? `<span class="agch-corb__default agch-corb__glow" aria-hidden="true"></span><img class="agch-corb__img" src="${esc(src)}" alt="">` : '<span class="agch-corb__default"></span>'}</span>`;
}

/** The mini orb: Strain ring (segments to the guarantee point, then a pip per point over), the Cinder's art or the default orb, socket dots. */
export function miniOrbHtml(ci, strain, rows, {spin = artSpins()} = {}) {
  const top = Math.max(1, num(strain?.guaranteeAt) || 10), value = Math.max(0, num(strain?.value)), over = Math.max(0, value - top);
  const tone = strainTone(value, top), at = (r, deg) => [50 + r * Math.cos(deg * Math.PI / 180), 50 + r * Math.sin(deg * Math.PI / 180)].map(n => n.toFixed(2));
  const step = 360 / top, gap = Math.min(4, step / 4);
  const segs = Array.from({length: top}, (_, i) => {
    const [x0, y0] = at(30, -90 + i * step + gap / 2), [x1, y1] = at(30, -90 + (i + 1) * step - gap / 2);
    return `<path class="agch-corb__seg${i < value ? ' is-on' : ''}" d="M${x0} ${y0} A30 30 0 0 1 ${x1} ${y1}"></path>`;
  }).join('');
  const pips = Array.from({length: Math.min(over, 30)}, (_, i) => {const [cx, cy] = at(35, -90 + i * 12 + 6);return `<circle class="agch-corb__pip" cx="${cx}" cy="${cy}" r="1.6"></circle>`;}).join('');
  const dots = rows.filter(r => r.number).map((r, i, all) => {
    const n = all.length, deg = -90 + 360 / n * i + (n % 2 ? 0 : 180 / n), [x, y] = at(44, deg);
    return `<span class="agch-corb__dot${r.empty ? ' is-empty' : ''}" style="--agch-x:${x};--agch-y:${y}"></span>`;
  }).join('');
  const label = `${ci.name}. Strain ${value} of ${top}${over ? `, ${over} over` : ''}. ${rows.filter(r => r.number && !r.empty).length} of ${rows.filter(r => r.number).length} sockets in use.`;
  return `<div class="agch-corb" role="img" aria-label="${esc(label)}" data-tooltip="${esc(label)}">
    <svg class="agch-corb__ring${value >= top ? ' is-hot' : ''}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${segs}${pips}</svg>
    ${orbCoreHtml(ci.art, tone, spin)}${dots}</div>`;
}

/**
 * The Cinders this character bears, for the header (0.31.0): [{instanceId, name, art, tone, treeId}]. Empty when Cinders is
 * missing or older, or refuses this user (a player while its Player Access is off). Read through api.cinder.list only.
 */
export function boundCinders(actor) {
  const api = cindersApi(), c = api?.cinder;
  if (c?.contract !== 'ag-cinder/1' || !actor) return [];
  let list = [], s = null;
  try { list = c.list(actor) ?? []; } catch { return []; }
  try { s = api.strain?.contract === 'ag-strain/1' ? api.strain.get(actor) : null; } catch { s = null; }
  const tone = strainTone(s?.value, s?.guaranteeAt);
  return list.map(ci => ({instanceId: String(ci.instanceId ?? ''), name: String(ci.name || 'Cinder'), art: cleanArt(ci.art), tone, treeId: ci.treeId ?? null}));
}
/**
 * The Items each Cinder gave this character (0.58.0), for grouping features: [{instanceId, name, treeId, itemIds}], where itemIds are the
 * signature ability and passive Items (api.cinder.list `signature.active.itemId` / `passive.itemId`, Cinders 0.10.0+). Empty when Cinders
 * is missing, older or refuses this user. Read through api.cinder.list only.
 */
export function cinderPowerItems(actor) {
  const c = cindersApi()?.cinder;
  if (c?.contract !== 'ag-cinder/1' || !actor) return [];
  let list = [];
  try { list = c.list(actor) ?? []; } catch { return []; }
  return list.map(ci => ({instanceId: String(ci.instanceId ?? ''), name: String(ci.name || 'Cinder'), treeId: ci.treeId ?? null,
    itemIds: [ci.signature?.active?.itemId, ci.signature?.passive?.itemId].filter(Boolean).map(String)}));
}
/** Header chips (0.31.0): a small orb (art, glow, slow turn) and the name per Cinder; a click opens Ashen Gate → Cinders. */
export function cinderChipsHtml(actor, {spin = artSpins()} = {}) {
  const list = boundCinders(actor);
  if (!list.length) return '';
  return `<div class="agch-cchips" role="group" aria-label="Cinders">${list.map(ci => {
    const tip = `${ci.name}: open Ashen Gate → Cinders`;
    return `<button type="button" class="agch-cchip" data-action="cinder-open" data-instance="${esc(ci.instanceId)}" data-ag-always data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><span class="agch-cchip__orb" aria-hidden="true">${orbCoreHtml(ci.art, ci.tone, spin)}</span><span class="agch-cchip__name">${esc(ci.name)}</span></button>`;
  }).join('')}</div>`;
}
/**
 * Open skill tree (0.31.0) for the Cinders panel head: Skill Trees' own window for this character, at the Cinder's tree
 * when it bears exactly one (api.cinder.list gives treeId). Nothing when Skill Trees can't open, or players may not see Perks.
 */
export function skillTreeBtn(actor, {canSeePerks = true} = {}) {
  const trees = globalThis.game?.modules?.get?.('ashen-gate-skill-trees');
  if (!trees?.active || typeof trees.api?.open !== 'function' || (!isGM() && !canSeePerks)) return '';
  const list = boundCinders(actor), tree = list.length === 1 ? list[0].treeId : null;
  return btn('cinder-tree', 'Open skill tree', {kind: 'sm', icon: 'fa-solid fa-diagram-project', data: tree ? {tree} : {}, always: true,
    title: tree ? `Open ${list[0].name}'s skill tree in Skill Trees` : 'Open Skill Trees for this character'});
}
/** Opens Skill Trees for this character (at one tree when given). Skill Trees checks its own permissions. */
export async function openSkillTree(actor, treeId = null) {
  const api = globalThis.game?.modules?.get?.('ashen-gate-skill-trees');
  if (!api?.active || typeof api.api?.open !== 'function') return refuse('Ashen Gate | Skill Trees is not active.');
  try { return {ok: true, result: await api.api.open({actorId: actor.id, ...(treeId ? {treeId} : {})})}; } catch (error) { return refuse(String(error?.message ?? error)); }
}

/** Socket rows of one Cinder with Attach / Swap / Detach (or a Locked badge), each row a drop target while the user may change it. */
export function socketsHtml(h, api = null, {instanceId = h?.instanceId, maxSockets = socketsOf(api)?.maxSockets ?? 12} = {}) {
  if (!h) return '';
  const {rows, capacity, used} = socketRows(h, maxSockets), edit = canChangeSockets(h, api);
  const lockBadge = '<span class="ag-badge ag-badge--warn"><i class="fa-solid fa-lock" aria-hidden="true"></i> Locked</span>';
  const data = r => ({instance: instanceId, slot: r.slot});
  const items = rows.map(r => {
    const name = r.empty ? 'Empty socket' : r.name, fx = r.empty ? '' : effectsOf(r);
    const actions = !edit ? (h.locked ? lockBadge : '')
      : r.empty ? btn('cinder-attach', 'Attach', {kind: 'sm', extra: 'ag-btn--primary', icon: 'fa-solid fa-plus', data: data(r), title: `Attach an item to socket ${r.number}`})
      : `${r.active ? btn('cinder-swap', 'Swap', {kind: 'sm', icon: 'fa-solid fa-right-left', data: data(r), title: `Swap ${r.name} for another item`}) : ''}${btn('cinder-detach', 'Detach', {kind: 'sm', extra: 'ag-btn--danger', icon: 'fa-solid fa-link-slash', data: data(r), title: `Detach ${r.name}`})}`;
    const drop = edit ? ` data-cinder-drop data-instance="${esc(instanceId)}" data-slot="${esc(r.slot)}" data-filled="${!r.empty}"` : '';
    return `<li class="ag-row agch-sock${r.empty ? ' is-empty' : ''}${r.active ? '' : ' is-inactive'}"${drop}><span class="agch-sock__dot" aria-hidden="true">${r.number ?? '–'}</span>
      <span class="ag-row__main"><span class="ag-row__title">${esc(name)}${r.extra ? ' <span class="ag-badge ag-badge--accent">+1</span>' : ''}${r.active ? '' : ' <span class="ag-badge ag-badge--warn">inactive</span>'}</span>${fx ? `<span class="ag-row__meta">${esc(fx)}</span>` : ''}${r.active ? '' : '<span class="ag-row__meta">Over capacity: no effect until an item is removed.</span>'}</span>
      ${actions ? `<span class="ag-row__end agch-sock__actions">${actions}</span>` : ''}</li>`;
  });
  const head = `<p class="agch-cinder__sockets-head"><strong>Sockets</strong> <span class="agch-muted">${used} of ${capacity} in use</span>${h.locked ? ` ${lockBadge}` : ''}${edit ? ' <span class="agch-muted">Drag an item onto a socket</span>' : ''}</p>`;
  return `<div class="agch-cinder__sockets" aria-label="Sockets">${head}${items.length ? `<ul class="ag-rows agch-socks">${items.join('')}</ul>` : '<p class="agch-muted">This Cinder has no sockets.</p>'}</div>`;
}

/** "Items that fit": this character's items that fit a socket and are not in this Cinder, as chips to drag onto a row. Only while the user may change it. */
export function fitsTrayHtml(actor, h, api) {
  const s = socketsOf(api);
  if (!h || !canChangeSockets(h, api) || typeof s?.socketable !== 'function') return '';
  let fits = [];
  try { fits = (s.socketable(actor) ?? []).filter(f => !(h.slots ?? []).some(x => x.itemId === f.itemId)); } catch { return ''; }
  const chips = fits.map(f => {
    const uuid = actor.items?.get?.(f.itemId)?.uuid ?? `${actor.uuid}.Item.${f.itemId}`;
    return `<span class="ag-chip agch-fit" draggable="true" data-drag-uuid="${esc(uuid)}"${f.attachedTo ? ' data-tooltip="In another Cinder\'s socket: it moves here"' : ''}><i class="fa-solid fa-gem" aria-hidden="true"></i> ${esc(f.name)}</span>`;
  }).join('');
  return `<div class="agch-fits" aria-label="Items that fit a socket"><p class="agch-cinder__sockets-head"><strong>Items that fit</strong> <span class="agch-muted">Drag onto a socket</span></p>
    ${chips ? `<div class="agch-fits__row">${chips}</div>` : '<p class="agch-muted">No other item on this character fits a socket.</p>'}</div>`;
}

/** Cinders panel: each Cinder the character bears as a compact orb card: mini orb, Push lines with cost and Backfire chance, socket rows and the tray. */
export function cindersSummary(actor, api) {
  const c = api?.cinder;
  if (c?.contract !== 'ag-cinder/1') return '<p class="agch-muted">Update Ashen Gate | Cinders to see Cinders here.</p>';
  const list = c.list(actor) ?? [];
  if (!list.length) return '<div class="ag-empty"><i class="fa-solid fa-fire" aria-hidden="true"></i><p class="ag-empty__title">No Cinder bound to this character yet.</p></div>';
  const sockets = socketHosts(actor, api);
  let strain = null;
  try { strain = api.strain?.contract === 'ag-strain/1' ? api.strain.get(actor) : null; } catch { strain = null; }
  return list.map(ci => {
    const h = sockets.get(ci.instanceId);
    const lines = (ci.powers ?? []).flatMap(p => (p.modes ?? []).map(m => `<li class="ag-row agch-power"><span class="ag-row__main"><span class="ag-row__title">${esc(p.name)}: ${esc(m.label)}</span>
      <span class="ag-row__meta">+${num(m.cost)} Strain → ${num(m.after)} · Backfire ${num(m.chance)}%${m.guaranteed ? ' (guaranteed)' : ''}</span></span>
      <span class="ag-row__end">${btn('cinder-push', 'Push', {kind: 'sm', extra: m.guaranteed ? 'ag-btn--danger' : 'ag-btn--primary', icon: 'fa-solid fa-fire', data: {instance: ci.instanceId, power: p.powerId, mode: m.id}, title: `Push ${p.name}: ${m.label}`})}</span></li>`)).join('');
    const powers = (ci.powers ?? []).length
      ? (lines ? `<ul class="ag-rows agch-powers">${lines}</ul>` : `<p class="agch-muted">Powers: ${(ci.powers ?? []).map(p => esc(p.name)).join(', ')}. No Push mode open yet.</p>`)
      : '<div class="ag-empty"><p class="ag-empty__title">No powers unlocked yet.</p><p class="ag-empty__text">Unlock them in Skill Trees.</p></div>';
    const perks = (ci.enhancements ?? []).map(e => esc(e.name)).join(', ');
    const rows = socketRows(h, socketsOf(api)?.maxSockets ?? 12).rows;
    return `<div class="agch-cinder"${h?.locked ? ' data-locked' : ''}>${miniOrbHtml(ci, strain, rows)}<div class="agch-cinder__lines"><h4>${esc(ci.name)}</h4>${powers}${perks ? `<p class="agch-muted">Perks: ${perks}</p>` : ''}${socketsHtml(h, api)}${fitsTrayHtml(actor, h, api)}</div></div>`;
  }).join('');
}

const socketApi = () => socketsOf(cindersApi());
/** The Cinder's socket host and Cinders' sockets API, or a refusal when the user may not change it (checked here and again by Cinders). */
function socketTarget(actor, instanceId) {
  const api = cindersApi(), s = socketApi();
  if (!s || typeof s.attach !== 'function') return {error: 'Update Ashen Gate | Cinders to change sockets here.'};
  let h = null;
  try { h = (s.hosts(actor) ?? []).find(x => x.instanceId === instanceId) ?? null; } catch (error) { return {error: String(error?.message ?? error)}; }
  if (!h) return {error: 'That character does not bear this Cinder.'};
  if (!canChangeSockets(h, api)) return {error: h.locked ? 'The GM has locked this Cinder\'s sockets.' : 'You can\'t change this Cinder\'s sockets right now.'};
  return {s, h};
}
const slotOf = v => v === '' || v == null || !Number.isSafeInteger(Number(v)) ? null : Number(v);

/**
 * Attach, Swap or Detach from a socket row, through Cinders' api.sockets. pick(title, options, ok) resolves an item id (or null);
 * confirm(message, opts) resolves true to detach. Attach first asks Cinders' canAttach for the item.
 */
export async function socketFromHub(actor, kind, data, {pick, confirm} = {}) {
  const {s, h, error} = socketTarget(actor, data.instance);
  if (error) return refuse(error);
  const slot = slotOf(data.slot);
  try {
    if (kind === 'detach') {
      const x = (h.slots ?? []).find(y => y.slot === slot);
      if (!x) return refuse('That socket is empty.');
      const ok = await confirm(`${x.name} comes out of this Cinder's socket and stays in ${actor.name}'s inventory.`, {title: `Detach ${x.name}?`, yes: 'Detach', danger: true});
      if (!ok) return {ok: true, result: null};
      return {ok: true, result: await s.detach(actor, data.instance, slot)};
    }
    const fits = (s.socketable?.(actor) ?? []).filter(f => !(h.slots ?? []).some(x => x.itemId === f.itemId));
    if (!fits.length) return refuse(`${actor.name} has no other item that fits a Cinder socket.`);
    const itemId = await pick(kind === 'swap' ? 'Swap socket item' : 'Attach to a socket', fits.map(f => ({value: f.itemId, label: `${f.name}${f.attachedTo ? ' (in another Cinder\'s socket: it moves here)' : ''}`})), kind === 'swap' ? 'Swap' : 'Attach');
    if (!itemId) return {ok: true, result: null};
    if (kind === 'swap') return {ok: true, result: await s.swap(actor, data.instance, slot, itemId)};
    const check = typeof s.canAttach === 'function' ? s.canAttach(actor, data.instance, itemId) : {ok: true};
    if (check?.ok === false) return refuse((check.reasons ?? []).join(' ') || 'That item can\'t go in this socket.');
    return {ok: true, result: await s.attach(actor, data.instance, itemId, {slot})};
  } catch (err) { return refuse(String(err?.message ?? err)); }
}

/**
 * An Item dropped on a socket row: attach to an empty socket, swap into a full one. A player drops items from this character;
 * the GM may also drop an Item from the sidebar (Cinders' attachDropped copies it to the bearer).
 */
export async function dropOnSocket(actor, data, item) {
  const {s, error} = socketTarget(actor, data.instance);
  if (error) return refuse(error);
  if (!item || item.documentName !== 'Item') return refuse('Drop an item here.');
  const slot = slotOf(data.slot), filled = data.filled === true || data.filled === 'true';
  const own = item.parent?.id === actor.id;
  try {
    if (!own) {
      if (!isGM() || typeof s.attachDropped !== 'function') return refuse(`Drag an item from ${actor.name}'s inventory.`);
      return {ok: true, result: await s.attachDropped(data.instance, item, {slot})};
    }
    if (filled) return {ok: true, result: await s.swap(actor, data.instance, slot, item.id)};
    const check = typeof s.canAttach === 'function' ? s.canAttach(actor, data.instance, item.id) : {ok: true};
    if (check?.ok === false) return refuse((check.reasons ?? []).join(' ') || 'That item can\'t go in this socket.');
    return {ok: true, result: await s.attach(actor, data.instance, item.id, {slot})};
  } catch (err) { return refuse(String(err?.message ?? err)); }
}

/** Push from the Hub: Cinders' own preview, a confirmation, then Cinders' push (a player's is rolled by the GM client). */
export async function pushFromHub(actor, data, confirm) {
  const api = cinderApi();
  if (!api) return refuse('Ashen Gate | Cinders is not active.');
  try {
    const pv = api.previewPush(actor, data.instance, data.power, data.mode);
    const mods = (pv.modifiers ?? []).length ? `Modifiers: ${pv.modifiers.map(m => `${m.label} (${m.value > 0 ? '+' : ''}${m.value})`).join(', ')}` : '';
    // Plain lines (the shared confirm escapes them): what is pushed, the effect, the Strain and Backfire numbers.
    const lines = [`${pv.powerName}: ${pv.label}`, pv.effect ?? '', `Strain ${num(pv.strain)} → ${num(pv.after)} (+${num(pv.cost)}). Backfire chance ${num(pv.chance)}%${pv.guaranteed ? ' (guaranteed)' : ''}.`, mods, 'Every Push gains Strain. The result is posted to chat.'];
    const ok = await confirm(lines.filter(Boolean).join('\n'), {power: pv.powerName, guaranteed: pv.guaranteed === true});   // 0.33.0: a guaranteed Backfire asks as a danger confirmation
    if (!ok) return {ok: true, result: null};
    return {ok: true, result: await api.push(actor, data.power, data.mode)};
  } catch (error) { return refuse(String(error?.message ?? error)); }
}
