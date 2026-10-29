/**
 * Player-facing sidebar directory lists (Manager 0.79.0): "Show players only Player Handouts in the Items tab" and
 * "Show players only the Players folder in the Actors tab". One generic helper serves both. Presentation only: no
 * document, permission or folder is written, and documents still open by uuid or id, in sheets and in compendiums.
 * The GM is never affected. Only list rows (documents and folders) are hidden; the directory header and footer, where
 * the Ashen Gate player launchers sit, are never touched.
 *
 * Foundry V14 names (V13 ApplicationV2 directory conventions; not confirmed in a live world): hooks
 * `renderItemDirectory` / `renderActorDirectory`, elements `ui.items.element` / `ui.actors.element`, rows
 * `.directory-list li[data-entry-id]` and `.directory-list li[data-folder-id]`.
 */
const MARK = 'agmDirHidden';

export const DIRECTORIES = Object.freeze({
  items: Object.freeze({ stateKey: 'playerHandoutsOnly', folderName: 'Player Handouts', folderType: 'Item', docs: 'items', hook: 'renderItemDirectory', uiKey: 'items' }),
  actors: Object.freeze({ stateKey: 'playersFolderOnly', folderName: 'Players', folderType: 'Actor', docs: 'actors', hook: 'renderActorDirectory', uiKey: 'actors' })
});

/** The one place that decides which folder name counts: the exact name, trimmed, any case. */
export const isFolderNamed = (name, wanted) => String(name ?? '').trim().toLowerCase() === String(wanted).trim().toLowerCase();

export const shouldFilter = ({ isGM, setting }) => !isGM && setting === true;

const idOf = ref => (ref && typeof ref === 'object' ? ref.id : ref) ?? null;

/**
 * Which document and folder ids a player may see listed. A document is listed when its folder, or any ancestor folder, has
 * the wanted name. A folder is listed when it holds a listed document anywhere below it (so a matching folder nested in
 * another keeps its parents, and empty folders are hidden). Documents with no folder are never listed.
 * folders: [{id,name,folder}], docs: [{id,folder}] (folder = parent document or id).
 */
export function listedUnder({ folders = [], docs = [], folderName }) {
  const byId = new Map(folders.map(f => [f.id, f]));
  const inside = folderId => {
    for (let id = folderId, hops = 0; id && hops < 100; hops++) {
      const f = byId.get(id);
      if (!f) return false;
      if (isFolderNamed(f.name, folderName)) return true;
      id = idOf(f.folder);
    }
    return false;
  };
  const docIds = new Set(), folderIds = new Set();
  for (const doc of docs) {
    const start = idOf(doc.folder);
    if (!start || !inside(start)) continue;
    docIds.add(doc.id);
    for (let id = start, hops = 0; id && hops < 100; hops++) { folderIds.add(id); id = idOf(byId.get(id)?.folder); }
  }
  return { docIds, folderIds };
}

/** The one place that knows the directory DOM: the list's document and folder rows, never the header or footer. */
export function directoryRows(root) {
  const rows = [];
  for (const el of root?.querySelectorAll?.('.directory-list li[data-entry-id], .directory-list li[data-folder-id]') ?? [])
    rows.push(el.dataset?.entryId ? { el, kind: 'doc', id: el.dataset.entryId } : { el, kind: 'folder', id: el.dataset?.folderId });
  return rows;
}

/** Hides rows that are not listed (only when listed is given), and restores exactly what this hid. */
export function applyDirectoryFilter(root, listed) {
  let hidden = 0;
  for (const { el, kind, id } of directoryRows(root)) {
    const show = !listed || (kind === 'doc' ? listed.docIds : listed.folderIds).has(id);
    if (!show) { el.hidden = true; if (el.dataset) el.dataset[MARK] = '1'; hidden++; }
    else if (el.dataset?.[MARK]) { el.hidden = false; delete el.dataset[MARK]; }
  }
  return hidden;
}

/** Applies one directory's setting to its element for the current user. Returns true when filtering. */
export function applyDirectorySetting({ game, root, appearance, config }) {
  const filter = shouldFilter({ isGM: Boolean(game?.user?.isGM), setting: appearance?.getState?.()?.[config.stateKey] === true });
  const listed = filter ? listedUnder({
    folders: [...(game.folders ?? [])].filter(f => f.type === config.folderType),
    docs: [...(game[config.docs] ?? [])],
    folderName: config.folderName
  }) : null;
  applyDirectoryFilter(root, listed);
  return filter;
}

/** On every render of the directory, and live when the setting changes. Returns a function that stops listening. */
export function installDirectoryFilter({ game, hooks, getUi = () => globalThis.ui, appearance, config }) {
  const toEl = html => html?.[0] ?? html;
  const run = root => { try { if (root) applyDirectorySetting({ game, root, appearance, config }); } catch (error) { console.warn(`[ashen-gate-manager] ${config.folderName} list not updated`, error); } };
  const id = hooks?.on?.(config.hook, (app, html) => run(toEl(html) ?? app?.element));
  const stop = appearance?.subscribe?.(() => run(getUi()?.[config.uiKey]?.element));
  return () => { if (id !== undefined) hooks?.off?.(config.hook, id); if (typeof stop === 'function') stop(); };
}
