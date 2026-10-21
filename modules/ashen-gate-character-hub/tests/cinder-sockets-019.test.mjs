/** 0.19.0: Cinder sockets shown read-only in the Cinders panel through Ashen Gate | Cinders' api.sockets (stand-in API, mocked Foundry; logic only, not the live UI). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {cindersSummary, socketHosts, socketsHtml} from '../scripts/cinders.mjs';

const host = {hostKind: 'cinder', instanceId: 'cinst_TEST00001', name: '[TEST] Ember Cinder', capacity: 2, base: 2, free: 0, locked: true, canEdit: false,
  slots: [{slot: 0, itemId: 'L1', sourceId: 'ITEM-TEST-LENS', name: '[TEST] <Lens>', active: true, modifiers: [{target: 'push.cost', value: -1, label: '[TEST] Lens'}]},
    {slot: 1, itemId: 'L2', sourceId: 'ITEM-TEST-CALM', name: '[TEST] Calm', active: true, modifiers: []},
    {slot: 2, itemId: 'L3', sourceId: 'ITEM-TEST-SPARE', name: '[TEST] Spare', active: false, modifiers: []}]};
const api = (sockets) => ({cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'cinst_TEST00001', name: '[TEST] Ember Cinder', powers: [], enhancements: []}]}, ...(sockets ? {sockets} : {})});

test('sockets: attached items with their effects, inactive over capacity, empty sockets, the GM lock; no buttons', () => {
  installGlobals({user: users.owner, modules: {}});
  const html = cindersSummary(makeActor(), api({contract: 'ag-sockets/1', hosts: () => [host]}));
  assert.match(html, /Sockets<\/strong> <span class="agch-muted">2 of 2 in use · locked by the GM/);
  assert.match(html, /\[TEST\] &lt;Lens&gt;/, 'names are escaped');assert.match(html, /\[TEST\] Lens: Push cost -1/);
  assert.equal((html.match(/Inactive: over capacity/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-action=/, 'read only: changes happen in Cinders');
  assert.match(socketsHtml({...host, slots: [], free: 2, locked: false}), /(Empty socket[\s\S]*){2}/);
  assert.match(socketsHtml({...host, slots: [], free: 0, capacity: 0}), /no sockets/);
});
test('older Cinders (no api.sockets) or a refusal: the panel works without sockets', () => {
  installGlobals({user: users.owner, modules: {}});
  assert.doesNotMatch(cindersSummary(makeActor(), api(null)), /Sockets/);
  assert.doesNotMatch(cindersSummary(makeActor(), api({contract: 'ag-sockets/0', hosts: () => [host]})), /Sockets/);
  assert.doesNotMatch(cindersSummary(makeActor(), api({contract: 'ag-sockets/1', hosts: () => { throw new Error('Actor access denied'); }})), /Sockets/);
  assert.equal(socketHosts(makeActor(), api({contract: 'ag-sockets/1', hosts: () => [host]})).get('cinst_TEST00001').capacity, 2);
});
