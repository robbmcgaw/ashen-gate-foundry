# dnd5e Active Effect keys: 5.x (legacy) to 6.0

Target: dnd5e **6.0.6** on Foundry V14. dnd5e 6.0 moved the roll-bonus fields and keeps the old keys working through a compatibility redirect, so old content is not broken, but **new and rewritten content should use the 6.0 key**. The Character Hub (0.62.2+) labels both forms identically and sums bonuses written in either form. This file is the table for rewriting records mechanically (in the private content pack and in the GPT docs).

Only the key changes. The change `type`/`mode` (add, override, ...) and `value` stay as they are, except where the last column says otherwise. Bonus values are formulas in both forms.

## Mapping (old -> new)

`<abl>` is an ability key (`str dex con int wis cha`), `<skill>` a skill key (`acr ani arc ath dec his ins itm inv med nat prc prf per rel slt ste sur`), `<tool>` a tool key, `<w>` one of `mwak rwak msak rsak`.

| Old key (5.x, redirected) | New key (6.0) | Hub reads as | Notes |
| --- | --- | --- | --- |
| `system.abilities.<abl>.bonuses.save` | `system.abilities.<abl>.save.roll.bonus` | `<Ability> saves` | |
| `system.abilities.<abl>.bonuses.check` | `system.abilities.<abl>.check.roll.bonus` | `<Ability> checks` | |
| `system.skills.<skill>.bonuses.check` | `system.skills.<skill>.roll.bonus` | `<Skill>` | |
| `system.tools.<tool>.bonuses.check` | `system.tools.<tool>.roll.bonus` | `<Tool> (tool)` | |
| `system.bonuses.abilities.save` | `system.rolls.ability.save.bonus` | `Saving throws` | all saves |
| `system.bonuses.abilities.check` | `system.rolls.ability.check.bonus` | `Ability checks` | all ability checks |
| `system.bonuses.abilities.skill` | `system.rolls.ability.skill.bonus` | `Skill checks` | all skill checks |
| `system.bonuses.<w>.attack` | `system.rolls.attack.<w>.bonus` | `Melee weapon attack` etc. | |
| `system.bonuses.<w>.damage` | `system.rolls.damage.<w>.bonus` | `Melee weapon damage` etc. | |
| `system.attributes.init.bonus` | `system.attributes.init.roll.bonus` | `Initiative` | |
| `system.attributes.concentration.bonuses.save` | `system.attributes.concentration.roll.bonus` | `Concentration saves` | |
| `system.attributes.death.bonuses.save` | `system.attributes.death.roll.bonus` | `Death saves` | |
| `system.attributes.movement.<m>` (`walk fly swim climb burrow jump`) | `system.attributes.movement.speeds.<m>` | `<Type> speed` | |
| `system.attributes.movement.speed` | `system.attributes.movement.speeds.walk` | `Walk speed` | alias for walk |
| `system.attributes.senses.<s>` (`darkvision blindsight tremorsense truesight`) | `system.attributes.senses.ranges.<s>` | `<Sense>` | |

Other shimmed keys that are **not** a plain key rename (not labelled by the Hub; rewrite by hand and check the value):

| Old | New | Why not mechanical |
| --- | --- | --- |
| `flags.dnd5e.initiativeAdv` | `system.attributes.init.roll.mode` | the shim also forces `type: add`, `value: 1` |
| `system.activities.<id>.attack.ability` | `system.activities.<id>.attack.abilities` | now a set of abilities, not one |
| `system.rarity` | `system.rarities` | Item field, not an Actor bonus |

**Keys that did NOT move** (leave them): `system.skills.<skill>.bonuses.passive` (skill passive bonus; still current), `system.attributes.ac.bonus`, `system.attributes.hp.bonuses.level`, `system.attributes.hp.bonuses.overall`, `system.attributes.movement.bonus`, `system.rolls.attack.mode` (already the 6.0 form), `system.abilities.<abl>.value`.

## Evidence (dnd5e 6.0.6, `dnd5e.mjs` as shipped; source files from its source map)

Line numbers are in the shipped bundle `systems/dnd5e/dnd5e.mjs`; the original files are named alongside.

- `module/documents/active-effect.mjs`, class `ActiveEffect5e`:
  - `BONUS_SHIM_REGEX = /system\.(abilities|skills|tools)\.(\w+)\.bonuses\.(check|save)/` (line 7357): the redirect for ability, skill and tool bonuses. Builds the new key as ``system.${category}.${key}.${category === "abilities" ? `${type}.` : ""}roll.bonus`` in `_applyChangeShim` (lines 7857-7873): abilities become `<abl>.<check|save>.roll.bonus`; skills and tools become `<id>.roll.bonus`.
  - `static SHIM_FIELDS` (line 7414 onward): concentration `.bonuses.save`, death `.bonuses.save`, `init.bonus`, `movement.<type>` and `movement.speed`, `senses.<sense>`, `bonuses.<w>.attack|damage`, `bonuses.abilities.check|save|skill`, `flags.dnd5e.initiativeAdv`, `rarity`. `ATTACK_ABILITY_SHIM_REGEX` (line 7358) covers `activities.<id>.attack.ability`.
  - A change whose key matches is rewritten at apply time; `logCompatibilityWarning` is only issued for entries that define a `warning`.
- `module/data/actor/templates/common.mjs`, class `CommonTemplate`: the migration tables `#BONUS_FIELD_PATHS` (line 11080), `#ABILITY_BONUS_FIELD_PATHS` = `bonuses.check -> check.roll.bonus`, `bonuses.save -> save.roll.bonus` (line 11103), `#SKILL_TOOL_BONUS_FIELD_PATHS` = `bonuses.check -> roll.bonus` (line 11114); `#migrateBonusData` runs them on stored data (lines 11195-11209) and `shimBonusData` keeps reads of the old data paths working with a "has moved" warning, since 6.0, until 7.0 (lines 11239-11263).
- New schema: `CommonTemplate` abilities `check` / `save` as `RollConfigField` (lines 11052, 11059); `RollConfigField` -> `roll: D20RollModificationField`, which has `bonus` (lines 9339-9360, 9430-9446); `CreatureTemplate` `rolls.ability.{check,save,skill,tool}`, `rolls.attack.<w>`, `rolls.damage.<w>` (lines 83751-83790), `skills` and `tools` as `RollConfigField` (lines 83791, 83806); `AttributesFields` `init` (9679) and `concentration` (9710) as `RollConfigField`; `death` (character 84160, npc 85289) as `RollConfigField`; senses `ranges` (line 9461, `SensesField`).
- Unchanged: skills keep `bonuses.passive` (a `FormulaField`, line ~83798; used at line 84038).

## Notes

- Foundry V14 stores a change's kind as `type` (a string such as `add`, `override`); the numeric `mode` is a deprecated alias. Imports from Manager that say `"mode": "add"` are accepted. The Hub still reads `mode` (it works through Foundry's alias).
- The dnd5e redirect also matches `system.skills.<skill>.bonuses.save`, which has no meaning; ignore it.
- Writing: the Hub writes no companion effects. Its Sap mark uses `system.rolls.attack.mode` (already 6.0 only). If code ever needs to write a bonus key, use `keyForWorld(key, game.system.version)` from `scripts/effect-keys.mjs`: the 6.0 form on dnd5e 6.0 or later, the old form below that.
- Helper API (`modules/ashen-gate-character-hub/scripts/effect-keys.mjs`): `normalizeEffectKey(key)` -> `{kind, scope, subject, legacy, currentKey, legacyKey}` or `null` for a key it has no rule for; `toCurrentKey`, `toLegacyKey`, `systemUsesCurrentKeys(version)`, `keyForWorld`, `effectKeyLabel`.
