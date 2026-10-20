/**
 * NPC Codex (0.33.0): Foundry glue for scripts/codex.js.
 * GM writes go to the NPC Actor's own flag (flags.ashen-gate-manager.codex). Players never read Actor flags for the
 * Codex: they ask the active GM through a Foundry query (point to point, V13+), and the GM's client returns only the
 * player projection for that user's characters. Nothing hidden is sent.
 */
import {CODEX_FLAG, isNpcDefinition, normalizeState, setReveal, setDetails, gmEntry, playerCodex,
  buildCodexExport, planRevealsImport, linkKind} from './codex.js';

export const CODEX_QUERY = 'ashen-gate-manager.codexForPlayer';
export const CODEX_ACCESS_SETTING = 'codexPlayerAccess';

export function createCodexService({game, moduleId}) {
  const isGM = () => Boolean(game.user?.isGM);
  const requireGM = () => { if (!isGM()) throw new Error('Only a GM can see or change the full NPC Codex.'); };
  const actors = () => game.actors?.contents ?? [];
  const npcOf = a => ({def: a.getFlag(moduleId, 'source')?.definition, state: a.getFlag(moduleId, CODEX_FLAG) ?? null,
    uuid: a.uuid, img: a.img, name: a.name, actor: a});
  const npcs = () => actors().filter(a => isNpcDefinition(a.getFlag(moduleId, 'source')?.definition)
    && !a.getFlag(moduleId, 'lifecycle')?.archived).map(npcOf);
  const find = id => {
    const hits = npcs().filter(n => n.def.id === id);
    if (!hits.length) throw new Error(`No NPC ${id} in this world. Import its record first.`);
    if (hits.length > 1) throw new Error(`Two Actors carry ${id}. Fix the duplicate in the Library first.`);
    return hits[0];
  };
  /** Player characters a GM can reveal to: character Actors with a player owner. */
  const characters = () => actors().filter(a => a.type === 'character' && a.hasPlayerOwner)
    .map(a => ({id: a.id, name: a.name})).sort((a, b) => a.name.localeCompare(b.name));
  const actorIdsFor = user => {
    if (!user) return [];
    const owned = actors().filter(a => a.type === 'character' && a.testUserPermission?.(user, 'OWNER')).map(a => a.id);
    return [...new Set([...owned, ...(user.character?.id ? [user.character.id] : [])])];
  };
  /** GM side only. Partner names by feature detection through their public APIs; any failure falls back to the id. */
  const nameOf = id => {
    try {
      const kind = linkKind(id), api = mid => game.modules?.get(mid)?.active ? game.modules.get(mid).api : null;
      if (kind === 'npc') return npcs().find(n => n.def.id === id)?.def.name ?? null;
      if (kind === 'location') return api('ashen-gate-locations')?.getLocation?.(id)?.name ?? null;
      if (kind === 'quest') return (api('ashen-gate-quest-manager')?.listQuests?.() ?? []).find(q => q.id === id)?.name ?? null;
      const r = api('ashen-gate-factions');
      return [...(r?.getFactions?.() ?? []), ...(r?.getDeities?.() ?? [])].find(f => f.id === id)?.name ?? null;
    } catch { return null; }
  };
  const write = async (npc, state) => { await npc.actor.setFlag(moduleId, CODEX_FLAG, state); return state; };
  const accessOn = () => { try { return Boolean(game.settings.get(moduleId, CODEX_ACCESS_SETTING)); } catch { return false; } };

  const service = {
    characters: () => { requireGM(); return characters(); },
    list: () => { requireGM(); const chars = characters();
      return npcs().map(n => gmEntry(n, {nameOf, characters: chars})).sort((a, b) => a.name.localeCompare(b.name)); },
    get: id => { requireGM(); return gmEntry(find(id), {nameOf, characters: characters()}); },
    async setReveal(id, key, opts) { requireGM(); const n = find(id); return write(n, setReveal(normalizeState(n.state, n.def), key, opts)); },
    async setDetails(id, patch) {
      requireGM(); const n = find(id);
      const {state, rejected} = setDetails(normalizeState(n.state, n.def), patch);
      await write(n, state); return {state, rejected};
    },
    /** GM preview: exactly what a player owning these characters would get ([] = party-level only). */
    previewAs: (actorIds = []) => { requireGM(); return playerCodex(npcs(), actorIds, {nameOf}); },
    /** Runs on the GM's client for a query from userId. Re-checks everything; never trusts the payload. */
    forUser(userId) {
      requireGM();
      const user = game.users?.get?.(userId);
      if (!user) throw new Error('Unknown user.');
      if (!user.isGM && !accessOn()) throw new Error('The NPC Codex is not shared with players. Ask your GM.');
      return playerCodex(npcs(), user.isGM ? [] : actorIdsFor(user), {nameOf});
    },
    /** Any client. A GM gets the party-level view; a player asks the active GM. */
    async forPlayer() {
      if (isGM()) return service.previewAs([]);
      if (!accessOn()) throw new Error('The NPC Codex is not shared with players. Ask your GM.');
      const gm = game.users?.activeGM;
      if (!gm) throw new Error('The NPC Codex needs a GM to be connected.');
      if (typeof gm.query !== 'function') throw new Error('The NPC Codex needs Foundry V13 or later.');
      const result = await gm.query(CODEX_QUERY, {}, {timeout: 10000});
      if (!result?.ok) throw new Error(result?.message ?? 'The GM could not send the codex.');
      return result.entries;
    },
    /** CONFIG.queries handler (registered on every client; only a GM answers). */
    async handleQuery(_data, {userId} = {}) {
      try { return {ok: true, entries: service.forUser(userId)}; }
      catch (error) { return {ok: false, message: error.message}; }
    },
    exportAll: () => { requireGM(); return buildCodexExport(npcs()); },
    planImport: file => { requireGM(); return planRevealsImport(file, npcs().map(n => n.def.id)); },
    async applyImport(plan) {
      requireGM(); let done = 0; const errors = [];
      for (const {id, state} of plan.apply) {
        try { await write(find(id), state); done++; } catch (e) { errors.push(`${id}: ${e.message}`); }
      }
      return {done, errors};
    },
    playerAccessEnabled: accessOn
  };
  return service;
}
