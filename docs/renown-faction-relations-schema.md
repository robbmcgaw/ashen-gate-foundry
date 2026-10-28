# Renown faction relations — schema

Module `ashen-gate-factions` (Renown) 0.22.0 or later. A **Faction** definition (`entity_type: "Faction"`, `FACTION-…` id) may carry an optional `relations` list. It sits at the top level of the Faction in `definitions[]` of an `ag-factions-source-export/0.4` file (`0.3` files accept it too; the schema id did not change). Deities keep their own `deity.relations` (see `renown-deity-schema.md`); a top-level `relations` on a Deity is refused.

Older Renown versions (before 0.22.0) refuse the field as an unclassified key. Do not put `relations` in a file for a world that has not updated.

## Field

| Field | Type | Default | Notes |
|---|---|---|---|
| `relations` | `{faction_id: "FACTION-…", resonance: number 0..1}[]` | absent | Optional. One direction (this faction → that one). Absent means no relations and the stored definition is unchanged. `[]` is allowed. |

- `faction_id`: another Faction's permanent id (`FACTION-[A-Z0-9-]+`). Not the faction's own id. No duplicates. It may name a faction that is not in the world yet; it shows once that faction exists. Never a Foundry UUID.
- `resonance`: the GM slider. `0` = full **Dissonance** (a rival), `0.5` = neutral (no effect), `1` = full **Resonance** (an ally). Same range and labels as deities.
- Any other key inside a relation row is refused (closed shape).

```json
{
  "id": "FACTION-EXAMPLE-CONCORD",
  "entity_type": "Faction",
  "name": "[TEST] Concord",
  "relations": [
    {"faction_id": "FACTION-EXAMPLE-BRIGHTWORK", "resonance": 0.1},
    {"faction_id": "FACTION-EXAMPLE-WARDENS", "resonance": 0.8}
  ]
}
```

## Cross-faction effects (personal Renown only)

Approved by Robb, "yes only for personal". If a character **gains** N **personal** Renown with faction A, then for each relation A → B:

- factor = (resonance − 0.5) × 2, from −1 (Dissonance) through 0 to +1 (Resonance).
- B changes by N × factor × damping. Damping is its own GM Setup world setting, **Faction knock-on damping** (`factionDamping`): default 0.5, range 0 to 0.95. The maths, rounding and labels are the deity ones: positive results round down, negative ones round away from zero, 0 means nothing happens.
- Only gains spread. Removing or reducing personal Renown with A changes no other faction. **Group Renown is never affected**, in either direction.
- Effects don't chain: a change to B never spreads further.
- Only factions the character **already knows** (revealed to the party, or to that character) are affected. A related faction the character has not met is left out; no standing is created with it.
- B's personal score never drops below 0. Rewards and ranks the character already claimed stay claimed; only the score is floored.
- The GM confirms every award: a list shows each related change, all ticked; untick any, or Cancel to drop the whole award.

History: B's personal entry reads "Dissonance with A: <reason>" (or "Resonance with A: …") and carries `caused_by` (A's entry id) and `source_faction` (A's `FACTION-…` id). If the player cannot see A by name, the line shows "Renown shifted through a related faction" and `source_faction` is dropped.

Undo (GM, personal history only): **Undo…** adds reversing entries (`reverses` = the original entry id, plus `source_faction` for a knock-on) for that entry and any knock-ons it caused. Nothing is deleted; an entry can be undone once; undo entries never spread.

## Players

A player sees a relation only when they already know both factions by name, and only as Resonance or Dissonance (never the number). Relations and history lines naming a faction they do not know are removed from their view.

## API (`game.modules.get('ashen-gate-factions').api`)

- `getFactions()`: GM gets each definition including `relations`. A player gets their projected view with `relations: [{faction_id, name, label, isDissonant, isResonant}]` limited to factions they know.
- `getFactionKnockOns(factionId, gain)` (GM only, read only): `[{faction_id, name, resonance, label, delta}]` for a personal gain, using the world's faction damping. It does not check discovery and applies nothing.
- Relations are written only through the GM's faction editor (Save Changes) or a GM update-mode import; both are GM-only in the data layer.
