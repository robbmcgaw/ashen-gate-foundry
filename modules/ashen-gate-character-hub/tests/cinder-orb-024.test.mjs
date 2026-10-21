/** 0.24.0: compact Cinder orb and socket changes in the Cinders sub-tab through Ashen Gate | Cinders' api.sockets (stand-in API, mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {cindersSummary, socketHosts, socketRows, socketsHtml, miniOrbHtml, cleanArt, strainTone, canChangeSockets, socketFromHub, dropOnSocket} from '../scripts/cinders.mjs';
import {ACTIONS, createHubSheetClass} from '../scripts/sheet.mjs';

const INST = 'cinst_TEST00001';
const lens = {slot: 0, itemId: 'L1', sourceId: 'ITEM-TEST-LENS', name: '[TEST] <Lens>', active: true, modifiers: [{target: 'push.cost', value: -1, label: '[TEST] Lens'}]};
const calm = {slot: 2, itemId: 'L2', sourceId: 'ITEM-TEST-CALM', name: '[TEST] Calm', active: true, modifiers: []};
const spare = {slot: 3, itemId: 'L3', sourceId: 'ITEM-TEST-SPARE', name: '[TEST] Spare', active: false, modifiers: []};
const hostOf = (o = {}) => ({hostKind: 'cinder', instanceId: INST, name: '[TEST] Ember Cinder', capacity: 3, base: 2, free: 1, locked: false, canEdit: true, slots: [lens, calm], ...o});
const calls = [];
/** A Cinders stand-in: api.cinder, api.strain, api.sockets (contract ag-sockets/1) and api.playerAccess. */
function cindersMod({host = hostOf(), access = true, art, strain = 4, sockets = true, fits = null, canAttach = {ok: true, reasons: []}, refuseHosts = false} = {}) {
  calls.length = 0;
  const fitList = fits ?? [{itemId: 'F1', name: '[TEST] Ash Charm', sourceId: 'ITEM-TEST-CHARM', attachedTo: null}, {itemId: 'L1', name: '[TEST] <Lens>', sourceId: 'ITEM-TEST-LENS', attachedTo: INST}];
  const api = {
    playerAccess: {getState: () => ({playerAccessEnabled: access})},
    strain: {contract: 'ag-strain/1', get: () => ({value: strain, guaranteeAt: 10, band: {label: '[TEST] Band'}, chance: 25})},
    cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: INST, name: '[TEST] Ember Cinder', ...(art === undefined ? {} : {art}), enhancements: [],
      powers: [{powerId: 'POWER-TEST-SPARK', name: '[TEST] Spark', modes: [{id: 'amplify', label: '[TEST] Amplify', cost: 1, after: 5, chance: 15, guaranteed: false}, {id: 'over', label: '[TEST] Over', cost: 7, after: 11, chance: 100, guaranteed: true}]}]}]}
  };
  if (sockets) api.sockets = {contract: 'ag-sockets/1', maxSockets: 12,
    hosts: () => { if (refuseHosts) throw new Error('Cinders is hidden from players right now'); return [host]; },
    socketable: () => fitList,
    canAttach: (a, i, id) => { calls.push(['canAttach', i, id]); return canAttach; },
    attach: async (a, i, id, o) => { calls.push(['attach', i, id, o]); return {changed: true}; },
    swap: async (a, i, slot, id) => { calls.push(['swap', i, slot, id]); return {changed: true}; },
    detach: async (a, i, slot) => { calls.push(['detach', i, slot]); return {changed: true}; },
    attachDropped: async (i, doc, o) => { calls.push(['attachDropped', i, doc.id, o]); return {created: 'C1'}; }};
  return {active: true, api};
}
const install = (user, opts) => { const m = cindersMod(opts); installGlobals({user, modules: {'ashen-gate-cinders': m}}); return m.api; };
const ui = (pickId = 'F1', yes = true) => ({pick: async (title, options) => { calls.push(['pick', title, options.map(o => o.value)]); return pickId; }, confirm: async (msg, o) => { calls.push(['confirm', o.title, o.danger]); return yes; }});

test('socket rows: orbit order, free slot numbers, "+1" on an extra socket, inactive item last and dimmed', () => {
  const {rows, capacity, used} = socketRows(hostOf({slots: [lens, calm, spare], capacity: 2, free: 0}));
  assert.deepEqual(rows.map(r => [r.number, r.slot, r.empty, r.extra, r.active]), [[1, 0, false, false, true], [2, 2, false, false, true], [null, 3, false, false, false]]);
  assert.deepEqual([capacity, used], [2, 2]);
  const open = socketRows(hostOf({capacity: 4}));
  assert.deepEqual(open.rows.filter(r => r.empty).map(r => [r.number, r.slot, r.extra]), [[3, 1, true], [4, 3, true]], 'free sockets take the lowest unused slots; past base they are extra');
  assert.equal(socketRows(hostOf({base: undefined})).rows.some(r => r.extra), false, 'an older host without base shows no +1');
});

test('owner, Player Access on, not locked: Attach / Swap / Detach, every row a drop target, Items that fit tray', () => {
  const api = install(users.owner, {});
  const html = cindersSummary(makeActor(), api);
  assert.match(html, /data-action="cinder-attach"[^>]*data-instance="cinst_TEST00001"[^>]*data-slot="1"/);
  assert.equal((html.match(/data-action="cinder-swap"/g) ?? []).length, 2);
  assert.equal((html.match(/data-action="cinder-detach"/g) ?? []).length, 2);
  assert.equal((html.match(/data-cinder-drop/g) ?? []).length, 3, 'every socket row is a drop target');
  assert.match(html, /data-slot="2" data-filled="true"/);assert.match(html, /data-slot="1" data-filled="false"/);
  assert.match(html, /ag-badge--accent">\+1</);assert.doesNotMatch(html, /\+1 (sock|from)/, 'only "+1", no source');
  const over = socketsHtml(hostOf({capacity: 2, free: 0, slots: [lens, calm, spare]}), api);
  assert.match(over, /is-inactive"[^>]*data-slot="3" data-filled="true"[\s\S]*ag-badge--warn">inactive</, 'over capacity: dimmed "inactive", still a drop target');
  assert.equal((over.match(/data-action="cinder-detach"/g) ?? []).length, 3, 'detach on every item, inactive too');
  assert.equal((over.match(/data-action="cinder-swap"/g) ?? []).length, 2, 'swap on active items only');
  assert.match(html, /\[TEST\] &lt;Lens&gt;/, 'names are escaped');assert.match(html, /\[TEST\] Lens: Push cost -1/);
  assert.match(html, /Items that fit[\s\S]*draggable="true" data-drag-uuid="Actor\.actor1\.Item\.F1"[^>]*>.*\[TEST\] Ash Charm/);
  assert.doesNotMatch(html.slice(html.indexOf('agch-fits')), /\[TEST\] &lt;Lens&gt;/, 'items already in this Cinder are not in the tray');
  assert.doesNotMatch(html, /Change sockets in Cinders|in the Cinders window/);
  assert.match(html, /\+1 Strain → 5 · Backfire 15%[\s\S]*data-action="cinder-push"/);assert.match(html, /ag-btn--danger[^>]*data-action="cinder-push"[^>]*data-mode="over"/, 'guaranteed Backfire Push is red');
});

test('locked or Player Access off: players get a Locked badge, no buttons, no drop targets, no tray; the GM keeps them', () => {
  let api = install(users.owner, {host: hostOf({locked: true, canEdit: false})});
  let html = cindersSummary(makeActor(), api);
  assert.match(html, /fa-lock[^<]*<\/i> Locked/);
  assert.doesNotMatch(html, /cinder-(attach|swap|detach)|data-cinder-drop|agch-fits/);
  assert.match(html, /data-action="cinder-push"/, 'Push lines stay');
  api = install(users.owner, {access: false});
  assert.equal(canChangeSockets(hostOf(), api), false);
  assert.doesNotMatch(socketsHtml(hostOf(), api), /cinder-(attach|swap|detach)|data-cinder-drop/);
  api = install(users.gm, {host: hostOf({locked: true, canEdit: true})});
  html = cindersSummary(makeActor(), api);
  assert.match(html, /Locked/);assert.match(html, /data-action="cinder-detach"/);assert.match(html, /data-cinder-drop/);assert.match(html, /agch-fits/);
});

test('art: the Cinder\'s own art replaces the default orb; else the default orb whose tone follows Strain only', () => {
  let api = install(users.owner, {art: 'ashen-gate/cinders/test-orb.webp', strain: 6});
  let html = cindersSummary(makeActor(), api);
  assert.match(html, /<img class="agch-corb__img" src="ashen-gate\/cinders\/test-orb\.webp" alt="">/);assert.doesNotMatch(html, /agch-corb__default/);
  api = install(users.owner, {art: null, strain: 6});
  html = cindersSummary(makeActor(), api);
  assert.match(html, /data-tone="ember"><span class="agch-corb__default">/);assert.doesNotMatch(html, /<img/);
  assert.equal((html.match(/agch-corb__seg is-on/g) ?? []).length, 6);assert.equal((html.match(/agch-corb__seg/g) ?? []).length, 10);
  assert.equal((html.match(/agch-corb__dot/g) ?? []).length, 3, 'a dot per socket on the orbit');
  assert.equal((miniOrbHtml({name: 'x'}, {value: 13, guaranteeAt: 10}, []).match(/agch-corb__pip/g) ?? []).length, 3, 'one pip per point over');
  assert.equal(cleanArt('javascript:alert(1)'), null);assert.equal(cleanArt('a" onerror="x'), null);assert.equal(cleanArt('https://x.test/o.png'), 'https://x.test/o.png');
  assert.match(cindersSummary(makeActor(), install(users.owner, {art: 'javascript:alert(1)'})), /agch-corb__default/, 'a bad path falls back to the default orb');
  assert.deepEqual([0, 3, 5, 10, 13].map(v => strainTone(v, 10)), ['calm', 'warm', 'ember', 'hot', 'hot']);
  assert.doesNotMatch(html, /art-pick|data-art|setArt/, 'the Hub cannot change art');
});

test('older Cinders: no art field, no ag-sockets/1, or a refusal: the sub-tab still opens with the orb and Push lines', () => {
  let api = install(users.owner, {sockets: false});
  let html = cindersSummary(makeActor(), api);
  assert.match(html, /agch-corb__default/);assert.match(html, /data-action="cinder-push"/);assert.doesNotMatch(html, /Sockets|cinder-attach/);
  api = install(users.owner, {});api.sockets.contract = 'ag-sockets/0';
  assert.doesNotMatch(cindersSummary(makeActor(), api), /Sockets/);
  api = install(users.owner, {refuseHosts: true});
  assert.doesNotMatch(cindersSummary(makeActor(), api), /Sockets/);assert.equal(socketHosts(makeActor(), api).size, 0);
  api = install(users.owner, {});delete api.strain;
  assert.match(cindersSummary(makeActor(), api), /agch-corb__orb" data-tone="calm"/, 'no Strain API: a calm empty ring');
  api = install(users.owner, {});delete api.playerAccess;
  assert.equal(canChangeSockets(hostOf(), api), true, 'no playerAccess state: Cinders\' own canEdit decides');
});

test('Attach / Swap / Detach go through api.sockets; Attach asks canAttach; Detach asks first; Cancel changes nothing', async () => {
  install(users.owner, {});
  const actor = makeActor();
  assert.equal((await socketFromHub(actor, 'attach', {instance: INST, slot: '1'}, ui('F1'))).ok, true);
  assert.deepEqual(calls.filter(c => c[0] !== 'pick'), [['canAttach', INST, 'F1'], ['attach', INST, 'F1', {slot: 1}]]);
  assert.deepEqual(calls[0][2], ['F1'], 'the picker lists items that fit and are not in this Cinder');
  install(users.owner, {});
  await socketFromHub(actor, 'swap', {instance: INST, slot: '2'}, ui('F1'));
  assert.deepEqual(calls.at(-1), ['swap', INST, 2, 'F1']);
  install(users.owner, {});
  assert.equal((await socketFromHub(actor, 'detach', {instance: INST, slot: '0'}, ui(null, false))).result, null);
  assert.deepEqual(calls, [['confirm', 'Detach [TEST] <Lens>?', true]], 'asked, then nothing');
  install(users.owner, {});
  await socketFromHub(actor, 'detach', {instance: INST, slot: '0'}, ui());
  assert.deepEqual(calls.at(-1), ['detach', INST, 0]);
  install(users.owner, {canAttach: {ok: false, reasons: ['All sockets are in use; detach or swap an item']}});
  const r = await socketFromHub(actor, 'attach', {instance: INST, slot: '1'}, ui('F1'));
  assert.match(r.error, /All sockets are in use/);assert.equal(calls.some(c => c[0] === 'attach'), false);
  install(users.owner, {});
  assert.equal((await socketFromHub(actor, 'attach', {instance: INST, slot: '1'}, ui(null))).result, null);assert.equal(calls.some(c => c[0] === 'attach'), false);
  for (const a of ['cinder-attach', 'cinder-swap', 'cinder-detach']) assert.equal(typeof ACTIONS[a], 'function');
});

test('permissions are checked in the Hub before any call: locked or Player Access off refuses players; the GM always passes', async () => {
  const actor = makeActor();
  install(users.owner, {host: hostOf({locked: true, canEdit: false})});
  for (const kind of ['attach', 'swap', 'detach']) assert.match((await socketFromHub(actor, kind, {instance: INST, slot: '0'}, ui())).error, /locked/);
  assert.match((await dropOnSocket(actor, {instance: INST, slot: '1', filled: 'false'}, {documentName: 'Item', id: 'F1', parent: actor})).error, /locked/);
  install(users.owner, {access: false});
  assert.match((await socketFromHub(actor, 'attach', {instance: INST, slot: '1'}, ui())).error, /can't change/);
  assert.equal(calls.filter(c => ['attach', 'swap', 'detach', 'canAttach'].includes(c[0])).length, 0);
  install(users.gm, {host: hostOf({locked: true, canEdit: true})});
  await socketFromHub(actor, 'detach', {instance: INST, slot: '0'}, ui());
  assert.deepEqual(calls.at(-1), ['detach', INST, 0]);
  install(users.owner, {sockets: false});
  assert.match((await socketFromHub(actor, 'attach', {instance: INST, slot: '1'}, ui())).error, /Update Ashen Gate \| Cinders/);
});

test('drop on a socket row: attach to an empty socket, swap into a full one; players only their own items; GM may drop a sidebar Item', async () => {
  const actor = makeActor();
  install(users.owner, {});
  await dropOnSocket(actor, {instance: INST, slot: '1', filled: 'false'}, {documentName: 'Item', id: 'F1', parent: actor});
  assert.deepEqual(calls, [['canAttach', INST, 'F1'], ['attach', INST, 'F1', {slot: 1}]]);
  install(users.owner, {});
  await dropOnSocket(actor, {instance: INST, slot: '0', filled: 'true'}, {documentName: 'Item', id: 'F1', parent: actor});
  assert.deepEqual(calls, [['swap', INST, 0, 'F1']]);
  install(users.owner, {});
  assert.match((await dropOnSocket(actor, {instance: INST, slot: '1', filled: 'false'}, {documentName: 'Item', id: 'W1', parent: null})).error, /inventory/);
  assert.equal(calls.length, 0);
  assert.match((await dropOnSocket(actor, {instance: INST, slot: '1'}, {documentName: 'Actor', id: 'A'})).error, /Drop an item/);
  install(users.gm, {});
  await dropOnSocket(actor, {instance: INST, slot: '1', filled: 'false'}, {documentName: 'Item', id: 'W1', parent: null});
  assert.deepEqual(calls, [['attachDropped', INST, 'W1', {slot: 1}]]);
});

test('sheet: a drop on a socket row goes to Cinders (attach or swap) and clears the highlight; other drops are untouched', async () => {
  install(users.owner, {});
  const actor = makeActor();
  globalThis.Item = {fromDropData: async d => ({documentName: 'Item', id: d.uuid.split('.').at(-1), parent: actor})};
  const sheet = new (createHubSheetClass(FakeActorSheetV2))({document: actor});
  const cls = new Set(), row = {dataset: {instance: INST, slot: '0', filled: 'true'}, classList: {add: c => cls.add(c), remove: c => cls.delete(c)}};
  sheet._dropHighlight(row);assert.equal(cls.has('is-drop'), true);
  const ev = {target: {closest: sel => sel === '[data-cinder-drop]' ? row : null}, preventDefault() {}, stopPropagation() {},
    dataTransfer: {getData: () => JSON.stringify({type: 'Item', uuid: 'Actor.actor1.Item.F1'})}};
  assert.equal((await sheet._onSocketDrop(ev)).ok, true);
  assert.deepEqual(calls, [['swap', INST, 0, 'F1']]);assert.equal(cls.has('is-drop'), false);
  assert.equal(await sheet._onSocketDrop({target: {closest: () => null}}), null);
  delete globalThis.Item;
});
