/**
 * 1.14.0 Travel tracker: what the small pop-out window draws, and the behaviour-panel registry. Pure (no Foundry), so the
 * window (travel-app.mjs) and tests share it. Every rule lives in the API (api.mjs) and journey.mjs: this only draws.
 *
 * GM view: the full journey record (getJourney). Player view: api.travel.state(), which is built from the players'
 * progress page and so carries no chance, roll, table or unshared hazard. The player builder never sees the GM record.
 */
import {esc} from './model.mjs';
import {safeStreak, kmTravelled} from './journey.mjs';

/** Up to this many legs the strip shows one marker per leg; beyond it a plain bar. */
export const STRIP_MAX_MARKERS = 40;
/** Latest lines in the tracker's log. The trip's summary goes to the destination's Party Notes on arrival. */
export const TRACKER_LOG_LINES = 6;
export const OPACITY_MIN = 20;
export const clampOpacity = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(100, Math.max(OPACITY_MIN, n)) : 100; };

/** Foundry tooltip in the kit's skin (replaces native title=). */
const tip = text => text ? ` data-tooltip="${esc(text)}" data-tooltip-class="ag-tooltip"` : '';
/** A kit button. A disabled one shows its reason as visible hint text below it (tooltips don't show on disabled buttons). */
const btn = (action, label, {kind = '', icon = '', title = '', disabled = false, big = false} = {}) =>
  `<button type="button" class="ag-btn${kind ? kind.split(' ').map(k => ` ag-btn--${k}`).join('') : ''}${big ? ' agl-travel__big' : ''}" data-travel="${action}"${title && !disabled ? tip(title) : ''}${title && !label ? ` aria-label="${esc(title)}"` : ''}${disabled ? ' disabled' : ''}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>${disabled && title ? `<p class="agl-hint agl-travel__why">${esc(title)}</p>` : ''}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The progress strip. `hazardLegs`: legs to mark (GM: every hazard; players: only shared ones). The current leg is the
 * one the party has just travelled (leg N of M), so before setting out no marker is current.
 */
export function stripHTML({leg, legs, status = 'active', hazardLegs = []}) {
  const done = Math.min(Math.max(0, leg | 0), legs);
  const marks = new Set(hazardLegs);
  // 0.19.0 (LOC-A11Y-03): the accessible name lists the hazard legs too, not just "Leg N of M".
  const hz = [...marks].filter(n => n >= 1 && n <= legs).sort((a, b) => a - b);
  const label = `Leg ${done} of ${legs}${hz.length ? `; ${hz.length === 1 ? 'hazard on leg' : 'hazards on legs'} ${hz.join(', ')}` : ''}`;
  if (legs > STRIP_MAX_MARKERS) {
    // Many legs: the kit meter (LOC-CMP-03), named like the strip.
    const pct = Math.round(100 * done / Math.max(1, legs));
    return `<div class="ag-meter agl-travel__meter"><div class="ag-meter__track" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${legs}" aria-valuenow="${done}" style="--ag-meter:${pct}%"><span class="ag-meter__fill"></span></div></div>`;
  }
  const cells = Array.from({length: legs}, (_, i) => {
    const n = i + 1;
    const cls = [n <= done ? 'is-done' : '', n === done && status === 'active' ? 'is-current' : '', marks.has(n) ? 'is-hazard' : ''].filter(Boolean).join(' ');
    // A hazard leg carries a mark (a shape, not only the red border).
    return `<li class="${cls}"${tip(`Leg ${n}${marks.has(n) ? ': hazard' : ''}`)}>${marks.has(n) ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' : ''}</li>`;
  }).join('');
  return `<ol class="agl-travel__strip" role="img" aria-label="${esc(label)}">${cells}</ol>`;
}

const header = (version, opacity) => `<header class="ag-header agl-travel__head"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Travel</h1></div>
  <div class="ag-header__meta"><span class="ag-version">v${esc(version)}</span>${btn('help', '', {kind: 'ghost sm icon', icon: 'fa-solid fa-circle-question', title: 'Travel tracker help'})}</div></header>
  <label class="agl-travel__opacity"${tip('Window background opacity (only for you): slide left to see the map behind')}><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
    <input type="range" min="${OPACITY_MIN}" max="100" step="5" value="${clampOpacity(opacity)}" data-travel-opacity aria-label="Window background opacity"></label>`;

const statusWord = (status, paused) => status === 'arrived' ? 'Arrived' : status === 'aborted' ? 'Journey ended' : paused ? 'Paused' : 'Travelling';

/** Optional behaviour panels (see createBehaviours), already filtered for this user and journey. */
const panelsHTML = panels => panels.length ? `<div class="agl-travel__panels">${panels.map(p => `<details class="ag-card agl-travel__panel" data-behaviour="${esc(p.id)}" open>
  <summary>${p.icon ? `<i class="${esc(p.icon)}" aria-hidden="true"></i> ` : ''}${esc(p.label)}</summary>${p.html}</details>`).join('')}</div>` : '';

/**
 * GM model: {journey (full record or null), routeName, legKm, nameOf(id), version, opacity, panels}.
 * The GM sees the hazard chance, the safe-leg run, rolls and results.
 */
export function gmTrackerHTML({journey: j, routeName = '', legKm = 0, nameOf = id => id, version = '', opacity = 100, panels = []}) {
  const head = header(version, opacity);
  if (!j) return `<div class="agl-travel__root">${head}<div class="ag-empty"><i class="fa-solid fa-person-hiking" aria-hidden="true"></i><p class="ag-empty__title">No journey yet</p><p class="ag-empty__text">Start one on a route in Locations → Routes.</p></div>
    <footer class="agl-travel__foot">${btn('open-routes', 'Open Routes in Locations', {icon: 'fa-solid fa-route'})}</footer></div>`;
  const from = nameOf(j.fromId) || 'Somewhere', to = nameOf(j.toId) || 'somewhere';
  const active = j.status === 'active';
  const km = kmTravelled(j, legKm);
  const streak = safeStreak(j);
  const p = j.pending;
  const hazard = p ? `<div class="ag-card agl-travel__hazard" role="status"><h3>Hazard on leg ${p.leg}</h3>
      <p class="agl-travel__result">${esc(p.result)}</p>
      <p class="agl-hint">Rolled ${p.roll} vs ${p.chance}%.${p.tableMissing ? ' The hazard table was not found, so this is the plain fallback.' : ''} Only you see this.</p>
      <div class="agl-travel__row">${btn('reroll', 'Reroll', {icon: 'fa-solid fa-dice'})}${btn('dismiss', 'Dismiss', {icon: 'fa-solid fa-xmark', title: 'Discard this hazard. Players never learn of it.'})}
        ${btn('share', 'Share to players', {icon: 'fa-solid fa-bullhorn', title: 'Posts the result to chat for everyone (no route or place names)'})}</div></div>` : '';
  const last = !active ? `<p class="agl-hint">${j.status === 'arrived' ? `Arrived at ${esc(to)} after ${plural(j.legs, 'leg')}` : `Ended after ${plural(j.legIndex, 'leg')}`}, ${plural(j.hazardCount, 'hazard')}.
      ${j.status === 'arrived' ? j.travelLog === 'ok' ? `Logged in ${esc(to)}'s Party Notes.` : `Not logged in Party Notes: ${esc(j.travelLogError || 'unknown error')}` : ''}</p>
      ${j.status === 'arrived' && j.travelLog !== 'ok' ? btn('retry-log', 'Retry log', {icon: 'fa-solid fa-rotate'}) : ''}` : '';
  const lastLeg = j.legIndex + 1 >= j.legs;
  const roll = active ? btn('next-leg', lastLeg ? 'Roll last leg (arrive)' : 'Roll next leg', {kind: 'primary', big: true, icon: 'fa-solid fa-dice-d20',
    disabled: !!p || j.paused, title: p ? 'Deal with the hazard first' : j.paused ? 'Resume the journey first' : 'd100 against the hazard chance'}) : '';
  const lines = [...j.log].slice(-TRACKER_LOG_LINES).reverse().map(e => e.reversed ? '<li><em>Turned back</em></li>'
    : `<li><span class="agl-travel__leg">Leg ${e.leg}</span> ${e.roll} vs ${e.chance}% · ${e.hazard ? `<strong>${esc(e.result)}</strong> <small>(${esc(e.outcome)})</small>` : 'no hazard'}</li>`).join('');
  return `<div class="agl-travel__root">${head}
    <section class="agl-travel__journey">
      <div class="agl-travel__title"><strong>${esc(routeName || `${from} → ${to}`)}</strong><span class="ag-badge${j.paused ? ' ag-badge--warn' : ''}">${statusWord(j.status, j.paused)}</span></div>
      <div class="agl-hint">${esc(from)} → ${esc(to)}</div>
      ${stripHTML({leg: j.legIndex, legs: j.legs, status: j.status, hazardLegs: j.log.filter(e => e.hazard).map(e => e.leg)})}
      <div class="agl-travel__stats"><span>Leg ${j.legIndex} of ${j.legs}, ${km} of ${j.distanceKm} km</span>
        ${active ? `<span>Hazard chance <strong>${j.currentChance}%</strong> · ${plural(streak, 'safe leg')} in a row</span>` : ''}</div>
    </section>
    ${hazard}${roll}${last}
    ${panelsHTML(panels)}
    ${lines ? `<section class="agl-travel__log"><h3>Latest</h3><ol>${lines}</ol><p class="agl-hint">The trip is added to ${esc(to)}'s Party Notes on arrival.</p></section>` : ''}
    <footer class="agl-travel__foot">${active ? btn('end', 'End journey', {kind: 'danger', icon: 'fa-solid fa-ban'}) : ''}
      <span class="agl-travel__foot-end">${active ? btn(j.paused ? 'resume' : 'pause', j.paused ? 'Resume' : 'Pause', {icon: j.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'}) : ''}
      ${btn('open-route', 'Open route', {icon: 'fa-solid fa-route', title: 'Open this route in Locations'})}</span></footer></div>`;
}

/** Player model: {state (api.travel.state()), version, opacity, panels}. Progress and what the GM shared only. */
export function playerTrackerHTML({state: s, version = '', opacity = 100, panels = []}) {
  const head = header(version, opacity);
  if (!s) return `<div class="agl-travel__root">${head}<div class="ag-empty"><i class="fa-solid fa-person-hiking" aria-hidden="true"></i><p class="ag-empty__title">No journey yet</p><p class="ag-empty__text">The party is not travelling. The tracker fills in when your GM starts a journey.</p></div></div>`;
  const from = s.from?.name, to = s.to?.name;
  const title = s.routeName || (from && to ? `${from} → ${to}` : 'On the road');
  const lines = [...(s.log ?? [])].slice(-TRACKER_LOG_LINES).reverse().map(e => `<li><span class="agl-travel__leg">Leg ${e.leg | 0}</span> ${esc(e.text)}</li>`).join('');
  return `<div class="agl-travel__root">${head}
    <section class="agl-travel__journey">
      <div class="agl-travel__title"><strong>${esc(title)}</strong><span class="ag-badge${s.paused ? ' ag-badge--warn' : ''}">${statusWord(s.status, s.paused)}</span></div>
      ${from || to ? `<div class="agl-hint">${esc(from || 'Somewhere')} → ${esc(to || 'somewhere')}</div>` : ''}
      ${stripHTML({leg: s.leg, legs: s.legs, status: s.status})}
      <div class="agl-travel__stats"><span>Leg ${s.leg | 0} of ${s.legs | 0}</span></div>
    </section>
    ${panelsHTML(panels)}
    ${lines ? `<section class="agl-travel__log"><h3>Latest</h3><ol>${lines}</ol></section>` : ''}
    <footer class="agl-travel__foot">${btn('open-routes', 'Open Routes', {icon: 'fa-solid fa-route'})}</footer></div>`;
}

/**
 * Extension point for travel behaviours. A behaviour is an optional panel the tracker shows for a journey
 * (1.15.0 ships pace, night watches and foraging/navigation checks: travel-behaviours.mjs):
 *   {id, label, icon?, audience: 'gm' | 'everyone', appliesTo?(ctx) → boolean, render(ctx) → HTML string, act?(action, ctx)}
 * 1.15.0 act: a control in the panel with data-travel="bh:<id>:<action>" (click) or data-travel-change="bh:<id>:<action>"
 * (change) calls act(action, {isGM, el}); el is the control. 'gm' behaviours' actions are refused for players.
 * ctx: {isGM, state (player-safe, api.travel.state()), journey (the full record, GM only; null for players)}.
 * 'gm' panels are never rendered on a player's client. A panel owns its own data (and must keep GM-only data off
 * players' clients itself); the tracker only gives it a place to draw. A panel that throws shows a one-line error.
 */
export function createBehaviours() {
  const list = new Map();
  function register(def) {
    const id = String(def?.id ?? '').trim();
    if (!/^[A-Za-z0-9_.:-]{1,60}$/.test(id)) throw new Error('A travel behaviour needs an id (letters, digits, . _ : -).');
    if (typeof def.render !== 'function') throw new Error(`Travel behaviour "${id}" needs a render(ctx) function.`);
    const audience = def.audience === 'everyone' ? 'everyone' : 'gm';
    if (def.act !== undefined && typeof def.act !== 'function') throw new Error(`Travel behaviour "${id}": act must be a function.`);
    list.set(id, Object.freeze({id, label: String(def.label || id), icon: def.icon ? String(def.icon) : '', audience,
      appliesTo: typeof def.appliesTo === 'function' ? def.appliesTo : () => true, render: def.render, act: def.act ?? null}));
    return () => unregister(id);
  }
  function unregister(id) { return list.delete(id); }
  /** The panels to draw for this user and journey: [{id, label, icon, html}]. */
  function panels(ctx) {
    const out = [];
    for (const b of list.values()) {
      if (b.audience === 'gm' && !ctx.isGM) continue;
      try {
        if (!b.appliesTo(ctx)) continue;
        out.push({id: b.id, label: b.label, icon: b.icon, html: String(b.render(ctx) ?? '')});
      } catch (err) {
        console.warn(`ashen-gate-locations | travel behaviour ${b.id} failed`, err);
        out.push({id: b.id, label: b.label, icon: b.icon, html: `<p class="agl-hint">This panel could not be drawn: ${esc(err?.message ?? err)}</p>`});
      }
    }
    return out;
  }
  /** 1.15.0: runs a panel control's action ("bh:<id>:<action>"). */
  async function act(action, ctx) {
    const [, id, ...rest] = String(action).split(':');
    const b = list.get(id);
    if (!b?.act) throw new Error(`No travel behaviour handles "${action}".`);
    if (b.audience === 'gm' && !ctx.isGM) throw new Error('Only the GM can do that.');
    return b.act(rest.join(':'), ctx);
  }
  return {register, unregister, panels, act, list: () => [...list.values()].map(({id, label, audience}) => ({id, label, audience}))};
}
