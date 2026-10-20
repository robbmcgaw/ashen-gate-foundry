import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {orderLibraryRows,groupLibraryRows} from '../scripts/browser.js';

const tpl=fs.readFileSync(new URL('../templates/manager.hbs',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
const lib=tpl.slice(tpl.indexOf('\n  {{#if libraryActive}}'),tpl.indexOf('\n  {{#if modulesActive}}'));

test('0.31.0: library rows are ordered by system (Unclassified last) then name, and grouped with whole-list counts',()=>{
  const rows=[
    {name:'Zed',systemKey:'unclassified',systemLabel:'Unclassified / Shared'},
    {name:'Bee',systemKey:'SYS-PROF',systemLabel:'Professions'},
    {name:'Ash',systemKey:'SYS-LOC',systemLabel:'Locations & Exploration'},
    {name:'Ant',systemKey:'SYS-PROF',systemLabel:'Professions'}];
  const ordered=orderLibraryRows(rows);
  assert.deepEqual(ordered.map(r=>r.name),['Ash','Ant','Bee','Zed']);
  assert.deepEqual(rows.map(r=>r.name),['Zed','Bee','Ash','Ant'],'input is not mutated');
  const groups=groupLibraryRows(ordered.slice(0,2),ordered);
  assert.deepEqual(groups.map(g=>[g.label,g.count,g.rows.length]),[['Locations & Exploration',1,1],['Professions',2,1]]);
});

test('0.31.0: Library keeps every action, behind a rail and one Actions menu',()=>{
  for(const a of ['library-check','library-export','library-replace','library-archive','library-restore','library-stage','library-delete',
    'library-select-visible','library-clear','library-next','library-previous','library-inspect-clear',
    'world-export-everything','world-export-changed','world-export-copy','world-backup','capture-export','capture-tag','capture-untag'])
    assert.match(lib,new RegExp(`data-ag-action="${a}"`),a);
  for(const d of ['data-ag-library-filter','data-ag-library-status','data-ag-library-package','data-ag-library-show-archived',
    'data-ag-library-select=','data-ag-library-inspect=','data-ag-library-open=','data-ag-library-jump=','data-ag-capture-filter','data-ag-capture-kind'])
    assert.ok(lib.includes(d),d);
  assert.match(lib,/data-ag-library-section-tab="\{\{id\}\}"/);
  assert.match(lib,/data-ag-library-system-chip=/);
  const menu=lib.slice(lib.indexOf('<details class="aglib-menu">'),lib.indexOf('</details>',lib.indexOf('<details class="aglib-menu">')));
  for(const a of ['library-export','library-replace','library-stage','library-archive','library-restore','library-delete'])assert.ok(menu.includes(a),`${a} sits in the Actions menu`);
  assert.doesNotMatch(lib,/agmanager-stats/,'stat tiles are gone');
  for(const id of ['records','check','export','adopt'])assert.match(main,new RegExp(`\\{id:'${id}'`));
});

test('0.31.0: lifecycle confirmations name what they do',()=>{
  assert.match(main,/yes:\{label:`Delete \$\{accepted\.length\} archived record\(s\)`\}/);
  assert.match(main,/<li>\$\{escapeHtml\(r\.name\)\}/,'final delete dialog lists the records');
});
