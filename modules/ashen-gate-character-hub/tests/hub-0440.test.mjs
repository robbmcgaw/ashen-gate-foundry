/**
 * 0.44.0: (A) the paper doll's two-column layout for short dolls and the 44 px minimum slot; (B) the character column
 * opens shown for everyone once (a stored fold from the 0.33.0 default is dropped), then the choice is remembered.
 * Mocked Foundry and CSS text: this proves the markup and the rules; the sizes were measured in headless Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, resetCharFold, hubUi} from '../scripts/sheet.mjs';
import {uiState} from '../scripts/ag-html.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const memory = (initial = {}) => { const mem = {...initial}; return {mem, store: {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }}}; };
const KEY = 'ag-ui:ashen-gate-character-hub:local';

test('B: a stored fold from before 0.44.0 is dropped once, then the choice is remembered', () => {
  const {mem, store} = memory({[KEY]: JSON.stringify({charFolded: true, journeyView: 'biography'})});
  const ui = uiState('ashen-gate-character-hub', {storage: store, userId: 'local'});
  assert.equal(resetCharFold(ui), false, 'shown after the reset');
  assert.deepEqual(JSON.parse(mem[KEY]), {journeyView: 'biography', charFoldReset: '0.44.0'}, 'other remembered values stay');
  ui.set('charFolded', true);
  assert.equal(resetCharFold(ui), true, 'a fold chosen after the reset is kept');
  assert.equal(resetCharFold(ui), true, 're-running changes nothing');
});

test('B: a fresh user (nothing stored) gets the character open in narrow Full and in Compact', async () => {
  const {store} = memory();
  globalThis.localStorage = store;
  try {
    installGlobals({user: users.owner});
    for (const compact of [false, true]) {
      const sheet = new Hub({document: makeActor()});
      sheet.compact = compact;
      assert.equal(sheet.charFolded, false);
      const html = await sheet._renderHTML();
      assert.doesNotMatch(html, /agch-root--charfolded/, compact ? 'Compact' : 'Full');
      if (!compact) assert.match(html, /<span>Hide character<\/span>/);
    }
  } finally { delete globalThis.localStorage; }
});

test('B: an old stored true opens the Hub shown; clicking Hide afterwards is remembered across opens', () => {
  const {store} = memory({[KEY]: JSON.stringify({charFolded: true})});
  globalThis.localStorage = store;
  try {
    installGlobals({user: users.owner});
    assert.equal(new Hub({document: makeActor()}).charFolded, false);
    hubUi().set('charFolded', true);
    assert.equal(new Hub({document: makeActor()}).charFolded, true);
  } finally { delete globalThis.localStorage; }
});

test('A: the minimum slot is about 44 px and the two-column rules exist for both Sizes, only for short dolls', () => {
  assert.match(CSS, /--agch-slot-min: calc\(var\(--ag-slot\) \+ var\(--ag-space-2\)\)/);
  assert.doesNotMatch(CSS, /--agch-slot-min: var\(--ag-icon-btn\)/);
  for (const q of ['@container agch-doll (max-height: 300px) and (min-width: 320px)', '@container agch-doll (max-height: 392px) and (min-width: 410px)']) assert.ok(CSS.includes(q), q);
  for (const sel of ['html:not([data-ag-size="comfortable"]) .agch-app .agch-char .agch-doll > .agch-doll__col ', 'html[data-ag-size="comfortable"] .agch-app .agch-char .agch-doll > .agch-doll__col ']) assert.ok(CSS.includes(sel + '{ grid-area: 1 / 2;'), sel);
});

test('A: the markup keeps the slot order and keys (head to hands left, mainhand to bracer right) and gives the open menu its row in two columns', async () => {
  installGlobals({user: users.owner});
  const sheet = new Hub({document: makeActor()});
  sheet.menu = 'slot:hands';
  const html = await sheet._renderHTML();
  const order = [...html.matchAll(/data-slot="([a-z0-9]+)"/g)].map(m => m[1]);
  const uniq = [...new Set(order)];
  assert.deepEqual(uniq.slice(0, 15), ['head', 'neck', 'back', 'body', 'hands', 'mainhand', 'offhand', 'waist', 'feet', 'bracer', 'ring1', 'ring2', 'trinket', 'trinket2', 'trinket3']);
  assert.match(html, /agch-menu--slot is-left" style="--row:4;--row2:1"/);
});
