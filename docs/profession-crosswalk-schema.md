# Profession crosswalk baseline file (Profession Ledger 0.22.1)

The crosswalk decides which professions **Assign** proposes for a character, and which tools give advantage on a gathering profession's checks. In **GM Setup → Tools and checks** it is one row per profession (crafting, then gathering) with **Skill to Access** (`qualifySkills`), **Tool to Access** (`qualifyTools`) and, for gathering professions, **Tool for Advantage** (`advantageTools`). Proficiency in any one listed skill or tool qualifies a character (as does carrying an Item from a legacy `items` list). The GM can load a baseline for it from a file: Profession Ledger → **GM Setup → Tools and checks → Import baseline file…**. A preview lists every row the file changes. Nothing is saved until **Apply baseline**. **Export current table** downloads the table in the same shape, so it can be edited and imported again. Only the lists the GM or a baseline file set are written as lists (0.22.1); re-importing an export never turns built-in or catalog values into baseline ones.

## Layers

For each profession and each list, the highest layer that sets the list wins. The baseline file and GM edits set lists one by one; the catalog sets its lists together (see 2):

1. **Built in.** Qualifying skill/tool = the profession's current check skill/tool (see *Check tool and check skill*; a saved check tool/skill counts). Fishing's built-in check skill, and so its qualifying skill, is `Survival` (0.22.0); Fishing also falls back to `Survival` as its qualifying skill when its check skill is none. No qualifying items (Fishing Tackle was removed in 0.22.0). No advantage tools.
2. **Profession catalog.** The `access` block of imported, active `PROF-*` Profession Items in the world (read on the GM's client only): `skillProficienciesAnyOf`, `toolProficienciesAnyOf`, `advantageToolsAnyOf`, `itemsAnyOf` (legacy). This layer is **not per list**: a definition whose `access` has at least one of these four as a list sets `qualifySkills`, `qualifyTools` and `advantageTools` all together, a field it leaves out counting as `[]` (so a catalog row with only `skillProficienciesAnyOf` also sets Tool to Access to none). Only `items` is per list: it is set only when `itemsAnyOf` is present. An `access` block with none of the four (including `{}`) leaves the built-in layer. A definition is matched to a profession by its `PROF-*` id first, then by its name (0.22.1; see *Profession names*). Assign uses the same match to find the Profession Item to add. If two definitions for one profession disagree, neither is used, and the Tools and checks table says so. Skill and tool names follow the same matching as a baseline file, and a tool must be one dnd5e has (0.22.1; before, any single lower-case word was taken as a tool key). One that matches nothing is listed under the table and in the Assign preview, and ignored. The catalog layer is used by Assign, the Tools and checks table and Export. Its advantage tools are never used for checks and are not shown in Tool for Advantage.
3. **Baseline file** (this document).
4. **GM edits** in the Tools and checks table, saved with **Save Changes**. These always win. Picking a value in a cell sets a one-value list (or `[]` for None); picking the value the cell already shows changes nothing. A list of several values shows as *Several (n)* and is kept as it is until the GM picks something else in that cell. **Reset** on a row puts it back to the default: the GM's lists are cleared (falling back to the layers below) and its check tool/skill return to the built-in default. A legacy `items` list in the GM's edits is left as it is.

A list the file leaves out of a profession is not set by the file. An empty list (`[]`) means "none". A list is still set when none of its names match (they are dropped), so `"qualifyTools": ["Unknown"]` sets that list to none.

## Profession names

Baseline file keys are matched to a profession by name. A catalog definition is matched by its `PROF-*` id first (0.22.1): the id without `PROF-`, or any trailing part of it, read as a name (`PROF-TG-HERBALISM` → `herbalism`, `PROF-TG-ARCANA` → `enchanting`); when the id names no profession, its name is used. The name has any bracketed tag removed (`[TEST] Herbalism` → `Herbalism`), then case, spaces and punctuation are ignored (`Hunting/Skinning`, `Hunting & Skinning` and `huntingskinning` are the same). These aliases are then applied: `Arcana` → `enchanting`; `Hunting`, `Skinning` and `Skinning & Harvesting` → `huntingskinning`.

## Shape

```json
{
  "professions": {
    "<profession>": {
      "qualifySkills": ["<skill>"],
      "qualifyTools": ["<tool>"],
      "advantageTools": ["<tool>"],
      "items": ["<item name or UUID>"]
    }
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `professions` | object | Required. Keys are profession keys or names, matched as in *Profession names*: `alchemy`, `blacksmithing`, `cooking`, `engineering`, `inscription`, `jewelcrafting`, `leatherworking`, `tailoring`, `herbalism`, `mining`, `huntingskinning` (also `Hunting`, `Hunting & Skinning`, `Skinning`, `Skinning & Harvesting`), `enchanting` (also `Arcana`), `archaeology`, `fishing`. An unknown profession is listed in the preview and ignored. A profession listed twice (after matching, e.g. `Arcana` and `enchanting`), or a profession whose value isn't an object, is an error. |
| `qualifySkills` | string[] | Optional. Proficiency in any one of these qualifies the character. Use dnd5e skill ids (`nat`, `sur`, `his`, …; exact, lower case) or names (`Nature`, `Survival`; case, spaces and punctuation ignored). |
| `qualifyTools` | string[] | Optional. Proficiency in any one of these qualifies the character. Use dnd5e tool keys (`herb`, `smith`, `alchemist`, …) or names (`Herbalism Kit`, `Smith's Tools`; case, spaces and apostrophe style ignored). A single lower-case word is read as a key, not a name, so `herbalism` matches nothing. |
| `advantageTools` | string[] | Optional. A character who is proficient with, or carries, one of these starts that profession's checks with advantage. Values are the same as for `qualifyTools`. Applies to gathering professions only (0.22.0); ignored for crafting. A list given for a crafting profession is kept and exported, but never used. |
| `items` | string[] | Optional, **legacy** (0.20.0; no UI since 0.22.0). Still honoured when present in a file, the catalog or saved GM edits: carrying any one of these Items qualifies the character. Give a name (matched ignoring case, spaces and punctuation) or an Item/Compendium UUID (starting `Item.` or `Compendium.`; matched against the Item, its compendium source and General Manager's core link). A stack of 0 doesn't count. Up to 200 characters each. |

A skill or tool name that matches nothing in dnd5e is listed in the preview and ignored; it is never guessed. Duplicates in a list are dropped. Any other field is ignored, including the extra `name`, `checkTool`, `checkSkill`, `origin` and `inEffect` fields that Export adds. A file that isn't valid (no `professions` object, a list that isn't a list of strings, or any error above) is refused as a whole, and nothing changes.

## Export

**Export current table** writes the same shape with some extra fields: `schema: "ag-ledger-crosswalk/1"`, `module`, `version`, `exportedAt`. Since 0.22.1 a list (`qualifySkills`, `qualifyTools`, `advantageTools`, `items`) is written only where its origin is `baseline` or `gm`, so importing the export changes nothing that was built in or came from the catalog; in particular, catalog advantage tools never start counting for checks. For every profession it also writes `name` (display name, e.g. `Hunting` for `huntingskinning`), `checkTool`, `checkSkill`, `origin` (which layer each list came from: `default`, `catalog`, `baseline` or `gm`) and `inEffect` (every list in effect, whatever its layer; `items` only for a profession that has one). Import ignores `inEffect`: to make a value an override, copy it into the profession's own list. Skills and tools are exported as dnd5e ids and keys.

## Synthetic example

```json
{
  "professions": {
    "fishing": {"qualifySkills": ["Survival"]},
    "herbalism": {"qualifySkills": ["nat"], "qualifyTools": ["Herbalism Kit"], "advantageTools": ["herb"]},
    "Alchemy": {"qualifyTools": ["alchemist", "Herbalism Kit"]}
  }
}
```

With this file, Fishing qualifies on Survival. Herbalism checks start with advantage for a character who has, or is proficient with, a Herbalism Kit. Alchemy qualifies on either tool and shows *Several (2)* in Tool to Access. Every list the file doesn't name keeps the layer below it.

## Check tool and check skill

The roll a profession uses is stored separately from the qualifying lists, in `checkMapping.tools` (every profession: the craft tool when a recipe names none, and the gather tool check) and `checkMapping.skills` (gathering professions and Enchanting). The qualifying lists default to these. Since 0.22.0 the table has no separate columns for them: picking a **Tool to Access** also sets the check tool, and, for gathering professions and Enchanting, picking a **Skill to Access** also sets the check skill. A baseline file never changes them. Built-in check skills: Herbalism Nature, Hunting Survival, Archaeology History, Fishing Survival (0.22.0), Mining none, Enchanting Arcana. When they differ from the cell (for example after a baseline file), the cell's hover text says which check is used.

## Saved data

The applied file is stored in the world setting `ashen-gate-profession-ledger.crosswalkBaseline` as `{schema: "ag-ledger-crosswalk-baseline/1", fileName, importedAt, professions}`. Importing a new file replaces it. GM edits stay in `checkMapping` (`tools`, `skills`, `qualifySkills`, `qualifyTools`, `advantageTools`, legacy `items`) and are never changed by an import. 0.22.0 changes no saved shape. It migrates once (world setting `checkMappingVersion` 0 → 1, run by the active GM): a saved `skills.fishing` of `""`, the old default every earlier Save wrote, becomes `"sur"`. Nothing else is changed, and running it again does nothing.
