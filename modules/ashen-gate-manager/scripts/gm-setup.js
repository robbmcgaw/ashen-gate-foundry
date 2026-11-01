/**
 * GM Setup (0.43.0): every GM Setup setting saves together with Save Changes, never on its own (decision D4).
 * Ticking a box or picking a skin only changes the form; nothing is written until saveGmSetup runs.
 * Same setting keys as before: codexPlayerAccess, worldSkin (through the appearance controller), core sources.
 * 0.46.0: the NPC Codex player switch moved to the Modules tab (Player Access); codexAccess is still read when present.
 */

/** Reads the GM Setup form. Missing controls stay undefined, so saveGmSetup leaves those settings alone. */
import { PLAYER_SCREEN_FLAGS, DOCK_CORNERS, cleanAutoCollapse } from './appearance.js';
import { cleanTestPlayerIds, readTestPlayers, TEST_PLAYERS_SETTING } from './test-players.js';
import { policyFromChecklist, presetOf, samePolicy, isEverything, summarizeRows, CHAT_TAB } from './sidebar-policy.js';

/** Tab checklist (0.84.0): every box carries data-ag-setup-tab="<tab id>"; ticked = players keep that tab. Chat is locked on. */
export const TAB_BOX = '[data-ag-setup-tab]';
const tabBoxes = root => [...(root?.querySelectorAll?.(TAB_BOX) ?? [])];
/** The ticked / listed tab ids of a form, Chat always kept. Null when the form has no checklist. */
export function readTabChecklist(root) {
  const boxes = tabBoxes(root);
  if (!boxes.length) return null;
  const listed = boxes.map(b => b.dataset?.agSetupTab).filter(Boolean);
  const kept = boxes.filter(b => b.checked || b.dataset?.agSetupTab === CHAT_TAB).map(b => b.dataset.agSetupTab);
  return policyFromChecklist(listed, kept);
}
/** Ticks every tab (preset 'everything') or only Chat (preset 'chat') in the form. Changes the form only; nothing is saved. Returns the policy. */
export function applyTabPreset(root, preset) {
  const boxes = tabBoxes(root);
  for (const box of boxes) if (box.dataset?.agSetupTab !== CHAT_TAB) box.checked = preset !== 'chat';
  return readTabChecklist(root);
}
/** The line under the checklist, from the boxes as they are now. */
export function describeTabChoice(root) {
  const boxes = tabBoxes(root);
  if (!boxes.length) return '';
  return summarizeRows(boxes.map(b => ({ id: b.dataset?.agSetupTab, kept: b.checked || b.dataset?.agSetupTab === CHAT_TAB })));
}

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
  const handouts = q('[data-ag-setup-handouts-only]');
  const playersFolder = q('[data-ag-setup-players-only]');
  const autoCollapse = q('[data-ag-setup-autocollapse]');
  const dockCorner = q('[data-ag-setup-dock-corner]:checked');
  // 0.86.0 World backup: repository, branch and the token typed this time (an empty box means "leave the saved token").
  const backupRepo = q('[data-ag-setup-backup-repo]');
  // Test players: undefined when the section is not in the form, so saving leaves the setting alone.
  const testPlayers = q('[data-ag-test-players]');
  return {
    ...(testPlayers ? {testPlayers: all('[data-ag-setup-test-player]').filter(el => el.checked).map(el => el.dataset.agSetupTestPlayer)} : {}),
    ...(backupRepo ? {backup: {repo: backupRepo.value ?? '', branch: q('[data-ag-setup-backup-branch]')?.value ?? '', token: q('[data-ag-setup-backup-token]')?.value ?? ''}} : {}),
    codexAccess: access ? Boolean(access.checked) : undefined,
    ...(pause ? {compactPause: Boolean(pause.checked)} : {}),
    ...(readTabChecklist(root) ? {playerSidebarTabs: readTabChecklist(root)} : {}),
    ...(handouts ? {playerHandoutsOnly: Boolean(handouts.checked)} : {}),
    ...(playersFolder ? {playersFolderOnly: Boolean(playersFolder.checked)} : {}),
    ...Object.fromEntries(PLAYER_SCREEN_FLAGS.flatMap(flag => { const box = q(`[data-ag-setup-screen="${flag.state}"]`); return box ? [[flag.state, Boolean(box.checked)]] : []; })),
    ...(autoCollapse && String(autoCollapse.value ?? '').trim() !== '' && Number.isFinite(Number(autoCollapse.value)) ? {autoCollapseSeconds: cleanAutoCollapse(autoCollapse.value)} : {}),
    ...(dockCorner && Object.hasOwn(DOCK_CORNERS, dockCorner.value) ? {playerDockCorner: dockCorner.value} : {}),
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
export async function saveGmSetup(values, {game, moduleId, codexAccessKey, itemsKey = null, appearance = null, coreLinks = null, backup = null}) {
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
  if (values.playerSidebarTabs !== undefined && appearance?.setPlayerSidebarTabs) {
    const current = appearance.getState();
    // Written only when the choice differs from what players get now. With no checklist saved yet, "everything" over "everything" is no change.
    if (!samePolicy(values.playerSidebarTabs, current.playerSidebarTabs) || (!current.playerSidebarTabsSaved && !isEverything(values.playerSidebarTabs))) {
      await appearance.setPlayerSidebarTabs(values.playerSidebarTabs);
      const preset = presetOf(values.playerSidebarTabs);
      saved.push(preset === 'everything' ? 'players keep every sidebar tab' : preset === 'chat' ? 'players keep only the Chat tab' : 'sidebar tabs players keep');
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
  for (const flag of PLAYER_SCREEN_FLAGS) {
    if (values[flag.state] !== undefined && appearance?.[flag.setter]) {
      if (Boolean(values[flag.state]) !== Boolean(appearance.getState()[flag.state])) {
        await appearance[flag.setter](values[flag.state]);
        saved.push(`${flag.name}: ${values[flag.state] ? 'on' : 'off'}`);
      }
    }
  }
  if (values.playerDockCorner !== undefined && appearance?.setPlayerDockCorner) {
    if (values.playerDockCorner !== appearance.getState().playerDockCorner) {
      await appearance.setPlayerDockCorner(values.playerDockCorner);
      saved.push('player dock corner');
    }
  }
  if (values.autoCollapseSeconds !== undefined && appearance?.setAutoCollapseSeconds) {
    if (values.autoCollapseSeconds !== appearance.getState().autoCollapseSeconds) {
      await appearance.setAutoCollapseSeconds(values.autoCollapseSeconds);
      saved.push(values.autoCollapseSeconds === 0 ? 'chat and Settings no longer auto-collapse for players' : `chat and Settings collapse for players after ${values.autoCollapseSeconds} seconds`);
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
  if (values.testPlayers !== undefined) {
    // Who sees every module as if Player Access were on (ag-test-players/1). Only existing non-GM users are kept.
    const next = cleanTestPlayerIds(values.testPlayers, game.users).sort();
    const before = [...readTestPlayers(game, moduleId)].sort();
    if (next.join('\n') !== before.join('\n')) {
      await game.settings.set(moduleId, TEST_PLAYERS_SETTING, next);
      saved.push(next.length ? `${next.length} test player${next.length === 1 ? '' : 's'}` : 'no test players');
    }
  }
  if (values.codexAccess !== undefined) {
    const before = Boolean(game.settings.get(moduleId, codexAccessKey));
    if (values.codexAccess !== before) {
      await game.settings.set(moduleId, codexAccessKey, values.codexAccess);
      saved.push(values.codexAccess ? 'players can open the NPC Codex' : 'players can no longer open the NPC Codex');
    }
  }
  if (values.backup !== undefined && backup) {
    // 0.86.0: backup repository, branch and token (the token is kept on this device only and never shown back).
    const out = await backup.save(values.backup);
    if (!out.ok) problems.push(out.message.replace(/\.$/, ''));
    else if (out.saved.length) saved.push(...out.saved);
  }
  if (values.sources !== undefined && coreLinks && !sameSources(values.sources, coreLinks.describeSources?.())) {
    const out = await coreLinks.saveSources(values.sources);
    if (out?.ok === false) problems.push(out.message);
    else saved.push('core sources');
  }
  if (problems.length) return {ok: false, saved, message: `Not saved: ${problems.join('; ')}.`};
  return {ok: true, saved, message: saved.length ? `GM Setup saved: ${saved.join(', ')}.` : 'GM Setup saved. Nothing had changed.'};
}
