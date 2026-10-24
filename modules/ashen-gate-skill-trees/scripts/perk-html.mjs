/**
 * Perk description text for the node tooltip (0.23.0). The perk Item's description is HTML (a description table plus an
 * "Effect & Rules" section). It reaches players through the shared player view, so it is reduced to a small allow-list of
 * plain structural tags with every attribute removed: no scripts, links, images, styles or classes survive. Foundry
 * enrichers ([[AGREF:...|label]], @UUID[...]{label}, [[/roll ...]]{label}) are reduced to their label. Dnd5e "secret"
 * sections (GM-only text) are dropped whole. Pure: no DOM needed, so it runs the same in tests.
 */
export const MAX_PERK_HTML = 8000;
const ALLOWED = new Set(['p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'section', 'span', 'sup', 'sub']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math']);
const VOID = new Set(['br', 'hr']);
const escapeText = s => s.replace(/&(?!(?:[a-z]{2,8}|#\d{1,6}|#x[0-9a-f]{1,5});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const enrichers = s => s
  .replace(/\[\[AGREF:[^|\]]*\|([^\]]*)\]\]/g, '$1')
  .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, '$1')
  .replace(/\[\[\/[^\]]*\]\]\{([^}]*)\}/g, '$1');
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|<!--[\s\S]*?-->/g;

/** Sanitised markup for the tooltip, or '' when there is nothing to show or it is too large (the caller falls back to plain text). */
export function sanitizePerkHtml(html, {max = MAX_PERK_HTML} = {}) {
  const src = enrichers(String(html ?? ''));
  if (!src.trim()) return '';
  const out = [], open = [];
  let last = 0, dropDepth = 0, dropTag = null, secretDepth = 0;
  const secretStack = [];
  const text = chunk => { if (!dropDepth && !secretDepth && chunk) out.push(escapeText(chunk)); };
  for (const m of src.matchAll(TAG)) {
    text(src.slice(last, m.index));
    last = m.index + m[0].length;
    if (!m[2]) continue; // comment
    const closing = m[1] === '/', name = m[2].toLowerCase(), attrs = m[3] ?? '';
    if (dropDepth) { // inside script/style/...: only look for the matching close
      if (name === dropTag) dropDepth += closing ? -1 : 1;
      if (!dropDepth) dropTag = null;
      continue;
    }
    if (DROP_CONTENT.has(name)) { if (!closing && !/\/\s*$/.test(attrs)) { dropDepth = 1; dropTag = name; } continue; }
    if (name === 'section') {
      if (closing) { if (secretStack.pop()) secretDepth--; }
      else { const secret = /class\s*=\s*("[^"]*secret[^"]*"|'[^']*secret[^']*')/i.test(attrs); secretStack.push(secret); if (secret) secretDepth++; }
    }
    if (secretDepth) continue;
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) { if (!closing) out.push(`<${name}>`); continue; }
    if (closing) { const i = open.lastIndexOf(name); if (i < 0) continue; while (open.length > i) out.push(`</${open.pop()}>`); }
    else { open.push(name); out.push(`<${name}>`); }
  }
  text(src.slice(last));
  while (open.length) out.push(`</${open.pop()}>`);
  const result = out.join('').replace(/<(p|div|span|li|td|th)>\s*<\/\1>/g, '').trim();
  return result.length > max ? '' : result;
}
