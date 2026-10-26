/** 0.18.0: Locations renumbered from 1.18.0. The manifest, the VERSION constant and the API all report the 0.x number,
 *  and the API offers every function partners feature-detect (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');

test('the suite is pre-release: Locations is on 0.x and its manifest, VERSION and download tag agree', () => {
  assert.match(manifest.version, /^0\.\d+\.\d+$/);
  assert.equal(main.match(/const VERSION = '([^']+)'/)[1], manifest.version);
  assert.ok(manifest.download.endsWith(`/ashen-gate-locations-v${manifest.version}/ashen-gate-locations.zip`));
});

test('the API offers what partners detect (Manager import/preview/migration, Hub panel); 0.20.0: no route or journey methods', () => {
  const api = createApi({version: manifest.version, isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => [], writeAll: async () => {}, readViews: () => [], placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
  assert.equal(api.version, '0.20.6');
  for (const fn of ['listLocations', 'importLocations', 'previewLocation', 'setLocationState', 'publishLocation', 'moveLocation', 'setAudience',
    'hazardsAt', 'rollTablesAt', 'rollTable', 'convertRoutes', 'open', 'openLocation']) assert.equal(typeof api[fn], 'function', fn);
  // Partners feature-detect these; they must be gone so Manager reports Route records as retired instead of calling them.
  for (const fn of ['importRoutes', 'listRoutes', 'getRoute', 'saveRoute', 'deleteRoute', 'getJourney', 'startJourney', 'nextLeg', 'routeDrawing'])
    assert.equal(api[fn], undefined, fn);
  assert.equal(api.travel, undefined);
});
