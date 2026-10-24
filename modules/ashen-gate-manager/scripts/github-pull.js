/**
 * Pull from GitHub (0.59.0): reads a content pack from a GitHub repository the GM names, through the GitHub REST API, and
 * hands the files to Sync from package as if the GM had chosen them. GM only: every exported function checks the user
 * itself (hiding the section is not the guard). Reading never writes to the world.
 *
 *  - The token lives in a CLIENT-scope setting (this browser only; a world setting is readable by every player) and is
 *    sent to https://api.github.com only. It is never logged, never put in an error, and shown back only masked.
 *  - Nothing is read until the GM presses a button: no request is made at startup.
 *  - Every file is read at one commit, so a push in the middle of a pull cannot mix two versions of a pack.
 *  - If any file of a pull cannot be read, nothing is handed on: Sync treats "not in the files" as "delete", so a partly
 *    read pack must never reach it.
 *
 * `store` is {get(name), set(name, value)} over client-scope settings; `fetch` defaults to the browser's.
 */
import {
  validateConfig, encodePath, isSha, baseOf, readManifest, looksLikeManifest, mapGithubError, isTooLarge, maskToken, tokenProblem, scrub
} from './github-paths.js';

export const GITHUB_API = 'https://api.github.com';
export const API_VERSION = '2022-11-28';
export const RAW_ACCEPT = 'application/vnd.github.raw+json';
export const JSON_ACCEPT = 'application/vnd.github+json';
export const SHA_ACCEPT = 'application/vnd.github.sha';
/** Settings (all client scope), registered by main.js. */
export const GITHUB_SETTINGS = Object.freeze({token: 'githubToken', config: 'githubConfig', state: 'githubPullState'});
/** Above this size a file is read through the git blobs API (the contents API stops returning bodies near 1 MB). */
export const BLOB_THRESHOLD = 1_000_000;
export const MAX_FILE_BYTES = 10_000_000;
export const MAX_FILES = 150;
export const MAX_MANIFESTS = 12;
export const CONCURRENCY = 4;
export const GM_ONLY = 'Only a GM can pull from GitHub.';
/** The schema a Profession Ledger gathering node file carries; those files belong to the Ledger's own import. */
export const LEDGER_SCHEMA = /^ag-gathering-nodes\//;

const isGM = user => Boolean(user?.isGM);
const denied = extra => ({ok: false, message: GM_ONLY, ...extra});

class PullError extends Error {
  constructor(message, kind = 'other') { super(message); this.kind = kind; }
}
const cancelled = () => new PullError('Cancelled. Nothing in your world changed.', 'cancelled');

// ---------- Settings (client scope) ----------
const readStore = (store, name, fallback) => { try { return store?.get?.(GITHUB_SETTINGS[name]) ?? fallback; } catch { return fallback; } };

/** The saved repository, branch and paths; nothing is prefilled. */
export function loadConfig(user, {store} = {}) {
  if (!isGM(user)) return denied({config: {repo: '', branch: 'main', paths: []}});
  const c = readStore(store, 'config', {});
  return {ok: true, config: {repo: String(c.repo ?? ''), branch: String(c.branch ?? '') || 'main', paths: Array.isArray(c.paths) ? c.paths.map(String) : []}};
}

/** Validates and saves the form. A bad value is refused with a plain message and nothing is saved. */
export async function saveConfig(user, {store, input} = {}) {
  if (!isGM(user)) return denied();
  const checked = validateConfig(input);
  if (!checked.ok) return checked;
  await store.set(GITHUB_SETTINGS.config, checked.config);
  return {ok: true, config: checked.config};
}

/** Whether a token is kept on this device, and how it ends. The token itself is never returned. */
export function tokenStatus(user, {store} = {}) {
  if (!isGM(user)) return denied({saved: false, masked: ''});
  const token = String(readStore(store, 'token', '') ?? '');
  return {ok: true, saved: Boolean(token), masked: maskToken(token)};
}

export async function saveToken(user, {store, token} = {}) {
  if (!isGM(user)) return denied();
  const problem = tokenProblem(token);
  if (problem) return {ok: false, message: problem};
  await store.set(GITHUB_SETTINGS.token, String(token).trim());
  return {ok: true, message: 'Token saved on this device only.', ...tokenStatus(user, {store})};
}

export async function removeToken(user, {store} = {}) {
  if (!isGM(user)) return denied();
  await store.set(GITHUB_SETTINGS.token, '');
  return {ok: true, message: 'Token removed from this device.', saved: false, masked: ''};
}

// ---------- Requests ----------
function makeContext(user, {store, fetch: fetchImpl, signal} = {}) {
  const token = String(readStore(store, 'token', '') ?? '');
  const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  return {token, fetch: f, signal};
}

/** One GET to api.github.com. The Authorization header is attached to nothing else. */
async function request(ctx, path, accept, what) {
  if (!ctx.token) throw new PullError('Save a GitHub token first (Settings, Token).', 'token');
  if (!ctx.fetch) throw new PullError('This browser cannot reach GitHub from here.', 'network');
  if (ctx.signal?.aborted) throw cancelled();
  const url = `${GITHUB_API}${path}`;
  let res;
  try {
    res = await ctx.fetch(url, {
      method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctx.signal,
      headers: {Accept: accept, Authorization: `Bearer ${ctx.token}`, 'X-GitHub-Api-Version': API_VERSION}
    });
  } catch (error) {
    if (error?.name === 'AbortError' || ctx.signal?.aborted) throw cancelled();
    throw new PullError('Could not reach GitHub. Check your connection and try again.', 'network');
  }
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = (await res.text()).slice(0, 400); } catch { /* the status is enough */ }
    const mapped = mapGithubError(res.status, {headers: res.headers, bodyText, what});
    const error = new PullError(scrub(mapped.message, ctx.token), mapped.kind);
    error.status = res.status;
    error.tooLarge = isTooLarge(res.status, bodyText);
    throw error;
  }
  return res;
}

const refQuery = ref => `?ref=${encodeURIComponent(ref)}`;

async function branchCommit(ctx, repo, branch) {
  const res = await request(ctx, `/repos/${repo.owner}/${repo.name}/commits/${encodePath(branch)}`, SHA_ACCEPT, `the branch "${branch}"`);
  const sha = (await res.text()).trim();
  if (!isSha(sha)) throw new PullError('GitHub sent an unexpected answer for the branch. Try again.', 'other');
  return sha;
}

/** Every file of the commit: Map path → {sha, size}. A repository too large to list in one answer is refused plainly. */
async function commitTree(ctx, repo, commit) {
  const res = await request(ctx, `/repos/${repo.owner}/${repo.name}/git/trees/${commit}?recursive=1`, JSON_ACCEPT, 'the repository contents');
  const data = await res.json();
  if (data?.truncated) throw new PullError('This repository is too large for GitHub to list in one request. Use a smaller repository (or a branch with fewer files) for packs.', 'other');
  const entries = new Map();
  for (const e of Array.isArray(data?.tree) ? data.tree : []) if (e?.type === 'blob' && typeof e.path === 'string' && isSha(e.sha)) entries.set(e.path, {sha: e.sha, size: Number(e.size) || 0});
  return entries;
}

/** One file's text, exactly as GitHub holds it. Large files go through the blobs API. */
async function fileText(ctx, repo, commit, path, entry) {
  const blob = () => request(ctx, `/repos/${repo.owner}/${repo.name}/git/blobs/${entry.sha}`, RAW_ACCEPT, path);
  let res;
  if (entry.size > BLOB_THRESHOLD) res = await blob();
  else {
    try { res = await request(ctx, `/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}${refQuery(commit)}`, RAW_ACCEPT, path); }
    catch (error) { if (error.tooLarge) res = await blob(); else throw error; }
  }
  return res.text();
}

async function pool(items, limit, worker, signal) {
  let next = 0;
  const run = async () => { while (next < items.length && !signal?.aborted) { const item = items[next++]; await worker(item); } };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, run));
}

/** The configured paths → manifest candidates in the tree. A path ending .json is a manifest; any other is a folder to search. */
function candidateManifests(entries, paths) {
  const found = [], problems = [];
  for (const path of paths) {
    if (/\.json$/i.test(path)) {
      if (entries.has(path)) found.push(path); else problems.push(`${path} was not found on that branch.`);
      continue;
    }
    const prefix = `${path}/`;
    const inside = [...entries.keys()].filter(p => p.startsWith(prefix));
    if (!inside.length) { problems.push(`The folder ${path} was not found on that branch.`); continue; }
    const manifests = inside.filter(looksLikeManifest).sort();
    if (!manifests.length) problems.push(`No manifest file (a .json with "manifest" in its name) was found in ${path}.`);
    found.push(...manifests);
  }
  return {found: [...new Set(found)], problems};
}

/** Reads each candidate and keeps the real pack manifests, with their files and blob SHAs. */
async function resolvePacks(ctx, repo, commit, entries, manifests, onlyPaths) {
  const packs = [], notes = [];
  const wanted = onlyPaths ? manifests.filter(p => onlyPaths.includes(p)) : manifests;
  const bodies = new Map();
  await pool(wanted.slice(0, MAX_MANIFESTS), CONCURRENCY, async path => {
    bodies.set(path, await fileText(ctx, repo, commit, path, entries.get(path)));
  }, ctx.signal);
  if (ctx.signal?.aborted) throw cancelled();
  for (const path of wanted.slice(0, MAX_MANIFESTS)) {
    const manifest = readManifest(bodies.get(path), path);
    if (!manifest.ok) { notes.push(`${path} ${manifest.message}`); continue; }
    const files = manifest.files.map(p => ({path: p, sha: entries.get(p)?.sha ?? null, size: entries.get(p)?.size ?? 0, missing: !entries.has(p)}));
    if (manifest.invalid.length) notes.push(`${path} lists ${manifest.invalid.length} entr${manifest.invalid.length === 1 ? 'y' : 'ies'} that are not paths inside the repository (${manifest.invalid.slice(0, 3).join(', ')}).`);
    packs.push({id: path, manifestPath: path, manifestSha: entries.get(path).sha, label: manifest.label, files, invalid: manifest.invalid.length});
  }
  if (manifests.length > MAX_MANIFESTS) notes.push(`Only the first ${MAX_MANIFESTS} manifests are read. Narrow the path to see the others.`);
  return {packs, notes};
}

function fail(error) {
  if (error instanceof PullError) return {ok: false, message: error.message, kind: error.kind, cancelled: error.kind === 'cancelled'};
  return {ok: false, message: 'Something went wrong talking to GitHub. Nothing in your world changed.', kind: 'other'};
}

const checkInput = input => {
  const checked = validateConfig(input);
  if (!checked.ok) return checked;
  return {ok: true, repo: {owner: checked.owner, name: checked.name}, config: checked.config};
};

/**
 * Find the packs: the manifests under the saved paths, each with the files it lists. Reads the branch, the file list and
 * the manifests only (no pack file). → {ok, commit, packs:[{id, manifestPath, label, files:[{path, sha, size, missing}]}], notes}
 */
export async function findPacks(user, {store, fetch, signal, config} = {}) {
  if (!isGM(user)) return denied({packs: []});
  try {
    const input = checkInput(config ?? loadConfig(user, {store}).config);
    if (!input.ok) return input;
    const ctx = makeContext(user, {store, fetch, signal});
    const commit = await branchCommit(ctx, input.repo, input.config.branch);
    const entries = await commitTree(ctx, input.repo, commit);
    const {found, problems} = candidateManifests(entries, input.config.paths);
    const {packs, notes} = await resolvePacks(ctx, input.repo, commit, entries, found);
    const all = [...problems, ...notes];
    if (!packs.length) return {ok: false, message: all[0] ?? 'No pack manifest was found.', notes: all, commit, packs: []};
    return {ok: true, commit, packs, notes: all};
  } catch (error) { return {...fail(error), packs: []}; }
}

/**
 * Pull the chosen packs (by manifest path): every listed file, in manifest order, at one commit, four at a time.
 * onProgress({path, status, done, total}) with status waiting | reading | done | failed | ledger | skipped.
 * → {ok, commit, files:[{path, pack, body, size, sha, ledger}], failed:[{path, message}], notes, state}
 * `state` is what to remember for Check for updates (see recordPull); `ok` is false if any file could not be read.
 */
export async function pullPacks(user, {store, fetch, signal, config, manifestPaths, onProgress = () => {}, concurrency = CONCURRENCY} = {}) {
  if (!isGM(user)) return denied({files: [], failed: []});
  const controller = new AbortController();
  const relay = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener?.('abort', relay);
  try {
    const input = checkInput(config ?? loadConfig(user, {store}).config);
    if (!input.ok) return {...input, files: [], failed: []};
    if (!manifestPaths?.length) return {ok: false, message: 'Tick at least one pack to pull.', files: [], failed: []};
    const ctx = makeContext(user, {store, fetch, signal: controller.signal});
    const commit = await branchCommit(ctx, input.repo, input.config.branch);
    const entries = await commitTree(ctx, input.repo, commit);
    const {packs, notes} = await resolvePacks(ctx, input.repo, commit, entries, manifestPaths.filter(p => entries.has(p)), manifestPaths);
    const missingPacks = manifestPaths.filter(p => !packs.some(pk => pk.id === p));
    if (missingPacks.length) return {ok: false, message: notes[0] ?? `${missingPacks[0]} is no longer a pack manifest on that branch. Find packs again.`, notes, files: [], failed: []};

    const jobs = [], seen = new Set(), failed = [];
    for (const pack of packs) for (const f of pack.files) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      if (f.missing) failed.push({path: f.path, message: `${f.path} is listed in the manifest but is not in the repository.`});
      else jobs.push({...f, pack: pack.id});
    }
    if (jobs.length + failed.length > MAX_FILES) return {ok: false, message: `These packs list ${jobs.length + failed.length} files; one pull handles at most ${MAX_FILES}. Pull the packs separately.`, files: [], failed: []};
    const total = jobs.length;
    let done = 0;
    const bodies = new Map(), skipped = [];
    let stop = null;
    const emit = (path, status) => onProgress({path, status, done, total});
    for (const f of failed) { emit(f.path, 'failed'); }
    jobs.forEach(j => emit(j.path, 'waiting'));
    await pool(jobs, Math.max(1, Math.min(concurrency, CONCURRENCY)), async job => {
      if (controller.signal.aborted) return;
      if (!/\.json$/i.test(job.path)) { skipped.push(job.path); done++; emit(job.path, 'skipped'); return; }
      if (job.size > MAX_FILE_BYTES) { failed.push({path: job.path, message: `${job.path} is larger than 10 MB, the limit for a package file.`}); done++; emit(job.path, 'failed'); return; }
      emit(job.path, 'reading');
      try { bodies.set(job.path, await fileText(ctx, input.repo, commit, job.path, job)); done++; emit(job.path, 'done'); }
      catch (error) {
        if (error.kind === 'cancelled' || controller.signal.aborted) { return; }
        done++; failed.push({path: job.path, message: `${job.path}: ${error.message}`}); emit(job.path, 'failed');
        // A bad token, no access or a rate limit would fail every remaining file the same way: stop now, say it once.
        if (['token', 'access', 'rate', 'network'].includes(error.kind)) { stop = error; controller.abort(); }
      }
    }, controller.signal);
    if (stop) return {ok: false, message: stop.message, kind: stop.kind, files: [], failed, notes};
    if (signal?.aborted) return {ok: false, cancelled: true, message: 'Cancelled. Nothing in your world changed.', files: [], failed: [], notes};

    const files = [];
    for (const job of jobs) {
      const body = bodies.get(job.path);
      if (body === undefined) continue;
      let ledger = false;
      try { ledger = LEDGER_SCHEMA.test(String(JSON.parse(body)?.schema ?? '')); }
      catch { failed.push({path: job.path, message: `${job.path} is not valid JSON.`}); emit(job.path, 'failed'); continue; }
      if (ledger) emit(job.path, 'ledger');
      files.push({path: job.path, pack: job.pack, body, size: job.size, sha: job.sha, ledger});
    }
    const state = {commit, at: new Date().toISOString(), packs: Object.fromEntries(packs.map(p => [p.id, {
      label: p.label, manifestSha: p.manifestSha, files: Object.fromEntries(p.files.filter(f => f.sha).map(f => [f.path, f.sha]))
    }]))};
    const result = {commit, files, failed, notes: [...notes, ...(skipped.length ? [`${skipped.length} listed file${skipped.length === 1 ? ' is' : 's are'} not JSON and ${skipped.length === 1 ? 'was' : 'were'} skipped.`] : [])], state, skipped};
    if (failed.length) return {ok: false, message: `${failed.length} file${failed.length === 1 ? '' : 's'} could not be read, so nothing was sent to Sync. A pack that is only partly read could delete records.`, ...result, files: []};
    return {ok: true, ...result};
  } catch (error) { return {...fail(error), files: [], failed: []}; }
  finally { signal?.removeEventListener?.('abort', relay); }
}

/**
 * The fetched files as File-like objects, byte for byte what GitHub sent, for Sync from package's input stage
 * (readSyncInput). Gathering node files are left out: the Profession Ledger imports them.
 */
export function syncFiles(user, {files} = {}) {
  if (!isGM(user)) return denied({files: [], ledger: []});
  const usable = (files ?? []).filter(f => !f.ledger);
  const encoder = new TextEncoder();
  return {
    ok: true,
    ledger: (files ?? []).filter(f => f.ledger).map(f => f.path),
    files: usable.map(f => ({name: f.path, size: f.size || encoder.encode(f.body).length, text: async () => f.body, arrayBuffer: async () => encoder.encode(f.body).buffer, github: true}))
  };
}

// ---------- Remembering a pull, and Check for updates (no secrets stored) ----------
const stateKey = config => `${config.repo}@${config.branch}`;

/** Keeps the commit and each file's blob SHA of a finished pull, per repository and branch. */
export async function recordPull(user, {store, config, state} = {}) {
  if (!isGM(user)) return denied();
  const all = {...(readStore(store, 'state', {}) ?? {})};
  const key = stateKey(config);
  all[key] = {commit: state.commit, at: state.at, packs: {...(all[key]?.packs ?? {}), ...state.packs}};
  await store.set(GITHUB_SETTINGS.state, all);
  return {ok: true};
}

export function lastPull(user, {store, config} = {}) {
  if (!isGM(user)) return denied({last: null});
  const entry = readStore(store, 'state', {})?.[stateKey(config)] ?? null;
  return {ok: true, last: entry};
}

/**
 * Compares the branch with the last pull, file by file (blob SHAs). One request when the branch has not moved.
 * → {ok, upToDate, changed, packs:[{id, label, changed, added, removed, upToDate}], commit}
 */
export async function checkForUpdates(user, {store, fetch, signal, config} = {}) {
  if (!isGM(user)) return denied({packs: []});
  try {
    const input = checkInput(config ?? loadConfig(user, {store}).config);
    if (!input.ok) return input;
    const last = readStore(store, 'state', {})?.[stateKey(input.config)];
    if (!last?.packs || !Object.keys(last.packs).length) return {ok: false, message: 'Nothing has been pulled from this repository and branch yet, so there is nothing to compare.', packs: []};
    const ctx = makeContext(user, {store, fetch, signal});
    const commit = await branchCommit(ctx, input.repo, input.config.branch);
    const quiet = Object.entries(last.packs).map(([id, p]) => ({id, label: p.label, changed: 0, added: 0, removed: 0, upToDate: true}));
    if (commit === last.commit) return {ok: true, upToDate: true, changed: 0, packs: quiet, commit};
    const entries = await commitTree(ctx, input.repo, commit);
    const packs = [];
    for (const [id, was] of Object.entries(last.packs)) {
      if (!entries.has(id)) { packs.push({id, label: was.label, changed: Object.keys(was.files).length, added: 0, removed: Object.keys(was.files).length, upToDate: false, gone: true}); continue; }
      let paths = Object.keys(was.files);
      // The manifest itself changed: its list of files may have too, so read it again.
      if (entries.get(id).sha !== was.manifestSha) {
        const read = readManifest(await fileText(ctx, input.repo, commit, id, entries.get(id)), id);
        if (read.ok) paths = read.files;
      }
      const wasPaths = Object.keys(was.files);
      const changed = paths.filter(p => wasPaths.includes(p) && entries.get(p)?.sha !== was.files[p]).length;
      const added = paths.filter(p => !wasPaths.includes(p)).length;
      const removed = wasPaths.filter(p => !paths.includes(p)).length;
      // The manifest file is part of the pack: a change to it alone counts as one changed file.
      const manifestOnly = entries.get(id).sha !== was.manifestSha && changed + added + removed === 0 ? 1 : 0;
      packs.push({id, label: was.label, changed: changed + manifestOnly, added, removed, upToDate: changed + added + removed + manifestOnly === 0});
    }
    const total = packs.reduce((sum, p) => sum + p.changed + p.added + p.removed, 0);
    return {ok: true, upToDate: total === 0, changed: total, packs, commit};
  } catch (error) { return {...fail(error), packs: []}; }
}
