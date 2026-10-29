/**
 * GM Setup (0.43.0): every GM Setup setting saves together with Save Changes, never on its own (decision D4).
 * Ticking a box or picking a skin only changes the form; nothing is written until saveGmSetup runs.
 * Same setting keys as before: codexPlayerAccess, worldSkin (through the appearance controller), core sources.
 * 0.46.0: the NPC Codex player switch moved to the Modules tab (Player Access); codexAccess is still read when present.
 */

/** Reads the GM Setup form. Missing controls stay undefined, so saveGmSetup leaves those settings alone. */
export function readGmSetupForm(root) {
  const q = selector => root?.querySelector?.(selector) ?? null;
  const all = selector => [...(root?.querySelectorAll?.(selector) ?? [])];
  const access = q('[data-ag-codex-access]');
  // 0.46.0: the world skin is a group of skin cards (role="radio"); a <select> still reads the same way.
  const skin = q('[data-ag-setup-skin]');
  const radio = skin?.querySelector?.('[role="radio"][aria-checked="true"]');
  const skinValue = !skin ? undefined : radio ? radio.dataset?.agSkinValue : skin.value;
  const auto = q('[data-ag-setup-auto]');
  const pause = q('[data-ag-setup-pause]');
  const items = q('[data-ag-setup-items]');
  const hideJournals = q('[data-ag-setup-hide-journals]');
  const hideCompendiums = q('[data-ag-setup-hide-compendiums]');
  const handouts = q('[data-ag-setup-handouts-only]');
  const playersFolder = q('[data-ag-setup-players-only]');
  return {
    codexAccess: access ? Boolean(access.checked) : undefined,
    ...(pause ? {compactPause: Boolean(pause.checked)} : {}),
    ...(hideJournals ? {hideJournalsTab: Boolean(hideJournals.checked)} : {}),
    ...(handouts ? {playerHandoutsOnly: Boolean(handouts.checked)} : {}),
    ...(playersFolder ? {playersFolderOnly: Boolean(playersFolder.checked)} : {}),
    ...(hideCompendiums ? {hideCompendiumsTab: Boolean(hideCompendiums.checked)} : {}),
    ...(items ? {itemsReadable: items.value === 'player' ? 'player' : 'gm'} : {}),
    worldSkin: skinValue === undefined ? undefined : String(skinValue),
    sources: auto ? {
      auto: auto.checked !== false,
      packs: all('[data-ag-setup-pack]').filter(el => el.checked).map(el => el.dataset.agSetupPack),
      folders: all('[data-ag-setup-folder]').filter(el => el.checked).map(el => el.dataset.agSetupFolder)
    } : undefined
  };
}

const ids = rows => (rows ?? []).filter(row => row.configured).map(row => row.id).sort().join('\n');
/** true when the form's core sources match what is saved (describeSources rows carry `configured`). */
function sameSources(next, current) {
  if (!current) return false;
  return Boolean(next.auto) === Boolean(current.auto) && [...next.packs].sort().join('\n') === ids(current.packs)
    && [...next.folders].sort().join('\n') === ids(current.folders);
}

/**
 * Writes the GM Setup values. GM only (rejected here, not just hidden). Writes a setting only when its value changed,
 * except core sources, which are saved as one list. Returns {ok, message, saved:[labels]}.
 */
export async function saveGmSetup(values, {game, moduleId, codexAccessKey, itemsKey = null, appearance = null, coreLinks = null}) {
  if (!game?.user?.isGM) throw new Error('Only the GM can change GM Setup.');
  const saved = [], problems = [];
  if (values.worldSkin !== undefined && appearance) {
    const known = appearance.listSkins().some(skin => skin.id === values.worldSkin);
    if (!known) problems.push(`"${values.worldSkin}" is not an Ashen Gate skin`);
    else if (values.worldSkin !== appearance.getState().worldDefault) {
      await appearance.setWorldDefault(values.worldSkin);
      saved.push('world appearance');
    }
  }
  if (values.compactPause !== undefined && appearance?.setCompactPause) {
    if (Boolean(values.compactPause) !== Boolean(appearance.getState().compactPause)) {
      await appearance.setCompactPause(values.compactPause);
      saved.push(values.compactPause ? 'pause shown as a small indicator' : 'pause shown as the large banner');
    }
  }
  if (values.hideJournalsTab !== undefined && appearance?.setHideJournalsTab) {
    if (Boolean(values.hideJournalsTab) !== Boolean(appearance.getState().hideJournalsTab)) {
      await appearance.setHideJournalsTab(values.hideJournalsTab);
      saved.push(values.hideJournalsTab ? 'Journals tab hidden from players' : 'Journals tab shown to players');
    }
  }
  if (values.playerHandoutsOnly !== undefined && appearance?.setPlayerHandoutsOnly) {
    if (Boolean(values.playerHandoutsOnly) !== Boolean(appearance.getState().playerHandoutsOnly)) {
      await appearance.setPlayerHandoutsOnly(values.playerHandoutsOnly);
      saved.push(values.playerHandoutsOnly ? 'players see only Player Handouts in the Items tab' : 'players see the Items tab as before');
    }
  }
  if (values.playersFolderOnly !== undefined && appearance?.setPlayersFolderOnly) {
    if (Boolean(values.playersFolderOnly) !== Boolean(appearance.getState().playersFolderOnly)) {
      await appearance.setPlayersFolderOnly(values.playersFolderOnly);
      saved.push(values.playersFolderOnly ? 'players see only the Players folder in the Actors tab' : 'players see the Actors tab as before');
    }
  }
  if (values.hideCompendiumsTab !== undefined && appearance?.setHideCompendiumsTab) {
    if (Boolean(values.hideCompendiumsTab) !== Boolean(appearance.getState().hideCompendiumsTab)) {
      await appearance.setHideCompendiumsTab(values.hideCompendiumsTab);
      saved.push(values.hideCompendiumsTab ? 'Compendiums tab hidden from players' : 'Compendiums tab shown to players');
    }
  }
  if (values.itemsReadable !== undefined && itemsKey) {
    // 0.72.0: who can read the Items Manager creates. Read when a record is created or updated; existing Items are never changed by it.
    const next = values.itemsReadable === 'player' ? 'player' : 'gm';
    if (next !== (game.settings.get(moduleId, itemsKey) === 'player' ? 'player' : 'gm')) {
      await game.settings.set(moduleId, itemsKey, next);
      saved.push(next === 'gm' ? 'new Items are hidden from players' : 'new approved, player-visible Items are readable by players');
    }
  }
  if (values.codexAccess !== undefined) {
    const before = Boolean(game.settings.get(moduleId, codexAccessKey));
    if (values.codexAccess !== before) {
      await game.settings.set(moduleId, codexAccessKey, values.codexAccess);
      saved.push(values.codexAccess ? 'players can open the NPC Codex' : 'players can no longer open the NPC Codex');
    }
  }
  if (values.sources !== undefined && coreLinks && !sameSources(values.sources, coreLinks.describeSources?.())) {
    const out = await coreLinks.saveSources(values.sources);
    if (out?.ok === false) problems.push(out.message);
    else saved.push('core sources');
  }
  if (problems.length) return {ok: false, saved, message: `Not saved: ${problems.join('; ')}.`};
  return {ok: true, saved, message: saved.length ? `GM Setup saved: ${saved.join(', ')}.` : 'GM Setup saved. Nothing had changed.'};
}
