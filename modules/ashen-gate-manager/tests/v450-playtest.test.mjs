/** 0.45.0 play-test fixes: Import tab layout, chunked Clean compendiums, "Cinder - Powers" folder, Hub follows Player Access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeLayout, noteDrawerChanges, drawerContext, DEFAULT_LAYOUT} from '../scripts/import-layout.js';
import {createOrganizer, SCHEMA_SETTING, HISTORY_SETTING, CHUNK} from '../scripts/organize.js';
import {ensureFolder, renameSegments, renameManagerFolders} from '../scripts/folders.js';
import {followPatch, followHubVisibility, HUB_ID, CINDERS_ID} from '../scripts/hub-visibility.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const tpl = read('../templates/manager.hbs');
const main = read('../scripts/main.js');

// ---- 1. Import tab layout ----
test('Import tab: Load, ZIP, Options and Preview are remembered folds; messages are in a drawer below the scrolling pane', () => {
  for(const key of ['load', 'zip', 'options', 'preview']) assert.match(tpl, new RegExp(`data-ag-fold="${key}" \\{\\{#if folds\\.${key}\\}\\}open\\{\\{/if\\}\\}`), key);
  const pane = tpl.slice(tpl.indexOf('<div class="ag-scroll agm-pane"'), tpl.indexOf('<aside class="agm-drawer'));
  // 0.46.0: the folds are kit .ag-fold sections.
  for(const key of ['load', 'zip', 'options', 'preview']) assert.match(tpl, new RegExp(`<details class="ag-fold[^"]*" data-ag-fold="${key}"`), key);
  const importPart = pane.slice(pane.indexOf('{{#if importActive}}\n'), pane.indexOf('{{#if itemsActive}}\n'));
  assert.ok(importPart.length > 1000);
  // None of the long message lists sit above or between the main controls any more.
  for(const s of ['Validation failed', 'Import review notes', 'Links to other Ashen Gate modules', 'Import results']) assert.doesNotMatch(importPart, new RegExp(s), s);
  const drawer = tpl.slice(tpl.indexOf('<aside class="agm-drawer'), tpl.indexOf('</aside>', tpl.indexOf('<aside class="agm-drawer')));
  for(const s of ['Validation failed', 'Import review notes', 'Links to other Ashen Gate modules', 'Import results', 'data-ag-drawer-tab', 'data-ag-drawer-toggle']) assert.match(drawer, new RegExp(s), s);
  assert.match(tpl, /<\/div>\n  \{\{#if importActive\}\}\{\{#if drawer\.any\}\}\n  <aside class="agm-drawer/, 'drawer is outside the scrolling pane');
  // Validate & Preview stays in the main controls, outside every fold.
  const actions = importPart.slice(importPart.indexOf('agm-import-actions'));
  assert.match(actions.slice(0, 600), /data-ag-action="preview"/);
  const css = read('../styles/manager.css');
  assert.match(css, /\.agm-drawer__body\{max-height:min\(18rem,35vh\)/);
  assert.match(css, /\.agm-scrollcap\{max-height:min\(28rem,45vh\);overflow:auto/);
  assert.match(main, /game\.settings\.register\(MODULE_ID,LAYOUT_SETTING,\{name:"Import tab layout",scope:"client",config:false/);
});

test('Items tab lists that can grow long scroll in their own capped box', () => {
  for(const marker of ['agmanager-audit agm-scrollcap', 'aria-label="Library check results"']) assert.match(tpl, new RegExp(marker));
  const items = tpl.slice(tpl.indexOf('{{#if itemsActive}}\n'), tpl.indexOf('{{#if modulesActive}}\n'));
  // Adopt table, Clean groups, organize groups, rules and core links all capped.
  assert.ok((items.match(/agm-scrollcap/g) ?? []).length >= 7, `${(items.match(/agm-scrollcap/g) ?? []).length} capped lists`);
  assert.match(read('../styles/manager.css'), /\.aglib-rows\{flex:1 1 auto;max-height:min\(36rem,60vh\);overflow:auto\}/, 'records list keeps its own cap');
});

test('layout: stored values are cleaned; new errors open the drawer at Errors, a new result at Results, otherwise the GM choice stands', () => {
  assert.deepEqual(normalizeLayout(null), {folds:{...DEFAULT_LAYOUT.folds}, drawerOpen:false, drawerTab:null});
  assert.deepEqual(normalizeLayout({folds:{options:true, load:'x'}, drawerOpen:true, drawerTab:'bogus'}).folds, {load:true, zip:true, options:true, preview:true});
  const layout = normalizeLayout({});
  let seen = noteDrawerChanges(layout, {errors:0, resultsKey:''}, '');
  assert.equal(layout.drawerOpen, false);
  seen = noteDrawerChanges(layout, {errors:3, resultsKey:''}, seen);
  assert.deepEqual([layout.drawerOpen, layout.drawerTab], [true, 'errors']);
  layout.drawerOpen = false; // GM hides it
  seen = noteDrawerChanges(layout, {errors:3, resultsKey:''}, seen);
  assert.equal(layout.drawerOpen, false, 'same errors on re-render do not reopen it');
  seen = noteDrawerChanges(layout, {errors:0, resultsKey:'1:t1:a.json'}, seen);
  assert.deepEqual([layout.drawerOpen, layout.drawerTab], [true, 'results']);
});

test('drawer context: counts in the summary line, the chosen tab only when it has content, nothing when empty', () => {
  const layout = {folds:{}, drawerOpen:true, drawerTab:'links'};
  assert.equal(drawerContext(layout, {}).any, false);
  const ctx = drawerContext(layout, {errors:0, warnings:2, links:0, results:1});
  assert.deepEqual(ctx.tabs.map(t => [t.id, t.count, t.active]), [['errors', 0, false], ['warnings', 2, true], ['links', 0, false], ['results', 1, false]]);
  assert.equal(ctx.warnings, true); assert.equal(ctx.links, false);
  assert.equal(drawerContext({...layout, drawerOpen:false}, {warnings:2}).warnings, false, 'closed drawer shows only the bar');
});

// ---- 2. Clean compendiums: chunked, yielding, cancellable ----
function bigWorld(n = 2100, {failAt = null} = {}) {
  const items = Array.from({length:n}, (_, i) => ({id:`I${i}`, _id:`I${i}`, name:`[TEST] Thing ${i}`, type:'loot', folder:null, flags:{ddbimporter:{id:i}}, system:{}}));
  const store = {[SCHEMA_SETTING]:[], [HISTORY_SETTING]:[]};
  const calls = [], rendered = [];
  let yields = 0, controller = null, cancelAfter = Infinity;
  const game = {user:{isGM:true}, settings:{get:(ns, k) => structuredClone(store[k]), set:async (ns, k, v) => {store[k] = v;}},
    items:{contents:items}, actors:{contents:[]}, journal:{contents:[]}, folders:{contents:[]}, packs:{contents:[]}};
  const api = createOrganizer({game,
    updateDocuments:async (name, updates, opts) => {
      calls.push({n:updates.length, opts});
      if(failAt !== null && calls.length === failAt) throw new Error('server said no');
      for(const u of updates) items.find(d => d._id === u._id).folder = u.folder;
    },
    createFolder:async d => ({id:`F-${d.name}`, ...d}),
    yieldToUI:async () => {yields++; if(calls.length >= cancelAfter) controller?.abort();},
    rerender:scope => rendered.push(scope.documentName)});
  return {api, items, store, calls, rendered, get yields() {return yields;}, cancelAt:(c, k) => {controller = c; cancelAfter = k;}};
}
const keysOf = (api, prev) => prev.sources.flatMap(s => s.parts.flatMap(p => p.moves.map(m => api.moveKey(s.key, p.documentName, m.id))));

test('Clean commit of ~2100 items: chunks of 50, render:false, a yield after every chunk, one redraw per place', async () => {
  const w = bigWorld(2100);
  const prev = await w.api.cleanPreview();
  const keys = keysOf(w.api, prev);
  assert.equal(keys.length, 2100);
  const progress = [];
  const out = await w.api.cleanApply({moves:keys, onProgress:p => progress.push(p.done)});
  assert.equal(out.ok, true); assert.equal(out.moved, 2100);
  assert.equal(CHUNK, 50);
  assert.equal(w.calls.length, 42); assert.ok(w.calls.every(c => c.n <= 50 && c.opts.render === false));
  assert.equal(w.yields, 42, 'the browser gets a turn after each chunk');
  assert.deepEqual(w.rendered, ['Item'], 'the sidebar is redrawn once at the end');
  assert.equal(progress.at(-1), 2100); assert.ok(progress.length >= 42);
  assert.ok(w.items.every(i => i.folder), 'every item filed');
});

test('Cancel stops between chunks: written chunks stay and are in Undo, the rest are untouched, Undo puts it all back', async () => {
  const w = bigWorld(600);
  const keys = keysOf(w.api, await w.api.cleanPreview());
  const controller = new AbortController();
  w.cancelAt(controller, 3);
  const out = await w.api.cleanApply({moves:keys, signal:controller.signal});
  assert.equal(out.ok, true); assert.equal(out.cancelled, true);
  assert.equal(out.moved, 150, 'three whole chunks, never half a chunk');
  assert.match(out.message, /Cancelled\. Moved 150 of 600/);
  assert.equal(w.items.filter(i => i.folder).length, 150);
  const entry = w.store[HISTORY_SETTING][0];
  assert.equal(entry.source, 'clean'); assert.equal(entry.partial, true); assert.equal(entry.moves.length, 150);
  assert.deepEqual(w.rendered, ['Item']);
  const undo = await w.api.undoLast();
  assert.equal(undo.ok, true); assert.equal(undo.restored, 150);
  assert.equal(w.items.filter(i => i.folder).length, 0, 'world back as it was');
});

test('an error part way records what was written so Undo can put it back; an already-cancelled signal writes nothing', async () => {
  const w = bigWorld(300, {failAt:4});
  const keys = keysOf(w.api, await w.api.cleanPreview());
  const out = await w.api.cleanApply({moves:keys});
  assert.equal(out.ok, false); assert.equal(out.moved, 150);
  assert.match(out.message, /Clean stopped: server said no\. The 150 document\(s\) moved before it stopped are in Undo last organize/);
  assert.equal(w.store[HISTORY_SETTING][0].moves.length, 150);
  const v = bigWorld(100);
  const k2 = keysOf(v.api, await v.api.cleanPreview());
  const c = new AbortController(); c.abort();
  const none = await v.api.cleanApply({moves:k2, signal:c.signal});
  assert.equal(none.cancelled, true); assert.equal(none.moved, 0); assert.equal(v.calls.length, 0);
  assert.deepEqual(v.store[HISTORY_SETTING], [], 'no empty history entry');
});

test('Manager window: Commit runs with a progress bar and a Cancel button that works while busy', () => {
  assert.match(tpl, /data-ag-clean-bar max="1"/);
  assert.match(tpl, /<button type="button" class="ag-btn ag-btn--danger" data-ag-clean-stop>/);
  assert.match(main, /api\.cleanApply\(\{moves:keys,signal:this\.cleanAbort\.signal/);
  assert.match(main, /querySelector\('\[data-ag-clean-stop\]'\)\?\.addEventListener\('click'/);
});

// ---- 3. "Cinder - Powers" folder ----
const folderSet = list => Object.assign(list, {get:id => list.find(f => f.id === id)});
test('imports filed under Ashen Gate/Cinders/Powers go to "Cinder - Powers"; sub-folders and other paths are unchanged', async () => {
  assert.deepEqual(renameSegments(['Ashen Gate', 'Cinders', 'Powers']), ['Ashen Gate', 'Cinders', 'Cinder - Powers']);
  assert.deepEqual(renameSegments(['Ashen Gate', 'Cinders', 'Powers', 'Ember']), ['Ashen Gate', 'Cinders', 'Cinder - Powers', 'Ember']);
  assert.deepEqual(renameSegments(['Ashen Gate', 'Spells', 'Powers']), ['Ashen Gate', 'Spells', 'Powers']);
  const list = [];
  const folders = folderSet(list);
  let n = 0;
  const create = async d => {const f = {id:`F${++n}`, ...d}; list.push(f); return f;};
  const leaf = await ensureFolder('Item', 'Ashen Gate/Cinders/Powers', {folders, create});
  assert.equal(leaf.name, 'Cinder - Powers');
  assert.deepEqual(list.map(f => f.name), ['Ashen Gate', 'Cinders', 'Cinder - Powers']);
  const again = await ensureFolder('Item', 'Ashen Gate/Cinders/Powers', {folders, create});
  assert.equal(again.id, leaf.id, 'no duplicate folder');
});

const power = id => ({flags:{'ashen-gate-manager':{source:{sourceId:id, entityType:'Power'}}}});
const mkFolders = () => {
  const root = {id:'R', name:'Ashen Gate', type:'Item', folder:null, contents:[]};
  const cind = {id:'C', name:'Cinders', type:'Item', folder:'R', contents:[]};
  const pow = {id:'P', name:'Powers', type:'Item', folder:'C', contents:[power('POWER-TEST-SPARK')]};
  const mine = {id:'U', name:'Powers', type:'Item', folder:null, contents:[{flags:{}}]}; // the GM's own folder
  const other = {id:'S', name:'Powers', type:'Item', folder:'C2', contents:[power('POWER-TEST-X')]};
  const c2 = {id:'C2', name:'Spells', type:'Item', folder:'R', contents:[]};
  return [root, cind, pow, mine, other, c2];
};
test('the old Manager-made Powers folder is renamed once; a GM folder named Powers is never touched', async () => {
  const list = mkFolders(), writes = [];
  const update = async (f, data) => {writes.push([f.id, data]); f.name = data.name;};
  const out = await renameManagerFolders({folders:list, update});
  assert.deepEqual(writes, [['P', {name:'Cinder - Powers', 'flags.ashen-gate-manager.renamedFrom':'Powers'}]]);
  assert.deepEqual(out.renamed.map(r => [r.id, r.from, r.to]), [['P', 'Ashen Gate/Cinders/Powers', 'Ashen Gate/Cinders/Cinder - Powers']]);
  assert.deepEqual(out.done, {cinderPowers:true});
  assert.equal(list.find(f => f.id === 'U').name, 'Powers'); assert.equal(list.find(f => f.id === 'S').name, 'Powers');
  // Runs once: a later "Powers" there (say the GM renamed it back) is left alone.
  list.find(f => f.id === 'P').name = 'Powers';
  const again = await renameManagerFolders({folders:list, update, done:out.done});
  assert.equal(again.renamed.length, 0); assert.equal(writes.length, 1);
});

test('no rename without Manager records in it, and none when "Cinder - Powers" already sits beside it', async () => {
  const empty = mkFolders(); empty.find(f => f.id === 'P').contents = [{flags:{}}];
  const a = await renameManagerFolders({folders:empty, update:async () => assert.fail('must not write')});
  assert.equal(a.renamed.length, 0); assert.match(a.notes[0], /holds no Manager-imported records/);
  const clash = [...mkFolders(), {id:'N', name:'Cinder - Powers', type:'Item', folder:'C', contents:[]}];
  const b = await renameManagerFolders({folders:clash, update:async () => assert.fail('must not write')});
  assert.equal(b.renamed.length, 0); assert.match(b.notes[0], /already sits beside it/);
  assert.deepEqual(b.done, {cinderPowers:true});
});

test('main: rename runs for the active GM on ready and before every Apply, and is remembered in a world setting', () => {
  assert.match(main, /game\.settings\.register\(MODULE_ID,FOLDER_RENAMES_SETTING,\{name:"Folder renames",scope:"world",config:false/);
  assert.match(main, /void runFolderRenames\(\);/);
  assert.match(main, /await runFolderRenames\(\);\n    const log = \{at:new Date\(\)\.toISOString\(\), packageId:this\.pkg\.manifest\.package_id/);
  assert.match(main, /if\(active && active\.id!==game\.user\.id\) return null;/);
});

// ---- 5. Character Hub follows Player Access ----
const PARTS = [{key:'overview', label:'Overview', partner:null}, {key:'strain', label:'Strain bar (Ashen Gate | Cinders)', partner:null},
  {key:'professions', label:'Ashen Gate: Professions', partner:'ashen-gate-profession-ledger'},
  {key:'cinders', label:'Ashen Gate: Cinders', partner:CINDERS_ID}];
function hubModules({active = true, stored = {}, set = null, api = 'full'} = {}) {
  const calls = [];
  const playerVisibility = api === 'full' ? {parts:() => PARTS, get:() => ({...stored}),
    set:set ?? (async patch => {calls.push(patch); Object.assign(stored, patch); return {ok:true, result:stored};})} : api;
  return {modules:new Map([[HUB_ID, {id:HUB_ID, active, api:{playerVisibility}}]]), calls, stored};
}
test('follow patch: a revealed module shows its Hub parts; the Strain bar follows Cinders both ways; hiding others needs nothing', () => {
  assert.deepEqual(followPatch(PARTS, 'ashen-gate-profession-ledger', true), {professions:true});
  assert.deepEqual(followPatch(PARTS, 'ashen-gate-profession-ledger', false), {});
  assert.deepEqual(followPatch(PARTS, CINDERS_ID, true), {cinders:true, strain:true});
  assert.deepEqual(followPatch(PARTS, CINDERS_ID, false), {strain:false});
  assert.deepEqual(followPatch(PARTS.filter(p => p.key !== 'strain'), CINDERS_ID, true), {cinders:true});
});

test('revealing a module sets only the Hub parts that differ, through the Hub\'s public set()', async () => {
  const h = hubModules({stored:{professions:false, cinders:true, strain:false}});
  const out = await followHubVisibility(h.modules, CINDERS_ID, true);
  assert.deepEqual(h.calls, [{strain:true}], 'cinders was already on');
  assert.match(out.message, /Character Hub now shows Strain bar/);
  const off = await followHubVisibility(h.modules, CINDERS_ID, false);
  assert.deepEqual(h.calls.at(-1), {strain:false}); assert.match(off.message, /hides Strain bar/);
  const same = await followHubVisibility(h.modules, 'ashen-gate-profession-ledger', false);
  assert.equal(h.calls.length, 2); assert.equal(same.message, '');
});

test('no Hub, an inactive or older Hub, a refusal or a throw never block Player Access', async () => {
  assert.deepEqual(await followHubVisibility(new Map(), CINDERS_ID, true), {changed:{}, message:''});
  assert.deepEqual((await followHubVisibility(hubModules({active:false}).modules, CINDERS_ID, true)).changed, {});
  assert.deepEqual((await followHubVisibility(hubModules({api:{get:() => ({})}}).modules, CINDERS_ID, true)).changed, {}, 'no set(): skipped');
  const refused = await followHubVisibility(hubModules({set:async () => ({ok:false, error:'Only the GM can change what players see in the Character Hub.'})}).modules, CINDERS_ID, true);
  assert.match(refused.message, /did not update its Player visibility: Only the GM/);
  const thrown = await followHubVisibility(hubModules({set:async () => {throw new Error('boom');}}).modules, CINDERS_ID, true);
  assert.match(thrown.message, /boom/);
});

test('Modules tab: Reveal follows into the Hub, Hide all hides the Strain bar with Cinders', () => {
  assert.match(main, /const hub=await followHubVisibility\(game\.modules,id,result\.playerAccessEnabled\);/);
  assert.match(main, /for\(const row of result\.changed\) await followHubVisibility\(game\.modules,row\.id,false\);/);
  assert.doesNotMatch(read('../scripts/hub-visibility.js'), /settings\.(get|set)\(/, 'never touches the Hub\'s settings');
});
