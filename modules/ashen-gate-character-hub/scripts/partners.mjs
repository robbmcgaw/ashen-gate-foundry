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

/** Professions: Skill Trees' profession trees name the PROF ids; the Ledger gives this character's progress for each. */
function professions(actor, api) {
  const trees = partnerApi('ashen-gate-skill-trees');
  let refs = [];
  try { refs = (trees?.listTrees?.() ?? []).filter(t => t?.provider?.kind === 'profession' && t.sourceRef).map(t => ({id: t.sourceRef, name: t.name || t.sourceRef})); } catch { refs = []; }
  const rows = [];
  for (const ref of refs) {
    const p = api.getProfessionProgress(actor, ref.id);
    if (p) rows.push(`<li><strong>${esc(ref.name)}</strong> <span class="ag-badge">Level ${num(p.level)}</span> <span class="agch-muted">${num(p.xp)} XP</span>${num(p.unspentPerkChoices) ? ` <span class="ag-badge ag-badge--warn">${num(p.unspentPerkChoices)} perk${p.unspentPerkChoices > 1 ? 's' : ''} to choose</span>` : ''}</li>`);
  }
  let recipes = null;
  try { recipes = api.getKnownRecipes?.(actor); } catch { recipes = null; }
  const recipeLine = Array.isArray(recipes) ? `<p class="agch-muted">${recipes.length} known recipe${recipes.length === 1 ? '' : 's'}</p>` : '';
  const note = refs.length ? '' : '<p class="agch-muted">Profession levels show here when Skill Trees is active (it lists the professions).</p>';
  return list(rows, refs.length ? 'No profession progress yet.' : '') + note + recipeLine;
}

function skillTrees(actor, api) {
  const rows = [];
  for (const tree of api.listTrees?.() ?? []) {
    const p = api.actorProgress(actor, tree.id);
    if (!p) continue;
    const owned = (p.unlocks ?? []).map(id => tree.nodes?.find?.(n => n.id === id)?.name || id);
    if (!owned.length && !num(p.awarded)) continue;
    rows.push(`<li><strong>${esc(tree.name || tree.id)}</strong>${tree.provider?.kind === 'profession' ? '' : ` <span class="ag-badge">${num(p.awarded)} point${num(p.awarded) === 1 ? '' : 's'} awarded</span>`} <span class="agch-muted">${owned.length} perk${owned.length === 1 ? '' : 's'}${owned.length ? `: ${owned.map(esc).join(', ')}` : ''}</span></li>`);
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

function utilities(actor, api) {
  let purse = null;
  try { purse = api.purse?.totals?.(); } catch (err) { return `<p class="agch-muted">${esc(err?.message ?? 'Party purse unavailable.')}</p>`; }
  if (!purse) return '<p class="agch-muted">Party purse unavailable.</p>';
  return `<p>Party purse: ${['pp', 'gp', 'ep', 'sp', 'cp'].filter(k => num(purse[k])).map(k => `${num(purse[k])} ${k}`).join(', ') || 'empty'}</p>`;
}

/**
 * Panel registry, in display order. `summary(actor, api)` returns HTML (or throws); `open(api, actor, ref)` deep-links.
 * `missing` lists APIs the owner module would need for a fuller summary (also in the README).
 */
export const PANELS = [
  {id: 'ashen-gate-profession-ledger', label: 'Profession Ledger', icon: 'fa-solid fa-hammer', summary: professions,
    open: (api, actor) => api.open({actorId: actor.id, view: 'individual'}), missing: 'a list of this character\'s professions with XP to next level'},
  {id: 'ashen-gate-skill-trees', label: 'Skill Trees', icon: 'fa-solid fa-diagram-project', summary: skillTrees,
    open: (api, actor) => api.open({actorId: actor.id}), missing: 'points available/spent per tree'},
  {id: 'ashen-gate-factions', label: 'Factions & Renown', icon: 'fa-solid fa-flag', summary: factions, open: api => api.open()},
  {id: 'ashen-gate-quest-manager', label: 'Quest Log', icon: 'fa-solid fa-scroll', summary: quests,
    open: (api, actor, ref) => ref ? api.openObjective(ref) : api.open()},
  {id: 'ashen-gate-locations', label: 'Locations', icon: 'fa-solid fa-map-location-dot', summary: locations,
    open: (api, actor, ref) => ref ? api.openLocation(ref) : api.open(), missing: 'the party\'s current or recent location'},
  {id: 'ashen-gate-headquarters', label: 'Headquarters', icon: 'fa-solid fa-chess-rook', summary: null,
    open: api => api.open(), missing: 'a player-safe read of this character\'s hirelings and facilities'},
  {id: 'ashen-gate-utilities', label: 'Utilities', icon: 'fa-solid fa-toolbox', summary: utilities,
    open: api => api.stash?.open ? api.stash.open() : api.open(), openLabel: 'Open party stash', missing: 'a stash item list'}
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

export function partnersTab({actor}) {
  return `<div class="agch-panels">${PANELS.map(p => {
    const s = panelState(p, actor);
    return `<section class="ag-card agch-panel" data-partner="${p.id}" data-state="${s.state}"><header class="agch-panel__head"><h3><i class="${p.icon}" aria-hidden="true"></i> ${esc(p.label)}</h3>
      ${s.state === 'missing' ? '' : btn('partner-open', p.openLabel ?? `Open ${p.label}`, {kind: 'sm', icon: 'fa-solid fa-up-right-from-square', data: {partner: p.id}, always: true})}</header>${s.html}</section>`;
  }).join('')}</div><p class="agch-muted agch-hint">Each module keeps its own records; these are read-only summaries. Open a module to make changes there.</p>`;
}

export async function openPartner(actor, id, ref = null) {
  const panel = PANELS.find(p => p.id === id), api = partnerApi(id);
  if (!panel || !api) return {ok: false, error: 'That module is not active.'};
  try { return {ok: true, result: await panel.open(api, actor, ref || null)}; } catch (err) {
    return {ok: false, error: `${panel.label}: ${err?.message ?? err}`};
  }
}
