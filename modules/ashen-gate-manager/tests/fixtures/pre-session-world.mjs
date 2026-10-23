/**
 * A mocked Foundry world for the 0.53.0 pre-session check tests (synthetic [TEST]-style data). Every write path a
 * document, setting or partner API offers is a trap that records its name, so a test can assert nothing was written.
 * This proves logic only, not the live Forge UI.
 */
const M = 'ashen-gate-manager';
const ACCESS = 'ag-player-access/1';
const coll = list => ({contents: list});
const WRITES = ['update', 'delete', 'setFlag', 'unsetFlag', 'createEmbeddedDocuments', 'updateEmbeddedDocuments', 'deleteEmbeddedDocuments'];

export function recorder() {
  const writes = [];
  const trap = name => (...args) => { writes.push(name); return Promise.resolve(args[0]); };
  return {writes, trap, docWrites: () => Object.fromEntries(WRITES.map(n => [n, trap(n)]))};
}

/** A world Item; `source` makes it Manager-imported (flags[ashen-gate-manager].source). */
export function item(rec, name, {sourceId, definition, coreLink, ownership = {default: 0}} = {}) {
  const flags = sourceId ? {[M]: {source: {sourceId, definition: {id: sourceId, ...definition}}, ...(coreLink ? {coreLink} : {})}} : {};
  return {name, id: name, type: 'loot', ownership, flags, ...rec.docWrites(),
    testUserPermission(user, level) { return level === 'OBSERVER' && (this.ownership.default ?? 0) >= 2; }};
}

const access = (rec, id) => ({contract: ACCESS, getState: () => ({contract: ACCESS, moduleId: id, audience: 'player', playerAccessEnabled: true, configurable: true}),
  setEnabled: rec.trap(`${id}.setEnabled`)});

/**
 * A healthy world: every Ashen Gate module active with the read APIs the checks use; content links all resolve.
 * `opts.modules` replaces or (with undefined) removes modules; `opts.items` replaces the world Items;
 * `opts.trees`, `opts.unresolved`, `opts.rewards` (questId → rows) change what the partner APIs return.
 */
export function world({rec = recorder(), gm = true, items, trees, unresolved = [], rewards, modules = {}} = {}) {
  const writeApi = names => Object.fromEntries(names.map(n => [n, rec.trap(n)]));
  const quests = [{id: 'QUEST-TEST-OPEN', name: 'Open Road', status: 'Active'}];
  const rewardRows = rewards ?? {'QUEST-TEST-OPEN': [{key: 'def:ITEM-TEST-BLADE', itemId: 'ITEM-TEST-BLADE', status: 'ok', origin: 'import', removed: false}]};
  const all = {
    [M]: {id: M, title: 'Ashen Gate | General Manager', active: true, version: '0.54.0', api: {}},
    'ashen-gate-locations': {id: 'ashen-gate-locations', active: true, version: '0.18.0', api: {listLocations: () => [], previewLocation: () => null,
      playerAccess: access(rec, 'ashen-gate-locations'), ...writeApi(['importLocations', 'setLocationState', 'publishLocation', 'moveLocation', 'setAudience'])}},
    'ashen-gate-quest-manager': {id: 'ashen-gate-quest-manager', active: true, version: '0.18.1', api: {
      listQuests: () => structuredClone(quests), getGMSource: id => ({id, visibility: 'player'}), getGMState: () => ({status: 'Active', revealed: true}),
      listVisible: () => [], playerAccess: access(rec, 'ashen-gate-quest-manager'), ...writeApi(['setGMState', 'importQuests']),
      rewards: {contract: 'ag-quest-rewards/1', list: async id => structuredClone(rewardRows[id] ?? []),
        ...writeApi(['addFromDrop', 'update', 'remove', 'grant', 'grantAgain'])}}},
    'ashen-gate-skill-trees': {id: 'ashen-gate-skill-trees', active: true, version: '0.21.1', api: {
      listTrees: () => structuredClone(trees ?? [{id: 'TREE-TEST', name: '[TEST] Tree', nodes: [{id: 'n1', perkId: 'PERK-TEST-GRIT'}, {id: 'n2', name: 'Free text'}]}]),
      playerAccess: access(rec, 'ashen-gate-skill-trees'), ...writeApi(['importTrees', 'publish', 'grantPoints'])}},
    'ashen-gate-factions': {id: 'ashen-gate-factions', active: true, version: '0.12.0', api: {getFactions: () => [{id: 'FAC-TEST'}], playerAccess: access(rec, 'ashen-gate-factions')}},
    'ashen-gate-headquarters': {id: 'ashen-gate-headquarters', active: true, version: '0.12.0', api: {exportState: () => ({catalog: [{id: 'HQ-1'}]}), playerAccess: access(rec, 'ashen-gate-headquarters')}},
    'ashen-gate-profession-ledger': {id: 'ashen-gate-profession-ledger', active: true, version: '0.30.0', api: {playerAccess: access(rec, 'ashen-gate-profession-ledger'),
      assign: {preview: () => ({actors: [], rows: [], unmapped: [], unresolved: structuredClone(unresolved), conflicts: []}), apply: rec.trap('assign.apply')},
      crosswalk: {applyBaseline: rec.trap('crosswalk.applyBaseline')}}},
    'ashen-gate-utilities': {id: 'ashen-gate-utilities', active: true, version: '0.28.1', api: {playerAccess: access(rec, 'ashen-gate-utilities')}},
    'ashen-gate-character-hub': {id: 'ashen-gate-character-hub', title: 'Ashen Gate | Character Hub', active: true, version: '0.42.0', api: {open: rec.trap('hub.open')}},
    'ashen-gate-cinders': {id: 'ashen-gate-cinders', title: 'Ashen Gate | Cinders', active: true, version: '0.11.0', api: {playerAccess: access(rec, 'ashen-gate-cinders')}},
    ...modules
  };
  for (const [k, v] of Object.entries(all)) if (v === undefined) delete all[k];
  const worldItems = items ?? [
    item(rec, '[TEST] Blade', {sourceId: 'ITEM-TEST-BLADE'}),
    item(rec, '[TEST] Herb', {sourceId: 'MAT-TEST-HERB'}),
    item(rec, '[TEST] Grit', {sourceId: 'PERK-TEST-GRIT'}),
    item(rec, '[TEST] Blade recipe', {sourceId: 'REC-TEST-BLADE', definition: {entity_type: 'Recipe', result_item_id: 'ITEM-TEST-BLADE', ingredients: [{material_id: 'MAT-TEST-HERB', quantity: 1}]}}),
    item(rec, '[TEST] Song', {sourceId: 'REC-TEST-SONG', definition: {entity_type: 'Recipe', kind: 'activity'}})
  ];
  const game = {user: {isGM: gm, ...rec.docWrites()}, users: coll([{id: 'gm1', isGM: true}, {id: 'p1', isGM: false}]), world: {id: 'w', title: '[TEST] World'},
    version: '14.367', release: {generation: 14, build: 367}, system: {id: 'dnd5e', version: '6.0.6'}, modules: new Map(Object.entries(all)),
    items: coll(worldItems), actors: coll([]), journal: coll([]),
    settings: {get: () => null, set: rec.trap('settings.set'), register: rec.trap('settings.register')}};
  return {game, rec};
}
export const now = new Date('2026-10-23T18:00:00Z');
export const by = (out, check) => out.rows.filter(r => r.check === check);
