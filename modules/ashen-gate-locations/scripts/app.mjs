/** The Locations window: GM builder (list + editor + GM Setup) and the player viewer, one class. */
import {MODULE_ID, THREATS, FIELDS, SECTIONS, BLOCKS, GM_ONLY_BLOCKS, DETAIL_PREFIX, LOOT_STATUSES, LOOT_STATUS_LABELS, NOTE_DOC_TYPES, FACTION_DOC_TYPES, NPC_DOC_TYPES, GATHERING, STATES, STATE_LABELS,
  DEFAULT_UNIDENTIFIED_LABEL, PIN_DEFAULTS, inheritedPin, esc, clone, threatLabel, normalizeLocation, normalizeLayout, reorder, effectiveConditions, newKey, newNode, nodeName, materialIdOf,
  hasUnpublishedChanges, parentMap, PARTY_NOTES, isPlaceable, passesConditions, EXOTIC_MODES, EXOTIC_CONDITIONS, normalizeExotics, isTierDefaultDc,
  isNodeRef, activityLabel, ACTIVITY_LABELS, TYPE_SUGGESTIONS, ROUTES_RETIRED} from './model.mjs';
import {BANNER_WIDTH, BEAST_ID} from './model.mjs';
import {drawnSize} from './pin-proportions.mjs';
import {PIN_LOOKS, NAME_MODES, NAME_SIZE, WRAP, OFFSET, offsetOf, nameModeOf, pinLookOf, nameSizeOf, wrapOf, readPinLook} from './pin-look.mjs';
import {nodeTemplates, openNodesTab} from './ledger-nodes.mjs';
import {GROUP_MODES, SORTS, FILTER_CONTROLS, emptyFilters, hasFilters, searchText, matchesQuery, applyFilters, filterOptions, comparator, groupRows, withNodeInfo} from './list-filter.mjs';
import {buildTree, withAncestors, breadcrumb, regionChoices, regionNames, regionAfterParentChange, VIEW} from './tree.mjs';
import {idPrefix, previewHtml, BULK_VERBS} from './bulk.mjs';
import {buildRegionSections, arrangeFolds, readFolds, toggleFold, GM_ACCESS, VIEW_ACCESS} from './region-groups.mjs';
import {confirmDialog, confirmDanger, choiceDialog, formDialog, infoDialog, guardDirty} from './ag-dialogs.mjs';
import {travel, travelCount, onRowContextMenu} from './travel-ui.mjs';
import {hereMarks, hereMarkHtml} from './here-marker.mjs';
import {travelLabel} from './travel.mjs';
import {windowSize, uiState, subTabs, tabPanelAttrs, bindTablist, bindSplitNav, fold, bindFolds, fileButton, bindFileButtons, linkButton} from './ag-html.mjs';
import {confirmPlacement} from './pin-verify.mjs';
import {setDragging} from './canvas-drop.mjs';
import {captureView, restoreView, keepScroll} from './keep-view.mjs';
import {readDrop, resolveItemDrop, itemIdOf} from './ag-item-drop.mjs';
import {overland, ACTIONS as ACTION_NAMES} from './overland.mjs';
import {travelHtml} from './overland-view.mjs';
import {resetDayDialog} from './overland-reset.mjs';
import {namesForUsers} from './who-names.mjs';
import {OVERLAND_CONDITIONS, effectiveLocationConditions} from './overland-conditions.mjs';
import {actorFacts, npcSuggestions, relinkPlan, applyRelink, shopsHere, shopsForPlayer, shopsApiState} from './people-shops.mjs';

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
const hereNow = v => v?.active ? '<span class="ag-badge ag-badge--ok agl-active"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Here now</span>' : '';
const travelForPlayers = () => { try { return game.settings.get(MODULE_ID, 'travelForPlayers') === true; } catch { return false; } };
const showOpens = () => { try { return game.settings.get(MODULE_ID, 'showOpensWindow') !== false; } catch { return true; } };
const setting = (key, fallback) => { try { return game.settings.get(MODULE_ID, key) || fallback; } catch { return fallback; } };
const sceneName = uuid => { try { return globalThis.fromUuidSync?.(uuid)?.name ?? null; } catch { return null; } };
/** 0.20.0: a linked document's name ('' when it is gone or not loaded), and the world's RollTables for the pickers. */
const docName = uuid => { try { return globalThis.fromUuidSync?.(uuid)?.name ?? ''; } catch { return ''; } };
/** 0.30.0: the world's Actors, and Actors plus Journals (a People link may be either), as plain arrays. */
const worldActors = () => [...(game.actors ?? [])];
/** NPC-type world Actors not yet linked (by uuid or sourceId), for the People and Beasts pickers. */
const actorChoices = (linkedUuids, linkedIds, ids) => worldActors().filter(a => a.type === 'npc' && a.uuid && !linkedUuids.has(a.uuid) && !actorFacts(a, {ids}).excluded && !linkedIds.has(actorFacts(a, {ids}).sourceId || null))
  .sort((a, b) => String(a.name).localeCompare(String(b.name)));
const worldPeopleDocs = () => [...worldActors(), ...(game.journal ?? [])];
const worldTables = () => [...(game.tables ?? [])].filter(t => t?.uuid).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(t => ({value: t.uuid, label: t.name}));
/** Threat as a kit badge: Settled plain, Light and Normal ok, Hot warn, Deadly a solid danger fill (agl-threat--deadly). */
const THREAT_TONES = {light: 'ok', normal: 'ok', hot: 'warn', deadly: 'danger'};
const threatBadge = value => `<span class="ag-badge${THREAT_TONES[value] ? ` ag-badge--${THREAT_TONES[value]}` : ''} agl-threat agl-threat--${esc(value)}">${esc(threatLabel(value))}</span>`;
/** 0.42.0: who a user is at the table: the first name of each character they own (that this viewer may see), else the user name. Display only. */
const whoNames = ids => namesForUsers(ids, {users: game.users, actors: game.actors, viewer: game.user});
const userName = id => whoNames([id]).join(', ');
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

/**
 * 0.34.0: what the GM list needs from outside Locations to search and group (Ledger node templates, quest and material names). The window and
 * the public `listModel` both read it here, so a partner's list matches the window's.
 */
export function listContext() {
  const tpl = nodeTemplates(), choices = questChoices(), mats = materialNames();
  return {templates: tpl.ok ? tpl.list : [], questName: id => questName(id, choices) ?? 'Unknown quest', materialName: id => mats.get(id) ?? id};
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
    this.treeMode = false; this.showRep = false; this.shopsChildren = false; this.lastMove = null; this.undoTimer = null;
    // 0.26.0: bulk select (checkboxes), the "Archived" view, the id-prefix filter and the last Archive (for Undo). Per window, not saved.
    this.picking = false; this.picked = new Set(); this.showArchived = false; this.idPrefix = ''; this.lastBulk = null; this.bulkTimer = null; this.shownIds = []; this.fopts = null;
    // 0.19.0: the editor sub-tab and whether the filter row is open, remembered per user (kit uiState).
    this.editorTab = uiMem().get('editorTab', 'content', EDITOR_TABS.map(t => t.id));
    this.filtersOpen = uiMem().get('filtersOpen', false, [true, false]);
    // 0.32.0: the Region headers folded in the list, remembered per user (kit uiState) and kept live here.
    this.folds = readFolds(uiMem());
    // 0.32.2: the selection the folders were last arranged for (arrangement runs only when it changes), and the headers the user
    // collapsed while a search was open (a manual collapse wins until the search or filters change).
    this.arrangedFor = undefined; this.searchCollapsed = new Set(); this.searchKey = ''; this.filteringNow = false;
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
  list() {
    if (this.gm) return api().listLocations({archived: this.showArchived ? 'only' : 'exclude'});
    // 0.24.0: places the party is at now come first for players (stable: the rest keep their order).
    return api().listLocations({includeUnidentified: true}).map((l, i) => [l, i]).sort((a, b) => (b[0].active === true) - (a[0].active === true) || a[1] - b[1]).map(x => x[0]);
  }
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
    if (this.groupBy === 'region') return this.toggleRegion(`loose:${key}`);   // 0.32.0: remembered per user
    const id = `${this.groupBy}:${key}`;
    if (!this.collapsed.delete(id)) this.collapsed.add(id);
    return this.render();
  }
  /**
   * 0.32.2: any header can be folded or unfolded by click, whatever is selected. While a search or filter is open the headers show what matches
   * and a click lasts only until the search changes; otherwise the choice is remembered per user.
   */
  toggleRegion(id) {
    if (this.filteringNow) { if (!this.searchCollapsed.delete(id)) this.searchCollapsed.add(id); }
    else toggleFold(uiMem(), this.folds, id);
    return this.render();
  }
  /** 0.32.2: when the selection changes (and when the window first opens with one), fold every folder that does not hold it and open the ones on its path. */
  arrangeOnSelection(list, access) {
    const sel = this.selectedId ?? null;
    if (this.arrangedFor === sel) return;
    this.arrangedFor = sel;
    if (!sel) return;
    // Tree rows (GM Tree mode, and the places a player sees nested under a non-Region parent): only the selected place's path is open.
    if (!this.gm || this.treeMode) {
      LocationsApp.treeOpen.clear();
      for (const i of breadcrumb(list, sel, access ?? undefined)) LocationsApp.treeOpen.add(access?.idOf?.(i) ?? i.id);
    }
    if (access) arrangeFolds(uiMem(), this.folds, buildRegionSections(list, access), sel, access);
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
    if (this.gm) this.picked = new Set([...this.picked].filter(id => list.some(l => l.id === id)));
    if (!creating && !(this.gm && this.showArchived)) {
      if (this.selectedId && !list.some(l => this.rid(l) === this.selectedId)) this.select(null);
      // The default pick (the first row, when nothing is open) is not a choice the user made: it does not rearrange the folders.
      if (!this.selectedId && list.length) { this.select(this.rid(list[0])); this.arrangedFor = this.selectedId; }
      if (this.gm && this.selectedId && !this.draft) this.select(this.selectedId);
    }
    const version = game.modules.get(MODULE_ID)?.version ?? '';
    // 0.20.0: Routes are retired (a route is a location of type Route): players get Locations only, the GM also GM Setup.
    // 0.39.0: Travel is the second tab for the GM, and for players while Travel for players is on; GM Setup stays last and GM-only.
    const tabs = [['locations', 'Locations', 'fa-map-location-dot'], ...(this.gm || travelForPlayers() ? [['travel', 'Travel', 'fa-person-hiking']] : []), ...(this.gm ? [['setup', 'GM Setup', 'fa-gears', true]] : [])];
    const tab = tabs.some(t => t[0] === this.tab) ? this.tab : 'locations';
    // Developer Tools offers "Convert routes to locations" only while the world still holds stored routes.
    if (tab === 'setup') { try { this.convertPlan = await api().convertRoutes(); } catch (err) { console.warn(`${MODULE_ID} | route conversion preview`, err); this.convertPlan = null; } }
    return `<div class="agl-root ag-window">
      <header class="ag-header"><div class="ag-header__title"><h1><span class="ag-header__brand">Ashen Gate</span> | Locations</h1></div>
        <div class="ag-header__meta"><span class="ag-version">v${esc(version)}</span>${btn('help', 'Help', {kind: 'ghost sm', icon: 'fa-solid fa-circle-question'})}</div></header>
      ${tabs.length > 1 ? `<nav class="ag-tabs ag-tabs--scroll agl-maintabs" role="tablist" aria-label="Locations sections">${tabs.map(([k, l, icon, gmOnly]) =>
        `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}" class="${tab === k ? 'active' : ''}${gmOnly ? ' ag-tab--gm' : ''}" aria-controls="agl-pane"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${l}</button>`).join('')}</nav>` : ''}
      <div class="agl-pane" id="agl-pane">${tab === 'setup' ? this.setupHtml() : tab === 'travel' ? this.travelPane() : this.locationsHtml(list)}</div>
    </div>`;
  }
  _replaceHTML(result, content) {
    // 0.27.3: every scroll position and the focused control survive the redraw (keep-view.mjs); a new selection resets the detail pane.
    const view = this.viewMemo ??= {};
    const snap = captureView(content, view, {selectedId: this.selectedId, editorTab: this.editorTab});
    content.innerHTML = result;
    restoreView(content, view, snap);   // also puts focus and the caret back (the Party Notes box has an id)
    try { this.bind(content); } catch (err) { content.innerHTML = this.errorHtml(err); this.bind(content); }
  }

  // ---------- list ----------
  locationsHtml(list) {
    let rows = list, total = list.length, filters = '';
    if (this.gm) {
      const ctx = listContext(), qName = ctx.questName;
      rows = list = withNodeInfo(list, ctx.templates);
      if (this.query.trim()) rows = rows.filter(l => matchesQuery(searchText(l, ctx), this.query));
      const searched = rows;
      rows = applyFilters(rows, this.filters).sort(comparator(this.sort, this.sortDesc));
      // 0.26.0: "Id starts with" narrows the list by permanent id (the one place an id is typed); Select all shown then takes exactly those.
      if (idPrefix(this.idPrefix)) rows = rows.filter(l => l.id.startsWith(idPrefix(this.idPrefix)));
      this.shownIds = rows.map(l => l.id);
      this.fopts = filterOptions(searched, this.filters, qName);
      filters = this.filterBarHtml(this.fopts);
      this.qName = qName;
    } else {
      const q = this.query.toLowerCase();
      rows = list.filter(l => !q || [l.name, l.type, l.region].some(s => String(s ?? '').toLowerCase().includes(q)));
    }
    const filtering = hasFilters(this.filters) || !!this.query.trim() || !!idPrefix(this.idPrefix);
    const searchKey = JSON.stringify([this.query.trim(), this.filters, this.idPrefix]);
    if (searchKey !== this.searchKey) { this.searchKey = searchKey; this.searchCollapsed.clear(); }
    this.filteringNow = this.gm ? filtering : !!this.query.trim();
    const grouped = !this.gm || this.treeMode || this.groupBy === 'region';
    if (grouped) this.arrangeOnSelection(list, this.gm ? (this.treeMode ? null : GM_ACCESS) : VIEW_ACCESS);
    let items;
    if (this.gm && this.treeMode) items = this.treeHtml(list, rows, filtering);
    else if (!this.gm) items = this.regionHtml(list, rows, !!this.query.trim(), VIEW_ACCESS);
    else if (this.groupBy === 'region') items = this.regionHtml(list, rows, filtering, GM_ACCESS);
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
        <button type="button" class="ag-chip" id="agl-tree" aria-pressed="${this.treeMode}"${tip('Show locations inside their Regions, as folders')}><i class="fa-solid fa-folder-tree" aria-hidden="true"></i> Tree</button>
        ${this.showArchived ? '' : `<button type="button" class="ag-chip" id="agl-select" aria-pressed="${this.picking}"${tip('Tick several locations to archive or delete them together')}><i class="fa-solid fa-square-check" aria-hidden="true"></i> Select</button>`}
        <button type="button" class="ag-chip" id="agl-archived" aria-pressed="${this.showArchived}"${tip(this.showArchived ? 'Back to the Locations list' : 'Archived locations: hidden from the list and from players, nothing lost')}><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Archived (${this.archivedCount()})</button>` : '';
    return `<div class="ag-toolbar agl-toolbar"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="agl-search" placeholder="${this.gm ? 'Search name, region, skill, material, quest…' : 'Search locations'}" value="${esc(this.query)}" aria-label="Search locations"></label>
        ${quick}${this.gm ? `<span class="ag-toolbar__count" aria-live="polite">Showing ${rows.length} of ${total}</span>` : ''}${end}</div>
      ${this.gm && this.filtersOpen ? filters : ''}
      <div class="agl-body ag-split"><aside class="agl-list ag-split__list">${this.gm && !this.showArchived ? this.publishAllHtml(list) : ''}${this.gm && this.pickMode ? this.bulkBarHtml() : ''}${this.undoHtml()}${this.bulkUndoHtml()}${rows.length ? `<ul class="agl-groups">${items}</ul>` : none}
        ${this.gm && rows.length ? `<p class="agl-hint">Drag a placeable location onto the scene to place a Map Note${this.treeMode ? '; drag one onto a folder to move it inside' : ''}.</p>` : ''}</aside>
      <section class="agl-detail ag-split__detail">${this.gm ? (this.showArchived ? this.archivedPanelHtml() : this.editorHtml()) : this.viewerHtml(list.find(l => this.rid(l) === this.selectedId))}</section></div>`;
  }

  /** Row-end badges shared by the normal and the tick-box row. */
  rowEnd(l) {
    const gm = this.gm, rep = gm && !isPlaceable(l);
    const restricted = gm ? l.audience?.mode === 'selected' : !!l.share;
    return `<span class="ag-row__end">${rep && !l.isRegion ? mark('fa-solid fa-layer-group', 'Representative only: not placed on maps') : ''}
        ${restricted ? mark('fa-solid fa-user-lock', gm ? 'Selected players only' : 'Shared with selected players') : ''}
        ${l.active ? `<span class="ag-badge ag-badge--ok agl-active"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${gm ? 'Active' : 'Here now'}</span>` : ''}
        ${gm && l.threat ? threatBadge(l.threat) : ''}
        ${gm ? `${hasUnpublishedChanges(l) ? `<span class="agl-dot"${tip('Saved changes not published yet')} aria-hidden="true"></span><span class="ag-sr-only">Saved changes not published yet</span>` : ''}${mark(STATE_ICONS[l.state], STATE_LABELS[l.state])}` : ''}</span>`;
  }
  /** 0.26.0: GM select mode (and the Archived view): a tick box and the name in one label, so the whole row toggles and the keyboard reaches it. */
  pickRow(l) {
    const on = this.picked.has(l.id);
    return `<div class="ag-row agl-row agl-row--pick${on ? ' is-picked' : ''}"><label class="agl-pick"><input type="checkbox" data-pick="${esc(l.id)}"${on ? ' checked' : ''}>
        ${this.gm && l.isRegion ? mark('fa-solid fa-folder', 'Region (folder)', 'agl-row__icon') : ''}<span class="ag-row__title agl-row__name">${esc(l.name)}</span></label>${this.rowEnd(l)}</div>`;
  }
  get pickMode() { return this.gm && (this.picking || this.showArchived); }
  /** One list row. GM: draggable onto the canvas (placeable ones, or all with "Show representative-only too") or onto a folder. */
  rowButton(l) {
    if (this.pickMode) return this.pickRow(l);
    const gm = this.gm, rep = gm && !isPlaceable(l), selected = this.rid(l) === this.selectedId;
    const drag = gm ? ` draggable="true" data-drag-type="${!rep || this.showRep ? 'AshenGateLocation' : 'AshenGateLocationMove'}"` : '';
    return `<button type="button" class="ag-row agl-row${selected ? ' is-selected' : ''}"${selected ? ' aria-current="true"' : ''} data-action="select" data-id="${esc(this.rid(l))}"${drag}>
        ${gm && l.isRegion ? mark('fa-solid fa-folder', 'Region (folder)', 'agl-row__icon') : ''}
        <span class="ag-row__main"><span class="ag-row__title agl-row__name">${esc(l.name)}</span></span>
        ${this.rowEnd(l)}
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
      <div class="agl-tree__row"${folder ? ` data-folder="${esc(l.id)}"` : ''}>${toggle}${this.rowButton(l)}${this.here?.nodes.has(n.id) ? hereMarkHtml(esc) : ''}${counts}${add}</div>
      ${isOpen ? `<ul class="agl-tree">${n.children.map(c => this.treeNodeHtml(c, {open, path})).join('')}</ul>` : ''}</li>`;
  }
  /** Is this folder open? Filtering opens every path to a match unless the user collapsed it since the search changed; otherwise the user's own open/closed choice (set on selection, then by clicks). */
  treeOpener(items, filtering) {
    return id => filtering ? !this.searchCollapsed.has(id) : LocationsApp.treeOpen.has(id);
  }
  /** GM Tree mode: every location under its parent, Regions as folders. Filters and search keep matches and their folders. */
  treeHtml(list, rows, filtering) {
    this.here = null;
    const show = filtering ? withAncestors(list, rows) : null;
    const nodes = buildTree(list, {show, sort: comparator(this.sort, this.sortDesc)});
    const open = this.treeOpener(list, filtering);
    const tools = `<li class="agl-tree__tools" data-folder="">${btn('tree-all', 'Expand all', {kind: 'ghost sm', icon: 'fa-solid fa-folder-open', data: {open: 1}})}${btn('tree-all', 'Collapse all', {kind: 'ghost sm', icon: 'fa-solid fa-folder-closed', data: {open: 0}})}
      <span class="agl-hint">Drop here for top level</span></li>`;
    return `${tools}<li><ul class="agl-tree agl-tree--root" aria-label="Locations by folder">${nodes.map(n => this.treeNodeHtml(n, {open, path: show && new Set(rows.map(l => l.id))})).join('')}</ul></li>`;
  }
  /**
   * 0.32.0: nested, collapsible Region headers (GM "Group by Region", and the player list). A place sits under the headers of its Region
   * ancestors; places with no Region ancestor are grouped by their free-text region, as before. Players only ever get what they can see: a
   * hidden Region is never named (see region-groups.mjs). Folded headers are remembered per user (kit uiState); searching, and the selected
   * place's own headers, keep things open so a match is never hidden.
   */
  regionHtml(list, rows, filtering, access) {
    const sortRows = this.gm ? comparator(this.sort, this.sortDesc) : (a, b) => a.name.localeCompare(b.name);
    const show = filtering ? withAncestors(list, rows, access) : null;
    const items = show ? list.filter(i => show.has(access.idOf(i))) : list;
    const sections = buildRegionSections(items, access, {sortRows});
    const folds = this.folds;
    const open = this.treeOpener(list, filtering);
    const path = show && new Set(rows.map(access.idOf));
    // 0.36.0: where "Your party is here" shows, from what is on screen now (folded headers, closed rows).
    this.here = hereMarks(sections, {folded: id => filtering ? this.searchCollapsed.has(id) : folds.has(id), open, nested: !this.gm, access, sort: sortRows});
    const hereAt = id => this.here.sections.has(id) ? hereMarkHtml(esc) : '';
    const section = (s, depth) => {
      const folded = filtering ? this.searchCollapsed.has(s.id) : folds.has(s.id);
      // The GM's flat groups (places with no Region above them) keep their plain, untreed rows; only the fold is the new, remembered one.
      if (this.gm && s.flat) return `<li class="agl-group"><h3 class="agl-group__title"><button type="button" class="agl-group__head ag-eyebrow" data-action="toggle-group" data-group="${esc(s.label)}" aria-expanded="${!folded}"
          ${tip(folded ? 'Unfold' : 'Fold')}><i class="fa-solid ${folded ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i><span>${esc(s.label)}</span><span class="agl-count">${s.count}</span></button>${hereAt(s.id)}</h3>
          ${folded ? '' : `<div class="ag-rows">${s.rows.map(l => this.rowButton(l)).join('')}</div>`}</li>`;
      // GM: plain rows, as the flat groups always were (every place listed, none tucked under a toggle). Players: the nested tree rows.
      const nodes = this.gm ? '' : buildTree(s.rows, {...access, sort: sortRows}).map(n => this.treeNodeHtml(n, {open, path})).join('');
      const plain = this.gm && s.rows.length ? `<li><div class="ag-rows">${s.rows.map(l => this.rowButton(l)).join('')}</div></li>` : '';
      const kids = s.sections.map(c => section(c, depth + 1)).join('');
      const name = esc(s.label);
      const head = `<button type="button" class="agl-group__head ag-eyebrow agl-rgroup__toggle" data-action="region-fold" data-id="${esc(s.id)}" aria-expanded="${!folded}"${tip(folded ? 'Unfold' : 'Fold')}>
          <i class="fa-solid ${folded ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i><span>${name}</span><span class="agl-count"${tip(`${s.count} ${s.count === 1 ? 'place' : 'places'} inside`)}>${s.count}</span></button>${hereAt(s.id)}`;
      // In Select mode a Region that matches the list gets its tick box, so it can be picked like any row; otherwise a button opens it.
      const tick = this.pickMode && s.item && (!path || path.has(access.idOf(s.item)));
      const openBtn = tick ? this.pickRow(s.item) : s.item ? btn('select', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-right', data: {id: this.rid(s.item)}, title: `Open ${s.label}`}) : '';
      return `<li class="agl-group agl-rgroup" data-depth="${depth}"><h3 class="agl-group__title agl-rgroup__title">${head}${openBtn}</h3>
        ${folded ? '' : `<ul class="agl-rgroup__body">${kids}${plain}${nodes ? `<li><ul class="agl-tree agl-tree--root">${nodes}</ul></li>` : ''}</ul>`}</li>`;
    };
    return sections.map(s => section(s, 0)).join('');
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
      ${FILTER_CONTROLS.map(c => sel(c.key, c.label, c.all)).join('')}
      ${plain('agl-sort', 'Sort by', SORTS, this.sort)}<button type="button" class="ag-btn ag-btn--icon" id="agl-sortdir" aria-label="Sort direction: ${this.sortDesc ? 'descending' : 'ascending'}"${tip(dir)}><i class="fa-solid ${this.sortDesc ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}" aria-hidden="true"></i></button>
      ${this.treeMode ? '' : plain('agl-groupby', 'Group by', GROUP_MODES, this.groupBy)}
      <label class="ag-field ag-field--inline agl-switch"${tip('Representative-only locations (most Regions) are not offered for placing on a map unless this is on')}><input type="checkbox" id="agl-showrep" ${this.showRep ? 'checked' : ''}> Show representative-only too</label>
      ${hasFilters(this.filters) || this.query ? btn('clear-filters', 'Clear filters', {kind: 'ghost sm', icon: 'fa-solid fa-filter-circle-xmark'}) : ''}</div></div>`;
  }

  // ---------- 0.31.0 Publish all changes (GM) ----------
  /** The locations Publish all changes would publish: shown (not Hidden), not archived, with saved edits players do not see yet. */
  unpublishedCount(list) { return list.filter(l => !l.archived && l.state !== 'hidden' && hasUnpublishedChanges(l)).length; }
  /** A band at the top of the list (not the header, and the toolbar stays one row). Disabled, with the reason, when nothing is waiting. */
  publishAllHtml(list) {
    const n = this.unpublishedCount(list);
    const why = n ? `Show players the saved changes of ${n} ${n === 1 ? 'location' : 'locations'}` : 'Nothing to publish: players already see every saved change';
    const h = btn('publish-all', 'Publish all changes…', {kind: 'sm', icon: 'fa-solid fa-bullhorn', title: why});
    return `<div class="agl-publishall" role="group" aria-label="Publish all changes">${n ? h : h.replace('<button ', '<button disabled aria-disabled="true" ')}
      <span class="agl-hint" role="status">${n ? `${n} ${n === 1 ? 'location has' : 'locations have'} saved changes players do not see yet.` : 'Players see every saved change.'}</span></div>`;
  }
  /** Asks first (and saves unsaved editor changes if the GM agrees), then publishes everything waiting in one write. */
  async publishAll() {
    if (!(await this.saveFirst('publish all changes'))) return;
    if (this.dirty && !(await this.saveDraft())) return;
    const n = this.unpublishedCount(api().listLocations({archived: 'exclude'}));
    if (!n) { ui.notifications.info('Nothing to publish.'); return this.render().then(() => this.focusBack('[data-action="publish-all"]')); }
    const noun = `${n} ${n === 1 ? 'location' : 'locations'}`;
    const ok = await confirmDialog(`Players will see the saved changes of ${noun} that are revealed or unidentified. Hidden locations stay hidden. Unsaved edits in the editor are not included.`,
      {title: `Publish ${noun}?`, yes: `Publish ${noun}`});
    if (!ok) return;
    const res = await api().publishAllLocations();
    if (this.draft?.id) this.select(this.draft.id);
    ui.notifications.info(`Published ${res.published} ${res.published === 1 ? 'location' : 'locations'}.`);
    await this.render();
    this.focusBack('[data-action="publish-all"]');
  }

  // ---------- 0.26.0 bulk select, Archive, Restore, Delete (GM) ----------
  archivedCount() { try { return api().countArchived(); } catch { return 0; } }
  /** The bar above the list while ticking: counts, Region and "Id starts with" narrowing, Select all shown, and the actions. */
  bulkBarHtml() {
    const n = this.picked.size, shown = this.shownIds.length, hidden = [...this.picked].filter(id => !this.shownIds.includes(id)).length;
    const region = this.fopts?.region ?? [];
    const act = (a, label, opts) => { const h = btn(a, label, {kind: 'sm', ...opts}); return n ? h : h.replace('<button ', '<button disabled '); };
    return `<div class="agl-bulk" role="group" aria-label="Select locations">
      <span class="agl-bulk__count" role="status" aria-live="polite">${n} selected${hidden ? ` (${hidden} not shown)` : ''} · ${shown} shown</span>
      <div class="agl-bulk__narrow"><label class="ag-field ag-field--inline agl-ctl"><span>Region</span><select data-filter="region" aria-label="Filter by region"><option value="">All</option>${region.map(o =>
        `<option value="${esc(o.value)}" ${this.filters.region === o.value ? 'selected' : ''}>${esc(o.label)} (${o.count})</option>`).join('')}</select></label>
        <label class="ag-field ag-field--inline agl-ctl"><span>Id starts with</span><input type="search" id="agl-prefix" value="${esc(this.idPrefix)}" placeholder="Start of an id, e.g. LOC-" autocomplete="off" spellcheck="false" aria-label="Show only locations whose id starts with"></label></div>
      <div class="ag-btn-group">${btn('bulk-all', `Select all ${shown} shown`, {kind: 'sm', icon: 'fa-solid fa-check-double'})}${btn('bulk-clear', 'Clear selection', {kind: 'ghost sm'})}
        ${this.showArchived ? act('bulk-restore', 'Restore…', {icon: 'fa-solid fa-box-open'}) : act('bulk-archive', 'Archive…', {icon: 'fa-solid fa-box-archive'})}${act('bulk-delete', 'Delete…', {kind: 'danger sm', icon: 'fa-solid fa-trash'})}</div></div>`;
  }
  /** After an Archive or Restore: what happened, with Undo (kept 30 seconds). */
  bulkUndoHtml() {
    const m = this.lastBulk;
    if (!m || !this.gm) return '';
    return `<div class="agl-undo" role="status"><span>${m.kind === 'archive' ? 'Archived' : 'Restored'} <strong>${m.ids.length}</strong> ${m.ids.length === 1 ? 'location' : 'locations'}.</span>${btn('undo-bulk', 'Undo', {kind: 'sm', icon: 'fa-solid fa-rotate-left'})}</div>`;
  }
  /** The detail pane while the Archived list is showing (archived locations are not edited in place). */
  archivedPanelHtml() {
    const n = this.archivedCount();
    return `<div class="ag-empty"><i class="fa-solid fa-box-archive" aria-hidden="true"></i><p class="ag-empty__title">${n ? `${n} archived ${n === 1 ? 'location' : 'locations'}` : 'Nothing is archived'}</p>
      <p class="ag-empty__text">Archived locations are off the Locations list and invisible to players. Their content, state and Party Notes are kept. Tick some and choose <strong>Restore…</strong> to bring them back, or <strong>Delete…</strong> to remove them for good.</p>
      ${btn('show-live', 'Back to Locations', {kind: 'sm', icon: 'fa-solid fa-arrow-left'})}</div>`;
  }
  /** Redraws only the bulk bar (a tick box changed), so focus and scroll stay where they are. */
  paintBar(root) {
    const old = root?.querySelector?.('.agl-bulk');
    if (!old) return;
    old.outerHTML = this.bulkBarHtml();
    const bar = root.querySelector('.agl-bulk');
    for (const el of bar.querySelectorAll('[data-action]')) el.addEventListener('click', ev => { ev.preventDefault(); this.onAction(el).catch(notifyError); });
    for (const el of bar.querySelectorAll('[data-filter]')) el.addEventListener('change', () => { this.filters[el.dataset.filter] = el.value; this.render(); });
    this.bindPrefix(bar.querySelector('#agl-prefix'));
  }
  bindPrefix(input) { input?.addEventListener('input', e => { this.idPrefix = e.target.value; this.searchSoon('#agl-prefix'); }); }
  /** A tick box changed. */
  onPick(el, root) { el.checked ? this.picked.add(el.dataset.pick) : this.picked.delete(el.dataset.pick); el.closest('.agl-row')?.classList?.toggle('is-picked', el.checked); this.paintBar(root); }
  /** Downloads the JSON file for these locations (the same package Export writes). */
  downloadPackage(pkg, name) {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], {type: 'application/json'});
    const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(blob), download: name});
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** Archive…, Restore… and Delete… on the ticked locations: preview first, one action, nothing written until the labelled button. */
  async bulkAction(kind) {
    if (!this.picked.size) return ui.notifications.warn('Tick one or more locations first.');
    let plan = api().previewBulk(kind, [...this.picked]);
    // Delete never leaves a place behind: offer to add the places inside, until none is left outside the selection.
    while (kind === 'delete' && plan.blocked.length) {
      const list = plan.blocked.map(b => `<li><strong>${esc(b.name)}</strong> has ${b.children.length} ${b.children.length === 1 ? 'place' : 'places'} inside it: ${esc(b.children.slice(0, 6).join(', '))}${b.children.length > 6 ? `, and ${b.children.length - 6} more` : ''}</li>`).join('');
      const choice = await choiceDialog('Places inside are not selected', `<p>A location cannot be deleted while places inside it stay behind.</p><ul>${list}</ul>`,
        [{action: 'add', label: 'Also select the places inside', icon: 'fa-solid fa-sitemap', default: true}], {cancel: 'Cancel'});
      if (choice !== 'add') return;
      for (const b of plan.blocked) for (const id of b.childIds) this.picked.add(id);
      plan = api().previewBulk(kind, [...this.picked]);
    }
    if (!plan.targets.length) return infoDialog('Nothing to change', `<ul>${plan.skipped.map(s => `<li><strong>${esc(s.name)}</strong>: ${esc(s.reason)}</li>`).join('')}</ul>`);
    const n = plan.targets.length, what = `${n} ${n === 1 ? 'location' : 'locations'}`, verb = BULK_VERBS[kind];
    if (this.draft?.id && plan.targets.some(t => t.id === this.draft.id) && !(await this.confirmDiscard())) return;
    const ids = plan.targets.map(t => t.id);
    if (kind === 'delete') {
      const ok = await choiceDialog(`Delete ${what}?`, previewHtml(plan), [{action: 'backup', label: 'Download backup, then continue…', icon: 'fa-solid fa-file-arrow-down', default: true}]);
      if (ok !== 'backup') return;
      this.downloadPackage(api().exportPackage({ids}), `ashen-gate-locations-backup-${ids.length}.json`);
      const sure = await confirmDanger(`The backup file was downloaded. ${what} will be deleted for good, with their map pins${plan.pins.some(p => p.managed) ? '' : ' (there are none placed)'}. This cannot be undone except by importing the backup.`,
        {title: `Delete ${what}?`, yes: `Delete ${what}`});
      if (!sure) return;
      const r = await api().deleteLocations(ids);
      this.picked = new Set([...this.picked].filter(id => !r.deleted.includes(id)));
      if (r.deleted.includes(this.selectedId)) this.select(null);
      if (r.pins.kept.length) await infoDialog('Some map pins were left', `<p>These pins were changed by hand in Foundry, so they were not removed. Delete them on the scene if you no longer need them.</p><ul>${r.pins.kept.map(k => `<li>${esc(k.name || 'Scene')}: ${k.count} ${k.count === 1 ? 'pin' : 'pins'}</li>`).join('')}</ul>`);
      ui.notifications.info(`Deleted ${r.deleted.length} ${r.deleted.length === 1 ? 'location' : 'locations'}${r.pins.removed ? ` and ${r.pins.removed} map ${r.pins.removed === 1 ? 'pin' : 'pins'}` : ''}. The backup file was downloaded.`);
      return this.render();
    }
    const go = await choiceDialog(`${verb[0]} ${what}?`, previewHtml(plan), [{action: 'go', label: `${verb[0]} ${what}`, icon: kind === 'archive' ? 'fa-solid fa-box-archive' : 'fa-solid fa-box-open', default: true}]);
    if (go !== 'go') return;
    const r = await (kind === 'archive' ? api().archiveLocations(ids) : api().restoreLocations(ids));
    const done = r.archived ?? r.restored;
    this.picked = new Set([...this.picked].filter(id => !done.includes(id)));
    if (kind === 'archive' && done.includes(this.selectedId)) this.select(null);
    clearTimeout(this.bulkTimer);
    this.lastBulk = {kind, ids: done};
    this.bulkTimer = setTimeout(() => { this.lastBulk = null; if (this.rendered) this.render().catch(notifyError); }, 30000);
    ui.notifications.info(`${verb[1]} ${done.length} ${done.length === 1 ? 'location' : 'locations'}.`);
    return this.render();
  }
  /** Undo for the last Archive or Restore. */
  async undoBulk() {
    const m = this.lastBulk;
    if (!m) return;
    clearTimeout(this.bulkTimer); this.lastBulk = null;
    await (m.kind === 'archive' ? api().restoreLocations(m.ids) : api().archiveLocations(m.ids));
    ui.notifications.info(`${m.kind === 'archive' ? 'Restored' : 'Archived'} ${m.ids.length} ${m.ids.length === 1 ? 'location' : 'locations'} again.`);
    return this.render();
  }
  /** Switches between the Locations list and the Archived list; asks before unsaved edits are lost. */
  async setArchivedView(on) {
    if (on === this.showArchived) return;
    if (!(await this.confirmDiscard())) return;
    this.showArchived = on; this.picked.clear(); this.select(null); this.lastBulk = null;
    await this.render(); this.focusBack('#agl-archived');
  }

  /** 0.33.0: the Travel button for a location, or '' when this user has no scene to travel to (the API decides, so a player never sees one for a hidden or unidentified place). */
  travelBtn(ref, kind = 'sm') {
    const n = ref ? travelCount(ref) : 0;
    return n ? btn('travel', travelLabel(n), {kind, icon: 'fa-solid fa-map', data: {ref}, title: n > 1 ? 'Choose a linked scene to view. Only you move.' : 'Views the linked scene. Only you move.'}) : '';
  }

  /** 0.35.0: the Travel row directly under a location's name (GM editor and player viewer), or '' when this user has no scene to go to. */
  travelRow(ref) { const t = this.travelBtn(ref); return t ? `<div class="agl-travel">${t}</div>` : ''; }

  /** 0.42.1: the Player Preview's Travel row: what a player's view of this previewed draft would offer (its travel-switched scenes, Revealed only), not the GM's every-linked-scene button. */
  previewTravelRow(v) {
    let n = 0;
    try { n = v?.state === 'revealed' && v.travelScenes?.length ? api().previewTravelCount(v.travelScenes) : 0; } catch { n = 0; }
    const ref = v?.key || v?.id;
    return n && ref ? `<div class="agl-travel">${btn('travel', travelLabel(n), {kind: 'sm', icon: 'fa-solid fa-map', data: {ref}, title: n > 1 ? 'Choose a linked scene to view. Only you move.' : 'Views the linked scene. Only you move.'})}</div>` : '';
  }

  // ---------- player viewer ----------
  viewerHtml(v, {partyNotes = true, preview = false} = {}) {
    if (!v) return '<div class="ag-empty"><p class="ag-empty__title">No place selected</p><p class="ag-empty__text">Pick a place from the list.</p></div>';
    const place = r => `${go(r.name, 'select', {id: r.key || r.id})}${r.id ? '' : ' <small>(unidentified)</small>'}`;
    const share = partyNotes ? this.shareHtml(v) : '';
    if (v.state === 'unidentified') return `<article class="agl-view">
      <div class="agl-title"><h2>${esc(v.name)}</h2><span class="ag-badge">Unidentified</span>${hereNow(v)}</div>${share}
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
      // 0.30.0: a name always; a link only where Foundry lets this player open the document (otherwise the name alone).
      npcs: card('People', ul((v.npcs ?? []).map(n => `${canOpen(n.uuid) ? link(n.label || 'Someone', n.uuid) : esc(n.label || 'Someone')}${n.note ? ` <small>${esc(n.note)}</small>` : ''}`))),
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
      <div class="agl-title"><h2>${esc(v.name)}</h2>${hereNow(v)}</div>
      ${preview ? this.previewTravelRow(v) : this.travelRow(v.key || v.id)}${share}
      ${v.threat ? `<p class="agl-meta agl-threat-row"><span class="agl-threat-label">Threat Level:</span> ${threatBadge(v.threat)}</p>` : ''}
      ${v.type || v.region ? `<p class="agl-meta">${[v.type, v.region].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
      ${v.parent && !crumbs.length ? `<p class="agl-meta">Part of ${place(v.parent)}</p>` : ''}
      ${v.img ? `<img class="agl-img" src="${esc(v.img)}" alt="">` : ''}
      ${(v.layout ?? normalizeLayout([], v.details ?? [])).map(k => blocks[k] ?? '').join('')}
      ${partyNotes && !this.gm ? this.shopsCardHtml(v) : ''}
      ${partyNotes ? this.partyNotesHtml(v.key) : ''}
    </article>`;
  }

  /**
   * 0.30.0, players: the shops the GM has shown to THIS player at this place (Utilities' own player-filtered list), each with Open shop.
   * Nothing when none; an unshown shop, a place the player cannot see or a missing or older Utilities add nothing.
   */
  shopsCardHtml(v) {
    const shops = shopsForPlayer(game.modules, v);
    if (!shops.length) return '';
    return `<section class="ag-card agl-shops" data-shops-card="1"><h3>Shops</h3><ul class="ag-list agl-entries">${shops.map(s => `<li><span class="agl-entry"><strong>${esc(s.name)}</strong>${s.merchant ? ` <small>${esc(s.merchant)}</small>` : ''}</span>
      ${btn('open-shop', s.kind === 'service' ? 'Open service' : 'Open shop', {kind: 'sm', icon: 'fa-solid fa-store', data: {id: s.id}, title: `Open ${s.name}`})}</li>`).join('')}</ul></section>`;
  }
  /** 0.30.0, GM: the "Shops here" card (Content tab). Utilities owns the shops; this lists those linked to this place and presents them. */
  shopsHereHtml(d) {
    const head = `<header class="ag-card__head"><h3>Shops here</h3><span class="agl-head-tools">${NOW}</span></header>`;
    const wrap = body => `<section class="ag-card agl-section agl-shops" data-shops-here="1">${head}${body}</section>`;
    if (!d.id) return wrap('<p class="agl-hint">Save the location first; then the shops linked to it are listed here.</p>');
    const {state} = shopsApiState(game.modules);
    if (state === 'inactive') return wrap('<p class="agl-hint">Activate Ashen Gate | Utilities to list and present the shops at this place.</p>');
    if (state === 'old') return wrap('<p class="agl-hint">Update Ashen Gate | Utilities to list the shops at this place.</p>');
    const {rows, state: got, error} = shopsHere(game.modules, d.id, {includeChildren: this.shopsChildren});
    const kids = `<label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-shops-children" ${this.shopsChildren ? 'checked' : ''}> Include places inside</label>`;
    if (got === 'error') return wrap(`<p class="agl-hint">Could not read the shops: ${esc(error)}</p>${kids}`);
    const list = rows.length ? `<ul class="ag-list agl-entries">${rows.map(r => `<li><span class="agl-entry"><strong>${esc(r.name)}</strong>${r.merchant ? ` <small>${esc(r.merchant)}</small>` : ''}
      <span class="ag-badge${r.presented ? ' ag-badge--ok' : ''}">${esc(r.shown)}</span></span><span class="agl-tools">
      ${btn('present-shop', 'Present…', {kind: 'sm', icon: 'fa-solid fa-eye', data: {id: r.id}, title: `Choose who sees ${r.name}`})}${r.presented ? `${btn('open-shop', 'Open', {kind: 'sm', icon: 'fa-solid fa-store', data: {id: r.id}, title: `Open ${r.name} as players see it`})}${btn('stop-shop', 'Stop showing', {kind: 'sm', icon: 'fa-solid fa-eye-slash', data: {id: r.id}, title: `Stop showing ${r.name} to players`})}` : ''}</span></li>`).join('')}</ul>`
      : `<p class="agl-hint">${this.shopsChildren ? 'No shops are linked to this place or the places inside it.' : 'No shops are linked to this place.'} Link a shop to a location in Utilities, in the shop's editor.</p>`;
    return wrap(`${list}${kids}<p class="agl-hint">Players see a shop on this location only while you present it to them. Present…, Stop showing and Open act at once (Open shows the shop as players see it, so it appears while the shop is shown); Save Changes is not needed.</p>`);
  }

  /** Players: who else sees a "Selected players" location, and Share with... when the GM allows it. */
  shareHtml(v) {
    if (!v?.share || this.gm) return '';
    const others = whoNames(v.share.userIds.filter(u => u !== game.user.id));
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
    const all = api().listLocations({archived: 'include'});
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
    // 0.32.0: Beasts are GM only, so their rows have no eye (there is nothing to show players).
    const entryTools = (key, e) => { const n = entryName(key, e); return `${btn('move-entry', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-up', data: {section: key, key: e.key, dir: -1}, title: `Move ${n} up`})}${btn('move-entry', '', {kind: 'ghost sm', icon: 'fa-solid fa-arrow-down', data: {section: key, key: e.key, dir: 1}, title: `Move ${n} down`})}${GM_ONLY_BLOCKS.includes(key) ? '' : eye(`${key}.${e.key}.visible`, e.visible, n)}${btn('remove', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {section: key, key: e.key}, title: `Remove ${n}`})}`; };
    const handle = (key, e) => `<span class="agl-handle" draggable="true" data-drag-entry="${esc(key)}:${esc(e.key)}" tabindex="0" role="button" aria-label="Move ${esc(entryName(key, e))}. Drag, or press Alt+Up or Alt+Down."${tip('Drag to reorder (Alt+Up / Alt+Down)')}><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>`;
    const docLink = (label, uuid) => uuid ? go(label, 'open-doc', {uuid}) : `<span>${esc(label)}</span>`;
    const rows = (key, fn) => d[key].length ? `<ul class="ag-list agl-entries">${d[key].map(e => `<li data-entry="${esc(key)}:${esc(e.key)}" class="${e.visible ? '' : 'agl-hidden'}">${handle(key, e)}${fn(e)}<span class="agl-tools">${entryTools(key, e)}</span></li>`).join('')}</ul>` : '';
    const addText = (key, placeholder) => `<input type="text" id="agl-add-${key}" placeholder="${placeholder}">${btn('add-text', 'Add', {kind: 'sm', data: {section: key}, icon: 'fa-solid fa-plus'})}`;
    const text = (bind, v, placeholder, aria) => `<input type="text" data-bind="${esc(bind)}" value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(aria)}">`;

    const nodes = nodeTemplates();
    const resources = d.resources.length ? `<datalist id="agl-skills">${GATHERING.skills.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <ul class="ag-list agl-nodes">${d.resources.map(e => isNodeRef(e) ? this.nodeRefHtml(e, nodes, entryTools, handle) : this.nodeHtml(e, entryTools, handle)).join('')}</ul>` : '';
    const factions = rows('factions', e => `<span class="agl-entry">${docLink(e.label, e.uuid)}</span>`);
    // 0.30.0: People here. Rows are the links on this location; the suggestions come from General Manager's NPC records (one click to link).
    const relinks = new Map(relinkPlan(d.npcs, worldPeopleDocs(), uuid => !!docName(uuid)).map(r => [r.key, r]));
    const npcRows = rows('npcs', e => {
      const name = e.uuid ? docName(e.uuid) : '';
      const re = relinks.get(e.key);
      return `<span class="agl-entry agl-npc">${name ? docLink(name, e.uuid) : `<span>${esc(e.label || 'This person')}</span> <small>(not found in this world)</small>`}
        ${text(`npcs.${e.key}.label`, e.label, 'Name shown to players', `Name shown to players for ${name || e.label || 'this person'}`)}
        ${text(`npcs.${e.key}.note`, e.note, 'Short note shown to players (optional)', `Note shown to players for ${name || e.label || 'this person'}`)}
        ${re ? btn('relink-npc', `Re-link to ${re.name}`, {kind: 'sm', icon: 'fa-solid fa-link', data: {key: e.key}, title: 'The linked document is gone, but a document with the same NPC record now exists'}) : ''}</span>`;
    });
    const suggestions = d.id ? npcSuggestions(worldActors(), d.id, d.npcs) : [];
    const suggestHtml = suggestions.length ? `<div class="agl-suggest"><p class="agl-hint">From your imported NPC records:</p><ul class="ag-list agl-entries">${suggestions.map(sg =>
      `<li><span class="agl-entry"><strong>${esc(sg.name)}</strong> <small>${sg.placed ? 'Its record places it here' : 'Its record only mentions this place'}</small></span>
        <span class="agl-tools">${btn('link-npc', `Link ${sg.name}`, {kind: 'sm', icon: 'fa-solid fa-link', data: {uuid: sg.uuid}})}</span></li>`).join('')}</ul></div>` : '';
    const linkedUuids = new Set(d.npcs.map(n => n.uuid)), linkedIds = new Set(d.npcs.map(n => n.sourceId).filter(Boolean));
    const npcChoices = actorChoices(linkedUuids, linkedIds);
    const npcAdd = `${suggestHtml}<select id="agl-add-npcs" aria-label="Person to link"><option value="">${npcChoices.length ? 'Choose a person…' : 'No other NPC characters in this world'}</option>${npcChoices.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join('')}</select>${btn('add-npc', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}`;
    // 0.32.0: Beasts (GM only). The same Actor picker and drop as People; no eye, no player toggle, and nothing here is ever published.
    const beastRows = rows('beasts', e => {
      const name = e.uuid ? docName(e.uuid) : '';
      return `<span class="agl-entry agl-npc">${name ? docLink(name, e.uuid) : `<span>${esc(e.label || 'This creature')}</span> <small>(not found in this world)</small>`}
        ${text(`beasts.${e.key}.note`, e.note, 'Short note for you (optional)', `Note for ${name || e.label || 'this creature'}`)}</span>`;
    });
    const beastChoices = actorChoices(new Set(d.beasts.map(n => n.uuid)), new Set(d.beasts.map(n => n.sourceId).filter(Boolean)), BEAST_ID);
    const beastAdd = `<select id="agl-add-beasts" aria-label="Creature to link"><option value="">${beastChoices.length ? 'Choose a creature…' : 'No other NPC actors in this world'}</option>${beastChoices.map(a => `<option value="${esc(a.uuid)}">${esc(a.name)}</option>`).join('')}</select>${btn('add-beast', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}`;
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
      description: block('description', 'Description', 'Description', `<div class="agl-field__row"><textarea id="agl-description" rows="6" data-bind="description" aria-label="Description" placeholder="A few sentences on what this place looks and feels like.">${esc(d.description)}</textarea>${eye('show.description', d.show.description, 'Description')}</div><p class="agl-hint">A few sentences on what this place looks and feels like. Players read it first, once the location is Revealed, Published and the eye is open.</p>`, '', ''),
      conditions: sec('conditions', conditions, `${addText('conditions', 'Condition name')}`, passesConditions(d) ? 'No conditions yet. Those you add here apply to every place inside this Region.' : 'No conditions. Places inside a Region that passes its conditions down show them here.'),
      children: this.childrenHtml(d, all, block),
      resources: sec('resources', resources, this.nodePickHtml(nodes), 'Drop material Items here, or click Add node… for a Profession Ledger node template or a custom gathering node.'),
      factions: sec('factions', factions, addText('factions', 'Custom faction name'), 'Drop Actors or Journals here, or add a custom faction.'),
      npcs: sec('npcs', npcRows, npcAdd, 'Drop an NPC Actor or Journal here, or choose one. Each person stays hidden from players until you turn on its eye and show this section.'),
      beasts: block('beasts', 'Beasts', 'Beasts', `${beastRows || '<p class="agl-hint">Drop a creature Actor here, or choose one.</p>'}<div class="agl-add">${beastAdd}</div>`, '<span class="agl-hint">GM only. Creatures that may roam here; players never see this list.</span>'),
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
          ${fld('region', this.regionSelectHtml(d, all))}
          ${fld('threat', `<select id="agl-threat" data-bind="threat">${THREATS.map(t => `<option value="${t.value}" ${d.threat === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}</select>${threatBadge(d.threat)}`)}
          ${fld('img', `${d.img ? `<img class="agl-thumb" src="${esc(d.img)}" alt="">` : ''}<input id="agl-img" type="text" data-bind="img" value="${esc(d.img)}" placeholder="path/to/image.webp">${btn('browse-img', '', {icon: 'fa-solid fa-folder-open', title: 'Browse for an image'})}`)}
        </div>
        ${order.filter(k => k !== 'scenes').map(k => blocks[k] ?? '').join('')}
        ${this.shopsHereHtml(d)}
        ${this.overlandConditionsHtml(d, all)}
        <div class="agl-add agl-add-detail">${btn('add-detail', 'Add detail', {kind: 'sm', icon: 'fa-solid fa-plus', title: 'A custom block on this location: a title, text and an optional linked document'})}
          <span class="agl-hint">Drag the grip, or use the arrows (Alt+Up / Alt+Down on a grip), to reorder blocks and the entries in them. Players see published blocks in this order.</span></div>`,
      visibility: `${this.audienceHtml(d)}${this.placeHtml(d, all, pins)}${this.markerHtml(d, all)}${this.scenesHtml(d)}`,
      party: d.id ? this.partyNotesHtml(d.id, {gmHint: d.state === 'hidden' ? ' Players cannot see or edit them while this location is hidden.' : ''})
        : '<p class="agl-hint">Party Notes appear here once the location is saved. Players write them; Save Changes never changes them.</p>'
    };
    return `<form class="agl-editor" data-editor="location" autocomplete="off" onsubmit="return false">
      <div class="agl-editor__head">
        <nav class="agl-crumbs" aria-label="Where this is">${crumbs.length ? crumbs.map(c => `${go(c.name, 'select', {id: c.id})} <span aria-hidden="true">›</span> `).join('') : '<span class="agl-hint">Top level ›</span> '}
          <span>${esc(d.name || 'New location')}</span></nav>
        <div class="ag-btn-group">${d.id ? `<button type="button" class="ag-btn ag-btn--sm agl-activebtn${d.active ? ' ag-btn--primary' : ''}" data-action="toggle-active" aria-pressed="${d.active === true}"${tip(d.active ? 'The party is here now. Click to mark this place not active' : 'Mark this place as where the party is now. Applies at once')}><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${d.active ? 'Active' : 'Not active'}</button>` : ''}${d.id ? btn('show-players', 'Show to Players', {kind: 'sm', icon: 'fa-solid fa-bullseye', title: 'Opens this location in every other player\'s Locations window'}) : ''}${placeable ? btn('place', 'Place on Scene', {kind: 'sm', icon: 'fa-solid fa-map-pin', title: 'Adds a Map Note at the centre of your current view'}) : ''}${d.id ? `${btn('move-to', 'Move to…', {kind: 'sm', icon: 'fa-solid fa-folder-tree', title: 'Put this location inside a Region (or at the top level). Keyboard-friendly.'})}${btn('delete', 'Delete location', {kind: 'danger sm', icon: 'fa-solid fa-trash'})}` : ''}</div>
      </div>
      <div class="agl-title">
        <div class="ag-field agl-name"><label for="agl-name">Name</label><input id="agl-name" type="text" data-bind="name" value="${esc(d.name)}" placeholder="Location name"></div>
        ${stateBar}
      </div>
      ${d.id ? this.travelRow(d.id) : ''}
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
    const names = new Map(api().listLocations({archived: 'include'}).map(l => [l.id, l.name]));
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

  /**
   * 0.40.0, GM only: PERSISTENT travel conditions on this place (Travel's six conditions, 0 to 3). "Inherit" leaves a condition unset here so the nearest
   * Region above decides; 0 clears whatever a Region sets. Part of the draft (Save Changes); never published, never in a player view or export.
   */
  overlandConditionsHtml(d, all = []) {
    const own = d.overlandConditions ?? {};
    const inh = d.parentLocationId ? effectiveLocationConditions('LOC-DRAFT-PROBE', [...all, {id: 'LOC-DRAFT-PROBE', parentLocationId: d.parentLocationId}]) : null;
    const row = c => {
      const set = c.id in own, value = own[c.id];
      const note = set ? '' : inh?.sources?.[c.id] ? `Inherited from ${inh.sources[c.id].name}: ${inh.severities[c.id]}` : 'Not set above: 0';
      const seg = (label, val, on) => `<button type="button" aria-pressed="${on}" data-action="oc-set" data-cond="${c.id}" data-val="${val}" aria-label="${esc(c.label)} ${val === '' ? 'inherit from the Region above' : `persistent severity ${val}`}">${label}</button>`;
      return `<li class="agl-tile agl-oc"><span class="agl-oc__name">${esc(c.label)}</span><span class="ag-segmented" role="group" aria-label="${esc(c.label)} persistent severity">${seg('Inherit', '', !set)}${[0, 1, 2, 3].map(n => seg(n, n, set && value === n)).join('')}</span>${note ? `<small class="agl-hint">${esc(note)}</small>` : ''}</li>`;
    };
    return `<section class="ag-card agl-section"><header class="ag-card__head"><h3>Travel conditions here</h3><span class="agl-hint">GM only. Players never see these.</span></header>
      <ul class="agl-oc-list" aria-label="Persistent travel conditions">${OVERLAND_CONDITIONS.map(row).join('')}</ul>
      <p class="agl-hint">Conditions that belong to this place (a haunted marsh, a blighted pass). The Travel tab combines them with the day's weather: the higher one counts. Places inside a Region inherit its values unless they set their own; the nearest place that sets one wins.</p></section>`;
  }

  /** Unidentified label/teaser and pin art. Pins use native Note image/size; edits to a placed Note win. */
  markerHtml(d, all = []) {
    const world = setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL);
    // 0.25.0: what this place gets from the Regions above it when it sets nothing itself (then the world setting, then Foundry's icons).
    const inh = inheritedPin(d.parentLocationId, all, d.id);
    const fallbackImg = inh.img || PIN_DEFAULTS.img, fallbackUnk = inh.unidentifiedImg || setting('unknownPinImage', '') || PIN_DEFAULTS.unidentifiedImg, fallbackSize = inh.size || PIN_DEFAULTS.size;
    const path = (f, label, placeholder, scope = 'pin') => `<div class="ag-field agl-field"><label for="agl-${scope}-${f}">${label}</label><div class="agl-field__row">
      <input id="agl-${scope}-${f}" type="text" data-bind="${scope}.${f}" value="${esc(d[scope][f])}" placeholder="${esc(placeholder)}">${btn('browse-pin', '', {icon: 'fa-solid fa-folder-open', title: `Browse for the ${label.toLowerCase()}`, data: {field: f, scope}})}</div></div>`;
    return `<section class="ag-card agl-section">
      <header class="ag-card__head"><h3>Unidentified Marker &amp; Pin</h3></header>
      <div class="ag-form-grid">
        <div class="ag-field agl-field"><label for="agl-unid">Unidentified label</label><input id="agl-unid" type="text" data-bind="unidentifiedLabel" value="${esc(d.unidentifiedLabel)}" placeholder="${esc(world)} (world default)"></div>
        <div class="ag-field agl-field"><label for="agl-pin-size">Pin size</label><input id="agl-pin-size" type="number" min="16" max="256" step="1" data-bind="pin.size" value="${d.pin.size || ''}" placeholder="${fallbackSize}" ${d.pinKeepProportions && d.pinBannerWidth ? 'disabled' : ''}>
          <small class="agl-hint" id="agl-pin-size-note" ${d.pinKeepProportions && d.pinBannerWidth ? '' : 'hidden'}>Using Banner width</small></div>
      </div>
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="pinKeepProportions" ${d.pinKeepProportions ? 'checked' : ''}> Keep pin art proportions</label>
      <p class="agl-hint">Draws the pin wider or taller to match the image. Pin size sets the height.</p>
      ${d.pinKeepProportions ? `<div class="ag-field agl-field"><label for="agl-banner-width">Banner width (px)</label><div class="agl-field__row">
        <input id="agl-banner-width" type="number" min="${BANNER_WIDTH.min}" max="${BANNER_WIDTH.max}" step="${BANNER_WIDTH.step}" data-bind="pinBannerWidth" value="${d.pinBannerWidth || ''}" placeholder="Off">
        <input id="agl-banner-range" type="range" min="${BANNER_WIDTH.min}" max="${BANNER_WIDTH.max}" step="${BANNER_WIDTH.step}" data-bind="pinBannerWidth" value="${d.pinBannerWidth || BANNER_WIDTH.min}" aria-label="Banner width slider"></div></div>
      <p class="agl-hint">Leave empty to use Pin size as the height. With a width, the pin is that wide and the height follows the image. <span id="agl-banner-drawn" data-size="${d.pin.size || fallbackSize}" data-img="${esc(d.pin.img || fallbackImg)}"></span></p>
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="pinShowNameWithProportions" ${d.pinShowNameWithProportions ? 'checked' : ''}> Show the name under the pin</label>
      <p class="agl-hint">The wide art usually carries the name, so it is hidden by default.</p>` : ''}
      <div class="ag-field agl-field"><label for="agl-teaser">Teaser (players see this while unidentified)</label><textarea id="agl-teaser" rows="2" data-bind="teaser" placeholder="Optional, e.g. Smoke rises beyond the ridge.">${esc(d.teaser)}</textarea></div>
      <div class="ag-form-grid">
        ${path('img', 'Pin image (revealed)', fallbackImg)}
        ${path('unidentifiedImg', 'Pin image (hidden / unidentified)', fallbackUnk)}
      </div>
      <h4 class="agl-subhead">Default pin for places inside this one</h4>
      <p class="agl-hint">Any place inside this one (and inside those) uses these when it has no pin image or size of its own. A place's own value always wins, and the nearest place above it that sets one is used. GM only; players never receive these.</p>
      <div class="ag-form-grid">
        ${path('img', 'Default pin image (revealed)', fallbackImg, 'childPin')}
        ${path('unidentifiedImg', 'Default pin image (hidden / unidentified)', fallbackUnk, 'childPin')}
        <div class="ag-field agl-field"><label for="agl-childPin-size">Default pin size</label><input id="agl-childPin-size" type="number" min="16" max="256" step="1" data-bind="childPin.size" value="${d.childPin.size || ''}" placeholder="${fallbackSize}"></div>
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
      ${a.mode === 'selected' ? `<label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-action-change="audience-others" ${a.othersUnidentified ? 'checked' : ''}> Everyone else sees it as unidentified</label>
      <p class="agl-hint">Players you did not pick see an unidentified marker at the same spot instead of nothing; they cannot open the real page. A Hidden location still shows nobody anything.</p>` : ''}
      <p class="agl-hint">${a.mode === 'selected' ? `Only ticked players get this card, its pins and its Party Notes, and only while it is Unidentified or Revealed. ${a.othersUnidentified ? 'Everyone else sees only an unidentified marker.' : 'Everyone else sees nothing, exactly as if it were Hidden.'}` : 'Every player sees it once it is Unidentified or Revealed.'}</p>
    </section>`;
  }

  /** 0.32.1: the Region drop-down: every Region's name once, "No region", and the record's current text kept (as "(custom)") when it names no Region. Stores the plain name. */
  regionSelectHtml(d, all) {
    const names = regionNames(all), cur = d.region || '';
    const custom = cur && !names.includes(cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (custom)</option>` : '';
    return `<select id="agl-region" data-bind="region"><option value="">No region</option>${custom}${names.map(n =>
      `<option value="${esc(n)}" ${cur === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  }
  /** Where this location sits (parent), whether it is a Region (a folder) and whether it goes on maps. Fixed at the top. */
  placeHtml(d, all, pins = []) {
    const byId = new Map(all.map(l => [l.id, l]));
    const parents = parentMap(all.filter(l => l.id !== d.id));
    // 0.32.1: only Regions are offered (same list as Move to…). The current parent stays listed and selected even when it is not a Region, so opening a record never changes it.
    const choices = regionChoices(all, d.id);
    const names = choices.reduce((m, c) => m.set(c.loc.name, (m.get(c.loc.name) ?? 0) + 1), new Map());
    const cur = d.parentLocationId, curLoc = byId.get(cur);
    const kept = curLoc && !choices.some(c => c.loc.id === cur) && curLoc.id !== d.id
      ? `<option value="${esc(cur)}" selected>${esc(curLoc.name)} (not a Region)</option>` : '';
    const missing = cur && !curLoc ? `<option value="${esc(cur)}" selected>Deleted location (deleted)</option>` : '';
    const parentSel = `<select id="agl-parent" data-bind="parentLocationId"><option value="">None (top level)</option>${missing}${kept}${choices.map(({loc, path}) =>
      `<option value="${esc(loc.id)}" ${cur === loc.id ? 'selected' : ''}>${esc(names.get(loc.name) > 1 ? path : loc.name)}</option>`).join('')}</select>`;
    return `<section class="ag-card agl-section">
      <header class="ag-card__head"><h3>Place</h3><span class="agl-hint">GM only</span></header>
      <div class="ag-field agl-field"><label for="agl-parent">Inside</label>${parentSel}</div>
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-toggle="isRegion" ${d.isRegion ? 'checked' : ''}> This is a Region (a folder)</label>
      <p class="agl-hint">A Region is a container: in Tree view it is a folder other places can go in, to any depth. The <em>Inside</em> list shows Regions. To put a place inside one that is not a Region, first tick <em>This is a Region (a folder)</em> on that container.</p>
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
    const linked = new Set(d.sceneUuids), travelOn = new Set(d.travelSceneUuids ?? []);
    const sceneRows = d.sceneUuids.length ? `<ul class="ag-list agl-entries">${d.sceneUuids.map(u => `<li><span class="agl-entry">${esc(sceneName(u) ?? 'Linked scene (missing)')}</span>
      <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" data-travel-scene="${esc(u)}" ${travelOn.has(u) ? 'checked' : ''}> Players can travel here</label>
      <span class="agl-tools">${btn('open-scene', 'Open scene', {kind: 'sm', icon: 'fa-solid fa-map', data: {uuid: u}, title: 'Views the scene for you only. Players are not moved.'})}${btn('remove-scene', '', {kind: 'ghost sm', icon: 'fa-solid fa-trash', data: {uuid: u}, title: `Unlink ${sceneName(u) ?? 'this scene'}`})}</span></li>`).join('')}</ul>` : '';
    const sceneOpts = [...(game.scenes ?? [])].filter(sc => !linked.has(sc.uuid)).sort((a, b) => a.name.localeCompare(b.name))
      .map(sc => `<option value="${esc(sc.uuid)}">${esc(sc.name)}</option>`).join('');
    return `<section class="ag-card agl-section"><header class="ag-card__head"><h3>Linked Scenes</h3><span class="agl-hint">GM only</span></header>${sceneRows}
      <div class="agl-add"><select id="agl-add-scene" aria-label="Scene to link"><option value="">Choose a scene…</option>${sceneOpts}</select>${btn('add-scene', 'Link', {kind: 'sm', icon: 'fa-solid fa-link'})}</div>
      <p class="agl-hint">Players never see this card. Open scene never switches players. <em>Players can travel here</em> (off by default) lets players right-click this location's pin, or use <em>Travel</em> in the Locations window, to view that scene for themselves; it reaches them at Publish, only while the location is Revealed, and only for scenes Foundry lets them view (a scene's Navigation or Observer permission is yours to set in the scene's settings). You can always travel to any linked scene.</p></section>`;
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
    const {look, nameMode, nameSize, wrap, nameOffset} = readPinLook();
    return `<div class="agl-setup">
      <div class="agl-setup__body">
      <section class="ag-card"><h3>Player Access</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-set-access" ${access ? 'checked' : ''}> Players can open Locations</label>
        <p class="agl-hint">Shows the Locations button in the players' Actors sidebar. Players only ever see revealed locations and the parts you mark visible.</p></section>
      <section class="ag-card"><h3>Travel</h3>
        <label class="ag-field ag-field--inline agl-switch"><input type="checkbox" id="agl-set-travel" ${travelForPlayers() ? 'checked' : ''}> Travel for players</label>
        <p class="agl-hint">Shows the Travel tab to players: the day, the actions left, buttons to ask for an action, and the journal. Off by default. Players never see conditions, party modifiers or your notes.</p></section>
      <section class="ag-card"><h3>Unidentified Pins</h3>
        <div class="ag-field agl-field"><label for="agl-set-label">Default unidentified label</label><input id="agl-set-label" type="text" value="${esc(setting('unidentifiedLabel', DEFAULT_UNIDENTIFIED_LABEL))}"></div>
        <div class="ag-field agl-field"><label for="agl-set-unknown">Default unidentified pin image</label><div class="agl-field__row"><input id="agl-set-unknown" type="text" value="${esc(setting('unknownPinImage', ''))}" placeholder="${PIN_DEFAULTS.unidentifiedImg}">${btn('browse-setup', '', {icon: 'fa-solid fa-folder-open', title: 'Browse for the default pin image'})}</div></div>
        <p class="agl-hint">Used when a location has no label or image of its own. Saving re-labels existing unidentified pins.</p></section>
      <section class="ag-card"><h3>Map Pins</h3>
        <div class="ag-field agl-field"><label for="agl-set-pinlook">Pin look</label><select id="agl-set-pinlook">${Object.entries(PIN_LOOKS).map(([v, t]) => `<option value="${v}"${look === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="ag-field agl-field"><label for="agl-set-pinname">Name under the pin</label><select id="agl-set-pinname">${Object.entries(NAME_MODES).map(([v, t]) => `<option value="${v}"${nameMode === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div class="ag-field agl-field"><label for="agl-set-pinsize">Name size (pixels)</label><input id="agl-set-pinsize" type="number" min="${NAME_SIZE.min}" max="${NAME_SIZE.max}" step="1" value="${nameSize}"></div>
        <div class="ag-field agl-field"><label for="agl-set-pinwrap">Wrap the name after (characters)</label><input id="agl-set-pinwrap" type="number" min="0" max="${WRAP.max}" step="1" value="${wrap}"></div>
        <div class="ag-field agl-field"><label for="agl-set-pinoffset">Name distance from the pin (pixels)</label><input id="agl-set-pinoffset" type="number" min="${OFFSET.min}" max="${OFFSET.max}" step="1" value="${nameOffset}"></div>
        <p class="agl-hint">Distance: negative numbers move the name closer to the pin. ${OFFSET.min} to ${OFFSET.max}; 0 is Foundry's own spot, and the name never goes past the pin's edge. Try -8.</p>
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
  /** 0.39.0: the Travel tab (0.37.0 to 0.38.0: the GM-only Overland tab). A player's markup is built from publicState() alone; the service re-checks the GM on every GM read and change. */
  travelPane() {
    try {
      if (!overland()) throw new Error('Travel is unavailable.');
      const o = api().overland;
      if (this.gm) {
        // 0.40.0: a Direct button or a request opens the Action preview first; nothing is spent until Resolve.
        let preview = null;
        if (this.travelPreview) {
          try { preview = o.previewAction(this.travelPreviewRequest()); } catch (err) { this.travelPreview = null; ui.notifications?.warn(err?.message ?? String(err)); }
        }
        return travelHtml({state: o.state(), mods: o.partyModifiers(), gm: true, userId: game.user?.id ?? '', text: this.travelText ?? '', preview, pv: this.travelPreview ?? {},
          areas: overland().areas(), scope: this.travelScope ?? 'all'}, {esc, btn, tip, now: NOW});
      }
      return travelHtml({state: o.publicState(), gm: false, userId: game.user?.id ?? ''}, {esc, btn, tip, now: NOW});
    } catch (err) {
      return `<div class="ag-empty"><i class="fa-solid fa-person-hiking" aria-hidden="true"></i><p class="ag-empty__title">Travel can't be shown</p><p class="ag-empty__text">${esc(err?.message ?? String(err))}</p></div>`;
    }
  }
  /** The request the open Action preview stands for (same shape previewAction and resolveAction take). */
  travelPreviewRequest() {
    const p = this.travelPreview;
    return {action: p.action, destination: p.destination || undefined, terrain: p.terrain || undefined, override: p.override ?? undefined, requestUserId: p.requestUserId ?? undefined,
      ...(p.reached ? {reached: p.reached} : {})};
  }
  /** Opens (or changes) the Action preview; a changed input drops an adjusted cost. */
  async travelPreviewSet(patch, selector) {
    const next = {action: 'travel', destination: '', terrain: '', override: null, requestUserId: null, cost: null, ...this.travelPreview, ...patch};
    const before = this.travelPreview;
    this.travelPreview = next;
    try { api().overland.previewAction(this.travelPreviewRequest()); } catch (err) { this.travelPreview = before ?? null; ui.notifications?.warn(err?.message ?? String(err)); }   // the API refuses a non-GM here
    await this.redrawTravel(selector);
  }
  /**
   * 0.43.1: after a Travel change, redraws only the Travel pane in place (header, tabs and window stay), so the scroll position and focus
   * do not move. Falls back to a full render when the Travel tab is not the one showing.
   */
  async redrawTravel(selector) {
    const pane = this.element?.querySelector?.('#agl-pane');
    if (this.tab !== 'travel' || !pane || !this.rendered) { await this.render(); return this.focusBack(selector); }
    keepScroll(pane, () => { pane.innerHTML = this.travelPane(); try { this.bind(pane); } catch (err) { console.warn(`${MODULE_ID} | Travel pane bind`, err); } });
    this.focusBack(selector);
  }
  /** One Travel change (Travel, Scout, Explore, Resolve, Undo, New day, a switch, a journal edit): applies at once, then the tab redraws with focus back on the same control. */
  async travelDo(selector, run) {
    try { await run(overland()); } catch (err) { ui.notifications?.warn(err?.message ?? String(err)); }
    await this.redrawTravel(selector);
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
    const offRaw = root?.querySelector('#agl-set-pinoffset')?.value;
    if (offRaw !== undefined && offRaw !== '' && offsetOf(offRaw) !== readPinLook().nameOffset) await game.settings.set(MODULE_ID, 'pinNameOffset', offsetOf(offRaw));
    const wrapRaw = root?.querySelector('#agl-set-pinwrap')?.value;
    if (wrapRaw !== undefined && wrapRaw !== '' && wrapOf(wrapRaw) !== readPinLook().wrap) await game.settings.set(MODULE_ID, 'pinNameWrap', wrapOf(wrapRaw));
    if (pinName !== readPinLook().nameMode) await game.settings.set(MODULE_ID, 'pinNameMode', pinName);
    const showOpen = root?.querySelector('#agl-set-showopen')?.checked === true;
    if (root?.querySelector('#agl-set-showopen') && showOpen !== showOpens()) await game.settings.set(MODULE_ID, 'showOpensWindow', showOpen);
    const travelOn = root?.querySelector('#agl-set-travel')?.checked === true;
    if (root?.querySelector('#agl-set-travel') && travelOn !== travelForPlayers()) await game.settings.set(MODULE_ID, 'travelForPlayers', travelOn);
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
    root.querySelector('#agl-groupby')?.addEventListener('change', e => { this.groupBy = e.target.value; this.arrangedFor = undefined; this.render(); });
    root.querySelector('#agl-sort')?.addEventListener('change', e => { this.sort = e.target.value; this.render(); });
    root.querySelector('#agl-sortdir')?.addEventListener('click', () => { this.sortDesc = !this.sortDesc; this.render(); });
    root.querySelector('#agl-select')?.addEventListener('click', async () => { this.picking = !this.picking; if (!this.picking) this.picked.clear(); await this.render(); this.focusBack('#agl-select'); });
    root.querySelector('#agl-archived')?.addEventListener('click', () => this.setArchivedView(!this.showArchived).catch(notifyError));
    this.bindPrefix(root.querySelector('#agl-prefix'));
    for (const el of root.querySelectorAll('[data-pick]')) el.addEventListener('change', () => this.onPick(el, root));
    root.querySelector('#agl-tree')?.addEventListener('click', async () => { this.treeMode = !this.treeMode; this.arrangedFor = undefined; await this.render(); this.focusBack('#agl-tree'); });
    root.querySelector('#agl-showrep')?.addEventListener('change', e => { this.showRep = e.target.checked; this.render(); });
    root.querySelector('#agl-shops-children')?.addEventListener('change', e => { this.shopsChildren = e.target.checked; this.render(); });
    for (const el of root.querySelectorAll('[data-filter]')) el.addEventListener('change', () => { this.filters[el.dataset.filter] = el.value; this.render(); });
    for (const el of root.querySelectorAll('[data-action]')) el.addEventListener('click', ev => { ev.preventDefault(); this.onAction(el).catch(notifyError); });
    root.querySelector('#agl-party-text')?.addEventListener('input', e => { if (this.notesEdit) { this.notesEdit.text = e.target.value; this.renewNotesLock(); } });
    // 0.33.0: right-click (or the context-menu key) on a row offers Travel when the API says there is a scene to go to. The button under the name in the detail is the always-visible way.
    for (const row of root.querySelectorAll('.agl-row[data-action="select"]')) row.addEventListener('contextmenu', ev => onRowContextMenu(ev, row.dataset.id));
    root.querySelector('#agl-ov-mounted')?.addEventListener('change', e => this.travelDo('#agl-ov-mounted', s => s.setMounted(e.target.checked)));
    root.querySelector('#agl-ov-announce')?.addEventListener('change', e => this.travelDo('#agl-ov-announce', s => s.setAnnounce(e.target.checked)));
    root.querySelector('#agl-ov-text')?.addEventListener('input', e => { this.travelText = e.target.value; });
    root.querySelector('#agl-ov-area')?.addEventListener('change', e => this.travelDo('#agl-ov-area', s => s.setArea(e.target.value || null)));
    root.querySelector('#agl-pv-dest')?.addEventListener('change', e => this.travelPreviewSet({destination: e.target.value, reached: '', terrain: '', cost: null}, '#agl-pv-dest'));
    root.querySelector('#agl-pv-terrain')?.addEventListener('change', e => this.travelPreviewSet({terrain: e.target.value, cost: null}, '#agl-pv-terrain'));
    root.querySelector('#agl-pv-reached')?.addEventListener('change', e => this.travelPreviewSet({reached: e.target.value}, '#agl-pv-reached'));
    root.querySelector('#agl-pv-ovc')?.addEventListener('change', e => this.travelPreviewSet({override: e.target.value ? {condition: e.target.value, severity: this.travelPreview?.override?.severity ?? 1} : null, cost: null}, '#agl-pv-ovc'));
    if (!this.gm) return;
    for (const el of root.querySelectorAll('[data-travel-scene]')) el.addEventListener('change', () => {
      const set = new Set(this.draft.travelSceneUuids ?? []);
      if (el.checked) set.add(el.dataset.travelScene); else set.delete(el.dataset.travelScene);
      this.draft.travelSceneUuids = [...set]; this.dirty = true; this.render();
    });
    this.showDrawnSize(root);
    for (const el of root.querySelectorAll('[data-bind]')) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (el.dataset.bind === 'parentLocationId') this.draft.region = regionAfterParentChange(api().listLocations(), this.draft, el.value);   // 0.32.1
      this.setPath(el.dataset.bind, el.value);
      if (el.dataset.bind === 'pinBannerWidth') this.syncBanner(root, el);
      else if (el.dataset.bind === 'pin.size') this.showDrawnSize(root);
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
      setDragging(row.dataset.dragType || 'AshenGateLocation');
    });
    for (const row of root.querySelectorAll('.agl-row[draggable]')) row.addEventListener('dragend', () => setDragging(null));
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
  /** 0.27.1: keeps the Banner width number and slider in step, greys Pin size while a width is set, and refreshes the 'Draws about' text. No re-render, so focus stays. */
  syncBanner(root, from) {
    const w = Number(this.draft.pinBannerWidth) || 0;
    const num = root.querySelector('#agl-banner-width'), range = root.querySelector('#agl-banner-range');
    if (num && num !== from) num.value = w || '';
    if (range && range !== from) range.value = w || BANNER_WIDTH.min;
    const size = root.querySelector('#agl-pin-size'); if (size) size.disabled = w > 0;
    const note = root.querySelector('#agl-pin-size-note'); if (note) note.hidden = !(w > 0);
    this.showDrawnSize(root);
  }
  /** The 'Draws about 320 x 80' text, from the image's natural size once it has loaded (nothing is shown until then). */
  showDrawnSize(root) {
    const out = root.querySelector('#agl-banner-drawn'); if (!out) return;
    const img = out.dataset.img, size = Number(root.querySelector('#agl-pin-size')?.value) || Number(out.dataset.size) || PIN_DEFAULTS.size;
    const paint = dims => { const s = dims && drawnSize({size, width: Number(this.draft.pinBannerWidth) || 0, texW: dims.w, texH: dims.h}); out.textContent = s ? `Draws about ${s.w} x ${s.h}.` : ''; };
    const cached = (this._imgDims ??= new Map()).get(img);
    if (cached) return paint(cached);
    if (!img || typeof Image === 'undefined') return;
    const el = new Image();
    el.onload = () => { const dims = {w: el.naturalWidth, h: el.naturalHeight}; this._imgDims.set(img, dims); if (out.isConnected) paint(dims); };
    el.src = img;
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
    else if (b) this.draft[a][b] = path === 'pin.size' || path === 'childPin.size' ? Number(value) || 0 : value;
    else this.draft[a] = a === 'pinBannerWidth' ? Number(value) || 0 : value;
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
  /** 0.30.0: links an NPC (or a Journal about someone) to this location. Hidden from players until its eye is turned on. A link only: nothing is copied. */
  linkPerson(doc) { return this.linkActor('npcs', doc); }
  /** 0.32.0: People and Beasts share this: links an Actor (a Journal too, for People) to a list on this location, hidden by default. A link only. */
  linkActor(section, doc) {
    if (!this.draft || !doc?.uuid) return;
    const facts = actorFacts(doc, section === 'beasts' ? {ids: BEAST_ID} : undefined);
    if (this.draft[section].some(n => n.uuid === doc.uuid || (facts.sourceId && n.sourceId === facts.sourceId))) { ui.notifications.info(`${doc.name} is already linked here.`); return; }
    return this.addEntry(section, {label: doc.name, uuid: doc.uuid, docType: doc.documentName ?? 'Actor', sourceId: facts.sourceId, note: '', visible: false});
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
    if (section === 'npcs') {
      if (!NPC_DOC_TYPES.includes(type)) return ui.notifications.warn('Drop an Actor or Journal here.');
      return this.linkPerson(doc);
    }
    if (section === 'beasts') {
      if (type !== 'Actor') return ui.notifications.warn('Drop a creature Actor here.');
      return this.linkActor('beasts', doc);
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
    if (action === 'ov-declare') return this.travelDo('[data-action="ov-declare"][data-kind="' + el.dataset.kind + '"]', async () => { await api().overland.declare(el.dataset.kind); ui.notifications?.info('Asked the GM.'); });
    // Spending actions: the optional text box goes on the journal card, then empties.
    const spent = async run => { const text = this.travelText ?? ''; await run(text); this.travelText = ''; };
    if (/^ov-(travel|scout|explore)$/.test(action)) return this.travelPreviewSet({action: action.slice(3), destination: '', terrain: '', reached: '', override: null, requestUserId: null, cost: null}, `[data-action="${action}"]`);
    if (action === 'ov-resolve') {
      let q = null;
      try { q = api().overland.state().requests.find(x => x.userId === el.dataset.user); } catch (err) { ui.notifications?.warn(err?.message ?? String(err)); }
      if (!q) return this.render();
      return this.travelPreviewSet({action: q.action, destination: '', terrain: '', reached: '', override: null, requestUserId: q.userId, cost: null}, `[data-action="ov-resolve"][data-user="${el.dataset.user}"]`);
    }
    if (action === 'ov-pv-cancel') { this.travelPreview = null; return this.travelDo('#agl-ov-area', () => {}); }
    if (action === 'ov-pv-cost') {
      if (!this.travelPreview) return this.render();
      const now = this.travelPreview.cost ?? api().overland.previewAction(this.travelPreviewRequest()).cost;
      return this.travelPreviewSet({cost: Math.max(0, Math.min(5, now + Number(el.dataset.delta)))}, `[data-action="ov-pv-cost"][data-delta="${el.dataset.delta}"]`);
    }
    if (action === 'ov-pv-ovsev') return this.travelPreviewSet({override: {...this.travelPreview?.override, severity: Number(el.dataset.sev)}, cost: null}, `[data-action="ov-pv-ovsev"][data-sev="${el.dataset.sev}"]`);
    if (action === 'ov-pv-resolve') {
      const p = this.travelPreview ?? {}, text = this.travelText ?? '';
      try {
        const r = await api().overland.resolveAction({...this.travelPreviewRequest(), text, ...(p.cost !== null && p.cost !== undefined ? {cost: p.cost} : {})});
        this.travelPreview = null; this.travelText = '';
        ui.notifications?.info(r.summary);
      } catch (err) { ui.notifications?.warn(err?.message ?? String(err)); }
      return this.redrawTravel('#agl-ov-area');
    }
    if (action === 'ov-scope') { this.travelScope = el.dataset.scope === 'area' ? 'area' : 'all'; return this.redrawTravel(`[data-action="ov-scope"][data-scope="${this.travelScope}"]`); }
    if (action === 'ov-open') {
      const doc = el.dataset.uuid ? await fromUuid(el.dataset.uuid).catch(() => null) : null;
      if (doc?.sheet) return doc.sheet.render(true);
      if (el.dataset.uuid) return ui.notifications?.warn('That entry could not be opened.');
      return api().openLocation(el.dataset.loc);
    }
    if (action === 'ov-dismiss') return this.travelDo('#agl-ov-text', s => s.dismiss(el.dataset.user));
    if (action === 'ov-cond') return this.travelDo(`[data-action="ov-cond"][data-cond="${el.dataset.cond}"][data-sev="${el.dataset.sev}"]`, s => s.setCondition(el.dataset.cond, Number(el.dataset.sev), {scope: el.dataset.scope === 'area' ? 'area' : 'all'}));
    if (action === 'ov-undo') return this.travelDo('[data-action="ov-undo"]', s => s.undo());
    if (action === 'ov-newday') {
      if (!(await confirmDialog('Start the next day? The party gets its actions back, the day number goes up and the daily conditions go back to 0. Conditions set on Locations and Regions stay. The journal is kept.', {title: 'Start a new day?', yes: 'Start new day'}))) return;
      return this.travelDo('[data-action="ov-newday"]', s => s.newDay());
    }
    if (action === 'ov-reset') {
      const opts = await resetDayDialog();
      if (!opts) return;
      this.travelPreview = null;
      return this.travelDo('[data-action="ov-reset"]', () => api().overland.resetDay(opts));
    }
    if (action === 'ov-edit') {
      const entry = api().overland.state().journal.find(e => e.id === el.dataset.id);
      if (!entry) return this.render();
      const r = await formDialog('Edit journal entry', [{name: 'text', label: `What the party learns (${ACTION_NAMES[entry.kind]}, day ${entry.day})`, type: 'textarea', value: entry.text}], {ok: 'Save entry'});
      if (!r) return;
      return this.travelDo(`[data-action="ov-edit"][data-id="${el.dataset.id}"]`, s => s.editEntry(el.dataset.id, r.text ?? ''));
    }
    if (action === 'ov-delete') {
      if (!(await confirmDanger('This card is removed from the journal for everyone. It does not give the action back (use Undo last for that).', {title: 'Delete entry?', yes: 'Delete entry'}))) return;
      return this.travelDo('#agl-ov-text', s => s.deleteEntry(el.dataset.id));
    }
    if (action === 'ov-clear') {
      if (!(await confirmDanger('Every card is removed from the journal for everyone. The day and the actions left do not change.', {title: 'Clear journal?', yes: 'Clear journal'}))) return;
      return this.travelDo('#agl-ov-text', s => s.clearJournal());
    }
    if (action === 'retry') return this.render();
    if (action === 'clear-filters') return this.clearFilters();
    if (action === 'toggle-group') return this.toggleGroup(el.dataset.group);
    if (action === 'region-fold') return this.toggleRegion(el.dataset.id);
    if (action === 'tree-toggle') {
      const open = this.filteringNow ? this.searchCollapsed : LocationsApp.treeOpen, id = el.dataset.id;
      if (!open.delete(id)) open.add(id);
      return this.render();
    }
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
    if (action === 'open-shop') return this.openShop(el.dataset.id);
    if (action.startsWith('notes-')) return this.onNotesAction(action, el);
    // 0.36.0: Travel is for players too (the API decides who may go). It used to sit below the GM-only gate, so a player's click did nothing at all.
    if (action === 'travel') return travel(el.dataset.ref).then(() => this.focusBack('[data-action="travel"]'));
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
      case 'publish-all': return this.publishAll();
      case 'preview': return this.preview();
      case 'show-players': return this.showToPlayers();
      case 'toggle-active': return this.toggleActive();
      case 'link-npc': case 'add-npc': case 'add-beast': {
        const uuid = action === 'link-npc' ? el.dataset.uuid : root.querySelector(action === 'add-beast' ? '#agl-add-beasts' : '#agl-add-npcs')?.value;
        if (!uuid) return;
        let doc = null;
        try { doc = await fromUuid(uuid); } catch { doc = null; }
        if (!doc) return ui.notifications.warn(MISSING_DOC);
        return this.linkActor(action === 'add-beast' ? 'beasts' : 'npcs', doc);
      }
      case 'relink-npc': {
        const plan = relinkPlan(this.draft.npcs, worldPeopleDocs(), uuid => !!docName(uuid)).filter(r => r.key === el.dataset.key);
        if (!plan.length) return;
        this.draft.npcs = applyRelink(this.draft.npcs, plan); this.dirty = true; return this.render();
      }
      case 'present-shop': return this.presentShop(el.dataset.id);
      case 'stop-shop': return this.stopShop(el.dataset.id);
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
      case 'oc-set': {
        const oc = {...(this.draft.overlandConditions ?? {})};
        if (el.dataset.val === '') delete oc[el.dataset.cond]; else oc[el.dataset.cond] = Number(el.dataset.val);
        if (Object.keys(oc).length) this.draft.overlandConditions = oc; else delete this.draft.overlandConditions;
        this.dirty = true; await this.render();
        return this.focusBack(`[data-action="oc-set"][data-cond="${el.dataset.cond}"][data-val="${el.dataset.val}"]`);
      }
      case 'remove-scene': this.draft.sceneUuids = this.draft.sceneUuids.filter(u => u !== el.dataset.uuid); this.draft.travelSceneUuids = (this.draft.travelSceneUuids ?? []).filter(u => u !== el.dataset.uuid); this.dirty = true; return this.render();
      case 'open-scene': {
        const scene = await fromUuid(el.dataset.uuid);
        if (!scene) return ui.notifications.warn('That scene no longer exists.');
        return scene.view();
      }
      case 'browse-pin': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const f = el.dataset.field, scope = el.dataset.scope === 'childPin' ? 'childPin' : 'pin';
        return new FP({type: 'image', current: this.draft[scope][f], callback: p => { this.setPath(`${scope}.${f}`, p); this.render(); }}).render(true);
      }
      case 'browse-setup': {
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const input = root.querySelector('#agl-set-unknown');
        return new FP({type: 'image', current: input?.value, callback: p => { if (input) input.value = p; }}).render(true);
      }
      case 'save-setup': return this.saveSetup(root);
      case 'setup-cancel': return this.render();
      case 'cancel': this.select(this.draft?.id || null); return this.render();
      case 'bulk-all': for (const id of this.shownIds) this.picked.add(id); await this.render(); return this.focusBack('[data-action="bulk-all"]');
      case 'bulk-clear': this.picked.clear(); await this.render(); return this.focusBack('[data-action="bulk-clear"]');
      case 'bulk-archive': return this.bulkAction('archive');
      case 'bulk-restore': return this.bulkAction('restore');
      case 'bulk-delete': return this.bulkAction('delete');
      case 'undo-bulk': return this.undoBulk();
      case 'show-live': return this.setArchivedView(false);
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
        const note = await api().placeOnScene(id, {scene: canvas?.scene, x: x ?? 0, y: y ?? 0});
        await confirmPlacement({note, name: this.draft.name, scene: canvas.scene, x: x ?? 0, y: y ?? 0, canvas, game, notify: ui.notifications});
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
  focusBack(selector) { this.element?.querySelector?.(selector)?.focus?.({preventScroll: true}); }   // 0.43.1: focus never scrolls the view
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
    const names = new Map(api().listLocations({archived: 'include'}).map(l => [l.id, l.name]));
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
    const targets = regionChoices(all, d.id);   // 0.32.1: the same list as the Inside select
    const r = await formDialog('Move to…', [{name: 'target', label: `Move ${d.name} into`, type: 'select', value: d.parentLocationId || '',
      options: [{value: '', label: 'Top level'}, ...targets.map(({loc, path}) => ({value: loc.id, label: path}))],
      hint: `Only Regions are listed, and never one inside ${d.name}.`}], {ok: 'Move'});
    if (!r) return;
    return this.move(d.id, r.target ?? '');
  }
  /** GM: Who Can See It. Saved locations change at once through the API; a new one changes its draft. */
  async onAudience(el) {
    const d = this.draft;
    if (!d) return;
    const a = d.audience, kind = el.dataset.actionChange;
    const next = {mode: a.mode, userIds: [...a.userIds], sharing: a.sharing, othersUnidentified: a.othersUnidentified === true};
    if (kind === 'audience-mode') next.mode = el.value;
    if (kind === 'audience-user') next.userIds = el.checked ? [...new Set([...next.userIds, el.value])] : next.userIds.filter(u => u !== el.value);
    if (kind === 'audience-sharing') next.sharing = el.checked;
    if (kind === 'audience-others') next.othersUnidentified = el.checked;
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
      return `<section class="agl-preview__part" data-state="${st}"${current ? ' data-current="1"' : showOthers ? '' : ' hidden'}><h3>${STATE_LABELS[st]}${current ? ' (current)' : ''}</h3>${this.viewerHtml(v, {partyNotes: false, preview: true})}</section>`;
    };
    const hiddenCard = cur === 'hidden'
      ? `<section class="agl-preview__part" data-state="hidden" data-current="1"><h3>${STATE_LABELS.hidden} (current)</h3><p>Hidden: players see nothing.${isPlaceable(d) ? ' Its pins on a map are invisible to them too.' : ''}</p></section>` : '';
    return `<div class="agl-app agl-preview">
      <p class="agl-hint">This is what players would see after you publish your current edits. Quest names follow Quest Log's own visibility.</p>
      ${hiddenCard}${part('unidentified')}${part('revealed')}
      <label class="ag-field ag-field--inline agl-preview__toggle"><input type="checkbox" id="agl-preview-others" ${showOthers ? 'checked' : ''}> Also show the other states</label></div>`;
  }
  /**
   * 0.24.0: GM only. Active is live play state: it applies at once, with no Save or Publish, and never touches unsaved edits.
   * A Hidden location asks first ("Reveal and make active?"); it is never revealed silently.
   */
  /** 0.30.0: Utilities' own shop window (the GM sees it as players do; a player only for a shop shown to them). */
  async openShop(id) {
    const shops = shopsApiState(game.modules).shops;
    if (!id || typeof shops?.open !== 'function') return ui.notifications.warn('Ashen Gate | Utilities is not available.');
    try { await shops.open(id); } catch (err) { ui.notifications.warn(err?.message ?? String(err)); }
  }
  /** 0.30.0, GM: Present… asks who (all players or chosen ones); Utilities does the presenting and re-checks that the caller is the GM. */
  async presentShop(id) {
    const shops = shopsApiState(game.modules).shops;
    if (!game.user.isGM || typeof shops?.present !== 'function') return;
    const row = shopsHere(game.modules, this.draft?.id, {includeChildren: this.shopsChildren}).rows.find(r => r.id === id);
    const players = worldPlayers();
    if (!players.length) return ui.notifications.warn('There are no player users yet.');
    const name = row?.name || 'this shop';
    const f = await formDialog(`Present ${name}`, [
      {name: 'mode', label: 'Show to', type: 'select', value: 'all', options: [{value: 'all', label: 'All players (also players who log in later)'}, {value: 'users', label: 'Chosen players (tick them below)'}]},
      {name: 'users', label: 'Chosen players', type: 'checklist', options: players.map(u => ({value: u.id, label: u.name})), hint: 'Used only when Show to is Chosen players.'}
    ], {ok: 'Present'});
    if (!f) return;
    const mode = f.mode === 'users' ? 'users' : 'all', userIds = [].concat(f.users ?? []);
    try {
      await shops.present(id, {mode, userIds});
      ui.notifications.info(`${name} is shown to ${mode === 'all' ? 'all players' : `${userIds.length} ${userIds.length === 1 ? 'player' : 'players'}`}.`);
    } catch (err) { ui.notifications.warn(err?.message ?? String(err)); }
    return this.render();
  }
  async stopShop(id) {
    const shops = shopsApiState(game.modules).shops;
    if (!game.user.isGM || typeof shops?.stopShowing !== 'function') return;
    const name = shopsHere(game.modules, this.draft?.id, {includeChildren: this.shopsChildren}).rows.find(r => r.id === id)?.name || 'this shop';
    if (!(await confirmDialog(`Stop showing ${name}? Players can no longer see it or open it from this location. The shop itself is not changed.`, {title: 'Stop showing this shop?', yes: 'Stop showing'}))) return;
    try { await shops.stopShowing(id); ui.notifications.info(`${name} is no longer shown to players.`); } catch (err) { ui.notifications.warn(err?.message ?? String(err)); }
    return this.render();
  }
  async toggleActive() {
    if (!this.gm || !this.draft?.id) return;
    const id = this.draft.id, turnOn = this.draft.active !== true;
    if (turnOn && this.draft.state === 'hidden') {
      const ok = await confirmDialog(`${this.draft.name} is hidden. Reveal and make active? Players will see its name and everything marked visible, and be told the party is there.`,
        {title: 'Reveal and make active?', yes: 'Reveal and make active'});
      if (!ok) return;
      if (!(await this.saveFirst('reveal it'))) return;
      const saved = await this.saveDraft();
      if (!saved) return;
      await api().setLocationState(saved.id, 'revealed');
    }
    const loc = await api().setLocationActive(id, turnOn);
    this.draft.active = loc.active === true; this.draft.state = loc.state; this.draft.revealed = loc.revealed;
    ui.notifications.info(loc.active ? `${loc.name} is now active.` : `${loc.name} is no longer active.`);
    return this.render();
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
        '<strong>Description</strong> (Content sub-tab, the first block) is a few sentences on what the place looks and feels like. The <i class="fa-solid fa-eye"></i> beside it decides whether players see it once the location is Revealed and Published; closed, they never receive it. You can drag the block lower if you prefer.',
        'Drop material Items on <em>Gathering Resources</em>, Actors/Journals on <em>Factions</em>, anything on <em>Notes</em>. Or type a custom entry. <strong>Add detail</strong> makes a custom block with a title, text and an optional linked document.',
        '<strong>Reorder:</strong> drag a grip, or use the arrows (Alt+Up / Alt+Down on a grip), to move a block or an entry. Players see published blocks in your order.',
        '<strong>Beasts</strong> (Content sub-tab, next to People) lists the creature Actors that may roam here. It is for you only: drop a creature Actor on the block, or choose one and click <strong>Link</strong>, and add a note for yourself. Players never see this list, whatever else you turn on: it is not published, not in Player Preview, and not in anything a player can read.',
        '<strong>Loot &amp; Rewards:</strong> drag an Item in (world or compendium) or add a plain reward. It is a link only: nothing is given to anyone. Set <em>Available / Discovered / Taken</em> yourself.',
        'Quests come from Quest Log. Clicking one opens the Quest Log.']),
      topic('Visibility', [
        'Each location is <strong>Hidden</strong> (players see nothing), <strong>Unidentified</strong> (players see only its label and teaser) or <strong>Revealed</strong>. The buttons next to the name change it at once.',
        '<strong>Save Changes</strong> is private. Players see edits only after <strong>Publish</strong> (or Reveal). <strong>Publish all changes…</strong> (top of the list, GM) publishes every revealed or unidentified location that has saved changes in one step, after asking; Hidden and archived locations are skipped. <strong>Player Preview</strong> shows what they would see in the location\'s current state; tick <em>Also show the other states</em> to compare (your choice is remembered on this computer). A state change or Place on Scene with unsaved edits asks <em>Save and …</em> first.',
        'The <i class="fa-solid fa-eye"></i> toggles decide what players see once revealed, and each section has its own switch.',
        '<strong>Who Can See It</strong> (<em>Applies now</em>): <em>Everyone</em>, or <em>Selected players</em> only. Other players get nothing, not even its pin, exactly as if it were Hidden, unless you tick <em>Everyone else sees it as unidentified</em>: they then see an unidentified marker at the same spot (a second, generic pin that follows the real one; you see both on the scene) and cannot open the real page. Players who can see it may <em>Share with…</em> others (you can turn that off); you see who shared with whom and can untick anyone. Players are named by their characters\' first names (a player with no character shows by user name); <em>Also known to</em> on a player\'s card lists only names that player may already see.']),
      topic('Map pins', [
        '<strong>Place on Scene</strong> (in the editor head) or drag a location from the list onto the map to add a Map Note. Double-click the note to open the location. The pin shows the unidentified label and image until the location is revealed, and an unidentified pin\'s label is always drawn under it (not only on hover); set pin art under <em>Unidentified Marker &amp; Pin</em>.',
        '<strong>Default pin for places inside this one</strong> (Visibility &amp; map, GM only): give a Region such as a country or a town a pin image for revealed places, one for hidden / unidentified places, and a pin size, and every place inside it (and inside those) uses them. Order: the place\'s own value, then the nearest place above it that sets one, then <em>GM Setup</em>\'s default unidentified image, then Foundry\'s icons. A place\'s own value is never changed. Placed pins update when you Save; a pin whose image or size you changed in Foundry\'s Note settings keeps your change. The empty boxes show what the place would use now.',
        '<strong>Keep pin art proportions</strong> (Visibility &amp; map, next to Pin size, per location): off by default, so a pin is Foundry\'s square. Tick it and Save Changes and that location\'s pin is drawn wider or taller to match its image, e.g. a wide banner for a district label. <em>Pin size</em> sets the height; the width follows the picture, up to 4 times the height (a taller picture is limited the same way; anything more extreme is shown whole, smaller, inside that limit). The frame, shading, click and drag follow the new shape. <strong>Banner width</strong> (appears while this is on; empty = off) draws the pin that many pixels wide (48 to 1024) and the height follows the image, with the same 4:1 limit; <em>Pin size</em> is greyed while a width is set, and \'Draws about W x H\' shows the result. A pin whose size you changed in Foundry\'s own Note settings ignores the Banner width and uses that size as its height, as before. The name under the pin is hidden (the art usually carries the name); tick <em>Show the name under the pin</em> beside it to bring it back. It applies to whichever image the pin shows, needs no Publish, and is not inherited by places inside a Region.',
        '<strong>Active</strong> (editor head, GM only) marks where the party is now; several places can be active. It applies at once (no Publish), shows a <em>Here now</em> badge to players who can see the place and tells them "The party is now at …". A hidden place asks <em>Reveal and make active?</em> first. Filters → Status → Active lists them. Other modules read the active places through the Locations API.',
        '<strong>Show to Players</strong> (editor head, GM only) opens the location in every other connected player\'s Locations window, like Foundry\'s Show to Players for journals. Players see only what they could already see: an unidentified place opens its unidentified card, and a Selected-players place goes only to those players. A hidden place asks <em>Reveal and show</em> first. Players\' windows switch to it rather than stacking, and a player who is typing or has unsaved Party Notes is not interrupted. GM Setup → Show to Players can turn the automatic opening off (they then get a notification).',
        '<strong>Pin look</strong> (GM Setup → Map Pins): <em>Framed</em> is Foundry\'s own square pin. <em>Image only</em> shows just the picture, without the square or the shaded backing, on every player\'s screen; the frame still shows while you hover or select a pin. <em>Name under the pin</em> chooses <em>Always shown</em> or <em>Only when hovering</em> (Foundry\'s own behaviour), and <em>Name size</em> (8 to 48 pixels, default 14) sets how large it is, <em>Name distance from the pin</em> (negative = closer), and <em>Wrap the name after</em> breaks a long name into lines of that many characters (0 = off). To size one pin on its own, activate the Notes layer, right-click or double-click the note, and change <em>Font Size</em> in its configuration: a Font Size other than Foundry\'s default 32 overrides the module setting for that pin. Hidden pins never show a name and unidentified pins show only their unidentified label. It changes how pins are drawn, not the pins, so switch back any time.',
        '<strong>Travel</strong>: link scenes on <em>Visibility &amp; map &rarr; Linked Scenes</em>. Right-click a location\'s pin on the map, or a row in the list, and choose <strong>Travel</strong> (the button in the location\'s header does the same; it reads <strong>Travel to scene&hellip;</strong> when several scenes are linked and asks which). It views the scene for you only; nobody else moves and no scene is activated. You can travel to any linked scene. Tick <strong>Players can travel here</strong> beside a scene (off by default) and <strong>Publish</strong> so players get Travel too, but only while the location is Revealed and only for scenes Foundry lets them view: set the scene\'s <em>Navigation</em> on, or give players Observer permission on it, in the scene\'s own settings. A scene a player cannot view is never offered or named.',
        '<strong>Placeable on a map</strong>: untick it for places that only group others. They are left out of Place on Scene and dragging onto the map unless you tick <em>Show representative-only too</em> (under <strong>Filters</strong>). The <em>Placeable</em> filter finds either kind.']),
      topic('List, tree and moving', [
        '<strong>Group by Region</strong> (the default) nests places under their Regions: <em>Fosstryn Frontier</em> &gt; <em>Fosstryn</em> &gt; <em>The Muster</em>. Click a Region\'s name to fold or unfold it (the number is how many places are inside); the arrow beside it opens the Region itself. Places with no Region above them are grouped by their <em>Region</em> text, as before. Any header can be folded, even the ones holding the place you have open. When you pick a different place, every folder that does not hold it folds and the folders on its path open; after that your own clicks stick, and a redraw never changes them. Which headers you folded is remembered for you on this computer. A search opens the headers that hold a match; you can still fold one while you search, until you change the search.',
        '<strong>Filters</strong> opens a second toolbar row: the filters, Sort, Group by and <em>Show representative-only too</em>. The number on it counts the filters in use.',
        '<strong>Tree</strong> shows places inside their Regions as folders, with how many places each holds (directly · in total). Drag a place onto a folder (or onto <em>Drop here for top level</em>) to move it; <strong>Undo</strong> puts it back. <strong>Move to…</strong> in the editor does the same from the keyboard, and <strong>+</strong> on a folder makes a new place inside it Folders follow the same rule as the Region headers: picking a place opens its path and folds the rest, and you can fold or open any folder yourself afterwards.',
        '<em>Place</em>: put a location inside a Region (the <em>Inside</em> list shows Regions; to use another place as a container, tick <em>This is a Region</em> on it first). The <em>Region</em> field on the Content tab picks from your Regions too. Mark one as a <strong>Region</strong> to make it a folder. A Region passes its <em>Conditions</em> to the places inside it only if you tick <em>Pass conditions to places inside</em>; a place can turn one off or change it for itself. <em>Linked Scenes</em> open with one click (only you move).']),
      topic('People and shops', [
        '<strong>People</strong> (Content sub-tab) links NPC Actors or Journals to this place. Drop one on the block, or choose one and click <strong>Link</strong>. A link is only a link: nothing is copied, and players never see anything from the Actor itself. Each person has an eye (hidden by default), the <em>Name shown to players</em> and an optional note, both written by you. Turn on the eye and <em>Show section to players</em>, then Publish: players get a <strong>People</strong> card where a name opens the Actor or Journal only if Foundry lets them.',
        'If General Manager imported your NPCs, People suggests the ones whose record names this place, each with <strong>Link &lt;name&gt;</strong>. A record that places the NPC here is listed first; one that only mentions the place (a plain <em>related</em> link) is listed after and says so. If you delete an NPC and import it again, the row offers <strong>Re-link to &lt;name&gt;</strong>; Save Changes and Publish keep it.',
        '<strong>Shops here</strong> lists the shops and services linked to this place in Ashen Gate | Utilities (set a shop\'s place in the shop\'s editor). <em>Include places inside</em> adds the places below this one. <strong>Present…</strong> shows a shop to all players or chosen ones, <strong>Stop showing</strong> ends it, <strong>Open</strong> shows it as players see it. These act at once; Save Changes is not needed. Players see a <strong>Shops</strong> card with <strong>Open shop</strong> only for shops you have presented to them (and only while <em>Shops on for players</em> is on in Utilities\' GM Setup). Without Utilities, or with an older one, the card tells you to activate or update it.']),
      topic('Select, Archive and Delete', [
        '<strong>Select</strong> (toolbar) puts a tick box on every row. Tick locations one by one, or narrow the list first and click <strong>Select all N shown</strong>: use <em>Region</em>, the other Filters, the search box, or <em>Id starts with</em> (for example <code>LOC-FRONTIER-</code>; the one place an id is typed). The bar above the list counts what is selected and what is shown.',
        '<strong>Archive…</strong> is the safe way to clear the list. It shows exactly which locations it will archive, then moves them out of the Locations list and hides them from players, as if Hidden. Nothing is lost: content, state, audience, Party Notes and map pins are kept (the pins stay on the scene for you and vanish for players). <strong>Undo</strong> appears for 30 seconds, and <strong>Archived (n)</strong> lists them any time: tick some and choose <strong>Restore…</strong>. Places inside an archived Region are not archived with it unless you select them too.',
        '<strong>Delete…</strong> removes locations for good. It lists what goes, downloads a JSON backup of exactly those locations (Import brings them back), then asks <em>Delete N locations</em>; Cancel is the default. A location with places inside it cannot be deleted unless those places are in the selection: the window offers to add them. Map pins this module placed are removed; pins you changed by hand in Foundry are kept and listed. Party Notes stay stored privately and return if the same location is imported again.',
        'Importing again: an archived location <strong>stays archived</strong> when General Manager imports it again (an update import still refreshes its definition). A deleted one comes back if its record is in a pack Manager imports, so use Archive for places you want to keep out of the world.']),
      topic('Gathering', [
        'Each gathering node shows its name, skill, tier, DC and status on one row; <strong>Edit node</strong> opens its materials, availability, note and optional <em>Exotic materials</em> (GM only, never shown to players). DC is 10/12/15/18/20 by tier; a DC you set stays. Players only see the DC if you turn on its <i class="fa-solid fa-eye"></i>.',
        '<strong>Mark exhausted</strong> after a node is used or a check fails; <strong>Restore</strong> undoes it.',
        '<strong>Add node…</strong> asks <em>From template</em> (Profession Ledger 0.25.0+) or <em>Custom</em>. The Ledger owns a template\'s activity, tier range, check and materials (shown read only; <strong>Gathering Nodes</strong> opens the Ledger to edit them); you set this place\'s name, tier, DC, finite, availability and note. Leave a field on <em>Template</em> to use the template\'s value. If the template is deleted the entry stays, marked, with its data.']),
      topic('Hazards, roll tables and Route locations', [
        'Routes are retired. For a road, river or pass, make a location with type <strong>Route</strong> and put it inside the place it leaves from (or wherever suits). It is a plain location: no ends, no legs, nothing drawn on the map. When the party travels, you rule and roll.',
        '<strong>Hazards</strong> (Content sub-tab): <strong>Add hazard…</strong> gives a name, a note and an optional roll table. <strong>Open table</strong> opens it; <strong>Roll</strong> draws it to chat. A hazard is GM only until you show it (<i class="fa-solid fa-eye"></i>); players then see its name and note after Publish, never its table.',
        '<strong>Roll Tables</strong>: link world tables (or drop one, from a compendium too). Only you can <strong>Roll</strong>. A shown table lists its name for players, who can open it only if Foundry lets them.',
        'Old routes are kept in the world, unused. <strong>GM Setup → Developer Tools → Convert routes to locations…</strong> (only while the world has some) previews and then makes a Route location for each. Importing a Route record skips it: make a location with type Route instead.']),
      topic('Travel', [
        '<strong>Travel</strong> (the second tab) is a light way to keep days on the road. The party shares <strong>3 actions a day</strong>: <strong>Travel</strong> (one neighbouring map tile, normally no check), <strong>Scout</strong> (roughly which way a known goal lies; a Navigation check can sharpen it) and <strong>Explore</strong> (survey this tile and the ones next to it). Encounters, fights and talking cost none. It is a tally to help you adjudicate, not a tracker.',
        'Pick the <strong>Current area</strong> (a Location or Region; it defaults to the place marked as where the party is). Each of the three buttons, or <strong>Resolve…</strong> on a request, opens an <strong>Action preview</strong>: the cost the conditions and the party\'s gear work out to, the survey range or Scout precision, the encounter pressure, the conditions that apply, a <em>Calculated</em> line that explains the numbers and <em>GM guidance</em>. Nothing is rolled and nothing is applied to any character. <strong>Resolve</strong> spends the cost in one step, adds a card to the <strong>Journal</strong> (action, area and cost only; the optional box is what the party learns) and clears the request. Travel moves the current area to the destination; use <em>Destination actually reached</em> when Warped Paths displaces the party. <strong>Adjust cost</strong> changes what is spent for special cases; <strong>GM override</strong> replaces one condition\'s severity for that preview only (for a spell, say). <strong>Undo last</strong> gives back the cost on the card and the previous area. <strong>New day…</strong> asks first, then gives the actions back, adds one to the day and clears the daily conditions; conditions set on Locations and Regions stay, and the journal is kept. <strong>Reset travel day…</strong> (next to Undo last) is for testing: it asks first for a day number (default 1) and what to clear (the journal, today\'s actions used, pending requests, the daily conditions), and never touches Locations or their conditions.',
        '<strong>Travel for players</strong> (GM Setup, off by default) shows players the day, the actions left, the journal and three buttons to <em>ask</em> for an action. A request is visible to everyone, with who asked. <strong>Resolve</strong> spends one action and adds the card (with the box\'s text, and who asked); <strong>Dismiss</strong> drops it. Players never see conditions, severities, party modifiers, Mounted or anything under <em>GM only</em>.',
        '<strong>Journal</strong>: one card per day, newest day first. <strong>Edit…</strong> changes a card\'s text, <strong>Delete entry</strong> removes one card, <strong>Clear journal…</strong> removes them all (each asks first; Cancel is the default). Everyone who can see Travel can read the journal.',
        '<strong>Conditions</strong> (GM only): six, each 0 (absent) to 3 (extreme): Harsh Weather, Difficult Terrain, Poor Visibility, Warped Paths, Blight Taint, Ashen Menace. <strong>Daily conditions</strong> (weather and temporary effects) are set in the Travel tab for all areas or for the current area. <strong>Travel conditions here</strong> (location editor, Content) are persistent: the nearest Region that sets one wins, an explicit 0 clears an inherited value, and they never add up. For an action the higher of the place and today counts for each condition. The party\'s mitigation protects the party only: it never lowers a condition on a place and never changes the pressure label.',
        '<strong>Mounted</strong> counts modifiers that need a mount, and gear on a character\'s mount (when Character Hub is active). <strong>Announce to players</strong> posts a short chat line for each action. <strong>Party modifiers</strong> lists the bonus actions, Explore range, Scout precision, terrain efficiency and condition mitigation that items and perks on the party\'s characters carry, with their sources and the cap. Only the best source in a stacking group counts, across the whole party. Equipment counts while equipped. Scout precision is a guide: 0 direction only, 1 a named region or quadrant, 2 a named landmark or route; anything finer is your call.']),
      topic('Party Notes', [
        '<strong>Party Notes</strong> are written by the players, one at a time, on any location they can see. They are not your <em>Notes</em> section and are never published, exported or changed by an import. They have their own <strong>Save Party Notes</strong>; Save Changes never touches them. You can edit, take over or clear them. Hiding a location hides its Party Notes until it is visible again.'])
    ].join('')
      : '<p>These are the places your GM has revealed, under the Regions they are in (click a Region\'s name to fold or unfold it; it is remembered for you). An unidentified pin on the map always shows its label. Places under <em>Unidentified</em> show only what you have heard so far. A <i class="fa-solid fa-location-dot"></i> pin after a folder\'s number means your party is somewhere inside it. Click a linked quest, faction, person, document or place to open it (a name with no link is one you may not open). Where your GM has allowed it, right-click a place\'s pin (or its row in the list) and choose <strong>Travel</strong>, or use the <strong>Travel</strong> button under the place\'s name, to view its scene; only you move. A <strong>Shops</strong> card appears when your GM has shown you a shop at that place; <strong>Open shop</strong> opens it.</p><p><strong>Party Notes</strong> are shared by the whole party. Click <em>Edit</em>, type, then <em>Save Party Notes</em>. One person edits at a time; everyone else sees who is editing. Saving works whether or not a GM is connected.</p><p>When your GM has turned on <strong>Travel for players</strong>, the <strong>Travel</strong> tab shows the day, the actions the party has left and the journal. <strong>Travel</strong>, <strong>Scout</strong> and <strong>Explore</strong> ask the GM for that action (one request each); the GM decides and writes what the party learns on a journal card.</p><p>A place marked with <i class="fa-solid fa-user-lock"></i> is known only to some players. If the GM allows it, <em>Share with…</em> lets other players see it too (a GM must be connected).</p>';
    return infoDialog('Locations Help', gm);
  }
}
