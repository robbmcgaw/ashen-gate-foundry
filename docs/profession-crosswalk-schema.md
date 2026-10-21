# Profession crosswalk baseline file (Profession Ledger 0.22.0)

The crosswalk decides which professions **Assign** proposes for a character, and which tools give advantage on a gathering profession's checks. In **GM Setup → Tools and checks** it is one row per profession (crafting, then gathering) with **Skill to Access** (`qualifySkills`), **Tool to Access** (`qualifyTools`) and, for gathering professions, **Tool for Advantage** (`advantageTools`). Proficiency in any one listed skill or tool qualifies a character. The GM can load a baseline for it from a file: Profession Ledger → **GM Setup → Tools and checks → Import baseline file…**. A preview lists every row the file changes. Nothing is saved until **Apply baseline**. **Export current table** downloads the table in effect in the same shape, so it can be edited and imported again.

## Layers

For each profession and each list, the highest layer that sets the list wins:

1. **Built in.** Qualifying skill/tool = the profession's check skill/tool. Fishing's built-in check skill, and so its qualifying skill, is `Survival` (0.22.0). No qualifying items (Fishing Tackle was removed in 0.22.0). No advantage tools.
2. **Profession catalog.** The `access` block of imported `PROF-*` definitions: `skillProficienciesAnyOf`, `toolProficienciesAnyOf`, `advantageToolsAnyOf`, `itemsAnyOf` (legacy). The catalog's advantage tools are not used for checks.
3. **Baseline file** (this document).
4. **GM edits** in the Tools and checks table. These always win. Picking a value in a cell saves a one-value list (or `[]` for None). A list of several values shows as *Several (n)* and is kept as it is until the GM picks something else in that cell. **Reset** on a row puts it back to the default: the GM's lists are cleared (falling back to the layers below) and its check tool/skill return to the built-in default.

A list the file leaves out of a profession is not set by the file. An empty list (`[]`) means "none".

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
| `professions` | object | Required. Keys are profession keys or names, in any case: `alchemy`, `blacksmithing`, `cooking`, `engineering`, `inscription`, `jewelcrafting`, `leatherworking`, `tailoring`, `herbalism`, `mining`, `huntingskinning` (also `Hunting & Skinning`, `Skinning`), `enchanting` (also `Arcana`), `archaeology`, `fishing`. An unknown profession is listed in the preview and ignored. A profession listed twice is an error. |
| `qualifySkills` | string[] | Optional. Proficiency in any one of these qualifies the character. Use dnd5e skill ids (`nat`, `sur`, `his`, …) or names (`Nature`, `Survival`). |
| `qualifyTools` | string[] | Optional. Proficiency in any one of these qualifies the character. Use dnd5e tool keys (`herb`, `smith`, `alchemist`, …) or names (`Herbalism Kit`, `Smith's Tools`). |
| `advantageTools` | string[] | Optional. A character who is proficient with, or carries, one of these starts that profession's checks with advantage. Values are the same as for `qualifyTools`. Applies to gathering professions only (0.22.0); ignored for crafting. A list given for a crafting profession is kept and exported, but never used. |
| `items` | string[] | Optional, **legacy** (0.20.0; no UI since 0.22.0). Still honoured when present in a file, the catalog or saved GM edits: carrying any one of these Items qualifies the character. Give a name (matched in any case) or an Item/Compendium UUID (matched against the Item, its compendium source and General Manager's core link). A stack of 0 doesn't count. Up to 200 characters each. |

A skill or tool name that matches nothing in dnd5e is listed in the preview and ignored; it is never guessed. Any other field is ignored, including the extra `name`, `checkTool`, `checkSkill` and `origin` fields that Export adds. A file that isn't valid (no `professions` object, or a list that isn't a list of strings) is refused, and nothing changes.

## Export

**Export current table** writes the same shape with some extra fields: `schema: "ag-ledger-crosswalk/1"`, `module`, `version`, `exportedAt`. `items` is written only for a profession that has one. For every profession it also writes `name` (display name, e.g. `Hunting` for `huntingskinning`), `checkTool`, `checkSkill` and `origin` (which layer each list came from: `default`, `catalog`, `baseline` or `gm`). Skills and tools are exported as dnd5e ids and keys.

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
