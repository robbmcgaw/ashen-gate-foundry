/**
 * Items → Assets: Cinder stage art (0.61.0). Files such as `Echo_Cinder_Stage_3.webp` are grouped per Cinder, previewed as one row
 * per Cinder and, on Link, written through the public API of Ashen Gate | Cinders (`api.cinder.setArtStages`, or `setArt` for a single
 * image). Pure apart from the API object it is handed, so the Node suite covers it with a mocked API. GM only: every function that
 * reads or writes checks the user itself (the window hiding the tab is not the guard, and Cinders checks again).
 *
 * Nothing here reaches into Cinders' internals; every call is feature-detected. Nothing is written by planning.
 */
import {isImageName, extensionOf, stem, samePath} from './assets.js';

export const CINDER_NAMES = Object.freeze(['Ember', 'Frost', 'Gale', 'Echo', 'Lumen', 'Root', 'Stone', 'Tide', 'Veil']);
export const MAX_STAGE = 5;
export const MIN_STAGES = 2;
/** Unlocks needed for stages 1 to 5 when the Cinder has no stages of its own (the same defaults Cinders' own editor starts from). */
export const DEFAULT_THRESHOLDS = Object.freeze([0, 3, 6, 10, 14]);
export const MODULE_CINDERS = 'ashen-gate-cinders';
export const REASON = 'Matched Cinder name and stage number';
const GM_ONLY = 'Only a GM can manage assets.';
const NO_CINDERS = 'Ashen Gate | Cinders is not active, or is too old to set art stages. Turn it on (or update it) and drop the files again. Nothing was changed.';
const isGM = user => Boolean(user?.isGM);
const EXT_ORDER = ['webp', 'png', 'avif', 'jpg', 'jpeg', 'gif', 'svg'];
const lc = text => String(text ?? '').toLowerCase();
const NAME_SET = new Set(CINDER_NAMES.map(lc));
const pretty = word => CINDER_NAMES.find(n => lc(n) === lc(word)) ?? word;

// ---------- File names ----------
/**
 * Reads a file name such as "Echo_Cinder_Stage_1.webp", "frost-cinder-stage3.PNG" or "Tide Cinder Stage 2.jpg".
 * Needs one Cinder name as a whole word and the word "stage" followed by a number; the word "cinder" itself is optional.
 * Returns {cinder: 'Echo', stage: 1, name} or null when the name is not Cinder stage art. A stage outside 1–5 still returns
 * (with `valid: false`) so that file is not offered to other records.
 */
export function parseCinderStageName(fileName) {
  const name = String(fileName ?? '');
  if (!isImageName(name)) return null;
  const tokens = lc(stem(name)).replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean);
  const cinders = [...new Set(tokens.filter(t => NAME_SET.has(t)))];
  if (cinders.length !== 1) return null;
  const at = tokens.indexOf('stage');
  if (at < 0 || !/^\d{1,3}$/.test(tokens[at + 1] ?? '')) return null;
  const stage = Number(tokens[at + 1]);
  return {cinder: pretty(cinders[0]), stage, valid: stage >= 1 && stage <= MAX_STAGE, name};
}

/**
 * Splits files into Cinder stage art and everything else. Only the rest goes to the usual record matching, so a Cinder stage file is
 * never offered to an NPC or Item as well.
 * Returns {groups: Map(Cinder name → {cinder, stages: Map(n → file), extras:[{name, why}]}), rest:[file]}.
 * Two files for one stage (say .webp and .png): the preferred extension is used and the other is listed in `extras`.
 */
export function groupCinderFiles(files) {
  const groups = new Map(), rest = [];
  const rank = f => { const i = EXT_ORDER.indexOf(extensionOf(f.name)); return i < 0 ? 99 : i; };
  for (const file of files ?? []) {
    const hit = parseCinderStageName(file?.name);
    if (!hit) { rest.push(file); continue; }
    const g = groups.get(hit.cinder) ?? groups.set(hit.cinder, {cinder: hit.cinder, stages: new Map(), extras: []}).get(hit.cinder);
    if (!hit.valid) { g.extras.push({name: file.name, why: `Stage ${hit.stage} is outside 1 to ${MAX_STAGE}, so it is not used.`}); continue; }
    const have = g.stages.get(hit.stage);
    if (!have) { g.stages.set(hit.stage, file); continue; }
    const [keep, drop] = rank(file) < rank(have) || (rank(file) === rank(have) && file.path < have.path) ? [file, have] : [have, file];
    g.stages.set(hit.stage, keep);
    g.extras.push({name: drop.name, why: `Stage ${hit.stage} has another file (${keep.name}); that one is used.`});
  }
  return {groups, rest};
}

// ---------- Stages ----------
const validList = list => Array.isArray(list) && list.length >= MIN_STAGES && list.length <= MAX_STAGE
  && list.every((s, i) => s && typeof s.art === 'string' && Number.isSafeInteger(s.at) && s.at >= 0 && (i === 0 ? s.at === 0 : s.at > list[i - 1].at));
/**
 * Unlocks needed for each new stage. When the Cinder already has stages with the same count, its own numbers are kept; otherwise the
 * defaults 0, 3, 6, 10, 14 (the first n of them). `existing` is [{art, at}] or null.
 */
export function stageThresholds(count, existing = null) {
  const n = Math.max(0, Math.min(MAX_STAGE, Number(count) || 0));
  if (validList(existing) && existing.length === n) return existing.map(s => s.at);
  return DEFAULT_THRESHOLDS.slice(0, n);
}
/** The stage numbers a group would need to be valid, e.g. [1, 2, 4] → {ok: false, missing: [3]}; the stages must run 1..n with no gap. */
export function stageCoverage(numbers) {
  const nums = [...numbers].sort((a, b) => a - b), top = nums.at(-1) ?? 0;
  const missing = [];
  for (let i = 1; i <= top; i++) if (!nums.includes(i)) missing.push(i);
  return {count: nums.length, top, missing, ok: nums.length > 0 && !missing.length};
}
const listWords = nums => nums.length < 2 ? String(nums[0] ?? '') : `${nums.slice(0, -1).join(', ')} and ${nums.at(-1)}`;

// ---------- Cinders in the world ----------
/** The Cinders public API, feature-detected: {cinder, canStages, canArt, canList} or null when Ashen Gate | Cinders is absent. */
export function cindersApi(g = globalThis) {
  const mod = g.game?.modules?.get?.(MODULE_CINDERS);
  const cinder = mod?.active ? mod.api?.cinder : null;
  if (!cinder || typeof cinder !== 'object') return null;
  const fn = k => typeof cinder[k] === 'function';
  return {cinder, canStages: fn('setArtStages') && fn('instances'), canArt: fn('setArt') && fn('instances'), canRead: fn('stages')};
}

const words = text => lc(text).split(/[^a-z0-9]+/).filter(Boolean);
/**
 * The Cinders a file can be linked to: one entry per Cinder definition that is bound to somebody (art is set on the bound Cinder).
 * `docs` are Manager's plain records (for the Cinder's name); `instances` are api.cinder.instances(); `stagesOf(instanceId)` answers
 * api.cinder.stages(instanceId) or null. Returns [{definitionId, name, words, instances:[{instanceId, stages, own}], …}] by name.
 */
export function cinderChoices({docs = [], instances = [], stagesOf = () => null} = {}) {
  const nameOf = id => (docs ?? []).find(d => d.sourceId === id)?.name ?? '';
  const byDef = new Map();
  for (const inst of instances ?? []) {
    if (!inst?.instanceId || !inst.definitionId) continue;
    const name = nameOf(inst.definitionId);
    if (!name) continue;
    let info = null;
    try { info = stagesOf(inst.instanceId); } catch { info = null; }
    const entry = byDef.get(inst.definitionId) ?? byDef.set(inst.definitionId, {definitionId: inst.definitionId, name, words: words(name), instances: []}).get(inst.definitionId);
    entry.instances.push({instanceId: inst.instanceId, stages: Array.isArray(info?.stages) ? info.stages.map(s => ({art: s.art, at: s.at})) : null,
      own: Array.isArray(info?.own) ? info.own.map(s => ({art: s.art, at: s.at})) : null, art: typeof inst.art === 'string' ? inst.art : null});
  }
  return [...byDef.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
}

// ---------- Planning ----------
/**
 * Applies a Cinder (or none) to a row: fills the new images, the old ones and whether it can be written. Nothing is written.
 * `caps` is {canStages, canArt} from cindersApi (null when Cinders is absent).
 */
export function bindCinder(row, cinder, caps) {
  const nums = [...row.stageFiles.keys()];
  const cover = stageCoverage(nums);
  const files = [...row.stageFiles.entries()].sort((a, b) => a[0] - b[0]);
  Object.assign(row, {cinderName: cinder?.name ?? '', definitionId: cinder?.definitionId ?? '', instanceIds: (cinder?.instances ?? []).map(i => i.instanceId),
    mode: '', to: [], from: [], problem: '', checked: false, unchanged: false});
  const first = cinder?.instances?.[0];
  row.from = (first?.stages ?? []).map((s, i) => ({stage: i + 1, art: s.art, at: s.at}));
  row.fromArt = first?.art ?? '';
  row.bound = cinder?.instances?.length ?? 0;
  if (!caps) row.problem = NO_CINDERS;
  else if (!cinder) row.problem = `No Cinder named ${row.word} is bound to a character yet, so there is nothing to set art on. Use Different… to pick another Cinder.`;
  else if (!cover.ok) row.problem = `Stage ${listWords(cover.missing)} ${cover.missing.length > 1 ? 'are' : 'is'} missing (found ${listWords(nums.sort((a, b) => a - b))}). Add ${cover.missing.length > 1 ? 'them' : 'it'} and drop the files again.`;
  else if (files.length === 1) {
    row.mode = 'art';
    if (!caps.canArt) row.problem = 'Only one image was found, and this version of Cinders cannot set a single image. Add at least two stages (2 to 5).';
    else row.to = [{stage: 1, art: files[0][1].path, at: 0, fileName: files[0][1].name}];
  } else {
    row.mode = 'stages';
    if (!caps.canStages) row.problem = NO_CINDERS;
    else {
      const at = stageThresholds(files.length, first?.own ?? first?.stages ?? null);
      row.to = files.map(([n, f], i) => ({stage: n, art: f.path, at: at[i], fileName: f.name}));
    }
  }
  const ready = !row.problem && row.to.length > 0;
  const same = ready && (row.mode === 'art' ? samePath(row.fromArt, row.to[0].art)
    : row.from.length === row.to.length && row.to.every((t, i) => samePath(t.art, row.from[i].art) && t.at === row.from[i].at));
  row.ready = ready;
  row.unchanged = Boolean(same);
  row.checked = ready && !same;
  row.note = same ? 'This Cinder already uses these images.' : '';
  return row;
}

/**
 * Plans the Cinder stage art in a set of files. Returns {rows, rest}: `rows` one per Cinder named in the files, `rest` the files that are
 * not Cinder stage art (those go to the normal record matching). GM only: for anyone else every file is left in `rest` and no row is made.
 * Row: {key, word, cinderName, definitionId, instanceIds, bound, mode: 'stages'|'art'|'', stageFiles, to:[{stage, art, at, fileName}],
 *       from:[{stage, art, at}], fromArt, extras, ready, checked, unchanged, problem, note, reason, candidates, needsPick, chosen}.
 */
export function planCinderArt(files, {user, cinders = [], caps = null} = {}) {
  if (!isGM(user)) return {rows: [], rest: [...(files ?? [])]};
  const {groups, rest} = groupCinderFiles(files);
  const rows = [];
  for (const g of groups.values()) {
    const word = lc(g.cinder);
    const fits = cinders.filter(c => c.words.includes(word));
    // Prefer a Cinder called just "Echo" or "Echo Cinder" when several fit.
    const plain = fits.filter(c => c.words.every(w => w === word || w === 'cinder'));
    const pool = plain.length ? plain : fits;
    const row = {key: `cinder:${g.cinder}`, word: g.cinder, kind: 'cinder', stageFiles: g.stages, extras: g.extras, reason: REASON,
      candidates: pool.map(c => ({value: c.definitionId, label: c.name})), needsPick: pool.length > 1, chosen: ''};
    bindCinder(row, pool.length === 1 ? pool[0] : null, caps);
    if (pool.length > 1) { row.problem = `More than one Cinder fits ${g.cinder}. Pick the right one.`; row.ready = false; row.checked = false; }
    rows.push(row);
  }
  rows.sort((a, b) => CINDER_NAMES.indexOf(a.word) - CINDER_NAMES.indexOf(b.word));
  return {rows, rest};
}

/** "Different…": the same files, another Cinder. Returns the row, or null when that Cinder is not one of `cinders`. */
export function assignCinder(row, definitionId, cinders, caps) {
  const cinder = (cinders ?? []).find(c => c.definitionId === definitionId);
  if (!row || !cinder) return null;
  bindCinder(row, cinder, caps);
  Object.assign(row, {reason: 'You chose this Cinder', needsPick: false, chosen: definitionId, reassigned: true});
  return row;
}
/** Yes or No on one Cinder row. Yes needs a row that can be written. Returns whether it changed. */
export function setCinderChoice(row, choice) {
  if (choice === 'yes') { if (!row?.ready) return false; row.checked = true; return true; }
  if (choice === 'no') { if (!row) return false; row.checked = false; return true; }
  return false;
}
/** Yes (to every writable row that would change something) or No to all; returns the number of rows changed. */
export function setAllCinderChoices(rows, choice) {
  let n = 0;
  for (const r of rows ?? []) {
    const want = choice === 'yes' ? Boolean(r.ready && !r.unchanged) : false;
    if (choice === 'yes' && !want) continue;
    if (r.checked !== want) { r.checked = want; n++; }
  }
  return n;
}
/** Rows that Link would write: ticked and ready, and not two ticked rows for one Cinder. */
export function cinderConflicts(rows) {
  const by = new Map();
  for (const r of rows ?? []) if (r.checked && r.ready) (by.get(r.definitionId) ?? by.set(r.definitionId, []).get(r.definitionId)).push(r.key);
  return new Set([...by.values()].filter(k => k.length > 1).flat());
}
export const cinderWillLink = rows => (rows ?? []).filter(r => r.checked && r.ready && !cinderConflicts(rows).has(r.key)).length;

// ---------- Writing ----------
/**
 * Writes the ticked rows through Cinders' public API. Nothing is written unless the user is a GM and the API has what the row needs;
 * otherwise a clear message comes back and no call is made. A Cinder is set on every bound Cinder of that kind (each keeps its own
 * "unlocks needed" numbers when it already has stages of the same count). deps: {user, api: cindersApi()}.
 * Returns {ok, message, applied:[{name, count}], skipped:[{name, why}], errors:[{name, message}]}.
 */
export async function applyCinderArt(rows, {user, api = cindersApi()} = {}) {
  if (!isGM(user)) return {ok: false, message: GM_ONLY, applied: [], skipped: [], errors: []};
  const todo = (rows ?? []).filter(r => r?.checked && r.ready);
  if (!todo.length) return {ok: true, message: '', applied: [], skipped: [], errors: []};
  if (!api) return {ok: false, message: NO_CINDERS, applied: [], skipped: todo.map(r => ({name: r.cinderName, why: 'Cinders is not available'})), errors: []};
  const applied = [], skipped = [], errors = [];
  const blocked = cinderConflicts(todo);
  const live = new Set();
  try { for (const i of api.cinder.instances() ?? []) live.add(i.instanceId); } catch { /* handled per row */ }
  for (const row of todo) {
    if (blocked.has(row.key)) { skipped.push({name: row.cinderName, why: 'two rows are set for this Cinder'}); continue; }
    if (row.mode === 'stages' && !api.canStages) { skipped.push({name: row.cinderName, why: 'this version of Cinders cannot set art stages'}); continue; }
    if (row.mode === 'art' && !api.canArt) { skipped.push({name: row.cinderName, why: 'this version of Cinders cannot set a single image'}); continue; }
    const ids = row.instanceIds.filter(id => live.has(id));
    if (!ids.length) { skipped.push({name: row.cinderName, why: 'no longer bound to a character'}); continue; }
    let done = 0;
    for (const id of ids) {
      try {
        if (row.mode === 'art') await api.cinder.setArt(id, row.to[0].art);
        else {
          let current = null;
          try { const info = api.canRead ? api.cinder.stages(id) : null; current = info?.own ?? info?.stages ?? null; } catch { current = null; }
          const at = stageThresholds(row.to.length, current);
          await api.cinder.setArtStages(id, row.to.map((s, i) => ({art: s.art, at: at[i]})));
        }
        done++;
      } catch (error) { errors.push({name: row.cinderName, message: String(error?.message ?? error)}); }
    }
    if (done) applied.push({name: row.cinderName, count: done});
  }
  const message = `${applied.length} Cinder(s) given new art${skipped.length ? `, ${skipped.length} skipped (${[...new Set(skipped.map(s => s.why))].join('; ')})` : ''}${errors.length ? `, ${errors.length} write error(s): ${errors[0].message}` : ''}`;
  return {ok: !errors.length || applied.length > 0, message, applied, skipped, errors};
}
