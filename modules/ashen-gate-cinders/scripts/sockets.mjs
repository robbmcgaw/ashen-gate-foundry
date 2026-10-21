/** Cinder sockets (0.3.0): pure rules, no Foundry globals.
 * Each Cinder instance keeps its own socket list. An attached item stays an Item in the bearer's inventory; the Cinder keeps
 * only a reference. Its cinder modifiers count while it is attached and active. Nothing here deletes an item. */
export const SOCKETS_CONTRACT = 'ag-sockets/1';
export const SOCKETS_HOOK = 'ashenGateSockets.changed';
/** Technical bounds, not balance: how many sockets one Cinder can show, and how many recent operation ids it remembers. */
export const MAX_SOCKETS = 12;
const OPS_KEPT = 30;
const plain = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const int = v => Number.isSafeInteger(v);
const arr = v => Array.isArray(v) ? v : [];
const clampCount = n => Math.max(0, Math.min(MAX_SOCKETS, int(n) ? n : 0));

/** {attached:[{slot, itemId, sourceId, by, at}] by slot, locked, count (GM override or null), ops:[opId]}. Missing = no sockets used. */
export function normalizeSockets(raw) {
  const r = plain(raw) ? raw : {};
  const seenSlot = new Set(), seenItem = new Set();
  const attached = arr(r.attached).filter(a => plain(a) && int(a.slot) && a.slot >= 0 && a.slot < MAX_SOCKETS && typeof a.itemId === 'string' && a.itemId)
    .sort((a, b) => a.slot - b.slot)
    .filter(a => !seenSlot.has(a.slot) && !seenItem.has(a.itemId) && seenSlot.add(a.slot) && seenItem.add(a.itemId))
    .map(a => ({slot: a.slot, itemId: a.itemId, sourceId: typeof a.sourceId === 'string' ? a.sourceId : null, by: typeof a.by === 'string' ? a.by : null, at: Number(a.at) || 0}));
  return {attached, locked: r.locked === true, count: int(r.count) && r.count >= 0 ? Math.min(MAX_SOCKETS, r.count) : null,
    ops: arr(r.ops).filter(x => typeof x === 'string').slice(-OPS_KEPT)};
}
/** The player-safe copy kept on the bearer's Cinder pointer (no user ids, no operation ids). */
export const socketMirror = sockets => ({attached: sockets.attached.map(({slot, itemId, sourceId}) => ({slot, itemId, sourceId})), locked: sockets.locked, count: sockets.count});

/**
 * Work out capacity and which attached items are active.
 * - base: the GM's per-Cinder override, else the world setting.
 * - hostBonus(): sockets.count from the Cinder's powers and the bearer's perks.
 * - itemBonus(itemIds): sockets.count added by those attached items (only items active before any item bonus count, so an item
 *   never keeps itself active).
 * present(itemId): the item is still on the bearer. Attached items are active in slot order up to the capacity; the rest stay
 * attached but inactive until one is removed.
 */
export function socketPlan(sockets, {setting = 0, hostBonus = 0, itemBonus = () => 0, present = () => true} = {}) {
  const base = sockets.count ?? clampCount(setting);
  const attached = sockets.attached.filter(a => present(a.itemId));
  const first = clampCount(base + (int(hostBonus) ? hostBonus : 0));
  const bonus = Number(itemBonus(attached.slice(0, first).map(a => a.itemId))) || 0;
  const capacity = clampCount(first + (int(bonus) ? bonus : 0));
  const slots = attached.map((a, i) => ({...a, active: i < capacity}));
  return {base, capacity, slots, free: Math.max(0, capacity - attached.length), missing: sockets.attached.length - attached.length};
}
const lowestFree = (sockets, limit) => {for (let s = 0; s < limit; s++) if (!sockets.attached.some(a => a.slot === s)) return s; return null;};

/**
 * One socket change on a normalized socket list. op: {kind: 'attach'|'detach'|'swap', slot?, itemId?, sourceId?, by?, at?, opId?}.
 * plan: socketPlan for the current list (capacity, free). Returns {sockets, changed, slot, removed?} or throws a plain message.
 * A repeated opId changes nothing ({changed: false, duplicate: true}).
 */
export function applySocketOp(sockets, op, plan) {
  if (op.opId && sockets.ops.includes(op.opId)) return {sockets, changed: false, duplicate: true, slot: op.slot ?? null};
  const at = Number(op.at) || 0, by = typeof op.by === 'string' ? op.by : null;
  const remember = next => ({...next, ops: op.opId ? [...next.ops, op.opId].slice(-OPS_KEPT) : next.ops});
  const entry = slot => ({slot, itemId: op.itemId, sourceId: op.sourceId ?? null, by, at});
  if (!['attach', 'detach', 'swap'].includes(op.kind)) throw Error('Unknown socket operation');
  if (op.slot != null && (!int(op.slot) || op.slot < 0 || op.slot >= MAX_SOCKETS)) throw Error('That socket does not exist');
  if (op.kind === 'detach') {
    const hit = sockets.attached.find(a => a.slot === op.slot);
    if (!hit) throw Error('That socket is empty');
    return {sockets: remember({...sockets, attached: sockets.attached.filter(a => a !== hit)}), changed: true, slot: op.slot, removed: hit};
  }
  if (typeof op.itemId !== 'string' || !op.itemId) throw Error('Choose an item');
  if (op.kind === 'attach') {
    if (sockets.attached.some(a => a.itemId === op.itemId)) throw Error('That item is already in a socket on this Cinder');
    if (plan.free <= 0) throw Error(plan.capacity ? `All ${plan.capacity} socket${plan.capacity === 1 ? ' is' : 's are'} in use; detach an item first` : 'This Cinder has no sockets');
    const slot = op.slot ?? lowestFree(sockets, MAX_SOCKETS);
    if (slot == null || sockets.attached.some(a => a.slot === slot)) throw Error('That socket is in use; use Swap');
    return {sockets: remember({...sockets, attached: [...sockets.attached, entry(slot)].sort((a, b) => a.slot - b.slot)}), changed: true, slot};
  }
  {
    const hit = sockets.attached.find(a => a.slot === op.slot);
    if (!hit) throw Error('That socket is empty; use Attach');
    if (hit.itemId === op.itemId) return {sockets: remember(sockets), changed: false, slot: op.slot};
    // The new item may already sit in another socket of this Cinder: it moves here, the old one comes out.
    const rest = sockets.attached.filter(a => a !== hit && a.itemId !== op.itemId);
    return {sockets: remember({...sockets, attached: [...rest, entry(op.slot)].sort((a, b) => a.slot - b.slot)}), changed: true, slot: op.slot, removed: hit};
  }
}
/** Take an item out of every socket in the list (it was attached elsewhere, or the item is gone). */
export const withoutItem = (sockets, itemId) => ({...sockets, attached: sockets.attached.filter(a => a.itemId !== itemId)});
/** Empty sockets (transfer, unbind, lost): the items stay in the old bearer's inventory, detached. Lock and override are kept. */
export const emptied = sockets => ({...sockets, attached: []});
