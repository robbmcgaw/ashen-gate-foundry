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

test('a 0.18.0 API still offers what partners detect (Manager import/preview/migration, routes, Hub panel)', () => {
  const api = createApi({version: manifest.version, isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
    readAll: () => [], writeAll: async () => {}, readViews: () => [], placeNote: async () => ({}), open: () => {}, openLocation: () => {},
    routes: {readAll: () => [], writeAll: async () => {}, readViews: () => [], usedIds: () => [], defaultLegKm: () => 10}});
  assert.equal(api.version, '0.19.0');
  for (const fn of ['listLocations', 'importLocations', 'previewLocation', 'setLocationState', 'publishLocation', 'moveLocation', 'setAudience',
    'importRoutes', 'listRoutes', 'open', 'openLocation']) assert.equal(typeof api[fn], 'function', fn);
});
