/**
 * 1.10.0 Routes tab of the Locations window. Mixed into LocationsApp (see app.mjs), so `this` is the app.
 * GM: route list (search, grouped by discovery) and editor. Players: the routes they may see, read-only.
 * Every rule is enforced in the API; this only draws and calls it.
 */
import {MODULE_ID, esc, clone, normalizeLocation, AUDIENCE_MODES, STATE_LABELS} from './model.mjs';
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
        return `<li><button type="button" class="agl-row${r.id === this.routeId ? ' active' : ''}" data-action="route-select" data-id="${esc(r.id)}">
          <span class="agl-row__name">${esc(routeLabel(r, nameOf))}</span>
          ${broken ? '<i class="fa-solid fa-triangle-exclamation agl-row__rev" title="An endpoint location no longer exists"></i>' : ''}
          <span class="agl-count" title="${r.distanceKm} km in ${r.legs} leg(s)">${esc(r.distanceKm)} km · ${r.legs}</span>
          <i class="${ROUTE_STATE_ICONS[r.state]} agl-row__rev" title="${ROUTE_STATE_LABELS[r.state]}"></i></button></li>`;
      };
      const groups = ROUTE_STATES.map(st => ({st, list: rows.filter(r => r.state === st)})).filter(g => g.list.length)
        .map(g => `<li class="agl-group"><h3>${ROUTE_STATE_LABELS[g.st]} <span class="agl-count">${g.list.length}</span></h3><ul class="ag-list">${g.list.map(row).join('')}</ul></li>`).join('');
      const none = routes.length ? '<p class="ag-empty">No routes match.</p>' : '<p class="ag-empty">No routes yet. Click <strong>New Route</strong> to join two locations.</p>';
      return `<div class="ag-toolbar"><input type="search" id="agl-route-search" placeholder="Search route, place or terrain…" value="${esc(this.routeQuery)}" aria-label="Search routes">
          ${btn('route-new', 'New Route', {kind: 'primary', icon: 'fa-solid fa-plus'})}</div>
        <div class="agl-body"><aside class="agl-list">${rows.length ? `<ul class="agl-groups">${groups}</ul>` : none}</aside>
        <section class="agl-detail">${this.routeEditorHtml([...locs.values()])}</section></div>`;
    },

    routeEditorHtml(locations) {
      const d = this.routeDraft;
      if (!d) return '<p class="ag-empty">Select a route, or create a new one.</p>';
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
      const states = d.id ? `<div class="agl-state" role="group" aria-label="Route discovery">${ROUTE_STATES.map(st =>
        btn('route-state', ROUTE_STATE_LABELS[st], {kind: d.state === st ? 'primary' : '', icon: ROUTE_STATE_ICONS[st], data: {state: st},
          title: d.state === st ? `${ROUTE_STATE_LABELS[st]} (current)` : `Save, then mark ${ROUTE_STATE_LABELS[st].toLowerCase()}`})).join('')}</div>` : '';
      return `<form class="agl-editor" autocomplete="off" onsubmit="return false">
        <div class="agl-title">
          <div class="ag-field agl-name"><label for="agl-route-name">Name (optional)</label><input id="agl-route-name" type="text" data-rbind="name" value="${esc(d.name)}" placeholder="${esc(routeLabel(r, id => locations.find(l => l.id === id)?.name ?? ''))}"></div>
          ${states}
        </div>
        <p class="agl-hint">${d.id ? esc(ROUTE_STATE_HINTS[d.state]) : 'New routes start Unknown: players see nothing until you change that.'} Players see saved changes to a discovered route straight away.</p>
        <p class="agl-id">${d.id ? `ID <code>${esc(d.id)}</code> · made from the two ends when first saved; it never changes and is never reused. Players never see it.` : 'The ID is made from the two ends when you save.'}</p>
        <div class="agl-grid">
          ${pick('fromId', 'From')}${pick('toId', 'To')}
        </div>
        <label class="agl-switch"><input type="checkbox" data-rtoggle="directed" ${d.directed ? 'checked' : ''}> One-way (From → To only)</label>
        <div class="agl-grid">
          ${num('distanceKm', 'Distance (km)', {min: 0.01, placeholder: 'e.g. 30'})}
          ${num('legKm', 'Leg length (km)', {min: 0.01, placeholder: `${defLeg} (world default)`})}
          <div class="ag-field agl-field"><span class="agl-label">Legs</span><p class="agl-legs" aria-live="polite">${legs ? `<strong>${legs}</strong> leg${legs === 1 ? '' : 's'} of ${esc(r.legKm ?? defLeg)} km` : 'Set a distance'}</p></div>
          ${num('hazardBase', 'Base hazard chance (%)', {min: 0, max: 100, step: 1, value: r.hazardBase})}
          ${tableSel}
          <div class="ag-field agl-field"><label for="agl-route-terrain">Terrain (optional)</label><input id="agl-route-terrain" type="text" data-rbind="terrain" value="${esc(d.terrain)}" placeholder="e.g. Forest road"></div>
        </div>
        <div class="ag-field agl-field"><label for="agl-route-notes">GM notes (never shown to players)</label><textarea id="agl-route-notes" rows="3" data-rbind="notes">${esc(d.notes)}</textarea></div>
        ${this.routeVisibilityHtml(d, locations)}
        <p class="agl-hint">Players never see the hazard chance, the hazard table, these notes or the route's ID. Don't put a hidden place's name in the route name or terrain: players who can see both ends see them.</p>
        <footer class="agl-footer">
          <div>${btn('route-cancel', 'Cancel', {kind: 'ghost'})}${d.id ? btn('route-delete', 'Delete', {kind: 'danger', icon: 'fa-solid fa-trash'}) : ''}</div>
          <div>${btn('route-save', this.routeDirty ? 'Save Changes •' : 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</div>
        </footer></form>`;
    },

    /** Who sees it: the unknown-path choice, the audience, and a per-player check of what each one gets right now. */
    routeVisibilityHtml(d, locations) {
      const a = d.audience ?? {mode: 'everyone', userIds: []};
      const players = worldPlayers();
      const radio = (mode, label) => `<label class="agl-switch"><input type="radio" name="agl-route-audience" data-raudience="mode" value="${mode}" ${a.mode === mode ? 'checked' : ''} ${d.id ? '' : 'disabled'}> ${label}</label>`;
      const list = a.mode !== 'selected' ? '' : players.length ? `<ul class="ag-list agl-entries agl-audience">${players.map(u => `<li><label class="agl-switch">
          <input type="checkbox" data-raudience="user" value="${esc(u.id)}" ${a.userIds.includes(u.id) ? 'checked' : ''}> ${esc(u.name)}</label></li>`).join('')}</ul>` : '<p class="ag-empty">No player accounts in this world yet.</p>';
      const byId = new Map(locations.map(l => { const n = normalizeLocation(l); return [n.id, n]; }));
      const saved = d.id ? api().getRoute(d.id) : null;
      const sees = saved ? players.map(u => {
        const v = routeVariantFor(saved, byId, u.id);
        return `<li>${esc(u.name)}: ${v === 'full' ? 'sees the route' : v ? `sees "${UNKNOWN_PATH}" from the end they know` : 'nothing'}</li>`;
      }).join('') : '';
      return `<section class="ag-card agl-section"><header class="agl-section__head"><h3>Who Can See It</h3></header>
        <label class="agl-switch"><input type="checkbox" data-rtoggle="unknownPath" ${d.unknownPath ? 'checked' : ''}> When a player can't see one end, show "${UNKNOWN_PATH}" from the end they can see (otherwise they see nothing)</label>
        <div class="agl-add">${radio('everyone', 'Everyone')}${radio('selected', 'Selected players')}</div>${list}
        <p class="agl-hint">${d.id ? 'Applies at once.' : 'Save the route first.'} On top of this, a player sees a discovered route only while both ends are visible to them (not Hidden, and they are allowed to see that place).</p>
        ${sees ? `<details><summary>Right now (saved route)</summary><ul class="ag-list">${sees}</ul></details>` : ''}</section>`;
    },

    // ---------- players ----------
    playerRoutesHtml(views) {
      if (!views.length) return '<p class="ag-empty">No routes have been discovered yet.</p>';
      const groups = [...ROUTE_STATES.filter(s => s !== 'unknown').map(st => ({label: ROUTE_STATE_LABELS[st], list: views.filter(v => v.state === st)})),
        {label: 'Unknown paths', list: views.filter(v => v.state === 'unknown-path')}].filter(g => g.list.length);
      const end = e => e ? `<a class="agl-link" data-action="route-open-place" data-id="${esc(e.key)}">${esc(e.name)}</a>${e.id ? '' : ' <small>(unidentified)</small>'}` : '<em>somewhere unknown</em>';
      const card = v => `<li class="ag-card agl-route-card"><h4>${esc(v.name || routeLabel(v))}</h4>
        <p>${end(v.from)} ${v.directed ? '→' : '–'} ${end(v.to)}</p>
        ${v.variant === 'full' ? `<p class="agl-hint">${esc(v.distanceKm)} km · ${v.legs} leg${v.legs === 1 ? '' : 's'}${v.terrain ? ` · ${esc(v.terrain)}` : ''}${v.directed ? ' · one-way' : ''}</p>` : ''}</li>`;
      return `<div class="agl-routes-player">${groups.map(g => `<section><h3>${esc(g.label)}</h3><ul class="agl-route-cards">${g.list.map(card).join('')}</ul></section>`).join('')}</div>`;
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
      return foundry.applications.api.DialogV2.confirm({window: {title: 'Discard changes?'}, content: '<p>You have unsaved changes to this route. Discard them?</p>',
        yes: {label: 'Discard Changes'}, no: {label: 'Keep Editing'}, rejectClose: false});
    },
    async saveRouteDraft() {
      if (!this.routeDirty && this.routeDraft?.id) return this.routeDraft;
      const saved = await api().saveRoute(normalizeRoute({...this.routeDraft, id: this.routeDraft.id || ''}));
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
          const ok = await foundry.applications.api.DialogV2.confirm({window: {title: 'Delete route?'},
            content: `<p>Delete the route <strong>${esc(d.name || d.id)}</strong>? Players who could see it lose it. Its ID <code>${esc(d.id)}</code> is never used again.</p>`,
            yes: {label: 'Delete Route'}, no: {label: 'Keep'}, rejectClose: false});
          if (!ok) return;
          await api().deleteRoute(d.id);
          this.selectRoute(null); return this.render();
        }
        case 'route-save-setup': {
          const v = Number(this.element.querySelector('#agl-set-leg')?.value);
          if (!(v > 0)) return ui.notifications.warn('Leg length must be more than 0 km.');
          await game.settings.set(MODULE_ID, 'defaultLegKm', v);
          ui.notifications.info(`Default leg length is now ${v} km.`);
          return this.render();
        }
      }
    },
    routeSetupHtml() {
      return `<section class="ag-card"><h3>Routes</h3>
        <div class="ag-field agl-field"><label for="agl-set-leg">Default leg length (km)</label><input id="agl-set-leg" type="number" min="0.01" step="any" value="${esc(setting('defaultLegKm', ROUTE_DEFAULTS.legKm))}"></div>
        <p class="agl-hint">Used by routes that don't set their own leg length. Legs = distance ÷ leg length, rounded up.</p>
        <div class="agl-add">${btn('route-save-setup', 'Save Leg Length', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</div></section>`;
    }
  };
}
