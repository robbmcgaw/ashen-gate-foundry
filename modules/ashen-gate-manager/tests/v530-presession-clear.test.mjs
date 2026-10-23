/** 0.53.0 pre-session check: Clear results. Mocked Foundry globals and template text: proves logic, not the live Forge UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runPreSessionCheck, preSessionView, EMPTY_TEXT} from '../scripts/pre-session-check.js';
import {world, now} from './fixtures/pre-session-world.mjs';

const tpl = readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
const main = readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');

test('view: no result (never run, or cleared) has no rows, Clear/Copy/Download off, and the empty text', () => {
  const v = preSessionView(null);
  assert.deepEqual({hasResults: v.hasResults, hasText: v.hasText, rows: v.rows, empty: v.empty}, {hasResults: false, hasText: false, rows: [], empty: 'Run the check to see results.'});
  assert.equal(EMPTY_TEXT, 'Run the check to see results.');
});

test('view: a result has rows with tones and enables the buttons', async () => {
  const out = await runPreSessionCheck(world().game, {now});
  const v = preSessionView(out, s => s === 'PASS' ? 'success' : '');
  assert.equal(v.hasResults, true);
  assert.equal(v.hasText, true);
  assert.equal(v.rows.length, out.rows.length);
  assert.equal(v.rows.find(r => r.status === 'PASS').tone, 'success');
  assert.equal(v.rows.find(r => r.status === 'N-A').css, 'na');
});

test('template: a labelled Clear results button next to Run, disabled when there are no results, and the empty state', () => {
  assert.match(tpl, /data-ag-action="presession-run"[^]*?<\/button>\s*<button type="button" class="ag-btn ag-btn--sm ag-btn--ghost" data-ag-action="presession-clear" \{\{#unless preSession\.hasResults\}\}disabled\{\{\/unless\}\}>[^<]*<i [^>]*aria-hidden="true"><\/i> Clear results<\/button>/);
  assert.match(tpl, /\{\{#if preSession\.hasResults\}\}[^]*?\{\{else\}\}\s*<p class="ag-field__hint agmanager-presession-empty">\{\{preSession\.empty\}\}<\/p>/);
  // Copy and Download are kept.
  assert.match(tpl, /data-ag-action="presession-copy"/);
  assert.match(tpl, /data-ag-action="presession-download"/);
});

test('Manager: Clear drops the in-memory result only (no setting, flag or document write), GM-gated, focus back on Run', () => {
  const body = main.slice(main.indexOf('async #preSession(name)'), main.indexOf('#moodContext()'));
  const clear = body.match(/if\(name==='presession-clear'\)\{([^}]*)\}/)?.[1];
  assert.ok(clear, 'Clear branch present');
  assert.match(clear, /this\.preSessionResult=null/);
  assert.match(clear, /focusAfterRender='\[data-ag-action="presession-run"\]'/);
  assert.doesNotMatch(clear, /settings|setFlag|update\(|delete\(|create/);
  assert.ok(body.indexOf("if(!game.user?.isGM)") < body.indexOf("presession-clear"), 'GM gate runs before Clear');
  assert.match(main, /case "presession-run": case "presession-clear":/);
  // The report is not persisted anywhere: no setting or flag carries it.
  assert.doesNotMatch(main, /settings\.(set|register)\([^)]*[Pp]re[Ss]ession/);
  assert.doesNotMatch(main, /setFlag\([^)]*[Pp]re[Ss]ession/);
});
