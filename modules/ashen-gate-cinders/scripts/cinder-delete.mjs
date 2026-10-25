/** Delete Cinder (0.14.0): pure rules, no Foundry globals.
 * "A Cinder" here is one instance (cinst_*) in the GM-only registry, made from a MUT-* definition. Deleting one removes what belongs to
 * that instance only: its registry record (points, unlocks, sockets list, own art and stages) and any leftovers that name its instance id
 * (the bearer link on a character, this module's signature-ability / passive copies, the "attached" mark on an item).
 * It never touches the MUT-* definition (General Manager owns it), the kind's stage art (shared by every Cinder of that kind), Skill Trees
 * records, or any item a character otherwise uses. A Cinder that still has a bearer in this world is refused: Unbind… it first. */
import {INSTANCE_ID} from './cinder.mjs';

const words = text => String(text ?? '').toLowerCase().replace(/\bcinder\b/g, ' ').split(/[^a-z0-9]+/).filter(Boolean).join(' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Which Cinder a caller means: its instance id, or a kind name ("Echo", "Echo Cinder") that fits exactly one Cinder.
 * instances: [{instanceId, name}]. Returns the instance id (a well-formed id is returned even when no record has it, so leftovers can be cleaned);
 * throws a plain message when the key is empty, fits nothing or fits several. */
export function matchCinder(instances, key) {
  const text = String(key ?? '').trim();
  if (!text) throw Error('Choose a Cinder');
  if (instances.some(i => i.instanceId === text)) return text;
  if (INSTANCE_ID.test(text)) return text;
  const want = words(text);
  const hits = want ? instances.filter(i => words(i.name) === want) : [];
  if (hits.length === 1) return hits[0].instanceId;
  if (hits.length) throw Error(`${plural(hits.length, 'Cinder')} are called ${text}. Use the Cinder's own id (api.cinder.instances()).`);
  throw Error(`No Cinder named ${text} is in this world.`);
}

/**
 * The plan for deleting one Cinder, from data only (it writes nothing).
 *   record: the normalized registry instance, or null when only leftovers remain
 *   name: the Cinder's display name
 *   bearer: {actorId, name} when the record's bearer is a character in this world, else null
 *   leftovers: {links: [{actorId, actorName}], bearerItems: [{actorId, actorName, itemId, itemName}], marks: [{actorId, actorName, itemId, itemName}]}
 * Returns {instanceId, name, definitionId, hasRecord, status, blocked (null | {characters: [name]}), bearerMissing, remove, keep, counts, lines, empty}.
 */
export function planCinderDelete({instanceId, record = null, name = 'Unnamed Cinder', bearer = null, leftovers = {}} = {}) {
  const links = leftovers.links ?? [], bearerItems = leftovers.bearerItems ?? [], marks = leftovers.marks ?? [];
  const attached = record?.sockets?.attached?.length ?? 0;
  const bearerMissing = Boolean(record?.bearer && !bearer);
  const blocked = bearer ? {characters: [bearer.name]} : null;
  const own = Boolean(record?.art) || Boolean(record?.artStages);
  const counts = {record: record ? 1 : 0, links: links.length, bearerItems: bearerItems.length, marks: marks.length};
  counts.total = counts.record + counts.links + counts.bearerItems + counts.marks;
  const remove = [];
  if (record) {
    const p = record.progression ?? {awarded: 0, unlocks: []};
    remove.push(`The Cinder's record: ${p.awarded} point${p.awarded === 1 ? '' : 's'} and ${plural(p.unlocks.length, 'unlocked power')} kept on it${attached ? `, ${plural(attached, 'socket entry', 'socket entries')}` : ''}${own ? ', its own art and stages' : ''}`);
  }
  if (links.length) remove.push(`${plural(links.length, 'bearer link')} left on ${[...new Set(links.map(l => l.actorName))].join(', ')} (a note on the character, not an item)`);
  if (bearerItems.length) remove.push(`${plural(bearerItems.length, 'signature ability / passive copy', 'signature ability / passive copies')} this Cinder gave: ${bearerItems.map(i => `${i.itemName} on ${i.actorName}`).join(', ')}`);
  if (marks.length) remove.push(`${plural(marks.length, '"attached to a Cinder" mark')} on ${marks.map(i => `${i.itemName} (${i.actorName})`).join(', ')}; the items stay`);
  const keep = [
    'The Cinder definition imported by General Manager',
    'The stage art set for this kind of Cinder (other Cinders of the kind use it)',
    'Skill Trees, character sheets, Strain, and every item on a character'
  ];
  return {
    instanceId, name, definitionId: record?.definitionId ?? null, hasRecord: Boolean(record),
    status: record ? record.status : 'leftover', blocked, bearerMissing,
    remove: blocked ? [] : remove, keep, counts: blocked ? {...counts, total: 0} : counts, lines: blocked ? [] : remove, empty: !blocked && counts.total === 0
  };
}

/** The plain refusal for a Cinder that still has a bearer. */
export const boundMessage = plan => `${plan.name} is still bound to ${plan.blocked.characters.join(', ')}. Unbind it first (Manage → Cinders → Unbind…), then delete it. Nothing was changed.`;

/** The text the confirmation dialog shows: what goes, what stays, and a plain note for GM-made versus imported records. */
export function confirmText(plan) {
  return [
    `${plan.name} will be deleted for good. This removes:`,
    ...plan.remove.map(l => `• ${l}`),
    plan.bearerMissing ? 'Its bearer is no longer in this world, so no character sheet is changed.' : 'No character is bearing it, so no character sheet changes.',
    `Stays: ${plan.keep.join('; ')}.`,
    'A General Manager re-import brings back the Cinder definition, never this Cinder, so it will not reappear. Make a new one with New Cinder if you want it back.'
  ].join('\n');
}
