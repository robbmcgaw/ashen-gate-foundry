/**
 * Result panel for the Import tab. Turns an import log into plain language: per module what was created, updated,
 * kept and what failed (with the reason and what to do), and where to find it afterwards. Pure logic, no Foundry.
 */

const MODULES = Object.freeze({
  Quest: {label: 'Quest Log', where: 'Quest Log > GM Setup (Actors sidebar launcher)'},
  'Skill Tree': {label: 'Skill Trees', where: 'Skill Trees > Skill Trees tab (Actors sidebar launcher)'},
  Facility: {label: 'Headquarters', where: 'Headquarters > Facility library (shown until the Guildhall is activated), then GM Setup > Facility Catalog'},
  Faction: {label: 'Renown', where: 'Renown > GM Setup (Actors sidebar launcher)'},
  Location: {label: 'Locations', where: 'Locations (Items sidebar launcher)'},
  Route: {label: 'Locations: routes', where: 'Routes are retired in Locations 0.20.0: make a location with type Route (Locations, Items sidebar launcher)'}
});
const DOCUMENTS = {label: 'Manager documents', where: 'Items, Journals, Actors, Roll Tables and Macros in the "Ashen Gate — Imported …" folders; Manager > Library'};

const KEPT = /kept|already|exists|unchanged/i;
const LISTED = new Set(['create', 'update', 'metadata']);

/** What to do about a failure, judged from the module's own message. */
export function fixFor(message, label = 'the module') {
  const text = String(message ?? '');
  if (/initialize gm storage|gm storage/i.test(text)) return 'Open Skill Trees > GM Setup, click Initialize GM Storage, then import again.';
  if (/activate the guildhall/i.test(text)) return 'Activate the Guildhall first: Headquarters (Actors sidebar) > fill in the form > Activate Guildhall, then import again. Updating Headquarters to 0.7.1 or later lets facility definitions import without activation.';
  if (/not active|too old|not installed|enable /i.test(text)) return `Settings > Manage Modules: enable (or update) ${label}, reload Foundry, then import again.`;
  if (/gm only|only a gm|gm authori/i.test(text)) return 'Log in as the GM and import again.';
  if (/import blocked|invalid|validation|duplicate|expected/i.test(text)) return 'Correct the entry named here in the file, then import again.';
  return 'Check the reason, correct the file if it names an entry, then import again. Nothing else was changed for this entry.';
}

function sectionOf(result) {
  return MODULES[result.kind] ?? DOCUMENTS;
}

/** Wording for a single result row, or null when it is a housekeeping row (folders, icon fallbacks, link binds). */
function lineOf(result, names) {
  const mod = sectionOf(result);
  const name = names?.get?.(result.id) ?? '';
  // The id stays in the line (shown only in a GM "Details" fold); the visible message names the record instead.
  const label = name || (result.id ? 'this record' : '');
  const message = result.id ? String(result.message ?? '').split(result.id).join(label) : String(result.message ?? '');
  const base = {id: result.id ?? '', name, message};
  if (result.status === 'ok' && LISTED.has(result.action)) {
    const outcome = result.action === 'create' ? 'created' : 'updated';
    return {...base, outcome, label: outcome === 'created' ? 'Created' : 'Updated'};
  }
  if (result.status === 'skipped') {
    const kept = KEPT.test(result.message ?? '');
    return {...base, outcome: kept ? 'kept' : 'skipped', label: kept ? 'Kept' : 'Skipped',
      fix: kept ? '' : fixFor(result.message, mod.label)};
  }
  if (result.status === 'error') {
    const aborted = result.action === 'import-aborted';
    return {...base, outcome: 'failed', label: aborted ? 'Import stopped' : 'Failed',
      message: message || 'No reason was given.', fix: fixFor(result.message, mod.label)};
  }
  if (result.status === 'warning') return {...base, outcome: 'warning', label: 'Warning'};
  if (result.status === 'note') return {...base, outcome: 'note', label: 'Note'};
  return null;
}

const countText = c => [`${c.created} created`, `${c.updated} updated`, `${c.kept} kept`, `${c.failed} failed`,
  ...(c.skipped ? [`${c.skipped} skipped`] : [])].join(' · ');

/**
 * One panel entry for one apply. `file` is the label for what was imported (file name or package id).
 * `names` optionally maps record ids to display names.
 */
export function buildImportReport({file, results = [], at = new Date().toISOString(), names, notes = []}) {
  const sections = new Map();
  for (const result of results) {
    const line = lineOf(result, names);
    if (!line) continue;
    const mod = sectionOf(result);
    if (!sections.has(mod.label)) sections.set(mod.label, {module: mod.label, where: mod.where,
      counts: {created: 0, updated: 0, kept: 0, failed: 0, skipped: 0}, lines: []});
    const section = sections.get(mod.label);
    if (line.outcome in section.counts) section.counts[line.outcome]++;
    section.lines.push(line);
  }
  const list = [...sections.values()].map(s => ({...s, countText: countText(s.counts), hasFailures: s.counts.failed > 0 || s.counts.skipped > 0}));
  const total = key => list.reduce((n, s) => n + s.counts[key], 0);
  const failed = total('failed'), skipped = total('skipped');
  const tone = failed ? 'error' : skipped || list.some(s => s.lines.some(l => l.outcome === 'warning')) ? 'warn' : 'ok';
  const none = !list.length;
  const headline = none ? 'Nothing was imported. No records were applied.'
    : `${total('created')} created · ${total('updated')} updated · ${total('kept')} kept as they were · ${failed} failed${skipped ? ` · ${skipped} skipped` : ''}`;
  return {at, file: String(file ?? 'Import'), tone, toneLabel: {ok: 'Done', warn: 'Done with notes', error: 'Needs attention'}[tone],
    headline, sections: list, notes: notes.filter(Boolean), isError: tone === 'error', isWarn: tone === 'warn', isOk: tone === 'ok'};
}

/** A panel entry for an apply that could not start (module off, nothing selected, validation). */
export function buildBlockedReport({file, module = 'Manager', message, fix, at = new Date().toISOString()}) {
  return {at, file: String(file ?? 'Import'), tone: 'error', toneLabel: 'Needs attention', isError: true, isWarn: false, isOk: false,
    headline: 'Nothing was imported.', notes: [],
    sections: [{module, where: '', counts: {created: 0, updated: 0, kept: 0, failed: 1, skipped: 0}, countText: '0 created · 0 updated · 0 kept · 1 failed',
      hasFailures: true, lines: [{outcome: 'failed', label: 'Not started', id: '', name: '', message, fix: fix ?? fixFor(message, module)}]}]};
}

/** Newest first, bounded so a long session does not grow the window without end. */
export const pushReport = (reports, report, max = 8) => [report, ...reports].slice(0, max);
