/** Cinder sheet (0.6.0): pure rules for the orb, its Strain ring and the socket orbit. No Foundry globals.
 * The orb is the Cinder's own `art` image when the GM set one, else one shared default orb drawn in CSS whose colour follows Strain only. */
export const ART_MAX = 1024;
/** Where the GM's file picker opens (Forge Assets Library folder). */
export const ART_FOLDER = 'ashen-gate/cinders/';

/** A saved art path, or null. Accepts a relative path or an http(s) URL; refuses anything that could run or break out of an attribute. */
export function cleanArt(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > ART_MAX || /[\u0000-\u001f"'<>`\\]/.test(s)) return null;
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') return null;
  return s;
}
/** setArt input: a path, or null / '' to go back to the default orb. Throws on anything else. */
export function artInput(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
  const s = cleanArt(raw);
  if (!s) throw Error('Choose an image file (a path in the Assets Library or an http(s) address)');
  return s;
}
/** What the orb shows: the Cinder's own art, else the default orb. The definition Item's image is never used. */
export const orbArt = cinder => {const src = cleanArt(cinder?.art); return src ? {kind: 'image', src} : {kind: 'default', src: null};};

/** Default orb tone from Strain only: calm at 0, warm, ember from half the guarantee point, hot at the guarantee point. */
export function strainTone(value, guaranteeAt = 10) {
  const top = Math.max(1, Number.isSafeInteger(guaranteeAt) ? guaranteeAt : 10), v = Number.isFinite(value) ? value : 0;
  if (v >= top) return 'hot';
  if (v >= Math.ceil(top / 2)) return 'ember';
  return v > 0 ? 'warm' : 'calm';
}

const VIEW = 320, C = VIEW / 2, R = 76, PIP_R = 88, ORBIT = 41;
const pt = (r, deg) => {const a = deg * Math.PI / 180; return [(C + r * Math.cos(a)).toFixed(1), (C + r * Math.sin(a)).toFixed(1)];};
/**
 * The Strain ring around the orb: `top` segments (the guarantee point, 10 by default) filled up to the value, then one pip per point
 * over it ("+N over 10"). Geometry for a 320×320 SVG; colours come from CSS classes.
 */
export function ringModel(value, top = 10) {
  const n = Math.max(1, Number.isSafeInteger(top) ? top : 10), v = Math.max(0, Number.isSafeInteger(value) ? value : 0);
  const step = 360 / n, gap = Math.min(4, step / 4), over = Math.max(0, v - n);
  const segments = Array.from({length: n}, (_, i) => {
    const [x0, y0] = pt(R, -90 + i * step + gap / 2), [x1, y1] = pt(R, -90 + (i + 1) * step - gap / 2);
    return {on: i < v, d: `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`};
  });
  // Pips past the guarantee point: 12° apart, a second lap moves outward so each one stays visible.
  const pips = Array.from({length: over}, (_, i) => {const [cx, cy] = pt(PIP_R + Math.floor(i / 30) * 9, -90 + (i % 30) * 12 + 6); return {cx, cy};});
  return {view: VIEW, top: n, value: v, over, hot: v >= n, segments, pips};
}

/**
 * Sockets on the orbit, from an api.sockets host ({base, capacity, slots:[{slot, itemId, active, ...}]}).
 * Positions are the capacity: the active items in slot order, then the free sockets (with the slot number an attach uses).
 * A position past the Cinder's base count is an extra socket ("+1"). Items over capacity stay off the orbit (inactive).
 */
export function orbitModel(host, maxSockets = 12) {
  const capacity = Math.max(0, host?.capacity ?? 0), base = Math.max(0, host?.base ?? 0), slots = Array.isArray(host?.slots) ? host.slots : [];
  const active = slots.filter(s => s.active), used = new Set(slots.map(s => s.slot));
  const freeSlots = [];
  for (let s = 0; s < maxSockets && freeSlots.length < Math.max(0, capacity - active.length); s++) if (!used.has(s)) freeSlots.push(s);
  const entries = [...active.map(s => ({...s, empty: false})), ...freeSlots.map(slot => ({slot, empty: true, itemId: null, active: true}))].slice(0, capacity);
  const n = entries.length;
  const positions = entries.map((e, i) => {
    const deg = -90 + (n ? 360 / n * i : 0) + (n % 2 ? 0 : 180 / Math.max(1, n));
    const a = deg * Math.PI / 180;
    return {...e, index: i, extra: i >= base, x: Number((50 + ORBIT * Math.cos(a)).toFixed(2)), y: Number((50 + ORBIT * Math.sin(a)).toFixed(2))};
  });
  return {positions, inactive: slots.filter(s => !s.active), capacity, base};
}
