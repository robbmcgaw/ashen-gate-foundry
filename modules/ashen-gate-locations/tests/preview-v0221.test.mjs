/** 0.22.1 Player Preview: current state only, with an in-place "Also show the other states" toggle. Mocked Foundry; logic only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installFoundry, gm} from './foundry-mock.mjs';
import {readAll, writeAll, readViews, placeNote} from '../scripts/store.mjs';
import {createApi} from '../scripts/api.mjs';
globalThis.foundry = {applications: {api: {ApplicationV2: class { constructor(o) { this.options = o; } }}}};
const {LocationsApp, bindPreviewToggle} = await import('../scripts/app.mjs');
globalThis.CSS ??= {escape: v => String(v)};

function app(state, extra = {}) {
  const g = installFoundry();
  const mod = {version: '0.22.1', active: true};
  mod.api = createApi({version: '0.22.1', isGM: () => true, playerAccessEnabled: () => true, setPlayerAccess: async () => {}, readAll, writeAll, readViews, placeNote, open: () => {}, openLocation: () => {}});
  g.modules = {get: id => id === 'ashen-gate-locations' ? mod : null};
  game.user = gm;
  const a = new LocationsApp();
  a.draft = {id: 'LOC-test', name: '[TEST] Place', state, description: '<p>d</p>', ...extra};
  return a;
}
const shown = (html, st) => { const m = html.match(new RegExp(`<section class="agl-preview__part" data-state="${st}"([^>]*)>`)); return m ? !/\bhidden\b/.test(m[1]) : null; };
const store = (() => { const m = new Map(); globalThis.localStorage = {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v)}; return m; })();

test('Unidentified and Revealed: only the current state shows by default', () => {
  for (const [st, other] of [['unidentified', 'revealed'], ['revealed', 'unidentified']]) {
    const html = app(st).previewHtml(false);
    assert.equal(shown(html, st), true); assert.equal(shown(html, other), false);
    assert.match(html, new RegExp(`data-state="${st}" data-current="1"><h3>${st[0].toUpperCase()}${st.slice(1)} \\(current\\)`));
  }
});

test('Hidden shows a plain line, and mentions pins when placeable', () => {
  const html = app('hidden').previewHtml(false);
  assert.match(html, /Hidden: players see nothing\./); assert.match(html, /pins on a map are invisible/);
  assert.equal(shown(html, 'unidentified'), false); assert.equal(shown(html, 'revealed'), false);
  assert.doesNotMatch(app('hidden', {placeable: false}).previewHtml(false), /pins on a map/);
});

test('the toggle is a real checkbox, off by default, and shows all cards when on', () => {
  const on = app('revealed').previewHtml(true);
  assert.match(on, /<input type="checkbox" id="agl-preview-others" checked> Also show the other states/);
  assert.equal(shown(on, 'unidentified'), true); assert.equal(shown(on, 'revealed'), true);
  assert.doesNotMatch(app('revealed').previewHtml(false), /id="agl-preview-others" checked/);
});

test('the choice is remembered in localStorage and survives blocked storage', () => {
  assert.equal(LocationsApp.previewOthers(), false);
  LocationsApp.previewOthers(true); assert.equal(LocationsApp.previewOthers(), true);
  LocationsApp.previewOthers(false); assert.equal(LocationsApp.previewOthers(), false);
  const saved = globalThis.localStorage;
  globalThis.localStorage = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  assert.doesNotThrow(() => { LocationsApp.previewOthers(true); LocationsApp.previewOthers(); });
  globalThis.localStorage = saved;
});

test('toggling changes the dialog in place and remembers it', () => {
  const mk = (current, hidden) => ({dataset: {current: current ? '1' : '0'}, hidden});
  const parts = [mk(true, false), mk(false, true)];
  let handler; const box = {checked: false, addEventListener: (_, f) => { handler = f; }};
  const root = {querySelector: () => box, querySelectorAll: () => parts};
  bindPreviewToggle(root);
  box.checked = true; handler();
  assert.deepEqual(parts.map(p => p.hidden), [false, false]); assert.equal(LocationsApp.previewOthers(), true);
  box.checked = false; handler();
  assert.deepEqual(parts.map(p => p.hidden), [false, true]); assert.equal(LocationsApp.previewOthers(), false);
  assert.doesNotThrow(() => bindPreviewToggle(null));
});

test('previewing writes nothing', async () => {
  const a = app('revealed'); const before = JSON.stringify(a.draft);
  const g = globalThis.game; const calls = [];
  foundry.applications.api.DialogV2 = {wait: async o => { calls.push(o); return 'close'; }};
  await a.preview();
  assert.equal(JSON.stringify(a.draft), before); assert.equal(calls.length, 1); assert.equal(typeof calls[0].render, 'function');
  assert.equal(g.scenes?.size ?? 0, 0);
});
