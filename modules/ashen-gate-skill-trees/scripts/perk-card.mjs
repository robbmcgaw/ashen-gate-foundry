/**
 * Perk card model for the Character Hub embed (0.24.4). Pure: no Foundry, no DOM, so it runs the same in tests.
 *
 * A perk Item's description is HTML: a small two-column table (Specialty, Tier, Type, Automation, Requires, Uses, Tool ...)
 * followed by headed sections ("Effect & Rules", "Notes"). Before 0.24.4 the embed stripped every tag and showed the result as
 * one run-together string. This reads the already-sanitised markup (perk-html.mjs: no attributes, allow-listed tags only) and
 * returns the pieces separately: labelled meta pairs, a short effect summary, and the remaining description as safe HTML for a
 * Details fold. Plain text (a perk with no HTML description) falls back to a summary and one escaped paragraph.
 */
const ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '};
const decode = s => s.replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, m => ENTITIES[m]);
const escapeText = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Visible text of sanitised markup. Block boundaries become spaces, so adjacent cells and headings never run together. */
export const textOf = html => decode(String(html ?? '').replace(/<\/?(?:p|br|hr|div|section|li|ul|ol|tr|td|th|table|thead|tbody|tfoot|caption|h[1-6]|blockquote)>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

const TABLE = /<table>[\s\S]*?<\/table>/i;
const HEADING = /<h([1-6])>([\s\S]*?)<\/h\1>/gi;
const SUMMARY_MAX = 220;
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Rows of the first table as {label, value}. A row needs a label cell and at least one value cell. */
function tableRows(tableHtml) {
  const rows = [];
  for (const tr of tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<(t[hd])>([\s\S]*?)<\/\1>/gi)].map(c => textOf(c[2]));
    if (cells.length >= 2 && cells[0]) rows.push({label: cells[0].replace(/:$/, ''), value: cells.slice(1).filter(Boolean).join(' ')});
  }
  return rows;
}
/** The first sentence, or the first SUMMARY_MAX characters cut at a word when there is no early full stop. */
export function firstSentence(text, max = SUMMARY_MAX) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  const sentence = m ? m[0] : t;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max).replace(/\s+\S*$/, '');
  return `${cut}…`;
}
/** Meta rows worth a chip: Requires only when it is not "Nothing ...", and the tree row (the card sits under its tree already). */
const showRow = r => !/^profession\s*\/\s*tree$/i.test(r.label) && !(/^requires$/i.test(r.label) && /^nothing\b/i.test(r.value));

/**
 * @param {string} name   perk name (a heading that repeats it is dropped from the details)
 * @param {string} html   sanitised description HTML ('' when none)
 * @param {string} plain  plain description (fallback when there is no HTML)
 * @returns {{meta:{label:string,value:string}[], tier:string, summary:string, detailsHtml:string}}
 */
export function buildPerkCard(name, html, plain = '') {
  const src = String(html ?? '').trim();
  if (!src) {
    const text = String(plain ?? '').replace(/\s+/g, ' ').trim();
    const summary = firstSentence(text);
    return {meta: [], tier: '', summary, detailsHtml: text && text !== summary ? `<p>${escapeText(text)}</p>` : ''};
  }
  const tableMatch = src.match(TABLE);
  const rows = tableMatch ? tableRows(tableMatch[0]) : [];
  const metaTable = rows.length >= 2; // a table of label/value pairs is the meta; any other table stays in the details
  const rest = metaTable ? src.replace(tableMatch[0], '') : src;
  // Sections split at headings: [{title, html}], the part before the first heading has an empty title.
  const sections = [];
  let last = 0, title = '';
  for (const m of rest.matchAll(HEADING)) {
    sections.push({title, html: rest.slice(last, m.index)});
    title = textOf(m[2]); last = m.index + m[0].length;
  }
  sections.push({title, html: rest.slice(last)});
  const kept = sections.filter(s => (s.title || textOf(s.html)) && !(norm(s.title) === norm(name) && !textOf(s.html)));
  const effect = kept.find(s => /^effect\b/.test(norm(s.title))) ?? kept.find(s => !s.title && textOf(s.html)) ?? kept.find(s => textOf(s.html));
  const summary = firstSentence(effect ? textOf(effect.html) : '');
  const tierRow = rows.find(r => /^tier$/i.test(r.label));
  // Details: every kept section as headed, safe HTML; the effect first, then notes and the rest in their own order.
  const ordered = effect ? [effect, ...kept.filter(s => s !== effect)] : kept;
  const detailsHtml = ordered.map(s => `${s.title && norm(s.title) !== norm(name) ? `<h5>${escapeText(s.title)}</h5>` : ''}${s.html.trim()}`).join('');
  const needsFold = detailsHtml && !(ordered.length === 1 && !ordered[0].title && textOf(ordered[0].html) === summary);
  return {meta: rows.filter(showRow), tier: tierRow?.value ?? '', summary, detailsHtml: needsFold ? detailsHtml : ''};
}

/** Tier heading order: by the level in "Apprentice (level 1)" when present, else first seen. */
export function groupByTier(cards) {
  const groups = new Map();
  for (const c of cards) { const k = c.tier || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const level = k => { const m = k.match(/level\s*(\d+)/i); return m ? Number(m[1]) : Infinity; };
  return [...groups].map(([tier, items]) => ({tier, items})).sort((a, b) => (a.tier === '') - (b.tier === '') || level(a.tier) - level(b.tier));
}

/** The unlock-refused-by-ownership message, by role (0.24.4). Players get an actionable sentence; the GM keeps the technical one plus a hint. */
export function unreleasedPerkMessage(name, {forPlayer = false} = {}) {
  if (forPlayer) return 'The GM has not released this perk to players yet.';
  return `${name || 'This perk'} is not an approved, player-visible perk yet. Hint: check that the perk Item's default ownership is not None.`;
}
