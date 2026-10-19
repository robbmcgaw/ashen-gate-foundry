# Ashen Gate — Headquarters Builder + Hosted Hirelings Alpha 0.6.0

**Build status:** Unpublished local standalone Foundry V14-targeted **alpha**, designed for a backed-up test World. **Not tested inside real Foundry V14.** Canonical gameplay content is not bundled.

Source contract: Ashen Gate live `main` reviewed 2026-10-17 at `89da7ab854fa87e1b2b77dfdd19c4e16f0b5c5f8`, including `systems/contracts/v1/guildhall-state.schema.json`, DEC-0058/0059/0064 and DEC-0053–0057. GitHub work queue and standard consulted at `7c76fc49081812c051697fa7bec2aaea860f7299` (AG-FOUNDRY-DEV/1.6, AG-WORK-0005, DEC-0072). This release is derived from the v0.5.1 source pinned on main at `d96f171d18b1c9a7cdd989931f3315509af4e8a9`.

## Install

1. Unzip the release archive under your Foundry User Data `Data/modules/` directory. The result **must** be a folder named `ashen-gate-headquarters` containing `module.json`.
2. Restart Foundry if necessary. Enable **Ashen Gate | Headquarters (Builder Alpha)** for a **test World** from Manage Modules.
3. GM or authorized player opens the **Actors** sidebar and presses **Open Headquarters** (above the Actor list), or uses **Shift+H**. A GM-only **Configure Settings → Module Settings → Open Headquarters** fallback is also registered; General Manager → Modules may open the same public API when Manager is active. The public API also works from the Console:
   ```js
   game.modules.get('ashen-gate-headquarters')?.api?.open()
   ```
   The Actors sidebar is primary; GM Module Settings and optional Manager Module tile remain fallbacks. Actual Foundry V14 open/close behavior requires live verification.
4. In the activation screen, enter **existing** `HQ-*` and `LOC-*` source IDs for your world. The prefilled `*-DEMO-*` examples do **not** create or verify those source records. Campaign key and lowercase guild key identify your Guild campaign state. Activating twice is rejected.
5. GM > **GM Setup**: optionally click **Seed Test Facility Records**, **Unlock**, then **Acquire +1**. Each acquisition creates one stable local copy key; acquiring twice gives two copies. Or import an array of custom `FAC-*` definition JSON with the seven canonical metadata fields, as in `examples/facility-example.json`.
6. Guildhall Builder > **Edit Guildhall**. Drag an acquired facility card from the sidebar to the grid, select it to rotate 90° or uninstall it. Move existing tiles by drag. The GM changes grid bounds and rank capacity on Management.
7. GM Setup > **Create Missing Player Rooms**, then Personal Quarters tab. Room owners arrange eligible personal facility copies and GM-curated visual-only decoration images. Other players see the room but cannot change it.

## Implemented in this alpha

- **Existing v0.3.0 UI retained:** aligned Actors sidebar launcher, visible version/Help, GM Setup tab, catalog search, bottom-right shared-edit action. No v0.1 state migration.

- Separate campaign-scoped `guild_state` (campaign + guild key) and one `HQ-*` physical site linked to `LOC-*`.
- Five GM-controlled ranks, configurable rank table, rank-granted facility unlocks, manual unlocks; defaults of two facility slots and two shared downtime Orders are **playtest defaults**, not fixed mechanics.
- Distinct unlocked / GM-acquired / installed states, per-copy upgrade stages with potentially different configured footprints, persistent layout data.
- Free grid placement, 90° rotation, boundary and rectangular collision enforcement, no adjacency requirement; resizing cannot silently truncate building pieces.
- Single shared canvas editor with an exclusive lease, GM override and 60-second renewal. Noneditors can view changes; moving and rotation are subject to layout revision checks.
- Separate room revisions and owner/GM editing rights. One personal facility capacity per personal room, distinct from shared slots. GM provides decorative assets via Foundry FilePicker; decoration art can overlap and has no gameplay effects.
- Benefits are descriptive **only**; no Actor/Item/roll/Profession/XP mutation.
- Copies are not destroyed when uninstalled. Per-copy installed artwork/stage is derived from its definition and instance stage.
- Exposes optional public API `{apiVersion:'0.2',open(),getState(),playerAccess}`. `getState()` returns full campaign state **to GMs only**; `playerAccess.getState()` returns only access metadata and `playerAccess.setEnabled(boolean)` is GM-only, for Manager's optional Player Access panel.
- **DEC-0072 Player Access gate:** module-owned world setting `playerAccessEnabled`, initially `true` for backwards-compatible player visibility from 0.2.0. Hidden removes the player Actors button, closes their window and rejects opening via public API or Shift+H. GM access remains, and no Guildhall state or Player progression is reset. GM can use Foundry Module Settings or the real **Player Access** control in Headquarters → GM Setup.


## Des/Hirelings hosted roster (new in 0.5.0)

After GM activation, import canonical `HIRE-*` and `HPERK-*` source records through a Manager release that supports them, projecting them into **world Items or Journals** with the documented Manager `flags['ashen-gate-manager'].source` source-ID binding. Headquarters never writes or replaces those definitions.

Open **Hirelings** in Headquarters. As GM, choose an imported HIRE profile under **Add from imported Hireling definitions**, then click **Add to roster**. The roster remains a nested Hirelings-domain `personnel` section in the **GM-restricted Headquarters private JournalEntry**, not in a player-readable world setting. The approved `aghq-state/0.1` full-save structure and existing ranks, rooms and facilities are preserved. An unstationed Hireling remains in the roster.

- **Working ON/OFF:** GM only. OFF retains a facility staffing reservation, pauses work/presence-dependent informational benefits, and does not imply death or departure.
- **Station/transfer:** GM may select an installed facility on a Hireling card and click Assign/Transfer; GM can also drag a roster card onto a facility tile. Transfer is atomic in one authoritative GM document update. Staffing slots are created as needed for preexisting v0.4.0 installations; no `ASSIGN-*` record is created.
- **Permanent departure:** GM chooses Dismissed, Retired, Permanently Departed or Deceased and confirms. One state operation records an event and clears any staffing reservation; repeat of the same action does not add history. No separate Hireling events/API are required for this v1 hosting architecture.
- **Perks:** initial selection references `HPERK-*` from a HIRE definition's `has_hireling_perk` typed refs. Imported perk eligibility fields are read only when a structured canonical payload is available; otherwise the UI marks conditions **Unverified**, rather than inventing rules. The default overlap group is non-stacking in display. No Actor/perk/roll mutation.
- **Player views (v0.5.2 privacy restriction):** no Hireling roster membership, Working, departure history or station occupant ID is published through the world setting. Player Hirelings/staffing views show a privacy notice pending a dedicated authorized publication interface. Source document permissions remain independent of Player Access.
- **Import/reimport:** source definitions are external; reimport does not modify local `personnel` Working, history, staffing or Guildhall data. Missing/archived/duplicate source IDs are clearly unresolved; external resolver APIs remain optional. No second Hirelings module is needed for this v1 UI.

**Caution:** Some Manager versions project source ID and refs but do not retain `record.conditions`, `record.capabilities` etc. This release deliberately does not parse Item HTML as structured game mechanics. It may show a name/portrait and an *unverified* perk until the importing module supplies an approved read adapter.

## Player Access quick test

In a disposable world, as GM, open Headquarters → **GM Setup** → **Player Access** and uncheck **Players can open Headquarters** (alternatively use Foundry Module Settings). A connected player should lose the Actors launcher and any open Headquarters window; `game.modules.get('ashen-gate-headquarters').api.open()` should refuse to open. The GM should still open, move and inspect the Guildhall. Re-enable the option and confirm the Actors launcher returns and all room/canvas state is unchanged.

For a Manager that implements `ag-player-access/1`, this module supports:

```js
const api = game.modules.get('ashen-gate-headquarters')?.api?.playerAccess;
api?.getState(); // {contract:'ag-player-access/1',moduleId:'ashen-gate-headquarters',audience:'player',playerAccessEnabled:true,configurable:true}
await api?.setEnabled(false); // only GM; rejected for non-GM
```

**This is UI access, not module activation, game rule permission, Actor ownership or document discovery.** v0.4.0 removed v0.3.0's unauthenticated player-mutation socket and uses an Actor document update to carry player editing intents. This still requires an actual Foundry V14 two-client verification before it can be called secure.

## Data shape and ownership

The **private, GM-owned JournalEntry** stores the authoritative `aghq-state/0.1` envelope with `core:{guild_state,headquarters_states}`, `personnel`, receipts and alpha-only fields. The world setting `ashen-gate-headquarters.state` holds a **public-only projection**: retained canvas, ranks, rooms and facility data, with Hireling roster empty, all station occupant IDs null, and replay receipts omitted. The non-secret world setting `privateStateDocumentId` is only a pointer, never the saved payload. In the core, installations, rooms and slots use HQ-local keys; `FAC-*`, `HQ-*`, `LOC-*` and `HIRE-*` are canonical foreign-reference identities. Coordinates are never used as object identity.

The catalog is *local alpha source content*, not canonical approved data. The public layout setting still reaches player clients, so do not put unrevealed facility secrets into its catalog or room metadata. The private JournalEntry has Foundry document ownership NONE for non-GMs; keep it restricted. See `SECURITY_MIGRATION.md` for GM-first migration, player reload and rollback considerations.

## Not implemented or not verified

- **Hosted Hirelings:** GM Working, roster and personnel history, GM drag/assign/transfer and atomic departure are implemented. Player-visible roster publication, automatic perk effects and complete external Manager projections remain deferred.
- **Orders/Contracts/Assignments workflow, Hireling Cache and automatic benefits evaluation** are not implemented. The header only displays a rank-configured test Order capacity.
- Comprehensive GM upgrade-preview/placement overlay and undo/redo are deferred. Upgrades are GM-triggered and blocked without enough space.
- There's no Foundry Scene projection, printed map, animated doors, walls, dynamic lighting, pathfinding or outpost support.
- **v0.5.1 → v0.5.2 one-time GM-first storage migration:** creates a private JournalEntry before redacting the public world setting; no payload format or rank/room/roster migration. Back up the world, log in as GM first, wait for migration, have connected players reload. See `SECURITY_MIGRATION.md`. Reverting to 0.5.1 after migration is **not** a safe automatic rollback.
- No live Foundry V14 or actual connected multi-client transport tests have been completed. A simulated browser test covers the GM + player intent path with trusted hook attribution mocks.
- Player mutation requests use an owned Foundry Actor document update; the GM receives the Foundry `updateActor` hook's sender User ID, never a client-claimed socket sender. This is a **candidate authenticated transport** rather than a production-verified security boundary. A non-GM editor currently requires a GM-created personal room and OWNER permission on at least one world Actor. No fallback socket is provided if either is missing. **Test with a real Foundry V14 GM + player connection before using in an untrusted world.**
- `Foundry FilePicker` integration requires live V14 verification; manual data-path inputs can be used if a picker API has changed.

## Tests performed

- v0.3.0 includes launcher DOM/order/duplicate/height and Player Access checks and screenshot captures in the fake-browser smoke test. All screenshots marked `*-fake.png` are NOT from Foundry.

- `node --check js/main.mjs && node --check js/logic.mjs` — syntax checks.
- `node --test tests/*.test.mjs` — **53/53 passing** (45 prior plus 8 private-state migration/denial tests). Covers activation, permissions, collision/bounds, replay, same-record receipts, staffing departure preview and state preservation.
- `python tests/browser_test.py` — **passed in an in-memory browser with a mocked Foundry object** (not a Foundry runtime): activate, demo load, unlock, acquire, lock, drag/drop, select/rotate, room setup, and a synthetic player Actor-update intent processed by a mocked GM and acknowledged.

## Recommended next Foundry checks

Use a temporary World and two distinct logins: confirm module startup/launch, one player acquiring the editing lease, another view-only, GM takeover, live setting broadcast, drag/drop/collision handling, personal room editing permissions, and surviving reloads. Report discrepancies before importing real material or enabling the module in the campaign World.

## v0.4.0 workstream additions (AG-WORK-0005)

- **Player edit intents:** player-side requests are sent via `Actor.update({"flags.ashen-gate-headquarters.playerEditRequest": ...})` on an Actor the player owns in Foundry. The primary active GM uses the authoritative `updateActor(actor,changes,options,userId)` event to determine who made the edit. The module checks guild membership via that Foundry User's personal-room binding and the Actor OWNER permission. New requests are size/time/operation-allowlisted, serialized with GM edits, then persisted by the GM with a replay receipt in the same HQ state write. The GM returns a status acknowledgement on the Actor. This replaces—not augments—the old socket mutation listener. **This approach is not live-verified in Foundry V14.**
- **Confirmed permanent departures:** GM-only `api.reconcileDepartures([{hirelingRef:'HIRE-...',status:'departed',verified:true}],{expectedStateRevision})` rechecks matching occupied slots and clears them. `Working OFF` / temporary absences never vacate. The `verified:true` flag represents **GM confirmation**, not a verified Hirelings API. Automatic provider event binding remains deferred.
- **FAC source diagnostics:** GM-only `api.inspectFacilityRef('FAC-...', optionalResolverFunction)` provides a read-only status using an explicitly supplied, optional resolver. The provisional shared resolver is not installed or required, and no imported definitions are overwritten.
- **No state migration:** world setting `ashen-gate-headquarters.state` still uses `aghq-state/0.1` with the same `core`, inventory, personal quarters and definitions; an additive `processed_player_requests` receipt array is written after player edits. Back up the world before testing.

**Next test:** In real Foundry V14, the GM creates player rooms, assigns a player an Actor with OWNER permission, then the player obtains/releases the Guildhall lock and places/moves a facility. Test another player with no Actor ownership, non-GM `setEnabled`, malicious Actor flag payload and disconnect/reload. A player without a suitable Actor gets a visible message and cannot mutate; there is no unsafe socket fallback.

## Launcher repair in v0.5.3

The Actors sidebar is the **primary** Open Headquarters entry point, in the same group as Profession Ledger, Factions, and Skill Trees. General Manager discovers the module via `game.modules.get("ashen-gate-headquarters").api.open()` even while the GM private-state Journal migration is pending or fails. `Shift+H` is a shortcut, and the GM can use Foundry Settings → Module Settings → Ashen Gate | Headquarters → Open Headquarters as a fallback. The latter menu is GM-only.

Startup of the launcher/API is no longer blocked by private storage setup; the GM app displays a recoverable error state if its private vault is inaccessible. No private save is exported or made public to fix launchability. The v0.5.2 full `aghq-state/0.1` format, private Journal and redacted settings remain unchanged.

No live Foundry test has been performed. If the launcher is absent after enabling the new ZIP and reloading the world, in the console inspect `game.modules.get("ashen-gate-headquarters")?.active` and `.api` and share the first red error line.


## v0.6.0 coordinated update

See [CHANGELOG.md](CHANGELOG.md) for changes; [fixtures/SETUP_RESET.md](fixtures/SETUP_RESET.md) for exact GM fixture setup and safe cleanup; [fixtures/HQ_v0.6.0_Live_Test_Cases.csv](fixtures/HQ_v0.6.0_Live_Test_Cases.csv) for the required eight-column Foundry acceptance checklist. These supersede older references to the Settings fallback or screen labels. No live Foundry V14 test is claimed.
