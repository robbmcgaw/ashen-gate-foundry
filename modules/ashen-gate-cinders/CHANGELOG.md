## 0.9.0 — 2026-10-22

- **Strain editor** in GM Setup → Strain (GM only): edit band names and From / To ranges (add or remove bands; leave the last band's To empty for open-ended), the Backfire % for Strain 0–10, the guaranteed-Backfire point, the normal-use Backfire point, whether modifiers can prevent the guaranteed Backfire, the maximum Strain (empty = none), long and short rest recovery, and the Backfire effect-roll Strain bonus (on/off, starting Strain, every N).
- Edits stay a draft until **Save Changes** (bottom right); **Cancel** (bottom left) or leaving the tab drops them. Each field shows its problem next to it as you type (gaps or overlaps between bands, a Backfire % lower than the one before, numbers out of range); Save Changes checks the whole draft with the same check as Import and saves nothing while anything is marked.
- Saving writes through the same path as Import Strain Config (`api.strain.importConfig`, GM only, refused for players in the API), so the Strain chip statuses re-register and chips rename. Character Strain is never changed (a lower maximum does not lower anyone's Strain).
- Import / Export / Reset to Defaults stay; they work on the saved config (Import and Reset discard unsaved edits after their confirmation, Export never includes them).
- **Players no longer see Ashen Gate | Cinders in Configure Settings**: on a player's client every Cinders setting is marked not shown and the category is removed from the Settings window. The GM's settings are unchanged.
- **Default art per Cinder kind:** a `MUT-*` record's `cinder` block may carry an optional `art` image path (same rules as the GM's art; checked on import). A new Cinder starts with its definition's art unless the GM picks another; a Cinder with no art of its own (older ones, or after **Reset to default orb**) draws its definition's art, then the default orb. The definition art is copied to the bearer's Cinder pointer (`defaultArt`) so players see it; Check / Repair cover it. `api.cinder.list` returns `art` (resolved), `ownArt`, `defaultArt` and `artSource`; `api.cinder.create(definitionId, {art})` can override.
- **Glow behind art:** when a Cinder shows art, the Strain-toned orb stays behind it as a soft glow and the image gets a halo in the same tone (calm, warm, ember, hot); the whole transparent image shows, no cropping.
- Saved data: same `strainConfig` setting and shape (`ag-strain-config/0.1`); new optional `cinder.art` in content and `defaultArt` on bearer pointers. No migration.

## 0.8.1 — 2026-10-21

- Character Hub level-backup copies (Actors with the Hub's `levelBackup` flag) no longer appear in the Cinders character list or the Bind / Transfer choices.
- They are refused as a target in the API too: bind, transfer, rehook, Push, sockets, Strain changes, Cinder tree points and player requests relayed to the GM all say "That is a level backup copy, not a playable character." Manage → Check / Repair and Move existing Cinder progress skip them.
- Saved data: no change. No migration.

## 0.8.0 — 2026-10-21

- **Strain chip on tokens:** a character with Strain above 0 carries one status for its Strain band (`ag-strain-<band index>`, one per band of the Strain config, so the band thresholds and names come from GM Setup → Strain). Its name shows the level, e.g. "Strain 6/10 (Band 3)", in the token tooltip. Everyone who can see the token sees it, and Utilities' Conditions view and overlay list it like any other status. Strain 0 = no chip.
- Display only: the chip has no changes and is never read back; Strain stays the Actor value. The active GM's client keeps exactly one chip per Actor in step whenever Strain changes, and checks every Actor on load. Other effects are never touched; a copied Actor without Strain (a Character Hub level backup) loses the chip.
- Only that sync can add, change or remove a chip. The Token HUD doesn't offer these statuses, and any other attempt (a sheet, Utilities' Remove or Apply, a macro) is refused with a note to change Strain in Cinders or the Character Hub Strain bar.
- New GM setting **Show Strain chip on tokens** (Configure Settings, default on; turning it off removes every chip). No chips while Character Hub hides the Strain bar from players (GM Setup → Player Visibility), the GM included.
- Icons are Foundry core placeholders, listed in one table (`STRAIN_CHIP_ICONS` in `scripts/strain-chip.mjs`) ready to swap for art.
- **Saved data:** new world setting `strainChip`; chips are ordinary ActiveEffects on the Actor, rebuilt from Strain. Nothing is migrated. Before disabling Cinders, turn the setting off to clear the chips (without Cinders they would stay as Custom statuses the GM can remove).

## 0.7.0 — 2026-10-21

- **`api.cinder.rehook(actor)`** (GM only): re-links one character to the Cinders it bears after its Actor data was replaced in place (Character Hub 0.28.0 calls it when the GM restores a level backup). The Cinder records stay the truth and are never changed: the character's bearer links are rewritten from them (links to Cinders it no longer bears are dropped), its Cinder tree progress is set from each Cinder through Skill Trees (Cinder powers it doesn't bear are removed), and its items' socket markers are set from the sockets. Re-running it changes nothing more. Fires `ashenGateCinder.changed` with kind `rehook`. Without Skill Trees the links and markers are still fixed and the result says the tree progress was not checked.
- No saved-data or setting change.

## 0.6.0 — 2026-10-21

- **Cinder sheet** in the Cinders tab: the Cinder is an orb ringed by the bearer's Strain (10 segments, then exact "+N over 10" pips that players see too), with its sockets on an orbit around it. Beside it: bearer, "Unspent: n" with **Open skill tree**, Strain, powers with each Push mode's cost, Strain after and Backfire % (perk and socket modifiers included), and the perks and socket items that count. A character with more than one Cinder gets a Cinder picker.
- **Sockets on the orbit** in attach order (no reordering): a socket added by a perk, power or item shows "+1"; an item over capacity is dimmed under the orb as inactive. Tap a socket to attach, swap or detach, or drag an item onto it. Same rules as before through `api.sockets` (owner while Player Access is on and not GM-locked; GM always, plus dropping a world Item).
- **Cinder art:** a shared default orb whose colour follows Strain, or the Cinder's own image. GM only: double-click the orb (or **Change art…**) to pick a file (Assets Library, `ashen-gate/cinders/`), **Reset to default orb** to go back.
- GM-only **Binding** card: current bearer and since when.
- Push asks with Cancel on the left and Push on the right; the Push button is red when the Backfire is guaranteed.
- API: `api.cinder.setArt(instanceId, path | null)` (GM only, rejected for players; hook `ashenGateCinder.changed` kind `art`). `api.cinder.list()` adds `art`, `unspent`, `treeId`, and `bearerSince` for the GM.
- **Saved data:** a new optional `art` on each Cinder record, copied to the bearer's Cinder pointer. Records saved before read as no art (the default orb); nothing is migrated. Manage → Check / Repair also cover the art copy.
- Docs: `docs/cinder-strain-schema.md` → Cinder art, `docs/perks-and-modifiers-for-gpt.md`.

## 0.5.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- No behaviour or saved-data changes.

## 0.5.0 — 2026-10-21

- UI standard look: "Ashen Gate | Cinders" header with version and Help on the right, tabs that scroll sideways on narrow windows (Manage and GM Setup marked GM), kit cards, tables, badges and empty states. The window opens 1.2× larger in Comfortable size.
- Strain is the same row as Character Hub's: slim bar with the number beside it, band, Backfire chance, yellow then red as it rises, and a red "+N over" badge.
- Manage: **New Cinder** is a plain + button at the top right; when it can't be used, the reason is shown as text. The Cinders table stacks into labelled rows on narrow windows.
- **GM Setup → Player Access** is now a checkbox saved with **Save Changes** (Cancel bottom-left). Same setting; nothing changes until you save.
- No saved-data changes.

## 0.4.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Unbind, Detach and Reset to defaults use a red action button; Push asks "Push [power]?". The Bind, Transfer, Create, Attach, Swap, Sockets and Strain forms use the shared form dialog (same fields).

## 0.4.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.

## 0.3.1 — 2026-10-21

- **Cinder point cap is now 16** (was 13), matching Skill Trees 0.17.1. Starting Cinder points stay inside the 16-point wallet; the setting now goes up to 16. Default (1 at first bind) unchanged. Saved Cinders are not rewritten.

## 0.3.0 — 2026-10-21

- **Cinder sockets.** Each Cinder has sockets that hold items: by default 3, set by the new GM setting **Sockets per Cinder**, or a number the GM sets on one Cinder (Manage → Sockets → Socket count). An item fits when it is an `ITEM-*` imported by General Manager whose record has `cinder` modifiers. No new content block is needed. Its modifiers count for that Cinder while it is in an active socket: in the Push preview, the Push itself, Backfire severity and rest recovery.
- **New modifier target `sockets.count`:** a perk, a power or a socket item can add (or remove) sockets. A socket item's own `sockets.count` counts only while that item is active without it.
- **Fewer sockets than items:** nothing is deleted or detached. Items are active in socket order up to the number of sockets; the rest show as "inactive: over capacity" until one is removed.
- **Attach, Detach, Swap** in the Cinders tab, for the bearer's owner while Player Access is on, and for the GM. **Manage → Sockets** for the GM: the same actions, Lock / Unlock for players, Socket count, and a **drop target**. Drag an Item from the Items sidebar onto a socket and it is copied to the bearer and attached, or swapped in if the socket is full. If it doesn't fit, nothing is copied.
- **Enforced on the GM client:** every change is checked there. The checks are bearer ownership, Player Access, the GM lock, that the item is on the bearer and fits, and free capacity. A repeated operation id does nothing. One registry write, then the bearer's copy (`flags.ashen-gate-cinders.cinders[].sockets`) and the item's marker (`flags.ashen-gate-cinders.attachedTo`).
- **Transfer or unbind:** attached items stay with the old bearer, detached and unmarked. An item that leaves the bearer's inventory leaves its socket empty.
- **Manage → Check** reports socket copies and markers that disagree with the Cinder, and items that left the bearer. **Repair** fixes them and never deletes an item.
- `api.sockets` (contract `ag-sockets/1`): `hosts`, `slots`, `socketable`, `canAttach`, `attach`, `detach`, `swap`; GM: `setLocked`, `setCount`, `attachDropped`. Hook `ashenGateSockets.changed`.
- **Migration:** none needed. Cinders saved before 0.3.0 read as having no attached items, the default count and no lock, and the new fields are written on their next change. Nothing is rewritten on load.
- Docs: `docs/cinder-strain-schema.md` → Sockets, `docs/modifiers-schema.md`, `docs/perks-and-modifiers-for-gpt.md`.

## 0.2.0 — 2026-10-21

- **Perks can change Cinders.** A `PERK-*` Item on the character whose record has a `modifiers` block (`ag-modifiers/0.1`, scope `cinder`, General Manager 0.41.0+) now counts in the Push preview, the Push itself (cost and Backfire chance), the Backfire effect roll and rest recovery, for every Cinder the character bears. Its labels show in the preview and on the chat card like a power's. A perk shares `stack` groups with the powers (largest counts); two copies of one perk count once; for rest recovery a perk counts once per character. Removing the perk Item removes its effect.
- **The shared modifier shape (`ag-modifier/1`).** `power.modifiers` and perk modifiers take `applies.powers` / `applies.modes` (the old top-level `powers` / `modes` still work), `requires.powers` (counts only while those powers are unlocked on the Cinder), and `scope: "cinder"` / `op: "add"`, both optional.
- **`api.modifiers`** (contract `ag-modifier/1`, scope `cinder`): `validate` is the check General Manager calls when importing a `modifiers` block (a wrong target, a value outside −100…100 or 0, a bad `applies` / `requires` blocks the import). `forActor(actor)` lists a character's perk modifiers (GM or owner, while Player Access allows). `scripts/validate-content.mjs` uses the same check.
- An `ITEM-*` with cinder modifiers does nothing yet: items will count only while attached to a Cinder socket (next Cinders release). Import shows a note saying so.
- `docs/cinder-strain-schema.md` and `docs/modifiers-schema.md` updated; `test-fixtures/modifiers/invalid/unknown-target.json` added.
- No saved data changes; no migration. Nothing is written to perks or Actors.

## 0.1.0 — 2026-10-21

First release. Strain, Cinder instances, Push and Backfire move here from Ashen Gate | Skill Trees 0.15.0–0.16.0, unchanged in behaviour.
- **Needs Skill Trees 0.17.0 or later** for Cinder trees, powers and points; update both together. Next to Skill Trees 0.15.0/0.16.0, which still run their own Strain and Cinders, this module stays off and says "Update Ashen Gate | Skill Trees to 0.17.0 or later". Without Skill Trees, Strain still works and the Cinder parts say what is missing.
- **Strain:** one value per character, under the same flag as before (`flags.ashen-gate-strain`, so no data changes). `api.strain` (contract `ag-strain/1`) is the single door for every system that changes it. Bands and Backfire % come from the Strain config. A long rest removes 1. GM Setup → Strain has Import / Export / Reset.
- **Cinders:** each Cinder keeps its own points and unlocked powers and moves with them. The **Manage** tab (GM) has New Cinder, Bind, Transfer, Unbind, Check and Repair, and Move existing Cinder progress. One bearer per Cinder, up to the per-character limit (default 1), never two of a kind. The starting point(s) come once per Cinder at first binding. Transfer leaves Strain and conditions with the previous bearer.
- **Push and Backfire:** from the **Cinders** tab. Strain is always gained, and the chance is taken from the Strain after the gain. On a Backfire there are two rolls (category, then effect, with higher Strain pushing toward the severe end). One chat card, plus an optional temporary status. Normal use at Strain 10 or more backfires automatically, without adding Strain. A Backfire never kills or removes a character.
- **Strain bar** on the Cinders tab: it fills to 10 and then shows how far past 10, with the band name and current Backfire %. The GM gets Add / Remove / Set with a reason.
- **Skill Trees link:** through its public `api.accounts` (`ag-tree-accounts/1`) and hooks only. A bearer's progress goes onto their Cinder tree, and only a Cinder's bearer can gain points or unlocks on that tree.
- **Takes over from Skill Trees 0.15/0.16 once:** any Strain config, Cinder limits, Cinder records and bearer links they saved. This happens automatically on the first GM login and can be re-run from Manage. Nothing in Skill Trees is changed.
- Actors-sidebar launcher; GM-controlled **Player Access**.
