/** The Locations window: GM builder (list + editor + GM Setup) and the player viewer, one class. */
import {MODULE_ID, THREATS, FIELDS, SECTIONS, BLOCKS, DETAIL_PREFIX, LOOT_STATUSES, LOOT_STATUS_LABELS, NOTE_DOC_TYPES, FACTION_DOC_TYPES, GATHERING, STATES, STATE_LABELS,
  DEFAULT_UNIDENTIFIED_LABEL, PIN_DEFAULTS, esc, clone, threatLabel, normalizeLocation, normalizeLayout, reorder, effectiveConditions, newKey, newNode, nodeName, materialIdOf,
  hasUnpublishedChanges, wouldCycle, parentMap} from './model.mjs';

const QUEST_MODULE = 'ashen-gate-quest-manager';
const FIELD_LABELS = {type: 'Type', region: 'Region', description: 'Description', img: 'Image', threat: 'Threat'};
const api = () => game.modules.get(MODULE_ID)?.api;
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };
const questApi = () => { const m = game.modules.get(QUEST_MODULE); return m?.active ? m.api ?? null : null; };
const btn = (action, label, {kind = '', icon = '', data = {}, title = ''} = {}) =>
  `<button type="button" class="ag-btn${kind ? ` ag-btn--${kind}` : ''}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${title ? ` title="${esc(title)}"` : ''}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
const eye = (bind, on, what) => `<label class="agl-eye" title="${on ? 'Visible' : 'Hidden'} to players: ${esc(what)}"><input type="checkbox" data-toggle="${esc(bind)}" ${on ? 'checked' : ''}><i class="fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i><span class="agl-sr">Show ${esc(what)} to players</span></label>`;
/** "section:key" -> [section, key] (a key may itself contain a colon). */
const splitEntry = v => { const i = v.indexOf(':'); return [v.slice(0, i), v.slice(i + 1)]; };
const NUMERIC = new Set(['tier', 'dc', 'quantity', 'rareQuantity']);
/** World Items carrying a MAT-* id, for the material pickers. */
function materialOptions() {
  const seen = new Map();
  for (const item of game.items ?? []) { const id = materialIdOf(item); if (id && !seen.has(id)) seen.set(id, item.name); }
  return [...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
}
const STATE_ICONS = {hidden: 'fa-solid fa-eye-slash', unidentified: 'fa-solid fa-circle-question', revealed: 'fa-solid fa-eye'};
const STATE_HINTS = {
  hidden: 'Players see nothing. Its pins are invisible to them.',
  unidentified: 'Players see only the unidentified label and teaser, on the pin and in their Locations list.',
  revealed: 'Players see the published card: the name and everything marked visible.'
};
const setting = (key, fallback) => { try { return game.settings.get(MODULE_ID, key) || fallback; } catch { return fallback; } };
const sceneName = uuid => { try { return globalThis.fromUuidSync?.(uuid)?.name ?? null; } catch { return null; } };
const threatBadge = value => `<span class="ag-badge agl-threat agl-threat--${esc(value)}">${esc(threatLabel(value))}</span>`;

function dragData(event) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  try { return TE?.getDragEventData?.(event) ?? JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return null; }
}
/** Can this user open the linked document? The GM always; a player only if Foundry's own permissions allow it. */
function canOpen(uuid) {
  if (!uuid) return false;
  if (game.user.isGM) return true;
  try {
    const doc = globalThis.fromUuidSync?.(uuid);
    if (typeof doc?.testUserPermission === 'function') return doc.testUserPermission(game.user, 'LIMITED');
    const pack = /^Compendium\.([^.]+\.[^.]+)\./.exec(uuid);   // an index entry: only if the player can see the pack
    return !!(pack && game.packs?.get(pack[1])?.visible);
  } catch { return false; }
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
    const found = id ? api().getLocation(id) : null;
    if (found) id = app.rid(found);
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
  list() { return this.gm ? api().listLocations() : api().listLocations({includeUnidentified: true}); }
  /** Row identity: the LOC id for the GM; for players the pinKey (unidentified ones have no id). */
  rid(l) { return this.gm ? l.id : l.key || l.id; }
  /** Accepts a LOC id or a pinKey (Map Notes carry only the key). */
  select(ref) {
    const found = ref ? api().getLocation(ref) : null;
    this.selectedId = found ? this.rid(found) : null;
    this.draft = this.gm && found ? clone(found) : null;
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
      if (this.selectedId && !list.some(l => this.rid(l) === this.selectedId)) this.select(null);
      if (!this.selectedId && list.length) this.select(this.rid(list[0]));
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
    const UNID = 'Unidentified';
    for (const l of rows) { const g = l.state === 'unidentified' && !this.gm ? UNID : l.region || 'No region'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l); }
    const last = g => g === 'No region' || g === UNID;
    const sorted = [...groups.entries()].sort(([a], [b]) => last(a) - last(b) || (a === UNID) - (b === UNID) || a.localeCompare(b));
    const items = sorted.map(([group, ls]) => `<li class="agl-group"><h3>${esc(group)}</h3><ul class="ag-list">${ls.map(l => `
      <li><button type="button" class="agl-row${this.rid(l) === this.selectedId ? ' active' : ''}" data-action="select" data-id="${esc(this.rid(l))}" ${this.gm ? 'draggable="true"' : ''}>
        <span class="agl-row__name">${esc(l.name)}</span>
        ${l.threat ? threatBadge(l.threat) : ''}
        ${this.gm ? `${hasUnpublishedChanges(l) ? '<span class="agl-dot" title="Saved changes not published yet"></span>' : ''}<i class="${STATE_ICONS[l.state]} agl-row__rev" title="${STATE_LABELS[l.state]}"></i>` : ''}
      </button></li>`).join('')}</ul></li>`).join('');
    const empty = this.gm ? 'No locations yet. Click <strong>New Location</strong> to create one.' : 'No locations have been revealed yet.';
    return `<div class="ag-toolbar"><input type="search" id="agl-search" placeholder="Search locations" value="${esc(this.query)}" aria-label="Search locations">
        ${this.gm ? btn('new', 'New Location', {kind: 'primary', icon: 'fa-solid fa-plus'}) : ''}</div>
      <div class="agl-body"><aside class="agl-list">${rows.length ? `<ul class="agl-groups">${items}</ul>` : `<p class="ag-empty">${list.length ? 'No matches.' : empty}</p>`}
        ${this.gm && rows.length ? '<p class="agl-hint">Drag a location onto the scene to place a Map Note.</p>' : ''}</aside>
      <section class="agl-detail">${this.gm ? this.editorHtml() : this.viewerHtml(list.find(l => this.rid(l) === this.selectedId))}</section></div>`;
  }

  // ---------- player viewer ----------
  viewerHtml(v) {
    if (!v) return '<p class="ag-empty">Select a location.</p>';
    const go = r => `<a class="agl-link" data-action="select" data-id="${esc(r.key || r.id)}">${esc(r.name)}</a>${r.id ? '' : ' <small>(unidentified)</small>'}`;
    if (v.state === 'unidentified') return `<article class="agl-view">
      <div class="agl-title"><h2>${esc(v.name)}</h2><span class="ag-badge">Unidentified</span></div>
      ${v.teaser ? `<p class="agl-desc">${esc(v.teaser).replace(/\n/g, '<br>')}</p>` : '<p class="ag-empty">Nothing more is known about this place yet.</p>'}
    </article>`;
    const quests = questChoices();
    const link = (label, uuid) => uuid ? `<a class="agl-link" data-action="open-doc" data-uuid="${esc(uuid)}">${esc(label)}</a>` : esc(label);
    const card = (title, body) => body ? `<section class="ag-card"><h3>${title}</h3>${body}</section>` : '';
    const ul = items => items.length ? `<ul class="ag-list agl-entries">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
    const paras = t => esc(t).replace(/\n/g, '<br>');
    const questItems = (v.quests ?? []).map(id => [id, questName(id, quests)]).filter(([, n]) => n)
      .map(([id, n]) => `<a class="agl-link" data-action="open-quest" data-id="${esc(id)}"><i class="fa-solid fa-scroll"></i> ${esc(n)}</a>`);
    // Loot: only the approved title, text, image and status. A link opens only if Foundry says this user may open the document.
    const lootItem = l => `${l.img ? `<img class="agl-loot__img" src="${esc(l.img)}" alt="">` : ''}<span class="agl-entry">${canOpen(l.uuid) ? link(l.label || 'Item', l.uuid) : esc(l.label)}
      ${l.text ? `<small>${esc(l.text)}</small>` : ''}</span><span class="ag-badge ${l.status === 'available' ? 'ag-badge--ok' : ''}">${esc(LOOT_STATUS_LABELS[l.status] ?? 'Available')}</span>`;
    const blocks = {
      description: v.description ? `<p class="agl-desc">${paras(v.description)}</p>` : '',
      conditions: card('Conditions', ul((v.conditions ?? []).map(c => `<strong>${esc(c.label)}</strong>${c.text ? ` <small>${esc(c.text)}</small>` : ''}`))),
      children: card('Places Here', ul((v.children ?? []).map(go))),
      resources: card('Gathering Resources', ul((v.resources ?? []).map(r => `<span class="agl-entry${r.exhausted ? ' agl-exhausted' : ''}">${link(nodeName(r), r.uuid)}${r.quantity > 1 ? ` ×${r.quantity}` : ''}
        <small>${[r.skill, `Tier ${r.tier}`, r.dc && `DC ${r.dc}`].filter(Boolean).map(esc).join(' · ')}</small></span>
        ${r.exhausted ? '<span class="ag-badge">Exhausted</span>' : `<span class="ag-badge ${r.available ? 'ag-badge--ok' : ''}">${r.available ? 'Available' : 'Unavailable'}</span>`}${r.note ? `<small>${esc(r.note)}</small>` : ''}`))),
      factions: card('Factions', ul((v.factions ?? []).map(f => `${link(f.label, f.uuid)}${f.note ? ` <small>${esc(f.note)}</small>` : ''}`))),
      quests: card('Quests', ul(questItems)),
      related: card('Related Locations', ul((v.related ?? []).map(r => `<a class="agl-link" data-action="select" data-id="${esc(r.id)}">${esc(r.name)}</a>`))),
      loot: card('Loot &amp; Rewards', ul((v.loot ?? []).map(lootItem))),
      notes: (v.notes ?? []).map(n => card(esc(n.title || 'Note'), `${n.text ? `<p>${paras(n.text)}</p>` : ''}${n.uuid ? `<p>${link(`Open ${n.docType || 'document'}`, n.uuid)}</p>` : ''}`)).join('')
    };
    for (const d of v.details ?? []) blocks[DETAIL_PREFIX + d.key] = card(esc(d.title || 'Detail'), `${d.text ? `<p>${paras(d.text)}</p>` : ''}${d.uuid && canOpen(d.uuid) ? `<p>${link(`Open ${d.docType || 'document'}`, d.uuid)}</p>` : ''}`);
    return `<article class="agl-view">
      <div class="agl-title"><h2>${esc(v.name)}</h2>${v.threat ? threatBadge(v.threat) : ''}</div>
      ${v.type || v.region ? `<p class="agl-meta">${[v.type, v.region].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
      ${v.parent ? `<p class="agl-meta">Part of ${go(v.parent)}</p>` : ''}
      ${v.img ? `<img class="agl-img" src="${esc(v.img)}" alt="">` : ''}
      ${(v.layout ?? normalizeLayout([], v.details ?? [])).map(k => blocks[k] ?? '').join('')}
    </article>`;
  }

  // ---------- GM editor ----------
  editorHtml() {
    const d = this.draft;
    if (!d) return '<p class="ag-empty">Select a location, or create a new one.</p>';
    const all = api().listLocations();
    const quests = questChoices();
    const fld = (f, control) => `<div class="ag-field agl-field"><label for="agl-${f}">${FIELD_LABELS[f]}</label><div class="agl-field__row">${control}${eye(`show.${f}`, d.show[f], FIELD_LABELS[f])}</div></div>`;
    const label = key => BLOCKS.find(b => b.key === key)?.label ?? key;
    const blockTools = (key, title) => `<span class="agl-block-tools"><span class="agl-handle" draggable="true" data-drag-block="${esc(key)}" tabindex="0" role="button"
        aria-label="Move ${esc(title)}. Drag, or press Alt+Up or Alt+Down." title="Drag to reorder (Alt+Up / Alt+Down)"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>
      ${btn('move-block', '', {kind: 'ghost', icon: 'fa-solid fa-arrow-up', data: {key, dir: -1}, title: `Move ${title} up`})}${btn('move-block', '', {kind: 'ghost', icon: 'fa-solid fa-arrow-down', data: {key, dir: 1}, title: `Move ${title} down`})}</span>`;
    const block = (key, titleHtml, plainTitle, body, head = '', drop = key) => `<section class="ag-card agl-section" data-block="${esc(key)}"${drop ? ` data-drop="${esc(drop)}"` : ''}>
        <header class="agl-section__head"><h3>${titleHtml}</h3><span class="agl-head-tools">${head}${blockTools(key, plainTitle)}</span></header>${body}</section>`;
    const sec = (key, body, add, dropHint) => block(key, label(key), label(key), `${body || `<p class="ag-empty">${dropHint}</p>`}<div class="agl-add">${add}</div>`,
      `<label class="agl-switch"><input type="checkbox" data-toggle="sections.${key}" ${d.sections[key] ? 'checked' : ''}> Show section to players</label>`);
    const entryTools = (key, e) => `${btn('move-entry', '', {kind: 'ghost', icon: 'fa-solid fa-arrow-up', data: {section: key, key: e.key, dir: -1}, title: 'Move up'})}${btn('move-entry', '', {kind: 'ghost', icon: 'fa-solid fa-arrow-down', data: {section: key, key: e.key, dir: 1}, title: 'Move down'})}${eye(`${key}.${e.key}.visible`, e.visible, 'this entry')}${btn('remove', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {section: key, key: e.key}, title: 'Remove'})}`;
    const handle = (key, e) => `<span class="agl-handle" draggable="true" data-drag-entry="${esc(key)}:${esc(e.key)}" tabindex="0" role="button" aria-label="Move this entry. Drag, or press Alt+Up or Alt+Down." title="Drag to reorder (Alt+Up / Alt+Down)"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>`;
    const docLink = (label, uuid) => uuid ? `<a class="agl-link" data-action="open-doc" data-uuid="${esc(uuid)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
    const rows = (key, fn) => d[key].length ? `<ul class="ag-list agl-entries">${d[key].map(e => `<li data-entry="${esc(key)}:${esc(e.key)}" class="${e.visible ? '' : 'agl-hidden'}">${handle(key, e)}${fn(e)}<span class="agl-tools">${entryTools(key, e)}</span></li>`).join('')}</ul>` : '';
    const addText = (key, placeholder) => `<input type="text" id="agl-add-${key}" placeholder="${placeholder}">${btn('add-text', 'Add', {data: {section: key}, icon: 'fa-solid fa-plus'})}`;
    const text = (bind, v, placeholder, aria) => `<input type="text" data-bind="${esc(bind)}" value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(aria)}">`;

    const resources = d.resources.length ? `<datalist id="agl-skills">${GATHERING.skills.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <datalist id="agl-mats">${materialOptions()}</datalist>
      <ul class="ag-list agl-nodes">${d.resources.map(e => this.nodeHtml(e, entryTools, docLink)).join('')}</ul>` : '';
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
    const notes = d.notes.length ? d.notes.map(n => `<div class="agl-note ${n.visible ? '' : 'agl-hidden'}" data-entry="notes:${esc(n.key)}">
        <div class="agl-field__row">${handle('notes', n)}<input type="text" data-bind="notes.${n.key}.title" value="${esc(n.title)}" placeholder="Title" aria-label="Note title"><span class="agl-tools">${entryTools('notes', n)}</span></div>
        ${n.uuid ? `<p>${docLink(`Linked ${n.docType || 'document'}`, n.uuid)}</p>` : ''}
        <textarea rows="3" data-bind="notes.${n.key}.text" placeholder="Text" aria-label="Note text">${esc(n.text)}</textarea></div>`).join('') : '';

    // Conditions: inherited ones (from Region ancestors) first, each with its source and an off/override control; then this location's own.
    const effective = effectiveConditions(d, all);
    const ovOf = (from, ckey) => d.conditionOverrides.find(o => o.from === from && o.conditionKey === ckey);
    const inherited = effective.filter(c => c.inherited).map(c => {
      const o = ovOf(c.source.id, c.key);
      const ov = f => `data-ov="${esc(`${c.source.id}|${c.key}|${f}`)}"`;
      return `<li class="agl-inherited${c.disabled ? ' agl-off' : ''}"><span class="agl-entry"><strong>${esc(c.original.label)}</strong> <small>from ${esc(c.source.name)}</small>
          ${c.disabled ? '<span class="ag-badge">Off here</span>' : c.overridden ? '<span class="ag-badge ag-badge--warn">Changed here</span>' : ''}
          ${c.original.text ? `<small>${esc(c.original.text)}</small>` : ''}</span>
        <input type="text" ${ov('label')} value="${esc(o?.label ?? '')}" placeholder="Label here (optional)" aria-label="Override label for ${esc(c.original.label)}">
        <input type="text" ${ov('text')} value="${esc(o?.text ?? '')}" placeholder="Text here (optional)" aria-label="Override text for ${esc(c.original.label)}">
        ${btn('cond-off', c.disabled ? 'Turn back on' : 'Turn off here', {kind: 'sm', data: {from: c.source.id, ckey: c.key}, title: `Only this location. ${c.source.name} is not changed.`})}</li>`;
    });
    const ownConditions = rows('conditions', e => `<span class="agl-entry agl-cond">${text(`conditions.${e.key}.label`, e.label, 'Condition', 'Condition name')}${text(`conditions.${e.key}.text`, e.text, 'Effect / description', 'Condition text')}</span>`);
    const conditions = inherited.length || ownConditions ? `${inherited.length ? `<ul class="ag-list agl-entries">${inherited.join('')}</ul>` : ''}${ownConditions}` : '';

    const lootRows = rows('loot', e => `<span class="agl-entry agl-loot">
        ${e.img ? `<img class="agl-loot__img" src="${esc(e.img)}" alt="">` : ''}
        <span class="agl-loot__fields">${text(`loot.${e.key}.label`, e.label, e.uuid ? 'Title shown to players' : 'Reward (coins, clue, favour, key…)', 'Loot title')}
        ${text(`loot.${e.key}.text`, e.text, 'Description shown to players (optional)', 'Loot description')}
        ${text(`loot.${e.key}.img`, e.img, 'Image path shown to players (optional)', 'Loot image')}
        ${e.uuid ? `<small>${docLink(`Linked ${e.docType || 'Item'}`, e.uuid)} · a link only; nothing is added to any Actor</small>` : ''}</span>
        <select data-bind="loot.${e.key}.status" aria-label="Loot status">${LOOT_STATUSES.map(st => `<option value="${st}" ${e.status === st ? 'selected' : ''}>${LOOT_STATUS_LABELS[st]}</option>`).join('')}</select></span>`);

    const unpublished = d.id && hasUnpublishedChanges(d);
    const stateBar = `<div class="agl-state" role="group" aria-label="What players see">${STATES.map(st =>
        btn('state', STATE_LABELS[st], {kind: d.state === st ? 'primary' : '', icon: STATE_ICONS[st], data: {state: st},
          title: d.state === st ? `${STATE_LABELS[st]} (current)` : `Make ${STATE_LABELS[st].toLowerCase()}${st === 'hidden' ? '' : ' and publish the saved content'}`})).join('')}</div>`;
    const order = normalizeLayout(d.layout, d.details);
    const blocks = {
      description: block('description', 'Description', 'Description', `<div class="agl-field__row"><textarea id="agl-description" rows="4" data-bind="description" aria-label="Description">${esc(d.description)}</textarea>${eye('show.description', d.show.description, 'Description')}</div>`, '', ''),
      conditions: sec('conditions', conditions, `${addText('conditions', 'Condition name')}`, d.isRegion ? 'No conditions yet. Those you add here apply to every place inside this Region.' : 'No conditions. Places inside a Region show its conditions here.'),
      children: this.childrenHtml(d, all, block),
      resources: sec('resources', resources, addText('resources', 'Custom node name'), 'Drop material Items here, or add a custom gathering node.'),
      factions: sec('factions', factions, addText('factions', 'Custom faction name'), 'Drop Actors or Journals here, or add a custom faction.'),
      quests: sec('quests', questRows, questAdd, 'No quests linked.'),
      related: sec('related', relatedRows, relatedAdd, 'No related locations.'),
      loot: sec('loot', lootRows, addText('loot', 'Plain reward (coins, clue, favour, key)'), 'Drag an Item here (world or compendium), or add a plain reward. A link never gives anyone the item.'),
      notes: sec('notes', notes, btn('add-note', 'Add Note', {icon: 'fa-solid fa-plus'}), 'Add a note, or drop an Actor, Item, Journal or Roll Table here.'),
      scenes: this.scenesHtml(d, block)
    };
    for (const det of d.details) blocks[DETAIL_PREFIX + det.key] = block(DETAIL_PREFIX + det.key,
      `<input type="text" class="agl-detail-title" data-bind="details.${esc(det.key)}.title" value="${esc(det.title)}" placeholder="Detail title" aria-label="Detail title">`, det.title || 'Detail',
      `<textarea rows="3" data-bind="details.${esc(det.key)}.text" placeholder="Text" aria-label="Detail text">${esc(det.text)}</textarea>
        ${det.uuid ? `<p>${docLink(`Linked ${det.docType || 'document'}`, det.uuid)}</p>` : '<p class="agl-hint">Drop an Actor, Item, Journal or Roll Table here to link it (optional).</p>'}`,
      `${eye(`details.${det.key}.visible`, det.visible, 'this block')}${btn('remove', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {section: 'details', key: det.key}, title: 'Remove this detail'})}`, `${DETAIL_PREFIX}${det.key}`);

    return `<form class="agl-editor" autocomplete="off" onsubmit="return false">
      <div class="agl-title">
        <div class="ag-field agl-name"><label for="agl-name">Name</label><input id="agl-name" type="text" data-bind="name" value="${esc(d.name)}" placeholder="Location name"></div>
        ${stateBar}
      </div>
      <div class="agl-publish">
        <p class="agl-hint">${d.id ? esc(STATE_HINTS[d.state]) : 'New locations start hidden.'} Save Changes keeps edits private${d.state === 'hidden' ? '' : ' until you publish'}.</p>
        ${unpublished ? '<span class="ag-badge ag-badge--warn">Players see an older version</span>' : ''}
        ${d.id ? btn('preview', 'Player Preview', {icon: 'fa-solid fa-user', title: 'What players would see after Publish. Nothing is changed.'}) : ''}
        ${d.id && d.state !== 'hidden' ? btn('publish', 'Publish', {kind: unpublished ? 'primary' : '', icon: 'fa-solid fa-bullhorn', title: 'Save, then show players the current content'}) : ''}
      </div>
      <p class="agl-id">${d.id ? `ID <code>${esc(d.id)}</code> · made from the name when first saved; it never changes. Pins and player pages never carry it.` : 'The ID is made from the name when you save.'}</p>
      <div class="agl-grid">
        ${fld('type', `<input id="agl-type" type="text" data-bind="type" value="${esc(d.type)}" placeholder="e.g. Town, Ruin, Forest">`)}
        ${fld('region', `<input id="agl-region" type="text" data-bind="region" value="${esc(d.region)}" placeholder="e.g. Northern Marches">`)}
        ${fld('threat', `<select id="agl-threat" data-bind="threat">${THREATS.map(t => `<option value="${t.value}" ${d.threat === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>${threatBadge(d.threat)}`)}
        ${fld('img', `<input id="agl-img" type="text" data-bind="img" value="${esc(d.img)}" placeholder="path/to/image.webp">${btn('browse-img', '', {icon: 'fa-solid fa-folder-open', title: 'Browse'})}`)}
      </div>
      ${d.img ? `<img class="agl-img" src="${esc(d.img)}" alt="">` : ''}
      ${this.markerHtml(d)}
      ${this.placeHtml(d, all)}
      ${order.map(k => blocks[k] ?? '').join('')}
      <div class="agl-add agl-add-detail">${btn('add-detail', 'Add Detail', {icon: 'fa-solid fa-plus', title: 'A custom block on this location: a title, text and an optional linked document'})}
        <span class="agl-hint">Drag the grip, or use the arrows (Alt+Up / Alt+Down on a grip), to reorder blocks and the entries in them. Players see published blocks in this order.</span></div>
      <footer class="agl-footer">
        <div>${btn('cancel', 'Cancel', {kind: 'ghost'})}${btn('delete', 'Delete', {kind: 'danger', icon: 'fa-solid fa-trash'})}</div>
        <div>${btn('place', 'Place on Scene', {icon: 'fa-solid fa-map-pin', title: 'Adds a Map Note at the centre of your current view'})}${btn('save', this.dirty ? 'Save Changes •' : 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</div>
      </footer></form>`;
  }

  /** Unidentified label/teaser and pin art. Pins use native Note image/size; edits to a placed Note win. */
  markerHtml(d) {
    const world = setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL);
    const path = (f, label, placeholder) => `<div class="ag-field agl-field"><label for="agl-pin-${f}">${label}</label><div class="agl-field__row">
      <input id="agl-pin-${f}" type="text" data-bind="pin.${f}" value="${esc(d.pin[f])}" placeholder="${esc(placeholder)}">${btn('browse-pin', '', {icon: 'fa-solid fa-folder-open', title: 'Browse', data: {field: f}})}</div></div>`;
    return `<section class="ag-card agl-section">
      <header class="agl-section__head"><h3>Unidentified Marker &amp; Pin</h3></header>
      <div class="agl-grid">
        <div class="ag-field agl-field"><label for="agl-unid">Unidentified label</label><input id="agl-unid" type="text" data-bind="unidentifiedLabel" value="${esc(d.unidentifiedLabel)}" placeholder="${esc(world)} (world default)"></div>
        <div class="ag-field agl-field"><label for="agl-pin-size">Pin size</label><input id="agl-pin-size" type="number" min="16" max="256" step="1" data-bind="pin.size" value="${d.pin.size || ''}" placeholder="${PIN_DEFAULTS.size}"></div>
      </div>
      <div class="ag-field agl-field"><label for="agl-teaser">Teaser (players see this while unidentified)</label><textarea id="agl-teaser" rows="2" data-bind="teaser" placeholder="Optional, e.g. Smoke rises beyond the ridge.">${esc(d.teaser)}</textarea></div>
      <div class="agl-grid">
        ${path('img', 'Pin image (revealed)', PIN_DEFAULTS.img)}
        ${path('unidentifiedImg', 'Pin image (hidden / unidentified)', setting('unknownPinImage', '') || PIN_DEFAULTS.unidentifiedImg)}
      </div>
      <p class="agl-hint">Players can read a pin's label and image path, never its name or ID. Don't name image files after secrets. Changing a placed pin's image or size in Foundry's Note settings keeps that pin as you set it.</p>
    </section>`;
  }

  /** Where this location sits (parent) and whether it is a Region. Fixed at the top; the blocks below it are reorderable. */
  placeHtml(d, all) {
    const byId = new Map(all.map(l => [l.id, l]));
    const parents = parentMap(all.filter(l => l.id !== d.id));
    const choices = all.filter(l => l.id !== d.id && !(d.id && wouldCycle(d.id, l.id, parents)));
    const missing = d.parentLocationId && !byId.has(d.parentLocationId) ? `<option value="${esc(d.parentLocationId)}" selected>${esc(d.parentLocationId)} (deleted)</option>` : '';
    const parentSel = `<select id="agl-parent" data-bind="parentLocationId"><option value="">None (top level)</option>${missing}${choices.map(l =>
      `<option value="${esc(l.id)}" ${d.parentLocationId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
    return `<section class="ag-card agl-section">
      <header class="agl-section__head"><h3>Place</h3><span class="agl-hint">GM only</span></header>
      <div class="ag-field agl-field"><label for="agl-parent">Inside</label>${parentSel}</div>
      <label class="agl-switch"><input type="checkbox" data-toggle="isRegion" ${d.isRegion ? 'checked' : ''}> This is a Region</label>
      <p class="agl-hint">A Region passes its <em>Conditions</em> to every place inside it, at any depth. Nothing else is inherited. A place can turn an inherited condition off or change it for itself without touching the Region.</p>
    </section>`;
  }
  /** Places inside this one. Players see each only once revealed (unidentified ones by label). */
  childrenHtml(d, all, block) {
    const kids = d.id ? all.filter(l => l.parentLocationId === d.id) : [];
    const kidRows = kids.length ? `<ul class="ag-list agl-entries">${kids.map(k => `<li><span class="agl-entry"><a class="agl-link" data-action="select" data-id="${esc(k.id)}">${esc(k.name)}</a></span>
      <i class="${STATE_ICONS[k.state]} agl-row__rev" title="${STATE_LABELS[k.state]}"></i></li>`).join('')}</ul>` : '<p class="ag-empty">No places inside this one.</p>';
    return block('children', 'Places Inside', 'Places Inside', `${kidRows}${d.id ? `<div class="agl-add">${btn('new-child', 'New place inside', {icon: 'fa-solid fa-plus'})}</div>` : ''}
      <p class="agl-hint">Each place is shown to players on its own state; this list follows them.</p>`, '', '');
  }
  /** Linked scenes: GM only, never in any player view. */
  scenesHtml(d, block) {
    const linked = new Set(d.sceneUuids);
    const sceneRows = d.sceneUuids.length ? `<ul class="ag-list agl-entries">${d.sceneUuids.map(u => `<li><span class="agl-entry">${esc(sceneName(u) ?? `${u} (missing)`)}</span>
      <span class="agl-tools">${btn('open-scene', 'Open scene', {kind: 'sm', icon: 'fa-solid fa-map', data: {uuid: u}, title: 'Views the scene for you only. Players are not moved.'})}${btn('remove-scene', '', {kind: 'ghost', icon: 'fa-solid fa-trash', data: {uuid: u}, title: 'Unlink'})}</span></li>`).join('')}</ul>` : '';
    const sceneOpts = [...(game.scenes ?? [])].filter(sc => !linked.has(sc.uuid)).sort((a, b) => a.name.localeCompare(b.name))
      .map(sc => `<option value="${esc(sc.uuid)}">${esc(sc.name)}</option>`).join('');
    return block('scenes', 'Linked Scenes', 'Linked Scenes', `${sceneRows}
      <div class="agl-add"><select id="agl-add-scene"><option value="">Choose a scene…</option>${sceneOpts}</select>${btn('add-scene', 'Link', {icon: 'fa-solid fa-link'})}</div>
      <p class="agl-hint">GM only; players never see this block. Open scene never switches players.</p>`, '<span class="agl-hint">GM only</span>', '');
  }

  /** One gathering node, edited inline. Exhausted nodes are struck through with Restore. */
  nodeHtml(e, entryTools, docLink) {
    const b = f => `data-bind="resources.${esc(e.key)}.${f}"`;
    const num = (f, v, min, max, label) => `<label class="agl-mini">${label}<input type="number" min="${min}" max="${max}" step="1" ${b(f)} value="${v}"></label>`;
    return `<li class="agl-node${e.visible ? '' : ' agl-hidden'}${e.exhausted ? ' agl-exhausted' : ''}" data-entry="resources:${esc(e.key)}">
      <div class="agl-node__row">
        <span class="agl-handle" draggable="true" data-drag-entry="resources:${esc(e.key)}" tabindex="0" role="button" aria-label="Move this node. Drag, or press Alt+Up or Alt+Down." title="Drag to reorder (Alt+Up / Alt+Down)"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>
        <input type="text" class="agl-node__name" ${b('label')} value="${esc(e.label)}" placeholder="Node name" aria-label="Node name">
        ${e.uuid ? docLink('', e.uuid).replace('></a>', '><i class="fa-solid fa-up-right-from-square"></i></a>') : ''}
        <input type="text" list="agl-skills" class="agl-node__skill" ${b('skill')} value="${esc(e.skill)}" placeholder="Skill" aria-label="Gathering skill">
        <label class="agl-mini">Tier<select ${b('tier')}>${[1, 2, 3, 4, 5].map(t => `<option value="${t}" ${e.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${num('dc', e.dc, 1, 40, 'DC')}${eye(`resources.${e.key}.dcVisible`, e.dcVisible, 'the DC')}
        <span class="agl-tools">${entryTools('resources', e)}</span>
      </div>
      <div class="agl-node__row">
        <label class="agl-mini">Common<input type="text" list="agl-mats" ${b('materialId')} value="${esc(e.materialId)}" placeholder="MAT-…"></label>${num('quantity', e.quantity, 1, 999, '×')}
        <label class="agl-mini">Rare (by 5+)<input type="text" list="agl-mats" ${b('rareMaterialId')} value="${esc(e.rareMaterialId)}" placeholder="MAT-… (optional)"></label>${num('rareQuantity', e.rareQuantity, 1, 999, '×')}
      </div>
      <div class="agl-node__row">
        <label class="agl-switch"><input type="checkbox" data-toggle="resources.${esc(e.key)}.finite" ${e.finite ? 'checked' : ''}> Finite</label>
        <label class="agl-switch"><input type="checkbox" data-toggle="resources.${esc(e.key)}.available" ${e.available ? 'checked' : ''}> Available</label>
        <input type="text" class="agl-node__note" ${b('note')} value="${esc(e.note)}" placeholder="Source and limit (note)" aria-label="Note">
        ${e.exhausted ? `<span class="ag-badge">Exhausted</span>${btn('restore', 'Restore', {kind: 'sm', icon: 'fa-solid fa-rotate-left', data: {key: e.key}})}`
          : e.finite ? btn('exhaust', 'Mark exhausted', {kind: 'sm', data: {key: e.key}}) : ''}
      </div></li>`;
  }

  setupHtml() {
    const access = api().playerAccess.getState().playerAccessEnabled;
    return `<div class="agl-setup">
      <section class="ag-card"><h3>Player Access</h3>
        <label class="agl-switch"><input type="checkbox" data-action-change="player-access" ${access ? 'checked' : ''}> Players can open Locations</label>
        <p class="agl-hint">Shows the Locations button in the players' Actors sidebar. Players only ever see revealed locations and the parts you mark visible.</p></section>
      <section class="ag-card"><h3>Unidentified Pins</h3>
        <div class="ag-field agl-field"><label for="agl-set-label">Default unidentified label</label><input id="agl-set-label" type="text" value="${esc(setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL))}"></div>
        <div class="ag-field agl-field"><label for="agl-set-unknown">Default unidentified pin image</label><div class="agl-field__row"><input id="agl-set-unknown" type="text" value="${esc(setting('unknownPinImage', ''))}" placeholder="${PIN_DEFAULTS.unidentifiedImg}">${btn('browse-setup', '', {icon: 'fa-solid fa-folder-open', title: 'Browse'})}</div></div>
        <p class="agl-hint">Used when a location has no label or image of its own. Saving re-labels existing unidentified pins.</p>
        <div class="agl-add">${btn('save-setup', 'Save Pin Defaults', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</div></section>
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
      if (['threat', 'img', 'parentLocationId'].includes(el.dataset.bind) || el.dataset.bind.endsWith('.tier')) this.render();
    });
    for (const el of root.querySelectorAll('[data-toggle]')) el.addEventListener('change', () => { this.setPath(el.dataset.toggle, el.checked); this.render(); });
    // Inherited-condition overrides: "<Region id>|<condition key>|label|text".
    for (const el of root.querySelectorAll('[data-ov]')) el.addEventListener('input', () => {
      const [from, ckey, field] = el.dataset.ov.split('|');
      this.override(from, ckey)[field] = el.value; this.touch();
    });
    this.bindReorder(root);
    for (const row of root.querySelectorAll('.agl-row[draggable]')) row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({type: 'AshenGateLocation', id: row.dataset.id}));
    });
    for (const zone of root.querySelectorAll('[data-drop]')) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('agl-dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('agl-dragover'));
      zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('agl-dragover'); this.onDrop(zone.dataset.drop, dragData(e)).catch(notifyError); });
    }
  }
  /** Drag handles and Alt+Up / Alt+Down on them reorder blocks and entries; the arrow buttons do the same by click. */
  bindReorder(root) {
    const BLOCK = 'application/x-agl-block', ENTRY = 'application/x-agl-entry';
    const after = (e, el) => { const r = el.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    for (const h of root.querySelectorAll('[data-drag-block],[data-drag-entry]')) {
      const isBlock = h.dataset.dragBlock != null;
      h.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(isBlock ? BLOCK : ENTRY, isBlock ? h.dataset.dragBlock : h.dataset.dragEntry);
        e.dataTransfer.setData('text/plain', JSON.stringify({type: 'AshenGateReorder'}));
      });
      h.addEventListener('keydown', e => {
        if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const by = e.key === 'ArrowUp' ? -1 : 1;
        const move = isBlock ? this.moveBlock(h.dataset.dragBlock, {by}) : this.moveEntry(...splitEntry(h.dataset.dragEntry), {by});
        move.then(() => this.element?.querySelector(isBlock ? `[data-drag-block="${CSS.escape(h.dataset.dragBlock)}"]` : `[data-drag-entry="${CSS.escape(h.dataset.dragEntry)}"]`)?.focus());
      });
    }
    const target = (sel, type, run) => {
      for (const el of root.querySelectorAll(sel)) {
        el.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes(type)) { e.preventDefault(); e.stopPropagation(); } });
        el.addEventListener('drop', e => {
          if (!e.dataTransfer?.types?.includes(type)) return;
          e.preventDefault(); e.stopPropagation();
          run(e.dataTransfer.getData(type), el, after(e, el) ? 'after' : 'before').catch(notifyError);
        });
      }
    };
    target('[data-block]', BLOCK, (key, el, side) => key === el.dataset.block ? Promise.resolve() : this.moveBlock(key, {[side]: el.dataset.block}));
    target('[data-entry]', ENTRY, (val, el, side) => {
      const [section, key] = splitEntry(val), [tSection, tKey] = splitEntry(el.dataset.entry);
      return section === tSection && key !== tKey ? this.moveEntry(section, key, {[side]: tKey}) : Promise.resolve();
    });
  }
  touch() {
    this.dirty = true;
    const save = this.element?.querySelector('[data-action="save"] span');
    if (save) save.textContent = 'Save Changes •';
  }
  /** Order only: moves a block in `layout`. Nothing else about the location changes. */
  moveBlock(key, opts) {
    this.draft.layout = reorder(normalizeLayout(this.draft.layout, this.draft.details), k => k, key, opts);
    this.touch(); return this.render();
  }
  /** Order only: moves an entry within its list. Keys and refs are untouched. */
  moveEntry(section, key, opts) {
    if (!Array.isArray(this.draft[section])) return Promise.resolve();
    this.draft[section] = reorder(this.draft[section], e => e.key, key, opts);
    this.touch(); return this.render();
  }
  /** The child's override of an inherited condition, created when first needed. */
  override(from, conditionKey) {
    let o = this.draft.conditionOverrides.find(x => x.from === from && x.conditionKey === conditionKey);
    if (!o) this.draft.conditionOverrides.push(o = {key: newKey(), visible: true, from, conditionKey, disabled: false, label: '', text: ''});
    return o;
  }
  /** Writes into the draft. Paths: "name", "show.type", "sections.quests", "resources.<key>.available". */
  setPath(path, value) {
    const [a, b, c] = path.split('.');
    if (Array.isArray(this.draft[a])) {
      const e = this.draft[a].find(x => x.key === b);
      if (e && NUMERIC.has(c)) value = Number(value);
      // Changing the tier moves the DC with it, unless the GM had set a custom DC.
      if (e && c === 'tier' && e.dc === GATHERING.dcByTier[e.tier]) e.dc = GATHERING.dcByTier[value] ?? e.dc;
      if (e && c === 'finite' && !value) e.exhausted = false;
      if (e) e[c] = value;
    }
    else if (b) this.draft[a][b] = path === 'pin.size' ? Number(value) || 0 : value;
    else this.draft[a] = value;
    this.touch();
  }
  addNode(data) {
    this.draft.resources.push(newNode(data));
    this.dirty = true;
    return this.render();
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
      return this.addNode({label: doc.name, materialId, uuid: doc.uuid});
    }
    if (section === 'loot') {
      // A link only. Nothing is created, copied or given to any Actor; players see just the title, text and image the GM approves here.
      if (type !== 'Item') return ui.notifications.warn('Drop an Item here (world or compendium).');
      return this.addEntry('loot', {label: doc.name, text: '', img: doc.img ?? '', uuid: doc.uuid, docType: 'Item', status: 'available'});
    }
    if (section.startsWith(DETAIL_PREFIX)) {
      if (!NOTE_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor, Item, Journal or Roll Table here.');
      const det = this.draft.details.find(x => x.key === section.slice(DETAIL_PREFIX.length));
      if (!det) return;
      Object.assign(det, {uuid: doc.uuid, docType: type, title: det.title || doc.name}); this.touch(); return this.render();
    }
    if (section === 'factions') {
      if (!FACTION_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor or Journal here.');
      return this.addEntry('factions', {label: doc.name, uuid: doc.uuid, docType: type, note: ''});
    }
    if (section === 'conditions') return ui.notifications.warn('Conditions are text. Type the condition name and click Add.');
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
        const saved = await this.saveDraft();
        if (!saved) return;
        ui.notifications.info(saved.state === 'hidden' ? `Saved ${saved.name}.` : `Saved ${saved.name}. Players see the change after you publish.`);
        return this.render();
      }
      case 'state': {
        const state = el.dataset.state;
        if (this.draft.id && this.draft.state === state && !this.dirty) return;
        if (state === 'revealed') {
          const ok = await foundry.applications.api.DialogV2.confirm({window: {title: 'Reveal location?'},
            content: `<p>Reveal <strong>${esc(this.draft.name)}</strong>? Players will see its name and everything marked visible, and its pins show the name.</p>`,
            yes: {label: 'Reveal to Players'}, no: {label: 'Cancel'}, rejectClose: false});
          if (!ok) return;
        }
        const saved = await this.saveDraft();
        if (!saved) return;
        await api().setLocationState(saved.id, state);
        this.select(saved.id);
        ui.notifications.info(`${saved.name} is now ${STATE_LABELS[state].toLowerCase()} to players.`);
        return this.render();
      }
      case 'publish': {
        const saved = await this.saveDraft();
        if (!saved) return;
        await api().publishLocation(saved.id);
        this.select(saved.id);
        ui.notifications.info(`Published ${saved.name}.`);
        return this.render();
      }
      case 'preview': return this.preview();
      case 'new-child': {
        if (!this.draft.id || !(await this.confirmDiscard())) return;
        const parent = this.draft.id;
        this.selectedId = null;
        this.draft = {...normalizeLocation({parentLocationId: parent}), name: ''}; this.dirty = true;
        await this.render();
        this.element.querySelector('#agl-name')?.focus();
        return;
      }
      case 'add-scene': {
        const uuid = root.querySelector('#agl-add-scene')?.value;
        if (!uuid || this.draft.sceneUuids.includes(uuid)) return;
        this.draft.sceneUuids.push(uuid); this.dirty = true; return this.render();
      }
      case 'remove-scene': this.draft.sceneUuids = this.draft.sceneUuids.filter(u => u !== el.dataset.uuid); this.dirty = true; return this.render();
      case 'open-scene': {
        const scene = await fromUuid(el.dataset.uuid);
        if (!scene) return ui.notifications.warn('That scene no longer exists.');
        return scene.view();
      }
      case 'browse-pin': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const f = el.dataset.field;
        return new FP({type: 'image', current: this.draft.pin[f], callback: p => { this.setPath(`pin.${f}`, p); this.render(); }}).render(true);
      }
      case 'browse-setup': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const input = root.querySelector('#agl-set-unknown');
        return new FP({type: 'image', current: input?.value, callback: p => { if (input) input.value = p; }}).render(true);
      }
      case 'save-setup': {
        await game.settings.set(MODULE_ID, 'unidentifiedLabel', root.querySelector('#agl-set-label')?.value.trim() || DEFAULT_UNIDENTIFIED_LABEL);
        await game.settings.set(MODULE_ID, 'unknownPinImage', root.querySelector('#agl-set-unknown')?.value.trim() ?? '');
        ui.notifications.info('Saved pin defaults.');
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
        const id = this.dirty ? (await this.saveDraft())?.id : this.draft.id;
        if (!id) return;
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
        return section === 'resources' ? this.addNode({label: value}) : this.addEntry(section, {label: value, uuid: '', docType: '', note: '', ...(section === 'loot' ? {status: 'available'} : {})});
      }
      case 'exhaust': case 'restore': {
        const exhausted = action === 'exhaust';
        // With no other unsaved edits, save straight away: this is a mid-session click.
        if (!this.dirty && this.draft.id) {
          await api().markNodeExhausted(this.draft.id, el.dataset.key, exhausted);
          this.select(this.draft.id); return this.render();
        }
        this.setPath(`resources.${el.dataset.key}.exhausted`, exhausted); return this.render();
      }
      case 'add-quest': { const id = root.querySelector('#agl-add-quests')?.value; return id && this.addEntry('quests', {questId: id}); }
      case 'add-related': { const id = root.querySelector('#agl-add-related')?.value; return id && this.addEntry('related', {locationId: id}); }
      case 'move-block': return this.moveBlock(el.dataset.key, {by: Number(el.dataset.dir)}).then(() => this.focusBack(`[data-action="move-block"][data-key="${CSS.escape(el.dataset.key)}"][data-dir="${el.dataset.dir}"]`));
      case 'move-entry': return this.moveEntry(el.dataset.section, el.dataset.key, {by: Number(el.dataset.dir)})
        .then(() => this.focusBack(`[data-action="move-entry"][data-section="${el.dataset.section}"][data-key="${CSS.escape(el.dataset.key)}"][data-dir="${el.dataset.dir}"]`));
      case 'add-detail': {
        const key = newKey();
        this.draft.details.push({key, visible: false, title: '', text: '', uuid: '', docType: ''});
        this.draft.layout = [...normalizeLayout(this.draft.layout, this.draft.details.slice(0, -1)), DETAIL_PREFIX + key];
        this.touch(); await this.render();
        this.element.querySelector(`[data-bind="details.${CSS.escape(key)}.title"]`)?.focus();
        return;
      }
      case 'cond-off': { const o = this.override(el.dataset.from, el.dataset.ckey); o.disabled = !o.disabled; this.touch(); return this.render(); }
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
  focusBack(selector) { this.element?.querySelector(selector)?.focus(); }
  /** Saves the draft privately (never publishes). Returns the saved record, or null if it has no name. */
  async saveDraft() {
    if (!this.draft.name.trim()) { ui.notifications.warn('Give the location a name first.'); return null; }
    if (!this.dirty && this.draft.id) return this.draft;
    const saved = await api().saveLocation(normalizeLocation(this.draft));
    this.select(saved.id);
    return saved;
  }
  /** What players would see after Publish, in each visible state. Built by the API from the draft; nothing is written. */
  preview() {
    const d = normalizeLocation(this.draft);
    const part = st => {
      const v = api().previewLocation(d, st);
      return `<section class="agl-preview__part"><h3>${STATE_LABELS[st]}${this.draft.state === st ? ' (current)' : ''}</h3>${this.viewerHtml(v)}</section>`;
    };
    const content = `<div class="ag-locations agl-preview">
      <p class="agl-hint">${this.draft.state === 'hidden' ? 'Hidden: players see nothing now. ' : ''}This is what players would see after you publish your current edits. Quest names follow Quest Manager's own visibility.</p>
      ${part('unidentified')}${part('revealed')}</div>`;
    return foundry.applications.api.DialogV2.prompt({window: {title: `Player Preview: ${this.draft.name}`}, position: {width: 560}, content, ok: {label: 'Close'}, rejectClose: false});
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
      <li>Each gathering node has a skill, tier and DC (10/12/13/14/15 by tier). <strong>Mark exhausted</strong> after a node is used or a check fails; <strong>Restore</strong> undoes it. Players only see the DC if you turn on its <i class="fa-solid fa-eye"></i>.</li>
      <li>Each location is <strong>Hidden</strong> (players see nothing), <strong>Unidentified</strong> (players see only its label and teaser) or <strong>Revealed</strong>. The buttons next to the name change it.</li>
      <li><strong>Save Changes</strong> is private. Players see edits only after <strong>Publish</strong> (or Reveal). <strong>Player Preview</strong> shows what they would see.</li>
      <li>The <i class="fa-solid fa-eye"></i> toggles decide what players see once revealed, and each section has its own switch.</li>
      <li><strong>Place on Scene</strong> or drag a location from the list onto the map to add a Map Note. Double-click the note to open the location. The pin shows the unidentified label and image until the location is revealed; set pin art under <em>Unidentified Marker &amp; Pin</em>.</li>
      <li><em>Place</em>: put a location inside another. Mark one as a <strong>Region</strong> and its <em>Conditions</em> apply to every place inside it; a place can turn one off or change it for itself. <em>Linked Scenes</em> open with one click (only you move).</li>
      <li><strong>Reorder:</strong> drag a grip, or use the arrows (Alt+Up / Alt+Down on a grip), to move a block or an entry. Players see published blocks in your order. <strong>Add Detail</strong> makes a custom block with a title, text and an optional linked document.</li>
      <li><strong>Loot &amp; Rewards:</strong> drag an Item in (world or compendium) or add a plain reward. It is a link only: nothing is given to anyone. Set <em>Available / Discovered / Taken</em> yourself.</li>
      <li>Quests come from Quest Manager. Clicking one opens the Quest Log.</li></ul>`
      : '<p>These are the places your GM has revealed. Places under <em>Unidentified</em> show only what you have heard so far. Click a linked quest, faction, document or place to open it.</p>';
    return foundry.applications.api.DialogV2.prompt({window: {title: 'Locations Help'}, content: gm, ok: {label: 'Close'}, rejectClose: false});
  }
}
