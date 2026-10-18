// Checks every module (or the ones named on the command line):
//   - module.json is valid and its manifest/download URLs match its id and version
//   - every runtime script parses
//   - the module's automated tests pass
// Usage: node scripts/check.mjs [module-id ...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  const expected = {
    manifest: `https://raw.githubusercontent.com/${REPO}/main/modules/${id}/module.json`,
    download: `https://github.com/${REPO}/releases/download/${id}-v${v}/${id}.zip`,
  };
  for (const [key, url] of Object.entries(expected)) {
    if (manifest[key] !== url) fail(id, `${key} should be ${url}`);
  }
  for (const file of [...(manifest.esmodules ?? []), ...(manifest.styles ?? [])]) {
    if (!fs.existsSync(path.join(dir, file))) fail(id, `module.json lists missing file ${file}`);
  }

  // Legacy macros are Foundry macro bodies (top-level return/await), not modules, so skip them.
  for (const file of walk(dir).filter(f => /\.(m?js)$/.test(f) && !f.includes(`${path.sep}macros${path.sep}`))) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) fail(id, `syntax error in ${path.relative(dir, file)}\n${r.stderr}`);
  }

  const testDir = ['tests', 'test'].map(d => path.join(dir, d)).find(d => fs.existsSync(d));
  const testFiles = testDir ? fs.readdirSync(testDir).filter(f => /\.test\.m?js$/.test(f)).map(f => path.join(testDir, f)) : [];
  if (testFiles.length) {
    const r = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: dir, encoding: 'utf8' });
    const summary = (r.stdout.match(/^# (pass|fail) \d+$/gm) ?? []).join(', ');
    console.log(`${id} ${v}: ${summary}`);
    if (r.status !== 0) fail(id, `tests failed\n${r.stdout.split('\n').filter(l => /^not ok/.test(l)).join('\n')}`);
  } else {
    console.log(`${id} ${v}: no automated tests`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
