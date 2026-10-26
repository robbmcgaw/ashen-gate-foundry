// Checks every module (or the ones named on the command line):
//   - module.json is valid and its manifest/download URLs match its id and version
//   - CHANGELOG.md starts with this version, and any hard-coded VERSION/BUILD_VERSION constant matches it
//   - every runtime script parses
//   - styles/ag-ui.css is listed first and identical in every module; shared helpers (ag-launchers.mjs,
//     ag-dialogs.mjs, ag-html.mjs, ag-item-drop.mjs) are identical wherever they ship
//   - the UI drift lint (scripts/ui-lint.mjs): every rule at zero, except the STRICT_EXCEPTIONS it lists
//   - the module's automated tests pass
//   - the shared kit helper tests (scripts/kit-tests, mocked DOM) pass
//   - (full run only) the playtest data pack loads, ids are unique and references resolve
//   - the suite is pre-release: every module version is 0.x; no module.json relationship asks for an Ashen Gate module
//     at 1.x or above; no runtime script compares a Locations version (partners feature-detect its API instead)
// Usage: node scripts/check.mjs [module-id ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runUiLint } from './ui-lint.mjs';
import { locationsVersionCompare, relationshipProblems } from './version-rules.mjs';

const REPO = 'robbmcgaw/ashen-gate-foundry';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const modulesDir = path.join(root, 'modules');
const wanted = process.argv.slice(2);
const ids = fs.readdirSync(modulesDir).filter(id => !wanted.length || wanted.includes(id)).sort();

const failures = [];
const fail = (id, msg) => failures.push(`${id}: ${msg}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

for (const id of ids) {
  const dir = path.join(modulesDir, id);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf8'));
  } catch (err) {
    fail(id, `module.json unreadable: ${err.message}`);
    continue;
  }
  const v = manifest.version;
  if (manifest.id !== id) fail(id, `module.json id "${manifest.id}" does not match folder name`);
  if (!/^\d+\.\d+\.\d+$/.test(v ?? '')) fail(id, `version "${v}" is not x.y.z`);
  // Pre-release suite: 0.x only. Locations was renumbered 1.18.0 -> 0.18.0; Release publishes any untagged version, so a
  // lower number is fine there (Forge just won't offer it as an update: reinstall from the manifest URL).
  if (!/^0\./.test(v ?? '')) fail(id, `version "${v}" must stay 0.x (the suite is pre-release; see CLAUDE.md Versioning)`);
  // Foundry enforces relationships: a 1.x minimum on another Ashen Gate module would stop this one enabling beside it.
  for (const problem of relationshipProblems(manifest)) fail(id, problem);
  const expected = {
    manifest: `https://raw.githubusercontent.com/${REPO}/main/modules/${id}/module.json`,
    download: `https://github.com/${REPO}/releases/download/${id}-v${v}/${id}.zip`,
  };
  for (const [key, url] of Object.entries(expected)) {
    if (manifest[key] !== url) fail(id, `${key} should be ${url}`);
  }
  if ((manifest.styles ?? [])[0] !== 'styles/ag-ui.css') fail(id, 'module.json styles must list styles/ag-ui.css first (shared UI kit)');
  const kitVersion = fs.existsSync(path.join(dir, 'styles/ag-ui.css')) ? fs.readFileSync(path.join(dir, 'styles/ag-ui.css'), 'utf8').match(/^\/\* ag-ui kit (\S+) \*\//)?.[1] : null;
  if (!kitVersion) fail(id, 'styles/ag-ui.css must start with its "/* ag-ui kit x.y.z */" line');
  for (const file of [...(manifest.esmodules ?? []), ...(manifest.styles ?? [])]) {
    if (!fs.existsSync(path.join(dir, file))) fail(id, `module.json lists missing file ${file}`);
  }

  // The release notes are the top CHANGELOG section, so it must describe this version.
  const changelog = path.join(dir, 'CHANGELOG.md');
  const top = fs.existsSync(changelog) ? fs.readFileSync(changelog, 'utf8').match(/^## +(\S+)/m)?.[1] : null;
  if (top !== v) fail(id, `CHANGELOG.md must start with a "## ${v}" section (found ${top ? `"## ${top}"` : 'none'})`);

  // Legacy macros are Foundry macro bodies (top-level return/await), not modules, so skip them.
  const runtime = walk(dir).filter(f => /\.(m?js)$/.test(f) && !f.includes(`${path.sep}macros${path.sep}`));
  for (const file of runtime) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) fail(id, `syntax error in ${path.relative(dir, file)}\n${r.stderr}`);
  }

  // A hard-coded VERSION / BUILD_VERSION constant (shown in headers and logs) must match module.json.
  for (const file of runtime.filter(f => !/[\\/](tests?|vendor)[\\/]/.test(f))) {
    for (const [, name, found] of fs.readFileSync(file, 'utf8').matchAll(/\bconst\s+((?:BUILD_)?VERSION)\s*=\s*['"](\d+\.\d+\.\d+)['"]/g)) {
      if (found !== v) fail(id, `${path.relative(dir, file)}: ${name} is '${found}' but module.json says ${v}`);
    }
  }

  // Locations went from 1.18.0 to 0.18.0, so a numeric compare against it is wrong now: feature-detect its API.
  for (const file of runtime.filter(f => !/[\\/](tests?|vendor)[\\/]/.test(f))) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (locationsVersionCompare(line)) fail(id, `${path.relative(dir, file)}:${i + 1} compares a Locations version; detect the API function instead:\n    ${line.trim()}`);
    });
  }

  const testDir = ['tests', 'test'].map(d => path.join(dir, d)).find(d => fs.existsSync(d));
  const testFiles = testDir ? fs.readdirSync(testDir).filter(f => /\.test\.m?js$/.test(f)).map(f => path.join(testDir, f)) : [];
  if (testFiles.length) {
    const r = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: dir, encoding: 'utf8' });
    const summary = (r.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ');
    console.log(`${id} ${v} (kit ${kitVersion}): ${summary}`);
    if (r.status !== 0) fail(id, `tests failed\n${r.stdout.split('\n').filter(l => /^not ok/.test(l)).join('\n')}`);
  } else {
    console.log(`${id} ${v} (kit ${kitVersion}): no automated tests`);
  }
}

// Shared kit helpers (ag-html.mjs, ag-dialogs.mjs; kit 2.2) against a mocked DOM. Every module carries the kit, so always run.
{
  const kitTests = fs.readdirSync(path.join(root, 'scripts/kit-tests')).filter(f => f.endsWith('.test.mjs')).map(f => path.join(root, 'scripts/kit-tests', f));
  const k = spawnSync(process.execPath, ['--test', ...kitTests], { cwd: root, encoding: 'utf8' });
  console.log(`kit helpers: ${(k.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ')}`);
  if (k.status !== 0) fail('kit-tests', `tests failed\n${k.stdout.split('\n').filter(x => /^not ok/.test(x)).join('\n')}`);
}

// The synthetic playtest data (scripts/build-test-pack.mjs -> test-fixtures/playtest) loads in every module that reads it.
if (!wanted.length) {
  const r = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/playtest-pack.test.mjs')], { cwd: root, encoding: 'utf8' });
  console.log(`playtest data: ${(r.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ')}`);
  if (r.status !== 0) fail('playtest-pack', `tests failed\n${r.stdout.split('\n').filter(l => /^not ok/.test(l)).join('\n')}`);
  // scripts/validate-content.mjs (authored content through the real validators) keeps working.
  const c = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/validate-content.test.mjs')], { cwd: root, encoding: 'utf8' });
  console.log(`content validator: ${(c.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ')}`);
  if (c.status !== 0) fail('validate-content', `tests failed\n${c.stdout.split('\n').filter(l => /^not ok/.test(l)).join('\n')}`);
  const vr = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/version-rules.test.mjs')], { cwd: root, encoding: 'utf8' });
  console.log(`version rules: ${(vr.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ')}`);
  if (vr.status !== 0) fail('version-rules', `tests failed\n${vr.stdout.split('\n').filter(x => /^not ok/.test(x)).join('\n')}`);
  const l = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/ui-lint.test.mjs')], { cwd: root, encoding: 'utf8' });
  console.log(`ui lint rules: ${(l.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ')}`);
  if (l.status !== 0) fail('ui-lint', `tests failed\n${l.stdout.split('\n').filter(x => /^not ok/.test(x)).join('\n')}`);
}

// Shared files are copied into modules and must not drift: the Actors launcher helper
// (player-facing modules), the UI kit stylesheet (every module), the dialog helper, the HTML helper and the
// item-drop helper (modules that accept item drops) and the folder helper (modules that create world documents).
for (const shared of ['ag-launchers.mjs', 'ag-ui.css', 'ag-dialogs.mjs', 'ag-html.mjs', 'ag-item-drop.mjs', 'ag-folders.mjs']) {
  const copies = fs.readdirSync(modulesDir).sort()
    .flatMap(id => walk(path.join(modulesDir, id)).filter(f => path.basename(f) === shared));
  if (new Set(copies.map(f => fs.readFileSync(f, 'utf8'))).size > 1) {
    fail(shared, `copies differ; keep them identical:\n  ${copies.map(f => path.relative(root, f)).join('\n  ')}`);
  }
}

// UI drift lint (every rule strict; per-module exceptions in scripts/ui-lint.mjs).
const lint = await runUiLint(wanted);
for (const note of lint.notes) console.log(`ui lint note: ${note}`);
for (const problem of lint.failures) fail('ui-lint', problem);
console.log(`ui lint: ${lint.failures.length ? `${lint.failures.length} problem(s)` : 'ok'}`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
