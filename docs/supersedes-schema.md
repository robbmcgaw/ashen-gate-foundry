# `supersedes`: replacing a record under a new permanent id

General Manager 0.64.0, Renown 0.17.0, Quest Log 0.25.0. Optional and additive; `ag-foundry-import/0.1` and `/0.2` are both still accepted. A package without the field behaves exactly as before.

Permanent ids are never renamed or reused. The one exception is a deliberate replacement the GM approves: the **new** record gets a **new** id and names the id it takes over from. The old id is retired for good.

## The field

```json
{ "id": "NPC-TEST-NEW", "entity_type": "NPC", "name": "[TEST] New Person", "supersedes": ["NPC-TEST-OLD"], "...": "..." }
```

| Rule | Error if broken |
|---|---|
| An array of strings, not empty | `supersedes: must be an array of permanent id strings` / `must not be empty` |
| Each entry matches the package's id pattern (`/0.2`: `PREFIX-PART…` upper case) | `invalid permanent ID` |
| Not the record's own id; not listed twice | `cannot supersede its own id` / `listed twice` |
| No two records claim the same old id (one new record per old id) | `also claimed by <id>` |
| The old id is not itself a record in the same package | `still a record in this package` |

Any error stops the whole package (nothing is written), like every other validation error.

## What Manager does (Import and Sync from package)

For each record with `supersedes`, Manager looks for a Manager-bound world Actor, Journal or Item whose source id is the old id.

- **None found** (a fresh world), or **the new id already exists**: nothing special; the record is created or updated as usual.
- **Found**: the preview shows a **Replaces** choice per record, **Yes, replace it** (default), **No, add separately**, **Skip**. Nothing is written until Apply (Import) or the confirmation phrase (Sync); both download a backup of the old documents first.
- **Yes** rewrites the *same* world document and binds it to the new id: tokens on scenes, ownership, folder, links and Codex notes stay. Name, image, prototype token name/image, description/biography (Actor), Journal pages, Item system data and the stored record text come from the new record. Kept: current HP and other play state, items/pages the GM added, a token ring that is already on, and every placed token's own data (Foundry updates linked tokens through the Actor). Player characters are never replaced; an archived or wrong-type document is refused with a reason.
- **No** imports the new record as its own document. **Skip** leaves both alone.
- Sync never deletes a document whose id a record supersedes, and never treats it as missing from the package (it is replaced, or listed as *Not removed*). Re-running the same files changes nothing.
- Afterwards Manager retires the old ids, moves its own references (record `refs`, GM-added Codex `links`) to the new ids, and calls `api.supersedeIds({OLD: 'NEW'})` on Renown and Quest Log when they have it.
- A reference that still uses a superseded id resolves to the replacement inside the same package, with a note.

## Partner API (feature-detected, GM only, idempotent)

```js
await game.modules.get(id).api.supersedeIds({ 'OLD-ID': 'NEW-ID' }, { dryRun: true, definitions });
// -> { module, changed, notes, dryRun }
```

Rejects a non-GM. `dryRun` writes nothing and reports `changed`. An old id that is not present is skipped; running again changes nothing. A module that is off or older than its release listed above is not called.

- **Renown**: `supersedes` is accepted on a faction/deity and on information entries in `ag-factions-source-export/0.3` and `/0.4` files (it is not stored). Entry ids are renamed in the stored definition (with `definitions`, the new entry's name/text/link replace the old) and the party's knowledge for the entry moves to the new id. Standings, claims, requests, rewards, choices and track ids are not touched. A faction/deity id is reported and not renamed.
- **Quest Log**: `refs[].target_id` of every quest, order and contract, and the remembered link names, move to the new id. Quest ids themselves are not re-keyed.
- **Checked, nothing keyed by these ids**: Locations (links are Foundry UUIDs of the same document; a stored label is display text), Headquarters, Profession Ledger, Skill Trees, Utilities (merchants are dropped Actors by UUID, names are text), Cinders, Character Hub (a Renown key in a journey record is re-remembered silently).
