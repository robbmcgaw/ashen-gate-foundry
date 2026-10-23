/** 0.44.3: windows opened from a popped-out Hub open in the Hub's own window (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import {renderBeside} from '../scripts/popout.mjs';
import * as ia from '../scripts/item-actions.mjs';

const MAIN = {name: 'main'}, OTHER = {name: 'popout'};
const app = () => { const calls = []; return {calls, render: o => { calls.push(['render', o]); return Promise.resolve(); }}; };
const hub = (doc) => { const calls = []; return {calls, element: {ownerDocument: doc}, renderChild: a => { calls.push(['renderChild', a]); return Promise.resolve(); }}; };

test('renderBeside: a popped-out Hub gets the window as its child; otherwise an ordinary render', async () => {
  globalThis.document = MAIN;
  try {
    const a = app(), h = hub(OTHER);
    await renderBeside(h, a);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1], a); assert.equal(a.calls.length, 0);
    const b = app(), inMain = hub(MAIN);
    await renderBeside(inMain, b);
    assert.equal(inMain.calls.length, 0); assert.deepEqual(b.calls, [['render', {force: true}]]);
    const c = app();
    await renderBeside(null, c);
    assert.deepEqual(c.calls, [['render', {force: true}]], 'no Hub given: ordinary render');
    const d = app(), noChild = {element: {ownerDocument: OTHER}};
    await renderBeside(noChild, d);
    assert.deepEqual(d.calls, [['render', {force: true}]], 'no renderChild in this Foundry: ordinary render');
  } finally { delete globalThis.document; }
});

test('open item sheet from a popped-out Hub opens it in the Hub\'s window', async () => {
  globalThis.document = MAIN;
  try {
    installGlobals({user: users.owner});
    const actor = makeActor();
    const sheetApp = app();
    const item = {id: 'it', name: '[TEST] Item', sheet: sheetApp};
    actor.items = Object.assign([item], {get: id => (id === 'it' ? item : undefined)});
    const h = hub(OTHER);
    assert.equal((await ia.openItemSheet(actor, 'it', h)).ok, true);
    assert.deepEqual(h.calls.map(c => c[0]), ['renderChild']); assert.equal(h.calls[0][1], sheetApp); assert.equal(sheetApp.calls.length, 0);
    assert.equal((await ia.openItemSheet(actor, 'it')).ok, true, 'without a Hub it renders as before');
    assert.deepEqual(sheetApp.calls, [['render', {force: true}]]);
  } finally { delete globalThis.document; }
});
