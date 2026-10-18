# Factions & Renown v0.6.0 Beta — real Foundry test fixture

**Target:** Foundry V14 Stable 9 (Build 367) on Forge, dnd5e 6.0.6. **Synthetic playtest data, not approved Ashen Gate canon.**

## Before setup

1. Back up and duplicate the world. Install and enable `ashen-gate-factions` v0.6.0; log in as **one active GM**. Log out any other GM client.
2. Create **two separate non-GM user accounts** in Foundry if none exist. Keep both accounts active during tests, one signed in on a separate browser/incognito profile or device. The fixture creates each user an owned QA Actor but **does not edit their assigned-character setting, any existing Actor, or any world preferences**.
3. In GM browser, open developer console with F12. Paste the full command exactly:

```js
const { setup } = await import('/modules/ashen-gate-factions/fixtures/setup.mjs'); await setup();
```

The command returns generated Actor and Faction IDs. If it reports missing users, **no documents have been created**. If it reports fixture already present, run reset first. A partially failed setup may leave tagged records, which reset safely removes.

## Created records (real Foundry documents)

| Resource | Expected use |
| --- | --- |
| `The Far Lanterns — QA` | Party-discovered Faction, Group Renown 5 + previous history, one Item reward, one service (limit 1), passive, player-specific linked Journal permission. |
| `The Gilt Compact — QA` | Discovered personally by QA Scout only, selectively disclosed Description but hidden Name/Leader, individual score 4, hidden from QA Broker. |
| `The Iron March — QA` | Undiscovered anonymous placeholder, prior Group Renown 2 visible only after GM reveals it. |
| `Factions QA — Scout` | Player 1 owned Character Actor, eligible recipient for Item claims. |
| `Factions QA — Broker` | Player 2 owned Character Actor, separate personal Renown. |
| `QA — Open Route Notes` | Journal Observer for Player 1, not Player 2, linked in Far Lanterns. |
| `QA — GM Restricted Contact` | GM-only Journal, linked in Far Lanterns. |
| `QA — Scout Charm` | GM-only original world Item; approved claims create Actor-owned copies for the actual recipients. |
| `QUEST-PLAYTEST-SUPPLY-ROAD` | **Typed optional reference only**. No Quest is created by this fixture. Its cross-module acceptance is gated on Eli's accepted Quest build. |

The published real documents and campaign states are created using `JournalEntry.create`, `Actor.create`, and `Item.create`, *not* fake UI preview rows. Player records are recalculated through the standalone module's GM-only `refreshPlayerViews` API.

## Reset (safe for the test world)

Run in GM console:

```js
const { reset } = await import('/modules/ashen-gate-factions/fixtures/setup.mjs'); await reset();
```

Only QA documents bearing the module-owned `testFixture` flag `AG-FACTIONS-PLAYTEST-2026-10-17` are deleted. **Normal campaign data and user accounts are untouched.** The module-owned per-player filtered Journal documents are retained and refreshed. Any granted Actor Items attached to the fixture's *test Characters* are deleted with their test Actor on reset. The module-created storage folder is retained. A world backup remains the ultimate rollback for any destructive manual test edits.

## Test records and cautions

Use `fixtures/TEST_CASES.tsv` with columns **Test Name, Test Steps, Expected Outcome, Pass/Fail, Test Notes**. Tests are initial **Not Run**; do not infer live results from Node mocks. For a clean retest, run reset then setup again. Claim/request cases require an actual online GM and another logged-in player. Item source permission is deliberately GM-only; no automatic change to the source Item's visibility occurs. You may view the delivered copy on the authorized Actor sheet.

A **real accepted Quest Manager Objective** is required for the last linked-Quest case; the placeholder typed reference is not a published Objective record. Mark that case **Not Run** until Eli's Quest release passes its own visibility/reveal iteration.
