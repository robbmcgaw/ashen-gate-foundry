/**
 * Sync from package (0.56.0): the window section, as HTML text so the Node suite can check what the GM is told.
 * The wiring (file picker, buttons, progress) is in main.js; every control here carries a data attribute it binds.
 */
import {SYNC_NAME, SYNC_PHRASE, phraseOk, phraseRequired} from './sync.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Rows shown per group before "and N more"; deletions are never cut off: every one is listed by name and kind. */
export const SHOWN_ROWS = 300;

export const SYNC_INTRO = `${SYNC_NAME} makes the world match the files you choose, as if they were literally the old files. A record that matches by permanent id is updated to the package's version; one you edited in this world since it was imported is kept as it is (listed, with what would differ) unless you tick the option below. Records Manager imported from these packages that no file mentions are deleted. Character sheets are never touched: no player character, nothing on one, no hotbar. An Item that is also on a character sheet stays there exactly as it is, even when the world Item is changed or deleted. A record the package renamed is renamed in your world too (listed under Renames, no typed confirmation when that is all the run does), unless you renamed it by hand. Documents Manager did not import (your own, core and player ones) are never read or changed.`;

const group = (title, count, body, {open = false} = {}) => `<details class="ag-fold"${open ? ' open' : ''}>
  <summary class="ag-fold__summary"><span class="ag-fold__title">${esc(title)}</span><span class="ag-fold__count">${count}</span></summary>
  <div class="ag-fold__body">${body}</div></details>`;
const more = (shown, total) => total > shown ? `<p class="agmanager-tiny">and ${total - shown} more (Download preview lists every row).</p>` : '';
const line = r => `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta">${esc(r.kind)} — ${esc(r.reason)}</span>${r.id ? `<details class="agm-tech" data-ag-technical><summary>Details</summary><code class="agm-id">${esc(r.id)}</code></details>` : ''}</span></li>`;

function overwriteRow(r) {
  const edits = r.lost ? ` <span class="ag-badge ag-badge--warn">${plural(r.lost, 'GM edit')} replaced</span>` : '';
  if (!r.changes.length) return line(r);
  const rows = r.changes.map(c => `<tr><th scope="row">${esc(c.label)}</th><td>${esc(c.from)}</td><td>${esc(c.to)}</td><td>${c.gmEdited ? 'GM edit replaced' : ''}</td></tr>`).join('');
  return `<li class="ag-row"><details class="ag-row__main"><summary><strong>${esc(r.name)}</strong> ${esc(r.kind)} · ${plural(r.changes.length, 'difference')}${edits}</summary>
    <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Field</th><th scope="col">Now</th><th scope="col">Package</th><th scope="col">Note</th></tr></thead><tbody>${rows}</tbody></table></div></details></li>`;
}

/** A rename (0.74.0): "Old name → New name", with what it does and does not touch. */
const renameLine = r => `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(r.rename?.from ?? '')} → ${esc(r.rename?.to ?? r.name)}</span><span class="ag-row__meta">${esc(r.kind)} — ${esc(r.reason)}</span>${r.id ? `<details class="agm-tech" data-ag-technical><summary>Details</summary><code class="agm-id">${esc(r.id)}</code></details>` : ''}</span></li>`;

/** "Keeping your art" (0.70.0): one short line per record, expandable to the fields (what the world has now, what the package has). */
function artRow(a) {
  const rows = a.fields.map(f => `<tr><th scope="row">${esc(f.label)}</th><td>${esc(f.live)}</td><td>${esc(f.package)}</td></tr>`).join('');
  return `<li class="ag-row"><details class="ag-row__main"><summary><strong>${esc(a.name)}</strong> ${esc(a.kind)} · ${esc(a.summary)}</summary>
    <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">Field</th><th scope="col">Yours (kept)</th><th scope="col">Package</th></tr></thead><tbody>${rows}</tbody></table></div></details></li>`;
}

/** The "Replaces" list: one row per record that supersedes a document in this world, with a Yes / No / Skip choice. Nothing is written before Apply. */
function replacesFold(plan) {
  const offers = plan.offers ?? [];
  const rows = offers.map(o => {
    const name = `supersede-${o.newId}`;
    const choice = (value, label) => `<label class="ag-field--inline"><input type="radio" name="${esc(name)}" value="${value}" data-ag-sync-supersede="${esc(o.newId)}" ${o.choice === value ? 'checked' : ''} ${o.state !== 'offer' ? 'disabled' : ''}> ${label}</label>`;
    const help = o.state !== 'offer' ? esc(o.reason ?? 'Cannot be replaced.')
      : o.choice === 'yes' ? 'The same document is kept (tokens, ownership, folder, links) and takes the new content.'
      : o.choice === 'no' ? 'The new record is added as its own document; the old one is kept.' : 'Neither is changed in this sync.';
    return `<li class="ag-row"><fieldset class="ag-row__main agm-supersede"><legend><strong>${esc(o.newName)}</strong> <span class="ag-badge">${esc(o.kind)}</span> replaces <strong>${esc(o.oldName)}</strong></legend>
      <div class="ag-cluster">${choice('yes', 'Yes, replace it')}${choice('no', 'No, add separately')}${choice('skip', 'Skip for now')}</div>
      <span class="agmanager-tiny">${help}</span>
      <details class="agm-tech" data-ag-technical><summary>Details</summary><code class="agm-id">${esc(o.oldId)} → ${esc(o.newId)}</code></details></fieldset></li>`;
  }).join('');
  return group('Replaces', offers.length, offers.length ? `<p class="agmanager-tiny">These new records take over from a document already in your world. Pick Yes, No or Skip for each; nothing is written until you confirm below.</p><ul class="ag-rows">${rows}</ul>` : '<p class="agmanager-tiny">No record replaces a document in your world.</p>', {open: offers.length > 0});
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
    `<h3 class="agm-step"><span class="agm-step__n">1</span> Choose the files</h3>`,
    ...(busy ? ['<p id="agm-clear-why" class="agmanager-tiny">Clear inputs… is off while a sync is running.</p>'] : []),
    ...(state.unfinished && !busy ? ['<p class="ag-notice ag-notice--warn" role="status"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>The last sync did not finish. Preview and run the same files again to finish it; nothing already written is repeated. Discarding forgets the files and the preview.</span></p>'] : []),
    `<p class="ag-notice ag-notice--warn" role="note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>${esc(SYNC_INTRO)}</span></p>`,
    `<div class="ag-toolbar agm-import-bar">${state.fileButton}<span class="agm-import-loaded">${files.length
      ? `<strong>${plural(files.length, 'import file')}</strong> <span class="agmanager-tiny">from ${plural(state.inputs.length, 'source')}</span>` : '<span class="agmanager-tiny">No files chosen</span>'}</span>
      <div class="ag-toolbar__end"><button type="button" class="ag-btn ag-btn--ghost${state.unfinished ? ' ag-btn--danger' : ''}" data-ag-action="clear-inputs" ${busy ? 'disabled aria-describedby="agm-clear-why" data-tooltip="Not while a sync is running"' : ''}><i class="fa-solid fa-eraser" aria-hidden="true"></i> ${state.unfinished ? 'Discard the unfinished sync…' : 'Clear inputs…'}</button></div></div>`,
    `<p class="agmanager-tiny">Choose every file of the sync in one go (Ctrl or Shift to pick several): for Robb's pack both ZIPs, main and sandbox. Packages are compared as one union, so syncing the main ZIP alone never removes the sandbox records. A ZIP may carry an import-order manifest.</p>`];
  if (state.github?.commit) parts.push(`<p class="agmanager-tiny"><strong>Pulled from GitHub:</strong> ${esc(state.github.where ?? '')} at commit <code>${esc(String(state.github.commit).slice(0, 7))}</code>, ${plural(state.github.files, 'file')} sent to this sync.</p>`);
  if (files.length) parts.push(`<details class="ag-fold" open><summary class="ag-fold__summary"><span class="ag-fold__title">Files in this sync</span><span class="ag-fold__count">${files.length}</span></summary><div class="ag-fold__body">
    <div class="ag-table-wrap"><table class="ag-table"><thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col" class="is-num">Records</th><th scope="col">Package line</th></tr></thead><tbody>${fileRows}</tbody></table></div>
    ${state.skipped.length ? `<p class="agmanager-tiny">Not part of the sync: ${state.skipped.map(s => `<code>${esc(s.filename)}</code> (${esc(s.reason)})`).join('; ')}</p>` : ''}</div></details>`);
  const adv = [state.deleteUnscoped ? 'deleting records not in the files' : null, state.overwriteEdited ? 'overwriting edited records' : null, state.replaceArt ? 'replacing art' : null, state.recreateTypeChange ? 'recreating Items whose type changed' : null, state.updateActors ? 'updating Actors from the package' : null].filter(Boolean);
  parts.push(`<details class="ag-fold agm-sync-advanced" data-ag-fold="sync-advanced" ${adv.length ? 'open' : ''}><summary class="ag-fold__summary"><span class="ag-fold__title">Advanced</span><span class="ag-fold__hint">${esc(adv.length ? `On: ${adv.join(', ')}` : 'Default: keep what you edited, keep your art, delete only what the files drop')}</span></summary><div class="ag-fold__body">`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-unscoped ${state.deleteUnscoped ? 'checked' : ''} ${busy ? 'disabled' : ''}> <strong>Also delete records not in these files</strong></label>
    <p class="ag-field__hint">Off by default. Records imported by an older Manager have no package line, so Sync cannot tell whether they belong to these files and keeps them. Ticking this lets Sync delete those that no chosen file mentions. Only documents with Manager's flag are ever considered.</p>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-edited ${state.overwriteEdited ? 'checked' : ''} ${busy ? 'disabled' : ''}> <strong>Also overwrite records I edited</strong></label>
    <p class="ag-field__hint">Off by default. Off: a record you changed since the last import is left alone, and is not deleted either when the files no longer carry it. On: the package wins, your changes are replaced and such records are deleted (the preview counts them, and the backup keeps them).</p>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-recreate ${state.recreateTypeChange ? 'checked' : ''} ${busy || !state.isGM ? 'disabled' : ''}> <strong>Also recreate Items whose type changed</strong></label>
    <p class="ag-field__hint">Off by default: such an Item stays in the Refused list with its reason. dnd5e cannot change an Item's type in place, so On deletes the world Item and creates it again from the package (same folder; readable by players as the Items setting says; flags other modules put on it are copied over; art you set is kept). Its id stays live, nothing is retired. Copies on character sheets are separate documents and are not touched.</p>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-art ${state.replaceArt ? 'checked' : ''} ${busy || !state.isGM ? 'disabled' : ''}> <strong>Also replace art I set</strong></label>
    <p class="ag-field__hint">Off by default, and separate from the option above. Art you set yourself (a portrait, a token image or a token ring, for example from Link files to records) is always kept, even when you overwrite edited records. On: art you changed is replaced by the package's art. The backup keeps what you had.</p>`);
  parts.push(`<label class="ag-field--inline agmanager-toggle"><input type="checkbox" data-ag-sync-actors ${state.updateActors ? 'checked' : ''} ${busy || !state.isGM ? 'disabled' : ''}> <strong>Also update Actors from the package</strong></label>
    <p class="ag-field__hint">Off by default: Actors are handled as before. On: each NPC Actor the files carry takes the package's new stat block, comparing the last import, your world and the package. Abilities, skills, traits, AC, max HP, name, and the items, features and spells that came from the package follow the package where it changed. Your art, token settings, ownership, folder, notes in the biography, items you added, current HP (until the NPC is back at its imported HP), item uses and quantities are kept. Player characters are never touched. The preview lists these Actors under Actor updates; the backup keeps what you had.</p>`);
  parts.push('</div></details>');
  parts.push('<h3 class="agm-step"><span class="agm-step__n">2</span> Preview</h3>');
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
        ${c.rebind ? `<span class="ag-badge ag-badge--ok"><strong>${c.rebind}</strong> replaced in place</span>` : ''}
        <span class="ag-badge ag-badge--danger"><strong>${c.delete}</strong> delete</span>
        <span class="ag-badge"><strong>${c.untouched}</strong> untouched</span>
        ${c.keptEdited ? `<span class="ag-badge ag-badge--warn"><strong>${c.keptEdited}</strong> kept: edited in your world${c.keptRemoved ? ` (${c.keptRemoved} no longer in the package)` : ''}</span>` : ''}
        ${plan.overwriteEdited ? `<span class="ag-badge ag-badge--warn"><strong>${plan.lost}</strong> GM-edited field${plan.lost === 1 ? '' : 's'} will be lost</span>` : ''}
        ${c.metadataRefreshes ? `<span class="ag-badge"><strong>${c.metadataRefreshes}</strong> metadata refresh${c.metadataRefreshes === 1 ? '' : 'es'} (no content change)</span>` : ''}
        ${c.artKept ? `<span class="ag-badge ag-badge--ok"><strong>${c.artKept}</strong> keeping your art</span>` : ''}
        ${c.rename ? `<span class="ag-badge ag-badge--ok"><strong>${c.rename}</strong> rename${c.rename === 1 ? '' : 's'}</span>` : ''}
        ${c.actorUpdates ? `<span class="ag-badge ag-badge--ok"><strong>${c.actorUpdates}</strong> Actor update${c.actorUpdates === 1 ? '' : 's'}</span>` : ''}
        ${c.recreate ? `<span class="ag-badge ag-badge--warn"><strong>${c.recreate}</strong> recreate</span>` : ''}
        ${plan.replaceArt ? `<span class="ag-badge ag-badge--warn">art you set will be replaced</span>` : ''}
        ${c.refused ? `<span class="ag-badge ag-badge--warn"><strong>${c.refused}</strong> refused</span>` : ''}</div>`);
      if (!plan.errors.length && (plan.records > 0 || plan.counts.delete > 0 || plan.counts.metadataRefreshes > 0 || plan.counts.supersedeFiles > 0)) parts.push(`<p><button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-ag-sync-jump><i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Jump to confirm and run</button></p>`);
      parts.push(`<p class="agmanager-tiny">Character sheets and everything on them are untouched (${plural(plan.characterCount, 'player character')} in this world). Item copies on character sheets stay exactly as they are even where the world Item is updated or deleted.</p>`);
      const rows = g => plan.rows.filter(r => r.group === g);
      const creates = rows('create'), actorUpd = rows('overwrite').filter(r => !r.metadataOnly && r.actorUpdate), over = rows('overwrite').filter(r => !r.metadataOnly && !r.actorUpdate), renames = rows('rename'), meta = rows('overwrite').filter(r => r.metadataOnly), del = rows('delete'), keep = rows('untouched'), kept = keep.filter(r => r.keptEdited && !r.keptRemoved), keptGone = keep.filter(r => r.keptRemoved);
      const list = (items, fn, cap = SHOWN_ROWS) => `<ul class="ag-rows">${items.slice(0, cap).map(fn).join('')}</ul>${more(Math.min(cap, items.length), items.length)}`;
      if ((plan.offers ?? []).length) parts.push(replacesFold(plan));
      const art = plan.artKept ?? [];
      if (art.length) parts.push(group('Keeping your art', art.length, `<p class="agmanager-tiny">Keeping your art on ${plural(art.length, 'record')}. Art you set yourself is never replaced and never stops a record from updating. Open one to see the fields.</p><ul class="ag-rows">${art.slice(0, SHOWN_ROWS).map(artRow).join('')}</ul>${more(Math.min(SHOWN_ROWS, art.length), art.length)}`, {open: art.length <= 12}));
      const reb = rows('rebind');
      if (reb.length) parts.push(group('Replaced in place', reb.length, list(reb, overwriteRow), {open: reb.length <= 12}));
      parts.push(group('Create', creates.length, creates.length ? list(creates, line) : '<p class="agmanager-tiny">Nothing new.</p>'));
      if (renames.length) parts.push(group('Renames', renames.length, `<p class="agmanager-tiny">The package gives these records a new name. Applying renames the same document (its permanent id, links, folder, ownership and sheets stay; no duplicate is made). A name you changed by hand is never renamed unless you tick Also overwrite records I edited.</p><ul class="ag-rows">${renames.slice(0, SHOWN_ROWS).map(renameLine).join('')}</ul>${more(Math.min(SHOWN_ROWS, renames.length), renames.length)}`, {open: renames.length <= 40}));
      if (state.updateActors || actorUpd.length) parts.push(group('Actor updates', actorUpd.length, `<p class="agmanager-tiny">${actorUpd.length ? 'Each Actor takes what the package changed since the last import. Open one to see the fields. Kept: your art, token settings, ownership, folder, biography notes, items you added, current HP, item uses and quantities. A field of yours that the package also changed is replaced and counted as a GM edit.' : 'No Actor differs from the package.'}</p>${actorUpd.length ? list(actorUpd, overwriteRow) : ''}`, {open: actorUpd.length > 0 && actorUpd.length <= 12}));
      parts.push(group('Overwrite', over.length, `${over.length ? list(over, overwriteRow) : '<p class="agmanager-tiny">No content differs.</p>'}`, {open: over.length > 0 && over.length <= 12}));
      const recs = rows('recreate');
      if (recs.length) parts.push(group('Recreate', recs.length, `<p class="agmanager-tiny">dnd5e cannot change an Item's type in place, so each of these world Items is deleted and created again from the package, keeping its folder, flags from other modules and art you set. Copies on character sheets are untouched.</p><ul class="ag-rows">${recs.slice(0, SHOWN_ROWS).map(r => `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta">${esc(r.recreate.from)} → ${esc(r.recreate.to)}</span></span></li>`).join('')}</ul>${more(Math.min(SHOWN_ROWS, recs.length), recs.length)}`, {open: recs.length <= 12}));
      if (meta.length) parts.push(group(`Metadata refreshes`, meta.length, `<p class="agmanager-tiny">The content of these records already matches. Applying updates the package data stored with each (definition, version, provenance) so new fields reach your world. Names, descriptions, art and everything else on the document stay as they are.</p>${list(meta, line)}`, {open: plan.metadataOnly && meta.length <= 12}));
      parts.push(group('Delete', del.length, del.length ? list(del, line, del.length) : '<p class="agmanager-tiny">Nothing is deleted.</p>', {open: del.length > 0 && del.length <= 40}));
      parts.push(group('Kept: edited in your world', kept.length, kept.length ? `<p class="agmanager-tiny">You changed these since they were imported, so Sync leaves them alone. Open one to see what would differ.</p>${list(kept, overwriteRow)}` : '<p class="agmanager-tiny">No record you edited is affected.</p>', {open: kept.length > 0 && kept.length <= 12}));
      parts.push(group('Kept: edited in your world, no longer in the package', keptGone.length, keptGone.length ? `<p class="agmanager-tiny">These are no longer in the files, but you changed them since they were imported, so Sync does not delete them.</p>${list(keptGone, line, keptGone.length)}` : '<p class="agmanager-tiny">No edited record is missing from the files.</p>', {open: keptGone.length > 0 && keptGone.length <= 12}));
      // 0.71.6: every refused record, grouped by the reason it was refused, so none hides in the Untouched list.
      const refusedAll = keep.filter(r => r.refused);
      if (refusedAll.length) {
        const byReason = new Map();
        for (const r of refusedAll) (byReason.get(r.reason) ?? byReason.set(r.reason, []).get(r.reason)).push(r);
        const blocks = [...byReason].sort((a, b) => b[1].length - a[1].length).map(([reason, list]) => `<li class="ag-row"><details class="ag-row__main"${byReason.size === 1 ? ' open' : ''}><summary><strong>${esc(reason)}</strong> <span class="ag-badge">${plural(list.length, 'record')}</span></summary>
          <ul class="ag-rows">${list.slice(0, SHOWN_ROWS).map(r => `<li class="ag-row"><span class="ag-row__main"><span class="ag-row__title">${esc(r.name)}</span><span class="ag-row__meta">${esc(r.kind)}</span>${r.id ? `<details class="agm-tech" data-ag-technical><summary>Details</summary><code class="agm-id">${esc(r.id)}</code></details>` : ''}</span></li>`).join('')}</ul>${more(Math.min(SHOWN_ROWS, list.length), list.length)}</details></li>`).join('');
        parts.push(group('Refused', refusedAll.length, `<p class="agmanager-tiny">Sync did not touch these records, for the reason shown. Fix the cause in your world (for example delete or rename the document that is in the way) and preview again.</p><ul class="ag-rows">${blocks}</ul>`, {open: true}));
      }
      const refused = keep.filter(r => !r.keptEdited && !r.refused && (r.kept || r.notRemoved)), quiet = keep.length - refusedAll.length - refused.length - kept.length - keptGone.length;
      parts.push(group('Untouched', c.untouched, `${refused.length ? list(refused, line) : ''}<p class="agmanager-tiny">${quiet} record(s) already match the package${plan.outOfScope?.records ? `; ${plan.outOfScope.records} Manager-imported record(s) belong to other package lines or have no line; documents without Manager's flag are never listed or changed` : ''}.</p>`, {open: refused.length > 0 && refused.length <= 12}));
    }
    const ready = !plan.errors.length && (plan.records > 0 || plan.counts.delete > 0 || plan.counts.metadataRefreshes > 0 || plan.counts.supersedeFiles > 0);
    if (!plan.errors.length && !ready) parts.push('<p class="ag-notice ag-notice--info" role="status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> The world already matches these files. Nothing to do.</p>');
    if (ready) {
      parts.push('<h3 class="agm-step"><span class="agm-step__n">3</span> Confirm and run</h3>');
      if (plan.metadataOnly) parts.push(`<p class="ag-notice ag-notice--info" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span><strong>Nothing in your world's content changes.</strong> ${plural(plan.counts.metadataRefreshes, 'record')} will have their stored package data (definition, version, provenance) updated. That is how new fields in the package, such as <code>former_starting</code> on recipes, reach the world.</span></p>`);
      else if (plan.counts.metadataRefreshes) parts.push(`<p class="agmanager-tiny">${plural(plan.counts.metadataRefreshes, 'record')} also get their stored package data refreshed (no content change).</p>`);
      const danger = Boolean(plan.destructive), needsPhrase = phraseRequired(plan);
      if (!needsPhrase) parts.push(`<p class="ag-notice ag-notice--info" role="note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span><strong>Only renames.</strong> ${plural(plan.counts.rename, 'record')} will be renamed to the package's name. Nothing else in your world changes, so no typed confirmation is needed.</span></p>`);
      parts.push(`<div class="ag-field agm-sync-confirm" id="agm-sync-confirm">${needsPhrase ? `<label for="agm-sync-phrase">To confirm, type <strong>${esc(SYNC_PHRASE)}</strong></label>` : ''}
        <div class="ag-cluster">${needsPhrase ? `<input type="text" id="agm-sync-phrase" data-ag-sync-phrase value="${esc(state.phrase)}" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''}>` : ''}
        <button type="button" class="ag-btn ${danger ? 'ag-btn--danger' : 'ag-btn--primary'}" data-ag-action="sync-run" data-ag-sync-run ${busy || (needsPhrase && !phraseOk(state.phrase)) ? 'disabled' : ''}><i class="fa-solid ${danger ? 'fa-trash-can' : needsPhrase ? 'fa-rotate' : 'fa-pen'}" aria-hidden="true"></i> ${esc(plan.buttonLabel)}</button></div>
        <span class="ag-field__hint">A JSON backup of every document this run will overwrite, refresh or delete downloads first (a metadata refresh is included, so the backup is small when only a few records change). If it cannot be saved, nothing is written. Running the same files again changes nothing more, and a run you cancel is finished by running it again.</span></div>`);
    }
    if (state.progress) parts.push(`<div class="ag-cluster agclean-running" aria-label="Sync progress"><progress class="agclean-bar" data-ag-sync-bar max="1" value="${state.progress.pct}" aria-label="Sync progress"></progress>
      <span class="agmanager-tiny" role="status" data-ag-sync-status>${esc(state.stopping ? 'Stopping after the current chunk…' : state.progress.label)}</span>
      <button type="button" class="ag-btn ag-btn--danger" data-ag-sync-stop ${state.stopping ? 'disabled' : ''}><i class="fa-solid fa-stop" aria-hidden="true"></i> Cancel sync</button></div>`);
    if (state.result) parts.push(`<div class="ag-notice ag-notice--${state.result.tone === 'ok' ? 'info' : state.result.tone}" role="status"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i><div>${state.result.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div></div>`);
    parts.push(`<footer class="ag-footer agmanager-footer">
      <button type="button" class="ag-btn ag-btn--ghost" data-ag-action="sync-cancel" ${busy ? 'disabled' : ''}>Cancel</button>
      <span class="ag-footer__status"></span>
      <button type="button" class="ag-btn" data-ag-action="sync-report" ${!plan ? 'disabled' : ''}><i class="fa-solid fa-download" aria-hidden="true"></i> Download preview</button>
      ${ready ? `<button type="button" class="ag-btn" data-ag-action="sync-backup" ${busy ? 'disabled' : ''}><i class="fa-solid fa-download" aria-hidden="true"></i> Download backup</button>` : ''}</footer>`);
  }
  parts.push('</section>');
  return parts.join('\n');
}
