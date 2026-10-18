# Utilities v0.2.0 — Real Foundry fixture setup and reset

These are **synthetic, clearly named TEST records**, not approved Ashen Gate setting content. They exercise the actual native Foundry Actor, Item, and RollTable documents; **no module Test Mode produces fake data**.

**Environment:** Forge Foundry V14 Stable 9 (Build 367) / dnd5e 6.0.6 (user-reported target, not verified live).

1. Back up or clone a disposable world. Install and enable Utilities v0.2.0. Create **at least one non-GM user**, ideally two, with two separate browser sessions. Log into the world as GM.
2. Press **F12** in the GM's Foundry browser and select the **Console** tab. Paste **this full command**, including `await`:

   ```js
   await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).setup()
   ```

   It should return an object listing **two actual character Actors** (`AG TEST | Bridge Scout`, `AG TEST | Field Warden`), **one native loot Item** (`AG TEST | Sealed Travel Ledger`) and **two RollTables** (`AG TEST | Crossing Reports`, `AG TEST | Unsafe Document Result`). First two non-GM user accounts receive Owner permission; with one player account both belong to that user. Re-running setup does not duplicate the tagged documents.
3. GM: open Actors → Utilities → GM Setup and enable Player Access. Player: open Actors → Utilities. Use Group Checks and Roll Requests through their normal GM creation buttons; no fixture injects fake session state or awards.
4. For the Party Stash test, GM opens **Party Inventory → Create Party Stash → Turn On for Players → Open Party Stash**, then drags the `AG TEST | Sealed Travel Ledger` Item from the Items directory into the Party Stash window.
5. Use `tests/FOUNDRY_ACCEPTANCE_v0.2.0.csv` and enter Pass/Fail + Test Notes on **the same test row**. All initial results remain NOT RUN. The setup script is never automatically loaded during normal play.

## Clean reset

From **GM's F12 → Console** in the disposable world:

```js
await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).reset()
```

After confirmation this deletes **only the five fixture-tagged native documents** and clears the Utilities active check/history. It does **not** delete the stash or any untagged documents. To additionally delete the **default-named module-created stash and contents**, use the intentionally more destructive command (with an extra confirmation):

```js
await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).reset({deleteStash:true})
```

Do not run reset on a real campaign world. Keep a snapshot before testing, and don't copy private campaign logs into the testing notes.

## Expected lifecycle states (not seeded fake records)

- Pending: GM starts a Group Check; native world-setting activeSession has pending slots, and the player sees a Roll Now prompt.
- Submitted: Player makes a native dnd5e roll. The GM observes server-authored ChatMessage proof and accepts one contribution.
- Completed: Last valid contribution, or GM End & Record, archives the exact session in History and clears activeSession.
- Cancelled: GM confirms Cancel Session; History records the cancellation and activeSession clears.
- Individual: Roll Requests show a separate view and record each actor's result independently. Both feature tabs serialize through one active-interaction slot so requests cannot overwrite each other.

If setup fails, capture the browser Console error and stop. These actual-world operations **cannot be certified without your Forge GM/player acceptance**.
