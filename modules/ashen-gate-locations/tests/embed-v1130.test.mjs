// 1.13.0: the embed (embed.mjs) with injected reads, and its pass-through on the public API. Proves the gate, the data
// shown and the routing; not the live UI inside a partner window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbed, embedHTML, EMBED_MODES} from '../scripts/embed.mjs';
import {createApi} from '../scripts/api.mjs';

const views = [
  {id: 'LOC-TEST-MILL', key: 'k1', state: 'revealed', name: '[TEST] Millbrook', region: '[TEST] Vale', type: 'Village'},
  {id: 'LOC-TEST-TOWER', key: 'k2', state: 'revealed', name: '[TEST] Old Tower', region: '[TEST] Vale'},
  {id: 'LOC-TEST-CAMP', key: 'k3', state: 'revealed', name: '[TEST] Camp <b>'},
  {key: 'k4', state: 'unidentified', name: 'Unidentified place'}
];
const deps = (over = {}) => {
  const calls = [];
  return {calls, mayOpen: () => true, readViews: () => views, readJourneyView: () => ({status: 'active', leg: 2, legs: 5, from: {name: '[TEST] Millbrook'}, to: {name: '[TEST] Old Tower'}}),
    api: () => ({openLocation: ref => calls.push(['openLocation', ref]), open: () => calls.push(['open'])}), notifyError: e => calls.push(['error', e.message]), ...over};
};
function fakeElement() {
  const listeners = [];
  const el = {innerHTML: '', isConnected: true, classes: new Set(), listeners,
    classList: {add: c => el.classes.add(c), remove: c => el.classes.delete(c)},
    addEventListener(type, fn, {signal} = {}) { const l = {type, fn}; listeners.push(l); signal?.addEventListener('abort', () => listeners.splice(listeners.indexOf(l), 1)); },
    contains: () => true, querySelector: () => null,
    fire(type, target) { return Promise.all(listeners.filter(x => x.type === type).map(l => l.fn({target, stopPropagation() {}, preventDefault() {}}))); }};
  return el;
}

test('journey progress and revealed places by region; unidentified ones are left out; names escaped', () => {
  const html = embedHTML(deps());
  assert.match(html, /Travelling[\s\S]*\[TEST\] Millbrook → \[TEST\] Old Tower[\s\S]*Leg 2 of 5[\s\S]*class="ag-meter__track" role="progressbar"[^>]*aria-valuenow="2"[^>]*style="--ag-meter:40%"/, 'kit meter (0.19.0)');
  assert.match(html, /<label class="ag-search">[\s\S]*class="agl-embed__search"/, 'kit search box');
  assert.match(html, /<h4>\[TEST\] Vale <small>2<\/small><\/h4>/);
  assert.match(html, /<h4>Other places <small>1<\/small><\/h4>/);
  assert.match(html, /\[TEST\] Camp &lt;b&gt;/);
  assert.doesNotMatch(html, /Unidentified place/);
  assert.ok(html.indexOf('[TEST] Vale') < html.indexOf('Other places'), 'Other places last');
});

test('hidden from players: only a note; no journey: no journey card; search filters', () => {
  assert.equal(embedHTML(deps({mayOpen: () => false})), '<div class="ag-empty"><p class="ag-empty__title">Locations is hidden</p><p class="ag-empty__text">The GM has hidden Locations.</p></div>');
  assert.doesNotMatch(embedHTML(deps({readJourneyView: () => null})), /agl-embed__journey/);
  const html = embedHTML(deps(), 'tower');
  assert.match(html, /Old Tower/); assert.doesNotMatch(html, /Millbrook<\/button>/);
  assert.match(embedHTML(deps(), 'zzz'), /No places match/);
});

test('mount: Open goes through the public API; search re-renders; unmount cleans up', async () => {
  const d = deps(), e = createEmbed(d), el = fakeElement();
  const view = e.mount(el, {actorId: 'a1', mode: 'character'});
  assert.ok(el.classes.has('agl-embed'));
  const b = {dataset: {aglEmbed: 'open', ref: 'LOC-TEST-MILL'}}; b.closest = () => b;
  await el.fire('click', b);
  assert.deepEqual(d.calls, [['openLocation', 'LOC-TEST-MILL']]);
  await el.fire('input', {classList: {contains: c => c === 'agl-embed__search'}, value: 'tower'});
  assert.doesNotMatch(el.innerHTML, /Millbrook<\/button>/);
  view.unmount(); assert.equal(el.innerHTML, ''); assert.equal(el.listeners.length, 0);
});

test('a refused open (Player Access off since drawing) is reported, not thrown', async () => {
  const d = deps({api: () => ({openLocation: () => { throw new Error('Locations is hidden from players.'); }})}), el = fakeElement();
  createEmbed(d).mount(el, {});
  const b = {dataset: {aglEmbed: 'open', ref: 'LOC-TEST-MILL'}}; b.closest = () => b;
  await el.fire('click', b);
  assert.deepEqual(d.calls, [['error', 'Locations is hidden from players.']]);
});

test('refreshAll redraws live embeds and drops detached ones; bad arguments throw', () => {
  let shown = views;
  const d = deps({readViews: () => shown}), e = createEmbed(d), el = fakeElement();
  e.mount(el, {});
  shown = [];
  e.refreshAll();
  assert.match(el.innerHTML, /No places revealed yet/);
  el.isConnected = false; e.refreshAll(); assert.equal(el.listeners.length, 0);
  assert.throws(() => e.mount(null), /DOM element/);
  assert.throws(() => e.mount(fakeElement(), {mode: 'gm'}), /Unknown embed mode/);
  assert.deepEqual([...EMBED_MODES], ['character']);
});

test('the public API exposes embed (frozen) when given, and nothing when not', () => {
  const base = {version: 'x', isGM: () => false, playerAccessEnabled: () => true, readAll: () => [], readViews: () => [], open() {}, openLocation() {}};
  const api = createApi({...base, embed: {contract: 'ag-locations-embed/1', modes: ['character'], mount() {}}});
  assert.equal(api.embed.contract, 'ag-locations-embed/1');
  assert.deepEqual([...api.embed.modes], ['character']);
  assert.ok(Object.isFrozen(api.embed));
  assert.equal(createApi(base).embed, undefined);
});
