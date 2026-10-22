import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {fileButton, bindFileButtons} = await import(HTML);

test('fileButton is a real button plus a visually hidden (not display:none) input', () => {
  const html = fileButton({label: 'Import JSON…', accept: '.json,application/json', data: {kind: 'quests'}});
  assert.equal(html, '<span class="ag-file" data-kind="quests"><button type="button" class="ag-btn" data-ag-file-button><i class="fa-solid fa-file-import" aria-hidden="true"></i> Import JSON…</button><input type="file" class="ag-file__input ag-sr-only" tabindex="-1" aria-hidden="true" accept=".json,application/json"></span>');
  assert.ok(!/display:\s*none|\shidden[\s>]/.test(html), 'no display:none and no hidden attribute');
  assert.match(fileButton({multiple: true, disabled: true, icon: ''}), /<button type="button" class="ag-btn" data-ag-file-button disabled>Choose file…<\/button><input [^>]* multiple disabled>/);
  assert.match(fileButton({label: '<x>'}), /&lt;x&gt;/);
});

function picker(doc) {
  const wrap = doc.createElement('span', {class: 'ag-file', 'data-kind': 'quests'});
  const button = doc.createElement('button', {'data-ag-file-button': ''});
  const input = doc.createElement('input', {type: 'file'});
  wrap.append(button, input);
  doc.body.append(wrap);
  return {wrap, button, input};
}

test('bindFileButtons: the button opens the input; a pick calls the handler and clears the input', async () => {
  const doc = new FakeDocument();
  const {button, input} = picker(doc);
  const seen = [];
  bindFileButtons(doc.body, (files, w) => seen.push([files, w.dataset.kind]));
  button.click();
  assert.equal(input.clicks, 1);
  input.files = [{name: 'a.json'}]; input.value = 'C:\\fakepath\\a.json';
  await Promise.all(input.dispatch('change').results);
  assert.deepEqual(seen, [[[{name: 'a.json'}], 'quests']]);
  assert.equal(input.value, '', 'cleared so the same file can be picked again');
  input.files = [];
  await Promise.all(input.dispatch('change').results);
  assert.equal(seen.length, 1, 'cancelled pick: no call');
});

test('bindFileButtons: disabled does not open; a failing handler still clears; unbind stops it', async () => {
  const doc = new FakeDocument();
  const {button, input} = picker(doc);
  const unbind = bindFileButtons(doc.body, () => { throw new Error('bad file'); });
  button.disabled = true; button.click();
  assert.equal(input.clicks, 0);
  button.disabled = false;
  input.files = [{name: 'x'}]; input.value = 'x';
  await assert.rejects(Promise.all(input.dispatch('change').results), /bad file/);
  assert.equal(input.value, '');
  unbind();
  button.click();
  assert.equal(input.clicks, 0);
  assert.doesNotThrow(() => bindFileButtons(doc.body)());
});
