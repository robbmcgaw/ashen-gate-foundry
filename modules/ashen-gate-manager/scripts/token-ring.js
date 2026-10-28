/**
 * Token ring for Actors linked in Items → Assets (0.63.0). Pure: no Foundry globals.
 *
 * Foundry's built-in dynamic token ring is the Actor's prototype token `ring` (V14 field names, checked against the 14.367
 * source): `prototypeToken.ring.enabled`, `.colors.ring`, `.colors.background`, `.subject.texture` and `.subject.scale`.
 * Manager sets enabled, the two colours and `subject.scale` (0.6, see RING_SUBJECT_SCALE). It leaves `subject.texture` alone:
 * with an empty subject texture Foundry uses the token image (the file just linked) and follows it when the art changes.
 *
 * Why the scale (0.63.0 shipped without it and the ring never showed, checked in a real V14 14.367 render): with Foundry's
 * default fit mode ("Subject") and subject scale 1 the ring is drawn INSIDE the token's square, under the art. A full-bleed
 * square portrait covers it completely. A scale below 1 makes Foundry pad the token so the ring is drawn around the art
 * (0.8 and above stayed hidden, 0.7 touches the corners of square art, 0.6 frames it). Tokens already on a scene keep
 * their own copy of the ring settings, so changing the Actor does not change them (see tokenRingUpdateFor).
 * This is Foundry's ring, not Tokenizer's baked ring: the two do not conflict, but a token image that already has a ring
 * painted into it (a Tokenizer export) will show two rings.
 *
 * THE RULE LIVES HERE, in `RING_RULES`, so it can be changed in one place. First matching rule wins. It looks at the
 * permanent id Manager stamped on the Actor (`sourceId`) and nothing else:
 *   NPC-*                 people (NPC records)                     green
 *   CRE-ASH-* / CRE-ASHEN-*  Ashen creatures (the bestiary's      black
 *                         "Ashen" family: Ashen Crawler, Ash Mite Swarm, the Ashen bosses …)
 *   CRE-*                 every other bestiary creature            red
 * Anything else (no id, other prefixes, player characters, vehicles) has no rule, so its ring is never touched.
 */
export const RING_KINDS = Object.freeze({
  person:   Object.freeze({kind: 'person',   label: 'green',  ring: '#2e9e4f', background: '#10301a'}),
  ashen:    Object.freeze({kind: 'ashen',    label: 'black',  ring: '#000000', background: '#2b2b2b'}),
  creature: Object.freeze({kind: 'creature', label: 'red',    ring: '#c62828', background: '#3a0f0f'})
});

/** First match wins, so the Ashen rule comes before the general CRE- rule. */
export const RING_RULES = Object.freeze([
  {test: /^NPC-/i, kind: 'person'},
  {test: /^CRE-ASH(EN)?-/i, kind: 'ashen'},
  {test: /^CRE-/i, kind: 'creature'}
]);

/**
 * The ring look for a plain record {documentName, type, sourceId}, or null when it has none. Only an `npc`-type Actor can have
 * one; a player character is never given a ring here.
 */
export function ringKindFor(doc) {
  if (doc?.documentName !== 'Actor' || doc.type !== 'npc') return null;
  const id = String(doc.sourceId ?? '').trim();
  if (!id) return null;
  const rule = RING_RULES.find(r => r.test.test(id));
  return rule ? RING_KINDS[rule.kind] : null;
}

/** Subject scale written with the ring so the ring frames square, full-bleed portraits. Change it here. */
export const RING_SUBJECT_SCALE = 0.6;

/**
 * 0.71.4: Foundry V14 collections (game.scenes, scene.tokens, scene.levels) are Maps, not Arrays: no flatMap/filter/map.
 * Any of Array, DocumentCollection (has .contents), Map/Set or another iterable becomes a plain Array; null gives [].
 */
export function listOf(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  return typeof collection[Symbol.iterator] === 'function' ? Array.from(collection) : [];
}
/** Every token of every scene whose Actor matches (actorId, or any when null): [{actorId, sceneId, id, ring}]. Works on collections. */
export function sceneTokenRefs(scenes, actorId = null) {
  const out = [];
  for (const scene of listOf(scenes)) for (const t of listOf(scene?.tokens)) {
    if (!t?.actorId || (actorId !== null && t.actorId !== actorId)) continue;
    out.push({actorId: t.actorId, sceneId: scene.id, id: t.id, ring: t._source?.ring});
  }
  return out;
}
const isDefaultScale = v => v === undefined || v === null || Number(v) === 1;

const blank = v => v === null || v === undefined || String(v).trim() === '';

/**
 * What to add to an Actor's update to give it a ring, as dotted field paths. `actor` is the live document (reads
 * `prototypeToken.ring`). Returns {update, status}:
 *   status 'none'     no rule for this Actor: nothing written;
 *   status 'kept'     the Actor already has its ring on: it is left exactly as the GM set it (colours included);
 *   status 'enable'   the ring was off: turned on, and each colour written only where it was blank; the subject scale is
 *                     set only while it is still Foundry's default 1 (a scale the GM chose is kept).
 */
export function ringUpdateFor(actor) {
  const look = ringKindFor(actor);
  if (!look) return {update: {}, status: 'none', look: null};
  const ring = actor.prototypeToken?.ring ?? {};
  if (ring.enabled) return {update: {}, status: 'kept', look};
  const update = {'prototypeToken.ring.enabled': true};
  if (blank(ring.colors?.ring)) update['prototypeToken.ring.colors.ring'] = look.ring;
  if (blank(ring.colors?.background)) update['prototypeToken.ring.colors.background'] = look.background;
  if (isDefaultScale(ring.subject?.scale)) update['prototypeToken.ring.subject.scale'] = RING_SUBJECT_SCALE;
  return {update, status: 'enable', look};
}

/**
 * The same ring for a token already placed on a scene (TokenDocument field paths). `token` is {ring} (the token's own
 * source). A token whose ring is already on is never touched; otherwise same fill-only-blanks rule as the Actor.
 * Returns {} when there is nothing to write.
 */
export function tokenRingUpdateFor(look, token) {
  if (!look || token?.ring?.enabled) return {};
  const ring = token?.ring ?? {};
  const update = {'ring.enabled': true};
  if (blank(ring.colors?.ring)) update['ring.colors.ring'] = look.ring;
  if (blank(ring.colors?.background)) update['ring.colors.background'] = look.background;
  if (isDefaultScale(ring.subject?.scale)) update['ring.subject.scale'] = RING_SUBJECT_SCALE;
  return update;
}

// ---------- One-time repair of rings that 0.63.0 turned on at subject scale 1 (hidden under square art) ----------
const sameColour = (a, b) => !blank(a) && !blank(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const hidden = (look, ring) => Boolean(look && ring?.enabled && isDefaultScale(ring.subject?.scale)
  && sameColour(ring.colors?.ring, look.ring) && sameColour(ring.colors?.background, look.background));

/**
 * Which Actors (and their scene tokens) have a ring Manager itself wrote that is still hidden: ring on, subject scale still
 * Foundry's default 1, and BOTH colours exactly the palette in RING_KINDS for that Actor. A ring the GM set up himself (any
 * other colour, or a scale he chose) is never listed. `actors` are {uuid, id, name, documentName, type, sourceId, ring} and
 * `tokens` are {actorId, sceneId, sceneName, id, ring}. Returns [{uuid, id, name, label, tokens:[{sceneId, id}]}].
 */
export function ringRepairPlan(actors, tokens = []) {
  const out = [];
  for (const a of actors ?? []) {
    const look = ringKindFor(a);
    if (!hidden(look, a.ring)) continue;
    const mine = (tokens ?? []).filter(t => t.actorId === a.id && hidden(look, t.ring)).map(t => ({sceneId: t.sceneId, id: t.id}));
    out.push({uuid: a.uuid, id: a.id, name: a.name, sourceId: a.sourceId, label: look.label, tokens: mine});
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * Applies a plan from ringRepairPlan. GM only (checked here). Each Actor is re-read live and skipped if it no longer matches
 * (so running it twice changes nothing the second time). Writes `prototypeToken.ring.subject.scale` only, and the same single
 * field on the Actor's matching scene tokens when `sceneTokens` is true.
 * deps: {user, getDoc(uuid) → live Actor, getTokens(actor) → [{sceneId, id, ring}], updateMany(updates[]), updateTokens(sceneId, updates[])}
 * Returns {ok, message, actors, tokens, skipped, errors}.
 */
export async function applyRingRepair(plan, {user, getDoc, getTokens = () => [], updateMany, updateTokens = async () => {}, sceneTokens = true} = {}) {
  if (!user?.isGM) return {ok: false, message: 'Only a GM can fix token rings.', actors: 0, tokens: 0, skipped: 0, errors: []};
  let actors = 0, tokens = 0, skipped = 0;
  const errors = [];
  for (const item of plan ?? []) {
    const doc = getDoc(item.uuid);
    const look = doc && ringKindFor({documentName: 'Actor', type: doc.type, sourceId: item.sourceId});
    if (!doc || !hidden(look, doc.prototypeToken?.ring)) { skipped++; continue; }
    try {
      await updateMany([{_id: doc.id, 'prototypeToken.ring.subject.scale': RING_SUBJECT_SCALE}]);
      actors++;
    } catch (error) { errors.push({name: item.name, message: String(error?.message ?? error)}); continue; }
    if (!sceneTokens) continue;
    const byScene = new Map();
    let live = [];
    try { live = getTokens(doc) ?? []; } catch (error) { errors.push({name: item.name, message: `scene tokens could not be read: ${String(error?.message ?? error)}`}); continue; }
    for (const t of live) {
      if (!item.tokens.some(p => p.id === t.id && p.sceneId === t.sceneId) || !hidden(look, t.ring)) continue;
      (byScene.get(t.sceneId) ?? byScene.set(t.sceneId, []).get(t.sceneId)).push({_id: t.id, 'ring.subject.scale': RING_SUBJECT_SCALE});
    }
    for (const [sceneId, updates] of byScene) {
      try { await updateTokens(sceneId, updates); tokens += updates.length; } catch (error) { errors.push({name: item.name, message: String(error?.message ?? error)}); }
    }
  }
  const message = `${actors} Actor ring(s) resized so the ring shows${sceneTokens ? `, ${tokens} token(s) on scenes resized` : ''}${skipped ? `, ${skipped} skipped (changed since the preview)` : ''}${errors.length ? `, ${errors.length} write error(s): ${errors[0].message}` : ''}.`;
  return {ok: !errors.length || actors > 0, message, actors, tokens, skipped, errors};
}

/**
 * Image paths a Scene uses as its background. V14 moved this to Levels (Level#background, Level#textures; Scene#background logs a
 * deprecation): when the scene has levels, every level's background and textures are read and Scene#background is never touched;
 * on older cores (no levels) it reads Scene#background.src exactly as before.
 */
export function sceneImagePaths(scene) {
  const levels = listOf(scene?.levels);
  if (!levels.length) return scene?.background?.src ? [scene.background.src] : [];
  const out = [];
  const add = v => { if (typeof v === 'string' && v) out.push(v); };
  for (const level of levels) {
    add(level?.background?.src);
    const textures = level?.textures;
    if (typeof textures === 'string') add(textures);
    else if (textures && typeof textures === 'object') for (const t of Array.isArray(textures) ? textures : Object.values(textures)) add(typeof t === 'string' ? t : t?.src);
  }
  return out;
}
