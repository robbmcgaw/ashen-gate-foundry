/** The Locations window: GM builder (list + editor + GM Setup) and the player viewer, one class. */
import {MODULE_ID, THREATS, FIELDS, SECTIONS, NOTE_DOC_TYPES, FACTION_DOC_TYPES, esc, clone, threatLabel, normalizeLocation, newKey, materialIdOf} from './model.mjs';

const QUEST_MODULE = 'ashen-gate-quest-manager';
const FIELD_LABELS = {type: 'Type', region: 'Region', description: 'Description', img: 'Image', threat: 'Threat'};
const api = () => game.modules.get(MODULE_ID)?.api;
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };
const questApi = () => { const m = game.modules.get(QUEST_MODULE); return m?.active ? m.api ?? null : null; };
const btn = (action, label, {kind = '', icon = '', data = {}, title = ''} = {}) =>
  `<button type="button" class="ag-btn${kind ? ` ag-btn--${kind}` : ''}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${title ? ` title="${esc(title)}"` : ''}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
const eye = (bind, on, what) => `<label class="agl-eye" title="${on ? 'Visible' : 'Hidden'} to players: ${esc(what)}"><input type="checkbox" data-toggle="${esc(bind)}" ${on ? 'checked' : ''}><i class="fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i><span class="agl-sr">Show ${esc(what)} to players</span></label>`;
const threatBadge = value => `<span class="ag-badge agl-threat agl-threat--${esc(value)}">${esc(threatLabel(value))}</span>`;

function dragData(event) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try { return TE?.getDragEventData?.(event) ?? JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return null; }
}
async function openDocument(uuid) {
  const doc = uuid ? await fromUuid(uuid) : null;
  if (!doc) return ui.notifications.warn('That linked document no longer exists.');
  if (!game.user.isGM && !doc.testUserPermission(game.user, 'LIMITED')) return ui.notifications.warn(`You don't have permission to open ${doc.name}.`);
  if (doc.documentName === 'JournalEntryPage') return doc.parent.sheet.render(true, {pageId: doc.id});
  return doc.sheet.render(true);
}
async function openQuest(id) {
  const q = questApi();
  if (!q?.openObjective) return ui.notifications.warn('Quest Manager is not active.');
  const result = await q.openObjective(id);
  if (result?.status === 'not_found') ui.notifications.warn('That quest is not available in your Quest Log.');
}
/** Quest names: GM sees every quest, players only what Quest Manager lets them see. */
function questChoices() {
  const q = questApi();
  try {
    if (game.user.isGM && q?.listQuests) return q.listQuests();
    return (q?.listVisible?.() ?? []).map(v => ({id: v.id, name: v.name, status: v.status}));
  } catch { return []; }
}
function questName(id, choices) {
  const hit = choices.find(c => c.id === id);
  if (hit) return hit.name;
  if (game.user.isGM) { try { return questApi()?.getGMSource?.(id)?.name ?? null; } catch { return null; } }
  try { return questApi()?.getVisibleObjective?.(id)?.name ?? null; } catch { return null; }
}

const Base = foundry.applications.api.ApplicationV2;
export class LocationsApp extends Base {
  static DEFAULT_OPTIONS = {id: 'ag-locations', classes: ['ag-app', 'ag-locations'], window: {title: 'Ashen Gate | Locations', resizable: true}, position: {width: 980, height: 720}};
  static instance = null;
  static async show(id = null) {
    const app = LocationsApp.instance?.rendered ? LocationsApp.instance : (LocationsApp.instance = new LocationsApp());
    if (id && id !== app.selectedId) { if (!(await app.confirmDiscard())) return app; app.select(id); }
    if (id) app.tab = 'locations';
    await app.render({force: true});
    app.bringToFront?.();
    return app;
  }

  constructor(options = {}) {
    super(options);
    this.tab = 'locations'; this.query = ''; this.selectedId = null; this.draft = null; this.dirty = false;
  }
  get gm() { return game.user.isGM === true; }
  list() { return this.gm ? api().listLocations() : api().listLocations({revealedOnly: true}); }
  select(id) {
    this.selectedId = id;
    this.draft = this.gm && id ? clone(api().getLocation(id)) : null;
    this.dirty = false;
  }
  async confirmDiscard() {
    if (!this.dirty) return true;
    return foundry.applications.api.DialogV2.confirm({window: {title: 'Discard changes?'}, content: '<p>You have unsaved changes to this location. Discard them?</p>',
      yes: {label: 'Discard Changes'}, no: {label: 'Keep Editing'}, rejectClose: false});
  }
  async close(options = {}) {
    if (!(await this.confirmDiscard())) return this;
    this.dirty = false;
    return super.close(options);
  }

  async _renderHTML() {
    const list = this.list();
    const creating = this.gm && this.draft && !this.draft.id;
    if (!creating) {
      if (this.selectedId && !list.some(l => l.id === this.selectedId)) this.select(null);
      if (!this.selectedId && list.length) this.select(list[0].id);
      if (this.gm && this.selectedId && !this.draft) this.select(this.selectedId);
    }
    const version = game.modules.get(MODULE_ID)?.version ?? '';
    return `<div class="agl-root">
      <header class="ag-header"><h1>Ashen Gate | Locations</h1><div class="ag-header__actions"><span class="ag-version">v${esc(version)}</span>${btn('help', 'Help', {kind: 'ghost', icon: 'fa-solid fa-circle-question'})}</div></header>
      ${this.gm ? `<nav class="ag-tabs" aria-label="Locations sections">${[['locations', 'Locations'], ['setup', 'GM Setup']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${l}</button>`).join('')}</nav>` : ''}
      ${this.tab === 'setup' && this.gm ? this.setupHtml() : this.locationsHtml(list)}
    </div>`;
  }
  _replaceHTML(result, content) {
    const scroll = content.querySelector('.agl-detail')?.scrollTop ?? 0;
    content.innerHTML = result;
    const detail = content.querySelector('.agl-detail');
    if (detail) detail.scrollTop = scroll;
    this.bind(content);
    try { const a = game.modules.get('ashen-gate-manager')?.api?.appearance; if (a?.contract === 'ag-appearance/0.1-beta') a.applyTo?.(content); } catch {}
  }

  // ---------- list ----------
  locationsHtml(list) {
    const q = this.query.toLowerCase();
    const rows = list.filter(l => !q || [l.name, l.type, l.region].some(s => String(s ?? '').toLowerCase().includes(q)));
    const groups = new Map();
    for (const l of rows) { const g = l.region || 'No region'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l); }
    const sorted = [...groups.entries()].sort(([a], [b]) => (a === 'No region') - (b === 'No region') || a.localeCompare(b));
    const items = sorted.map(([group, ls]) => `<li class="agl-group"><h3>${esc(group)}</h3><ul class="ag-list">${ls.map(l => `
      <li><button type="button" class="agl-row${l.id === this.selectedId ? ' active' : ''}" data-action="select" data-id="${esc(l.id)}" ${this.gm ? 'draggable="true"' : ''}>
        <span class="agl-row__name">${esc(l.name)}</span>
        ${l.threat ? threatBadge(l.threat) : ''}
        ${this.gm ? `<i class="fa-solid ${l.revealed ? 'fa-eye' : 'fa-eye-slash'} agl-row__rev" title="${l.revealed ? 'Revealed' : 'Not revealed'}"></i>` : ''}
      </button></li>`).join('')}</ul></li>`).join('');
    const empty = this.gm ? 'No locations yet. Click <strong>New Location</strong> to create one.' : 'No locations have been revealed yet.';
    return `<div class="ag-toolbar"><input type="search" id="agl-search" placeholder="Search locations" value="${esc(this.query)}" aria-label="Search locations">
        ${this.gm ? btn('new', 'New Location', {kind: 'primary', icon: 'fa-solid fa-plus'}) : ''}</div>
      <div class="agl-body"><aside class="agl-list">${rows.length ? `<ul class="agl-groups">${items}</ul>` : `<p class="ag-empty">${list.length ? 'No matches.' : empty}</p>`}
        ${this.gm && rows.length ? '<p class="agl-hint">Drag a location onto the scene to place a Map Note.</p>' : ''}</aside>
      <section class="agl-detail">${this.gm ? this.editorHtml() : this.viewerHtml(list.find(l => l.id === this.selectedId))}</section></div>`;
  }

  // ---------- player viewer ----------
  viewerHtml(v) {
    if (!v) return '<p class="ag-empty">Select a location.</p>';
    const quests = questChoices();
    const link = (label, uuid) => uuid ? `<a class="agl-link" data-action="open-doc" data-uuid="${esc(uuid)}">${esc(label)}</a>` : esc(label);
    const card = (title, body) => body ? `<section class="ag-card"><h3>${title}</h3>${body}</section>` : '';
    const ul = items => items.length ? `<ul class="ag-list agl-entries">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
    const questItems = (v.quests ?? []).map(id => [id, questName(id, quests)]).filter(([, n]) => n)
      .map(([id, n]) => `<a class="agl-link" data-action="open-quest" data-id="${esc(id)}"><i class="fa-solid fa-scroll"></i> ${esc(n)}</a>`);
    return `<article class="agl-view">
      <div class="agl-title"><h2>${esc(v.name)}</h2>${v.threat ? threatBadge(v.threat) : ''}</div>
      ${v.type || v.region ? `<p class="agl-meta">${[v.type, v.region].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
      ${v.img ? `<img class="agl-img" src="${esc(v.img)}" alt="">` : ''}
      ${v.description ? `<p class="agl-desc">${esc(v.description).replace(/\n/g, '<br>')}</p>` : ''}
      ${card('Gathering Resources', ul((v.resources ?? []).map(r => `${link(r.label, r.uuid)} <span class="ag-badge ${r.available ? 'agl-ok' : 'agl-off'}">${r.available ? 'Available' : 'Unavailable'}</span>${r.note ? `<small>${esc(r.note)}</small>` : ''}`)))}
      ${card('Factions', ul((v.factions ?? []).map(f => `${link(f.label, f.uuid)}${f.note ? ` <small>${esc(f.note)}</small>` : ''}`)))}
      ${card('Quests', ul(questItems))}
      ${card('Related Locations', ul((v.related ?? []).map(r => `<a class="agl-link" data-action="select" data-id="${esc(r.id)}">${esc(r.name)}</a>`)))}
      ${(v.notes ?? []).map(n => card(esc(n.title || 'Note'), `${n.text ? `<p>${esc(n.text).replace(/\n/g, '<br>')}</p>` : ''}${n.uuid ? `<p>${link(`Open ${n.docType || 'document'}`, n.uuid)}</p>` : ''}`)).join('')}
    </article>`;
  }

  // ---------- GM editor ----------
  editorHtml() {
    const d = this.draft;
    if (!d) return '<p class="ag-empty">Select a location, or create a new one.</p>';
    const all = api().listLocations();
    const quests = questChoices();
    const fld = (f, control) => `<div class="ag-field agl-field"><label for="agl-${f}">${FIELD_LABELS[f]}</label><div class="agl-field__row">${control}${eye(`show.${f}`, d.show[f], FIELD_LABELS[f])}</div></div>`;
    const sec = (key, body, add, dropHint) => {
      const label = SECTIONS.find(s => s.key === key).label;
      return `<section class="ag-card agl-section" data-drop="${key}">
        <header class="agl-section__head"><h3>${label}</h3><label class="agl-switch"><input type="checkbox" data-toggle="sections.${key}" ${d.sections[key] ? 'checked' : ''}> Show section to players</label></header>
        ${body || `<p class="ag-empty">${dropHint}</p>`}<div class="agl-add">${add}</div></section>`;
    };
    const entryTools = (key, e) => `${eye(`${key}.${e.key}.visible`, e.visible, 'this entry')}${btn('remove', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {section: key, key: e.key}, title: 'Remove'})}`;
    const docLink = (label, uuid) => uuid ? `<a class="agl-link" data-action="open-doc" data-uuid="${esc(uuid)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
    const rows = (key, fn) => d[key].length ? `<ul class="ag-list agl-entries">${d[key].map(e => `<li class="${e.visible ? '' : 'agl-hidden'}">${fn(e)}<span class="agl-tools">${entryTools(key, e)}</span></li>`).join('')}</ul>` : '';
    const addText = (key, placeholder) => `<input type="text" id="agl-add-${key}" placeholder="${placeholder}">${btn('add-text', 'Add', {data: {section: key}, icon: 'fa-solid fa-plus'})}`;

    const resources = rows('resources', e => `<span class="agl-entry">${docLink(e.label || e.materialId, e.uuid)}${e.materialId ? ` <code>${esc(e.materialId)}</code>` : ''}</span>
      <label class="agl-switch"><input type="checkbox" data-toggle="resources.${e.key}.available" ${e.available ? 'checked' : ''}> Available</label>`);
    const factions = rows('factions', e => `<span class="agl-entry">${docLink(e.label, e.uuid)}</span>`);
    const questRows = rows('quests', e => {
      const name = questName(e.questId, quests);
      return `<span class="agl-entry"><a class="agl-link" data-action="open-quest" data-id="${esc(e.questId)}"><i class="fa-solid fa-scroll"></i> ${esc(name ?? e.questId)}</a>${name ? '' : ' <small>(not found in Quest Manager)</small>'}</span>`;
    });
    const linkedQuests = new Set(d.quests.map(q => q.questId));
    const questAdd = questApi()
      ? `<select id="agl-add-quests"><option value="">Choose a quest…</option>${quests.filter(q => !linkedQuests.has(q.id)).map(q => `<option value="${esc(q.id)}">${esc(q.name)}${q.status ? ` (${esc(q.status)})` : ''}</option>`).join('')}</select>${btn('add-quest', 'Link', {icon: 'fa-solid fa-link'})}`
      : '<p class="agl-hint">Activate Quest Manager to link quests.</p>';
    const byId = new Map(all.map(l => [l.id, l.name]));
    const relatedRows = rows('related', e => `<span class="agl-entry">${byId.has(e.locationId) ? `<a class="agl-link" data-action="select" data-id="${esc(e.locationId)}">${esc(byId.get(e.locationId))}</a>` : `${esc(e.locationId)} <small>(deleted)</small>`}</span>`);
    const linkedRel = new Set(d.related.map(r => r.locationId));
    const relatedAdd = `<select id="agl-add-related"><option value="">Choose a location…</option>${all.filter(l => l.id !== d.id && !linkedRel.has(l.id)).map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>${btn('add-related', 'Link', {icon: 'fa-solid fa-link'})}`;
    const notes = d.notes.length ? d.notes.map(n => `<div class="agl-note ${n.visible ? '' : 'agl-hidden'}">
        <div class="agl-field__row"><input type="text" data-bind="notes.${n.key}.title" value="${esc(n.title)}" placeholder="Title" aria-label="Note title">${entryTools('notes', n)}</div>
        ${n.uuid ? `<p>${docLink(`Linked ${n.docType || 'document'}`, n.uuid)}</p>` : ''}
        <textarea rows="3" data-bind="notes.${n.key}.text" placeholder="Text" aria-label="Note text">${esc(n.text)}</textarea></div>`).join('') : '';

    return `<form class="agl-editor" autocomplete="off" onsubmit="return false">
      <div class="agl-title">
        <div class="ag-field agl-name"><label for="agl-name">Name</label><input id="agl-name" type="text" data-bind="name" value="${esc(d.name)}" placeholder="Location name"></div>
        <label class="agl-switch agl-reveal"><input type="checkbox" data-toggle="revealed" ${d.revealed ? 'checked' : ''}> Revealed to players</label>
      </div>
      <p class="agl-id">${d.id ? `ID <code>${esc(d.id)}</code> · made from the name when first saved; it never changes` : 'The ID is made from the name when you save.'}</p>
      <div class="agl-grid">
        ${fld('type', `<input id="agl-type" type="text" data-bind="type" value="${esc(d.type)}" placeholder="e.g. Town, Ruin, Forest">`)}
        ${fld('region', `<input id="agl-region" type="text" data-bind="region" value="${esc(d.region)}" placeholder="e.g. Northern Marches">`)}
        ${fld('threat', `<select id="agl-threat" data-bind="threat">${THREATS.map(t => `<option value="${t.value}" ${d.threat === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>${threatBadge(d.threat)}`)}
        ${fld('img', `<input id="agl-img" type="text" data-bind="img" value="${esc(d.img)}" placeholder="path/to/image.webp">${btn('browse-img', '', {icon: 'fa-solid fa-folder-open', title: 'Browse'})}`)}
      </div>
      ${d.img ? `<img class="agl-img" src="${esc(d.img)}" alt="">` : ''}
      ${fld('description', `<textarea id="agl-description" rows="4" data-bind="description">${esc(d.description)}</textarea>`)}
      ${sec('resources', resources, addText('resources', 'Custom resource name'), 'Drop material Items here, or add a custom resource.')}
      ${sec('factions', factions, addText('factions', 'Custom faction name'), 'Drop Actors or Journals here, or add a custom faction.')}
      ${sec('quests', questRows, questAdd, 'No quests linked.')}
      ${sec('related', relatedRows, relatedAdd, 'No related locations.')}
      ${sec('notes', notes, btn('add-note', 'Add Note', {icon: 'fa-solid fa-plus'}), 'Add a note, or drop an Actor, Item, Journal or Roll Table here.')}
      <footer class="agl-footer">
        <div>${btn('cancel', 'Cancel', {kind: 'ghost'})}${btn('delete', 'Delete', {kind: 'danger', icon: 'fa-solid fa-trash'})}</div>
        <div>${btn('place', 'Place on Scene', {icon: 'fa-solid fa-map-pin', title: 'Adds a Map Note at the centre of your current view'})}${btn('save', this.dirty ? 'Save Changes •' : 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</div>
      </footer></form>`;
  }

  setupHtml() {
    const access = api().playerAccess.getState().playerAccessEnabled;
    return `<div class="agl-setup">
      <section class="ag-card"><h3>Player Access</h3>
        <label class="agl-switch"><input type="checkbox" data-action-change="player-access" ${access ? 'checked' : ''}> Players can open Locations</label>
        <p class="agl-hint">Shows the Locations button in the players' Actors sidebar. Players only ever see revealed locations and the parts you mark visible.</p></section>
      <section class="ag-card"><h3>Import / Export</h3>
        <p class="agl-hint">Location records in an <code>ag-foundry-import/0.2</code> package (see the module README). Locations already in this world are kept as they are.</p>
        <div class="agl-add">${btn('import', 'Import JSON', {icon: 'fa-solid fa-file-import'})}${btn('export', 'Export JSON', {icon: 'fa-solid fa-file-export'})}</div>
        <input type="file" id="agl-import-file" accept=".json,application/json" hidden></section>
      <details class="ag-card"><summary>Developer Tools</summary>
        <p class="agl-hint">Adds four synthetic <code>[TEST]</code> locations. Existing locations are not changed.</p>
        ${btn('import-sample', 'Import [TEST] sample locations', {icon: 'fa-solid fa-flask'})}</details>
    </div>`;
  }

  // ---------- events ----------
  bind(root) {
    for (const b of root.querySelectorAll('[data-tab]')) b.addEventListener('click', async () => {
      if (!(await this.confirmDiscard())) return;
      this.tab = b.dataset.tab; if (this.dirty) this.select(this.selectedId); this.render();
    });
    root.querySelector('#agl-search')?.addEventListener('input', e => {
      this.query = e.target.value; const pos = e.target.selectionStart;
      this.render().then(() => { const s = this.element.querySelector('#agl-search'); s?.focus(); s?.setSelectionRange(pos, pos); });
    });
    for (const el of root.querySelectorAll('[data-action]')) el.addEventListener('click', ev => { ev.preventDefault(); this.onAction(el).catch(notifyError); });
    root.querySelector('[data-action-change="player-access"]')?.addEventListener('change', e => api().playerAccess.setEnabled(e.target.checked).then(() => this.render()).catch(notifyError));
    root.querySelector('#agl-import-file')?.addEventListener('change', e => this.importFile(e.target.files?.[0]).catch(notifyError));
    if (!this.gm) return;
    for (const el of root.querySelectorAll('[data-bind]')) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      this.setPath(el.dataset.bind, el.value);
      if (el.dataset.bind === 'threat' || el.dataset.bind === 'img') this.render();
    });
    for (const el of root.querySelectorAll('[data-toggle]')) el.addEventListener('change', () => { this.setPath(el.dataset.toggle, el.checked); this.render(); });
    for (const row of root.querySelectorAll('.agl-row[draggable]')) row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({type: 'AshenGateLocation', id: row.dataset.id}));
    });
    for (const zone of root.querySelectorAll('[data-drop]')) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('agl-dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('agl-dragover'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('agl-dragover'); this.onDrop(zone.dataset.drop, dragData(e)).catch(notifyError); });
    }
  }
  /** Writes into the draft. Paths: "name", "show.type", "sections.quests", "resources.<key>.available". */
  setPath(path, value) {
    const [a, b, c] = path.split('.');
    if (Array.isArray(this.draft[a])) { const e = this.draft[a].find(x => x.key === b); if (e) e[c] = value; }
    else if (b) this.draft[a][b] = value;
    else this.draft[a] = value;
    this.dirty = true;
    const save = this.element?.querySelector('[data-action="save"] span');
    if (save) save.textContent = 'Save Changes •';
  }
  addEntry(section, data) {
    this.draft[section].push({key: newKey(), visible: true, ...data});
    this.dirty = true;
    return this.render();
  }
  async onDrop(section, data) {
    if (!data?.uuid) return;
    const doc = await fromUuid(data.uuid);
    if (!doc) return;
    const type = doc.documentName;
    if (section === 'resources') {
      if (type !== 'Item') return ui.notifications.warn('Drop an Item (a material) here.');
      const materialId = materialIdOf(doc);
      if (!materialId) ui.notifications.info(`${doc.name} has no MAT-* id; added as a linked item.`);
      return this.addEntry('resources', {label: doc.name, materialId, uuid: doc.uuid, available: true, note: ''});
    }
    if (section === 'factions') {
      if (!FACTION_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor or Journal here.');
      return this.addEntry('factions', {label: doc.name, uuid: doc.uuid, docType: type, note: ''});
    }
    if (section === 'notes' || NOTE_DOC_TYPES.includes(type)) {
      if (!NOTE_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor, Item, Journal or Roll Table here.');
      return this.addEntry('notes', {title: doc.name, text: '', uuid: doc.uuid, docType: type});
    }
  }

  async onAction(el) {
    const action = el.dataset.action;
    if (action === 'help') return this.help();
    if (action === 'select') {
      if (el.dataset.id === this.selectedId || !(await this.confirmDiscard())) return;
      this.select(el.dataset.id); return this.render();
    }
    if (action === 'open-doc') return openDocument(el.dataset.uuid);
    if (action === 'open-quest') return openQuest(el.dataset.id);
    if (!this.gm) return;
    const root = this.element;
    switch (action) {
      case 'new': {
        if (!(await this.confirmDiscard())) return;
        // Unsaved until Save, so the ID is made from the name the GM actually types.
        this.tab = 'locations'; this.query = ''; this.selectedId = null;
        this.draft = {...normalizeLocation({}), name: ''}; this.dirty = true;
        await this.render();
        const name = this.element.querySelector('#agl-name'); name?.focus(); name?.select();
        return;
      }
      case 'save': {
        if (!this.draft.name.trim()) return ui.notifications.warn('Give the location a name first.');
        const saved = await api().saveLocation(normalizeLocation(this.draft));
        this.select(saved.id);
        ui.notifications.info(`Saved ${saved.name}.`);
        return this.render();
      }
      case 'cancel': this.select(this.draft?.id || null); return this.render();
      case 'delete': {
        if (!this.draft.id) { this.select(null); return this.render(); }
        const ok = await foundry.applications.api.DialogV2.confirm({window: {title: 'Delete location?'},
          content: `<p>Delete <strong>${esc(this.draft.name)}</strong>? Links to it from other locations stop working, and its Map Notes stop opening it.</p>`,
          yes: {label: 'Delete Location'}, no: {label: 'Keep'}, rejectClose: false});
        if (!ok) return;
        await api().deleteLocation(this.draft.id);
        this.select(null); return this.render();
      }
      case 'place': {
        const id = this.dirty ? (await api().saveLocation(normalizeLocation(this.draft))).id : this.draft.id;
        const {x, y} = canvas?.stage?.pivot ?? {};
        this.select(id);
        await api().placeOnScene(id, {scene: canvas?.scene, x: x ?? 0, y: y ?? 0});
        ui.notifications.info(`Placed ${this.draft.name} on ${canvas.scene.name}.`);
        return this.render();
      }
      case 'remove': this.draft[el.dataset.section] = this.draft[el.dataset.section].filter(e => e.key !== el.dataset.key); this.dirty = true; return this.render();
      case 'add-text': {
        const section = el.dataset.section, value = root.querySelector(`#agl-add-${section}`)?.value.trim();
        if (!value) return;
        return this.addEntry(section, section === 'resources' ? {label: value, materialId: '', uuid: '', available: true, note: ''} : {label: value, uuid: '', docType: '', note: ''});
      }
      case 'add-quest': { const id = root.querySelector('#agl-add-quests')?.value; return id && this.addEntry('quests', {questId: id}); }
      case 'add-related': { const id = root.querySelector('#agl-add-related')?.value; return id && this.addEntry('related', {locationId: id}); }
      case 'add-note': return this.addEntry('notes', {title: '', text: '', uuid: '', docType: ''});
      case 'browse-img': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        return new FP({type: 'image', current: this.draft.img, callback: path => { this.setPath('img', path); this.render(); }}).render(true);
      }
      case 'import': return root.querySelector('#agl-import-file')?.click();
      case 'export': {
        const blob = new Blob([JSON.stringify(api().exportPackage(), null, 2)], {type: 'application/json'});
        const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: 'ashen-gate-locations.json'});
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return;
      }
      case 'import-sample': {
        const res = await fetch(`modules/${MODULE_ID}/examples/test-locations.json`);
        return this.importJson(await res.json());
      }
    }
  }
  async importFile(file) {
    if (!file) return;
    return this.importJson(JSON.parse(await file.text()));
  }
  async importJson(pkg) {
    const r = await api().importPackage(pkg);
    const msg = `Imported ${r.created.length} location(s)${r.skipped.length ? `, kept ${r.skipped.length} existing` : ''}${r.errors.length ? `, ${r.errors.length} invalid` : ''}.`;
    if (r.errors.length) console.warn(`${MODULE_ID} | import problems:`, r.errors);
    ui.notifications.info(msg);
    this.tab = 'locations';
    return this.render();
  }
  help() {
    const gm = this.gm ? `<ul>
      <li><strong>New Location</strong>, type a name. The ID is made for you.</li>
      <li>Drop material Items on <em>Gathering Resources</em>, Actors/Journals on <em>Factions</em>, anything on <em>Notes</em>. Or type a custom entry.</li>
      <li>The <i class="fa-solid fa-eye"></i> toggles decide what players see. Nothing is visible until <strong>Revealed to players</strong> is on, and each section has its own switch.</li>
      <li><strong>Place on Scene</strong> or drag a location from the list onto the map to add a Map Note. Double-click the note to open the location.</li>
      <li>Quests come from Quest Manager. Clicking one opens the Quest Log.</li></ul>`
      : '<p>These are the places your GM has revealed. Click a linked quest, faction or document to open it.</p>';
    return foundry.applications.api.DialogV2.prompt({window: {title: 'Locations Help'}, content: gm, ok: {label: 'Close'}, rejectClose: false});
  }
}
