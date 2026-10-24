/**
 * 0.34.0: the name row (identity chips, star last) with Level up / Restore / Configure in the ⋯ menu; the Journey entry
 * text is read again; Professions with tier and icon; coin icons; Filters stays inside the window; the Conditions strip
 * under Mastery & marks; the quick bar drawer under the Hub; Compact's Strain pill. Mocked Foundry: this proves the
 * logic, markup and CSS rules, not the live Foundry layout (the sizes were checked separately in Chromium).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS, EDITS} from '../scripts/sheet.mjs';
import {identityChips} from '../scripts/character.mjs';
import {professionsBox, professionIcon, professionLine, PROFESSION_ICON_FALLBACK} from '../scripts/views.mjs';
import {clampShift, keepInside, placePopovers} from '../scripts/popover.mjs';
import * as conds from '../scripts/conditions.mjs';
import {takesQuickKeys} from '../scripts/quick-keys.mjs';
import * as j from '../scripts/journey.mjs';
import {MODULE_ID} from '../scripts/constants.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const rule = sel => { const at = CSS.lastIndexOf(`${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return CSS.slice(at, CSS.indexOf('}', at)); };
const ID_ITEMS = [
  {id: 'fighter', name: '[TEST] Fighter', type: 'class', img: 'f.webp', system: {levels: 5, identifier: 'fighter'}},
  {id: 'champ', name: '[TEST] Champion', type: 'subclass', img: 'c.webp', system: {classIdentifier: 'fighter'}},
  {id: 'wiz', name: '[TEST] Wizard', type: 'class', img: 'w.webp', system: {levels: 2, identifier: 'wizard'}},
  {id: 'evo', name: '[TEST] Evoker', type: 'subclass', img: 'e.webp', system: {classIdentifier: 'wizard'}},
  {id: 'elf', name: '[TEST] Elf', type: 'race', img: 'r.webp'},
  {id: 'sage', name: '[TEST] Sage', type: 'background', img: 'b.webp'}
];
async function render({user = users.owner, compact = false, actor = makeActor(), settings = {}, modules = {}, before} = {}) {
  installGlobals({user, modules, settings: {compactMode: compact, ...settings}});
  globalThis.document = {documentElement: {dataset: {}}};
  game.user.targets = new Set();
  const sheet = new Hub({document: actor});
  before?.(sheet);
  return {sheet, html: await sheet._renderHTML()};
}
const column = html => html.slice(html.indexOf('<aside class="agch-char'), html.indexOf('</aside>'));

// ---------- A: the name row and the ⋯ menu ----------

test('A: identity chips: each class with its level, its subclass right after it, then species and background', () => {
  installGlobals();
  const chips = identityChips(makeActor({items: ID_ITEMS}));
  assert.deepEqual(chips.map(c => [c.kind, c.text]), [['class', '[TEST] Fighter 5'], ['subclass', '[TEST] Champion'], ['class', '[TEST] Wizard 2'],
    ['subclass', '[TEST] Evoker'], ['species', '[TEST] Elf'], ['background', '[TEST] Sage']]);
  assert.equal(chips[1].label, '[TEST] Champion ([TEST] Fighter subclass)');
});

test('A: Full column top row (0.37.0: the name and identity are in the header): Cinder chip, inspiration star last; the art right under it', async () => {
  const cinders = {active: true, api: {cinder: {contract: 'ag-cinder/1', list: () => [{instanceId: 'cinst_TEST00001', name: '[TEST] Ember', art: null, powers: [], enhancements: []}]}}};
  const {html} = await render({actor: makeActor({items: ID_ITEMS}), modules: {'ashen-gate-cinders': cinders}});
  const col = column(html), ident = col.slice(col.indexOf('<div class="agch-ident">'), col.indexOf('agch-charfold'));
  assert.ok(ident.indexOf('agch-cchips') >= 0 && ident.indexOf('agch-cchips') < ident.indexOf('data-action="inspiration"'), 'Cinders, then the star');
  assert.doesNotMatch(col, /agch-name|data-action="item-sheet"/, 'no name and no identity in the column');
  const head = html.slice(0, html.indexOf('</header>'));
  const order = ['agch-head__name', 'Level 3', 'data-id="elf"', 'data-id="fighter"', 'data-id="champ"', 'data-id="wiz"', 'data-id="evo"', 'data-id="sage"'];
  order.slice(1).forEach((k, i) => assert.ok(head.indexOf(order[i]) >= 0 && head.indexOf(order[i]) < head.indexOf(k), `${order[i]} before ${k}`));
  assert.match(head, /data-id="elf" data-ag-always aria-label="\[TEST\] Elf \(species\): open" data-tooltip="\[TEST\] Elf \(species\): click to open">\[TEST\] Elf<\/button>/);
  assert.ok(col.indexOf('agch-ident') < col.indexOf('agch-doll') && col.indexOf('agch-doll') < col.indexOf('agch-tiles'), 'art and slots right under the name row');
  for (const gone of [/agch-idcard/, /agch-ident__actions/, /agch-sub"/, /data-action="level-up"/, /data-action="configure"/]) assert.doesNotMatch(col, gone);
  assert.match(rule('.agch-app .agch-insp'), /margin-left: auto/, 'the star sits last, at the end of the row');
});

test('A: Compact has the same header as Full (0.37.0): name, Level badge, the identity line with each class\'s level', async () => {
  const {html} = await render({compact: true, actor: makeActor({items: ID_ITEMS})});
  const head = html.slice(0, html.indexOf('</header>'));
  assert.match(head, /<span class="ag-badge agch-head__level">Level 3<\/span>/);
  assert.match(head, /agch-idlink--class" data-action="item-sheet" data-id="fighter"[^>]*>\[TEST\] Fighter 5<\/button>/);
  assert.doesNotMatch(column(html), /data-action="item-sheet"/);
});

test('A: the ⋯ menu carries Level up, Restore backup… (GM with copies) and Configure… (owner); none in the limited view; they close the menu', async () => {
  const {sheet} = await render();
  await sheet.dispatch('more-menu', {dataset: {}}, {});
  let html = await sheet._renderHTML();
  assert.match(html, /aria-label="More: Configure, Open native sheet"/);
  const menu = html.match(/<div class="agch-menu agch-moremenu"[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(menu, /level-up|look-menu|pop-out|name-edit|hotbar-link/, '0.46.0: those moved to the header or went away');
  assert.match(menu, /data-action="configure"/); assert.doesNotMatch(menu, /level-restore/, 'players never get Restore');
  assert.match(html.slice(0, html.indexOf('</header>')), /class="ag-btn ag-btn--ghost ag-btn--icon agch-hdrbtn agch-levelup" data-action="level-up"/, 'Level up is a header button');
  sheet.menu = null;
  await sheet.dispatch('level-up', {dataset: {}}, {});
  const observer = await render({user: users.observer, before: s => { s.menu = 'more'; }});
  assert.doesNotMatch(observer.html, /data-action="configure"/, 'observers cannot configure');
  assert.match(observer.html, /aria-label="More: Open native sheet"/, 'an observer has no Configure…');
  sheet.menu = 'more';
  await sheet.dispatch('configure', {dataset: {}}, {});
  assert.equal(sheet.menu, null);
});

test('A: Full doll: rings and trinkets under the art (no gap); an empty "Other equipped" is left out', async () => {
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__row'), /grid-row: 2; grid-column: 2/);
  assert.match(rule('.agch-app .agch-char .agch-doll > .agch-doll__col'), /grid-row: 1 \/ span 2/);
  assert.match(rule('.agch-app .agch-char .agch-doll'), /container: agch-doll \/ size; flex: 0 1/, 'the doll gives way before the column scrolls, in Full too');
  assert.match(rule('.agch-app .agch-root--charfolded .agch-char > :not(.agch-ident, .agch-charfold, .agch-charsum)'), /display: none/);
  const {html} = await render();
  assert.doesNotMatch(html, /agch-other/);
});

// ---------- B: Journey ----------

test('B: Journey add / edit are plain groups (a nested <form> is dropped by the browser) with a labelled Entry text box; Add entry reads it', async () => {
  installGlobals({user: users.gm});
  const actor = makeActor();
  game.actors = Object.assign([actor], {get: () => actor});
  game.users = [{...users.gm, active: true}]; game.users.get = id => game.users.find(u => u.id === id);
  game.journal = [];
  globalThis.document = {documentElement: {dataset: {}}};
  const sheet = new Hub({document: actor}); sheet.tab = 'journey';
  let html = await sheet._renderHTML();
  assert.doesNotMatch(html, /<form/, 'no form inside the sheet\'s own form');
  assert.match(html, /<div class="agch-journey__form agch-journey__add" data-journey-form="add" role="group"[^>]*>\s*<label class="agch-journey__field agch-journey__field--text"><span>Entry<\/span><textarea name="text"/);
  // The click: the button's group holds the fields, as in the browser.
  const fields = {text: {value: '[TEST] Found the old mill'}, date: {value: '2026-10-23'}, hidden: {checked: false}};
  const group = {querySelector: sel => fields[sel.match(/name="(\w+)"/)?.[1]] ?? null};
  const r = await ACTIONS['journey-add'](sheet, {closest: sel => sel === '[data-journey-form]' ? group : null, dataset: {}});
  assert.equal(r.ok, true, r.error);
  const entry = actor.flags[MODULE_ID].journey.entries[0];
  assert.deepEqual([entry.text, entry.date, entry.type], ['[TEST] Found the old mill', '2026-10-23', 'manual']);
  sheet.journeyEdit = entry.id;
  html = await sheet._renderHTML();
  assert.match(html, /data-journey-form="edit" role="group" aria-label="Edit entry">[\s\S]*<textarea name="text"[^>]*>\[TEST\] Found the old mill<\/textarea>/);
  fields.text.value = '[TEST] Found the old mill again';
  assert.equal((await ACTIONS['journey-save'](sheet, {closest: () => group, dataset: {id: entry.id}})).ok, true);
  assert.equal(actor.flags[MODULE_ID].journey.entries[0].text, '[TEST] Found the old mill again');
  assert.equal((await j.addManual(actor, {text: '  '})).error, 'Write something for the entry.', 'an empty entry is still refused');
});

// ---------- C: Professions ----------

test('C: Professions box: icon and "Name - Tier - Level n" from the Ledger\'s getProfessions; unknown professions get the fallback icon', () => {
  const ledger = rows => ({'ashen-gate-profession-ledger': {active: true, api: {getProfessions: () => rows}}});
  installGlobals({modules: ledger([{professionId: 'PROF-TEST-ARCH', name: 'Archaeology', level: 1, tier: 'Apprentice'},
    {professionId: 'PROF-TEST-SMITH', name: 'Blacksmithing', level: 4, tier: 'Journeyman'}, {professionId: 'PROF-TEST-NEW', name: '[TEST] Stargazing', level: 2, tier: 'Apprentice'}])});
  const box = professionsBox(makeActor());
  assert.match(box, /<i class="fa-solid fa-trowel agch-profbox__icon" aria-hidden="true"><\/i><span class="agch-profbox__name">Archaeology - Apprentice - Level 1<\/span>/);
  assert.match(box, /fa-hammer agch-profbox__icon[\s\S]*Blacksmithing - Journeyman - Level 4/);
  assert.match(box, new RegExp(`${PROFESSION_ICON_FALLBACK} agch-profbox__icon[\\s\\S]*\\[TEST\\] Stargazing - Apprentice - Level 2`), 'a new profession still renders');
  assert.match(box, /aria-label="Professions: Archaeology - Apprentice - Level 1, Blacksmithing - Journeyman - Level 4/);
  for (const [name, icon] of [['Alchemy', 'fa-flask'], ['Fishing', 'fa-fish'], ['Herbalism', 'fa-leaf'], ['Hunting/Skinning', 'fa-paw'], ['Mining', 'fa-person-digging'], ['Jewelcrafting', 'fa-gem']])
    assert.match(professionIcon({name}), new RegExp(icon), name);
  assert.equal(professionLine({name: 'Mining', level: 3, tier: ''}), 'Mining - Level 3', 'no tier from an older Ledger: left out');
});

// ---------- D: coins ----------

test('D: coin icons in the Inventory purse and the party purse summary, from the Hub\'s own CSS (no Utilities files)', async () => {
  const {html} = await render({before: s => { s.tab = 'inventory'; }});
  assert.match(html, /<label class="agch-coin agch-coin--gp"[^>]*><span class="agch-coin__icon" aria-hidden="true">G<\/span><span>gp<\/span><input type="number"[^>]*data-edit="currency" data-key="gp"/);
  for (const c of ['cp', 'sp', 'ep', 'gp', 'pp']) assert.match(rule(`.agch-app .agch-coin--${c}`), /--agch-metal: #[0-9a-f]{6}/);
  assert.match(rule('.agch-app .agch-coin__icon'), /radial-gradient/);
  assert.doesNotMatch(CSS + html, /agu-coin|ashen-gate-utilities\/styles/, 'independent of Utilities');
});

// ---------- E: Filters popover ----------

test('E: popovers open aligned to the right of their button and are moved back inside the clipping area', () => {
  assert.match(rule('.agch-app .agch-filtermenu'), /right: 0; left: auto;[^}]*max-width: calc\(100cqw - var\(--ag-space-3\)\)/);
  assert.match(CSS, /\.agch-filtermenu, \.agch-app \.agch-moremenu, \.agch-app \.agch-lookmenu \{ translate: var\(--agch-pop-shift, 0\) 0; \}/);
  const bounds = {left: 100, right: 600};
  assert.equal(clampShift({left: 200, right: 500}, bounds), 0, 'inside: unchanged');
  assert.equal(clampShift({left: -50, right: 300}, bounds), 154, 'past the left edge: moved right');
  assert.equal(clampShift({left: 400, right: 700}, bounds), -104, 'past the right edge: moved left');
  assert.equal(clampShift({left: 0, right: 900}, bounds), 104, 'wider than the room: pinned left');
  const set = {};
  const pop = {style: {removeProperty: k => { delete set[k]; }, setProperty: (k, v) => { set[k] = v; }}, getBoundingClientRect: () => ({left: -20, right: 330}),
    closest: sel => sel === '.agch-body' ? body : null};
  const body = {getBoundingClientRect: () => ({left: 10, right: 640})};
  assert.equal(keepInside(pop, body), 34); assert.equal(set['--agch-pop-shift'], '34px');
  placePopovers({querySelectorAll: sel => sel.includes('.agch-filtermenu') ? [pop] : []});
  assert.equal(set['--agch-pop-shift'], '34px', 'placed after each draw');
});

// ---------- F: Conditions ----------

function conditionWorld({user = users.gm, utilities = null, targets = [], actors = []} = {}) {
  installGlobals({user, modules: utilities ? {'ashen-gate-utilities': {active: true, api: {conditions: utilities}}} : {}});
  CONFIG.DND5E.conditionTypes.turned = {label: 'Turned'};   // a dnd5e condition with no Foundry status: never offered
  game.actors = Object.assign([...actors], {get: id => actors.find(a => a.id === id) ?? null});
  game.user.targets = new Set(targets);
  globalThis.document = {documentElement: {dataset: {}}};
}
const foe = (id = 'foe1', perms = {}) => { const a = makeActor({perms}); a.id = id; a.uuid = `Scene.s1.Token.${id}.Actor.${id}`; a.name = `[TEST] ${id}`; return a; };
const token = actor => ({name: actor.name, actor, document: {id: `t-${actor.id}`}});
const utilitiesApi = (allow = true) => { const calls = []; return {calls, api: {contract: 'ag-utilities-conditions/1',
  canApply: (id, s) => { calls.push(['canApply', id, s]); return allow; }, apply: async (id, s) => { calls.push(['apply', id, s]); return 'ok'; },
  canRemove: (id, s) => { calls.push(['canRemove', id, s]); return allow; }, remove: async (id, s) => { calls.push(['remove', id, s]); return 'ok'; }}}; };

test('F: only dnd5e conditions that are Foundry status effects are offered (no "turned"), exhaustion aside', () => {
  conditionWorld();
  assert.deepEqual(conds.conditionChoices(makeActor()).map(c => c.id), ['blinded', 'poisoned', 'prone']);
});

test('F: GM: Self puts it on the character, Target on every targeted token (linked or not), with Foundry\'s toggleStatusEffect', async () => {
  const me = makeActor(), goblin = foe('gob'), wolf = foe('wolf');
  conditionWorld({targets: [token(goblin), token(wolf)], actors: [me]});
  assert.equal((await conds.applyCondition(me, 'self', 'prone')).ok, true);
  assert.deepEqual(me.calls.at(-1), ['toggleStatusEffect', 'prone', {active: true}]);
  const r = await conds.applyCondition(me, 'target', 'blinded');
  assert.deepEqual(r.result.applied, ['[TEST] gob', '[TEST] wolf']);
  for (const a of [goblin, wolf]) assert.deepEqual(a.calls.at(-1), ['toggleStatusEffect', 'blinded', {active: true}]);
  assert.match((await conds.applyCondition(me, 'self', 'turned')).error, /Pick a condition from the list/, 'an id Foundry would refuse is never sent');
  assert.match((await conds.applyCondition(me, 'self', '')).error, /Pick a condition first/);
  game.user.targets = new Set();
  assert.match((await conds.applyCondition(me, 'target', 'prone')).error, /Target a token first/);
  me.statuses.add('poisoned'); const n = me.calls.length;
  assert.deepEqual((await conds.applyCondition(me, 'self', 'poisoned')).result.applied, [], 'already there: nothing sent');
  assert.equal(me.calls.length, n);
});

test('F: a player without Utilities changes only what they own; one refused target means nothing changes', async () => {
  const me = makeActor(), mine = foe('pet', {owner: 'OWNER'}), enemy = foe('gob');
  conditionWorld({user: users.owner, targets: [token(mine), token(enemy)], actors: [me]});
  assert.equal((await conds.applyCondition(me, 'self', 'prone')).ok, true);
  const r = await conds.applyCondition(me, 'target', 'prone');
  assert.match(r.error, /You don't own \[TEST\] gob/);
  assert.equal(mine.calls.length + enemy.calls.length, 0, 'checked before anything is applied');
  conditionWorld({user: users.observer, actors: [me]});
  assert.match((await conds.applyCondition(me, 'self', 'prone')).error, /You don't own/, 'observers are refused in the action');
});

test('F: a player with Utilities follows its condition rules (canApply / canRemove) and Utilities applies; unlinked tokens are left to the GM', async () => {
  const me = makeActor(), linked = foe('ally', {}), unlinked = foe('gob');
  const u = utilitiesApi(true);
  conditionWorld({user: users.owner, utilities: u.api, targets: [token(linked)], actors: [me, linked]});
  assert.equal((await conds.applyCondition(me, 'target', 'prone')).ok, true);
  assert.deepEqual(u.calls, [['canApply', 'ally', 'prone'], ['apply', 'ally', 'prone']]);
  assert.equal(linked.calls.length, 0, 'Utilities makes the change (on the GM client), not the Hub');
  game.user.targets = new Set([token(unlinked)]);
  assert.match((await conds.applyCondition(me, 'target', 'prone')).error, /Only the GM or a condition controller can change conditions on \[TEST\] gob/);
  const no = utilitiesApi(false);
  conditionWorld({user: users.owner, utilities: no.api, actors: [me]});
  assert.match((await conds.applyCondition(me, 'self', 'prone')).error, /the GM decides that in Ashen Gate \| Utilities/, 'locked: refused even on your own character');
  assert.equal(me.calls.length, 0);
  conditionWorld({user: users.gm, utilities: no.api, actors: [me]});
  assert.equal((await conds.applyCondition(me, 'self', 'prone')).ok, true, 'the GM is never held by the player rules');
  assert.deepEqual(me.calls.at(-1), ['toggleStatusEffect', 'prone', {active: true}]);
});

test('F: chips for this character and the current targets; ✕ only where allowed; it takes the condition off', async () => {
  const me = makeActor({statuses: ['prone']}), enemy = foe('gob'); enemy.statuses.add('blinded');
  conditionWorld({user: users.owner, targets: [token(enemy)], actors: [me]});
  const sheet = new Hub({document: me});
  let html = await sheet._renderHTML();
  const strip = html.slice(html.indexOf('agch-hotbar--conds'), html.indexOf('agch-bottombar'));
  assert.match(strip, /<li class="is-self"> Prone<button type="button" class="agch-placed__off" data-action="cond-remove" data-uuid="Actor\.actor1" data-status="prone"/);
  assert.match(strip, /<li class="is-target"> \[TEST\] gob: Blinded<\/li>/, 'not theirs: no ✕');
  assert.match(strip, /role="radiogroup" aria-label="Put the condition on"><button type="button" role="radio" aria-checked="true"[^>]*data-mode="self"/);
  assert.match(strip, /data-mode="target"[^>]*>Target <span class="ag-badge">1<\/span>/, 'the target count, as marks use the same targets');
  assert.ok(html.indexOf('agch-hotbar--marks') < html.indexOf('agch-hotbar--conds'), 'right under Mastery & marks');
  const r = await sheet.dispatch('cond-remove', {dataset: {uuid: 'Actor.actor1', status: 'prone'}}, {});
  assert.equal(r.ok, true); assert.deepEqual(me.calls.at(-1), ['toggleStatusEffect', 'prone', {active: false}]);
  assert.match((await sheet.dispatch('cond-remove', {dataset: {uuid: enemy.uuid, status: 'blinded'}}, {})).error, /You don't own \[TEST\] gob/, 'refused in the action too');
  await sheet.dispatch('cond-mode', {dataset: {mode: 'target'}}, {});
  assert.equal(sheet.condMode, 'target');
  await EDITS['cond-pick'](sheet, {value: 'poisoned'});
  html = await sheet._renderHTML();
  assert.match(html, /<option value="poisoned" selected>Poisoned<\/option>/, 'the pick survives a redraw');
  const apply = await sheet.dispatch('cond-apply', {dataset: {}, closest: () => null}, {});
  assert.match(apply.error, /You don't own \[TEST\] gob/, 'Apply uses the mode and the pick');
});

// ---------- G: quick bar drawer ----------

function drawerSheet({out = false, room = 1000, drawer = 52} = {}) {
  const {sheet} = {sheet: new Hub({document: makeActor()})};
  const doc = globalThis.document;
  sheet.position = {top: 40, width: 1240, height: 800};
  sheet.setPosition = p => Object.assign(sheet.position, p);
  sheet.element = {ownerDocument: out ? {} : doc, querySelector: sel => sel === '.agch-drawer' ? {getBoundingClientRect: () => ({height: drawer})} : sel === '[data-hotbar-slot]' ? {} : null};
  sheet.rendered = true;
  return {sheet, view: {innerHeight: 40 + 800 + room}};
}

test('G: the quick bar is a closed drawer under the bottom bar; its slots stay in the page, so the quick keys still work', async () => {
  const {html} = await render();
  assert.match(html, /<div class="agch-bottombar">[\s\S]*<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agch-quicktoggle" data-action="quick-toggle" data-ag-always aria-expanded="false" aria-controls="[^"]*-quickbar"/);
  assert.match(html, /<div class="agch-drawer" id="[^"]*-quickbar" role="region" aria-label="Quick bar" hidden><ol class="ag-hotbar agch-quick"/);
  assert.equal((html.match(/data-hotbar-slot=/g) ?? []).length, 10);
  assert.ok(html.indexOf('agch-agbar') < html.indexOf('agch-drawer'), 'below the Ashen Gate buttons');
  assert.match(rule('.agch-app .agch-drawer[hidden]'), /display: none/, 'closed: no room taken');
  const {sheet} = drawerSheet();
  assert.equal(takesQuickKeys(sheet), true);
  const compact = (await render({compact: true})).html;
  assert.match(compact, /<div class="agch-bottombar"><button[^>]*data-action="quick-toggle"[\s\S]*<div class="agch-drawer"/, 'Compact: the bar holds just the toggle');
  assert.doesNotMatch(compact, /agch-agbar/);
});

test('G: opening grows the window by the drawer (as far as the screen allows), closing gives it back; popped out it is left alone', async () => {
  installGlobals(); globalThis.document = {documentElement: {dataset: {}}};
  let {sheet, view} = drawerSheet();
  sheet.quickOpen = true; sheet.fitDrawer({view});
  assert.deepEqual([sheet.position.height, sheet._drawerGrow], [852, 52]);
  sheet.fitDrawer({view}); assert.equal(sheet.position.height, 852, 'only once');
  sheet.quickOpen = false; sheet.fitDrawer({view});
  assert.deepEqual([sheet.position.height, sheet._drawerGrow], [800, 0]);
  ({sheet, view} = drawerSheet({room: 20}));
  sheet.quickOpen = true; sheet.fitDrawer({view});
  assert.equal(sheet.position.height, 820, 'no more than the room below the window');
  ({sheet, view} = drawerSheet({out: true}));
  sheet.quickOpen = true; sheet.fitDrawer({view});
  assert.deepEqual([sheet.position.height, sheet._drawerGrow], [800, 0], 'popped out: its own browser window keeps its size');
  ({sheet, view} = drawerSheet());
  await ACTIONS['quick-toggle'](sheet);
  assert.equal(sheet.quickOpen, true);
  sheet._onClose({});
  assert.deepEqual([sheet.position.height, sheet.quickOpen, sheet._drawerGrow], [800, false, 0], 'closing the Hub gives the room back');
});

test('G: Compact / Full remembers each size without the drawer\'s room', async () => {
  installGlobals(); globalThis.document = {documentElement: {dataset: {}}};
  const {sheet} = drawerSheet();
  sheet.quickOpen = true; sheet._drawerGrow = 52; sheet.position.height = 852;
  await sheet.setCompact(true, {save: false});
  assert.deepEqual(sheet._sizes.full, {width: 1240, height: 800});
});

// ---------- H: Compact Strain ----------

test('H: Compact has no Strain row; the Strain pill stays beside HP (the GM\'s with − / +), Full keeps the GM row', async () => {
  const cinders = {'ashen-gate-cinders': {active: true, api: {strain: {contract: 'ag-strain/1', get: () => ({value: 4, guaranteeAt: 10, band: {label: '[TEST] Band'}, chance: 15})}}}};
  const gm = column((await render({user: users.gm, compact: true, modules: cinders})).html);
  assert.doesNotMatch(gm, /<div class="agch-strain"/);
  assert.match(gm, /<div class="agch-hp"[\s\S]*agch-pill--strain[\s\S]*data-action="strain-step" data-step="-1"/);
  const player = column((await render({compact: true, modules: cinders})).html);
  assert.match(player, /agch-pill--strain[^"]*" role="group" aria-label="[^"]*Read only\./); assert.doesNotMatch(player, /strain-step/);
  assert.match(column((await render({user: users.gm, modules: cinders})).html), /<div class="agch-strain"/, 'Full: the GM row stays');
  assert.doesNotMatch(column((await render({compact: true, modules: cinders, settings: {playerVisibility: {strain: false}}})).html), /agch-pill--strain/, 'hide-Strain-from-players still hides it');
});
