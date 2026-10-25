/**
 * "Reveal to..." dialog for the NPC Codex (0.67.0). Pure markup and form helpers plus one DialogV2 wrapper.
 * One tick per character, one tick per field, one confirm. Nothing here saves anything: the caller applies the
 * result through api.codex (GM-only), so permissions stay in the data layer.
 */
import {REVEAL_PRESETS, REVEAL_KEYS, DEFAULT_REVEAL_KEYS, GM_FIELDS, joinNames} from './codex.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

/** Sensible starting audience: the characters whose players are connected, or the whole party when that is everyone or no one. */
export function defaultAudience(characters = []) {
  const here = characters.filter(c => c.present);
  return here.length && here.length < characters.length
    ? {audience: 'chosen', characterIds: here.map(c => c.id)} : {audience: 'party', characterIds: []};
}
/** Fields offered: every revealable key with content now ("discovery" always). Defaults tick the public-facing ones. */
export function dialogFields(entry) {
  const byKey = new Map((entry?.fields ?? []).map(f => [f.key, f]));
  return REVEAL_KEYS.map(key => {
    if (key === 'discovery') return {key, label: 'Name and portrait', empty: false, now: entry?.discoveryLabel ?? 'Hidden'};
    const f = byKey.get(key);
    return {key, label: f?.label ?? key, empty: Boolean(f?.empty), now: f?.who ?? 'Hidden'};
  });
}
export function revealDialogHtml({name = 'this NPC', characters = [], fields = [], defaults = {}} = {}) {
  const aud = defaults.audience ?? defaultAudience(characters).audience;
  const ids = new Set(defaults.characterIds ?? defaultAudience(characters).characterIds);
  const keys = new Set(defaults.keys ?? DEFAULT_REVEAL_KEYS);
  const chars = characters.length
    ? characters.map(c => `<label class="agcodex-pick"><input type="checkbox" name="character" value="${esc(c.id)}"${ids.has(c.id) ? ' checked' : ''}> `
      + `<span>${esc(c.name)}${c.owners?.length ? ` <small>(${esc(c.owners.join(', '))})</small>` : ''}</span></label>`).join('')
    : '<p class="hint">No player characters yet (character Actors with a player owner). You can still reveal to the whole party.</p>';
  const rows = fields.map(f => `<label class="agcodex-pick"><input type="checkbox" name="field" value="${esc(f.key)}"${keys.has(f.key) && !f.empty ? ' checked' : ''}${f.empty ? ' disabled' : ''}> `
    + `<span>${esc(f.label)} <small>${f.empty ? 'Not set' : `Now: ${esc(f.now)}`}</small></span></label>`).join('');
  return `<div class="agcodex-dialog" data-ag-reveal-dialog>`
    + `<p>Choose who learns what about <strong>${esc(name)}</strong>. Players see it the next time they open the codex.</p>`
    + `<fieldset class="agcodex-dialog__group"><legend>Who learns it</legend>`
    + `<label class="agcodex-pick"><input type="radio" name="audience" value="party"${aud === 'party' ? ' checked' : ''}> <span>Whole party</span></label>`
    + `<label class="agcodex-pick"><input type="radio" name="audience" value="chosen"${aud === 'chosen' ? ' checked' : ''}> <span>Chosen characters</span></label>`
    + `<div class="agcodex-dialog__list">${chars}</div>`
    + (characters.length ? `<div class="agcodex-dialog__tools"><button type="button" data-act="chars-all">All characters</button><button type="button" data-act="chars-clear">Clear characters</button></div>` : '')
    + `</fieldset>`
    + `<fieldset class="agcodex-dialog__group"><legend>What they learn</legend>`
    + `<div class="agcodex-dialog__tools"><button type="button" data-act="preset-basics">${esc(REVEAL_PRESETS.basics.label)}</button>`
    + `<button type="button" data-act="preset-everything">${esc(REVEAL_PRESETS.everything.label)}</button><button type="button" data-act="fields-none">Clear fields</button></div>`
    + `<div class="agcodex-dialog__list">${rows}</div>`
    + `<p class="hint">${esc(GM_FIELDS.map(k => k.replace(/_/g, ' ')).join(', '))} are GM-only and are never shared.</p></fieldset>`
    + `<p class="agcodex-dialog__summary" role="status" aria-live="polite" data-ag-reveal-summary></p></div>`;
}
/** Reads the dialog form: {mode: 'party'|'actors', characters: [ids], fields: [keys]}. */
export function readRevealDialog(form) {
  const out = {mode: 'party', characters: [], fields: []};
  for (const el of form?.elements ?? []) {
    if (!el?.name) continue;
    if (el.name === 'audience' && el.checked) out.mode = el.value === 'chosen' ? 'actors' : 'party';
    else if (el.name === 'character' && el.checked) out.characters.push(el.value);
    else if (el.name === 'field' && el.checked && !el.disabled) out.fields.push(el.value);
  }
  return out;
}
/** Why the dialog cannot confirm yet, or '' when it can. */
export function revealDialogProblem(pick) {
  if (!pick.fields.length) return 'Tick at least one field.';
  if (pick.mode === 'actors' && !pick.characters.length) return 'Tick at least one character, or choose the whole party.';
  return '';
}
export function revealDialogSummary(pick, characters = []) {
  const problem = revealDialogProblem(pick);
  if (problem) return problem;
  const n = pick.fields.length, noun = `${n} field${n === 1 ? '' : 's'}`;
  return pick.mode === 'party' ? `Will reveal ${noun} to the whole party.`
    : `Will reveal ${noun} to ${joinNames(pick.characters.map(id => characters.find(c => c.id === id)?.name ?? 'a character'))}.`;
}
/** Live behaviour inside the open dialog: presets and All/Clear tick boxes, picking a character chooses "Chosen characters",
 * the summary line and the confirm button follow. */
export function wireRevealDialog(root, {characters = [], presetKeysFor = () => [], confirmSelector = 'button[data-action="reveal"]'} = {}) {
  const form = root?.querySelector?.('form') ?? root;
  if (!form) return;
  const boxes = name => [...form.querySelectorAll(`input[name="${name}"]`)];
  const sync = () => {
    const pick = readRevealDialog(form);
    const line = form.querySelector('[data-ag-reveal-summary]');
    if (line) line.textContent = revealDialogSummary(pick, characters);
    const ok = (root?.querySelector ? root : form).querySelector(confirmSelector);
    if (ok) ok.disabled = Boolean(revealDialogProblem(pick));
  };
  form.addEventListener('change', event => {
    if (event.target?.name === 'character' && event.target.checked) {
      const chosen = boxes('audience').find(r => r.value === 'chosen'); if (chosen) chosen.checked = true;
    }
    sync();
  });
  form.addEventListener('click', event => {
    const act = event.target?.closest?.('[data-act]')?.dataset?.act;
    if (!act) return;
    event.preventDefault();
    if (act === 'chars-all' || act === 'chars-clear') {
      boxes('character').forEach(b => { b.checked = act === 'chars-all'; });
      const radio = boxes('audience').find(r => r.value === (act === 'chars-all' ? 'chosen' : 'party')); if (radio) radio.checked = true;
    } else if (act === 'fields-none') boxes('field').forEach(b => { b.checked = false; });
    else if (act.startsWith('preset-')) {
      const keys = new Set(presetKeysFor(act.slice(7)));
      boxes('field').forEach(b => { b.checked = keys.has(b.value) && !b.disabled; });
    }
    sync();
  });
  sync();
}
/**
 * Opens the dialog. Resolves {mode, characters, fields} on the confirm button, or null on Cancel/close.
 * entry: the GM view of the NPC (api.codex.get), characters: api.codex.characters(). Without DialogV2 resolves null.
 */
export async function askRevealTo({entry, characters}) {
  const D = globalThis.foundry?.applications?.api?.DialogV2;
  if (!D?.wait) return null;
  const fields = dialogFields(entry);
  const preset = name => REVEAL_PRESETS[name] ? REVEAL_PRESETS[name].keys.filter(k => fields.find(f => f.key === k && !f.empty)) : [];
  const result = await D.wait({
    classes: ['ag-app', 'ag-dialog', 'agcodex-dialog-window'], window: {title: `Reveal ${entry.name} to…`}, modal: true, rejectClose: false,
    content: revealDialogHtml({name: entry.name, characters, fields}),
    render: (event, dialog) => wireRevealDialog(dialog?.element ?? event?.target?.element, {characters, presetKeysFor: preset}),
    buttons: [{action: 'cancel', label: 'Cancel', callback: () => null},
      {action: 'reveal', label: 'Reveal', icon: 'fa-solid fa-eye', default: true, callback: (event, button) => {
        const pick = readRevealDialog(button?.form ?? event?.currentTarget?.form);
        return revealDialogProblem(pick) ? null : pick;
      }}]
  });
  return result && typeof result === 'object' ? result : null;
}

/** The Reveals tab's "reveal several fields" panel: label, whether Apply and the one-click presets can run, and the hint. */
export function bulkStatus({count = 0, mode = 'party', charCount = 0} = {}) {
  const needChars = mode === 'actors' && !charCount;
  return {
    label: `Apply to ${count} field${count === 1 ? '' : 's'}`,
    disabled: !count || needChars,
    presetsOk: mode === 'party' || (mode === 'actors' && charCount > 0),
    hint: !count ? 'Tick at least one field.'
      : needChars ? 'Tick at least one character, or choose Whole party.'
      : mode === 'hidden' ? 'Hides the ticked fields from every player. The one-click reveals need Whole party or Chosen characters.'
      : 'Applies at once. You can undo it right after.'
  };
}
