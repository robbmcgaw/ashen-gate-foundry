# Rewards brief T1: Skill Trees board reads drops with the standard parser

This is a self-contained brief for a build chat. It touches a single module, **`modules/ashen-gate-skill-trees` only**. It is small, and the lowest priority.

**Read first:**
- `CLAUDE.md`
- design `docs/rewards-and-loot-design.md` §1.1 (Skill Trees) and §2.2
- `docs/item-drop-standard.md`

**Waits for:** S1 on `main`. Can run in parallel with every other rewards PR except S1.

## Branch and version
- **Branch:** `rewards-t1-skill-trees` from `main`. Open a normal PR and merge it when it is green.
- **Version:** **patch**, recomputed from `main` (0.19.1 today → 0.19.2).
- Update `module.json` (+ `download` URL), `scripts/main.js` and the tests that hard-code the version (grep: `runtime.test.mjs`, `ui-pass-v0190.test.mjs`, `qa-fixture-v060.test.mjs`), and the CHANGELOG.

## Shared files
- **Add** `scripts/ag-item-drop.mjs`, byte-identical from Quest Log on `main`. Never edit it.
- Never edit the other shared files.

## Changes
- **`_dropped`** (`scripts/main.js:1266-1280`): replace the raw `JSON.parse` of `text/plain` with `readDrop` + `resolveItemDrop(raw)` (folders refused). Show the refusal reason as a warning.
  - Then hand the resolved Item to `_addPerkNode` (:953) **unchanged**. It keeps every rule: `feat` only, `PERK-*`/`POWER-*` source id, canonical world document, provider kind, no duplicates.
- **GM edit mode only, as today.** Players and preview mode still can't drop.
- No change to unlocks, grants (`givePerk`) or saved data.

## Tests
- A world perk Item drop adds a node, as before.
- Drops that only `getDragEventData` can read (no plain JSON in `text/plain`) now work.
- A folder → warning; a missing item → warning; an Actor → warning.
- The existing `_addPerkNode` refusals are unchanged.

## Done when
- `node scripts/check.mjs ashen-gate-skill-trees` is green; `ag-item-drop.mjs` identical.
- `node scripts/ui-lint.mjs` is unchanged.
- The version and CHANGELOG are done.

## Forge steps for Robb
1. Skill Trees → a tree → edit mode: drag a perk from the Items sidebar onto the board. A node appears as before.
2. Drag the same perk from General Manager's Browse tab: it works too.
3. Drag a weapon: you get the usual "not a perk" refusal. Drag a folder: "Drop items one at a time."
