import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {idSlug, generateId, checkNewId, pickerOptions, filterPickerOptions, missingLabel, refPicker, bindRefPickers, refList, bindRefLists, readRefList} = await import(HTML);

test('generateId: right prefix, readable slug, unique with -2/-3, never changes for the same inputs', () => {
  assert.equal(generateId('QUEST', 'The Ashen Gate!'), 'QUEST-THE-ASHEN-GATE');
  assert.equal(generateId('LOC', 'Café Noir'), 'LOC-CAFE-NOIR');
  assert.equal(generateId('QUEST', 'Gate', ['QUEST-GATE']), 'QUEST-GATE-2');
  assert.equal(generateId('QUEST', 'Gate', ['QUEST-GATE', 'QUEST-GATE-2']), 'QUEST-GATE-3');
  assert.equal(generateId('QUEST', '!!!'), 'QUEST-NEW');
  assert.equal(generateId('QUEST', '', ['QUEST-NEW']), 'QUEST-NEW-2');
  assert.equal(generateId('QUEST', 'Gate', new Set(['QUEST-GATE'])), 'QUEST-GATE-2', 'any iterable of taken ids');
  assert.throws(() => generateId('quest', 'x'), TypeError);
  assert.ok(idSlug('a'.repeat(100)).length <= 48);
  assert.equal(idSlug('One Two Three', 7), 'ONE-TWO');
  assert.equal(idSlug('One Two Three', 9), 'ONE-TWO');
});

test('stability on rename: the stored id is only generated at creation, so a later name changes nothing', () => {
  const taken = [];
  const id = generateId('QUEST', 'Old name', taken);
  const record = {id, name: 'Old name'};
  record.name = 'Brand new name'; // a rename edits the display name only
  assert.equal(record.id, 'QUEST-OLD-NAME');
  assert.notEqual(generateId('QUEST', record.name, [id]), record.id);
});

test('checkNewId validates prefix, charset and uniqueness for "Advanced: set id"', () => {
  const ok = id => checkNewId(id, {prefixes: ['QUEST', 'ORDER'], taken: ['QUEST-A']});
  assert.equal(ok('QUEST-B'), '');
  assert.equal(ok('ORDER-X-1'), '');
  assert.match(ok(''), /leave it empty/);
  assert.match(ok('quest-b'), /upper-case/);
  assert.match(ok('LOC-B'), /QUEST- or ORDER-/);
  assert.match(ok('QUEST--B'), /single hyphens/);
  assert.match(ok('QUEST-A'), /already used/);
});

const records = [
  {value: 'LOC-B', label: 'Brightwater', kind: 'settlement', group: 'Settlements'},
  {value: 'LOC-A', label: 'Ashford', kind: 'settlement', group: 'Settlements'},
  {value: 'LOC-R', label: 'Old Road', kind: 'route', group: 'Routes'},
  {value: 'LOC-S', label: 'Secret Vault', kind: 'site', group: 'Sites', gm: true},
  {value: 'LOC-N', label: '  ', kind: 'site'},
];

test('pickerOptions filters by kind, hides GM records from players, excludes values, groups and sorts', () => {
  assert.deepEqual(pickerOptions(records).map(o => o.value), ['LOC-R', 'LOC-A', 'LOC-B']);
  assert.deepEqual(pickerOptions(records, {gm: true}).map(o => o.value), ['LOC-R', 'LOC-A', 'LOC-B', 'LOC-S']);
  assert.deepEqual(pickerOptions(records, {kinds: ['settlement']}).map(o => o.label), ['Ashford', 'Brightwater']);
  assert.deepEqual(pickerOptions(records, {kinds: 'route', gm: true}).map(o => o.label), ['Old Road']);
  assert.deepEqual(pickerOptions(records, {exclude: ['LOC-A']}).map(o => o.value), ['LOC-R', 'LOC-B']);
  assert.equal(pickerOptions(records, {hints: {route: 'Route'}})[0].hint, 'Route');
  assert.deepEqual(pickerOptions(null), []);
});

test('filterPickerOptions matches every typed word against name, hint and group', () => {
  const opts = pickerOptions(records, {hints: {settlement: 'Town', route: 'Road'}});
  assert.deepEqual(filterPickerOptions(opts, 'bright').map(o => o.label), ['Brightwater']);
  assert.deepEqual(filterPickerOptions(opts, 'town ash').map(o => o.label), ['Ashford']);
  assert.deepEqual(filterPickerOptions(opts, 'routes').map(o => o.label), ['Old Road']);
  assert.equal(filterPickerOptions(opts, 'zzz').length, 0);
  assert.equal(filterPickerOptions(opts, '  ').length, 3);
});

test('missingLabel shows the last known name and never a raw id', () => {
  assert.equal(missingLabel('Old Mill'), 'Missing: Old Mill');
  assert.equal(missingLabel('LOC-OLD-MILL'), 'Missing: a record that no longer exists');
  assert.equal(missingLabel(), 'Missing: a record that no longer exists');
});

test('refPicker shows the current link by name, groups options, offers None, stores the id in a hidden input', () => {
  const html = refPicker({id: 'q-loc', label: 'Location', options: pickerOptions(records), value: 'LOC-A', data: {field: 'location'}});
  assert.match(html, /<input type="hidden" class="ag-picker__value" id="q-loc" value="LOC-A" data-field="location">/);
  assert.match(html, /id="q-loc-text"[^>]*value="Ashford"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /data-value="" data-label="None"/);
  assert.match(html, /class="ag-picker__group" data-group="Routes">Routes</);
  assert.ok(!/is-missing/.test(html));
  assert.ok(!/<input type="text"[^>]*value="LOC-/.test(html), 'the text box never shows the id');
  assert.ok(!refPicker({id: 'x', label: 'L', options: [], none: null}).includes('data-value=""'), 'no None for a required link');
  assert.match(refPicker({id: 'x', label: 'A <b>', options: []}), /A &lt;b&gt;/);
});

test('refPicker marks a broken link: Missing: <name> with Replace…, the stored value kept, no raw id shown', () => {
  const html = refPicker({id: 'q-loc', label: 'Location', options: pickerOptions(records), value: 'LOC-GONE', missingName: 'Old Mill'});
  assert.match(html, /is-missing/);
  assert.match(html, /Missing: Old Mill/);
  assert.match(html, /data-ag-picker-replace>Replace…</);
  assert.match(html, /id="q-loc" value="LOC-GONE"/);
  const visible = html.replace(/<input[^>]*>/g, '').replace(/<[^>]*>/g, ' ');
  assert.ok(!/LOC-GONE/.test(visible));
  assert.match(refPicker({id: 'x', label: 'L', options: [], value: 'NPC-X'}), /Missing: a record that no longer exists/);
});

// A hand-built DOM mirroring the markup above (the fake DOM has no innerHTML).
function build(selected = '') {
  const doc = new FakeDocument();
  const mk = (tag, attrs, parent) => { const el = doc.createElement(tag, attrs); parent?.append(el); return el; };
  const wrap = mk('div', {class: 'ag-picker'}, doc.body);
  const hidden = mk('input', {class: 'ag-picker__value'}, wrap); hidden.value = selected;
  const box = mk('div', {class: 'ag-picker__box'}, wrap);
  const input = mk('input', {class: 'ag-picker__input', 'data-shown': ''}, box);
  const list = mk('ul', {class: 'ag-picker__list'}, box); list.hidden = true;
  const add = (value, label, group = '') => { const li = mk('li', {role: 'option', id: `o-${value || 'none'}`, 'data-value': value, 'data-label': label, 'data-group': group, 'data-search': `${label} ${group}`.toLowerCase()}, list); return li; };
  add('', 'None');
  mk('li', {class: 'ag-picker__group', 'data-group': 'Settlements'}, list);
  const a = add('LOC-A', 'Ashford', 'Settlements'), b = add('LOC-B', 'Brightwater', 'Settlements');
  mk('li', {class: 'ag-picker__group', 'data-group': 'Routes'}, list);
  const r = add('LOC-R', 'Old Road', 'Routes');
  const empty = mk('li', {class: 'ag-picker__empty'}, list); empty.hidden = true;
  return {doc, wrap, hidden, input, list, a, b, r, empty, none: list.querySelector('[data-value=""]')};
}

test('bindRefPickers: type-ahead filters options and groups, click chooses, stores the id and shows the name', () => {
  const t = build(), seen = [];
  const unbind = bindRefPickers(t.doc.body, (v, label) => seen.push([v, label]));
  t.input.focus(); t.input.dispatch('focus');
  assert.equal(t.list.hidden, false);
  t.input.value = 'road'; t.input.dispatch('input');
  assert.equal(t.a.hidden, true); assert.equal(t.r.hidden, false); assert.equal(t.none.hidden, true);
  const heads = t.list.querySelectorAll('.ag-picker__group');
  assert.deepEqual(heads.map(h => h.hidden), [true, false], 'a group with no match is hidden');
  t.input.value = 'zzz'; t.input.dispatch('input');
  assert.equal(t.empty.hidden, false);
  t.input.value = 'ash'; t.input.dispatch('input');
  t.a.click();
  assert.equal(t.hidden.value, 'LOC-A');
  assert.equal(t.input.value, 'Ashford');
  assert.equal(t.list.hidden, true);
  assert.deepEqual(seen, [['LOC-A', 'Ashford']]);
  unbind();
  t.b.click();
  assert.equal(t.hidden.value, 'LOC-A', 'unbound: no longer reacts');
});

test('bindRefPickers: keyboard picks with arrows and Enter; Escape and blur restore the shown name; None clears', () => {
  const t = build('LOC-B');
  t.input.setAttribute('data-shown', 'Brightwater'); t.input.value = 'Brightwater';
  bindRefPickers(t.doc.body);
  t.input.dispatch('keydown', {key: 'ArrowDown'});
  assert.equal(t.list.hidden, false);
  assert.equal(t.b.getAttribute('data-active'), 'true', 'opens on the current choice');
  t.input.dispatch('keydown', {key: 'ArrowDown'});
  assert.equal(t.r.getAttribute('data-active'), 'true');
  const enter = t.input.dispatch('keydown', {key: 'Enter'});
  assert.equal(enter.defaultPrevented, true);
  assert.equal(t.hidden.value, 'LOC-R');
  t.input.dispatch('keydown', {key: 'ArrowDown'}); t.input.value = 'junk'; t.input.dispatch('keydown', {key: 'Escape'});
  assert.equal(t.list.hidden, true); assert.equal(t.input.value, 'Old Road'); assert.equal(t.hidden.value, 'LOC-R');
  t.input.dispatch('focus'); t.input.value = 'x'; t.input.dispatch('blur');
  assert.equal(t.input.value, 'Old Road');
  t.input.dispatch('focus'); t.none.click();
  assert.equal(t.hidden.value, ''); assert.equal(t.input.value, '');
});

test('bindRefPickers: Replace… reveals the picker for a broken link and keeps the old value until a new one is chosen', () => {
  const t = build('LOC-GONE');
  const box = t.wrap.querySelector('.ag-picker__box'); box.hidden = true;
  const missing = t.doc.createElement('span', {class: 'ag-picker__missing', 'data-ag-picker-missing': ''});
  const btn = t.doc.createElement('button', {'data-ag-picker-replace': ''}); missing.append(btn); t.wrap.append(missing);
  bindRefPickers(t.doc.body);
  btn.click();
  assert.equal(box.hidden, false); assert.equal(missing.hidden, true);
  assert.equal(t.hidden.value, 'LOC-GONE', 'still the old value');
  assert.equal(t.doc.activeElement, t.input);
  t.b.click();
  assert.equal(t.hidden.value, 'LOC-B');
});

const linkOptions = pickerOptions(records, {gm: true});

test('refList shows each link by name with Remove, marks a missing link and hides taken options in the add picker', () => {
  const html = refList({id: 'q-locs', label: 'Locations', options: linkOptions, values: ['LOC-A', 'LOC-GONE'], names: {'LOC-GONE': 'Old Mill'}, noun: 'location'});
  assert.match(html, /data-ag-reflist id="q-locs" role="group"/);
  assert.match(html, /data-value="LOC-A" data-label="Ashford"><span class="ag-reflist__name">Ashford/);
  assert.match(html, /is-missing" data-value="LOC-GONE"[^>]*>[^]*Missing: Old Mill/);
  assert.match(html, /data-ag-reflist-replace aria-label="Replace the missing location"/);
  assert.match(html, /aria-label="Remove Ashford"/);
  assert.match(html, /data-value="LOC-A"[^>]*data-taken="true" hidden/, 'a chosen record is not offered again');
  assert.match(html, /data-ag-list-picker/);
  assert.ok(!/class="ag-reflist__name">[^<]*LOC-/.test(html), 'no raw id shown');
  assert.match(refList({id: 'x', label: 'L', options: []}), /None yet\.<\/p>/);
  assert.ok(!/ag-reflist__none"[^>]*hidden/.test(refList({id: 'x', label: 'L', options: []})));
});

test('refList locked (a partner module is off) keeps the links, shows saved names only, offers no controls', () => {
  const html = refList({id: 'q-locs', label: 'Locations', values: ['LOC-A', 'LOC-B'], names: {'LOC-A': 'Ashford'}, locked: 'Turn on Locations to change these.', noun: 'location'});
  assert.match(html, /data-value="LOC-A"[^>]*>[^]*Ashford/);
  assert.match(html, /A location \(names unavailable\)/);
  assert.ok(!/Missing:/.test(html) && !/data-ag-reflist-remove/.test(html) && !/ag-picker/.test(html));
  assert.match(html, /Turn on Locations to change these\./);
});

function buildList(values) {
  const doc = new FakeDocument();
  const mk = (tag, attrs, parent) => { const el = doc.createElement(tag, attrs); parent?.append(el); return el; };
  const box = mk('div', {class: 'ag-reflist'}, doc.body);
  const items = mk('ul', {'data-ag-reflist-items': ''}, box);
  const none = mk('p', {class: 'ag-reflist__none'}, box);
  const lis = {};
  for (const v of values) { const li = mk('li', {class: 'ag-reflist__item', 'data-value': v, 'data-label': v}, items); lis[v] = li; mk('button', {'data-ag-reflist-remove': ''}, li); }
  const wrap = mk('div', {class: 'ag-picker', 'data-ag-list-picker': ''}, box);
  const hidden = mk('input', {class: 'ag-picker__value'}, wrap);
  const input = mk('input', {class: 'ag-picker__input', 'data-shown': ''}, wrap);
  const list = mk('ul', {class: 'ag-picker__list'}, wrap); list.hidden = true;
  const opt = (value, label) => mk('li', {role: 'option', 'data-value': value, 'data-label': label, 'data-search': label.toLowerCase()}, list);
  return {doc, box, items, none, lis, hidden, input, list, a: opt('LOC-A', 'Ashford'), b: opt('LOC-B', 'Brightwater'), r: opt('LOC-R', 'Old Road')};
}

test('bindRefLists adds by name, removes, never offers a taken record, and reports the ids in order', () => {
  const t = buildList(['LOC-A']), seen = [];
  t.a.setAttribute('data-taken', 'true'); t.a.hidden = true;
  bindRefLists(t.doc.body, values => seen.push(values));
  t.b.click();
  assert.deepEqual(readRefList(t.box), ['LOC-A', 'LOC-B']);
  assert.deepEqual(seen.at(-1), ['LOC-A', 'LOC-B']);
  assert.equal(t.b.getAttribute('data-taken'), 'true'); assert.equal(t.b.hidden, true);
  assert.equal(t.hidden.value, '', 'the picker resets for the next add'); assert.equal(t.input.value, '');
  assert.equal(t.none.hidden, true);
  t.lis['LOC-A'].querySelector('[data-ag-reflist-remove]').click();
  assert.deepEqual(readRefList(t.box), ['LOC-B']);
  assert.equal(t.a.getAttribute('data-taken'), null, 'a removed record can be picked again');
  t.input.dispatch('focus'); t.input.value = 'ash'; t.input.dispatch('input');
  assert.equal(t.a.hidden, false); assert.equal(t.b.hidden, true, 'taken stays out of the results');
  t.doc.body.querySelector('[data-value="LOC-B"][data-ag-reflist-remove]');
  const rm = t.items.children[0].querySelector('[data-ag-reflist-remove]'); rm.click();
  assert.deepEqual(readRefList(t.box), []);
  assert.equal(t.none.hidden, false);
});

test('bindRefLists Replace… swaps a missing link for the next record chosen, in the same place', () => {
  const t = buildList(['LOC-GONE', 'LOC-A']);
  const rep = t.doc.createElement('button', {'data-ag-reflist-replace': ''}); t.lis['LOC-GONE'].append(rep);
  t.a.setAttribute('data-taken', 'true'); t.a.hidden = true;
  bindRefLists(t.doc.body);
  rep.click();
  assert.equal(t.doc.activeElement, t.input);
  t.r.click();
  assert.deepEqual(readRefList(t.box), ['LOC-R', 'LOC-A']);
  t.b.click();
  assert.deepEqual(readRefList(t.box), ['LOC-R', 'LOC-A', 'LOC-B'], 'after a replace, the next pick appends again');
});

test('bindRefPickers leaves the pickers inside a refList to bindRefLists', () => {
  const t = buildList([]);
  bindRefPickers(t.doc.body);
  t.input.dispatch('focus');
  assert.equal(t.list.hidden, true);
});
