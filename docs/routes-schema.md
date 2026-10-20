# Route record schema (Ashen Gate Locations 1.10.0+, General Manager 0.27.0+)

A **Route** joins two Location records for point-crawl travel. Route records travel in the same
`ag-foundry-import/0.2` package as Location records, so one package can create places and the routes between them.
General Manager passes them to Locations (`api.importRoutes`) after the package's locations; Locations' own
**GM Setup → Import JSON** reads them too. This file is generic: no setting content.

## Envelope

| Key | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `RTE-` then upper-case letters, digits and single hyphens, e.g. `RTE-HARBOR-MILL`. Permanent. A deleted route's id is never reused: a record with it is refused. |
| `entity_type` | `"Route"` | yes | |
| `status` | string | yes | Same as other records (`approved`, `draft`, …). Manager imports drafts only with *Include drafts*. |
| `version` | string | yes | e.g. `"1.0.0"` |
| `name` | string | yes | Display label in Manager. Not the route's name when a `route` block is present (use `route.name`). |
| `visibility` | string | recommended | `"gm"`. Player visibility is set by `route.discovery_state` and the GM, not by this field. |
| `refs` | array | recommended | `[{"relation": "route_from", "target_id": "LOC-…", "mode": "required"}, {"relation": "route_to", "target_id": "LOC-…", "mode": "required"}]`. Used when `route.from_location_id` / `to_location_id` are missing. |
| `provenance` | object | optional | `{"sources": ["…"]}` |
| `route` | object | yes | The fields below. |

## `route` fields

| Field | Type | Required | Default | Rules |
|---|---|---|---|---|
| `from_location_id` | string | yes | | A `LOC-*` id. Must exist in the world, or be created by the same import run. |
| `to_location_id` | string | yes | | A `LOC-*` id, different from `from_location_id`. |
| `distance_km` | number | yes | | Above 0, at most 100000. A JSON number, not a string. |
| `leg_km` | number | no | world default (GM Setup → *Routes*, 5 km until changed; a world that saved its own value keeps it) | Above 0, at most 100000. Legs = ceil(`distance_km` ÷ `leg_km`), at least 1. |
| `hazard_base_percent` | number | no | `5` | 0 to 100 (rounded to a whole number). The chance a journey starts at on each journey. |
| `hazard_table` | string | no | none | A RollTable UUID (`RollTable.<id>` or `Compendium.<pack>.RollTable.<id>`) or a RollTable **name**. A missing table never breaks anything: the hazard result is just "Hazard!". |
| `terrain` | string | no | `""` | Up to 80 characters. Players who can see the route see it. |
| `discovery_state` | string | no | `"unknown"` | `unknown` (players see nothing), `rumoured`, `known`, `explored`. Used only when the route is **created**; never changed by a re-import. |
| `directed` | boolean | no | `false` | `true` = one-way, from → to. |
| `name` | string | no | `""` | Up to 200 characters. Players who can see the route see it, so never name a hidden place here. Empty: lists show "From – To". |
| `notes` | string | no | `""` | GM only. Never shown to players. |

Unknown keys are ignored. A wrong type or out-of-range number is an error for that record (it is skipped and
reported), never quietly replaced by a default.

## Import behaviour

- **Where:** General Manager → Import (a JSON package, or a ZIP holding it; a routes-only file in a ZIP is imported
  after the other Manager files), or Locations → GM Setup → Import JSON (creates new routes only).
- **Manager preview** shows each Route as create / update / skipped / blocked with the reason. Blocked in preview:
  an endpoint neither in Locations nor created by the same import, the same endpoint twice, a missing or non-number
  `distance_km`. Everything else is checked by Locations on Apply and reported per record in the Import results.
- **Required refs** to a `LOC-*` id that exists only in Locations are accepted (Manager 0.27.0+); older Managers
  report them as unresolved, so with an older Manager use `"mode": "optional"` refs or leave `refs` empty.

- **Order:** routes are imported after the locations in the same run, whatever their order in the file.
- **Drafts:** Manager imports `draft` records only with *Include drafts*; `superseded` / `retired` are blocked.
- **Validation, per record** (reported in the import results, the rest of the import carries on): id not `RTE-*`,
  missing or non-`LOC-*` endpoint, same endpoint twice, endpoint not found, missing `distance_km`, bad numbers,
  unknown `discovery_state`, duplicate id in the same import, id of a deleted route.
- **Existing route id:** kept unchanged by default (create-only / skip). With Manager's *Update existing locations and routes* (or `importRoutes(records, {mode: 'update'})`), the definition
  (endpoints, km, leg, hazard, terrain, name, notes, one-way) is replaced, and fields the record leaves out keep the
  world's value. **Play state is never overwritten:** discovery state, who can see it, the GM's *Unknown path*
  choice, its player page binding, its linked map drawing (1.12.0+) and any journey (1.11.0+).
- **Players:** an imported route shows to a player only when it is discovered (not `unknown`), both ends are visible
  to that player, and the GM has not limited it to other players.

## Example

```json
{
  "manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-TEST-ROUTES", "version": "1.0.0"},
  "records": [
    {"id": "LOC-TEST-HARBOR", "entity_type": "Location", "status": "approved", "version": "1.0.0", "refs": [],
     "name": "[TEST] Harbor", "location": {"name": "[TEST] Harbor"}},
    {"id": "LOC-TEST-MILL", "entity_type": "Location", "status": "approved", "version": "1.0.0", "refs": [],
     "name": "[TEST] Mill", "location": {"name": "[TEST] Mill"}},
    {
      "id": "RTE-TEST-HARBOR-MILL", "entity_type": "Route", "status": "approved", "version": "1.0.0",
      "provenance": {"sources": ["synthetic test data"]}, "visibility": "gm",
      "name": "[TEST] Harbor to Mill",
      "refs": [
        {"relation": "route_from", "target_id": "LOC-TEST-HARBOR", "mode": "required"},
        {"relation": "route_to", "target_id": "LOC-TEST-MILL", "mode": "required"}
      ],
      "route": {
        "from_location_id": "LOC-TEST-HARBOR", "to_location_id": "LOC-TEST-MILL",
        "distance_km": 32, "leg_km": 8, "hazard_base_percent": 10,
        "hazard_table": "[TEST] Coast Road Hazards", "terrain": "Coast road",
        "discovery_state": "unknown", "directed": false,
        "name": "[TEST] Coast Road", "notes": "[TEST] GM-only note"
      }
    }
  ]
}
```

This route has 4 legs (32 ÷ 8). Exporting from Locations (GM Setup → Export JSON) writes routes in this shape.

## Checking a file before import

`node scripts/validate-content.mjs path/to/file.json` runs Route records through the same Locations checks
(endpoints outside the file are listed as notes: they must already exist in Locations).

## Journey behaviours (Locations 1.15.0)

Journeys are play state (never in an import or export). From 1.15.0 the journey record in the GM Data Journal
(`flags.ashen-gate-locations.travel.journey`, and each entry in `travel.history`) carries an additive `behaviours`
field. **Tracking only:** nothing reads it to change a roll, the hazard chance, legs, supplies or rest. A journey without it
reads with the defaults below; nothing is migrated.

```json
"behaviours": {
  "pace":   {"enabled": true, "value": "normal"},
  "watch":  {"enabled": true, "first": ["<actorId>"], "second": [], "third": []},
  "checks": {"enabled": true, "forage": "sur", "navigate": "sur"}
}
```

| Field | Type | Default | Rules |
|---|---|---|---|
| `pace.enabled`, `watch.enabled`, `checks.enabled` | boolean | `true` | Per-journey on/off for each behaviour. Turning one off keeps its values. |
| `pace.value` | string | `"normal"` | `slow`, `normal` or `fast`. |
| `watch.first` / `second` / `third` | array of Actor ids | `[]` | Character Actor ids (world-local), no duplicates, at most 8 per watch. |
| `checks.forage`, `checks.navigate` | string | `"sur"` | A dnd5e skill id (`acr` … `sur`); the skill Utilities is prefilled with. |

Players' progress page (`kind: "journey"` page in the Routes Journal) gets, while the journey is active, only
`"behaviours": {"pace": "fast", "watch": [{"watch": "first", "names": ["<character name>"]}, ...]}`: pace while on,
watch order while on and once someone is on watch. Check skills and anything turned off are never on it.

