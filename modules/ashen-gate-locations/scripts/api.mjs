/**
 * Public API: game.modules.get('ashen-gate-locations').api
 * GM calls read full records. Player calls read only the sanitized player view, and only while
 * Player Access is on. Write calls are GM-only. Every guard lives here, not in the UI.
 * Save is private: saveLocation never changes what players see. Only setLocationState and
 * publishLocation do.
 * Party Notes are the one thing players write. Those calls only ask the GM's client, which re-checks every
 * request (see party-notes.mjs); the checks here just give a quick, identical answer for hidden and unknown places.
 * 1.8.0: a "Selected players" location reaches only its audience. Every player read goes through readViews(), which
 * returns only pages Foundry lets this user open, so for anyone else it answers exactly as for a hidden location.
 */
import {MODULE_ID, GATHERING, STATES, PARTY_NOTES, notesLockHolder, clone, newLocation, normalizeLocation, parseImport, exportPackage, importRecords, resourcesOf, nodeForGM, nodeMatch,
  publishable, hasUnpublishedChanges, previewView, wouldCycle, parentMap, normalizeAudience, AUDIENCE_MODES, isPlaceable, resolvePassConditions} from './model.mjs';
import {checkMove} from './tree.mjs';

export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';

/**
 * deps: {isGM(), playerAccessEnabled(), setPlayerAccess(bool), readAll(), writeAll(list), readViews(),
 *        placeNote(loc, opts), open(), openLocation(idOrKey), version, viewOptions?(),
 *        notes?: {readGM(locationId), readPlayer(pinKey), request(payload), userId(), isActive(id), nameOf(id), now?()},
 *        sharing?: {request({ref, userIds})}, playerIds?(), pinsOf?(loc)}
 */
export function createApi(deps) {
  const gm = () => deps.isGM() === true;
  const requireGM = () => { if (!gm()) throw new Error('Only the GM can do that.'); };
  const requireAccess = () => {
    if (!gm() && !deps.playerAccessEnabled()) throw new Error('Locations is hidden from players. Ask your GM to enable Player Access.');
  };
  // GM: a LOC id or a pinKey (Map Notes carry only the pinKey). Player: a revealed location's LOC id,
  // or a pinKey from a Note/page the player can already see. Unidentified views carry no id, so
  // asking for one by LOC id returns null exactly as for a hidden or unknown one.
  const find = ref => ref ? deps.readAll().find(l => l.id === ref || l.pinKey === ref) ?? null : null;
  const findView = ref => ref ? deps.readViews().find(v => (v.id && v.id === ref) || (v.key && v.key === ref)) ?? null : null;
  const revealedViews = () => deps.readViews().filter(v => v.id);
  const findGM = id => {
    const all = deps.readAll();
    const loc = all.find(l => l.id === id);
    if (!loc) throw new Error(`No location ${id}.`);
    return {all, loc};
  };
  const checkParent = (loc, all) => {
    if (!loc.parentLocationId) return;
    if (wouldCycle(loc.id, loc.parentLocationId, parentMap(all.filter(l => l.id !== loc.id))))
      throw new Error(`${loc.name} cannot sit inside ${loc.parentLocationId}: that location is already inside it.`);
  };

  // ---------- Party Notes ----------
  const notesDeps = () => { if (!deps.notes) throw new Error('Party Notes are unavailable.'); return deps.notes; };
  /** What the caller may send: GM → the LOC id (any state); player → the pin key of a location they can see. */
  const notesTarget = ref => {
    requireAccess();
    if (gm()) { const loc = find(ref); if (!loc) throw new Error(`No location ${ref}.`); return loc.id; }
    const v = findView(ref);
    if (!v) throw new Error("That location isn't available to you.");
    return v.key;
  };
  /** Adds names and what this user may do. No LOC id is added; `key` is the pin key players already have. */
  const notesOut = (rec, key) => {
    if (!rec) return null;
    const n = notesDeps(), me = n.userId(), now = n.now?.() ?? Date.now();
    const holder = notesLockHolder(rec, now, n.isActive);
    return {key, text: rec.text, rev: rec.rev, updatedAt: rec.updatedAt || null,
      updatedBy: rec.updatedBy ? {id: rec.updatedBy, name: n.nameOf(rec.updatedBy) || 'Someone'} : null,
      editing: holder ? {id: holder, name: n.nameOf(holder) || 'Someone', until: rec.lock.until} : null,
      mine: !!holder && holder === me, canEdit: !holder || holder === me || gm()};
  };
  const notesKey = ref => gm() ? find(ref)?.pinKey : findView(ref)?.key;
  const notesOp = async (ref, payload) => {
    const target = notesTarget(ref), key = notesKey(ref);
    const rec = await notesDeps().request({...payload, ref: target});
    return notesOut(rec ?? (gm() ? notesDeps().readGM(target) : notesDeps().readPlayer(key)), key);
  };

  /** Saves privately. State, published content and pin binding of an existing location are kept. New ones start Hidden. */
  async function saveLocation(data) {
    requireGM();
    const all = deps.readAll();
    const old = data?.id ? all.find(l => l.id === data.id) : null;
    let loc = normalizeLocation(data);
    // The audience is play state like the marker state (players can add to it mid-session): only setAudience and sharing change it.
    if (old) loc = {...loc, pinKey: old.pinKey, state: old.state, revealed: old.revealed, published: old.published, audience: old.audience};
    else loc = {...loc, id: newLocation(data?.name, all.map(l => l.id)).id, state: 'hidden', revealed: false, published: null, passConditions: loc.passConditions === true};
    checkParent(loc, all);
    await deps.writeAll([...all.filter(l => l.id !== loc.id), loc]);
    return clone(loc);
  }

  const api = {
    version: deps.version,
    GATHERING,
    STATES,
    open: () => { requireAccess(); return deps.open(); },
    openLocation: ref => { requireAccess(); return deps.openLocation(ref); },

    /** GM: full record (by LOC id or pinKey). Player: sanitized view, or null if hidden/unknown. */
    getLocation(ref) {
      requireAccess();
      return clone(gm() ? find(ref) : findView(ref));
    },
    /**
     * GM: all (or revealed only; `placeableOnly` (1.8.0): only those marked Placeable on a map). Player: revealed only,
     * sanitized; with includeUnidentified also the unidentified ones ({key, state, name: generic label, teaser?}, no id).
     */
    listLocations({revealedOnly = false, includeUnidentified = false, placeableOnly = false} = {}) {
      requireAccess();
      if (!gm()) return clone(includeUnidentified ? deps.readViews() : revealedViews());
      return clone(deps.readAll().filter(l => (!revealedOnly || l.revealed) && (!placeableOnly || isPlaceable(l))));
    },
    /** GM: child records. Player: the revealed/unidentified children of a revealed location, as {id?, key, name}. */
    childrenOf(ref) {
      requireAccess();
      if (!gm()) return clone(findView(ref)?.children ?? []);
      const parent = find(ref);
      return parent ? clone(deps.readAll().filter(l => l.parentLocationId === parent.id)) : [];
    },
    /** Gathering nodes at a location (see README). Players: no hidden nodes, no DC unless shown. */
    resourcesAt(id) {
      requireAccess();
      return gm() ? resourcesOf(find(id), {gm: true}) : resourcesOf(findView(id));
    },
    /** Where a MAT-* material can be gathered: [{id, name, available}]. Same visibility rules. */
    locationsWithMaterial(materialId) {
      requireAccess();
      const list = gm() ? deps.readAll() : revealedViews();
      return list.flatMap(l => resourcesOf(l, {gm: gm()}).filter(r => r.materialId === materialId)
        .map(r => ({id: l.id, name: l.name, available: r.available})));
    },
    /** Every node that yields a material, as common or rare bundle: [{locationId, locationName, matches, ...node}]. */
    nodesForMaterial(materialId) {
      requireAccess();
      const list = gm() ? deps.readAll() : revealedViews();
      return list.flatMap(l => resourcesOf(l, {gm: gm()}).map(n => [n, nodeMatch(n, materialId)]).filter(([, m]) => m)
        .map(([n, matches]) => ({locationId: l.id, locationName: l.name, matches, ...n})));
    },
    /** Locations that list a quest, for Quest Manager's reverse link: [{id, name}]. */
    locationsForQuest(questId) {
      if (!gm() && !deps.playerAccessEnabled()) return [];
      const list = gm() ? deps.readAll().map(l => ({...l, quests: l.quests.map(q => q.questId)})) : revealedViews();
      return list.filter(l => (l.quests ?? []).includes(questId)).map(l => ({id: l.id, name: l.name}));
    },

    // GM-only writes.
    createLocation: name => saveLocation({name}),
    saveLocation,
    /**
     * Sets what players see. 'unidentified' and 'revealed' also publish the saved content (players see
     * only the label and teaser while unidentified). 'hidden' withdraws everything at once.
     */
    async setLocationState(id, state) {
      requireGM();
      if (!STATES.includes(state)) throw new Error(`Unknown state "${state}"; use ${STATES.join(', ')}.`);
      const {all, loc} = findGM(id);
      loc.state = state;
      loc.revealed = state === 'revealed';
      if (state !== 'hidden') loc.published = publishable(loc);
      await deps.writeAll(all);
      return clone(loc);
    },
    /** Shows players the saved content of an unidentified or revealed location. */
    async publishLocation(id) {
      requireGM();
      const {all, loc} = findGM(id);
      if (loc.state === 'hidden') throw new Error(`${loc.name} is hidden. Reveal it or mark it unidentified first.`);
      loc.published = publishable(loc);
      await deps.writeAll(all);
      return clone(loc);
    },
    /** GM: does a location have saved edits players do not see yet? */
    hasUnpublishedChanges(id) {
      requireGM();
      return hasUnpublishedChanges(findGM(id).loc);
    },
    /** GM: the player view a draft would give after Publish (or after switching to `state`). Nothing is written. */
    previewLocation(draft, state) {
      requireGM();
      return previewView(draft, deps.readAll(), state, deps.viewOptions?.());
    },
    /** Marks a finite node used up (or restores it with exhausted=false). Returns the GM node. */
    async markNodeExhausted(locationId, nodeId, exhausted = true) {
      requireGM();
      if (typeof exhausted !== 'boolean') throw new TypeError('exhausted must be true or false.');
      const all = deps.readAll();
      const loc = all.find(l => l.id === locationId);
      if (!loc) throw new Error(`No location ${locationId}.`);
      const node = loc.resources.find(n => n.key === nodeId);
      if (!node) throw new Error(`No gathering node ${nodeId} at ${locationId}.`);
      if (exhausted && !node.finite) throw new Error(`${node.label || nodeId} is not finite, so it cannot be exhausted.`);
      node.exhausted = exhausted;
      // Play state, not authored content: players see it straight away, without a Publish.
      const shown = loc.published?.resources.find(n => n.key === nodeId);
      if (shown) shown.exhausted = exhausted && shown.finite;
      await deps.writeAll(all);
      return nodeForGM(node);
    },
    async deleteLocation(id) {
      requireGM();
      await deps.writeAll(deps.readAll().filter(l => l.id !== id));
    },
    async importPackage(pkg) {
      requireGM();
      const all = deps.readAll();
      const result = parseImport(pkg, all);
      // Records from before 1.8.0 settle "Pass conditions" the way the migration does.
      if (result.created.length) await deps.writeAll(resolvePassConditions([...all, ...result.created]).list);
      return {created: result.created.map(l => l.id), skipped: result.skipped, errors: result.errors};
    },
    /**
     * GM: imports Location records from an ag-foundry-import/0.2 package (General Manager calls this in its
     * import run). mode 'skip' keeps existing ids as they are; 'update' replaces their definition but keeps
     * marker state, published content, pin binding and exhausted nodes. Returns {created: [id], updated: [id], skipped: [{id, reason}]}.
     */
    async importLocations(records, {mode = 'skip'} = {}) {
      requireGM();
      const all = deps.readAll();
      const r = importRecords(records, all, {mode});
      if (r.created.length || r.updated.length) {
        const replaced = new Map(r.updated.map(l => [l.id, l]));
        await deps.writeAll(resolvePassConditions([...all.map(l => replaced.get(l.id) ?? l), ...r.created]).list);
      }
      return {created: r.created.map(l => l.id), updated: r.updated.map(l => l.id), skipped: r.skipped};
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
    /** GM (1.8.0): the scenes that hold a Map Note for this location: [{uuid, name, count}]. */
    pinsOf(id) {
      requireGM();
      const loc = find(id);
      return loc && deps.pinsOf ? deps.pinsOf(loc) : [];
    },
    /**
     * GM (1.8.0): moves a location inside another (parentId '' = top level). Refuses a move that would put it inside
     * itself. Like Save, players see the new place after Publish. Returns {id, from, to} so the move can be undone.
     */
    async moveLocation(id, parentId = '') {
      requireGM();
      const all = deps.readAll();
      const from = checkMove(all, id, parentId || '');
      const loc = all.find(l => l.id === id);
      loc.parentLocationId = parentId || '';
      if (from !== loc.parentLocationId) await deps.writeAll(all);
      return {id, from, to: loc.parentLocationId};
    },

    // ---------- 1.8.0 audience: who may see a location ----------
    /** GM: {mode: 'everyone'|'selected', userIds, sharedBy: {userId: sharer}, sharing}. */
    getAudience(id) {
      requireGM();
      return clone(findGM(id).loc.audience);
    },
    /**
     * GM: sets who may see a location. mode 'everyone' (default) or 'selected' with player user ids; `sharing`: may
     * those players share it on. Takes effect at once (like the marker state). A player kept in the list keeps its
     * "shared by" note; removing one is how the GM undoes a share.
     */
    async setAudience(id, {mode, userIds, sharing} = {}) {
      requireGM();
      const {all, loc} = findGM(id);
      const old = loc.audience;
      if (mode !== undefined && !AUDIENCE_MODES.includes(mode)) throw new Error(`Unknown audience "${mode}"; use ${AUDIENCE_MODES.join(' or ')}.`);
      if (userIds !== undefined && !Array.isArray(userIds)) throw new TypeError('userIds must be a list of player user ids.');
      if (sharing !== undefined && typeof sharing !== 'boolean') throw new TypeError('sharing must be true or false.');
      const known = deps.playerIds ? new Set(deps.playerIds()) : null;
      const unknown = known ? (userIds ?? []).filter(u => !known.has(u) && !old.userIds.includes(u)) : [];
      if (unknown.length) throw new Error(`Not a player in this world: ${unknown.join(', ')}.`);
      loc.audience = normalizeAudience({mode: mode ?? old.mode, userIds: userIds ?? old.userIds, sharedBy: old.sharedBy, sharing: sharing ?? old.sharing});
      await deps.writeAll(all);
      return clone(loc.audience);
    },
    /**
     * Player (1.8.0): shares a "Selected players" location this player can see with other players (adds only).
     * Asks the GM's client, which checks everything again. Resolves to {added: count}. GM: adds them directly.
     */
    async shareLocation(ref, userIds) {
      requireAccess();
      if (gm()) {
        const loc = find(ref);
        if (!loc) throw new Error(`No location ${ref}.`);
        if (loc.audience.mode !== 'selected') throw new Error('Everyone can already see this location.');
        const audience = await api.setAudience(loc.id, {userIds: [...new Set([...loc.audience.userIds, ...(userIds ?? [])])]});
        return {added: audience.userIds.length - loc.audience.userIds.length};
      }
      const v = findView(ref);
      if (!v) throw new Error("That location isn't available to you.");
      if (!v.share) throw new Error('Everyone can already see this location.');
      if (!v.share.canShare) throw new Error('The GM has turned sharing off for this location.');
      if (!deps.sharing) throw new Error('Sharing is unavailable.');
      return deps.sharing.request({ref: v.key, userIds});
    },

    // Party Notes: shared by the whole party, separate from the GM's Notes section. Not part of the definition.
    PARTY_NOTES,
    /**
     * The notes of a location this user can see: {key, text, rev, updatedAt, updatedBy: {id, name}|null,
     * editing: {id, name, until}|null, mine, canEdit}. Players: null for hidden or unknown places. GM: any location.
     */
    getPartyNotes(ref) {
      requireAccess();
      if (gm()) { const loc = find(ref); return loc ? notesOut(notesDeps().readGM(loc.id), loc.pinKey) : null; }
      const v = findView(ref);
      return v ? notesOut(notesDeps().readPlayer(v.key) ?? {text: '', rev: 0, updatedBy: '', updatedAt: 0, lock: null}, v.key) : null;
    },
    /** Start editing (one editor at a time). Returns the current notes to edit from. A GM can pass {takeover: true}. */
    editPartyNotes: (ref, {takeover = false} = {}) => notesOp(ref, {op: 'lock', takeover: takeover === true && gm()}),
    /** Save the text. `rev` is the one returned by editPartyNotes; a stale one is refused and nothing is written. */
    savePartyNotes: (ref, text, rev) => notesOp(ref, {op: 'save', text, rev}),
    /** Stop editing without saving. */
    releasePartyNotes: ref => notesOp(ref, {op: 'release'}),
    /** GM: empty a location's notes. */
    async clearPartyNotes(ref) { requireGM(); return notesOp(ref, {op: 'clear'}); },

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
