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
import {ROUTE_STATES, normalizeRoute, makeRouteId, routeProblems, routeTouches, importRouteRecords, routeRecord, legsOf, legKmOf} from './routes.mjs';
import {startJourney, nextLeg, setHazardResult, resolveHazard, reverseJourney, abortJourney, travelLine, HAZARD_FALLBACK} from './journey.mjs';
import {covers, esc, DEFAULT_UNIDENTIFIED_LABEL} from './model.mjs';

export const PLAYER_ACCESS_CONTRACT = 'ag-player-access/1';

/**
 * deps: {isGM(), playerAccessEnabled(), setPlayerAccess(bool), readAll(), writeAll(list), readViews(),
 *        placeNote(loc, opts), open(), openLocation(idOrKey), version, viewOptions?(),
 *        notes?: {readGM(locationId), readPlayer(pinKey), request(payload), userId(), isActive(id), nameOf(id), now?()},
 *        sharing?: {request({ref, userIds})}, playerIds?(), pinsOf?(loc),
 *        routes?: {readAll(), writeAll(list), readViews(), usedIds(), defaultLegKm()},
 *        drawings?: {link(route, uuid), unlink(route, {remove}), draw(route, scene), info(route), viewedScene()},
 *        travel?: {read(), write(travel), readView(), drawHazard?({uuid, name}) → {text, fromTable, tableMissing}, chat?: {gm(html), public(html)},
 *                  rng?(), now?(), emit?(event, payload)}}
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

  // ---------- 1.10.0 routes ----------
  const routesDeps = () => { if (!deps.routes) throw new Error('Routes are unavailable.'); return deps.routes; };
  const findRoute = id => {
    const all = routesDeps().readAll();
    const route = all.find(r => r.id === id);
    if (!route) throw new Error(`No route ${id}.`);
    return {all, route};
  };
  /** GM copy with what the editor shows: legs and the leg length in effect. */
  const routeOut = r => ({...clone(r), legs: legsOf(r, routesDeps().defaultLegKm()), legKmInEffect: legKmOf(r, routesDeps().defaultLegKm())});
  /** Every Route record of an import package, run against the world's locations. */
  const importRouteList = async (records, mode) => {
    const rd = routesDeps();
    const all = rd.readAll();
    const r = importRouteRecords(records, all, deps.readAll().map(l => l.id), {mode, used: rd.usedIds()});
    if (r.created.length || r.updated.length) {
      const replaced = new Map(r.updated.map(x => [x.id, x]));
      await rd.writeAll([...all.map(x => replaced.get(x.id) ?? x), ...r.created]);
    }
    return {created: r.created.map(x => x.id), updated: r.updated.map(x => x.id), skipped: r.skipped};
  };

  // ---------- 1.11.0 journeys ----------
  const travelDeps = () => { if (!deps.travel) throw new Error('Journeys are unavailable.'); return deps.travel; };
  const now = () => deps.travel?.now?.() ?? Date.now();
  const activeJourney = () => {
    const travel = travelDeps().read();
    if (travel.journey?.status !== 'active') throw new Error('There is no journey under way.');
    return travel;
  };
  /** A name for a Party Notes line, as the readers of `reader`'s notes may see `loc`; never a place they cannot see. */
  const safeName = (loc, reader) => {
    if (!loc || loc.state === 'hidden' || !loc.published || !covers(loc, reader)) return 'an unknown place';
    return loc.state === 'revealed' ? loc.published.name : loc.published.unidentifiedLabel || deps.viewOptions?.().label || DEFAULT_UNIDENTIFIED_LABEL;
  };
  /** Rolls the route's hazard table, or "Hazard!" when it has none or it is missing. Never throws. */
  const drawHazard = async route => {
    const t = route?.hazardTable ?? {};
    if (!t.uuid && !t.name) return {text: HAZARD_FALLBACK, fromTable: false, tableMissing: false};
    try { return (await travelDeps().drawHazard?.(t)) ?? {text: HAZARD_FALLBACK, fromTable: false, tableMissing: true}; }
    catch (err) { console.warn('ashen-gate-locations | hazard table failed', err); return {text: HAZARD_FALLBACK, fromTable: false, tableMissing: true}; }
  };
  const hazardCard = (j, route) => `<div class="agl-hazard-card"><h3>Hazard on leg ${j.pending.leg} of ${j.legs}</h3>
    <p class="agl-hint">GM only. ${esc(route?.name || route?.id || '')}: rolled ${j.pending.roll} against ${j.pending.chance}%.${j.pending.tableMissing ? ' The hazard table was not found.' : ''}</p>
    <p>${esc(j.pending.result)}</p><p class="agl-hint">Locations → Routes: Reroll, Dismiss or Share with players.</p></div>`;
  const whisperHazard = async (j, route) => { try { await travelDeps().chat?.gm?.(hazardCard(j, route)); } catch (err) { console.warn('ashen-gate-locations | GM hazard card failed', err); } };
  /** Appends the arrival line to the destination's Party Notes through the GM path. Returns {travelLog, travelLogError}. */
  const writeTravelLog = async j => {
    try {
      if (!deps.notes) throw new Error('Party Notes are unavailable.');
      const all = deps.readAll();
      const byId = new Map(all.map(l => [l.id, l]));
      const dest = byId.get(j.toId);
      if (!dest) throw new Error(`No location ${j.toId}.`);
      const lineText = travelLine(j, id => safeName(byId.get(id), dest));
      const rec = deps.notes.readGM(dest.id);
      const text = rec.text ? `${rec.text}\n${lineText}` : lineText;
      if (text.length > PARTY_NOTES.maxLength) throw new Error('The Party Notes there are full.');
      await deps.notes.request({op: 'save', ref: dest.id, text, rev: rec.rev});
      return {travelLog: 'ok', travelLogError: ''};
    } catch (err) {
      return {travelLog: 'failed', travelLogError: String(err?.message ?? err).slice(0, 300)};
    }
  };
  const finish = (travel, j) => { travel.history = [...(travel.history ?? []), j]; };
  const emit = (event, payload) => { try { deps.travel?.emit?.(event, payload); } catch (err) { console.warn('ashen-gate-locations | hook failed', err); } };

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
      // 1.10.0: Route records in the same package, after the locations they join. Existing routes are kept.
      const routeRecords = pkg.records.filter(r => r?.entity_type === 'Route');
      const routes = routeRecords.length && deps.routes ? await importRouteList(routeRecords, 'skip') : {created: [], updated: [], skipped: []};
      return {created: result.created.map(l => l.id), skipped: result.skipped, errors: result.errors,
        routes: {created: routes.created, skipped: routes.skipped.filter(s => /Already exists/.test(s.reason)).map(s => s.id),
          errors: routes.skipped.filter(s => !/Already exists/.test(s.reason)).map(s => `${s.id}: ${s.reason}`)}};
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
    /** GM: locations, then (1.10.0) routes as Route records in the same package. */
    exportPackage() {
      requireGM();
      const pkg = exportPackage(deps.readAll());
      if (deps.routes) pkg.records.push(...deps.routes.readAll().map(routeRecord));
      return pkg;
    },

    // ---------- 1.10.0 routes ----------
    ROUTE_STATES,
    /**
     * GM: every route (full record plus `legs` and `legKmInEffect`); `locationId` limits it to routes touching that place.
     * Player: the route views they may see ({key, variant, state, name, from, to, ...}; see routes.mjs), never an RTE id.
     */
    listRoutes({locationId = ''} = {}) {
      requireAccess();
      if (gm()) return routesDeps().readAll().filter(r => !locationId || routeTouches(r, locationId)).map(routeOut);
      const views = deps.routes ? deps.routes.readViews() : [];
      return clone(locationId ? views.filter(v => [v.from, v.to].some(e => e && (e.id === locationId || e.key === locationId))) : views);
    },
    /** GM: one route by RTE id. Player: a route view by its key; null when they may not see it. */
    getRoute(ref) {
      requireAccess();
      if (gm()) { const r = deps.routes?.readAll().find(x => x.id === ref); return r ? routeOut(r) : null; }
      return clone((deps.routes ? deps.routes.readViews() : []).find(v => v.key === ref) ?? null);
    },
    /**
     * GM: saves a route's definition (from, to, one-way, km, leg km, terrain, hazard table and base chance, GM notes,
     * unknown-path choice). A new route gets its RTE id from its endpoints and starts Unknown. Discovery and audience
     * of an existing route are kept: setRouteState and setRouteAudience change them.
     */
    async saveRoute(data) {
      requireGM();
      const rd = routesDeps();
      const all = rd.readAll();
      const old = data?.id ? all.find(r => r.id === data.id) : null;
      if (data?.id && !old) throw new Error(`No route ${data.id}.`);
      let route = normalizeRoute(data);
      const problems = routeProblems(route, deps.readAll().map(l => l.id));
      if (problems.length) throw new Error(problems.join(' '));
      route = old ? {...route, id: old.id, viewKey: old.viewKey, state: old.state, audience: old.audience, drawingUuid: old.drawingUuid}
        : {...route, id: makeRouteId(route.fromId, route.toId, [...rd.usedIds(), ...all.map(r => r.id)]), state: 'unknown', drawingUuid: ''};
      await rd.writeAll([...all.filter(r => r.id !== route.id), route]);
      return routeOut(route);
    },
    /** GM: unknown (players see nothing), rumoured, known or explored. Takes effect at once. */
    async setRouteState(id, state) {
      requireGM();
      if (!ROUTE_STATES.includes(state)) throw new Error(`Unknown route state "${state}"; use ${ROUTE_STATES.join(', ')}.`);
      const {all, route} = findRoute(id);
      route.state = state;
      await routesDeps().writeAll(all);
      return routeOut(route);
    },
    /** GM: who may see a route: {mode: 'everyone'|'selected', userIds}. Endpoint visibility still applies on top. */
    async setRouteAudience(id, {mode, userIds} = {}) {
      requireGM();
      const {all, route} = findRoute(id);
      const old = route.audience;
      if (mode !== undefined && !AUDIENCE_MODES.includes(mode)) throw new Error(`Unknown audience "${mode}"; use ${AUDIENCE_MODES.join(' or ')}.`);
      if (userIds !== undefined && !Array.isArray(userIds)) throw new TypeError('userIds must be a list of player user ids.');
      const known = deps.playerIds ? new Set(deps.playerIds()) : null;
      const unknown = known ? (userIds ?? []).filter(u => !known.has(u) && !old.userIds.includes(u)) : [];
      if (unknown.length) throw new Error(`Not a player in this world: ${unknown.join(', ')}.`);
      route.audience = normalizeAudience({mode: mode ?? old.mode, userIds: userIds ?? old.userIds, sharing: false});
      await routesDeps().writeAll(all);
      return clone(route.audience);
    },
    /**
     * GM: deletes a route. Its RTE id is never issued again. Its linked drawing stays on the map (just unlinked) unless
     * `deleteDrawing: true` (the window asks first).
     */
    async deleteRoute(id, {deleteDrawing = false} = {}) {
      requireGM();
      const {all, route} = findRoute(id);
      const j = deps.travel?.read().journey;
      if (j?.status === 'active' && j.routeId === id) throw new Error('The party is travelling this route. Abort the journey first.');
      if (route.drawingUuid && deps.drawings) await deps.drawings.unlink(route, {remove: deleteDrawing === true});
      await routesDeps().writeAll(all.filter(r => r.id !== id));
    },
    /**
     * GM: imports Route records (General Manager calls this in its import run, after importLocations). Endpoints must
     * already exist. mode 'skip' keeps existing ids unchanged; 'update' replaces the definition but keeps discovery state,
     * audience, the unknown-path choice and the player page binding. Returns {created: [id], updated: [id], skipped: [{id, reason}]}.
     */
    async importRoutes(records, {mode = 'skip'} = {}) {
      requireGM();
      return importRouteList(records, mode);
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

    // ---------- 1.12.0 route drawings ----------
    /** GM: {status: 'none'|'linked'|'missing'|'elsewhere', sceneName?, hidden?, hasText?, path?} for a route's map drawing. */
    routeDrawing(id) {
      requireGM();
      const {route} = findRoute(id);
      return deps.drawings ? deps.drawings.info(route) : {status: 'none'};
    },
    /** GM: links a scene Drawing (by uuid) to a route; Locations then sets only its `hidden` from the route. */
    async linkRouteDrawing(id, drawingUuid) {
      requireGM();
      if (!deps.drawings) throw new Error('Drawings are unavailable.');
      if (typeof drawingUuid !== 'string' || !drawingUuid) throw new Error('Select a drawing on the scene first.');
      const {all, route} = findRoute(id);
      if (route.drawingUuid && route.drawingUuid !== drawingUuid) await deps.drawings.unlink(route);
      route.drawingUuid = await deps.drawings.link(route, drawingUuid);
      await routesDeps().writeAll(all);
      return routeOut(route);
    },
    /** GM: removes the link. The drawing stays on the map as it is. */
    async unlinkRouteDrawing(id) {
      requireGM();
      const {all, route} = findRoute(id);
      if (route.drawingUuid && deps.drawings) await deps.drawings.unlink(route);
      route.drawingUuid = '';
      await routesDeps().writeAll(all);
      return routeOut(route);
    },
    /** GM: "Draw for me": a straight line between the two pins on the scene being viewed (or `scene`), linked to the route. */
    async drawRoute(id, {scene = null} = {}) {
      requireGM();
      if (!deps.drawings) throw new Error('Drawings are unavailable.');
      const {all, route} = findRoute(id);
      const target = scene ?? deps.drawings.viewedScene?.() ?? null;
      const uuid = await deps.drawings.draw(route, target);
      if (route.drawingUuid && route.drawingUuid !== uuid) await deps.drawings.unlink(route);
      route.drawingUuid = uuid;
      await routesDeps().writeAll(all);
      return routeOut(route);
    },

    // ---------- 1.11.0 journeys ----------
    /**
     * GM: {journey, partyLocationId, history} (journey: see journey.mjs, including the current hazard chance and log).
     * Player: progress only, {status, leg, legs, from?, to?, routeKey?}, or null. Never a chance, roll or hazard.
     */
    getJourney() {
      requireAccess();
      if (gm()) return deps.travel ? clone(deps.travel.read()) : {journey: null, partyLocationId: '', history: []};
      return clone(deps.travel?.readView?.() ?? null);
    },
    /** GM: the party sets out along a route ('forward' = From → To; 'reverse' = To → From, not on a one-way route). */
    async startJourney(routeId, {direction = 'forward'} = {}) {
      requireGM();
      const {route} = findRoute(routeId);
      const travel = travelDeps().read();
      if (travel.journey?.status === 'active') throw new Error('The party is already travelling. Finish or abort that journey first.');
      const ids = new Set(deps.readAll().map(l => l.id));
      const missing = [route.fromId, route.toId].filter(id => !ids.has(id));
      if (missing.length) throw new Error(`This route's end no longer exists: ${missing.join(', ')}.`);
      const j = startJourney(route, direction, {now: now(), defaultLegKm: routesDeps().defaultLegKm()});
      await travelDeps().write({...travel, journey: j, partyLocationId: j.fromId});
      emit('journeyStart', {journeyId: j.journeyId, routeId: j.routeId, fromId: j.fromId, toId: j.toId, legs: j.legs});
      return clone(j);
    },
    /**
     * GM: travels one leg: d100 against the current chance. No hazard doubles the chance (max 100%); a hazard rolls the
     * route's table (or "Hazard!"), whispers it to the GM, waits for Dismiss/Share and resets the chance to the base.
     * After the last leg the party arrives and the trip is added to the destination's Party Notes.
     * Returns {journey, roll, chance, hazard, result, arrived}.
     */
    async nextLeg() {
      requireGM();
      const travel = activeJourney();
      const route = routesDeps().readAll().find(r => r.id === travel.journey.routeId) ?? null;
      const rng = deps.travel.rng ?? Math.random;
      let {journey: j, roll, chance, hazard, arrived} = nextLeg(travel.journey, rng, {now: now()});
      if (hazard) j = setHazardResult(j, await drawHazard(route));
      if (arrived) { Object.assign(j, await writeTravelLog(j)); travel.partyLocationId = j.toId; finish(travel, j); }
      await travelDeps().write({...travel, journey: j});
      if (hazard) await whisperHazard(j, route);
      // Extension point for a campaign clock or a per-leg group check (not built): GM client only.
      emit('journeyLeg', {journeyId: j.journeyId, routeId: j.routeId, leg: j.legIndex, legs: j.legs, hazard, arrived});
      if (arrived) emit('journeyArrived', {journeyId: j.journeyId, routeId: j.routeId, toId: j.toId, legs: j.legs, hazards: j.hazardCount});
      return {journey: clone(j), roll, chance, hazard, result: hazard ? j.pending.result : '', arrived};
    },
    /** GM: rolls the waiting hazard again (replaces its result). */
    async rerollHazard() {
      requireGM();
      const travel = travelDeps().read();
      if (!travel.journey?.pending) throw new Error('There is no hazard waiting.');
      const route = routesDeps().readAll().find(r => r.id === travel.journey.routeId) ?? null;
      const j = setHazardResult(travel.journey, await drawHazard(route));
      await travelDeps().write({...travel, journey: j});
      await whisperHazard(j, route);
      return clone(j.pending);
    },
    /** GM: closes the waiting hazard without telling players. */
    async dismissHazard() {
      requireGM();
      const travel = travelDeps().read();
      const j = resolveHazard(travel.journey, 'dismissed');
      await travelDeps().write({...travel, journey: j});
      return clone(j);
    },
    /** GM: posts the waiting hazard's result to chat for everyone (no route or place names), then closes it. */
    async shareHazard() {
      requireGM();
      const travel = travelDeps().read();
      if (!travel.journey?.pending) throw new Error('There is no hazard waiting.');
      await travelDeps().chat?.public?.(`<div class="agl-hazard-card"><h3>Hazard on the road</h3><p>${esc(travel.journey.pending.result)}</p></div>`);
      const j = resolveHazard(travel.journey, 'shared');
      await travelDeps().write({...travel, journey: j});
      return clone(j);
    },
    /** GM: the party turns back the way it came (legs travelled become legs to go). */
    async reverseJourney() {
      requireGM();
      const travel = activeJourney();
      const route = routesDeps().readAll().find(r => r.id === travel.journey.routeId) ?? null;
      const j = reverseJourney(travel.journey, route, {now: now()});
      await travelDeps().write({...travel, journey: j});
      return clone(j);
    },
    /** GM: ends the journey where the party is. Nothing is written to Party Notes. */
    async abortJourney() {
      requireGM();
      const travel = activeJourney();
      const j = abortJourney(travel.journey, {now: now()});
      if (j.legIndex === 0) travel.partyLocationId = j.fromId;
      else if (j.legIndex >= j.legs) travel.partyLocationId = j.toId;
      else travel.partyLocationId = '';
      finish(travel, j);
      await travelDeps().write({...travel, journey: j});
      return clone(j);
    },
    /** GM: tries again to add an arrived journey's line to the destination's Party Notes. */
    async retryTravelLog() {
      requireGM();
      const travel = travelDeps().read();
      const j = travel.journey;
      if (j?.status !== 'arrived' || j.travelLog === 'ok') throw new Error('There is no travel log waiting to be written.');
      Object.assign(j, await writeTravelLog(j));
      await travelDeps().write({...travel, journey: j});
      return clone(j);
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
