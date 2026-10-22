import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeDocument, fakeStorage} from './fake-dom.mjs';
import {HTML} from './kit-path.mjs';
const {subTabs, tabPanelAttrs, bindTablist, uiState} = await import(HTML);

test('subTabs renders a labelled tablist with roving tabindex and panel wiring', () => {
  const html = subTabs({group: 'gmSetup', label: 'GM Setup sections', selected: 'rules',
    tabs: [{id: 'general', label: 'General'}, {id: 'rules', label: 'Rules & <limits>', icon: 'fa-solid fa-scale-balanced', count: 3}]});
  assert.match(html, /^<div class="ag-tabs ag-tabs--sub" role="tablist" aria-label="GM Setup sections">/);
  assert.match(html, /<button type="button" role="tab" id="gm-setup-tab-general" data-tab="general" aria-controls="gm-setup-panel-general" aria-selected="false" tabindex="-1">General<\/button>/);
  assert.match(html, /id="gm-setup-tab-rules" data-tab="rules" aria-controls="gm-setup-panel-rules" aria-selected="true" tabindex="0"><i class="fa-solid fa-scale-balanced" aria-hidden="true"><\/i> Rules &amp; &lt;limits&gt; <span class="ag-tab__count">3<\/span>/);
  assert.equal(tabPanelAttrs('gmSetup', 'rules'), 'id="gm-setup-panel-rules" role="tabpanel" aria-labelledby="gm-setup-tab-rules" tabindex="0"');
  assert.match(tabPanelAttrs('gmSetup', 'general', {hidden: true}), / hidden$/);
});

test('subTabs selects the first tab when the selection is unknown', () => {
  const html = subTabs({group: 'g', tabs: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], selected: 'gone'});
  assert.match(html, /data-tab="a"[^>]*aria-selected="true" tabindex="0"/);
  assert.ok(!html.includes('aria-label'));
});

function tabRow(doc, {selected = 1, vertical = false, roles = true} = {}) {
  const list = doc.createElement('div', {class: 'ag-tabs', ...(roles ? {role: 'tablist'} : {})});
  if (vertical) list.setAttribute('aria-orientation', 'vertical');
  const tabs = ['a', 'b', 'c'].map((id, i) => {
    const t = doc.createElement('button', {'data-tab': id, 'aria-controls': `p-${id}`, ...(roles ? {role: 'tab'} : {})});
    if (roles) t.setAttribute('aria-selected', String(i === selected)); else if (i === selected) t.setAttribute('class', 'active');
    return t;
  });
  list.append(...tabs);
  const panels = ['a', 'b', 'c'].map(id => doc.createElement('section', {id: `p-${id}`}));
  doc.body.append(list, ...panels);
  return {list, tabs, panels};
}

test('bindTablist: one Tab stop, arrows wrap, Home/End jump, panels get role and label', () => {
  const doc = new FakeDocument();
  const {list, tabs, panels} = tabRow(doc);
  bindTablist(list);
  assert.deepEqual(tabs.map(t => t.getAttribute('tabindex')), ['-1', '0', '-1']);
  assert.equal(panels[0].getAttribute('role'), 'tabpanel');
  assert.equal(panels[0].getAttribute('aria-labelledby'), tabs[0].id);
  assert.equal(tabs[0].id, 'p-a-tab');
  const key = (el, k) => el.dispatch('keydown', {key: k});
  assert.ok(key(tabs[1], 'ArrowRight').defaultPrevented);
  assert.equal(doc.activeElement, tabs[2]);
  assert.deepEqual(tabs.map(t => t.getAttribute('tabindex')), ['-1', '-1', '0']);
  key(tabs[2], 'ArrowRight');
  assert.equal(doc.activeElement, tabs[0], 'Right on the last tab wraps to the first');
  key(tabs[0], 'ArrowLeft');
  assert.equal(doc.activeElement, tabs[2]);
  key(tabs[2], 'Home');
  assert.equal(doc.activeElement, tabs[0]);
  key(tabs[0], 'End');
  assert.equal(doc.activeElement, tabs[2]);
  assert.equal(key(tabs[2], 'a').defaultPrevented, false, 'other keys are left alone');
  assert.equal(key(tabs[2], 'ArrowDown').defaultPrevented, false, 'Down does nothing on a horizontal row');
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true', 'moving focus does not change the selection');
});

test('bindTablist: vertical rows use Up/Down; disabled tabs are skipped', () => {
  const doc = new FakeDocument();
  const {list, tabs} = tabRow(doc, {selected: 0, vertical: true});
  tabs[1].disabled = true;
  bindTablist(list);
  tabs[0].dispatch('keydown', {key: 'ArrowDown'});
  assert.equal(doc.activeElement, tabs[2]);
  assert.equal(tabs[0].dispatch('keydown', {key: 'ArrowRight'}).defaultPrevented, false);
});

test('bindTablist adds tab roles to a plain .ag-tabs row and finds tablists inside a container', () => {
  const doc = new FakeDocument();
  const {list, tabs} = tabRow(doc, {roles: false, selected: 2});
  bindTablist(list);
  assert.equal(list.getAttribute('role'), 'tablist');
  assert.deepEqual(tabs.map(t => t.getAttribute('role')), ['tab', 'tab', 'tab']);
  assert.deepEqual(tabs.map(t => t.getAttribute('aria-selected')), ['false', 'false', 'true']);
  assert.deepEqual(tabs.map(t => t.getAttribute('tabindex')), ['-1', '-1', '0']);
  const doc2 = new FakeDocument();
  const {tabs: inner} = tabRow(doc2, {selected: 0});
  bindTablist(doc2.body);
  inner[0].dispatch('keydown', {key: 'ArrowRight'});
  assert.equal(doc2.activeElement, inner[1]);
});

test('bindTablist: clicks keep the module handler, move the Tab stop and remember data-tab; unbind stops it', () => {
  const doc = new FakeDocument();
  const {list, tabs} = tabRow(doc, {selected: 0});
  let handled = 0;
  tabs[2].addEventListener('click', () => handled++);
  const state = uiState('t', {storage: fakeStorage(), userId: 'u'});
  const unbind = bindTablist(list, {state, key: 'sub'});
  tabs[2].click();
  assert.equal(handled, 1);
  assert.equal(tabs[2].getAttribute('tabindex'), '0');
  assert.equal(state.get('sub'), 'c');
  unbind();
  tabs[0].dispatch('keydown', {key: 'ArrowRight'});
  assert.equal(doc.activeElement, null);
  assert.doesNotThrow(() => bindTablist(null)());
});
