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
