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
