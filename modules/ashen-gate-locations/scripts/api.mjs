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
import {MODULE_ID, GATHERING, STATES, PARTY_NOTES, ROUTES_RETIRED, notesLockHolder, clone, newLocation, normalizeLocation, parseImport, exportPackage, importRecords, resourcesOf,
  nodeForGM, nodeMatch, publishable, hasUnpublishedChanges, previewView, wouldCycle, parentMap, normalizeAudience, AUDIENCE_MODES, isPlaceable, resolvePassConditions, effectivePin} from './model.mjs';
import {checkMove} from './tree.mjs';
import {travelOptions, TRAVEL_UNAVAILABLE} from './travel.mjs';
import {planRouteConversion} from './route-convert.mjs';
import {buildListModel, LIST_CONTRACT} from './list-model.mjs';
import {OVERLAND_CONTRACT} from './overland.mjs';
import {MODIFIER_CONTRACT, MODIFIER_SCOPE, TARGET_IDS, validateModifiers} from './travel-modifiers.mjs';
import {planBulk, applyArchive, applyRestore, applyDelete, idsWithPrefix} from './bulk.mjs';

export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';

/**
 * deps: {isGM(), playerAccessEnabled(), setPlayerAccess(bool), readAll(), writeAll(list), readViews(),
 *        placeNote(loc, opts), open(), openLocation(idOrKey), version, viewOptions?(),
 *        notes?: {readGM(locationId), readPlayer(pinKey), request(payload), userId(), isActive(id), nameOf(id), now?()},
 *        sharing?: {request({ref, userIds})}, show?: {send(ref)}, playerIds?(), pinsOf?(loc),
 *        tables?: {draw(uuid) → {results: [text]}, uuidByName?(name)} (0.20.0: GM rolls a linked RollTable to chat),
 *        storedRoutes?() → the routes 0.19.0 and earlier stored (read only; Developer Tools conversion),
 *        pins?: {report(locs) → [{uuid, name, managed, overridden}], remove(locs) → {removed, kept: [{uuid, name, count}]}} (0.26.0: Map Notes for bulk Delete),
 *        notedIds?() → Set of LOC ids that have Party Notes text (0.26.0: shown in the bulk preview),
 *        resolveScene?(uuid) → Scene|null, currentUser?() → the User (0.33.0: Travel),
 *        listContext?() → {templates, questName(id), materialName(id)} (0.34.0: GM search/group helpers for listModel),
 *        overland?: the overland service (overland.mjs, 0.37.0: api.overland reads it, GM only)}
 * 0.20.0: routes, journeys, the Travel tracker and route drawings are retired; their methods are gone.
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
  /** 0.26.0: the locations that are not archived. Every list a partner or the window reads comes from here; find() still reaches archived ones. */
  const live = () => deps.readAll().filter(l => !l.archived);
  const find = ref => ref ? deps.readAll().find(l => l.id === ref || l.pinKey === ref) ?? null : null;
  const findView = ref => ref ? deps.readViews().find(v => (v.id && v.id === ref) || (v.key && v.key === ref)) ?? null : null;
  const revealedViews = () => deps.readViews().filter(v => v.id);
  const findGM = id => {
    const all = deps.readAll();
    const loc = all.find(l => l.id === id);
    if (!loc) throw new Error('No location found with that reference.');
    return {all, loc};
  };
  const checkParent = (loc, all) => {
    if (!loc.parentLocationId) return;
    if (wouldCycle(loc.id, loc.parentLocationId, parentMap(all.filter(l => l.id !== loc.id))))
      throw new Error(`${loc.name} cannot sit inside ${all.find(l => l.id === loc.parentLocationId)?.name ?? 'that location'}: that location is already inside it.`);
  };

  // ---------- Party Notes ----------
  const notesDeps = () => { if (!deps.notes) throw new Error('Party Notes are unavailable.'); return deps.notes; };
  /** What the caller may send: GM → the LOC id (any state); player → the pin key of a location they can see. */
  const notesTarget = ref => {
    requireAccess();
    if (gm()) { const loc = find(ref); if (!loc) throw new Error('No location found with that reference.'); return loc.id; }
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
    if (old) loc = {...loc, pinKey: old.pinKey, state: old.state, revealed: old.revealed, active: old.active, published: old.published, audience: old.audience, convertedFromRoute: old.convertedFromRoute};
    // 0.28.0: the companion key belongs to the audience (play state), so the draft can't change or drop it.
    if (old) { if (old.companionKey) loc.companionKey = old.companionKey; else delete loc.companionKey; }
    else loc = {...loc, id: newLocation(data?.name, all.map(l => l.id)).id, state: 'hidden', revealed: false, active: false, published: null, passConditions: loc.passConditions === true};
    checkParent(loc, all);
    await deps.writeAll([...all.filter(l => l.id !== loc.id), loc]);
    return clone(loc);
  }

  /** 0.28.0: the audience as the API returns it: othersUnidentified is always a boolean (storage leaves it out while off). */
  const audienceOut = a => ({...clone(a), othersUnidentified: a.othersUnidentified === true});
  const idList = ids => { if (!Array.isArray(ids) || ids.some(i => typeof i !== 'string')) throw new TypeError('ids must be a list of location ids.'); return ids; };
  function bulkPreview(action, ids) {
    const all = deps.readAll(), plan = planBulk(action, all, idList(ids), {notes: deps.notedIds?.() ?? new Set()});
    const pins = (action === 'delete' || action === 'archive') && deps.pins ? deps.pins.report(plan.targets).map(({uuid, name, managed, overridden}) => ({uuid, name, managed, overridden})) : [];
    return {action, targets: plan.targets.map(l => ({id: l.id, name: l.name})), unknown: plan.unknown, skipped: plan.skipped, blocked: plan.blocked, outsideChildren: plan.outsideChildren,
      archivedParents: plan.archivedParents, partyNotes: plan.partyNotes, active: plan.active, pins, ok: plan.ok};
  }

  // 0.33.0 Travel: the scenes this user may go to. GM: every linked scene that resolves. Player: only a Revealed location they can read, only
  // the scenes the GM switched on at Publish (`travelScenes` in their view), and only those this client may view. Never names anything else.
  const travelFor = ref => {
    if (!deps.resolveScene || !deps.currentUser) return [];
    const user = deps.currentUser();
    if (gm()) return travelOptions(find(ref)?.sceneUuids, {resolve: deps.resolveScene, user});
    if (!deps.playerAccessEnabled()) return [];
    const v = findView(ref);
    return v?.state === 'revealed' && v.id ? travelOptions(v.travelScenes, {resolve: deps.resolveScene, user}) : [];
  };

  const api = {
    version: deps.version,
    GATHERING,
    STATES,
    /** 1.13.0: partner embed (see README). Drawing checks Player Access itself; read-only. */
    embed: deps.embed ? Object.freeze({...deps.embed, modes: Object.freeze([...deps.embed.modes])}) : undefined,
    open: () => { requireAccess(); return deps.open(); },
    openLocation: ref => { requireAccess(); return deps.openLocation(ref); },

    /** GM: full record (by LOC id or pinKey). Player: sanitized view, or null if hidden/unknown. */
    getLocation(ref) {
      requireAccess();
      return clone(gm() ? find(ref) : findView(ref));
    },
    /**
     * 0.33.0, this user's own Travel choices for a location: [{uuid, name}] sorted by name; [] when there is none (unknown, hidden, unidentified,
     * Player Access off, nothing linked, or no linked scene this user may view). Same answer for every reason, so nothing leaks.
     */
    travelScenes(ref) { return travelFor(ref).map(({uuid, name}) => ({uuid, name})); },
    /**
     * 0.33.0: views a linked scene for the current user only (Scene#view: never activates a scene, nobody else moves).
     * `sceneUuid` picks one; without it a single choice is used, several need one. Resolves {ok: true, sceneUuid} or {ok: false, reason}; never throws.
     */
    async travelToLocation(ref, {sceneUuid} = {}) {
      const options = travelFor(ref);
      if (!options.length) return {ok: false, reason: TRAVEL_UNAVAILABLE};
      if (sceneUuid === undefined && options.length > 1) return {ok: false, reason: 'Choose which scene to travel to.'};
      const pick = sceneUuid === undefined ? options[0] : options.find(o => o.uuid === sceneUuid);
      if (!pick) return {ok: false, reason: TRAVEL_UNAVAILABLE};
      // 0.36.0: never a silent no-op. Foundry's Scene#view() returns without switching while the canvas is still loading, and does nothing visible when
      // the scene is already the one on screen, so both are answered here; after the call the canvas must really show the scene (when there is a canvas).
      const before = deps.sceneState?.() ?? null;
      if (before?.loading) return {ok: false, reason: 'Wait for the current scene to finish loading, then try again.'};
      if (before?.viewingId && before.viewingId === pick.scene.id) return {ok: true, sceneUuid: pick.uuid, already: true};
      try { await pick.scene.view(); } catch (err) { console.warn('ashen-gate-locations | Travel could not view the scene', err); return {ok: false, reason: err?.message || 'That scene could not be opened right now.'}; }
      const after = deps.sceneState?.() ?? null;
      if (before?.ready && after && after.viewingId !== pick.scene.id) return {ok: false, reason: 'That scene could not be opened right now.'};
      return {ok: true, sceneUuid: pick.uuid};
    },
    /**
     * GM: all (or revealed only; `placeableOnly` (1.8.0): only those marked Placeable on a map). Player: revealed only,
     * sanitized; with includeUnidentified also the unidentified ones ({key, state, name: generic label, teaser?}, no id).
     */
    listLocations({revealedOnly = false, includeUnidentified = false, placeableOnly = false, archived = 'exclude'} = {}) {
      requireAccess();
      if (!gm()) return clone(includeUnidentified ? deps.readViews() : revealedViews());
      // 0.26.0: GM only. `archived`: 'exclude' (default: archived ones are off the list), 'only' or 'include'.
      const keep = archived === 'only' ? l => l.archived : archived === 'include' ? () => true : l => !l.archived;
      return clone(deps.readAll().filter(l => keep(l) && (!revealedOnly || l.revealed) && (!placeableOnly || isPlaceable(l))));
    },
    /**
     * 0.34.0: the Locations list as data, for a partner that draws its own markup (Character Hub). The same search, filters, sort and nested
     * Region folders the window shows this user (see list-model.mjs and the README). GM: the GM list (records; `revealedOnly` keeps revealed ones).
     * Player: the player list only (published views; hidden never present, unidentified by generic label with no id); filters and sort are
     * ignored for a player because the window offers none. Plain data, nothing saved. Open a row with `openLocation(row.ref)`.
     */
    listModel({query = '', filters = {}, sort = 'name', sortDesc = false, revealedOnly = false} = {}) {
      requireAccess();
      const isGM = gm();
      const records = isGM ? live().filter(l => !revealedOnly || l.revealed) : deps.readViews();
      return buildListModel(clone(records), {gm: isGM, query, filters, sort, sortDesc, context: isGM ? deps.listContext?.() ?? {} : {}});
    },
    LIST_CONTRACT,
    /** GM: child records. Player: the revealed/unidentified children of a revealed location, as {id?, key, name}. */
    childrenOf(ref) {
      requireAccess();
      if (!gm()) return clone(findView(ref)?.children ?? []);
      const parent = find(ref);
      return parent ? clone(live().filter(l => l.parentLocationId === parent.id)) : [];
    },
    /** Gathering nodes at a location (see README). Players: no hidden nodes, no DC unless shown. */
    resourcesAt(id) {
      requireAccess();
      return gm() ? resourcesOf(find(id), {gm: true}) : resourcesOf(findView(id));
    },
    /** Where a MAT-* material can be gathered: [{id, name, available}]. Same visibility rules. */
    locationsWithMaterial(materialId) {
      requireAccess();
      const list = gm() ? live() : revealedViews();
      return list.flatMap(l => resourcesOf(l, {gm: gm()}).filter(r => r.materialId === materialId)
        .map(r => ({id: l.id, name: l.name, available: r.available})));
    },
    /** Every node that yields a material, as common or rare bundle: [{locationId, locationName, matches, ...node}]. */
    nodesForMaterial(materialId) {
      requireAccess();
      const list = gm() ? live() : revealedViews();
      return list.flatMap(l => resourcesOf(l, {gm: gm()}).map(n => [n, nodeMatch(n, materialId)]).filter(([, m]) => m)
        .map(([n, matches]) => ({locationId: l.id, locationName: l.name, matches, ...n})));
    },
    /**
     * 0.20.0: a location's hazards. GM: every entry {id, name, note, shown, tableUuid}. Player: only the revealed
     * location's shown ones, as published {id, name, note} (never the linked table); [] for a hidden or unknown place.
     */
    hazardsAt(ref) {
      requireAccess();
      return clone(gm() ? find(ref)?.hazards ?? [] : findView(ref)?.hazards ?? []);
    },
    /** 0.20.0: linked roll tables. GM: every entry {id, name, uuid, shown}. Player: shown ones {id, name, uuid} of a revealed place. */
    rollTablesAt(ref) {
      requireAccess();
      return clone(gm() ? find(ref)?.rollTables ?? [] : findView(ref)?.rollTables ?? []);
    },
    /** 0.20.0 GM: draws from a RollTable (by uuid) to chat, with the table's own roll mode. Players are refused. */
    async rollTable(uuid) {
      requireGM();
      if (typeof uuid !== 'string' || !uuid) throw new Error('Choose a roll table first.');
      if (!deps.tables?.draw) throw new Error('Roll tables are unavailable.');
      return deps.tables.draw(uuid);
    },
    /** Locations that list a quest, for Quest Manager's reverse link: [{id, name}]. */
    locationsForQuest(questId) {
      if (!gm() && !deps.playerAccessEnabled()) return [];
      const list = gm() ? live().map(l => ({...l, quests: l.quests.map(q => q.questId)})) : revealedViews();
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
      if (state === 'hidden') loc.active = false; // a hidden place is never "here"
      if (state !== 'hidden') loc.published = publishable(loc);
      await deps.writeAll(all);
      return clone(loc);
    },
    /**
     * 0.24.0, GM: marks a location as where the party is now (many may be active). Live state like the marker state: it applies at
     * once, needs no Publish, and is not part of the published content. A Hidden location cannot be active: reveal it (or mark it
     * unidentified) first. Resolves to the GM record.
     */
    async setLocationActive(ref, active) {
      requireGM();
      if (typeof active !== 'boolean') throw new TypeError('active must be true or false.');
      const loc0 = find(ref);
      if (!loc0) throw new Error('No location found with that reference.');
      const {all, loc} = findGM(loc0.id);
      if (active && (loc.state === 'hidden' || !loc.published)) throw new Error(`${loc.name} is hidden. Reveal it or mark it unidentified before making it active.`);
      if (loc.active === active) return clone(loc);
      loc.active = active;
      await deps.writeAll(all);
      return clone(loc);
    },
    /** Is this location active? GM: any location (LOC id or pin key). Player: only one they can see (a hidden or unknown one reads false). */
    isLocationActive(ref) {
      requireAccess();
      return gm() ? find(ref)?.active === true : findView(ref)?.active === true;
    },
    /**
     * The active locations. GM: [{id, key, name, state}] of every active one. Player: [{key, name, state}] of the visible ones only,
     * with the name the player may see (an unidentified place has only its label); hidden places and other players' Selected-players
     * places never appear. Sorted by name.
     */
    activeLocations() {
      requireAccess();
      const rows = gm()
        ? live().filter(l => l.active === true).map(l => ({id: l.id, key: l.pinKey, name: l.name, state: l.state}))
        : deps.readViews().filter(v => v.active === true).map(v => ({key: v.key, name: v.name, state: v.state}));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
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
    /**
     * 0.31.0, GM: Publish for every location that is not archived, not Hidden and has saved edits players do not see yet (the same
     * publishable() as publishLocation), in ONE write. Hidden, archived and up-to-date locations are skipped; state, Active, audience,
     * pins and Party Notes are never touched. Re-runnable: a second call finds nothing and writes nothing. Resolves {published, ids}.
     */
    async publishAllLocations() {
      requireGM();
      const all = deps.readAll();
      const todo = all.filter(l => !l.archived && l.state !== 'hidden' && hasUnpublishedChanges(l));
      for (const l of todo) l.published = publishable(l);
      if (todo.length) await deps.writeAll(all);
      return {published: todo.length, ids: todo.map(l => l.id)};
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
      if (!loc) throw new Error('No location found with that reference.');
      const node = loc.resources.find(n => n.key === nodeId);
      if (!node) throw new Error(`No gathering node found at ${loc.name}.`);
      // A template reference with no finite of its own (null) follows its template; the Ledger only exhausts finite nodes.
      if (exhausted && node.finite === false) throw new Error(`${node.label || 'This node'} is not finite, so it cannot be exhausted.`);
      node.exhausted = exhausted;
      // Play state, not authored content: players see it straight away, without a Publish.
      const shown = loc.published?.resources.find(n => n.key === nodeId);
      if (shown) shown.exhausted = exhausted && shown.finite !== false;
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
      // 0.20.0: Route records are skipped, each with ROUTES_RETIRED; the locations in the same file still import.
      return {created: result.created.map(l => l.id), skipped: result.skipped, errors: result.errors, retired: result.retired};
    },
    /**
     * GM: imports Location records from an ag-foundry-import/0.2 package (General Manager calls this in its
     * import run). mode 'skip' keeps existing ids as they are; 'update' replaces their definition but keeps
     * marker state, published content, pin binding and exhausted nodes. Returns {created: [id], updated: [id], skipped: [{id, reason}]}.
     * 0.20.0: a Route record is skipped with the reason ROUTES_RETIRED; the rest of the list still imports.
     */
    async importLocations(records, {mode = 'skip', unarchive = false} = {}) {
      requireGM();
      const all = deps.readAll();
      const r = importRecords(records, all, {mode, unarchive: unarchive === true});
      if (r.created.length || r.updated.length) {
        const replaced = new Map(r.updated.map(l => [l.id, l]));
        await deps.writeAll(resolvePassConditions([...all.map(l => replaced.get(l.id) ?? l), ...r.created]).list);
      }
      return {created: r.created.map(l => l.id), updated: r.updated.map(l => l.id), skipped: r.skipped};
    },
    /** GM: every location, archived ones included (0.20.0: with its hazards and rollTables; no Route records). 0.26.0: `ids` limits it to those locations (the backup before a bulk Delete). */
    exportPackage({ids = null} = {}) {
      requireGM();
      const all = deps.readAll();
      return exportPackage(Array.isArray(ids) ? all.filter(l => ids.includes(l.id)) : all);
    },
    /**
     * 0.26.0 GM: bulk Archive / Restore / Delete (see bulk.mjs). `previewBulk(action, ids)` writes nothing and returns the plan:
     * {action, targets: [{id, name}], unknown, skipped: [{id, name, reason}], blocked: [{id, name, children}] (Delete: children left
     * outside the selection), outsideChildren (Archive), archivedParents (Restore), partyNotes, active, pins: [{name, managed, overridden}], ok}.
     */
    previewBulk(action, ids) {
      requireGM();
      return bulkPreview(action, ids);
    },
    /** 0.26.0 GM: archives these locations: off the list, invisible to players, nothing lost. Reversible with restoreLocations. Returns {archived: [id], skipped}. */
    async archiveLocations(ids, {source = 'window', reason = ''} = {}) {
      requireGM();
      const plan = planBulk('archive', deps.readAll(), idList(ids));
      // A caller that is not the window (General Manager's sync: source 'ashen-gate-manager') never leaves a visible child behind:
      // a location with places inside that are not in the same list is skipped with reason 'has-children'.
      const unsafe = source === 'window' ? [] : plan.outsideChildren.map(b => b.id);
      const targets = plan.targets.filter(l => !unsafe.includes(l.id));
      if (targets.length) await deps.writeAll(applyArchive(deps.readAll(), targets.map(l => l.id)));
      const already = plan.skipped.filter(s => s.reason === 'Already archived.');
      return {archived: targets.map(l => l.id), alreadyArchived: already.map(s => s.id), source, reason,
        skipped: [...unsafe.map(id => ({id, reason: 'has-children'})), ...plan.skipped.filter(s => !already.includes(s)).map(({id, reason}) => ({id, reason})), ...plan.unknown.map(id => ({id, reason: 'No such location.'}))]};
    },
    /** 0.26.0 GM: brings archived locations back with the state they had (none becomes active). Returns {restored: [id], skipped}. */
    async restoreLocations(ids, {source = 'window'} = {}) {
      requireGM();
      const plan = planBulk('restore', deps.readAll(), idList(ids));
      if (plan.targets.length) await deps.writeAll(applyRestore(deps.readAll(), plan.targets.map(l => l.id)));
      return {restored: plan.targets.map(l => l.id), source, skipped: [...plan.skipped, ...plan.unknown.map(id => ({id, reason: 'No such location.'}))].map(({id, reason}) => ({id, reason}))};
    },
    /**
     * 0.26.0 GM: permanently deletes these locations. Refuses (throws, nothing changed) if any has a child that is not in `ids`.
     * Module-managed Map Notes are removed first; Notes the GM customised by hand stay and are reported in `pins.kept`.
     * Returns {deleted: [id], backup: an ag-foundry-import/0.2 package of what was deleted, pins: {removed, kept}}. Party Notes stay stored.
     */
    async deleteLocations(ids) {
      requireGM();
      const all = deps.readAll(), plan = planBulk('delete', all, idList(ids));
      if (plan.blocked.length) throw new Error(`${plan.blocked.map(b => `${b.name} has ${b.children.length === 1 ? 'a place' : `${b.children.length} places`} inside it that ${b.children.length === 1 ? 'is' : 'are'} not selected`).join('; ')}. Select those places too, or move them first.`);
      if (!plan.targets.length) return {deleted: [], backup: exportPackage([]), pins: {removed: 0, kept: []}};
      const gone = plan.targets.map(l => l.id), backup = exportPackage(plan.targets);
      const pins = deps.pins ? await deps.pins.remove(plan.targets) : {removed: 0, kept: []};
      await deps.writeAll(applyDelete(all, gone));
      return {deleted: gone, backup, pins};
    },
    /** 0.26.0 GM: the ids that start with `prefix` (case-insensitive), in list order. `archived`: false (default) searches the live list, true the archived one. */
    idsWithPrefix(prefix, {archived = false} = {}) {
      requireGM();
      return idsWithPrefix(deps.readAll().filter(l => (l.archived === true) === (archived === true)), prefix);
    },
    /** 0.26.0 GM: how many locations are archived. */
    countArchived() {
      requireGM();
      return deps.readAll().filter(l => l.archived).length;
    },
    ROUTES_RETIRED,
    /**
     * 0.20.0 GM (Developer Tools): turns each stored route into a new location of type Route (route-convert.mjs). Without
     * `apply` it only previews. Re-runnable: a route already converted (convertedFromRoute) is listed in `done`, never again.
     * The stored routes are never changed or deleted. Returns {total, convert: [{routeId, name, locationId, parentId, notes}],
     * done: [{routeId, name, locationId}], skipped: [{routeId, name, reason}], applied}.
     */
    async convertRoutes({apply = false} = {}) {
      requireGM();
      const all = deps.readAll();
      const plan = planRouteConversion(deps.storedRoutes?.() ?? [], all, {tableUuid: name => deps.tables?.uuidByName?.(name) ?? ''});
      if (apply && plan.convert.length) await deps.writeAll([...all, ...plan.convert.map(c => c.location)]);
      return {total: plan.total, done: plan.done, skipped: plan.skipped, applied: apply && plan.convert.length > 0,
        convert: plan.convert.map(c => ({routeId: c.routeId, name: c.name, locationId: c.location.id, parentId: c.location.parentLocationId, notes: c.notes}))};
    },

    placeOnScene(id, opts) {
      requireGM();
      const loc = find(id);
      if (!loc) throw new Error('No location found with that reference.');
      return deps.placeNote(loc, opts);
    },
    /** GM (1.8.0): the scenes that hold a Map Note for this location: [{uuid, name, count}]. */
    pinsOf(id) {
      requireGM();
      const loc = find(id);
      return loc && deps.pinsOf ? deps.pinsOf(loc) : [];
    },
    /**
     * GM (0.25.0): the pin art and size this location resolves to: its own value, else the nearest ancestor's "default pin for
     * places inside", else the world's unidentified-pin setting, else Foundry's icons. {img, unidentifiedImg, size, from: {img,
     * unidentifiedImg, size}} where `from` is 'own', 'default' (LOC id of the ancestor), 'world' or 'built-in'. Null for an unknown reference.
     */
    effectivePin(ref) {
      requireGM();
      const loc = find(ref);
      return loc ? effectivePin(loc, deps.readAll(), deps.viewOptions?.().unknownImg) : null;
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
      return audienceOut(findGM(id).loc.audience);
    },
    /**
     * GM: sets who may see a location. mode 'everyone' (default) or 'selected' with player user ids; `sharing`: may
     * those players share it on; `othersUnidentified` (0.28.0, boolean, only has an effect with 'selected'): players who are not selected see an
     * unidentified companion pin at the same spot instead of nothing. Takes effect at once (like the marker state). A player kept in the list keeps its
     * "shared by" note; removing one is how the GM undoes a share.
     */
    async setAudience(id, {mode, userIds, sharing, othersUnidentified} = {}) {
      requireGM();
      const {all, loc} = findGM(id);
      const old = loc.audience;
      if (mode !== undefined && !AUDIENCE_MODES.includes(mode)) throw new Error(`Unknown audience "${mode}"; use ${AUDIENCE_MODES.join(' or ')}.`);
      if (userIds !== undefined && !Array.isArray(userIds)) throw new TypeError('userIds must be a list of player user ids.');
      if (sharing !== undefined && typeof sharing !== 'boolean') throw new TypeError('sharing must be true or false.');
      if (othersUnidentified !== undefined && typeof othersUnidentified !== 'boolean') throw new TypeError('othersUnidentified must be true or false.');
      const known = deps.playerIds ? new Set(deps.playerIds()) : null;
      const unknown = known ? (userIds ?? []).filter(u => !known.has(u) && !old.userIds.includes(u)) : [];
      if (unknown.length) throw new Error(`Not a player in this world: ${unknown.join(', ')}.`);
      loc.audience = normalizeAudience({mode: mode ?? old.mode, userIds: userIds ?? old.userIds, sharedBy: old.sharedBy, sharing: sharing ?? old.sharing,
        othersUnidentified: othersUnidentified ?? old.othersUnidentified});
      await deps.writeAll(all);
      return audienceOut(loc.audience);
    },
    /**
     * Player (1.8.0): shares a "Selected players" location this player can see with other players (adds only).
     * Asks the GM's client, which checks everything again. Resolves to {added: count}. GM: adds them directly.
     */
    async shareLocation(ref, userIds) {
      requireAccess();
      if (gm()) {
        const loc = find(ref);
        if (!loc) throw new Error('No location found with that reference.');
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

    /**
     * GM (0.23.0): opens a Revealed or Unidentified location in every other connected client's Locations window.
     * Selected-players locations reach only the selected players. Resolves to {sent: players reached}. Hidden: throws.
     */
    async showToPlayers(ref) {
      requireAccess();
      if (!gm()) throw new Error('Only the GM can show a location to players.');
      if (!deps.show) throw new Error('Show to Players is unavailable.');
      return deps.show.send(ref);
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

    /**
     * The scope owner for `travel` modifiers (0.37.0; contract ag-modifier/1). General Manager calls validate(entries, {recordId, record})
     * on import; docs/modifiers-schema.md has the targets, ranges and rules.
     */
    modifiers: Object.freeze({contract: MODIFIER_CONTRACT, scope: MODIFIER_SCOPE, targets: [...TARGET_IDS], validate: validateModifiers}),
    /**
     * Light overland travel (0.37.0), GM only, read only. state() -> {contract, day, used, base, bonus, total, left, mounted, announce, conditions: {id: 0..3}, log: [{kind, day, text}]};
     * partyModifiers() -> {contract, scope, mounted, bonus: {actions, explore, scout}, ladder, conditions: [{id, label, kind, hits, guidance, severity, mitigation, remaining}], rows: [{key, target, terrain, condition, label, unit, total, cap, capped, severity?, remaining?,
     * sources: [{name, character, label, value, counted, note}]}]}. Players are refused here, not just in the window.
     */
    overland: Object.freeze({
      contract: OVERLAND_CONTRACT,
      state() { requireGM(); if (!deps.overland) throw new Error('Overland travel is unavailable.'); return deps.overland.state(); },
      partyModifiers() { requireGM(); if (!deps.overland) throw new Error('Overland travel is unavailable.'); return deps.overland.partyModifiers(); }
    }),

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
