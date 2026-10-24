/** Stages… editor (0.12.0): the GM's dialog for one Cinder's art stages. The draft model and the markup are pure (tested); openStageEditor wires them into a
 * DialogV2 window with Save Changes / Cancel, an "Unsaved changes" status and the discard guard from the shared kit. */
import {esc, guardDirty} from './ag-dialogs.mjs';
import {cleanArt} from './orb.mjs';
import {STAGES_MIN, STAGES_MAX, AT_MAX, DEFAULT_THRESHOLDS, stageProblems, cleanStages} from './stages.mjs';

/** Draft rows from the stages in force (or two empty rows with the default thresholds). `at` is kept as typed text while editing. */
export function draftFromStages(stages, art = null) {
  const list = cleanStages(stages);
  if (list) return {rows: list.map(s => ({art: s.art, at: String(s.at)}))};
  return {rows: [{art: cleanArt(art) ?? '', at: String(DEFAULT_THRESHOLDS[0])}, {art: '', at: String(DEFAULT_THRESHOLDS[1])}]};
}
const clone = d => ({rows: d.rows.map(r => ({...r}))});
/** Add a stage after the last, with the next default threshold (or 3 more than the last when past the defaults). */
export function addRow(draft) {
  if (draft.rows.length >= STAGES_MAX) return draft;
  const next = clone(draft), last = Number(draft.rows.at(-1)?.at);
  const wanted = DEFAULT_THRESHOLDS[draft.rows.length] ?? (Number.isFinite(last) ? last + 3 : 0);
  next.rows.push({art: '', at: String(Number.isFinite(last) && wanted <= last ? last + 1 : wanted)});
  return next;
}
export function removeRow(draft, index) {
  if (draft.rows.length <= STAGES_MIN || index < 0 || index >= draft.rows.length) return draft;
  const next = clone(draft);
  next.rows.splice(index, 1);
  // The first stage always applies from the bind.
  next.rows[0].at = '0';
  return next;
}
/** Swap the images of two neighbouring stages; each stage keeps its own "Unlocks needed" so the numbers stay in order. */
export function moveRow(draft, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= draft.rows.length || index < 0 || index >= draft.rows.length) return draft;
  const next = clone(draft);
  [next.rows[index].art, next.rows[to].art] = [next.rows[to].art, next.rows[index].art];
  return next;
}
export function setRow(draft, index, field, value) {
  if (!draft.rows[index] || (field !== 'art' && field !== 'at')) return draft;
  const next = clone(draft);
  next.rows[index][field] = String(value ?? '');
  return next;
}
const asNumber = text => (/^\s*\d+\s*$/.test(String(text)) ? Number(text) : NaN);
/** The stages the draft would save (art trimmed, at as a number); not necessarily valid. */
export const draftStages = draft => draft.rows.map(r => ({art: String(r.art ?? '').trim(), at: asNumber(r.at)}));
/** {errors: {"0.art": text, "1.at": text, …}, list: [all messages]}; empty when the draft can be saved. */
export function draftErrors(draft) {
  const errors = {}, list = [];
  const note = (key, text) => { (errors[key] ??= []).push(text); list.push(text); };
  const rows = draftStages(draft);
  rows.forEach((r, i) => {
    if (!cleanArt(r.art)) note(`${i}.art`, r.art ? `Stage ${i + 1}: that is not an image path I can use (an Assets Library path or an http(s) address, no quotes or angle brackets).` : `Stage ${i + 1}: choose an image.`);
    if (!Number.isSafeInteger(r.at) || r.at < 0 || r.at > AT_MAX) note(`${i}.at`, `Stage ${i + 1}: Unlocks needed must be a whole number from 0 to ${AT_MAX}.`);
  });
  if (!list.length) for (const p of stageProblems(rows)) {
    const m = /\[(\d+)\]\.(art|at)/.exec(p);
    note(m ? `${m[1]}.${m[2]}` : 'rows', p.replace(/^[^:]*:\s*/, ''));
  }
  return {errors, list};
}
/** Has the draft changed from the stages it started from? */
export const draftChanged = (draft, start) => JSON.stringify(draft.rows.map(r => [String(r.art).trim(), String(r.at).trim()])) !== JSON.stringify(start.rows.map(r => [String(r.art).trim(), String(r.at).trim()]));

/** The editor's markup. `focus` = a data-agc-sfocus value to give focus to after a re-render. */
export function editorHtml(draft, {errors = {}, source = 'cinder', unlocked = 0, definitionHas = false} = {}) {
  const n = draft.rows.length;
  const err = key => (errors[key] ?? []).join(' ');
  const rows = draft.rows.map((r, i) => {
    const src = cleanArt(String(r.art).trim()), eArt = err(`${i}.art`), eAt = err(`${i}.at`);
    return `<li class="agc-stage" data-agc-row="${i}">
      <div class="agc-stage__thumb">${src ? `<img src="${esc(src)}" alt="Stage ${i + 1} preview" loading="lazy">` : '<span class="agc-stage__empty">No image</span>'}</div>
      <div class="agc-stage__fields">
        <p class="agc-stage__title"><strong>Stage ${i + 1}</strong>${i === 0 ? ' <span class="ag-badge">From the bind</span>' : ''}</p>
        <label class="ag-field">Image<span class="agc-stage__path"><input type="text" data-agc-sart="${i}" value="${esc(r.art)}" placeholder="ashen-gate/cinders/stage-${i + 1}.webp"${eArt ? ' aria-invalid="true"' : ''}>
          <button type="button" class="ag-btn ag-btn--sm" data-agc-spick="${i}" data-agc-sfocus="pick-${i}"><i class="fa-solid fa-image" aria-hidden="true"></i> Choose image…</button></span>
          <span class="ag-field__hint is-error" data-agc-serr="${i}.art"${eArt ? '' : ' hidden'}>${esc(eArt)}</span></label>
        <label class="ag-field">Unlocks needed<input type="number" class="agc-num" min="0" max="${AT_MAX}" step="1" inputmode="numeric" data-agc-sat="${i}" value="${esc(r.at)}"${i === 0 ? ' readonly' : ''}${eAt ? ' aria-invalid="true"' : ''}>
          <span class="ag-field__hint">${i === 0 ? 'Stage 1 always applies from the bind.' : 'Skill Tree nodes the bearer has unlocked on this Cinder.'}</span>
          <span class="ag-field__hint is-error" data-agc-serr="${i}.at"${eAt ? '' : ' hidden'}>${esc(eAt)}</span></label>
      </div>
      <div class="agc-stage__tools">
        <button type="button" class="ag-btn ag-btn--sm ag-btn--icon" data-agc-smove="${i}" data-dir="-1" data-agc-sfocus="up-${i}" aria-label="Move stage ${i + 1} image up" data-tooltip="Move image up"${i === 0 ? ' disabled' : ''}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
        <button type="button" class="ag-btn ag-btn--sm ag-btn--icon" data-agc-smove="${i}" data-dir="1" data-agc-sfocus="down-${i}" aria-label="Move stage ${i + 1} image down" data-tooltip="Move image down"${i === n - 1 ? ' disabled' : ''}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
        <button type="button" class="ag-btn ag-btn--sm" data-agc-sremove="${i}" data-agc-sfocus="remove-${i}"${n <= STAGES_MIN ? ' disabled' : ''}><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button>
      </div></li>`;
  }).join('');
  const rowError = err('rows');
  return `<form class="agc-stages" data-agc-stages novalidate onsubmit="return false">
    <p class="ag-field__hint">${source === 'definition' ? 'These stages come from the Cinder\'s definition. Saving gives this Cinder its own copy.' : 'This Cinder has its own stages.'} Stage 1 applies from the bind; each later stage applies once the bearer has unlocked that many nodes (${unlocked} now). The image order moves the pictures, not the numbers.</p>
    <ol class="agc-stage-list">${rows}</ol>
    <p class="ag-field__hint is-error" data-agc-serr="rows"${rowError ? '' : ' hidden'}>${esc(rowError)}</p>
    <div class="agc-stage-actions"><button type="button" class="ag-btn ag-btn--sm" data-agc-sadd data-agc-sfocus="add"${n >= STAGES_MAX ? ' disabled' : ''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Add stage</button>
      <span class="ag-field__hint">${n} of ${STAGES_MAX} stages</span>
      ${source === 'cinder' ? `<button type="button" class="ag-btn ag-btn--sm" data-agc-sdefault data-agc-sfocus="default"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${definitionHas ? 'Use the definition\'s stages' : 'Remove this Cinder\'s stages'}</button>` : ''}</div>
    <p class="agc-stage-status ag-field__hint" data-agc-sstatus role="status" aria-live="polite"></p>
  </form>`;
}

/**
 * Open the editor. Resolves when the window closes.
 *   info: api.stages(instanceId); pickImage(current, setPath): opens the file picker and calls setPath(path);
 *   save(stages | null): persists (null = back to the definition's stages), throws to keep the window open.
 */
export async function openStageEditor({info, art = null, name = 'Cinder', pickImage, save, dialog = globalThis.foundry?.applications?.api?.DialogV2}) {
  if (!dialog?.wait) throw Error('Dialogs are not available');
  const start = draftFromStages(info.stages, art);
  let draft = clone(start), shown = {};
  const source = info.own ? 'cinder' : (info.definition ? 'definition' : 'new');
  let root = null, dlg = null, pendingFocus = null;
  const status = () => root?.querySelector('[data-agc-sstatus]') ?? null;
  const guard = guardDirty({status});
  const paint = () => {
    root.innerHTML = editorHtml(draft, {errors: shown, source: source === 'new' ? 'cinder' : source, unlocked: info.unlocked ?? 0, definitionHas: Boolean(info.definition)});
    bind();
    if (pendingFocus) { root.querySelector(`[data-agc-sfocus="${pendingFocus}"]:not([disabled])`)?.focus?.(); pendingFocus = null; }
    if (draftChanged(draft, start)) guard.markDirty(); else guard.markClean();
  };
  const sync = () => { // take what is typed into the draft
    root.querySelectorAll('[data-agc-sart]').forEach(el => { draft = setRow(draft, Number(el.dataset.agcSart), 'art', el.value); });
    root.querySelectorAll('[data-agc-sat]').forEach(el => { draft = setRow(draft, Number(el.dataset.agcSat), 'at', el.value); });
  };
  const showErrors = () => {
    const {errors} = draftErrors(draft);
    shown = errors;
    for (const el of root.querySelectorAll('[data-agc-serr]')) { const msg = (errors[el.dataset.agcSerr] ?? []).join(' '); el.textContent = msg; el.hidden = !msg; }
    for (const el of root.querySelectorAll('[data-agc-sart],[data-agc-sat]')) {
      const key = el.dataset.agcSart != null ? `${el.dataset.agcSart}.art` : `${el.dataset.agcSat}.at`;
      if (errors[key]) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    }
  };
  function bind() {
    const form = root.querySelector('[data-agc-stages]');
    guard.watch(form);
    form.addEventListener('input', event => {
      const el = event.target;
      if (el?.dataset?.agcSart != null) {
        const thumb = root.querySelector(`[data-agc-row="${el.dataset.agcSart}"] .agc-stage__thumb`), src = cleanArt(el.value.trim());
        if (thumb) thumb.innerHTML = src ? `<img src="${esc(src)}" alt="Stage ${Number(el.dataset.agcSart) + 1} preview">` : '<span class="agc-stage__empty">No image</span>';
      }
    });
    const rerun = (fn, focus) => { sync(); draft = fn(draft); pendingFocus = focus; paint(); };
    root.querySelector('[data-agc-sadd]')?.addEventListener('click', () => rerun(addRow, `add`));
    root.querySelectorAll('[data-agc-sremove]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.agcSremove); rerun(d => removeRow(d, i), 'add'); }));
    root.querySelectorAll('[data-agc-smove]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.agcSmove), dir = Number(b.dataset.dir);
      rerun(d => moveRow(d, i, dir), `${dir < 0 ? 'up' : 'down'}-${i + dir}`);
    }));
    root.querySelectorAll('[data-agc-spick]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.agcSpick);
      sync();
      Promise.resolve(pickImage?.(draft.rows[i].art, path => { draft = setRow(draft, i, 'art', path); pendingFocus = `pick-${i}`; paint(); guard.markDirty(); }))
        .catch(error => { const s = status(); if (s) s.textContent = error.message; });
    }));
    root.querySelector('[data-agc-sdefault]')?.addEventListener('click', async () => {
      try { await save(null); guard.markClean(); await dlg?.close?.(); } catch (error) { const s = status(); if (s) s.textContent = error.message; }
    });
  }
  const content = `<div data-agc-stage-root></div>`;
  await dialog.wait({
    classes: ['ag-app', 'ag-dialog', 'agc-stage-dialog'], window: {title: `Stages: ${name}`, resizable: true}, position: {width: 640}, content, modal: true, rejectClose: false,
    render: (event, d) => {
      dlg = d;
      const el = d.element ?? event?.target?.element;
      root = el?.querySelector?.('[data-agc-stage-root]');
      if (!root) return;
      const origClose = d.close.bind(d);
      // Closing with the window's X, Escape or Cancel asks first while there are unsaved edits.
      d.close = async options => ((options?.force) || await guard.confirm()) ? origClose(options) : undefined;
      paint();
    },
    buttons: [
      {action: 'cancel', label: 'Cancel', callback: () => 'cancel'},
      {action: 'save', label: 'Save Changes', default: true, callback: async () => {
        sync();
        const {list} = draftErrors(draft);
        if (list.length) { showErrors(); root.querySelector('[aria-invalid="true"]')?.focus?.(); throw Error(list[0]); }
        const stages = draftStages(draft);
        if (!draftChanged(draft, start)) return 'unchanged';
        try { await save(stages); } catch (error) { const s = status(); if (s) s.textContent = error.message; throw error; }
        guard.markClean();
        return 'saved';
      }}
    ]
  });
}
