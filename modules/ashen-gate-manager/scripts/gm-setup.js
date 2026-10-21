/**
 * GM Setup (0.43.0): every GM Setup setting saves together with Save Changes, never on its own (decision D4).
 * Ticking a box or picking a skin only changes the form; nothing is written until saveGmSetup runs.
 * Same setting keys as before: codexPlayerAccess, worldSkin (through the appearance controller), core sources.
 */

/** Reads the GM Setup form. Missing controls stay undefined, so saveGmSetup leaves those settings alone. */
export function readGmSetupForm(root) {
  const q = selector => root?.querySelector?.(selector) ?? null;
  const all = selector => [...(root?.querySelectorAll?.(selector) ?? [])];
  const access = q('[data-ag-codex-access]');
  const skin = q('[data-ag-setup-skin]');
  const auto = q('[data-ag-setup-auto]');
  return {
    codexAccess: access ? Boolean(access.checked) : undefined,
    worldSkin: skin ? String(skin.value ?? '') : undefined,
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
export async function saveGmSetup(values, {game, moduleId, codexAccessKey, appearance = null, coreLinks = null}) {
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
