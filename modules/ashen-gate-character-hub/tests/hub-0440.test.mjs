/**
 * 0.44.0: the character column opens shown for everyone once (a stored fold from the 0.33.0 default is dropped), then the choice is remembered.
 * Mocked Foundry and CSS text: this proves the markup and the rules; the sizes were measured in headless Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, resetCharFold, hubUi} from '../scripts/sheet.mjs';
import {uiState} from '../scripts/ag-html.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const memory = (initial = {}) => { const mem = {...initial}; return {mem, store: {getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }}}; };
const KEY = 'ag-ui:ashen-gate-character-hub:local';

test('a stored fold from before 0.44.0 is dropped once, then the choice is remembered', () => {
  const {mem, store} = memory({[KEY]: JSON.stringify({charFolded: true, journeyView: 'biography'})});
  const ui = uiState('ashen-gate-character-hub', {storage: store, userId: 'local'});
  assert.equal(resetCharFold(ui), false, 'shown after the reset');
  assert.deepEqual(JSON.parse(mem[KEY]), {journeyView: 'biography', charFoldReset: '0.44.0'}, 'other remembered values stay');
  ui.set('charFolded', true);
  assert.equal(resetCharFold(ui), true, 'a fold chosen after the reset is kept');
  assert.equal(resetCharFold(ui), true, 're-running changes nothing');
});

test('a fresh user (nothing stored) gets the character open in narrow Full and in Compact', async () => {
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

test('an old stored true opens the Hub shown; clicking Hide afterwards is remembered across opens', () => {
  const {store} = memory({[KEY]: JSON.stringify({charFolded: true})});
  globalThis.localStorage = store;
  try {
    installGlobals({user: users.owner});
    assert.equal(new Hub({document: makeActor()}).charFolded, false);
    hubUi().set('charFolded', true);
    assert.equal(new Hub({document: makeActor()}).charFolded, true);
  } finally { delete globalThis.localStorage; }
});
