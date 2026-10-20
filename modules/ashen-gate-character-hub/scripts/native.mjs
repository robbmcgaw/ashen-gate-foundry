/**
 * "Open native sheet": always dnd5e's own character sheet class, whatever sheet is set as the
 * Actor's default, so the system sheet is one click away as a fallback.
 */
export const nativeSheetClass = () => globalThis.dnd5e?.applications?.actor?.CharacterActorSheet ?? null;

/** An already open instance of that class for this Actor, so a second click brings it forward. */
function openInstance(Cls, actor) {
  const apps = globalThis.foundry?.applications?.instances;
  for (const app of apps?.values?.() ?? []) if (app instanceof Cls && app.document === actor) return app;
  return null;
}

export async function openNativeSheet(actor) {
  const Cls = nativeSheetClass();
  if (!Cls) return {ok: false, error: 'The dnd5e character sheet was not found (is the dnd5e system active?).'};
  if (!actor?.testUserPermission?.(globalThis.game?.user, 'LIMITED') && !globalThis.game?.user?.isGM) return {ok: false, error: `You can't view ${actor?.name ?? 'this character'}.`};
  try {
    const app = openInstance(Cls, actor) ?? new Cls({document: actor});
    await app.render({force: true});
    app.bringToFront?.();
    return {ok: true, result: app};
  } catch (err) {
    console.error('ashen-gate-character-hub | native sheet', err);
    return {ok: false, error: `The native sheet could not open: ${err?.message ?? err}`};
  }
}
