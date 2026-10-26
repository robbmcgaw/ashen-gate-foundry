// 0.43.0: General Manager UI pass (ui-standard). GM Setup saves with Save Changes (D4), standard header and tabs, one scroll
// pane, kit buttons and footers, Foundry tooltips. Proves logic and markup text with mocked Foundry, not the live Forge UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readGmSetupForm, saveGmSetup} from '../scripts/gm-setup.js';
import {toolbarHtml, bodyHtml, DEFAULT_STATE} from '../scripts/browse-view.js';
import {confirmDialog} from '../scripts/ag-dialogs.mjs';
import {FACETS} from '../scripts/browse.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');
const css = read('../styles/manager.css');
const MODULE = 'ashen-gate-manager', KEY = 'codexPlayerAccess';

// ---- D4: GM Setup saves only with Save Changes ----
function world({gm = true, access = false, skin = 'ag-default', sources = {auto: true, packs: [], folders: []}} = {}) {
  const store = new Map([[KEY, access]]), writes = [];
  let worldSkin = skin, saved = structuredClone(sources);
  const game = {user: {isGM: gm}, settings: {get: (ns, k) => store.get(k), set: async (ns, k, v) => {writes.push([k, v]); store.set(k, v);}}};
  const appearance = {listSkins: () => [{id: 'ag-default'}, {id: 'ag-parchment'}], getState: () => ({worldDefault: worldSkin}),
    setWorldDefault: async id => {writes.push(['worldSkin', id]); worldSkin = id;}};
  const coreLinks = {describeSources: () => ({auto: saved.auto, packs: [{id: 'world.core', configured: saved.packs.includes('world.core')}, {id: 'world.ddb', configured: saved.packs.includes('world.ddb')}],
    folders: [{id: 'f1', configured: saved.folders.includes('f1')}]}),
  saveSources: async v => {writes.push(['sources', v]); saved = structuredClone(v); return {ok: true};}};
  return {game, appearance, coreLinks, writes, store, ctx: {game, moduleId: MODULE, codexAccessKey: KEY, appearance, coreLinks}};
}
const box = (data, checked) => ({checked, dataset: data});
function form({access = false, skin = 'ag-default', auto = true, packs = [], folders = []} = {}) {
  const els = {
    '[data-ag-codex-access]': box({}, access), '[data-ag-setup-skin]': {value: skin}, '[data-ag-setup-auto]': box({}, auto)};
  const lists = {
    '[data-ag-setup-pack]': ['world.core', 'world.ddb'].map(id => box({agSetupPack: id}, packs.includes(id))),
    '[data-ag-setup-folder]': ['f1'].map(id => box({agSetupFolder: id}, folders.includes(id)))};
  return {querySelector: s => els[s] ?? null, querySelectorAll: s => lists[s] ?? []};
}

test('D4: GM Setup saves nothing on its own; the NPC Codex switch is on the Modules tab (0.46.0)', () => {
  assert.doesNotMatch(main, /\[data-ag-codex-access\]'\)\?\.addEventListener/, 'no instant save on tick');
  assert.doesNotMatch(tpl, /saves as soon as you tick/);
  const setup = tpl.slice(tpl.indexOf('{{#if setupActive}}\n  <div class="agm-setup">'), tpl.indexOf('agm-setup-footer'));
  assert.doesNotMatch(setup, /data-ag-codex-access/, 'one control for Codex access: its Modules card');
  assert.match(main, /case "setup-save": await this\.#saveSetup\(\); break;/);
  assert.match(main, /saveGmSetup\(readGmSetupForm\(form\)/);
  // Every setting in GM Setup is part of one draft that survives re-renders and sub-tab switches.
  assert.match(main, /const note=\(\)=>\{this\.setupDraft=readGmSetupForm\(form\);this\.setupGuard\.markDirty\(\);\};/);
});

test('D4: Save Changes writes the changed settings together, same keys, and only what changed', async () => {
  const w = world();
  const values = readGmSetupForm(form({access: true, skin: 'ag-parchment', packs: ['world.ddb']}));
  assert.deepEqual(values, {codexAccess: true, worldSkin: 'ag-parchment', sources: {auto: true, packs: ['world.ddb'], folders: []}});
  assert.equal(w.writes.length, 0, 'reading the form writes nothing');
  const out = await saveGmSetup(values, w.ctx);
  assert.equal(out.ok, true);
  assert.deepEqual(w.writes.map(([k]) => k), ['worldSkin', KEY, 'sources']);
  assert.equal(w.store.get(KEY), true);
  assert.match(out.message, /GM Setup saved: world appearance, players can open the NPC Codex, core sources\./);
  // Saving again with nothing changed writes nothing.
  const again = await saveGmSetup(readGmSetupForm(form({access: true, skin: 'ag-parchment', packs: ['world.ddb']})), w.ctx);
  assert.equal(w.writes.length, 3);
  assert.equal(again.message, 'GM Setup saved. Nothing had changed.');
});

test('D4: turning access off saves false; a player is rejected in the data layer; an unknown skin is refused', async () => {
  const w = world({access: true});
  await saveGmSetup(readGmSetupForm(form({access: false})), w.ctx);
  assert.deepEqual(w.writes, [[KEY, false]]);
  const p = world({gm: false});
  await assert.rejects(saveGmSetup({codexAccess: true}, p.ctx), /Only the GM can change GM Setup/);
  assert.equal(p.writes.length, 0);
  const bad = await saveGmSetup({worldSkin: 'not-a-skin'}, world().ctx);
  assert.equal(bad.ok, false);
  assert.match(bad.message, /"not-a-skin" is not an Ashen Gate skin/);
});

test('GM Setup: sub-tabs General · Core sources · Developer Tools, Developer Tools last, Cancel left and Save Changes right', () => {
  const setup = tpl.slice(tpl.indexOf('{{#if setupActive}}\n  <div class="agm-setup">'), tpl.lastIndexOf('{{/if}}'));
  const order = ['{{{setupTabsHtml}}}', '{{{setupPanels.general}}}', 'World appearance', 'NPC Codex', '{{{setupPanels.sources}}}', 'Core sources', '{{{setupPanels.developer}}}', 'class="ag-devtools', 'data-ag-action="demo"'].map(s => setup.indexOf(s));
  assert.ok(order.every(i => i > 0), 'all parts present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order, Developer Tools at the end');
  assert.match(main, /const SETUP_TABS=\[\{id:'general',label:'General'\},\{id:'sources',label:'Core sources'\},\{id:'developer',label:'Developer Tools'\}\];/);
  assert.doesNotMatch(setup, /presession|player-access-toggle/, 'GM Setup holds settings, not tools');
  // The Developer Tools panel sits outside the draft, so its tools never mark GM Setup as changed.
  assert.ok(setup.indexOf('{{{setupPanels.developer}}}') > setup.indexOf('data-ag-setup-form') && setup.lastIndexOf('</div>', setup.indexOf('{{{setupPanels.developer}}}')) > setup.indexOf('{{{setupPanels.sources}}}'));
  const footer = setup.slice(setup.indexOf('<footer class="ag-footer agm-setup-footer">'));
  assert.ok(footer.indexOf('data-ag-action="setup-cancel"') < footer.indexOf('ag-footer__status') && footer.indexOf('ag-footer__status') < footer.indexOf('data-ag-action="setup-save"'));
  assert.match(footer, /class="ag-btn ag-btn--ghost" data-ag-action="setup-cancel">Cancel/);
  assert.match(footer, /class="ag-btn ag-btn--primary" data-ag-action="setup-save">.*Save Changes/);
  assert.match(main, /case "setup-cancel": this\.setupDraft=null; this\.setupGuard\.markClean\(\); this\.setupMessage="Changes discarded\."; await this\.render\(\); break;/);
  assert.match(main, /case "demo": \{[\s\S]{0,400}this\.tab="import";/, 'Load example opens the Import tab');
  assert.doesNotMatch(tpl.slice(0, tpl.indexOf('{{#if setupActive}}')), /data-ag-action="demo"/, 'Load example only in Developer Tools');
});

// ---- Header, tabs, layout ----
test('header: standard brand h1, emblem fa-boxes-stacked, then My Appearance, GM only flag, runtime version, Help', () => {
  const header = tpl.slice(tpl.indexOf('<header class="ag-header'), tpl.indexOf('</header>'));
  assert.match(header, /<h1><i class="agmanager-emblem fa-solid fa-boxes-stacked" aria-hidden="true"><\/i> <span class="ag-header__brand">Ashen Gate<\/span> \| General Manager<\/h1>/);
  assert.doesNotMatch(header, /fa-dungeon|Beta|Alpha/);
  const at = s => header.indexOf(s);
  assert.ok(at('data-ag-action="appearance-my-appearance"') > 0 && at('data-ag-action="appearance-my-appearance"') < at('class="ag-gm-flag"') && at('class="ag-gm-flag"') < at('class="ag-version"') && at('class="ag-version"') < at('data-ag-action="help"'));
  assert.match(header, /class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-action="help"/);
  assert.match(main, /name:"General Manager", label:"Open General Manager"/);
});

test('tabs: kit tablist (roving tabindex, aria-controls), six tabs, icons hidden, GM Setup last and marked', () => {
  const nav = tpl.slice(tpl.indexOf('<nav class="ag-tabs'), tpl.indexOf('</nav>'));
  assert.match(nav, /class="ag-tabs ag-tabs--scroll agmanager-nav" role="tablist"/);
  const tabs = [...nav.matchAll(/<button [^>]*data-ag-tab="([a-z]+)"[^>]*>/g)];
  assert.deepEqual(tabs.map(m => m[1]), ['import', 'items', 'codex', 'modules', 'scenes', 'setup']);
  for (const [b] of tabs) { assert.match(b, /role="tab"/); assert.match(b, /aria-selected="/); assert.match(b, /aria-controls="agm-pane"/); assert.match(b, /tabindex="\{\{#if /); }
  assert.match(tpl, /<div class="ag-scroll agm-pane" id="agm-pane" role="tabpanel" aria-labelledby="agm-tab-\{\{tab\}\}">/);
  assert.match(main, /bindTablist\(root\.querySelector\('\.agmanager-nav'\)\);/);
  assert.match(tabs.at(-1)[0], /ag-tab--gm/);
  assert.equal((nav.match(/<i class="fa-solid [^"]+" aria-hidden="true">/g) ?? []).length, 6);
});

test('header and tabs stay put: .ag-window with one .ag-scroll pane, scroll kept on re-render, no negative-margin hacks', () => {
  assert.match(tpl, /^<section class="agmanager-body ag-window">/);
  assert.match(tpl, /<\/nav>\n\n  <div class="ag-scroll agm-pane" id="agm-pane"/);
  // 0.45.0: the Import message drawer and the preview table keep their scroll too.
  assert.match(main, /scrollable: \["\.agm-pane", "\.aglib-rows", "\.ag-split__detail", "\.agm-drawer__body", "\.agm-preview-table"\]/);
  assert.match(css, /\.ashen-gate-manager \.window-content\{padding:0;overflow:hidden\}/);
  assert.doesNotMatch(css, /margin:0 -16px|margin-top:-12px/);
  assert.doesNotMatch(css, /max-height:(310|340|370|375|480|500)px/, 'no fixed-height nested scrollers');
});

// ---- Buttons, footers, confirmations ----
test('the panel button override is gone and every Manager button carries a kit class', () => {
  assert.doesNotMatch(css, /agmanager-panel button|agmanager-row button|agmanager-appearance-pop button/);
  assert.doesNotMatch(tpl, /agmanager-panel|agmanager-primary|agmanager-muted|agmanager-help|agmanager-mood-footer|agmanager-chip|agmanager-badge|agmanager-beta|aglib-pill|aglib-chip/);
  // Buttons that are not .ag-btn are other kit parts or purpose-built controls: tabs, radio cards, rail icons, menu items, chips, row buttons, segmented options.
  // 0.46.0: menu items are plain buttons in a <details> disclosure (no menu role), styled by .aglib-menu__pop.
  const other = /role="(tab|radio)"|class="(ag-chip|ag-link|aglib-row__main|agcodex-row|agcodex-link)/;
  const menus = [...tpl.matchAll(/<div class="aglib-menu__pop">[\s\S]*?<\/div>/g)].map(m => m[0]).join('');
  for (const [b] of tpl.matchAll(/<button\b[^>]*>/g)) if (!other.test(b) && !menus.includes(b)) assert.match(b, /class="[^"]*\bag-btn\b/, b);
  assert.doesNotMatch(tpl, /role="menu(item)?"/);
  for (const html of [toolbarHtml(DEFAULT_STATE)]) for (const [b] of html.matchAll(/<button\b[^>]*>/g)) assert.match(b, /\bag-btn\b/, b);
});

test('one gold primary per form; Cancel is ghost bottom-left; Delete or Remove never sits next to Cancel', () => {
  for (const [block] of tpl.matchAll(/<footer class="ag-footer[\s\S]*?<\/footer>/g)) {
    const buttons = [...block.matchAll(/<button\b[^>]*>/g)].map(m => m[0]);
    assert.match(buttons[0], /ag-btn--ghost/, block.slice(0, 120));
    assert.match(buttons[0], /-cancel"|"reset"|"org-clear"|"cl-clear"/, 'first is Cancel');
    assert.ok(buttons.filter(b => /ag-btn--primary/.test(b)).length <= 1, 'at most one primary');
    assert.ok(buttons.every(b => !/ag-btn--danger/.test(b)), 'no danger action in a footer');
  }
  const editor = tpl.slice(tpl.indexOf('agmanager-mood-editor'), tpl.indexOf('{{#if moods.share}}'));
  assert.ok(editor.indexOf('data-ag-action="mood-remove"') < editor.indexOf('<footer'), 'Remove moved to the editor header');
});

test('danger buttons all ask first with a danger confirm, and Cancel changes nothing', async () => {
  const danger = [...tpl.matchAll(/<button\b[^>]*ag-btn--danger[^>]*data-ag-action="([a-z-]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(danger, ['capture-untag', 'codex-hide-all', 'look-remove', 'mood-remove', 'mood-reset', 'org-schema-reset']);
  for (const title of ['Remove recovery tags?', 'Hide this NPC from players?', 'Remove this look?', 'Remove this scene ${noun}?', 'Reset scene moods and layers?', 'Reset organize rules?']) {
    const at = main.indexOf(`title:${title.includes('${') ? '`' : "'"}${title}`);
    assert.ok(at > 0, title);
    const call = main.lastIndexOf('confirm', at);
    assert.equal(main.slice(call, call + 14), 'confirmDanger(', title);
  }
  const calls = [];
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async o => { calls.push(o); return o.buttons[0].callback(); }}}}};
  let changed = false;
  if (await confirmDialog('Reset the organize rules?', {title: 'Reset organize rules?', yes: 'Reset rules to defaults', danger: true})) changed = true;
  assert.equal(changed, false);
  assert.equal(calls[0].buttons[0].label, 'Cancel');
});

// ---- Tooltips, labels, empty states ----
test('Foundry tooltips replace title=, icon-only buttons have a label and a tooltip, icons are hidden from screen readers', () => {
  assert.doesNotMatch(tpl, /\stitle="/);
  assert.doesNotMatch(read('../scripts/codex.js'), /\stitle="/);
  for (const [b] of tpl.matchAll(/<button\b[^>]*ag-btn--icon[^>]*>/g)) {
    assert.match(b, /aria-label="/, b);
    assert.match(b, /data-tooltip="[^"]+" data-tooltip-class="ag-tooltip"/, b);
  }
  for (const [i] of tpl.matchAll(/<i class="fa-[^"]*"[^>]*>/g)) assert.match(i, /aria-hidden="true"|aria-label=/, i);
  assert.doesNotMatch(tpl, /class="fa-solid fa-dungeon"/);
});

test('empty states use the kit with a title and next step; tables are kit tables with column scope and labelled action headers', () => {
  for (const s of ['No Ashen Gate records yet', 'No NPCs yet', 'No other Ashen Gate modules yet', 'No imports yet', 'Nothing to link', 'Nothing matches'])
    assert.match(tpl, new RegExp(`<p class="ag-empty__title">${s}</p><p class="ag-empty__text">`), s);
  assert.doesNotMatch(tpl, /agmanager-table/);
  for (const [t] of tpl.matchAll(/<table class="ag-table">[\s\S]*?<\/thead>/g)) {
    assert.doesNotMatch(t, /<th>/, 'every th has scope');
    assert.doesNotMatch(t, /<th scope="col"[^>]*><\/th>/, 'no empty header');
  }
  assert.equal((tpl.match(/<table class="ag-table">/g) ?? []).length, (tpl.match(/<div class="ag-table-wrap[^"]*"><table class="ag-table">|<div class="ag-table-wrap[^"]*">\n\s*<table class="ag-table">/g) ?? []).length, 'every table is wrapped');
});

// ---- Items toolbar ----
test('Items: one toolbar with one Load compendiums, one Clear filters and one pager style', () => {
  const items = tpl.slice(tpl.indexOf('{{#if itemsActive}}\n  <div class="agitems">'), tpl.indexOf('{{#if itemsAll}}\n    <div class="agbrowse"'));
  assert.equal((items.match(/class="ag-toolbar[ "]/g) ?? []).length, 1);
  assert.equal((items.match(/data-ag-items-packs>/g) ?? []).length, 1);
  assert.equal((items.match(/data-ag-items-clear /g) ?? []).length, 1);
  assert.match(items, /data-ag-browse-tools/, 'Sort and Group join the same toolbar');
  const body = bodyHtml(DEFAULT_STATE, {scopes: {ag: 1, nonag: 0, all: 1}, facets: Object.fromEntries(FACETS.map(f => [f, []])), groups: [], total: 0, page: 0, pages: 2, from: 0, to: 0, activeFilters: 0}, null, {});
  assert.doesNotMatch(body, /data-ag-browse-clear|data-ag-browse-packs|>Previous<|>Next</);
  assert.match(body, /class="ag-btn ag-btn--sm ag-btn--ghost ag-btn--icon" data-ag-browse-page="1" aria-label="Next page" data-tooltip="Next page"/);
  assert.match(main, /Object\.assign\(this\.browseState,\{query:'',filters:\{\},managedOnly:false,unlinkedOnly:false\}\)/, 'Clear filters also clears the All items facets');
});

test('World appearance cards: selected skin keeps its highlight (no override beats it), saved default marked', () => {
  assert.match(css, /\.agm-skin-card\.is-selected,\.agm-skin-card\.is-selected:hover\{[^}]*background:var\(--ag-accent-soft\)/);
  assert.ok(css.indexOf('.agm-skin-card.is-current') < css.indexOf('.agm-skin-card.is-selected'), 'selected wins over saved');
  assert.match(tpl, /agm-skin-card\{\{#if selected\}\} is-selected\{\{\/if\}\}\{\{#if current\}\} is-current\{\{\/if\}\}/);
  assert.match(main, /current:skin\.id===st\.worldDefault,selected:skin\.id===pick/);
  assert.match(main, /const pick=this\.setupDraft\?\.worldSkin\?\?st\.worldDefault;/, 'an unsaved pick stays highlighted across re-renders');
});

test('windows open through windowSize() so Comfortable gets a bigger window', () => {
  for (const cls of ['AshenGateManager', 'AshenGateMyAppearance', 'AshenGateCodexPlayer'])
    assert.match(main, new RegExp(`windowSize\\(${cls}\\.DEFAULT_OPTIONS\\.position\\)`), cls);
  for (const t of [read('../templates/my-appearance.hbs'), main.slice(main.indexOf('class AshenGateCodexPlayer'))])
    assert.match(t, /<h1><span class="ag-header__brand">Ashen Gate<\/span> \| [^<]+<\/h1>[\s\S]*class="ag-version"/);
});
