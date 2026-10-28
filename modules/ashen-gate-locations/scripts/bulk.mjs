/**
 * 0.26.0 Bulk Archive / Restore / Delete for the GM. Pure functions over location records: nothing here touches Foundry or
 * checks who is calling (api.mjs does that, GM only). The plans say exactly what an action would affect, so the window can
 * show it before anything is written.
 *
 * Archive is reversible: the record keeps everything (content, state, published copy, audience, Party Notes, pin binding) and only
 * gains `archived: true`. An archived location is off the normal list and players cannot see it, exactly as if it were Hidden;
 * its Map Notes stay on the scene (the GM still sees them) but players lose them. Restore clears the flag.
 * Delete is permanent and removes the record. It never leaves a child behind: a location with children can only be deleted when
 * every child is in the same selection.
 */
import {normalizeLocation, esc} from './model.mjs';

/** What the GM typed in the prefix box, ready to compare: trimmed and upper case (ids are upper case). */
export const idPrefix = value => String(value ?? '').trim().toUpperCase();

/** Ids (in list order) of the locations whose id starts with `prefix`. An empty prefix selects nothing. */
export function idsWithPrefix(list, prefix) {
  const p = idPrefix(prefix);
  return p ? list.filter(l => l.id.startsWith(p)).map(l => l.id) : [];
}

/** Direct children of each id in `all`: Map(parentId -> [records]). */
function childMap(all) {
  const kids = new Map();
  for (const l of all) if (l.parentLocationId) { if (!kids.has(l.parentLocationId)) kids.set(l.parentLocationId, []); kids.get(l.parentLocationId).push(l); }
  return kids;
}

const names = list => list.map(l => l.name);

/**
 * What Archive, Restore or Delete would do to `ids`.
 * Returns {action, targets: [records], unknown: [id], skipped: [{id, name, reason}], blocked: [{id, name, children: [name]}],
 *          outsideChildren: [{id, name, children: [name]}], partyNotes: n, active: n, ok}.
 *  - targets: what the action will really change (Archive skips archived ones, Restore skips live ones).
 *  - blocked (Delete only): targets that still have children outside the selection. Any entry makes `ok` false.
 *  - outsideChildren (Archive only): targets with children that stay visible; they are not hidden with their parent.
 *  - partyNotes: how many targets have written Party Notes (kept by Archive and Restore; kept in storage by Delete).
 * `notes` is an optional Set of LOC ids with Party Notes text.
 */
export function planBulk(action, all, ids, {notes = new Set()} = {}) {
  if (!['archive', 'restore', 'delete'].includes(action)) throw new Error(`Unknown bulk action "${action}".`);
  const byId = new Map(all.map(l => [l.id, l]));
  const wanted = [...new Set(ids)];
  const unknown = wanted.filter(id => !byId.has(id));
  const picked = wanted.filter(id => byId.has(id)).map(id => byId.get(id));
  const skipped = [];
  let targets = picked;
  if (action === 'archive') targets = picked.filter(l => l.archived ? (skipped.push({id: l.id, name: l.name, reason: 'Already archived.'}), false) : true);
  if (action === 'restore') targets = picked.filter(l => !l.archived ? (skipped.push({id: l.id, name: l.name, reason: 'Not archived.'}), false) : true);
  const inSet = new Set(targets.map(l => l.id));
  const kids = childMap(all);
  const blocked = [], outsideChildren = [];
  for (const l of targets) {
    const outside = (kids.get(l.id) ?? []).filter(c => !inSet.has(c.id));
    if (!outside.length) continue;
    (action === 'delete' ? blocked : action === 'archive' ? outsideChildren : []).push({id: l.id, name: l.name, children: names(outside), childIds: outside.map(c => c.id)});
  }
  // Restoring a child whose parent is still archived is allowed; say so, since players will not see the link to the parent.
  const archivedParents = action === 'restore'
    ? targets.filter(l => l.parentLocationId && byId.get(l.parentLocationId)?.archived && !inSet.has(l.parentLocationId)).map(l => ({id: l.id, name: l.name, parent: byId.get(l.parentLocationId).name}))
    : [];
  return {action, targets, unknown, skipped, blocked, outsideChildren, archivedParents,
    partyNotes: targets.filter(l => notes.has(l.id)).length, active: targets.filter(l => l.active).length, ok: blocked.length === 0 && targets.length > 0};
}

/** A copy of `all` with these ids archived (play state `active` cleared). Idempotent. */
export function applyArchive(all, ids, {now = new Date().toISOString()} = {}) {
  const set = new Set(ids);
  return all.map(l => set.has(l.id) && !l.archived ? normalizeLocation({...l, archived: true, archivedAt: now, active: false}) : l);
}
/** A copy of `all` with these ids restored. They come back with the state they had; none is made active again. */
export function applyRestore(all, ids) {
  const set = new Set(ids);
  return all.map(l => set.has(l.id) && l.archived ? normalizeLocation({...l, archived: false, archivedAt: ''}) : l);
}
/** A copy of `all` without these ids. The caller checks planBulk('delete').ok first. */
export const applyDelete = (all, ids) => { const set = new Set(ids); return all.filter(l => !set.has(l.id)); };

/** [heading verb, past tense] for the window's titles, buttons and messages. */
export const BULK_VERBS = Object.freeze({archive: ['Archive', 'Archived'], restore: ['Restore', 'Restored'], delete: ['Delete', 'Deleted']});

/**
 * The preview the GM reads before an action, as HTML (names only, never ids). `plan` is api.previewBulk's answer:
 * what changes, what is left alone, and what happens to Map Notes and Party Notes.
 */
export function previewHtml(plan, {limit = 40} = {}) {
  const n = plan.targets.length, noun = c => c === 1 ? 'location' : 'locations', pin = c => c === 1 ? 'pin' : 'pins';
  const shown = plan.targets.slice(0, limit).map(t => `<li>${esc(t.name)}</li>`).join('');
  const more = n > limit ? `<li><em>and ${n - limit} more</em></li>` : '';
  const managed = plan.pins.reduce((a, p) => a + p.managed, 0), custom = plan.pins.reduce((a, p) => a + p.overridden, 0);
  const sceneList = rows => rows.map(p => esc(p.name || 'Scene')).join(', ');
  const out = [`<p><strong>${n}</strong> ${noun(n)} will be ${BULK_VERBS[plan.action][1].toLowerCase()}:</p><ul class="agl-preview" style="max-height:14em;overflow:auto">${shown}${more}</ul>`];
  if (plan.action === 'archive') {
    out.push('<p>They leave the Locations list and players can no longer see them, as if they were Hidden. Content, state, Party Notes and map pins are kept. Restore them from <strong>Archived</strong> whenever you like.</p>');
    if (managed + custom) out.push(`<p>${managed + custom} map ${pin(managed + custom)} on ${sceneList(plan.pins)} stay on the scene for you and disappear for players.</p>`);
  }
  if (plan.action === 'restore') out.push('<p>They return to the Locations list with the state they had. None becomes the active location.</p>');
  if (plan.action === 'delete') {
    out.push('<p>Deleting removes the records for good. The backup file you download next can bring them back through Import.</p>');
    out.push(managed ? `<p>${managed} map ${pin(managed)} placed by this module will be removed (${sceneList(plan.pins.filter(p => p.managed))}).</p>` : '<p>No map pins are placed for them.</p>');
    if (custom) out.push(`<p>${custom} map ${pin(custom)} you changed by hand in Foundry will <strong>stay</strong> on the scene (${sceneList(plan.pins.filter(p => p.overridden))}); delete them there yourself.</p>`);
    if (plan.partyNotes) out.push(`<p>${plan.partyNotes} of them ${plan.partyNotes === 1 ? 'has' : 'have'} Party Notes. They stay stored privately and return if the same location is imported again.</p>`);
  }
  if (plan.active) out.push(`<p>${plan.active} ${plan.active === 1 ? 'is' : 'are'} marked active now${plan.action === 'archive' ? ' and will stop being active' : ''}.</p>`);
  if (plan.outsideChildren.length) out.push(`<p>Places inside stay visible and are not archived with their parent: ${plan.outsideChildren.map(b => `${esc(b.name)} (${b.children.length})`).join(', ')}.</p>`);
  if (plan.archivedParents.length) out.push(`<p>These return while the place they are inside is still archived: ${plan.archivedParents.map(b => esc(b.name)).join(', ')}.</p>`);
  if (plan.skipped.length) out.push(`<p>Left as they are: ${plan.skipped.map(s => `${esc(s.name)} (${esc(s.reason)})`).join('; ')}</p>`);
  return out.join('');
}
