/**
 * 0.37.0: the character's name heads the Hub (the in-sheet header), with a "Level n" badge beside it and the identity
 * line (species · class subclass · background) under it; the brand "Ashen Gate | Character Hub" is the window title.
 * The character column no longer repeats the name. Mocked Foundry: this proves the logic, markup and CSS rules, not the
 * live Foundry layout (the header was checked separately in Chromium at about 420 and 900 px).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installGlobals, makeActor, users, FakeActorSheetV2} from './foundry-mock.mjs';
import {createHubSheetClass} from '../scripts/sheet.mjs';
import {LONG_NAME} from '../scripts/views.mjs';
import {VERSION, HUB_TITLE} from '../scripts/constants.mjs';

const Hub = createHubSheetClass(FakeActorSheetV2);
const CSS = fs.readFileSync(new URL('../styles/character-hub.css', import.meta.url), 'utf8');
const rule = sel => { const at = CSS.lastIndexOf(`${sel} {`); assert.ok(at >= 0, `rule ${sel}`); return CSS.slice(at, CSS.indexOf('}', at)); };
const ITEMS = [
  {id: 'fighter', name: '[TEST] Fighter', type: 'class', img: 'f.webp', system: {levels: 3, identifier: 'fighter'}},
  {id: 'champ', name: '[TEST] Champion', type: 'subclass', img: 'c.webp', system: {classIdentifier: 'fighter'}},
  {id: 'elf', name: '[TEST] Elf', type: 'race', img: 'r.webp'},
  {id: 'sage', name: '[TEST] Sage', type: 'background', img: 'b.webp'}
];
async function render({user = users.owner, compact = false, actor = makeActor({items: ITEMS})} = {}) {
  installGlobals({user, modules: {'ashen-gate-character-hub': {active: true, version: VERSION}}, settings: {compactMode: compact}});
  globalThis.document = {documentElement: {dataset: {}}};
  game.user.targets = new Set();
  const sheet = new Hub({document: actor});
  return {sheet, html: await sheet._renderHTML()};
}
const head = html => html.slice(0, html.indexOf('</header>') + 9);
const column = html => html.slice(html.indexOf('<aside class="agch-char'), html.indexOf('</aside>'));

test('the window title is the brand and the name (0.37.1); the header heading is the character\'s name, escaped', async () => {
  const actor = makeActor({items: ITEMS});
  actor.name = '[TEST] <b>Bold</b> & "Quoted"';
  const {sheet, html} = await render({actor});
  assert.equal(HUB_TITLE, 'Ashen Gate | Character Hub');
  assert.equal(sheet.title, 'Ashen Gate | Character Hub — [TEST] <b>Bold</b> & "Quoted"', '0.37.1: brand — name, no "<Actor type>: <name>"');
  assert.doesNotMatch(sheet.title, /Player|:/);
  const h = head(html);
  assert.match(h, /<h1 class="agch-head__name"[^>]*>\[TEST\] &lt;b&gt;Bold&lt;\/b&gt; &amp; &quot;Quoted&quot;<\/h1>/);
  assert.doesNotMatch(h, /<b>Bold/);
  assert.doesNotMatch(h, /Character Hub/, 'the brand is not repeated inside the Hub');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, 'one h1');
  assert.match(h, /class="ag-header__actions">[\s\S]*data-action="compact-toggle"[\s\S]*data-action="look-menu"[\s\S]*data-action="level-up"[\s\S]*data-action="more-menu"[\s\S]*class="ag-version">v0\.52\.0<\/span>[\s\S]*data-action="help"/, 'actions keep their place');
});

test('no second name in the character column; the column starts with the Cinders / star row, then the art', async () => {
  const {html} = await render();
  const col = column(html);
  assert.doesNotMatch(col.replace('alt="[TEST] Hero"', ''), /agch-name|\[TEST\] Hero|data-action="item-sheet"/, 'only the art\'s alt text names the character');
  assert.match(col, /^<aside class="agch-char" aria-label="Character">\s*<div class="agch-ident">[\s\S]*data-action="inspiration"[\s\S]*agch-doll/);
});

test('identity line: species · class subclass · background, each a button that opens its item; single class has no level in it', async () => {
  const h = head((await render()).html);
  const line = h.match(/<p class="agch-head__ident" role="group" aria-label="Species, class and background">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(line, 'identity line');
  const text = line.replace(/<[^>]+>/g, '');
  assert.equal(text, '[TEST] Elf · [TEST] Fighter [TEST] Champion · [TEST] Sage');
  for (const id of ['elf', 'fighter', 'champ', 'sage']) assert.match(line, new RegExp(`<button type="button" class="agch-idlink agch-idlink--[a-z]+" data-action="item-sheet" data-id="${id}" data-ag-always aria-label="[^"]+: open" data-tooltip="[^"]+: click to open">`));
  assert.match(line, /<span class="agch-idsep" aria-hidden="true"> · <\/span>/, 'separators are not read out');
  assert.match(h, /<div class="agch-head__line"><h1 class="agch-head__name">\[TEST\] Hero<\/h1><span class="ag-badge agch-head__level">Level 3<\/span><button [^>]*data-action="name-edit"[^>]*>.*?<\/button><\/div>/, 'Level badge beside the name (0.40.0: then the owner\'s edit button)');
});

test('multiclass keeps each class\'s level in the line, the total in the badge', async () => {
  const items = [...ITEMS, {id: 'wiz', name: '[TEST] Wizard', type: 'class', img: 'w.webp', system: {levels: 2, identifier: 'wizard'}}];
  const actor = makeActor({items, system: {details: {level: 5}}});
  const h = head((await render({actor})).html);
  assert.equal(h.match(/<p class="agch-head__ident"[^>]*>([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, ''), '[TEST] Elf · [TEST] Fighter 3 [TEST] Champion / [TEST] Wizard 2 · [TEST] Sage');
  assert.match(h, /agch-head__level">Level 5</);
});

test('no class, species or background items: dnd5e\'s names, or "No class"; no badge at level 0', async () => {
  const h = head((await render({actor: makeActor({system: {details: {level: 0, race: {name: '[TEST] Elf'}}}})})).html);
  assert.match(h, /<p class="agch-head__ident"[^>]*>\[TEST\] Elf · No class<\/p>/);
  assert.doesNotMatch(h, /agch-head__level/);
});

test('long names get the full name as a tooltip; short names do not', async () => {
  const long = makeActor({items: ITEMS});
  long.name = '[TEST] Seraphina Aldwyn of the Ember <Vale>';
  assert.ok(long.name.length > LONG_NAME);
  assert.match(head((await render({actor: long})).html), /<h1 class="agch-head__name" data-tooltip="\[TEST\] Seraphina Aldwyn of the Ember &lt;Vale&gt;">\[TEST\] Seraphina Aldwyn of the Ember &lt;Vale&gt;<\/h1>/);
  assert.match(head((await render()).html), /<h1 class="agch-head__name">/);
});

test('Compact: the same header (name, badge, identity line); the column has no name', async () => {
  const {html} = await render({compact: true});
  assert.match(html, /agch-root--compact/);
  const h = head(html);
  assert.match(h, /<h1 class="agch-head__name">\[TEST\] Hero<\/h1><span class="ag-badge agch-head__level">Level 3<\/span>/);
  assert.match(h, /agch-head__ident[\s\S]*data-id="fighter"/);
  assert.doesNotMatch(column(html), /agch-name|data-action="item-sheet"/);
});

test('limited view: the name heads the Hub, no identity line or level, and the hero keeps the portrait without a second name', async () => {
  const actor = makeActor({items: ITEMS}); actor.limited = true;
  const {html} = await render({user: users.observer, actor});
  assert.match(html, /agch-root--limited/);
  const h = head(html);
  assert.match(h, /<h1 class="agch-head__name">\[TEST\] Hero<\/h1><\/div><\/div>/);
  assert.doesNotMatch(h, /agch-head__ident|agch-head__level|\[TEST\] Fighter/, 'nothing more than the native limited sheet shows');
  assert.match(html, /<section class="agch-hero ag-card"><img class="agch-portrait" src="hero\.webp" alt="">[\s\S]*You have limited access to this character\./);
  assert.doesNotMatch(html, /agch-name/);
});

test('CSS: the name keeps one line and ends in "…" only when it must; the identity line wraps; actions keep the right side', () => {
  assert.match(rule('.agch-app .agch-head__who'), /flex: 1 1 14rem; min-width: 0/);
  assert.match(rule('.agch-app .agch-head .agch-head__name'), /min-width: 0;[\s\S]*overflow: hidden; white-space: nowrap; text-overflow: ellipsis/);
  assert.match(rule('.agch-app .agch-head__level'), /flex: none/);
  assert.match(rule('.agch-app .agch-head__ident'), /color: var\(--ag-muted\)[\s\S]*overflow-wrap: anywhere/);
  assert.match(rule('.agch-app .agch-idlink'), /display: inline;[\s\S]*white-space: normal/, 'identity parts wrap like text');
  assert.match(rule('.agch-app .agch-idlink:focus-visible'), /outline: 2px solid var\(--ag-accent\)/, 'visible keyboard focus');
  assert.match(rule('.agch-app .agch-head'), /flex-wrap: wrap/);
  assert.match(rule('.agch-app .agch-head .ag-header__actions'), /margin-left: auto/);
  assert.match(rule('.agch-app .agch-head__tools'), /flex-wrap: wrap/, '0.46.0: the icon group wraps instead of clipping');
});
