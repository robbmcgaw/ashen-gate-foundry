# Item-drop standard (`ag-item-drop/1`)

For module authors. Full design: `docs/rewards-and-loot-design.md` §2 (branch `design/rewards-loot` until merged).

## The shared file
- `scripts/ag-item-drop.mjs`, **byte-identical** in every module that accepts item drops. `scripts/check.mjs` fails if copies differ.
- First copy: Quest Log. To adopt it, copy the file as is; never edit one copy. A module without item drops doesn't ship it.
- Pure: reads `game` and `foundry` at call time, imports nothing, holds no state or settings, never writes documents, has no UI. Writing (holding copies, grants) stays in each module, behind its own permission checks.
- Between modules, use the other module's public API (`game.modules.get(id)?.api`), never its copy of this file.

## Exports
| Export | What it does |
|---|---|
| `ITEM_DROP_CONTRACT` | `'ag-item-drop/1'` |
| `readDrop(event)` | Drag data of a drop event; `{}` when unreadable. Never throws. |
| `await resolveItemDrop(raw, {folders = false, maxFolder = 100})` | `{ok, items, reason}`. Items only (world, compendium, embedded). Folders refused ("Drop items one at a time.") unless `folders`; then the folder's Items, nested, up to `maxFolder`. Non-Items: "Drop an item." Missing: "That item no longer exists or you can't see it." `reason` is safe to show players. |
| `itemIdOf(item)` | Permanent id from `flags.ashen-gate-manager.source.sourceId`, then `flags.ashen-gate-profession-ledger.sourceId`, then `flags.ashen-gate.sourceId`; `null` if absent or malformed. |
| `worldItemById(itemId)` | The one active world Item with that Manager `sourceId` (not retired, superseded or archived); `null` if none or several. |
| `await itemRef(item, {quantity})` | The `ag-item-ref/1` snapshot: `{schema, uuid, itemId, name, img, type, quantity, sourceKind, packId, parentUuid, contents}`. |
| `await resolveRef(ref)` | Id first, then uuid: `{status:'ok', item}`, `{status:'conflict'}` (show the GM "Two items use this id") or `{status:'missing'}`. |
| `await bundleOf(item)` | `[item, ...nested contents]` (dnd5e `system.container`), read from the item's own Actor, the world, or its compendium pack. |
| `await grantBundle(item, {quantity, scope, tag})` | `{data, contents}`: create-data with fresh `_id`s, containers remapped, root container cleared, root quantity set, `flags[scope]` merged with `tag`. Create with `createEmbeddedDocuments('Item', data, {keepId: true})` in **one** call. |
| `dragPayload(ref, extra)` | `{type:'Item', uuid, agItemRef: ref, ...extra}`: a plain Item drag every sheet accepts. |

`itemRef` is async because it counts container contents through `bundleOf`.

## Changing the contract
Additive changes only, and every copy changes in the same PR. A breaking change is a new contract (`ag-item-drop/2`).
