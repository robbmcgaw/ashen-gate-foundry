/** 1.9.0: optional Exotic candidates on gathering nodes (GM only), DC defaults 10/12/15/18/20 kept in step with the Ledger.
 *  Proves the logic with mocked Foundry globals, not the live window. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installFoundry, gm, player} from './foundry-mock.mjs';
import {createApi} from '../scripts/api.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {GATHERING, normalizeLocation, normalizeExotics, playerView, viewHtml, resourcesOf, exportPackage, parseImport, publishable, isTierDefaultDc} from '../scripts/model.mjs';
import {DEFAULT_DC_BY_TIER} from '../../ashen-gate-profession-ledger/scripts/gathering.mjs';
import {normalizeExotics as ledgerNormalize} from '../../ashen-gate-profession-ledger/scripts/exotic.mjs';

globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp, exoticChoices} = await import('../scripts/app.mjs');

const EXOTICS = [{materialId: 'MAT-TEST-PHOENIX', mode: 'discovery'}, {materialId: 'MAT-TEST-STAR', mode: 'designated', chance: 25, condition: 'rare'}];
const grove = () => ({id: 'LOC-TEST-GROVE', name: '[TEST] Grove', state: 'revealed', revealed: true, sections: {resources: true}, resources: [
  {id: 'g1', label: '[TEST] Ash tree', skill: 'Herbalism', tier: 3, dc: 13, materialId: 'MAT-TEST-HERB', exotics: EXOTICS},
  {id: 'g2', label: '[TEST] Plain bush', skill: 'Herbalism', tier: 1, materialId: 'MAT-TEST-HERB'}]});

test('DC defaults and the Exotic entry shape match the Profession Ledger', () => {
  assert.deepEqual(GATHERING.dcByTier, {...DEFAULT_DC_BY_TIER});
  const raw = [...EXOTICS, {materialId: 'MAT-TEST-PHOENIX'}, {materialId: 'nope'}, {materialId: 'MAT-TEST-X', mode: 'designated', chance: '0'}, null];
  assert.deepEqual(normalizeExotics(raw), ledgerNormalize(raw));
});

test('saved data: old nodes get an empty list, stored DCs are kept, normalizing is re-runnable', () => {
  const loc = normalizeLocation(grove());
  assert.deepEqual(loc.resources[1].exotics, []);
  assert.equal(loc.resources[0].dc, 13, 'a stored DC is never rewritten');
  assert.equal(loc.resources[1].dc, 10);
  assert.deepEqual(loc.resources[0].exotics, EXOTICS);
  assert.deepEqual(normalizeLocation(normalizeLocation(loc)), loc);
  assert.equal(isTierDefaultDc(13, 3), true, 'pre-1.9.0 default still counts as the default');
  assert.equal(isTierDefaultDc(15, 3), true);assert.equal(isTierDefaultDc(17, 3), false);
});

test('export/import round-trip keeps Exotic candidates; API shape gains only `exotics` for the GM', () => {
  const loc = normalizeLocation(grove());
  const back = parseImport(exportPackage([loc]), []).created[0];
  assert.deepEqual(back.resources[0].exotics, EXOTICS);
  const [gmNode] = resourcesOf(loc, {gm: true});
  assert.deepEqual(Object.keys(gmNode), ['id', 'label', 'skill', 'tier', 'dc', 'materialId', 'quantity', 'rareMaterialId', 'rareQuantity', 'finite', 'exhausted', 'available', 'note', 'uuid', 'visible', 'dcVisible', 'exotics']);
});

test('players never get Exotic candidates: player view, published page HTML, resourcesAt', async () => {
  const loc = normalizeLocation(grove());
  loc.published = publishable(loc);
  const view = playerView(loc);
  for (const n of view.resources) assert.equal('exotics' in n, false);
  assert.doesNotMatch(JSON.stringify(view) + viewHtml(view), /PHOENIX|STAR|exotic/i);
  const game = installFoundry();
  const mod = {version: '1.9.0', active: true};
  mod.api = createApi({version: '1.9.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  await writeAll([loc]);
  assert.deepEqual(mod.api.resourcesAt('LOC-TEST-GROVE')[0].exotics, EXOTICS, 'GM gets them');
  game.user = player;
  const mine = mod.api.resourcesAt('LOC-TEST-GROVE');
  assert.ok(mine.length && mine.every(n => !('exotics' in n)));
  assert.doesNotMatch(JSON.stringify(readViews()), /PHOENIX|STAR|exotic/i, 'nothing in the player Journal');
  assert.equal(mod.api.nodesForMaterial('MAT-TEST-PHOENIX').length, 0, 'an Exotic id finds no node for a player');
  game.user = gm;
});

const matItem = (id, name, quality) => ({name, flags: {'ashen-gate-manager': {source: {sourceId: id, entityType: 'Material', definition: {id, entity_type: 'Material', quality}}}}});
async function editorWorld(ledger) {
  const game = installFoundry();
  game.items = [matItem('MAT-TEST-PHOENIX', '[TEST] Phoenix Ash', 'Exotic'), matItem('MAT-TEST-STAR', '[TEST] Star Moss', 'Exotic'), matItem('MAT-TEST-HERB', '[TEST] Herb', 'Common')];
  const mod = {version: '1.9.0', active: true};
  mod.api = createApi({version: '1.9.0', isGM: () => game.user.isGM, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  game.modules = {get: id => id === 'ashen-gate-locations' ? mod : id === 'ashen-gate-profession-ledger' ? ledger : null};
  const loc = normalizeLocation(grove());loc.resources[0].exotics = [];
  await writeAll([loc]);
  const app = new LocationsApp();app.select('LOC-TEST-GROVE');
  app.render = async () => {};
  return {app, mod};
}

test('editor without the Ledger: lists Exotic-quality materials by name (no ids to type); add, set rule, remove', async () => {
  const {app, mod} = await editorWorld(null);
  const node = app.draft.resources[0];
  let html = await app._renderHTML();
  assert.match(html, /Exotic materials \(optional, GM only\)/);
  const select = html.slice(html.indexOf(`id="agl-exo-${node.key}"`), html.indexOf('</select>', html.indexOf(`id="agl-exo-${node.key}"`)));
  assert.match(select, /\[TEST\] Phoenix Ash/);assert.match(select, /\[TEST\] Star Moss/);assert.doesNotMatch(select, /\[TEST\] Herb</, 'Common materials are not offered');
  assert.match(html, /Profession Ledger is not active/);
  app.element = {querySelector: sel => sel === `#agl-exo-${node.key}` ? {value: 'MAT-TEST-PHOENIX'} : null};
  await app.onAction({dataset: {action: 'exotic-add', key: node.key}});
  assert.deepEqual(node.exotics, [{materialId: 'MAT-TEST-PHOENIX', mode: 'discovery'}]);
  app.setExotic(node.key, 'MAT-TEST-PHOENIX', 'mode', 'designated');
  assert.deepEqual(node.exotics, [{materialId: 'MAT-TEST-PHOENIX', mode: 'designated', chance: null, condition: 'success'}], 'a designated source starts with no chance (never assumed)');
  app.setExotic(node.key, 'MAT-TEST-PHOENIX', 'chance', '40');app.setExotic(node.key, 'MAT-TEST-PHOENIX', 'condition', 'rare');
  assert.deepEqual(node.exotics[0], {materialId: 'MAT-TEST-PHOENIX', mode: 'designated', chance: 40, condition: 'rare'});
  html = await app._renderHTML();
  assert.match(html, /data-exotic="[a-z0-9]+\|MAT-TEST-PHOENIX\|chance"[^>]*value="40"/);
  await mod.api.saveLocation(app.draft);
  assert.deepEqual(readAll()[0].resources[0].exotics, [{materialId: 'MAT-TEST-PHOENIX', mode: 'designated', chance: 40, condition: 'rare'}]);
  await app.onAction({dataset: {action: 'exotic-remove', key: node.key, mat: 'MAT-TEST-PHOENIX'}});
  assert.deepEqual(node.exotics, []);
});

test('editor with the Ledger: its filtered catalog and eligibility badges; tier change moves an old default DC', async () => {
  const calls = [];
  const ledger = {active: true, api: {gathering: {exotic: {contract: 'ag-ledger-exotic/1',
    materials: f => { calls.push(f); return [{id: 'MAT-TEST-STAR', name: '[TEST] Star Moss', quality: 'Exotic', tier: 1}]; },
    eligibility: node => node.exotics.map(x => ({...x, eligible: false, reason: 'Tier 3 is above the node’s tier 1'}))}}}};
  const {app} = await editorWorld(ledger);
  const node = app.draft.resources[0];
  node.exotics = [{materialId: 'MAT-TEST-PHOENIX', mode: 'discovery'}];
  const html = await app._renderHTML();
  assert.deepEqual(calls[0], {profession: 'Herbalism', maxTier: 3}, 'asked for this node’s profession and tier');
  assert.match(html, /\[TEST\] Star Moss \(tier 1\)/);assert.match(html, /Tier 3 is above the node’s tier 1/);
  assert.match(html, /tier not above the node’s/);
  assert.equal(exoticChoices({skill: 'Herbalism', tier: 3}).filtered, true);
  assert.equal(node.dc, 13);
  app.setPath(`resources.${node.key}.tier`, '4');
  assert.equal(node.dc, 18, 'pre-1.9.0 default DC follows the tier');
  node.dc = 17;app.setPath(`resources.${node.key}.tier`, '5');
  assert.equal(node.dc, 17, 'a custom DC stays');
});
