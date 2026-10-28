# World edits export (`ag-world-edits/0.1`)

General Manager, Items > Export > **Export edited records…** (GM only; also `game.modules.get('ashen-gate-manager').api.exportEdits(options)`). It downloads ONE JSON file with the imported records the GM changed in the world since their import, so the content pack can be updated from what was edited in Foundry. Read-only: it writes no document, flag or setting.

## Options
- Record types (Item, JournalEntry, Actor, RollTable, Macro): all ticked by default.
- Include unchanged records (off): also list records with `changed_fields: []`.
- Include records not in any package (off): fills `world_only`.
- Player characters (Actor type `character`) and groups are never read. NPC and vehicle Actors are.

## File
```json
{
  "schema": "ag-world-edits/0.1",
  "created": "2026-10-28T12:00:00.000Z",
  "world": "my-world-id",
  "manager_version": "0.77.0",
  "records": [
    {
      "entity_type": "Material",
      "document_type": "Item",
      "id": "MAT-ROPE",
      "name": "Hemp Rope [TEST]",
      "source_package": "PKG-TEST",
      "source_package_version": "1.2.0",
      "changed_fields": ["foundry.data.system.description.value"],
      "record": {
        "id": "MAT-ROPE", "entity_type": "Material", "status": "approved", "version": "1.0.0",
        "visibility": "player", "refs": [], "provenance": {"source": "test"},
        "foundry": {"document_type": "Item", "data": {"name": "Hemp Rope [TEST]", "type": "loot", "img": "icons/test/a.webp",
          "system": {"description": {"value": "<p>Stronger rope.</p>"}, "quantity": 1, "price": {"value": 5}}}}
      }
    }
  ],
  "world_only": [
    {"entity_type": "Item", "document_type": "Item", "type": "loot", "name": "Hand Made [TEST]", "folder": "Mine",
     "data": {"name": "Hand Made [TEST]", "type": "loot", "description": "<p>mine</p>"}}
  ]
}
```
- `records` are sorted by `document_type`, then `id`. `world_only` is always present (`[]` unless asked for).
- `entity_type` is the record's own type from the import (`NPC`, `Recipe`, ...); `document_type` is the Foundry document (`Item`, `JournalEntry`, `Actor`, `RollTable`, `Macro`). `source_package` is the package id the record was last imported from.
- Deviation from a minimal reading of the request: `document_type` and `source_package_version` are extra keys; `world_only` entries use the Foundry document name as `entity_type` and add `document_type`, `type` (Item/Actor subtype) and an optional `folder` name path.

## `record`
Same shape as a Manager import record: the stored source definition (`id`, `entity_type`, `status`, `version`, `visibility`, `refs`, `provenance`, ... everything but `foundry`) plus `foundry: {document_type, data}`.
- **Unedited fields are the import baseline**, byte for byte; **edited fields are the world's current value**. So the record differs from the pack only where `changed_fields` says.
- Only fields the package defines are carried (and tracked). A field the package never had is not.
- Rich text: Manager's `@UUID[...]`/`@AGRef[...]` links go back to `[[AGREF:ID|label]]` markers (a label equal to the neutral word is dropped); the generated "Related" list is removed.
- Roll Table results use the V14 field names (`description`, not `text`) where a row was added; existing rows keep the package's own keys. A document link on an added row is kept only if it is a `Compendium.` uuid.
- Never present: ownership, folder ids, ids/uuids, sort, stats/timestamps, current HP/temp HP, death saves, exhaustion, inspiration, spell slots, resource uses, currency, the NPC biography (Sync treats these as play state or GM notes; they hold the import value), art (`img`, token image, ring; "art is always yours", so they hold the import value and are never listed as edits), quantity/equipped/uses on embedded Items, Actor-level effects, GM-added embedded Items and effects.

## `changed_fields`
Dotted paths **from the `record` root** (so they start `foundry.data.`), against the import baseline, using Sync's own rule (`editedFields`: the live value is neither the last import's value nor a value Foundry normalised; weights, rarities, quote forms and resolved links are not edits). List items are **zero-based numeric indexes into the same list order as the `record` you receive**: `foundry.data.pages[0].text.content`, `foundry.data.results[1].description`, `foundry.data.items[0].system.description.value` (an NPC's package Item), `foundry.data.effects[0].changes` (an Item's Manager-made effect). Split on `.` and `[]`. A page, item or effect added in the world is `foundry.data.pages[n]`; one removed from the world is the list path (`foundry.data.pages`, `foundry.data.items`) and is simply absent from the record's list; a Roll Table whose row count changed lists `foundry.data.results`. Accurate for every record (`[]` for unchanged ones). `["(no import baseline)"]` means the document has no record of its import, so edits cannot be told apart; the record then holds only name and type.
