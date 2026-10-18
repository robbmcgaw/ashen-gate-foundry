# Ashen Gate | Utilities — v0.2.0 Alpha (local review build)

**Module ID:** `ashen-gate-utilities`  
**Owner:** Des / Utilities, `AG-WORK-0019` under `AG-COORDINATED-BUILD-2026-10-17`  
**GitHub baseline:** `main` at `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8` (read 2026-10-17). Based on the v0.1.0 source archive already preserved in this conversation, cross-checked with current GitHub source.  
**Runtime target:** The Forge, Foundry V14 Stable 9 (Build 367), dnd5e 6.0.6. **Live GM/player Foundry V14 acceptance NOT RUN.**  
**Publication:** This is an **uncommitted local review candidate**, not synchronized to GitHub; no installable URL/manifest hosted on GitHub.

## What changed from 0.1.0

- **Group Check lifecycle**: the GM can End & Record an incomplete check, explicitly recording remaining slots as Skipped; automatic completion also archives. A finished/cancelled check moves to History and clears the active interaction. A new check starts from clean character selections, avoiding the prior stuck check and `Choose 1 to 24 characters` next-check failure path.
- **Distinct views**: Group Checks and Roll Requests have separate screens, independent instructions and states while sharing one serialized active-interaction slot. The inactive tab does not display the other session as its own request. New interactions cannot overwrite active requests.
- **Player prompt**: eligible connected players receive a notification and automatically see the relevant Utilities tab when a new session starts; the main **Roll Now** control is larger and more obvious. Player roll view is intentionally compact.
- **History**: GM History now shows per-character skill, accepted total, pending/skipped/cancelled status, individual result versus DC, Group Check average and outcome.
- **Conditions**: one party conditions view for the GM and players (players see the party characters they have Limited or better permission on). Condition removal is locked per character by default; the GM unlocks a character in the Conditions tab, and its owner can then remove that character's native conditions. Player removals are sent over the module socket and carried out by the primary GM client, which re-checks ownership and the lock. Custom (non-native) statuses are traced to their source effect and stay GM-only. **Pop Out Overlay** opens a mostly transparent, per-user conditions window (bold character names, bulleted conditions, a small × where removal is permitted) that remembers its position and updates live.
- **RollTables**: rolls with Foundry's own `RollTable#draw`. Text, document and compendium results are all supported; document results are shown with an Open button and sent as `@UUID` links. Editable preview, per-player whisper and Auto-Send retained.
- **Party Inventory**: documents and enforces the existing intentionally GM-only read-only stash UI, including when native Actor Observer permission is granted. No cross-Actor transfers.
- **Layout**: content-fit controls, two-pane responsive layout, shared Actors launch-group metadata/order rank 60 and 36px launcher button; `ApplicationV2` minimum dimensions target 620 × 490. Manager remains optional.

## Installation

1. Back up the test world and previous `ashen-gate-utilities` folder. Upload/extract the installable ZIP's single `ashen-gate-utilities` directory into the Forge module directory using your supported upload method. Do not attempt a nonexistent Manifest URL.
2. Enable **Ashen Gate | Utilities** in Foundry **Game Settings → Manage Modules** and reload as GM.
3. Open **Actors → Utilities**. Enable **GM Setup → Enable Player Access → Save Player Access** for test players.
4. Prepare *actual native Foundry test data* using [fixture setup](fixtures/SETUP_AND_RESET.md). In the **GM browser's F12 Console**, paste:

   ```js
   await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).setup()
   ```

5. Follow [Foundry acceptance tests](tests/FOUNDRY_ACCEPTANCE_v0.2.0.csv), recording **Pass/Fail and Test Notes on the same row**. Use two browser logins where Role requires GM + Player. Use the [same fixture guide](fixtures/SETUP_AND_RESET.md) for cleanup.

### Reset (disposable world only)

**GM browser → F12 → Console:**

```js
await (await import('/modules/ashen-gate-utilities/fixtures/setup.mjs')).reset()
```

This clears session/History and deletes only records with `flags['ashen-gate-utilities'].fixtureId === 'AG-UTILITIES-V020-DISPOSABLE'`. It does not delete the module-owned stash unless you explicitly use `reset({deleteStash:true})` with extra confirmation.

## Ownership, state and privacy

- Public session state and player-facing actions remain module-owned (`game.settings` + native verified `ChatMessage` evidence), not Manager or Quest. Only a GM can change session/Player Access settings; Actor ownership is checked when accepting native rolls. Players receive no GM Setup, History or GM RollTable/stash action surfaces.
- Only **public** native skill Roll Requests can be created in v0.2.0. This release does **not** activate private/blind audiences, GM-only roll totals, ability checks or saves because the current world-synchronized session store and dnd5e evidence handling have not been validated for their confidentiality. **Never put secret outcomes in this public session store.** Group outcomes use accepted unrounded averages and the current approved distinct-skill behavior.
- Party Stash is a GM-only native NPC Actor with module flag `partyStash`; even Observer-privileged players never see it *through Utilities*. **Native Actor Observer permission may separately reveal the Actor in the standard Foundry Actors UI**. Do not give Observer on real private loot; use disposable test Items only.
- No alternate writable definitions, no Manager imports, no Quest ASSIGN changes and no Profession/Skill Tree progression changes.

## Not yet implemented or certified

Public roll requests only (no Private/Blind, ability/saving throws), no player stash sharing/transfers/currency/hidden Items/undo, no complex condition expiry/concentration handling, no supported RollTable document sending, and no authoritative dnd5e skill attestation of a chat roll independent of native `rollSkill` and the tagged submission. Multi-GM handover and native UI/launcher behavior need real Foundry V14 trials. The 620 × 490 minimum window must be checked in an actual client; CSS alone is not runtime proof.

**Important beta security restriction:** This is **not adversary-resistant** for hostile clients until roll-type/skill proof attestation and multiplayer authority have been verified in a live Foundry environment. Do not use campaign secrets or actual party property during the Alpha acceptance pass.

See [release notes](RELEASE_NOTES.md), [fixture scenarios](fixtures/SCENARIOS.json), [setup/reset guide](fixtures/SETUP_AND_RESET.md), and [automated evidence](docs/TEST_RESULTS_v0.2.0.txt).
