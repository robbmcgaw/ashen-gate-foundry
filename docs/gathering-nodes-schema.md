# Gathering node templates (Profession Ledger 0.25.0)

A **gathering node template** is a reusable gathering spot owned by Ashen Gate | Profession Ledger. It has a permanent `NODE-*` id, a name, an activity, the gathering profession(s) that can work it, a tier range, an optional check skill/tool and DC, and material tables (common, rare, exotic) that name `MAT-*` materials.

A template is **not tied to a Location**. The GM can roll on it from anywhere (Ledger → **Gathering** → *Node template*), and a Location may **refer** to it by id. Templates are GM data: players never see them, the Gathering Nodes tab, or their material tables.

Where things live:

- **Authoring:** Ledger → **Gathering Nodes** tab (GM only): New node, Edit, Duplicate, Delete, Import nodes, Export, Copy Location nodes. GM Setup stays settings-only.
- **Storage:** the flag `gatheringNodes` of the Journal *Profession Ledger (GM Data)* (ownership None for players). Never a world setting.
- **API:** `game.modules.get('ashen-gate-profession-ledger').api.gathering.templates` (contract `ag-gathering-nodes/1`, GM only).
- **Validation:** `node scripts/validate-content.mjs <file>` checks node files with the Ledger's own rules (file name `*.gathering-nodes.json`, or any file whose `schema` is `ag-gathering-nodes/1`).

## File shape

A node file is imported in Ledger → Gathering Nodes → **Import nodes** (a preview first; nothing is written until **Apply import**). It is not a General Manager Import-tab file.

```json
{
  "schema": "ag-gathering-nodes/1",
  "nodes": [
    {
      "id": "NODE-TEST-RIVER-REEDS",
      "name": "[TEST] River Reeds",
      "activity": "herbalism",
      "professions": ["herbalism"],
      "tier": {"min": 1, "max": 2},
      "check": {"skill": "nat", "tool": "herb"},
      "dc": 12,
      "dcVisible": false,
      "finite": true,
      "materials": {
        "common": [
          {"materialId": "MAT-TEST-REED", "quantity": 2, "chance": 70},
          {"materialId": "MAT-TEST-RUSH", "quantity": 1, "chance": 30}
        ],
        "rare": [{"materialId": "MAT-TEST-SILVER-REED", "quantity": 1}],
        "exotic": [
          {"materialId": "MAT-TEST-STAR-PEARL", "mode": "discovery"},
          {"materialId": "MAT-TEST-MOON-PEARL", "mode": "designated", "chance": 5, "condition": "rare"}
        ]
      },
      "note": "[TEST] GM-only note."
    }
  ]
}
```

## Fields

| Field | Type | Rules |
|---|---|---|
| `schema` | string | Required, exactly `ag-gathering-nodes/1`. |
| `nodes` | list | Required, at most 500. Each id once per file. |
| `id` | string | Required. Permanent `NODE-*` id: `NODE-` then capitals, digits and single hyphens (`NODE-TEST-RIVER-REEDS`). Never reused: a deleted node's id is retired. |
| `name` | string | Required, up to 80 characters. Shown to the GM; a Location may show it to players. |
| `activity` | string | Required. One of `mining`, `herbalism`, `hunting`, `fishing`, `archaeology` (labels and profession names are accepted too: `Hunting`, `Skinning & Harvesting` and `Hunting/Skinning` all read as `hunting`). Shown as *Mining*, *Herbalism*, *Hunting*, *Fishing*, *Archaeology*. |
| `professions` | string[] | Optional. Gathering professions that can work the node: `archaeology`, `fishing`, `herbalism`, `huntingskinning` (also `hunting`, `Hunting`), `mining`; names and `PROF-*` ids are read the same way (`PROF-X-HERBALISM` → `herbalism`). Left out: the activity's profession. The lead uses the first listed profession they have (it gets the XP); an Exotic gathered by any listed profession can be found. |
| `tier` | object | Required. `{"min": 1–5, "max": 1–5}`, `min` ≤ `max` (tier names `Apprentice` … `Master` also work; a single number means min = max). The GM picks the tier within the range when rolling on the template; a Location reference may give its own tier inside the range. |
| `check` | object | Optional. `skill`: a dnd5e skill id or name (`nat`, `Nature`). `tool`: a dnd5e tool key (`herb`). Each one replaces that profession's check from Ledger → GM Setup → Tools and checks; left out, GM Setup's check is used. |
| `dc` | integer | Optional, 1–40. Left out: the tier default (tier 1–5: 10/12/15/18/20). |
| `dcVisible` | boolean | Optional, default `false`. Whether players see the DC. |
| `finite` | boolean | Optional, default `true`. At a Location, a finite node is used up by any attempt (a failure always exhausts a node). Rolling on a template directly never exhausts anything. |
| `materials.common` | list | The bundle a success gives. Each entry `{materialId, quantity?, chance?}`. Empty or left out: the GM awards the node by hand (a warning, not an error). |
| `materials.rare` | list | Optional. The bundle a success by 5+ gives instead of the common one. Needs a common table. Empty: a success by 5+ gives the common bundle. |
| `materials.exotic` | list | Optional, at most 20. Exotic candidates, as in Locations 1.9+ / Ledger 0.15+: `{materialId, mode: "discovery"}` (rolled at the GM Setup discovery chance on a success) or `{materialId, mode: "designated", chance: 1–100, condition: "success" or "rare"}` (its own chance; replaces the discovery roll). A candidate is only found when its imported definition says quality *Exotic*, it is gathered by one of the node's professions, and its tier is not above the node's. |
| `materialId` | string | A `MAT-*` id. Not checked against the world at import (0.42.0: the preview and the import result list, as report lines and never errors, the materials this world has not imported and the imported ones that are not released): the Gathering Nodes tab shows each material as *Released*, *Draft*, *Unreleased* or *Not imported*, and a node warns the GM which of its materials are not released. |
| `quantity` | integer | Optional, 1–999, default 1. |
| `chance` | integer | Common/rare tables: with one entry, leave it out. With two or more, every entry needs a whole percent and the chances add up to exactly 100; a success rolls one d100 to pick the bundle. Each material once per table. |
| `note` | string | Optional, up to 500 characters. GM only. |

Unknown fields are ignored. Store metadata (where a template came from, whether the GM edited it) is never in a file.

## Import rules

- A new id is added. An id the world already has is **updated** only when the GM has not edited that template in the Ledger; an edited one is **kept** as the GM left it (listed in the preview). An id that was deleted in this world is **skipped** (ids are never reused). Import never removes a template and never changes a Location.
- Any error rejects the whole file; the preview lists every error.

## Locations and templates

A Location gathering entry may refer to a template:

```json
{"id": "<the Location's own entry key>", "nodeId": "NODE-TEST-RIVER-REEDS", "tier": 2, "label": "[TEST] Reeds by the ford", "exhausted": false, "available": true, "visible": true}
```

The template gives the activity, professions, check and material tables. The entry gives what belongs to the place: `tier` (inside the template's range; else its lowest), and optionally `label`, `dc`, `dcVisible`, `finite`, `note`, plus play state (`exhausted`, `available`, `visible`). If the template has been deleted, the entry stays in the Location; the Ledger shows "Node template NODE-… no longer exists" and nothing can be gathered there until the GM points it at another node. Deleting a template that Locations refer to asks first and names those Locations.

Ledger API for Locations (GM only): `templates.resolve(entry)` gives the node the Ledger gathers for an entry; `templates.playerView(id, {tier})` gives what a Location may publish to players (no chances, no Exotic candidates, the DC only when `dcVisible`). Locations versions that store nodes inline (1.17.x) keep working as before. (Locations 1.18.0 was renumbered 0.18.0; it is the node-template version.)

## Copying Location nodes (migration)

The first time the GM loads the world with Ledger 0.25.0 (with Locations active), the Ledger copies every Location gathering entry into a template. **Copy Location nodes** in the Gathering Nodes tab does it again for entries added since. It is safe to run any number of times:

- Locations records are never changed; each place keeps its own data and play state.
- Each entry is copied once (a template the GM later deletes is not brought back). An entry that already refers to a template is skipped.
- Identical entries (same name, check, tier, DC and materials) at several places share one template; the template lists every place it came from.
- An entry whose id is already a `NODE-*` id keeps that id; others get `NODE-<NAME>` (with `-2`, `-3` … when taken). A Location skill that is a gathering profession sets the activity (`Skinning & Harvesting` → `hunting`); a dnd5e skill becomes `check.skill`; anything else is kept in the note and the template is flagged "no activity" until the GM sets one.
- **Backup:** every copied entry, exactly as Locations had it, is kept in the same Journal flag (`gatheringNodes.migrations[].backup`), and the GM gets a whispered chat note.

## Released materials (0.42.0)

A material is **released** when it is imported once in the world, its Manager status is `approved` and its visibility is `player`. A node only ever rewards released materials. When a node is rolled (from a template, a Location spot, or a player's approved request):

- Materials that are not released (draft, GM-only, retired or imported twice) or not imported are **left out** of the Common and Rare tables. The gather still starts.
- The chances of the entries that remain are **scaled in proportion** so they add up to 100 again, rounded by largest remainder (50/30/20 with the 20 left out becomes 63/37). One entry left needs no chance. A table without chances keeps its entries equally likely. The GM sees a note saying what was left out and how the chances changed.
- Exotic candidates that are not released are skipped (the GM sees why), as before.
- If a table names materials but none of them is released, that success gives **no reward** and the GM gets a message (not an error); a success by 5+ whose Rare table is empty this way gives the Common material. A node that lists no materials at all is still awarded by hand.
- Players never see unreleased materials: a template's published player view names only released ones.

The GM sees a warning on each node (list row and editor, the Gather form, a queued request) naming the unreleased and not-imported materials, and **Release materials…** (GM only, asks "Release <n> materials?") sets exactly the unreleased materials that node uses to approved and player-visible. It never runs by itself, never gives anything to a character and cannot release a material that is not imported.

## Draft materials

Players only ever see released materials (approved and player-visible). The GM's gathering tools list every imported material: draft and unreleased ones are in their own group, marked *Draft* / *Unreleased*. A node whose material is draft says so on the node, which is different from a material that is not imported ("… is not imported in this world: import it with General Manager"). Ticking **Use draft materials anyway** (Gathering tab, GM only, off by default) lets that one gather give draft or unreleased common, rare and Exotic materials; it never covers a material that is not imported.
