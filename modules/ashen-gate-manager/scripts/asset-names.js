/**
 * Name guessing for Items → Assets: turns a file name and a record name into comparable words, and says how well they
 * match. Pure (no Foundry), so the Node suite covers it directly. A guess only ever suggests a row in the preview; the
 * GM still presses Link.
 */

/** Words that mean "this is a picture of it", not part of anyone's name. File names only. */
export const NOISE_WORDS = new Set(['portrait', 'token', 'art', 'final', 'image', 'img', 'icon', 'copy', 'png', 'webp', 'jpg', 'jpeg', 'gif', 'avif', 'svg', 'px']);
/** Titles removed from the start of a record name (only when a name is left afterwards). */
export const TITLE_WORDS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'mister', 'dr', 'dame', 'sir', 'lord', 'lady']);
/** Words too common to identify anyone on their own: never used for a first-name or last-name guess. */
export const COMMON_WORDS = new Set([
  'the', 'and', 'of', 'old', 'young', 'big', 'little', 'great', 'man', 'men', 'woman', 'boy', 'girl', 'guard', 'guards', 'king', 'queen',
  'captain', 'master', 'mister', 'sir', 'dame', 'lord', 'lady', 'father', 'mother', 'brother', 'sister', 'son', 'daughter', 'one', 'two', 'three',
  'red', 'blue', 'black', 'white', 'grey', 'gray', 'green', 'dark', 'light', 'stone', 'iron', 'gold', 'silver', 'new', 'npc', 'pc', 'loc', 'rec',
  'mat', 'perk', 'prof', 'fac', 'tbl', 'jrn', 'mac', 'item', 'actor', 'unknown', 'stranger', 'merchant', 'priest', 'guide', 'keeper', 'warden']);
const IMAGE_EXT = /\.(webp|png|jpe?g|gif|avif|svg)$/i;

function words(text) {
  return String(text ?? '')
    .replace(/([\p{Ll}])(\p{Lu})/gu, '$1 $2') // OrenVale → Oren Vale
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/\b\d+\s*x\s*\d+\b|\b\d+\s*px\b|\bv\d+\b/g, ' ') // 512x512, 1024px, v2
    .replace(/[_\-.]/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ') // digits and symbols (so trailing numbers go too)
    .split(/\s+/).filter(w => w.length >= 2);
}

/** The words of a file name: "Oren_Vale-portrait-512.webp" → ["oren", "vale"]. */
export function fileWords(fileName) {
  const base = String(fileName ?? '').replace(IMAGE_EXT, '');
  return words(base).filter(w => !NOISE_WORDS.has(w));
}

/** The words of a record name: "Dame Oren Vale" → ["oren", "vale"]. Titles and "the" go only if a name is left. */
export function nameWords(name) {
  let list = words(name);
  while (list.length > 1 && TITLE_WORDS.has(list[0])) list = list.slice(1);
  const withoutThe = list.filter(w => w !== 'the');
  return withoutThe.length ? withoutThe : list;
}

const usable = word => word.length >= 3 && !COMMON_WORDS.has(word);
function containsRun(haystack, needle) {
  for (let i = 0; i + needle.length <= haystack.length; i++) if (needle.every((w, j) => haystack[i + j] === w)) return true;
  return false;
}

export const MATCH_REASONS = Object.freeze({
  id: 'The file is named exactly after this record',
  whole: 'Matches the whole name',
  both: 'Matches the first and last name',
  first: 'Matches the first name',
  last: 'Matches the last name',
  name: 'Matches the name (the file name has extra words)'
});
/** Higher is stronger. */
export const MATCH_RANK = Object.freeze({id: 100, whole: 90, both: 80, name: 75, first: 70, last: 60});

/**
 * How well a file's words fit a record's words, or null. `partial` allows the first/last-name guesses (used for
 * Actors only: a lone surname on an Item file would mislead).
 * Returns {kind: 'whole'|'both'|'name'|'first'|'last', rank, reason}.
 */
export function matchLevel(file, record, {partial = false} = {}) {
  if (!file?.length || !record?.length) return null;
  const hit = kind => ({kind, rank: MATCH_RANK[kind], reason: MATCH_REASONS[kind]});
  if (file.length === record.length && file.every((w, i) => w === record[i])) return hit('whole');
  if (record.length >= 2 && containsRun(file, record)) return hit('whole');
  if (!partial) return null;
  if (record.length === 1) return usable(record[0]) && file.includes(record[0]) ? hit('name') : null;
  const first = record[0], last = record[record.length - 1];
  if (first !== last && file.includes(first) && file.includes(last) && (usable(first) || usable(last))) return hit('both');
  if (usable(first) && file.includes(first)) return hit('first');
  if (usable(last) && file.includes(last)) return hit('last');
  return null;
}
