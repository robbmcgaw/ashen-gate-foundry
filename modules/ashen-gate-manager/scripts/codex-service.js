/**
 * NPC Codex (0.33.0): Foundry glue for scripts/codex.js.
 * GM writes go to the NPC Actor's own flag (flags.ashen-gate-manager.codex). Players never read Actor flags for the
 * Codex: they ask the active GM through a Foundry query (point to point, V13+), and the GM's client returns only the
 * player projection for that user's characters. Nothing hidden is sent.
 */
import {CODEX_FLAG, isNpcDefinition, normalizeState, setReveal, setDetails, gmEntry, playerCodex,
  buildCodexExport, planRevealsImport, linkKind, isLinkId, knowsRule, resolvePlayerLinks, DEITY_TIPS} from './codex.js';

export const CODEX_QUERY = 'ashen-gate-manager.codexForPlayer';
export const CODEX_ACCESS_SETTING = 'codexPlayerAccess';
const RENOWN = 'ashen-gate-factions';
/** Renown's player view names a discovered faction whose name is not revealed like this; the Codex shows Unknown. */
const RENOWN_MASKED = 'Unknown Organization';
/** 0.41.1: where a player's own client reads the records it can see, by link kind (owning module, API, filter). */
const PLAYER_SOURCES = [
  {kind: 'location', module: 'ashen-gate-locations', fn: 'listLocations'},
  {kind: 'quest', module: 'ashen-gate-quest-manager', fn: 'listVisible'},
  {kind: 'renown', module: RENOWN, fn: 'getFactions', ok: f => f.name !== RENOWN_MASKED}
];
const CLAIM_KINDS = new Set(PLAYER_SOURCES.map(p => p.kind));
const MAX_CLAIMS = 5000;

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
    if (!hits.length) throw new Error('That NPC is not in this world. Import its record first.');
    if (hits.length > 1) throw new Error('Two Actors carry this NPC record. Fix the duplicate in Items → Records first.');
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
  const partner = mid => game.modules?.get(mid)?.active ? game.modules.get(mid).api ?? null : null;
  /** GM view only (list/get): partner names by feature detection through their public APIs; any failure falls back to the id.
   * Never used for a player payload (0.41.1): on the GM's client these APIs return GM data. */
  const nameOf = id => {
    try {
      const kind = linkKind(id), api = partner;
      if (kind === 'npc') return npcs().find(n => n.def.id === id)?.def.name ?? null;
      if (kind === 'deity') return (api(RENOWN)?.getDeities?.() ?? []).find(d => d.id === id)?.name ?? null;
      if (kind === 'location') return api('ashen-gate-locations')?.getLocation?.(id)?.name ?? null;
      if (kind === 'quest') return (api('ashen-gate-quest-manager')?.listQuests?.() ?? []).find(q => q.id === id)?.name ?? null;
      // Renown deities always have DEITY- ids (kind 'deity', above), so only factions are looked up here.
      return (api(RENOWN)?.getFactions?.() ?? []).find(f => f.id === id)?.name ?? null;
    } catch { return null; }
  };
  /**
   * 0.40.0, GM side: the deities these characters have discovered, by Renown's own player filter (api.getPantheon(actor)
   * returns only deities discovered by the party or that character). [] = party level: deities every player character
   * knows. Renown missing, hidden or failing = none known, so a player never gets a deity's id or name from the Codex.
   */
  const deityNamer = (actorIds = []) => {
    const r = partner(RENOWN);
    if (typeof r?.getPantheon !== 'function') return () => null;
    const known = id => { try { return new Map((r.getPantheon(id) ?? []).map(d => [d.id, d.name])); } catch { return new Map(); } };
    let names;
    if (actorIds.length) {
      names = new Map();
      for (const id of actorIds) for (const [k, v] of known(id)) names.set(k, v);
    } else {
      const all = characters().map(c => known(c.id));
      names = all.length ? new Map([...all[0]].filter(([k]) => all.every(m => m.has(k)))) : new Map();
    }
    return id => names.get(id) ?? null;
  };
  /**
   * 0.41.1, GM side: what a player owning these characters may know of a linked record, for playerEntry's linkFor.
   * NPC: Manager's own Codex discovery rule. Deity: Renown's per-character getPantheon (deityNamer).
   * Location, quest, faction: the GM's client cannot run those modules' player filters for another user, so only ids the
   * player's own client claimed (from its own player-filtered APIs) come back, with no name; that client names them.
   * Claims never name NPCs or deities, and never add a name: a forged claim learns nothing but that the link exists.
   */
  const playerLinker = (actorIds = [], claimed = new Set()) => {
    const deityName = deityNamer(actorIds), all = npcs();
    return (id, kind) => {
      if (kind === 'deity') return deityName(id);
      if (kind === 'npc') {
        const n = all.find(x => x.def.id === id);
        return n && knowsRule(normalizeState(n.state, n.def).discovery, actorIds) ? (String(n.def.name ?? '') || n.name || null) : null;
      }
      return CLAIM_KINDS.has(kind) && claimed.has(id) ? true : null;
    };
  };
  const claimsOf = data => new Set((Array.isArray(data?.known) ? data.known : []).slice(0, MAX_CLAIMS)
    .filter(id => isLinkId(id) && CLAIM_KINDS.has(linkKind(id))));
  /** 0.41.1, player client: id -> name of the linked records this client can see, by each owning module's own player API.
   * Missing, hidden or failing modules add nothing. */
  const knownLinkNames = () => {
    const names = new Map();
    for (const src of PLAYER_SOURCES) {
      try {
        const api = partner(src.module);
        if (typeof api?.[src.fn] !== 'function') continue;
        for (const r of api[src.fn]() ?? []) {
          if (isLinkId(r?.id) && linkKind(r.id) === src.kind && typeof r.name === 'string' && r.name && (!src.ok || src.ok(r))) names.set(r.id, r.name);
        }
      } catch { /* not known */ }
    }
    return names;
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
    previewAs: (actorIds = []) => { requireGM(); return playerCodex(npcs(), actorIds, {linkFor: playerLinker(actorIds)}); },
    /** Runs on the GM's client for a query from userId. Re-checks everything; never trusts the payload. */
    forUser(userId, data = {}) {
      requireGM();
      const user = game.users?.get?.(userId);
      if (!user) throw new Error('Unknown user.');
      if (!user.isGM && !accessOn()) throw new Error('The NPC Codex is not shared with players. Ask your GM.');
      const ids = user.isGM ? [] : actorIdsFor(user);
      return playerCodex(npcs(), ids, {linkFor: playerLinker(ids, claimsOf(data))});
    },
    /** Any client. A GM gets the party-level view; a player asks the active GM. */
    async forPlayer() {
      if (isGM()) return service.previewAs([]);
      if (!accessOn()) throw new Error('The NPC Codex is not shared with players. Ask your GM.');
      const gm = game.users?.activeGM;
      if (!gm) throw new Error('The NPC Codex needs a GM to be connected.');
      if (typeof gm.query !== 'function') throw new Error('The NPC Codex needs Foundry V13 or later.');
      const names = knownLinkNames();
      const result = await gm.query(CODEX_QUERY, {known: [...names.keys()]}, {timeout: 10000});
      if (!result?.ok) throw new Error(result?.message ?? 'The GM could not send the codex.');
      return resolvePlayerLinks(result.entries, names);
    },
    /** CONFIG.queries handler (registered on every client; only a GM answers). */
    async handleQuery(data, {userId} = {}) {
      try { return {ok: true, entries: service.forUser(userId, data)}; }
      catch (error) { return {ok: false, message: error.message}; }
    },
    exportAll: () => { requireGM(); return buildCodexExport(npcs()); },
    planImport: file => { requireGM(); return planRevealsImport(file, npcs().map(n => n.def.id)); },
    async applyImport(plan) {
      requireGM(); let done = 0; const errors = [];
      for (const {id, state} of plan.apply) {
        try { await write(find(id), state); done++; } catch (e) { errors.push(`${npcs().find(n => n.def.id === id)?.name ?? 'An NPC'}: ${e.message}`); }
      }
      return {done, errors};
    },
    playerAccessEnabled: accessOn,
    /**
     * 0.40.0, any client: how this client shows a deity link, as a function link -> {open, title, unknown?}.
     * Feature-detects Renown's api.open and asks Renown's own getDeities (a player gets only deities they discovered).
     * Never throws: anything missing becomes plain text with a tooltip.
     */
    deityLinks() {
      const r = partner(RENOWN);
      if (typeof r?.open !== 'function' || typeof r?.getDeities !== 'function') return () => ({open: false, title: DEITY_TIPS.noRenown});
      let ids;
      try { ids = new Set((r.getDeities() ?? []).map(d => d?.id)); }
      catch { return () => ({open: false, title: isGM() ? DEITY_TIPS.noRenown : DEITY_TIPS.hidden}); }
      return link => ids.has(link?.id) ? {open: true, title: 'Open in the Renown Pantheon'}
        : isGM() ? {open: false, title: DEITY_TIPS.missing} : {open: false, unknown: true, title: DEITY_TIPS.unknown};
    },
    /** Opens Renown's Pantheon on a deity. A player opens it as one of their characters that knows the deity. */
    openDeity(deityId) {
      const r = partner(RENOWN);
      if (typeof r?.open !== 'function') throw new Error('Renown is not active, so this deity cannot be opened.');
      if (!isGM() && !new Set((r.getDeities?.() ?? []).map(d => d?.id)).has(deityId)) throw new Error('You have not discovered this deity yet.');
      let actorId = null;
      if (!isGM()) {
        const mine = actorIdsFor(game.user);
        actorId = mine.find(id => { try { return (r.getPantheon?.(id) ?? []).some(d => d.id === deityId); } catch { return false; } }) ?? mine[0] ?? null;
      }
      return r.open({deityId, ...(actorId ? {actorId} : {}), tab: 'pantheon'});
    }
  };
  return service;
}
