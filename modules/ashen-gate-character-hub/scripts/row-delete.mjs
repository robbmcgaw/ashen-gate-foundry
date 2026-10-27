/**
 * Delete from a list row (0.60.0): right-click (or the Menu key / Shift+F10) on a row in Combat, Inventory, Magic or Features opens a
 * small menu with Open sheet and Delete…, like the dnd5e sheet's own row menu. What may be deleted is decided HERE, in the data layer
 * (plan / deleteRowItem), not by showing or hiding the menu:
 *   - the character's owner (or the GM), and only an Item that is on this character;
 *   - Skill Trees perk copies (flags.ashen-gate-skill-trees.grant): never hard-deleted by anyone; refunding the perk in Skill Trees removes it;
 *   - Profession Ledger features and signature perks (flags.ashen-gate-profession-ledger.grant): GM only (Refresh… in the Ledger is the normal way);
 *   - Cinder power items, items in a Cinder socket (Cinders' api.cinder.list / api.sockets.hosts) and gear or perks assigned to a companion: GM only;
 *   - class, subclass, species and background: GM only, through dnd5e's own deleteDialog (it asks whether to remove what they granted);
 *   - containers: dnd5e's own deleteDialog (it asks about the contents);
 *   - everything else (items, spells, feats, equipment): the owner, after a "Delete <name>?" confirmation with Cancel as the default.
 * Each partner is feature-detected; without it the rule simply doesn't apply.
 */
import {canEdit} from './actions.mjs';
import {confirmDanger} from './ag-dialogs.mjs';
import {partnerApi} from './partners.mjs';
import {cinderPowerItems} from './cinders.mjs';
import {readSlots, usedItemIds} from './companions.mjs';
import {esc} from './constants.mjs';

const refuse = error => ({ok: false, error});
export const IDENTITY_TYPES = ['class', 'subclass', 'race', 'background'];
const TREES = 'ashen-gate-skill-trees', LEDGER = 'ashen-gate-profession-ledger';
const isGM = user => (user ?? globalThis.game?.user)?.isGM === true;

/** Item ids sitting in a Cinder socket (Cinders' api.sockets.hosts, contract ag-sockets/1). */
function socketedIds(actor) {
  const s = partnerApi('ashen-gate-cinders')?.sockets;
  if (s?.contract !== 'ag-sockets/1' || typeof s.hosts !== 'function') return new Set();
  try { return new Set((s.hosts(actor) ?? []).flatMap(h => (h.slots ?? []).map(x => x.itemId).filter(Boolean))); } catch { return new Set(); }
}

/**
 * What deleting `item` from `actor` means for `user`:
 * {action: 'blocked', error, managed?: 'trees'} | {action: 'delete', warn?} | {action: 'dnd5e'} (dnd5e's own dialog does the asking).
 */
export function deletePlan(actor, item, user = globalThis.game?.user) {
  if (!item || item.parent !== actor && item.actor !== actor) return {action: 'blocked', error: 'That item is no longer on this character.'};
  if (!canEdit(actor, user)) return {action: 'blocked', error: `You don't own ${actor?.name ?? 'this character'}, so you can't delete its items.`};
  const gm = isGM(user), flags = item.flags ?? {};
  if (flags[TREES]?.grant) return {action: 'blocked', managed: 'trees', error: `${item.name} is managed by Skill Trees. A perk is removed by refunding it in Skill Trees, not by deleting it.`};
  if (flags[LEDGER]?.grant) {
    return gm ? {action: 'delete', warn: `${item.name} was added by the Profession Ledger. Its Refresh… is the normal way to remove it; deleting it here leaves the Ledger's records as they are.`}
      : {action: 'blocked', error: `${item.name} was added by the Profession Ledger. Ask your GM to remove it (the Ledger's Refresh… does that).`};
  }
  const managed = new Set([...cinderPowerItems(actor).flatMap(c => c.itemIds), ...socketedIds(actor)]);
  if (managed.has(item.id)) {
    return gm ? {action: 'delete', warn: `${item.name} is managed by Cinders. Deleting it can leave a Cinder without it until Cinders repairs the record.`}
      : {action: 'blocked', error: `${item.name} is managed by Cinders. Ask your GM to remove it.`};
  }
  let onCompanion = false;
  try { onCompanion = usedItemIds(readSlots(actor)).has(item.id); } catch { onCompanion = false; }
  if (onCompanion) {
    return gm ? {action: 'delete', warn: `${item.name} is assigned to a companion. It will leave the companion's socket or perk list.`}
      : {action: 'blocked', error: `${item.name} is assigned to a companion. Take it off the companion first (Remove or Detach on the Companions tab).`};
  }
  if (IDENTITY_TYPES.includes(item.type)) {
    if (!gm) return {action: 'blocked', error: `Only the GM can delete a ${item.type === 'race' ? 'species' : item.type}: it also removes what it granted. Use Level up to change classes.`};
    return {action: typeof item.deleteDialog === 'function' ? 'dnd5e' : 'delete', warn: `Deleting ${item.name} can remove the features it granted.`};
  }
  if (item.type === 'container' && typeof item.deleteDialog === 'function') return {action: 'dnd5e'};
  const origin = flags.dnd5e?.advancementOrigin;
  return origin ? {action: 'delete', warn: `${item.name} was granted by advancement. It won't come back unless it is granted again.`} : {action: 'delete'};
}

/** Deletes one row's Item after the plan allows it and the user confirms (confirmDanger: Cancel is the default). */
export async function deleteRowItem(actor, id, {confirm = confirmDanger, user = globalThis.game?.user} = {}) {
  const item = actor?.items?.get?.(id) ?? null, plan = deletePlan(actor, item, user);
  if (plan.action === 'blocked') return refuse(plan.error);
  try {
    if (plan.action === 'dnd5e') { await item.deleteDialog(); return {ok: true, result: null}; }
    const ok = await confirm(`${plan.warn ? `${plan.warn}\n\n` : ''}This removes it from the character sheet.`, {title: `Delete ${item.name}?`, yes: `Delete ${item.name}`});
    if (!ok) return {ok: true, result: null};
    await actor.deleteEmbeddedDocuments('Item', [id]);
    return {ok: true, result: id};
  } catch (err) {
    console.error('ashen-gate-character-hub | delete', err);
    return refuse(`Could not delete ${item?.name ?? 'the item'}: ${err?.message ?? err}`);
  }
}

// ---------- The menu (DOM; no redraw) ----------

export const ROW_SELECTOR = 'li[data-item-id]';
/** The list row (Combat, Inventory, Magic, Features, and perk rows) a target is in, or null. Partner embeds keep their own menus. */
export function rowOf(target) {
  if (target?.closest?.('.agch-embed, .agch-rowmenu')) return null;
  const li = target?.closest?.(ROW_SELECTOR);
  return li && li.closest?.('.agch-body') ? li : null;
}
const focusable = menu => [...(menu?.querySelectorAll?.('[role="menuitem"]') ?? [])];
/** The id of the row to focus after `li` goes: the next row in its list, else the previous one. */
export function neighbourRowId(li) {
  const rows = [...(li?.parentElement?.querySelectorAll?.(':scope > li[data-item-id]') ?? [])], i = rows.indexOf(li);
  return (rows[i + 1] ?? rows[i - 1])?.dataset?.itemId ?? null;
}
/** The control that gets focus on a row (its chevron button, else its first button). */
export const rowFocusTarget = li => li?.querySelector?.('.agch-card__main button, button') ?? null;

export function closeRowMenu(sheet, {refocus = true} = {}) {
  const m = sheet._rowMenu; if (!m) return;
  sheet._rowMenu = null;
  m.menu.remove?.();
  if (refocus) { const t = m.opener?.isConnected === false ? rowFocusTarget(m.content?.querySelector?.(`li[data-item-id="${m.id}"]`)) : m.opener; try { t?.focus?.(); } catch { /* courtesy */ } }
}

/**
 * Opens the row menu at a point (right-click) or under the row (keyboard). `act` runs the chosen action:
 * act('open' | 'delete' | 'trees', id). Returns the menu element, or null when this user can't change the character.
 */
export function openRowMenu(sheet, li, {x = null, y = null, act}) {
  const actor = sheet.document, id = li?.dataset?.itemId, item = actor?.items?.get?.(id);
  if (!li || !item || !canEdit(actor)) return null;
  closeRowMenu(sheet, {refocus: false});
  const doc = li.ownerDocument, content = li.closest?.('.agch-root') ?? sheet.element, plan = deletePlan(actor, item);
  const menu = doc.createElement('div');
  menu.className = 'agch-menu agch-rowmenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Actions for ${item.name}`);
  const entry = (key, label, {disabled = false, danger = false, describedby = ''} = {}) => `<button type="button" role="menuitem" class="agch-rowmenu__item${danger ? ' is-danger' : ''}" data-rowmenu="${key}" tabindex="-1"${disabled ? ' aria-disabled="true"' : ''}${describedby ? ` aria-describedby="${describedby}"` : ''}>${esc(label)}</button>`;
  const blocked = plan.action === 'blocked';
  const reasonId = `agch-rowmenu-why-${esc(id)}`;
  menu.innerHTML = `${entry('open', 'Open sheet')}${plan.managed === 'trees' ? entry('trees', 'Open Skill Trees…') : ''}${entry('delete', blocked ? 'Delete…' : 'Delete…', {disabled: blocked, danger: true, describedby: blocked ? reasonId : ''})}${blocked ? `<p class="agch-muted agch-rowmenu__why" id="${reasonId}">${esc(plan.error)}</p>` : ''}`;
  content.appendChild(menu);
  const root = content.getBoundingClientRect?.() ?? {left: 0, top: 0, width: 0, height: 0}, anchor = li.getBoundingClientRect?.() ?? {left: 0, bottom: 0};
  const px = x ?? anchor.left + 16, py = y ?? anchor.bottom;
  const w = menu.offsetWidth || 200, h = menu.offsetHeight || 100;
  menu.style.left = `${Math.max(0, Math.min(px - root.left, (root.width || w) - w - 4))}px`;
  menu.style.top = `${Math.max(0, Math.min(py - root.top, (root.height || h) - h - 4))}px`;
  const opener = doc.activeElement && li.contains(doc.activeElement) ? doc.activeElement : rowFocusTarget(li);
  sheet._rowMenu = {menu, id, opener, content};
  menu.addEventListener('keydown', ev => {
    const items = focusable(menu), i = items.indexOf(doc.activeElement);
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeRowMenu(sheet); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (ev.key === 'Home') { ev.preventDefault(); items[0]?.focus(); }
    else if (ev.key === 'End') { ev.preventDefault(); items.at(-1)?.focus(); }
    else if (ev.key === 'Tab') { ev.preventDefault(); closeRowMenu(sheet); }
  });
  menu.addEventListener('click', ev => {
    const b = ev.target?.closest?.('[data-rowmenu]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    ev.preventDefault(); ev.stopPropagation();
    const key = b.dataset.rowmenu, focusId = key === 'delete' ? neighbourRowId(li) : null;
    closeRowMenu(sheet, {refocus: key !== 'delete'});
    act?.(key, id, focusId);
  });
  focusable(menu)[0]?.focus?.();
  return menu;
}
