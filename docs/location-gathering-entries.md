# Location gathering entries (Ashen Gate Locations 0.18.0+, first released as 1.18.0)

> Locations was renumbered from 1.18.0 to 0.18.0 (the suite is pre-release); "1.18.0" below means the same code as 0.18.0.

A Location's `resources` list holds its gathering entries. Each entry is one of two shapes. Both travel in the
`location` block of an `entity_type: "Location"` record in an `ag-foundry-import/0.2` package (General Manager hands
them to Locations, or Locations → Import), and both come back unchanged from Locations → Export.

`node scripts/validate-content.mjs <file>` checks both shapes with Locations' own normaliser.

## 1. Inline node (unchanged since 1.9.0)

The entry holds its own check and materials. Every entry without `nodeId` is read exactly as before 1.18.0.

```json
{"id": "reed-bed", "label": "[TEST] Reed Bundle", "skill": "Herbalism", "tier": 2, "dc": 12, "dcVisible": false,
 "materialId": "MAT-TEST-REED", "quantity": 1, "rareMaterialId": "MAT-TEST-SILVER-REED", "rareQuantity": 1,
 "finite": true, "exhausted": false, "available": true, "visible": true, "note": "One patch",
 "exotics": [{"materialId": "MAT-TEST-STAR", "mode": "designated", "chance": 15, "condition": "rare"}]}
```

`skill` is free text; the editor suggests `Herbalism`, `Mining`, `Fishing`, `Hunting`, `Archaeology`. Since 1.18.0 the
old names `Skinning & Harvesting` and `Hunting/Skinning` read as `Hunting` (Profession Ledger reads all three as the
Hunting/Skinning profession). An entry is kept when it has a `label`, `materialId`, `rareMaterialId` or `uuid`.

## 2. Node template reference (new in 1.18.0)

The entry refers to a gathering node template owned by Ashen Gate | Profession Ledger 0.25.0+ (see
[`gathering-nodes-schema.md`](gathering-nodes-schema.md)). The template gives the activity, professions, check and
material tables (common, rare, exotic); the entry keeps only what belongs to this place.

```json
{"id": "ford-reeds", "nodeId": "NODE-TEST-RIVER-REEDS", "tier": 2, "label": "[TEST] Reeds by the ford",
 "dc": null, "dcVisible": null, "finite": null, "note": "",
 "exhausted": false, "available": true, "visible": true}
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | The entry's own key in this Location (stable; exports write it as `key`, imports read either). |
| `nodeId` | string | Required. A `NODE-*` id: `NODE-` then capitals, digits and single hyphens. A value that is not one makes the entry an inline node (so it needs a label to be kept); the validator rejects it. |
| `label` | string | Optional, up to 200 characters. The name at this place; empty = the template's name. |
| `tier` | integer or null | Optional, 1–5. Should be inside the template's tier range; outside it (or `null`/missing) the Ledger uses the range's lowest tier. |
| `dc` | integer or null | Optional, 1–40. `null`/missing = the template's DC (or its tier default 10/12/15/18/20). |
| `dcVisible` | boolean or null | Optional. Whether players see the DC. `null`/missing = the template's setting. |
| `finite` | boolean or null | Optional. `null`/missing = the template's setting. A finite node can be marked exhausted. |
| `note` | string | Optional, up to 500 characters. This place's note (shown to players, as for inline nodes). The template's own note stays GM-only. |
| `exhausted` | boolean | Play state, default `false`. Always `false` when `finite` is `false`. An update import keeps the world's value. |
| `available` | boolean | Play state, default `true`. |
| `visible` | boolean | Default `true`. Whether players see the entry at all. |

A reference never carries `skill`, `materialId`, `quantity`, `rareMaterialId`, `rareQuantity`, `exotics` or `uuid`:
those belong to the template. Locations drops them, and the validator reports them as errors. Unknown fields are
dropped. An id that is not defined in the same folder gets a validator note: the template must exist in the world's
Ledger (Gathering Nodes tab), but the validator cannot see the world.

### What each audience gets

- **GM** (`api.resourcesAt(id)`): `{id, nodeId, label, tier, dc, dcVisible, finite, exhausted, available, note, visible}`,
  `null` meaning "the template's value". The Ledger's `templates.resolve(entry)` turns it into the node it gathers.
- **Players** (published page, `api.resourcesAt` as a player): the Ledger's `templates.playerView(nodeId, {tier})` shape
  with this place's fields on top: `{id, nodeId, label, skill, activity, tier, dc?, materialId, quantity, rareMaterialId,
  rareQuantity, finite, exhausted, available, note}`. `skill` is the activity's label (`Hunting`, never "Skinning &
  Harvesting"). No material chances, no Exotic candidates, no template note; `dc` only when this place or the template
  shows it. The page is built on the GM's client each time Locations writes it.
- **Template deleted, Ledger inactive or the call refused:** the entry stays, with its data. The GM editor shows "Node
  template NODE-… no longer exists" (deleted) or a note; players see the place's own fields (`label` or "Gathering
  spot", tier, finite and play state) and no materials. Nothing can be gathered there until the GM points the place at
  another template.
