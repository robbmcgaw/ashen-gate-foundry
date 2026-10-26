import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCodexService} from '../scripts/codex-service.js';
import {runBulkReveal, bulkProblem, NO_AUDIENCE, NO_FIELDS} from '../scripts/codex-reveal-dialog.mjs';

// Synthetic data only.
const def = () => ({id: 'NPC-TEST-MIRA', entity_type: 'NPC', name: '[TEST] Mira', role: 'Ferry clerk', appearance: 'Ink-stained cuffs.',
  signature_line: 'Coin or names.', portrayal: 'SECRET-PORTRAYAL', gm_notes: ['SECRET']});
function world({isGM = true, failWrite = false} = {}) {
  const flags = new Map();
  const mira = {id: 'mira', uuid: 'Actor.mira', name: 'Mira', type: 'npc',
    getFlag: (m, k) => k === 'source' ? {definition: def()} : flags.get(k) ?? null,
    setFlag: async (m, k, v) => { if (failWrite) throw new Error('Write refused'); flags.set(k, structuredClone(v)); }};
  const pc = (id, name) => ({id, name, type: 'character', hasPlayerOwner: true, getFlag: () => null, testUserPermission: () => false});
  const game = {user: {id: 'gm', isGM}, actors: {contents: [mira, pc('a1', '[TEST] Ash')]}, users: new Map(), modules: new Map(), settings: {get: () => true}};
  return {flags, svc: createCodexService({game, moduleId: 'ashen-gate-manager'})};
}
const bulk = (over = {}) => ({keys: new Set(), mode: 'party', chars: new Set(), ...over});
const ID = 'NPC-TEST-MIRA';

test('0.70.2: a preset with the whole party reveals and says so', async () => {
  const {svc, flags} = world();
  const out = await runBulkReveal({svc, id: ID, bulk: bulk(), preset: 'basics'});
  assert.equal(out.ok, true); assert.equal(out.tone, 'ok');
  assert.equal(out.message, 'Revealed 3 fields to the whole party.');
  assert.equal(flags.get('codex').fields.role.party, true);
  assert.equal(flags.get('codex').discovery.party, true);
  const every = await runBulkReveal({svc, id: ID, bulk: bulk(), preset: 'everything'});
  assert.match(every.message, /^Revealed 4 fields to the whole party/);
  assert.equal(flags.get('codex').fields.signature_line.party, true);
});

test('0.70.2: a preset with chosen characters reveals to them only', async () => {
  const {svc, flags} = world();
  const out = await runBulkReveal({svc, id: ID, bulk: bulk({mode: 'actors', chars: new Set(['a1'])}), preset: 'basics'});
  assert.equal(out.message, 'Revealed 3 fields to [TEST] Ash.');
  assert.deepEqual(flags.get('codex').fields.role, {party: false, actors: ['a1']});
});

test('0.70.2: no audience gives a visible message and writes nothing', async () => {
  const {svc, flags} = world();
  for (const b of [bulk({mode: 'actors'}), bulk({mode: 'hidden'})]) {
    const out = await runBulkReveal({svc, id: ID, bulk: b, preset: 'basics'});
    assert.deepEqual([out.ok, out.tone, out.message], [false, 'warn', NO_AUDIENCE]);
  }
  const none = await runBulkReveal({svc, id: ID, bulk: bulk(), preset: null});
  assert.deepEqual([none.ok, none.message], [false, NO_FIELDS]);
  assert.equal(flags.has('codex'), false);
  assert.equal(bulkProblem({mode: 'party', preset: 'basics'}), '');
});

test('0.70.2: nothing to reveal is said out loud', async () => {
  const {svc} = world();
  await runBulkReveal({svc, id: ID, bulk: bulk(), preset: 'everything'});
  const again = await runBulkReveal({svc, id: ID, bulk: bulk(), preset: 'basics'});
  assert.deepEqual([again.ok, again.tone], [true, 'info']);
  assert.equal(again.message, 'Nothing to reveal: those fields are already revealed or empty.');
  const hide = await runBulkReveal({svc, id: ID, bulk: bulk({mode: 'hidden', keys: new Set(['wants'])}), preset: null});
  assert.equal(hide.message, 'Nothing to hide: those fields are already hidden.');
});

test('0.70.2: failures are surfaced, never swallowed; a player cannot do it; hiding asks first', async () => {
  const failing = await runBulkReveal({svc: world({failWrite: true}).svc, id: ID, bulk: bulk(), preset: 'basics'});
  assert.deepEqual([failing.ok, failing.tone], [false, 'danger']);
  assert.match(failing.message, /Nothing was changed: Write refused/);
  const player = await runBulkReveal({svc: world({isGM: false}).svc, id: ID, bulk: bulk(), preset: 'basics'});
  assert.equal(player.tone, 'danger'); assert.match(player.message, /Only a GM/);
  const missing = await runBulkReveal({svc: world().svc, id: 'NPC-TEST-NOPE', bulk: bulk(), preset: 'basics'});
  assert.match(missing.message, /not in this world/);
  const {svc, flags} = world();
  const declined = await runBulkReveal({svc, id: ID, bulk: bulk({mode: 'hidden', keys: new Set(['role'])}), confirmHide: async () => false});
  assert.equal(declined.cancelled, true); assert.equal(flags.has('codex'), false);
});

test('0.70.2: the template and handler are wired, and the disabled presets say why', () => {
  const tpl = fs.readFileSync(new URL('../templates/manager.hbs', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  for (const name of ['codex-preset-basics', 'codex-preset-everything', 'codex-bulk-apply']) {
    assert.ok(tpl.includes(`data-ag-action="${name}"`), `template has ${name}`);
    assert.match(main, new RegExp(`case "[^"]*"[^\\n]*case "${name}"|case "${name}"`), `#action routes ${name}`);
    assert.ok(main.includes(`case '${name}'`), `#codexAction handles ${name}`);
  }
  assert.match(main, /runBulkReveal\(\{svc,id,bulk:b,preset/);
  assert.match(tpl, /data-ag-codex-reason \{\{#if presetsOk\}\}hidden\{\{\/if\}\}>These need an audience/);
  assert.match(tpl, /agcodex-note\{\{#if noteWarn\}\} agcodex-note--warn\{\{\/if\}\}" role="status"/);
  assert.match(main, /why\.hidden=st\.presetsOk/);
});

test('0.70.2: Codex changes keep the detail pane scroll, the open Characters menu and focus; busy never swallows Codex actions', () => {
  const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url), 'utf8');
  assert.match(main, /scrollable: \["\.agm-pane", "\.aglib-rows", "\.ag-split__detail"/, 'Foundry keeps the detail pane scroll on re-render');
  assert.match(main, /#renderCodex\(\) \{[^}]*scrollTop[^}]*return this\.render\(\)/s);
  assert.match(main, /pane\.scrollTop=this\.codexScroll/);
  assert.match(main, /this\.codexReopen=el\.dataset\.agCodexActor/);
  assert.match(main, /\[data-ag-codex-actor="\$\{el\.dataset\.agCodexActor\}"\]\[value="\$\{el\.value\}"\]/);
  assert.match(main, /&& !String\(name\)\.startsWith\('codex-'\)\) return;/, 'busy gate skips codex-* actions');
  const codexAction = main.slice(main.indexOf('async #codexAction(name)'), main.indexOf('/** Picks an NPC in the Codex list'));
  assert.match(codexAction, /await this\.#renderCodex\(\);\n  \}/, 'the Codex action re-render keeps scroll');
  assert.doesNotMatch(codexAction.replace(/#renderCodex/g, ''), /await this\.render\(\)/);
});
