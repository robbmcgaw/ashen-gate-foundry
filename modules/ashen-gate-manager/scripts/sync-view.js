/**
 * Sync from package (0.55.0): the window section, as HTML text so the Node suite can check what the GM is told.
 * The wiring (file picker, buttons, progress) is in main.js; every control here carries a data attribute it binds.
 */
import {SYNC_NAME, SYNC_PHRASE, phraseOk} from './sync.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Rows shown per group before "and N more"; deletions are never cut off: every one is listed by name and kind. */
export const SHOWN_ROWS = 300;

export const SYNC_INTRO = `${SYNC_NAME} makes the world match the files you choose, as if they were literally the old files. A record that matches by permanent id is updated to the package's version; one you edited in this world since it was imported is kept as it is (listed, with what would differ) unless you tick the option below. Records Manager imported from these packages that no file mentions are deleted. Character sheets are never touched: no player character, nothing on one, no hotbar. An Item that is also on a character sheet stays there exactly as it is, even when the world Item is changed or deleted. Documents Manager did not import (your own, core and player ones) are never read or changed.`;

const group = (title, count, body, {open = false} = {}) => `<details class="ag-fold"${open ? ' open' : ''}>
  <summary class="ag-fold__summary"><span class="ag-fold__title">${esc(title)}</span><span class="ag-fold__count">${count}</span></summary>
  <div class="ag-fold__body">${body}</div></details>`;
const more = (shown, total) => total > shown ? `<p class="agmanager-tiny">and ${total - shown} more (Download preview lists every row).</p>` : '';
const line = r => `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta">${esc(r.kind)} · <code>${esc(r.id)}</code> — ${esc(r.reason)}</span></span></li>`;

function overwriteRow(r) {
  const edits = r.lost ? ` <span class="ag-badge ag-badge--warn">${plural(r.lost, 'GM edit')} replaced</span>` : '';
  if (!r.changes.length) return line(r);
  const rows = r.changes.map(c => `<tr><th scope="row">${esc(c.label)}</th><td>${esc(c.from)}</td><td>${esc(c.to)}</td><td>${c.gmEdited ? 'GM edit replaced' : ''}</td></tr>`).join('');
  return `<li class="ag-row"><details class="ag-row__main"><summary><strong>${esc(r.name)}</strong> ${esc(r.kind)} · <code>${esc(r.id)}</code> · ${plural(r.changes.length, 'difference')}${edits}</summary>
    <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Field</th><th scope="col">Now</th><th scope="col">Package</th><th scope="col">Note</th></tr></thead><tbody>${rows}</tbody></table></div></details></li>`;
}

/**
 * state: {inputs:[{name, imports, skipped}], skipped:[{filename, reason}], fileButton, deleteUnscoped, plan, phrase,
 *   busy, progress:{pct, label}|null, stopping, result:{message, tone}|null, message}
 */
export function syncView(state) {
  const plan = state.plan, busy = Boolean(state.busy);
  const files = state.inputs.flatMap(i => i.imports ?? []);
  const fileRows = files.map(f => `<tr><td><code>${esc(f.filename)}</code></td><td>${esc(f.label)}</td><td class="is-num">${f.records}</td><td>${esc(f.packageId ?? '—')}</td></tr>`).join('');
  const parts = [`<section class="ag-section agm-sync" aria-label="${esc(SYNC_NAME)}">`,
    `<p class="ag-notice ag-notice--warn" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>${esc(SYNC_INTRO)}</span></p>`,
    `<div class="ag-toolbar agm-import-bar">${state.fileButton}<span class="agm-import-loaded">${files.length
      ? `<strong>${plural(files.length, 'import file')}</strong> <span class="agmanager-tiny">from ${plural(state.inputs.length, 'source')}</span>` : '<span class="agmanager-tiny">No files chosen</span>'}</span>
      <div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--ghost" data-ag-action="sync-reset" ${busy ? 'disabled' : ''}>Clear files</button></div></div>`,
    `<p class="agmanager-tiny">Choose every file of the sync in one go (Ctrl or Shift to pick several): for Robb's pack both ZIPs, main and sandbox. Packages are compared as one union, so syncing the main ZIP alone never removes the sandbox records. A ZIP may carry an import-order manifest.</p>`];
  if (files.length) parts.push(`<details class="ag-fold" open><summary class="ag-fold__summary"><span class="ag-fold__title">Files in this sync</span><span class="ag-fold__count">${files.length}</span></summary><div class="ag-fold__body">
    <div class="ag-table-wrap agm-scrollcap"><table class="ag-table"><thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col" class="is-num">Records</th><th scope="col">Package line</th></tr></thead><tbody>${fileRows}</tbody></table></div>
    ${state.skipped.length ? `<p class="agmanager-tiny">Not part of the sync: ${state.skipped.map(s => `<code>${esc(s.filename)}</code> (${esc(s.reason)})`).join('; ')}</p>` : ''}</div></details>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-unscoped ${state.deleteUnscoped ? 'checked' : ''} ${busy ? 'disabled' : ''}> <strong>Also delete records not in these files</strong></label>
    <p class="ag-field__hint">Off by default. Records imported by an older Manager have no package line, so Sync cannot tell whether they belong to these files and keeps them. Ticking this lets Sync delete those that no chosen file mentions. Only documents with Manager's flag are ever considered.</p>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-edited ${state.overwriteEdited ? 'checked' : ''} ${busy ? 'disabled' : ''}> <strong>Also overwrite records I edited</strong></label>
    <p class="ag-field__hint">Off by default. Off: a record you changed since the last import is left alone, and is not deleted either when the files no longer carry it. On: the package wins, your changes are replaced and such records are deleted (the preview counts them, and the backup keeps them).</p>`);
  parts.push(`<div class="ag-cluster"><button type="button" class="ag-btn" data-ag-action="sync-preview" ${busy || !files.length ? 'disabled' : ''}><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Preview sync</button></div>`);
  if (state.message) parts.push(`<p class="ag-notice ag-notice--info" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(state.message)}</p>`);

  if (plan) {
    const c = plan.counts;
    if (plan.errors.length) parts.push(`<div class="ag-notice ag-notice--danger" role="alert"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i><div><strong>Nothing can be synced yet (${plural(plan.errors.length, 'problem')}). Nothing has changed.</strong><ul>${plan.errors.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${plan.errors.length > 12 ? `<p>and ${plan.errors.length - 12} more.</p>` : ''}</div></div>`);
    else {
      parts.push(`<p class="agmanager-tiny"><strong>Compared against:</strong> ${plan.scope.lines.map(l => `${esc(l.packageId)} v${esc(l.versions.join(', '))} (${plural(l.records, 'record')} in ${plural(l.files.length, 'file')}; ${l.inWorld} in your world)`).join('; ') || 'no Manager package lines'}${plan.scope.files.some(f => f.kind !== 'manager') ? ' plus the specialist files listed above' : ''}. Only documents of these package lines are considered for deletion${plan.deleteUnscoped ? ', and records without a package line' : ''}. ${plural(plan.outOfScope?.records ?? 0, 'Manager-imported record')} of other packages stay untouched.</p>`);
      for (const n of plan.notes) parts.push(`<p class="ag-notice ag-notice--warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(n)}</p>`);
      parts.push(`<div class="ag-cluster agmanager-summary" role="group" aria-label="Sync preview totals">
        <span class="ag-badge ag-badge--ok"><strong>${c.create}</strong> create</span>
        <span class="ag-badge ag-badge--ok"><strong>${c.overwrite}</strong> overwrite</span>
        <span class="ag-badge ag-badge--danger"><strong>${c.delete}</strong> delete</span>
        <span class="ag-badge"><strong>${c.untouched}</strong> untouched</span>
        ${c.keptEdited ? `<span class="ag-badge ag-badge--warn"><strong>${c.keptEdited}</strong> kept: edited in your world${c.keptRemoved ? ` (${c.keptRemoved} no longer in the package)` : ''}</span>` : ''}
        ${plan.overwriteEdited ? `<span class="ag-badge ag-badge--warn"><strong>${plan.lost}</strong> GM-edited field${plan.lost === 1 ? '' : 's'} will be lost</span>` : ''}
        ${c.metadataRefreshes ? `<span class="ag-badge"><strong>${c.metadataRefreshes}</strong> metadata refresh${c.metadataRefreshes === 1 ? '' : 'es'} (no content change)</span>` : ''}
        ${c.refused ? `<span class="ag-badge ag-badge--warn"><strong>${c.refused}</strong> refused</span>` : ''}</div>`);
      parts.push(`<p class="agmanager-tiny">Character sheets and everything on them are untouched (${plural(plan.characterCount, 'player character')} in this world). Item copies on character sheets stay exactly as they are even where the world Item is updated or deleted.</p>`);
      const rows = g => plan.rows.filter(r => r.group === g);
      const creates = rows('create'), over = rows('overwrite').filter(r => !r.metadataOnly), meta = rows('overwrite').filter(r => r.metadataOnly), del = rows('delete'), keep = rows('untouched'), kept = keep.filter(r => r.keptEdited && !r.keptRemoved), keptGone = keep.filter(r => r.keptRemoved);
      const list = (items, fn, cap = SHOWN_ROWS) => `<ul class="ag-rows">${items.slice(0, cap).map(fn).join('')}</ul>${more(Math.min(cap, items.length), items.length)}`;
      parts.push(group('Create', creates.length, creates.length ? list(creates, line) : '<p class="agmanager-tiny">Nothing new.</p>'));
      parts.push(group('Overwrite', over.length, `${over.length ? list(over, overwriteRow) : '<p class="agmanager-tiny">No content differs.</p>'}${meta.length ? `<p class="agmanager-tiny">Also refreshes metadata on ${meta.length} record(s) whose content already matches.</p>` : ''}`, {open: over.length > 0 && over.length <= 12}));
      parts.push(group('Delete', del.length, del.length ? list(del, line, del.length) : '<p class="agmanager-tiny">Nothing is deleted.</p>', {open: del.length > 0 && del.length <= 40}));
      parts.push(group('Kept: edited in your world', kept.length, kept.length ? `<p class="agmanager-tiny">You changed these since they were imported, so Sync leaves them alone. Open one to see what would differ.</p>${list(kept, overwriteRow)}` : '<p class="agmanager-tiny">No record you edited is affected.</p>', {open: kept.length > 0 && kept.length <= 12}));
      parts.push(group('Kept: edited in your world, no longer in the package', keptGone.length, keptGone.length ? `<p class="agmanager-tiny">These are no longer in the files, but you changed them since they were imported, so Sync does not delete them.</p>${list(keptGone, line, keptGone.length)}` : '<p class="agmanager-tiny">No edited record is missing from the files.</p>', {open: keptGone.length > 0 && keptGone.length <= 12}));
      const refused = keep.filter(r => !r.keptEdited && (r.refused || r.kept || r.notRemoved)), quiet = keep.length - refused.length - kept.length - keptGone.length;
      parts.push(group('Untouched', c.untouched, `${refused.length ? list(refused, line) : ''}<p class="agmanager-tiny">${quiet} record(s) already match the package${plan.outOfScope?.records ? `; ${plan.outOfScope.records} Manager-imported record(s) belong to other package lines or have no line; documents without Manager's flag are never listed or changed` : ''}.</p>`, {open: refused.length > 0 && refused.length <= 12}));
    }
    const ready = !plan.errors.length && (plan.records > 0 || plan.counts.delete > 0 || plan.counts.metadataRefreshes > 0);
    if (!plan.errors.length && !ready) parts.push('<p class="ag-notice ag-notice--info" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> The world already matches these files. Nothing to do.</p>');
    if (ready) {
      parts.push(`<div class="ag-field agm-sync-confirm"><label for="agm-sync-phrase">To confirm, type <strong>${esc(SYNC_PHRASE)}</strong></label>
        <input type="text" id="agm-sync-phrase" data-ag-sync-phrase value="${esc(state.phrase)}" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''}>
        <span class="ag-field__hint">A JSON backup of everything that will be overwritten or deleted downloads first. If it cannot be saved, nothing is written. Running the same files again changes nothing more, and a run you cancel is finished by running it again.</span></div>`);
    }
    if (state.progress) parts.push(`<div class="ag-cluster agclean-running" aria-label="Sync progress"><progress class="agclean-bar" data-ag-sync-bar max="1" value="${state.progress.pct}" aria-label="Sync progress"></progress>
      <span class="agmanager-tiny" role="status" data-ag-sync-status>${esc(state.stopping ? 'Stopping after the current chunk…' : state.progress.label)}</span>
      <button type="button" class="ag-btn ag-btn--danger" data-ag-sync-stop ${state.stopping ? 'disabled' : ''}><i class="fa-solid fa-stop" aria-hidden="true"></i> Cancel sync</button></div>`);
    if (state.result) parts.push(`<div class="ag-notice ag-notice--${state.result.tone === 'ok' ? 'info' : state.result.tone}" role="status"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i><div>${state.result.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div></div>`);
    parts.push(`<footer class="ag-footer agmanager-footer">
      <button type="button" class="ag-btn ag-btn--ghost" data-ag-action="sync-cancel" ${busy ? 'disabled' : ''}>Cancel</button>
      <span class="ag-footer__status"></span>
      <button type="button" class="ag-btn" data-ag-action="sync-report" ${!plan ? 'disabled' : ''}><i class="fa-solid fa-download" aria-hidden="true"></i> Download preview</button>
      ${ready ? `<button type="button" class="ag-btn" data-ag-action="sync-backup" ${busy ? 'disabled' : ''}><i class="fa-solid fa-download" aria-hidden="true"></i> Download backup</button>
      <button type="button" class="ag-btn ag-btn--danger" data-ag-action="sync-run" data-ag-sync-run ${busy || !phraseOk(state.phrase) ? 'disabled' : ''}><i class="fa-solid fa-trash-can" aria-hidden="true"></i> ${esc(plan.buttonLabel)}</button>` : ''}</footer>`);
  }
  parts.push('</section>');
  return parts.join('\n');
}
