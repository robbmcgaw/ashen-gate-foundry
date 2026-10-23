/** Registration, header write-through, permissions, roll delegation and the native fallback (mocked Foundry; logic only). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {registerHubSheet, createApi, actorOf} from '../scripts/main.mjs';
import * as act from '../scripts/actions.mjs';
import {headerData, conditionsData, skillsData, abilitiesData, overviewData} from '../scripts/data.mjs';
import {shellHtml} from '../scripts/views.mjs';
import {openNativeSheet} from '../scripts/native.mjs';
import {VERSION, MODULE_ID} from '../scripts/constants.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url)));
const hubClass = () => { const calls = []; const env = {Actor: {}, foundry: {applications: {sheets: {ActorSheetV2: FakeActorSheetV2}, apps: {DocumentSheetConfig: {registerSheet: (...a) => calls.push(a)}}}}}; return {Cls: registerHubSheet(env), calls, env}; };

test('version constant matches module.json', () => assert.equal(VERSION, manifest.version));

test('registers an alternative character sheet, never the default', () => {
  installGlobals();
  const {Cls, calls, env} = hubClass();
  assert.equal(calls.length, 1);
  const [docClass, scope, sheet, opts] = calls[0];
  assert.equal(docClass, env.Actor);
  assert.equal(scope, MODULE_ID);
  assert.equal(sheet, Cls);
  assert.deepEqual(opts, {types: ['character'], makeDefault: false, label: 'Ashen Gate Character Hub'});
});

test('missing ActorSheetV2 does not throw, it just skips registration', () => {
  const orig = console.error; console.error = () => {};
  assert.equal(registerHubSheet({foundry: {}}), null);
  console.error = orig;
});

test('header data reads the live Actor (no copies)', () => {
  installGlobals();
  const actor = makeActor({items: [{id: 'c1', name: 'Fighter', type: 'class', system: {levels: 3, identifier: 'fighter'}}], statuses: ['prone']});
  actor.classes.fighter.subclass = {name: 'Champion'};
  const h = headerData(actor);
  assert.equal(h.hp.value, 20); assert.equal(h.hp.temp, 5); assert.equal(h.ac, 15); assert.equal(h.init, 3);
  assert.deepEqual(h.classes, [{name: 'Fighter', level: 3, subclass: 'Champion'}]);
  assert.equal(h.species, '[TEST] Elf');
  assert.deepEqual(h.speeds.map(s => s.key), ['walk'], 'zero speeds hidden');
  assert.deepEqual(h.resources.map(r => r.label), ['Ki'], 'unused resources hidden');
  assert.deepEqual(h.hd, {value: 2, max: 3});
  actor.system.attributes.hp.value = 7;
  assert.equal(headerData(actor).hp.value, 7, 'next render sees the change');
  const conds = conditionsData(actor);
  assert.deepEqual(conds.map(c => c.id), ['blinded', 'poisoned', 'prone'], 'exhaustion and pseudo conditions excluded');
  assert.equal(conds.find(c => c.id === 'prone').active, true);
});

test('abilities and skills: totals, saves and proficiency come from dnd5e derived data', () => {
  installGlobals();
  const actor = makeActor();
  const a = abilitiesData(actor);
  assert.deepEqual(a.map(x => [x.key, x.mod, x.save, x.saveProficient]), [['str', 2, 4, true], ['dex', 3, 3, false]]);
  const s = skillsData(actor);
  assert.deepEqual(s.map(x => [x.key, x.total, x.prof, x.profLabel]), [['ath', 4, 1, 'Proficient'], ['ste', 7, 2, 'Expertise']]);
});

test('HP damage uses temp first; heal caps at effective max; writes through actor.update', async () => {
  assert.deepEqual(act.hpAfter({value: 20, temp: 5, effectiveMax: 24}, -8), {value: 17, temp: 0});
  assert.deepEqual(act.hpAfter({value: 2, temp: 0, effectiveMax: 24}, -10), {value: 0, temp: 0});
  assert.deepEqual(act.hpAfter({value: 20, temp: 0, effectiveMax: 24}, 10), {value: 24, temp: 0});
  installGlobals({user: users.owner});
  const actor = makeActor();
  assert.equal((await act.adjustHp(actor, -3)).ok, true);
  assert.deepEqual(actor.calls[0], ['update', {'system.attributes.hp.value': 20, 'system.attributes.hp.temp': 2}]);
  assert.equal((await act.setHp(actor, 'value', '12')).ok, true);
  assert.deepEqual(actor.calls[1], ['update', {'system.attributes.hp.value': 12}]);
  assert.equal((await act.setHp(actor, 'max', '99')).ok, false, 'only known fields');
  assert.equal((await act.setHp(actor, 'value', 'abc')).ok, false, 'numbers only');
});

test('observers are refused in the action layer, not just by hidden buttons', async () => {
  installGlobals({user: users.observer});
  const actor = makeActor();
  for (const r of [await act.adjustHp(actor, -1), await act.setHp(actor, 'temp', 3), await act.toggleCondition(actor, 'prone'),
    await act.toggleInspiration(actor), await act.changeExhaustion(actor, 1), await act.rollSkill(actor, 'ath'), await act.rollSavingThrow(actor, 'str')]) {
    assert.equal(r.ok, false); assert.match(r.error, /don't own/);
  }
  assert.equal(actor.calls.length, 0, 'nothing reached the Actor');
});

test('GM may act on any character', async () => {
  installGlobals({user: users.gm});
  const actor = makeActor({perms: {}});
  assert.equal((await act.toggleInspiration(actor)).ok, true);
  assert.deepEqual(actor.calls[0], ['update', {'system.attributes.inspiration': true}]);
});

test('rolls, conditions and exhaustion delegate to the dnd5e methods with the click event', async () => {
  installGlobals();
  const actor = makeActor(), event = {shiftKey: true};
  await act.rollSkill(actor, 'ste', event);
  await act.rollAbilityCheck(actor, 'dex', event);
  await act.rollSavingThrow(actor, 'str', event);
  await act.rollInitiative(actor, event);
  await act.toggleCondition(actor, 'blinded');
  await act.changeExhaustion(actor, -1);
  assert.deepEqual(actor.calls, [
    ['rollSkill', {skill: 'ste', event}], ['rollAbilityCheck', {ability: 'dex', event}], ['rollSavingThrow', {ability: 'str', event}],
    ['rollInitiativeDialog', {event}], ['toggleStatusEffect', 'blinded', undefined], ['toggleStatusEffect', 'exhaustion', {levels: -1}]
  ]);
});

test('a missing system method gives a clear refusal, not a crash', async () => {
  installGlobals();
  const actor = makeActor(); delete actor.rollSkill;
  const orig = console.error; console.error = () => {};
  const r = await act.rollSkill(actor, 'ath');
  console.error = orig;
  assert.equal(r.ok, false); assert.match(r.error, /no rollSkill/);
});

test('sheet renders header, tabs and Open native sheet; observers get a view-only notice and disabled controls', async () => {
  installGlobals({user: users.owner, modules: {[MODULE_ID]: {version: VERSION}}});
  const {Cls} = hubClass();
  const sheet = new Cls({document: makeActor()});
  const html = await sheet._renderHTML();
  assert.match(html, /<h1 class="agch-head__name">\[TEST\] Hero<\/h1>/, '0.37.0: the name heads the Hub; the brand is the window title');
  assert.equal(sheet.title, 'Ashen Gate | Character Hub — [TEST] Hero');
  assert.match(html, /data-action="more-menu"/);
  sheet.menu = 'more';
  assert.match(await sheet._renderHTML(), /agch-moremenu[\s\S]*data-action="open-native"/, '0.33.0: Open native sheet is in the ⋯ menu');
  assert.match(html, /data-action="help"/);
  assert.match(html, /data-action="roll-skill" data-skill="ste"/);
  assert.doesNotMatch(html, /View only/);
  assert.match(html, /class="agch-split"><aside class="agch-char"[\s\S]*<section class="agch-pane">[\s\S]*<nav class="ag-siderail agch-rail"/, 'character left, content, then the tab rail');
  assert.match(html, /data-action="roll-check" data-ability="str"/);
  assert.match(html, /data-action="roll-save" data-ability="str"/);
  assert.doesNotMatch(html, /data-edit="hp\./, 'no HP text inputs; the bar opens the editor');
  assert.match(html, /agch-hp__text">20 \/ 24 HP <span class="agch-hp__temptext">\(\+5 TEMP\)<\/span>/);
  assert.match(html, /data-action="hp-damage"[\s\S]*data-hp-amount[\s\S]*data-action="hp-heal"/, 'minus, amount, plus');
  assert.match(html, /agch-hp__row">[\s\S]*Hit Dice<\/span> <b>2 \/ 3<\/b>[\s\S]*fa-skull[\s\S]*Exhaustion<\/span>[\s\S]*<b>1<\/b>/, 'hit dice and exhaustion (skull, − n +) sit under the HP bar');
  assert.match(html, /agch-ac__value">15</);
  assert.match(html, /id="agch-tabpanel-tab-overview" data-action="hub-tab" data-tab="overview" data-ag-always aria-selected="true" aria-controls="agch-tabpanel" tabindex="0" class="agch-rail__tab active" aria-label="Overview" data-tooltip="Overview" data-tooltip-direction="LEFT"><i class="fa-solid fa-user" aria-hidden="true"><\/i><span class="agch-rail__label" aria-hidden="true">Overview<\/span>/, 'CH-01: the name shows beside the icon');
  assert.match(html, /data-tab="combat" data-ag-always aria-selected="false" aria-controls="agch-tabpanel" tabindex="-1"/, 'CH-20: one Tab stop, every tab controls the panel');
  assert.match(html, /<div class="agch-body" id="agch-tabpanel" role="tabpanel" aria-labelledby="agch-tabpanel-tab-overview">/, "labelled by the open tab, so bindTablist leaves it");
  assert.match(html, /agch-pane__title"><i class="fa-solid fa-user" aria-hidden="true"><\/i> Overview/);
  assert.doesNotMatch(html, /data-tab="rest"/, 'rests moved to the character column');
  assert.match(html, /data-action="rest" data-type="short"/);
  assert.doesNotMatch(html, /data-opacity|type="range"/, 'no opacity slider (removed in 0.29.0)');
  installGlobals({user: users.observer});
  const obs = new Cls({document: makeActor()});
  const view = await obs._renderHTML();
  assert.match(view, /View only/);
  assert.match(view, /data-action="roll-skill" data-skill="ath" disabled/);
  assert.match(view, /data-action="hp-damage"[^>]*disabled/);
  assert.match(view, /data-action="roll-check" data-ability="str"[^>]*disabled/);
  obs.menu = 'more';
  assert.match(await obs._renderHTML(), /data-action="open-native"[^>]*data-ag-always/, 'native sheet stays clickable');
  assert.match(view, /data-action="more-menu"[^>]*data-ag-always/, 'and so does the ⋯ menu');
});

test('limited viewers see only portrait and name', () => {
  installGlobals({user: users.observer});
  const actor = makeActor(); actor.limited = true;
  const html = shellHtml({actor, limited: true, editable: false, tab: 'character'});
  assert.match(html, /limited access/);
  assert.doesNotMatch(html, /Athletics|HP/);
});

test('a render failure shows the error with Retry and the native sheet button, never a blank window', async () => {
  installGlobals();
  const {Cls} = hubClass();
  const actor = makeActor(); Object.defineProperty(actor, 'classes', {get() { throw new Error('boom'); }});
  const orig = console.error; console.error = () => {};
  const html = await new Cls({document: actor})._renderHTML();
  console.error = orig;
  assert.match(html, /could not be drawn/);
  assert.match(html, /boom/);
  assert.match(html, /data-action="retry"/);
  assert.match(html, /data-action="open-native"/);
});

test('dispatch reports refusals as a warning', async () => {
  const notes = installGlobals({user: users.observer});
  const {Cls} = hubClass();
  const sheet = new Cls({document: makeActor()});
  await sheet.dispatch('inspiration', {dataset: {}}, {});
  assert.equal(notes[0][0], 'warn');
  await sheet.dispatch('hub-tab', {dataset: {tab: 'character'}}, {});
  assert.equal(sheet.renders.length, 1, 'tabs work for observers');
});

test('Open native sheet uses dnd5e CharacterActorSheet specifically and reuses an open one', async () => {
  installGlobals();
  const actor = makeActor();
  assert.equal((await openNativeSheet(actor)).ok, false, 'clear error without dnd5e');
  class CharacterActorSheet { constructor(o) { this.document = o.document; this.renders = 0; } async render() { this.renders++; } }
  globalThis.dnd5e = {applications: {actor: {CharacterActorSheet}}};
  const instances = new Map();
  globalThis.foundry = {applications: {instances}};
  const first = await openNativeSheet(actor);
  assert.equal(first.ok, true);
  assert.ok(first.result instanceof CharacterActorSheet);
  instances.set('x', first.result);
  const second = await openNativeSheet(actor);
  assert.equal(second.result, first.result);
  assert.equal(first.result.renders, 2);
  delete globalThis.dnd5e; delete globalThis.foundry;
});

test('API open refuses non-characters and unseen actors', async () => {
  installGlobals({user: users.observer});
  hubClass();
  const api = createApi();
  assert.equal((await api.open({type: 'npc'})).ok, false);
  assert.equal((await api.open(makeActor({perms: {}}))).ok, false);
});

test('actorOf finds the Actor behind items and item effects', () => {
  const actor = {documentName: 'Actor'};
  const item = {documentName: 'Item', parent: actor};
  assert.equal(actorOf(actor), actor);
  assert.equal(actorOf(item), actor);
  assert.equal(actorOf({documentName: 'ActiveEffect', parent: item}), actor);
  assert.equal(actorOf({documentName: 'Item', parent: null}), null);
});

test('overview data: passives, senses and proficiency labels from dnd5e config, with fallbacks', () => {
  installGlobals();
  CONFIG.DND5E.skills.prc = {label: 'Perception'};
  CONFIG.DND5E.armorProficiencies = {lgt: 'Light Armor'};
  CONFIG.DND5E.languages = {standard: {label: 'Standard', children: {common: 'Common'}}};
  const actor = makeActor({system: {
    skills: {prc: {ability: 'wis', total: 2, passive: 12, proficient: 0}},
    traits: {armorProf: {value: new Set(['lgt']), custom: ''}, weaponProf: {value: new Set(['sim'])}, languages: {value: new Set(['common', 'druidic']), custom: '[TEST] Ashtongue'}},
    tools: {smith: {}}}});
  actor.system.attributes.senses = {darkvision: 60, units: 'ft', special: ''};
  const o = overviewData(actor);
  assert.deepEqual(o.passives, [{key: 'prc', label: 'Perception', value: 12}]);
  assert.deepEqual(o.senses, ['Darkvision 60 ft']);
  assert.deepEqual(Object.fromEntries(o.proficiencies.map(p => [p.label, p.list])),
    {Armor: ['Light Armor'], Weapons: ['Sim'], Tools: ['Smith'], Languages: ['Common', 'Druidic', '[TEST] Ashtongue']});
  actor.system.attributes.senses = {ranges: {darkvision: 120}, units: 'ft'};
  assert.deepEqual(overviewData(actor).senses, ['Darkvision 120 ft'], 'dnd5e ranges shape');
});

test('conditions carry their status icon when dnd5e provides one', () => {
  installGlobals();
  CONFIG.DND5E.conditionTypes.prone.img = 'prone.svg';
  const c = conditionsData(makeActor());
  assert.equal(c.find(x => x.id === 'prone').img, 'prone.svg');
  assert.equal(c.find(x => x.id === 'blinded').img, '');
});

test('conditions strip (0.34.0): active ones as chips with ✕, every condition in the list; observers see it disabled', async () => {
  installGlobals();
  const {Cls} = hubClass();
  const sheet = new Cls({document: makeActor({statuses: ['prone']})});
  const html = await sheet._renderHTML();
  assert.doesNotMatch(html, /data-action="condition"|data-action="cond-add"|agch-conds__list/, 'the old Conditions box is gone');
  assert.match(html, /agch-hotbar--conds[\s\S]*Prone<button type="button" class="agch-placed__off" data-action="cond-remove" data-uuid="Actor\.actor1" data-status="prone"/);
  assert.match(html, /<option value="blinded">Blinded<\/option><option value="poisoned">Poisoned<\/option><option value="prone">Prone<\/option>/);
  installGlobals({user: users.observer});
  const view = await new Cls({document: makeActor({statuses: ['prone']})})._renderHTML();
  assert.doesNotMatch(view, /data-action="cond-remove"/, 'observers cannot take one off');
  assert.match(view, /data-action="cond-apply"[^>]*disabled/);
  assert.match(view, /data-edit="cond-pick" aria-label="Condition" disabled/);
});

test('window opacity removed (0.29.0): an old saved value is ignored, never read, never an error', async () => {
  installGlobals({settings: {windowOpacity: 40}});
  const {Cls} = hubClass();
  const sheet = new Cls({document: makeActor()});
  assert.equal(sheet.applyOpacity, undefined, 'no opacity code left on the sheet');
  const props = {};
  sheet.element = {style: {setProperty: (k, v) => { props[k] = v; }}, querySelector: () => null};
  const html = await sheet._renderHTML();
  assert.doesNotMatch(html, /data-opacity|agch-opacity/);
  sheet._replaceHTML(html, {innerHTML: '', querySelector: () => null, addEventListener: () => {}});
  assert.deepEqual(props, {}, 'nothing sets a window opacity');
  assert.equal(game.settings.store.windowOpacity, 40, 'the old value is left alone (not rewritten)');
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /ag-window-opacity|agch-alpha|agch-opacity/, 'backgrounds are solid');
  const main = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /register\(MODULE_ID, 'windowOpacity'/, 'the setting is no longer registered');
});
