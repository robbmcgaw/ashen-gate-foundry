/**
 * Sync from package (0.55.0): reading the files the GM chose. Several ZIPs and JSON files are read in one go and form one
 * sync set, so "missing from the package" is judged against the union of all of them. Reading never writes to the world;
 * each ZIP keeps the reader's own limits (50 import files, 500 entries, 60 MB).
 */
import {readImportBundle, isProjection, importOrderHint} from './zip-import.js';
import {detectSpecialistFile, specialistCount, SPECIALISTS} from './specialist-handoff.js';
import {classifyDelivery} from './delivery.js';

const LABELS = {manager: 'Manager package', ...Object.fromEntries(Object.entries(SPECIALISTS).map(([k, s]) => [k, s.label]))};

/** One chosen file → {sources, skipped, assets, duplicateArt}. `file` needs name, size and arrayBuffer() or text(). */
export async function readSyncInput(file, JSZipClass = globalThis.JSZip) {
  const out = {name: file.name, sources: [], skipped: [], assets: new Map(), duplicateArt: []};
  if (/\.zip$/i.test(file.name)) {
    if (file.size > 60_000_000) throw new Error(`${file.name}: the maximum ZIP is 60 MB.`);
    const bundle = await readImportBundle(await file.arrayBuffer(), JSZipClass);
    for (const f of bundle.files) {
      const filename = `${file.name} › ${f.filename}`;
      if (f.kind && f.status !== 'error') out.sources.push({filename, origin: file.name, kind: f.kind, label: f.label, payload: f.payload});
      else out.skipped.push({filename, reason: f.notice || 'Not an import file.'});
    }
    for (const s of bundle.skipped) out.skipped.push({filename: `${file.name} › ${s.filename}`, reason: s.reason});
    out.assets = bundle.assets; out.duplicateArt = bundle.duplicateArt;
    return out;
  }
  if (!/\.json$/i.test(file.name) || file.size > 10_000_000) throw new Error(`${file.name}: choose JSON (up to 10 MB) or ZIP (up to 60 MB).`);
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} is not valid JSON.`); }
  if (isProjection(payload)) {
    if (!Array.isArray(payload.records) || !payload.records.length) throw new Error(`${file.name}: the package has no records.`);
    out.sources.push({filename: file.name, origin: file.name, kind: 'manager', label: LABELS.manager, payload});
    return out;
  }
  if (importOrderHint(payload)) { out.skipped.push({filename: file.name, reason: 'Import order list; a sync orders its own files.'}); return out; }
  const kind = detectSpecialistFile(payload);
  if (kind && specialistCount(kind, payload)) { out.sources.push({filename: file.name, origin: file.name, kind, label: LABELS[kind], payload}); return out; }
  out.skipped.push({filename: file.name, reason: classifyDelivery(payload)?.notice ?? 'Not a Manager package or a Quest, Skill Tree, Headquarters, Factions or Strain file.'});
  return out;
}

/** The union of everything read so far: sources, skipped files and artwork (a name used by two ZIPs is dropped as ambiguous). */
export function joinSyncInputs(inputs) {
  const sources = [], skipped = [], assets = new Map(), ambiguous = new Set();
  for (const input of inputs) {
    sources.push(...input.sources); skipped.push(...input.skipped);
    for (const [name, value] of input.assets) {
      if (assets.has(name) || ambiguous.has(name)) { assets.delete(name); ambiguous.add(name); } else assets.set(name, value);
    }
    for (const name of input.duplicateArt) { assets.delete(name); ambiguous.add(name); }
  }
  return {sources, skipped, assets, ambiguousArt: [...ambiguous]};
}
