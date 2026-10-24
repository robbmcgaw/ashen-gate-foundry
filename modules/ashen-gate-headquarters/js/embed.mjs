/**
 * 0.10.0: embed API. A partner module (Character Hub) mounts a compact, read-only Guildhall view for one character: the
 * Guildhall name and rank and the facilities that character may see (shared rooms and their own), with stage and
 * benefits, and Open Headquarters. It draws only buildPlayerView's player-safe projection (the same data as
 * api.playerView), so hirelings and private state never appear. Building stays in the Headquarters window.
 * Dependencies are injected: {canOpen(), isGM(), userOwns(actor), view(actor), actorById(id), open(), notifyError(err)}.
 * `view` is buildPlayerView for that actor (no access check of its own); the checks here are those of api.playerView.
 */
export const EMBED_MODES = Object.freeze(['character']);
export const EMBED_CONTRACT = 'ag-headquarters-embed/1';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

/** Why this user may not see the view, or '' (the same rules as api.playerView: Player Access, then GM or the Actor's owner). */
export function refusal(deps, actor) {
  if (!deps.canOpen()) return 'The GM has hidden Headquarters.';
  if (!actor) return 'That character no longer exists.';
  if (!deps.isGM() && !deps.userOwns(actor)) return `Only ${actor.name}'s owner and the GM can see this.`;
  return '';
}

/** HTML for one embed. */
export function embedHTML(deps, actorId) {
  const actor = deps.actorById(actorId), why = refusal(deps, actor);
  if (why) return `<div class="ag-empty">${esc(why)}</div>`;
  const view = deps.view(actor);
  if (!view?.active) return `<div class="aghq-embed__body"><div class="ag-empty">The Guildhall isn't open yet.</div>${openBtn()}</div>`;
  const group = (label, rows) => rows.length ? `<h4>${esc(label)} <small>${rows.length}</small></h4><ul class="aghq-embed__list">${rows.map(f => `<li>
      <div class="aghq-embed__head"><strong>${esc(f.name)}</strong>${f.stage ? `<span class="aghq-embed__stage">${esc(/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(f.stage)?f.stage.replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase()):f.stage)}</span>` : ''}${f.roomOwner ? `<span class="aghq-embed__muted">${esc(f.roomOwner)}'s room</span>` : ''}</div>
      ${f.benefits?.length ? `<ul class="aghq-embed__benefits">${f.benefits.map(b => `<li><strong>${esc(b.name)}</strong>${b.description ? ` <span class="aghq-embed__muted">${esc(b.description)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    </li>`).join('')}</ul>` : '';
  const shared = view.facilities.filter(f => f.room === 'shared'), personal = view.facilities.filter(f => f.room !== 'shared');
  const g = view.guildhall;
  return `<div class="aghq-embed__body"><header class="aghq-embed__hall"><strong>${esc(g?.name ?? 'Guildhall')}</strong>${g?.rank !== null && g?.rank !== undefined ? `<span class="aghq-embed__stage">Rank ${esc(g.rank)}</span>` : ''}${openBtn()}</header>
    ${group('Guildhall', shared)}${group('Personal', personal)}
    ${view.facilities.length ? '' : '<div class="ag-empty">No facilities this character can see yet.</div>'}
    ${view.hirelingsPublished === false ? '<p class="aghq-embed__muted">Hirelings are managed by the GM.</p>' : ''}</div>`;
}
const openBtn = () => '<button type="button" class="ag-btn ag-btn--sm aghq-embed__open" data-aghq-embed="open">Open Headquarters</button>';

/** Returns {mount(element, {actorId, mode}) → {unmount, refresh}, refreshAll()}. */
export function createEmbed(deps) {
  const live = new Set();
  function mount(element, {actorId = null, mode = 'character'} = {}) {
    if (!element || typeof element.addEventListener !== 'function') throw new TypeError('mount needs a DOM element.');
    if (!EMBED_MODES.includes(mode)) throw new Error(`Unknown embed mode "${mode}". Supported: ${EMBED_MODES.join(', ')}.`);
    const abort = new AbortController(), ctrl = {actorId: actorId ? String(actorId) : null, mounted: true};
    element.classList?.add('aghq-embed');
    ctrl.render = () => {
      if (!ctrl.mounted) return;
      if (element.isConnected === false) { ctrl.unmount(); return; }
      element.innerHTML = embedHTML(deps, ctrl.actorId);
    };
    ctrl.unmount = () => { if (!ctrl.mounted) return; ctrl.mounted = false; abort.abort(); live.delete(ctrl); element.innerHTML = ''; element.classList?.remove('aghq-embed'); };
    element.addEventListener('click', e => {
      const b = e.target?.closest?.('[data-aghq-embed="open"]'); if (!b || !element.contains(b)) return;
      e.preventDefault?.(); e.stopPropagation?.();
      return Promise.resolve().then(() => deps.open()).catch(deps.notifyError);
    }, {signal: abort.signal});
    live.add(ctrl); ctrl.render();
    return {unmount: ctrl.unmount, refresh: () => ctrl.render()};
  }
  return {mount, refreshAll: () => { for (const c of [...live]) c.render(); }};
}
