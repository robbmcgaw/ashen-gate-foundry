/**
 * 0.32.0: nested, collapsible Region headers for the Locations list (GM "Group by Region" and the player list). Pure: no Foundry globals.
 *
 * A Region is a location with `isRegion` (GM records) or a view with `isRegion` (players). A place sits under the headers of its Region
 * ancestors, outermost first: Fosstryn Frontier > Fosstryn > The Muster. Ancestors that are not Regions (a town holding a shop) are
 * skipped by the headers and stay as nested rows (the existing tree rows). Places with no Region ancestor are grouped by their free-text
 * `region`, as before ("No region" last), and a group whose label equals a top-level Region header joins it.
 *
 * Player safety (never names anything the player cannot see): the input is only what the player can see, and the chain is walked through
 * `parentOf` alone. A player view's `parent` is present only when that parent is itself visible to this player, so a hidden Region with a
 * visible child is never reachable: the child's chain simply stops, and it falls into the nearest visible ancestor's section (or the flat
 * region groups when there is none). An unidentified place appears by its generic label only, and (players) is a header only when a visible
 * place sits inside it, because a bare unidentified view cannot say what kind of place it is.
 *
 * 0.45.0: an unidentified view may carry a `parent` too, but only a parent this player can see (playerView/companionView decide that). Such a
 * place sits under its parent's headers like any other row. Without a visible parent it stays in the flat "Unidentified" group, as before. An
 * unidentified place never makes its parent a header, and is not part of a header's `count`; it is counted apart in `unidentified` (each is a
 * visible row under that header anyway, so the number says nothing the list does not).
 */

/** GM records. */
export const GM_ACCESS = Object.freeze({
  idOf: l => l.id, parentOf: l => l.parentLocationId || '', nameOf: l => l.name,
  isRegion: l => l.isRegion === true, looseOf: l => l.region || '', unidentifiedFlat: () => false, containerHeader: () => false
});
/** Player views: the pin key is the identity; `parent` is present only when the player may see it. */
export const VIEW_ACCESS = Object.freeze({
  idOf: v => v.key || v.id, parentOf: v => v.parent?.key || '', nameOf: v => v.name,
  isRegion: v => v.isRegion === true, looseOf: v => v.region || '', unidentifiedFlat: v => v.state === 'unidentified',
  containerHeader: v => v.state === 'unidentified'
});

export const NO_REGION = 'No region';
export const UNIDENTIFIED = 'Unidentified';
/** Sort rank of a root section: Regions, then unidentified containers, then the flat "No region" and "Unidentified" groups. */
const rankOf = s => s.flat ? (s.label === UNIDENTIFIED ? 3 : s.label === NO_REGION ? 2 : 0) : s.container ? 1 : 0;

/**
 * Sections for `items` (the places to show, structure included: pass the places to display plus their ancestors).
 * Returns [{id, label, item, container, flat, sections: [section], rows: [item], count, unidentified}]: `rows` are the places directly under this header
 * (nest them with buildTree), `count` is every place inside it at any depth (headers themselves are not counted). Pure; items are not changed.
 */
export function buildRegionSections(items, access = GM_ACCESS, {sortRows = null} = {}) {
  const A = {...GM_ACCESS, ...access};
  const byId = new Map(items.map(i => [A.idOf(i), i]));
  const parents = new Map(items.map(i => [A.idOf(i), A.parentOf(i)]));
  // The chain of ancestors present in `items`, nearest first. A missing parent or a loop ends it.
  const chain = i => {
    const out = [], seen = new Set([A.idOf(i)]);
    for (let p = parents.get(A.idOf(i)); p && byId.has(p) && !seen.has(p); p = parents.get(p)) { seen.add(p); out.push(byId.get(p)); }
    return out;
  };
  const chains = new Map(items.map(i => [A.idOf(i), chain(i)]));
  // A Region (or, for players, an unidentified place) becomes a header only when something is inside it; otherwise it is an ordinary row.
  // An unidentified place does not make its parent a header (0.45.0).
  const inside = new Set();
  for (const i of items) if (!A.unidentifiedFlat(i)) for (const a of chains.get(A.idOf(i))) inside.add(A.idOf(a));
  const isHeader = i => inside.has(A.idOf(i)) && (A.isRegion(i) || A.containerHeader(i));
  const headerIds = new Set(items.filter(isHeader).map(A.idOf));

  const sections = new Map();
  const make = i => ({id: A.idOf(i), label: A.nameOf(i), item: i, container: !A.isRegion(i), flat: false, sections: [], rows: [], count: 0, unidentified: 0});
  for (const i of items) if (headerIds.has(A.idOf(i))) sections.set(A.idOf(i), make(i));
  const home = i => chains.get(A.idOf(i)).find(a => headerIds.has(A.idOf(a))) ?? null;

  const root = [], loose = new Map();
  const looseSection = label => {
    if (!loose.has(label)) loose.set(label, {id: `loose:${label}`, label, item: null, container: false, flat: true, sections: [], rows: [], count: 0, unidentified: 0});
    return loose.get(label);
  };
  for (const i of items) {
    const id = A.idOf(i), h = home(i);
    if (headerIds.has(id)) { (h ? sections.get(A.idOf(h)).sections : root).push(sections.get(id)); continue; }
    if (h) { sections.get(A.idOf(h)).rows.push(i); continue; }
    // An unidentified place with a visible parent joins the parent's flat group (so the tree can nest it); with none it is in "Unidentified".
    const up = A.unidentifiedFlat(i) ? chains.get(id)[0] : null;
    looseSection(A.unidentifiedFlat(i) ? (up ? A.looseOf(up) || NO_REGION : UNIDENTIFIED) : A.looseOf(i) || NO_REGION).rows.push(i);
  }
  // A flat region group named like a top-level Region header joins it (the same name twice would only confuse).
  const top = new Map(root.filter(s => !s.container).map(s => [s.label.trim().toLowerCase(), s]));
  for (const s of loose.values()) {
    const into = s.label === NO_REGION || s.label === UNIDENTIFIED ? null : top.get(s.label.trim().toLowerCase());
    if (into) into.rows.push(...s.rows); else root.push(s);
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  const finish = s => {
    s.sections.sort(byLabel);
    if (sortRows) s.rows.sort(sortRows);
    const flatUnidentified = s.flat && s.label === UNIDENTIFIED;
    const unid = flatUnidentified ? 0 : s.rows.filter(A.unidentifiedFlat).length;
    s.count = s.rows.length - unid;
    s.unidentified = unid;
    for (const c of s.sections) { finish(c); s.count += c.count; s.unidentified += c.unidentified; }
    return s.count + s.unidentified;
  };
  for (const s of root) finish(s);
  return root.sort((a, b) => rankOf(a) - rankOf(b) || byLabel(a, b));
}

/** Does this section (or any section inside it) hold the place `id`, or is it that place's own header? Used to arrange the headers when a place is selected. */
export function sectionHas(section, id, access = GM_ACCESS) {
  if (!id) return false;
  const A = {...GM_ACCESS, ...access};
  if (section.item && A.idOf(section.item) === id) return true;
  return section.rows.some(r => A.idOf(r) === id) || section.sections.some(s => sectionHas(s, id, access));
}

/** Header sections in display order, flattened, with their depth (for tests and "collapse all"). */
export function flattenSections(sections, depth = 0, out = []) {
  for (const s of sections) { out.push({section: s, depth}); flattenSections(s.sections, depth + 1, out); }
  return out;
}

/**
 * The remembered collapsed headers, per user, in a kit uiState (`mem`: {get(key, fallback), set(key, value)}). Ids only; never throws.
 * Without storage nothing is remembered and every header starts open.
 */
export const FOLD_KEY = 'regionFolds';
export function readFolds(mem) {
  try { const v = mem.get(FOLD_KEY, []); return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 500) : []); } catch { return new Set(); }
}
/** Folds or unfolds `id` in `folds` (the window's live Set, so it works even when storage is blocked) and saves the set. Returns `folds`. */
export function toggleFold(mem, folds, id) {
  if (!folds.delete(id)) folds.add(id);
  try { mem.set(FOLD_KEY, [...folds].slice(0, 500)); } catch { /* the choice lasts only until the window closes */ }
  return folds;
}

/**
 * 0.32.2: the arrangement a newly selected place gets. Every header that does not hold it folds; every header on its path (and its own
 * header, when it is a Region) unfolds. Applied to the live `folds` Set and saved. Run only when the selection CHANGES, never on a redraw,
 * so a header the user toggles afterwards stays as they left it. `sections` is what the user can see (players: visible places only).
 */
export function arrangeFolds(mem, folds, sections, selectedId, access = GM_ACCESS) {
  if (!selectedId) return folds;
  for (const {section} of flattenSections(sections)) {
    if (sectionHas(section, selectedId, access)) folds.delete(section.id); else folds.add(section.id);
  }
  try { mem.set(FOLD_KEY, [...folds].slice(0, 500)); } catch { /* the arrangement lasts only until the window closes */ }
  return folds;
}
