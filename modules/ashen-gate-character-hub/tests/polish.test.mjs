/** 0.10.0 sheet polish: HP bar and editor, configure windows, collapsible sections, slots, rarity, speeds, quick bar (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import * as act from '../scripts/actions.mjs';
import {hpBar, placeholder, BOTTOM_SLOTS, RIGHT_SLOTS} from '../scripts/character.mjs';
import {SLOT_PLACEHOLDERS, placeholderKind} from '../scripts/constants.mjs';
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
  b = hpBar({value: 10, temp: 0, max: 20, tempmax: -5, effectiveMax: 15});
  assert.equal(b.boost, 0, 'a negative adjustment draws no blue part');
  assert.equal(b.text, '10 / 15 HP'); assert.equal(b.lostText, '(−5 MAX)');
  assert.equal(b.fill, 50, 'the bar keeps the normal max as its length');
  assert.equal(b.lost, 25); assert.equal(b.lostLeft, 75, 'sickly-green lost part at the right end');
  b = hpBar({value: 14, temp: 4, max: 20, tempmax: -5, effectiveMax: 15});
  assert.equal(b.tempLeft + b.temp, 75, 'temp HP is kept out of the lost part');
  assert.equal(hpBar({value: 10, temp: 0, max: 20, tempmax: 0, effectiveMax: 20}).lostText, '');
});

test('HP bar renders the lost part and "(−X MAX)" for a negative max adjustment', async () => {
  installGlobals({user: users.owner});
  const base = makeActor().system.attributes;
  const {html} = await render({actor: makeActor({system: {attributes: {...base, hp: {value: 10, temp: 0, max: 20, tempmax: -5, effectiveMax: 15}}}})});
  assert.match(html, /<span class="agch-hp__lost" style="left:75.0%;width:25.0%"/);
  assert.match(html, /10 \/ 15 HP <span class="agch-hp__losttext">\(−5 MAX\)<\/span>/);
});

test('empty-slot placeholders: one table, Font Awesome classes, Foundry image paths or a word', () => {
  for (const id of [...RIGHT_SLOTS, ...BOTTOM_SLOTS, 'head', 'neck', 'back', 'body', 'hands']) assert.ok(SLOT_PLACEHOLDERS[id], id);
  assert.equal(placeholderKind('fa-solid fa-ring'), 'icon');
  assert.equal(placeholderKind('icons/equipment/finger/ring-band-gold.webp'), 'image');
  assert.equal(placeholderKind('Waist'), 'text');
  const orig = SLOT_PLACEHOLDERS.head;
  SLOT_PLACEHOLDERS.head = 'icons/equipment/head/helm-barbute-steel.webp';
  assert.equal(placeholder('head'), '<img class="agch-slot__ph" src="/icons/equipment/head/helm-barbute-steel.webp" alt="">', 'root-relative (0.28.1)');
  SLOT_PLACEHOLDERS.head = 'Hat & <Hood>';
  assert.equal(placeholder('head'), '<span class="agch-slot__empty">Hat &amp; &lt;Hood&gt;</span>', 'text is escaped');
  SLOT_PLACEHOLDERS.head = orig;
  assert.equal(placeholder('head'), '<i class="fa-solid fa-hat-wizard agch-slot__icon" aria-hidden="true"></i>', 'current icons are the defaults');
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
  assert.match(html, /data-hp-bar data-band="high" tabindex="0" data-config="hitPoints"/);
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
  assert.deepEqual(h.walk, {key: 'walk', label: 'Walk', value: 30, units: 'ft'});
});

test('Speed tile (0.28.1): shows walk, 0 included; dnd5e 6 derived jump never stands in for it unlabelled', async () => {
  installGlobals();
  globalThis.CONFIG.DND5E.movementTypes = {walk: 'Walk', fly: 'Fly', jump: 'Jump'};
  const {characterPanelHtml} = await import('../scripts/character.mjs');
  const mv = movement => makeActor({system: {attributes: {...makeActor().system.attributes, movement}}});
  const zero = mv({speeds: {walk: 0, jump: 5}, units: 'ft'});
  assert.deepEqual(headerData(zero).walk, {key: 'walk', label: 'Walk', value: 0, units: 'ft'});
  const html = characterPanelHtml({actor: zero, editable: true});
  assert.match(html, /<span class="agch-tile__value">0 ft<\/span>/, 'walk 0 shows 0 ft');
  assert.doesNotMatch(html, /<span class="agch-tile__value">5 ft<\/span>/, 'the jump speed is not the headline');
  assert.match(html, /<span class="agch-tile__more">Jump 5<\/span>/, 'jump listed with its label');
  assert.match(characterPanelHtml({actor: mv({speeds: {walk: 30, fly: 60}, units: 'ft'}), editable: true}), /<span class="agch-tile__value">30 ft<\/span><span class="agch-tile__more">Fly 60<\/span>/, 'real characters unchanged');
  assert.match(characterPanelHtml({actor: mv({walk: 25, units: 'ft'}), editable: true}), /<span class="agch-tile__value">25 ft<\/span>/, 'pre-6.0 shape');
  const none = characterPanelHtml({actor: mv({speeds: {fly: 40}, units: 'ft'}), editable: true});
  assert.match(none, /<span class="agch-tile__value">—<\/span>/, 'no walk value at all: a dash, not another speed');
  assert.match(none, /<span class="agch-tile__more">Fly 40<\/span>/);
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
  assert.match(html, /class="ag-slot agch-slot is-filled has-rarity" data-action="slot-open" data-slot="hands" data-id="gl" data-ag-always data-rarity="uncommon"/);
  assert.match(html, /data-slot="head"[^>]*data-tooltip="Head: empty \(click to equip\)"><i class="fa-solid fa-hat-wizard agch-slot__icon"/);
  assert.match(html, /data-slot="waist"[^>]*><span class="agch-slot__mask" style="--agch-mask: url\('\/modules\/ashen-gate-character-hub\/assets\/slots\/waist-white\.png'\)"/, 'Robb\'s waist silhouette (0.17.0), root-relative URL (0.28.1)');
  assert.match(html, /agch-other__row has-rarity ag-rarity-edge" data-rarity="artifact"/);
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
  assert.match(bar, /data-action="ag-jump" data-partner="ashen-gate-profession-ledger" data-ag-always aria-label="Professions \(show here\)" data-tooltip="Professions \(show here\)"/);
  assert.match(bar, /data-action="partner-open" data-partner="ashen-gate-headquarters" data-ag-always aria-label="Open Headquarters" data-tooltip="Open Headquarters"/);
  assert.match(bar, /is-missing" data-action="partner-open" data-partner="ashen-gate-locations" disabled aria-label="Locations \(module not active\)" data-tooltip="Locations \(module not active\)"/);
  for (const label of ['Skill Trees', 'Renown', 'Quests']) assert.match(bar, new RegExp(`${label} \\(module not active\\)`));
  const {sheet, html} = await render();
  assert.match(html, /<div class="agch-railcol"><nav class="ag-siderail agch-rail" role="tablist"[\s\S]*?<\/nav><\/div>/, 'the right rail holds only the sections (0.29.0)');
  assert.doesNotMatch(html.match(/<div class="agch-railcol">[\s\S]*?<\/nav><\/div>/)[0], /agch-agbar/);
  assert.match(html, /<div class="agch-hotbars">[\s\S]*<nav class="agch-agbar" aria-label="Ashen Gate modules">[\s\S]*<\/nav><\/div>$/, 'a thin bar along the bottom edge, after the hotbars (0.29.0)');
  assert.match(bar, /<button type="button" class="ag-btn ag-btn--ghost ag-btn--icon agch-agbar__btn"[^>]*data-tooltip-direction="UP"/, 'kit buttons, Foundry tooltips above');
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
  const rule = sel => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) => s.split(',').some(x => x.trim() === `.agch-app ${sel}`)).map(([, , body]) => body).join(';');
  for (const sel of ['.agch-portrait', '.agch-slot img', '.agch-companion__head img', '.agch-chip img']) {
    assert.match(rule(sel), /object-fit: cover/, sel); assert.match(rule(sel), /object-position: center top/, sel);
  }
  assert.match(rule('.agch-doll__art .agch-doll__fg'), /object-fit: contain; object-position: center top/);
  assert.match(rule('.agch-doll__art .agch-doll__bg'), /object-fit: cover/);
  assert.match(rule('.agch-slot img'), /position: absolute; inset: 0/, 'tall art cannot spill out of a slot');
});

test('list item icons are a fixed square that never shrinks and show the whole icon (0.15.0)', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
  const rules = sel => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, s]) => s.split(',').some(x => x.trim() === `.agch-app ${sel}`)).map(([, , b]) => b);
  const last = (sel, prop) => { let v = null; for (const b of rules(sel)) for (const d of b.split(';')) { const [k, ...r] = d.split(':'); if (k.trim() === prop) v = r.join(':').trim(); } return v; };
  for (const sel of ['.agch-item__img', '.agch-other__row img']) {
    assert.equal(last(sel, 'object-fit'), 'contain', `${sel}: whole icon, no clipping`);
    assert.equal(last(sel, 'aspect-ratio'), '1 / 1', sel);
    assert.equal(last(sel, 'flex'), '0 0 var(--agch-icon)', `${sel}: never shrinks in a flex row`);
    for (const p of ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height']) assert.equal(last(sel, p), 'var(--agch-icon)', `${sel} ${p}`);
  }
  assert.match(css, /\.agch-app \.agch-cards \{ grid-template-columns: minmax\(24px, max-content\) 32px minmax\(8rem, 1fr\)/, 'the icon column is a fixed 32px; the name column shrinks');
  assert.equal(last('.agch-slot img', 'object-fit'), 'cover', 'slot art keeps its own rule');
});

/** Foundry's getRoute (leading slash, optional route prefix such as a sub-path) installed for the duration of fn. */
function withRoute(prefix, fn) {
  const prev = globalThis.foundry;
  globalThis.foundry = {utils: {getRoute: path => `/${[prefix, String(path).replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/')}`}};
  try { return fn(); } finally { if (prev === undefined) delete globalThis.foundry; else globalThis.foundry = prev; }
}

test('slot URLs (0.28.1): every image and silhouette placeholder is root-relative, through getRoute when Foundry has it', async () => {
  const {SLOT_PLACEHOLDERS, placeholderKind, assetUrl} = await import('../scripts/constants.mjs');
  const {placeholder} = await import('../scripts/character.mjs');
  const urls = () => Object.keys(SLOT_PLACEHOLDERS).filter(id => ['image', 'silhouette'].includes(placeholderKind(SLOT_PLACEHOLDERS[id])))
    .map(id => [id, placeholder(id).match(/url\('([^']+)'\)|src="([^"]+)"/)]).map(([id, m]) => [id, m?.[1] ?? m?.[2]]);
  assert.ok(urls().length >= 3, 'cloak, waist and bracers at least');
  for (const prefix of [null, '', 'forge-world']) {
    const check = () => { for (const [id, u] of urls()) assert.match(u, prefix ? new RegExp(`^/${prefix}/(?!/)`) : /^\/(?!\/)/, `${id}: ${u} is not relative`); };
    if (prefix === null) check(); else withRoute(prefix, check);
  }
  assert.equal(withRoute('', () => assetUrl('modules/x/a.png')), '/modules/x/a.png');
  assert.equal(assetUrl('/already/rooted.png'), '/already/rooted.png');
  assert.equal(assetUrl('https://example.test/a.png'), 'https://example.test/a.png');
  assert.equal(assetUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(withRoute('p', () => assetUrl('icons/equipment/head/helm.webp')), '/p/icons/equipment/head/helm.webp', 'core icons too');
  const prev = globalThis.foundry; globalThis.foundry = {utils: {getRoute: () => { throw new Error('boom'); }}};
  try { assert.equal(assetUrl('modules/x/a.png'), '/modules/x/a.png', 'a failing getRoute falls back'); } finally { if (prev === undefined) delete globalThis.foundry; else globalThis.foundry = prev; }
});

test('slot silhouettes (0.17.0): cloak, waist and bracers files exist in the module, the table points to them, drawn as tinted masks', async () => {
  const fs = await import('node:fs');
  const {SLOT_PLACEHOLDERS, placeholderKind} = await import('../scripts/constants.mjs');
  const {placeholder} = await import('../scripts/character.mjs');
  const want = {back: 'cloak-white.png', waist: 'waist-white.png', bracer: 'bracers-white.png'};
  for (const [slot, file] of Object.entries(want)) {
    const path = `modules/ashen-gate-character-hub/assets/slots/${file}`;
    assert.equal(SLOT_PLACEHOLDERS[slot], path, slot);
    assert.ok(fs.existsSync(new URL(`../assets/slots/${file}`, import.meta.url)), `${file} is in the module (ships in the release zip)`);
    const head = fs.readFileSync(new URL(`../assets/slots/${file}`, import.meta.url)).subarray(0, 8);
    assert.deepEqual([...head], [137, 80, 78, 71, 13, 10, 26, 10], `${file} is a PNG`);
    assert.equal(placeholderKind(path), 'silhouette');
    assert.equal(placeholder(slot), `<span class="agch-slot__mask" style="--agch-mask: url('/${path}')" aria-hidden="true"></span>`, 'root-relative without Foundry (0.28.1)');
    withRoute('game', () => assert.equal(placeholder(slot), `<span class="agch-slot__mask" style="--agch-mask: url('/game/${path}')" aria-hidden="true"></span>`, 'built with foundry.utils.getRoute (0.28.1)'));
  }
  assert.equal(placeholderKind('icons/equipment/head/helm.webp'), 'image', 'other images are drawn as they are');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.match(css, /\.agch-slot__mask \{[^}]*background-color: var\(--ag-muted\); opacity: \.55;[^}]*mask: var\(--agch-mask\)/, 'tinted with the theme colour, same faintness as the icons');
});
