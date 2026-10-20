/**
 * Ashen Gate Locations 1.12.0: map drawings for routes. Pure; no Foundry globals.
 *
 * A route can be bound to one Foundry Drawing (Scene embedded document; V14 fields used here: x, y, rotation,
 * shape {type, width, height, points}, hidden, text, flags). The binding is two-way: the route stores the drawing's
 * uuid, the drawing carries flags['ashen-gate-locations'].routeId. Locations only ever changes the drawing's
 * `hidden` (and that flag); it never edits its shape or text, and deletes it only when the GM confirms.
 *
 * A Drawing is hidden or shown for everyone at once, so it is shown only while EVERY player gets the full route
 * (discovered, both ends visible to each of them, nobody left out by an audience). Foundry still sends a hidden
 * drawing's data to every client, like any hidden document; nothing secret is ever written into it.
 */
import {routeVariantFor} from './routes.mjs';

/** Should the drawing be visible to players? `players`: player user ids. With no players, keep it hidden. */
export function drawingShouldShow(route, locById, players) {
  return players.length > 0 && players.every(u => routeVariantFor(route, locById, u) === 'full');
}
/** The update a linked drawing needs ({hidden}), or null when it already matches. */
export function drawingPatch(drawing, show) {
  const hidden = !show;
  return drawing?.hidden === hidden ? null : {hidden};
}

/** A drawing's path in scene coordinates: [{x, y}, ...], or null when it is not a simple line or polygon. */
export function drawingPath(drawing) {
  const s = drawing?.shape;
  const pts = Array.isArray(s?.points) ? s.points : [];
  if (!['p', 'f'].includes(s?.type) || pts.length < 4 || (drawing.rotation ?? 0) !== 0) return null;
  const out = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const x = Number(pts[i]) + Number(drawing.x ?? 0), y = Number(pts[i + 1]) + Number(drawing.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push({x, y});
  }
  return out.length >= 2 ? out : null;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** The path running from the route's From pin (reversed when its far end is nearer that pin). */
export function orientPath(path, fromPin, toPin) {
  if (!path || !fromPin) return path;
  const a = path[0], b = path[path.length - 1];
  const forward = dist(a, fromPin) + (toPin ? dist(b, toPin) : 0), backward = dist(b, fromPin) + (toPin ? dist(a, toPin) : 0);
  return backward < forward ? [...path].reverse() : path;
}
/** The point a fraction t (0–1) of the way along a path, by length. */
export function pointAlong(path, t) {
  const total = path.slice(1).reduce((n, p, i) => n + dist(path[i], p), 0);
  if (!total) return {x: Math.round(path[0].x), y: Math.round(path[0].y)};
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1], path[i]);
    if (left <= seg || i === path.length - 1) {
      const f = seg ? Math.min(1, left / seg) : 0;
      return {x: Math.round(path[i - 1].x + (path[i].x - path[i - 1].x) * f), y: Math.round(path[i - 1].y + (path[i].y - path[i - 1].y) * f)};
    }
    left -= seg;
  }
  return {x: Math.round(path.at(-1).x), y: Math.round(path.at(-1).y)};
}

/** Drawing data for "Draw for me": a straight open line between the two pins, which the GM can reshape. No text. */
export function routeLineData(fromPin, toPin, {routeId, hidden = true, fillNone = 0, color = '#c9a227'} = {}) {
  const x = Math.min(fromPin.x, toPin.x), y = Math.min(fromPin.y, toPin.y);
  const width = Math.abs(toPin.x - fromPin.x), height = Math.abs(toPin.y - fromPin.y);
  return {x, y, shape: {type: 'p', width, height, points: [fromPin.x - x, fromPin.y - y, toPin.x - x, toPin.y - y]},
    strokeWidth: 6, strokeColor: color, strokeAlpha: 0.9, fillType: fillNone, bezierFactor: 0, text: '', hidden,
    flags: {'ashen-gate-locations': {routeId}}};
}
