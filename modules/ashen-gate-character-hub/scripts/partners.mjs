/**
 * "Ashen Gate" panels: player-safe summaries from other Ashen Gate modules, read only through their public
 * APIs (game.modules.get(id)?.api). Those modules keep all their own state; nothing is copied here. A failing module
 * shows an "unavailable" note and never breaks the sheet. Players don't get a section at all when the GM hides it, its
 * module is missing, or its Player Access is off (see visibility.mjs); the GM sees it with a "Hidden from players" badge.
 */
import {esc, num} from './constants.mjs';
import {btn} from './buttons.mjs';
import {canSee, requirePart, hiddenBadge, hiddenReason, partForPartner} from './visibility.mjs';
import {cindersSummary, skillTreeBtn} from './cinders.mjs';
import {linkButton, subTabs, tabPanelAttrs} from './ag-html.mjs';

/** The active module's API, or null. */
export function partnerApi(id) {
  const m = globalThis.game?.modules?.get?.(id);
  return m?.active ? m.api ?? null : null;
}
/**
 * Electrum follows Utilities' GM setting "Use electrum" (0.13.2+, api.currency.electrumEnabled()). Returns true/false,
 * or null when Utilities (or that API) is not there: then the Hub keeps showing electrum as before.
 */
export function electrumEnabled() {
  const api = partnerApi('ashen-gate-utilities')?.currency;
  if (typeof api?.electrumEnabled !== 'function') return null;
  try { return api.electrumEnabled() === true; } catch { return null; }
}
/** Hide electrum? Only when Utilities says it is off. */
export const electrumHidden = () => electrumEnabled() === false;

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

/**
 * Overview's Professions box (0.30.0): the professions this character knows, name and level, from the Ledger's
 * getProfessions (feature-detected). Null (no box) when the Ledger is missing or too old, when players may not see
 * Professions (the GM's switch, Ledger inactive or its Player Access off) or when the Ledger refuses this user.
 */
export function knownProfessions(actor, user = globalThis.game?.user) {
  if (!actor || !canSee('professions', user)) return null;
  const api = partnerApi('ashen-gate-profession-ledger');
  if (typeof api?.getProfessions !== 'function') return null;
  let rows;
  try { rows = api.getProfessions(actor); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  return rows.map(p => ({id: String(p?.professionId ?? ''), name: String(p?.name || p?.professionId || ''), level: num(p?.level)})).filter(p => p.name);
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
      return `<li>${linkButton(q.name, {data: {action: 'partner-open', partner: 'ashen-gate-quest-manager', ref: q.id, agAlways: true}})}
        ${tracked.has(q.id) ? '<span class="ag-badge ag-badge--accent">Tracked</span>' : ''} <span class="ag-badge">${q.scope === 'individual' ? 'Personal' : 'Party'}</span>
        ${open.length ? `<ul class="agch-objectives">${open.map(o => `<li>${esc(o.goal)}</li>`).join('')}</ul>` : ''}</li>`;
    });
  return list(rows, 'No active quests for this character.');
}

function locations(actor, api) {
  const user = globalThis.game?.user;
  const all = api.listLocations?.(user?.isGM ? {revealedOnly: true} : {}) ?? [];
  // 0.33.0 (CH-24): every location is listed (it was cut at 8, hiding links).
  const rows = all.map(l => `<li>${linkButton(l.name, {data: {action: 'partner-open', partner: 'ashen-gate-locations', ref: l.id ?? l.key, agAlways: true}})}${l.region ? ` <span class="agch-muted">${esc(l.region)}</span>` : ''}</li>`);
  return list(rows, 'No locations revealed yet.');
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

/** Stash items listed in a summary: all of them since 0.33.0 (CH-24); `shown` still caps it for a caller that wants fewer. */
const STASH_SHOWN = Infinity;
function utilities(actor, api, {shown = STASH_SHOWN} = {}) {
  let purse = null;
  try { purse = api.purse?.totals?.(); } catch (err) { return `<p class="agch-muted">${esc(err?.message ?? 'Party purse unavailable.')}</p>`; }
  if (!purse) return '<p class="agch-muted">Party purse unavailable.</p>';
  const offEp = electrumHidden();
  const coins = `<p>Party purse: ${['pp', 'gp', 'ep', 'sp', 'cp'].filter(k => num(purse[k]) && !(offEp && k === 'ep')).map(k => `${num(purse[k])} ${k}`).join(', ') || 'empty'}</p>`
    + (offEp && num(purse.ep) ? `<p class="agch-muted agch-ep-off">Also ${num(purse.ep)} ep (electrum is off in Utilities; the GM can convert it there).</p>` : '');
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
  {id: 'ashen-gate-skill-trees', embedMode: 'character', tab: 'Skill Trees', label: 'Skill Trees', icon: 'fa-solid fa-diagram-project', summary: skillTrees,
    open: (api, actor) => api.open({actorId: actor.id})},
  {id: 'ashen-gate-cinders', tab: 'Cinders', label: 'Cinders', icon: 'fa-solid fa-fire', summary: cindersSummary,
    open: (api, actor) => api.open({actorId: actor.id}), headActions: actor => skillTreeBtn(actor, {canSeePerks: canSee('perks')})},
  {id: 'ashen-gate-factions', embedMode: 'character', tab: 'Renown', label: 'Renown', icon: 'fa-solid fa-flag', summary: factions, open: api => api.open()},
  {id: 'ashen-gate-quest-manager', embedMode: 'character', tab: 'Quest Log', label: 'Quest Log', icon: 'fa-solid fa-scroll', summary: quests,
    open: (api, actor, ref) => ref ? api.openObjective(ref) : api.open()},
  {id: 'ashen-gate-locations', embedMode: 'character', tab: 'Locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot', summary: locations,
    open: (api, actor, ref) => ref ? api.openLocation(ref) : api.open(), missing: 'the party\'s current or recent location'},
  {id: 'ashen-gate-headquarters', embedMode: 'character', tab: 'Headquarters', label: 'Headquarters', icon: 'fa-solid fa-chess-rook', summary: headquarters,
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
    const refused = /hidden|access|not available|permission|denied/i.test(err?.message ?? '');
    return {state: 'error', refused, html: `<p class="agch-muted">${refused ? 'Not available to you right now.' : 'Unavailable right now.'}</p>`};
  }
}

/**
 * One partner panel as a card: heading, Open button (when the module is active) and its summary. `headActions(actor)`
 * adds buttons next to the title (0.31.0: Cinders' Open skill tree).
 */
export function panelHtml(panel, actor, s = panelState(panel, actor)) {
  const extra = s.state === 'ok' && panel.headActions ? panel.headActions(actor) : '';
  return `<section class="ag-card agch-panel" data-partner="${panel.id}" data-state="${s.state}"><header class="agch-panel__head"><span class="agch-panel__title"><h3><i class="${panel.icon}" aria-hidden="true"></i> ${esc(panel.label)}${panel.badge ?? ''}</h3>${extra}</span>
    ${s.state === 'missing' ? '' : btn('partner-open', panel.openLabel ?? `Open ${panel.label}`, {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {partner: panel.id}, always: true})}</header>${s.html}</section>`;
}

/** Panels shown as Ashen Gate sub-tabs (Utilities lives in Inventory → Party stash). */
export const AG_PANELS = PANELS.filter(p => p.tab);

/**
 * Ashen Gate sub-tabs this user gets. Players only get parts the GM shows whose module is active with Player Access on;
 * the GM gets every one (hidden ones carry a badge).
 */
export const agPanelsFor = (user = globalThis.game?.user) => AG_PANELS.filter(p => canSee(partForPartner(p.id), user));

/**
 * Ashen Gate tab: one sub-tab per partner module; only the chosen one is read. For a player, a module whose summary
 * refuses them is dropped like a hidden one (no empty shell) and the next sub-tab is shown.
 */
export function ashenGateTab({actor, sheet}) {
  const gm = globalThis.game?.user?.isGM === true;
  let panels = agPanelsFor(), current = null, state = null, embedded = null;
  while (panels.length) {
    current = panels.find(p => p.id === sheet?.agTab) ?? panels[0];
    embedded = embedApi(current.id, current.embedMode);
    state = embedded ? {state: 'ok', html: embedSlot(current.id, current.embedMode, actor)} : panelState(current, actor);
    if (gm || !state.refused) break;
    panels = panels.filter(p => p !== current); current = null;
  }
  if (!current) return '<div class="ag-empty"><i class="fa-solid fa-dungeon" aria-hidden="true"></i><p class="ag-empty__title">Nothing here yet.</p><p class="ag-empty__text">Ashen Gate sections show here once your GM shares them.</p></div>';
  // 0.33.0: kit sub-tabs (one Tab stop, arrow keys via bindTablist in the sheet) instead of a segmented control;
  // the sub-tab and the bottom quick bar use the same name per module (CH-10). Hidden-from-players ones carry the eye.
  const group = `${String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-ag`;
  const tabs = subTabs({group, label: 'Ashen Gate sections', selected: current.id,
    tabs: panels.map(p => ({id: p.id, label: p.tab, icon: gm && hiddenReason(partForPartner(p.id)) ? 'fa-solid fa-eye-slash' : null}))})
    .replace('class="ag-tabs ag-tabs--sub"', 'class="ag-tabs ag-tabs--sub agch-agtabs"').replaceAll('role="tab" ', 'role="tab" data-action="ag-subtab" data-ag-always ');
  return `${tabs}<div ${tabPanelAttrs(group, current.id)} class="agch-agpanel">
    ${panelHtml({...current, badge: hiddenBadge(partForPartner(current.id))}, actor, state)}</div>
    <p class="agch-muted agch-hint">${embedded ? `This is ${esc(current.label)}'s own view: it keeps its own records and permissions.` : current.id === 'ashen-gate-cinders' ? 'Cinders keeps its own records: Push and socket changes go through it and it checks them again.' : 'Each module keeps its own records; this is a read-only summary. Open the module to make changes there.'}</p>`;
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
  const panel = {...PANELS.find(p => p.id === 'ashen-gate-utilities'), label: 'Party stash', badge: hiddenBadge('partyStash')};
  if (embedApi(panel.id, 'stash')) return panelHtml({...panel, summary: () => embedSlot(panel.id, 'stash', actor)}, actor);
  return panelHtml({...panel, summary: (a, api) => utilities(a, api, {shown: Infinity})}, actor);
}

/**
 * True when this user could put items in the party stash: Utilities offers deposit, and (for players) the GM shows the
 * party stash in the Hub and Utilities' Player Access and stash are on.
 */
export function partyStashUsable(user = globalThis.game?.user) {
  const api = partnerApi('ashen-gate-utilities');
  if (typeof api?.stash?.deposit !== 'function') return false;
  if (user?.isGM) return true;
  if (!canSee('partyStash', user)) return false;
  try { return api.playerAccess?.getState?.()?.playerAccessEnabled === true && api.stash.isEnabled?.() === true; } catch { return false; }
}

/**
 * Moves one of this character's items into the party stash through Utilities' own deposit (its checks apply: player
 * deposits are carried out by the GM client). Only the character's owner may ask.
 */
export async function depositToParty(actor, itemId, canEdit) {
  if (!canEdit(actor)) return {ok: false, error: `You don't own ${actor?.name ?? 'this character'}, so you can't move its items.`};
  const hidden = requirePart('partyStash'); if (hidden) return hidden;
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
  // A part hidden from players can't be opened from the Hub either (the module still checks its own permissions).
  const part = partForPartner(id), hidden = part ? requirePart(part) : null;
  if (hidden) return hidden;
  try { return {ok: true, result: await panel.open(api, actor, ref || null)}; } catch (err) {
    return {ok: false, error: `${panel.label}: ${err?.message ?? err}`};
  }
}
