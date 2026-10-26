/**
 * "Art is always yours" (0.70.0). Pure: no Foundry globals.
 *
 * Art the GM set himself (Items > Assets > Link files to records, the token ring tool, or by hand in Foundry) is never a reason to
 * keep a record back from a Sync or an Update, and is never overwritten by either.
 *
 * WHAT COUNTS AS ART (one place, change it here):
 *   img                          a document's portrait / icon (Actor, Item, Journal, Roll Table, Macro)
 *   prototypeToken.texture.src   an Actor's token image
 *   prototypeToken.ring.*        the dynamic token ring (enabled, colours, subject texture and scale, effects)
 * Not art: token size, scale, tint, sight or name; images written inline in page or description HTML (that is text); an embedded
 * Item's icon on an Actor.
 *
 * THE RULE, per art field, given the world's value (live), the package's value (incoming) and the baseline (the package value
 * the last import or sync wrote into the Manager source flag, managedFields):
 *   live equals incoming            nothing to do;
 *   baseline known, live == baseline  the GM never changed it: the package's new art flows in;
 *   baseline known, live != baseline  the GM changed it: KEEP the GM's value;
 *   no baseline for the field        KEEP unless the world's value is blank (empty, a placeholder icon, a switched-off ring).
 * The baseline is always stamped with the PACKAGE's value (never the GM's art), so a later package art change still reaches a
 * document the GM never customised, while art the GM set keeps winning.
 */
import {isPlaceholderIcon, plannerIcon} from './smart-icons.js';

const isPlainObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const sorted = v => Array.isArray(v) ? v.map(sorted) : isPlainObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const equal = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const RING_RE = /^prototypeToken\.ring(\.|$)/;
export const isArtPath = path => typeof path === 'string' && (path === 'img' || path === 'prototypeToken.texture.src' || RING_RE.test(path));

/** The one-line wording of the fields in `paths`, e.g. "portrait and token". */
export function artWords(paths, documentName = 'Actor') {
  const words = [];
  if (paths.includes('img')) words.push(documentName === 'Actor' ? 'portrait' : 'image');
  if (paths.includes('prototypeToken.texture.src')) words.push('token');
  if (paths.some(p => RING_RE.test(p))) words.push('ring');
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] ?? 'image';
}
export const artSentence = (paths, documentName) => `Keeping your ${artWords(paths, documentName)} art`;

export const artLabel = (path, documentName = 'Actor') => path === 'img' ? (documentName === 'Actor' ? 'portrait' : 'image')
  : path === 'prototypeToken.texture.src' ? 'token image' : `token ring (${path.replace(RING_RE, '').replace(/^\./, '') || 'ring'})`;

const blank = (path, value) => {
  if (value === undefined || value === null || value === '' || value === false) return true;
  if (isPlainObject(value) && !Object.keys(value).length) return true;
  return typeof value === 'string' && (path === 'img' || path.endsWith('.src') || path.endsWith('.texture')) && isPlaceholderIcon(value);
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);

/** 'same' | 'package' (the package's value may be written) | 'keep' (the world's value is the GM's art). */
export function artDecision(path, live, incoming, baseline = {}) {
  if (equal(live ?? null, incoming ?? null)) return 'same';
  if (has(baseline, path)) return equal(live ?? null, baseline[path] ?? null) ? 'package' : 'keep';
  return blank(path, live) ? 'package' : 'keep';
}

/** The world's value of an art field as the planner reads it (an icon Manager picked itself reads as the baseline). */
export function liveArt(path, raw, baseline = {}, get) {
  const live = get(raw, path);
  return path === 'img' ? plannerIcon(live, raw?.flags?.['ashen-gate-manager'], baseline.img) : live;
}
