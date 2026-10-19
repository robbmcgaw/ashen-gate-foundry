import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildImportReport, buildBlockedReport, fixFor, pushReport} from '../scripts/import-result.js';
import {applySpecialist} from '../scripts/specialist-handoff.js';

test('report groups by module with counts, locations and plain reasons plus fixes', () => {
  const report = buildImportReport({file: '[TEST] facilities.json', names: new Map([['FAC-TEST-1', '[TEST] Forge']]), results: [
    {id: 'FAC-TEST-1', kind: 'Facility', action: 'create', status: 'ok'},
    {id: 'FAC-TEST-2', kind: 'Facility', status: 'skipped', message: 'Already in the catalog; kept as is.'},
    {id: 'FAC-TEST-3', kind: 'Facility', action: 'create', status: 'error', message: 'GM must activate the Guildhall first.'},
    {id: 'LOC-TEST-1', kind: 'Location', action: 'update', status: 'ok'},
    {id: 'ITM-1', action: 'folder-created', status: 'ok'}
  ]});
  assert.equal(report.tone, 'error');
  const hq = report.sections.find(s => s.module === 'Headquarters');
  assert.equal(hq.countText, '1 created · 0 updated · 1 kept · 1 failed');
  assert.match(hq.where, /Facility library/);
  assert.equal(hq.lines[0].name, '[TEST] Forge');
  assert.match(hq.lines[2].fix, /Activate the Guildhall first: Headquarters/);
  assert.equal(report.sections.find(s => s.module === 'Locations').counts.updated, 1);
  assert.ok(!report.sections.some(s => s.lines.some(l => l.id === 'ITM-1')), 'housekeeping rows are not listed');
});

test('an apply with nothing applied, an abort and a blocked start are all stated, never silent', () => {
  assert.match(buildImportReport({file: 'x', results: []}).headline, /Nothing was imported/);
  const aborted = buildImportReport({file: 'x', results: [{action: 'import-aborted', status: 'error', message: 'boom'}]});
  assert.equal(aborted.sections[0].lines[0].label, 'Import stopped');
  const blocked = buildBlockedReport({file: 'x', module: 'Skill Trees', message: 'Skill Trees is not active or is too old to import.'});
  assert.equal(blocked.isError, true);
  assert.match(blocked.sections[0].lines[0].fix, /Manage Modules: enable \(or update\) Skill Trees/);
});

test('fixFor names the exact switch for known gates', () => {
  assert.match(fixFor('Initialize GM storage first'), /Skill Trees > GM Setup, click Initialize GM Storage/);
  assert.match(fixFor('GM only'), /Log in as the GM/);
  assert.match(fixFor('something odd'), /Check the reason/);
});

test('reports are newest first and bounded', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = pushReport(list, {n: i});
  assert.equal(list.length, 8);
  assert.equal(list[0].n, 11);
});

test('specialist notes and warnings from the owning module reach the result rows', async () => {
  const api = {importTrees: async () => ({created: ['T1'], updated: [], skipped: [], failed: [], notes: ['Created the GM-only storage Journal.'], warnings: ['T1 / n1: perk missing']})};
  const out = await applySpecialist('skill-trees', {trees: [{id: 'T1'}]}, api, {ids: ['T1']});
  assert.deepEqual(out.map(r => r.status), ['ok', 'note', 'warning']);
  const report = buildImportReport({file: 'trees.json', results: out});
  assert.equal(report.tone, 'warn');
  assert.deepEqual(report.sections[0].lines.map(l => l.label), ['Created', 'Note', 'Warning']);
});

test('the Import tab renders the persistent panel and Apply records a report on every path', () => {
  const main = readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  const hbs = readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  assert.match(hbs, /\{\{#if hasImportReports\}\}/);
  assert.match(hbs, /data-ag-action="clear-results"/);
  assert.equal((main.match(/pushReport\(this\.importReports/g) ?? []).length >= 6, true);
  assert.match(main, /importHistory/, 'History entry is still written');
});
