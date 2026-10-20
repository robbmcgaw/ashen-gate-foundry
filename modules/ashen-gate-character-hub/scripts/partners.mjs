/**
 * "Ashen Gate" panels: player-safe summaries from other Ashen Gate modules, read only through their public
 * APIs (game.modules.get(id)?.api). Those modules keep all their own state; nothing is copied here. A missing,
 * hidden or failing module shows an "unavailable" note and never breaks the sheet.
 */
import {esc, num} from './constants.mjs';
import {btn} from './buttons.mjs';

/** The active module's API, or null. */
export function partnerApi(id) {
  const m = globalThis.game?.modules?.get?.(id);
  return m?.active ? m.api ?? null : null;
}
const list = (rows, empty) => rows.length ? `<ul class="agch-plist">${rows.join('')}</ul>` : `<p class="agch-muted">${esc(empty)}</p>`;
const signedScore = n => (num(n) > 0 ? `+${num(n)}` : String(num(n)));

const perkBadge = n => num(n) ? ` <span class="ag-badge ag-badge--warn">${num(n)} perk${n > 1 ? 's' : ''} to choose</span>` : '';
function knownRecipes(actor, api) {
  let recipes = null;
  try { recipes = api.getKnownRecipes?.(actor); } catch { recipes = null; }
  return Array.isArray(recipes) ? `<p class="agch-muted">${recipes.length} known recipe${recipes.length === 1 ? '' : 's'}</p>` : '';
}
/** Professions: the Ledger's own list (getProfessions, 0.18.0+) when present; else Skill Trees' profession trees name the PROF ids. */
function professions(actor, api) {
  if (typeof api.getProfessions === 'function') {
    const rows = (api.getProfessions(actor) ?? []).map(p => `<li><strong>${esc(p.name || p.professionId)}</strong> <span class="ag-badge">Level ${num(p.level)}</span> <span class="agch-muted">${num(p.xp)} XP · ${p.xpToNext === null || p.xpToNext === undefined ? 'maximum level' : `${num(p.xpToNext)} XP to level ${num(p.level) + 1}`}</span>${perkBadge(p.unspentPerkChoices)}</li>`);
    return list(rows, 'No professions yet.') + knownRecipes(actor, api);
  }
  const trees = partnerApi('ashen-gate-skill-trees');
  let refs = [];
  try { refs = (trees?.listTrees?.() ?? []).filter(t => t?.provider?.kind === 'profession' && t.sourceRef).map(t => ({id: t.sourceRef, name: t.name || t.sourceRef})); } catch { refs = []; }
  const rows = [];
  for (const ref of refs) {
    const p = api.getProfessionProgress(actor, ref.id);
    if (p) rows.push(`<li><strong>${esc(ref.name)}</strong> <span class="ag-badge">Level ${num(p.level)}</span> <span class="agch-muted">${num(p.xp)} XP</span>${perkBadge(p.unspentPerkChoices)}</li>`);
  }
  const recipeLine = knownRecipes(actor, api);
  const note = refs.length ? '' : '<p class="agch-muted">Profession levels show here when Skill Trees is active (it lists the professions).</p>';
  return list(rows, refs.length ? 'No profession progress yet.' : '') + note + recipeLine;
}

const plural = (n, word) => `${num(n)} ${word}${num(n) === 1 ? '' : 's'}`;
/** Points per tree: Skill Trees' pointsSummary (0.13.0+) when present; else the awarded points of non-profession trees. */
function treePoints(tree, p, points) {
  if (!points) return tree.provider?.kind === 'profession' ? '' : ` <span class="ag-badge">${plural(p.awarded, 'point')} awarded</span>`;
  if (points.available === null || points.available === undefined) return '';
  return ` <span class="ag-badge${num(points.available) ? ' ag-badge--accent' : ''}">${plural(points.available, 'point')} to spend</span> <span class="agch-muted">${num(points.spent)} of ${num(points.earned)} spent</span>`;
}
function skillTrees(actor, api) {
  const rows = [];
  let summary = null;
  if (typeof api.pointsSummary === 'function') summary = new Map((api.pointsSummary(actor) ?? []).map(r => [r.treeId, r]));
  for (const tree of api.listTrees?.() ?? []) {
    const p = api.actorProgress(actor, tree.id);
    if (!p) continue;
    const owned = (p.unlocks ?? []).map(id => tree.nodes?.find?.(n => n.id === id)?.name || id);
    const points = summary?.get(tree.id) ?? null;
    if (!owned.length && !num(p.awarded) && !num(points?.earned)) continue;
    rows.push(`<li><strong>${esc(tree.name || tree.id)}</strong>${treePoints(tree, p, summary ? points : null)} <span class="agch-muted">${plural(owned.length, 'perk')}${owned.length ? `: ${owned.map(esc).join(', ')}` : ''}</span></li>`);
  }
  return list(rows, 'No points or perks yet.');
}

/** The viewing user's own projection: group standing, and this character's standing if the user owns it. */
function factions(actor, api) {
  const rows = (api.getFactions?.() ?? []).map(f => {
    const group = f.group?.score, mine = f.personal?.[actor.id]?.score;
    return `<li><strong>${esc(f.name || 'Unknown Organization')}</strong>${group !== undefined ? ` <span class="ag-badge">Party ${signedScore(group)}</span>` : ''}${mine !== undefined ? ` <span class="ag-badge ag-badge--accent">${esc(actor.name)} ${signedScore(mine)}</span>` : ''}</li>`;
  });
  return list(rows, 'No factions revealed yet.');
}

const DONE = new Set(['Completed', 'Failed', 'Abandoned']);
function quests(actor, api) {
  let tracked = new Set();
  try { tracked = new Set(api.tracking?.getState?.()?.ids ?? []); } catch {}
  const rows = (api.listVisible?.() ?? [])
    .filter(q => !DONE.has(q.status) && (q.scope !== 'individual' || q.actorId === actor.id))
    .sort((a, b) => Number(tracked.has(b.id)) - Number(tracked.has(a.id)))
    .map(q => {
      const open = (q.objectives ?? []).filter(o => !o.complete && !o.failed);
      return `<li><button type="button" class="agch-plink" data-action="partner-open" data-partner="ashen-gate-quest-manager" data-ref="${esc(q.id)}" data-ag-always>${esc(q.name)}</button>
        ${tracked.has(q.id) ? '<span class="ag-badge ag-badge--accent">Tracked</span>' : ''} <span class="ag-badge">${q.scope === 'individual' ? 'Personal' : 'Party'}</span>
        ${open.length ? `<ul class="agch-objectives">${open.map(o => `<li>${esc(o.goal)}</li>`).join('')}</ul>` : ''}</li>`;
    });
  return list(rows, 'No active quests for this character.');
}

function locations(actor, api) {
  const user = globalThis.game?.user;
  const all = api.listLocations?.(user?.isGM ? {revealedOnly: true} : {}) ?? [];
  const rows = all.slice(0, 8).map(l => `<li><button type="button" class="agch-plink" data-action="partner-open" data-partner="ashen-gate-locations" data-ref="${esc(l.id ?? l.key)}" data-ag-always>${esc(l.name)}</button>${l.region ? ` <span class="agch-muted">${esc(l.region)}</span>` : ''}</li>`);
  return list(rows, 'No locations revealed yet.') + (all.length > 8 ? `<p class="agch-muted">and ${all.length - 8} more</p>` : '');
}

/** Headquarters' player-safe playerView (0.9.0+): facilities this character may see. Without it, a pointer to the module. */
function headquarters(actor, api) {
  if (typeof api.playerView !== 'function') return '<p class="agch-muted">Open Headquarters to see details.</p>';
  const v = api.playerView(actor);
  if (!v?.active) return '<p class="agch-muted">The Guildhall isn\'t open yet.</p>';
  const rows = (v.facilities ?? []).map(f => `<li><strong>${esc(f.name)}</strong> <span class="ag-badge">${f.room === 'personal' ? 'Personal' : 'Guildhall'}</span>${f.stage ? ` <span class="agch-muted">${esc(f.stage)}</span>` : ''}</li>`);
  const head = v.guildhall ? `<p>${esc(v.guildhall.name)}${v.guildhall.rank !== null && v.guildhall.rank !== undefined ? ` · Rank ${num(v.guildhall.rank)}` : ''}</p>` : '';
  const hires = (v.hirelings ?? []).length ? `<p class="agch-muted">${plural(v.hirelings.length, 'hireling')}</p>` : v.hirelingsPublished === false ? '<p class="agch-muted">Hirelings are managed by the GM.</p>' : '';
  return head + list(rows, 'No facilities installed yet.') + hires;
}

const STASH_SHOWN = 8;
function utilities(actor, api, {shown = STASH_SHOWN} = {}) {
  let purse = null;
  try { purse = api.purse?.totals?.(); } catch (err) { return `<p class="agch-muted">${esc(err?.message ?? 'Party purse unavailable.')}</p>`; }
  if (!purse) return '<p class="agch-muted">Party purse unavailable.</p>';
  const coins = `<p>Party purse: ${['pp', 'gp', 'ep', 'sp', 'cp'].filter(k => num(purse[k])).map(k => `${num(purse[k])} ${k}`).join(', ') || 'empty'}</p>`;
  // Stash items (Utilities 0.11.0+). Same gate as the purse; a refusal just leaves the item list out.
  let items = null;
  try { items = typeof api.stash?.listItems === 'function' ? api.stash.listItems() : null; } catch { items = null; }
  if (!Array.isArray(items)) return coins;
  const rows = items.slice(0, shown).map(i => `<li>${esc(i.name)}${num(i.quantity) > 1 ? ` <span class="agch-muted">×${num(i.quantity)}</span>` : ''}</li>`);
  return coins + list(rows, 'The stash is empty.') + (items.length > shown ? `<p class="agch-muted">and ${items.length - shown} more</p>` : '');
}

/**
 * Panel registry, in display order. `summary(actor, api)` returns HTML (or throws); `open(api, actor, ref)` deep-links.
 * `embedMode` is the partner's api.embed mode for this character: when the partner offers it, its own view replaces the summary.
 * `missing` lists APIs the owner module would need for a fuller summary (also in the README). Newer partner APIs are
 * feature-detected inside each summary, which falls back to the older reads when they are absent.
 */
export const PANELS = [
  {id: 'ashen-gate-profession-ledger', embedMode: 'individual', tab: 'Professions', label: 'Profession Ledger', icon: 'fa-solid fa-hammer', summary: professions,
    open: (api, actor) => api.open({actorId: actor.id, view: 'individual'})},
  {id: 'ashen-gate-skill-trees', embedMode: 'character', tab: 'Perks', label: 'Skill Trees', icon: 'fa-solid fa-diagram-project', summary: skillTrees,
    open: (api, actor) => api.open({actorId: actor.id})},
  {id: 'ashen-gate-factions', embedMode: 'character', tab: 'Renown', label: 'Renown', icon: 'fa-solid fa-flag', summary: factions, open: api => api.open()},
  {id: 'ashen-gate-quest-manager', embedMode: 'character', tab: 'Quests', label: 'Quest Log', icon: 'fa-solid fa-scroll', summary: quests,
    open: (api, actor, ref) => ref ? api.openObjective(ref) : api.open()},
  {id: 'ashen-gate-locations', embedMode: 'character', tab: 'Locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot', summary: locations,
    open: (api, actor, ref) => ref ? api.openLocation(ref) : api.open(), missing: 'the party\'s current or recent location'},
  {id: 'ashen-gate-headquarters', embedMode: 'character', tab: 'Base', label: 'Headquarters', icon: 'fa-solid fa-chess-rook', summary: headquarters,
    open: api => api.open()},
  {id: 'ashen-gate-utilities', embedMode: 'stash', label: 'Utilities', icon: 'fa-solid fa-toolbox', summary: utilities,
    open: api => api.stash?.open ? api.stash.open() : api.open(), openLabel: 'Open party stash'}
];

/** One panel's state: 'missing' (not active), 'error' (API threw or is absent), or 'ok' with its summary HTML. */
export function panelState(panel, actor) {
  const api = partnerApi(panel.id);
  if (!api) return {state: 'missing', html: '<p class="agch-muted">Not installed or not active.</p>'};
  if (!panel.summary) return {state: 'ok', html: `<p class="agch-muted">Open ${esc(panel.label)} to see details.</p>`};
  try { return {state: 'ok', html: panel.summary(actor, api)}; } catch (err) {
    console.warn(`ashen-gate-character-hub | ${panel.id} summary unavailable`, err);
    const msg = /hidden|access|not available|permission|denied/i.test(err?.message ?? '') ? 'Not available to you right now.' : 'Unavailable right now.';
    return {state: 'error', html: `<p class="agch-muted">${msg}</p>`};
  }
}

/** One partner panel as a card: heading, Open button (when the module is active) and its summary. */
export function panelHtml(panel, actor) {
  const s = panelState(panel, actor);
  return `<section class="ag-card agch-panel" data-partner="${panel.id}" data-state="${s.state}"><header class="agch-panel__head"><h3><i class="${panel.icon}" aria-hidden="true"></i> ${esc(panel.label)}</h3>
    ${s.state === 'missing' ? '' : btn('partner-open', panel.openLabel ?? `Open ${panel.label}`, {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {partner: panel.id}, always: true})}</header>${s.html}</section>`;
}

/** Panels shown as Ashen Gate sub-tabs (Utilities lives in Inventory → Party stash). */
export const AG_PANELS = PANELS.filter(p => p.tab);

/** Ashen Gate tab: one sub-tab per partner module; only the chosen one is read. */
export function ashenGateTab({actor, sheet}) {
  const current = AG_PANELS.find(p => p.id === sheet?.agTab) ?? AG_PANELS[0];
  const embedded = embedApi(current.id, current.embedMode);
  const tabs = AG_PANELS.map(p => `<button type="button" data-action="ag-subtab" data-partner="${p.id}" data-ag-always aria-pressed="${p === current}"${partnerApi(p.id) ? '' : ' class="is-missing"'}>${esc(p.tab)}</button>`).join('');
  return `<div class="agch-toolbar"><div class="agch-seg agch-seg--wrap" role="group" aria-label="Ashen Gate section">${tabs}</div></div>
    ${embedded ? panelHtml({...current, summary: () => embedSlot(current.id, current.embedMode, actor)}, actor) : panelHtml(current, actor)}
    <p class="agch-muted agch-hint">${embedded ? `This is ${esc(current.label)}'s own view: it keeps its own records and permissions.` : 'Each module keeps its own records; this is a read-only summary. Open the module to make changes there.'}</p>`;
}

// ---------- Embedded partner views (api.embed.mount) ----------

/**
 * A partner's embed API when it is active and offers that mode, else null. Embeds draw and run the partner's own
 * view inside an element we provide; the partner keeps its state and checks its own permissions.
 */
export function embedApi(id, mode) {
  const embed = partnerApi(id)?.embed;
  return typeof embed?.mount === 'function' && (!Array.isArray(embed.modes) || embed.modes.includes(mode)) ? embed : null;
}
/** Placeholder the sheet replaces with the partner's own view after rendering (see mountEmbeds). */
export const embedSlot = (id, mode, actor) => `<div class="agch-embed" data-agch-embed="${esc(id)}" data-mode="${esc(mode)}" data-actor="${esc(actor.id)}"><p class="agch-muted">Loading…</p></div>`;
const embedKey = el => `${el.dataset.agchEmbed}|${el.dataset.mode}|${el.dataset.actor}`;

/**
 * After a render: fills each placeholder with the partner's view. A view still mounted from the previous render is moved
 * into the new placeholder (so its search text and scroll survive a re-render); views no longer wanted are unmounted.
 * `mounted` is the sheet's Map key → {element, handle}. A partner that throws leaves a short note, never a broken sheet.
 */
export function mountEmbeds(root, mounted) {
  const wanted = new Set();
  for (const slot of root?.querySelectorAll?.('[data-agch-embed]') ?? []) {
    const key = embedKey(slot), id = slot.dataset.agchEmbed;
    wanted.add(key);
    const prev = mounted.get(key);
    if (prev) { slot.replaceWith(prev.element); prev.handle?.refresh?.(); continue; }
    const embed = embedApi(id, slot.dataset.mode);
    if (!embed) continue;
    try {
      slot.textContent = '';
      const handle = embed.mount(slot, {actorId: slot.dataset.actor, mode: slot.dataset.mode});
      mounted.set(key, {element: slot, handle});
    } catch (err) {
      console.warn(`ashen-gate-character-hub | ${id} embed unavailable`, err);
      slot.innerHTML = '<p class="agch-muted">Unavailable right now. Use the Open button.</p>';
    }
  }
  for (const [key, m] of mounted) if (!wanted.has(key)) { try { m.handle?.unmount?.(); } catch {} mounted.delete(key); }
}
/** Unmounts every embedded view (the sheet is closing). */
export function unmountEmbeds(mounted) {
  for (const m of mounted.values()) { try { m.handle?.unmount?.(); } catch {} }
  mounted.clear();
}

// ---------- Party stash (Utilities) ----------

/** Inventory → Party stash: Utilities' own stash view when it offers one (0.12.0+), else the purse and item list. */
export function partyStashHtml(actor) {
  const panel = PANELS.find(p => p.id === 'ashen-gate-utilities');
  if (embedApi(panel.id, 'stash')) return panelHtml({...panel, label: 'Party stash', summary: () => embedSlot(panel.id, 'stash', actor)}, actor);
  return panelHtml({...panel, label: 'Party stash', summary: (a, api) => utilities(a, api, {shown: Infinity})}, actor);
}

/** True when this user could put items in the party stash: Utilities offers deposit, and (for players) Player Access and the stash are on. */
export function partyStashUsable(user = globalThis.game?.user) {
  const api = partnerApi('ashen-gate-utilities');
  if (typeof api?.stash?.deposit !== 'function') return false;
  if (user?.isGM) return true;
  try { return api.playerAccess?.getState?.()?.playerAccessEnabled === true && api.stash.isEnabled?.() === true; } catch { return false; }
}

/**
 * Moves one of this character's items into the party stash through Utilities' own deposit (its checks apply: player
 * deposits are carried out by the GM client). Only the character's owner may ask.
 */
export async function depositToParty(actor, itemId, canEdit) {
  if (!canEdit(actor)) return {ok: false, error: `You don't own ${actor?.name ?? 'this character'}, so you can't move its items.`};
  const item = actor?.items?.get?.(itemId);
  if (!item) return {ok: false, error: 'That item is no longer on this character.'};
  const api = partnerApi('ashen-gate-utilities');
  if (typeof api?.stash?.deposit !== 'function') return {ok: false, error: 'Utilities (party stash) is not active.'};
  try {
    const message = await api.stash.deposit(item.uuid);
    if (message) globalThis.ui?.notifications?.info?.(message);
    return {ok: true, result: message};
  } catch (err) { return {ok: false, error: `Party stash: ${err?.message ?? err}`}; }
}

export async function openPartner(actor, id, ref = null) {
  const panel = PANELS.find(p => p.id === id), api = partnerApi(id);
  if (!panel || !api) return {ok: false, error: 'That module is not active.'};
  try { return {ok: true, result: await panel.open(api, actor, ref || null)}; } catch (err) {
    return {ok: false, error: `${panel.label}: ${err?.message ?? err}`};
  }
}
