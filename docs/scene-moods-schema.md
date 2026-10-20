# Scene moods file and scene stack

General Manager 0.35.0 and later. Scenes tab → **Export & import** (rail) saves and loads a moods file. It holds mood and layer **presets only**: never scene data, favourites or anything campaign-specific. Import always shows a preview and never changes a scene.

## Where things live

| What | Where | Written by |
|---|---|---|
| Mood presets | World setting `ashen-gate-manager.sceneMoods` (empty = shipped defaults) | GM, Scenes tab or import |
| Layer presets | World setting `ashen-gate-manager.sceneLayers` (empty = shipped defaults) | GM, Scenes tab or import |
| What is applied to a scene | Scene flag `flags.ashen-gate-manager.moodStack` | GM, Scenes tab / `api.scenes` |
| Favourite moods on a scene | Scene flag `flags.ashen-gate-manager.moodFavourites` (array of mood ids) | GM |

## Moods file

```json
{
  "format": "ashen-gate.scene-moods",
  "formatVersion": 1,
  "exportedFrom": "ashen-gate-manager 0.35.0",
  "exportedAt": "2026-10-20T21:00:00.000Z",
  "presets": [
    {
      "id": "night-rain",
      "label": "Night rain",
      "kind": "mood",
      "set": {
        "environment.darknessLevel": 0.85,
        "environment.dark.hue": 0.6,
        "environment.dark.intensity": 0.3,
        "weather": "rain"
      },
      "transitionMs": 3000
    },
    {"id": "mist", "label": "Mist", "kind": "layer", "set": {"weather": "fog"}}
  ]
}
```

| Key | Required | Rule |
|---|---|---|
| `format` | yes | Exactly `ashen-gate.scene-moods` |
| `formatVersion` | yes | `1` |
| `exportedFrom`, `exportedAt` | no | Information only |
| `presets[].id` | yes | 1–40 characters: lowercase letters, digits, dashes; starts with a letter or digit. Unique per kind |
| `presets[].label` | yes | Non-empty text shown on the button |
| `presets[].kind` | no | `mood` (default): the base look, one per scene. `layer`: stacks on top |
| `presets[].set` | yes | At least one field from the table below → value |
| `presets[].transitionMs` | no | Whole milliseconds 0–60000. Fades darkness when the Live transition is "Preset default" |

Unknown fields, out-of-range numbers and bad ids make that preset **skipped** on import; the rest still import. A preset whose weather id is not in the target world imports but is marked unavailable and refuses to apply until edited.

### Fields a preset may set

All are core V14 Scene fields (checked against fvtt-types 14.366 and feature-detected on the live schema before writing).

| Path | Value |
|---|---|
| `environment.darknessLevel` | number 0–1 |
| `environment.globalLight.enabled` | true / false |
| `environment.globalLight.bright` | true / false |
| `environment.globalLight.luminosity` | number 0–1 |
| `environment.globalLight.color` | `"#rrggbb"` or `null` (none) |
| `environment.cycle` | true / false (blend day and night colours with darkness) |
| `environment.base.hue`, `environment.dark.hue` | number 0–1 |
| `environment.base.intensity`, `environment.dark.intensity` | number 0–1 |
| `environment.base.luminosity`, `environment.dark.luminosity` | number -1–1 |
| `environment.base.saturation`, `environment.dark.saturation` | number -1–1 |
| `environment.base.shadows`, `environment.dark.shadows` | number 0–1 |
| `weather` | a key of `CONFIG.weatherEffects` (core: `leaves`, `rain`, `rainStorm`, `fog`, `snow`, `blizzard`) or `""` for none |
| `fog.colors.unexplored`, `fog.colors.explored` | `"#rrggbb"` or `null` |

`base` is the look at no darkness (day), `dark` the look at full darkness (night).

### Import choices

For each preset the preview shows **New** (added), **Already the same** (nothing to do), **Same id, different values** (choose *Keep mine*, *Replace mine* or *Keep both*: the copy gets id `<id>-2` and label "… (imported)"), or **Skipped** (invalid, with the reason).

## Scene stack (`moodStack`)

```json
{"version": 1, "entries": [
  {"id": "night", "kind": "mood", "label": "Night", "appliedAt": 1792535079000,
   "fields": [{"path": "environment.darknessLevel", "before": 0.2, "after": 0.9}, {"path": "weather", "before": "", "after": ""}]},
  {"id": "mist", "kind": "layer", "label": "Mist", "appliedAt": 1792535090000,
   "fields": [{"path": "weather", "before": "", "after": "fog"}]}
]}
```

- At most one `mood` entry, always first; layers follow in the order added.
- Each entry lists only the fields it set. A field shows the value of the top-most entry that set it.
- **Removing an entry:** for each of its fields, if a higher entry also set it, that entry's `before` becomes this entry's `before` (no visible change). Otherwise the scene gets `before` back, **only if** it still shows this entry's `after`; if not, the GM changed it and it is kept (the message says so).
- **Back to normal** removes entries top-down with the same rule, then clears the flag.
- Fine-tune *Apply to scene* writes straight to the scene and is not an entry, so it counts as the GM's own change.

### Migration from 0.22.0–0.34.x

Older scenes may carry `flags.ashen-gate-manager.moodBase` (`{capturedAt, fields:[{path, value}]}`) and `flags.ashen-gate-manager.mood` (`{id, label, appliedAt}`). These are read as one `mood` entry whose `before` values are the saved originals and whose `after` values are what the scene shows. Back to normal therefore still restores the original look exactly. The old flags are cleared on the next change; reading never writes, and running it again is safe.

## API (`game.modules.get('ashen-gate-manager').api.scenes`)

All functions are GM-only and return `{ok, message, …}`; players get `{ok:false}` and nothing is written. Optional `{sceneId}` targets a scene other than the viewed/active one; `{animate}` is a darkness fade in ms.

`listMoods()`, `getState(sceneId)`, `applyMood(id, opts)`, `addLayer(id, opts)`, `removeEffect(id, {kind, ...opts})`, `restore(opts)`, `applyDraft({path: value}, opts)`, `toggleFavourite(moodId, opts)`, `savePreset(preset)`, `removePreset(id, {kind})`, `resetDefaults()`, `exportPresets({moods, layers})`, `previewImport(data)`, `importPresets(data, {choices: {"kind:id": "keep"|"replace"|"both"}})`.
