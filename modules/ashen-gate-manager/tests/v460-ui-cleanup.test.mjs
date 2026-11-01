// 0.46.0: UI/UX cleanup (docs/ui-audit-2026-10.md, General Manager). Proves logic and markup text with mocked Foundry,
// not the live Forge UI: keyboard, focus and the look are checked in Forge.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readGmSetupForm} from '../scripts/gm-setup.js';
import {ACCESS_CONTRACT, CODEX_SURFACE, inspectPlayerModule, changePlayerAccess, hideAllPlayerInterfaces, isGmOnlyModule} from '../scripts/player-access.js';
import {moduleCards} from '../scripts/module-cards.js';
import {renderPlayerCodexHtml} from '../scripts/codex.js';
import {bodyHtml, facetsHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {FACETS} from '../scripts/browse.js';
import {MANAGER_TABS, ITEM_VIEWS, resolveTab} from '../scripts/item-filters.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');
const M = 'ashen-gate-manager';

// ---- GM-PM-01: the NPC Codex is Manager's Player Access row ----
function managerModule(initial = false, {gm = true} = {}) {
  let enabled = initial, calls = 0;
  const mod = {id: M, title: 'Ashen Gate | General Manager', version: '0.46.0', active: true, api: {playerAccess: {contract: ACCESS_CONTRACT, surface: CODEX_SURFACE,
    getState: () => ({contract: ACCESS_CONTRACT, moduleId: M, audience: 'player', playerAccessEnabled: enabled, configurable: gm}),
    setEnabled: async v => { calls++; enabled = v; }}}};
  return {mod, get enabled() { return enabled; }, get calls() { return calls; }};
}

test('GM-PM-01: Manager\'s NPC Codex row is player-capable; the Manager window itself stays GM-only', async () => {
  const x = managerModule(false);
  assert.equal(isGmOnlyModule(x.mod), false);
  const row = await inspectPlayerModule(x.mod);
  assert.deepEqual([row.title, row.state, row.canToggle, row.audience], ['Ashen Gate | General Manager (NPC Codex)', 'Hidden', true, 'Player']);
  assert.equal((await changePlayerAccess(x.mod, true, {isGM: true})).state, 'Visible');
  assert.equal(x.enabled, true);
  // Hide all now covers the Codex too.
  const report = await hideAllPlayerInterfaces([x.mod], {isGM: true});
  assert.deepEqual(report.changed.map(r => r.id), [M]);
  assert.equal(x.enabled, false);
  // Without the Codex surface marker, a capability on the Manager id is still refused (no generic reveal of the GM editor).
  const bare = {...x.mod, api: {playerAccess: {...x.mod.api.playerAccess, surface: undefined}}};
  assert.equal(isGmOnlyModule(bare), true);
  assert.equal((await inspectPlayerModule(bare)).state, 'GM only');
});

test('GM-PM-01: the Modules tab gets a Codex card whose Open goes to the NPC Codex tab', async () => {
  const row = await inspectPlayerModule(managerModule(true).mod);
  const cards = moduleCards([], [row]);
  assert.equal(cards.length, 1);
  assert.deepEqual([cards[0].id, cards[0].canOpen, cards[0].opensCodex, cards[0].canToggle, cards[0].badge.label], [M, true, true, true, 'Visible to players']);
  // A GM-only Manager row (an older Manager, or no Codex surface) still gets no card.
  assert.equal(moduleCards([], [{id: M, title: 'x', audience: 'GM only', state: 'GM only'}]).length, 0);
  assert.match(main, /if\(moduleId===MODULE_ID\)\{this\.tab='codex';/);
});

test('GM-PM-01: api.playerAccess reads and writes the existing Codex access setting, GM only', async () => {
  const settings = new Map([['codexPlayerAccess', false]]);
  const callbacks = new Map();
  class ApplicationV2 { constructor() { this.element = {querySelector: () => null, querySelectorAll: () => []}; } async render() { return this; } }
  const module = {id: M, api: null};
  globalThis.game = {user: {isGM: true, id: 'gm'}, world: {id: 'w'}, modules: new Map([[M, module]]), items: {contents: []}, journal: {contents: []},
    actors: {contents: []}, tables: {contents: []}, macros: {contents: []}, folders: {contents: []}, packs: new Map(),
    settings: {menus: new Map(), register() {}, registerMenu(_n, k, v) { this.menus.set(`${M}.${k}`, v); }, get: (_n, k) => settings.get(k), set: async (_n, k, v) => { settings.set(k, v); }}};
  globalThis.Hooks = {on() {}, off() {}, once: (n, fn) => callbacks.set(n, fn)};
  globalThis.foundry = {applications: {api: {ApplicationV2, HandlebarsApplicationMixin: B => class extends B {}}}, utils: {deepClone: structuredClone}};
  globalThis.ui = {notifications: {info() {}, error() {}, warn() {}}};
  globalThis.document = {documentElement: {dataset: {}, style: {setProperty() {}, removeProperty() {}}}, head: {querySelector: () => null, append() {}}, querySelector: () => null, createElement: () => ({})};
  await import(`../scripts/main.js?v460=${Date.now()}`);
  callbacks.get('init')?.();
  try { callbacks.get('ready')?.(); } catch { /* appearance wiring needs more DOM than this mock; the API object is set before it is used */ }
  const access = module.api?.playerAccess;
  assert.ok(access, 'api.playerAccess is published');
  assert.equal(access.surface, CODEX_SURFACE);
  assert.deepEqual(access.getState(), {contract: ACCESS_CONTRACT, moduleId: M, audience: 'player', playerAccessEnabled: false, configurable: true});
  await access.setEnabled(true);
  assert.equal(settings.get('codexPlayerAccess'), true, 'same setting as before: no new persisted data');
  game.user.isGM = false;
  await assert.rejects(access.setEnabled(false), /Only the GM/);
  assert.equal(settings.get('codexPlayerAccess'), true);
  assert.equal(access.getState().configurable, false);
});

// ---- GM-NV-06: GM Setup reads the world skin from its skin cards ----
test('GM-NV-06: readGmSetupForm reads the checked skin card (and a plain select still works)', () => {
  const card = (id, on) => ({dataset: {agSkinValue: id}, on});
  const cards = [card('ag-default', false), card('ag-parchment', true)];
  const group = {querySelector: s => s === '[role="radio"][aria-checked="true"]' ? cards.find(c => c.on) ?? null : null};
  const form = {querySelector: s => s === '[data-ag-setup-skin]' ? group : null, querySelectorAll: () => []};
  assert.equal(readGmSetupForm(form).worldSkin, 'ag-parchment');
  assert.equal(readGmSetupForm({querySelector: s => s === '[data-ag-setup-skin]' ? {value: 'ag-slate'} : null, querySelectorAll: () => []}).worldSkin, 'ag-slate');
  assert.equal(readGmSetupForm({querySelector: () => null, querySelectorAll: () => []}).worldSkin, undefined, 'no control: the setting is left alone');
  assert.equal(readGmSetupForm(form).codexAccess, undefined, 'GM Setup no longer holds the Codex switch');
});

// ---- GM-A11-02: deity links are buttons ----
test('GM-A11-02: an openable deity link in the player Codex is a real button', () => {
  const html = renderPlayerCodexHtml([{id: 'NPC-TEST-A', name: '[TEST] Npc A', fields: [{key: 'links', label: 'Connections', links: [{kind: 'deity', id: 'DEITY-TEST-A', name: '[TEST] Deity A'}]}]}],
    {deityLink: () => ({open: true, title: 'Open in the Renown Pantheon'})});
  assert.match(html, /<button type="button" class="agm-codex-link agm-codex-link--deity is-open" data-ag-codex-deity="DEITY-TEST-A"/);
  assert.doesNotMatch(html, /<a [^>]*data-ag-codex-deity|role="button"/);
  assert.match(tpl, /<button type="button" class="agcodex-link agcodex-link--\{\{kind\}\} is-open" data-ag-codex-deity="\{\{id\}\}"/);
});

// ---- GM-CR-01: Browse facets sit behind Filters (n) ----
test('GM-CR-01: Browse body starts with scope and results; facets render separately for the Filters (n) row', () => {
  const result = {scopes: {ag: 1, nonag: 2, all: 3}, facets: Object.fromEntries(FACETS.map(f => [f, f === 'kind' ? [{value: 'Item', label: 'Item', count: 3}] : []])),
    groups: [], total: 0, page: 0, pages: 1, from: 0, to: 0, activeFilters: 0};
  const body = bodyHtml(DEFAULT_STATE, result, null, {});
  assert.doesNotMatch(body, /data-ag-browse-facet|data-ag-browse-managed|data-ag-browse-unlinked/);
  assert.match(body, /class="ag-segmented agbrowse-scope" role="radiogroup"/);
  assert.match(body, /role="radio" aria-checked="true" tabindex="0" data-ag-browse-scope="all"/, 'roving tabindex on the scope radios');
  const facets = facetsHtml(DEFAULT_STATE, result);
  assert.match(facets, /data-ag-browse-facet="kind"/);
  assert.match(facets, /data-ag-browse-managed/);
  assert.match(tpl, /<div id="agitems-filterrow" class="agitems-filterrow" data-ag-items-filterrow \{\{#unless itemFiltersOpen\}\}hidden\{\{\/unless\}\}>/);
  assert.match(tpl, /\{\{#if itemsAll\}\}<div data-ag-browse-facets><\/div>\{\{\/if\}\}/);
  assert.match(main, /this\.itemFiltersOpen=this\.ui\.set\('itemFiltersOpen',!this\.itemFiltersOpen\)/, 'remembered per user');
  // GM-CO-06: a short placeholder; the syntax is in the description and Help.
  assert.match(tpl, /placeholder="Search items" aria-label="Search items" aria-describedby="agitems-query-help"/);
});

// ---- Navigation ----
test('GM-NV-01/03/08: six top-level tabs, NPC Codex its own tab, text sub-tabs, Import history under Import', () => {
  assert.deepEqual(MANAGER_TABS.map(t => t.id), ['import', 'items', 'codex', 'modules', 'scenes', 'setup']);
  assert.ok(MANAGER_TABS.length <= 6);
  assert.ok(!ITEM_VIEWS.some(v => v.id === 'codex' || v.id === 'adopt'));
  assert.doesNotMatch(tpl, /aglib-rail|data-ag-items-view|data-ag-mood-view/, 'no icon-only rails');
  for (const row of ["IMPORT_TABS=[{id:'package',label:'Load and preview'},{id:'history',label:'Import history'}]",
    "CODEX_TABS=[{id:'reveals',label:'Reveals'},{id:'notes',label:'Edit details'},{id:'preview',label:'Player preview'}]"]) assert.ok(main.includes(row), row);
  for (const slot of ['{{{importTabsHtml}}}', '{{{itemsTabsHtml}}}', '{{{../codex.tabsHtml}}}', '{{{moods.tabsHtml}}}', '{{{setupTabsHtml}}}']) assert.ok(tpl.includes(slot), slot);
  assert.match(main, /for\(const list of root\.querySelectorAll\('\.ag-tabs--sub'\)\)\{/);
  assert.deepEqual(resolveTab('history'), {tab: 'import', view: 'all', importView: 'history'});
});

test('GM-NV-02: the shared filter toolbar renders only on the views it applies to', () => {
  assert.match(tpl, /\{\{#if itemsFilters\}\}\n    <div class="ag-toolbar agitems-filters"/);
  assert.match(main, /itemsFilters: items&&Boolean\(ITEM_VIEWS\.find\(v=>v\.id===view\)\?\.filters\)/);
});

test('GM-NV-04/05: sample files and Adopt & tag are in Developer Tools; one drafts control (the profile)', () => {
  const importTab = tpl.slice(tpl.indexOf('\n  {{#if importActive}}\n'), tpl.indexOf('\n  {{#if itemsActive}}\n'));
  assert.doesNotMatch(importTab, /data-ag-drafts|template-example|import-format-example|source-manifest-template/);
  assert.match(importTab, /data-ag-profile/);
  const dev = tpl.slice(tpl.indexOf('{{{setupPanels.developer}}}'));
  for (const a of ['demo', 'template-example', 'import-format-example', 'source-manifest-template', 'capture-tag', 'capture-export']) assert.match(dev, new RegExp(`data-ag-action="${a}"`), a);
});

// ---- Components and accessibility ----
test('GM-A11-01/03, GM-CO-08: every file picker is a kit fileButton (a real button and a visually hidden input)', () => {
  assert.doesNotMatch(tpl, /<input type="file"/);
  for (const k of ['import', 'rules', 'codex', 'moods']) assert.match(tpl, new RegExp(`\\{\\{\\{fileButtons\\.${k}\\}\\}\\}`), k);
  assert.match(main, /bindFileButtons\(root,\(files,wrap\)=>this\.#pickFile\(wrap\.dataset\.agFileKind,files\[0\],files\)\)/);
  assert.doesNotMatch(read('../styles/manager.css'), /input\{display:none\}/);
});

test('GM-A11-04/05: drawer chips are toggle chips; menus drop the menu roles; the pane is the main tab panel', () => {
  const drawer = tpl.slice(tpl.indexOf('<aside class="agm-drawer'), tpl.indexOf('</aside>', tpl.indexOf('<aside class="agm-drawer')));
  assert.match(drawer, /<div class="ag-chip-group" role="group" aria-label="Message kinds">/);
  assert.doesNotMatch(drawer, /role="tab"|aria-selected|role="tabpanel"/);
  assert.match(drawer, /data-ag-drawer-tab="\{\{id\}\}" aria-pressed=/);
  assert.doesNotMatch(tpl, /role="menu"|role="menuitem"/);
});

test('GM-A11-06: each module card Open names its module; the card itself carries no tooltip', () => {
  assert.match(tpl, /data-ag-module-open="\{\{id\}\}" aria-label="Open \{\{title\}\}"/);
  assert.doesNotMatch(tpl, /<article class="ag-card agmanager-module-card"[^>]*data-tooltip/);
  assert.doesNotMatch(tpl, /GM launcher remains available/);
});

test('GM-CR-03/GM-CO-03: Codex detail sub-tabs; reveals are badged "Applies now"; Notes & links is a draft with its own footer', () => {
  const codex = tpl.slice(tpl.indexOf('\n  {{#if codexActive}}'), tpl.indexOf('\n  {{#if modulesActive}}'));
  const reveals = codex.slice(codex.indexOf('{{#if ../codex.onReveals}}'), codex.indexOf('{{#if ../codex.onNotes}}'));
  assert.match(reveals, /<span class="ag-badge ag-badge--accent">Applies now<\/span>/);
  assert.match(reveals, /class="ag-segmented agcodex-seg" role="radiogroup"/);
  assert.doesNotMatch(reveals, /codex-save/);
  const notes = codex.slice(codex.indexOf('{{#if ../codex.onNotes}}'), codex.indexOf('{{#if ../codex.onPreview}}'));
  assert.ok(notes.indexOf('data-ag-codex-learned') < notes.indexOf('<footer') && notes.indexOf('data-ag-action="codex-save"') > notes.indexOf('<footer'), 'footer is last in its panel');
  assert.match(notes, /data-ag-codex-status/);
  assert.match(main, /if\(this\.codexDraft&&this\.codexDraft\.id!==id\)\{\s*if\(!\(await this\.codexGuard\.confirm\(\)\)\)return;/, 'switching NPC with unsaved notes asks first');
});

test('GM-A11-07: GM Setup and Codex drafts survive re-renders and closing the window asks first', () => {
  assert.match(main, /this\.setupGuard = guardDirty\(\{status:\(\)=>this\.element\?\.querySelector\('\[data-ag-setup-status\]'\)\}\);/);
  assert.match(main, /async close\(options\) \{\s*if\(!\(await this\.#confirmDiscard\(\)\)\)return this;/);
  assert.match(main, /const pick=this\.setupDraft\?\.worldSkin\?\?st\.worldDefault;/);
  assert.match(main, /if\(detail&&this\.codexDraft\?\.id===detail\.id\)Object\.assign\(detail,/);
  assert.match(tpl, /<span class="ag-footer__status" role="status" data-ag-setup-status>/);
});

test('GM-CR-04: the mood editor replaces the library list while editing, with a way back', () => {
  const lib = tpl.slice(tpl.indexOf('{{#if moods.library}}'), tpl.indexOf('{{#if moods.share}}'));
  assert.ok(lib.indexOf('{{#if moods.edit}}') < lib.indexOf('agmanager-mood-editor') && lib.indexOf('agmanager-mood-editor') < lib.indexOf('{{else}}')
    && lib.indexOf('{{else}}') < lib.indexOf('aria-label="Moods and layers"'), 'editor or list, never both');
  assert.match(lib, /<button type="button" class="ag-link" data-ag-action="mood-cancel"><i class="fa-solid fa-arrow-left" aria-hidden="true"><\/i> All moods and layers<\/button>/);
});

test('GM-CO-01/02/05: kit split, kv, rows and cards replace the hand-rolled copies; ink tokens on soft fills; toned badges', () => {
  const css = read('../styles/manager.css');
  for (const gone of ['.aglib-rail', '.aglib-kv>div', '.agcodex-seg .is-party', '.agmanager-auditrow', '.agmanager-presession-status', '.agmanager-appearance-pop'])
    assert.ok(!css.includes(gone), gone);
  assert.equal((tpl.match(/class="ag-split aglib-split/g) ?? []).length, 2, 'Records and NPC Codex use the kit split');
  assert.match(tpl, /<dl class="ag-kv aglib-kv">/);
  assert.match(tpl, /<ul class="ag-rows agmanager-presession-rows">/);
  assert.match(tpl, /<article class="ag-card ag-card--compact agmanager-result/);
  assert.match(tpl, /<span class="ag-badge\{\{#if tone\}\} ag-badge--\{\{tone\}\}\{\{\/if\}\}">\{\{status\}\}<\/span>/, 'History status badges carry a tone');
  for (const ink of ['--ag-ok-ink', '--ag-accent-ink', '--ag-danger-ink']) assert.ok(css.includes(`var(${ink})`), ink);
  assert.doesNotMatch(css.replace(/\.agmanager-emblem\{[^}]*\}/, ''), /[^-]color:var\(--ag-(ok|danger|accent)\)/, 'no base tone colour as text (the header emblem icon aside)');
});

test('GM-NV-07: My Appearance and the player Codex have a standard header with Help; My Appearance saves Size with Save', () => {
  const my = read('../templates/my-appearance.hbs');
  const header = my.slice(0, my.indexOf('</header>'));
  assert.doesNotMatch(header, /<p>/, 'no subtitle');
  assert.ok(header.indexOf('ag-version') < header.indexOf('data-ag-my-help'));
  assert.match(my, /data-ag-my-cancel>Cancel<\/button><span class="ag-footer__status/);
  assert.match(main, /data-ag-codex-refresh>[\s\S]{0,200}<span class="ag-version">v\$\{escapeHtml\(version\)\}<\/span><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-codex-help>/);
  assert.match(main, /async close\(options\)\{\s*if\(!\(await this\.guard\.confirm\(\)\)\)return this;/, 'My Appearance asks before dropping a pick');
});

test('GM-NV-10: preview → apply flows say Apply (n)…, imports say Import (n)', () => {
  assert.match(tpl, /data-ag-action="clean-commit"[^>]*>.*Apply \(<span data-ag-clean-count>/);
  assert.match(tpl, /data-ag-action="org-apply"[^>]*>.*Apply \(\{\{org\.preview\.totals\.moves\}\}\)…/);
  assert.match(tpl, /data-ag-action="cl-apply"[^>]*>.*Apply \(\{\{cl\.preview\.tickedCount\}\}\)…/);
  assert.match(tpl, /data-ag-action="apply"[^>]*>.*Import \(\{\{selectedCount\}\}\)/);
  assert.match(tpl, /data-ag-action="mood-import-apply">.*Import \(\{\{moods\.import\.items\.length\}\}\)/);
});

test('GM-CO-07: the unused appearance consumer helper is gone; applyTo is documented for detached roots only', () => {
  assert.equal(fs.existsSync(new URL('../scripts/appearance-consumer.mjs', import.meta.url)), false);
  assert.match(main, /Use it only for a\s*\/\/ detached root/);
  // Appearance API names are unchanged (the Hub and Utilities depend on them).
  assert.match(main, /appearance:\{\s*contract:APPEARANCE_CONTRACT,\s*listSkins:/);
  for (const name of ['getState', 'applyTo', 'subscribe', 'refresh', 'setWorldDefault', 'setUserOverride', 'listSizes', 'setSize', 'openMyAppearance'])
    assert.match(main, new RegExp(`\\b${name}:`), name);
});
