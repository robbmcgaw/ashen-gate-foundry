/**
 * 1.10.0 Routes tab of the Locations window. Mixed into LocationsApp (see app.mjs), so `this` is the app.
 * GM: route list (search, grouped by discovery) and editor. Players: the routes they may see, read-only.
 * Every rule is enforced in the API; this only draws and calls it.
 */
import {MODULE_ID, esc, clone, normalizeLocation, AUDIENCE_MODES, STATE_LABELS} from './model.mjs';
import {confirmDialog, choiceDialog} from './ag-dialogs.mjs';
import {ROUTE_STATES, ROUTE_STATE_LABELS, ROUTE_DEFAULTS, normalizeRoute, legsOf, routeLabel, routeVariantFor, UNKNOWN_PATH} from './routes.mjs';

const api = () => game.modules.get(MODULE_ID)?.api;
const ROUTE_STATE_ICONS = {unknown: 'fa-solid fa-eye-slash', rumoured: 'fa-solid fa-ear-listen', known: 'fa-solid fa-route', explored: 'fa-solid fa-flag-checkered'};
const ROUTE_STATE_HINTS = {
  unknown: 'Players see nothing of this route.',
  rumoured: 'Players who can see both ends see this route, marked Rumoured.',
  known: 'Players who can see both ends see this route.',
  explored: 'Players who can see both ends see this route, marked Explored.'
};
const setting = (key, fallback) => { try { return game.settings.get(MODULE_ID, key) ?? fallback; } catch { return fallback; } };
/** World RollTables by name: [{uuid, name}]. */
/** Foundry tooltip in the kit's skin (replaces native title=). */
const tip = text => text ? ` data-tooltip="${esc(text)}" data-tooltip-class="ag-tooltip"` : '';
const tableChoices = () => [...(game.tables ?? [])].map(t => ({uuid: t.uuid ?? `RollTable.${t.id}`, name: t.name ?? ''})).sort((a, b) => a.name.localeCompare(b.name));

export function routesMixin({btn, notifyError, worldPlayers}) {
  return {
    routeState() {
      this.routeQuery ??= ''; this.routeId ??= null; this.routeDraft ??= null; this.routeDirty ??= false;
    },
    selectRoute(id) {
      const r = id ? api().getRoute(id) : null;
      this.routeId = r ? (this.gm ? r.id : r.key) : null;
      this.routeDraft = this.gm && r ? clone(r) : null;
      this.routeDirty = false;
    },
    routeTouch() {
      this.routeDirty = true;
      const save = this.element?.querySelector('[data-action="route-save"] span');
      if (save) save.textContent = 'Save Changes •';
      const status = this.element?.querySelector('.agl-editor .ag-footer__status');
      if (status) status.textContent = 'Unsaved changes';
    },

    routesHtml() {
      this.routeState();
      const routes = api().listRoutes();
      const creating = this.gm && this.routeDraft && !this.routeDraft.id;
      if (!creating) {
        const rid = r => this.gm ? r.id : r.key;
        if (this.routeId && !routes.some(r => rid(r) === this.routeId)) this.selectRoute(null);
        if (!this.routeId && routes.length) this.selectRoute(rid(routes[0]));
      }
      return this.gm ? this.gmRoutesHtml(routes) : this.playerRoutesHtml(routes);
    },

    // ---------- GM ----------
    gmRoutesHtml(routes) {
      const locs = new Map(api().listLocations().map(l => [l.id, l]));
      const nameOf = id => locs.get(id)?.name ?? '';
      const q = this.routeQuery.trim().toLowerCase();
      const rows = routes.filter(r => !q || [routeLabel(r, nameOf), nameOf(r.fromId), nameOf(r.toId), r.terrain, r.id].some(s => String(s ?? '').toLowerCase().includes(q)))
        .sort((a, b) => routeLabel(a, nameOf).localeCompare(routeLabel(b, nameOf)));
      const row = r => {
        const broken = !locs.has(r.fromId) || !locs.has(r.toId);
        const selected = r.id === this.routeId;
        return `<button type="button" class="ag-row agl-row${selected ? ' is-selected' : ''}"${selected ? ' aria-current="true"' : ''} data-action="route-select" data-id="${esc(r.id)}">
          <span class="ag-row__main"><span class="ag-row__title agl-row__name">${esc(routeLabel(r, nameOf))}</span></span>
          <span class="ag-row__end">${broken ? `<i class="fa-solid fa-triangle-exclamation agl-row__rev agl-row__warn"${tip('An endpoint location no longer exists')} aria-label="An endpoint location no longer exists"></i>` : ''}
          <span class="agl-count"${tip(`${r.distanceKm} km in ${r.legs} leg(s)`)}>${esc(r.distanceKm)} km · ${r.legs}</span>
          <i class="${ROUTE_STATE_ICONS[r.state]} agl-row__rev"${tip(ROUTE_STATE_LABELS[r.state])} aria-label="${ROUTE_STATE_LABELS[r.state]}"></i></span></button>`;
      };
      const groups = ROUTE_STATES.map(st => ({st, list: rows.filter(r => r.state === st)})).filter(g => g.list.length)
        .map(g => `<li class="agl-group"><h3 class="agl-group__title ag-eyebrow">${ROUTE_STATE_LABELS[g.st]} <span class="agl-count">${g.list.length}</span></h3><div class="ag-rows">${g.list.map(row).join('')}</div></li>`).join('');
      const none = routes.length
        ? '<div class="ag-empty"><p class="ag-empty__title">Nothing matches</p><p class="ag-empty__text">No routes match this search.</p></div>'
        : `<div class="ag-empty"><i class="fa-solid fa-route" aria-hidden="true"></i><p class="ag-empty__title">No routes yet</p><p class="ag-empty__text">Join two locations with New route.</p>${btn('route-new', 'New route', {kind: 'sm', icon: 'fa-solid fa-plus'})}</div>`;
      const j = api().getJourney().journey;
      const banner = j?.status === 'active' ? `<div class="agl-undo agl-journey-banner" role="status"><span><i class="fa-solid fa-person-hiking" aria-hidden="true"></i>
          Journey under way: <strong>${esc(nameOf(j.fromId) || j.fromId)} → ${esc(nameOf(j.toId) || j.toId)}</strong>, leg ${j.legIndex} of ${j.legs}${j.pending ? ' · <strong>hazard waiting</strong>' : ''}.</span>
          <span class="ag-btn-group">${j.routeId !== this.routeId ? btn('route-select', 'Open', {kind: 'sm', data: {id: j.routeId}}) : ''}${btn('route-open-tracker', 'Travel tracker', {kind: 'sm', icon: 'fa-solid fa-person-hiking', title: 'Small pop-out window to roll legs over the map'})}</span></div>` : '';
      return `<div class="ag-toolbar agl-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="agl-route-search" placeholder="Search route, place or terrain…" value="${esc(this.routeQuery)}" aria-label="Search routes"></label>
          <span class="ag-toolbar__count" aria-live="polite">Showing ${rows.length} of ${routes.length}</span>
          <div class="ag-toolbar__end">${btn('route-new', 'New route', {icon: 'fa-solid fa-plus'})}</div></div>${banner}
        <div class="agl-body ag-split"><aside class="agl-list ag-split__list">${rows.length ? `<ul class="agl-groups">${groups}</ul>` : none}</aside>
        <section class="agl-detail ag-split__detail">${this.routeEditorHtml([...locs.values()])}</section></div>`;
    },

    routeEditorHtml(locations) {
      const d = this.routeDraft;
      if (!d) return '<div class="ag-empty"><p class="ag-empty__title">No route selected</p><p class="ag-empty__text">Pick one from the list, or create one with New route.</p></div>';
      const r = normalizeRoute(d);
      const defLeg = setting('defaultLegKm', ROUTE_DEFAULTS.legKm);
      const legs = legsOf(r, defLeg);
      const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name));
      const pick = (field, label) => {
        const cur = d[field];
        const missing = cur && !sorted.some(l => l.id === cur) ? `<option value="${esc(cur)}" selected>Missing: ${esc(cur)}</option>` : '';
        return `<div class="ag-field agl-field"><label for="agl-route-${field}">${label}</label><select id="agl-route-${field}" data-rbind="${field}">
          <option value="">Choose a location…</option>${missing}${sorted.map(l => `<option value="${esc(l.id)}" ${l.id === cur ? 'selected' : ''}>${esc(l.name)}${l.region ? ` (${esc(l.region)})` : ''} · ${STATE_LABELS[l.state]}</option>`).join('')}</select></div>`;
      };
      const num = (field, label, {min = 0, max = 100000, step = 'any', placeholder = '', value = d[field]} = {}) => `<div class="ag-field agl-field"><label for="agl-route-${field}">${label}</label>
        <input id="agl-route-${field}" type="number" min="${min}" max="${max}" step="${step}" data-rbind="${field}" value="${value ?? ''}" placeholder="${esc(placeholder)}"></div>`;
      const tables = tableChoices();
      const t = r.hazardTable;
      const tableKnown = !t.uuid || tables.some(x => x.uuid === t.uuid);
      const byName = !t.uuid && t.name;
      const tableSel = `<div class="ag-field agl-field"><label for="agl-route-table">Hazard table (optional)</label><select id="agl-route-table" data-rbind="hazardTable">
        <option value="">None: a hazard just says "Hazard!"</option>
        ${tableKnown ? '' : `<option value="${esc(t.uuid)}" selected>Missing table${t.name ? `: ${esc(t.name)}` : ''} (falls back to "Hazard!")</option>`}
        ${byName ? `<option value="name:${esc(t.name)}" selected>By name: ${esc(t.name)}${tables.some(x => x.name === t.name) ? '' : ' (not in this world: falls back to "Hazard!")'}</option>` : ''}
        ${tables.map(x => `<option value="${esc(x.uuid)}" ${x.uuid === t.uuid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
      const states = d.id ? `<div class="ag-segmented agl-state" role="radiogroup" aria-label="Route discovery">${ROUTE_STATES.map(st => `<button type="button" role="radio" aria-checked="${d.state === st}" data-action="route-state" data-state="${st}"${
        tip(d.state === st ? `${ROUTE_STATE_LABELS[st]} (current)` : `Save, then mark ${ROUTE_STATE_LABELS[st].toLowerCase()}`)}><i class="${ROUTE_STATE_ICONS[st]}" aria-hidden="true"></i> ${ROUTE_STATE_LABELS[st]}</button>`).join('')}</div>` : '';
      return `<form class="agl-editor" autocomplete="off" onsubmit="return false">
        ${d.id ? `<div class="agl-editor__head"><span class="agl-hint">Route</span><div class="ag-btn-group">${btn('route-delete', 'Delete route', {kind: 'danger sm', icon: 'fa-solid fa-trash'})}</div></div>` : ''}
        <div class="agl-title">
          <div class="ag-field agl-name"><label for="agl-route-name">Name (optional)</label><input id="agl-route-name" type="text" data-rbind="name" value="${esc(d.name)}" placeholder="${esc(routeLabel(r, id => locations.find(l => l.id === id)?.name ?? ''))}"></div>
          ${states}
        </div>
        <p class="agl-hint">${d.id ? esc(ROUTE_STATE_HINTS[d.state]) : 'New routes start Unknown: players see nothing until you change that.'} Players see saved changes to a discovered route straight away.</p>
        <p class="agl-id">${d.id ? `ID <code>${esc(d.id)}</code> · made from the two ends when first saved; it never changes and is never reused. Players never see it.` : 'The ID is made from the two ends when you save.'}</p>
        <div class="agl-grid">
          ${pick('fromId', 'From')}${pick('toId', 'To')}
        </div>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-rtoggle="directed" ${d.directed ? 'checked' : ''}> One-way (From → To only)</label>
        <div class="agl-grid">
          ${num('distanceKm', 'Distance (km)', {min: 0.01, placeholder: 'e.g. 30'})}
          ${num('legKm', 'Leg length (km)', {min: 0.01, placeholder: `${defLeg} (world default)`})}
          <div class="ag-field agl-field"><span class="agl-label">Legs</span><p class="agl-legs" aria-live="polite">${legs ? `<strong>${legs}</strong> leg${legs === 1 ? '' : 's'} of ${esc(r.legKm ?? defLeg)} km` : 'Set a distance'}</p></div>
          ${num('hazardBase', 'Base hazard chance (%)', {min: 0, max: 100, step: 1, value: r.hazardBase})}
          ${tableSel}
          <div class="ag-field agl-field"><label for="agl-route-terrain">Terrain (optional)</label><input id="agl-route-terrain" type="text" data-rbind="terrain" value="${esc(d.terrain)}" placeholder="e.g. Forest road"></div>
        </div>
        <div class="ag-field agl-field"><label for="agl-route-notes">GM notes (never shown to players)</label><textarea id="agl-route-notes" rows="3" data-rbind="notes">${esc(d.notes)}</textarea></div>
        ${d.id ? this.drawingHtml(d) : ''}
        ${d.id ? this.journeyHtml(d, locations) : ''}
        ${this.routeVisibilityHtml(d, locations)}
        <p class="agl-hint">Players never see the hazard chance, the hazard table, these notes or the route's ID. Don't put a hidden place's name in the route name or terrain: players who can see both ends see them.</p>
        <footer class="ag-footer agl-footer">
          ${btn('route-cancel', 'Cancel', {kind: 'ghost'})}<span class="ag-footer__status" role="status">${this.routeDirty ? 'Unsaved changes' : ''}</span>
          ${btn('route-save', this.routeDirty ? 'Save Changes •' : 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}
        </footer></form>`;
    },

    /** Who sees it: the unknown-path choice, the audience, and a per-player check of what each one gets right now. */
    routeVisibilityHtml(d, locations) {
      const a = d.audience ?? {mode: 'everyone', userIds: []};
      const players = worldPlayers();
      const radio = (mode, label) => `<label class="ag-field ag-field--inline agl-switch"><input type="radio" name="agl-route-audience" data-raudience="mode" value="${mode}" ${a.mode === mode ? 'checked' : ''} ${d.id ? '' : 'disabled'}> ${label}</label>`;
      const list = a.mode !== 'selected' ? '' : players.length ? `<ul class="ag-list agl-entries agl-audience">${players.map(u => `<li><label class="ag-field ag-field--inline agl-switch">
          <input type="checkbox" data-raudience="user" value="${esc(u.id)}" ${a.userIds.includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label></li>`).join('')}</ul>` : '<p class="ag-empty">No player accounts in this world yet.</p>';
      const byId = new Map(locations.map(l => { const n = normalizeLocation(l); return [n.id, n]; }));
      const saved = d.id ? api().getRoute(d.id) : null;
      const sees = saved ? players.map(u => {
        const v = routeVariantFor(saved, byId, u.id);
        return `<li>${esc(u.name)}: ${v === 'full' ? 'sees the route' : v ? `sees "${UNKNOWN_PATH}" from the end they know` : 'nothing'}</li>`;
      }).join('') : '';
      return `<section class="ag-card agl-section"><header class="agl-section__head"><h3>Who Can See It</h3></header>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-rtoggle="unknownPath" ${d.unknownPath ? 'checked' : ''}> When a player can't see one end, show "${UNKNOWN_PATH}" from the end they can see (otherwise they see nothing)</label>
        <div class="agl-add">${radio('everyone', 'Everyone')}${radio('selected', 'Selected players')}</div>${list}
        <p class="agl-hint">${d.id ? 'Applies at once.' : 'Save the route first.'} On top of this, a player sees a discovered route only while both ends are visible to them (not Hidden, and they are allowed to see that place).</p>
        ${sees ? `<details><summary>Right now (saved route)</summary><ul class="ag-list">${sees}</ul></details>` : ''}</section>`;
    },

    /** GM journey controls for this route: start (either way unless one-way), then Next leg, hazards, Reverse, Abort. */
    journeyHtml(d, locations) {
      const travel = api().getJourney();
      const j = travel.journey;
      const name = id => locations.find(l => l.id === id)?.name || id;
      const saved = api().getRoute(d.id);
      const start = `<div class="agl-add">${btn('route-journey-start', `Start journey: ${name(saved.fromId)} → ${name(saved.toId)}`, {icon: 'fa-solid fa-person-hiking', data: {direction: 'forward'}})}
        ${saved.directed ? '' : btn('route-journey-start', `Start journey: ${name(saved.toId)} → ${name(saved.fromId)}`, {icon: 'fa-solid fa-person-hiking', data: {direction: 'reverse'}})}</div>
        <p class="agl-hint">${saved.legs} leg${saved.legs === 1 ? '' : 's'}. Each leg rolls d100 against the hazard chance: it starts at ${saved.hazardBase}%, doubles after each leg without a hazard (up to 100%) and goes back to ${saved.hazardBase}% after a hazard. Players see the party marker and "leg N of M" only.</p>`;
      const head = '<header class="agl-section__head"><h3>Journey</h3></header>';
      if (j?.status === 'active' && j.routeId !== d.id) return `<section class="ag-card agl-section">${head}<p class="agl-hint">The party is travelling another route (${esc(name(j.fromId))} → ${esc(name(j.toId))}). Finish or abort that journey first.</p></section>`;
      const log = j && j.routeId === d.id && j.log.length ? `<details${j.status === 'active' ? ' open' : ''}><summary>Legs (${j.log.filter(e => !e.reversed).length})</summary><ol class="agl-journey-log">${j.log.map(e => e.reversed
        ? `<li><em>Turned back</em></li>`
        : `<li>Leg ${e.leg}: rolled ${e.roll} vs ${e.chance}% · ${e.hazard ? `<strong>hazard</strong>: ${esc(e.result)} (${e.outcome})` : 'no hazard'}</li>`).join('')}</ol></details>` : '';
      if (j?.status !== 'active' || j.routeId !== d.id) {
        const last = j && j.routeId === d.id ? `<p>Last journey: ${esc(name(j.fromId))} → ${esc(name(j.toId))}, ${j.status === 'arrived' ? `arrived after ${j.legs} leg(s)` : `aborted after ${j.legIndex} leg(s)`}, ${j.hazardCount} hazard(s).</p>
          ${j.status === 'arrived' ? j.travelLog === 'ok' ? `<p class="agl-hint">Logged in ${esc(name(j.toId))}'s Party Notes.</p>` : `<p class="agl-hint">Not logged in Party Notes: ${esc(j.travelLogError || 'unknown error')}</p>${btn('route-travel-retry', 'Retry log', {icon: 'fa-solid fa-rotate'})}` : ''}` : '';
        const pend = j?.pending && j.routeId === d.id ? this.hazardHtml(j) : '';
        return `<section class="ag-card agl-section">${head}${pend}${last}${log}${start}</section>`;
      }
      return `<section class="ag-card agl-section">${head}
        <p><strong>${esc(name(j.fromId))} → ${esc(name(j.toId))}</strong>: leg ${j.legIndex} of ${j.legs} travelled · next leg's hazard chance <strong>${j.currentChance}%</strong> · hazards so far ${j.hazardCount}</p>
        ${j.pending ? this.hazardHtml(j) : ''}
        <div class="agl-add">${btn('route-next-leg', j.legIndex + 1 >= j.legs ? 'Next leg (last: arrive)' : 'Next leg', {icon: 'fa-solid fa-shoe-prints'})}
          ${saved.directed || !j.legIndex ? '' : btn('route-journey-reverse', 'Turn back', {icon: 'fa-solid fa-rotate-left', title: 'The party turns round; the legs travelled become the legs back'})}
          ${btn('route-open-tracker', 'Travel tracker', {icon: 'fa-solid fa-person-hiking', title: 'Small pop-out window to roll legs over the map'})}
          ${btn('route-journey-abort', 'End journey', {kind: 'danger', icon: 'fa-solid fa-ban'})}</div>${log}</section>`;
    },
    /** 1.12.0: the route's map drawing: link the selected one, Draw for me, or unlink. */
    drawingHtml(d) {
      const info = api().routeDrawing(d.id);
      const status = {
        none: 'No drawing linked.',
        missing: 'The linked drawing was deleted or its scene is gone. Link another or Draw for me.',
        elsewhere: 'The linked drawing is now linked to another route. Link another or Draw for me.',
        linked: `Linked to a drawing on <strong>${esc(info.sceneName || 'a scene')}</strong> · ${info.hidden ? 'hidden from players' : 'shown to players'}${info.path ? '' : ' · not a simple line, so the party marker goes straight between the pins'}.`
      }[info.status];
      return `<section class="ag-card agl-section"><header class="agl-section__head"><h3>Map Drawing</h3></header>
        <p>${status}</p>
        ${info.hasText ? '<p class="ag-notice ag-notice--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> This drawing has text. Players read it whenever the drawing is shown: never name a hidden place there.</p>' : ''}
        <div class="agl-add">${btn('route-link-drawing', 'Link selected drawing', {icon: 'fa-solid fa-link', title: 'Select a drawing on the canvas (Drawing tools), then click this'})}
          ${btn('route-draw', 'Draw for me', {icon: 'fa-solid fa-pen-ruler', title: 'Adds a straight line between the two pins on the scene you are viewing; reshape it with the Drawing tools'})}
          ${info.status !== 'none' ? btn('route-unlink-drawing', 'Unlink', {icon: 'fa-solid fa-link-slash', title: 'The drawing stays on the map as it is'}) : ''}</div>
        <p class="agl-hint">Locations only shows or hides the drawing: it is shown only while every player can see this whole route, and hidden otherwise. It never changes the line or its text. The party marker follows the line on its scene. Foundry still sends hidden drawings' data to every client (like any hidden document), so the drawing itself must hold nothing secret.</p></section>`;
    },
    hazardHtml(j) {
      const p = j.pending;
      return `<div class="ag-card agl-hazard" role="alert"><h4>Hazard on leg ${p.leg} (rolled ${p.roll} vs ${p.chance}%)</h4><p>${esc(p.result)}</p>
        ${p.tableMissing ? '<p class="agl-hint">The hazard table was not found, so this is the plain fallback.</p>' : ''}
        <p class="agl-hint">Only you see this. Sharing posts the result to chat for everyone (no route or place names).</p>
        <div class="agl-add">${btn('route-hazard-reroll', 'Reroll', {icon: 'fa-solid fa-dice'})}${btn('route-hazard-dismiss', 'Dismiss', {icon: 'fa-solid fa-xmark'})}
          ${btn('route-hazard-share', 'Share with players', {icon: 'fa-solid fa-bullhorn'})}</div></div>`;
    },

    // ---------- players ----------
    playerJourneyHtml() {
      const v = api().getJourney();
      if (!v || v.status !== 'active') return v?.status === 'arrived' && v.to ? `<p class="agl-hint">The party arrived at ${esc(v.to.name)}.</p>` : '';
      return `<div class="agl-undo agl-journey-banner" role="status"><span><i class="fa-solid fa-person-hiking" aria-hidden="true"></i> The party is travelling${v.from ? ` from <strong>${esc(v.from.name)}</strong>` : ''}${v.to ? ` to <strong>${esc(v.to.name)}</strong>` : ''}: leg ${v.leg} of ${v.legs}${v.paused ? ' (paused)' : ''}.</span>
        ${btn('route-open-tracker', 'Travel tracker', {kind: 'sm', icon: 'fa-solid fa-person-hiking'})}</div>`;
    },
    playerRoutesHtml(views) {
      const journey = this.playerJourneyHtml();
      if (!views.length) return `<div class="agl-routes-player">${journey}<div class="ag-empty"><i class="fa-solid fa-route" aria-hidden="true"></i><p class="ag-empty__title">No routes yet</p><p class="ag-empty__text">Routes appear here once your GM reveals them.</p></div></div>`;
      const groups = [...ROUTE_STATES.filter(s => s !== 'unknown').map(st => ({label: ROUTE_STATE_LABELS[st], list: views.filter(v => v.state === st)})),
        {label: 'Unknown paths', list: views.filter(v => v.state === 'unknown-path')}].filter(g => g.list.length);
      const end = e => e ? `<a class="agl-link" data-action="route-open-place" data-id="${esc(e.key)}">${esc(e.name)}</a>${e.id ? '' : ' <small>(unidentified)</small>'}` : '<em>somewhere unknown</em>';
      const card = v => `<li class="ag-card agl-route-card"><h4>${esc(v.name || routeLabel(v))}</h4>
        <p>${end(v.from)} ${v.directed ? '→' : '–'} ${end(v.to)}</p>
        ${v.variant === 'full' ? `<p class="agl-hint">${esc(v.distanceKm)} km · ${v.legs} leg${v.legs === 1 ? '' : 's'}${v.terrain ? ` · ${esc(v.terrain)}` : ''}${v.directed ? ' · one-way' : ''}</p>` : ''}</li>`;
      return `<div class="agl-routes-player">${journey}${groups.map(g => `<section class="ag-section"><h3 class="ag-eyebrow">${esc(g.label)} <span class="agl-count">${g.list.length}</span></h3><ul class="agl-route-cards">${g.list.map(card).join('')}</ul></section>`).join('')}</div>`;
    },

    // ---------- events ----------
    bindRoutes(root) {
      root.querySelector('#agl-route-search')?.addEventListener('input', e => {
        this.routeQuery = e.target.value; const pos = e.target.selectionStart;
        this.render().then(() => { const s = this.element.querySelector('#agl-route-search'); s?.focus(); s?.setSelectionRange(pos, pos); });
      });
      if (!this.gm) return;
      for (const el of root.querySelectorAll('[data-rbind]')) {
        el.addEventListener('input', () => { this.setRouteField(el.dataset.rbind, el.value); this.routeTouch(); });
        if (el.tagName === 'SELECT' || el.type === 'number') el.addEventListener('change', () => { this.setRouteField(el.dataset.rbind, el.value); this.routeTouch(); this.render(); });
      }
      for (const el of root.querySelectorAll('[data-rtoggle]')) el.addEventListener('change', () => { this.routeDraft[el.dataset.rtoggle] = el.checked; this.routeTouch(); this.render(); });
      for (const el of root.querySelectorAll('[data-raudience]')) el.addEventListener('change', () => this.onRouteAudience(el).catch(notifyError));
    },
    setRouteField(field, value) {
      if (!this.routeDraft) return;
      if (field === 'hazardTable') {
        const name = value.startsWith('name:') ? value.slice(5) : tableChoices().find(x => x.uuid === value)?.name ?? this.routeDraft.hazardTable?.name ?? '';
        this.routeDraft.hazardTable = value.startsWith('name:') ? {uuid: '', name} : {uuid: value, name: value ? name : ''};
      } else this.routeDraft[field] = value;
    },
    async confirmRouteDiscard() {
      if (!this.routeDirty) return true;
      return confirmDialog('You have unsaved changes to this route. Discard them?',
        {title: 'Discard changes?', yes: 'Discard changes', no: 'Keep editing', danger: true});
    },
    async saveRouteDraft() {
      if (!this.routeDirty && this.routeDraft?.id) return this.routeDraft;
      // The API normalizes; it gets the numbers as typed so it can refuse a distance or leg that rounds to 0 km.
      const saved = await api().saveRoute({...this.routeDraft, id: this.routeDraft.id || ''});
      this.selectRoute(saved.id);
      return saved;
    },
    async onRouteAudience(el) {
      const d = this.routeDraft;
      if (!d?.id) return;
      const a = d.audience;
      const next = {mode: a.mode, userIds: [...a.userIds]};
      if (el.dataset.raudience === 'mode' && AUDIENCE_MODES.includes(el.value)) next.mode = el.value;
      if (el.dataset.raudience === 'user') next.userIds = el.checked ? [...new Set([...next.userIds, el.value])] : next.userIds.filter(u => u !== el.value);
      d.audience = await api().setRouteAudience(d.id, next);
      return this.render();
    },
    async onRouteAction(action, el) {
      if (action === 'route-open-place') { this.tab = 'locations'; this.select(el.dataset.id); return this.render(); }
      // 1.14.0: the pop-out tracker, for the GM and players (the API checks access).
      if (action === 'route-open-tracker') return api().travel.open();
      if (action === 'route-select') {
        if (el.dataset.id === this.routeId || !(await this.confirmRouteDiscard())) return;
        this.selectRoute(el.dataset.id); return this.render();
      }
      if (!this.gm) return;
      switch (action) {
        case 'route-new': {
          if (!(await this.confirmRouteDiscard())) return;
          this.routeId = null;
          this.routeDraft = {...normalizeRoute({}), legKm: null, distanceKm: ''}; this.routeDirty = true;
          return this.render();
        }
        case 'route-cancel': this.selectRoute(this.routeDraft?.id || null); return this.render();
        case 'route-save': {
          const saved = await this.saveRouteDraft();
          ui.notifications.info(`Saved route ${saved.name || saved.id}.`);
          return this.render();
        }
        case 'route-state': {
          const saved = await this.saveRouteDraft();
          const state = el.dataset.state;
          if (saved.state === state) return this.render();
          await api().setRouteState(saved.id, state);
          this.selectRoute(saved.id);
          ui.notifications.info(`Route is now ${ROUTE_STATE_LABELS[state].toLowerCase()}.`);
          return this.render();
        }
        case 'route-delete': {
          const d = this.routeDraft;
          const message = `Delete ${d.name ? `the route ${d.name}` : 'this route'}? Players who could see it lose it. Its ID is never used again.`;
          const linked = api().routeDrawing(d.id).status === 'linked';
          const choice = linked
            ? await choiceDialog('Delete route?', `<p>${esc(message)}</p><p>It has a map drawing. Keep the drawing on the map, or delete it too?</p>`,
              [{action: 'keep', label: 'Delete route, keep drawing', danger: true}, {action: 'both', label: 'Delete route and drawing', danger: true}])
            : await confirmDialog(message, {title: 'Delete route?', yes: 'Delete route', danger: true}) ? 'keep' : 'cancel';
          if (choice !== 'keep' && choice !== 'both') return;
          await api().deleteRoute(d.id, {deleteDrawing: choice === 'both'});
          this.selectRoute(null); return this.render();
        }
        case 'route-link-drawing': {
          const saved = await this.saveRouteDraft();
          const doc = globalThis.canvas?.drawings?.controlled?.[0]?.document ?? null;
          if (!doc?.uuid) return ui.notifications.warn('Select a drawing on the canvas first (Drawing tools), then click Link selected drawing.');
          await api().linkRouteDrawing(saved.id, doc.uuid);
          ui.notifications.info('Drawing linked. Locations will show or hide it with the route.');
          return this.render();
        }
        case 'route-draw': {
          const saved = await this.saveRouteDraft();
          await api().drawRoute(saved.id);
          ui.notifications.info('Drew a line between the pins. Reshape it with the Drawing tools if you like.');
          return this.render();
        }
        case 'route-unlink-drawing': await api().unlinkRouteDrawing(this.routeDraft.id); ui.notifications.info('Unlinked. The drawing stays on the map.'); return this.render();
        case 'route-journey-start': {
          const saved = await this.saveRouteDraft();
          const j = await api().startJourney(saved.id, {direction: el.dataset.direction});
          ui.notifications.info(`The party sets out: ${j.legs} leg(s).`);
          return this.render();
        }
        case 'route-next-leg': {
          const r = await api().nextLeg();
          const j = r.journey;
          const msg = r.hazard ? `Leg ${j.legIndex} of ${j.legs}: HAZARD (rolled ${r.roll} vs ${r.chance}%). Chance back to ${j.currentChance}%.`
            : `Leg ${j.legIndex} of ${j.legs}: no hazard (rolled ${r.roll} vs ${r.chance}%). Next chance ${j.currentChance}%.`;
          (r.hazard ? ui.notifications.warn : ui.notifications.info).call(ui.notifications, msg);
          if (r.arrived) ui.notifications[j.travelLog === 'ok' ? 'info' : 'warn'](j.travelLog === 'ok' ? 'Arrived. The trip is in the Party Notes there.' : `Arrived. The trip could not be added to Party Notes: ${j.travelLogError}`);
          return this.render();
        }
        case 'route-hazard-reroll': await api().rerollHazard(); return this.render();
        case 'route-hazard-dismiss': await api().dismissHazard(); return this.render();
        case 'route-hazard-share': await api().shareHazard(); ui.notifications.info('Shared with players in chat.'); return this.render();
        case 'route-journey-reverse': await api().reverseJourney(); ui.notifications.info('The party turns back.'); return this.render();
        case 'route-journey-abort': {
          const ok = await confirmDialog('End this journey where the party is? Nothing is written to Party Notes.', {title: 'End journey?', yes: 'End journey'});
          if (!ok) return;
          await api().abortJourney(); return this.render();
        }
        case 'route-travel-retry': {
          const j = await api().retryTravelLog();
          ui.notifications[j.travelLog === 'ok' ? 'info' : 'warn'](j.travelLog === 'ok' ? 'Added to Party Notes.' : `Still could not add it: ${j.travelLogError}`);
          return this.render();
        }
      }
    },
    routeSetupHtml() {
      return `<section class="ag-card"><h3>Routes</h3>
        <div class="ag-field agl-field"><label for="agl-set-leg">Default leg length (km)</label><input id="agl-set-leg" type="number" min="0.01" step="any" value="${esc(setting('defaultLegKm', ROUTE_DEFAULTS.legKm))}"></div>
        <p class="agl-hint">Used by routes that don't set their own leg length. Legs = distance ÷ leg length, rounded up.</p></section>`;
    }
  };
}
