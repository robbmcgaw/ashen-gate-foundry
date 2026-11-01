/**
 * "Ashen Gate" panels: player-safe summaries from other Ashen Gate modules, read only through their public
 * APIs (game.modules.get(id)?.api). Those modules keep all their own state; nothing is copied here. A failing module
 * shows an "unavailable" note and never breaks the sheet. Players don't get a section at all when the GM hides it, its
 * module is missing, or its Player Access is off (see visibility.mjs); the GM sees it with a "Hidden from players" badge.
 */
import {esc, num} from './constants.mjs';
import {displayProfessionName} from './profession-name.mjs';
import {btn} from './buttons.mjs';
import {coinChip} from './coins.mjs';
import {canSee, requirePart, hiddenBadge, hiddenReason, partForPartner} from './visibility.mjs';
import {isTestPlayer} from './ag-test-players.mjs';
import {cindersSummary, skillTreeBtn, boundCinders} from './cinders.mjs';
import {toggleButton, bodyAttrs, sectionKey} from './collapse.mjs';
import {lockedNeed, treeVisibility, applyVisibility, cindersTabHtml} from './tree-tabs.mjs';
import {linkButton, subTabs, tabPanelAttrs} from './ag-html.mjs';
import {LOCATIONS_ID, listModelApi, locationsPanelState} from './locations-list.mjs';

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
/** The REC ids this character knows (Ledger getKnownRecipes), or null. */
function knownRecipeIds(actor, api) {
  try { const r = api.getKnownRecipes?.(actor); return Array.isArray(r) ? r.map(x => String(typeof x === 'object' ? x?.id ?? '' : x ?? '')) : null; } catch { return null; }
}
/** The total over every profession: always the generic word (0.36.0: a profession's own word is only used per profession). */
function knownRecipes(actor, api, ids = knownRecipeIds(actor, api)) {
  return Array.isArray(ids) ? `<p class="agch-muted">${ids.length} known recipe${ids.length === 1 ? '' : 's'}</p>` : '';
}
/**
 * 0.36.0: what a profession calls a recipe, from the Ledger's recipeLabel (0.29.0+, feature-detected): {singular, plural}
 * in sentence case ("Formula", "Formulas"), or null when the Ledger has no recipeLabel (then the Hub shows no word).
 */
export function recipeLabelOf(api, profession) {
  if (typeof api?.recipeLabel !== 'function') return null;
  const word = plural => { try { const w = api.recipeLabel(profession, {plural, capitalize: true}); return typeof w === 'string' && w.trim() ? w.trim() : null; } catch { return null; } };
  const singular = word(false), pluralWord = word(true);
  return singular || pluralWord ? {singular: singular || 'Recipe', plural: pluralWord || 'Recipes'} : null;
}
const lower = s => /^[A-Z][A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1);
/** "3 formulas", "1 formula": a count in the profession's own word (lower case inside a line). */
export const recipeCountText = (n, label) => `${num(n)} ${lower(num(n) === 1 ? label.singular : label.plural)}`;
/**
 * The profession (PROF id) of each REC id, read from the Manager source definitions (flags['ashen-gate-manager'].source:
 * sourceId, definition.profession_id) of the character's Items and the world's Items this user can see. Ids it can't
 * place are left out, so a count never claims more than the Hub can see.
 */
export function recipeProfessions(actor, ids) {
  const want = new Set(ids ?? []), out = new Map();
  if (!want.size) return out;
  const docs = [...(actor?.items ?? []), ...(globalThis.game?.items?.contents ?? globalThis.game?.items ?? [])];
  for (const doc of docs) {
    const src = doc?.flags?.['ashen-gate-manager']?.source, id = String(src?.sourceId ?? '');
    const prof = src?.definition?.profession_id ?? src?.definition?.professionId;
    if (want.has(id) && !out.has(id) && typeof prof === 'string' && prof) out.set(id, prof);
  }
  return out;
}
/** Known recipes per profession: Map PROF id → count. */
function recipeCounts(actor, ids) {
  const counts = new Map();
  for (const prof of recipeProfessions(actor, ids).values()) counts.set(prof, (counts.get(prof) ?? 0) + 1);
  return counts;
}
/** " · 3 formulas" after a profession's XP, only when the Ledger names its recipes (recipeLabel) and the known list is readable. */
function recipeCountHtml(api, profId, counts) {
  const label = counts ? recipeLabelOf(api, profId) : null;
  return label ? ` · ${esc(recipeCountText(counts.get(profId) ?? 0, label))}` : '';
}
/** Professions: the Ledger's own list (getProfessions, 0.18.0+) when present; else Skill Trees' profession trees name the PROF ids. */
function professions(actor, api) {
  const ids = knownRecipeIds(actor, api);
  const counts = typeof api.recipeLabel === 'function' && ids ? recipeCounts(actor, ids) : null;
  if (typeof api.getProfessions === 'function') {
    const rows = (api.getProfessions(actor) ?? []).map(p => `<li><strong>${esc(displayProfessionName(p.name || 'Profession'))}</strong> <span class="ag-badge">Level ${num(p.level)}</span> <span class="agch-muted">${num(p.xp)} XP · ${p.xpToNext === null || p.xpToNext === undefined ? 'maximum level' : `${num(p.xpToNext)} XP to level ${num(p.level) + 1}`}${recipeCountHtml(api, p.professionId, counts)}</span>${perkBadge(p.unspentPerkChoices)}</li>`);
    return list(rows, 'No professions yet.') + knownRecipes(actor, api, ids);
  }
  const trees = partnerApi('ashen-gate-skill-trees');
  let refs = [];
  try { refs = (trees?.listTrees?.() ?? []).filter(t => t?.provider?.kind === 'profession' && t.sourceRef).map(t => ({id: t.sourceRef, name: displayProfessionName(t.name || 'Profession')})); } catch { refs = []; }
  const rows = [];
  for (const ref of refs) {
    const p = api.getProfessionProgress(actor, ref.id);
    if (p) rows.push(`<li><strong>${esc(ref.name)}</strong> <span class="ag-badge">Level ${num(p.level)}</span> <span class="agch-muted">${num(p.xp)} XP${recipeCountHtml(api, ref.id, counts)}</span>${perkBadge(p.unspentPerkChoices)}</li>`);
  }
  const recipeLine = knownRecipes(actor, api, ids);
  // 0.58.4: without the Ledger the Hub can only read professions from Skill Trees' profession trees. Say what is true: with Skill
  // Trees active but no tree visible (none yet, or hidden from this player) there is nothing to list; with neither, the Ledger is what shows levels.
  const note = refs.length ? '' : trees ? '<p class="agch-muted">No profession trees yet. They appear when your character gains a profession.</p>'
    : '<p class="agch-muted">Profession levels show here when the Profession Ledger is active.</p>';
  return list(rows, refs.length ? 'No profession progress yet.' : '') + note + recipeLine;
}

/**
 * Overview's Professions box (0.30.0): the professions this character knows, name and level, from the Ledger's
 * getProfessions (feature-detected; 0.34.0 also reads its `tier`, e.g. Apprentice). Null (no box) when the Ledger is missing or too old, when players may not see
 * Professions (the GM's switch, Ledger inactive or its Player Access off) or when the Ledger refuses this user.
 */
export function knownProfessions(actor, user = globalThis.game?.user) {
  if (!actor || !canSee('professions', user)) return null;
  const api = partnerApi('ashen-gate-profession-ledger');
  if (typeof api?.getProfessions !== 'function') return null;
  let rows;
  try { rows = api.getProfessions(actor); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  // 0.36.0: with the Ledger's recipeLabel, each row also carries the profession's word ({singular, plural}) and its known count.
  const ids = typeof api.recipeLabel === 'function' ? knownRecipeIds(actor, api) : null;
  const counts = ids ? recipeCounts(actor, ids) : null;
  return rows.map(p => {
    const id = String(p?.professionId ?? ''), label = typeof api.recipeLabel === 'function' ? recipeLabelOf(api, id) : null;
    const row = {id, name: String(p?.name || 'Profession'), level: num(p?.level), tier: typeof p?.tier === 'string' ? p.tier : ''};
    if (label) Object.assign(row, {recipeLabel: label, ...(counts ? {recipes: counts.get(id) ?? 0, recipeCount: recipeCountText(counts.get(id) ?? 0, label)} : {})});
    return row;
  }).filter(p => p.name);
}

const plural = (n, word) => `${num(n)} ${word}${num(n) === 1 ? '' : 's'}`;
/** Points per tree: Skill Trees' pointsSummary (0.13.0+) when present; else the awarded points of non-profession trees. */
function treePoints(tree, p, points) {
  if (!points) return tree.provider?.kind === 'profession' ? '' : ` <span class="ag-badge">${plural(p.awarded, 'point')} awarded</span>`;
  if (points.available === null || points.available === undefined) return '';
  return ` <span class="ag-badge${num(points.available) ? ' ag-badge--accent' : ''}">${plural(points.available, 'point')} to spend</span> <span class="agch-muted">${num(points.spent)} of ${num(points.earned)} spent</span>`;
}
function skillTrees(actor, api) {
  if (typeof api.embed?.data === 'function') return groupedTrees(actor, api);
  const rows = [];
  let summary = null;
  if (typeof api.pointsSummary === 'function') summary = new Map((api.pointsSummary(actor) ?? []).map(r => [r.treeId, r]));
  // 0.35.0: trees of one profession share a wallet (Skill Trees 0.21.0 rows carry `wallet`); its points show once.
  const walletShown = new Map();
  for (const tree of api.listTrees?.() ?? []) {
    const p = api.actorProgress(actor, tree.id);
    if (!p) continue;
    const owned = (p.unlocks ?? []).map(id => tree.nodes?.find?.(n => n.id === id)?.name || 'a perk');
    const points = summary?.get(tree.id) ?? null;
    if (!owned.length && !num(p.awarded) && !num(points?.earned)) continue;
    const first = points?.wallet ? walletShown.get(points.wallet) : null;
    if (points?.wallet && !first) walletShown.set(points.wallet, tree.name || 'another tree');
    const pts = first ? ` <span class="agch-muted">Shares points with ${esc(first)}</span>` : treePoints(tree, p, summary ? points : null);
    rows.push(`<li><strong>${esc(tree.name || 'Skill tree')}</strong>${pts} <span class="agch-muted">${plural(owned.length, 'perk')}${owned.length ? `: ${owned.map(esc).join(', ')}` : ''}</span></li>`);
  }
  return list(rows, 'No points or perks yet.');
}

/** Sub-tab picked per character and profession in the Skill Trees summary, kept across re-renders ("actorId|group key" → tree id). */
export const treeTabChoice = new Map();
/** Shows the clicked tree's panel in a profession's sub-tabs (no re-render) and remembers the choice. */
export function pickTreeTab(tab) {
  const list = tab?.closest?.('[role="tablist"]');
  if (!list) return false;
  for (const t of list.querySelectorAll('[role="tab"]')) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on)); t.setAttribute('tabindex', on ? '0' : '-1');
    // 0.72.0: the panel is looked up inside this tab list's own block first. The same character's Hub can be open twice (window and
    // pop-out) with the same ids; a document-wide getElementById then flips the other copy and leaves this one showing the old tree.
    const want = t.getAttribute('aria-controls'), scope = list.parentElement;
    const panel = [...(scope?.querySelectorAll?.('[role="tabpanel"]') ?? [])].find(el => el.id === want) ?? (list.ownerDocument ?? globalThis.document)?.getElementById?.(want);
    if (panel) panel.hidden = !on;
  }
  if (list.dataset?.stChoice) treeTabChoice.set(list.dataset.stChoice, tab.dataset.tab);
  return true;
}
const treePerks = m => {
  const nodes = Array.isArray(m?.nodes) ? m.nodes : [], owned = nodes.filter(n => n.unlocked), locked = nodes.filter(n => !n.unlocked && !n.available);
  const ready = nodes.filter(n => n.available);
  // Locked reasons ("Needs … proficiency", "Needs profession level 3 (now 1)") are Skill Trees' own words, shown as given; the generic
  // "Prerequisite required" is made specific by lockedNeed (0.72.0).
  return `${m.access ? `<p class="agch-muted">${esc(m.access)}</p>` : ''}<p class="agch-muted">${owned.length ? `${plural(owned.length, 'perk')}: ${owned.map(n => esc(n.name)).join(', ')}` : 'No perks yet'}${ready.length ? ` · available now: ${ready.map(n => esc(n.name)).join(', ')}` : ''}</p>`
    + (locked.length ? `<details class="agch-stlocked"><summary>Locked (${locked.length})</summary><ul class="agch-plist">${locked.map(n => { const need = lockedNeed(n, m); return `<li>${esc(n.name)}${need ? ` <span class="agch-muted">${esc(need)}</span>` : ''}</li>`; }).join('')}</ul></details>` : '');
};
/** One wallet's points: "n points to spend" and "x of y spent" (only what was used when the Ledger is off). */
const walletPoints = g => g.available === null || g.available === undefined
  ? (num(g.spent) ? ` <span class="agch-muted">${plural(g.spent, 'point')} used</span>` : '')
  : ` <span class="ag-badge${num(g.available) ? ' ag-badge--accent' : ''}">${plural(g.available, 'point')} to spend</span> <span class="agch-muted">${num(g.spent)} of ${plural(g.earned, 'point')} spent${g.level === null || g.level === undefined ? '' : ` · level ${num(g.level)}`}</span>`;
/**
 * Skill Trees 0.21.0+ (embed.data): one entry per wallet. A profession with several trees (Artistry) is one entry with its
 * shared points once and kit sub-tabs for its trees; Skill Trees works out points, gates and reasons, the Hub only shows them.
 */
function groupedTrees(actor, api) {
  const vis = treeVisibility(api, actor.id);   // 0.72.0: Skill Trees' own tree-visibility answer when it has one; else the list is unchanged
  const groups = applyVisibility(api.embed.data(actor.id) ?? [], vis);
  const active = m => (m.nodes ?? []).some(n => n.unlocked || n.available) || num(m.earned) > 0;
  // 0.72.0: every profession block folds the same way, remembered per character like the other sections (collapse.mjs).
  const block = (g, head, body) => { const key = sectionKey('sttree', actor.id, g.key); return `<li class="agch-stgroup agch-stblock">${toggleButton(key, head.title)}${head.points}<div class="agch-stblock__body"${bodyAttrs(key)}>${body}</div></li>`; };
  const rows = groups.filter(g => (g.trees ?? []).some(active)).map(g => {
    if (!g.shared || g.trees.length < 2) { const m = g.trees[0]; return block(g, {title: esc(m.name || g.name), points: walletPoints(m)}, treePerks(m)); }
    const choice = `${actor.id}|${g.key}`, kept = treeTabChoice.get(choice);
    const pick = g.trees.some(m => m.id === kept) ? kept
      : (g.trees.find(m => m.nodes?.some(n => n.available)) ?? g.trees.find(m => m.nodes?.some(n => n.unlocked)) ?? g.trees[0]).id;
    const group = `agch-st-${actor.id}-${g.key}`.replace(/[^A-Za-z0-9_-]/g, '-');
    const tabs = subTabs({group, label: `${g.name} trees`, selected: pick, tabs: g.trees.map(m => ({id: m.id, label: m.label || m.name}))})
      .replace('role="tablist"', `role="tablist" data-st-choice="${esc(choice)}"`).replace('class="ag-tabs ag-tabs--sub"', 'class="ag-tabs ag-tabs--sub agch-sttabs"')
      .replaceAll('role="tab" ', 'role="tab" data-action="st-tree-tab" data-ag-always ');
    const split = g.trees.map(m => `${esc(m.label || m.name)} ${num(m.treeSpent)}`).join(' · ');
    return block(g, {title: esc(g.name), points: walletPoints(g)}, `<p class="agch-muted">One pool of points shared by ${g.trees.length} trees: ${split}</p>${tabs}
      ${g.trees.map(m => `<div ${tabPanelAttrs(group, m.id, {hidden: m.id !== pick})}>${treePerks(m)}</div>`).join('')}`);
  });
  // The hint line Skill Trees provides with its visibility answer (for example, that some trees are hidden until a proficiency is held).
  return list(rows, 'No points or perks yet.') + (vis?.hint ? `<p class="agch-muted agch-sthint">${esc(vis.hint)}</p>` : '');
}

// ---------- Skill Trees tab shell (0.72.0): Professions | Cinders ----------

export const TREES_ID = 'ashen-gate-skill-trees';
/** Asks Skill Trees to open on a tab. Only the `tab` field is new: an older Skill Trees ignores it; one that refuses it is asked again without. */
async function openTreesOn(api, actor, tab) {
  try { return await api.open({actorId: actor.id, tab}); } catch { return api.open({actorId: actor.id}); }
}
/**
 * The same two top-level tabs for every role: Professions (Skill Trees' own view, or the Hub's list without it) and Cinders (the bound
 * Cinders with their tree progress and Open Skill Trees…). The Cinders tab is an empty state, never hidden. The choice is kept per character.
 */
export function treesShell(actor, professionsHtml) {
  const api = partnerApi(TREES_ID);
  let groups = [];
  try { groups = typeof api?.embed?.data === 'function' ? api.embed.data(actor.id) ?? [] : []; } catch { groups = []; }
  const button = treeId => btn('cinder-tree', 'Open Skill Trees…', {kind: 'sm', icon: 'fa-solid fa-diagram-project', data: treeId ? {tree: treeId} : {}, always: true,
    title: treeId ? 'Open this Cinder\'s skill tree in Skill Trees' : 'Open the Cinders tab in Skill Trees'});
  const choice = `${actor.id}|trees-section`, kept = treeTabChoice.get(choice), pick = kept === 'cinders' ? 'cinders' : 'professions';
  const group = `agch-stsec-${actor.id}`.replace(/[^A-Za-z0-9_-]/g, '-');
  const tabs = subTabs({group, label: 'Skill Trees sections', selected: pick, tabs: [{id: 'professions', label: 'Professions'}, {id: 'cinders', label: 'Cinders'}]})
    .replace('role="tablist"', `role="tablist" data-st-choice="${esc(choice)}"`).replace('class="ag-tabs ag-tabs--sub"', 'class="ag-tabs ag-tabs--sub agch-sttabs"')
    .replaceAll('role="tab" ', 'role="tab" data-action="st-tree-tab" data-ag-always ');
  return `${tabs}<div ${tabPanelAttrs(group, 'professions', {hidden: pick !== 'professions'})}>${professionsHtml}</div>
    <div ${tabPanelAttrs(group, 'cinders', {hidden: pick !== 'cinders'})}>${cindersTabHtml(boundCinders(actor), groups, button)}</div>`;
}

/** The viewing user's own projection: group standing, and this character's standing if the user owns it. */
function factions(actor, api) {
  const rows = (api.getFactions?.() ?? []).map(f => {
    const group = f.group?.score, mine = f.personal?.[actor.id]?.score;
    return `<li><strong>${esc(f.name || 'Unknown faction')}</strong>${group !== undefined ? ` <span class="ag-badge">Party ${signedScore(group)}</span>` : ''}${mine !== undefined ? ` <span class="ag-badge ag-badge--accent">${esc(actor.name)} ${signedScore(mine)}</span>` : ''}</li>`;
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
  const coins = `<p class="agch-purseline">Party purse: ${['pp', 'gp', 'ep', 'sp', 'cp'].filter(k => num(purse[k]) && !(offEp && k === 'ep')).map(k => coinChip(k, num(purse[k]))).join(' ') || 'empty'}</p>`
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
    open: (api, actor) => openTreesOn(api, actor, 'professions')},
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
  let panels = agPanelsFor(), current = null, state = null, embedded = null, ownList = false;
  while (panels.length) {
    current = panels.find(p => p.id === sheet?.agTab) ?? panels[0];
    // 0.63.0: Locations offers its list as data (api.listModel): the Hub draws it with its own markup. Older Locations: its embed, else the summary.
    ownList = current.id === LOCATIONS_ID && !!sheet && !!listModelApi(partnerApi);
    embedded = ownList ? null : embedApi(current.id, current.embedMode);
    state = ownList ? locationsPanelState(sheet, listModelApi(partnerApi), globalThis.game?.user, actor)
      : embedded ? {state: 'ok', html: embedSlot(current.id, current.embedMode, actor)} : panelState(current, actor);
    if (gm || !state.refused) break;
    panels = panels.filter(p => p !== current); current = null;
  }
  if (state?.state === 'ok' && current?.id === TREES_ID) state = {...state, html: treesShell(actor, state.html)};
  if (!current) return '<div class="ag-empty"><i class="fa-solid fa-dungeon" aria-hidden="true"></i><p class="ag-empty__title">Nothing here yet.</p><p class="ag-empty__text">Ashen Gate sections show here once your GM shares them.</p></div>';
  // 0.33.0: kit sub-tabs (one Tab stop, arrow keys via bindTablist in the sheet) instead of a segmented control;
  // the sub-tab and the bottom quick bar use the same name per module (CH-10). Hidden-from-players ones carry the eye.
  const group = `${String(sheet?.id ?? 'agch').replace(/[^A-Za-z0-9_-]/g, '')}-ag`;
  const tabs = subTabs({group, label: 'Ashen Gate sections', selected: current.id,
    tabs: panels.map(p => ({id: p.id, label: p.tab, icon: gm && hiddenReason(partForPartner(p.id)) ? 'fa-solid fa-eye-slash' : null}))})
    .replace('class="ag-tabs ag-tabs--sub"', 'class="ag-tabs ag-tabs--sub agch-agtabs"').replaceAll('role="tab" ', 'role="tab" data-action="ag-subtab" data-ag-always ');
  return `${tabs}<div ${tabPanelAttrs(group, current.id)} class="agch-agpanel">
    ${panelHtml({...current, badge: hiddenBadge(partForPartner(current.id))}, actor, state)}</div>
    <p class="agch-muted agch-hint">${ownList ? 'The folders, filters and sorting come from Locations, and a place opens in Locations: it keeps its own records and permissions.' : embedded ? `This is ${esc(current.label)}'s own view: it keeps its own records and permissions.` : current.id === 'ashen-gate-cinders' ? 'Cinders keeps its own records: Push and socket changes go through it and it checks them again.' : 'Each module keeps its own records; this is a read-only summary. Open the module to make changes there.'}</p>`;
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
  try { return (api.playerAccess?.getState?.()?.playerAccessEnabled === true || isTestPlayer(user)) && api.stash.isEnabled?.() === true; } catch { return false; }
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
