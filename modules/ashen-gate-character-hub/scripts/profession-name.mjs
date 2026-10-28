/**
 * 0.62.1: a profession's name as the Hub shows it. A profession Item or Skill Trees tree is often named "Archaeology — Profession";
 * the Features heading already says "Professions:", so the Hub drops the trailing " — Profession" (also " - " and " – ", any case).
 * Display only: the Item, the tree and the Ledger keep their names, and group keys / sort ids never use this text.
 */
const SUFFIX = /\s+[—–-]\s*profession\s*$/i;
export function displayProfessionName(name) {
  const s = String(name ?? '');
  const short = s.replace(SUFFIX, '').trim();
  return short ? short : s;   // never reduce a name to nothing
}
/** A Features row in a profession's Origin group, named as shown; `fullName` keeps the Item's real name for search. Other rows come back as they are. */
export function professionRow(row, origin) {
  if (origin?.section !== 'profession') return row;
  const short = displayProfessionName(row.name);
  return short === row.name ? row : {...row, name: short, fullName: row.name};
}
