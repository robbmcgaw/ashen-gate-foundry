import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncView} from '../scripts/sync-view.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const hbs = read('../templates/manager.hbs'), main = read('../scripts/main.js'), css = read('../styles/manager.css');
const importPart = hbs.slice(hbs.indexOf('<div {{{importPanelAttrs}}}'), hbs.indexOf('  {{#if itemsActive}}\n  <div class="agitems">'));
const plan = {ok: true, errors: [], notes: [], counts: {create: 1, overwrite: 0, delete: 0, untouched: 0, rebind: 0, refused: 0, notRemoved: 0, keptEdited: 0, keptRemoved: 0}, scope: {lines: [], files: []}, rows: [], records: 1, characterCount: 0, buttonLabel: 'Replace content from package', artKept: [], offers: [], outOfScope: {records: 0}, lost: 0};
const view = o => syncView({inputs: [], skipped: [], fileButton: '<button>Choose</button>', deleteUnscoped: false, overwriteEdited: false, replaceArt: false, isGM: true, plan: null, phrase: '', busy: false, progress: null, stopping: false, result: null, message: '', ...o});

test('0.70.7 Clear inputs…: present in Import and Sync, disabled with a reason while running, Discard… after an unfinished sync', () => {
  assert.match(importPart, /data-ag-action="clear-inputs"[^>]*>[\s\S]{0,140}Clear inputs…/);
  assert.match(importPart, /\{\{#if busy\}\}disabled aria-describedby="agm-clear-why"/);
  const idle = view({}), busy = view({busy: true}), unfinished = view({unfinished: true});
  assert.match(idle, /data-ag-action="clear-inputs" >[\s\S]*Clear inputs…/);
  assert.match(busy, /data-ag-action="clear-inputs" disabled aria-describedby="agm-clear-why"/); assert.match(busy, /off while a sync is running/);
  assert.match(unfinished, /Discard the unfinished sync…/); assert.match(unfinished, /did not finish/);
  assert.doesNotMatch(idle, /Discard the unfinished/);
});

test('0.70.7 Clear inputs… only clears in-memory inputs: no world writes, no settings, no ledger; confirms; refuses while running', () => {
  const fn = main.slice(main.indexOf('async #clearInputs()'), main.indexOf('#syncDrop(message) {'));
  assert.match(fn, /isGM/); assert.match(fn, /#importRunning\(\)/); assert.match(fn, /confirmDanger\(/); assert.match(fn, /Discard the unfinished sync/);
  assert.match(fn, /confirmDialog\(/);
  assert.doesNotMatch(fn, /settings\.set|\.update\(|\.delete\(|createEmbedded|saveLedger|HANDOFF_LEDGER|SYNC_RETIRED|saveBackup|downloadJson/);
  // everything the page holds is reset
  for (const k of ['this.pkg=null', 'this.zipBundle=null', 'this.selected.clear()', 'this.importReports=[]', "phrase:''", 'result:null', 'inputs:[]', 'plan:null', 'progress:null']) assert.ok(fn.includes(k), k);
  assert.match(main, /case "clear-inputs": await this\.#clearInputs\(\)/);
  assert.match(main, /this\.sync\.unfinished=Boolean\(failure\|\|outcome\?\.cancelled\|\|outcome\?\.interrupted\|\|!outcome\?\.completed\)/);
  assert.match(main, /#importRunning\(\) \{\s*const z=this\.zipBundle;\s*return Boolean\(this\.busy\|\|this\.sync\.abort/);
});

test('0.70.7 declutter: no inner scroll boxes on the Import tab, three steps, one Advanced fold, paged preview, messages in the page', () => {
  assert.doesNotMatch(importPart, /agm-scrollcap/);
  assert.doesNotMatch(view({plan, inputs: [{name: 'a', imports: [{filename: 'a.json', label: 'x', records: 1, packageId: 'P'}]}]}), /agm-scrollcap/);
  for (const n of [1, 2, 3]) assert.match(importPart, new RegExp(`agm-step__n">${n}<`));
  const sync = view({plan, inputs: [{name: 'a', imports: [{filename: 'a.json', label: 'x', records: 1, packageId: 'P'}]}]});
  for (const n of [1, 2, 3]) assert.match(sync, new RegExp(`agm-step__n">${n}<`));
  assert.equal((importPart.match(/data-ag-fold="options"/g) ?? []).length, 1);
  assert.match(importPart, /<span class="ag-fold__title">Advanced<\/span>/);
  assert.doesNotMatch(importPart, /data-ag-fold="load"/);
  assert.match(sync, /data-ag-fold="sync-advanced"/);
  for (const key of ['data-ag-sync-unscoped', 'data-ag-sync-edited', 'data-ag-sync-art']) assert.match(sync, new RegExp(key));
  // one level: no fold inside a fold in the Import markup
  assert.doesNotMatch(sync, /<details class="ag-fold[^>]*>(?:(?!<\/details>)[\s\S])*<details class="ag-fold/);
  assert.match(importPart, /data-ag-action="preview-more"/);
  assert.match(main, /case "preview-more"/); assert.match(main, /const PREVIEW_PAGE=100/);
  const drawer = hbs.slice(hbs.indexOf('<aside class="agm-drawer'), hbs.indexOf('</aside>'));
  assert.doesNotMatch(drawer, /agm-drawer__body/); assert.match(hbs, /id="agm-drawer-body" class="agm-drawer__body"/);
  assert.doesNotMatch(css, /\.agm-drawer__body\{max-height/);
  // pinned footer keeps Cancel left, one primary right
  assert.match(importPart, /<footer class="ag-footer agmanager-footer">\s*<button[^>]*ag-btn--ghost" data-ag-action="reset">Cancel[\s\S]*ag-btn--primary" data-ag-action="apply"/);
});

test('0.70.7 version, CHANGELOG, README and Help', () => {
  assert.equal(JSON.parse(read('../module.json')).version, '0.95.0');
  assert.match(read('../CHANGELOG.md'), /^## 0\.70\.7 /m);
  assert.match(read('../README.md'), /Clear inputs…/); assert.match(main, /Clear inputs…<\/strong> empties the Import page/);
});
