/**
 * Back up world to GitHub (0.86.0): writes the GM's current content state, as pretty JSON, to a branch of a PRIVATE GitHub
 * repository, so it can be read from GitHub without pasting exports. GM only: every exported function checks the user itself
 * (hiding the button is not the guard).
 *
 *  - The write token is a CLIENT-scope setting (this browser only; a world setting is readable by every player). It is
 *    separate from the read-only Pull token, is sent to https://api.github.com only, is never logged, never put in an
 *    error or a notification, and is shown back only masked.
 *  - Nothing in the world is modified by a backup. The only thing remembered is "last backed up", on this device.
 *  - Before any write the repository is read: it must be private (play state never goes to a public repository) and the
 *    target branch must not be the repository's default branch.
 *  - One commit holds every file (Git Data API: tree on top of the branch's tree, commit, move the branch). A failure at any
 *    step leaves the branch as it was; a new branch is only created at the very end, pointing at the finished commit.
 *  - Which types are backed up is the GM's choice (0.87.0). A type left out is not written and is not removed from the branch:
 *    the commit is a tree on top of the branch's tree that replaces only the files that were written, so earlier files stay.
 *  - Each content file is in the format the content pack's reconcile script reads: Quests are Quest Log's own Export JSON
 *    (`ag-quest-source/0.1`), Factions and deities are Renown's own Export (`ag-factions-source-export/0.4`), Locations and
 *    Shops are their modules' export packages, and edited records are Manager's `ag-world-edits/0.1` bundle.
 *  - Renown standings (0.90.0, `standings.json`) are PLAY STATE, not content: Renown's `api.exportState()` in its own schema
 *    `ag-factions-state-export/0.1`, which the reconcile script does not read (it lists and skips unknown formats).
 *  - Each module's data comes from its public api (`game.modules.get(id)?.api`), feature-detected. A module that is missing,
 *    inactive or has no such api is skipped with a reason; nothing reaches into another module's internals.
 *
 * `store` is {get(name), set(name, value)} over client-scope settings; `fetch` defaults to the browser's.
 */
import {parseRepo, parseBranch, encodePath, isSha, maskToken, cleanToken, tokenProblem, scrub, mapGithubError} from './github-paths.js';
import {scanWorldEdits, buildEditsFile, EDIT_TYPES} from './world-edits.js';

export const GITHUB_API = 'https://api.github.com';
export const API_VERSION = '2022-11-28';
export const JSON_ACCEPT = 'application/vnd.github+json';
/** Settings (all client scope), registered by main.js. */
export const BACKUP_SETTINGS = Object.freeze({token: 'backupToken', config: 'backupConfig', last: 'backupLast', types: 'backupTypes'});
export const DEFAULT_REPO = 'robbmcgaw/ashen-gate-supplement';
export const DEFAULT_BRANCH = 'world-backup';
export const FOLDER = 'world-backup';
/** Branches that are never a backup target, whatever the repository calls its default. */
export const PROTECTED_BRANCHES = Object.freeze(['main', 'master']);
export const GM_ONLY = 'Only a GM can back up the world to GitHub.';
export const MAX_TOTAL_BYTES = 40_000_000;

const isGM = user => Boolean(user?.isGM);
const denied = extra => ({ok: false, message: GM_ONLY, ...extra});

class BackupError extends Error {
  constructor(message, kind = 'other') { super(message); this.kind = kind; }
}

// ---------- Settings (client scope) ----------
const readStore = (store, name, fallback) => { try { return store?.get?.(BACKUP_SETTINGS[name]) ?? fallback; } catch { return fallback; } };

/** Repository and branch with their defaults. */
export function loadBackupConfig(user, {store} = {}) {
  if (!isGM(user)) return denied({config: {repo: DEFAULT_REPO, branch: DEFAULT_BRANCH}});
  const c = readStore(store, 'config', {}) ?? {};
  return {ok: true, config: {repo: String(c.repo ?? '').trim() || DEFAULT_REPO, branch: String(c.branch ?? '').trim() || DEFAULT_BRANCH}};
}

/** Whether a write token is kept on this device, and how it ends. The token itself is never returned. */
export function backupTokenStatus(user, {store} = {}) {
  if (!isGM(user)) return denied({saved: false, masked: ''});
  const token = String(readStore(store, 'token', '') ?? '');
  return {ok: true, saved: Boolean(token), masked: maskToken(token)};
}

/** Checks the backup settings form without saving anything. */
export function checkBackupInput(input = {}) {
  const repo = parseRepo(String(input.repo ?? '').trim() || DEFAULT_REPO);
  if (!repo.ok) return repo;
  const branch = parseBranch(String(input.branch ?? '').trim() || DEFAULT_BRANCH);
  if (!branch.ok) return branch;
  if (PROTECTED_BRANCHES.includes(branch.branch.toLowerCase()))
    return {ok: false, message: `The backup branch cannot be ${branch.branch}. Use a branch of its own, for example ${DEFAULT_BRANCH}.`};
  return {ok: true, repo, config: {repo: repo.repo, branch: branch.branch}};
}

/**
 * Saves the GM Setup values: repository and branch, and the token only when one was typed (an empty box leaves the saved
 * token alone). Nothing is saved if any value is refused. Returns {ok, message, saved:[labels]}.
 */
export async function saveBackupSettings(user, {store, input} = {}) {
  if (!isGM(user)) return denied({saved: []});
  const checked = checkBackupInput(input);
  if (!checked.ok) return {ok: false, saved: [], message: checked.message};
  const typed = String(input?.token ?? '').trim();
  let token = '';
  if (typed) {
    const problem = tokenProblem(typed);
    if (problem) return {ok: false, saved: [], message: problem};
    token = cleanToken(typed);
  }
  const saved = [];
  const before = loadBackupConfig(user, {store}).config;
  if (before.repo !== checked.config.repo || before.branch !== checked.config.branch) {
    await store.set(BACKUP_SETTINGS.config, checked.config);
    saved.push('backup repository and branch');
  }
  if (token) { await store.set(BACKUP_SETTINGS.token, token); saved.push('backup token'); }
  return {ok: true, saved, message: saved.length ? `Saved: ${saved.join(' and ')}.` : 'Nothing had changed.'};
}

export async function clearBackupToken(user, {store} = {}) {
  if (!isGM(user)) return denied();
  await store.set(BACKUP_SETTINGS.token, '');
  return {ok: true, message: 'Backup token removed from this device.', saved: false, masked: ''};
}

// ---------- What to back up (this device) ----------
/** The types the GM can tick. The first five come from Manager's edits bundle (one file); the rest are one file each. */
export const BACKUP_TYPES = Object.freeze([
  {id: 'Item', label: 'Edited Items', source: 'manager'},
  {id: 'JournalEntry', label: 'Edited Journals', source: 'manager'},
  {id: 'Actor', label: 'Edited Actors', source: 'manager'},
  {id: 'RollTable', label: 'Edited Roll Tables', source: 'manager'},
  {id: 'Macro', label: 'Edited Macros', source: 'manager'},
  {id: 'locations', label: 'Locations', source: 'locations'},
  {id: 'quests', label: 'Quests, Orders and Contracts', source: 'quests'},
  {id: 'factions', label: 'Factions and deities', source: 'factions'},
  {id: 'shops', label: 'Shops', source: 'shops'},
  {id: 'standings', label: 'Renown standings and claims', source: 'standings'}
]);
export const ALL_TYPE_IDS = Object.freeze(BACKUP_TYPES.map(t => t.id));
/** The types that existed before 0.90.0. A selection remembered before then did not know the newer ones, so they start ticked. */
const LEGACY_TYPE_IDS = Object.freeze(ALL_TYPE_IDS.filter(id => id !== 'standings'));
const cleanSelection = list => ALL_TYPE_IDS.filter(id => Array.isArray(list) && list.includes(id));

/** The types ticked last time on this device; every type when nothing was remembered. */
export function loadBackupSelection(user, {store} = {}) {
  if (!isGM(user)) return denied({selection: [...ALL_TYPE_IDS]});
  const stored = readStore(store, 'types', {}) ?? {};
  if (!Array.isArray(stored.types)) return {ok: true, selection: [...ALL_TYPE_IDS]};
  // A type added after this choice was saved (not in `seen`) is new to the GM: ticked by default, until they untick it once.
  const seen = Array.isArray(stored.seen) ? stored.seen : LEGACY_TYPE_IDS;
  return {ok: true, selection: ALL_TYPE_IDS.filter(id => stored.types.includes(id) || !seen.includes(id))};
}
/** Remembers the selection on this device only (a client setting). Unknown ids are dropped. */
export async function saveBackupSelection(user, {store, selection} = {}) {
  if (!isGM(user)) return denied();
  const types = cleanSelection(selection);
  try { await store.set(BACKUP_SETTINGS.types, {types, seen: [...ALL_TYPE_IDS]}); } catch { return {ok: false, message: 'Your choice could not be remembered on this device.'}; }
  return {ok: true, selection: types};
}

// ---------- Last backed up (this device) ----------
export function lastBackup(user, {store} = {}) {
  if (!isGM(user)) return null;
  const at = Number((readStore(store, 'last', {}) ?? {}).at);
  return Number.isFinite(at) && at > 0 ? at : null;
}
/** "just now", "5 minutes ago", "yesterday"... for the line under the button. */
export function relativeLabel(at, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// ---------- What is sent ----------
const encoder = new TextEncoder();
const pretty = data => `${JSON.stringify(data, null, 2)}\n`;
const activeApi = (game, id) => { const mod = game?.modules?.get?.(id); return {mod, api: mod?.active ? (mod.api ?? null) : null}; };
const fn = (api, ...path) => { let at = api; for (const key of path) at = at?.[key]; return typeof at === 'function' ? at : null; };

/**
 * The files of a backup, in order. `ids` are the type ids a file serves. `build(game, now, found, picked)` returns
 * {data, counts?} or throws `Skip(reason)`.
 */
class Skip extends Error {}
const SOURCES = [
  {id: 'manager', ids: EDIT_TYPES, path: 'manager-edits.json', label: 'Edited records (General Manager)',
    build: (game, now, found, picked) => {
      const scan = scanWorldEdits(game, {types: picked, includeUnchanged: false, includeWorldOnly: true});
      return {data: buildEditsFile(game, scan, {now}).file, counts: scan.counts};
    }},
  {id: 'locations', ids: ['locations'], path: 'locations.json', label: 'Locations', module: 'ashen-gate-locations',
    build: (game, now, {api}) => {
      const exportPackage = fn(api, 'exportPackage');
      if (!exportPackage) throw new Skip('this version of Locations has no export');
      return {data: exportPackage.call(api)};
    }},
  // Quest Log's Export JSON (ag-quest-source/0.1): every quest, order and contract, definitions only.
  {id: 'quests', ids: ['quests'], path: 'quests.json', label: 'Quests, Orders and Contracts (Quest Log)', module: 'ashen-gate-quest-manager',
    build: (game, now, {api}) => {
      const exportSource = fn(api, 'exportSource');
      if (!exportSource) throw new Skip('this version of Quest Log has no source export; update Quest Log');
      return {data: exportSource.call(api)};
    }},
  // Renown's Export (ag-factions-source-export/0.4): faction and deity definitions, no standings.
  {id: 'factions', ids: ['factions'], path: 'factions.json', label: 'Factions and deities (Renown), definitions only',
    module: 'ashen-gate-factions',
    note: 'Definitions only; standings are a separate type.',
    build: (game, now, {api}) => {
      const exportDefinitions = fn(api, 'exportDefinitions');
      if (!exportDefinitions) throw new Skip('this version of Renown has no definitions export; update Renown');
      return {data: exportDefinitions.call(api)};
    }},
  {id: 'shops', ids: ['shops'], path: 'shops.json', label: 'Shops (Utilities)', module: 'ashen-gate-utilities',
    build: (game, now, {api}) => {
      const exportShops = fn(api, 'shops', 'exportShops');
      if (!exportShops) throw new Skip('this version of Utilities has no shop export');
      return {data: exportShops.call(api.shops)};
    }},
  // Renown's play state (ag-factions-state-export/0.1): standings, claims, requests, reveals, membership, Vows. Not content.
  {id: 'standings', ids: ['standings'], path: 'standings.json', label: 'Renown standings and claims (Renown), play state',
    module: 'ashen-gate-factions',
    note: 'Play state, not content.',
    build: (game, now, {api}) => {
      const exportState = fn(api, 'exportState');
      if (!exportState) throw new Skip('this version of Renown has no standings export; update Renown');
      return {data: exportState.call(api)};
    }}
];
const labelOf = id => BACKUP_TYPES.find(t => t.id === id)?.label ?? id;

/**
 * Gathers the files a backup would send for the ticked types (`selection`: type ids; every type when omitted). Read-only. GM only.
 * A type that is not ticked is not read and not listed. Returns
 * {ok, files:[{path, label, bytes, text, note, types}], skipped:[{label, reason}], types:[{id, label, path, available, reason?, bytes?, edited?, notFromPack?}], bytes}
 * or {ok:false, message}.
 */
export function collectBackup(game, {now = new Date(), selection} = {}) {
  if (!isGM(game?.user)) return denied({files: [], skipped: [], types: []});
  const chosen = new Set(selection === undefined ? ALL_TYPE_IDS : cleanSelection(selection));
  const files = [], skipped = [], types = [];
  for (const source of SOURCES) {
    const picked = source.ids.filter(id => chosen.has(id));
    if (!picked.length) continue;
    const rows = reason => picked.map(id => ({id, label: labelOf(id), path: `${FOLDER}/${source.path}`, available: false, reason}));
    const found = source.module ? activeApi(game, source.module) : {api: null};
    if (source.module && !found.mod) { skipped.push({label: source.label, reason: 'the module is not installed'}); types.push(...rows('the module is not installed')); continue; }
    if (source.module && !found.mod.active) { skipped.push({label: source.label, reason: 'the module is not active in this world'}); types.push(...rows('the module is not active in this world')); continue; }
    if (source.module && !found.api) { skipped.push({label: source.label, reason: 'this version of the module has no export'}); types.push(...rows('this version of the module has no export')); continue; }
    try {
      const out = source.build(game, now, found, picked);
      const text = pretty(out.data);
      const bytes = encoder.encode(text).length, path = `${FOLDER}/${source.path}`;
      files.push({path, label: source.label, bytes, text, types: picked, ...(source.note ? {note: source.note} : {})});
      for (const id of picked) {
        const c = out.counts?.[id];
        types.push({id, label: labelOf(id), path, available: true, ...(c ? {edited: c.edited, notFromPack: c.worldOnly} : {bytes})});
      }
    } catch (error) {
      const reason = error instanceof Skip ? error.message : 'it could not be read just now';
      skipped.push({label: source.label, reason});
      types.push(...rows(reason));
    }
  }
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  if (!files.length) return {ok: false, files, skipped, types, bytes, message: chosen.size ? 'There is nothing to back up: no ticked type gave any data.' : 'Tick at least one type to back up.'};
  if (bytes > MAX_TOTAL_BYTES) return {ok: false, files, skipped, types, bytes, message: 'The backup is too large to send in one commit.'};
  return {ok: true, files, skipped, types, bytes};
}

// ---------- GitHub requests ----------
function writeErrorMessage(status, {headers, bodyText = '', what, step}) {
  const lower = String(bodyText).toLowerCase();
  const base = mapGithubError(status, {headers, bodyText, what});
  if (status === 401) return {kind: 'token', message: 'GitHub did not accept the backup token. It may have expired or been revoked. Make a new token on GitHub, then save it in GM Setup.'};
  if (base.kind === 'rate') return {kind: 'rate', message: base.message};
  if (status === 403) return {kind: 'access', message: /not accessible|permission/.test(lower) || step !== 'repo'
    ? 'The token is not allowed to write to that repository. Make a fine-grained token for this repository only, with Contents set to Read and write, and save it in GM Setup.'
    : 'The token is not allowed to use that repository. Check that it was made for this repository and has not expired.'};
  if (status === 404) return {kind: 'missing', message: step === 'repo'
    ? `GitHub cannot find ${what}, or the token was not granted that repository. Check the name in GM Setup, and that the token was made for this repository.`
    : 'GitHub could not find the repository or branch while writing. The token may lack Contents Read and write for this repository.'};
  if (status === 409) return {kind: 'conflict', message: 'GitHub could not take the backup: the repository is empty or the branch changed while the backup ran. Try again.'};
  if (status === 422) return {kind: 'refused', message: 'GitHub refused the backup (error 422). The branch may have changed while it ran, or a branch rule blocks the write. Try again, or choose another backup branch in GM Setup.'};
  return base;
}

async function call(ctx, method, path, {body, what, step} = {}) {
  if (!ctx.fetch) throw new BackupError('This browser cannot reach GitHub from here.', 'network');
  let res;
  try {
    res = await ctx.fetch(`${GITHUB_API}${path}`, {
      method, mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: {Accept: JSON_ACCEPT, Authorization: `Bearer ${ctx.token}`, 'X-GitHub-Api-Version': API_VERSION, ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
  } catch {
    throw new BackupError('Could not reach GitHub. Check your connection and try again. Nothing was written.', 'network');
  }
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = (await res.text()).slice(0, 400); } catch { /* the status is enough */ }
    const mapped = writeErrorMessage(res.status, {headers: res.headers, bodyText, what, step});
    const error = new BackupError(scrub(mapped.message, ctx.token), mapped.kind);
    error.status = res.status;
    throw error;
  }
  try { return await res.json(); } catch { throw new BackupError('GitHub sent an answer that could not be read. Try again.', 'other'); }
}

const two = n => String(n).padStart(2, '0');
/** "World backup 2026-10-30 14:05" in the GM's local time. */
export const commitMessage = (now = new Date()) =>
  `World backup ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}`;

/** Where the confirmation and the run send things: {repo, branch}, or a plain reason. Network is not touched. */
export function backupTarget(user, {store} = {}) {
  if (!isGM(user)) return denied();
  const loaded = loadBackupConfig(user, {store});
  const checked = checkBackupInput(loaded.config);
  if (!checked.ok) return checked;
  return {ok: true, repo: checked.repo, config: checked.config};
}

/**
 * Sends `plan.files` (from collectBackup) as one commit. Safety checks come first and stop everything: the repository must be
 * private and the branch must not be its default branch. Returns {ok:true, branch, commitUrl, created, unchanged, count} or
 * {ok:false, kind, message}. Never throws; no message holds the token.
 */
export async function runBackup(game, {store, fetch: fetchImpl, plan, now = new Date()} = {}) {
  if (!isGM(game?.user)) return denied();
  const target = backupTarget(game.user, {store});
  if (!target.ok) return {...target, kind: 'settings'};
  const token = String(readStore(store, 'token', '') ?? '');
  if (!token) return {ok: false, kind: 'token', message: 'Save a backup token first (GM Setup, World backup).'};
  const files = plan?.files;
  if (!plan?.ok || !Array.isArray(files) || !files.length) return {ok: false, kind: 'plan', message: plan?.message ?? 'There is nothing to back up.'};
  const {owner, name} = target.repo, repoName = target.config.repo, branch = target.config.branch;
  const ctx = {token, fetch: fetchImpl ?? globalThis.fetch?.bind(globalThis)};
  const base = `/repos/${owner}/${name}`;
  try {
    const repo = await call(ctx, 'GET', base, {what: repoName, step: 'repo'});
    if (repo?.private !== true)
      return {ok: false, kind: 'public', message: `Backup stopped: ${repoName} is not a private repository, and a backup holds play state (reveals, notes and standings). Nothing was sent. Use a private repository.`};
    const defaultBranch = String(repo.default_branch ?? '');
    if (!defaultBranch || branch === defaultBranch || PROTECTED_BRANCHES.includes(branch.toLowerCase()))
      return {ok: false, kind: 'default-branch', message: `Backup stopped: ${branch} is the default branch of ${repoName}. A backup never writes there. Choose a branch of its own in GM Setup. Nothing was sent.`};
    if (repo.permissions && repo.permissions.push === false)
      return {ok: false, kind: 'access', message: 'The token cannot write to that repository. Make a fine-grained token for this repository only, with Contents set to Read and write, and save it in GM Setup. Nothing was sent.'};

    let created = false, parent;
    try {
      const ref = await call(ctx, 'GET', `${base}/git/ref/heads/${encodePath(branch)}`, {step: 'ref'});
      parent = ref?.object?.sha;
    } catch (error) {
      if (!(error instanceof BackupError) || error.status !== 404) throw error;
      const from = await call(ctx, 'GET', `${base}/git/ref/heads/${encodePath(defaultBranch)}`, {step: 'ref'});
      parent = from?.object?.sha;
      created = true;
    }
    if (!isSha(parent)) throw new BackupError('GitHub sent an unexpected answer for the branch. Try again.', 'other');
    const parentCommit = await call(ctx, 'GET', `${base}/git/commits/${parent}`, {step: 'commit'});
    const baseTree = parentCommit?.tree?.sha;
    if (!isSha(baseTree)) throw new BackupError('GitHub sent an unexpected answer for the branch. Try again.', 'other');
    // A tree on top of the branch's tree replaces these paths and leaves everything else alone; no blob sha is needed.
    const tree = await call(ctx, 'POST', `${base}/git/trees`, {step: 'tree', body: {base_tree: baseTree,
      tree: files.map(f => ({path: f.path, mode: '100644', type: 'blob', content: f.text}))}});
    if (!created && tree?.sha === baseTree)
      return {ok: true, unchanged: true, created: false, branch, count: files.length, message: `Nothing has changed since the last backup on ${branch}, so nothing was sent.`};
    const commit = await call(ctx, 'POST', `${base}/git/commits`, {step: 'commit', body: {message: commitMessage(now), tree: tree?.sha, parents: [parent]}});
    if (!isSha(commit?.sha)) throw new BackupError('GitHub sent an unexpected answer for the commit. Try again.', 'other');
    if (created) await call(ctx, 'POST', `${base}/git/refs`, {step: 'ref', body: {ref: `refs/heads/${branch}`, sha: commit.sha}});
    else await call(ctx, 'PATCH', `${base}/git/refs/heads/${encodePath(branch)}`, {step: 'ref', body: {sha: commit.sha, force: false}});
    const commitUrl = typeof commit.html_url === 'string' && commit.html_url.startsWith('https://github.com/') ? commit.html_url : `https://github.com/${owner}/${name}/commit/${commit.sha}`;
    try { await store.set(BACKUP_SETTINGS.last, {at: now.getTime()}); } catch { /* the label is a convenience */ }
    return {ok: true, created, unchanged: false, branch, commitUrl, count: files.length,
      message: `Backed up ${files.length} file${files.length === 1 ? '' : 's'} to the ${branch} branch${created ? ' (new branch)' : ''}.`};
  } catch (error) {
    if (error instanceof BackupError) return {ok: false, kind: error.kind, message: scrub(error.message, token)};
    return {ok: false, kind: 'other', message: 'The backup could not be completed. Nothing in your world changed.'};
  }
}
