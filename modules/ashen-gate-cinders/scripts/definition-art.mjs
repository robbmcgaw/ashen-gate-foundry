/** Definition-level art stages (0.13.0): pure rules, no Foundry globals.
 * The GM can give a Cinder KIND (a MUT-* definition) its art stages. They are kept in a world setting keyed by the permanent definition id,
 * not on the imported record, so a General Manager re-import never wipes them. Every bearer of that kind uses them unless their own Cinder
 * has its own stages. Order for one Cinder: its own stages, then these world stages, then `cinder.artStages` on the imported record,
 * then `cinder.art` (the fallback the orb already had). */
import {cleanStages} from './stages.mjs';

export const DEFINITION_ART_SETTING = 'definitionArtStages';
const CINDER_DEFINITION = /^MUT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isCinderDefinitionId = id => CINDER_DEFINITION.test(String(id ?? ''));

/** The saved map as {MUT-ID: [{art, at}]}; anything broken (a bad id, a bad list) reads as absent, so old or hand-edited data never throws. */
export function cleanOverrides(raw) {
  const out = {};
  if (!plain(raw)) return out;
  for (const [id, list] of Object.entries(raw)) {
    const stages = isCinderDefinitionId(id) ? cleanStages(list) : null;
    if (stages) out[id] = stages;
  }
  return out;
}
/** A copy of the map with one definition's stages set, or removed when `stages` is null. Other entries (including ones for definitions not in this world) are kept. */
export function withOverride(map, definitionId, stages) {
  const next = {...cleanOverrides(map)};
  if (stages) next[definitionId] = stages; else delete next[definitionId];
  return next;
}
/** Stages in force for one Cinder: {stages, source: 'cinder' | 'world' | 'definition' | null}. All inputs are stage lists or null. */
export function resolveStages({own = null, override = null, record = null} = {}) {
  const pick = [['cinder', own], ['world', override], ['definition', record]].map(([source, list]) => [source, cleanStages(list)]).find(([, list]) => list);
  return pick ? {stages: pick[1], source: pick[0]} : {stages: null, source: null};
}
const words = text => String(text ?? '').toLowerCase().replace(/\bcinder\b/g, ' ').split(/[^a-z0-9]+/).filter(Boolean).join(' ');
/** Which Cinder definition a caller means: a permanent id (MUT-…), or a name such as "Echo" or "Echo Cinder". `defs` is [{id, name}].
 * Returns the id; throws when nothing fits or the name fits more than one. */
export function matchDefinition(defs, key) {
  const text = String(key ?? '').trim();
  if (!text) throw Error('Choose a Cinder');
  const byId = defs.find(d => d.id === text);
  if (byId) return byId.id;
  if (isCinderDefinitionId(text)) throw Error('That Cinder is not in this world. Import it through General Manager first.');
  const want = words(text);
  const hits = want ? defs.filter(d => words(d.name) === want) : [];
  if (hits.length === 1) return hits[0].id;
  throw Error(hits.length ? `More than one Cinder is called ${text}. Use its permanent id.` : `No Cinder named ${text} is in this world. Import it through General Manager first.`);
}
