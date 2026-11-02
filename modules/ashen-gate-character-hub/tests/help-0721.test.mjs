/**
 * Help (0.72.1): organised, player-facing text. These tests prove the help text and its structure with mocked
 * Foundry globals; they do not show the dialog in a live Foundry world.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HELP_SECTIONS, GM_HELP_SECTION, HELP_HTML, helpHtml, aboutHtml, showHelp} from '../scripts/help.mjs';

const scriptsDir = new URL('../scripts/', import.meta.url);
const source = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.mjs') && f !== 'help.mjs').map(f => fs.readFileSync(new URL(f, scriptsDir), 'utf8')).join('\n')
  .replaceAll('&amp;', '&');
const text = html => html.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&');
const strongs = html => [...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(m => text(m[1]));
const gmHtml = helpHtml(true);

test('player Help has no versions, ticket tags, status words, raw ids or GM Setup', () => {
  assert.doesNotMatch(HELP_HTML, /\b0\.\d{1,3}\.\d/, 'no version numbers');
  assert.doesNotMatch(HELP_HTML, /\bv\d+\.\d+/i);
  assert.doesNotMatch(HELP_HTML, /\bCH-\d+/, 'no internal ticket tags');
  assert.doesNotMatch(HELP_HTML, /GM Setup|Player visibility|Hub appearance|Enforce spell|Level backups|Backups|Detach/);
  assert.doesNotMatch(HELP_HTML, /\b(alpha|beta|preview|experimental|coming soon)\b|added in|since 0\./i);
  assert.doesNotMatch(text(HELP_HTML), /\bNew\b(?! item| spell)/, 'no New status label');
  assert.doesNotMatch(HELP_HTML, /\b(LOC|NPC|FAC|PROF|REC|MAT|PERK)-[A-Z0-9]/);
  assert.doesNotMatch(HELP_HTML, /For the GM/);
});

test('the GM sees a For the GM fold, players and the shipped player export do not', () => {
  assert.match(gmHtml, /<span class="ag-fold__title">For the GM<\/span>/);
  assert.doesNotMatch(HELP_HTML, /For the GM/);
  assert.equal((gmHtml.match(/<details class="ag-fold"/g) ?? []).length, HELP_SECTIONS.length + 1);
  assert.equal((helpHtml(false).match(/<details class="ag-fold"/g) ?? []).length, HELP_SECTIONS.length);
  assert.equal(GM_HELP_SECTION[0], 'For the GM');
  assert.equal((gmHtml.match(/<details class="ag-fold" open>/g) ?? []).length, 1, 'only the first group starts open');
});

test('showHelp: one Close button, About last, GM fold only for the GM', async () => {
  const seen = [];
  const run = async isGM => {
    globalThis.game = {user: {isGM}, modules: new Map([['ashen-gate-character-hub', {id: 'ashen-gate-character-hub', active: true, version: '9.9.9'}]])};
    globalThis.foundry = {applications: {api: {DialogV2: {prompt: async o => { seen.push(o); }}}}};
    await showHelp();
  };
  try { await run(false); await run(true); } finally { delete globalThis.game; delete globalThis.foundry; }
  const [player, gm] = seen;
  assert.equal(player.window.title, 'Character Hub Help'); assert.equal(player.ok.label, 'Close');
  assert.doesNotMatch(player.content, /For the GM/); assert.match(gm.content, /For the GM/);
  for (const c of [player.content, gm.content]) {
    const i = c.indexOf('>About</h4>');
    assert.ok(i > c.lastIndexOf('</details>'), 'About comes after every group');
    assert.doesNotMatch(c.slice(0, i), /\b\d+\.\d+\.\d+/, 'no version outside the About block');
    assert.match(c.slice(i), /v9\.9\.9/);
  }
  assert.match(aboutHtml(new Map()), /About/);
});

test('every UI name in the Help exists in the Hub code', () => {
  // Descriptive bold text that is not a button, tab or setting name.
  const NOT_A_NAME = new Set(['same', 'star', 'Rolls', 'Right-click', 'Add', 'Delete', 'always linked', 'Keys 1-9 and 0', 'Combat, Inventory, Magic and Features', 'Filters → Show item descriptions', 'Journey → Biography', 'Edit', 'Remove', 'Open', 'View', 'None', 'Ashen Gate Character Hub', 'C', 'R', 'Hide', 'Attach', 'Swap', 'Detach', 'Self', 'Target', 'Apply', 'Undo', 'Character', 'Features', 'Group', 'Sort', 'Origin', 'Cancel', 'Use', 'Cast', 'Always', 'Prepared', 'Full', 'Compact', 'Level up', '−', '+', '⋯']);
  const unknown = [];
  for (const raw of strongs(gmHtml)) {
    if (raw.endsWith(':')) continue;
    for (const name of raw.split(' → ')) {
      if (NOT_A_NAME.has(name) || /^\(.*\)$/.test(name)) continue;
      const needle = name.replace(/ \(n\)$/, '');
      if (!source.includes(needle)) unknown.push(name);
    }
  }
  assert.deepEqual(unknown, [], 'names not found in the Hub code');
  // The plain-word names above are checked directly, so a rename is caught too.
  for (const name of ['Compact', 'Full', 'Level up', 'Cancel', 'Apply', 'Self', 'Target', 'Undo', 'Origin', 'Group', 'Sort', 'Prepared', 'Always', 'Attach', 'Swap', 'Detach', 'Remove', 'Features', 'Character', 'Party stash', 'Ashen Gate Character Hub']) {
    assert.ok(source.includes(name), `${name} is not in the Hub code`);
  }
});

test('Help names match the tabs and Ashen Gate sub-tabs', async () => {
  const {TABS} = await import('../scripts/views.mjs');
  const {PANELS} = await import('../scripts/partners.mjs');
  const tabNames = TABS.map(t => t.label);
  for (const n of ['Overview', 'Combat', 'Inventory', 'Magic', 'Features', 'Effects', 'Ashen Gate', 'Companions', 'Journey']) assert.ok(tabNames.includes(n), n);
  const subs = PANELS.map(p => p.tab).filter(Boolean);
  for (const n of ['Professions', 'Skill Trees', 'Cinders', 'Renown', 'Quest Log', 'Locations', 'Headquarters']) { assert.ok(subs.includes(n), n); assert.ok(strongs(HELP_HTML).includes(n), `Help names ${n}`); }
});

test('no group is empty and every bullet is short', () => {
  assert.ok(HELP_SECTIONS.length >= 5);
  for (const [title, items] of [...HELP_SECTIONS, GM_HELP_SECTION]) {
    assert.ok(title && items.length > 0, `${title} is empty`);
    for (const item of items) {
      assert.ok(text(item).length <= 300, `too long (${text(item).length}): ${text(item).slice(0, 60)}`);
      assert.ok(text(item).trim().length > 10);
    }
  }
  assert.deepEqual(HELP_SECTIONS.map(([t]) => t), ['Getting started', 'Your character', 'Lists and tabs', 'Marks, conditions and the quick bar', 'Ashen Gate modules', 'Keyboard and accessibility']);
});
