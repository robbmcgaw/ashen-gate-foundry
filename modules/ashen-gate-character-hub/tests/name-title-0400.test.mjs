/**
 * 0.40.0: Edit name and title… The owner and the GM rename the character (actor.name) and set a short title, an Actor
 * flag in the Hub's namespace (dnd5e 6.0.6 has no title field). Observers, limited viewers and level backups are
 * refused in the code path, not only by hiding the button. Mocked Foundry and a fake DialogV2: this proves the logic and
 * the markup, not the live Foundry window, dialog or title bar.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass, ACTIONS} from '../scripts/sheet.mjs';
import {headerHtml, moreMenuHtml} from '../scripts/views.mjs';
import * as nt from '../scripts/name-title.mjs';
import {HELP_HTML} from '../scripts/help.mjs';
import {VERSION, MODULE_ID} from '../scripts/constants.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../module.json', import.meta.url), 'utf8'));
const css = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const Hub = createHubSheetClass(FakeActorSheetV2);
const FLAG = `flags.${MODULE_ID}.title`;
const updates = actor => actor.calls.filter(c => c[0] === 'update');
const MAIN_DOC = {documentElement: {dataset: {}}, title: 'Foundry Virtual Tabletop'};

function setup(user = users.owner) {
  installGlobals({user, modules: {[MODULE_ID]: {active: true, version: VERSION}}});
  globalThis.document = MAIN_DOC;
  game.user.targets = new Set();
}
const withTitle = (actor, title) => { actor.flags[MODULE_ID] = {...actor.flags[MODULE_ID], title}; return actor; };
const backup = () => { const a = makeActor(); a.name = '[TEST] Hero - level 3'; a.flags[MODULE_ID] = {levelBackup: {sourceId: 'actor1', sourceName: '[TEST] Hero'}}; return a; };
const ctxFor = (actor, user, extra = {}) => {
  const limited = !user.isGM && actor.limited === true;
  return {actor, sheet: {menu: null}, limited, editable: !limited && (user.isGM || actor.testUserPermission(user, 'OWNER')), ...extra};
};

test('version is 0.40.0 in the code, module.json and its download URL', () => {
  assert.equal(VERSION, '0.40.0');
  assert.equal(manifest.version, '0.40.0');
  assert.match(manifest.download, /ashen-gate-character-hub-v0\.40\.0\/ashen-gate-character-hub\.zip$/);
});

test('the owner and the GM can rename; the name is written to actor.name, trimmed', async () => {
  for (const user of [users.owner, users.gm]) {
    setup(user);
    const actor = makeActor();
    const r = await nt.updateNameTitle(actor, {name: '  [TEST] Velwin  '});
    assert.equal(r.ok, true, user.id);
    assert.deepEqual(updates(actor), [['update', {name: '[TEST] Velwin'}]], user.id);
    assert.equal(actor.name, '[TEST] Velwin');
  }
});

test('an observer or a limited viewer is refused in the code path, and nothing is written', async () => {
  setup(users.observer);
  const actor = makeActor();
  const r = await nt.updateNameTitle(actor, {name: '[TEST] Stolen', title: '[TEST] Thief'});
  assert.equal(r.ok, false);
  assert.match(r.error, /don't own \[TEST\] Hero/);
  const limited = makeActor({perms: {observer: 'LIMITED'}}); limited.limited = true;
  assert.equal((await nt.updateNameTitle(limited, {name: '[TEST] Stolen'})).ok, false);
  const stranger = makeActor({perms: {}});
  assert.equal((await nt.updateNameTitle(stranger, {name: '[TEST] Stolen'}, users.observer)).ok, false);
  assert.deepEqual([...updates(actor), ...updates(limited), ...updates(stranger)], []);
  // renameAsk refuses before asking.
  let asked = false;
  const out = await nt.renameAsk({document: actor}, async () => { asked = true; return {name: 'x', title: ''}; });
  assert.equal(out.ok, false); assert.equal(asked, false);
});

test('a level backup stays read-only, also for the GM', async () => {
  setup(users.gm);
  const copy = backup();
  const r = await nt.updateNameTitle(copy, {name: '[TEST] Renamed copy', title: '[TEST] Title'});
  assert.equal(r.ok, false);
  assert.match(r.error, /level backup/);
  assert.deepEqual(updates(copy), []);
  assert.equal(nt.nameEditBtn(copy), '');
  assert.doesNotMatch(headerHtml(ctxFor(copy, users.gm), false), /data-action="name-edit"/);
  assert.doesNotMatch(moreMenuHtml({menu: 'more'}, ctxFor(copy, users.gm)), /name-edit/);
});

test('an empty name is refused; the dialog\'s answer without a name writes nothing', async () => {
  setup();
  const actor = makeActor();
  for (const name of ['', '   ', '\n\t']) {
    const r = await nt.updateNameTitle(actor, {name, title: '[TEST] Title'});
    assert.equal(r.ok, false); assert.match(r.error, /needs a name/);
  }
  assert.deepEqual(updates(actor), []);
});

test('the title is plain text: trimmed, one line, at most 60 characters; empty clears it', async () => {
  setup();
  const actor = makeActor();
  await nt.updateNameTitle(actor, {title: '  [TEST]  Warden\nof the   Ford  '});
  assert.deepEqual(updates(actor).at(-1), ['update', {[FLAG]: '[TEST] Warden of the Ford'}]);
  assert.equal(nt.titleOf(actor), '[TEST] Warden of the Ford');
  assert.equal(nt.cleanTitle('x'.repeat(80)).length, nt.TITLE_MAX);
  assert.equal(nt.TITLE_MAX, 60);
  assert.equal(nt.cleanTitle(null), '');
  await nt.updateNameTitle(actor, {title: '   '});
  assert.deepEqual(updates(actor).at(-1), ['update', {[FLAG]: ''}], 'empty clears it');
  assert.equal(nt.titleOf(actor), '');
});

test('only changed fields are written; nothing changed writes nothing', async () => {
  setup();
  const actor = withTitle(makeActor(), '[TEST] Warden');
  assert.deepEqual(await nt.updateNameTitle(actor, {name: '[TEST] Hero', title: '[TEST] Warden'}), {ok: true, result: null});
  assert.deepEqual(updates(actor), []);
  await nt.updateNameTitle(actor, {name: '[TEST] Hero', title: '[TEST] Ranger'});
  assert.deepEqual(updates(actor), [['update', {[FLAG]: '[TEST] Ranger'}]], 'the name is not rewritten');
  await nt.updateNameTitle(actor, {name: '[TEST] Velwin', title: ' [TEST] Ranger '});
  assert.deepEqual(updates(actor).at(-1), ['update', {name: '[TEST] Velwin'}], 'the title is not rewritten');
  await nt.updateNameTitle(actor, {name: '[TEST] Vel', title: '[TEST] Lord'});
  assert.deepEqual(updates(actor).at(-1), ['update', {name: '[TEST] Vel', [FLAG]: '[TEST] Lord'}], 'both in one update');
});

test('the header shows the title beside the name, escaped, italic and muted; the Level badge stays', () => {
  setup();
  const actor = withTitle(makeActor(), '[TEST] <img src=x onerror=alert(1)> & "Q"');
  const html = headerHtml(ctxFor(actor, users.owner), false);
  assert.match(html, /<h1 class="agch-head__name">\[TEST\] Hero<\/h1><span class="agch-head__title"[^>]*>\[TEST\] &lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Q&quot;<\/span><span class="ag-badge agch-head__level">Level 3<\/span>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(css, /\.agch-head__title \{[^}]*font-style: italic;[^}]*color: var\(--ag-muted\)/);
  assert.match(css, /\.agch-head__title \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.agch-head__level \{ flex: none;/, 'the Level badge never shrinks');
  // The full text is the tooltip (a narrow header may cut it off); the name keeps room for the badge and some title.
  assert.match(nt.titleHtml(withTitle(makeActor(), '[TEST] Ward')), /data-tooltip="\[TEST\] Ward"/);
  assert.match(css, /\.agch-head__line--titled \.agch-head__name \{ max-width: calc\(100% - 6\.5rem - 3em/);
  assert.equal(nt.titleHtml(makeActor()), '', 'no title, no span');
});

test('who sees the edit button: owner and GM yes; observer and limited no (the title still shows)', () => {
  setup(users.owner);
  const actor = withTitle(makeActor(), '[TEST] Warden');
  const own = headerHtml(ctxFor(actor, users.owner), false);
  assert.match(own, /<button type="button" class="ag-btn ag-btn--ghost ag-btn--icon ag-btn--sm agch-head__edit" data-action="name-edit" aria-label="Edit name and title…" data-tooltip="Edit name and title…">/);
  assert.match(moreMenuHtml({menu: 'more'}, ctxFor(actor, users.owner)), /data-action="name-edit"[^>]*>.*<span>Edit name and title…<\/span>/);
  assert.match(moreMenuHtml({menu: null}, ctxFor(actor, users.owner)), /aria-label="More: Edit name and title, Level up/);
  setup(users.gm);
  assert.match(headerHtml(ctxFor(actor, users.gm), false), /data-action="name-edit"/);
  setup(users.observer);
  const obs = headerHtml(ctxFor(actor, users.observer), false);
  assert.doesNotMatch(obs, /name-edit/);
  assert.match(obs, /agch-head__title"[^>]*>\[TEST\] Warden</);
  assert.doesNotMatch(moreMenuHtml({menu: 'more'}, ctxFor(actor, users.observer)), /name-edit/);
  const limited = withTitle(makeActor({perms: {observer: 'LIMITED'}}), '[TEST] Warden'); limited.limited = true;
  const lim = headerHtml(ctxFor(limited, users.observer), false);
  assert.doesNotMatch(lim, /name-edit/);
  assert.match(lim, /agch-head__title"[^>]*>\[TEST\] Warden</);
  // Not editable for another reason (e.g. a locked sheet): no button either.
  setup(users.owner);
  assert.doesNotMatch(headerHtml(ctxFor(actor, users.owner, {editable: false}), false), /name-edit/);
});

test('Edit name and title…: Cancel writes nothing; Save writes only what changed; focus goes back to the edit button', async () => {
  setup();
  const actor = withTitle(makeActor(), '[TEST] Warden');
  let focused = 0;
  const sheet = {document: actor, element: {querySelector: sel => sel === '.agch-head__edit' ? {focus: () => { focused++; }} : null}};
  assert.equal(await nt.renameAsk(sheet, async () => null), null);
  assert.deepEqual(updates(actor), []);
  assert.equal(focused, 1);
  const r = await nt.renameAsk(sheet, async a => ({name: a.name, title: '[TEST] Warden of the Ford'}));
  assert.equal(r.ok, true);
  assert.deepEqual(updates(actor), [['update', {[FLAG]: '[TEST] Warden of the Ford'}]]);
  assert.equal(focused, 2);
  assert.equal(typeof ACTIONS['name-edit'], 'function', 'the header button and the ⋯ item are wired');
});

test('the dialog: kit classes, Cancel left and Save right, Save disabled while the name is empty, Escape writes nothing', async () => {
  setup();
  const actor = withTitle(makeActor(), '[TEST] <b>Warden</b>');
  let config = null, answer;
  globalThis.foundry = {applications: {api: {DialogV2: {wait: async c => { config = c; return answer(c); }}}}};
  try {
    // A fake rendered dialog: a name input, a Save button and a form.
    const input = {value: '[TEST] Hero', listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }};
    const save = {disabled: false};
    const form = {elements: {name: input, title: {value: ' [TEST] Ford '}}};
    const element = {querySelector: sel => sel === 'input[name="name"]' ? input : sel === 'button[data-action="ok"]' ? save : sel === 'form' ? form : null};
    answer = c => { c.render({}, {element}); return c.buttons[1].callback({}, {form}, {element}); };
    const out = await nt.nameTitleDialog(actor);
    assert.deepEqual(config.classes, ['ag-app', 'ag-dialog']);
    assert.deepEqual(config.buttons.map(b => [b.action, b.label]), [['cancel', 'Cancel'], ['ok', 'Save']]);
    assert.equal(config.buttons[1].default, true);
    assert.equal(config.window.title, 'Edit name and title');
    assert.match(config.content, /value="\[TEST\] &lt;b&gt;Warden&lt;\/b&gt;"/, 'the title is escaped in the field');
    assert.match(config.content, /maxlength="60"/);
    assert.deepEqual(out, {name: '[TEST] Hero', title: ' [TEST] Ford '});
    assert.equal(save.disabled, false);
    input.value = '  '; input.listeners.input();
    assert.equal(save.disabled, true, 'Save is disabled while the name is empty');
    input.value = '[TEST] V'; input.listeners.input();
    assert.equal(save.disabled, false);
    // Escape / closed: DialogV2 resolves null.
    answer = () => null;
    assert.equal(await nt.nameTitleDialog(actor), null);
    // Even if a submit slips through with an empty name, the answer is dropped.
    answer = () => ({name: '  ', title: 'x'});
    assert.equal(await nt.nameTitleDialog(actor), null);
  } finally { delete globalThis.foundry; }
});

test('after a rename the window title follows the new name (also popped out)', async () => {
  const pop = {documentElement: {dataset: {}}, title: 'Ashen Gate | Character Hub — [TEST] Hero'};
  setup();
  const actor = makeActor();
  const sheet = new Hub({document: actor});
  const content = {innerHTML: '', ownerDocument: pop, listeners: {}, classList: [], tagName: 'SECTION', scrollTop: 0, scrollLeft: 0,
    querySelectorAll: () => [], querySelector: () => null, contains: () => false, addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }, insertAdjacentHTML() {}};
  sheet.element = {style: {setProperty() {}, removeProperty() {}}, classList: {toggle() {}, remove() {}, add() {}}, querySelector: () => null, ownerDocument: pop, dataset: {}};
  sheet.window = {title: {textContent: sheet.title}};
  sheet.render = async () => sheet;
  await nt.updateNameTitle(actor, {name: '[TEST] Velwin', title: '[TEST] Warden'});
  sheet._replaceHTML(await sheet._renderHTML(), content);
  assert.equal(sheet.title, 'Ashen Gate | Character Hub — [TEST] Velwin', 'the title is the name only, never the title text');
  assert.equal(sheet.window.title.textContent, 'Ashen Gate | Character Hub — [TEST] Velwin');
  assert.equal(pop.title, 'Ashen Gate | Character Hub — [TEST] Velwin');
  assert.match(content.innerHTML, /agch-head__name">\[TEST\] Velwin<\/h1><span class="agch-head__title"[^>]*>\[TEST\] Warden<\/span>/);
});

test('Help names the action; no status wording', () => {
  assert.match(HELP_HTML, /Edit name and title…/);
  assert.doesNotMatch(HELP_HTML + nt.EDIT_LABEL, /\b(alpha|beta|preview|new!)\b/i);
});
