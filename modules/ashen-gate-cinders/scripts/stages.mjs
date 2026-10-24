/** Cinder art stages (0.12.0): pure rules, no Foundry globals.
 * A Cinder can have 2 to 5 ordered images. Stage 1 applies from the bind; a later stage applies once the bearer has unlocked at least
 * `at` nodes on the Cinder's tree. The GM can hold the Cinder at a stage (or set one by hand); players never change it. */
import {cleanArt} from './orb.mjs';

export const STAGES_MIN = 2;
export const STAGES_MAX = 5;
export const AT_MAX = 999;
/** What a new stage list starts from: Unlocks needed for stages 1 to 5. */
export const DEFAULT_THRESHOLDS = Object.freeze([0, 3, 6, 10, 14]);

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const whole = v => Number.isSafeInteger(v) && v >= 0 && v <= AT_MAX;

/** Every problem with a stage list, each naming the stage; [] when it is valid. `where` prefixes the messages (e.g. "MUT-X: cinder.artStages"). */
export function stageProblems(raw, where = 'artStages') {
  if (!Array.isArray(raw)) return [`${where} must be a list of ${STAGES_MIN} to ${STAGES_MAX} stages {art, at}`];
  const errors = [];
  if (raw.length < STAGES_MIN || raw.length > STAGES_MAX) errors.push(`${where} needs ${STAGES_MIN} to ${STAGES_MAX} stages (found ${raw.length})`);
  let prev = -1;
  raw.forEach((s, i) => {
    const at = `${where}[${i}]`;
    if (!plain(s)) { errors.push(`${at}: stage ${i + 1} must be an object {art, at}`); return; }
    const extra = Object.keys(s).filter(k => k !== 'art' && k !== 'at');
    if (extra.length) errors.push(`${at}: stage ${i + 1} only takes art and at (not ${extra.join(', ')})`);
    if (!cleanArt(s.art)) errors.push(`${at}.art: stage ${i + 1} needs an image path (Assets Library or module path) or an http(s) address, up to 1024 characters, without quotes or angle brackets`);
    if (!whole(s.at)) errors.push(`${at}.at: stage ${i + 1} "unlocks needed" must be a whole number from 0 to ${AT_MAX}`);
    else if (i === 0 && s.at !== 0) errors.push(`${at}.at: stage 1 applies from the bind, so its "unlocks needed" must be 0`);
    else if (s.at <= prev) errors.push(`${at}.at: stage ${i + 1} needs more unlocks than stage ${i} (${prev})`);
    if (whole(s.at)) prev = s.at;
  });
  return errors;
}

/** A valid stage list as plain {art, at} rows, else null (so records saved without stages, or with a broken list, read as none). */
export function cleanStages(raw) {
  if (stageProblems(raw).length) return null;
  return raw.map(s => ({art: cleanArt(s.art), at: s.at}));
}
/** setArtStages input: a stage list, or null / [] to use the definition's. Throws the first problem. */
export function stagesInput(raw) {
  if (raw == null || (Array.isArray(raw) && !raw.length)) return null;
  const [problem] = stageProblems(raw);
  if (problem) throw Error(problem);
  return cleanStages(raw);
}
/** A saved hold: a stage number 1 to STAGES_MAX, else null (automatic). */
export const cleanHold = raw => Number.isSafeInteger(raw) && raw >= 1 && raw <= STAGES_MAX ? raw : null;
/** setStageHold input: a stage number, or null for automatic. Throws on anything else. */
export function holdInput(raw, stageCount) {
  if (raw == null) return null;
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > STAGES_MAX) throw Error(`Choose a stage from 1 to ${STAGES_MAX}`);
  if (!stageCount) throw Error('This Cinder has no art stages');
  if (raw > stageCount) throw Error(`This Cinder has ${stageCount} stages`);
  return raw;
}

/**
 * Where a Cinder is: {index (0-based, the stage in use), auto (what the unlock count alone gives), held, count, art, next}.
 * `unlocked` is the number of nodes unlocked on the Cinder's tree; `hold` a stage number or null. A hold past the last stage reads as the last.
 * Returns null when there are no stages.
 */
export function stageState(stages, unlocked = 0, hold = null) {
  const list = cleanStages(stages);
  if (!list) return null;
  const n = Number.isSafeInteger(unlocked) && unlocked > 0 ? unlocked : 0;
  let auto = 0;
  list.forEach((s, i) => { if (s.at <= n) auto = i; });
  const h = cleanHold(hold), held = h != null, index = held ? Math.min(h, list.length) - 1 : auto;
  return {index, auto, held, count: list.length, art: list[index].art, next: list[index + 1] ? list[index + 1].at - n : null};
}

/** Stages for a new editor: the definition's stages if any, else the defaults with the given art on stage 1. */
export function startingStages(current, art = null) {
  const list = cleanStages(current);
  if (list) return list.map(s => ({...s}));
  const first = cleanArt(art);
  return [{art: first ?? '', at: DEFAULT_THRESHOLDS[0]}, {art: '', at: DEFAULT_THRESHOLDS[1]}];
}
