/**
 * 0.78.0: Sync holds the files of the last "Preview in Sync from package". A newer GitHub pull does not replace them, so Preview sync
 * would re-check the old files. These pure helpers decide when Sync is holding an older pull and say so. They never touch the world.
 */
export const STALE_PULL_HINT = 'Sync is holding older files; press Preview in Sync from package.';
export const STALE_REFUSAL = 'Sync is still holding files from an older pull. Press Preview in Sync from package under Pull from GitHub first. Nothing in your world changed.';

const short = commit => String(commit ?? '').slice(0, 7);

/** {heldCommit, newCommit} when Sync holds GitHub-sourced inputs from a different commit than the new pull; otherwise null. Hand-chosen files never count. */
export function staleAfterPull(inputs, held, newCommit) {
  if (!(inputs ?? []).some(i => i?.github)) return null;
  if (!newCommit) return null;
  const heldCommit = held?.commit ?? null;
  if (heldCommit && String(heldCommit) === String(newCommit)) return null;
  return {heldCommit, newCommit};
}

/** The stale record only matters while GitHub-sourced inputs are still held. */
export function activeStale(sync) {
  return sync?.githubStale && (sync.inputs ?? []).some(i => i?.github) ? sync.githubStale : null;
}

/** The notice at the top of the Sync section (short commit ids only). */
export function staleNotice(stale) {
  if (!stale) return '';
  const held = short(stale.heldCommit), fresh = short(stale.newCommit);
  return `Sync is still holding files from an older pull${held ? ` (commit ${held})` : ''}. Press Preview in Sync from package under Pull from GitHub to load the new pull${fresh ? ` (commit ${fresh})` : ''}.`;
}
