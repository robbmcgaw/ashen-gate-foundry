// UI drift check for the shared kit (styles/ag-ui.css), run by scripts/check.mjs. Reads files as text with
// regexes, like the rest of check.mjs. Every module rule is strict: its count must be 0 in every module,
// new modules included. STRICT_EXCEPTIONS (below) keeps a rule as a ratchet for one named module: the count
// it lists may go down, never up. It may only name modules that exist.
// A CSS line can opt out of a rule marked "allow" (colour literals, px boxes) with /* ag-lint-allow: reason */
// on the same line; a script line can opt a custom DialogV2 out with // ag-lint-allow: reason, as long as the
// call's options carry the ag-dialog class. The reason must be at least three words.
// Usage: node scripts/ui-lint.mjs
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const modulesDir = path.join(root, 'modules');
const MANAGER = 'ashen-gate-manager';
const SKIN_FILES = ['styles/skins/stone-tablet.css', 'styles/skins/tome-pages.css'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (dir, f) => path.relative(dir, f).split(path.sep).join('/');
const isTest = r => /^(tests?|fixtures|macros|samples|vendor)\//.test(r);
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
/** The reason after each ag-lint-allow on a line, or null when the line has none. */
const allowReasons = line => [...line.matchAll(/ag-lint-allow\b:?([^\n]*?)(?=\*\/|$)/g)].map(m => m[1].trim());
const goodReason = r => r.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length >= 3;
const allowed = line => { const r = allowReasons(line); return r.length > 0 && r.every(goodReason); };
/** DialogV2 opened directly; allowed only on a line marked ag-lint-allow whose call options (next few lines) carry ag-dialog. */
function directDialogs(text) {
  const lines = text.split('\n');
  let n = 0;
  lines.forEach((line, i) => {
    const hits = (line.match(/DialogV2\.(?:confirm|prompt|wait)\(|\bnew\s+(?:[\w$]+\.)*DialogV2\(/g) ?? []).length;
    if (!hits) return;
    if (allowed(line) && /['"`]ag-dialog['"`]/.test(lines.slice(i, i + 6).join('\n'))) return;
    n += hits;
  });
  return n;
}

/** Kit block classes (".ag-btn--primary" and ".ag-btn__x" count as "ag-btn"), read from ag-ui.css. */
export function kitBlocks(kitCss) {
  const css = stripComments(kitCss);
  return new Set([...css.matchAll(/\.(ag-[a-z0-9-]+?)(?=__|--|[^a-z0-9-]|$)/g)].map(m => m[1]));
}
const blockOf = cls => cls.replace(/(__|--).*$/, '');

/** Selectors of top-level and @media/@container-nested rules (comments stripped). */
function selectors(css) {
  const out = [];
  for (const m of stripComments(css).matchAll(/([^{}@;]+)\{/g)) {
    const sel = m[1].trim();
    if (sel && !/^(from|to|\d+%)/.test(sel)) out.push(sel);
  }
  return out;
}

// Status words (Alpha, Beta, Preview as a status, ...) in user-visible text. Scanned: module.json title and
// description, and every runtime script/template line outside comments (so settings names and hints, Help text,
// notices, labels and templates). A word joined to a code token by "-", "_", "/", "." or "$" is an identifier, not
// copy: internal contract ids such as 'ag-utilities/0.2-alpha' and CSS names like --agu-ov-alpha keep their names.
// "Preview" counts only as a status ("(Preview)", "early preview", "preview build"), not the feature (Player preview).
// Not covered: JSON data files, CSS content, README/CHANGELOG and test fixtures.
export const STATUS_WORD = /(?<![\w$./-])(?:alpha|beta|experimental|coming soon|runtime unverified|work in progress|wip|\(preview\)|(?:tech|early|public) preview|preview (?:build|release|version|feature))(?![\w$/-]|\.\w)/gi;
const stripCodeComments = text => text
  .replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}|<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//gm, (m, pre) => pre + m.slice(pre.length).replace(/[^\n]/g, ' '))
  .replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, '$1');
export const statusWords = text => (stripCodeComments(text).match(STATUS_WORD) ?? []).length;

// ---------- Rules over one module's own files ----------
// Each returns a count for a module (module CSS = styles/**/*.css except the kit and Manager's skins).
export const RULES = {
  'css-colour-literal': {allow: true, css: line => (line.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g) ?? []).length},
  'css-raw-font-size': {css: line => (line.match(/font-size\s*:\s*[\d.]+(?:px|rem|em)\b/g) ?? []).length + (line.match(/\bfont\s*:[^;]*?\b[\d.]+(?:px|rem|em)\b/g) ?? []).length},
  'css-legacy-alias': {css: line => (line.match(/var\(--ag-(?:bg|panel)\)/g) ?? []).length},
  'css-viewport-media': {css: line => (line.match(/@media[^{]*\((?:max|min)-width/g) ?? []).length},
  'css-raw-px-box': {allow: true, css: line => (line.match(/(?:^|[;{\s])(?:padding|gap|margin|height|width|min-height|min-width|max-height|max-width|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block))?\s*:[^;}]*?\b\d*\.?\d+px\b/g) ?? []).length},
  'css-kit-prefix-class': {}, // counted in lintModule from selectors
  'js-dialogv2-direct': {code: directDialogs},
  'fa-legacy-prefix': {code: text => (text.match(/class=["'`](?:fas|far) /g) ?? []).length + (text.match(/class=["'`][^"'`]*\s(?:fas|far)\s/g) ?? []).length},
  'header-brand-version': {code: text => {
    let n = 0;
    for (const m of text.matchAll(/class=["'`]ag-header(?=[\s"'`])/g)) {
      const end = text.indexOf('</header>', m.index);
      const block = text.slice(m.index, end > 0 ? end : m.index + 1500);
      // The one exception (docs/ui-ux-guidelines.md): the Character Hub's header shows the character's name
      // (agch-head__name); its brand is the window title. The version is still required.
      const branded = block.includes('ag-header__brand') || block.includes('agch-head__name');
      if (!branded || !block.includes('ag-version')) n++;
    }
    return n;
  }},
  'button-title-attr': {code: text => (text.match(/<button\b[^>]*\stitle=/g) ?? []).length},
  'status-wording': {code: statusWords, manifest: json => statusWords([json.title, json.description].filter(Boolean).join('\n')),
    message: "Status words don't belong in the UI; discuss them in chat."},
  // ag-lint-allow must say why, in at least three words (CSS and scripts/templates).
  'lint-allow-reason': {raw: true, css: line => allowReasons(line).filter(r => !goodReason(r)).length,
    code: text => text.split('\n').reduce((n, line) => n + allowReasons(line).filter(r => !goodReason(r)).length, 0)},
};

// Rules kept as a ratchet for one module only, {moduleId: {rule: highest allowed count}}. The count may go down
// (lower it here when it does), never up. Each entry needs a follow-up in docs/ui-audit-2026-10.md.
export const STRICT_EXCEPTIONS = {};

/** Compares one module's counts with zero, or with its exception count. Returns {failures, notes}. */
export function judgeModule(id, {counts, where}, exceptions = STRICT_EXCEPTIONS) {
  const failures = [], notes = [];
  for (const [rule, n] of Object.entries(counts)) {
    const limit = exceptions[id]?.[rule];
    if (limit === undefined) {
      if (n > 0) failures.push(`${id}: ${rule} must be 0, found ${n}: ${where[rule].slice(0, 8).join(', ')}${RULES[rule]?.message ? `. ${RULES[rule].message}` : ''}`);
    } else if (n > limit) {
      failures.push(`${id}: ${rule} went up from ${limit} to ${n} (exception: the count may only go down): ${where[rule].slice(0, 8).join(', ')}`);
    } else if (n < limit) {
      notes.push(`${id}: ${rule} went down from ${limit} to ${n}; lower (or remove) its STRICT_EXCEPTIONS entry in scripts/ui-lint.mjs`);
    }
  }
  return {failures, notes};
}

/** The exception list may only name modules that exist and rules that exist. */
export function checkExceptions(moduleIds, exceptions = STRICT_EXCEPTIONS) {
  const have = new Set(moduleIds), problems = [];
  for (const [id, rules] of Object.entries(exceptions)) {
    if (!have.has(id)) problems.push(`STRICT_EXCEPTIONS lists ${id}, which is not a module; remove it`);
    for (const rule of Object.keys(rules)) if (!RULES[rule]) problems.push(`STRICT_EXCEPTIONS lists unknown rule ${rule} for ${id}`);
  }
  return problems;
}

/** Module CSS files (not the kit, not Manager's structural skins) and runtime scripts/templates (not tests). */
function moduleFiles(dir) {
  const files = walk(dir).map(f => ({f, r: rel(dir, f)})).filter(({r}) => !isTest(r));
  return {
    css: files.filter(({r}) => r.endsWith('.css') && !r.endsWith('ag-ui.css') && !r.startsWith('styles/skins/')),
    code: files.filter(({r}) => /\.(m?js|hbs|html)$/.test(r) && !/(^|\/)ag-dialogs\.mjs$/.test(r)),
  };
}

export function lintModule(dir, kit) {
  const counts = Object.fromEntries(Object.keys(RULES).map(k => [k, 0]));
  const where = Object.fromEntries(Object.keys(RULES).map(k => [k, []]));
  const {css, code} = moduleFiles(dir);
  for (const {f, r} of css) {
    const raw = fs.readFileSync(f, 'utf8');
    const lines = raw.split('\n'), clean = stripComments(raw).split('\n');
    clean.forEach((line, i) => {
      for (const [k, rule] of Object.entries(RULES)) {
        if (!rule.css || (rule.allow && allowed(lines[i]))) continue;
        const n = rule.css(rule.raw ? lines[i] : line);
        if (n) { counts[k] += n; where[k].push(`${r}:${i + 1}`); }
      }
    });
    // A class the module styles (in a selector's key compound) must not use the kit's "ag-" prefix unless it is a kit class.
    for (const sel of selectors(raw)) {
      for (const one of sel.split(/,(?![^(]*\))/)) {
        const key = one.trim().split(/\s*[>+~]\s*|\s+(?![^(]*\))/).pop() ?? '';
        for (const [, cls] of key.replace(/:(?:where|is|not|has)\([^)]*\)/g, '').matchAll(/\.(ag-[a-z0-9_-]+)/g)) {
          if (!kit.has(blockOf(cls))) { counts['css-kit-prefix-class']++; where['css-kit-prefix-class'].push(`${r}: .${cls}`); }
        }
      }
    }
  }
  const manifestPath = path.join(dir, 'module.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [k, rule] of Object.entries(RULES)) {
      const n = rule.manifest?.(manifest) ?? 0;
      if (n) { counts[k] += n; where[k].push(`module.json (${n})`); }
    }
  }
  for (const {f, r} of code) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [k, rule] of Object.entries(RULES)) {
      if (!rule.code) continue;
      const n = rule.code(text);
      if (n) { counts[k] += n; where[k].push(`${r} (${n})`); }
    }
  }
  return {counts, where};
}

// ---------- Kit-wide strict rules ----------
const names = block => [...block.matchAll(/(--ag-[a-z0-9-]+)\s*:/g)].map(m => m[1]).sort();

/** Both size sets (:root Compact and html[data-ag-size="comfortable"]) list the same size tokens. */
export function checkSizeSets(kitCss) {
  const css = stripComments(kitCss);
  const comfy = css.match(/html\[data-ag-size="comfortable"\]\s*\{([^}]*)\}/);
  if (!comfy) return ['ag-ui.css has no html[data-ag-size="comfortable"] block'];
  const rootBlocks = [...css.matchAll(/(?:^|\})\s*:root\s*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
  const size = new Set(names(comfy[1]));
  const sizeLike = names(rootBlocks).filter(n => /^--ag-(?:text-(?:xs|sm|md|lg|xl)|space-\d|control-h|icon|slot|portrait|row-h)/.test(n));
  const problems = [];
  for (const n of sizeLike) if (!size.has(n)) problems.push(`size token ${n} is in :root (Compact) but not in the Comfortable set`);
  for (const n of size) if (!names(rootBlocks).includes(n)) problems.push(`size token ${n} is in the Comfortable set but not in :root`);
  if ([...size].some(n => n.includes('radius'))) problems.push('radius tokens are shape, not size: keep them out of the Comfortable set');
  return problems;
}

/** Every kit block class is mentioned (rule or the "keep the kit look" comment) in both structural skin files. */
export function checkSkinCoverage(kitCss, skins) {
  const problems = [];
  for (const [file, css] of Object.entries(skins)) {
    for (const block of kitBlocks(kitCss)) {
      if (!new RegExp(`\\.${block}(?![a-z0-9]|-(?!-))`).test(css)) problems.push(`${file} does not mention kit part .${block}`);
    }
  }
  return problems;
}

// WCAG contrast. Rarity ink is mixed in OKLab like the kit's color-mix(in oklab, hue 72%, text).
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const unlin = v => v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055;
const lum = c => { const [r, g, b] = c.map(lin); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const toOklab = c => {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
};
const fromOklab = ([L, A, B]) => {
  const l = (L + .3963377774 * A + .2158037573 * B) ** 3, m = (L - .1055613458 * A - .0638541728 * B) ** 3, s = (L - .0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s]
    .map(v => Math.min(1, Math.max(0, unlin(v))));
};
const mixOklab = (a, b, p) => { const x = toOklab(a), y = toOklab(b); return fromOklab(x.map((v, i) => v * p + y[i] * (1 - p))); };

const mixSrgb = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));
let derivedRules = null;
/** Resolves a kit token: base tokens from the skin, derived ones from the kit's color-mix(in srgb, ...) and var() rules. */
function derived(name, base) {
  const rule = derivedRules.get(name);
  if (!rule) return base(name);
  if (rule.alias) return derived(rule.alias, base);
  return mixSrgb(derived(rule.a, base), derived(rule.b, base), rule.p);
}
function readDerivedRules(kitCss) {
  const rules = new Map();
  for (const m of kitCss.matchAll(/(--ag-[a-z-]+):\s*color-mix\(in srgb, var\((--ag-[a-z-]+)\) (\d+)%, var\((--ag-[a-z-]+)\)\)/g)) rules.set(m[1], {a: m[2], p: Number(m[3]) / 100, b: m[4]});
  for (const m of kitCss.matchAll(/(--ag-[a-z-]+):\s*var\((--ag-[a-z-]+)\);/g)) if (!rules.has(m[1])) rules.set(m[1], {alias: m[2]});
  return rules;
}
// Fills the structural skins (styles/skins/*.css) paint instead of the kit's soft tones; keep in step with those files.
const SKIN_TONE_FILLS = {
  'ag-stone-tablet': Object.fromEntries([...['accent', 'ok', 'warn', 'danger'].map(t => [t, d => mixSrgb(d(`--ag-${t}`), d('--ag-surface-sunken'), .14)]),
    ['dangerButton', d => mixSrgb(d('--ag-danger'), d('--ag-surface-sunken'), .14)]]),
  'ag-tome-pages': {dangerButton: d => d('--ag-surface-sunken'), selectedRow: d => mixSrgb(d('--ag-accent'), d('--ag-surface'), .10)},
};

/** Text pairs of every skin (from Manager's skin tables) reach 4.5:1. */
export async function checkContrast(managerDir, kitCss) {
  const {createAppearanceController} = await import(pathToFileURL(path.join(managerDir, 'scripts', 'appearance.js')).href);
  const controller = createAppearanceController({currentUser: () => ({id: 'lint'}), getSetting: () => '', setSetting: async () => {}});
  const rarity = Object.fromEntries([...kitCss.matchAll(/--ag-rarity-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], rgb(m[2])]));
  // Share of the hue in each ink token, read from the kit: color-mix(in oklab, var(--ag-rarity-x) N%, var(--ag-text)).
  const inkShare = key => Number(kitCss.match(new RegExp(`--ag-rarity-ink-${key}:\\s*color-mix\\(in oklab, var\\(--ag-rarity-${key}\\) (\\d+)%`))?.[1] ?? NaN) / 100;
  derivedRules = readDerivedRules(kitCss);
  const problems = [], table = [];
  for (const {id} of controller.listSkins()) {
    const t = new Map();
    createAppearanceController({currentUser: () => ({id: 'lint'}), getSetting: k => k === 'worldSkin' ? id : '', setSetting: async () => {}})
      .applyTo({style: {setProperty: (k, v) => t.set(k, v)}, dataset: {}});
    const c = k => rgb(t.get(k));
    const pairs = [];
    for (const bg of ['--ag-surface', '--ag-surface-sunken', '--ag-surface-raised']) {
      for (const fg of ['--ag-text', '--ag-muted', '--ag-accent', '--ag-ok', '--ag-warn', '--ag-danger']) pairs.push([fg, bg, c(fg), c(bg)]);
    }
    pairs.push(['--ag-accent-contrast', '--ag-accent', c('--ag-accent-contrast'), c('--ag-accent')]);
    pairs.push(['--ag-surface', '--ag-danger', c('--ag-surface'), c('--ag-danger')]);
    for (const [key, hue] of Object.entries(rarity)) {
      if (key === 'common') continue; // ink-common is --ag-muted, checked above
      const ink = mixOklab(hue, c('--ag-text'), inkShare(key));
      for (const bg of ['--ag-surface', '--ag-surface-sunken', '--ag-surface-raised']) pairs.push([`--ag-rarity-ink-${key}`, bg, ink, c(bg)]);
    }
    // Kit parts on tinted fills (kit 2.1.0): tone text on its soft fill (badges, danger button), secondary text on
    // selected/striped/hover rows and disabled row titles. Derived tokens are resolved from the kit's own color-mix rules.
    const d = k => derived(k, c);
    const over = (fg, pct, bg) => mixSrgb(d(fg), d(bg), pct / 100);
    const fills = {
      '--ag-row-alt over --ag-surface-raised': over('--ag-text', 5, '--ag-surface-raised'),
      '--ag-row-alt over --ag-surface': over('--ag-text', 5, '--ag-surface'),
    };
    const tone = t => SKIN_TONE_FILLS[id]?.[t] ? SKIN_TONE_FILLS[id][t](d) : d(`--ag-${t}-soft`);
    for (const t of ['accent', 'ok', 'warn', 'danger']) pairs.push([`--ag-${t}-ink`, `${t} badge fill`, d(`--ag-${t}-ink`), tone(t)]);
    pairs.push(['--ag-danger-ink', 'danger button fill', d('--ag-danger-ink'), SKIN_TONE_FILLS[id]?.dangerButton?.(d) ?? d('--ag-danger-soft')]);
    pairs.push(['--ag-muted', 'plain badge fill', d('--ag-muted'), d('--ag-surface-sunken')]);
    const selected = SKIN_TONE_FILLS[id]?.selectedRow?.(d) ?? d('--ag-row-selected');
    for (const [name, bg] of [['selected row', selected], ['hover row', d('--ag-surface-hover')], ...Object.entries(fills)]) {
      pairs.push(['--ag-muted-strong', name, d('--ag-muted-strong'), bg]);
    }
    for (const bg of ['--ag-surface', '--ag-surface-raised']) pairs.push(['--ag-muted-strong (disabled row title)', bg, d('--ag-muted-strong'), d(bg)]);
    for (const [fg, bg, a, b] of pairs) {
      const r = contrast(a, b);
      table.push({skin: id, fg, bg, ratio: Math.round(r * 100) / 100});
      if (r < 4.5) problems.push(`${id}: ${fg} on ${bg} is ${r.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
  return {problems, table};
}

// ---------- Runner ----------
/** Lints the given modules (all when empty). Returns {failures, notes, counts}. */
export async function runUiLint(ids = []) {
  const all = fs.readdirSync(modulesDir).filter(id => fs.existsSync(path.join(modulesDir, id, 'module.json'))).sort();
  const wanted = ids.length ? all.filter(id => ids.includes(id)) : all;
  const kitPath = path.join(modulesDir, MANAGER, 'styles', 'ag-ui.css');
  const kitCss = fs.readFileSync(kitPath, 'utf8');
  const kit = kitBlocks(kitCss);
  const failures = checkExceptions(all), notes = [], counts = {};
  for (const id of wanted) {
    const result = lintModule(path.join(modulesDir, id), kit);
    counts[id] = result.counts;
    const judged = judgeModule(id, result);
    failures.push(...judged.failures);
    notes.push(...judged.notes);
  }
  if (!ids.length || ids.includes(MANAGER)) {
    const managerDir = path.join(modulesDir, MANAGER);
    for (const p of checkSizeSets(kitCss)) failures.push(`ag-ui.css: ${p}`);
    const skins = Object.fromEntries(SKIN_FILES.map(f => [f, fs.readFileSync(path.join(managerDir, f), 'utf8')]));
    for (const p of checkSkinCoverage(kitCss, skins)) failures.push(`${MANAGER}: ${p}`);
    for (const p of (await checkContrast(managerDir, kitCss)).problems) failures.push(`${MANAGER} contrast: ${p}`);
  }
  return {failures, notes, counts};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const {failures, notes, counts} = await runUiLint();
  if (process.argv.includes('--counts')) for (const [id, c] of Object.entries(counts)) console.log(id, JSON.stringify(c));
  for (const n of notes) console.log(`note: ${n}`);
  if (failures.length) { console.error(`${failures.length} UI lint problem(s):\n- ${failures.join('\n- ')}`); process.exitCode = 1; }
  else console.log('UI lint passed.');
}
