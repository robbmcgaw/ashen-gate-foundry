/** The Locations window: GM builder (list + editor + GM Setup) and the player viewer, one class. */
import {MODULE_ID, THREATS, FIELDS, SECTIONS, BLOCKS, DETAIL_PREFIX, LOOT_STATUSES, LOOT_STATUS_LABELS, NOTE_DOC_TYPES, FACTION_DOC_TYPES, GATHERING, STATES, STATE_LABELS,
  DEFAULT_UNIDENTIFIED_LABEL, PIN_DEFAULTS, esc, clone, threatLabel, normalizeLocation, normalizeLayout, reorder, effectiveConditions, newKey, newNode, nodeName, materialIdOf,
  hasUnpublishedChanges, wouldCycle, parentMap, PARTY_NOTES, isPlaceable, passesConditions, EXOTIC_MODES, EXOTIC_CONDITIONS, normalizeExotics, isTierDefaultDc,
  isNodeRef, activityLabel, ACTIVITY_LABELS, TYPE_SUGGESTIONS, ROUTES_RETIRED} from './model.mjs';
import {PIN_LOOKS, NAME_MODES, NAME_SIZE, WRAP, nameModeOf, pinLookOf, nameSizeOf, wrapOf, readPinLook} from './pin-look.mjs';
import {nodeTemplates, openNodesTab} from './ledger-nodes.mjs';
import {GROUP_MODES, SORTS, emptyFilters, hasFilters, searchText, matchesQuery, applyFilters, filterOptions, comparator, groupRows, withNodeInfo} from './list-filter.mjs';
import {buildTree, withAncestors, breadcrumb, moveTargets, VIEW} from './tree.mjs';
import {confirmDialog, confirmDanger, choiceDialog, formDialog, infoDialog, guardDirty} from './ag-dialogs.mjs';
import {windowSize, uiState, subTabs, tabPanelAttrs, bindTablist, bindSplitNav, fold, bindFolds, fileButton, bindFileButtons, linkButton} from './ag-html.mjs';
import {readDrop, resolveItemDrop, itemIdOf} from './ag-item-drop.mjs';

const QUEST_MODULE = 'ashen-gate-quest-manager';
const FIELD_LABELS = {type: 'Type', region: 'Region', description: 'Description', img: 'Image', threat: 'Threat'};
const api = () => game.modules.get(MODULE_ID)?.api;
const notifyError = err => { console.error(`${MODULE_ID} |`, err); ui.notifications?.error(err?.message ?? String(err)); };
const questApi = () => { const m = game.modules.get(QUEST_MODULE); return m?.active ? m.api ?? null : null; };
/** Foundry tooltip in the kit's skin (replaces native title=). */
const tip = text => text ? ` data-tooltip="${esc(text)}" data-tooltip-class="ag-tooltip"` : '';
/** A kit button. kind: primary | ghost | danger | sm | icon (or several, space-separated). Icon-only buttons take their label from title. */
const btn = (action, label, {kind = '', icon = '', data = {}, title = '', cls = ''} = {}) =>
  `<button type="button" class="ag-btn${kind ? kind.split(' ').map(k => ` ag-btn--${k}`).join('') : ''}${!label && icon && !kind.includes('icon') ? ' ag-btn--icon' : ''}${cls ? ` ${cls}` : ''}" data-action="${action}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}${!label && title ? ` aria-label="${esc(title)}"` : ''}${tip(title)}>${icon ? `<i class="${icon}" aria-hidden="true"></i>` : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
const eye = (bind, on, what) => `<label class="agl-eye"${tip(`${on ? 'Visible' : 'Hidden'} to players: ${what}`)}><input type="checkbox" data-toggle="${esc(bind)}" ${on ? 'checked' : ''}><i class="fa-solid ${on ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i><span class="ag-sr-only">Show ${esc(what)} to players</span></label>`;
/** A status icon with its text for screen readers (aria-label on a bare <i> is ignored); the tooltip is for the mouse. */
const mark = (icon, text, cls = 'agl-row__rev') => `<i class="${icon} ${cls}"${tip(text)} aria-hidden="true"></i><span class="ag-sr-only">${esc(text)}</span>`;
/** In-app navigation inside text: a real button that looks like a link (kit .ag-link). */
const go = (label, action, data = {}, opts = {}) => linkButton(label, {data: {action, ...data}, ...opts});
/** "Applies now" badge for a card whose controls save at once, outside Save Changes. */
const NOW = `<span class="ag-badge ag-badge--accent agl-now"${tip('Changes here apply at once; Save Changes is not needed')}>Applies now</span>`;
/** Per-user UI memory (editor sub-tab, open filter row, open folds). Never throws. */
const uiMem = () => uiState(MODULE_ID);
const EDITOR_TABS = [{id: 'content', label: 'Content', icon: 'fa-solid fa-file-lines'}, {id: 'visibility', label: 'Visibility & map', icon: 'fa-solid fa-eye'}, {id: 'party', label: 'Party Notes', icon: 'fa-solid fa-users'}];
/** "section:key" -> [section, key] (a key may itself contain a colon). */
const splitEntry = v => { const i = v.indexOf(':'); return [v.slice(0, i), v.slice(i + 1)]; };
const NUMERIC = new Set(['tier', 'dc', 'quantity', 'rareQuantity']);
/** A template reference's optional overrides: '' (blank / "Template") stores null, so the template's value applies. */
const REF_OPTIONAL = new Set(['tier', 'dc', 'dcVisible', 'finite']);
const refValue = (field, value) => value === '' || value == null ? null : field === 'dcVisible' || field === 'finite' ? value === true || value === 'true' : Number(value);
/** A node template's tier range, "1–3" or "2". */
const tierRange = t => t.tier.min === t.tier.max ? `${t.tier.min}` : `${t.tier.min}–${t.tier.max}`;
/** A read-only summary of a template's material tables (GM only: chances are shown here, never to players). */
export function materialsSummary(t, names = new Map()) {
  const name = id => names.get(id) ?? 'Unknown material';
  const row = e => `${name(e.materialId)}${e.quantity > 1 ? ` ×${e.quantity}` : ''}${e.chance ? ` (${e.chance}%)` : ''}`;
  const m = t.materials ?? {};
  const parts = [];
  if (m.common?.length) parts.push(`Common: ${m.common.map(row).join(', ')}`);
  if (m.rare?.length) parts.push(`Rare (by 5+): ${m.rare.map(row).join(', ')}`);
  if (m.exotic?.length) parts.push(`Exotic: ${m.exotic.length} candidate${m.exotic.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'No materials: the GM awards it by hand';
}
/** MAT-* id -> Item name, for the pickers and list search. */
function materialNames() {
  const seen = new Map();
  for (const item of game.items ?? []) { const id = materialIdOf(item); if (id && !seen.has(id)) seen.set(id, item.name); }
  return seen;
}
/** A material picker (by name; the id stays in the option value). A saved id the world no longer has shows as "Unknown material". */
function matSelect(bind, current, none) {
  const names = materialNames();
  const opts = [...names].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const gone = current && !names.has(current) ? `<option value="${esc(current)}" selected>Unknown material</option>` : '';
  return `<select ${bind}><option value=""${current ? '' : ' selected'}>${none}</option>${opts}${gone}</select>`;
}
const LEDGER_MODULE = 'ashen-gate-profession-ledger';
/** The Ledger's Exotic API (ag-ledger-exotic/1), feature-detected. Locations works without it. */
const exoticApi = () => { const m = game.modules.get(LEDGER_MODULE); const x = m?.active ? m.api?.gathering?.exotic : null; return x?.contract === 'ag-ledger-exotic/1' ? x : null; };
/** Why the Ledger could not award a material, read from Manager's source flags ('' when it looks awardable). */
export function unavailableReason(src) {
  if (!src) return 'Not imported with General Manager';
  if (src.status !== 'approved') return `${src.status ? String(src.status).replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Not approved'}: approve it in General Manager first`;
  if (src.visibility !== 'player') return 'GM-only: make it player-visible in General Manager first';
  return '';
}
/** Exotic-quality world materials straight from Manager's definitions (read only), when the Ledger is not active. */
function exoticMaterialsLocal() {
  const seen = new Map();
  for (const item of game.items ?? []) {
    const id = materialIdOf(item), src = item.flags?.['ashen-gate-manager']?.source, def = src?.definition;
    if (id && !seen.has(id) && String(def?.quality ?? '').toLowerCase() === 'exotic') {
      const reason = unavailableReason(src);
      seen.set(id, {id, name: item.name, tier: null, available: !reason, reason});
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Exotic materials the GM can add to a node: with the Ledger, its catalog filtered by the node's gathering profession and
 * tier (not above); without it, every Exotic-quality material (the Ledger checks eligibility when gathering).
 */
export function exoticChoices(node) {
  const x = exoticApi();
  if (!x) return {filtered: false, list: exoticMaterialsLocal()};
  try { return {filtered: true, list: x.materials({profession: node.skill, maxTier: node.tier, includeUnavailable: true}).map(m => ({available: true, reason: '', ...m}))}; }
  catch (err) { console.warn(`${MODULE_ID} | Ledger Exotic list`, err); return {filtered: false, list: exoticMaterialsLocal()}; }
}
const STATE_ICONS = {hidden: 'fa-solid fa-eye-slash', unidentified: 'fa-solid fa-circle-question', revealed: 'fa-solid fa-eye'};
const STATE_HINTS = {
  hidden: 'Players see nothing. Its pins are invisible to them.',
  unidentified: 'Players see only the unidentified label and teaser, on the pin and in their Locations list.',
  revealed: 'Players see the published card: the name and everything marked visible.'
};
const showOpens = () => { try { return game.settings.get(MODULE_ID, 'showOpensWindow') !== false; } catch { return true; } };
const setting = (key, fallback) => { try { return game.settings.get(MODULE_ID, key) || fallback; } catch { return fallback; } };
const sceneName = uuid => { try { return globalThis.fromUuidSync?.(uuid)?.name ?? null; } catch { return null; } };
/** 0.20.0: a linked document's name ('' when it is gone or not loaded), and the world's RollTables for the pickers. */
const docName = uuid => { try { return globalThis.fromUuidSync?.(uuid)?.name ?? ''; } catch { return ''; } };
const worldTables = () => [...(game.tables ?? [])].filter(t => t?.uuid).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(t => ({value: t.uuid, label: t.name}));
/** Threat as a kit badge: Settled plain, Light and Normal ok, Hot warn, Deadly a solid danger fill (agl-threat--deadly). */
const THREAT_TONES = {light: 'ok', normal: 'ok', hot: 'warn', deadly: 'danger'};
const threatBadge = value => `<span class="ag-badge${THREAT_TONES[value] ? ` ag-badge--${THREAT_TONES[value]}` : ''} agl-threat agl-threat--${esc(value)}">${esc(threatLabel(value))}</span>`;
const userName = id => game.users?.get?.(id)?.name ?? 'A former player';
/** The world's players (not GMs), by name. */
const worldPlayers = () => [...(game.users ?? [])].filter(u => u?.id && !u.isGM).sort((a, b) => String(a.name).localeCompare(String(b.name)));
const MOVE_TYPES = new Set(['AshenGateLocation', 'AshenGateLocationMove']);
/** Milliseconds a search box waits after the last key before the list is redrawn. */
const SEARCH_DELAY = 150;

/** Drag data of a drop event via the shared item-drop helper; {} when unreadable. */
const dragData = event => readDrop(event);
/** Locations' own drag payloads (rows, folder moves, reorder handles): never a document, so drop zones ignore them quietly. */
const OWN_TYPES = new Set([...MOVE_TYPES, 'AshenGateReorder']);
const MISSING_DOC = "That document no longer exists or you can't see it.";
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
  if (!q?.openObjective) return ui.notifications.warn('Quest Log is not active.');
  const result = await q.openObjective(id);
  if (result?.status === 'not_found') ui.notifications.warn('That quest is not available in your Quest Log.');
}
/** Quest names: GM sees every quest, players only what Quest Manager lets them see. */
function questChoices() {
  const q = questApi();
  const visible = () => (q?.listVisible?.() ?? []).map(v => ({id: v.id, name: v.name, status: v.status}));
  if (game.user.isGM && q?.listQuests) {
    try { return q.listQuests(); } catch (err) { console.warn(`${MODULE_ID} | Quest Manager listQuests failed; showing visible quests only`, err); }
  }
  try { return visible(); } catch (err) { console.warn(`${MODULE_ID} | could not list quests`, err); return []; }
}
/** Picker label: the play status (Hidden until revealed) and the source's own status when it is not approved (e.g. draft). */
const questLabel = q => {
  const nice = v => String(v).replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());   // 'reveal_gated' -> 'Reveal gated'
  const notes = [q.status, q.definitionStatus && q.definitionStatus !== 'approved' ? q.definitionStatus : ''].filter(Boolean).map(nice);
  return `${q.name}${notes.length ? ` (${notes.join(' · ')})` : ''}`;
};
function questName(id, choices) {
  const hit = choices.find(c => c.id === id);
  if (hit) return hit.name;
  if (game.user.isGM) { try { return questApi()?.getGMSource?.(id)?.name ?? null; } catch { return null; } }
  try { return questApi()?.getVisibleObjective?.(id)?.name ?? null; } catch { return null; }
}

const Base = foundry.applications.api.ApplicationV2;
/** In-place toggle for the Player Preview: shows or hides the cards of the other states. No re-render, so focus stays on the checkbox. */
export function bindPreviewToggle(root) {
  const box = root?.querySelector?.('#agl-preview-others');
  if (!box) return;
  box.addEventListener('change', () => {
    for (const el of root.querySelectorAll('.agl-preview__part')) if (el.dataset.current !== '1') el.hidden = !box.checked;
    LocationsApp.previewOthers(box.checked);
  });
}
export class LocationsApp extends Base {
  static DEFAULT_OPTIONS = {id: 'ag-locations', classes: ['ag-app', 'agl-app'], window: {title: 'Ashen Gate | Locations', resizable: true}, position: {width: 980, height: 720}};
  static instance = null;
  /** Tree mode folders the GM (or player) opened. Kept while the game is open, across closing and reopening the window. */
  static treeOpen = new Set();
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
  /**
   * 0.23.0: the GM used Show to Players. Switches the one window to that location (never a second window) and brings it to front,
   * without taking focus from a field the player is typing in. Returns false, opening nothing, while the player has unsaved
   * Party Notes or edits (the caller then only notifies).
   */
  static async showFromGM(ref) {
    const open = LocationsApp.instance?.rendered ? LocationsApp.instance : null;
    if (open && (open.notesEdit || open.dirty)) return false;
    const active = globalThis.document?.activeElement;
    const typing = !!active?.matches?.('input, textarea, select, [contenteditable="true"]');
    await LocationsApp.show(ref);
    if (typing && active?.isConnected) { try { active.focus({preventScroll: true}); } catch { /* focus stays where it lands */ } }
    return true;
  }
  constructor(options = {}) {
    // Compact size; Comfortable (General Manager → My Appearance) opens it 1.2× larger.
    super({...options, position: {...windowSize(LocationsApp.DEFAULT_OPTIONS.position), ...(options.position ?? {})}});
    this.tab = 'locations'; this.query = ''; this.selectedId = null; this.draft = null; this.dirty = false;
    // Party Notes being edited: {ref, text, rev, renewed}. Kept across re-renders so live updates never wipe typing.
    this.notesEdit = null; this.notesTimer = null;
    // GM list view: how it is grouped, which groups are folded, and "show only one group". Per window, not saved.
    this.groupBy = 'region'; this.collapsed = new Set(); this.filters = emptyFilters(); this.sort = 'name'; this.sortDesc = false;
    // 1.8.0: Tree mode (folders), "Show representative-only too" for placing pins, and the last move (for Undo).
    this.treeMode = false; this.showRep = false; this.lastMove = null; this.undoTimer = null;
    // 0.19.0: the editor sub-tab and whether the filter row is open, remembered per user (kit uiState).
    this.editorTab = uiMem().get('editorTab', 'content', EDITOR_TABS.map(t => t.id));
    this.filtersOpen = uiMem().get('filtersOpen', false, [true, false]);
  }
  get gm() { return game.user.isGM === true; }
  /** 0.19.0: unsaved location edits are tracked by the kit's guardDirty (it asks before they are discarded). */
  get locGuard() {
    return this._locGuard ??= guardDirty({status: () => this.element?.querySelector?.('[data-editor="location"] .ag-footer__status'), message: 'You have unsaved changes to this location.'});
  }
  get dirty() { return this.locGuard.dirty; }
  set dirty(v) { if (v) this.locGuard.markDirty(); else this.locGuard.markClean(); }
  /**
   * 0.19.0: an action that needs the saved record (Place on Scene, a state change) asks first
   * when there are unsaved edits: "Save and <verb>" or Keep editing. Resolves true to go ahead (the caller then saves).
   */
  async saveFirst(verb, dirty = this.dirty, what = 'location') {
    if (!dirty) return true;
    const choice = await choiceDialog('Save changes first?', `<p>This ${what} has unsaved changes. ${esc(verb[0].toUpperCase() + verb.slice(1))} uses the saved ${what}, so your changes are saved first.</p>`,
      [{action: 'save', label: `Save and ${verb}`, default: true}], {cancel: 'Keep editing'});
    return choice === 'save';
  }
  list() { return this.gm ? api().listLocations() : api().listLocations({includeUnidentified: true}); }
  /** Row identity: the LOC id for the GM; for players the pinKey (unidentified ones have no id). */
  rid(l) { return this.gm ? l.id : l.key || l.id; }
  /** Accepts a LOC id or a pinKey (Map Notes carry only the key). */
  select(ref) {
    const found = ref ? api().getLocation(ref) : null;
    const next = found ? this.rid(found) : null;
    if (this.notesEdit && this.notesEdit.ref !== next) this.stopNotesEdit();
    this.selectedId = next;
    this.draft = this.gm && found ? clone(found) : null;
    this.dirty = false;
  }
  /** List header click: folds or unfolds that group. */
  toggleGroup(key) {
    const id = `${this.groupBy}:${key}`;
    if (!this.collapsed.delete(id)) this.collapsed.add(id);
    return this.render();
  }
  clearFilters() { this.filters = emptyFilters(); this.query = ''; return this.render(); }
  /** Asks before unsaved location edits are thrown away (kit guardDirty: Keep editing is the default). */
  async confirmDiscard() {
    return this.locGuard.confirm();
  }
  async close(options = {}) {
    if (!(await this.confirmDiscard())) return this;
    this.dirty = false;
    this.stopNotesEdit();
    clearTimeout(this.notesTimer);
    return super.close(options);
  }

  /** Never an empty window: a failure while building the page shows the error inside the window, with Retry. */
  async _renderHTML() {
    try { return await this.buildHtml(); } catch (err) {
      if (/hidden from players/.test(err?.message ?? '')) throw err;   // Player Access is off: the window closes itself, not a render fault
      return this.errorHtml(err);
    }
  }
  errorHtml(err) {
    console.error(`${MODULE_ID} | render failed`, err);
    return `<div class="agl-root"><div class="ag-card agl-error" role="alert"><h3>Locations could not be drawn</h3>
      <p>${esc(err?.message ?? String(err))}</p><p class="agl-hint">Your unsaved edits are still in memory. Retry, or close and reopen the window. The error is also in the browser console (F12).</p>
      ${btn('retry', 'Retry', {kind: 'primary', icon: 'fa-solid fa-rotate'})}</div></div>`;
  }
  async buildHtml() {
    const list = this.list();
    const creating = this.gm && this.draft && !this.draft.id;
    if (!creating) {
      if (this.selectedId && !list.some(l => this.rid(l) === this.selectedId)) this.select(null);
      if (!this.selectedId && list.length) this.select(this.rid(list[0]));
      if (this.gm && this.selectedId && !this.draft) this.select(this.selectedId);
    }
    const version = game.modules.get(MODULE_ID)?.version ?? '';
    // 0.20.0: Routes are retired (a route is a location of type Route): players get Locations only, the GM also GM Setup.
    const tabs = [['locations', 'Locations', 'fa-map-location-dot'], ...(this.gm ? [['setup', 'GM Setup', 'fa-gears', true]] : [])];
    const tab = this.tab === 'setup' && this.gm ? 'setup' : 'locations';
    // Developer Tools offers "Convert routes to locations" only while the world still holds stored routes.
    if (tab === 'setup') { try { this.convertPlan = await api().convertRoutes(); } catch (err) { console.warn(`${MODULE_ID} | route conversion preview`, err); this.convertPlan = null; } }
    return `<div class="agl-root ag-window">
      <header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Locations</h1></div>
        <div class="ag-header__meta"><span class="ag-version">v${esc(version)}</span>${btn('help', 'Help', {kind: 'ghost sm', icon: 'fa-solid fa-circle-question'})}</div></header>
      ${tabs.length > 1 ? `<nav class="ag-tabs ag-tabs--scroll agl-maintabs" role="tablist" aria-label="Locations sections">${tabs.map(([k, l, icon, gmOnly]) =>
        `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}" class="${tab === k ? 'active' : ''}${gmOnly ? ' ag-tab--gm' : ''}" aria-controls="agl-pane"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${l}</button>`).join('')}</nav>` : ''}
      <div class="agl-pane" id="agl-pane">${tab === 'setup' ? this.setupHtml() : this.locationsHtml(list)}</div>
    </div>`;
  }
  _replaceHTML(result, content) {
    const scroll = content.querySelector('.agl-detail')?.scrollTop ?? 0, outer = content.querySelector('.agl-pane')?.scrollTop ?? 0;
    const typing = globalThis.document?.activeElement?.id === 'agl-party-text' ? globalThis.document.activeElement : null;
    const caret = typing ? [typing.selectionStart, typing.selectionEnd] : null;
    content.innerHTML = result;
    const detail = content.querySelector('.agl-detail');
    if (detail) detail.scrollTop = scroll;
    const pane = content.querySelector('.agl-pane');
    if (pane) pane.scrollTop = outer;
    const box = caret && content.querySelector('#agl-party-text');
    if (box) { box.focus(); box.setSelectionRange(...caret); }
    try { this.bind(content); } catch (err) { content.innerHTML = this.errorHtml(err); this.bind(content); }
  }

  // ---------- list ----------
  locationsHtml(list) {
    let rows = list, total = list.length, filters = '';
    if (this.gm) {
      const tpl = nodeTemplates();
      if (tpl.ok) rows = list = withNodeInfo(list, tpl.list);
      const questChoicesList = questChoices();
      const qName = id => questName(id, questChoicesList) ?? 'Unknown quest';
      const mats = materialNames();
      if (this.query.trim()) rows = rows.filter(l => matchesQuery(searchText(l, {questName: qName, materialName: id => mats.get(id) ?? id}), this.query));
      const searched = rows;
      rows = applyFilters(rows, this.filters).sort(comparator(this.sort, this.sortDesc));
      filters = this.filterBarHtml(filterOptions(searched, this.filters, qName));
      this.qName = qName;
    } else {
      const q = this.query.toLowerCase();
      rows = list.filter(l => !q || [l.name, l.type, l.region].some(s => String(s ?? '').toLowerCase().includes(q)));
    }
    const filtering = hasFilters(this.filters) || !!this.query.trim();
    let items;
    if (this.gm && this.treeMode) items = this.treeHtml(list, rows, filtering);
    else if (!this.gm) items = this.playerTreeHtml(list, rows, !!this.query.trim());
    else {
      items = groupRows(rows, this.groupBy, this.qName).map(g => {
        if (this.groupBy === 'none') return `<li class="agl-group"><div class="ag-rows">${g.rows.map(l => this.rowButton(l)).join('')}</div></li>`;
        const folded = this.collapsed.has(`${this.groupBy}:${g.key}`);
        return `<li class="agl-group"><h3 class="agl-group__title"><button type="button" class="agl-group__head ag-eyebrow" data-action="toggle-group" data-group="${esc(g.key)}" aria-expanded="${!folded}"
          ${tip(folded ? 'Unfold' : 'Fold')}><i class="fa-solid ${folded ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i><span>${esc(g.label)}</span><span class="agl-count">${g.rows.length}</span></button></h3>
          ${folded ? '' : `<div class="ag-rows">${g.rows.map(l => this.rowButton(l)).join('')}</div>`}</li>`;
      }).join('');
    }
    const empty = (icon, title, text, action = '') => `<div class="ag-empty"><i class="fa-solid ${icon}" aria-hidden="true"></i><p class="ag-empty__title">${title}</p><p class="ag-empty__text">${text}</p>${action}</div>`;
    const none = list.length
      ? empty('fa-filter', 'Nothing matches', this.gm ? 'No locations match this search and these filters.' : 'No places match this search.',
        this.gm || this.query ? btn('clear-filters', 'Clear filters', {kind: 'sm', icon: 'fa-solid fa-filter-circle-xmark'}) : '')
      : this.gm ? empty('fa-map-location-dot', 'No locations yet', 'Create one with New location, or import a file.', btn('new', 'New location', {kind: 'sm', icon: 'fa-solid fa-plus'}))
        : empty('fa-map-location-dot', 'No locations yet', "Your GM hasn't revealed any places yet.");
    // 0.19.0: Import is a kit file button (a real button the keyboard reaches), not a hidden input clicked from code.
    const end = this.gm ? `<div class="ag-toolbar__end">${fileButton({label: 'Import…', accept: '.json,application/json', icon: 'fa-solid fa-file-import', className: 'ag-btn ag-btn--sm', data: {import: 'locations'}})}${btn('export', 'Export', {kind: 'sm', icon: 'fa-solid fa-file-export', title: 'Every location as one JSON file'})}
        ${btn('new', 'New location', {icon: 'fa-solid fa-plus'})}</div>` : '';
    // 0.19.0 (LOC-CR-02): one toolbar row; the filters, sort, group and "representative-only" open in a second row from Filters (n).
    const n = Object.values(this.filters).filter(Boolean).length;
    const quick = this.gm ? `<button type="button" class="ag-chip" id="agl-filters-toggle" aria-pressed="${this.filtersOpen}" aria-expanded="${this.filtersOpen}" aria-controls="agl-filter-row"${tip('Filter, sort and group the list')}><i class="fa-solid fa-filter" aria-hidden="true"></i> Filters${n ? ` (${n})` : ''}</button>
        <button type="button" class="ag-chip" id="agl-tree" aria-pressed="${this.treeMode}"${tip('Show locations inside their Regions, as folders')}><i class="fa-solid fa-folder-tree" aria-hidden="true"></i> Tree</button>` : '';
    return `<div class="ag-toolbar agl-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="agl-search" placeholder="${this.gm ? 'Search name, region, skill, material, quest…' : 'Search locations'}" value="${esc(this.query)}" aria-label="Search locations"></label>
        ${quick}${this.gm ? `<span class="ag-toolbar__count" aria-live="polite">Showing ${rows.length} of ${total}</span>` : ''}${end}</div>
      ${this.gm && this.filtersOpen ? filters : ''}
      <div class="agl-body ag-split"><aside class="agl-list ag-split__list">${this.undoHtml()}${rows.length ? `<ul class="agl-groups">${items}</ul>` : none}
        ${this.gm && rows.length ? `<p class="agl-hint">Drag a placeable location onto the scene to place a Map Note${this.treeMode ? '; drag one onto a folder to move it inside' : ''}.</p>` : ''}</aside>
      <section class="agl-detail ag-split__detail">${this.gm ? this.editorHtml() : this.viewerHtml(list.find(l => this.rid(l) === this.selectedId))}</section></div>`;
  }

  /** One list row. GM: draggable onto the canvas (placeable ones, or all with "Show representative-only too") or onto a folder. */
  rowButton(l) {
    const gm = this.gm, rep = gm && !isPlaceable(l), selected = this.rid(l) === this.selectedId;
    const drag = gm ? ` draggable="true" data-drag-type="${!rep || this.showRep ? 'AshenGateLocation' : 'AshenGateLocationMove'}"` : '';
    const restricted = gm ? l.audience?.mode === 'selected' : !!l.share;
    return `<button type="button" class="ag-row agl-row${selected ? ' is-selected' : ''}"${selected ? ' aria-current="true"' : ''} data-action="select" data-id="${esc(this.rid(l))}"${drag}>
        ${gm && l.isRegion ? mark('fa-solid fa-folder', 'Region (folder)', 'agl-row__icon') : ''}
        <span class="ag-row__main"><span class="ag-row__title agl-row__name">${esc(l.name)}</span></span>
        <span class="ag-row__end">${rep && !l.isRegion ? mark('fa-solid fa-layer-group', 'Representative only: not placed on maps') : ''}
        ${restricted ? mark('fa-solid fa-user-lock', gm ? 'Selected players only' : 'Shared with selected players') : ''}
        ${l.threat ? threatBadge(l.threat) : ''}
        ${gm ? `${hasUnpublishedChanges(l) ? `<span class="agl-dot"${tip('Saved changes not published yet')} aria-hidden="true"></span><span class="ag-sr-only">Saved changes not published yet</span>` : ''}${mark(STATE_ICONS[l.state], STATE_LABELS[l.state])}` : ''}</span>
      </button>`;
  }
  /** One tree node and, if open, its children. GM Regions are folders: counts, drop target, New place inside. */
  treeNodeHtml(n, {open, path = null}) {
    const l = n.item, kids = n.children.length > 0, isOpen = kids && open(n.id), folder = this.gm && l.isRegion;
    const toggle = kids ? `<button type="button" class="agl-tree__toggle" data-action="tree-toggle" data-id="${esc(n.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Close' : 'Open'} ${esc(l.name)}"${tip(isOpen ? 'Close' : 'Open')}><i class="fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" aria-hidden="true"></i></button>`
      : '<span class="agl-tree__toggle" aria-hidden="true"></span>';
    const counts = this.gm && (folder || n.direct) ? `<span class="agl-count"${tip(`${n.direct} directly inside, ${n.total} in total`)}>${n.direct}${n.total !== n.direct ? ` · ${n.total}` : ''}</span>` : '';
    const add = folder ? btn('new-child', '', {kind: 'ghost sm', icon: 'fa-solid fa-plus', data: {parent: l.id}, title: `New place inside ${l.name}`}) : '';
    return `<li class="agl-tree__item${path && !path.has(n.id) ? ' agl-tree__item--path' : ''}">
      <div class="agl-tree__row"${folder ? ` data-folder="${esc(l.id)}"` : ''}>${toggle}${this.rowButton(l)}${counts}${add}</div>
      ${isOpen ? `<ul class="agl-tree">${n.children.map(c => this.treeNodeHtml(c, {open, path})).join('')}</ul>` : ''}</li>`;
  }
  /** Is this folder open? Filtering opens every path to a match; the selected location's folders are always open. */
  treeOpener(items, filtering, accessors) {
    const sel = this.selectedId ? new Set(breadcrumb(items, this.selectedId, accessors).map(i => accessors?.idOf?.(i) ?? i.id)) : new Set();
    return id => filtering || sel.has(id) || LocationsApp.treeOpen.has(id);
  }
  /** GM Tree mode: every location under its parent, Regions as folders. Filters and search keep matches and their folders. */
  treeHtml(list, rows, filtering) {
    const show = filtering ? withAncestors(list, rows) : null;
    const nodes = buildTree(list, {show, sort: comparator(this.sort, this.sortDesc)});
    const open = this.treeOpener(list, filtering);
    const tools = `<li class="agl-tree__tools" data-folder="">${btn('tree-all', 'Expand all', {kind: 'ghost sm', icon: 'fa-solid fa-folder-open', data: {open: 1}})}${btn('tree-all', 'Collapse all', {kind: 'ghost sm', icon: 'fa-solid fa-folder-closed', data: {open: 0}})}
      <span class="agl-hint">Drop here for top level</span></li>`;
    return `${tools}<li><ul class="agl-tree agl-tree--root" aria-label="Locations by folder">${nodes.map(n => this.treeNodeHtml(n, {open, path: show && new Set(rows.map(l => l.id))})).join('')}</ul></li>`;
  }
  /**
   * Players: places they can see, nested under the visible places they are in (a parent they cannot see is never
   * named; an unidentified one shows its label). Top-level places are grouped by region, unidentified ones last.
   */
  playerTreeHtml(list, rows, filtering) {
    const show = filtering ? withAncestors(list, rows, VIEW) : null;
    const nodes = buildTree(list, {...VIEW, show, sort: (a, b) => a.name.localeCompare(b.name)});
    const open = this.treeOpener(list, filtering, VIEW);
    const groups = new Map(), UNID = 'Unidentified';
    for (const n of nodes) { const g = n.item.state === 'unidentified' ? UNID : n.item.region || 'No region'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); }
    const last = g => g === 'No region' || g === UNID;
    return [...groups.entries()].sort(([a], [b]) => last(a) - last(b) || (a === UNID) - (b === UNID) || a.localeCompare(b))
      .map(([group, ns]) => `<li class="agl-group"><h3 class="agl-group__title ag-eyebrow">${esc(group)}</h3><ul class="agl-tree agl-tree--root">${ns.map(n => this.treeNodeHtml(n, {open})).join('')}</ul></li>`).join('');
  }
  /** After a move: what happened, with Undo (GM). */
  undoHtml() {
    const m = this.lastMove;
    if (!m || !this.gm) return '';
    return `<div class="agl-undo" role="status"><span>Moved <strong>${esc(m.name)}</strong> ${m.to ? `into ${esc(m.toName)}` : 'to the top level'}.</span>${btn('undo-move', 'Undo', {kind: 'sm', icon: 'fa-solid fa-rotate-left'})}</div>`;
  }

  /** GM list controls in the second toolbar row (opened by Filters): filters (AND, each with counts), sort, group, Clear filters. */
  filterBarHtml(opts) {
    const sel = (key, label, all, extra = '') => `<label class="ag-field ag-field--inline agl-ctl"><span>${label}</span><select data-filter="${key}" aria-label="Filter by ${label.toLowerCase()}"><option value="">${all}</option>${extra}${opts[key].map(o =>
      `<option value="${esc(o.value)}" ${this.filters[key] === o.value ? 'selected' : ''}>${esc(o.label)} (${o.count})</option>`).join('')}</select></label>`;
    const plain = (id, label, list, cur) => `<label class="ag-field ag-field--inline agl-ctl"><span>${label}</span><select id="${id}" aria-label="${label}">${list.map(m => `<option value="${m.value}" ${cur === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>`;
    const dir = this.sortDesc ? 'Descending (click for ascending)' : 'Ascending (click for descending)';
    return `<div class="ag-toolbar agl-filter-row" id="agl-filter-row"><div class="ag-toolbar__filters agl-filters" role="group" aria-label="Filter, sort and group the list">
      ${sel('threat', 'Threat', 'All')}${sel('region', 'Region', 'All')}${sel('profession', 'Profession', 'All')}${sel('quest', 'Quest', 'Any')}${sel('status', 'Status', 'All')}${sel('placeable', 'Placeable', 'All')}
      ${plain('agl-sort', 'Sort by', SORTS, this.sort)}<button type="button" class="ag-btn ag-btn--icon" id="agl-sortdir" aria-label="Sort direction: ${this.sortDesc ? 'descending' : 'ascending'}"${tip(dir)}><i class="fa-solid ${this.sortDesc ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}" aria-hidden="true"></i></button>
      ${this.treeMode ? '' : plain('agl-groupby', 'Group by', GROUP_MODES, this.groupBy)}
      <label class="ag-field ag-field--inline agl-switch"${tip('Representative-only locations (most Regions) are not offered for placing on a map unless this is on')}><input type="checkbox" id="agl-showrep" ${this.showRep ? 'checked' : ''}> Show representative-only too</label>
      ${hasFilters(this.filters) || this.query ? btn('clear-filters', 'Clear filters', {kind: 'ghost sm', icon: 'fa-solid fa-filter-circle-xmark'}) : ''}</div></div>`;
  }

  // ---------- player viewer ----------
  viewerHtml(v, {partyNotes = true} = {}) {
    if (!v) return '<div class="ag-empty"><p class="ag-empty__title">No place selected</p><p class="ag-empty__text">Pick a place from the list.</p></div>';
    const place = r => `${go(r.name, 'select', {id: r.key || r.id})}${r.id ? '' : ' <small>(unidentified)</small>'}`;
    const share = partyNotes ? this.shareHtml(v) : '';
    if (v.state === 'unidentified') return `<article class="agl-view">
      <div class="agl-title"><h2>${esc(v.name)}</h2><span class="ag-badge">Unidentified</span></div>${share}
      ${v.teaser ? `<p class="agl-desc">${esc(v.teaser).replace(/\n/g, '<br>')}</p>` : '<p class="agl-hint">Nothing more is known about this place yet.</p>'}
      ${partyNotes ? this.partyNotesHtml(v.key) : ''}
    </article>`;
    const quests = questChoices();
    const link = (label, uuid) => uuid ? go(label, 'open-doc', {uuid}) : esc(label);
    const card = (title, body) => body ? `<section class="ag-card"><h3>${title}</h3>${body}</section>` : '';
    const ul = items => items.length ? `<ul class="ag-list agl-entries">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
    const paras = t => esc(t).replace(/\n/g, '<br>');
    const questItems = (v.quests ?? []).map(id => [id, questName(id, quests)]).filter(([, n]) => n)
      .map(([id, n]) => go(n, 'open-quest', {id}, {icon: 'fa-solid fa-scroll'}));
    // Loot: only the approved title, text, image and status. A link opens only if Foundry says this user may open the document.
    const lootItem = l => `${l.img ? `<img class="agl-loot__img" src="${esc(l.img)}" alt="">` : ''}<span class="agl-entry">${canOpen(l.uuid) ? link(l.label || 'Item', l.uuid) : esc(l.label)}
      ${l.text ? `<small>${esc(l.text)}</small>` : ''}</span><span class="ag-badge ${l.status === 'available' ? 'ag-badge--ok' : ''}">${esc(LOOT_STATUS_LABELS[l.status] ?? 'Available')}</span>`;
    const blocks = {
      description: v.description ? `<p class="agl-desc">${paras(v.description)}</p>` : '',
      conditions: card('Conditions', ul((v.conditions ?? []).map(c => `<strong>${esc(c.label)}</strong>${c.text ? ` <small>${esc(c.text)}</small>` : ''}`))),
      children: card('Places Here', ul((v.children ?? []).map(place))),
      resources: card('Gathering Resources', ul((v.resources ?? []).map(r => `<span class="agl-entry${r.exhausted ? ' agl-exhausted' : ''}">${link(nodeName(r), r.uuid)}${r.quantity > 1 ? ` ×${r.quantity}` : ''}
        <small>${[r.skill, `Tier ${r.tier}`, r.dc && `DC ${r.dc}`].filter(Boolean).map(esc).join(' · ')}</small></span>
        ${r.exhausted ? '<span class="ag-badge">Exhausted</span>' : `<span class="ag-badge ${r.available ? 'ag-badge--ok' : ''}">${r.available ? 'Available' : 'Unavailable'}</span>`}${r.note ? `<small>${esc(r.note)}</small>` : ''}`))),
      factions: card('Factions', ul((v.factions ?? []).map(f => `${link(f.label, f.uuid)}${f.note ? ` <small>${esc(f.note)}</small>` : ''}`))),
      quests: card('Quests', ul(questItems)),
      related: card('Related Locations', ul((v.related ?? []).map(r => go(r.name, 'select', {id: r.id})))),
      loot: card('Loot &amp; Rewards', ul((v.loot ?? []).map(lootItem))),
      hazards: card('Hazards', ul((v.hazards ?? []).map(h => `<strong>${esc(h.name || 'Hazard')}</strong>${h.note ? ` <small>${paras(h.note)}</small>` : ''}`))),
      rollTables: card('Roll Tables', ul((v.rollTables ?? []).map(t => canOpen(t.uuid) ? go(t.name || 'Roll table', 'open-doc', {uuid: t.uuid}, {icon: 'fa-solid fa-table-list'}) : esc(t.name || 'Roll table')))),
      notes: (v.notes ?? []).map(n => card(esc(n.title || 'Note'), `${n.text ? `<p>${paras(n.text)}</p>` : ''}${n.uuid ? `<p>${link(`Open ${n.docType || 'document'}`, n.uuid)}</p>` : ''}`)).join('')
    };
    for (const d of v.details ?? []) blocks[DETAIL_PREFIX + d.key] = card(esc(d.title || 'Detail'), `${d.text ? `<p>${paras(d.text)}</p>` : ''}${d.uuid && canOpen(d.uuid) ? `<p>${link(`Open ${d.docType || 'document'}`, d.uuid)}</p>` : ''}`);
    // The path through the places this player can see (the view's parent is only ever a visible one).
    const views = partyNotes ? this.list() : [];
    const crumbs = breadcrumb(views, v.key, VIEW);
    return `<article class="agl-view">
      ${crumbs.length ? `<nav class="agl-crumbs" aria-label="Where this is">${crumbs.map(c => `${place(c)} <span aria-hidden="true">›</span> `).join('')}<span>${esc(v.name)}</span></nav>` : ''}
      <div class="agl-title"><h2>${esc(v.name)}</h2>${v.threat ? threatBadge(v.threat) : ''}</div>${share}
      ${v.type || v.region ? `<p class="agl-meta">${[v.type, v.region].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
      ${v.parent && !crumbs.length ? `<p class="agl-meta">Part of ${place(v.parent)}</p>` : ''}
      ${v.img ? `<img class="agl-img" src="${esc(v.img)}" alt="">` : ''}
      ${(v.layout ?? normalizeLayout([], v.details ?? [])).map(k => blocks[k] ?? '').join('')}
      ${partyNotes ? this.partyNotesHtml(v.key) : ''}
    </article>`;
  }

  /** Players: who else sees a "Selected players" location, and Share with... when the GM allows it. */
  shareHtml(v) {
    if (!v?.share || this.gm) return '';
    const others = v.share.userIds.filter(u => u !== game.user.id).map(userName);
    return `<p class="agl-meta agl-share"><i class="fa-solid fa-user-lock" aria-hidden="true"></i> ${others.length ? `Also known to ${others.map(esc).join(', ')}.` : 'Only you know this place.'}
      ${v.share.canShare ? btn('share', 'Share with…', {kind: 'sm', icon: 'fa-solid fa-share-nodes', data: {ref: v.key}, title: 'Let other players see this place too'}) : ''}</p>`;
  }

  /**
   * The shared Party Notes card (players and GM). Separate from the GM's own Notes: never part of the location,
   * never published or imported. Edit takes the one-editor lock; Save sends the text with the stamp it started from.
   */
  partyNotesHtml(ref, {gmHint = ''} = {}) {
    clearTimeout(this.notesTimer);
    let n = null;
    try { n = ref ? api().getPartyNotes(ref) : null; } catch { n = null; }
    if (!n) { if (this.notesEdit?.ref === ref) this.notesEdit = null; return ''; }
    const editing = this.notesEdit?.ref === ref;
    const other = n.editing && !n.mine ? n.editing : null;
    // Show the lock lifting on its own when it lapses, without waiting for another change.
    if (other && !editing) this.notesTimer = setTimeout(() => { if (this.rendered) this.render().catch(notifyError); }, Math.max(1000, other.until - Date.now() + 500));
    const when = n.updatedAt ? new Date(n.updatedAt).toLocaleString() : '';
    const meta = n.updatedBy ? `<p class="agl-hint">Last saved by ${esc(n.updatedBy.name)}${when ? `, ${esc(when)}` : ''}.</p>` : '';
    const badge = other ? `<span class="ag-badge ag-badge--warn"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${esc(other.name)} is editing</span>` : '';
    const data = {ref};
    let body;
    if (editing) {
      body = `<textarea id="agl-party-text" rows="6" maxlength="${PARTY_NOTES.maxLength}" aria-label="Party Notes">${esc(this.notesEdit.text)}</textarea>
        <p class="agl-hint">Only you can edit now; others see that you are editing. Save or cancel when you are done (the lock lapses after ${Math.round(PARTY_NOTES.lockMs / 60000)} minutes without typing).</p>
        <div class="agl-party__actions"><div>${btn('notes-cancel', 'Cancel notes edit', {kind: 'ghost', data})}</div><div>${btn('notes-save', 'Save Party Notes', {kind: this.gm ? '' : 'primary', icon: 'fa-solid fa-floppy-disk', data})}</div></div>`;
    } else {
      const text = n.text ? `<p class="agl-party__text">${esc(n.text).replace(/\n/g, '<br>')}</p>` : '<p class="agl-hint">No party notes yet.</p>';
      const edit = other && this.gm
        ? btn('notes-edit', 'Take Over', {icon: 'fa-solid fa-pen', data: {...data, takeover: 1}, title: `Edit now. ${other.name}'s unsaved text will be refused when they save.`})
        : `<button type="button" class="ag-btn" data-action="notes-edit" data-ref="${esc(ref)}"${other ? ' disabled' : ''}><i class="fa-solid fa-pen" aria-hidden="true"></i><span>Edit</span></button>${other ? `<span class="agl-hint">${esc(other.name)} is editing; you can edit when they are done.</span>` : ''}`;
      const clear = this.gm && n.text ? btn('notes-clear', 'Clear', {kind: 'danger', icon: 'fa-solid fa-eraser', data, title: 'Empty these Party Notes'}) : '';
      body = `${text}${meta}<div class="agl-party__actions"><div>${clear}</div><div>${edit}</div></div>`;
    }
    return `<section class="ag-card ag-card--accent agl-party" data-party="${esc(ref)}">
      <header class="ag-card__head"><h3><i class="fa-solid fa-users" aria-hidden="true"></i> Party Notes</h3>${badge}</header>
      <p class="agl-hint">${this.gm ? `Written by the players, shared by everyone. Not part of the location: Save Changes, Publish and imports never change them.${gmHint}` : 'Shared by the whole party. Anyone can edit, one at a time.'}</p>
      ${body}</section>`;
  }
  /** Leaves the editor and lets go of the lock (fire and forget: a lapsed or lost lock is fine). */
  stopNotesEdit() {
    const ref = this.notesEdit?.ref;
    this.notesEdit = null;
    if (ref) api()?.releasePartyNotes(ref).catch(err => console.warn(`${MODULE_ID} |`, err?.message ?? err));
  }
  /** Keeps the lock while the user is typing, at most every PARTY_NOTES.renewMs. */
  renewNotesLock() {
    const e = this.notesEdit;
    if (!e || Date.now() - e.renewed < PARTY_NOTES.renewMs) return;
    e.renewed = Date.now();
    api().editPartyNotes(e.ref).catch(err => ui.notifications.warn(`${err?.message ?? err} Your text is still in the box.`));
  }

  // ---------- GM editor ----------
  editorHtml() {
    const d = this.draft;
    if (!d) return '<div class="ag-empty"><p class="ag-empty__title">No location selected</p><p class="ag-empty__text">Pick one from the list, or create one with New location.</p></div>';
    const all = api().listLocations();
    const quests = questChoices();
    const fld = (f, control) => `<div class="ag-field agl-field"><label for="agl-${f}">${FIELD_LABELS[f]}</label><div class="agl-field__row">${control}${eye(`show.${f}`, d.show[f], FIELD_LABELS[f])}</div></div>`;
    const label = key => BLOCKS.find(b => b.key === key)?.label ?? key;
    const blockTools = (key, title) => `<span class="agl-block-tools"><span class="agl-handle" draggable="true" data-drag-block="${esc(key)}" tabindex="0" role="button"
        aria-label="Move ${esc(title)}. Drag, or press Alt+Up or Alt+Down."${tip('Drag to reorder (Alt+Up / Alt+Down)')}><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>
      ${btn('move-block', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-up', data: {key, dir: -1}, title: `Move ${title} up`})}${btn('move-block', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-down', data: {key, dir: 1}, title: `Move ${title} down`})}</span>`;
    const block = (key, titleHtml, plainTitle, body, head = '', drop = key) => `<section class="ag-card agl-section" data-block="${esc(key)}"${drop ? ` data-drop="${esc(drop)}"` : ''}>
        <header class="ag-card__head"><h3>${titleHtml}</h3><span class="agl-head-tools">${head}${blockTools(key, plainTitle)}</span></header>${body}</section>`;
    const sec = (key, body, add, dropHint) => block(key, label(key), label(key), `${body || `<p class="agl-hint">${dropHint}</p>`}<div class="agl-add">${add}</div>`,
      `<label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="sections.${key}" ${d.sections[key] ? 'checked' : ''}> Show section to players</label>`);
    const byId = new Map(all.map(l => [l.id, l.name]));
    // 0.19.0 (LOC-A11Y-04): repeated tools name their entry ("Remove [TEST] Faction A", not six "Remove").
    const entryName = (key, e) => String(e.label || e.title || (key === 'quests' ? questName(e.questId, quests) : key === 'related' ? byId.get(e.locationId) : key === 'resources' ? nodeName(e) : '') || 'this entry');
    const entryTools = (key, e) => { const n = entryName(key, e); return `${btn('move-entry', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-up', data: {section: key, key: e.key, dir: -1}, title: `Move ${n} up`})}${btn('move-entry', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-down', data: {section: key, key: e.key, dir: 1}, title: `Move ${n} down`})}${eye(`${key}.${e.key}.visible`, e.visible, n)}${btn('remove', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {section: key, key: e.key}, title: `Remove ${n}`})}`; };
    const handle = (key, e) => `<span class="agl-handle" draggable="true" data-drag-entry="${esc(key)}:${esc(e.key)}" tabindex="0" role="button" aria-label="Move ${esc(entryName(key, e))}. Drag, or press Alt+Up or Alt+Down."${tip('Drag to reorder (Alt+Up / Alt+Down)')}><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>`;
    const docLink = (label, uuid) => uuid ? go(label, 'open-doc', {uuid}) : `<span>${esc(label)}</span>`;
    const rows = (key, fn) => d[key].length ? `<ul class="ag-list agl-entries">${d[key].map(e => `<li data-entry="${esc(key)}:${esc(e.key)}" class="${e.visible ? '' : 'agl-hidden'}">${handle(key, e)}${fn(e)}<span class="agl-tools">${entryTools(key, e)}</span></li>`).join('')}</ul>` : '';
    const addText = (key, placeholder) => `<input type="text" id="agl-add-${key}" placeholder="${placeholder}">${btn('add-text', 'Add', {kind: 'sm', data: {section: key}, icon: 'fa-solid fa-plus'})}`;
    const text = (bind, v, placeholder, aria) => `<input type="text" data-bind="${esc(bind)}" value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(aria)}">`;

    const nodes = nodeTemplates();
    const resources = d.resources.length ? `<datalist id="agl-skills">${GATHERING.skills.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <ul class="ag-list agl-nodes">${d.resources.map(e => isNodeRef(e) ? this.nodeRefHtml(e, nodes, entryTools, handle) : this.nodeHtml(e, entryTools, handle)).join('')}</ul>` : '';
    const factions = rows('factions', e => `<span class="agl-entry">${docLink(e.label, e.uuid)}</span>`);
    const questRows = rows('quests', e => {
      const name = questName(e.questId, quests);
      return `<span class="agl-entry">${go(name ?? 'Unknown quest', 'open-quest', {id: e.questId}, {icon: 'fa-solid fa-scroll'})}${name ? '' : ' <small>(not found in Quest Log)</small>'}</span>`;
    });
    const linkedQuests = new Set(d.quests.map(q => q.questId));
    const questAdd = questApi()
      ? `<select id="agl-add-quests"><option value="">Choose a quest…</option>${quests.filter(q => !linkedQuests.has(q.id)).map(q => `<option value="${esc(q.id)}">${esc(questLabel(q))}</option>`).join('')}</select>${btn('add-quest', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}`
      : '<p class="agl-hint">Activate Quest Log to link quests.</p>';
    const relatedRows = rows('related', e => `<span class="agl-entry">${byId.has(e.locationId) ? go(byId.get(e.locationId), 'select', {id: e.locationId}) : '<span>Deleted location</span> <small>(deleted)</small>'}</span>`);
    const linkedRel = new Set(d.related.map(r => r.locationId));
    const relatedAdd = `<select id="agl-add-related"><option value="">Choose a location…</option>${all.filter(l => l.id !== d.id && !linkedRel.has(l.id)).map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select>${btn('add-related', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}`;
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
    const stateBar = `<div class="ag-segmented agl-state" role="group" aria-label="What players see">${STATES.map(st => `<button type="button" aria-pressed="${d.state === st}" data-action="state" data-state="${st}"${
        tip(d.state === st ? `${STATE_LABELS[st]} (current)` : `Make ${STATE_LABELS[st].toLowerCase()}${st === 'hidden' ? '' : ' and publish the saved content'}`)}><i class="${STATE_ICONS[st]}" aria-hidden="true"></i> ${STATE_LABELS[st]}</button>`).join('')}</div>`;
    const order = normalizeLayout(d.layout, d.details);
    const blocks = {
      description: block('description', 'Description', 'Description', `<div class="agl-field__row"><textarea id="agl-description" rows="4" data-bind="description" aria-label="Description">${esc(d.description)}</textarea>${eye('show.description', d.show.description, 'Description')}</div>`, '', ''),
      conditions: sec('conditions', conditions, `${addText('conditions', 'Condition name')}`, passesConditions(d) ? 'No conditions yet. Those you add here apply to every place inside this Region.' : 'No conditions. Places inside a Region that passes its conditions down show them here.'),
      children: this.childrenHtml(d, all, block),
      resources: sec('resources', resources, this.nodePickHtml(nodes), 'Drop material Items here, or click Add node… for a Profession Ledger node template or a custom gathering node.'),
      factions: sec('factions', factions, addText('factions', 'Custom faction name'), 'Drop Actors or Journals here, or add a custom faction.'),
      quests: sec('quests', questRows, questAdd, 'No quests linked.'),
      related: sec('related', relatedRows, relatedAdd, 'No related locations.'),
      loot: sec('loot', lootRows, addText('loot', 'Plain reward (coins, clue, favour, key)'), 'Drag an Item here (world or compendium), or add a plain reward. A link never gives anyone the item.'),
      hazards: block('hazards', 'Hazards', 'Hazards', this.hazardsHtml(d), '<span class="agl-hint">GM only unless shown</span>'),
      rollTables: block('rollTables', 'Roll Tables', 'Roll Tables', this.rollTablesHtml(d), '<span class="agl-hint">GM only unless shown</span>'),
      notes: sec('notes', notes, btn('add-note', 'Add note', {kind: 'sm', icon: 'fa-solid fa-plus'}), 'Add a note, or drop an Actor, Item, Journal or Roll Table here.')
    };
    for (const det of d.details) blocks[DETAIL_PREFIX + det.key] = block(DETAIL_PREFIX + det.key,
      `<input type="text" class="agl-detail-title" data-bind="details.${esc(det.key)}.title" value="${esc(det.title)}" placeholder="Detail title" aria-label="Detail title">`, det.title || 'Detail',
      `<textarea rows="3" data-bind="details.${esc(det.key)}.text" placeholder="Text" aria-label="Detail text">${esc(det.text)}</textarea>
        ${det.uuid ? `<p>${docLink(`Linked ${det.docType || 'document'}`, det.uuid)}</p>` : '<p class="agl-hint">Drop an Actor, Item, Journal or Roll Table here to link it (optional).</p>'}`,
      `${eye(`details.${det.key}.visible`, det.visible, 'this block')}${btn('remove', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {section: 'details', key: det.key}, title: 'Remove this detail'})}`, `${DETAIL_PREFIX}${det.key}`);

    const pins = d.id ? api().pinsOf(d.id) : [];
    const crumbs = d.id ? breadcrumb(all, d.id) : d.parentLocationId ? [...breadcrumb(all, d.parentLocationId), ...all.filter(l => l.id === d.parentLocationId)] : [];
    const placeable = isPlaceable(d) || this.showRep || pins.length;
    // 0.19.0 (LOC-CR-01): the editor is split into sub-tabs under one footer (every panel is drawn; the others are hidden). Content is draft + Save Changes only;
    // Visibility & map holds the who/where/pin settings (Who Can See It applies at once and says so); Party Notes has its own Save.
    const subTab = EDITOR_TABS.some(t => t.id === this.editorTab) ? this.editorTab : 'content';
    const panels = {
      content: `<div class="ag-form-grid">
          ${fld('type', `<input id="agl-type" type="text" list="agl-types" data-bind="type" value="${esc(d.type)}" placeholder="e.g. Route, Town, Ruin">${this.typeListHtml(all)}`)}
          ${fld('region', `<input id="agl-region" type="text" data-bind="region" value="${esc(d.region)}" placeholder="e.g. Northern Marches">`)}
          ${fld('threat', `<select id="agl-threat" data-bind="threat">${THREATS.map(t => `<option value="${t.value}" ${d.threat === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>${threatBadge(d.threat)}`)}
          ${fld('img', `${d.img ? `<img class="agl-thumb" src="${esc(d.img)}" alt="">` : ''}<input id="agl-img" type="text" data-bind="img" value="${esc(d.img)}" placeholder="path/to/image.webp">${btn('browse-img', '', {icon: 'fa-solid fa-folder-open', title: 'Browse for an image'})}`)}
        </div>
        ${order.filter(k => k !== 'scenes').map(k => blocks[k] ?? '').join('')}
        <div class="agl-add agl-add-detail">${btn('add-detail', 'Add detail', {kind: 'sm', icon: 'fa-solid fa-plus', title: 'A custom block on this location: a title, text and an optional linked document'})}
          <span class="agl-hint">Drag the grip, or use the arrows (Alt+Up / Alt+Down on a grip), to reorder blocks and the entries in them. Players see published blocks in this order.</span></div>`,
      visibility: `${this.audienceHtml(d)}${this.placeHtml(d, all, pins)}${this.markerHtml(d)}${this.scenesHtml(d)}`,
      party: d.id ? this.partyNotesHtml(d.id, {gmHint: d.state === 'hidden' ? ' Players cannot see or edit them while this location is hidden.' : ''})
        : '<p class="agl-hint">Party Notes appear here once the location is saved. Players write them; Save Changes never changes them.</p>'
    };
    return `<form class="agl-editor" data-editor="location" autocomplete="off" onsubmit="return false">
      <div class="agl-editor__head">
        <nav class="agl-crumbs" aria-label="Where this is">${crumbs.length ? crumbs.map(c => `${go(c.name, 'select', {id: c.id})} <span aria-hidden="true">›</span> `).join('') : '<span class="agl-hint">Top level ›</span> '}
          <span>${esc(d.name || 'New location')}</span></nav>
        <div class="ag-btn-group">${d.id ? btn('show-players', 'Show to Players', {kind: 'sm', icon: 'fa-solid fa-bullseye', title: 'Opens this location in every other player\'s Locations window'}) : ''}${placeable ? btn('place', 'Place on Scene', {kind: 'sm', icon: 'fa-solid fa-map-pin', title: 'Adds a Map Note at the centre of your current view'}) : ''}${d.id ? `${btn('move-to', 'Move to…', {kind: 'sm', icon: 'fa-solid fa-folder-tree', title: 'Put this location inside a Region (or at the top level). Keyboard-friendly.'})}${btn('delete', 'Delete location', {kind: 'danger sm', icon: 'fa-solid fa-trash'})}` : ''}</div>
      </div>
      <div class="agl-title">
        <div class="ag-field agl-name"><label for="agl-name">Name</label><input id="agl-name" type="text" data-bind="name" value="${esc(d.name)}" placeholder="Location name"></div>
        ${stateBar}
      </div>
      <div class="agl-publish">
        <p class="agl-hint">${d.id ? esc(STATE_HINTS[d.state]) : 'New locations start hidden.'} Save Changes keeps edits private${d.state === 'hidden' ? '' : ' until you publish'}.</p>
        ${unpublished ? '<span class="ag-badge ag-badge--warn">Players see an older version</span>' : ''}
        ${d.id ? btn('preview', 'Player Preview', {kind: 'sm', icon: 'fa-solid fa-user', title: 'What players would see after Publish. Nothing is changed.'}) : ''}
        ${d.id && d.state !== 'hidden' ? btn('publish', 'Publish', {kind: 'sm', icon: 'fa-solid fa-bullhorn', title: 'Save, then show players the current content'}) : ''}
      </div>
      ${d.id ? `<div class="agl-id">${fold({key: 'details', title: 'Details', body: `<p class="agl-hint">Internal id <code>${esc(d.id)}</code>: made from the name when first saved; it never changes. Pins and player pages never carry it.</p>${btn('copy-id', 'Copy id', {kind: 'ghost sm', icon: 'fa-solid fa-copy', data: {value: d.id}})}`})}</div>` : ''}
      ${subTabs({group: 'agl-editor', label: 'Location editor sections', tabs: EDITOR_TABS, selected: subTab})}
      ${EDITOR_TABS.map(t => `<section class="agl-subpanel" ${tabPanelAttrs('agl-editor', t.id, {hidden: t.id !== subTab})}>${panels[t.id]}</section>`).join('')}
      <footer class="ag-footer agl-footer">
        ${btn('cancel', 'Cancel', {kind: 'ghost'})}
        <span class="ag-footer__status" role="status">${this.dirty ? 'Unsaved changes' : ''}</span>
        ${btn('save', this.dirty ? 'Save Changes •' : 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}
      </footer></form>`;
  }

  /** 0.20.0: suggested values for the free-text Type field: Route and the usual kinds, then the types already in use. */
  typeListHtml(all) {
    const types = [...new Set([...TYPE_SUGGESTIONS, ...all.map(l => l.type).filter(Boolean).sort((a, b) => a.localeCompare(b))])];
    return `<datalist id="agl-types">${types.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`;
  }
  /**
   * 0.20.0: Hazards on this location (a Route-type location is the usual home). A name, a note and an optional RollTable;
   * no chance and no automation: the GM rolls. GM only unless shown; players see a shown hazard's name and note after
   * Publish, never its table. Edits go into the draft (Save Changes).
   */
  hazardsHtml(d) {
    const rows = d.hazards.map(h => {
      const n = h.name || 'this hazard', table = h.tableUuid ? docName(h.tableUuid) : '';
      const tools = `${h.tableUuid ? `${btn('open-doc', 'Open table', {kind: 'sm', icon: 'fa-solid fa-table-list', data: {uuid: h.tableUuid}, title: `Open the roll table of ${n}`})}${btn('roll-table', 'Roll', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {uuid: h.tableUuid}, title: `Roll ${table || 'the table'} to chat`})}` : ''}
        ${eye(`hazards.${h.id}.shown`, h.shown, n)}${btn('edit-hazard', 'Edit…', {kind: 'ghost sm', icon: 'fa-solid fa-pen', data: {id: h.id}, title: `Edit ${n}`})}${btn('remove-hazard', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {id: h.id}, title: `Remove ${n}`})}`;
      return `<li class="${h.shown ? '' : 'agl-hidden'}"><span class="agl-entry"><strong>${esc(h.name || 'Hazard')}</strong>${h.note ? ` <small>${esc(h.note)}</small>` : ''}
        ${h.tableUuid ? `<small>Roll table: ${esc(table || 'not found')}</small>` : ''}</span><span class="agl-tools">${tools}</span></li>`;
    }).join('');
    return `${rows ? `<ul class="ag-list agl-entries">${rows}</ul>` : '<p class="agl-hint">No hazards. Add one, or drop a Roll Table here to make a hazard that uses it.</p>'}
      <div class="agl-add">${btn('add-hazard', 'Add hazard…', {kind: 'sm', icon: 'fa-solid fa-plus'})}</div>
      <p class="agl-hint">For your own rulings: nothing is rolled for you. Players see a hazard only if you show it, after Publish, while this place is revealed; never its roll table.</p>`;
  }
  /** 0.20.0: RollTables linked to this location. Open for everyone who may open the table; Roll (GM) draws it to chat. */
  rollTablesHtml(d) {
    const linked = new Set(d.rollTables.map(t => t.uuid));
    const rows = d.rollTables.map(t => {
      const n = t.name || docName(t.uuid) || 'this roll table';
      return `<li class="${t.shown ? '' : 'agl-hidden'}"><span class="agl-entry">${go(t.name || docName(t.uuid) || 'Roll table', 'open-doc', {uuid: t.uuid}, {icon: 'fa-solid fa-table-list'})}${docName(t.uuid) ? '' : ' <small>(not found)</small>'}</span>
        <span class="agl-tools">${btn('roll-table', 'Roll', {kind: 'sm', icon: 'fa-solid fa-dice-d20', data: {uuid: t.uuid}, title: `Roll ${n} to chat`})}${eye(`rollTables.${t.id}.shown`, t.shown, n)}${btn('remove-table', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {id: t.id}, title: `Remove ${n}`})}</span></li>`;
    }).join('');
    const opts = worldTables().filter(t => !linked.has(t.value)).map(t => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('');
    return `${rows ? `<ul class="ag-list agl-entries">${rows}</ul>` : '<p class="agl-hint">No roll tables linked. Choose one, or drop a Roll Table here (world or compendium).</p>'}
      <div class="agl-add"><select id="agl-add-table" aria-label="Roll table to link"><option value="">${opts ? 'Choose a roll table…' : 'No other roll tables in this world'}</option>${opts}</select>${btn('add-table', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}</div>
      <p class="agl-hint">Players see a shown table's name after Publish and can open it only if Foundry lets them. Only you can roll.</p>`;
  }
  /** Add hazard… / Edit…: name, note, optional roll table, shown. Changes the draft only. */
  async hazardDialog(h = null) {
    const cur = h?.tableUuid ?? '';
    const tables = worldTables();
    const options = [{value: '', label: 'None'}, ...(cur && !tables.some(t => t.value === cur) ? [{value: cur, label: `${docName(cur) || 'Linked table'} (current)`}] : []), ...tables];
    const r = await formDialog(h ? `Edit ${h.name || 'hazard'}` : 'Add hazard', [
      {name: 'name', label: 'Name', value: h?.name ?? '', hint: 'For example [TEST] Rockfall.'},
      {name: 'note', label: 'Note', type: 'textarea', value: h?.note ?? ''},
      {name: 'tableUuid', label: 'Roll table (optional)', type: 'select', value: cur, options, hint: 'Players never get this table. Drop a compendium table on Hazards to use one from a compendium.'},
      {name: 'shown', label: 'Show to players', type: 'checkbox', checked: h?.shown === true, hint: 'Off: GM only. On: players see the name and note after Publish, while this place is revealed.'}
    ], {ok: h ? 'Apply' : 'Add hazard'});
    if (!r) return;
    const next = {name: String(r.name ?? '').trim(), note: String(r.note ?? '').trim(), tableUuid: r.tableUuid ?? '', shown: Array.isArray(r.shown) && r.shown.length > 0};
    if (!next.name && !next.note && !next.tableUuid) return ui.notifications.warn('Give the hazard a name.');
    if (h) Object.assign(h, next); else this.draft.hazards.push({id: newKey(), ...next});
    this.dirty = true;
    return this.render();
  }
  /** 0.20.0 Developer Tools: preview the stored routes as new Route locations, then Convert (re-runnable). */
  async convertRoutesDialog() {
    const plan = await api().convertRoutes();
    const li = items => `<ul>${items.join('')}</ul>`;
    const names = new Map(api().listLocations().map(l => [l.id, l.name]));
    const parts = [];
    if (plan.convert.length) parts.push(`<p>These routes become new locations of type <em>Route</em>, Hidden, each inside its start location's parent (or inside the start location at the top level). The stored routes are not changed.</p>
      ${li(plan.convert.map(c => `<li><strong>${esc(c.name)}</strong> → inside ${esc(names.get(c.parentId) ?? 'the top level')}${c.notes.map(n => ` <small>${esc(n)}</small>`).join('')}</li>`))}`);
    if (plan.skipped.length) parts.push(`<p>Skipped (convert these by hand: New location, type Route):</p>${li(plan.skipped.map(s => `<li><strong>${esc(s.name)}</strong>: ${esc(s.reason)}</li>`))}`);
    if (plan.done.length) parts.push(`<p>Already converted:</p>${li(plan.done.map(d => `<li>${esc(d.name)} → ${esc(names.get(d.locationId) ?? 'a deleted location')}</li>`))}`);
    if (!plan.convert.length) return infoDialog('Convert routes to locations', parts.join('') || '<p>There are no stored routes.</p>');
    const choice = await choiceDialog('Convert routes to locations?', parts.join(''), [{action: 'apply', label: `Convert ${plan.convert.length} route${plan.convert.length === 1 ? '' : 's'}`, default: true}]);
    if (choice !== 'apply') return;
    const r = await api().convertRoutes({apply: true});
    ui.notifications.info(`Made ${r.convert.length} Route location(s). They start Hidden; reveal them when you are ready.`);
    return this.render();
  }

  /** Unidentified label/teaser and pin art. Pins use native Note image/size; edits to a placed Note win. */
  markerHtml(d) {
    const world = setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL);
    const path = (f, label, placeholder) => `<div class="ag-field agl-field"><label for="agl-pin-${f}">${label}</label><div class="agl-field__row">
      <input id="agl-pin-${f}" type="text" data-bind="pin.${f}" value="${esc(d.pin[f])}" placeholder="${esc(placeholder)}">${btn('browse-pin', '', {icon: 'fa-solid fa-folder-open', title: `Browse for the ${label.toLowerCase()}`, data: {field: f}})}</div></div>`;
    return `<section class="ag-card agl-section">
      <header class="ag-card__head"><h3>Unidentified Marker &amp; Pin</h3></header>
      <div class="ag-form-grid">
        <div class="ag-field agl-field"><label for="agl-unid">Unidentified label</label><input id="agl-unid" type="text" data-bind="unidentifiedLabel" value="${esc(d.unidentifiedLabel)}" placeholder="${esc(world)} (world default)"></div>
        <div class="ag-field agl-field"><label for="agl-pin-size">Pin size</label><input id="agl-pin-size" type="number" min="16" max="256" step="1" data-bind="pin.size" value="${d.pin.size || ''}" placeholder="${PIN_DEFAULTS.size}"></div>
      </div>
      <div class="ag-field agl-field"><label for="agl-teaser">Teaser (players see this while unidentified)</label><textarea id="agl-teaser" rows="2" data-bind="teaser" placeholder="Optional, e.g. Smoke rises beyond the ridge.">${esc(d.teaser)}</textarea></div>
      <div class="ag-form-grid">
        ${path('img', 'Pin image (revealed)', PIN_DEFAULTS.img)}
        ${path('unidentifiedImg', 'Pin image (hidden / unidentified)', setting('unknownPinImage', '') || PIN_DEFAULTS.unidentifiedImg)}
      </div>
      <p class="agl-hint">Players can read a pin's label and image path, never its name or ID. Don't name image files after secrets. Changing a placed pin's image or size in Foundry's Note settings keeps that pin as you set it.</p>
    </section>`;
  }

  /**
   * Who can see this location (1.8.0): Everyone, or Selected players. Applied at once for a saved location (like the
   * marker state); a new one keeps it in the draft until Save. Players the party added show who added them.
   */
  audienceHtml(d) {
    const a = d.audience;
    const players = worldPlayers();
    const ids = new Set(a.userIds);
    const radio = (mode, label) => `<label class="ag-field ag-field--inline agl-switch"><input type="radio" name="agl-audience" data-action-change="audience-mode" value="${mode}" ${a.mode === mode ? 'checked' : ''}> ${label}</label>`;
    const known = new Set(players.map(u => u.id));
    const gone = a.userIds.filter(u => !known.has(u));
    const list = a.mode !== 'selected' ? '' : players.length || gone.length ? `<ul class="ag-list agl-entries agl-audience">${[...players.map(u => u.id), ...gone].map(u => `<li>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-action-change="audience-user" value="${esc(u)}" ${ids.has(u) ? 'checked' : ''}> ${esc(userName(u))}</label>
        ${a.sharedBy[u] ? `<span class="ag-badge ag-badge--warn"${tip('Untick to undo')}>shared by ${esc(userName(a.sharedBy[u]))}</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="agl-hint">No player accounts in this world yet.</p>';
    return `<section class="ag-card agl-section">
      <header class="ag-card__head"><h3>Who Can See It</h3>${d.id ? NOW : '<span class="agl-hint">Saved with Save Changes</span>'}</header>
      <div class="ag-cluster agl-audience-mode" role="radiogroup" aria-label="Who can see this location">${radio('everyone', 'Everyone')}${radio('selected', 'Selected players')}</div>
      ${list}
      ${a.mode === 'selected' ? `<label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-action-change="audience-sharing" ${a.sharing ? 'checked' : ''}> Players who see it can share it with others</label>` : ''}
      <p class="agl-hint">${a.mode === 'selected' ? 'Only ticked players get this card, its pins and its Party Notes, and only while it is Unidentified or Revealed. Everyone else sees nothing, exactly as if it were Hidden.' : 'Every player sees it once it is Unidentified or Revealed.'}</p>
    </section>`;
  }

  /** Where this location sits (parent), whether it is a Region (a folder) and whether it goes on maps. Fixed at the top. */
  placeHtml(d, all, pins = []) {
    const byId = new Map(all.map(l => [l.id, l]));
    const parents = parentMap(all.filter(l => l.id !== d.id));
    const choices = all.filter(l => l.id !== d.id && !(d.id && wouldCycle(d.id, l.id, parents)));
    const missing = d.parentLocationId && !byId.has(d.parentLocationId) ? `<option value="${esc(d.parentLocationId)}" selected>Deleted location (deleted)</option>` : '';
    const parentSel = `<select id="agl-parent" data-bind="parentLocationId"><option value="">None (top level)</option>${missing}${choices.map(l =>
      `<option value="${esc(l.id)}" ${d.parentLocationId === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
    return `<section class="ag-card agl-section">
      <header class="ag-card__head"><h3>Place</h3><span class="agl-hint">GM only</span></header>
      <div class="ag-field agl-field"><label for="agl-parent">Inside</label>${parentSel}</div>
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="isRegion" ${d.isRegion ? 'checked' : ''}> This is a Region (a folder)</label>
      <p class="agl-hint">A Region is a container: in Tree view it is a folder other places can go in, to any depth. Any place can sit inside another; only Regions show as folders.</p>
      ${d.isRegion ? `<label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="passConditions" ${passesConditions(d) ? 'checked' : ''}> Pass conditions to places inside</label>
      <p class="agl-hint">Off by default. When on, this Region's <em>Conditions</em> apply to every place inside it, at any depth (players see them after Publish). Nothing else is inherited; a place can turn one off or change it for itself.</p>` : ''}
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="placeable" ${isPlaceable(d) ? 'checked' : ''}> Placeable on a map</label>
      <p class="agl-hint">${pins.length ? `Pinned on ${pins.map(p => `${esc(p.name)}${p.count > 1 ? ` (${p.count})` : ''}`).join(', ')}. ` : ''}Turn off for places that only group others (most Regions start off). They are left out of Place on Scene and dragging onto the map unless you tick <em>Show representative-only too</em>.</p>
    </section>`;
  }
  /** Places inside this one. Players see each only once revealed (unidentified ones by label). */
  childrenHtml(d, all, block) {
    const kids = d.id ? all.filter(l => l.parentLocationId === d.id) : [];
    const kidRows = kids.length ? `<ul class="ag-list agl-entries">${kids.map(k => `<li><span class="agl-entry">${go(k.name, 'select', {id: k.id})}</span>
      ${mark(STATE_ICONS[k.state], STATE_LABELS[k.state])}</li>`).join('')}</ul>` : '<p class="agl-hint">No places inside this one.</p>';
    return block('children', 'Places Inside', 'Places Inside', `${kidRows}${d.id ? `<div class="agl-add">${btn('new-child', 'New place inside', {kind: 'sm', icon: 'fa-solid fa-plus'})}</div>` : ''}
      <p class="agl-hint">Each place is shown to players on its own state; this list follows them.</p>`, '', '');
  }
  /** Linked scenes: GM only, never in any player view. 0.19.0: on the Visibility & map sub-tab, not a reorderable block. */
  scenesHtml(d) {
    const linked = new Set(d.sceneUuids);
    const sceneRows = d.sceneUuids.length ? `<ul class="ag-list agl-entries">${d.sceneUuids.map(u => `<li><span class="agl-entry">${esc(sceneName(u) ?? 'Linked scene (missing)')}</span>
      <span class="agl-tools">${btn('open-scene', 'Open scene', {kind: 'sm', icon: 'fa-solid fa-map', data: {uuid: u}, title: 'Views the scene for you only. Players are not moved.'})}${btn('remove-scene', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {uuid: u}, title: `Unlink ${sceneName(u) ?? 'this scene'}`})}</span></li>`).join('')}</ul>` : '';
    const sceneOpts = [...(game.scenes ?? [])].filter(sc => !linked.has(sc.uuid)).sort((a, b) => a.name.localeCompare(b.name))
      .map(sc => `<option value="${esc(sc.uuid)}">${esc(sc.name)}</option>`).join('');
    return `<section class="ag-card agl-section"><header class="ag-card__head"><h3>Linked Scenes</h3><span class="agl-hint">GM only</span></header>${sceneRows}
      <div class="agl-add"><select id="agl-add-scene" aria-label="Scene to link"><option value="">Choose a scene…</option>${sceneOpts}</select>${btn('add-scene', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}</div>
      <p class="agl-hint">Players never see this card. Open scene never switches players.</p></section>`;
  }

  /** A node's status for its summary row: Exhausted, Available or Unavailable, always as text. */
  nodeStatus(e, finite) {
    const status = e.exhausted ? '<span class="ag-badge">Exhausted</span>' : `<span class="ag-badge${e.available ? ' ag-badge--ok' : ''}">${e.available ? 'Available' : 'Unavailable'}</span>`;
    const act = e.exhausted ? btn('restore', 'Restore', {kind: 'sm', icon: 'fa-solid fa-rotate-left', data: {key: e.key}})
      : finite ? btn('exhaust', 'Mark exhausted', {kind: 'sm', data: {key: e.key}}) : '';
    return `${status}${act}`;
  }
  /**
   * 0.19.0 (LOC-CR-03): the "Edit node" fold under a node's summary row. Open for a node added in this window (and
   * remembered per user after that, kit bindFolds). Never a fold inside it: the Exotic list is a plain sub-section.
   */
  nodeFold(e, title, body) {
    return fold({key: `node:${e.key}`, title, open: this.openNodes?.has(e.key) ?? false, body});
  }
  /** One gathering node: a summary row (name, skill, tier, DC, status, tools) and the rest under "Edit node". */
  nodeHtml(e, entryTools, handle) {
    const b = f => `data-bind="resources.${esc(e.key)}.${f}"`;
    const num = (f, v, min, max, label) => `<label class="ag-field ag-field--inline agl-mini">${label}<input type="number" min="${min}" max="${max}" step="1" ${b(f)} value="${v}"></label>`;
    const body = `<div class="agl-node__row">
        <label class="ag-field ag-field--inline agl-mini">Common${matSelect(b('materialId'), e.materialId, 'None')}</label>${num('quantity', e.quantity, 1, 999, '×')}
        <label class="ag-field ag-field--inline agl-mini">Rare (by 5+)${matSelect(b('rareMaterialId'), e.rareMaterialId, 'None (optional)')}</label>${num('rareQuantity', e.rareQuantity, 1, 999, '×')}
      </div>
      <div class="agl-node__row">
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="resources.${esc(e.key)}.finite" ${e.finite ? 'checked' : ''}> Finite</label>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="resources.${esc(e.key)}.available" ${e.available ? 'checked' : ''}> Available</label>
        <input type="text" class="agl-node__note" ${b('note')} value="${esc(e.note)}" placeholder="Source and limit (note)" aria-label="Note">
      </div>${this.exoticHtml(e)}`;
    const exotics = normalizeExotics(e.exotics).length;
    return `<li class="agl-node${e.visible ? '' : ' agl-hidden'}${e.exhausted ? ' agl-exhausted' : ''}" data-entry="resources:${esc(e.key)}">
      <div class="agl-node__row">
        ${handle('resources', e)}
        <input type="text" class="agl-node__name" ${b('label')} value="${esc(e.label)}" placeholder="Node name" aria-label="Node name">
        ${e.uuid ? btn('open-doc', '', {kind: 'ghost sm', icon: 'fa-solid fa-up-right-from-square', data: {uuid: e.uuid}, title: 'Open linked item'}) : ''}
        <input type="text" list="agl-skills" class="agl-node__skill" ${b('skill')} value="${esc(e.skill)}" placeholder="Skill" aria-label="Gathering skill">
        <label class="ag-field ag-field--inline agl-mini">Tier<select ${b('tier')}>${[1, 2, 3, 4, 5].map(t => `<option value="${t}" ${e.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${num('dc', e.dc, 1, 40, 'DC')}${eye(`resources.${e.key}.dcVisible`, e.dcVisible, 'the DC')}
        ${this.nodeStatus(e, e.finite)}
        <span class="agl-tools">${entryTools('resources', e)}</span>
      </div>
      ${this.nodeFold(e, `Edit node: materials, availability${exotics ? `, ${exotics} Exotic` : ', Exotic'}`, body)}</li>`;
  }
  /**
   * 1.18.0: add a gathering entry. 0.19.0: one Add node… button asks From template or Custom (kit choiceDialog);
   * without the Ledger it adds a custom node straight away and says why templates are missing.
   */
  nodePickHtml(nodes) {
    return `<div class="agl-node-pick">${btn('add-node', 'Add node…', {kind: 'sm', icon: 'fa-solid fa-plus', title: nodes.ok ? 'From a Profession Ledger node template, or a custom node' : 'A custom gathering node'})}
      ${nodes.ok ? btn('open-ledger-nodes', 'Gathering Nodes', {kind: 'ghost sm', icon: 'fa-solid fa-up-right-from-square', title: 'Open the Profession Ledger on its Gathering Nodes tab'}) : ''}
      ${nodes.ok ? '' : `<p class="agl-hint agl-node-pick__note">${esc(nodes.message)}</p>`}</div>`;
  }
  /** Add node…: From template (a grouped list of the Ledger's templates) or Custom (a name). */
  async addNodeDialog() {
    const nodes = nodeTemplates();
    let kind = 'custom';
    if (nodes.ok && nodes.list.length) {
      kind = await choiceDialog('Add a gathering node', '<p>Use a Profession Ledger node template (it owns the materials and tier range), or make a custom node for this place only.</p>',
        [{action: 'template', label: 'From template…', icon: 'fa-solid fa-book', default: true}, {action: 'custom', label: 'Custom…', icon: 'fa-solid fa-pen'}]);
      if (!kind) return;
    }
    if (kind === 'template') {
      const label = t => `${activityLabel(t.activity) || 'No activity set'}: ${t.name} (tier ${tierRange(t)})`;
      const opts = [...nodes.list].sort((a, b) => label(a).localeCompare(label(b))).map(t => ({value: t.id, label: label(t)}));
      const r = await formDialog('Add node from template', [{name: 'template', label: 'Node template', type: 'select', value: opts[0]?.value ?? '', options: opts,
        hint: 'The Ledger owns its activity, tier range, check and materials; you set this place\'s name, tier, DC and availability.'}], {ok: 'Add node'});
      if (!r?.template) return;
      return this.addTemplateNode(r.template);
    }
    const r = await formDialog('Add a custom node', [{name: 'label', label: 'Node name', value: '', hint: 'For example Reed beds. Set its skill, tier, DC and materials after.'}], {ok: 'Add node'});
    const name = r?.label?.trim();
    if (!name) return;
    return this.addNode({label: name});
  }
  addTemplateNode(id) {
    const nodes = nodeTemplates(), t = nodes.ok ? nodes.list.find(n => n.id === id) : null;
    if (!t) throw new Error(nodes.ok ? `That node template no longer exists.` : nodes.message);
    return this.addNode({nodeId: t.id, tier: t.tier.min});
  }
  /**
   * 1.18.0: a gathering entry that refers to a Ledger node template. The template's name, activity, tier range and
   * materials are read only (the Ledger owns them); this place's label, tier, DC, finite, availability and note are editable.
   * A deleted template keeps the entry and its data, with a warning.
   */
  nodeRefHtml(e, nodes, entryTools, handle) {
    const b = f => `data-bind="resources.${esc(e.key)}.${f}"`;
    const t = nodes.ok ? nodes.list.find(n => n.id === e.nodeId) ?? null : null;
    const range = t ? Array.from({length: t.tier.max - t.tier.min + 1}, (_, i) => t.tier.min + i) : [1, 2, 3, 4, 5];
    const tier = e.tier != null && range.includes(e.tier) ? e.tier : range[0];
    const outside = t && e.tier != null && !range.includes(e.tier);
    const finite = e.finite ?? t?.finite ?? true;
    const tplDc = t?.dc ?? GATHERING.dcByTier[tier];
    const yesNo = (f, v, yes, no, tplValue) => `<select ${b(f)} aria-label="${esc(f === 'finite' ? 'Finite' : 'Players see the DC')}">
        <option value="" ${v == null ? 'selected' : ''}>Template${tplValue == null ? '' : ` (${tplValue ? yes : no})`}</option>
        <option value="true" ${v === true ? 'selected' : ''}>${yes}</option><option value="false" ${v === false ? 'selected' : ''}>${no}</option></select>`;
    const info = t ? `<span class="agl-node__tpl"><strong>${esc(t.name)}</strong> · ${esc(activityLabel(t.activity) || 'No activity set')} · Tier ${esc(tierRange(t))}
        <small>${esc(materialsSummary(t, materialNames()))}</small></span>`
      : nodes.ok ? `<span class="ag-badge ag-badge--warn">This node template no longer exists</span>
        <small>This place keeps its own data. Nothing can be gathered here until you add another node template and remove this entry.</small>`
      : `<span class="ag-badge">Node template</span><small>${esc(nodes.message)}</small>`;
    const body = `<div class="agl-node__row">${t ? info : ''}${t || nodes.reason !== 'absent' ? btn('open-ledger-nodes', 'Open in Ledger', {kind: 'ghost sm', icon: 'fa-solid fa-up-right-from-square', title: 'Open the Profession Ledger on its Gathering Nodes tab'}) : ''}</div>
      <div class="agl-node__row">
        <label class="ag-field ag-field--inline agl-mini">Players see DC${yesNo('dcVisible', e.dcVisible, 'Shown', 'Hidden', t?.dcVisible)}</label>
        <label class="ag-field ag-field--inline agl-mini">Finite${yesNo('finite', e.finite, 'Finite', 'Not finite', t?.finite)}</label>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="resources.${esc(e.key)}.available" ${e.available ? 'checked' : ''}> Available</label>
        <input type="text" class="agl-node__note" ${b('note')} value="${esc(e.note)}" placeholder="Note for this place" aria-label="Note">
      </div>`;
    return `<li class="agl-node agl-node--ref${e.visible ? '' : ' agl-hidden'}${e.exhausted ? ' agl-exhausted' : ''}" data-entry="resources:${esc(e.key)}">
      <div class="agl-node__row">
        ${handle('resources', e)}
        <input type="text" class="agl-node__name" ${b('label')} value="${esc(e.label)}" placeholder="${esc(t?.name ?? 'Name at this place')}" aria-label="Name at this place">
        <label class="ag-field ag-field--inline agl-mini">Tier<select ${b('tier')}>${range.map(n => `<option value="${n}" ${tier === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="ag-field ag-field--inline agl-mini">DC<input type="number" min="1" max="40" step="1" ${b('dc')} value="${e.dc ?? ''}" placeholder="${esc(tplDc)}"></label>
        ${this.nodeStatus(e, finite)}
        <span class="agl-tools">${entryTools('resources', e)}</span>
      </div>
      ${outside ? `<p class="agl-node__row"><span class="ag-badge ag-badge--warn">Tier ${e.tier} is outside the template's range: tier ${tier} is used</span></p>` : ''}
      ${!t ? `<div class="agl-node__row">${info}</div>` : ''}
      ${this.nodeFold(e, 'Edit node: template, DC visibility, availability', body)}</li>`;
  }
  /** Optional Exotic candidates for a node (GM only, never published). Picked by name from the imported catalog. */
  exoticHtml(e) {
    const names = materialNames(), list = normalizeExotics(e.exotics), chosen = new Set(list.map(x => x.materialId));
    let checks = [];
    try { checks = exoticApi()?.eligibility?.({skill: e.skill, tier: e.tier, exotics: list}) ?? []; } catch { checks = []; }
    const why = id => checks.find(c => c.materialId === id);
    const f = (x, field) => `data-exotic="${esc(e.key)}|${esc(x.materialId)}|${field}"`;
    const rows = list.map(x => {
      const c = why(x.materialId);
      const name = names.get(x.materialId) ?? 'Unknown material';
      return `<li class="agl-exotic">
        <span class="agl-entry">${esc(name)}${names.has(x.materialId) ? '' : ' <small>(not in this world)</small>'}</span>
        ${c ? `<span class="ag-badge${c.eligible ? ' ag-badge--ok' : ' ag-badge--warn'}">${esc(c.eligible ? 'Eligible' : c.reason)}</span>` : ''}
        <label class="ag-field ag-field--inline agl-mini">Rule<select ${f(x, 'mode')}>${EXOTIC_MODES.map(m => `<option value="${m}" ${x.mode === m ? 'selected' : ''}>${m === 'designated' ? 'Designated source' : 'Random discovery'}</option>`).join('')}</select></label>
        ${x.mode === 'designated' ? `<label class="ag-field ag-field--inline agl-mini">Chance %<input type="number" min="1" max="100" step="1" ${f(x, 'chance')} value="${x.chance ?? ''}" placeholder="required"></label>
        <label class="ag-field ag-field--inline agl-mini">When<select ${f(x, 'condition')}>${Object.entries(EXOTIC_CONDITIONS).map(([k, l]) => `<option value="${k}" ${x.condition === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
        ${btn('exotic-remove', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {key: e.key, mat: x.materialId}, title: `Remove ${name}`})}</li>`;
    }).join('');
    const {filtered, list: choices} = exoticChoices(e);
    // Draft or GM-only Exotics are listed but disabled, with what to fix in General Manager.
    const opts = choices.filter(m => !chosen.has(m.id)).map(m => `<option value="${esc(m.id)}"${m.available === false ? ' disabled' : ''}>${esc(m.name)}${m.tier ? ` (tier ${m.tier})` : ''}${m.available === false ? ` — ${esc(m.reason)}` : ''}</option>`).join('');
    // 0.19.0: a plain sub-section of the node's "Edit node" fold (never a fold inside a fold).
    return `<div class="agl-node__exotics"><h5>Exotic materials (optional, GM only)${list.length ? ` · ${list.length}` : ''}</h5>
      ${rows ? `<ul class="ag-list">${rows}</ul>` : ''}
      <div class="agl-add"><select id="agl-exo-${esc(e.key)}" aria-label="Exotic material"><option value="">${opts ? 'Choose an Exotic material…' : 'No Exotic materials to add'}</option>${opts}</select>${btn('exotic-add', 'Add', {kind: 'sm', icon: 'fa-solid fa-plus', data: {key: e.key}})}</div>
      <p class="agl-hint">${filtered ? 'Listed: imported Exotics gathered by this node’s profession, tier not above the node’s.' : 'Profession Ledger is not active, so this lists every imported Exotic; the Ledger checks eligibility when gathering.'}
        Adding one makes it eligible, not a sure award. Random discovery uses the Ledger’s discovery chance on a success; a designated source needs a chance and uses it instead. Players never see this list.</p></div>`;
  }

  /**
   * GM Setup: settings only, all saved together by Save Changes (Player Access too, decision D4). Cancel puts the fields
   * back to the saved values. Import/Export live on the Locations toolbar; the [TEST] seeder is in Developer Tools.
   */
  setupHtml() {
    const access = api().playerAccess.getState().playerAccessEnabled;
    const {look, nameMode, nameSize, wrap} = readPinLook();
    return `<div class="agl-setup">
      <div class="agl-setup__body">
      <section class="ag-card"><h3>Player Access</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-set-access" ${access ? 'checked' : ''}> Players can open Locations</label>
        <p class="agl-hint">Shows the Locations button in the players' Actors sidebar. Players only ever see revealed locations and the parts you mark visible.</p></section>
      <section class="ag-card"><h3>Unidentified Pins</h3>
        <div class="ag-field agl-field"><label for="agl-set-label">Default unidentified label</label><input id="agl-set-label" type="text" value="${esc(setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL))}"></div>
        <div class="ag-field agl-field"><label for="agl-set-unknown">Default unidentified pin image</label><div class="agl-field__row"><input id="agl-set-unknown" type="text" value="${esc(setting('unknownPinImage', ''))}" placeholder="${PIN_DEFAULTS.unidentifiedImg}">${btn('browse-setup', '', {icon: 'fa-solid fa-folder-open', title: 'Browse for the default pin image'})}</div></div>
        <p class="agl-hint">Used when a location has no label or image of its own. Saving re-labels existing unidentified pins.</p></section>
      <section class="ag-card"><h3>Map Pins</h3>
        <div class="ag-field agl-field"><label for="agl-set-pinlook">Pin look</label><select id="agl-set-pinlook">${Object.entries(PIN_LOOKS).map(([v, t]) => `<option value="${v}"${look === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="ag-field agl-field"><label for="agl-set-pinname">Name under the pin</label><select id="agl-set-pinname">${Object.entries(NAME_MODES).map(([v, t]) => `<option value="${v}"${nameMode === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="ag-field agl-field"><label for="agl-set-pinsize">Name size (pixels)</label><input id="agl-set-pinsize" type="number" min="${NAME_SIZE.min}" max="${NAME_SIZE.max}" step="1" value="${nameSize}"></div>
        <div class="ag-field agl-field"><label for="agl-set-pinwrap">Wrap the name after (characters)</label><input id="agl-set-pinwrap" type="number" min="0" max="${WRAP.max}" step="1" value="${wrap}"></div>
        <p class="agl-hint">Wrap: the most characters on one line of the name; longer names break between words (a very long word is cut). ${WRAP.min} to ${WRAP.max}, or 0 for no wrapping. Only the label on the map changes, never the location's name.</p>
        <p class="agl-hint">Applies to every player's screen and only to pins placed from Locations. A pin whose Font Size you changed in its own Note settings keeps that size. <em>Image only</em> hides the square and the shaded backing (the frame shows while you hover or select a pin). <em>Name under the pin</em> is either always visible or only when you hover the pin (Foundry\'s own behaviour); the name size and wrapping apply in both; hidden pins show none, and unidentified pins show only their unidentified label. Nothing on the map is changed, so you can switch back at any time.</p></section>
      <section class="ag-card"><h3>Show to Players</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-set-showopen" ${showOpens() ? 'checked' : ''}> Players' windows open automatically when the GM shows a location</label>
        <p class="agl-hint">Off: players only get a notification ("The GM is showing …") and open it themselves. Players with unsaved Party Notes are never interrupted; they get the notification.</p></section>
      <details class="ag-devtools"><summary>Developer Tools</summary>
        <p class="agl-hint">Runs at once; not part of Save Changes. Adds four synthetic <code>[TEST]</code> locations. Existing locations are not changed.</p>
        ${btn('import-sample', 'Import [TEST] sample locations', {kind: 'sm', icon: 'fa-solid fa-flask'})}
        ${this.convertPlan?.total ? `<p class="agl-hint">Routes are retired. This world still holds ${this.convertPlan.total} stored route(s)${this.convertPlan.done.length ? `, ${this.convertPlan.done.length} already converted` : ''}. Convert makes a new location of type Route for each (you see a preview first); the stored routes stay as they are. Safe to run again.</p>
        ${btn('convert-routes', 'Convert routes to locations…', {kind: 'sm', icon: 'fa-solid fa-route'})}` : ''}</details>
      </div>
      <footer class="ag-footer">${btn('setup-cancel', 'Cancel', {kind: 'ghost'})}<span class="ag-footer__status" role="status">The settings above change only when you click Save Changes.</span>
        ${btn('save-setup', 'Save Changes', {kind: 'primary', icon: 'fa-solid fa-floppy-disk'})}</footer>
    </div>`;
  }
  /** GM Setup's Save Changes: saves Player Access, the pin defaults and the Map Pins look. */
  async saveSetup(root = this.element) {
    const access = root?.querySelector('#agl-set-access')?.checked === true;
    if (access !== api().playerAccess.getState().playerAccessEnabled) await api().playerAccess.setEnabled(access);
    await game.settings.set(MODULE_ID, 'unidentifiedLabel', root?.querySelector('#agl-set-label')?.value.trim() || DEFAULT_UNIDENTIFIED_LABEL);
    await game.settings.set(MODULE_ID, 'unknownPinImage', root?.querySelector('#agl-set-unknown')?.value.trim() ?? '');
    const pinLook = root?.querySelector('#agl-set-pinlook')?.value;
    if (pinLook && pinLookOf(pinLook) !== readPinLook().look) await game.settings.set(MODULE_ID, 'pinLook', pinLookOf(pinLook));
    const pinName = nameModeOf(root?.querySelector('#agl-set-pinname')?.value);
    const sizeRaw = root?.querySelector('#agl-set-pinsize')?.value;
    if (sizeRaw !== undefined && sizeRaw !== '' && nameSizeOf(sizeRaw) !== readPinLook().nameSize) await game.settings.set(MODULE_ID, 'pinNameSize', nameSizeOf(sizeRaw));
    const wrapRaw = root?.querySelector('#agl-set-pinwrap')?.value;
    if (wrapRaw !== undefined && wrapRaw !== '' && wrapOf(wrapRaw) !== readPinLook().wrap) await game.settings.set(MODULE_ID, 'pinNameWrap', wrapOf(wrapRaw));
    if (pinName !== readPinLook().nameMode) await game.settings.set(MODULE_ID, 'pinNameMode', pinName);
    const showOpen = root?.querySelector('#agl-set-showopen')?.checked === true;
    if (root?.querySelector('#agl-set-showopen') && showOpen !== showOpens()) await game.settings.set(MODULE_ID, 'showOpensWindow', showOpen);
    ui.notifications.info('Saved GM Setup.');
    await this.render();
    return true;
  }

  // ---------- events ----------
  bind(root) {
    const main = root.querySelector('.agl-maintabs');
    for (const b of main?.querySelectorAll('[data-tab]') ?? []) b.addEventListener('click', async () => {
      if (b.dataset.tab === this.tab) return;
      if (!(await this.confirmDiscard())) return;
      this.tab = b.dataset.tab; if (this.draft) this.select(this.selectedId);
      await this.render(); this.focusBack(`.agl-maintabs [data-tab="${b.dataset.tab}"]`);
    });
    // 0.19.0: kit keyboard pattern for the tab rows (one Tab stop, Left/Right, Home/End) and the remembered folds.
    bindTablist(root.querySelector('.agl-root') ?? root);
    bindFolds(root, uiMem());
    bindSplitNav(root, {create: '[data-action="new"]'}); // stacked: scroll to the editor, Back to list
    // Editor sub-tabs: nothing is lost on a switch (the draft stays in memory), so no discard question.
    for (const b of root.querySelectorAll('.ag-tabs--sub[aria-label="Location editor sections"] [data-tab]')) b.addEventListener('click', async () => {
      this.editorTab = uiMem().set('editorTab', b.dataset.tab);
      await this.render(); this.focusBack(`.ag-tabs--sub [data-tab="${b.dataset.tab}"]`);
    });
    // 0.19.0 (LOC-A11Y-06): typing in the search box re-renders once the typing pauses, not on every key.
    root.querySelector('#agl-search')?.addEventListener('input', e => {
      this.query = e.target.value;
      this.searchSoon('#agl-search');
    });
    root.querySelector('#agl-filters-toggle')?.addEventListener('click', async () => {
      this.filtersOpen = uiMem().set('filtersOpen', !this.filtersOpen);
      await this.render(); this.focusBack('#agl-filters-toggle');
    });
    bindFileButtons(root, ([file]) => this.importFile(file).catch(notifyError));
    root.querySelector('#agl-groupby')?.addEventListener('change', e => { this.groupBy = e.target.value; this.render(); });
    root.querySelector('#agl-sort')?.addEventListener('change', e => { this.sort = e.target.value; this.render(); });
    root.querySelector('#agl-sortdir')?.addEventListener('click', () => { this.sortDesc = !this.sortDesc; this.render(); });
    root.querySelector('#agl-tree')?.addEventListener('click', async () => { this.treeMode = !this.treeMode; await this.render(); this.focusBack('#agl-tree'); });
    root.querySelector('#agl-showrep')?.addEventListener('change', e => { this.showRep = e.target.checked; this.render(); });
    for (const el of root.querySelectorAll('[data-filter]')) el.addEventListener('change', () => { this.filters[el.dataset.filter] = el.value; this.render(); });
    for (const el of root.querySelectorAll('[data-action]')) el.addEventListener('click', ev => { ev.preventDefault(); this.onAction(el).catch(notifyError); });
    root.querySelector('#agl-party-text')?.addEventListener('input', e => { if (this.notesEdit) { this.notesEdit.text = e.target.value; this.renewNotesLock(); } });
    if (!this.gm) return;
    for (const el of root.querySelectorAll('[data-bind]')) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      this.setPath(el.dataset.bind, el.value);
      if (['threat', 'img', 'parentLocationId'].includes(el.dataset.bind) || /\.(?:tier|finite|dcVisible)$/.test(el.dataset.bind)) this.render();
    });
    for (const el of root.querySelectorAll('[data-toggle]')) el.addEventListener('change', () => { this.setPath(el.dataset.toggle, el.checked); this.render(); });
    // Exotic candidate fields: "<node key>|<MAT id>|mode|chance|condition".
    for (const el of root.querySelectorAll('[data-exotic]')) el.addEventListener('change', () => { this.setExotic(...el.dataset.exotic.split('|'), el.value); this.render(); });
    // Inherited-condition overrides: "<Region id>|<condition key>|label|text".
    for (const el of root.querySelectorAll('[data-ov]')) el.addEventListener('input', () => {
      const [from, ckey, field] = el.dataset.ov.split('|');
      this.override(from, ckey)[field] = el.value; this.touch();
    });
    this.bindReorder(root);
    for (const el of root.querySelectorAll('[data-action-change^="audience-"]')) el.addEventListener('change', () => this.onAudience(el).catch(notifyError));
    // AshenGateLocation places a pin when dropped on the canvas; AshenGateLocationMove (representative-only) only moves it into a folder.
    for (const row of root.querySelectorAll('.agl-row[draggable]')) row.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({type: row.dataset.dragType || 'AshenGateLocation', id: row.dataset.id}));
    });
    for (const zone of root.querySelectorAll('[data-folder]')) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('agl-dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('agl-dragover'));
      zone.addEventListener('drop', e => {
        const data = dragData(e);
        zone.classList.remove('agl-dragover');
        if (!MOVE_TYPES.has(data?.type) || !data.id) return;
        e.preventDefault(); e.stopPropagation();
        this.move(data.id, zone.dataset.folder).catch(notifyError);
      });
    }
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
  /** Marks the draft unsaved without a re-render (the guard writes "Unsaved changes" in the footer status). */
  touch() {
    this.dirty = true;
    const save = this.element?.querySelector?.('[data-action="save"] span');
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
      const e = this.draft[a].find(x => (x.key ?? x.id) === b);   // hazards and rollTables (0.20.0) use `id`
      if (e && a === 'resources' && isNodeRef(e) && REF_OPTIONAL.has(c)) value = refValue(c, value);
      else if (e && NUMERIC.has(c)) value = Number(value);
      // Changing the tier moves the DC with it, unless the GM had set a custom DC.
      if (e && c === 'tier' && isTierDefaultDc(e.dc, e.tier)) e.dc = GATHERING.dcByTier[value] ?? e.dc;
      if (e && c === 'finite' && value === false) e.exhausted = false;
      if (e) e[c] = value;
    }
    else if (b) this.draft[a][b] = path === 'pin.size' ? Number(value) || 0 : value;
    else this.draft[a] = value;
    this.touch();
  }
  /** Exotic candidates live on the node; edits go through the model's normalizer (additive field). */
  setExotic(nodeKey, materialId, field, value) {
    const node = this.draft.resources.find(n => n.key === nodeKey);
    if (!node || !['mode', 'chance', 'condition'].includes(field)) return;
    node.exotics = normalizeExotics((node.exotics ?? []).map(x => x.materialId === materialId ? {...x, [field]: value} : x));
    this.touch();
  }
  addNode(data) {
    const node = newNode(data);
    this.draft.resources.push(node);
    (this.openNodes ??= new Set()).add(node.key);   // a new node opens its "Edit node" fold
    this.dirty = true;
    return this.render();
  }
  addEntry(section, data) {
    this.draft[section].push({key: newKey(), visible: true, ...data});
    this.dirty = true;
    return this.render();
  }
  async onDrop(section, data) {
    // Nothing readable, or one of Locations' own drags (a row, a folder move, a reorder handle): not a document drop.
    if (!data?.type && !data?.uuid) return;
    if (OWN_TYPES.has(data.type)) return;
    if (section === 'resources' || section === 'loot') {
      const {ok, items, reason} = await resolveItemDrop(data);
      if (!ok) return ui.notifications.warn(reason);
      const doc = items[0];
      if (section === 'resources') {
        const materialId = materialIdOf(doc);
        if (!materialId) ui.notifications.info(`${doc.name} is not a gathering material; added as a linked item.`);
        return this.addNode({label: doc.name, materialId, uuid: doc.uuid});
      }
      // A link only. Nothing is created, copied or given to any Actor; players see just the title, text and image the GM approves here.
      return this.addEntry('loot', {label: doc.name, text: '', img: doc.img ?? '', uuid: doc.uuid, itemId: itemIdOf(doc), docType: 'Item', status: 'available'});
    }
    if (!data.uuid) return ui.notifications.warn(MISSING_DOC);
    let doc = null;
    try { doc = await fromUuid(data.uuid); } catch { doc = null; }
    if (!doc) return ui.notifications.warn(MISSING_DOC);
    const type = doc.documentName;
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
    if (section === 'hazards' || section === 'rollTables') {
      if (type !== 'RollTable') return ui.notifications.warn('Drop a Roll Table here.');
      if (section === 'hazards') this.draft.hazards.push({id: newKey(), name: doc.name, note: '', tableUuid: doc.uuid, shown: false});
      else if (!this.draft.rollTables.some(t => t.uuid === doc.uuid)) this.draft.rollTables.push({id: newKey(), name: doc.name, uuid: doc.uuid, shown: false});
      this.dirty = true; return this.render();
    }
    if (section === 'notes' || NOTE_DOC_TYPES.includes(type)) {
      if (!NOTE_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor, Item, Journal or Roll Table here.');
      return this.addEntry('notes', {title: doc.name, text: '', uuid: doc.uuid, docType: type});
    }
  }

  async onAction(el) {
    const action = el.dataset.action;
    if (action === 'help') return this.help();
    if (action === 'retry') return this.render();
    if (action === 'clear-filters') return this.clearFilters();
    if (action === 'toggle-group') return this.toggleGroup(el.dataset.group);
    if (action === 'tree-toggle') { const open = LocationsApp.treeOpen; if (!open.delete(el.dataset.id)) open.add(el.dataset.id); return this.render(); }
    if (action === 'tree-all') {
      if (el.dataset.open === '1') for (const l of this.list()) { const p = this.gm ? l.parentLocationId : l.parent?.key; if (p) LocationsApp.treeOpen.add(p); }
      else LocationsApp.treeOpen.clear();
      return this.render();
    }
    if (action === 'share') return this.share(el.dataset.ref);
    if (action === 'select') {
      if (el.dataset.id === this.selectedId || !(await this.confirmDiscard())) return;
      this.select(el.dataset.id); return this.render();
    }
    if (action === 'open-doc') return openDocument(el.dataset.uuid);
    if (action === 'open-quest') return openQuest(el.dataset.id);
    if (action.startsWith('notes-')) return this.onNotesAction(action, el);
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
        if (!(await this.saveFirst(`make it ${STATE_LABELS[state].toLowerCase()}`))) return;
        if (state === 'revealed') {
          const ok = await confirmDialog(`Reveal ${this.draft.name}? Players will see its name and everything marked visible, and its pins show the name.`,
            {title: 'Reveal location?', yes: 'Reveal location'});
          if (!ok) return;
        }
        // 0.19.0 (LOC-CMP-07): Hidden → Unidentified shows players its label, teaser and pin, so it asks too.
        if (state === 'unidentified' && this.draft.id && this.draft.state === 'hidden') {
          const ok = await confirmDialog(`Make ${this.draft.name} unidentified? Players will see its unidentified label and teaser, and its pins appear for them.`,
            {title: 'Make location unidentified?', yes: 'Make unidentified'});
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
      case 'show-players': return this.showToPlayers();
      case 'new-child': {
        const parent = el.dataset.parent || this.draft?.id;
        if (!parent || !(await this.confirmDiscard())) return;
        this.tab = 'locations'; LocationsApp.treeOpen.add(parent);
        this.selectedId = null;
        this.draft = {...normalizeLocation({parentLocationId: parent}), name: ''}; this.dirty = true;
        await this.render();
        this.element.querySelector('#agl-name')?.focus();
        return;
      }
      case 'move-to': return this.moveTo();
      case 'undo-move': {
        const m = this.lastMove;
        if (!m) return;
        this.lastMove = null;
        return this.move(m.id, m.from, {undo: true});
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
      case 'save-setup': return this.saveSetup(root);
      case 'setup-cancel': return this.render();
      case 'cancel': this.select(this.draft?.id || null); return this.render();
      case 'delete': {
        if (!this.draft.id) { this.select(null); return this.render(); }
        const ok = await confirmDanger(`Links to ${this.draft.name} from other locations stop working, and its Map Notes stop opening it.`,
          {title: `Delete ${this.draft.name}?`, yes: 'Delete location'});
        if (!ok) return;
        await api().deleteLocation(this.draft.id);
        this.select(null); return this.render();
      }
      case 'place': {
        if (!(await this.saveFirst('place it on the scene', this.dirty || !this.draft.id))) return;
        const id = this.dirty ? (await this.saveDraft())?.id : this.draft.id;
        if (!id) return;
        const {x, y} = canvas?.stage?.pivot ?? {};
        this.select(id);
        await api().placeOnScene(id, {scene: canvas?.scene, x: x ?? 0, y: y ?? 0});
        ui.notifications.info(`Placed ${this.draft.name} on ${canvas.scene.name}.`);
        return this.render();
      }
      case 'exotic-add': case 'exotic-remove': {
        const node = this.draft.resources.find(n => n.key === el.dataset.key);
        if (!node) return;
        const id = action === 'exotic-add' ? this.element?.querySelector(`#agl-exo-${el.dataset.key}`)?.value : el.dataset.mat;
        if (!id) return;
        if (action === 'exotic-add') { const why = exoticChoices(node).list.find(m => m.id === id)?.reason; if (why) throw new Error(why); }
        const rest = (node.exotics ?? []).filter(x => x.materialId !== id);
        node.exotics = normalizeExotics(action === 'exotic-add' ? [...rest, {materialId: id, mode: 'discovery'}] : rest);
        this.dirty = true; return this.render();
      }
      case 'remove': this.draft[el.dataset.section] = this.draft[el.dataset.section].filter(e => e.key !== el.dataset.key); this.dirty = true; return this.render();
      case 'add-text': {
        const section = el.dataset.section, value = root.querySelector(`#agl-add-${section}`)?.value.trim();
        if (!value) return;
        return section === 'resources' ? this.addNode({label: value}) : this.addEntry(section, {label: value, uuid: '', docType: '', note: '', ...(section === 'loot' ? {status: 'available'} : {})});
      }
      case 'add-node': return this.addNodeDialog();
      case 'copy-id': { const v = el.dataset.value; try { await (game.clipboard?.copyPlainText?.(v) ?? navigator.clipboard.writeText(v)); ui.notifications.info('Copied the id.'); } catch { ui.notifications.warn('Could not copy.'); } return; }
      case 'open-ledger-nodes': if (!openNodesTab()) ui.notifications.warn('Profession Ledger is not active.'); return;
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
      case 'add-hazard': return this.hazardDialog();
      case 'edit-hazard': { const h = this.draft.hazards.find(x => x.id === el.dataset.id); return h && this.hazardDialog(h); }
      case 'remove-hazard': case 'remove-table': {
        const list = action === 'remove-hazard' ? 'hazards' : 'rollTables', e = this.draft[list].find(x => x.id === el.dataset.id);
        if (!e) return;
        const what = action === 'remove-hazard' ? 'hazard' : 'roll table', name = e.name || docName(e.uuid) || `this ${what}`;
        const ok = await confirmDanger(`It leaves ${this.draft.name || 'this location'} when you click Save Changes.${action === 'remove-table' ? ' The roll table itself is not deleted.' : ''}`,
          {title: `Remove ${name}?`, yes: `Remove ${what}`});
        if (!ok) return;
        this.draft[list] = this.draft[list].filter(x => x.id !== e.id); this.dirty = true; return this.render();
      }
      case 'add-table': {
        const uuid = root.querySelector('#agl-add-table')?.value;
        if (!uuid || this.draft.rollTables.some(t => t.uuid === uuid)) return;
        this.draft.rollTables.push({id: newKey(), name: docName(uuid), uuid, shown: false}); this.dirty = true; return this.render();
      }
      case 'roll-table': return api().rollTable(el.dataset.uuid);
      case 'convert-routes': return this.convertRoutesDialog();
      case 'browse-img': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        return new FP({type: 'image', current: this.draft.img, callback: path => { this.setPath('img', path); this.render(); }}).render(true);
      }
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
  /** Party Notes: Edit / Take Over, Save, Cancel, Clear. A refused save keeps the editor and its text. */
  async onNotesAction(action, el) {
    const ref = el.dataset.ref;
    if (action === 'notes-edit') {
      const takeover = el.dataset.takeover === '1';
      if (takeover) {
        const ok = await confirmDialog('Edit these Party Notes now? Whoever is editing keeps their text on screen, but their Save will be refused.',
          {title: 'Take over Party Notes?', yes: 'Take over'});
        if (!ok) return;
      }
      const n = await api().editPartyNotes(ref, {takeover});
      this.notesEdit = {ref, text: n.text, rev: n.rev, renewed: Date.now()};
      await this.render();
      this.element?.querySelector('#agl-party-text')?.focus();
      return;
    }
    if (action === 'notes-save') {
      if (this.notesEdit?.ref !== ref) return;
      await api().savePartyNotes(ref, this.notesEdit.text, this.notesEdit.rev);
      this.notesEdit = null;
      ui.notifications.info('Saved Party Notes.');
      return this.render();
    }
    if (action === 'notes-cancel') { this.stopNotesEdit(); return this.render(); }
    if (action === 'notes-clear') {
      const ok = await confirmDanger('Empty these Party Notes for everyone? This cannot be undone.',
        {title: 'Clear Party Notes?', yes: 'Clear Party Notes'});
      if (!ok) return;
      await api().clearPartyNotes(ref);
      if (this.notesEdit?.ref === ref) this.notesEdit = null;
      return this.render();
    }
  }
  focusBack(selector) { this.element?.querySelector?.(selector)?.focus(); }
  /** Re-renders once typing in a search box pauses (SEARCH_DELAY), keeping focus and the caret in the box. */
  searchSoon(selector) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      if (!this.rendered) return;
      const box = this.element?.querySelector?.(selector), had = !!box && box === globalThis.document?.activeElement;
      const pos = had ? box.selectionStart : null;
      this.render().then(() => { if (!had) return; const s = this.element?.querySelector?.(selector); s?.focus(); s?.setSelectionRange?.(pos, pos); }).catch(notifyError);
    }, SEARCH_DELAY);
  }

  /** Moves a location inside a folder (or to the top level), at once, with Undo. Unsaved edits to it are kept. */
  async move(id, to, {undo = false} = {}) {
    if (!id || id === to) return;
    const r = await api().moveLocation(id, to || '');
    if (r.from === r.to) return;
    if (this.draft?.id === id) { if (this.dirty) this.draft.parentLocationId = r.to; else this.select(id); }
    const names = new Map(api().listLocations().map(l => [l.id, l.name]));
    if (r.to) LocationsApp.treeOpen.add(r.to);
    clearTimeout(this.undoTimer);
    this.lastMove = undo ? null : {...r, name: names.get(id) ?? 'The place', toName: names.get(r.to) ?? 'the new place'};
    if (this.lastMove) this.undoTimer = setTimeout(() => { this.lastMove = null; if (this.rendered) this.render().catch(notifyError); }, 20000);
    if (undo) ui.notifications.info(`Moved ${names.get(id) ?? 'the place'} back.`);
    return this.render();
  }
  /** Keyboard path for moving: pick a Region (or top level) from a list. */
  async moveTo() {
    const d = this.draft;
    if (!d?.id) return;
    const all = api().listLocations();
    const targets = moveTargets(all, d.id).sort((a, b) => a.name.localeCompare(b.name));
    const path = l => [...breadcrumb(all, l.id), l].map(x => x.name).join(' › ');
    const r = await formDialog('Move to…', [{name: 'target', label: `Move ${d.name} into`, type: 'select', value: d.parentLocationId || '',
      options: [{value: '', label: 'Top level'}, ...targets.map(l => ({value: l.id, label: path(l)}))],
      hint: `Only Regions are listed, and never one inside ${d.name}.`}], {ok: 'Move'});
    if (!r) return;
    return this.move(d.id, r.target ?? '');
  }
  /** GM: Who Can See It. Saved locations change at once through the API; a new one changes its draft. */
  async onAudience(el) {
    const d = this.draft;
    if (!d) return;
    const a = d.audience, kind = el.dataset.actionChange;
    const next = {mode: a.mode, userIds: [...a.userIds], sharing: a.sharing};
    if (kind === 'audience-mode') next.mode = el.value;
    if (kind === 'audience-user') next.userIds = el.checked ? [...new Set([...next.userIds, el.value])] : next.userIds.filter(u => u !== el.value);
    if (kind === 'audience-sharing') next.sharing = el.checked;
    if (next.mode === 'everyone' && a.mode === 'selected' && d.id && d.state !== 'hidden') {
      const ok = await confirmDialog(`Let every player see ${d.name}, not just the selected ones?`, {title: 'Show to every player?', yes: 'Show to everyone'});
      if (!ok) return this.render();
    }
    if (!d.id) { d.audience = {...a, ...next}; this.touch(); return this.render(); }
    d.audience = await api().setAudience(d.id, next);
    return this.render();
  }
  /** Player: Share with... other players (adds only). */
  async share(ref) {
    const v = this.list().find(l => this.rid(l) === ref);
    if (!v?.share?.canShare) return;
    const choices = worldPlayers().filter(u => !v.share.userIds.includes(u.id));
    if (!choices.length) return ui.notifications.info('Every player can already see this place.');
    const picked = await formDialog('Share with…', [{name: 'user', label: `Share ${v.name} with`, type: 'checklist',
      options: choices.map(u => ({value: u.id, label: u.name})), hint: 'They will see this place, its pin and its Party Notes. Only the GM can take it back.'}], {ok: 'Share'});
    const ids = picked?.user;
    if (!ids?.length) return;
    const r = await api().shareLocation(ref, ids);
    ui.notifications.info(r.added ? `Shared with ${r.added} player(s).` : 'They could already see it.');
    return this.render();
  }
  /** Saves the draft privately (never publishes). Returns the saved record, or null if it has no name. */
  async saveDraft() {
    if (!this.draft.name.trim()) { ui.notifications.warn('Give the location a name first.'); return null; }
    if (!this.dirty && this.draft.id) return this.draft;
    const saved = await api().saveLocation(normalizeLocation(this.draft));
    this.select(saved.id);
    return saved;
  }
  /** 0.22.1: the Player Preview's "Also show the other states" choice, remembered per client. Never throws. */
  static previewOthers(set) {
    const key = `${MODULE_ID}.previewOthers`;
    try {
      if (set === undefined) return globalThis.localStorage?.getItem(key) === '1';
      globalThis.localStorage?.setItem(key, set ? '1' : '0');
    } catch { /* storage blocked: the choice just is not remembered */ }
    return set === true;
  }
  /** The Player Preview body. Shows the current state's card; the other states' cards are present but hidden until the toggle is on. */
  previewHtml(showOthers = false) {
    const d = normalizeLocation(this.draft), cur = this.draft.state;
    const part = st => {
      const v = api().previewLocation(d, st);
      const current = cur === st;
      return `<section class="agl-preview__part" data-state="${st}"${current ? ' data-current="1"' : showOthers ? '' : ' hidden'}><h3>${STATE_LABELS[st]}${current ? ' (current)' : ''}</h3>${this.viewerHtml(v, {partyNotes: false})}</section>`;
    };
    const hiddenCard = cur === 'hidden'
      ? `<section class="agl-preview__part" data-state="hidden" data-current="1"><h3>${STATE_LABELS.hidden} (current)</h3><p>Hidden: players see nothing.${isPlaceable(d) ? ' Its pins on a map are invisible to them too.' : ''}</p></section>` : '';
    return `<div class="agl-app agl-preview">
      <p class="agl-hint">This is what players would see after you publish your current edits. Quest names follow Quest Log's own visibility.</p>
      ${hiddenCard}${part('unidentified')}${part('revealed')}
      <label class="ag-field ag-field--inline agl-preview__toggle"><input type="checkbox" id="agl-preview-others" ${showOthers ? 'checked' : ''}> Also show the other states</label></div>`;
  }
  /** 0.23.0: GM only. A Hidden location asks first (Reveal and show); nothing else is changed or saved. */
  async showToPlayers() {
    if (!this.gm || !this.draft?.id) return;
    if (this.draft.state === 'hidden') {
      if (!(await this.saveFirst('reveal and show it'))) return;
      const ok = await confirmDialog(`${this.draft.name} is hidden. Reveal it, then show it? Players will see its name and everything marked visible, and its pins show the name.`,
        {title: 'Reveal and show?', yes: 'Reveal and show'});
      if (!ok) return;
      const saved = await this.saveDraft();
      if (!saved) return;
      await api().setLocationState(saved.id, 'revealed');
      this.select(saved.id);
      await this.render();
    }
    const r = await api().showToPlayers(this.draft.id);
    ui.notifications.info(r.sent ? `Shown to ${r.sent} player${r.sent === 1 ? '' : 's'}.` : 'No players are connected who can see this location.');
  }
  /** What players would see after Publish. Built by the API from the draft; nothing is written. */
  preview() {
    const content = this.previewHtml(LocationsApp.previewOthers());
    // Stays a custom DialogV2 window for its 560px width; same kit classes and single Close button as infoDialog.
    return foundry.applications.api.DialogV2.wait({classes: ['ag-app', 'ag-dialog'], window: {title: `Player Preview: ${this.draft.name}`}, position: {width: 560}, content, // ag-lint-allow: custom dialog, has ag-dialog classes
      render: (_event, dialog) => bindPreviewToggle(dialog?.element ?? _event?.target?.element),
      buttons: [{action: 'close', label: 'Close', default: true}], rejectClose: false});
  }
  async importFile(file) {
    if (!file) return;
    return this.importJson(JSON.parse(await file.text()));
  }
  async importJson(pkg) {
    const r = await api().importPackage(pkg);
    const retired = r.retired ?? [];
    const msg = `Imported ${r.created.length} location(s)${r.skipped.length ? `, kept ${r.skipped.length} existing` : ''}${r.errors.length ? `, ${r.errors.length} invalid` : ''}.`;
    if (r.errors.length) console.warn(`${MODULE_ID} | import problems:`, r.errors);
    ui.notifications.info(msg);
    // 0.20.0: Route records are skipped (the rest of the file imported); say so once, with what to do instead.
    if (retired.length) ui.notifications.warn(`Skipped ${retired.length} route record(s): ${ROUTES_RETIRED}`);
    this.tab = 'locations';
    return this.render();
  }
  help() {
    const topic = (title, items) => `<h3>${title}</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    const gm = this.gm ? [
      topic('Editing', [
        '<strong>New location</strong>, type a name, then <strong>Save Changes</strong>. The ID is made for you.',
        'The editor has three sub-tabs under one footer: <strong>Content</strong> (type, region, threat, image and the blocks), <strong>Visibility &amp; map</strong> (who can see it, where it sits, pin art, linked scenes) and <strong>Party Notes</strong>. Switching sub-tabs keeps your unsaved edits.',
        'Drop material Items on <em>Gathering Resources</em>, Actors/Journals on <em>Factions</em>, anything on <em>Notes</em>. Or type a custom entry. <strong>Add detail</strong> makes a custom block with a title, text and an optional linked document.',
        '<strong>Reorder:</strong> drag a grip, or use the arrows (Alt+Up / Alt+Down on a grip), to move a block or an entry. Players see published blocks in your order.',
        '<strong>Loot &amp; Rewards:</strong> drag an Item in (world or compendium) or add a plain reward. It is a link only: nothing is given to anyone. Set <em>Available / Discovered / Taken</em> yourself.',
        'Quests come from Quest Log. Clicking one opens the Quest Log.']),
      topic('Visibility', [
        'Each location is <strong>Hidden</strong> (players see nothing), <strong>Unidentified</strong> (players see only its label and teaser) or <strong>Revealed</strong>. The buttons next to the name change it at once.',
        '<strong>Save Changes</strong> is private. Players see edits only after <strong>Publish</strong> (or Reveal). <strong>Player Preview</strong> shows what they would see in the location\'s current state; tick <em>Also show the other states</em> to compare (your choice is remembered on this computer). A state change or Place on Scene with unsaved edits asks <em>Save and …</em> first.',
        'The <i class="fa-solid fa-eye"></i> toggles decide what players see once revealed, and each section has its own switch.',
        '<strong>Who Can See It</strong> (<em>Applies now</em>): <em>Everyone</em>, or <em>Selected players</em> only. Other players get nothing, not even its pin, exactly as if it were Hidden. Players who can see it may <em>Share with…</em> others (you can turn that off); you see who shared with whom and can untick anyone.']),
      topic('Map pins', [
        '<strong>Place on Scene</strong> (in the editor head) or drag a location from the list onto the map to add a Map Note. Double-click the note to open the location. The pin shows the unidentified label and image until the location is revealed; set pin art under <em>Unidentified Marker &amp; Pin</em>.',
        '<strong>Show to Players</strong> (editor head, GM only) opens the location in every other connected player\'s Locations window, like Foundry\'s Show to Players for journals. Players see only what they could already see: an unidentified place opens its unidentified card, and a Selected-players place goes only to those players. A hidden place asks <em>Reveal and show</em> first. Players\' windows switch to it rather than stacking, and a player who is typing or has unsaved Party Notes is not interrupted. GM Setup → Show to Players can turn the automatic opening off (they then get a notification).',
        '<strong>Pin look</strong> (GM Setup → Map Pins): <em>Framed</em> is Foundry\'s own square pin. <em>Image only</em> shows just the picture, without the square or the shaded backing, on every player\'s screen; the frame still shows while you hover or select a pin. <em>Name under the pin</em> chooses <em>Always shown</em> or <em>Only when hovering</em> (Foundry\'s own behaviour), and <em>Name size</em> (8 to 48 pixels, default 14) sets how large it is, and <em>Wrap the name after</em> breaks a long name into lines of that many characters (0 = off). To size one pin on its own, activate the Notes layer, right-click or double-click the note, and change <em>Font Size</em> in its configuration: a Font Size other than Foundry\'s default 32 overrides the module setting for that pin. Hidden pins never show a name and unidentified pins show only their unidentified label. It changes how pins are drawn, not the pins, so switch back any time.',
        '<strong>Placeable on a map</strong>: untick it for places that only group others. They are left out of Place on Scene and dragging onto the map unless you tick <em>Show representative-only too</em> (under <strong>Filters</strong>). The <em>Placeable</em> filter finds either kind.']),
      topic('List, tree and moving', [
        '<strong>Filters</strong> opens a second toolbar row: the filters, Sort, Group by and <em>Show representative-only too</em>. The number on it counts the filters in use.',
        '<strong>Tree</strong> shows places inside their Regions as folders, with how many places each holds (directly · in total). Drag a place onto a folder (or onto <em>Drop here for top level</em>) to move it; <strong>Undo</strong> puts it back. <strong>Move to…</strong> in the editor does the same from the keyboard, and <strong>+</strong> on a folder makes a new place inside it.',
        '<em>Place</em>: put a location inside another. Mark one as a <strong>Region</strong> to make it a folder. A Region passes its <em>Conditions</em> to the places inside it only if you tick <em>Pass conditions to places inside</em>; a place can turn one off or change it for itself. <em>Linked Scenes</em> open with one click (only you move).']),
      topic('Gathering', [
        'Each gathering node shows its name, skill, tier, DC and status on one row; <strong>Edit node</strong> opens its materials, availability, note and optional <em>Exotic materials</em> (GM only, never shown to players). DC is 10/12/15/18/20 by tier; a DC you set stays. Players only see the DC if you turn on its <i class="fa-solid fa-eye"></i>.',
        '<strong>Mark exhausted</strong> after a node is used or a check fails; <strong>Restore</strong> undoes it.',
        '<strong>Add node…</strong> asks <em>From template</em> (Profession Ledger 0.25.0+) or <em>Custom</em>. The Ledger owns a template\'s activity, tier range, check and materials (shown read only; <strong>Gathering Nodes</strong> opens the Ledger to edit them); you set this place\'s name, tier, DC, finite, availability and note. Leave a field on <em>Template</em> to use the template\'s value. If the template is deleted the entry stays, marked, with its data.']),
      topic('Hazards, roll tables and Route locations', [
        'Routes are retired. For a road, river or pass, make a location with type <strong>Route</strong> and put it inside the place it leaves from (or wherever suits). It is a plain location: no ends, no legs, nothing drawn on the map. When the party travels, you rule and roll.',
        '<strong>Hazards</strong> (Content sub-tab): <strong>Add hazard…</strong> gives a name, a note and an optional roll table. <strong>Open table</strong> opens it; <strong>Roll</strong> draws it to chat. A hazard is GM only until you show it (<i class="fa-solid fa-eye"></i>); players then see its name and note after Publish, never its table.',
        '<strong>Roll Tables</strong>: link world tables (or drop one, from a compendium too). Only you can <strong>Roll</strong>. A shown table lists its name for players, who can open it only if Foundry lets them.',
        'Old routes are kept in the world, unused. <strong>GM Setup → Developer Tools → Convert routes to locations…</strong> (only while the world has some) previews and then makes a Route location for each. Importing a Route record skips it: make a location with type Route instead.']),
      topic('Party Notes', [
        '<strong>Party Notes</strong> are written by the players, one at a time, on any location they can see. They are not your <em>Notes</em> section and are never published, exported or changed by an import. They have their own <strong>Save Party Notes</strong>; Save Changes never touches them. You can edit, take over or clear them. Hiding a location hides its Party Notes until it is visible again.'])
    ].join('')
      : '<p>These are the places your GM has revealed. Places under <em>Unidentified</em> show only what you have heard so far. Click a linked quest, faction, document or place to open it.</p><p><strong>Party Notes</strong> are shared by the whole party. Click <em>Edit</em>, type, then <em>Save Party Notes</em>. One person edits at a time; everyone else sees who is editing. Saving works whether or not a GM is connected.</p><p>A place marked with <i class="fa-solid fa-user-lock"></i> is known only to some players. If the GM allows it, <em>Share with…</em> lets other players see it too (a GM must be connected).</p>';
    return infoDialog('Locations Help', gm);
  }
}
