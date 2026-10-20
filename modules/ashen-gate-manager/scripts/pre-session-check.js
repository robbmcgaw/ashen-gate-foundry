/**
 * Pre-session check: a GM-only, strictly read-only health report to run before a live session. It only calls the
 * partner modules' public read APIs (feature-detected through game.modules.get(id)?.api) and reads world documents;
 * it never creates, updates or deletes a document and never writes a setting or flag. Pure logic with injected
 * Foundry globals so the Node suite can cover it.
 */
import {inspectPlayerModule} from './player-access.js';

const MODULE_ID = 'ashen-gate-manager';
export const STATUS = Object.freeze({pass: 'PASS', warn: 'WARN', fail: 'FAIL', na: 'N-A'});
export const EXPECTED_ENV = Object.freeze({generation: 14, build: 367, system: 'dnd5e', systemVersion: '6.0.6'});
/** Ashen Gate modules and the lowest version whose public API Manager relies on (null: Manager needs none). */
export const AG_MODULES = Object.freeze([
  {id: 'ashen-gate-manager', title: 'General Manager', min: null},
  {id: 'ashen-gate-locations', title: 'Locations', min: '1.3.0', why: 'Location import and player previews'},
  {id: 'ashen-gate-quest-manager', title: 'Quest Log', min: '0.6.0', why: 'quest import'},
  {id: 'ashen-gate-skill-trees', title: 'Skill Trees', min: '0.7.0', why: 'skill tree import'},
  {id: 'ashen-gate-factions', title: 'Renown', min: '0.7.0', why: 'faction import'},
  {id: 'ashen-gate-headquarters', title: 'Headquarters', min: '0.7.0', why: 'facility import'},
  {id: 'ashen-gate-profession-ledger', title: 'Profession Ledger', min: null},
  {id: 'ashen-gate-utilities', title: 'Utilities', min: null}
]);
const TITLES = Object.fromEntries(AG_MODULES.map(m => [m.id, m.title]));
const LOCATIONS_MIGRATION_VERSION = '1.8.0';
const OBSERVER = 2;
const TEST_TAG = '[TEST]';

/** -1 / 0 / 1 for dotted versions; unknown parts count as 0. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map(n => parseInt(n, 10) || 0), pb = String(b ?? '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

const row = (check, status, text) => ({check, status, text});
const errText = error => String(error?.message ?? error);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listOf = value => [...(value?.contents ?? value ?? [])];
const players = game => listOf(game.users).filter(u => !u.isGM);
/** The module's API when it is installed and active, plus its state for "not installed"/"not active" rows. */
function partner(game, id) {
  const mod = game.modules?.get?.(id);
  if (!mod) return {mod: null, api: null, state: 'not installed'};
  if (!mod.active) return {mod, api: null, state: 'not active'};
  return {mod, api: mod.api ?? null, state: 'active'};
}
const has = (api, ...names) => Boolean(api) && names.every(n => typeof api[n] === 'function');

/** True when a player can read the document: default Observer, or any player user granted Observer or better. */
export function visibleToPlayers(doc, users, parentVisible = false) {
  const own = doc?.ownership ?? {};
  if (own.default === -1 && parentVisible) return true;
  if ((own.default ?? 0) >= OBSERVER) return true;
  return users.some(u => typeof doc?.testUserPermission === 'function' ? doc.testUserPermission(u, 'OBSERVER') : (own[u.id] ?? 0) >= OBSERVER);
}

// ---------- 1. Module versions ----------
function checkVersions(game) {
  const C = 'Module versions';
  const known = new Set(AG_MODULES.map(m => m.id));
  const extra = listOf(game.modules?.values?.()).filter(m => String(m?.id ?? '').startsWith('ashen-gate-') && !known.has(m.id))
    .map(m => ({id: m.id, title: m.title ?? m.id, min: null}));
  return [...AG_MODULES, ...extra].map(({id, title, min, why}) => {
    const {mod, state} = partner(game, id);
    if (!mod) return row(C, STATUS.na, `${title} is not installed.`);
    const v = mod.version ?? 'unknown';
    if (state !== 'active') return row(C, STATUS.warn, `${title} ${v} is installed but not active.`);
    if (min && compareVersions(v, min) < 0) return row(C, STATUS.warn, `${title} ${v} is older than ${min}, which Manager needs for ${why}. Update it.`);
    return row(C, STATUS.pass, `${title} ${v} is active.`);
  });
}

// ---------- 2. GM storage ----------
const STORES = [
  {id: 'ashen-gate-locations', label: 'Locations GM Data', fns: ['listLocations'], read: api => {
    const list = api.listLocations();
    if (!Array.isArray(list)) throw new Error('listLocations did not return a list');
    return {count: list.length, noun: 'location'};
  }},
  {id: 'ashen-gate-quest-manager', label: 'Quest GM sources', fns: ['listQuests', 'getGMSource'], read: api => {
    const list = api.listQuests();
    if (!Array.isArray(list)) throw new Error('listQuests did not return a list');
    const unreadable = list.filter(q => !api.getGMSource(q.id)).map(q => q.id);
    if (unreadable.length) throw new Error(`no readable GM source for ${unreadable.join(', ')}`);
    return {count: list.length, noun: 'quest'};
  }},
  {id: 'ashen-gate-skill-trees', label: 'Skill Trees definitions', fns: ['listTrees'], read: api => {
    const list = api.listTrees();
    if (!Array.isArray(list)) throw new Error('listTrees did not return a list');
    return {count: list.length, noun: 'tree', emptyHint: 'the GM storage Journal may be missing: open Skill Trees > GM Setup and click Initialize GM Storage'};
  }},
  {id: 'ashen-gate-factions', label: 'Renown definitions', fns: ['getFactions'], read: api => {
    const list = api.getFactions();
    if (!Array.isArray(list)) throw new Error('getFactions did not return a list');
    return {count: list.length, noun: 'faction'};
  }},
  {id: 'ashen-gate-headquarters', label: 'Headquarters vault', fns: ['exportState'], read: api => {
    const state = api.exportState();
    if (!state || typeof state !== 'object') throw new Error('exportState returned nothing');
    if (!Array.isArray(state.catalog)) throw new Error('the GM state has no facility catalog');
    return {count: state.catalog.length, noun: 'facility definition'};
  }}
];
function checkStorage(game) {
  const C = 'GM storage';
  return STORES.map(({id, label, fns, read}) => {
    const {mod, api, state} = partner(game, id);
    if (!mod || state !== 'active') return row(C, STATUS.na, `${label}: ${TITLES[id]} is ${state}.`);
    if (!has(api, ...fns)) return row(C, STATUS.fail, `${label}: ${[TITLES[id], mod.version].filter(Boolean).join(' ')} has no read API (${fns.join(', ')}); update it.`);
    try {
      const {count, noun, emptyHint} = read(api);
      if (!count) return row(C, STATUS.warn, `${label} loads but is empty${emptyHint ? `; ${emptyHint}` : ''}.`);
      return row(C, STATUS.pass, `${label} loads (${plural(count, noun)}).`);
    } catch (error) { return row(C, STATUS.fail, `${label} could not be read: ${errText(error)}.`); }
  });
}

// ---------- 3. Player Access ----------
const PLAYER_MODULES = ['ashen-gate-locations', 'ashen-gate-quest-manager', 'ashen-gate-skill-trees', 'ashen-gate-factions',
  'ashen-gate-headquarters', 'ashen-gate-profession-ledger', 'ashen-gate-utilities'];
async function checkPlayerAccess(game) {
  const C = 'Player Access';
  const out = [];
  for (const id of PLAYER_MODULES) {
    const title = TITLES[id];
    const mod = game.modules?.get?.(id);
    if (!mod) { out.push(row(C, STATUS.na, `${title}: not installed.`)); continue; }
    // inspectPlayerModule only calls the module's playerAccess.getState(); it never writes.
    const info = await inspectPlayerModule(mod);
    if (!info.active) out.push(row(C, STATUS.na, `${title}: not active, so players have no launcher.`));
    else if (info.state === 'Visible') out.push(row(C, STATUS.pass, `${title}: Player Access on; players see its launcher.`));
    else if (info.state === 'Hidden') out.push(row(C, STATUS.warn, `${title}: Player Access off; players will not see its launcher.`));
    else if (info.state === 'GM only') out.push(row(C, STATUS.na, `${title}: GM only, no player launcher.`));
    else out.push(row(C, STATUS.warn, `${title}: Player Access could not be read (${info.reason})`));
  }
  return out;
}

// ---------- shared reads for 4 and 5 ----------
function readLocations(game) {
  const {api} = partner(game, 'ashen-gate-locations');
  if (!has(api, 'listLocations')) return null;
  try { return api.listLocations(); } catch { return null; }
}
function readQuests(game) {
  const {api} = partner(game, 'ashen-gate-quest-manager');
  if (!has(api, 'listQuests')) return null;
  try {
    const visible = has(api, 'listVisible') ? new Set(api.listVisible().map(v => v?.id)) : null;
    return api.listQuests().map(q => ({...q, visible: visible ? visible.has(q.id) : null,
      source: has(api, 'getGMSource') ? api.getGMSource(q.id) : null, state: has(api, 'getGMState') ? api.getGMState(q.id) : null}));
  } catch { return null; }
}

// ---------- 4. Test data ----------
function checkTestData(game, ctx) {
  const C = 'Test data';
  const users = players(game);
  const shown = [], hidden = [];
  const add = (kind, name, visible) => (visible ? shown : hidden).push(`${kind} "${name}"`);
  for (const [kind, coll] of [['Item', game.items], ['Actor', game.actors]])
    for (const doc of listOf(coll)) if (String(doc.name ?? '').includes(TEST_TAG)) add(kind, doc.name, visibleToPlayers(doc, users));
  for (const entry of listOf(game.journal)) {
    const entryVisible = visibleToPlayers(entry, users);
    if (String(entry.name ?? '').includes(TEST_TAG)) add('Journal', entry.name, entryVisible);
    for (const page of listOf(entry.pages)) if (String(page.name ?? '').includes(TEST_TAG)) add('Journal page', page.name, visibleToPlayers(page, users, entryVisible));
  }
  for (const loc of ctx.locations ?? []) if (String(loc.name ?? '').includes(TEST_TAG)) add('Location', loc.name, loc.state && loc.state !== 'hidden');
  for (const q of ctx.quests ?? []) if (String(q.name ?? '').includes(TEST_TAG)) add('Quest', q.name, q.visible === true);
  if (shown.length) return [row(C, STATUS.warn, `${plural(shown.length, '[TEST] record')} visible to players: ${shown.join(', ')}.`)];
  if (hidden.length) return [row(C, STATUS.pass, `${plural(hidden.length, '[TEST] record')} in the world, none visible to players.`)];
  return [row(C, STATUS.pass, 'No [TEST] records in the world.')];
}

// ---------- 5. Hidden-content leak scan ----------
/** Names players must not see, by record id (hidden/unidentified locations, unrevealed quests, gm-visibility Items). */
function secretNames(game, ctx) {
  const secrets = [];
  const add = (id, kind, name) => { const n = String(name ?? '').trim(); if (n.length >= 3) secrets.push({id, kind, name: n, lower: n.toLowerCase()}); };
  for (const loc of ctx.locations ?? []) if (loc.state === 'hidden' || loc.state === 'unidentified') add(loc.id, `${loc.state} location`, loc.name);
  for (const q of ctx.quests ?? []) {
    const unrevealed = q.state ? (q.state.status === 'Hidden' || q.source?.visibility === 'gm' || (q.source?.visibility === 'reveal_gated' && !q.state.revealed))
      : q.status === 'Hidden';
    if (unrevealed) add(q.id, 'unrevealed quest', q.name);
  }
  for (const item of listOf(game.items)) {
    const source = item?.flags?.[MODULE_ID]?.source;
    if (source?.visibility === 'gm') add(source.sourceId ?? item.id, 'gm-visibility Item', item.name);
  }
  return secrets;
}
function checkLeaks(game, ctx) {
  const C = 'Leak scan';
  const out = [], outputs = [];
  const loc = partner(game, 'ashen-gate-locations');
  if (!loc.mod || loc.state !== 'active') out.push(row(C, STATUS.na, `Locations is ${loc.state}.`));
  else if (!has(loc.api, 'previewLocation') || !ctx.locations) out.push(row(C, STATUS.na, 'Locations: could not check (no player preview API).'));
  else {
    try {
      for (const l of ctx.locations) if (l.state && l.state !== 'hidden') {
        const view = loc.api.previewLocation(l, l.state);
        if (view) outputs.push({where: `Locations player card ${l.id}`, text: JSON.stringify(view)});
      }
    } catch (error) { out.push(row(C, STATUS.na, `Locations: could not check (${errText(error)}).`)); }
  }
  const quest = partner(game, 'ashen-gate-quest-manager');
  if (!quest.mod || quest.state !== 'active') out.push(row(C, STATUS.na, `Quest Log is ${quest.state}.`));
  else if (!has(quest.api, 'listVisible')) out.push(row(C, STATUS.na, 'Quest Log: could not check (no player view API).'));
  else {
    try { for (const v of quest.api.listVisible()) outputs.push({where: `Quest Log player view ${v?.id ?? '?'}`, text: JSON.stringify(v)}); }
    catch (error) { out.push(row(C, STATUS.na, `Quest Log: could not check (${errText(error)}).`)); }
  }
  for (const id of ['ashen-gate-factions', 'ashen-gate-skill-trees', 'ashen-gate-headquarters']) {
    const p = partner(game, id);
    out.push(row(C, STATUS.na, p.state === 'active' ? `${TITLES[id]}: could not check (no player view API Manager can call).` : `${TITLES[id]} is ${p.state}.`));
  }
  // Manager's own data: a gm-visibility Item that players can open is a leak by itself.
  const users = players(game);
  for (const item of listOf(game.items)) {
    const source = item?.flags?.[MODULE_ID]?.source;
    if (source?.visibility === 'gm' && visibleToPlayers(item, users))
      out.push(row(C, STATUS.fail, `gm-visibility Item ${source.sourceId ?? item.id} is visible to players (Item ownership).`));
  }
  const secrets = secretNames(game, ctx);
  let hits = 0;
  for (const o of outputs) {
    const text = o.text.toLowerCase();
    // Names are not printed: the report may be pasted somewhere players can read. Ids identify the record.
    for (const s of secrets) if (text.includes(s.lower)) { hits++; out.push(row(C, STATUS.fail, `The name of ${s.kind} ${s.id} appears in ${o.where}.`)); }
  }
  if (!hits && outputs.length) out.unshift(row(C, STATUS.pass, `No hidden name in ${plural(outputs.length, 'player view')} (checked against ${plural(secrets.length, 'hidden record')}).`));
  return out;
}

// ---------- 6. Migration state ----------
function checkMigration(game, ctx) {
  const C = 'Migration';
  const {mod, state} = partner(game, 'ashen-gate-locations');
  if (!mod || state !== 'active') return [row(C, STATUS.na, `Locations is ${state}.`)];
  if (compareVersions(mod.version, LOCATIONS_MIGRATION_VERSION) < 0) return [row(C, STATUS.na, `Locations ${mod.version} is older than ${LOCATIONS_MIGRATION_VERSION}; no migration to check.`)];
  if (!ctx.locations) return [row(C, STATUS.na, 'Locations: could not read its GM data, so migration state is unknown.')];
  const list = ctx.locations;
  const unsettled = list.filter(l => typeof l.passConditions !== 'boolean' || (l.published && typeof l.published.passConditions !== 'boolean'));
  const noAudience = list.filter(l => !l.audience?.mode);
  const parents = new Set(list.map(l => l.parentLocationId).filter(Boolean));
  const notice = unsettled.filter(l => l.isRegion && l.conditions?.length && parents.has(l.id) && typeof l.passConditions !== 'boolean');
  const out = [];
  if (unsettled.length) out.push(row(C, STATUS.warn, `Locations inheritance switch not settled on ${plural(unsettled.length, 'location')} (${unsettled.map(l => l.id).join(', ')}). Reload Foundry as the GM so the migration runs.`));
  else out.push(row(C, STATUS.pass, `Locations inheritance switch settled on all ${plural(list.length, 'location')}.`));
  if (noAudience.length) out.push(row(C, STATUS.warn, `Locations audience missing on ${noAudience.map(l => l.id).join(', ')}.`));
  else out.push(row(C, STATUS.pass, 'Locations audience set on every location.'));
  out.push(notice.length ? row(C, STATUS.warn, `A GM notice is pending: on reload Locations will tell you ${plural(notice.length, 'Region')} keep passing conditions (${notice.map(l => l.id).join(', ')}).`)
    : row(C, STATUS.pass, 'No Locations GM notice pending.'));
  return out;
}

// ---------- 7. Foundry environment ----------
function checkEnvironment(game) {
  const C = 'Environment';
  const version = String(game.version ?? game.release?.version ?? '');
  const generation = game.release?.generation ?? parseInt(version, 10);
  const build = game.release?.build ?? parseInt(version.split('.')[1], 10);
  const out = [];
  if (generation === EXPECTED_ENV.generation && build === EXPECTED_ENV.build) out.push(row(C, STATUS.pass, `Foundry ${version} (V${generation} build ${build}).`));
  else out.push(row(C, STATUS.warn, `Foundry ${version || 'unknown'} (V${generation ?? '?'} build ${build ?? '?'}); modules are tested on V${EXPECTED_ENV.generation} build ${EXPECTED_ENV.build}.`));
  const sys = game.system ?? {};
  if (sys.id === EXPECTED_ENV.system && sys.version === EXPECTED_ENV.systemVersion) out.push(row(C, STATUS.pass, `System ${sys.id} ${sys.version}.`));
  else out.push(row(C, STATUS.warn, `System ${[sys.id ?? 'unknown', sys.version].filter(Boolean).join(' ')}; modules are tested on ${EXPECTED_ENV.system} ${EXPECTED_ENV.systemVersion}.`));
  return out;
}

const GROUPS = ['Module versions', 'GM storage', 'Player Access', 'Test data', 'Leak scan', 'Migration', 'Environment'];
/** Plain-text report: header, one line per result under its check, summary line. */
export function reportText({rows, summary, world, date}) {
  const lines = [`Ashen Gate pre-session check — ${world}, ${date}`];
  for (const g of GROUPS) {
    const list = rows.filter(r => r.check === g);
    if (!list.length) continue;
    lines.push('', `${GROUPS.indexOf(g) + 1}. ${g}`, ...list.map(r => `${r.status.padEnd(4)}  ${r.text}`));
  }
  lines.push('', summary);
  return lines.join('\n');
}

/**
 * Runs every check. GM-only: rejects anyone else here, not just in the UI. Read-only: it never writes a document,
 * setting or flag. Each check is isolated, so one failing partner module cannot stop the others.
 */
export async function runPreSessionCheck(game, {now = new Date()} = {}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can run the pre-session check.');
  const ctx = {locations: readLocations(game), quests: readQuests(game)};
  const rows = [];
  const steps = [['Module versions', () => checkVersions(game)], ['GM storage', () => checkStorage(game)],
    ['Player Access', () => checkPlayerAccess(game)], ['Test data', () => checkTestData(game, ctx)],
    ['Leak scan', () => checkLeaks(game, ctx)], ['Migration', () => checkMigration(game, ctx)], ['Environment', () => checkEnvironment(game)]];
  for (const [name, step] of steps) {
    try { rows.push(...await step()); }
    catch (error) { rows.push(row(name, STATUS.fail, `This check could not run: ${errText(error)}.`)); }
  }
  const counts = Object.fromEntries(Object.values(STATUS).map(s => [s, rows.filter(r => r.status === s).length]));
  const verdict = counts.FAIL ? 'Fix the FAIL lines before the session.' : counts.WARN ? 'Ready to play; read the WARN lines.' : 'Ready to play.';
  const summary = `${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL, ${counts['N-A']} N-A. ${verdict}`;
  const world = game.world?.title ?? game.world?.id ?? 'this world';
  const date = now.toISOString().slice(0, 16).replace('T', ' ');
  return {rows, counts, summary, text: reportText({rows, summary, world, date}),
    filename: `AG_PreSession_Check_${now.toISOString().slice(0, 10)}.txt`};
}
