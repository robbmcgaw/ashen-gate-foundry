/** 0.10.0 sheet polish: HP bar and editor, configure windows, collapsible sections, slots, rarity, speeds, quick bar (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as act from '../scripts/actions.mjs';
import {hpBar, SLOT_ICONS, BOTTOM_SLOTS, RIGHT_SLOTS} from '../scripts/character.mjs';
import {openConfig, CONFIGS} from '../scripts/configure.mjs';
import {isCollapsed, setCollapsed, collapsedState, sectionHtml, sectionKey, toggleSection, COLLAPSE_MAX} from '../scripts/collapse.mjs';
import {speedsData, headerData} from '../scripts/data.mjs';
import {equipmentLayout, equipChoices, naturalSlot, itemRow} from '../scripts/items.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {agBarHtml} from '../scripts/views.mjs';

const Cls = () => createHubSheetClass(FakeActorSheetV2);
const render = async (opts = {}) => { const s = new (Cls())({document: opts.actor ?? makeActor()}); Object.assign(s, opts.sheet ?? {}); return {sheet: s, html: await s._renderHTML()}; };

/** dnd5e 6's config window classes: each records how it was built and rendered. */
function installDnd5e() {
  const made = [];
  const cls = name => class { constructor(o) { this.options = o; made.push([name, o]); } async render(o) { made.push([`${name}.render`, o]); return this; } };
  const names = ['AbilityConfig', 'ArmorClassConfig', 'DeathConfig', 'HitDiceConfig', 'HitPointsConfig', 'InitiativeConfig', 'SkillToolConfig', 'LanguagesConfig', 'ToolsConfig', 'WeaponsConfig', 'TraitsConfig'];
  globalThis.dnd5e = {applications: {actor: Object.fromEntries(names.map(n => [n, cls(n)])), shared: {MovementSensesConfig: cls('MovementSensesConfig')}}};
  return made;
}

test('HP bar: fill, yellow temp overshield, blue max-adjustment overlay, "X / X HP (+X TEMP)"', () => {
  let b = hpBar({value: 20, temp: 5, max: 24, tempmax: 0, effectiveMax: 24});
  assert.equal(b.text, '20 / 24 HP'); assert.equal(b.tempText, '(+5 TEMP)');
  assert.ok(Math.abs(b.fill - 83.33) < 0.01); assert.equal(b.boost, 0);
  assert.ok(Math.abs(b.tempLeft - (100 - b.temp)) < 0.01, 'temp would overflow, so it is pushed back from the end');
  b = hpBar({value: 10, temp: 2, max: 20, tempmax: 0, effectiveMax: 20});
  assert.equal(b.tempLeft, 50); assert.equal(b.temp, 10, 'temp right after current HP');
  b = hpBar({value: 30, temp: 0, max: 20, tempmax: 10, effectiveMax: 30});
  assert.equal(b.text, '30 / 30 HP'); assert.equal(b.tempText, '');
  assert.ok(Math.abs(b.boost - 33.33) < 0.01); assert.ok(Math.abs(b.boostLeft - 66.67) < 0.01, 'blue part is the max HP above normal max');
  assert.equal(hpBar({value: 5, temp: 0, max: 20, tempmax: -5, effectiveMax: 15}).boost, 0, 'a negative adjustment draws no blue part');
});

test('HP editor: one update with current/temp/max adj.; blanks left alone; owner only', async () => {
  installGlobals({user: users.owner});
  const actor = makeActor();
  assert.equal((await act.setHpValues(actor, {value: '12', temp: '3', tempmax: '-2'})).ok, true);
  assert.deepEqual(actor.calls.at(-1), ['update', {'system.attributes.hp.value': 12, 'system.attributes.hp.temp': 3, 'system.attributes.hp.tempmax': -2}]);
  await act.setHpValues(actor, {value: '-4', temp: '', tempmax: undefined});
  assert.deepEqual(actor.calls.at(-1), ['update', {'system.attributes.hp.value': 0}], 'never below 0; blank fields unchanged');
  assert.equal((await act.setHpValues(actor, {value: 'x'})).ok, false);
  const n = actor.calls.length;
  assert.equal((await act.setHpValues(actor, {})).ok, true); assert.equal(actor.calls.length, n, 'nothing to change, no update');
  installGlobals({user: users.observer});
  assert.equal((await act.setHpValues(actor, {value: 1})).ok, false, 'observers refused in the action layer');
});

test('HP block: no text inputs; double-click opens the editor for owners only; Apply writes and closes', async () => {
  installGlobals({user: users.owner});
  const {sheet, html} = await render();
  assert.match(html, /data-hp-bar tabindex="0" data-config="hitPoints"/);
  assert.doesNotMatch(html, /agch-hpedit/);
  sheet._onHpBarOpen({target: {closest: () => ({})}, preventDefault() {}});
  assert.equal(sheet.menu, 'hp');
  const open = await sheet._renderHTML();
  assert.match(open, /agch-hpedit[\s\S]*data-hpedit="value" value="20"[\s\S]*data-hpedit="temp" value="5"[\s\S]*data-hpedit="tempmax" value="0"/);
  assert.match(open, /data-action="menu-close"[^>]*><span>Cancel[\s\S]*data-action="hp-apply"/, 'Cancel left, Apply right');
  const inputs = [{dataset: {hpedit: 'value'}, value: '9'}, {dataset: {hpedit: 'temp'}, value: '0'}, {dataset: {hpedit: 'tempmax'}, value: '4'}];
  const r = await ACTIONS['hp-apply'](sheet, {closest: () => ({querySelectorAll: () => inputs})});
  assert.equal(r.ok, true); assert.equal(sheet.menu, null);
  assert.deepEqual(sheet.document.calls.at(-1), ['update', {'system.attributes.hp.value': 9, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 4}]);
  installGlobals({user: users.observer});
  const {sheet: view, html: vh} = await render();
  assert.doesNotMatch(vh, /data-config=/, 'observers get no configure targets');
  view._onHpBarOpen({target: {closest: () => ({})}, preventDefault() {}});
  assert.equal(view.menu, null, 'observers cannot open the editor');
});

test('right-click configure opens dnd5e\'s own window with the standard sheet\'s options; owners only', async () => {
  installGlobals({user: users.owner});
  const made = installDnd5e(), actor = makeActor();
  const cases = [['ability', 'str', 'AbilityConfig', {key: 'str'}], ['skill', 'ste', 'SkillToolConfig', {trait: 'skills', key: 'ste'}], ['armorClass', null, 'ArmorClassConfig', {}],
    ['hitPoints', null, 'HitPointsConfig', {}], ['hitDice', null, 'HitDiceConfig', {}], ['initiative', null, 'InitiativeConfig', {}], ['death', null, 'DeathConfig', {}],
    ['movement', null, 'MovementSensesConfig', {type: 'movement'}], ['senses', null, 'MovementSensesConfig', {type: 'senses'}],
    ['trait', 'languages', 'LanguagesConfig', {trait: 'languages'}], ['trait', 'armor', 'TraitsConfig', {trait: 'armor'}], ['trait', 'weapon', 'WeaponsConfig', {trait: 'weapon'}], ['trait', 'tool', 'ToolsConfig', {trait: 'tool'}]];
  for (const [kind, key, name, opts] of cases) {
    made.length = 0;
    assert.equal((await openConfig(actor, kind, key)).ok, true, kind);
    assert.deepEqual(made, [[name, {document: actor, ...opts}], [`${name}.render`, {force: true}]], kind);
  }
  assert.equal((await openConfig(actor, 'nonsense')).ok, false);
  delete globalThis.dnd5e.applications.actor.DeathConfig;
  assert.match((await openConfig(actor, 'death')).error, /no configuration window/);
  installGlobals({user: users.observer});
  made.length = 0;
  assert.equal((await openConfig(actor, 'ability', 'str')).ok, false, 'observers refused like on the standard sheet');
  assert.equal(made.length, 0);
  assert.deepEqual(Object.keys(CONFIGS).sort(), ['ability', 'armorClass', 'death', 'hitDice', 'hitPoints', 'initiative', 'movement', 'senses', 'skill', 'trait']);
});

test('the sheet marks stats for right-click and routes the context menu to the config window', async () => {
  installGlobals({user: users.owner});
  const made = installDnd5e();
  const {sheet, html} = await render();
  for (const re of [/agch-abil" data-config="ability" data-config-key="str"/, /agch-ac"[^>]*data-config="armorClass"/, /data-config="initiative"/, /data-config="movement"/, /data-config="hitDice"/]) assert.match(html, re);
  assert.match(html, /<li data-config="skill" data-config-key="ath"><button type="button" class="agch-row" data-action="roll-skill"/);
  assert.match(html, /<li data-config="ability" data-config-key="dex"><button type="button" class="agch-row" data-action="roll-save"/);
  assert.match(html, /data-config="senses"/); assert.match(html, /data-config="trait" data-config-key="languages"/);
  let prevented = false;
  const el = {dataset: {config: 'skill', configKey: 'ath'}};
  const target = {closest: sel => sel === '[data-config]' ? el : null};
  await sheet._onContextMenu({target, preventDefault() { prevented = true; }, stopPropagation() {}});
  assert.equal(prevented, true);
  assert.deepEqual(made[0], ['SkillToolConfig', {document: sheet.document, trait: 'skills', key: 'ath'}]);
  made.length = 0;
  await sheet._onContextMenu({target: {closest: sel => sel === '.agch-embed' ? {} : el}, preventDefault() {}, stopPropagation() {}});
  assert.equal(made.length, 0, 'embedded partner views keep their own right-click');
});

test('speeds: dnd5e 6 movement.speeds (jump included), hover flag; older flat data still reads', () => {
  installGlobals();
  const cfg = {movementTypes: {walk: {label: 'Speed'}, burrow: {label: 'Burrow'}, climb: {label: 'Climb'}, fly: {label: 'Fly'}, jump: {label: 'Jump', hidden: true}, swim: {label: 'Swim'}}};
  assert.deepEqual(speedsData({speeds: {walk: 30, climb: 15, jump: 10, fly: 0}, units: 'ft'}, cfg).map(s => [s.key, s.value]), [['walk', 30], ['climb', 15], ['jump', 10]]);
  assert.deepEqual(speedsData({walk: 25, swim: 10}, cfg).map(s => [s.key, s.value]), [['walk', 25], ['swim', 10]], 'pre-6.0 shape');
  const actor = makeActor({system: {attributes: {...makeActor().system.attributes, movement: {speeds: {walk: 30, fly: 60}, hover: true, units: 'ft'}}}});
  const h = headerData(actor);
  assert.deepEqual(h.speeds.map(s => s.key), ['walk', 'fly']); assert.equal(h.hover, true);
});

test('collapsible sections: client setting, safe when missing, remembered per key, pruned', async () => {
  installGlobals({settings: {}});
  assert.deepEqual(collapsedState(), {});
  globalThis.game.settings.get = () => { throw new Error('not registered'); };
  assert.equal(isCollapsed('overview:skills'), false, 'an unregistered setting just means open');
  installGlobals({settings: {collapsedSections: 'junk'}});
  assert.deepEqual(collapsedState(), {}, 'odd stored values are ignored');
  installGlobals({settings: {}});
  await setCollapsed('overview:skills', true);
  assert.equal(isCollapsed('overview:skills'), true);
  assert.match(sectionHtml('overview:skills', 'Skills', '<p>x</p>'), /aria-expanded="false"[\s\S]*data-sec-body="overview:skills" hidden>/);
  await setCollapsed('overview:skills', false);
  assert.deepEqual(game.settings.store.collapsedSections, {}, 'reopening removes the key');
  for (let i = 0; i < COLLAPSE_MAX + 5; i++) await setCollapsed(`container:i${i}`, true);
  const keys = Object.keys(game.settings.store.collapsedSections);
  assert.equal(keys.length, COLLAPSE_MAX); assert.equal(keys.includes('container:i0'), false, 'oldest dropped');
  assert.equal(sectionKey('container', 'a"b<c'), 'container:abc');
});

test('toggling a section flips the DOM without a re-render and saves', async () => {
  installGlobals({settings: {}});
  const body = {hidden: false}, attrs = {};
  const btn = {title: 'Collapse [TEST] Backpack', classList: {contains: () => true}, setAttribute: (k, v) => { attrs[k] = v; }};
  const root = {querySelectorAll: sel => sel.startsWith('[data-sec-body') ? [body] : [btn]};
  const {sheet} = await render();
  let renders = sheet.renders.length;
  await ACTIONS['section-toggle']({...sheet, element: root}, {dataset: {key: 'container:pack'}});
  assert.equal(body.hidden, true); assert.equal(attrs['aria-expanded'], 'false'); assert.equal(btn.title, 'Expand [TEST] Backpack');
  assert.equal(isCollapsed('container:pack'), true);
  assert.equal(sheet.renders.length, renders, 'no re-render');
  await toggleSection(root, 'container:pack');
  assert.equal(body.hidden, false); assert.equal(isCollapsed('container:pack'), false);
});

test('every heading and inventory container gets a collapse toggle; observers can fold too', async () => {
  installGlobals({user: users.observer, settings: {collapsedSections: {'container:pack': true}}});
  const items = [{id: 'pack', name: '[TEST] Backpack', type: 'container', system: {quantity: 1}}, {id: 'rope', name: '[TEST] Rope', type: 'loot', system: {quantity: 1, container: 'pack'}}];
  const {html: ov} = await render();
  for (const key of ['overview:skills', 'overview:saves', 'overview:passives', 'overview:proficiencies']) assert.match(ov, new RegExp(`data-action="section-toggle" data-key="${key}" data-ag-always`));
  assert.match(ov, /class="ag-list agch-zebra agch-skills"><li class="agch-zebra__head"/, 'zebra skills list with a column header');
  const {html: inv} = await render({actor: makeActor({items}), sheet: {tab: 'inventory'}});
  assert.match(inv, /data-key="inventory:container"/);
  assert.match(inv, /agch-sec__toggle--icon" data-action="section-toggle" data-key="container:pack" data-ag-always aria-expanded="false"/);
  assert.match(inv, /<li class="agch-contents" data-sec-body="container:pack" hidden>/, 'remembered collapsed');
});

test('paper doll: bracer slot where Other was, three trinkets, icons for empty slots, Other equipped list', async () => {
  installGlobals({user: users.owner});
  assert.deepEqual(RIGHT_SLOTS, ['mainhand', 'offhand', 'waist', 'feet', 'bracer']);
  assert.deepEqual(BOTTOM_SLOTS, ['ring1', 'ring2', 'trinket', 'trinket2', 'trinket3']);
  const items = [
    {id: 'br', name: '[TEST] Bracers of Defense', type: 'equipment', system: {equipped: true, type: {value: 'wondrous'}, rarity: 'rare'}},
    {id: 'gl', name: '[TEST] Gloves of Thievery', type: 'equipment', system: {equipped: true, type: {value: 'wondrous'}, rarity: 'uncommon'}},
    ...[1, 2, 3, 4].map(n => ({id: `t${n}`, name: `[TEST] Trinket ${n}`, type: 'equipment', system: {equipped: true, type: {value: 'trinket'}}})),
    {id: 'odd', name: '[TEST] Odd Stone', type: 'equipment', system: {equipped: true, type: {value: 'wondrous'}, rarity: 'artifact'}}];
  const actor = makeActor({items});
  assert.equal(naturalSlot(actor.items.get('br')), 'bracer'); assert.equal(naturalSlot(actor.items.get('gl')), 'hands');
  const l = equipmentLayout(actor), at = id => l.slots.find(s => s.id === id).item?.id ?? null;
  assert.equal(at('bracer'), 'br'); assert.equal(at('hands'), 'gl');
  assert.deepEqual([at('trinket'), at('trinket2'), at('trinket3')], ['t1', 't2', 't3']);
  assert.deepEqual(l.other.map(o => o.id), ['odd', 't4'], 'no slot limits: the rest is listed under Other equipped');
  assert.equal(equipChoices(makeActor({items: [{id: 'x', name: '[TEST] Lucky Coin', type: 'equipment', system: {equipped: false, type: {value: 'trinket'}}}]}), 'trinket3')[0].id, 'x');
  const {html} = await render({actor});
  assert.match(html, /data-slot="bracer" data-id="br" data-ag-always data-rarity="rare"/);
  assert.match(html, /class="agch-slot is-filled has-rarity" data-action="slot-open" data-slot="hands" data-id="gl" data-ag-always data-rarity="uncommon"/);
  assert.match(html, /data-slot="head"[^>]*title="Head: empty \(click to equip\)"><i class="fa-solid fa-hat-wizard agch-slot__icon"/);
  assert.match(html, /data-slot="waist"[^>]*><span class="agch-slot__empty">Waist<\/span>/, 'a word where no icon fits');
  assert.equal(Object.keys(SLOT_ICONS).includes('bracer'), false);
  assert.match(html, /agch-other__row has-rarity" data-rarity="artifact"/);
  assert.match(html, /data-key="doll:other"/);
  assert.doesNotMatch(html, /data-slot="other"/, 'the old overflow slot is gone');
  assert.equal(itemRow({system: {rarity: 'nonsense'}}).rarity, '', 'unknown rarity gets no colour');
});

test('Ashen Gate quick bar: module views jump to the sub-tab; HQ and Locations open their window; missing modules greyed for the GM, hidden for players', async () => {
  const calls = [];
  const mods = {
    'ashen-gate-profession-ledger': {active: true, api: {getProfessions: () => []}},
    'ashen-gate-headquarters': {active: true, api: {open: () => calls.push('hq.open')}}
  };
  installGlobals({user: users.gm, modules: mods});
  const bar = agBarHtml();
  assert.match(bar, /data-action="ag-jump" data-partner="ashen-gate-profession-ledger" data-ag-always title="Professions \(show here\)"/);
  assert.match(bar, /data-action="partner-open" data-partner="ashen-gate-headquarters" data-ag-always title="Open Headquarters"/);
  assert.match(bar, /is-missing" data-action="partner-open" data-partner="ashen-gate-locations" disabled title="Locations \(module not active\)"/);
  for (const label of ['Skill Trees', 'Renown', 'Quests']) assert.match(bar, new RegExp(`${label} \\(module not active\\)`));
  const {sheet, html} = await render();
  assert.match(html, /<div class="agch-railcol"><nav class="agch-rail"[\s\S]*<\/nav><nav class="agch-rail agch-agbar"/, 'a separate bar under the tab rail');
  await ACTIONS['ag-jump'](sheet, {dataset: {partner: 'ashen-gate-profession-ledger'}});
  assert.equal(sheet.tab, 'ashen-gate'); assert.equal(sheet.agTab, 'ashen-gate-profession-ledger');
  assert.match(await sheet._renderHTML(), /agch-agbar__btn active" data-action="ag-jump" data-partner="ashen-gate-profession-ledger"/);
  await ACTIONS['partner-open'](sheet, {dataset: {partner: 'ashen-gate-headquarters'}});
  assert.deepEqual(calls, ['hq.open']);
  installGlobals({user: users.owner, modules: mods, settings: {playerVisibility: {base: false}}});
  const r = await ACTIONS['partner-open'](sheet, {dataset: {partner: 'ashen-gate-headquarters'}});
  assert.equal(r.ok, false, 'a part the GM hid is refused for players in the action, not only by hiding the button');
  assert.deepEqual(calls, ['hq.open']);
  installGlobals({user: users.owner, modules: {}});
  assert.equal(agBarHtml(), '', 'players never see buttons for missing modules');
});

test('art of any shape is never stretched: icons and portraits crop to fill (top focus), the doll art pane keeps the whole image', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const rule = sel => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) => s.split(',').some(x => x.trim() === `.ag-character-hub ${sel}`)).map(([, , body]) => body).join(';');
  for (const sel of ['.agch-portrait', '.agch-slot img', '.agch-item__img', '.agch-other__row img', '.agch-companion__head img', '.agch-chip img']) {
    assert.match(rule(sel), /object-fit: cover/, sel); assert.match(rule(sel), /object-position: center top/, sel);
  }
  assert.match(rule('.agch-doll__art .agch-doll__fg'), /object-fit: contain; object-position: center top/);
  assert.match(rule('.agch-doll__art .agch-doll__bg'), /object-fit: cover/);
  assert.match(rule('.agch-slot img'), /position: absolute; inset: 0/, 'tall art cannot spill out of a slot');
});
