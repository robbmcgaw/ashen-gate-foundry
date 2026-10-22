import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeStorage} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {uiState} = await import(HTML);

test('uiState remembers values per namespace and user', () => {
  const storage = fakeStorage();
  const a = uiState('quest-log', {storage, userId: 'u1'});
  assert.equal(a.key, 'ag-ui:quest-log:u1');
  assert.equal(a.get('tab', 'quests'), 'quests');
  a.set('tab', 'journal');
  assert.equal(a.get('tab', 'quests'), 'journal');
  assert.equal(uiState('quest-log', {storage, userId: 'u1'}).get('tab'), 'journal');
  assert.equal(uiState('quest-log', {storage, userId: 'u2'}).get('tab', 'quests'), 'quests');
  assert.equal(uiState('locations', {storage, userId: 'u1'}).get('tab', 'x'), 'x');
  a.set('tab', undefined);
  assert.equal(a.get('tab', 'quests'), 'quests');
});

test('uiState.get falls back when the stored value is not allowed', () => {
  const s = uiState('m', {storage: fakeStorage(), userId: 'u'});
  s.set('tab', 'removed-tab');
  assert.equal(s.get('tab', 'main', ['main', 'gm-setup']), 'main');
  s.set('tab', 'gm-setup');
  assert.equal(s.get('tab', 'main', ['main', 'gm-setup']), 'gm-setup');
});

test('uiState uses game.user.id by default and never throws without storage', () => {
  globalThis.game = {user: {id: 'gm1'}};
  try {
    assert.equal(uiState('m', {storage: fakeStorage()}).key, 'ag-ui:m:gm1');
  } finally { delete globalThis.game; }
  const broken = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }};
  const s = uiState('m', {storage: broken, userId: 'u'});
  assert.doesNotThrow(() => s.set('a', 1));
  assert.equal(s.get('a', 'fallback'), 'fallback');
  const junk = fakeStorage(); junk.setItem('ag-ui:m:u', '{not json');
  assert.equal(uiState('m', {storage: junk, userId: 'u'}).get('a', 2), 2);
});
