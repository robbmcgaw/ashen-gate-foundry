/**
 * 0.38.0: Journey | Biography sub-tabs. The Biography mirrors dnd5e 6.0.6's Biography page (system.details), owners and
 * the GM edit it, observers see the public parts only, limited viewers nothing; saves go through actor.update with only
 * the changed fields. Also: no "alpha" / "beta" style labels in anything the Hub renders. Mocked Foundry: this proves the
 * logic and the markup, not the live Foundry UI (the markup was also rendered in Chromium at about 900 and 420 px).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS, bioGuard} from '../scripts/sheet.mjs';
import * as bio from '../scripts/biography.mjs';
import {journeyTab, biographyPanel} from '../scripts/journey-views.mjs';
import {TABS, shellHtml} from '../scripts/views.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {guardDirty} from '../scripts/ag-dialogs.mjs';
import {VERSION} from '../scripts/constants.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const Hub = createHubSheetClass(FakeActorSheetV2);
const PRIVATE = '[TEST] Private backstory <strong>bold</strong>';
const PUBLIC = '<p>[TEST] Known in town</p><section class="secret" id="s1"><p>[TEST] Public secret</p></section>';
const details = (extra = {}) => ({
  level: 3, race: {name: '[TEST] Elf'}, alignment: '[TEST] Neutral', ideal: '[TEST] Ideal', bond: '[TEST] Bond', flaw: '[TEST] Flaw',
  biography: {value: PRIVATE, public: PUBLIC}, appearance: '[TEST] Tall\nScarred', trait: '[TEST] Trait',
  gender: '[TEST] Gender', eyes: '[TEST] Grey', height: '[TEST] 6 ft', faith: '[TEST] Faith', hair: '[TEST] Black', skin: '[TEST] Pale', age: '[TEST] 30', weight: '[TEST] 180 lb', ...extra
});
/** A character with the dnd5e Biography fields; `limitedFor` makes that user's view limited (Foundry's actor.limited). */
function hero({perms, extra, limitedFor = null} = {}) {
  const actor = makeActor({perms, system: {details: details(extra)}});
  Object.defineProperty(actor, 'limited', {get: () => game.user?.id === limitedFor});
  return actor;
}
const memory = () => { const m = new Map(); globalThis.localStorage = {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; return m; };
function setup(user = users.owner) {
  installGlobals({user, modules: {'ashen-gate-character-hub': {active: true, version: VERSION}}});
  globalThis.document = {documentElement: {dataset: {}}};
  game.user.targets = new Set();
  delete globalThis.customElements;
  memory();
}
function openBio(user = users.owner, actor = hero()) {
  setup(user);
  const sheet = new Hub({document: actor});
  sheet.tab = 'journey'; sheet.journeyView = 'biography';
  sheet.render = async () => sheet;
  return {sheet, actor};
}
const text = html => html.replace(/<[^>]+>/g, ' ');
const updates = actor => actor.calls.filter(c => c[0] === 'update');

test('the fields are dnd5e 6.0.6\'s own (system.details), and a field shows only when the Actor has it', () => {
  assert.deepEqual(bio.RICH.map(f => f[0]), ['biography.value', 'biography.public']);
  assert.deepEqual(bio.PERSONALITY.map(f => f[0]), ['trait', 'ideal', 'bond', 'flaw']);
  assert.deepEqual(bio.APPEARANCE.map(f => f[0]), ['appearance']);
  assert.deepEqual(bio.CHARACTERISTICS.map(f => f[0]), ['age', 'height', 'weight', 'eyes', 'skin', 'hair', 'gender', 'faith', 'alignment']);
  setup();
  const actor = hero(); delete actor.system.details.faith; delete actor.system.details.gender;
  const b = bio.biographyFor(actor);
  assert.deepEqual(b.characteristics.map(f => f.key), ['age', 'height', 'weight', 'eyes', 'skin', 'hair', 'alignment'], 'no Faith or Gender box for a model without them');
  assert.equal(bio.hasField({system: {schema: {fields: {details: {fields: {biography: {fields: {public: {}}}}}}}, details: {}}}, 'biography.public'), true, 'the schema counts too');
});

test('Journey | Biography sub-tabs: kit tablist, one Tab stop, panel wiring, usable by observers; arrow keys are bound', async () => {
  const {sheet} = openBio();
  const html = journeyTab(sheet.hubContext);
  const list = html.match(/<div class="ag-tabs ag-tabs--sub agch-jtabs" role="tablist" aria-label="Journey sections">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(list, 'kit sub-tab row');
  const tabs = [...list.matchAll(/<button type="button" role="tab" data-action="journey-view" data-ag-always id="([^"]+)" data-tab="(\w+)" aria-controls="([^"]+)" aria-selected="(\w+)" tabindex="(-?\d)">([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map(t => [t[2], t[6], t[4], t[5]]), [['journey', 'Journey', 'false', '-1'], ['biography', 'Biography', 'true', '0']]);
  assert.match(html, new RegExp(`<div id="${tabs[1][3]}" role="tabpanel" aria-labelledby="${tabs[1][1]}" tabindex="0" class="agch-jpanel agch-jpanel--biography">`));
  const queried = [];
  sheet._bindTabs({querySelectorAll: sel => { queried.push(sel); return []; }});
  assert.ok(queried[0].split(', ').includes('.agch-jtabs'), 'bindTablist runs on the Journey sub-tabs (Left/Right, Home/End)');
});

test('the sub-tab choice is remembered per user (kit uiState) and a new Hub opens on it', async () => {
  const {sheet} = openBio();
  sheet.journeyView = 'journey';
  await ACTIONS['journey-view'](sheet, {dataset: {tab: 'biography'}});
  assert.equal(sheet.journeyView, 'biography');
  const again = new Hub({document: sheet.document});
  assert.equal(again.journeyView, 'biography');
  await ACTIONS['journey-view'](again, {dataset: {tab: 'nonsense'}});
  assert.equal(again.journeyView, 'journey', 'unknown views fall back to Journey');
});

test('owner: every section, editable; plain fields in text boxes; rich fields read-only with the native-sheet link when Foundry has no editor element', async () => {
  const {sheet} = openBio();
  const html = await sheet._renderHTML();
  for (const h of ['Backstory', 'Personality', 'Appearance']) assert.match(html, new RegExp(`<h3 class="agch-heading"><i [^>]+></i> ${h}</h3>`));
  for (const k of ['trait', 'ideal', 'bond', 'flaw', 'appearance']) assert.match(html, new RegExp(`<textarea id="[^"]+" data-bio="${k}" rows="3">`), k);
  for (const k of bio.CHARACTERISTICS.map(f => f[0])) assert.match(html, new RegExp(`<input type="text" id="[^"]+" data-bio="${k}" value="\\[TEST\\]`), k);
  assert.match(html, /<textarea [^>]*data-bio="appearance"[^>]*>\[TEST\] Tall\nScarred<\/textarea>/, 'line breaks kept');
  assert.match(html, /\[TEST\] Private backstory <strong>bold<\/strong>/, 'owner sees the private biography, formatted');
  assert.match(html, /\[TEST\] Public secret/, 'owners see their own secrets');
  assert.equal((html.match(/data-action="open-native" data-ag-always><i [^>]+><\/i>Open native sheet to edit formatting<\/button>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<prose-mirror/);
  assert.match(html, /<div class="ag-footer agch-bio__footer"><button[^>]*data-action="bio-cancel"[\s\S]*?<span class="ag-footer__status" data-bio-status role="status" aria-live="polite"><\/span><button[^>]*ag-btn--primary[^>]*data-action="bio-save"><span>Save Changes<\/span>/, 'Cancel left, status, Save Changes right');
});

test('owner with Foundry\'s <prose-mirror>: the HTML fields are edited in place, their stored HTML passed escaped', async () => {
  const {sheet, actor} = openBio();
  globalThis.customElements = {get: n => n === 'prose-mirror' ? class {} : undefined};
  const html = biographyPanel(sheet.hubContext);
  assert.match(html, /<prose-mirror class="agch-bio__editor" name="system\.details\.biography\.value" data-bio="biography\.value" value="\[TEST\] Private backstory &lt;strong&gt;bold&lt;\/strong&gt;" document-uuid="Actor\.actor1"><\/prose-mirror>/);
  assert.match(html, /name="system\.details\.biography\.public" data-bio="biography\.public" value="&lt;p&gt;\[TEST\] Known in town/);
  assert.doesNotMatch(html, /Open native sheet to edit formatting/);
  assert.equal(actor.calls.length, 0);
  delete globalThis.customElements;
});

test('observer: only the public biography (secrets removed), appearance and characteristics, read-only; never the private biography or personality', async () => {
  const {sheet} = openBio(users.observer);
  const html = await sheet._renderHTML();
  const panel = html.slice(html.indexOf('agch-jpanel--biography'));
  assert.match(panel, /\[TEST\] Known in town/);
  assert.doesNotMatch(html, /Private backstory|Public secret|\[TEST\] (Trait|Ideal|Bond|Flaw)\b/, 'nothing private anywhere in the Hub markup');
  assert.doesNotMatch(panel, /Personality|<textarea|<input|<prose-mirror|data-action="bio-save"/);
  assert.match(panel, /\[TEST\] Tall<br>Scarred/);
  assert.match(panel, /<dl class="ag-kv agch-bio__chars"><dt>Age<\/dt><dd>\[TEST\] 30<\/dd>[\s\S]*<dt>Alignment<\/dt><dd>\[TEST\] Neutral<\/dd><\/dl>/);
  assert.deepEqual(bio.readableKeys(sheet.document), ['biography.public', 'appearance', ...bio.CHARACTERISTICS.map(f => f[0])]);
  assert.match(html, /data-action="journey-view" data-ag-always/, 'observers can still switch sub-tabs');
});

test('limited and no permission: nothing beyond the name; the data layer gives them nothing', async () => {
  setup(users.observer);
  const lim = hero({perms: {owner: 'OWNER', observer: 'LIMITED'}, limitedFor: 'observer'});
  assert.equal(bio.bioAccess(lim), 'none'); assert.equal(bio.biographyFor(lim), null); assert.deepEqual(bio.readableKeys(lim), []);
  assert.deepEqual(await bio.enrichBiography(lim), {});
  const sheet = new Hub({document: lim}); sheet.tab = 'journey'; sheet.journeyView = 'biography';
  const html = await sheet._renderHTML();
  assert.match(html, /agch-root--limited/);
  assert.doesNotMatch(html, /\[TEST\] (Known|Tall|30|Neutral|Private)|Biography/);
  const none = hero({perms: {owner: 'OWNER'}});
  assert.equal(bio.biographyFor(none), null);
  assert.match(biographyPanel({actor: none, sheet: null, editable: false}), /This biography is private\./);
});

test('saving is refused for anyone who does not own the character (data layer), and nothing is written', async () => {
  setup(users.observer);
  const actor = hero();
  const r = await bio.updateBiography(actor, {'biography.public': '<p>[TEST] Hacked</p>', trait: 'x'});
  assert.equal(r.ok, false); assert.match(r.error, /don't own \[TEST\] Hero/);
  assert.equal(updates(actor).length, 0);
  const {sheet} = openBio(users.observer, actor);
  sheet.bioDraft = {actorId: actor.id, values: {'biography.value': 'x'}, touched: new Set()};
  assert.equal((await ACTIONS['bio-save'](sheet)).ok, false, 'the Save action goes through the same check');
  assert.equal(updates(actor).length, 0);
  setup(users.gm);
  assert.equal((await bio.updateBiography(actor, {age: '[TEST] 31'})).ok, true, 'the GM may');
});

test('only changed fields are written; untouched fields (and their HTML) are never rewritten; unknown keys and non-text are dropped', async () => {
  setup();
  const actor = hero();
  let r = await bio.updateBiography(actor, {trait: '[TEST] Brave', 'biography.value': PRIVATE, ideal: '[TEST] Ideal', 'flags.x': 'y', 'biography.public': 5, name: 'z'});
  assert.deepEqual(r.result, {'system.details.trait': '[TEST] Brave'});
  assert.deepEqual(updates(actor), [['update', {'system.details.trait': '[TEST] Brave'}]]);
  r = await bio.updateBiography(actor, {trait: '[TEST] Brave'});
  assert.equal(r.result, null); assert.equal(updates(actor).length, 1, 'no change, no update');
  assert.equal(actor.system.details.biography.value, PRIVATE);
});

test('Save Changes: the draft (typed text) goes out as one actor.update; a rich editor only counts once typed in', async () => {
  const {sheet, actor} = openBio();
  bio.setDraft(sheet, 'bond', '[TEST] New bond');
  bio.setDraft(sheet, 'age', '[TEST] 30');   // back to the stored value: not a change
  // An editor shown but never typed in may re-serialise its HTML; that is not taken as an edit.
  const pm = (key, value) => ({tagName: 'PROSE-MIRROR', dataset: {bio: key}, value});
  sheet.element = {querySelectorAll: sel => sel.startsWith('prose-mirror') ? [pm('biography.value', '<p>[TEST] Private backstory <strong>bold</strong></p>'), pm('biography.public', '<p>[TEST] Rewritten</p>')] : [], querySelector: () => null};
  bio.bioDraft(sheet).touched.add('biography.public');
  const r = await ACTIONS['bio-save'](sheet);
  assert.equal(r.ok, true);
  assert.deepEqual(updates(actor), [['update', {'system.details.bond': '[TEST] New bond', 'system.details.biography.public': '<p>[TEST] Rewritten</p>'}]]);
  assert.equal(sheet.bioDraft, null, 'clean after saving');
  assert.equal(actor.system.details.biography.value, PRIVATE, 'untouched HTML kept byte for byte');
});

test('typed text survives a redraw; the footer says Unsaved changes; Cancel throws the draft away', async () => {
  const {sheet, actor} = openBio();
  bio.setDraft(sheet, 'flaw', '[TEST] Typed <b>flaw</b>');
  const html = await sheet._renderHTML();
  assert.match(html, /data-bio="flaw" rows="3">\[TEST\] Typed &lt;b&gt;flaw&lt;\/b&gt;<\/textarea>/);
  assert.match(html, /data-bio-status role="status" aria-live="polite" data-ag-dirty="true">Unsaved changes<\/span>/);
  await ACTIONS['bio-cancel'](sheet);
  assert.equal(bio.isBioDirty(sheet), false);
  assert.match(await sheet._renderHTML(), /data-bio="flaw" rows="3">\[TEST\] Flaw<\/textarea>/);
  assert.equal(updates(actor).length, 0);
});

test('dirty guard: a tab switch, a sub-tab switch and closing ask first; Keep editing stays, Discard changes goes on', async () => {
  const {sheet} = openBio();
  let answer = false, asked = 0;
  sheet._bioGuard = guardDirty({ask: async () => { asked++; return answer; }});
  let closed = 0;
  Object.getPrototypeOf(Object.getPrototypeOf(sheet)).close = async function () { closed++; return this; };
  // clean: nothing asks
  await ACTIONS['hub-tab'](sheet, {dataset: {tab: 'overview'}});
  assert.equal(asked, 0); assert.equal(sheet.tab, 'overview');
  sheet.tab = 'journey';
  bio.setDraft(sheet, 'trait', '[TEST] Unsaved');
  await ACTIONS['hub-tab'](sheet, {dataset: {tab: 'overview'}});
  assert.equal(sheet.tab, 'journey', 'Keep editing: stays'); assert.equal(asked, 1); assert.equal(bio.isBioDirty(sheet), true);
  await ACTIONS['journey-view'](sheet, {dataset: {tab: 'journey'}});
  assert.equal(sheet.journeyView, 'biography'); assert.equal(asked, 2);
  await ACTIONS['ag-jump'](sheet, {dataset: {partner: 'ashen-gate-cinders'}});
  assert.equal(sheet.tab, 'journey'); assert.equal(asked, 3);
  await sheet.close();
  assert.equal(closed, 0, 'Keep editing: the Hub stays open'); assert.equal(asked, 4);
  await ACTIONS['journey-view'](sheet, {dataset: {tab: 'biography'}});
  assert.equal(asked, 4, 'clicking the open sub-tab asks nothing');
  answer = true;
  await sheet.close();
  assert.equal(closed, 1, 'Discard changes: closes'); assert.equal(bio.isBioDirty(sheet), false);
  bio.setDraft(sheet, 'trait', '[TEST] Again');
  await ACTIONS['hub-tab'](sheet, {dataset: {tab: 'overview'}});
  assert.equal(sheet.tab, 'overview'); assert.equal(bio.isBioDirty(sheet), false);
  delete Object.getPrototypeOf(Object.getPrototypeOf(sheet)).close;
});

test('the status paints without a redraw while typing, and typing back to the stored text is clean again', () => {
  const {sheet} = openBio();
  const status = {textContent: '', dataset: {}};
  sheet.element = {querySelector: sel => sel === '[data-bio-status]' ? status : null, querySelectorAll: () => []};
  bio.setDraft(sheet, 'hair', '[TEST] Red'); bioGuard(sheet).markDirty();
  assert.equal(status.textContent, 'Unsaved changes'); assert.equal(status.dataset.agDirty, 'true');
  assert.equal(bio.setDraft(sheet, 'hair', '[TEST] Black'), false);
});

test('empty states in plain words', () => {
  setup(users.observer);
  const blank = hero({extra: {biography: {value: '[TEST] only private', public: ''}, appearance: '', ...Object.fromEntries(bio.CHARACTERISTICS.map(f => [f[0], '']))}});
  assert.match(biographyPanel({actor: blank, editable: false}), /<p class="ag-empty__title">Nothing shared yet\.<\/p><p class="ag-empty__text">This character has no public biography or appearance yet\.<\/p>/);
  setup(users.owner);
  const empty = hero({extra: {biography: {value: '', public: ''}, appearance: '', trait: '', ideal: '', bond: '', flaw: '', ...Object.fromEntries(bio.CHARACTERISTICS.map(f => [f[0], '']))}});
  const html = biographyPanel({actor: empty, editable: true});
  assert.match(html, /Nothing written yet\. Type in any box, then Save Changes\./);
  assert.match(html, /<p class="agch-muted agch-bio__none">Nothing written yet\.<\/p>/);
  assert.match(biographyPanel({actor: empty, editable: false}), /No biography yet\./, 'owner of a locked character');
});

test('no alpha / beta / preview style labels in anything the Hub renders, in Help or in the module description', async () => {
  const banned = /\b(alpha|beta|preview|experimental|coming soon)\b|New ·/i;
  assert.doesNotMatch(manifest.description, banned);
  assert.doesNotMatch(HELP_HTML, banned);
  for (const user of [users.gm, users.owner, users.observer]) {
    for (const t of TABS) for (const view of ['journey', 'biography']) {
      setup(user);
      const sheet = new Hub({document: hero()});
      sheet.tab = t.id; sheet.journeyView = view;
      for (const menu of [null, 'more', 'look']) {
        sheet.menu = menu;
        const html = await sheet._renderHTML();
        assert.doesNotMatch(text(html), banned, `${user.id} ${t.id} ${view} ${menu}`);
        assert.doesNotMatch(html.replace(/--agch-compact-alpha/g, ''), banned, `${user.id} ${t.id} attributes`);
      }
    }
    setup(user);
    const compact = new Hub({document: hero()}); compact.compact = true; compact.menu = 'look';
    assert.doesNotMatch(await compact._renderHTML(), banned, 'Compact with Appearance open');
  }
  const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /agch-journey__alpha/);
  assert.equal(typeof shellHtml, 'function');
});
