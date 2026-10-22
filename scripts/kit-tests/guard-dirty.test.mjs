import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {DIALOGS} from './kit-path.mjs';
const {guardDirty} = await import(DIALOGS);

test('guardDirty: typing marks the form dirty and writes "Unsaved changes" to the footer status', () => {
  const doc = new FakeDocument();
  const form = doc.createElement('form'), input = doc.createElement('input'), status = doc.createElement('span', {class: 'ag-footer__status'});
  form.append(input); doc.body.append(form, status);
  const changes = [];
  const g = guardDirty({status, onChange: d => changes.push(d)});
  const unwatch = g.watch(form);
  assert.equal(g.dirty, false);
  assert.equal(status.textContent, '');
  input.dispatch('input');
  assert.equal(g.dirty, true);
  assert.equal(status.textContent, 'Unsaved changes');
  assert.equal(status.dataset.agDirty, 'true');
  input.dispatch('change');
  assert.deepEqual(changes, [true], 'onChange fires on transitions only');
  g.markClean();
  assert.equal(status.textContent, '');
  assert.equal(status.dataset.agDirty, undefined);
  unwatch();
  input.dispatch('input');
  assert.equal(g.dirty, false);
});

test('guardDirty: a status lookup function survives re-renders; a non-guard status text is left alone when clean', () => {
  let status = new FakeDocument().createElement('span');
  status.textContent = 'Saved';
  const g = guardDirty({status: () => status});
  g.markClean();
  assert.equal(status.textContent, 'Saved');
  g.markDirty();
  status = new FakeDocument().createElement('span'); // re-render replaced the footer
  g.markDirty();
  assert.equal(status.textContent, 'Unsaved changes');
  assert.doesNotThrow(() => guardDirty({status: () => null}).markDirty());
});

test('guardDirty.confirm: clean passes without asking; dirty asks, Keep editing keeps the edits', async () => {
  let asked = 0, answer = false;
  const g = guardDirty({ask: async () => { asked++; return answer; }});
  assert.equal(await g.confirm(), true);
  assert.equal(asked, 0);
  g.markDirty();
  assert.equal(await g.confirm(), false);
  assert.equal(g.dirty, true);
  answer = true;
  assert.equal(await g.confirm(), true);
  assert.equal(g.dirty, false, 'discarded: clean again');
  assert.equal(asked, 2);
});

test('guardDirty.guard wraps a tab switch so it runs only after confirm', async () => {
  let answer = false;
  const g = guardDirty({ask: async () => answer});
  const switched = [];
  const switchTab = g.guard(tab => { switched.push(tab); return tab; });
  assert.equal(await switchTab('a'), 'a');
  g.markDirty();
  assert.equal(await switchTab('b'), undefined);
  answer = true;
  assert.equal(await switchTab('c'), 'c');
  assert.deepEqual(switched, ['a', 'c']);
});

test('guardDirty asks with the danger confirm: "Discard unsaved changes?", Keep editing is the default', async () => {
  let seen;
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async o => { seen = o; return o.buttons.find(b => b.action === 'cancel').callback(); }}}}};
  const g = guardDirty();
  g.markDirty();
  assert.equal(await g.confirm(), false);
  assert.equal(seen.window.title, 'Discard unsaved changes?');
  assert.deepEqual(seen.buttons.map(b => [b.label, b.default]), [['Keep editing', true], ['Discard changes', false]]);
  assert.ok(seen.classes.includes('ag-dialog--danger-confirm'));
  delete globalThis.foundry;
});
