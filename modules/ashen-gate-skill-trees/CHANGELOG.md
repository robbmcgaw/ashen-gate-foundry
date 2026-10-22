## 0.21.0 — 2026-10-22

Professions with several skill trees (first use: Artistry with Music, Performance, Visual Arts and Literary Arts).

- **One wallet per profession.** Profession trees with the same profession (`sourceRef`) now share one pot of points: 1 per profession level, 16 at most, however the character splits them between the trees. A pick in one tree lowers what is left in the others straight away. Unlocks, refunds, GM grants, keep, review, undo, the over-allocation check, the Character panel, the Character Hub embed and the chat notes all count the whole profession. A profession with one tree works exactly as before.
- **Shown once.** The Tree list shows such a profession once ("Artistry (4 trees)") with tabs below it for its trees (arrow keys work; the last tree you opened is remembered). The Character tab shows the shared total and how many points each tree uses. The Tree Library groups the trees under one heading with the shared wallet; the Character Hub embed shows one entry with tabs. GM review of a lowered level lists the perks from all of the profession's trees in one dialog, and the Ledger level-change note is posted once per profession.
- **No shared perks.** A perk may sit on only one tree of a profession; saving or importing a second copy is refused ("put shared perks in one tree").
- **Optional proficiency gate.** A tree can carry `access` (tool and/or skill proficiencies, any one is enough, plus a note). Players without one can still browse the tree, but its perks say "Needs … proficiency" and cannot be picked. The Profession Ledger does the check; without it (or an older Ledger) nothing is blocked. The GM is never blocked and can still grant.
- **For partner modules:** new `listTreesForProfession(sourceRef)`, `professionWallet(actorId, sourceRef)` and `embed.data(actorId)`; `pointsSummary` and `professionReport` rows of a shared profession say so. Existing results are unchanged for single trees.
- Saved data: no change and no migration. Each tree still keeps its own unlocks on the character; the shared total is worked out when needed. Profession XP, levels, points and tier thresholds are unchanged.

## 0.20.0 — 2026-10-22

UI cleanup (audit ST-01, ST-03 to ST-18). No new mechanics; tree visibility, publishing and hidden-prerequisite rules are unchanged.

- **Sidebar sub-tabs (ST-01, ST-11):** Tree and Character stay pinned at the top; below them **Perk** (the selected perk and its actions, plus Tree as a list), **Character** (points, Award points, the characters on a profession tree, History, and Reset in a "Reset this tree…" fold) and, for the GM, **Edit** (Tree settings, Appearance, Undo/Redo and the Perks list). Selecting a node opens Perk. The sub-tab and open folds are remembered per user.
- **Player preview and Edit layout** are pressed/unpressed buttons in the canvas bar, so they stay visible with the menu closed (ST-12).
- **Tree Library sub-tabs (ST-03, ST-04, ST-18):** **Trees** (search, Export all trees, New tree; each row has Open and Export) and **Checks & maintenance** (saved-data and profession perk checks, Give missing perks, the older-data moves, the progress backup and a secondary Republish player view). "Review Legacy" is now "Migrate legacy trees (n)…". GM Setup holds only Player access and Developer Tools, and shows Player access before GM storage exists (ST-16).
- **Dialogs (ST-05, ST-07, ST-09):** every form dialog has Cancel on the left. Edit properties shows Status, Visibility and Display first, with plain labels, and groups the prerequisite table by tier. Award points asks once; its button names the amount. Removals and resets use the kit's danger confirmation (Cancel is the default button).
- **Keyboard and accessibility (ST-08, ST-10, ST-17):** Connect prerequisite has a Cancel connecting button and Esc. In Edit layout, arrow keys move the focused node (Shift: 50 px) and Move node… sets an exact position. Undo/Redo are disabled when there is nothing to undo or redo. Top tabs and sub-tabs take arrow keys; focus stays on the clicked control after a re-render. Leaving GM Setup with unsaved changes asks first.
- **Kit parts (ST-06, ST-13, ST-14):** canvas banners are kit notices; the Character Hub embed uses kit badges and empty states, shows full perk text and has no button inside a summary; chat card buttons use the kit button.
- **Text (ST-15):** the settings hint and Help are up to date (Help is grouped by topic); no raw ids, status values or "(s)" plurals in the window.
- Saved data: no change. No migration. Setting keys, flags and ids are unchanged.

## 0.19.6 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.19.5 — 2026-10-22

- The Undo confirmation in a character's History no longer shows raw `<strong>` tags (or `&amp;` for names with special characters): the message is plain text, escaped once by the shared dialog helper. All other Skill Trees confirmations were checked and were already plain text.
- Saved data: no change. No migration.

## 0.19.4 — 2026-10-21

- Character Hub level-up backup copies ("<Name> - level X") no longer appear in the character picker and are refused as a target for points, unlocks, refunds, resets and partner account writes ("That is a level backup copy, not a playable character."). The embed and profession level notes skip them too. Works with or without Character Hub.
- Saved data: no change. No migration.

## 0.19.3 — 2026-10-21

- Tree board drops (GM edit mode) read the drag with the shared item-drop helper (`ag-item-drop/1`), so any normal Foundry Item drag works, including ones that don't carry plain JSON (e.g. General Manager's Browse tab).
- A folder, a missing item or a non-Item (Actor, Journal) now gives a clear warning ("Drop items one at a time.", "Drop an item.", …). The perk rules are unchanged: feat only, a `PERK-*`/`POWER-*` id, the one world Item, no duplicates.
- No change to unlocks, perk grants or saved data.

## 0.19.2 — 2026-10-21

- Repo check only: the Tree appearance window (a custom dialog with the kit classes) is marked as allowed for the stricter UI lint, and the board-size CSS exemptions now give a full reason.
- No behaviour or saved-data changes.

## 0.19.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- Screen-reader labels use the kit helper (no local copy).
- No behaviour or saved-data changes.

## 0.19.0 — 2026-10-21

- UI standard look: "Ashen Gate | Skill Trees" header with a muted version and Help, kit tabs (Tree Library and GM Setup marked GM, last), kit cards, empty states, notices and dialog fields; tokens for every size so Comfortable grows the window and text.
- Perk nodes show their whole name: the box keeps its width and grows taller, and the arrows follow the real border. Hovering a node shows one tooltip (the corner card), no browser title.
- Zoom buttons are icons (reset zoom is the ↺ icon). Button hover text uses Foundry tooltips.
- Tree Library: a toolbar with search, a count and New tree on the right, and a list of the trees with status, visibility and Open.
- GM Setup: Player Access is a checkbox saved with Save Changes (Cancel drops the change). Import Ledger perk choices and the legacy v0.1 tools move to their own "Data tools" card; Developer Tools at the bottom keeps only the QA install and reset. No saved data or setting keys change.

## 0.18.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- Reset tree, Remove node, Refund, Undo and Remove test records use a red action button. GM Setup no longer says "Alpha release"; the empty tree list says "No trees yet. Create one with New tree." Tree appearance gets a Cancel button.

## 0.18.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.

## 0.17.1 — 2026-10-21

- **Cinder point cap is now 16** (was 13). A `cinder_milestone` tree's wallet holds up to 16 lifetime points. Tree View shows "Cinder • 16-point milestone wallet", New tree and Award say 16.
- **Saved and old trees:** nothing is rewritten. A tree saved or imported with `maxPoints: 13` still loads, validates and works; it reads as 16. Import accepts 13 or 16 for a Cinder tree (16 is the default); any other number is refused. Points already awarded are unchanged.
- Starting points and GM awards (one point per uniquely labelled milestone) are unchanged.

## 0.17.0 — 2026-10-21

- **Strain, Cinder instances, Push and Backfire moved to the new module Ashen Gate | Cinders** (`ashen-gate-cinders` 0.1.0). Install it alongside this version, and update both together: Cinders 0.1.0 refuses to start next to Skill Trees 0.15.0/0.16.0. The Cinders tab, the Push section and GM Setup → Strain are gone from this window; they are in the Cinders window now. `api.strain` and `api.cinder` are removed from Skill Trees.
- Skill Trees keeps the Cinder trees themselves: `cinder_milestone` trees with POWER-* nodes, the 13-point wallet, points and unlocks.
- **New `api.accounts`** (contract `ag-tree-accounts/1`) for partner modules: `treeBySource`, `account`, `setAccount` (keeps perk Items in step, never duplicating), `grants`, `legacyData`.
  - New hooks: `ashenGateSkillTrees.progressChanged` after every account write, and `ashenGateSkillTrees.checkProgress`, which lets a partner refuse points or an unlock with a reason. For example, Cinders allows only a Cinder's bearer to gain progress on its tree.
  - Skill Trees names no partner and works the same without one.
- **Saved data:** nothing is rewritten. Anything 0.15.0/0.16.0 saved (Strain config, Cinder records, bearer pointers) stays where it was, readable through `api.accounts.legacyData()`. Ashen Gate | Cinders adopts it once (re-runnable). Strain on characters (`flags.ashen-gate-strain`) was never Skill Trees' data and is unchanged.

## 0.16.0 — 2026-10-21

Cinders: each Cinder keeps its own progress and moves between bearers; Push and Backfire.
- **Cinder instances.** A Cinder is now a thing of its own, made from a Cinder (MUT-*) definition. It keeps its points and unlocked powers wherever it goes. New GM-only **Cinders** tab: **New Cinder**, **Bind**, **Transfer**, **Unbind**, and a **Check** with **Repair**.
  - A bearer cannot release a Cinder; only the GM binds, transfers or unbinds it. One bearer per Cinder; a character bears at most **Cinders per character** (setting, default 1) and never two of the same kind.
  - The first time a Cinder is bound it gets **Starting Cinder points** (setting, default 1), once per Cinder. A transferred Cinder keeps its points and powers and gets no new starting point.
  - **Transfer** gives the new bearer the Cinder's power Items (never duplicates), then removes them from the previous bearer. Strain and Backfire conditions stay with the previous bearer.
  - A deleted bearer leaves the Cinder **Lost** with all its progress; bind it again any time.
  - The bearer's copy of the progress stays where the tree window reads it, so the tree, points and unlocks work as before. Once a Cinder of a kind exists, only its bearer can gain points or unlocks on that tree.
- **Move existing Cinder progress** (Cinders tab, shown when there is any): turns each character's Cinder tree progress from before 0.16.0 into a Cinder bound to that character. It shows what it will do first. It keeps the Items, adds no starting point and is safe to run again. Until it runs, those trees work as before.
- **Push.** Select an unlocked Cinder power in the tree: the **Push** section lists the Push modes it has now, with the Strain cost and Backfire chance. Push confirms first; the GM client then does the rest:
  - every Push gains Strain (at least 1), and the Backfire chance uses the Strain after the gain;
  - on a Backfire it rolls the **category** (one of the Backfire tables for that power), then the **effect** on that table, mildest first. Higher Strain adds to the effect roll (default +1 at Strain 5, +1 more every 2 Strain; Strain config `effect_roll.strain_bonus`). Perk severity modifiers add on top;
  - one chat card shows everything. If the effect names a dnd5e status with a duration, it is applied; otherwise the GM adjudicates from the card. A player's Push is rolled and recorded by the GM client (a GM must be logged in).
  - If the Strain change can't be saved, the Push doesn't happen at all.
- **Normal use at Strain 10+.** Using a Cinder power (dnd5e activity) at or above `normal_use_backfire_at` (10) backfires automatically. It adds no Strain, and the use itself is never blocked.
- **Never lethal.** Backfire effects are temporary statuses only. Dead, unconscious, exhaustion, petrified, sleeping and HP changes are refused by the definition check and by the engine. Backfire never deletes a character or a Cinder or takes its progress.
- **Perk modifiers** (on POWER-* definitions): `push.cost`, `backfire.chance`, `backfire.severity`, `strain.recovery`. They are added together; modifiers sharing a `stack` name count only the strongest. A perk opens a new Push mode by being listed in that mode's `requires.powers`. `strain.recovery` adds to a rest that already recovers Strain.
- New API `api.cinder` (contract `ag-cinder/1`), hook `ashenGateCinder.changed`. Strain config gains `effect_roll`. See the README.
- **Saved data:** additive. Cinders are stored in the GM-only definitions Journal (flag `cinders`). Bearers get `flags.ashen-gate-skill-trees.cinders` pointers. Nothing existing is rewritten until the GM runs Move existing Cinder progress.

## 0.15.0 — 2026-10-21

- **New: Strain**, one shared number per character, kept as a separate part of Skill Trees. Its data is saved on the Actor under its own flag name (`flags.ashen-gate-strain.state`), not the Skill Trees one, so it can become its own module later without changing saved data.
- **New API `api.strain`** (contract `ag-strain/1`), the single way for any module (crafting, hazards, items, spells, rests) to change Strain: `get`, `history`, `add`, `remove`, `set`, `config`, plus GM-only `previewConfigImport`, `importConfig` and `resetConfig`. Every change needs a source and a reason and goes into a short history (last 30). A change sent twice with the same `opId` only counts once. Writes run on a GM client only; players can read their own characters' Strain. Hook `ashenGateStrain.changed` fires on every client. See the README.
- **Bands and Backfire chance** come from a Strain config: the default schedule 0/5/10/20/25/35/50/60/75/90/100% for Strain 0–10, guaranteed from 10, neutral band names (`Band 0`–`Band 6`), no maximum (Strain can go past 10). Campaign band names arrive by importing a config file (`ag-strain-config/0.1`).
- **Rest recovery:** a long rest removes 1 Strain and a short rest 0 (both in the config). It is taken from dnd5e's rest chat message, once per rest.
- **GM Setup → Strain** shows the bands, chances and rules, with Import / Export / Reset to Defaults for the config. It never changes character Strain.
- Cinder Push and Backfire are not in this version. No existing saved data changes; no migration needed.

## 0.14.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a compact list of a character's trees: points, Available now perks with a real **Unlock**, Unlocked perks, Locked perks with the reason, and Open tree. Returns `{unmount, refresh}` and refreshes itself on changes. See the README.
- Unlock goes through the same confirm and checks as the window (players' unlocks are done by the GM client). Players see the published trees only. The full graph and GM tools stay in the window.
- The Skill Trees window is unchanged. No saved data changes.

## 0.13.0 — 2026-10-20

- **New read-only API `pointsSummary(actor)`** for partner modules (Character Hub): `[{treeId, name, kind, level, earned, spent, available}]`, one row per tree the caller can see. Profession trees earn 1 point per Profession Ledger level (`null` when the Ledger is unavailable); other trees earn GM-awarded points.
- GM or the Actor's owner only; anyone else is refused (`Actor access denied`), and players are refused while Skill Trees Player Access is off. Additive only: no saved data changes.

## 0.12.0 — 2026-10-19

Review, undo and older Ledger perk choices for profession trees.
- **Review** (GM): when a lower profession level leaves perks above it, click **Review** on the tree's banner or in the GM's whisper. One dialog lists the flagged perks, each with **Keep** (preselected) or **Remove**, plus an optional reason. Removals happen in dependency order. If removing a perk would leave a kept perk without its prerequisite, nothing changes and the dialog says which perk.
- **Undo** (GM): each pick, GM grant, removal and keep in a character's **History** has an **Undo** button. A removed perk comes back exactly as it was on the sheet (uses, edits) when its data was kept (the last 10 removals), otherwise as a fresh copy. Undo refuses when the tree changed underneath or the change was already undone.
- **Import Ledger perk choices** (GM Setup → Developer Tools): finds perks saved as chosen in older Profession Ledger data and shows what would happen first. On confirm it allocates them on the matching profession tree. A perk Item already on the sheet is linked, not copied again. Unknown perks are left alone. The Ledger's own record is not changed. Safe to run again. Characters this leaves above their level are flagged for review.
- New API: `resolve`, `undo`, `importLedgerPerkChoices`. History entries now carry an `id`. No other saved-data change.

## 0.11.0 — 2026-10-19

Profession trees now work. The Profession Ledger owns XP and level; Skill Trees owns which perks are picked and the perk Items.
- **Points from the Ledger level:** 1 point per profession level, level 1 included (level 16 = 16 points). A profession tree has 24 perks, so a character picks 16. Every profession perk costs 1 point (a perk's own point cost is ignored here). The sidebar shows *x of y points used · 24 perks in this tree*.
- **Level gates:** each perk needs the level of its tier: Apprentice 1, Journeyman 4, Expert 7, Artisan 10, Master 13. A node's own minimum level can raise this, never lower it. Prerequisites and exclusions work as on other trees.
- **Players pick their own** perks while a GM is logged in. The GM client checks the level, points and prerequisites and adds the perk Item. There is no approval step. Players cannot undo a pick.
- **GM controls** (select a profession tree):
  - A **Characters** list shows every character on that tree: level, points used, and *Needs review* or *n to choose*. Click a name to switch to that character.
  - **Remove (point returned):** takes the perk off the sheet, with an optional reason.
  - **Grant (GM override):** gives a perk whatever the points, level or prerequisites. A reason is required.
  - **Keep at this level:** keeps a perk the level no longer covers.
  - **History:** each character's last 50 picks, removals, grants and keeps, with who and why.
- **Lowering the level never removes anything.** If perks are left above the level, or more points are used than the level gives, the character is flagged. The GM gets a whisper with a **Review** button, the tree shows a banner, and the player cannot pick again until the GM keeps or removes them. Kept perks still use their points. If the level drops below the kept level, the character is flagged again.
- **Level up:** the owner gets a whisper, *n perks to choose in <tree>*, with an **Open Skill Tree** button.
- **Tree Library → Profession perk check:** a read-only report per character. It lists over-spent points, perks above the level, missing or duplicate perk Items, orphan Items, broken prerequisites and an inactive Ledger, with an **Open** button for each character.
- If the Profession Ledger (0.14.0+) is off or missing, profession trees still open and say points are unavailable. Nothing is removed. Cinder and generic trees are unchanged.
- **Saved data:** additive only. Each character's tree record gains `kept` and `history` (older records read as empty). No migration is needed.
- New API: `overrideGrant`, `keep`, `professionReport`, `reconcileProfessions`. `refund` takes an optional `{reason}`.

## 0.10.1 — 2026-10-19

- If the automatic player-view publish fails after a world perk Item changes, the GM now gets an error notification (once, until a publish works again) instead of a console-only error. Players keep seeing the previous trees until **Tree Library → Publish Player View** succeeds.
- No saved-data or permission changes.

## 0.10.0 — 2026-10-19

- New GM-only **Tree Library** tab: New Tree, Export Selected / All Trees, Saved data check, **Give Missing Perks**, Publish Player View and Backup Actor Tree Progress. All work as before.
- **GM Setup** now holds settings only: Player Access (plus Initialize GM Storage on a fresh world) and the Developer Tools (QA fixtures, legacy review).
- No saved-data changes. Player views, import APIs and permissions are unchanged.

## 0.9.0 — 2026-10-19

- **New layout.** The window is two panes: a collapsible sidebar (tree and character pickers, points, Player Preview / Edit Layout, the selected perk with its actions, the Perks list, Tree as a list) and a tall canvas that scrolls and zooms (Ctrl + mouse wheel, drag empty canvas to pan). On narrow windows the sidebar becomes a drawer opened with **Menu**. Scroll position is kept when you click a node. Every existing function is unchanged.
- **Smaller nodes.** Compact is the new default (names wrap to two lines; the full name is in the tooltip). Each tree can switch to Normal in **Edit Layout → Appearance**.
- **Corner tooltip.** Hover or Tab to a node, or select it: a small card in the top-right of the canvas shows name, cost, short text, prerequisites and Locked / Available / Unlocked. Press Enter or Space to select a focused node.
- **Level / tier bands.** In Appearance a GM can add bands (level, optional name, where it starts) with an optional icon picked with the Foundry file browser; the icon shows behind the level badge, with a built-in icon when empty. Players see them.
- **Canvas background.** Appearance also sets a background image (Cover, Tile or Fixed) with an opacity slider. If the file is missing the canvas simply shows no image.
- Saved data: three optional, additive tree fields (`nodeSize`, `background`, `tiers`); nothing existing is rewritten. Images must be local files or https addresses on The Forge (assets.forge-vtt.com or another *.forge-vtt.com host), as png, jpg, webp, gif, svg or avif; every other address and anything unsafe is dropped on save, import and publish. Players' view carries the same three fields.

## 0.8.1 — 2026-10-19

- Importing trees through General Manager no longer needs a manual "Initialize GM Storage" first. The import creates the module's own GM-only definitions Journal (no player access) when it is missing and says so in the result. Nothing else about storage changed; the GM Setup button still works.

## 0.8.0 — 2026-10-19

- Every node is now a world perk (`PERK-*`, or `POWER-*` on Cinder trees). Name, text, picture and point cost come from the perk. Add perks by dragging them from the Items sidebar or the Perks list, or with **Add**. **Assign Perk** turns an older custom node into a perk node. No more custom nodes.
- Unlocking adds the perk to the character sheet (a tagged copy, never twice). Players unlock their own characters while a GM is logged in; the GM client checks and writes. GM **Refund** and **Reset Tree** give points back and remove the perk from the sheet. A perk missing from the world is reported and nothing is unlocked. Profession trees stay read-only (the Ledger owns them).
- Clearer graph: arrows from prerequisite to the perk it opens (they follow nodes while you drag), dashed OR arrows, red ✕ exclusion lines, a legend, and the same information as text in the inspector and **Tree as a list**. Prerequisites, OR groups and exclusions are set in a table in Edit Properties.
- Removed Skill Trees' own Import Tree Layout JSON button (it did nothing: the window re-rendered right after opening the file picker, which dropped the file listener). Import tree files through General Manager. Export buttons stay for backups. Tree files are now `ag-skill-trees/0.3`; 0.2 files still import.
- **GM Setup → Saved data check** lists custom nodes and perks missing from the world; **Give Missing Perks** adds Items for unlocks made earlier. Saved trees and Actor progress are read as they are; nothing is rewritten or dropped.

## 0.7.0 — 2026-10-19

- New GM-only, UI-less `api.previewTreeImport(pack, {mode})` and `api.importTrees(pack, {mode})` so General Manager's single importer can hand tree layouts over. New trees are created; existing ones are kept (or, with mode `update`, replaced; purchased nodes stay protected). Actor progress is never touched.

## 0.6.3 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.6.5 — 2026-10-19

- Actors sidebar launcher joins the shared two-column grid in the fixed order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.6.4 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.6.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.6.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## v0.6.0 Alpha — 2026-10-17 (local, unpublished)

- AG-WORK-0011 + FB-2026-10-16-001: Actors launch button joins single shared launcher shelf, consistent direct-child module/order metadata (rank 30), with idempotent same-group sorting and Player Access protection.
- FB-2026-10-16-003 / AG-FOUNDRY-DEV/1.7: compact Player Access control and GM Setup actions, medium startup window and width-responsive canvas/inspector.
- Replace GM-only Add Demo Trees action with Install QA Fixture Records / Reset QA Fixture, creating tagged real Foundry Actor/Item/Journal-backed tree records and preventing cleanup of progress owned by unrelated Actors; existing demos and Actor data remain unchanged.
- Prevent disabled-perk-action confusion: `PERK-*` linked nodes cannot show an enabled generic-wallet Record Unlock button.
- Drop stale closed-window singleton for clean reopen. Release v0.6.0 because installable source/UI/features changed.
- 61/61 local Node tests passed; live Foundry not run; no GitHub commit.

## v0.6.0 Alpha — 2026-10-17 (local, unpublished)

- AG-WORK-0011 + FB-2026-10-16-001: Actors launch button joins single shared launcher shelf, consistent direct-child module/order metadata (rank 30), with idempotent same-group sorting and Player Access protection.
- FB-2026-10-16-003 / AG-FOUNDRY-DEV/1.7: compact Player Access control and GM Setup actions, medium startup window and width-responsive canvas/inspector.
- Replace GM-only Add Demo Trees action with Install QA Fixture Records / Reset QA Fixture, creating tagged real Foundry Actor/Item/Journal-backed tree records and preventing cleanup of progress owned by unrelated Actors; existing demos and Actor data remain unchanged.
- Prevent disabled-perk-action confusion: `PERK-*` linked nodes cannot show an enabled generic-wallet Record Unlock button.
- Drop stale closed-window singleton for clean reopen. Release v0.6.0 because installable source/UI/features changed.
- 61/61 local Node tests passed; live Foundry not run; no GitHub commit.

# Changelog

## v0.5.1 — AG-WORK-0013 consumer permission hardening (2026-10-16)

- Ignore caller-supplied viewer in world-native definition lookups; use Foundry `game.user`. Opaque `not_found` for non-GM duplicate/type/version/lifecycle failures.
- Permit `publicForAll` only for the real GM; Observer callback errors fail closed; exact `expectedVersion` supported for GM diagnostics.
- 5 targeted local consumer regressions; 52/52 existing-plus-new tests pass. No mutable state change, compendium adapter not yet integrated, no live Foundry test.


## v0.5.0 — AG-WORK-0011 / 0016 implementation (2026-10-16)

**Scope:** AG-WORK-0011 (Foundry Tooling) and AG-WORK-0016 (shared UI reference).

**Verified source baseline:** the actual prior ZIP in this conversation; Work Queue compatibility-report version numbers were not installable source releases.

**New:** temporary read-only canonical source-ID lookup of active native world documents; strict duplicate/archive and player access handling; a provenance-preserving, fail-closed check for imported materials and perks; Actors launcher rank cooperation; baseline --ag-* CSS token fallbacks.

**Specific authority safeguard:** Skill Trees cannot purchase Profession PERK-* using Cinder/generic tree points; Profession selection remains Ledger-owned until the Tim source contract is tested.

**Missing in this Alpha:** live Foundry 14 tests; Tim/Manager round-trip for structured Recipe/Perk data; compendium lookup; approved resolver provider version; full live Manager skin subscription. These are NOT claimed implemented.

**State migration:** none; existing settings and Actor flags are unchanged. No automatic grants or source reimports.

**Versioning:** first actual installable successor to the confirmed release, not a repackage of a claimed nonexistent 0.6.0/0.5.0 checkpoint.




## v0.4.0 — Player Access contract (DEC-0072; 2026-10-15)

- Adds independently registered GM-restricted world Boolean setting `playerAccessEnabled` and optional interoperability API `game.modules.get('ashen-gate-skill-trees').api.playerAccess`: `contract: ag-player-access/1`, `getState()`, `setEnabled(boolean)`.
- **Existing-player-interface upgrade default: Visible**. The setting begins `true` if it did not previously exist; a GM may switch to Hidden locally in GM Setup / Module Settings or centrally from a Manager supporting the contract.
- Hidden removes the Actors launcher for non-GMs, closes rendered player windows on setting sync, and rejects public opening paths (including macro/API and direct app renders); re-enabling restores the button. GMs remain able to open and administer the module. Player permissions, record visibility and role controls still apply when Visible.
- Does not remove, migrate, reset, regrant or disable stored progression, owned Features, Items, recipes, tree layouts, gathering awards or ordinary Foundry effects. No gameplay balance or canonical schemas altered.
- Local UI enhancement: real GM Setup Player Access status + Hide/Show button, independent of Manager. Sensitive tool buttons remain separately GM-only.
- Implements approved DEC-0072 with `foundry/integration/PLAYER_ACCESS_CONTRACT.md` and Foundry development standard AG-FOUNDRY-DEV/1.4 at GitHub `7cc5895eef480e0f6e3b62db4ab07d9e91616b5e`; `foundry.folder_path` remains Manager/content-author responsibility.
- Automated tests: **30 passed; zero failed**. No live Foundry V14 or multi-client test, no UI screenshots. The manager's centralized panel is a **separate build** and must be tested after Borris releases it.
## 0.3.0 — Shared UI/development-standard alignment (2026-10-15)

- Follow AG-FOUNDRY-DEV/1.3, DEC-0068–0071: versioned Ashen Gate window identity, fixed top-level `Skill Trees | GM Setup` navigation and clearer player/GM boundaries.
- Move import, export, public publication and backup actions to GM Setup; put demos and legacy migration in a GM-only, explicitly experimental Developer Tools area.
- Preserve accessible player Actors sidebar launcher, GM-guarded operations, canonical source namespace checks and Foundry's separate Item/Journal folder ownership.
- Keep layout wire format `ag-skill-trees/0.2`, private GM Journal and Actor `progressV2` unchanged. No migration, rewards, or Profession XP authority shift.
- Add version/audience/layout checks to local automated tests. Full Foundry V14 GM/player click-through and screenshots remain pending.

## 0.2.1 — Archie cross-contract safeguards (2026-10-15)

- Enforce Profession `PERK-*` and Cinder `POWER-*` Feature bindings; `HPERK-*` stays with Hirelings (DEC-0062/0063).
- Reject wrong-domain Feature drag/drop and layout JSON imports; preserve legacy POWER references using `unlocks_perk` with a warning.
- Keep canonical `ag-source-package/0.1` and generated Manager `ag-foundry-import/0.2` files separate from Skill Trees `ag-skill-trees/0.2` layouts (DEC-0067).
- Retain Actor progress flags and GM private layouts unchanged.

## 0.2.0 — Visual multi-system prototype (2026-10-15)

- Keep module ID `ashen-gate-skill-trees`; do not automatically modify v0.1 Actor flags or TheRipper Journals.
- Split private GM-owned graph definitions from redacted player world projections.
- Add GM tree editing (drop imported Features, drag nodes, connect prerequisites, OR/AND/exclusions, undo/redo, import/export).
- Replace old sequential-stage assumption with DAG-based prerequisite validation.
- Add capped (13 lifetime) Cinder milestone wallets and separate configurable generic wallets; GM-managed point awards and unlocks.
- Replace player purchase with private GM request pending an authoritative server-side authorization flow.
- Keep Profession trees read-only pending Tim/Ledger adapter; disable implicit Feature granting and experimental XP purchases.
- Add legacy v0.1 hidden-draft migration preview and GM backup+clear for legacy world settings.

**Not included:** real Cinder/Profession content, World Item grants, secure self-spend, battle-tested multiplayer permission or item rewards, automated actual Foundry V14 verification.
