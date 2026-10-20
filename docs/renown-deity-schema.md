# Renown deity record (Pantheon) — schema

Module `ashen-gate-factions` (Renown) 0.11.0 or later. A deity is a Renown definition with `entity_type: "Deity"`. It goes in the same file as factions: `definitions[]` of an `ag-factions-source-export/0.4` file. Files marked `0.3` still import, but they can only hold factions.

Standing with a deity is **per character only**. A deity has no group score and no group track. All of its rewards use `audience: "individual"`. Re-importing never changes a deity that is already in the world (same rule as factions). Its card, ranks, discovery and every character's favour stay as they are.

## Top-level fields

| Field | Type | Required | Default / notes |
|---|---|---|---|
| `id` | string | yes | Permanent canonical id, `DEITY-[A-Z0-9-]+` |
| `entity_type` | `"Deity"` | yes | |
| `status` | `proposed` \| `draft` \| `approved` \| `superseded` \| `retired` | yes | `draft` |
| `version` | string | yes | `"0.3.0"` (record version, not the file schema) |
| `provenance` | `{sources: string[≥1], decision_refs?: string[]}` | yes | |
| `visibility` | `player` \| `gm` \| `reveal_gated` | yes | `reveal_gated` |
| `refs` | `{relation, target_id, mode: required\|optional}[]` | yes | `[]` |
| `scope` | `generic_rules` \| `setting_adapter` \| `publication` \| null | no | |
| `name` | string, non-empty | yes | |
| `tags` | string[] | no | GM-only keywords, never shown to players |
| `discovery` | `{placeholder: boolean, sharing_enabled: boolean}` | yes | `{placeholder:false, sharing_enabled:true}`. Who has discovered it is play state and is never in the file |
| `individual_track` | RenownTrack | yes | The deity's own rank ladder, see below |
| `entries` | lore entry[] | yes | Same shape as faction information entries. `unlock` is `manual` or `individual_renown` (no `group_renown`) |
| `rewards` | reward[] | yes | Same shape as faction rewards, but `audience` must be `individual` |
| `deity` | Deity profile | yes | See below |

Not allowed on a deity (these are faction-only): `leader`, `public_role`, `folder_key`, `renown_track`. Any field not listed here, at any level, makes the import fail rather than being dropped.

## `deity` profile

| Field | Type | Default | Notes |
|---|---|---|---|
| `symbol` | string | `""` | Image path of the holy symbol, e.g. a Forge Assets Library path `assets/ashen-gate/deities/<name>.png`. Max 500 characters; `javascript:`/`data:` refused. If empty or missing, a plain sun glyph is shown |
| `title` | string | `""` | Epithet shown under the name |
| `domain` | string | `""` | |
| `tier` | `major` \| `lesser` | `major` | Shown as Major / Lesser; tiles are grouped by it |
| `blurb` | string | `""` | Short intro on the card |
| `portfolio` | string | `""` | |
| `teachings` | string | `""` | |
| `followers` | string | `""` | |
| `practices` | string | `""` | |
| `saying` | `{text: string, attribution: string}` | `{text:"", attribution:""}` | |
| `relations` | `{deity_id: "DEITY-…", type: "rival" \| "ally"}[]` | `[]` | Never to itself, at most one relation per other deity. Players see a relation only once both deities are revealed to them |

Text fields hold up to 4000 characters. Line breaks are kept.

## RenownTrack (`individual_track`)

Same as a faction track: `{id: "RENOWN-…", entity_type: "RenownTrack", status, version, provenance, visibility, refs, default_scope: "individual", milestones: [5 rows]}`.
Each milestone is `{id, key, name, threshold, benefit, selection_mode: all|choose_one}`. `name` is the deity's rank title. The first threshold must be 0, and thresholds must go up. A new deity starts with `Rank I`–`Rank V` at 0 / 3 / 6 / 10 / 15, the same progression as factions.

## `starting_state` for deities

Same as for factions: `{faction_id: "DEITY-…", party_discovered?, actors?: [{name, discovered?, renown?: [{delta, reason}]}]}`. `group_renown` is refused for a deity. It is applied only when that deity is NEW to the world.

## Example (synthetic)

```json
{
  "schema_version": "ag-factions-source-export/0.4",
  "definitions": [
    {
      "id": "DEITY-EXAMPLE-LANTERN",
      "entity_type": "Deity",
      "status": "draft",
      "version": "0.3.0",
      "provenance": {"sources": ["[EXAMPLE] schema doc"], "decision_refs": []},
      "visibility": "reveal_gated",
      "refs": [],
      "name": "[EXAMPLE] The Lantern",
      "tags": ["example"],
      "discovery": {"placeholder": false, "sharing_enabled": true},
      "individual_track": {
        "id": "RENOWN-EXAMPLE-LANTERN",
        "entity_type": "RenownTrack",
        "status": "draft",
        "version": "0.3.0",
        "provenance": {"sources": ["[EXAMPLE] schema doc"], "decision_refs": []},
        "visibility": "player",
        "refs": [{"relation": "for_faction", "target_id": "DEITY-EXAMPLE-LANTERN", "mode": "required"}],
        "default_scope": "individual",
        "milestones": [
          {"id": "RENOWN-EXAMPLE-LANTERN-M1", "key": "milestone_1", "name": "[EXAMPLE] Wick", "threshold": 0, "benefit": "", "selection_mode": "all"},
          {"id": "RENOWN-EXAMPLE-LANTERN-M2", "key": "milestone_2", "name": "[EXAMPLE] Spark", "threshold": 3, "benefit": "[EXAMPLE] A shrine keeper will speak with you.", "selection_mode": "all"},
          {"id": "RENOWN-EXAMPLE-LANTERN-M3", "key": "milestone_3", "name": "[EXAMPLE] Flame", "threshold": 6, "benefit": "", "selection_mode": "choose_one"},
          {"id": "RENOWN-EXAMPLE-LANTERN-M4", "key": "milestone_4", "name": "[EXAMPLE] Beacon", "threshold": 10, "benefit": "", "selection_mode": "all"},
          {"id": "RENOWN-EXAMPLE-LANTERN-M5", "key": "milestone_5", "name": "[EXAMPLE] Dawn", "threshold": 15, "benefit": "", "selection_mode": "all"}
        ]
      },
      "entries": [
        {"id": "info_example_rite", "name": "[EXAMPLE] Evening rite", "text": "[EXAMPLE] Lamps are lit at dusk.", "link_mode": "preview", "unlock": "individual_renown", "threshold": 3}
      ],
      "rewards": [
        {"id": "rw-EXAMPLE-1", "key": "rw_example_1", "audience": "individual", "milestone_id": "RENOWN-EXAMPLE-LANTERN-M2", "name": "[EXAMPLE] Blessing of light", "teaser": "[EXAMPLE] A small blessing", "description": "[EXAMPLE] Once per long rest, a candle-sized light.", "kind": "custom", "tags": [], "behavior": "repeatable_service", "usage_limit": 0}
      ],
      "deity": {
        "symbol": "assets/ashen-gate/deities/example-lantern.png",
        "title": "[EXAMPLE] Keeper of the Last Light",
        "domain": "[EXAMPLE] Light",
        "tier": "lesser",
        "blurb": "[EXAMPLE] A synthetic deity for documentation.",
        "portfolio": "[EXAMPLE] Lamps, vigils, lost travellers",
        "teachings": "[EXAMPLE] Keep a light for those still on the road.",
        "followers": "[EXAMPLE] Lamplighters and night wardens",
        "practices": "[EXAMPLE] A lamp left burning in a window",
        "saying": {"text": "[EXAMPLE] No road is dark while one lamp burns.", "attribution": "[EXAMPLE] Lamplighter's proverb"},
        "relations": [{"deity_id": "DEITY-EXAMPLE-SHADOW", "type": "rival"}]
      }
    }
  ],
  "starting_state": [
    {"faction_id": "DEITY-EXAMPLE-LANTERN", "actors": [{"name": "[EXAMPLE] Hero", "discovered": true, "renown": [{"delta": 3, "reason": "[EXAMPLE] Kept the vigil"}]}]}
  ]
}
```

(The example's rival `DEITY-EXAMPLE-SHADOW` would be a second definition in the same file or already in the world. A relation to an id that isn't there yet is allowed; it shows once that deity exists.)

## Read API (`game.modules.get('ashen-gate-factions').api`)

- `getDeities()` — GM: every deity's source definition. Player: their projected view, i.e. only deities revealed to one of their characters, as flat cards with that player's characters' standing.
- `getPantheon(actorOrId)` — one character's standing with each deity that character knows: `[{id, name, symbol, title, domain, tier, tierLabel, score, rank, next: {name, threshold} | null, remaining, percent}]`, Major first, then by name. A player only gets characters they own, and only from their projected view.
- `getFactions()` lists factions only, never deities.
