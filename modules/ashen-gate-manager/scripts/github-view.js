/**
 * Pull from GitHub (0.59.0): the Import tab section, as HTML text so the Node suite can check what the GM is told.
 * The wiring (inputs, buttons, progress) is in main.js; every control here carries a data attribute it binds.
 * The token field never carries a value, and the saved token is only ever shown masked.
 */
import {fold} from './ag-html.mjs';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Rows listed while a pull runs; the rest are counted. */
export const SHOWN_ROWS = 300;

export const GITHUB_INTRO = 'Pull a content pack straight from a GitHub repository instead of downloading ZIP files. Enter the repository, branch and the folder (or manifest file) of the pack, then find the packs, tick the ones you want and pull them. The files go to Sync from package, so you read the preview first and nothing changes before you confirm. Records you edited are kept by default, and character sheets are never touched.';
export const TOKEN_HINT = 'Make a fine-grained personal access token on GitHub for this one repository with Contents set to read-only. The token is kept on this device only (this browser), is never saved in the world, is never shown to players and is sent to GitHub only. Another device or browser needs its own copy.';
export const LEDGER_NOTE = 'Gathering node files are imported by the Profession Ledger’s own import. They are read, listed as handled by the Ledger and not sent to Sync.';

export const OTHER_FOLDERS_TITLE = 'Other folders without a manifest';
export const NO_MANIFEST_NOTE = 'No manifest: files import in name order. Tick only if you want this folder.';
/** Packs ticked when Find packs lists them: manifest packs only. A folder with no manifest starts unticked. */
export const defaultSelection = packs => (packs ?? []).filter(p => !p.noManifest).map(p => p.id);

const STATUS = {waiting: 'Waiting', reading: 'Reading…', done: 'Read', failed: 'Failed', ledger: 'Handled by the Ledger', skipped: 'Skipped (not a JSON file)'};
const fileName = path => String(path).slice(String(path).lastIndexOf('/') + 1);
const TONE = {done: 'ok', failed: 'danger', ledger: 'warn', skipped: 'warn'};

const input = (id, label, field, value, {placeholder = '', hint = '', secret = false, disabled = false} = {}) =>
  `<div class="ag-field"><label for="${id}">${esc(label)}</label>
    <input type="text" id="${id}" ${secret ? 'name="agm-gh-secret-field" class="agm-secret" autocomplete="off" autocapitalize="off" autocorrect="off" data-lpignore="true" data-1p-ignore data-form-type="other" data-bwignore' : 'autocomplete="off"'} data-ag-gh-field="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false" ${disabled ? 'disabled' : ''}>
    ${hint ? `<span class="ag-field__hint">${esc(hint)}</span>` : ''}</div>`;

/** The progress table, on its own so the running pull can repaint it without rendering the whole window. */
export function rowsTable(rows) {
  const shown = rows.slice(0, SHOWN_ROWS);
  return `<table class="ag-table"><thead><tr><th scope="col">File</th><th scope="col">Status</th></tr></thead><tbody>${shown.map(r =>
    `<tr><td><code>${esc(fileName(r.path))}</code></td><td><span class="ag-badge${TONE[r.status] ? ` ag-badge--${TONE[r.status]}` : ''}">${esc(STATUS[r.status] ?? r.status)}</span></td></tr>`).join('')}</tbody></table>${rows.length > shown.length ? `<p class="agmanager-tiny">and ${rows.length - shown.length} more.</p>` : ''}`;
}

/**
 * state: {draft:{repo, branch, paths, token}, dirty, token:{saved, masked}, packs:[{id, label, fileCount, missing}], selected:[id],
 *   busy, stopping, rows:[{path, status}], progress:{done, total}|null, message:{tone, text}|null, update:{tone, text}|null,
 *   pulled:{count, ledger:[path], commit}|null, syncOn, canRun}
 */
export function githubView(state) {
  const busy = Boolean(state.busy), d = state.draft ?? {};
  const parts = [`<p class="agmanager-tiny">${esc(GITHUB_INTRO)}</p>`];

  parts.push(`<div class="agm-gh-fields">
    ${input('agm-gh-repo', 'Repository (owner/name)', 'repo', d.repo, {placeholder: 'owner/repository', disabled: busy})}
    ${input('agm-gh-branch', 'Branch', 'branch', d.branch, {placeholder: 'main', disabled: busy})}
    <div class="ag-field"><label for="agm-gh-paths">Pack folders or manifest files (one per line)</label>
      <textarea id="agm-gh-paths" data-ag-gh-field="paths" rows="3" autocomplete="off" spellcheck="false" placeholder="folder/for/the/pack" ${busy ? 'disabled' : ''}>${esc(d.paths)}</textarea>
      <span class="ag-field__hint">A folder is searched for manifest files (a .json with "manifest" in its name). A path ending .json is used as the manifest itself. Each manifest is one pack line, for example a main pack and a sandbox pack.</span></div>
    ${state.token?.saved
      ? `<div class="ag-field"><span class="ag-field__label" id="agm-gh-token-label">Token</span>
          <div class="ag-cluster" role="group" aria-labelledby="agm-gh-token-label"><span class="ag-badge ag-badge--ok">Saved on this device</span> <code>${esc(state.token.masked)}</code>
          <button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-action="gh-token-remove" ${busy ? 'disabled' : ''}><i class="fa-solid fa-key" aria-hidden="true"></i> Remove token…</button></div>
          <span class="ag-field__hint">${esc(TOKEN_HINT)}</span></div>
        ${input('agm-gh-token', 'Replace the token (optional)', 'token', d.token, {secret: true, placeholder: 'Paste a new token to replace it', disabled: busy})}`
      : input('agm-gh-token', 'Token', 'token', d.token, {secret: true, placeholder: 'Paste a read-only token', hint: TOKEN_HINT, disabled: busy})}
  </div>`);

  parts.push(`<div class="ag-cluster">
    <button type="button" class="ag-btn ag-btn--ghost" data-ag-action="gh-save" ${busy || !state.dirty ? 'disabled' : ''}><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save settings</button>
    ${state.dirty ? '<span class="agmanager-tiny" role="status">Unsaved changes</span>' : ''}</div>`);

  parts.push(`<div class="ag-cluster">
    <button type="button" class="ag-btn ag-btn--ghost" data-ag-action="gh-find" ${busy ? 'disabled' : ''}><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Find packs</button>
    <button type="button" class="ag-btn ag-btn--ghost" data-ag-action="gh-check" ${busy ? 'disabled' : ''}><i class="fa-solid fa-rotate" aria-hidden="true"></i> Check for updates</button></div>`);
  if (state.update) parts.push(`<p class="ag-notice ag-notice--${esc(state.update.tone)}" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span>${esc(state.update.text)}</span></p>`);

  if (state.packs?.length) {
    // 0.71.4: manifests (the normal packs) are listed as before; every folder without a manifest sits in ONE closed fold below them,
    // with the explanation once. Only the display changes: ids, selection and pull order are untouched.
    const row = (p, i, {note = true} = {}) => {
      const id = `agm-gh-pack-${i}`, picked = (state.selected ?? []).includes(p.id);
      return `<li class="ag-row"><label class="ag-row__main agmanager-toggle" for="${id}"><input type="checkbox" id="${id}" data-ag-gh-pack="${esc(p.id)}" ${picked ? 'checked' : ''} ${busy ? 'disabled' : ''}>
        <span><span class="ag-row__title">${esc(p.label)}</span><span class="ag-row__meta">${esc(p.source)} · ${plural(p.fileCount, 'file')}${p.ledgerCount ? ` · ${plural(p.ledgerCount, 'gathering node file')} left for the Ledger` : ''}${p.missing ? ` · <strong>${plural(p.missing, 'listed file')} missing from the repository</strong>` : ''}</span>${p.noManifest && note ? `<span class="ag-row__meta">${esc(NO_MANIFEST_NOTE)}</span>` : ''}</span></label></li>`;
    };
    const indexed = state.packs.map((p, i) => ({p, i}));
    const manifests = indexed.filter(x => !x.p.noManifest), folders = indexed.filter(x => x.p.noManifest);
    if (manifests.length) parts.push(`<ul class="ag-rows" aria-label="Packs found">${manifests.map(x => row(x.p, x.i)).join('')}</ul>`);
    if (folders.length) {
      const ticked = folders.filter(x => (state.selected ?? []).includes(x.p.id)).length;
      const html = fold({title: `${OTHER_FOLDERS_TITLE} (${folders.length})`, count: ticked ? `${ticked} ticked` : undefined, open: ticked > 0,
        body: `<p class="agmanager-tiny">${esc(NO_MANIFEST_NOTE)}</p><ul class="ag-rows" aria-label="Folders without a manifest">${folders.map(x => row(x.p, x.i, {note: false})).join('')}</ul>`});
      parts.push(html.replace('<details class="ag-fold"', '<details class="ag-fold" data-ag-gh-other'));
    }
  }
  parts.push(`<p class="agmanager-tiny">${esc(LEDGER_NOTE)}</p>`);

  parts.push(`<div class="ag-cluster">
    <button type="button" class="ag-btn" data-ag-action="gh-pull" ${busy || !(state.selected ?? []).length ? 'disabled' : ''}><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> Pull selected packs</button>
    ${busy ? `<button type="button" class="ag-btn ag-btn--danger" data-ag-gh-stop ${state.stopping ? 'disabled' : ''}><i class="fa-solid fa-stop" aria-hidden="true"></i> Cancel</button>` : ''}</div>`);

  if (state.progress) {
    parts.push(`<div class="ag-cluster agclean-running" aria-label="Pull progress"><progress class="agclean-bar" data-ag-gh-bar max="1" value="${state.progress.total ? Math.min(1, state.progress.done / state.progress.total) : 0}" aria-label="Pull progress"></progress>
      <span class="agmanager-tiny" role="status" data-ag-gh-status>${esc(state.stopping ? 'Stopping…' : `${state.progress.done} of ${plural(state.progress.total, 'file')} read`)}</span></div>`);
  }
  if (state.rows?.length) parts.push(`<div class="ag-table-wrap agm-scrollcap" data-ag-gh-rows>${rowsTable(state.rows)}</div>`);
  if (state.message) parts.push(`<div class="ag-notice ag-notice--${esc(state.message.tone)}" role="${state.message.tone === 'danger' ? 'alert' : 'status'}"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>${esc(state.message.text)}</span></div>`);

  if (state.pulled) {
    const p = state.pulled;
    parts.push(`<div class="ag-cluster">
      <button type="button" class="ag-btn" data-ag-action="gh-send-sync" ${busy ? 'disabled' : ''}><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Preview in Sync from package</button>
      ${state.syncOn ? '' : `<button type="button" class="ag-btn ag-btn--ghost" data-ag-action="gh-send-import" ${busy ? 'disabled' : ''}><i class="fa-solid fa-file-import" aria-hidden="true"></i> Use the normal import instead</button>`}</div>
      <p class="agmanager-tiny">${plural(p.count, 'file')} ready${p.ledger.length ? `; ${plural(p.ledger.length, 'gathering node file')} left for the Ledger` : ''}. Nothing in your world has changed. Sync shows a full preview first${state.syncOn ? '' : ' (it turns Sync from package on)'}; the normal import previews each file before you apply it.</p>`);
  }
  return fold({key: 'github', title: 'Pull from GitHub', body: `<section class="ag-section agm-github" aria-label="Pull from GitHub">${parts.join('\n')}</section>`});
}
