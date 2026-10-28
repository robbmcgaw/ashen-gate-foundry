// Display helpers for a standing track (no Foundry globals): the rank-dot ladder, the meter toward the next rank,
// and which milestone card is the current one. Works on GM milestones and on players' projected milestones alike.

/** {current, next, remaining, percent, steps:[{id,name,threshold,done,current}]} for a score on a milestone list. */
export function standingView(milestones = [], score = 0) {
  const ms = [...(milestones ?? [])].sort((a, b) => a.threshold - b.threshold);
  const s = Number(score) || 0;
  const index = ms.reduce((at, m, k) => s >= m.threshold ? k : at, -1);
  const next = ms[index + 1] ?? null, base = index >= 0 ? ms[index].threshold : 0;
  const percent = next ? Math.max(0, Math.min(100, Math.round(100 * (s - base) / Math.max(1, next.threshold - base)))) : 100;
  return {
    score: s, current: index >= 0 ? ms[index].name : '', currentId: index >= 0 ? ms[index].id : null,
    next: next ? {name: next.name, threshold: next.threshold} : null, remaining: next ? Math.max(0, next.threshold - s) : 0, percent,
    steps: ms.map((m, k) => ({id: m.id, name: m.name, threshold: m.threshold, done: k <= index, current: k === index}))
  };
}

/** The milestone list with isActive on the current (highest reached) milestone. */
export function markCurrent(milestones = [], score = 0) {
  // A locked card (0.25.0) is never the current rank, even when a god's piety is past it but no Vow is sworn.
  const {currentId} = standingView((milestones ?? []).filter(m => !m.lockedCard), score);
  return (milestones ?? []).map(m => ({...m, isActive: currentId !== null && m.id === currentId}));
}

const escapeText = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Splits reward or rank text into paragraphs: a blank line (two or more line breaks) starts a new one. Single line breaks stay inside a paragraph. */
export function paragraphsOf(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(p => p.replace(/^\n+|\n+$/g, '')).filter(p => p.trim());
}

/** Escaped HTML for reward and rank text: one <p> per paragraph inside one wrapper (white-space: pre-line keeps single breaks). '' when empty. */
export function paragraphHTML(text, cls = 'agf-reward__text') {
  const paras = paragraphsOf(text);
  return paras.length ? `<div class="agf-prose ${escapeText(cls)}">${paras.map(p => `<p>${escapeText(p)}</p>`).join('')}</div>` : '';
}
