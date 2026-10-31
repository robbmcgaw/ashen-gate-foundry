/** 0.69.0: Effects tab layout and the Locations tree. Mocked Foundry: proves markup, options and CSS text, not how the live Hub looks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users} from './foundry-mock.mjs';
import * as fx from '../scripts/effects.mjs';
import * as locs from '../scripts/locations-list.mjs';
import {ashenGateTab} from '../scripts/partners.mjs';
import {toggleSection, collapsedState} from '../scripts/collapse.mjs';
import {fieldKey} from '../scripts/redraw.mjs';

const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const rules = css => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({sel: m[1].trim(), body: m[2]}));

function eff(o, parent) {
  const e = {documentName: 'ActiveEffect', id: o.id, name: o.name, img: 'e.svg', disabled: !!o.disabled, origin: null, flags: {}, statuses: new Set(), isTemporary: !!o.temporary,
    isSuppressed: false, duration: {label: o.dur ?? ''}, parent, getDurationParts() { return e.duration.label ? [e.duration.label] : []; }};
  return e;
}
function setup(user = users.owner) {
  installGlobals({user});
  const actor = makeActor({items: [{id: 'amu', name: '[TEST] Amulet of the Devout, +1', type: 'equipment'}]});
  const own = [eff({id: 'a', name: '[TEST] Bless', temporary: true, dur: '1 minute'}, actor), eff({id: 'b', name: '[TEST] Hand'}, actor)];
  const amu = actor.items.get('amu'); amu.documentName = 'Item';
  const fromItem = eff({id: 'r', name: '[TEST] Amulet glow'}, amu);
  actor.effects = new Map(own.map(e => [e.id, e]));
  actor.allApplicableEffects = function* () { yield* own; yield fromItem; };
  return actor;
}
const rowOf = (html, id) => html.match(new RegExp(`<li class="agch-fxrow[^"]*" data-effect-key="[^"]*:${id}">[\\s\\S]*?</li>`))?.[0] ?? '';

test('effect row: one source line, controls on the title row, no head grid', () => {
  const html = fx.effectsTab({actor: setup(), editable: true});
  const row = rowOf(html, 'r');
  assert.ok(row, 'item effect row');
  assert.equal((row.match(/\[TEST\] Amulet of the Devout, \+1/g) ?? []).length, 1, 'the item name appears once');
  assert.doesNotMatch(row, /Comes from/);
  assert.match(row, /\(edit it on the item\)/);
  const title = row.match(/<div class="agch-fxrow__title">[\s\S]*?<\/div>/)[0];
  assert.match(title, /agch-fxrow__name/); assert.match(title, /role="switch"/); assert.match(title, /data-action="effect-edit"/);
  assert.doesNotMatch(row.replace(title, ''), /role="switch"|data-action="effect-edit"/, 'nothing but the meta line is outside the title row');
  assert.doesNotMatch(html, /agch-fxhead/);
  assert.match(html, /Switches apply now/); assert.match(html, /data-action="effect-add"/);
  assert.match(row, /data-tooltip-direction="UP"/, 'tooltips open above the control, away from the help text');
});

test('trash only for effects the character owns; none on item effects; disabled with a reason when not allowed', () => {
  const actor = setup();
  const html = fx.effectsTab({actor, editable: true});
  assert.match(rowOf(html, 'b'), /data-action="effect-delete"/);
  assert.doesNotMatch(rowOf(html, 'r'), /effect-delete/);
  assert.match(rowOf(html, 'r'), /data-action="effect-edit"/, 'edit and the switch stay on item effects');
  const gmHtml = fx.effectsTab({actor: setup(users.gm), editable: true});
  assert.doesNotMatch(rowOf(gmHtml, 'r'), /effect-delete/);
  const ro = fx.effectsTab({actor: setup(users.observer), editable: false});
  assert.doesNotMatch(ro, /effect-delete|effect-edit/);
});

test('three groups are collapsible buttons, empty ones say None., state is remembered and focus identity survives', async () => {
  const actor = setup();
  const html = fx.effectsTab({actor, editable: true});
  for (const key of ['effects:temporary', 'effects:passive', 'effects:inactive']) assert.match(html, new RegExp(`data-action="section-toggle" data-key="${key}" data-ag-always aria-expanded="true"`));
  assert.match(html, /<section[^>]*data-sec="effects:inactive"[\s\S]*?None\./);
  // the toggle flips the DOM in place (no re-render), saves, and the next render reads it back
  const attrs = {'aria-expanded': 'true'}, body = {hidden: false};
  const button = {setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k], classList: {contains: () => false}};
  const root = {querySelectorAll: sel => (sel.includes('data-sec-body') ? [body] : [button])};
  await toggleSection(root, 'effects:passive');
  assert.equal(attrs['aria-expanded'], 'false'); assert.equal(body.hidden, true); assert.equal(collapsedState()['effects:passive'], true);
  const again = fx.effectsTab({actor, editable: true});
  assert.match(again, /data-key="effects:passive" data-ag-always aria-expanded="false"/);
  assert.match(again, /data-sec-body="effects:passive" hidden/);
  const el = a => ({tagName: 'BUTTON', attributes: Object.entries(a).map(([name, value]) => ({name, value}))});
  assert.equal(fieldKey(el({'data-action': 'section-toggle', 'data-key': 'effects:passive', 'aria-expanded': 'true'})), fieldKey(el({'data-action': 'section-toggle', 'data-key': 'effects:passive', 'aria-expanded': 'false'})), 'same focus key before and after');
});

test('radius guard: no container rule uses the pill radius; the Effects row uses the box radius', () => {
  const pillOk = /(switch|knob|chip|badge|btn|button|hotbtn|prep|rail__tab|idlink|coinchip|cchip|placed|hp__|corb|count|dot|pill)/i;
  const bad = rules(CSS).filter(r => /agch-(fx|loc)/.test(r.sel) && /radius[^;]*(radius-control|999px)/.test(r.body) && !pillOk.test(r.sel));
  assert.deepEqual(bad.map(r => r.sel), [], 'effects and locations containers are not pills');
  const row = rules(CSS).find(r => /^\.agch-app \.agch-fxrow$/.test(r.sel));
  assert.match(row.body, /border-radius: var\(--ag-radius\)/);
  const anyContainer = rules(CSS).filter(r => /\{?/.test(r.body) && /border-radius: *(var\(--ag-radius-control\)|999px)/.test(r.body) && /(__row|__card|__box|__panel|row\b|list)/.test(r.sel) && !pillOk.test(r.sel));
  assert.deepEqual(anyContainer.map(r => r.sel), [], 'no other row / list / panel container has a pill');
});

const row = (ref, name, extra = {}) => ({ref, name, state: 'revealed', active: false, isRegion: false, restricted: false, match: true, children: [], ...extra});
const sec = (id, label, over = {}) => ({id, label, count: 1, flat: false, container: false, ref: null, rows: [], sections: [], ...over});
const model = sections => ({contract: 'ag-locations-list/1', audience: 'player', query: '', filtering: false, total: 3, shown: 3, empty: '',
  controls: {search: {placeholder: 'Search locations'}, filters: [], sorts: [{value: 'name', label: 'Name'}], sort: 'name', sortDesc: false, canReverse: false}, filters: {}, sort: 'name', sortDesc: false, sections});
function partner(listModel) {
  return {'ashen-gate-locations': {active: true, api: {listModel, openLocation() {}, open() {}}}};
}
test('Locations: actorId is passed, restrictedLabel is printed, older Locations falls back to Selected players', () => {
  const seen = [];
  const rows = [row('LOC-TEST-A', '[TEST] Mine', {restricted: true, restrictedLabel: 'Personal'}), row('LOC-TEST-B', '[TEST] Shared', {restricted: true, restrictedLabel: 'Selected players'}), row('LOC-TEST-C', '[TEST] Old', {restricted: true}), row('LOC-TEST-D', '[TEST] Open')];
  installGlobals({user: users.owner, modules: partner(o => { seen.push(o); return model([sec('LOC-TEST-R', '[TEST] Region', {ref: 'LOC-TEST-R', count: 4, rows})]); })});
  const html = ashenGateTab({actor: makeActor(), sheet: {agTab: 'ashen-gate-locations'}});
  assert.equal(seen[0].actorId, 'actor1');
  assert.equal(seen[0].revealedOnly, false);
  const li = ref => html.match(new RegExp(`<li class="agch-loc__row[^"]*"><button[^>]*data-ref="${ref}"[\\s\\S]*?</li>`))[0];
  assert.match(li('LOC-TEST-A'), /<span class="ag-badge">Personal<\/span>/);
  assert.match(li('LOC-TEST-B'), /<span class="ag-badge">Selected players<\/span>/);
  assert.match(li('LOC-TEST-C'), /<span class="ag-badge">Selected players<\/span>/, 'older Locations: no label, same wording as before');
  assert.doesNotMatch(li('LOC-TEST-D'), /ag-badge/);
  assert.equal(locs.restrictedText({restrictedLabel: '<b>'}), '<b>'); // escaped where it is printed
  const xss = locs.locationsListHtml(model([sec('x', 'X', {rows: [row('R', 'n', {restricted: true, restrictedLabel: '<i>'})]})]), {query: '', filters: {}, filtersOpen: false});
  assert.doesNotMatch(xss, /<i>/); assert.match(xss, /&lt;i&gt;/);
});

test('Locations tree: headings heavier than rows, indent guides, plain row buttons with hover and focus background, no pill containers', () => {
  const kid = sec('LOC-TEST-W', '[TEST] Ward', {ref: 'LOC-TEST-W', rows: [row('LOC-TEST-P', '[TEST] Place', {type: 'Yard', active: true, children: [row('LOC-TEST-Q', '[TEST] Nested')]})]});
  const html = locs.locationsListHtml(model([sec('LOC-TEST-R', '[TEST] Region', {ref: 'LOC-TEST-R', count: 2, sections: [kid]})]), {query: '', filters: {}, filtersOpen: false});
  assert.match(html, /<h4 class="agch-loc__head">/);
  assert.equal((html.match(/<h4 /g) ?? []).length, 2, 'region and ward are headings');
  assert.match(html, /<button type="button" class="agch-loc__place"/);
  assert.doesNotMatch(html, /class="ag-link"/, 'places are not underlined link buttons');
  assert.match(html, /Here now/); assert.match(html, /<span class="agch-muted">Yard<\/span>/);
  assert.match(html, /aria-expanded="true"/); assert.match(html, /data-action="partner-open" data-partner="ashen-gate-locations" data-ref="LOC-TEST-R"/, 'folder Open button kept');
  const all = rules(CSS), by = re => all.filter(r => re.test(r.sel));
  const head = by(/agch-loc__head$/)[0].body, rowRule = by(/agch-loc__row$/)[0].body;
  const w = b => Number((b.match(/font-weight: (\d+)/) ?? [])[1] ?? 400);
  assert.ok(w(head) >= 700 && w(rowRule) <= 400, 'headings are heavier than rows');
  assert.ok(by(/agch-loc__place:hover$/).some(r => /background: var\(--ag-surface-hover\)/.test(r.body)), 'hover background');
  const focus = by(/agch-loc__place:focus-visible$/);
  assert.ok(focus.some(r => /background: var\(--ag-surface-hover\)/.test(r.body) && /outline:/.test(r.body)), 'focus-visible background and outline');
  assert.ok(by(/^\.agch-app \.agch-loc__place$/).every(r => /text-decoration: none/.test(r.body)), 'no underline');
  assert.ok(all.some(r => /agch-loc__groups \.agch-loc__groups/.test(r.sel) && /border-inline-start/.test(r.body)), 'indent guide on nested groups');
  assert.ok(all.some(r => /agch-loc__rows \.agch-loc__rows/.test(r.sel) && /border-inline-start/.test(r.body)), 'indent guide on nested rows');
});
