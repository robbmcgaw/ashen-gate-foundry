import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument, fakeStorage} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {fold, bindFolds, uiState} = await import(HTML);

test('fold renders a labelled details section; title, count and hint are escaped, body is not', () => {
  const html = fold({key: 'advanced', title: 'Advanced <options>', count: 2, hint: 'Rarely needed', body: '<p>x</p>'});
  assert.equal(html, '<details class="ag-fold" data-ag-fold-key="advanced"><summary class="ag-fold__summary"><span class="ag-fold__title">Advanced &lt;options&gt;</span><span class="ag-fold__count">2</span><span class="ag-fold__hint">Rarely needed</span></summary><div class="ag-fold__body"><p>x</p></div></details>');
  assert.match(fold({title: 'Main', open: true}), /^<details class="ag-fold" open><summary/);
  assert.ok(!/<summary[^]*<button/.test(html), 'no control inside the summary');
});

test('bindFolds restores the remembered state and records toggles; unknown folds keep their rendered state', () => {
  const doc = new FakeDocument();
  const a = doc.createElement('details', {class: 'ag-fold', 'data-ag-fold-key': 'a'});
  const b = doc.createElement('details', {class: 'ag-fold', 'data-ag-fold-key': 'b'});
  const plain = doc.createElement('details', {class: 'ag-fold'});
  b.open = true;
  doc.body.append(a, b, plain);
  const state = uiState('m', {storage: fakeStorage(), userId: 'u'});
  state.set('fold:a', true);
  const unbind = bindFolds(doc.body, state);
  assert.equal(a.open, true, 'restored from state');
  assert.equal(b.open, true, 'nothing stored: kept as rendered');
  b.open = false; b.dispatch('toggle');
  assert.equal(state.get('fold:b'), false);
  unbind();
  a.open = false; a.dispatch('toggle');
  assert.equal(state.get('fold:a'), true, 'unbound: no longer recorded');
  assert.doesNotThrow(() => bindFolds(doc.body)());
});
