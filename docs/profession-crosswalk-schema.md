# Profession crosswalk baseline file (Profession Ledger 0.20.0)

The crosswalk decides which professions **Assign** proposes for a character, and which tools give advantage on a profession's gathering and crafting checks. The GM can load a baseline for it from a file: Profession Ledger → **GM Setup → Tools and checks → Import baseline file…**. A preview lists every row the file changes. Nothing is saved until **Apply baseline**. **Export current table** downloads the table in effect in the same shape, so it can be edited and imported again.

## Layers

For each profession and each list, the highest layer that sets the list wins:

1. **Built in.** Qualifying skill/tool = the profession's check skill/tool. Fishing's qualifying item is `Fishing Tackle`. No advantage tools.
2. **Profession catalog.** The `access` block of imported `PROF-*` definitions: `skillProficienciesAnyOf`, `toolProficienciesAnyOf`, `advantageToolsAnyOf`, `itemsAnyOf`. The catalog's advantage tools are only shown as suggestions.
3. **Baseline file** (this document).
4. **GM edits** in the Tools and checks table. These always win, and **Reset** on a row falls back to the layers below.

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
| `advantageTools` | string[] | Optional. A character who is proficient with, or carries, one of these starts that profession's checks with advantage. Values are the same as for `qualifyTools`. |
| `items` | string[] | Optional. Carrying any one of these Items qualifies the character. Give a name (matched in any case) or an Item/Compendium UUID (matched against the Item, its compendium source and General Manager's core link). A stack of 0 doesn't count. Up to 200 characters each. |

A skill or tool name that matches nothing in dnd5e is listed in the preview and ignored; it is never guessed. Any other field is ignored, including the extra `name`, `checkTool`, `checkSkill` and `origin` fields that Export adds. A file that isn't valid (no `professions` object, or a list that isn't a list of strings) is refused, and nothing changes.

## Export

**Export current table** writes the same shape with some extra fields: `schema: "ag-ledger-crosswalk/1"`, `module`, `version`, `exportedAt`. For every profession it also writes `name`, `checkTool`, `checkSkill` and `origin` (which layer each list came from: `default`, `catalog`, `baseline` or `gm`). Skills and tools are exported as dnd5e ids and keys.

## Synthetic example

```json
{
  "professions": {
    "fishing": {"qualifySkills": ["Survival"], "items": ["Fishing Tackle", "[TEST] Net"]},
    "herbalism": {"qualifySkills": ["nat"], "qualifyTools": ["Herbalism Kit"], "advantageTools": ["herb"]},
    "Alchemy": {"qualifyTools": ["alchemist", "Herbalism Kit"]}
  }
}
```

With this file, a character carrying Fishing Tackle is proposed for Fishing with the reason *Fishing Tackle (carried) → Fishing*. Herbalism checks start with advantage for a character who has, or is proficient with, a Herbalism Kit. Alchemy qualifies on either tool. Every list the file doesn't name keeps the layer below it.

## Saved data

The applied file is stored in the world setting `ashen-gate-profession-ledger.crosswalkBaseline` as `{schema: "ag-ledger-crosswalk-baseline/1", fileName, importedAt, professions}`. Importing a new file replaces it. GM edits stay in `checkMapping` and are never changed by an import.
