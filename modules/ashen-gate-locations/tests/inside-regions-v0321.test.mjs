/** 0.32.1: the Inside list and Move to… offer Regions only; Region is a drop-down of Region names. Mocked Foundry: logic and HTML, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {regionChoices, regionNames, regionAfterParentChange, moveTargets} from '../scripts/tree.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
globalThis.CSS ??= {escape: v => String(v)};
const {LocationsApp} = await import('../scripts/app.mjs');

const R = (id, name, parent = '', extra = {}) => ({id, name, parentLocationId: parent, isRegion: true, ...extra});
const P = (id, name, parent = '', extra = {}) => ({id, name, parentLocationId: parent, isRegion: false, ...extra});
const ALL = [R('LOC-TEST-FRONTIER', '[TEST] Frontier'), R('LOC-TEST-TOWN', '[TEST] Town', 'LOC-TEST-FRONTIER'), R('LOC-TEST-WILD', '[TEST] Wild', 'LOC-TEST-FRONTIER'),
  R('LOC-TEST-OTHER-TOWN', '[TEST] Town', 'LOC-TEST-WILD'), P('LOC-TEST-INN', '[TEST] Inn', 'LOC-TEST-TOWN'), P('LOC-TEST-CELLAR', '[TEST] Cellar', 'LOC-TEST-INN'),
  R('LOC-TEST-VAULT', '[TEST] Vault', 'LOC-TEST-CELLAR'), P('LOC-TEST-LONE', '[TEST] Lone Hut')];
const html = d => new LocationsApp().placeHtml({parentLocationId: '', isRegion: false, ...d}, ALL);
const insideSel = h => h.slice(h.indexOf('id="agl-parent"'), h.indexOf('</select>', h.indexOf('id="agl-parent"')));
const values = sel => [...sel.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);

test('Inside offers only Regions, plus None; the place itself and anything that would loop are excluded', () => {
  const sel = insideSel(html({id: 'LOC-TEST-TOWN', name: '[TEST] Town', parentLocationId: 'LOC-TEST-FRONTIER'}));
  assert.match(sel, /<option value="">None \(top level\)<\/option>/);
  const v = values(sel);
  assert.ok(v.includes('LOC-TEST-FRONTIER') && v.includes('LOC-TEST-WILD') && v.includes('LOC-TEST-OTHER-TOWN'));
  for (const bad of ['LOC-TEST-INN', 'LOC-TEST-CELLAR', 'LOC-TEST-LONE']) assert.ok(!v.includes(bad), `${bad} is not a Region`);
  for (const bad of ['LOC-TEST-TOWN', 'LOC-TEST-VAULT']) assert.ok(!v.includes(bad), `${bad} is itself or inside it`);
  assert.match(sel, /value="LOC-TEST-FRONTIER" selected/);
});

test('a current parent that is not a Region stays listed and selected, labelled; a deleted parent still shows', () => {
  const sel = insideSel(html({id: 'LOC-TEST-CELLAR', name: '[TEST] Cellar', parentLocationId: 'LOC-TEST-INN'}));
  assert.match(sel, /<option value="LOC-TEST-INN" selected>\[TEST\] Inn \(not a Region\)<\/option>/);
  assert.ok(!values(sel).includes('LOC-TEST-LONE'));
  assert.match(insideSel(html({id: 'LOC-TEST-LONE', name: 'x', parentLocationId: 'LOC-GONE'})), /value="LOC-GONE" selected>Deleted location/);
});

test('same-named Regions are told apart by short path, sorted by path; a new place has nothing to exclude', () => {
  const sel = insideSel(html({id: '', name: ''}));
  assert.match(sel, />\[TEST\] Frontier › \[TEST\] Town</);
  assert.match(sel, />\[TEST\] Frontier › \[TEST\] Wild › \[TEST\] Town</);
  assert.match(sel, />\[TEST\] Frontier<\/option>/);
  assert.deepEqual(values(sel).slice(1), ['LOC-TEST-FRONTIER', 'LOC-TEST-TOWN', 'LOC-TEST-VAULT', 'LOC-TEST-WILD', 'LOC-TEST-OTHER-TOWN']);
});

test('Move to… uses the same list (shared helper), and the Place hint says Regions', () => {
  for (const id of ['LOC-TEST-TOWN', 'LOC-TEST-CELLAR', 'LOC-TEST-LONE'])
    assert.deepEqual(regionChoices(ALL, id).map(c => c.loc.id).sort(), moveTargets(ALL, id).map(l => l.id).sort());
  assert.ok(regionChoices(ALL, 'LOC-TEST-LONE').every(c => c.loc.isRegion));
  assert.match(html({id: 'LOC-TEST-LONE', name: 'x'}), /Inside<\/em> list shows Regions[\s\S]*tick <em>This is a Region/);
});

test('Region drop-down: No region, each Region name once, current custom text kept', () => {
  assert.deepEqual(regionNames(ALL), ['[TEST] Frontier', '[TEST] Town', '[TEST] Vault', '[TEST] Wild']);
  const app = new LocationsApp();
  const custom = app.regionSelectHtml({region: 'Eastern Mountains'}, ALL);
  assert.match(custom, /<select id="agl-region" data-bind="region"><option value="">No region<\/option><option value="Eastern Mountains" selected>Eastern Mountains \(custom\)<\/option>/);
  assert.equal([...custom.matchAll(/value="\[TEST\] Town"/g)].length, 1, 'deduplicated by name');
  assert.match(app.regionSelectHtml({region: '[TEST] Wild'}, ALL), /value="\[TEST\] Wild" selected/);
  assert.doesNotMatch(app.regionSelectHtml({region: '[TEST] Wild'}, ALL), /\(custom\)/);
  assert.doesNotMatch(app.regionSelectHtml({region: ''}, ALL), / selected/);
});

test('changing Inside to a Region fills Region only if it was empty or the old parent Region name', () => {
  const to = (d, id) => regionAfterParentChange(ALL, d, id);
  assert.equal(to({region: '', parentLocationId: ''}, 'LOC-TEST-WILD'), '[TEST] Wild');
  assert.equal(to({region: '[TEST] Frontier', parentLocationId: 'LOC-TEST-FRONTIER'}, 'LOC-TEST-WILD'), '[TEST] Wild');
  assert.equal(to({region: 'Eastern Mountains', parentLocationId: 'LOC-TEST-FRONTIER'}, 'LOC-TEST-WILD'), 'Eastern Mountains', 'custom value is never replaced');
  assert.equal(to({region: '[TEST] Frontier', parentLocationId: 'LOC-TEST-INN'}, 'LOC-TEST-WILD'), '[TEST] Frontier', 'old parent was not a Region');
  assert.equal(to({region: '[TEST] Frontier', parentLocationId: 'LOC-TEST-FRONTIER'}, ''), '[TEST] Frontier', 'None changes nothing');
  assert.equal(to({region: '', parentLocationId: ''}, 'LOC-TEST-INN'), '', 'a non-Region parent changes nothing');
});
