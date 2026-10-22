/**
 * 1.13.0: embed API. A partner module (Character Hub) mounts a compact, read-only view: the revealed places the user can
 * see, grouped by region, each with Open (0.20.0: no journey progress; journeys are retired). It is built from the same player views the
 * Locations window shows players (the GM sees the same list: what the party knows). Editing stays in the window.
 * Dependencies are injected so this file has no Foundry imports: {mayOpen, readViews, api, notifyError}.
 */
export const EMBED_MODES = Object.freeze(['character']);
export const EMBED_CONTRACT = 'ag-locations-embed/1';
const OTHER = 'Other places';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
/** Kit empty state (title + text). */
const empty = (title, text) => `<div class="ag-empty"><p class="ag-empty__title">${esc(title)}</p><p class="ag-empty__text">${esc(text)}</p></div>`;

/** HTML for one embed. `filter` is the search text. */
export function embedHTML(deps, filter = '') {
  if (!deps.mayOpen()) return empty('Locations is hidden', 'The GM has hidden Locations.');
  const q = String(filter).trim().toLowerCase();
  const places = deps.readViews().filter(v => v.id && v.state === 'revealed')
    .filter(v => !q || [v.name, v.region, v.type].some(t => String(t ?? '').toLowerCase().includes(q)));
  const groups = new Map();
  for (const v of places) { const g = v.region || OTHER; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(v); }
  const list = [...groups.entries()].sort(([a], [b]) => a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b))
    .map(([g, rows]) => `<h4>${esc(g)} <small>${rows.length}</small></h4>
    <ul class="agl-embed__list">${rows.map(v => `<li><button type="button" class="agl-embed__open" data-agl-embed="open" data-ref="${esc(v.id)}" data-tooltip="Open ${esc(v.name)} in Locations" data-tooltip-class="ag-tooltip">${esc(v.name)}</button>${v.type ? `<span class="agl-embed__muted">${esc(v.type)}</span>` : ''}</li>`).join('')}</ul>`).join('');
  return `<div class="agl-embed__body">
    <div class="agl-embed__tools"><label class="ag-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" class="agl-embed__search" placeholder="Search places" aria-label="Search places" value="${esc(filter)}"></label><button type="button" class="ag-btn ag-btn--sm" data-agl-embed="open-all">Open Locations</button></div>
    ${list || (q ? empty('Nothing matches', 'No places match this search.') : empty('No places yet', 'No places revealed yet.'))}</div>`;
}

/** Returns {mount(element, {actorId, mode}) → {unmount, refresh}, refreshAll()}. actorId is accepted for symmetry: places are party-wide. */
export function createEmbed(deps) {
  const live = new Set();
  function mount(element, {actorId = null, mode = 'character'} = {}) {
    if (!element || typeof element.addEventListener !== 'function') throw new TypeError('mount needs a DOM element.');
    if (!EMBED_MODES.includes(mode)) throw new Error(`Unknown embed mode "${mode}". Supported: ${EMBED_MODES.join(', ')}.`);
    const abort = new AbortController(), ctrl = {actorId, filter: '', mounted: true};
    element.classList?.add('agl-embed');
    ctrl.render = () => {
      if (!ctrl.mounted) return;
      if (element.isConnected === false) { ctrl.unmount(); return; }
      const search = element.querySelector?.('.agl-embed__search'), at = search && search === globalThis.document?.activeElement ? search.selectionStart : null;
      element.innerHTML = embedHTML(deps, ctrl.filter);
      if (at !== null) { const s = element.querySelector?.('.agl-embed__search'); s?.focus?.(); s?.setSelectionRange?.(at, at); }
    };
    ctrl.unmount = () => { if (!ctrl.mounted) return; ctrl.mounted = false; abort.abort(); live.delete(ctrl); element.innerHTML = ''; element.classList?.remove('agl-embed'); };
    element.addEventListener('click', e => {
      const b = e.target?.closest?.('[data-agl-embed]'); if (!b || !element.contains(b)) return;
      e.preventDefault?.(); e.stopPropagation?.();
      // The window's own open functions check Player Access again.
      return Promise.resolve().then(() => b.dataset.aglEmbed === 'open' ? deps.api().openLocation(b.dataset.ref) : deps.api().open()).catch(deps.notifyError);
    }, {signal: abort.signal});
    element.addEventListener('input', e => { if (e.target?.classList?.contains('agl-embed__search')) { ctrl.filter = e.target.value; ctrl.render(); } }, {signal: abort.signal});
    element.addEventListener('change', e => e.stopPropagation?.(), {signal: abort.signal});
    live.add(ctrl); ctrl.render();
    return {unmount: ctrl.unmount, refresh: () => ctrl.render()};
  }
  return {mount, refreshAll: () => { for (const c of [...live]) c.render(); }};
}
