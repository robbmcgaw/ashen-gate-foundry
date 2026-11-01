/** 0.44.0: the six Blight weather effects now belong to General Manager. Locations registers none of them and still starts without them.
 *  Mocked Foundry / source checks: logic only, not a live Forge world. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApi} from '../scripts/api.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the scene-effects file is gone and nothing in the module registers weather or reads the old strength flag', () => {
  assert.equal(fs.existsSync(new URL('../scripts/scene-effects.mjs', import.meta.url)), false);
  for (const f of fs.readdirSync(new URL('../scripts/', import.meta.url)).filter(n => n.endsWith('.mjs'))) {
    const src = read(`../scripts/${f}`);
    assert.ok(!/weatherEffects|blightStrength|agBlight|scene-effects|renderSceneConfig|preUpdateScene/.test(src), f);
  }
});

test('the public API exposes nothing about scene effects, and still builds without any weather registry', () => {
  const globals = ['CONFIG', 'canvas'].map(k => [k, globalThis[k]]);
  delete globalThis.CONFIG; delete globalThis.canvas;
  try {
    const api = createApi({version: '0.44.0', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {},
      readAll: () => [], writeAll: async () => {}, readViews: () => [], placeNote: async () => ({}), open: () => {}, openLocation: () => {}});
    for (const k of Object.keys(api)) assert.ok(!/weather|blight|sceneEffect/i.test(k), k);
    assert.equal(typeof api.listLocations, 'function');
  } finally { for (const [k, v] of globals) if (v !== undefined) globalThis[k] = v; }
});

test('README and Help no longer describe the effects', () => {
  assert.ok(!/Blight strength|Blight weather|Scene effects/.test(read('../README.md')));
  assert.ok(!/Scene effects|Blight strength/.test(read('../scripts/app.mjs')));
});
