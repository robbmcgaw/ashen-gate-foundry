# Ashen Gate — content build reference for ChatGPT

**Status:** current reference (supersedes older schema notes where they disagree).
**Checked against:** `ashen-gate-foundry` main on 2026-10-20 — General Manager 0.35.0, Locations 1.15.1, Profession Ledger 0.21.0, Renown (`ashen-gate-factions`) 0.11.1, Quest Log 0.8.0, Skill Trees 0.14.0, Headquarters 0.10.0, Utilities 0.13.0, Character Hub 0.9.0.
**Start here:** §0 *Prompt starter* is the one-page recipe for each kind of file. The rest of this page is the detail behind it.
**Source of truth:** the modules' validators and normalisers, not READMEs. Every example in `systems/schemas/examples/` is run through those validators by `node scripts/validate-content.mjs <folder>` in the foundry repo. If this page and a validator ever disagree, the validator wins and this page gets fixed.

Files next to this page:

| Path | What it is |
|---|---|
| `json/*.schema.json` | JSON Schema (draft 2020-12) per file and record type. `manager-package.schema.json` pulls in the record schemas. |
| `examples/manager-minimal.json` | Smallest valid Manager package (one Item). |
| `examples/manager-full.json` | One of every Manager record type, Locations included. |
| `examples/routes.json`, `routes-only.json` | Route records: with their locations in one package, and a routes-only file joining locations from another file. |
| `examples/npc-codex.json` | Manager package with two NPC records carrying NPC Codex fields (§3.8). |
| `examples/deities.json` | Renown file (`ag-factions-source-export/0.4`) with two Deity records, relations and a deity `starting_state` (§7A). |
| `examples/quests.json`, `skill-trees.json`, `factions.json`, `factions-minimal.json`, `facilities.json` | Valid files for each specialist module (`factions-minimal.json` shows the defaults). |
| `examples/reference/*.scene-moods.json`, `*.organize-rules.json`, `*.crosswalk.json`, `*.npc-codex.json` | Files that do **not** go through Manager → Import: a scene moods file (Manager → Scenes → Export & import), Organize rules (Manager → Organize), the Ledger's crosswalk baseline (Ledger GM Setup), an NPC Codex export (Codex → Restore reveals). §10. |
| `examples/invalid/*.json` | Common mistakes. Each one is **rejected** (or reported as a value the module would silently drop); its `_expect_error` field names the message. |

The checker recognises the non-Import files by their name ending: keep `.scene-moods.json`, `.organize-rules.json`, `.crosswalk.json` and `.npc-codex.json` in file names you hand to Robb.

All example data is synthetic (`[EXAMPLE]`). Never copy example names into campaign content.

---

## 0. Prompt starter for GPT (one page)

Follow these steps every time you build an import file. Details are in the sections named.

**Always, for every file**
1. Pick the file kind from the table below. One file = one kind. Never mix kinds in one file (a ZIP may hold several files).
2. Ids: `PREFIX-SET-NAME`, capitals, digits and single dashes (`^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$`), using the prefix in the table (§9). Ids are permanent: never rename, never reuse a retired id, never put a spoiler in an id. Reuse the exact id string when you refer to a record.
3. Envelope on every record (all kinds except Organize rules, crosswalk, scene moods): `id`, `entity_type`, `status`, `version: "1.0.0"`, `provenance: {"sources": ["<source document or design note>"]}` (a **list**), `visibility` (`player` | `gm` | `reveal_gated`, underscore), `refs: []` (each ref `{relation, target_id, mode: "required"|"optional"}`; cross-file links `optional`).
4. Defaults unless Robb says otherwise: `status: "approved"` for content meant for play, `"draft"` for anything still being tested (imports only with Include drafts). `visibility`: see the table.
5. Write every field explicitly, even when a module would default it. Use JSON numbers for numbers and `true`/`false` for booleans, never strings.
6. Name the file so the checker knows it: `<something>.json` for Import files; `.organize-rules.json`, `.crosswalk.json`, `.scene-moods.json` for the others.
7. Ask Robb (or a Build chat) to run `node scripts/validate-content.mjs <file>` in the foundry repo before importing.

| You are writing | File / top-level keys | Record id prefix and `entity_type` | Default `status` / `visibility` | Section |
|---|---|---|---|---|
| Professions, Materials, Recipes, Items, Perks, Hirelings, Journals, Roll Tables, Macros | Manager package: `{"manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-…", "version": "1.0.0"}, "records": [...]}` | `PROF-` Profession, `MAT-` Material, `REC-` Recipe, `ITEM-` Item, `PERK-` ProfessionPerk, `HIRE-` Hireling, `HPERK-` HirelingPerk, `JRN-` JournalEntry, `TABLE-` RollTable, `MACRO-` Macro; each with a `foundry` block | approved / `player` for player-usable things, `gm` for GM tools and secrets | §2–3 |
| NPCs (with Codex text) | Manager package (as above) | `NPC-` with `entity_type: "NPC"`, `foundry` Actor `type: "npc"` | approved / `gm` (who knows what is set in play) | §3.8 |
| Locations | Manager package | `LOC-`, `entity_type: "Location"`, body under `location`, **no** `foundry` | approved / `reveal_gated`; set `location.state` deliberately (`hidden` unless players should see it now) | §4 |
| Routes | Manager package (same file as the locations, or a routes-only file) | `RTE-`, `entity_type: "Route"`, body under `route`, **no** `foundry` | approved / `gm`; `route.discovery_state: "unknown"` unless players already know it | §4A |
| Quests, work orders, contracts | Quest Log file: `{"schema_version": "ag-quest-source/0.1", "records": [...]}` | `QUEST-` / `ORDER-` / `CONTRACT-`, `entity_type: "Objective"` with matching `objective_kind` | approved / `reveal_gated` | §5 |
| Skill trees | `{"schema": "ag-skill-trees/0.3", "trees": [...]}` | tree/node ids are layout ids (`[A-Za-z][A-Za-z0-9_-]{2,100}`), perks are `PERK-*` | tree `approved` / `player`; nodes as designed | §6 |
| Factions **and deities** | Renown file: `{"schema_version": "ag-factions-source-export/0.4", "definitions": [...], "starting_state": [...]}` | `FACTION-` (`entity_type: "Faction"`, `renown_track`) or `DEITY-` (`entity_type: "Deity"`, `individual_track`, `deity`); tracks `RENOWN-` | approved / `reveal_gated`; tracks `player` | §7, §7A |
| HQ facilities | a bare array `[Facility, ...]` | `FAC-`, `entity_type: "Facility"` | approved / **`player` only** | §8 |
| Organize rules | `.organize-rules.json`: `[rule, ...]` (Manager → Organize → Import) | rule ids lowercase-dashed | — | §10.2 |
| Profession crosswalk baseline | `.crosswalk.json`: `{"professions": {...}}` (Ledger → GM Setup) | profession keys | — | §10.3 |
| Scene moods and layers | `.scene-moods.json`: `{"format": "ashen-gate.scene-moods", "formatVersion": 1, "presets": [...]}` (Manager → Scenes → Export & import) | preset ids lowercase-dashed, `kind` `mood` or `layer` | — | §10.1 |

**Never put in the public foundry repo or in an example:** real campaign content of any kind — setting names, NPCs, places, plots, GM notes, `gm`-visibility records, unrevealed records, deity or faction secrets, NPC Codex exports from a real world, world exports. Campaign files live in the private supplement repo and go to Robb directly. Anything you write as an example uses `[EXAMPLE]` or `[TEST]` names.

**Never write** (they are play state or world-local, owned by the modules): Renown scores or history, deity favour, who discovered a faction/deity/NPC, NPC Codex reveals, quest status or revealed objectives, journeys (party marker, legs, hazards, travel log, travel behaviours), route discovery after creation, Ledger XP/levels/known recipes, skill-tree purchases, HQ layout/staff, stash or purse, Foundry UUIDs (except the optional `uuid` link fields that say so), `pinKey`, `published`, `sceneUuids`, `drawingUuid`.

**Never invent** a field, file kind or value list that is not on this page. If Robb asks for something §15 lists as a gap, say so and ask.

---

## 1. How content gets into Foundry

Robb imports most files through **General Manager → Import** (choose a JSON file, or a ZIP holding several). Manager recognises six kinds of file by their shape:

| File kind | Recognised by | Goes to | Module that owns the data |
|---|---|---|---|
| **Manager package** | `manifest.schema_version` = `ag-foundry-import/0.2` (or legacy `/0.1`) | Manager creates Foundry Items, Journals, Actors, Roll Tables, Macros; passes `Location` and `Route` records to Locations | Manager (documents), Locations (locations), Ledger reads its Items |
| **Quest Log file** | top-level `schema_version` = `ag-quest-source/0.1` (or `ag-source-records/0.1`) **and** every record is `entity_type: "Objective"`, no `manifest` | Quest Log | Quest Log |
| **Skill Trees file** | top-level `schema` starts with `ag-skill-trees/` and has `trees[]` | Skill Trees | Skill Trees |
| **Renown file** (factions and deities) | top-level `schema_version` starts with `ag-factions-` and has `definitions[]` (author `ag-factions-source-export/0.4`) | Renown (module id `ashen-gate-factions`; shown as "Factions" before Manager 0.28.0) | Renown |
| **Headquarters facilities** | a bare JSON **array** of `entity_type: "Facility"` records, or `{records:[...]}` with **no** `schema_version` | Headquarters | Headquarters |
| **ZIP bundle** | `.zip` holding any of the above | each file in turn | — |

Anything else is refused with a message listing the file's top-level keys. Manager never writes campaign state (Renown, quest status, HQ layout, Ledger progress, party notes, Codex reveals).

Four files are **not** Import-tab files and are refused (or skipped in a ZIP) there: Organize rules (Manager → Organize → Import, §10.2), the profession crosswalk baseline (Profession Ledger → GM Setup → Tools and checks → Import baseline file…, §10.3), an NPC Codex export (Manager → Library → NPC Codex → Restore reveals, §10.4) and a scene moods file (Manager → Scenes → Export & import, §10.1).

### 1.1 Import order and dependencies

Import in this order (a ZIP does it for you):

1. **Manager package(s)** — Professions, Materials, Recipes, Items, Perks, Journals, NPC/character Actors, Roll Tables, Macros. Inside one package Manager orders records by their `required` refs and handles cycles. **Locations in the package go after its documents, and Routes after the locations.** In a ZIP, a Manager file that holds only Route records is imported after the other Manager files.
2. **Quest Log** file.
3. **Skill Trees** file (its perk nodes point at `PERK-*` Items from step 1; a tree imports even if a perk is missing, but that node cannot be unlocked until the perk exists).
4. **Headquarters** facilities.
5. **Renown** file: factions and deities (its `starting_state.actors[].name` must match character Actors already in the world, usually from step 1).
6. Outside Import, any time after step 1: the Ledger **crosswalk baseline** (it names professions by key, not by id, so it does not need step 1, but its `items` names usually match Items from step 1), **Organize rules** (run Organize after the imports).

Cross-file references (a quest naming a `LOC-*`, a location naming a `QUEST-*`, a faction offering a `QUEST-*`, an NPC's `codex.links`, a deity's `relations`) are stored as ids and resolve whenever both exist, in any order. In a Manager package, mark such a ref `"mode": "optional"`; a `required` ref to something neither in the package nor already in the world blocks the import.

### 1.2 Import profiles and statuses

The Import tab has two profiles:

| Profile | Imports `approved` | Imports `draft` / `proposed` | Notes |
|---|---|---|---|
| **Session-safe** (default) | yes | no ("Unapproved record; enable Include drafts to test.") | Use for live play. |
| **Development** | yes | yes | Turns on *Include drafts*. Use for testing new content. |

`superseded` and `retired` are always blocked. `example_only` is accepted only in a legacy 0.1 package. These profiles apply to Manager-package records (Locations included). Quest Log, Skill Trees, Factions and Headquarters files import whatever status they carry; their own modules decide what players see (see each section).

Statuses in 0.2: `proposed`, `draft`, `approved`, `superseded`, `retired`. Use `approved` for anything players should use; the Ledger only lets players use **approved + player-visible** materials, recipes and perks.

### 1.3 Re-import and local edits

Re-importing the same file is safe. Records match by **canonical `id`**, never by name.

| Document | Re-import with no option ticked | With the update option |
|---|---|---|
| Item, JournalEntry (Manager) | Fields the source changed are updated; fields the GM edited in Foundry are kept ("preserve local edits"); a field changed **on both sides** is a *conflict* and is not written. Journal **page** changes are blocked (pages are kept). Changing an Item's `type` is blocked. Removing a field the source used to set is blocked. | — |
| Item adopted by **Core Links** | Adopted `img` and `system` stay as the core item's; other fields (e.g. name) still update. | — |
| Actor (incl. NPC) | **Create only.** Existing Actor: skipped. | **Update existing actors**: name, image, `prototypeToken` and the package's own embedded Items follow the file. HP, XP, level, conditions, player-added Items, notes, ownership, folder and other modules' flags are kept. A JSON backup downloads first. **NPC Codex text** (`role`, `wants`, `codex.links`, …) is refreshed only when this option is on **and** the name, image, token or items also changed: a text-only change never reaches an existing NPC (Manager 0.33.0). Codex reveals are never touched. |
| RollTable, Macro | Create only; existing ones are never replaced. | — |
| Route | Existing id: kept unchanged. A deleted route's id is never reused (refused). | **Update existing locations and routes**: definition (endpoints, km, leg, hazard, terrain, name, notes, one-way) replaced; fields the record leaves out keep the world's value; discovery state, audience, Unknown-path choice, player page, map drawing and any journey are kept. |
| Location | Existing id: kept unchanged. | **Update existing locations and routes**: definition replaced; marker state, what players currently see (published card), audience, pin binding and exhausted nodes are kept. Fields added since 1.3 that the file leaves out keep the world's value. |
| Quest (Objective) | Existing id: kept. | **Update existing**: definition replaced; status, reveals and notes kept. |
| Skill tree | Existing id: kept. | **Update existing**: layout replaced; purchased nodes are protected. |
| Facility, Faction, Deity | Existing id: always kept ("Already in this world; kept as is."; no update path). `starting_state` applies to **new** factions and deities only. Change an existing faction or deity in the Renown UI. | — |
| Crosswalk baseline | Importing a new file replaces the previous baseline; GM edits in the table always win and are never changed. | — |
| Organize rules | Import replaces the whole rule list (after a confirmation). | — |

A document with the same name but no Manager id blocks creation ("rename or resolve manually"). Two documents with the same id block both.

### 1.4 ZIP bundles (Manager 0.23.0)

- One ZIP may hold several Manager packages plus Quest, Skill Tree, Headquarters and Factions files, in any folders. Up to **50 import files**, 500 entries, 60 MB zipped, 25 MB per entry, 100 MB expanded, 10 MB per JSON file. Paths must be relative (no `..`, no leading `/`).
- Manager lists every file with its kind, record count and status, then imports the ticked ones one at a time in the order of §1.1 (Manager packages first, then alphabetical within a kind). Each file gets its own preview, Apply and result.
- Other JSON files (Organize rules, crosswalk baseline, scene moods file, NPC Codex export, world export) are listed as skipped (not an error); import those with their own buttons (§10). A canonical `ag-source-package/0.1` manifest is explained, never installed. Nothing in a ZIP is executed.
- An id that already appeared in an earlier file of the same ZIP is left out of the later file (never overwritten).
- Images (`.png`, `.webp`, `.jpg`, `.jpeg`) in the ZIP are uploaded only if the GM ticks the upload option, and only those a record's `foundry.data.img` or `prototypeToken.texture.src` names by **file name**. Two images with the same file name in different folders are not uploaded.

---

## 2. The Manager package (`ag-foundry-import/0.2`)

Schema: `json/manager-package.schema.json`. Minimal example: `examples/manager-minimal.json`.

```json
{
  "manifest": {"schema_version": "ag-foundry-import/0.2", "package_id": "AG-EXAMPLE-MINIMAL", "version": "1.0.0"},
  "records": [
    {
      "id": "ITEM-EXAMPLE-LANTERN", "entity_type": "Item", "status": "approved", "version": "1.0.0",
      "provenance": {"sources": ["[EXAMPLE] schema reference"]}, "visibility": "player", "refs": [],
      "foundry": {"document_type": "Item", "data": {"name": "[EXAMPLE] Brass Lantern", "type": "loot"}}
    }
  ]
}
```

### 2.1 Top level

| Key | Required | Type / values |
|---|---|---|
| `manifest.schema_version` | yes | `"ag-foundry-import/0.2"`. (`/0.1` is legacy: looser ids, `reveal-gated` with a hyphen, string refs. Do not author 0.1.) |
| `manifest.package_id` | yes | non-empty string, convention `AG-<NAME>` |
| `manifest.version` | yes | non-empty string, convention SemVer |
| `manifest.description` | no | string |
| `records` | yes | array, at most **2000** records (split bigger sets) |
| `templates` | no | `[{id, document_type, defaults, version?}]`; a record with `template_ref: "<id>"` gets the template's `defaults` merged under its own `foundry.data`. Journal templates may not carry `pages`. |
| `legacy_crosswalk` | no | review-only list `{source_ref, legacy_id, canonical_id, reason: malformed|duplicate|namespace_collision|verified_alias, review_status: proposed|reviewed|approved|blocked}`; Manager never rebinds ids from it. |

### 2.2 Record envelope (every record)

| Field | Required | Type / allowed values | Notes |
|---|---|---|---|
| `id` | yes | `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$` | Permanent. Capitals, digits, dashes; at least one dash. Never rename; never reuse. See §9 for prefixes. |
| `entity_type` | yes | non-empty string | `Profession`, `Material`, `Recipe`, `ProfessionPerk`, `Item`, `JournalEntry`, `NPC`, `PlayerCharacter`, `RollTable`, `Macro`, `Hireling`, `HirelingPerk`, `Location`, … The domain modules read the known ones. |
| `status` | yes | `proposed` `draft` `approved` `superseded` `retired` | §1.2 |
| `version` | yes | non-empty string | Record version, e.g. `"1.0.0"`. |
| `provenance` | yes | object with **`sources`: array of strings** | e.g. `{"sources": ["[EXAMPLE] design note 12"]}`. Optional `decision_refs: [string]`. A string `source`, or `sources` as a string, is rejected. |
| `visibility` | yes | `player` `gm` `reveal_gated` | Underscore in 0.2. §2.4 |
| `refs` | yes | array (may be empty) of `{relation, target_id, mode}` | `mode`: `required` or `optional` only. No other keys. §2.3 |
| `scope` | no | `generic_rules` `setting_adapter` `publication` `campaign_state` | `campaign_state` records are never imported; a reusable definition may not reference one. |
| `name` | no | string | Display name for previews (the Foundry name is `foundry.data.name`). |
| `foundry` | yes for documents | `{document_type, data, folder_path?}` | Omit for `Location` records. A record without one is listed as "No Foundry projection" and skipped. |
| `core_ref` | no (Items) | string or `{name, source?, type?, rarity?}` | §2.6 |
| `legacy_source_id`, `template_ref` | no | string | Kept as metadata. |
| any other field | no | anything | **Kept verbatim** as the record's definition on the Foundry document (`flags.ashen-gate-manager.source.definition`). This is how Recipe ingredients, Material quality etc. reach the Ledger. |

Unsafe keys (`__proto__`, `prototype`, `constructor`) anywhere in a record reject the file.

### 2.3 refs

```json
"refs": [
  {"relation": "requires_material", "target_id": "MAT-EXAMPLE-SUNLEAF", "mode": "required"},
  {"relation": "targets_location", "target_id": "LOC-EXAMPLE-MEADOW", "mode": "optional"}
]
```

- `required`: the target must be in the same package or already in the world, else the package is blocked ("unresolved required reference"). When you Apply a subset, required targets must be selected too.
- `optional`: kept as an id even if missing, and bound later when the target exists.
- These relations are type-checked when both ends are known: `requires_material`→Material, `requires_profession`→Profession, `offers_objective`/`fulfills_objective`→Objective, `targets_location`→Location, `uses_resource`→ResourceOpportunity, `grants_power`/`mutation_power`/`has_power`→Power, `relates_to_mutation`→Mutation, `has_hireling_perk`→HirelingPerk. Other relation names are free text; common ones: `gathered_by`, `crafted_by`, `produces`, `created_by`, `perk_of`, `starting_recipe`, `has_profession`, `describes`.
- After import Manager adds a **References** list of links to the bottom of the Item/Journal text, for every ref it could resolve.

### 2.4 visibility

| Value | Meaning |
|---|---|
| `player` | Players may see it once it is in the world (Ledger: usable by players if also `approved`). |
| `gm` | GM only. Manager creates documents with no player ownership; the Ledger hides GM-only materials/recipes from players. |
| `reveal_gated` | Exists but players see it only when the GM reveals it in the owning module. |

Manager creates every document with default ownership **None**; the GM shares documents in Foundry. For Locations, what players see is decided by the location's `state`/`audience` (§4), and by Quest Log for quests.

### 2.5 `foundry` projection — allowed document data

`foundry.document_type` is one of `Item`, `JournalEntry`, `Actor`, `RollTable`, `Macro` (no Scenes, Playlists, Cards, Adventures). `foundry.data` may only contain:

| document_type | Allowed `data` keys | Rules |
|---|---|---|
| **Item** | `name`*, `type`*, `img`, `system` | `type` is the dnd5e item type (`loot`, `consumable`, `feat`, `equipment`, `weapon`, `tool`, `spell`, `container`, `background`, …). `system` is dnd5e system data, e.g. `{"description": {"value": "<p>…</p>"}, "rarity": "common", "quantity": 1}`. No `flags`, `effects` or `folder`. |
| **JournalEntry** | `name`*, `img`, `pages` | Each page exactly `{"name", "type": "text", "text": {"content": "<html>", "format"?: 1}}`. No image/PDF/video pages. |
| **Actor** | `name`*, `type`*, `img`, `system`, `prototypeToken`, `items`, `effects`, `flags` | `type` **`npc` or `character`** only. `items`: embedded Item definitions, each with `name` and `type`. Reusable NPCs: `entity_type: "NPC"` with an `NPC-*` id (§3.8). `entity_type: "Actor"` is rejected, and an `ACTOR-*` id requires `entity_type: "NPC"`. |
| **RollTable** | `name`*, `img`, `description`, `formula`, `replacement`, `displayRoll`, `results` | Each result `{type: "text"|"document", name, description, weight (>0), range: [low, high]}`. |
| **Macro** | `name`*, `img`, `type`*, `scope`, `command`* | `type` `chat` or `script`; `scope` only `global`. Script macros are imported GM-only and never run. |

`*` required. Unknown keys are rejected ("includes unsupported keys").

`foundry.folder_path` (optional): `"Ashen Gate/<A>/<B>"`. Must start with `Ashen Gate`, segments separated by `/`, no empty, `.`/`..`, `<`/`>` or backslashes. **Keep it to 4 levels in total** (`Ashen Gate` + 3): Foundry cannot nest folders deeper, and Manager's validator (which allows 8) will only fail at Apply when Foundry refuses the 5th level. Without a folder_path, documents go to `Ashen Gate — Imported Items` etc.

`img`: a Foundry path (`icons/...`, `modules/...`, `worlds/...`) or an image file name shipped in the same ZIP. Missing art falls back to a Manager icon chosen from the id prefix.

**Links in text** — inside `system.description.value` (Items, embedded Actor items), `system.details.biography.value` (Actors), `description` (RollTables) and page `content` (Journals) you may write `[[AGREF:MAT-EXAMPLE-SUNLEAF|Sunleaf]]`. On Apply it becomes a real Foundry link. The id must be in the package (and selected) or already in the world; the marker must sit in text, never inside an HTML tag or attribute; the label is optional (max 160 characters, no `]`).

### 2.6 `core_ref` — link to a 2024 core item (Manager 0.26.0)

On an **Item** record, `core_ref` names the 2024 (5.5e) core item it stands for:

```json
"core_ref": {"name": "Potion of Healing", "source": "DMG'24", "type": "consumable", "rarity": "common"}
```

or just `"core_ref": "Potion of Healing"`. `name` is required; `source` (book: `PHB'24`, `DMG'24`, `XDMG`, `SRD 5.2` …), `type` (dnd5e item type) and `rarity` make the match stronger. Manager imports the Item as usual. Later the GM runs **Manager → Core Links → Scan**: it searches world items (Plutonium/2024), world compendiums, configured core sources and the dnd5e 2024 packs (never 2014 content). A HIGH match (same name and type, and book/rarity when given) can **adopt** the core item's image and rules data while keeping the Ashen Gate name, id and folder. Since Ledger 0.17.0 crafting a recipe whose `result_item_id` is a core-linked Item awards the core item's data. Items without `core_ref` are never touched. `core_ref` on non-Item records is ignored.

---

## 3. Record types inside a Manager package

Full examples of every type: `examples/manager-full.json`. "How it appears" assumes the Session-safe profile and an approved record.

### 3.1 Profession — `PROF-*` — owner: Profession Ledger

Purpose: a crafting or gathering profession characters learn. Schema: `json/profession.schema.json`.

| Field | Req | Type / values | Used by |
|---|---|---|---|
| envelope | yes | §2.2, `entity_type: "Profession"` | |
| `name` | yes | must contain one of the Ledger's 14 professions: Alchemy, Blacksmithing, Cooking, Enchanting, Engineering, Inscription, Jewelcrafting, Leatherworking, Tailoring, Archaeology, Fishing, Herbalism, Hunting/Skinning, Mining. A `[TAG]` prefix is ignored. | Ledger matches the profession by this name |
| `profession_kind` | rec. | `crafting` \| `gathering` | reference |
| `access.toolProficienciesAnyOf` | no | tool names (`"Herbalism Kit"`, `"Alchemist's Supplies"`) or dnd5e keys (`herb`, `alchemist`) | Ledger 0.16.0 **Assign** tab and GM Setup tools table: a character **proficient** in any one qualifies |
| `access.skillProficienciesAnyOf` | no | skill names (`"Nature"`) or dnd5e ids (`nat`) | as above |
| `access.advantageToolsAnyOf` | no | tool names/keys | shown to the GM as a suggestion; only tools the GM ticks in GM Setup give advantage on that profession's checks |
| `access.itemsAnyOf` | no | Item names (any case) or Item/Compendium UUIDs | Ledger 0.20.0: **carrying** any one qualifies (e.g. `"Fishing Tackle"`) |
| `access.toolMustBePresent` | no | boolean | stored; not enforced by any module yet |
| `workstation` | no | string or null | reference |
| `progression` | no | object | reference only; the Ledger's rules are fixed in code: 16 levels, XP to next level 5,8,11,…,47; tiers Apprentice 1, Journeyman 4, Expert 7, Artisan 10, Master 13 |
| `starting_recipe_ids` | no | `REC-*` ids | reference (also give `starting_recipe` refs) |
| `foundry` | yes | Item, usually `type: "feat"` | |

Names in `access` that match no dnd5e skill or tool are listed to the GM and ignored, never guessed. An `access` object with no lists leaves the built-in defaults. **Careful (Ledger 0.21.0 code):** as soon as `access` sets *any* one of the four lists, every skill/tool list it leaves out counts as "none" for that profession (the built-in check skill/tool no longer qualifies). Give all the lists you want, or put qualifying rules in the crosswalk baseline file (§10.3) instead, which works list by list. Two `PROF-*` records for the same profession that disagree are both dropped from this layer and reported.
In Foundry: a feat Item in `Ashen Gate/…/Professions`. The Ledger's Assign tab gives it to qualifying characters; Skill Trees profession trees point at the `PROF-*` id.

### 3.2 Material — `MAT-*` — owner: Profession Ledger (catalog), gathering via Locations

Purpose: crafting input and gathering reward. Schema: `json/material.schema.json`.

| Field | Req | Type / values | Notes |
|---|---|---|---|
| `name` | yes | string | |
| `quality` | yes | `Common` \| `Rare` \| `Exotic` | The Ledger reads only these three (anything else, e.g. "Uncommon", is ignored). **Exotic** materials can be found by Exotic discovery (§4.4). |
| `tierId` | yes | `apprentice` `journeyman` `expert` `artisan` `master` (or 1–5) | An Exotic is findable only at nodes of this tier or higher. |
| `source_profession_id` | yes for Exotic | `PROF-*` | The gathering profession; a `gathered_by` ref to a `PROF-*` also counts. |
| `unit`, `priceGp`, `weightLb`, `flavor`, `tags` | no | string / number / number / string / [string] | reference |
| `foundry` | yes | Item, usually `type: "loot"` | Give `system.quantity` if you want it to stack. |

Only **approved, player-visible** materials can be awarded by gathering or used by players in recipes. In Foundry: a loot Item; gathering awards copies to the character.

### 3.3 Recipe — `REC-*` — owner: Profession Ledger

Purpose: what a crafter can make. Schema: `json/recipe.schema.json`.

| Field | Req | Type / values | Notes |
|---|---|---|---|
| `name` | yes | string | |
| `profession_id` | yes | `PROF-*` | |
| `tier` | rec. | `apprentice` … `master` | shown on the recipe; gates by profession level |
| `ingredients` | yes | non-empty array of `{"material_id": "MAT-…", "quantity": <whole number ≥ 1>}` | Strings, fractions or an empty list make the recipe **uncraftable** (Manager still imports it). `materialId` is also accepted. |
| `result_item_id` | yes | id of the `ITEM-*` record it produces | Crafting gives a copy of that world Item (or of its core-linked item, §2.6). |
| `tool` | no | dnd5e tool key (`alchemist`), tool name, or Item UUID | single tool |
| `required_tools` | no | array (≤10) of tool names/keys/UUIDs or `{key, uuid, name}` | **all** listed tools are required, in addition to `tool`. Tool names map to dnd5e tools. |
| `workstation` | no | string | shown on the card |
| `effort` | no | string, e.g. `short`, `long` | display |
| `additional_gp` | no | number ≥ 0 | extra gold cost shown when > 0 |
| `starting` | no | boolean | reference (starting recipe) |
| `rules_summary` / `description` | no | string | shown on the card |
| `market_gp`, `craft_gp`, `price_class`, `origin` | no | | reference |
| `foundry` | yes | Item, usually `type: "consumable"`, name `Recipe: …` | Players learn a recipe from this Item. |

Give `crafted_by`, `produces` and `requires_material` refs too (with `required` mode, all targets in the package).

### 3.4 Item — `ITEM-*` — owner: Manager (document)

Any finished item: crafted results, loot, gear. `entity_type: "Item"`, `foundry.document_type: "Item"`. Optional `created_by_recipe_id: "REC-…"` (Organize files crafted items under the recipe's tier), optional `core_ref` (§2.6), any reference fields (`rarity_price_class`, `market_gp`, `rules_summary`).

### 3.5 ProfessionPerk — `PERK-*` — owner: Profession Ledger / Skill Trees

| Field | Req | Type | Notes |
|---|---|---|---|
| `name` | yes | string | node name in Skill Trees |
| `profession_id` | yes | `PROF-*` | |
| `tier` | rec. | `apprentice` … `master` | the level a profession tree node needs (Apprentice 1, Journeyman 4, Expert 7, Artisan 10, Master 13) |
| `point_cost` | no | integer 1–100 | cost on generic-point trees (profession trees always cost 1) |
| `foundry` | yes | Item `type: "feat"` | the description becomes the node text |

### 3.6 HirelingPerk — `HPERK-*` — owner: Headquarters

| Field | Req | Type / values |
|---|---|---|
| `entity_type` | yes | `HirelingPerk` (an `HPERK-*` id requires it) |
| `name` | yes | string |
| `contexts` | yes | non-empty, unique, from `headquarters` `field` `passive` |
| `conditions` | yes | object, only `requires_working` (bool), `requires_presence` (bool), `eligible_facility_refs` ([`FAC-*`]), `required_capability_keys` ([lowercase key]) |
| `stacking` | yes | object, only `overlap_group` (lowercase key), `allow_overlap` (bool) |
| `implementation` | yes | `automatic` `informational` `gm_resolved` `hybrid` |
| `foundry` | yes | Item `type: "feat"` |

`Hireling` (`HIRE-*`) definitions (`role`, `capabilities: [{key, label, description}]`) import as feat Items too; Headquarters reads hirelings it is given.

### 3.7 JournalEntry — `JRN-*` — owner: Manager

Handouts and notes. `foundry.data.pages` as in §2.5. Journals are created with no player access; the GM shares them. Page changes on re-import are blocked (pages stay as first imported), so get pages right or use a new id.

### 3.8 NPC — `NPC-*` (Codex) — owner: Manager (definition and Codex), Foundry (play state)

Schema: `json/npc.schema.json`. Example: `examples/npc-codex.json`. Generic doc in the foundry repo: `docs/npc-codex-schema.md`.

An NPC is a Manager record with `entity_type: "NPC"` and an Actor projection (`foundry.document_type: "Actor"`, `data.type: "npc"`). Manager imports it as an Actor shell, matched by id. Since Manager 0.33.0 every imported NPC record also appears in **General Manager → Library → NPC Codex**: the GM decides, field by field, whether nobody, the whole party or particular characters know it; players get a read-only codex of only what was revealed to them (if the GM turns on *NPC Codex* player access in GM Setup).

```json
{
  "id": "NPC-EXAMPLE-MIRA-VANE", "entity_type": "NPC", "status": "approved", "version": "1.0.0",
  "provenance": {"sources": ["[EXAMPLE] schema reference"]}, "visibility": "gm",
  "refs": [{"relation": "found_at", "target_id": "LOC-EXAMPLE-FERRY-GATE", "mode": "optional"}],
  "name": "[EXAMPLE] Mira Vane",
  "role": "…", "appearance": "…", "signature_line": "…", "wants": "…", "knows": "…",
  "portrayal": "…", "session_role": "…", "stat_block": "Commoner (2024)", "gm_notes": ["…"],
  "art": {"repo_path": null, "forge_path": null},
  "codex": {
    "links": ["FACTION-EXAMPLE-FERRYMEN", "QUEST-EXAMPLE-SUNLEAF"],
    "default_reveal": {"discovery": "hidden", "fields": {"role": "party", "appearance": "party"}}
  },
  "foundry": {"document_type": "Actor", "folder_path": "Ashen Gate/NPCs",
    "data": {"name": "[EXAMPLE] Mira Vane", "type": "npc", "img": "icons/svg/mystery-man.svg", "system": {}}}
}
```

| Field | Type | Default | Codex use |
|---|---|---|---|
| `id` | `NPC-…` | required | Permanent. Neutral, no spoilers (players never see it, but it is in exports). `ACTOR-*` ids still work (they need `entity_type: "NPC"` too); use `NPC-*` for new NPCs. |
| `entity_type` | `"NPC"` | required | Only `NPC` records appear in the Codex (case-sensitive). |
| `name` | string | Actor name | Shown once the NPC is discovered. |
| `role` | string | `""` | **Revealable.** Shown under the name. |
| `appearance` | string | `""` | **Revealable.** |
| `signature_line` | string | `""` | **Revealable.** Shown as a quote. |
| `wants` | string | `""` | **Revealable.** |
| `knows` | string | `""` | **Revealable.** |
| `portrayal`, `session_role`, `stat_block` | string | `""` | **GM only.** Never revealable, never in a player's data. |
| `gm_notes` | string[] | `[]` | **GM only.** |
| `art` | `{repo_path, forge_path}` | nulls | Not read by the Codex; the portrait is the Actor `img`. |
| `refs` | refs | `[]` | Refs to linkable ids also show as connections. |
| `codex.links` | string[] | `[]` | Ids of related records, shown as connections. Linkable prefixes only: `LOC-`, `FACTION-`, `RENOWN-`, `FAC-`, `QUEST-`, `ORDER-`, `CONTRACT-`, `NPC-`. Anything else is dropped. Shown by name when the owning module knows the id, else as the id. |
| `codex.default_reveal` | `{discovery, fields}` | all hidden | Starting reveals, used **only until the GM changes anything** for that NPC. `discovery` and each field take `"hidden"` or `"party"`. Field keys: `role`, `appearance`, `signature_line`, `wants`, `knows`, `learned`, `links`. |

Rules the Codex applies without rejecting anything (the checker reports them as errors): text fields must be strings (a list becomes `"a,b"`), `default_reveal` values other than `"party"` read as hidden (`"everyone"`, `true`), unknown `fields` keys and non-linkable `codex.links` are dropped. Per-character reveals, "What the party has learned", GM-added links and GM notes are made in play and stored on the Actor (`flags.ashen-gate-manager.codex`); never write them. `codex` on a non-NPC record is ignored.

Write NPC text the way players should read it once revealed: each revealable field stands alone (no "see above"), and nothing GM-only goes into `role`, `appearance`, `signature_line`, `wants` or `knows`. Put secrets in `portrayal`, `session_role` or `gm_notes`.

`system` is dnd5e actor data (`abilities.<abl>.value`, `attributes.hp`, `attributes.ac`, `details.cr`, `details.biography.value`, `skills.<id>.value`, `tools.<key>.value`); embedded `items` are full Item definitions. Test player characters use `entity_type: "PlayerCharacter"`, `PC-*`, `data.type: "character"`. Actors are create-only unless *Update existing actors* (§1.3).

### 3.9 RollTable — `TABLE-*`, Macro — `MACRO-*`

See §2.5. Both are create-only. Use `visibility: "gm"` for GM tools.

---

## 4. Location records — `LOC-*` — owner: Locations

Locations travel **inside a Manager package** as records with `entity_type: "Location"` and the location body under `location`. No `foundry` block. Manager passes them to Locations after the package's documents; Locations must be active. Schema: `json/location.schema.json`. Two full examples (a Region and a child) are in `examples/manager-full.json`.

```json
{
  "id": "LOC-EXAMPLE-MEADOW", "entity_type": "Location", "status": "approved", "version": "1.0.0",
  "provenance": {"sources": ["[EXAMPLE] schema reference"]}, "visibility": "reveal_gated", "refs": [],
  "name": "[EXAMPLE] Sunleaf Meadow",
  "location": {
    "name": "[EXAMPLE] Sunleaf Meadow", "type": "Meadow", "region": "[EXAMPLE] Lowlands",
    "threat": "hot", "state": "unidentified", "unidentifiedLabel": "A bright field",
    "parentLocationId": "LOC-EXAMPLE-VALE", "sections": {"resources": true},
    "resources": [{"id": "example-sunleaf-patch", "label": "[EXAMPLE] Sunleaf patch", "skill": "Herbalism",
      "tier": 2, "dc": 12, "materialId": "MAT-EXAMPLE-SUNLEAF", "quantity": 2,
      "exotics": [{"materialId": "MAT-EXAMPLE-STARBLOOM", "mode": "designated", "chance": 15, "condition": "rare"}]}]
  }
}
```

**Locations never rejects a field — it silently drops or resets bad values.** The foundry-repo checker flags every such change; the "Was changed to" lines in `examples/invalid/25…31` show what happens.

### 4.1 Record and body fields

| Field | Type / allowed values | Default | Notes |
|---|---|---|---|
| `id` | `^LOC-[A-Z0-9]+(-[A-Z0-9]+)*$` | — | anything else is skipped |
| `location.name` | string ≤ 200 | record `name`, else "New Location" | always shown once revealed |
| `type`, `region` | string ≤ 200 | `""` | |
| `description` | plain text ≤ 20 000 | `""` | |
| `img` | Foundry path (no `javascript:`/`data:`, no quotes) | `""` | |
| `threat` | `settled` `light` `normal` `hot` `deadly` | `normal` | |
| `state` | `hidden` `unidentified` `revealed` | `hidden` | **Imported unidentified/revealed locations publish their imported content to players at once.** Legacy `revealed: true` reads as revealed. |
| `unidentifiedLabel` | string ≤ 80 | world default "Unknown location" | what players see while unidentified |
| `teaser` | text ≤ 2000 | `""` | shown while unidentified |
| `show` | `{type, region, description, img, threat}` booleans | all `true` | per-field player visibility |
| `sections` | `{conditions, resources, factions, quests, related, loot, notes}` booleans | all **`false`** | a section is shown to players only when its switch is `true` |
| `parentLocationId` | `LOC-*` or `""` | `""` | nesting; a loop is refused |
| `isRegion` | boolean | `false` | a Region groups places |
| `passConditions` | boolean | `false` for new records | 1.8.0: a Region passes its Conditions down to places inside only when `true` |
| `conditionOverrides` | `[{from: <Region LOC id>, conditionKey, disabled?, label?, text?}]` | `[]` | a child turns off or rewrites an inherited condition |
| `placeable` | boolean | `null` = yes unless a Region | 1.8.0: listed in Place on Scene / drag-to-map |
| `audience` | `{mode: "everyone" | "selected", userIds: [Foundry user ids], sharing: bool}` | everyone | 1.8.0: "selected" = only those players (world-local user ids; usually leave `everyone` and set in Foundry) |
| `pin` | `{img, unidentifiedImg, size: 16–256}` | castle / mystery-man icons, 48 | map pin art |
| `layout` | ordered block keys: `description conditions children resources factions quests related loot notes scenes detail:<key>` | default order | unknown keys dropped, missing ones appended |

Do not author `pinKey`, `published` or `sceneUuids` (generated, world-local).

### 4.2 List entries

Every list entry takes an optional `key` (or `id`) ≤ 40 characters (stable; generated if missing) and `visible` (boolean, default `true`; per-entry player toggle). Empty entries are dropped.

| List | Entry fields |
|---|---|
| `conditions` | `label`, `text` (≤ 2000) |
| `resources` | gathering node, §4.3 |
| `factions` | `label`, `note` (≤ 500), `uuid`, `docType` (world-local link; usually leave empty) |
| `quests` | `questId`: `QUEST-*`, `ORDER-*` or `CONTRACT-*` (Quest Log decides what players see) |
| `related` | `locationId`: `LOC-*` (not itself) |
| `loot` | `label`, `text`, `img`, `status`: `available` `discovered` `taken` (default available), `uuid`, `docType`. Players see only label/text/img. |
| `notes` | `title`, `text`, `uuid`, `docType` |
| `details` | custom blocks: `key` (used in `layout` as `detail:<key>`), `title`, `text`, `uuid`, `docType` |

### 4.3 Gathering node (`resources[]`)

| Field | Type / range | Default | Notes |
|---|---|---|---|
| `label` | string | | node name |
| `skill` | string ≤ 80 | | the gathering profession: `Herbalism`, `Mining`, `Fishing`, `Skinning & Harvesting`, `Archaeology` (Exotics need one of these) |
| `tier` | integer 1–5 | 1 | out of range → 1 |
| `dc` | integer 1–40 | tier default | **tier defaults 10 / 12 / 15 / 18 / 20** (tiers 1–5, since 1.9.0) |
| `dcVisible` | boolean | false | players see the DC |
| `materialId` | `MAT-*` | | Common bundle on success |
| `quantity` | integer 1–999 | 1 | |
| `rareMaterialId` | `MAT-*` or `""` | | Rare bundle on success by 5+ |
| `rareQuantity` | integer 1–999 | 1 | |
| `finite` | boolean | true | a finite node is exhausted after one gather |
| `exhausted` | boolean | false | play state; kept on update |
| `available` | boolean | true | |
| `note` | string ≤ 500 | | |
| `uuid` | world-local link | | |
| `exotics` | array ≤ 20, §4.4 | `[]` | GM only; players never see candidates |

### 4.4 Exotic candidates on a node (Locations 1.9.0, Ledger 0.15.0)

```json
"exotics": [
  {"materialId": "MAT-EXAMPLE-STARBLOOM", "mode": "discovery"},
  {"materialId": "MAT-EXAMPLE-MOONMOSS", "mode": "designated", "chance": 15, "condition": "rare"}
]
```

| Field | Values | Notes |
|---|---|---|
| `materialId` | `MAT-*` | each material once per node |
| `mode` | `discovery` \| `designated` | **`discovery`** = random discovery: one d100 per successful gather against the world chance (default 2%). **`designated`** = this node is a designated source with its own chance. Any other word (e.g. `random`) becomes `discovery`. |
| `chance` | integer 1–100 | **required for `designated`**; without it the candidate is kept but never awards |
| `condition` | `success` \| `rare` | designated only: any success, or success by 5+ only (default `success`) |

A candidate is found only if its Material is approved, player-visible, `quality: "Exotic"`, gathered by the node's profession (`source_profession_id`) and its tier is not above the node's tier. At most one d100 per gathering action; a failed check never rolls.

### 4.5 How a Location appears

In the Locations window (Items sidebar, GM-only launcher) as a card, nested under its parent; on maps via Place on Scene. Players see the published card through the Actors-sidebar launcher once the GM reveals it. Player views never include `gm` notes (`visible: false`), Exotic candidates, hidden DCs, hidden sections, or unidentified true names.

---

## 4A. Route records — `RTE-*` — owner: Locations (Locations 1.10.0+, Manager 0.27.0+)

A Route joins two locations for point-crawl travel. Routes travel in a **Manager package** like Locations do (in the same file or a separate one), with the route body under `route` and no `foundry` block. Manager passes them to Locations after the locations. Schema: `json/route.schema.json`. Examples: `examples/routes.json`, `examples/routes-only.json`. The generic schema doc in the foundry repo is `docs/routes-schema.md`.

```json
{
  "id": "RTE-EXAMPLE-FORD-INN", "entity_type": "Route", "status": "approved", "version": "1.0.0",
  "provenance": {"sources": ["[EXAMPLE] schema reference"]}, "visibility": "gm",
  "name": "[EXAMPLE] Ford to Inn",
  "refs": [
    {"relation": "route_from", "target_id": "LOC-EXAMPLE-FORD", "mode": "required"},
    {"relation": "route_to", "target_id": "LOC-EXAMPLE-INN", "mode": "required"}
  ],
  "route": {
    "from_location_id": "LOC-EXAMPLE-FORD", "to_location_id": "LOC-EXAMPLE-INN",
    "distance_km": 32, "leg_km": 8, "hazard_base_percent": 15,
    "hazard_table": "[EXAMPLE] Road Hazards", "terrain": "Muddy cart track",
    "discovery_state": "rumoured", "directed": false,
    "name": "[EXAMPLE] Cart Track", "notes": "[EXAMPLE] GM-only note"
  }
}
```

Envelope: as §2.2, with `id` `^RTE-[A-Z0-9]+(-[A-Z0-9]+)*$`, `entity_type: "Route"`, and `name` (Manager's display label; the route's own name is `route.name`). `visibility: "gm"` is recommended: who sees a route is set by `discovery_state` and the GM, not by this field. `refs` with `route_from` / `route_to` are recommended and are used when the `route` block leaves out the endpoints. A required ref to a location that lives only in Locations is accepted (Manager 0.27.0+). In a routes-only file you can also leave `refs` empty and give the endpoints in `route`.

| `route` field | Req | Type / range | Default | Notes |
|---|---|---|---|---|
| `from_location_id` | yes | `LOC-*` | | must exist in Locations or be created in the same run |
| `to_location_id` | yes | `LOC-*`, ≠ from | | |
| `distance_km` | yes | **number** > 0, ≤ 100000 | | a JSON number, not a string |
| `leg_km` | no | number > 0, ≤ 100000 | world setting: **5 km** (Locations 1.13.1+; a world that saved its own value keeps it) | legs = ceil(distance ÷ leg), at least 1. Leave it out to follow the world setting. |
| `hazard_base_percent` | no | number 0–100 (rounded) | **5** (Locations 1.13.1+; was 10) | each journey starts at this chance; after a leg with no hazard it doubles (max 100), after a hazard it resets; 0 = never |
| `hazard_table` | no | string: `RollTable.<id>`, `Compendium.<pack>.RollTable.<id>` or a RollTable **name** | none | a missing table just shows "Hazard!". Ship the table as a `TABLE-*` record and use its name. |
| `terrain` | no | string ≤ 80 (longer is cut) | `""` | players who can see the route see it |
| `discovery_state` | no | `unknown` `rumoured` `known` `explored` | `unknown` | used only when the route is **created**; re-import never changes it. `unknown` = players see nothing. |
| `directed` | no | boolean | false | true = one-way, from → to (no Turn back) |
| `name` | no | string ≤ 200 (longer is cut, line breaks removed) | `""` (lists show "From – To") | players who can see the route see it: never name a hidden place here |
| `notes` | no | string ≤ 5000 (longer is cut) | `""` | GM only |

Unlike Location fields, **a wrong type or out-of-range value is an error**: that route is skipped and reported, and the rest of the import carries on. Unknown keys are ignored. A player sees a route only when it is discovered (not `unknown`), both ends are visible to that player, and the GM has not limited it to other players. Exact skip reasons (Locations 1.15.1): `id must look like RTE-NAME.`, `from_location_id must be a LOC-* id.`, `from_location_id and to_location_id must differ.`, `distance_km is required.`, `distance_km must be a number above 0 and at most 100000.`, `leg_km must be …`, `hazard_base_percent must be a number from 0 to 100.`, `discovery_state must be one of unknown, rumoured, known, explored.`, `directed must be true or false.`, `hazard_table must be a RollTable UUID or name.`, `Endpoint not found: …`, `Duplicate id in this import.`, `This route id belonged to a deleted route and is not reused. Give the record a new RTE id.`

### 4A.1 Journeys and travel behaviours (play state, never imported)

Journeys (party marker, legs travelled, hazard rolls, travel log; Locations 1.11.0), pausing (1.14.0), a route's linked map drawing (`drawingUuid`, 1.12.0) and **travel behaviours** (1.15.0) are play state. They are never in an import or an export, and re-import never changes them. Do not write them. For reference only, a journey's `behaviours` (GM Data Journal) has this shape (`json/journey-behaviours.schema.json`):

```json
"behaviours": {
  "pace":   {"enabled": true, "value": "normal"},
  "watch":  {"enabled": true, "first": ["<actorId>"], "second": [], "third": []},
  "checks": {"enabled": true, "forage": "sur", "navigate": "sur"}
}
```

`pace.value` `slow`|`normal`|`fast`; each watch up to 8 world-local character Actor ids; `checks.forage`/`navigate` a dnd5e skill id (default `sur`), used to prefill Utilities' Start Rolls (Utilities 0.13.0+). **Tracking only**: nothing reads behaviours to change rolls, hazard chance, legs, supplies or rest. Players see only pace and watch names while the journey is active. If Robb wants travel rules (e.g. pace changing distance), that is a design question for him, not a field to invent.

## 5. Quest Log file — `QUEST-*` / `ORDER-*` / `CONTRACT-*` — owner: Quest Log

A separate file (not a Manager package). Schema: `json/quest-file.schema.json`. Example: `examples/quests.json`.

```json
{
  "schema_version": "ag-quest-source/0.1", "domain": "quests_orders", "version": "1.0.0",
  "records": [{
    "id": "QUEST-EXAMPLE-SUNLEAF", "entity_type": "Objective", "objective_kind": "quest",
    "status": "approved", "version": "1.0.0", "provenance": {"sources": ["[EXAMPLE] schema reference"]},
    "visibility": "player", "refs": [], "name": "[EXAMPLE] Sunleaf for the Healer",
    "public_summary": "The healer needs fresh Sunleaf from the meadow.",
    "source": {"description": "GM-only issuer notes"},
    "objectives": [{"key": "gather", "goal": "Gather two bundles of Sunleaf"}],
    "locations": ["LOC-EXAMPLE-MEADOW"], "parameters": {}, "outcomes": {}
  }]
}
```

| Field | Req | Type / values |
|---|---|---|
| `schema_version` (file) | yes | `ag-quest-source/0.1` (or `ag-source-records/0.1`). Without it Manager does not recognise the file. |
| `id` | yes | `QUEST-*` for `quest`, `ORDER-*` for `work_order`, `CONTRACT-*` for `contract` (prefix must match the kind) |
| `entity_type` | yes | `Objective` |
| `objective_kind` | yes | `quest` `work_order` `contract` |
| `work_order_domain` | work orders | `crafting` \| `production` |
| `status`, `version`, `visibility`, `refs` | yes | as §2.2 (refs strictly `{relation, target_id, mode}`) |
| `provenance.sources` | yes | array of strings |
| `scope` | no | `generic_rules` `setting_adapter` `publication` (never `campaign_state`) |
| `name` | yes | string |
| `public_summary` | no | what players read |
| `source` | yes | object, e.g. `{"description": "GM-only issuer notes"}` |
| `objectives` | yes | non-empty; each `{key: ^[a-z][a-z0-9_]*$ (unique), goal: string, visibility?: player|reveal_gated|gm, reveal_on_create?: bool}` |
| `locations` | yes | array of `LOC-*` strings or `{target_id: "LOC-*"}` (may be empty) |
| `parameters`, `outcomes` | yes | objects (may be empty); `outcomes.description` is shown to the GM as suggested rewards (GM grants them) |

Players see a quest only when its `visibility` is not `gm`, the GM has moved it out of *Hidden*, and (for `reveal_gated`) revealed it. Objectives with `visibility: "gm"` never reach players; `reveal_gated` ones (or `reveal_on_create: false`) wait for the GM. Status, reveals and notes are campaign state owned by Quest Log.

---

## 6. Skill Trees file — owner: Skill Trees

Schema: `json/skill-trees-file.schema.json`. Example: `examples/skill-trees.json`. File: `{"schema": "ag-skill-trees/0.3", "trees": [...]}` (0.2 is still read). Max 120 trees, 300 nodes per tree.

| Tree field | Req | Type / values |
|---|---|---|
| `id` | yes | `^[A-Za-z][A-Za-z0-9_-]{2,100}$` (a layout id, not a canonical id) |
| `name` | yes | 1–120 characters |
| `description` | no | string |
| `status` | yes (default draft) | `draft` `test` `approved` |
| `visibility` | yes (default gm) | `player` `gm` `reveal_gated` |
| `provider.kind` | yes | `profession` (points = Ledger level of `sourceRef`, 1 per level, max 16) · `generic_points` (`maxPoints` 1–999 or null) · `cinder_milestone` (`maxPoints` must be 13) |
| `sourceRef` | profession / cinder | `PROF-*` for profession trees, `MUT-*` for cinder trees, else null |
| `nodeSize` | no | `compact` \| `normal` |
| `background` | no | `{image, fit: cover|tile|fixed, opacity: 0.05–1}` |
| `tiers` | no | ≤ 40 bands `{level 1–99, label ≤ 40, y 0–6000, icon?}` |

| Node field | Req | Type / values |
|---|---|---|
| `id` | yes | same pattern as tree id, unique in the tree |
| `perkId` | rec. | `PERK-*` (profession and generic trees) or `POWER-*` (cinder and generic). `HPERK-*` never. With a perk, name/description/image come from the perk Item. |
| `name` | without perk | 1–120 characters |
| `description` | no | string |
| `x`, `y` | yes | numbers 0–6000 (canvas position) |
| `cost` | no | integer 1–100 (profession nodes always cost 1) |
| `minLevel` | no | integer 1–99; raises (never lowers) the perk tier's level |
| `requiresAll` | yes | node ids (all needed) |
| `requiresAny` | yes | groups of node ids: `[["A","B"]]` = A or B; no empty group |
| `excludes` | yes | node ids that cannot both be taken |
| `status` | yes | `approved` `test` `draft` `placeholder` (a placeholder must be `gm` + `hidden`) |
| `visibility` | yes | `player` `gm` `reveal_gated` |
| `display` | yes | `shown` `teaser` `hidden` |

No self or missing prerequisites, no cycles, no excluding a prerequisite. Profession trees are expected to have 24 nodes (16 choosable) — fewer gives a warning, not an error. Image paths must be local Foundry paths or `https://*.forge-vtt.com/...` images.

---

## 7. Renown file: factions — `FACTION-*` — owner: Renown (`ashen-gate-factions`)

Schema: `json/factions-file.schema.json`. Examples: `examples/factions.json`, `examples/deities.json` (§7A). **Closed schema: any field not listed here is rejected** ("unclassified field"; a few legacy keys are silently stripped instead). Only the first structural error of a definition is reported, so fix and re-check.

File: `{"schema_version": "ag-factions-source-export/0.4", "note"?: string, "definitions": [Faction or Deity, ...], "starting_state"?: [...]}`. Author **0.4** (Renown 0.11.0+). `0.3` files still import but may hold factions only; any other version is refused (`schema_version must be ag-factions-source-export/0.3 or ag-factions-source-export/0.4.`). Renown's own export always writes 0.4. Two definitions with the same id in one file are refused. One bad definition blocks the whole file (`Import blocked: …`).

| Faction field | Req | Type / values |
|---|---|---|
| `id` | yes | `FACTION-[A-Z0-9-]+` |
| `entity_type` | yes | `Faction` |
| `status`, `version`, `visibility`, `refs` | yes | §2.2; refs may include `offers_objective` / `associated_objective` → `QUEST-*`/`ORDER-*`/`CONTRACT-*` |
| `provenance` | yes | only `sources` (≥ 1 string) and `decision_refs` |
| `scope` | no | `generic_rules` `setting_adapter` `publication` |
| `name` | yes | string |
| `leader`, `public_role` | yes (may be `""`) | strings (each can be revealed separately in play) |
| `folder_key`, `tags` | no | string, [string] |
| `discovery` | no (default `{placeholder: false, sharing_enabled: true}`) | `{placeholder: bool, sharing_enabled: bool}` (placeholder = players see "Undiscovered Faction") |
| `renown_track` | yes | RenownTrack, `default_scope: "group"` |
| `individual_track` | no (default: a five-rank personal track `<faction id>`-based) | RenownTrack, `default_scope: "individual"`, convention id `<renown_track id>-IND` |
| `entries` | no (default `[]`) | `{id, name, text?, uuid?, link_mode: preview|document, unlock: manual|group_renown|individual_renown, threshold?: int ≥ 0}`; `id` any non-blank string, unique in the definition |
| `rewards` | no (default `[]`) | `{id, key, audience: group|individual, milestone_id, name, teaser?, description?, kind: custom|uuid, uuid? (required for uuid), tags: [], behavior: one_time|repeatable_service|passive, usage_limit: int ≥ 0}`; `id` unique in the definition |

The importer overwrites every record `version` with `"0.3.0"`; write `"1.0.0"` anyway. `status` and `visibility` are required (no defaults).

RenownTrack: `{id: RENOWN-*, entity_type: "RenownTrack", status, version, provenance, visibility, refs, default_scope, milestones}` with **exactly five** milestones `{id, key, name, threshold, benefit, selection_mode: all|choose_one}`; thresholds strictly increasing and the first is `0`. If `milestones` is left out, the standard five ranks are filled in (Unproven 0, Recognized 3, Trusted 6, Proven 10, Esteemed 15). A reward's `milestone_id` must be one of the track's milestone ids.

`starting_state` (optional, applied to **new** factions and deities only): `{faction_id, party_discovered?: bool, group_renown?: [{delta, reason}], actors?: [{name, discovered?: bool, renown?: [{delta, reason}]}]}`. `delta` is a non-zero integer ≤ 1000 in size; `reason` 1–400 characters; actor `name` must match a character in the world exactly (missing ones are reported and skipped). Each `faction_id` (a `FACTION-*` or `DEITY-*` id) needs a matching definition in the same file and may appear once. A definition that is rejected also makes its `starting_state` row fail (`… has no matching definition.`).

## 7A. Deity records (Pantheon) — `DEITY-*` — owner: Renown (Renown 0.11.0+, Manager 0.29.0+)

Schema: `$defs/deity` in `json/factions-file.schema.json`. Example: `examples/deities.json`. Generic doc in the foundry repo: `docs/renown-deity-schema.md`.

A deity is a Renown definition with `entity_type: "Deity"` in the `definitions[]` of an **`ag-factions-source-export/0.4`** file (a deity in a 0.3 file is refused). Factions and deities may share one file. Standing with a deity is **per character only**: no group score, no group track, no group rewards. Players see a Pantheon tab with the deities revealed to their characters.

| Field | Req | Type / values | Notes |
|---|---|---|---|
| `id` | yes | `DEITY-[A-Z0-9-]+` | permanent |
| `entity_type` | yes | `"Deity"` (exact case; `"deity"` gives `Unrecognized faction record.`) | |
| `status` | yes | `proposed` `draft` `approved` `superseded` `retired` | no default |
| `version` | yes | string | overwritten with `"0.3.0"` on import |
| `provenance` | yes | `{sources: [≥1 string], decision_refs?: [string]}` | |
| `visibility` | yes | `player` `gm` `reveal_gated` | no default; use `reveal_gated` |
| `refs` | yes | refs (§2.3); may be `[]` | |
| `scope` | no | `generic_rules` `setting_adapter` `publication` | |
| `name` | yes | non-empty string | |
| `tags` | no | [string] | GM-only keywords |
| `discovery` | write it | `{placeholder: bool, sharing_enabled: bool}` | default `{placeholder: false, sharing_enabled: true}`; who discovered it is play state |
| `individual_track` | **yes** | RenownTrack (§7) with `default_scope: "individual"` and **five milestones** | `name` of each milestone is the deity's rank title. Write `"individual"`: the importer does not check it, but a deity has no group standing. |
| `entries` | write it | lore entries as §7, `unlock` **`manual` or `individual_renown`** only | `group_renown` → `Deity information cannot unlock by group Renown.` |
| `rewards` | write it | rewards as §7, `audience` **`individual`** only | `group` → `Deity rewards are per character only (audience individual).` |
| `deity` | write it | profile, below | defaults to a blank `major` profile |

Not allowed on a deity: `leader`, `public_role`, `folder_key`, `renown_track` (faction-only; the importer silently drops them, so they are lost, not kept). Any other unknown field is rejected.

`deity` profile (closed):

| Field | Type | Default | Notes |
|---|---|---|---|
| `symbol` | string ≤ 500 | `""` | image path of the holy symbol, e.g. a Forge Assets Library path `assets/ashen-gate/deities/<name>.png`; `javascript:`, `data:`, `vbscript:` refused; empty = a plain sun glyph |
| `title` | string ≤ 4000 | `""` | epithet under the name |
| `domain` | string ≤ 4000 | `""` | |
| `tier` | `major` \| `lesser` (lower case) | `major` | tiles are grouped Major / Lesser |
| `blurb`, `portfolio`, `teachings`, `followers`, `practices` | string ≤ 4000 each | `""` | line breaks kept |
| `saying` | `{text, attribution}` | blanks | |
| `relations` | `[{deity_id: "DEITY-…", resonance: number 0–1}]` | `[]` | one direction (this deity → that one); never to itself; at most one per other deity; the other deity may be in the same file, already in the world, or not yet exist (it shows once it does) |

**Resonance** is the GM slider: 0 = full Dissonance, 0.5 = neutral, 1 = full Resonance. When a character **gains** N favour with deity A, each relation A → B changes B by N × (resonance − 0.5) × 2 × damping (GM Setup world setting, default 0.5, max 0.95); positive results round down, negative ones away from zero; losses never spread and effects never chain; the GM confirms every related change. Players see only the word Resonance/Dissonance, and only once both deities are revealed to them. These rules are Robb's; write `resonance` as he specifies, do not tune it yourself. If a relation should go both ways, write it on both deities.

`starting_state` for a deity: `{faction_id: "DEITY-…", party_discovered?, actors?: [{name, discovered?, renown?: [{delta, reason}]}]}`. A non-empty `group_renown` is refused (`deities have no group Renown; use actors[].renown.`). Applied only when the deity is new to the world.

Re-import: an existing deity id is never changed (card, ranks, discovery and every character's favour stay). Manager's Import preview labels each row *Deity* or *Faction* (Manager 0.29.0+). The world export lists deities under `modules.deities`.

---

## 8. Headquarters facilities — `FAC-*` — owner: Headquarters

Schema: `json/facilities-file.schema.json`. Example: `examples/facilities.json`. File: a JSON **array** of 1–200 Facility records (or `{"records": [...]}` with no `schema_version`).

| Field | Req | Type / values |
|---|---|---|
| `id` | yes | `FAC-*` |
| `entity_type` | yes | `Facility` |
| `status` | yes | `draft` `approved` `proposed` |
| `version`, `refs` | yes | §2.2 |
| `provenance.sources` | yes | array |
| `visibility` | yes | **`player` only** (Headquarters stores no GM secrets) |
| `scope` | yes | `generic_rules` \| `setting_adapter` |
| `name` | yes | 1–160 characters |
| `category` | no | e.g. `Profession`, `Administrative`, `Personal` |
| `placements` | yes | non-empty, from `shared` `personal` |
| `stages` | yes | 1–20 `{key: ^[a-z][a-z0-9_-]*$ unique, label, width 1–100, height 1–100, staffing_slots 0–100, art: "" or path/https, benefits: [{name, description, recipient: guild|facility|individual|room_owner}]}` |

Existing facility ids are always kept (no update by import).

---

## 9. Ids and prefixes

Canonical id pattern (0.2): `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$`. Ids are permanent; Foundry UUIDs are world-local and never go in source files (except the optional `uuid` link fields above, which are world-local by nature).

| Prefix | Entity | Where |
|---|---|---|
| `AG-` | package id | `manifest.package_id` |
| `PROF-` | Profession | Manager package |
| `MAT-` | Material | Manager package |
| `REC-` | Recipe | Manager package |
| `ITEM-` | Item | Manager package |
| `PERK-` | ProfessionPerk | Manager package |
| `POWER-`, `MUT-`, `CINDER-` | Cinder powers / mutations | Manager package (Items); Skill Trees cinder trees |
| `HPERK-` | HirelingPerk | Manager package |
| `HIRE-` | Hireling | Manager package |
| `JRN-` | JournalEntry | Manager package |
| `NPC-` | NPC (`entity_type: "NPC"`, Actor projection; shown in the NPC Codex) | Manager package (Manager 0.33.0+) |
| `ACTOR-` | older reusable NPC id (`entity_type: "NPC"` required); still works and shows in the Codex. Use `NPC-` for new NPCs. | Manager package |
| `PC-` | test player character | Manager package |
| `TABLE-`, `MACRO-` | RollTable, Macro | Manager package |
| `LOC-` | Location | Manager package (Location record) |
| `RTE-` | Route | Manager package (Route record) |
| `RES-` | contract-level resource opportunity (`resource_opportunities[]` on a Location record) | Manager package |
| `QUEST-`, `ORDER-`, `CONTRACT-` | Objective | Quest Log file |
| `FACTION-` | Faction | Renown file |
| `DEITY-` | Deity (Pantheon) | Renown file, `ag-factions-source-export/0.4` (Renown 0.11.0+) |
| `RENOWN-` | RenownTrack (a faction's `renown_track`/`individual_track`, a deity's `individual_track`); convention `RENOWN-<NAME>`, `RENOWN-<NAME>-IND` for a faction's personal track, milestone ids `RENOWN-<NAME>-M1`…`M5` | Renown file |
| `FAC-` | Facility | Headquarters file. (The NPC Codex also accepts `FAC-` in `codex.links` and shows it as a Renown link; to link a faction use its `FACTION-` id.) |
| `HQ-`, `ASSIGN-`, `SYS-` | campaign state / systems | not importable by Manager |

Convention: `PREFIX-<SETTING OR SET>-<NAME>`, e.g. `MAT-EXAMPLE-SUNLEAF`. Stay consistent; the importer matches on the exact string.

Ids that are **not** canonical and follow their own rules: skill tree and node ids (§6), Renown entry/reward/milestone ids (any non-blank string, unique within the definition), quest objective keys (§5), facility stage keys (§8), Location list-entry `key`s (§4.2), Organize rule ids and scene mood ids (lowercase-dashed, §10).

---

## 10. Files that do not go through Manager → Import

### 10.1 Scene moods file (Manager 0.35.0)
Shape: `json/scene-moods.schema.json`, example `examples/reference/example.scene-moods.json` (name such files `*.scene-moods.json`; Manager exports `ashen-gate-moods.json`). Generic doc: `docs/scene-moods-schema.md`. Imported in **Manager → Scenes → Export & import**: a preview lists each preset as *New*, *Already the same*, *Same id, different values* (the GM picks Keep mine / Replace mine / Keep both; the copy gets id `<id>-2`) or *Skipped* (invalid, with the reason). Import never changes a scene. Moods and layers are presets only, never campaign state.

```json
{"format": "ashen-gate.scene-moods", "formatVersion": 1,
 "presets": [
   {"id": "example-dawn", "label": "[EXAMPLE] Dawn", "kind": "mood", "set": {"environment.darknessLevel": 0.3, "weather": ""}, "transitionMs": 10000},
   {"id": "example-drizzle", "label": "[EXAMPLE] Drizzle", "kind": "layer", "set": {"weather": "rain"}}
 ]}
```

| Key | Req | Rule |
|---|---|---|
| `format` | yes | exactly `ashen-gate.scene-moods` (a bare array is refused: `This is not an Ashen Gate moods file …`) |
| `formatVersion` | yes | `1` |
| `exportedFrom`, `exportedAt` | no | information only |
| `presets[].id` | yes | `^[a-z0-9][a-z0-9-]{0,39}$`, unique per kind |
| `presets[].label` | yes | non-empty text on the button |
| `presets[].kind` | no | `mood` (default; the base look, one per scene) or `layer` (stacks on top; a weather layer replaces the weather below it) |
| `presets[].set` | yes | at least one field below |
| `presets[].transitionMs` | no | whole milliseconds 0–60000 (darkness fade) |

`set` fields: `environment.darknessLevel` 0–1; `environment.globalLight.enabled` and `.bright` true/false; `environment.globalLight.luminosity` 0–1; `environment.globalLight.color` `"#rrggbb"` or `null`; `environment.cycle` true/false; `environment.base.*` and `environment.dark.*`: `hue` 0–1, `intensity` 0–1, `luminosity` −1–1, `saturation` −1–1, `shadows` 0–1 (`base` = day, `dark` = night); `weather` `""` or a core weather id (`leaves`, `rain`, `rainStorm`, `fog`, `snow`, `blizzard`; another id imports but is marked unavailable and will not apply); `fog.colors.unexplored` / `fog.colors.explored` `"#rrggbb"` or `null`. A preset with a bad id, missing label, unknown `kind`, unknown `set` path or out-of-range value is **skipped**; the rest still import. Shipped preset ids (`day twilight windy storm night`; layers `mist rain snow cold-night blood-moon hearth-glow pitch-black bright-moon`) are taken: use your own ids unless you mean to replace one. Never write the scene stack (`moodStack`) or favourites: they are play state.

### 10.2 Organize rules (Manager 0.25.0; `sourceTagged` 0.30.0/0.31.0)
Shape: `json/organize-rules.schema.json`, example `examples/reference/example.organize-rules.json` (name such files `*.organize-rules.json`). Generic doc: `docs/organize-rules.md`. **Manager → Organize → Import** accepts a JSON array, or an object with `rules: [...]` (Export writes `{kind: "ashen-gate-organize-rules", version: 1, rules}`), and replaces the rule list after a confirmation. An empty list is refused. First matching rule wins; Organize only moves documents between folders.

Rule: `{id: ^[a-z0-9][a-z0-9-]{0,59}$ unique, label?, types?: [Item|Actor|JournalEntry], when?: {...}, path: "A/B/{placeholder}"}` or `leave: true` instead of `path`. Path ≤ 4 levels. Match keys in `when` (a value or a list of values): `documentType ag sourceIdPrefix entityType status visibility test tier profession quality crafted itemType subtype rarity magic spellLevel spellSchool actorType playerOwned creatureType crBand core sourceTagged`. Strings compare without case except `sourceIdPrefix` (case-sensitive "starts with"); booleans compare strictly (write `true`, not `"true"`). `sourceTagged` is true for a **core** source: a Plutonium import, or `system.source` marked 2024 (PHB'24, DMG'24, MM'24, SRD 5.2, XPHB…) or 2014 core / SRD 5.1. Placeholders: `{tier} {rarity} {spellLevel} {creatureType} {crBand} {entityType} {actorType} {profession} {quality} {itemType}` (a rule whose placeholder is empty is skipped). Exact messages: `Rule N (id): path is deeper than Foundry's 4 folder levels.`, `… unknown match key "k".`, `… unknown placeholder {k}.`, `… id is used twice.`, `The schema needs at least one rule.` Saved custom rules are never changed by a Manager update; *Reset rules to defaults…* brings in new defaults.

### 10.3 Profession crosswalk baseline file (Profession Ledger 0.20.0)
Shape: `json/crosswalk-baseline.schema.json`, example `examples/reference/example.crosswalk.json` (name such files `*.crosswalk.json`). Generic doc: `docs/profession-crosswalk-schema.md`. Imported in **Profession Ledger → GM Setup → Tools and checks → Import baseline file…** (preview first, nothing saved until *Apply baseline*). Manager → Import does **not** recognise it.

It decides which professions **Assign** proposes for a character and which tools give advantage on a profession's checks. Layers, highest wins per list: GM edits in the table > **this file** > `access` on `PROF-*` records (§3.1) > built-in.

```json
{"professions": {
  "fishing":   {"qualifySkills": ["Survival"], "items": ["Fishing Tackle"]},
  "herbalism": {"qualifySkills": ["nat"], "qualifyTools": ["Herbalism Kit"], "advantageTools": ["herb"]}
}}
```

| Field | Type | Rules |
|---|---|---|
| `professions` | object, required | keys: profession key or name, any case, `[TAG]` ignored: `alchemy blacksmithing cooking enchanting engineering inscription jewelcrafting leatherworking tailoring archaeology fishing herbalism mining huntingskinning` (aliases: `Arcana` → enchanting; `Hunting/Skinning`, `Hunting & Skinning`, `Hunting`, `Skinning`, `Skinning/Harvesting` → huntingskinning). Unknown → ignored. The same profession twice (also via an alias) → refused. |
| `qualifySkills` | [string] | proficiency in any one qualifies; dnd5e skill ids (`nat`, `sur`) or names (`Nature`) |
| `qualifyTools` | [string] | proficiency in any one qualifies; dnd5e tool keys (`herb`, `smith`, `alchemist`) or names (`Herbalism Kit`, `Smith's Tools`) |
| `advantageTools` | [string] | proficient with, **or carrying**, one gives advantage on that profession's checks |
| `items` | [string] | carrying any one qualifies; Item name (any case) or Item/Compendium UUID; ≤ 200 characters each (longer or empty entries are dropped) |

A list left out is not set by the file (the layer below applies); `[]` means none. Unknown skill/tool names are listed and ignored, never guessed. Other fields are ignored (including the `name`, `checkTool`, `checkSkill`, `origin`, `schema`, `module`, `version`, `exportedAt` that *Export current table* adds, so an export can be edited and re-imported). Refused files: no `professions` object (`The file needs a "professions" object.`), a row that is not an object, a list that is not a list of strings (`<name>: qualifyTools must be a list of names.`), a profession twice (`<name>: <Profession> is listed twice.`). A new file replaces the previous baseline.

### 10.4 NPC Codex export and restore (Manager 0.33.0)
Shape: `json/npc-codex-export.schema.json`, example `examples/reference/example.npc-codex.json`. **Library → NPC Codex → Export codex** writes `AG_NPC_Codex_<date>.json`: `{schema_version: "ag-npc-codex-export/0.1", exported_at, visibility: "gm", definitions: [NPC records without foundry], reveals: {<NPC id>: {version: 1, discovery: {party, actors}, fields: {<key>: {party, actors}}, learned, links, notes}}}`. **Restore reveals from a codex export** replaces the reveals of the listed NPCs that exist in this world and skips the rest; it never changes NPC content (that comes from the package). Actor ids are world-local, so a restore into another world keeps party reveals but not per-character ones. It is a **GM file** holding GM-only fields and play state: GPT does not author it, and a real one never goes in the public repo. Manager → Import does not take it (in a ZIP it is skipped).

---

## 11. Exports (read, do not re-import)

- **World export** (`Manager → Library → Export Ashen Gate data → Export everything / Export changed`, `header.schema` `ag-world-export/0.1`): `{header: {schema, date, mode: everything|changed, world, versions}, summary, world: [...documents with kind, type, name, folder_path, access, visibility, flags, system...], modules: {deities, factions, headquarters, locations, profession_ledger, quests, routes, skill_trees}, removed?}`. Definitions only, no play state; NPC Codex state is left out (Manager 0.33.0); `modules.deities` since Manager 0.29.0. **Not importable**: use it to read what is in the world, then write a normal package. It is a GM file.
- **Locations export** (GM Setup → Export JSON) is a Manager 0.2 package of `Location` and `Route` records and can be re-imported.
- **Quest Log export** is an `ag-quest-source/0.1` file and can be re-imported.
- **Renown export** is an `ag-factions-source-export/0.4` file (factions and deities) and can be re-imported (existing ids are kept, so it only adds what is missing).
- **Ledger crosswalk export** (*Export current table*, `ag-profession-crosswalk-<date>.json`, `schema: "ag-ledger-crosswalk/1"`) can be edited and imported again as a baseline (§10.3).
- **NPC Codex export** (§10.4): restore only, GM file.

---

## 12. Common mistakes (all in `examples/invalid/`)

| # | Mistake | What happens |
|---|---|---|
| 01–02 | `"provenance": {"source": "…"}` or `"sources": "…"` | Rejected: `provenance.sources: array of source identifiers required.` |
| 03 | `"visibility": "reveal-gated"` in 0.2 | Rejected: use `reveal_gated`. |
| 04–05 | ref `mode: "hard_requirement"` or a ref as a bare string in 0.2 | Rejected: refs must be `{relation, target_id, mode: required|optional}`. |
| 06–07 | lowercase id, or no dash | Rejected: invalid permanent ID. |
| 08 | `status: "example_only"` in 0.2 | Rejected. |
| 09 | Item without `foundry.data.type` | Rejected. |
| 10 | `flags`/`effects` in Item data | Rejected: unsupported keys. |
| 11 | `folder_path` not starting `Ashen Gate/` | Rejected. (Deeper than 4 levels: fails at Apply.) |
| 12 | `document_type: "Scene"` (or Playlist…) | Rejected. |
| 13 | Journal page without `type: "text"` | Rejected. |
| 14–15 | `ACTOR-*` with `entity_type: "Actor"`; Actor type `vehicle` | Rejected. |
| 16 | `required` ref to an id not in the package or world | Rejected. Use `optional` for cross-file links. |
| 17–18 | malformed `[[AGREF:…]]` or one inside an HTML attribute | Rejected. |
| 19–21 | wrong/missing `schema_version`, missing `package_id`, missing `manifest` | Rejected. |
| 22–23 | Recipe `ingredients` as text, or fractional quantity | Imported, but the Ledger **cannot craft** it. |
| 24 | Exotic material without `source_profession_id` | Imported, but never found by gathering. |
| 25–26 | Exotic `mode: "random"`; designated without a numeric `chance` | Changed to `discovery`; designated never awards. |
| 27–31 | node tier 6, threat `extreme`, state `visible`, id `PLACE-*`, audience `party` | Silently reset (tier 1, `normal`, `hidden`) or skipped. |
| 32 | HirelingPerk context outside headquarters/field/passive | Rejected. |
| 33 | definition referencing a `campaign_state` record | Rejected. |
| 34 | Profession `access` tool/skill name that is not a dnd5e tool/skill | Imported; that entry is ignored. |
| 35 | `core_ref` without a `name` | Never matched. |
| 36–37 | Organize rule `path` 5 levels deep; unknown match key in `when` | Rejected by Organize Import. |
| 38–39 | Moods file written as a bare array; preset with an uppercase id, `kind: "overlay"`, darkness 1.5 and an unknown field | File refused; preset skipped. |
| 80–89 | Route id not `RTE-*`, same endpoint twice, `distance_km` as a string, 0 or missing, hazard 150, `discovery_state: "hidden"`, `directed: "yes"`, `hazard_table` as a number, endpoint not `LOC-*` | That route is skipped with the reason (Locations). |
| 40–47 | quest prefix ≠ kind, uppercase objective key, no objectives, missing outcomes, `campaign_state` scope, work order without domain, provenance string, file without `schema_version` | Rejected. |
| 50–52 | Facility `visibility: "gm"`, no `scope`, unknown benefit recipient | Rejected. |
| 57–59 | Deity `entity_type: "deity"` (lower case); deity entry `unlock: "group_renown"`; deity `tier: "Major"` (capital) | Rejected. |
| 60–64 | 4 milestones, unknown field, first threshold ≠ 0, old schema_version, starting_state for an unknown faction | Rejected. |
| 65–69 | Deity in a `0.3` file; deity reward `audience: "group"`; deity relation to itself; `resonance` as a string; deity `starting_state` with `group_renown` | Rejected. |
| 70–74 | POWER perk on a profession tree, missing prerequisite, profession tree without `PROF-*`, old schema, node off canvas | Rejected. |
| 90–93 | Crosswalk `professions` as a list; a list as plain text; the same profession twice through an alias (`Skinning` + `Hunting/Skinning`); a tool name dnd5e does not know | First three refused by the Ledger; an unknown tool is ignored (reported by the checker). |
| 94–98 | NPC `default_reveal` value `"everyone"`; `codex.links` to an `ITEM-*`; NPC with `entity_type: "Actor"`; `wants` as a list; a GM-only field (`portrayal`) in `default_reveal.fields` | `entity_type: "Actor"` rejected by Manager; the others are imported but the Codex silently reads them as hidden / drops them / shows `"a,b"` (reported by the checker). |
| 100–101 | Codex export with the wrong `schema_version`; `reveals` as a list | Restore refuses the file. |

---

## 13. What changed recently

| Field / feature | Module & version | Date |
|---|---|---|
| `provenance.sources` must be a **list** of strings (strict 0.2 contract; Quest Log, Factions, Headquarters the same) | Manager contract 0.2 (all current modules) | in force before 2026-10-19 |
| `audience` (everyone / selected players, sharing), `placeable`, `passConditions` (Region passes conditions only when on), tree folders | Locations 1.8.0 | 2026-10-19 |
| Exotic candidates on gathering nodes: `exotics[{materialId, mode: discovery|designated, chance, condition: success|rare}]` | Locations 1.9.0 + Profession Ledger 0.15.0 | 2026-10-19 |
| Tier DC defaults **10 / 12 / 15 / 18 / 20** (were 10/12/13/14/15; a node's own `dc` still wins) | Locations 1.9.0 + Ledger 0.15.0 | 2026-10-19 |
| Recipe `required_tools` (all listed tools required) | Ledger 0.15.0 | 2026-10-19 |
| Material `quality: Exotic` read for discovery; `tierId` and `source_profession_id` gate it | Ledger 0.15.0 | 2026-10-19 |
| Update existing Actors on re-import (opt-in) | Manager 0.19.0 | 2026-10-19 |
| Scene mood presets (Scenes tab) | Manager 0.22.0 | 2026-10-20 |
| ZIP bundles with several import files | Manager 0.23.0 | 2026-10-20 |
| Profession `access` (`toolProficienciesAnyOf`, `skillProficienciesAnyOf`, `advantageToolsAnyOf`) read by Assign and the tools table | Ledger 0.16.0 | 2026-10-20 |
| Organize rules JSON | Manager 0.25.0 | 2026-10-20 |
| `core_ref` on Items + Core Links tab | Manager 0.26.0 | 2026-10-20 |
| Route records (`RTE-*`, `route` block) | Locations 1.10.0 | 2026-10-20 |
| Manager imports Route records (after locations; routes-only ZIP file last; required refs to Locations-only ids accepted) | Manager 0.27.0 | 2026-10-20 |
| Journeys, hazards, party marker, travel log (play state, not imported) | Locations 1.11.0 | 2026-10-20 |
| Crafting awards the core-linked item | Ledger 0.17.0 | 2026-10-20 |
| Manager shows Factions as **Renown** (module id, schema names and API unchanged) | Manager 0.28.0 | 2026-10-20 |
| Route map drawing link (`drawingUuid`, play state, never exported) | Locations 1.12.0 | 2026-10-20 |
| Route defaults now **5 km legs** and **5 %** hazard (were 10 / 10; saved world values kept) | Locations 1.13.1 | 2026-10-20 |
| Journey pause/resume; travel API | Locations 1.14.0 | 2026-10-20 |
| Journey travel behaviours (pace, night watches, forage/navigate check skills); tracking only, play state | Locations 1.15.0 | 2026-10-20 |
| `getProfessions(actor)` read API | Ledger 0.18.0 | 2026-10-20 |
| Crosswalk baseline file; `access.itemsAnyOf` and crosswalk `items` (carrying an Item qualifies) | Ledger 0.20.0 | 2026-10-20 |
| Player gathering requests, GM approve/decline (no data change) | Ledger 0.21.0 | 2026-10-20 |
| Character embed (`api.embed`) for Character Hub | Renown 0.10.0, Ledger 0.19.0, Locations 1.13.0, Quest Log 0.8.0, Skill Trees 0.14.0, Headquarters 0.10.0, Utilities 0.12.0 | 2026-10-20 |
| **Deity** records (`DEITY-*`) in `ag-factions-source-export/0.4`; Pantheon, Resonance/Dissonance, per-character favour | Renown 0.11.0 | 2026-10-20 |
| Import preview shows Deity/Faction; world export `modules.deities` | Manager 0.29.0 | 2026-10-20 |
| Organize match key `sourceTagged` (0.30.0); now counts 2014 core and SRD 5.1 as core too; Core Links stays 2024-only | Manager 0.30.0 / 0.31.0 | 2026-10-20 |
| `api.rolls.open({skills, dc, mode, actorIds, title})` prefills Start Rolls (GM only) | Utilities 0.13.0 | 2026-10-20 |
| **NPC Codex**: NPC record fields `role appearance signature_line wants knows portrayal session_role stat_block gm_notes codex{links, default_reveal}`; per-field reveals; `ag-npc-codex-export/0.1` | Manager 0.33.0 | 2026-10-20 |
| Character Hub (embeds the modules above; no import format) | Character Hub 0.1.0–0.8.1 | 2026-10-20 |
| Hub **player visibility** per part (world setting `playerVisibility`, GM Setup; parts whose module is off are hidden) | Character Hub 0.9.0 | 2026-10-20 |
| Browse lists Renown deities and NPC Codex entries (`type:deity`, `type:npc-codex`); read-only | Manager 0.34.0 | 2026-10-20 |
| **Scene moods file** (`ashen-gate.scene-moods` v1) with mood and **layer** presets, `kind`, `transitionMs`, more fields (global light bright/luminosity/colour, `environment.cycle`, night saturation/shadows, fog colours); scene layers, fine-tune, favourites | Manager 0.35.0 | 2026-10-20 |

---

## 14. Checklist before handing a file to Robb

1. Right file kind for each record (§1); Quests, Trees, Factions, Facilities in their own files.
2. Every id matches §9 and is unique across all files.
3. `provenance.sources` is a list; `visibility` uses `reveal_gated`; refs are `{relation, target_id, mode}`.
4. Every `required` ref target is in the same package; cross-file links are `optional`.
5. `foundry.data` uses only the allowed keys; `folder_path` starts `Ashen Gate/` and has ≤ 4 levels.
6. Recipes: integer ingredient quantities; `result_item_id` points at an `ITEM-*` in the package.
7. Materials: `quality` Common/Rare/Exotic and `tierId`; Exotics name `source_profession_id`.
8. Routes: `RTE-*` ids, numeric `distance_km`, endpoints in the package or already in Locations, `name` and `terrain` free of hidden places; leave `leg_km`/`hazard_base_percent` out unless Robb gave values (defaults 5 km / 5 %).
8a. NPCs: `NPC-*` id, `entity_type: "NPC"`, Actor `type: "npc"`; revealable fields (`role appearance signature_line wants knows`) hold only what players may eventually read; secrets in `portrayal`/`session_role`/`gm_notes`; `default_reveal` values only `"hidden"`/`"party"`.
8b. Deities: 0.4 file; `entity_type: "Deity"`; `individual_track` with five milestones and `default_scope: "individual"`; rewards `individual`; entries `manual`/`individual_renown`; `tier` `major`/`lesser`; `resonance` a number 0–1, as Robb set it.
9. Locations: `sections` switched on for what players should see; `state` chosen deliberately (imports publish unidentified/revealed content immediately).
10. Synthetic test content uses `[TEST]` names; real campaign content never goes in the public foundry repo.
11. Status `approved` for live play; `draft` only for the Development profile.

---

## 15. Gaps: what cannot be imported yet

Do not invent formats for these; ask Robb. A Build chat will add support when he asks for it. (Refreshed 2026-10-20 against Manager 0.35.0, Locations 1.15.1, Ledger 0.21.0, Renown 0.11.1, Character Hub 0.9.0.)

| Object kind | Owning module | Import path today | Missing support |
|---|---|---|---|
| Deity favour, Renown standing, who discovered a faction/deity | Renown | `starting_state` on **new** factions/deities only | no way to set standing or discovery for an existing faction/deity by file |
| Changes to an existing faction or deity | Renown | import is additive (existing ids kept) | no update on re-import; edit in the Renown UI |
| NPC Codex reveals, "learned" text, GM notes | Manager (Codex) | set in play; restore from a Codex export (§10.4) | not importable from a package (only `codex.default_reveal` as a starting point) |
| NPC Codex text changes for an NPC already in the world | Manager | Update existing actors **and** a changed name/img/token/items | a text-only change (`role`, `wants`, `codex.links`…) is not applied to an existing NPC |
| Route journeys, travel behaviours, discovery after creation | Locations | Route records import definitions only (§4A) | play state, not importable |
| Travel rules driven by behaviours (pace changing distance, watches affecting hazards) | Locations | behaviours are tracking only | no rules engine; design decision for Robb |
| Companions | Character Hub (companion flags) | Actor (`npc`/`character`) via Manager, create-only | no companion record; companions are linked in play |
| Hireling roster / assignments | Headquarters | `Hireling` / `HirelingPerk` definitions as Items via Manager | personnel and assignments are campaign state, not importable |
| Scene mood stack and favourites on a scene | Manager | applied in play | play state; the moods file holds presets only and is not in ZIP bundles |
| Organize rules, crosswalk baseline, scene moods file | Manager / Ledger | their own Import buttons (§10.1–10.3) | not through the Import tab or a ZIP |
| Scenes, Playlists, Cards, Adventures | — | none | Manager imports only Item, JournalEntry, Actor, RollTable, Macro |
| Location pins on maps, route drawings | Locations | GM uses Place on Scene / draws the route | scene placement is world-local, not importable |
| Item Active Effects or other modules' Item flags | — | not allowed in Item `data` | cannot author item effects (Actors may carry `effects`) |
| Journal image/PDF/video pages; changed pages on re-import | Manager | text pages only; page changes blocked | no non-text pages, no page updates |
| Updated Facility definitions | Headquarters | import is additive (existing ids kept) | no update on re-import |
| Updated Roll Tables / Macros | Manager | create-only | no update on re-import |
| Starting quest state (Active, revealed objectives) | Quest Log | GM sets after import | cannot import status or reveals |
| Character profession levels, XP, known recipes; Skill Tree purchases | Ledger / Skill Trees | Ledger Assign tab adds Profession Items; XP by GM | no progression seeding |
| HQ layout, guild rank, stash, party purse | Headquarters / Utilities | none | campaign state |
| Re-importing a world export (`ag-world-export/0.1`) | Manager | export only | not an import format |
| `access.toolMustBePresent`, Profession `progression`, `starting_recipe_ids`, Recipe `starting` | Ledger | stored with the definition | not enforced or used yet |
| `folder_path` deeper than 4 levels | Manager | passes validation (limit 8) | fails at Apply when Foundry refuses the 5th level: keep ≤ 4 |

---

## 16. Module APIs a macro may call (for reference; GPT content does not depend on them)

All via `game.modules.get('<id>')?.api`; feature-detect, a module may be missing. GM-only calls throw for players.

| Module (id) | Read / action | Embed contract (Character Hub) |
|---|---|---|
| Manager (`ashen-gate-manager`) | `codex.list() get(id) characters() setReveal(id, key, {mode, actorId, on}) setDetails(id, {learned, notes, links}) previewAs(actorIds) exportAll()` (GM); `codex.forPlayer() playerAccessEnabled() openPlayerView() mount(element)` (anyone); `scenes.listMoods() applyMood(id) addLayer(id) removeEffect(id, {kind}) restore() savePreset(preset) exportPresets() previewImport(data) importPresets(data, {choices})`, `organize.saveSchema(rules)` (GM) | `codex.mount(element)` |
| Renown (`ashen-gate-factions`) | `getFactions()`, `getDeities()`, `getPantheon(actorOrId)`, `open({deityId, actorId, tab: 'pantheon'|'player'|'group'})` | `ag-factions-embed/1`, mode `character` |
| Locations (`ashen-gate-locations`) | `importRoutes(records, {mode: 'skip'|'update'})` (GM), `travel.state()`, `travel.getBehaviours()`, `travel.setBehaviours(patch)` (GM), `travel.openCheck('forage'|'navigate')` | `ag-locations-embed/1`, mode `character` |
| Profession Ledger (`ashen-gate-profession-ledger`) | `getProfessions(actor)` (GM or owner); `crosswalk.previewBaseline(data) applyBaseline(data, {fileName}) exportTable() baseline()` (GM); `gathering.requests() approve(id) decline(id, {reason})` (GM) | `ag-ledger-embed/1`, mode `individual` |
| Skill Trees (`ashen-gate-skill-trees`) | `pointsSummary(actor)` (GM or owner) | `ag-trees-embed/1`, mode `character` |
| Quest Log (`ashen-gate-quest-manager`) | — | `ag-quest-embed/1`, mode `character` |
| Headquarters (`ashen-gate-headquarters`) | `playerView(actor)` (GM or owner) | `ag-headquarters-embed/1`, mode `character` |
| Utilities (`ashen-gate-utilities`) | `rolls.open({skills, dc?, mode: 'group'|'individual', actorIds?, title?})` (GM; prefills Start Rolls, rolls nothing; `dc` default 15, 0–100 or null) | `ag-utilities-embed/1`, mode `stash` |
| Character Hub (`ashen-gate-character-hub`) | `open(actor)`, `companions(actor)`, `playerVisibility.get() isShown(part) canSee(part) hiddenReason(part)`, GM-only `playerVisibility.set() applyPreset()` (0.9.0) | embeds the others; no import format. A part whose module is inactive or has Player Access off is hidden from players. |

Each embed is `api.embed = {contract, modes, mount(element, {actorId, mode}) → {unmount, refresh}}`.
