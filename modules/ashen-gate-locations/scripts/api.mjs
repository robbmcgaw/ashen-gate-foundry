/**
 * Public API: game.modules.get('ashen-gate-locations').api
 * GM calls read full records. Player calls read only the sanitized player view, and only while
 * Player Access is on. Write calls are GM-only. Every guard lives here, not in the UI.
 */
import {MODULE_ID, clone, newLocation, normalizeLocation, parseImport, exportPackage, resourcesOf} from './model.mjs';

export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';

/**
 * deps: {isGM(), playerAccessEnabled(), setPlayerAccess(bool), readAll(), writeAll(list), readViews(),
 *        placeNote(loc, opts), open(), openLocation(id), version}
 */
export function createApi(deps) {
  const gm = () => deps.isGM() === true;
  const requireGM = () => { if (!gm()) throw new Error('Only the GM can do that.'); };
  const requireAccess = () => {
    if (!gm() && !deps.playerAccessEnabled()) throw new Error('Locations is hidden from players. Ask your GM to enable Player Access.');
  };
  const find = id => deps.readAll().find(l => l.id === id) ?? null;
  const findView = id => deps.readViews().find(v => v.id === id) ?? null;

  async function saveLocation(data) {
    requireGM();
    const all = deps.readAll();
    let loc;
    if (data?.id && all.some(l => l.id === data.id)) loc = normalizeLocation(data);
    else loc = {...normalizeLocation(data), id: newLocation(data?.name, all.map(l => l.id)).id};
    await deps.writeAll([...all.filter(l => l.id !== loc.id), loc]);
    return clone(loc);
  }

  const api = {
    version: deps.version,
    open: () => { requireAccess(); return deps.open(); },
    openLocation: id => { requireAccess(); return deps.openLocation(id); },

    /** GM: full record. Player: sanitized view, or null if unrevealed/unknown. */
    getLocation(id) {
      requireAccess();
      return clone(gm() ? find(id) : findView(id));
    },
    /** GM: all (or revealed only). Player: always revealed only, sanitized. */
    listLocations({revealedOnly = false} = {}) {
      requireAccess();
      if (!gm()) return clone(deps.readViews());
      return clone(deps.readAll().filter(l => !revealedOnly || l.revealed));
    },
    /** Gathering resources at a location: [{label, materialId, uuid, available, note}]. */
    resourcesAt(id) {
      requireAccess();
      return gm() ? resourcesOf(find(id), {gm: true}) : resourcesOf(findView(id));
    },
    /** Where a MAT-* material can be gathered: [{id, name, available}]. Same visibility rules. */
    locationsWithMaterial(materialId) {
      requireAccess();
      const list = gm() ? deps.readAll() : deps.readViews();
      return list.flatMap(l => resourcesOf(l, {gm: gm()}).filter(r => r.materialId === materialId)
        .map(r => ({id: l.id, name: l.name, available: r.available})));
    },
    /** Locations that list a quest, for Quest Manager's reverse link: [{id, name}]. */
    locationsForQuest(questId) {
      if (!gm() && !deps.playerAccessEnabled()) return [];
      const list = gm() ? deps.readAll().map(l => ({...l, quests: l.quests.map(q => q.questId)})) : deps.readViews();
      return list.filter(l => (l.quests ?? []).includes(questId)).map(l => ({id: l.id, name: l.name}));
    },

    // GM-only writes.
    createLocation: name => saveLocation({name}),
    saveLocation,
    async deleteLocation(id) {
      requireGM();
      await deps.writeAll(deps.readAll().filter(l => l.id !== id));
    },
    async importPackage(pkg) {
      requireGM();
      const all = deps.readAll();
      const result = parseImport(pkg, all.map(l => l.id));
      if (result.created.length) await deps.writeAll([...all, ...result.created]);
      return {created: result.created.map(l => l.id), skipped: result.skipped, errors: result.errors};
    },
    exportPackage() {
      requireGM();
      return exportPackage(deps.readAll());
    },
    placeOnScene(id, opts) {
      requireGM();
      const loc = find(id);
      if (!loc) throw new Error(`No location ${id}.`);
      return deps.placeNote(loc, opts);
    },

    playerAccess: Object.freeze({
      contract: PLAYER_ACCESS_CONTRACT,
      getState: () => ({contract: PLAYER_ACCESS_CONTRACT, moduleId: MODULE_ID, audience: 'player',
        playerAccessEnabled: deps.playerAccessEnabled() === true, configurable: true}),
      async setEnabled(enabled) {
        requireGM();
        if (typeof enabled !== 'boolean') throw new TypeError('Player Access requires a Boolean value.');
        await deps.setPlayerAccess(enabled);
        return api.playerAccess.getState();
      }
    })
  };
  return Object.freeze(api);
}
