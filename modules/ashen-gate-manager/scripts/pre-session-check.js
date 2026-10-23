/**
 * Pre-session check: a GM-only, strictly read-only health report to run before a live session. It only calls the
 * partner modules' public read APIs (feature-detected through game.modules.get(id)?.api) and reads world documents;
 * it never creates, updates or deletes a document and never writes a setting or flag. Pure logic with injected
 * Foundry globals so the Node suite can cover it.
 */
import {inspectPlayerModule} from './player-access.js';
import {coreRefOf, LINK_FLAG} from './core-links.js';
import {recipeKind} from './profession-records.js';

const MODULE_ID = 'ashen-gate-manager';
export const STATUS = Object.freeze({pass: 'PASS', warn: 'WARN', fail: 'FAIL', na: 'N-A'});
export const EXPECTED_ENV = Object.freeze({generation: 14, build: 367, system: 'dnd5e', systemVersion: '6.0.6'});
/**
 * Ashen Gate modules and the lowest version whose public API Manager relies on (null: Manager needs none). Locations is
 * checked by its API (`needs`), never by number: it was renumbered from 1.18.0 to 0.18.0, so a version compare would
 * call a current Locations too old.
 */
export const AG_MODULES = Object.freeze([
  {id: 'ashen-gate-manager', title: 'General Manager', min: null},
  {id: 'ashen-gate-locations', title: 'Locations', min: null, needs: ['importLocations', 'previewLocation', 'setLocationState', 'publishLocation'], why: 'Location import and player previews'},
  {id: 'ashen-gate-quest-manager', title: 'Quest Log', min: '0.6.0', why: 'quest import'},
  {id: 'ashen-gate-skill-trees', title: 'Skill Trees', min: '0.7.0', why: 'skill tree import'},
  {id: 'ashen-gate-factions', title: 'Renown', min: '0.7.0', why: 'faction import'},
  {id: 'ashen-gate-headquarters', title: 'Headquarters', min: '0.7.0', why: 'facility import'},
  {id: 'ashen-gate-profession-ledger', title: 'Profession Ledger', min: null},
  {id: 'ashen-gate-utilities', title: 'Utilities', min: null},
  {id: 'ashen-gate-character-hub', title: 'Character Hub', min: null},
  {id: 'ashen-gate-cinders', title: 'Cinders', min: null}
]);
const TITLES = Object.fromEntries(AG_MODULES.map(m => [m.id, m.title]));
/** API that Locations' inheritance/audience migration (old 1.8.0, so every 0.18.0+) came with: present means there is a migration to check. */
const LOCATIONS_MIGRATION_API = ['moveLocation', 'setAudience'];
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
/** Long lists stop after `max` entries: "A, B, C and 12 more". */
export const LIST_CAP = 10;
export function capList(list, max = LIST_CAP) {
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} and ${list.length - max} more` : shown;
}
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
  return [...AG_MODULES, ...extra].map(({id, title, min, needs, why}) => {
    const {mod, api, state} = partner(game, id);
    if (!mod) return row(C, STATUS.na, `${title} is not installed.`);
    const v = mod.version ?? 'unknown';
    if (state !== 'active') return row(C, STATUS.warn, `${title} ${v} is installed but not active.`);
    const missing = (needs ?? []).filter(n => typeof api?.[n] !== 'function');
    if (missing.length) return row(C, STATUS.warn, `${title} ${v} does not offer ${missing.join(', ')}, which Manager needs for ${why}. Update it.`);
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
  'ashen-gate-headquarters', 'ashen-gate-profession-ledger', 'ashen-gate-utilities', 'ashen-gate-character-hub', 'ashen-gate-cinders'];
/** Modules that may have no Player Access switch at all: without a playerAccess API they are N-A, not a warning. */
const NO_ACCESS_REASON = {'ashen-gate-character-hub': 'no Player Access switch; players open it as the sheet of a character they own'};
async function checkPlayerAccess(game) {
  const C = 'Player Access';
  const out = [];
  for (const id of PLAYER_MODULES) {
    const title = TITLES[id];
    const mod = game.modules?.get?.(id);
    if (!mod) { out.push(row(C, STATUS.na, `${title}: not installed.`)); continue; }
    if (mod.active && NO_ACCESS_REASON[id] && !mod.api?.playerAccess) { out.push(row(C, STATUS.na, `${title}: ${NO_ACCESS_REASON[id]}.`)); continue; }
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
  const {mod, api, state} = partner(game, 'ashen-gate-locations');
  if (!mod || state !== 'active') return [row(C, STATUS.na, `Locations is ${state}.`)];
  if (!has(api, ...LOCATIONS_MIGRATION_API)) return [row(C, STATUS.na, `Locations ${mod.version} predates the inheritance migration (no ${LOCATIONS_MIGRATION_API.join('/')} in its API); no migration to check.`)];
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

// ---------- shared reads for 8 to 12 ----------
/** Manager-imported world Items (source flag with a permanent id), read once for the content checks. */
function managedItems(game) {
  const out = [];
  for (const doc of listOf(game.items)) {
    const source = doc?.flags?.[MODULE_ID]?.source;
    if (source?.sourceId) out.push({doc, source, id: String(source.sourceId)});
  }
  return out;
}
const sourceIds = managed => new Set(managed.map(m => m.id));

// ---------- 8. Recipes ----------
const INGREDIENT_ID = x => x?.materialId ?? x?.material_id ?? x?.target_id ?? x?.id ?? null;
function checkRecipes(game, ctx) {
  const C = 'Recipes';
  const recipes = ctx.managed.filter(m => /^REC-/.test(m.id) || m.source.definition?.entity_type === 'Recipe');
  if (!recipes.length) return [row(C, STATUS.na, 'No imported recipes in the world.')];
  const ids = ctx.ids, problems = [];
  let craft = 0;
  for (const {id, source} of recipes) {
    const def = {id, ...(source.definition ?? {})};
    // Activity recipes have no result item and no ingredients by design.
    if (recipeKind(def) !== 'craft') continue;
    craft++;
    const missing = [];
    const result = typeof def.result_item_id === 'string' ? def.result_item_id.trim() : '';
    if (result && !ids.has(result)) missing.push(`result ${result}`);
    for (const x of Array.isArray(def.ingredients) ? def.ingredients : []) {
      const mat = INGREDIENT_ID(x);
      if (typeof mat === 'string' && /^MAT-/.test(mat) && !ids.has(mat)) missing.push(`ingredient ${mat}`);
    }
    if (missing.length) problems.push(`${id} (${[...new Set(missing)].join(', ')})`);
  }
  if (problems.length) return [row(C, STATUS.warn, `${plural(problems.length, 'craft recipe')} name an item that is not in the world: ${capList(problems)}. Import the missing items, or fix the ids in the content file.`)];
  return [row(C, STATUS.pass, craft ? `Every result and ingredient of ${plural(craft, 'craft recipe')} is in the world.` : `${plural(recipes.length, 'recipe')} in the world, all activities (no result or ingredients to check).`)];
}

// ---------- 9. Skill trees ----------
const PERK_REF = /^[A-Z]+-[A-Z0-9-]+$/;
function checkSkillTrees(game, ctx) {
  const C = 'Skill trees';
  const {mod, api, state} = partner(game, 'ashen-gate-skill-trees');
  if (!mod || state !== 'active') return [row(C, STATUS.na, `Skill Trees is ${state}.`)];
  if (!has(api, 'listTrees')) return [row(C, STATUS.na, 'Skill Trees: could not check (no listTrees in its API).')];
  let trees;
  try { trees = api.listTrees(); } catch (error) { return [row(C, STATUS.na, `Skill Trees: could not check (${errText(error)}).`)]; }
  if (!Array.isArray(trees)) return [row(C, STATUS.na, 'Skill Trees: could not check (listTrees did not return a list).')];
  const missing = new Map();
  let checked = 0;
  for (const tree of trees) for (const node of Array.isArray(tree?.nodes) ? tree.nodes : []) {
    const perk = typeof node?.perkId === 'string' ? node.perkId.trim() : '';
    if (!PERK_REF.test(perk)) continue;
    checked++;
    if (!ctx.ids.has(perk) && !missing.has(perk)) missing.set(perk, `${perk} (${tree.id ?? '?'})`);
  }
  if (missing.size) return [row(C, STATUS.warn, `${plural(missing.size, 'perk')} on tree nodes ${missing.size === 1 ? 'has' : 'have'} no imported Item in the world: ${capList([...missing.values()])}. Import the perk files in General Manager.`)];
  if (!checked) return [row(C, STATUS.pass, `No tree node names a perk (${plural(trees.length, 'tree')}).`)];
  return [row(C, STATUS.pass, `Every perk on ${plural(checked, 'tree node')} has an imported Item.`)];
}

// ---------- 10. Core links ----------
function checkCoreLinks(game, ctx) {
  const C = 'Core links';
  const withRef = ctx.managed.filter(m => coreRefOf(m.doc));
  if (!withRef.length) return [row(C, STATUS.na, 'No imported Item has a core_ref.')];
  // Same reading as Items > Core links: an Item with a coreLink flag is done (adopted, or link only when adopting would hurt it).
  const unlinked = withRef.filter(m => !m.doc.flags?.[MODULE_ID]?.[LINK_FLAG]);
  if (unlinked.length) return [row(C, STATUS.warn, `${plural(unlinked.length, 'Item')} with a core_ref ${unlinked.length === 1 ? 'is' : 'are'} not adopted: ${capList(unlinked.map(m => m.id))}. Adopt them in Items > Core links.`)];
  return [row(C, STATUS.pass, `All ${plural(withRef.length, 'Item')} with a core_ref are linked to their core item.`)];
}

// ---------- 11. Profession Ledger ----------
const LIST_WORD = u => /skill/i.test(`${u?.field ?? ''}${u?.list ?? ''}`) ? 'skill' : 'tool';
function checkLedger(game) {
  const C = 'Profession Ledger';
  const {mod, api, state} = partner(game, 'ashen-gate-profession-ledger');
  if (!mod || state !== 'active') return [row(C, STATUS.na, `Profession Ledger is ${state}.`)];
  // assign.preview is the Ledger's GM dry run ("changes nothing"); its `unresolved` lists catalog names it could not match.
  if (!has(api?.assign, 'preview')) return [row(C, STATUS.na, 'Profession Ledger: could not check (no unresolved-name report in its API).')];
  let unresolved;
  try { unresolved = api.assign.preview()?.unresolved; } catch (error) { return [row(C, STATUS.na, `Profession Ledger: could not check (${errText(error)}).`)]; }
  if (!Array.isArray(unresolved)) return [row(C, STATUS.na, 'Profession Ledger: could not check (no unresolved-name report in its API).')];
  const names = [...new Set(unresolved.map(u => `${u?.profession ?? '?'}: ${LIST_WORD(u)} "${u?.name ?? ''}"`))];
  if (names.length) return [row(C, STATUS.warn, `${plural(names.length, 'tool or skill name')} from imported content ${names.length === 1 ? 'matches' : 'match'} no dnd5e tool or skill: ${capList(names)}. Fix the name in the content file, or set it in Profession Ledger > GM Setup > Tools and checks.`)];
  return [row(C, STATUS.pass, 'Every tool and skill name in imported profession content is recognised.')];
}

// ---------- 12. Quest rewards ----------
async function checkQuestRewards(game, ctx) {
  const C = 'Quest rewards';
  const {mod, api, state} = partner(game, 'ashen-gate-quest-manager');
  if (!mod || state !== 'active') return [row(C, STATUS.na, `Quest Log is ${state}.`)];
  if (!has(api?.rewards, 'list')) return [row(C, STATUS.na, 'Quest Log: could not check (no rewards list in its API).')];
  if (!ctx.quests) return [row(C, STATUS.na, 'Quest Log: could not check (its quests could not be read).')];
  const missing = [];
  let checked = 0;
  for (const q of ctx.quests) {
    let rows;
    try { rows = await api.rewards.list(q.id); } catch (error) { return [row(C, STATUS.na, `Quest Log: could not check (${errText(error)}).`)]; }
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r?.removed || r?.gone) continue;
      checked++;
      if (r.status === 'missing') missing.push(`${q.id} (${r.itemId ?? 'added item'})`);
    }
  }
  if (missing.length) return [row(C, STATUS.warn, `${plural(missing.length, 'item reward')} ${missing.length === 1 ? 'points' : 'point'} at an item that is not in the world: ${capList(missing)}. Import the item, or change the reward in Quest Log.`)];
  return [row(C, STATUS.pass, checked ? `Every item reward (${checked}) is in the world.` : 'No quest has an item reward.')];
}

// ---------- 13. Imports ----------
/**
 * Blocked and Conflict are preview results: Manager works them out from a package against the world and never stores
 * them (Import history keeps what was applied). So there is nothing stored to report; this row says so instead of guessing.
 */
function checkImports() {
  return [row('Imports', STATUS.na, 'Manager does not store Blocked or Conflict results; preview a package on the Import tab to see them.')];
}

const GROUPS = ['Module versions', 'GM storage', 'Player Access', 'Test data', 'Leak scan', 'Migration', 'Environment',
  'Recipes', 'Skill trees', 'Core links', 'Profession Ledger', 'Quest rewards', 'Imports'];
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
  const managed = managedItems(game);
  const ctx = {locations: readLocations(game), quests: readQuests(game), managed, ids: sourceIds(managed)};
  const rows = [];
  const steps = [['Module versions', () => checkVersions(game)], ['GM storage', () => checkStorage(game)],
    ['Player Access', () => checkPlayerAccess(game)], ['Test data', () => checkTestData(game, ctx)],
    ['Leak scan', () => checkLeaks(game, ctx)], ['Migration', () => checkMigration(game, ctx)], ['Environment', () => checkEnvironment(game)],
    ['Recipes', () => checkRecipes(game, ctx)], ['Skill trees', () => checkSkillTrees(game, ctx)], ['Core links', () => checkCoreLinks(game, ctx)],
    ['Profession Ledger', () => checkLedger(game)], ['Quest rewards', () => checkQuestRewards(game, ctx)], ['Imports', () => checkImports()]];
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

/** Shown when there is no report (none run yet, or Clear results). */
export const EMPTY_TEXT = 'Run the check to see results.';
/**
 * The Modules tab's view of the last result (or of none, after Clear): Copy, Download and Clear are off without one.
 * `tone(status)` gives the kit badge tone. Pure; the result itself lives only in the Manager window, never in the world.
 */
export function preSessionView(result, tone = () => '') {
  if (!result) return {hasResults: false, hasText: false, summary: '', rows: [], empty: EMPTY_TEXT};
  return {hasResults: true, hasText: Boolean(result.text), summary: result.summary, empty: '',
    rows: (result.rows ?? []).map(r => ({...r, css: r.status === 'N-A' ? 'na' : r.status.toLowerCase(), tone: tone(r.status)}))};
}
