/**
 * 1.14.0 Travel tracker: a small pop-out window (ApplicationV2) that can stay open over the map. The GM rolls legs and
 * deals with hazards through the public API (same rules as the Routes tab, no state of its own); players see progress
 * and what the GM shared. Position and background opacity are per-user client settings.
 */
import {MODULE_ID, esc} from './model.mjs';
import {gmTrackerHTML, playerTrackerHTML, clampOpacity} from './travel-view.mjs';
import {LocationsApp} from './app.mjs';

const api = () => game.modules.get(MODULE_ID)?.api;
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };
const setting = (key, fallback) => { try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; } };
const POSITION_KEYS = ['left', 'top', 'width', 'height'];
/** The saved window position, only finite numbers. */
export const savedPosition = () => {
  const p = setting('trackerPosition', {}) ?? {};
  return Object.fromEntries(POSITION_KEYS.filter(k => Number.isFinite(p[k])).map(k => [k, Math.round(p[k])]));
};

const Base = foundry.applications.api.ApplicationV2;
export class TravelTracker extends Base {
  static DEFAULT_OPTIONS = {id: 'ag-locations-travel', classes: ['ag-app', 'agl-travel'], window: {title: 'Ashen Gate | Travel', resizable: true},
    position: {width: 320, height: 420}};
  static instance = null;
  /** The behaviour registry (travel-view.mjs createBehaviours), set by main.mjs. */
  static behaviours = null;
  static async show() {
    const app = TravelTracker.instance?.rendered ? TravelTracker.instance : (TravelTracker.instance = new TravelTracker());
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }
  /** Redraws an open tracker (journey changed on any client). */
  static refresh() {
    const app = TravelTracker.instance;
    if (app?.rendered && !app.busy) app.render().catch(notifyError);
  }

  constructor(options = {}) {
    super({...options, position: {...TravelTracker.DEFAULT_OPTIONS.position, ...savedPosition(), ...(options.position ?? {})}});
    this.busy = false; this.saveTimer = null; this.savePending = null;
  }
  get gm() { return game.user.isGM === true; }

  /** Every drag or resize ends up here; the position is saved for this user a moment after it settles. */
  setPosition(position) {
    const out = super.setPosition?.(position) ?? position;
    if (this.rendered && !this.minimized) {
      clearTimeout(this.saveTimer);
      const p = {...(this.position ?? {}), ...(out ?? {})};
      this.savePending = () => {
        this.savePending = null;
        const pos = Object.fromEntries(POSITION_KEYS.filter(k => Number.isFinite(p[k])).map(k => [k, Math.round(p[k])]));
        Promise.resolve(game.settings.set(MODULE_ID, 'trackerPosition', pos)).catch(err => console.warn(`${MODULE_ID} | tracker position not saved`, err));
      };
      this.saveTimer = setTimeout(this.savePending, 400);
    }
    return out;
  }
  /** Background opacity: a CSS custom property on the window; only backgrounds use it (the Character Hub's approach). */
  applyOpacity(value = setting('trackerOpacity', 100)) {
    const v = clampOpacity(value);
    this.element?.style?.setProperty?.('--ag-window-opacity', `${v}%`);
    return v;
  }

  async _renderHTML() {
    try { return this.buildHtml(); } catch (err) {
      if (/hidden from players/.test(err?.message ?? '')) throw err;
      console.error(`${MODULE_ID} | travel tracker render failed`, err);
      return `<div class="agl-travel__root"><div class="ag-card" role="alert"><p>${esc(err?.message ?? String(err))}</p></div></div>`;
    }
  }
  buildHtml() {
    const a = api();
    const version = game.modules.get(MODULE_ID)?.version ?? '';
    const opacity = clampOpacity(setting('trackerOpacity', 100));
    const behaviours = TravelTracker.behaviours;
    const state = a.travel.state();
    if (!this.gm) {
      const panels = behaviours?.panels({isGM: false, state, journey: null}) ?? [];
      return playerTrackerHTML({state, version, opacity, panels});
    }
    const travel = a.getJourney();
    const j = travel.journey;
    const route = j ? a.getRoute(j.routeId) : null;
    const names = new Map(a.listLocations().map(l => [l.id, l.name]));
    const panels = behaviours?.panels({isGM: true, state, journey: j}) ?? [];
    return gmTrackerHTML({journey: j, routeName: route?.name ?? '', legKm: route?.legKmInEffect ?? 0, nameOf: id => names.get(id) ?? '', version, opacity, panels});
  }
  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.applyOpacity();
    content.onclick = event => {
      const b = event.target?.closest?.('[data-travel]');
      if (!b || b.disabled) return;
      event.preventDefault();
      this.act(b.dataset.travel).catch(notifyError);
    };
    const slider = content.querySelector('[data-travel-opacity]');
    if (slider) {
      slider.oninput = () => this.applyOpacity(slider.value);
      slider.onchange = () => Promise.resolve(game.settings.set(MODULE_ID, 'trackerOpacity', clampOpacity(slider.value)))
        .catch(err => console.warn(`${MODULE_ID} | opacity not saved`, err));
    }
    try { const ap = game.modules.get('ashen-gate-manager')?.api?.appearance; if (ap?.contract === 'ag-appearance/0.1-beta') ap.applyTo?.(content); } catch {}
  }

  /** Button actions. GM actions go through the API, which refuses them for players. One at a time. */
  async act(action) {
    const a = api();
    if (action === 'help') return this.help();
    if (action === 'open-routes' || action === 'open-route') {
      const ref = this.gm ? a.getJourney().journey?.routeId : a.travel.state()?.routeKey;
      return LocationsApp.showRoute(ref || null);
    }
    if (this.busy) return;
    if (action === 'end') {
      const ok = await foundry.applications.api.DialogV2.confirm({window: {title: 'End journey?'},
        content: '<p>End this journey where the party is? Nothing is written to Party Notes.</p>', yes: {label: 'End Journey'}, no: {label: 'Keep Travelling'}, rejectClose: false});
      if (!ok) return;
    }
    const call = {'next-leg': 'nextLeg', reroll: 'rerollHazard', dismiss: 'dismissHazard', share: 'shareHazard', pause: 'pauseJourney', resume: 'resumeJourney',
      end: 'abortJourney', 'retry-log': 'retryTravelLog'}[action];
    if (!call) return;
    this.busy = true;
    for (const b of this.element?.querySelectorAll?.('[data-travel]') ?? []) b.disabled = true;
    try {
      const r = await a[call]();
      if (action === 'share') ui.notifications?.info('Shared with players in chat.');
      if (action === 'next-leg' && r?.arrived) ui.notifications?.info('The party has arrived.');
    } finally {
      this.busy = false;
      if (this.rendered) await this.render();
    }
  }
  help() {
    const content = this.gm ? `<ul>
      <li><strong>Roll next leg</strong> rolls d100 against the hazard chance, exactly like <em>Next leg</em> in Locations → Routes. No hazard doubles the chance (up to 100%); a hazard sets it back to the route's base chance.</li>
      <li>A hazard waits here (and in your whispered chat card): <strong>Reroll</strong>, <strong>Dismiss</strong> (players never know) or <strong>Share to players</strong> (posts the result to chat, no route or place names). The next leg waits until it is dismissed or shared.</li>
      <li><strong>Pause</strong> holds the journey (players see "Paused") until <strong>Resume</strong>. <strong>End journey</strong> stops where the party is and writes nothing to Party Notes.</li>
      <li>Start journeys on a route in Locations → Routes. On arrival the trip is added to the destination's Party Notes.</li>
      <li>The slider fades the window background for you only. The window remembers where you left it.</li></ul>`
      : '<p>Where the party is on its journey, and what the GM has told you about the road. The slider fades the window background (only for you).</p>';
    return foundry.applications.api.DialogV2.prompt({window: {title: 'Travel Help'}, content, ok: {label: 'Close'}, rejectClose: false});
  }
  async close(options = {}) {
    clearTimeout(this.saveTimer);
    this.savePending?.();
    return super.close(options);
  }
}
