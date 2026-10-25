# Item records: Active Effects and flags

General Manager 0.37.0 and later. This applies to Item records in a Manager package (`ag-foundry-import/0.2`, and also the legacy `0.1` format). Each record imports as a **world Item**. Files without `effects` or `flags` import exactly as they did before.

## Item record `foundry.data`

| Key | Type | Notes |
|---|---|---|
| `name`, `type`, `img`, `system` | as before | Managed fields. Re-import updates them field by field and keeps local edits. |
| `effects` | array, optional | The Item's Active Effects (below). Up to 20; more is an error, not a cut. |
| `flags` | object, optional | Only allow-listed paths are imported (below). Anything else is dropped, and the preview warns. |

Any other key is still rejected.

## Effects

```json
"effects": [
  {
    "eff_id": "walk",
    "name": "[TEST] Saddle: Walk speed",
    "img": "icons/svg/upgrade.svg",
    "description": "<p>[TEST] Placeholder.</p>",
    "disabled": false,
    "transfer": false,
    "duration": {"seconds": 3600},
    "statuses": [],
    "changes": [
      {"key": "system.attributes.movement.speeds.walk", "mode": "add", "value": 10, "priority": 20}
    ]
  }
]
```

| Key | Required | Rules |
|---|---|---|
| `eff_id` | yes | The effect's permanent id. It must be unique within this Item: letters, digits, `-` or `_`, starting with a letter or digit, up to 64 characters (case-sensitive). **Never rename it.** Manager stores it on the ActiveEffect (`flags.ashen-gate-manager.effect.effId`), and re-import finds the effect by this id. The name is never used to match. |
| `name` | yes | Not blank, up to 120 characters. |
| `transfer` | yes | `true`: the effect applies to the Actor holding the Item (Foundry's "Apply effect to actor"). `false`: it stays on the Item. There is no default, so the file has to say which. |
| `changes` | yes (may be `[]`) | Up to 30. Each is `{key, mode, value, priority?}`. |
| `img` | no | Image path, up to 500 characters. No `javascript:` or scripts. |
| `description` | no | HTML, up to 5000 characters. This is the effect's description in dnd5e / Foundry. No scripts, `javascript:`, `on…=` attributes or `@Macro[...]` links. |
| `disabled` | no | `true` or `false`; `false` if left out. |
| `duration` | no | `{seconds?, rounds?, turns?}`: whole numbers from 0 to 10,000,000. Any other key is an error. |
| `statuses` | no | Up to 10 unique status ids, e.g. `"prone"`: start with a lower-case letter, then letters, digits, `-` or `_` (41 characters max). |
| `flags` | no | **Not imported.** It must be an object if present; its contents are dropped with a warning, and Manager writes its own effect flag. |

### Changes

- **`key`**: a dotted data path such as `system.attributes.ac.bonus` or `system.attributes.movement.speeds.walk`. Any path is accepted, because dnd5e paths vary. Use dnd5e 6.0 paths: speeds are `system.attributes.movement.speeds.<walk|fly|swim|climb|burrow|jump>`. The old `system.attributes.movement.walk` is only a compatibility redirect and is due to be removed in dnd5e 7.0. These are rejected:
  - an empty key, a key over 200 characters, or anything that isn't a dotted path of letters, digits, `-` and `_` (so no spaces), starting with a letter or `_`;
  - any key containing `macro` or `script`, in any case (DAE, Midi-QOL and Item Macro keys);
  - `flags.core.*`;
  - the bare document fields `_id`, `_stats`, `ownership`, `folder`, `sort`, `items`, `effects` or `flags`;
  - any key with a `__proto__`, `prototype` or `constructor` part.
- **`mode`**: a Foundry number or a name.

  | Name | Number |
  |---|---|
  | `custom` | 0 |
  | `multiply` | 1 |
  | `add` | 2 |
  | `downgrade` | 3 |
  | `upgrade` | 4 |
  | `override` | 5 |

  Names are not case-sensitive. Anything else is an error.
- **`value`**: a string or a number, up to 500 characters. Numbers must be finite and are stored as text (Foundry stores change values as strings). String values containing `macro`, `<script` or `javascript:` (any case) are rejected.
- **`priority`**: a number or `null`, optional. If left out, Foundry uses its default.

Nothing in an effect is ever run. Manager writes it as data only.

## Flags allow-list

| Path | Allowed values |
|---|---|
| `ashen-gate-character-hub.companion.role` | `mount-gear`, `mount-perk`, `pet-clothing`, `pet-perk` |
| `ashen-gate-character-hub.companion.slot` (Manager 0.60.15) | `saddle`, `tack` (role `mount-gear` only); `head`, `body` (role `pet-clothing` only). A bad or mismatched value is dropped with a preview warning, not an error. |

`flags` must be an object. An allowed path with any other value is an error. An allowed flag is a managed field like `name`, so re-import updates it and keeps a local edit. `flags.ashen-gate-manager.*` is always written by Manager from the record (its source id), so an authored one is dropped. Any other flag, such as `core.*` or another module's, is dropped, and the preview names it.

## Import and re-import

The Import preview lists each effect under its Item, marked **New**, **Update**, **Kept** or **Untouched**:

- **New effect** (an `eff_id` the Item does not have yet): it is created. A new Item is created together with all its effects.
- **Effect Manager made before:** each field is compared with what Manager last imported.
  - A field changed only in the file is updated.
  - A field the GM changed in Foundry is kept.
  - If the file and the GM both changed the same field, the whole effect is kept as it is, and the preview says which field.
  - `changes` and `statuses` count as one field each.
  - If two effects on the Item carry the same `eff_id`, neither is changed and the preview says to delete one in Foundry.
- **Effect missing from the file:** it is kept. Import **never deletes** an effect.
- **Effect made in Foundry by hand** (no Manager effect id): it is never read for matching and never changed.
- **Effects only:** an Item whose own fields are unchanged but which has new or changed effects shows as an **Update**.
- **Unchanged re-import:** importing the same file twice writes nothing.

Only the GM can import, and this is checked in the import code itself, not only in the UI. Effects on Items embedded in Actor records, templates and compendium documents are not covered by this. Manager imports world Items only.

## Validate before import

Run `node scripts/validate-content.mjs <file>`. It runs Manager's own checks on `effects`. As notes, it also lists dropped flags and companion items (ids `ITEM-MOUNT-*`, `ITEM-PET-*`, `PERK-MOUNT-*`, `PERK-PET-*`) with an effect that has `transfer: true`.

**Migration:** none. `effects` and `flags` are new optional fields, and saved data is unchanged.
