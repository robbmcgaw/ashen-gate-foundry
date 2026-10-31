/**
 * Back up world to GitHub (0.86.0): the HTML text of the GM Setup settings section, the Export-tab action section and the
 * confirmation dialog's fields (0.87.0: one tick box per type), so the Node suite can check what the GM is told. The token field never carries a value, and a saved
 * token is only ever shown masked.
 */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const BACKUP_INTRO = 'Back up world to GitHub copies the current state of your Ashen Gate content to a branch of a private GitHub repository, so it can be read from GitHub without pasting exports. The token below is kept on this device only (this browser), is never saved in the world, never shown to players and is sent to GitHub only. It is separate from the read-only token used to pull packs.';
export const TOKEN_STEPS = 'To make the token: 1. On GitHub open Settings, then Developer settings, then Fine-grained tokens, and choose Generate new token. 2. Under Repository access choose Only select repositories and pick the backup repository. 3. Under Repository permissions set Contents to Read and write, then generate the token and paste it here.';

export function formatBytes(n) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** state: {repo, branch, token:{saved, masked}, busy} */
export function settingsView(state) {
  const token = state.token ?? {};
  const secret = (id, label, value, placeholder, hint) =>
    `<div class="ag-field"><label for="${id}">${esc(label)}</label>
      <input type="text" id="${id}" name="agm-bk-secret-field" class="agm-secret" autocomplete="off" autocapitalize="off" autocorrect="off" data-lpignore="true" data-1p-ignore data-form-type="other" data-bwignore data-ag-setup-backup-token value="" placeholder="${esc(placeholder)}" spellcheck="false">
      ${hint ? `<span class="ag-field__hint">${esc(hint)}</span>` : ''}</div>`;
  return `<section class="ag-section" aria-label="World backup">
    <div class="ag-section__head"><h3 class="ag-section__title">World backup</h3></div>
    <p class="agmanager-tiny">${esc(BACKUP_INTRO)}</p>
    <div class="ag-field"><label for="agm-bk-repo">Backup repository (owner/name)</label>
      <input type="text" id="agm-bk-repo" autocomplete="off" spellcheck="false" data-ag-setup-backup-repo value="${esc(state.repo)}" placeholder="owner/repository">
      <span class="ag-field__hint">The repository must be private. A backup refuses a public repository.</span></div>
    <div class="ag-field"><label for="agm-bk-branch">Backup branch</label>
      <input type="text" id="agm-bk-branch" autocomplete="off" spellcheck="false" data-ag-setup-backup-branch value="${esc(state.branch)}" placeholder="world-backup">
      <span class="ag-field__hint">Created from the repository’s default branch if it does not exist. A backup never writes to the default branch.</span></div>
    ${token.saved
      ? `<div class="ag-field"><span class="ag-field__label" id="agm-bk-token-label">Write token</span>
          <div class="ag-cluster" role="group" aria-labelledby="agm-bk-token-label"><span class="ag-badge ag-badge--ok">Saved on this device</span> <code>${esc(token.masked)}</code>
          <button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-action="backup-token-clear" ${state.busy ? 'disabled' : ''}><i class="fa-solid fa-key" aria-hidden="true"></i> Clear token… <span class="ag-badge">Applies now</span></button></div></div>
        ${secret('agm-bk-token', 'Replace the token (optional)', '', 'Paste a new token to replace it', '')}`
      : secret('agm-bk-token', 'Write token', '', 'Paste a token with Contents Read and write', '')}
    <p class="agmanager-tiny">${esc(TOKEN_STEPS)} The repository, branch and token are saved with Save Changes.</p>
  </section>`;
}

/** state: {configured, target:{repo, branch}, busy, lastLabel, message:{tone, text, url}|null} */
export function exportView(state) {
  const m = state.message;
  return `<section class="ag-section" aria-label="Back up world to GitHub">
    <div class="ag-section__head"><h3 class="ag-section__title">Back up world to GitHub</h3></div>
    <p class="agmanager-tiny">Sends the types you tick (edited Items, Journals, Actors, Roll Tables and Macros, Locations, Quests, Orders and Contracts, Factions and deities, Shops, Renown standings and claims, and Party characters) to the ${esc(state.target?.branch ?? '')} branch of a private repository, in the same files each module’s own Export writes. A type you leave unticked is not written and its earlier file stays on the branch. Your last choice is remembered on this device. Nothing in your world changes. The repository, branch and token are set in GM Setup, World backup.</p>
    <div class="ag-cluster">
      <button type="button" class="ag-btn" data-ag-action="backup-run" ${state.busy ? 'disabled' : ''}><i class="fa-brands fa-github" aria-hidden="true"></i> Back up world now…</button>
      ${state.lastLabel ? `<span class="agmanager-tiny">Last backed up on this device: ${esc(state.lastLabel)}</span>` : ''}</div>
    ${m ? `<div class="ag-notice ag-notice--${esc(m.tone)}" role="${m.tone === 'danger' ? 'alert' : 'status'}"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>${esc(m.text)}${m.url ? ` <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">View the commit on GitHub</a>` : ''}</span></div>` : ''}
  </section>`;
}

/** The words under the tick boxes. */
export function confirmHint(plan, target) {
  const gone = (plan.types ?? []).filter(t => !t.available);
  return `This writes the ticked types to the ${target.branch} branch of ${target.repo}. A type you leave unticked is not written, and its earlier file on the branch stays as it is. Renown standings and claims hold play state (who has earned what, and what has been revealed), and Party characters holds character sheets (play state), so both are written to the private repository only. Quest progress is not included, and nothing in your world changes. Before anything is written, GitHub is asked whether the repository is private. A public repository, or the default branch, is refused.${gone.length ? ` Not available now: ${gone.map(t => `${t.label} (${t.reason})`).join('; ')}.` : ''}`;
}

/** One line per tick box: what it is and what it will write. */
export function typeLabel(t) {
  const file = t.path.split('/').pop();
  if (t.edited !== undefined) return `${t.label}: ${plural(t.edited, 'edited record')}, ${plural(t.notFromPack, 'record', 'records')} not from a pack (${file})`;
  return `${t.label}: ${formatBytes(t.bytes ?? 0)} (${file})`;
}

/**
 * The fields of the "Back up world to GitHub" confirmation (a form dialog: Cancel on the left, Back up on the right).
 * plan: collectBackup result for every type; target: {repo, branch}; selection: ticked type ids (the remembered choice).
 */
export function confirmFields(plan, target, selection = []) {
  const options = (plan.types ?? []).filter(t => t.available).map(t => ({value: t.id, label: typeLabel(t), checked: selection.includes(t.id)}));
  return [{name: 'types', label: 'What to back up', type: 'checklist', options, hint: confirmHint(plan, target)}];
}
