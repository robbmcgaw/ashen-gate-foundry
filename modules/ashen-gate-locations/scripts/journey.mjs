/**
 * Ashen Gate Locations 1.11.0: journeys along a route. Pure; randomness comes from an injected rng() in [0, 1).
 *
 * One journey at a time (the party's). It starts at the route's base hazard chance. Each leg rolls a d100:
 *  - roll <= current chance: a hazard. It is held as `pending` for the GM (Reroll / Dismiss / Share) and the chance
 *    goes back to the base chance;
 *  - otherwise no hazard, and the chance doubles for the next leg (at most 100%).
 * After the last leg the journey has arrived. Reverse turns the party round mid-route (legs done become legs to go);
 * Abort ends it where it is. The record is campaign state owned by Locations: never in an export or import.
 * 1.14.0: Pause holds the journey (no Next leg) until Resume; the Travel tracker shows it.
 * 1.15.0: `behaviours` (additive, defaults filled on read): pace, night watches and the skills for foraging and
 * navigation checks. Tracking only: nothing here changes a roll, the hazard chance, supplies or rest.
 */
import {line} from './model.mjs';
import {legsOf} from './routes.mjs';

export const JOURNEY_STATUSES = Object.freeze(['active', 'arrived', 'aborted']);
export const HAZARD_FALLBACK = 'Hazard!';
const MAX_LOG = 200;
const int = (v, min, max, fallback) => Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const stamp = v => Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const ID = /^[A-Za-z0-9-]{1,40}$/;
const ROUTE = /^RTE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const LOC = /^LOC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function normalizeEntry(e) {
  const r = e && typeof e === 'object' ? e : {};
  if (r.reversed === true) return {leg: int(r.leg, 0, 100000, 0), reversed: true, at: stamp(r.at)};
  const out = {leg: int(r.leg, 1, 100000, 1), roll: int(r.roll, 1, 100, 1), chance: int(r.chance, 0, 100, 0), hazard: r.hazard === true, at: stamp(r.at)};
  if (out.hazard) Object.assign(out, {result: line(r.result, 2000), outcome: ['pending', 'dismissed', 'shared'].includes(r.outcome) ? r.outcome : 'pending'});
  return out;
}
const normalizePending = p => p && typeof p === 'object' ? {leg: int(p.leg, 1, 100000, 1), roll: int(p.roll, 1, 100, 1), chance: int(p.chance, 0, 100, 0),
  result: line(p.result, 2000) || HAZARD_FALLBACK, fromTable: p.fromTable === true, tableMissing: p.tableMissing === true} : null;

// ---------- 1.15.0 travel behaviours (tracking only) ----------
export const PACES = Object.freeze(['slow', 'normal', 'fast']);
export const WATCHES = Object.freeze(['first', 'second', 'third']);
export const WATCH_LABELS = Object.freeze({first: 'First watch', second: 'Second watch', third: 'Third watch'});
export const CHECKS = Object.freeze(['forage', 'navigate']);
/** dnd5e skill ids a check may use (the same list as Utilities). */
export const CHECK_SKILLS = Object.freeze(['acr', 'ani', 'arc', 'ath', 'dec', 'his', 'ins', 'itm', 'inv', 'med', 'nat', 'prc', 'prf', 'per', 'rel', 'slt', 'ste', 'sur']);
export const DEFAULT_CHECK_SKILL = 'sur';
export const BEHAVIOUR_IDS = Object.freeze(['pace', 'watch', 'checks']);
const MAX_ON_WATCH = 8;
const ACTOR = /^[A-Za-z0-9]{1,40}$/;
const actorList = v => [...new Set((Array.isArray(v) ? v : []).filter(id => typeof id === 'string' && ACTOR.test(id)))].slice(0, MAX_ON_WATCH);
const skillOf = v => CHECK_SKILLS.includes(v) ? v : DEFAULT_CHECK_SKILL;

/** Every behaviour is on by default; pace normal, nobody on watch, Survival for both checks. Re-runnable. */
export function normalizeBehaviours(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const on = b => b?.enabled !== false;
  const pace = r.pace ?? {}, watch = r.watch ?? {}, checks = r.checks ?? {};
  return {
    pace: {enabled: on(pace), value: PACES.includes(pace.value) ? pace.value : 'normal'},
    watch: {enabled: on(watch), ...Object.fromEntries(WATCHES.map(w => [w, actorList(watch[w])]))},
    checks: {enabled: on(checks), ...Object.fromEntries(CHECKS.map(c => [c, skillOf(checks[c])]))}
  };
}

/**
 * Applies a GM change: {pace?: {enabled?, value?}, watch?: {enabled?, first?, second?, third?}, checks?: {enabled?, forage?, navigate?}}.
 * Throws on an unknown behaviour, pace, watch or skill (nothing is guessed). Returns the journey with the new behaviours.
 * 1.15.2: `characterIds` (the characters the GM may put on watch) refuses any other Actor id; one already on a watch
 * in this journey may stay (a character who has left the party can still be kept or taken off).
 */
export function setBehaviours(raw, patch = {}, {characterIds} = {}) {
  const j = normalizeJourney(raw);
  if (!j || j.status !== 'active') throw new Error('There is no journey under way.');
  if (!patch || typeof patch !== 'object') throw new Error('Nothing to change.');
  const b = j.behaviours;
  const allowed = characterIds ? new Set([...characterIds, ...WATCHES.flatMap(w => b.watch[w])]) : null;
  for (const [id, change] of Object.entries(patch)) {
    if (!BEHAVIOUR_IDS.includes(id)) throw new Error(`Unknown travel behaviour "${id}" (use ${BEHAVIOUR_IDS.join(', ')}).`);
    if (!change || typeof change !== 'object') throw new Error(`Give ${id} an object of changes.`);
    for (const [key, value] of Object.entries(change)) {
      if (key === 'enabled') {
        if (typeof value !== 'boolean') throw new Error(`${id}.enabled must be true or false.`);
        b[id].enabled = value;
      } else if (id === 'pace' && key === 'value') {
        if (!PACES.includes(value)) throw new Error(`Pace must be ${PACES.join(', ')}.`);
        b.pace.value = value;
      } else if (id === 'watch' && WATCHES.includes(key)) {
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !ACTOR.test(v))) throw new Error(`${WATCH_LABELS[key]} needs a list of Actor ids.`);
        if (new Set(value).size > MAX_ON_WATCH) throw new Error(`At most ${MAX_ON_WATCH} characters on one watch.`);
        if (allowed) {
          const bad = value.filter(v => !allowed.has(v));
          if (bad.length) throw new Error(`Only player characters can go on watch (the party's characters, or every character Actor when there is no party). Not one: ${[...new Set(bad)].join(', ')}.`);
        }
        b.watch[key] = actorList(value);
      } else if (id === 'checks' && CHECKS.includes(key)) {
        if (!CHECK_SKILLS.includes(value)) throw new Error(`Unknown skill "${value}".`);
        b.checks[key] = value;
      } else throw new Error(`Unknown setting ${id}.${key}.`);
    }
  }
  return j;
}

/**
 * What players see of the behaviours: the pace and the watch order (once someone is on watch), only while each is on.
 * Never the check skills.
 * `actorName(id)` gives the name players see; characters without one are left out. null when there is nothing to show.
 */
export function behavioursView(b, actorName = () => '') {
  const out = {};
  if (b?.pace?.enabled) out.pace = b.pace.value;
  if (b?.watch?.enabled) {
    const watch = WATCHES.map(w => ({watch: w, names: (b.watch[w] ?? []).map(id => String(actorName(id) ?? '')).filter(Boolean)}));
    if (watch.some(w => w.names.length)) out.watch = watch;
  }
  return Object.keys(out).length ? out : null;
}

/** Fills defaults and drops anything malformed. Re-runnable. null for no journey. */
export function normalizeJourney(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const legs = int(raw.legs, 1, 100000, 1);
  const status = JOURNEY_STATUSES.includes(raw.status) ? raw.status : 'active';
  return {
    journeyId: ID.test(raw.journeyId ?? '') ? raw.journeyId : '',
    routeId: ROUTE.test(raw.routeId ?? '') ? raw.routeId : '',
    direction: raw.direction === 'reverse' ? 'reverse' : 'forward',
    fromId: LOC.test(raw.fromId ?? '') ? raw.fromId : '', toId: LOC.test(raw.toId ?? '') ? raw.toId : '',
    distanceKm: Number.isFinite(raw.distanceKm) && raw.distanceKm > 0 ? raw.distanceKm : 0,
    legs, legIndex: int(raw.legIndex, 0, legs, 0),
    baseChance: int(raw.baseChance, 0, 100, 0), currentChance: int(raw.currentChance, 0, 100, 0),
    hazardCount: int(raw.hazardCount, 0, 100000, 0),
    startedAt: stamp(raw.startedAt), endedAt: stamp(raw.endedAt), status,
    log: (Array.isArray(raw.log) ? raw.log : []).slice(-MAX_LOG).map(normalizeEntry),
    pending: normalizePending(raw.pending),
    paused: raw.paused === true,
    // Arrival note in the destination's Party Notes: '' not tried, 'ok', or 'failed' (the GM can retry).
    travelLog: ['ok', 'failed'].includes(raw.travelLog) ? raw.travelLog : '', travelLogError: line(raw.travelLogError, 300),
    behaviours: normalizeBehaviours(raw.behaviours)
  };
}

/**
 * A new journey on `route` in `direction` ('forward' = from → to). Throws a message the GM can show.
 * opts: {now, id, defaultLegKm}.
 */
export function startJourney(route, direction = 'forward', {now = Date.now(), id, defaultLegKm} = {}) {
  if (!['forward', 'reverse'].includes(direction)) throw new Error(`Unknown direction "${direction}"; use forward or reverse.`);
  if (direction === 'reverse' && route.directed) throw new Error('This route is one-way: the journey can only start at its From end.');
  const legs = legsOf(route, defaultLegKm);
  if (!legs) throw new Error('Give the route a distance first.');
  const [fromId, toId] = direction === 'forward' ? [route.fromId, route.toId] : [route.toId, route.fromId];
  return normalizeJourney({journeyId: id ?? globalThis.crypto?.randomUUID?.().slice(0, 18) ?? String(now), routeId: route.id, direction, fromId, toId,
    distanceKm: route.distanceKm, legs, legIndex: 0, baseChance: route.hazardBase, currentChance: route.hazardBase, hazardCount: 0, startedAt: now, status: 'active', log: []});
}

/** d100 from rng() in [0, 1): 1–100. */
export const d100 = rng => Math.min(100, Math.max(1, Math.floor(Number(rng()) * 100) + 1));
/** The next chance after a leg without a hazard: doubled, at most 100. */
export const escalate = chance => Math.min(100, chance * 2);

/**
 * Travels one leg. Returns {journey, roll, chance, hazard, arrived}. The hazard result text is added by the caller
 * (setHazardResult), which may roll a table. Refused while a hazard is waiting for the GM, or once the journey ended.
 */
export function nextLeg(raw, rng, {now = Date.now()} = {}) {
  const j = normalizeJourney(raw);
  if (!j || j.status !== 'active') throw new Error('There is no journey under way.');
  if (j.pending) throw new Error('Deal with the hazard first: Dismiss it or Share it with players.');
  if (j.paused) throw new Error('The journey is paused. Resume it first.');
  const chance = j.currentChance, roll = d100(rng);
  const hazard = chance > 0 && roll <= chance;
  j.legIndex += 1;
  j.log.push(normalizeEntry({leg: j.legIndex, roll, chance, hazard, at: now, outcome: 'pending', result: HAZARD_FALLBACK}));
  if (hazard) {
    j.hazardCount += 1;
    j.currentChance = j.baseChance;
    j.pending = normalizePending({leg: j.legIndex, roll, chance, result: HAZARD_FALLBACK});
  } else j.currentChance = escalate(chance);
  const arrived = j.legIndex >= j.legs;
  if (arrived) { j.status = 'arrived'; j.endedAt = now; }
  j.log = j.log.slice(-MAX_LOG);
  return {journey: j, roll, chance, hazard, arrived};
}

/** Records the pending hazard's result text (from a table draw, or the fallback). */
export function setHazardResult(raw, {text, fromTable = false, tableMissing = false} = {}) {
  const j = normalizeJourney(raw);
  if (!j?.pending) throw new Error('There is no hazard waiting.');
  j.pending = normalizePending({...j.pending, result: text || HAZARD_FALLBACK, fromTable, tableMissing});
  const e = j.log.findLast(x => x.hazard && x.leg === j.pending.leg && x.outcome === 'pending');
  if (e) e.result = j.pending.result;
  return j;
}

/** Closes the pending hazard: 'dismissed' (GM only knew) or 'shared' (posted to players). */
export function resolveHazard(raw, outcome) {
  if (!['dismissed', 'shared'].includes(outcome)) throw new Error(`Unknown outcome "${outcome}".`);
  const j = normalizeJourney(raw);
  if (!j?.pending) throw new Error('There is no hazard waiting.');
  const e = j.log.findLast(x => x.hazard && x.leg === j.pending.leg && x.outcome === 'pending');
  if (e) e.outcome = outcome;
  j.pending = null;
  return j;
}

/** Turns the party round: the legs already travelled become the legs back. Refused on a one-way route. */
export function reverseJourney(raw, route, {now = Date.now()} = {}) {
  const j = normalizeJourney(raw);
  if (!j || j.status !== 'active') throw new Error('There is no journey under way.');
  if (route?.directed) throw new Error('This route is one-way: the party cannot turn back along it.');
  if (j.pending) throw new Error('Deal with the hazard first: Dismiss it or Share it with players.');
  if (j.legIndex === 0) throw new Error('The party has not set out yet. Abort instead, or start the other way.');
  Object.assign(j, {fromId: j.toId, toId: j.fromId, direction: j.direction === 'forward' ? 'reverse' : 'forward', legIndex: j.legs - j.legIndex});
  j.log.push(normalizeEntry({leg: j.legIndex, at: now, reversed: true}));
  return j;
}

/** Ends the journey where the party is. */
export function abortJourney(raw, {now = Date.now()} = {}) {
  const j = normalizeJourney(raw);
  if (!j || j.status !== 'active') throw new Error('There is no journey under way.');
  return {...j, status: 'aborted', endedAt: now, pending: null, paused: false};
}

/** 1.14.0: holds (true) or resumes (false) the journey. A hazard can still be dealt with while paused. */
export function pauseJourney(raw, paused = true) {
  const j = normalizeJourney(raw);
  if (!j || j.status !== 'active') throw new Error('There is no journey under way.');
  return {...j, paused: paused === true};
}

/** 1.14.0: legs in a row without a hazard, counted back from the latest leg (turning back does not break the run). */
export function safeStreak(j) {
  let n = 0;
  for (const e of [...(j?.log ?? [])].reverse()) {
    if (e.reversed) continue;
    if (e.hazard) break;
    n += 1;
  }
  return n;
}

/** 1.14.0: km travelled so far: legs × leg length (the last leg may be short), or a share of the distance without one. */
export function kmTravelled(j, legKm = 0) {
  if (!j?.legs) return 0;
  if (j.legIndex >= j.legs) return j.distanceKm;
  const km = legKm > 0 ? j.legIndex * legKm : j.distanceKm * j.legIndex / j.legs;
  return Math.min(j.distanceKm, Math.round(km * 10) / 10);
}

/** 1.14.0: the lines of the journey players have been told: hazards the GM shared, and turning back. */
export const revealedLog = j => (j?.log ?? []).filter(e => e.reversed || e.outcome === 'shared')
  .map(e => e.reversed ? {leg: e.leg, text: 'The party turned back.'} : {leg: e.leg, text: e.result});

/** How far along the route the party is, 0–1, measured from the route's own From end. */
export function progressFromRouteStart(j) {
  const t = j.legs ? j.legIndex / j.legs : 0;
  return j.direction === 'forward' ? t : 1 - t;
}

/** The arrival line for the destination's Party Notes. `nameOf(id)` gives a player-safe name. */
export const travelLine = (j, nameOf) =>
  `Travel: ${nameOf(j.fromId)} → ${nameOf(j.toId)}, ${j.distanceKm} km, ${j.legs} leg${j.legs === 1 ? '' : 's'}, ${j.hazardCount} hazard${j.hazardCount === 1 ? '' : 's'}.`;

/**
 * What players get: progress only. `ends`: {from, to} refs every player may see (or null), `routeKey` when every
 * player may see the route. Never the chance, the rolls, or a hazard the GM has not shared (1.14.0: shared ones are in `log`).
 */
export function journeyView(j, {from = null, to = null, routeKey = null, actorName} = {}) {
  if (!j) return null;
  const view = {status: j.status, leg: j.legIndex, legs: j.legs};
  // 1.14.0: only when there is something to say, so a plain journey's view keeps its 1.11.0 shape.
  if (j.paused && j.status === 'active') view.paused = true;
  const told = revealedLog(j).slice(-20);
  if (told.length) view.log = told;
  if (from) view.from = from;
  if (to) view.to = to;
  if (routeKey) view.routeKey = routeKey;
  // 1.15.0: pace and watch order, only with an actorName lookup (the GM's client builds the players' page).
  const shown = actorName && j.status === 'active' ? behavioursView(j.behaviours, actorName) : null;
  if (shown) view.behaviours = shown;
  return view;
}
