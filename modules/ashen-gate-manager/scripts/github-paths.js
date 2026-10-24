/**
 * Pull from GitHub (0.59.0): the pure helpers. Nothing here touches the network, a setting or a document, so the GM check
 * lives in github-pull.js, which is the only caller. Repository, branch and path strings come from the GM's own input and
 * are validated before they reach a URL; errors are worded here so no token can ever be part of one.
 */

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const FORBIDDEN_BRANCH = /[\u0000- \u007f~^:?*[\\]|\.\.|@\{|\/\/|\.lock$|[./]$|^[/.-]/;

export const MAX_PATH_LINES = 8;
export const MAX_PATH_LENGTH = 300;

/** "owner/name" → {ok, owner, name, repo} or {ok:false, message}. A URL, a space or any extra segment is refused. */
export function parseRepo(text) {
  const value = String(text ?? '').trim();
  const parts = value.split('/');
  if (parts.length !== 2 || !OWNER.test(parts[0]) || !REPO_NAME.test(parts[1]) || parts[1] === '.' || parts[1] === '..')
    return {ok: false, message: 'Enter the repository as owner/name, for example owner/repository (no web address).'};
  return {ok: true, owner: parts[0], name: parts[1], repo: `${parts[0]}/${parts[1]}`};
}

/** A branch name git would accept; empty means main. */
export function parseBranch(text) {
  const value = String(text ?? '').trim() || 'main';
  if (value.length > 200 || FORBIDDEN_BRANCH.test(value)) return {ok: false, message: 'That branch name is not valid. Use the name exactly as GitHub shows it, for example main.'};
  return {ok: true, branch: value};
}

/** A path inside the repository: no leading slash, no "." or ".." parts, no backslash. Returns '' for an invalid one. */
export function cleanPath(text) {
  const value = String(text ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!value || value.length > MAX_PATH_LENGTH || /[\\\u0000-\u001f\u007f]/.test(value)) return '';
  const parts = value.split('/');
  return parts.some(part => !part || part === '.' || part === '..') ? '' : value;
}

/** The textarea (one path per line) → {ok, paths} or {ok:false, message}. A path may be a folder or a manifest .json file. */
export function parsePaths(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return {ok: false, message: 'Enter the folder (or manifest file) of the pack, for example the folder that holds its manifest.'};
  if (lines.length > MAX_PATH_LINES) return {ok: false, message: `Enter at most ${MAX_PATH_LINES} pack paths.`};
  const paths = [];
  for (const line of lines) {
    const path = cleanPath(line);
    if (!path) return {ok: false, message: `"${line.slice(0, 60)}" is not a valid path. Use a folder or file path inside the repository, such as folder/subfolder, with no leading slash and no "..".`};
    if (!paths.includes(path)) paths.push(path);
  }
  return {ok: true, paths};
}

/** The GM's form → {ok, config:{repo, branch, paths}} or {ok:false, message}. */
export function validateConfig(input) {
  const repo = parseRepo(input?.repo);
  if (!repo.ok) return repo;
  const branch = parseBranch(input?.branch);
  if (!branch.ok) return branch;
  const paths = parsePaths(Array.isArray(input?.paths) ? input.paths.join('\n') : input?.paths);
  if (!paths.ok) return paths;
  return {ok: true, config: {repo: repo.repo, branch: branch.branch, paths: paths.paths}, owner: repo.owner, name: repo.name};
}

/** Each path segment encoded, so a space or # in a folder name cannot change the request. */
export const encodePath = path => String(path).split('/').map(encodeURIComponent).join('/');
export const isSha = value => SHA.test(String(value ?? ''));
export const dirOf = path => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
export const baseOf = path => path.slice(path.lastIndexOf('/') + 1);

/**
 * A manifest entry, resolved against the manifest's folder. "./a.json", "sub/b.json" and "../c.json" all work; a path that
 * would climb out of the repository, or that is a URL, is refused. A leading "/" means from the repository root.
 * Returns the repository path or null.
 */
export function resolveRelative(dir, entry) {
  let raw = typeof entry === 'string' ? entry : (typeof entry?.path === 'string' ? entry.path : '');
  raw = raw.trim();
  if (!raw || raw.length > MAX_PATH_LENGTH + 200 || /[\\\u0000-\u001f\u007f]|^[A-Za-z][A-Za-z0-9+.-]*:|\?|#/.test(raw)) return null;
  const out = raw.startsWith('/') ? [] : (dir ? dir.split('/') : []);
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.length ? out.join('/') : null;
}

/** A manifest body → {ok, files:[repo paths in order], invalid:[entries that could not be resolved], label}. */
export function readManifest(body, manifestPath) {
  let data;
  try { data = JSON.parse(body); } catch { return {ok: false, message: 'is not valid JSON.'}; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !/^ag-[a-z-]*manifest\//.test(String(data.schema ?? '')) || !Array.isArray(data.ordered_files))
    return {ok: false, message: 'is not a pack manifest (it has no list of ordered files).'};
  const dir = dirOf(manifestPath), files = [], invalid = [];
  for (const entry of data.ordered_files) {
    const path = resolveRelative(dir, entry);
    if (!path) invalid.push(String(typeof entry === 'string' ? entry : entry?.path ?? '').slice(0, 80));
    else if (!files.includes(path)) files.push(path);
  }
  const named = [data.name, data.title, data.package_id, data.pack_id].find(v => typeof v === 'string' && v.trim());
  return {ok: true, files, invalid, label: (named ?? dir ?? manifestPath).toString().trim().slice(0, 80) || manifestPath};
}

/** Pack manifests are named like pack-manifest.json or manifest_v0.1.json. */
export const looksLikeManifest = path => /manifest[^/]*\.json$/i.test(path);

/** Errors → {kind, message}. Only our own wording is used; nothing from GitHub's reply and never the token. */
export function mapGithubError(status, {headers, bodyText = '', what = 'that', now = Date.now()} = {}) {
  const header = name => { try { return headers?.get?.(name) ?? null; } catch { return null; } };
  const lower = String(bodyText).toLowerCase();
  if (status === 401) return {kind: 'token', message: 'GitHub did not accept the token. It may have expired or been revoked. Make a new read-only token on GitHub, then save it here.'};
  const limited = status === 429 || (status === 403 && (header('x-ratelimit-remaining') === '0' || header('retry-after') !== null || /rate limit|abuse/.test(lower)));
  if (limited) {
    const reset = Number(header('x-ratelimit-reset')), retry = Number(header('retry-after'));
    let when = '';
    if (Number.isFinite(retry) && retry > 0) when = ` Try again in about ${Math.max(1, Math.ceil(retry))} second${retry > 1 ? 's' : ''}.`;
    else if (Number.isFinite(reset) && reset * 1000 > now) when = ` Try again after ${new Date(reset * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}.`;
    return {kind: 'rate', message: `GitHub is limiting requests from this token right now.${when || ' Wait a little and try again.'}`};
  }
  if (status === 403) return {kind: 'access', message: 'This token cannot read that repository. Check that it was made for this repository with Contents set to read-only, and that it has not expired.'};
  if (status === 404) return {kind: 'missing', message: `GitHub could not find ${what}. Check the repository, branch and path. A token without access to a private repository is also shown as not found.`};
  if (status === 451) return {kind: 'access', message: 'GitHub has blocked access to that content.'};
  if (status >= 500) return {kind: 'server', message: `GitHub had a problem (error ${status}). Try again in a moment.`};
  return {kind: 'other', message: `GitHub could not complete the request (error ${status}).`};
}

/** True when GitHub says the contents API will not return this file's body (over its size limit). */
export const isTooLarge = (status, bodyText) => status === 403 && /too[\s_-]*large|exceeds the maximum size/i.test(String(bodyText ?? ''));

/** The token shown back to the GM: never the token, only whether one is kept and how it ends. */
export function maskToken(token) {
  const value = String(token ?? '');
  if (!value) return '';
  return value.length >= 20 ? `••••••••${value.slice(-4)}` : '••••••••';
}

/** A fine-grained or classic personal access token is letters, digits, "_" and "-" only. */
export function tokenProblem(text) {
  const value = String(text ?? '').trim();
  if (!value) return 'Paste the token first.';
  if (value.length < 20 || value.length > 255 || !/^[A-Za-z0-9_-]+$/.test(value)) return 'That does not look like a GitHub token. Paste it exactly as GitHub showed it, with no spaces.';
  return '';
}

/** Removes any occurrence of the token from text, as a last guard for text that is about to be shown or logged. */
export function scrub(text, token) {
  const value = String(text ?? '');
  return token ? value.split(String(token)).join('••••') : value;
}

/** The plain sentence for a checkForUpdates result ({ok, upToDate, changed, packs:[{label, changed, added, removed, gone}]}). */
export function updateSummary(result) {
  if (!result?.ok) return result?.message ?? '';
  if (result.upToDate) return 'Up to date: nothing has changed since your last pull.';
  const changed = result.packs.filter(p => p.changed + p.added + p.removed > 0 || p.gone);
  return `${result.changed} file${result.changed === 1 ? '' : 's'} changed since your last pull (${changed.map(p => `${p.label}: ${p.changed + p.added + p.removed}`).join(', ')}).`;
}
