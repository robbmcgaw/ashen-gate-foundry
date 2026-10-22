# UI audit, October 2026

A QA pass over every Ashen Gate window: crowding, navigation, consistency with the shared shell, and accessibility, checked
against CLAUDE.md's UI conventions and the checklist in [ui-ux-guidelines.md](ui-ux-guidelines.md).

- **Audited at:** `main` @ `8931b9d`. Versions: Manager 0.45.1, Character Hub 0.32.0, Locations 0.18.0, Utilities 0.25.0,
  Profession Ledger 0.25.0, Headquarters 0.12.1, Quest Log 0.16.0, Skill Trees 0.19.4, Cinders 0.10.0, Renown 0.14.0.
- **Method:** reading the code, templates and CSS of each module. `node scripts/ui-lint.mjs` passes for every module.
  **Nothing here was checked in a live Foundry world**; items marked *(verify in Forge)* depend on how a window actually
  renders. File:line references point at `8931b9d` and drift as the code changes.
- **Priority:** **P1** hurts daily use, breaks an explicit CLAUDE.md rule, or blocks keyboard use. **P2** is noticeable
  friction or inconsistency. **P3** is polish.
- **Size:** **S** under an hour in one file. **M** one window. **L** a restructure across windows.
- **IDs** are prefixed by module: `GM-` Manager, `CH-` Character Hub, `LOC-` Locations, `UT-` Utilities, `PL-` Profession
  Ledger, `HQ-` Headquarters, `QL-`/`QJ-` Quest Log and its Journal tab, `ST-` Skill Trees, `CN-` Cinders, `FR-` Renown.
- **Permissions:** in every module, each GM-only action traced was refused in the API or data layer, not just hidden. No
  UI-only permission gaps were found.

## Summary

| Module | P1 | P2 | P3 | Total | Shape of the problems |
|---|---|---|---|---|---|
| General Manager | 5 | 14 | 12 | 31 | Filter wall in Items; NPC Codex buried in the Items rail; hand-rolled copies of kit parts that skins don't reach |
| Character Hub | 4 | 9 | 15 | 28 | Crowded headers (Full and Compact); focus lost on re-render; icon-only tab rail; its own appearance system |
| Locations | 3 | 9 | 16 | 28 | Links the keyboard can't reach; 17-card editor scroll; 16-control toolbar; mixed save models |
| Utilities | 3 | 15 | 16 | 34 | Long shop editor; segmented controls used as tabs; permanent empty "Shop editor" tab |
| Profession Ledger | 2 | 5 | 6 | 13 | **Craft dialog ignores the chosen check (bug)**; crowded GM Gathering tab |
| Headquarters | 2 | 7 | 6 | 15 | Board is mouse-only; GM Setup holds actions; unsaved GM Setup lost on tab switch |
| Quest Log | 1 | 9 | 13 | 23 | Location links unreachable by keyboard; three control bars before the first quest; cramped two-page journal |
| Skill Trees | 1 | 7 | 10 | 18 | Perk inspector buried at the bottom of the sidebar; GM Setup holds data tools; dialogs without Cancel |
| Cinders | 0 | 6 | 6 | 12 | Long Manage and GM Setup pages; Repair unconfirmed; four settings still in Configure Settings |
| Renown | 4 | 6 | 5 | 15 | **Unsaved faction/deity edits silently lost**; Organizations listed twice with editors below the list; requests scattered |
| **Suite** | **25** | **87** | **105** | **217** | |

Most modules already get the basics right: the header layout, labelled confirmations, Cancel-left/primary-right footers,
GM-only tabs marked and last, reduced-motion guards, and GM checks in the data layer.

## Top 10 findings

1. **PL-01 · P1 · S: bug.** Profession Ledger's craft dialog always rolls the preset check. The Craft button's callback
   returns only `{mode}` (`scripts/main.js:822`), so the player's choice in "Check (bonus)" is ignored. Confirmed on `main`.
2. **FR-02 · P1 · M: data loss.** In Renown, buttons inside the faction and deity forms (Reveal to party, Toggle, Add,
   Remove, the relation sliders) save at once and re-render, which throws away anything typed but not yet saved.
3. **Keyboard can't reach primary navigation · P1 · S each.** Clickable `<a data-action>` with no `href` (and hidden file
   inputs) in four modules: Locations' place/quest/document/route links (LOC-A11Y-01), Quest Log's location links in the
   log and the Hub embed (QL-01), Manager's Import file picker (GM-A11-01) and the player NPC Codex deity links
   (GM-A11-02).
4. **HQ-01 · P1 · M.** Headquarters' board tiles and decorations are mouse-only `div`s and placement is drag-only, so
   keyboard users can't select, rotate, uninstall or upgrade anything.
5. **LOC-CR-01 · P1 · L.** The Locations GM editor is one scroll of about 17 cards, with settings above the description and
   Party Notes (with a second Save/Cancel pair) at the bottom.
6. **FR-01 · P1 · L.** Renown → Organizations lists every organization twice (rail and roster), and the selected one's seven
   editors sit below the whole roster.
7. **UT-01/02/03 · P1 · M.** Utilities' shop editor is one long page with a 7-column table that scrolls sideways; Shops
   sub-tabs use a segmented control; "Shop editor" is a permanent sub-tab that is empty until something is opened.
8. **GM-CR-01 + GM-NV-01 · P1 · M/L.** Manager → Items → All items stacks about 22 filter controls before the first result,
   and the NPC Codex (a session tool) is the eighth icon of the Items rail, under filters that don't apply to it.
9. **ST-01 · P1 · M.** In Skill Trees, after clicking a perk the GM scrolls past points, roster, history and GM tools to reach
   its details and Unlock/Refund.
10. **CH-02 · P1 · M.** Character Hub drops keyboard focus to the top of the document on every button click that redraws
    (tabs, chips, slot menus, conditions); popovers don't take or return focus.

Next in line: FR-03 (player requests only visible inside each faction or deity), PL-02 (crowded GM Gathering tab), CH-04
(Compact header wraps to 2–3 rows in a 500px window), LOC-CR-02 (16-control toolbar), HQ-02 (GM Setup holds Create rooms
and Set Rank).

## Patterns across the suite

These show up in several modules. Fixing them once (mostly in the kit) is cheaper than ten times.

| Pattern | Where | Guideline | Fix |
|---|---|---|---|
| Clickable elements that aren't controls (`<a>` without `href`, `div`/`span` with `data-action`, `display:none` file inputs) | LOC-A11Y-01, QL-01, GM-A11-01/02/03, HQ-01, CN-10, CH-11/12 | §9.1–9.2 | `.ag-link` buttons and `fileButton()` *(kit 2.2)* |
| Editor rendered below a whole list, or a single long editor | LOC-CR-01, FR-01, FR-04, UT-01, PL-03, GM-CR-03/04, ST-01, CN-01/02, QL-02 | §3.3, §2.5 | `.ag-split` or list↔editor swap; editor sub-tabs under one footer |
| Toolbars with too many controls; results pushed down | GM-CR-01, LOC-CR-02, QL-05, CH-07, UT-17 | §5.1–5.2 | One row plus **Filters (n)** |
| Instant-save controls inside draft forms; edits lost on re-render or tab switch | FR-02, FR-05, LOC-NAV-01/02/03, UT-10, QL-02, GM-CO-03, GM-A11-07, HQ-03, QL-14 | §6.6–6.9 | `guardDirty()` and "Applies now" *(kit 2.2)* |
| GM Setup holding actions, content or preferences; settings outside GM Setup | HQ-02, ST-03, FR-06, QL-03, UT-07, CN-03, GM-NV-06 | §6.1–6.3 | Move to the content tab, a Maintenance sub-tab, or Developer Tools |
| Segmented controls used as navigation; two sub-tab styles | UT-02, GM-NV-03, PL-02, QJ-02 | §2.5–2.6 | `.ag-tabs--sub` *(kit 2.2)* |
| Tabs with `role="tab"` but no arrow keys or `aria-controls` | GM-A11-05, CH-20, UT-29b, PL-10, HQ-13, LOC-A11Y-07, QJ-04 | §2.7, §9.10 | `bindTablist()` *(kit 2.2)* |
| Hand-rolled copies of kit parts (rows, kv, rail, split, meter, banner, cards) | GM-CO-01, CH-16, UT-12/13/32, PL-08, HQ-11, LOC-CMP-03/05, ST-06/13, CN-05 | §14 | Swap to kit classes; skins then reach them |
| Status shown by colour or by `aria-label` on a bare icon | LOC-A11Y-02/03, CH-28, HQ-12, GM-CO-05 | §9.4–9.5 | `.ag-sr-only` text plus icon |
| Danger confirmations default to the destructive button | all 81 `danger: true` confirmations | §7.6 | `confirmDialog` default flips to Cancel *(kit 2.2)* |
| Skin tokens copied onto content per render | GM-CO-04 (Locations, Character Hub) | §13.3 | Drop the per-render `applyTo` calls |
| Names that differ between launcher, header, tabs and Help | LOC-NAV-05, QL-08, CH-05, CH-10, FR-08, FR-12 | §2.10, §12.7 | One name each (some need Robb) |
| Second importers next to Manager's | PL-05, HQ-07, QL-13 | CLAUDE.md "Ownership" | Robb to decide |

## Recommended order

1. **Now, as standalone patches** (bugs, no design questions): **PL-01** (Ledger craft check) and **ST-02** (Skill Trees
   Undo confirmation shows raw `<strong>` tags).
2. **Kit 2.2** in one PR across all ten modules (patch bump each): the additions in
   [ui-ux-guidelines.md §15](ui-ux-guidelines.md#15-kit-gaps-proposed-kit-22). Everything below gets easier with
   `.ag-tabs--sub`, `bindTablist`, `.ag-fold`, `fileButton`, `.ag-link` and `guardDirty`.
3. **Then one Build chat per module**, each running its own Release A (patch: fixes, a11y), B and C (minor: layout) from its
   section below, in this order:
   1. **Renown**: silent data loss (FR-02), then the Organizations and Pantheon restructure.
   2. **Locations**: player-facing keyboard links, then the editor and toolbar.
   3. **General Manager**: keyboard import, Codex as its own tab, Items sub-tabs; it also settles the appearance questions the
      Hub depends on.
   4. **Utilities**: shop editor and Shops navigation.
   5. **Profession Ledger**: Gathering and Gathering Nodes layout (the bug ships in step 1).
   6. **Headquarters**: needs Robb's decision on HQ-02 and the keyboard Install rule (HQ-01) first.
   7. **Skill Trees**: sidebar sub-tabs, Library/GM Setup split.
   8. **Quest Log**: toolbar and header cleanup, Journal page width.
   9. **Cinders**: Manage and GM Setup sub-tabs.
   10. **Character Hub**: last, because its Release B waits on three decisions (CH-01, CH-05, CH-06). Its Release A can go
       any time.

## Decisions for Robb

| # | Question | Findings | Recommendation |
|---|---|---|---|
| 1 | Character Hub keeps its icon-only right-hand rail (an exception to "tabs below the header"), or moves to a labelled tab strip? | CH-01, CH-10 | Labelled tab strip at the top of the content; if you keep the rail, give it visible short labels and list it as an exception in CLAUDE.md |
| 2 | Character Hub's own Dark/Light and density settings when Manager is absent (added in 0.31.0) vs "Manager owns appearance" | CH-06 | Without Manager, render the kit default; leave the settings registered but unused |
| 3 | A new name for Hub's narrow "Compact" view, so "Compact" only means density | CH-05 | "Mini view" |
| 4 | Headquarters: move **Create Missing Player Rooms** to Personal Quarters and **Guild Rank / Set Rank** out of GM Setup (tests encode the current place) | HQ-02 | Move both, Set Rank behind a labelled confirmation |
| 5 | Second importers next to Manager's: Ledger recipe/material JSON, Headquarters facility definitions, Quest Log quest import | PL-05, HQ-07, QL-13 | Replace with an "Open General Manager" button, or move into Developer Tools |
| 6 | Quick actions that change a GM Setup setting from another tab (Utilities stash On/Off toggle, Revoke controller) | UT-07 | Stash toggle becomes a read-only badge; Revoke stays as a confirmed quick action |
| 7 | One term: "Organization" or "Faction" in Renown; "Player" tab renamed "Character" | FR-08, FR-12 | Your call on the word; "Character" for the tab |
| 8 | One name for Quest Log (module title says "Quest Manager", window "Quest Log", launcher "Quests") and for its tab ("Journal" vs "Game Journal") | QL-08 | "Quest Log" and "Journal" |
| 9 | Keyboard alternatives for drag and drop (stash deposit, shop items, HQ install placement, Skill Trees node moves) add small behaviour | UT-31, HQ-01, ST-17 | Yes; for HQ install, place at the first free spot and move with nudge buttons |
| 10 | Renown's demo seed uses setting-flavoured names in this public repo | FR-09 | Replace with `[TEST]` records (the CLAUDE.md rule; just confirming) |
| 11 | Label casing: sentence case everywhere ("New location"), keeping **Save Changes** as is? | guidelines §12.3 | Yes |
| 12 | Saving throws shown twice in the Hub (ability tiles and Overview) | CH-15 | Keep the Overview list, drop the tile line, or leave as is |

---

## Per-module findings and briefs

Each section below is a self-contained brief for a per-module Build chat: inventory, findings, and releases with what to
click in Forge. Before starting, re-check line numbers against the current `main`, follow CLAUDE.md's versioning rules, and
tell Robb that tests prove logic, not the live UI.

Read-only audit of current main (8931b9d), checked against CLAUDE.md "UI conventions (shared shell)" and "Module rules worth keeping". Cinders was re-checked at 0.10.0; Renown is unchanged at 0.14.0. Tests prove logic only, and nothing here was checked in a live Forge world.

---

### ashen-gate-cinders (v0.10.0)

#### Window inventory

| Window / surface | Tabs / sections (exact labels) | Who | Location |
|---|---|---|---|
| **Cinders window** `CindersApp` (760×680, resizable) | Header `Ashen Gate \| Cinders`, `v0.10.0`, `Help` | GM, plus players when Player Access is on | `scripts/main.mjs:206`, `templates/cinders.hbs:1` |
| ├ Tab **Cinders** | Toolbar: a `Character` select, plus a `Cinder` select when there are several. Stage column: the orb (Strain ring, sockets on the orbit, `Locked by the GM` badge) and the legend `Strain x / y · Sockets n of m`. Then a device checkbox `Rotate the art on this device`. Then the **Signature ability / Passive** box (name, summary, read-only `Push on use: …`) with the device checkbox `Offer a Push when I use the signature ability on this device`. Then inactive-socket chips and the `Items that fit` tray. Cards: the *Cinder name* card (Bearer, Points, `Open skill tree`); `Strain` (meter; GM gets `Add` / `Remove` / `Set…`); `Powers` (a `Push` per mode); `Perks and socket items`; and the GM-only `Binding` card (`Change art…`, `Reset to default orb`). When no Cinder is bound, the tab shows a Strain card and an empty state. | all | `cinders.hbs:17-127` |
| ├ Tab **Manage** (`ag-tab--gm`) | Toolbar: count, `New Cinder`. Card `Cinders`: a table grouped by definition, with `Transfer` / `Unbind` / `Bind` and the notices `Take over from Skill Trees` and `Move existing Cinder progress`. Card `Sockets`, per bound Cinder: socket rows with `Swap…` / `Detach`, empty drop rows, then `Attach…`, `Lock for players` / `Unlock for players` and `Socket count…`. Card `Check`: the report and `Repair`. | GM | `cinders.hbs:129-175` |
| └ Tab **GM Setup** (`ag-tab--gm`) | Card `Player Access`. Card `Strain`, an editor with these parts: the `Bands` table (From / To / Name, trash button, `Add band`), the `Backfire chance on a Push (%)` grid with one input per Strain step, `Rules` (6 fields), and `Backfire effect roll bonus from Strain` (3 fields). The same card has the chip-status line, a file hint and `Import Strain Config` / `Export Strain Config` / `Reset to Defaults`. Further cards: `Cinder art` (`Rotate Cinder art`), `Signature ability` (`Offer a Push when a signature ability is used`), and `Cinders` (read-only limits). Footer: `Cancel` on the left, an unsaved-changes status, `Save Changes` on the right. | GM | `cinders.hbs:177-255` |
| Actors-sidebar launcher `Cinders` | Gated by Player Access | GM + players | `main.mjs:496` |
| **Push offer** (new in 0.10.0, shown when a signature ability is used from the character sheet) | One mode: confirm `Push <mode>?` with `Use without Push` and `Push`. Several modes: a choice dialog `Push <ability>?` with one `Push <mode> (+n Strain, Backfire N%)` button per mode and `Use without Push`. | bearer | `main.mjs:47` |
| Other dialogs (all from the kit's `ag-dialogs`) | `Cinders help`, `Push <power>?`, `Attach to a socket` / `Swap socket item`, `Detach this item?`, the socket menu, `Sockets on this Cinder`, `Add/Remove/Set Strain: <name>`, `New Cinder`, `Bind` / `Transfer <name>`, `Unbind this Cinder?`, `Move existing Cinder progress?`, `Import this Strain config?`, `Reset Strain settings?` (both warn that unsaved Strain edits are discarded), `Reset to the default orb?`, and the FilePicker | mixed | `main.mjs:262-490` |
| Chat card: Push / Backfire | – | all | `scripts/cinder-runtime.mjs` |
| Token Strain chip | – | all (display only) | `scripts/strain-chip.mjs` |

Shell compliance is still good. The header, tabs, GM gating, the single GM Setup footer (with a live "Unsaved changes" status) and labelled confirmations are all in place. The new Strain editor validates inline, labels every input and uses `aria-invalid`, and gives the trash button an `aria-label`. Art rotation respects `prefers-reduced-motion` and pauses while the window is minimized. Settings are now hidden from players in Configure Settings, and players can't change the bearer items (item guards).

**Resolved since the earlier pass, so dropped:** GM Setup mixing immediate and staged saves. There is now a hint at `:227`, and Import/Reset warn that unsaved edits will be discarded. The Strain config is now edited in GM Setup, so the older "GM Setup is read-only" finding shrinks to CN-03.

#### Findings

| ID | Pri | Size | Where | Problem | Fix |
|---|---|---|---|---|---|
| CN-01 | P2 | M | Manage tab, `cinders.hbs:129-175` | The whole tab is one long scroll: the Cinders table, then one Sockets block per bound Cinder (heading, rows, hint and three buttons each), then Check. Repair sits far down the page, even though Bind/Transfer warnings now tell the GM to "run Manage → Repair". The long paragraphs at `:139` and `:153` push the controls down further. | Add sub-tabs under Manage: **Cinders \| Sockets \| Check**, with a count badge on Check when the report is not empty. In Sockets, make each Cinder a `<details>` whose summary reads name · bearer · `n of m in use` · lock badge. Move the paragraphs into `Help` or a collapsed "How this works" section. |
| CN-02 | P2 | M | GM Setup, `cinders.hbs:177-255` (new) | GM Setup is now the longest page in the module: Player Access, then the full Strain editor (a bands table, a schedule grid with one input per Strain step, 6 rule fields and 3 effect-bonus fields), file actions, then the Cinder art, Signature ability and Cinders cards. The three small switch cards end up below the Strain editor. | Add sub-tabs under GM Setup: **General** (Player Access, Cinder art, Signature ability, Cinders limits) and **Strain** (the editor, with Import/Export/Reset in a "Strain config file" row at the top). Keep one `Save Changes` footer covering both sub-tabs, which already works through `setupDirty`. Inside Strain, put Bands, Backfire chance, Rules and Effect roll bonus in `<details>` sections, with Bands open by default. |
| CN-03 | P2 | S | `cinders.hbs:153`, `:226`, `:245` | Four settings still point to Configure Settings instead of being editable in GM Setup: `Cinders per character`, `Starting Cinder points`, default sockets per Cinder, and `Show Strain chip on tokens`. CLAUDE.md says GM configuration lives in GM Setup. | Make them editable fields in GM Setup → General. Stage them like `pendingRotate` and write them through the existing `Save Changes`. The setting keys stay the same, so no migration is needed. |
| CN-04 | P2 | S | Check card `Repair`, `cinders.hbs:172`, `main.mjs:288` | `Repair` still runs with no confirmation. It takes Cinder power Items off characters who don't bear that Cinder, and it is now the recommended follow-up after bearer-item problems. | Add `confirmDialog` with title "Repair Cinders?" and action button "Repair", listing the report rows. Use `danger:true` when a row removes items. |
| CN-05 | P2 | S | Signature box `cinders.hbs:46-49`, `cinders.css` `.agc-signature` (new) | The signature ability and passive sit in the orb column in a hand-rolled box with eyebrow headings. Their Push modes appear as read-only text (`Push on use: …`), while every other power is in the `Powers` card with `Push` buttons. A player may look for a Push button that isn't there. | Show the signature ability and passive as the first rows of the `Powers` card, each with an `ag-badge` reading `Signature` / `Passive` and the same mode stats line. Add the hint "Push is offered when you use it from the character sheet." Remove the `.agc-signature` box. |
| CN-06 | P2 | S | `cinders.hbs:71-83` vs `:114-123` | The Strain card is written out twice and the copies have drifted. The no-Cinder copy has no tooltip on the chance and no "Backfire on a Push from here" line or "every use backfires" notice. | Move the card into one `{{#*inline "agcStrain"}}` partial and use it in both places. |
| CN-07 | P3 | S | `cinders.hbs:45`, `:48` (new) | Two device-only checkboxes (rotation, Push offer) are spread through the stage column between the legend, the signature box and the tray. They save at once, unlike the rest of the window. | Group them in one collapsed `<details>` titled "On this device" at the bottom of the stage column. Keep the labels, and add a hint that they save at once and affect only this browser. |
| CN-08 | P3 | S | `cinders.hbs:44`, `:72-79` | Strain readout repeats: the legend shows `Strain x / y`, the meter shows the value, a bare `N%` follows (explained only in a tooltip), and then "Backfire on a Push from here: N%". | Replace the bare `N%` with a badge reading `Backfire N%`, drop the duplicate meta line, and keep only `Sockets n of m` in the legend. |
| CN-09 | P3 | S | Orbit sockets `cinders.hbs:35-41`, `cinders.css:69-71` | Item names render in extra-small text inside a circle 24% of the stage width with no overflow control. Long names spill over neighbouring sockets, and these are button labels. | Put the socket number and a gem icon in the circle; the full text already lives in `aria-label` and the tooltip. List the filled sockets by name under the stage as `ag-chip` buttons that open the same menu. |
| CN-10 | P3 | S | `Items that fit` tray, `cinders.hbs:56` | The tray chips are draggable `<span>`s, so they can't be focused. | Make them `<button>`s that open `Attach to a socket` with the item preselected, and keep `draggable`. |
| CN-11 | P3 | S | Strain card GM buttons `cinders.hbs:81`, `:122` | `Add` and `Remove` open a form but have no ellipsis and no context. | Rename them `Add Strain…`, `Remove Strain…` and `Set Strain…`. |
| CN-12 | P3 | S | Sockets actions `cinders.hbs:161-166`, `cinders.css:29` | The action row is left-aligned, unlike other `ag-card__actions`. The hint sits inline before a disabled `Attach…`, and content actions are mixed with GM settings (Lock, `Socket count…`). | Use the default right alignment and put the hint on its own line. Make `Attach…` the first button, followed by the Lock toggle and `Socket count…`. |

Permissions: no UI-only GM actions found. Every GM handler checks `game.user.isGM`, as do the API's `requireGM` and the new Strain editor actions (`strain-band-add` / `-remove`, `_stageStrain`). Bearer items are guarded in item hooks.

#### Proposed cleanup brief (Cinders)

1. **0.10.1 (patch, fixes):** CN-04 (confirmation on Repair), CN-06 (shared Strain partial), CN-07 ("On this device" group), CN-08 (Strain readout), CN-11 (button labels), CN-12 (action row). Bump the `module.json` version and download URL and `const VERSION` in `scripts/main.mjs:17`. Add a CHANGELOG entry and run `node scripts/check.mjs ashen-gate-cinders`.
2. **0.11.0 (minor, layout):** CN-01 (Manage sub-tabs Cinders / Sockets / Check), CN-02 (GM Setup sub-tabs General / Strain with collapsible Strain sections), CN-03 (the four remaining settings editable in General), CN-05 (signature ability and passive moved into the Powers card), CN-09 and CN-10 (numbered sockets with a name list, focusable tray chips). Same three bump locations. To verify in Forge: open Cinders → GM Setup and switch General ↔ Strain. Change "Cinders per character" and a band name, then press Save Changes once and confirm both stick. Then open Manage → Check and press Repair: a labelled confirmation should appear.

---

### ashen-gate-factions (Renown, v0.14.0)

#### Window inventory

| Window / surface | Tabs / sections (exact labels) | Who | Location |
|---|---|---|---|
| **Renown window** `Dashboard` (1180×800, min 26rem×30rem) | Header `Ashen Gate \| Renown` + subtitle line, `v…`, `Help` | GM + players (Player Access) | `scripts/module.mjs:363`, `templates/dashboard.hbs:44` |
| ├ Tab **Group** | Left rail: folders with organization rows (`Undiscovered faction` placeholders; GM drags rows to folders). Detail: dossier header (name, leader, description, Group Renown score box). Sections: *Group label* (meter, rank steps, milestone cards with rewards and `Request service` / claim / `View granted item` / `View source`), GM `Adjust group Renown` (`Change`, `Reason`, `Record`), `Group activity`, `Discovered information` | all | `dashboard.hbs:57-94` |
| ├ Tab **Player** | Same rail. `Individual Renown` (Character picker, meter, milestones), GM `Adjust personal Renown`, `Personal activity`; players get `Share with party` in the dossier | all | `dashboard.hbs:96-107` |
| ├ Tab **Pantheon** | Toolbar: `All deities` (when a deity is open), Character picker, GM `New deity`. Grid of deity tiles grouped by tier. Open deity: card (symbol, facts, saying, `Share with party`), `Favour`, GM `Adjust…`, `Favour history` (GM `Undo`), `Related deities` (GM sliders Dissonance↔Resonance, `Remove`, `Add related deity` + `Add`), `Revealed lore`. GM `<details>`: `Deity card, discovery and ranks` (≈13 fields + rank editor + `Save deity`), `Rewards by rank`, `Lore entries`, `Claims and service requests (n)` | all; GM editors | `dashboard.hbs:184-294` |
| ├ Tab **Organizations** (`ag-tab--gm`) | Same left rail **plus** a roster in the main pane: toolbar (search, Visibility / Sort / Group by selects, `n of m`, `Import`, `Export`, `New faction`), grouped roster rows. Then `Selected character` (picker). Then `<details>`: `Folders` (`Add folder`, `Rename <folder>` per folder), `Profile and discovery: <name>` (discovery buttons, form, `Group milestones`, `Individual milestones`, footer `Cancel` / `Save faction`), `Field visibility` (table, footer `Cancel` / `Save field visibility`), `Related quests and contracts`, `Information and Journal links` (entry rows with `Reveal/Hide from party`, `Toggle for <char>`, `Edit text`, `Link: <mode>`, `Remove`; `Add an information entry…`), `Rewards and milestone claims` (per level: `Clear choice`, rows `Edit` / trash icon, `Add a reward…`), `Claims and service requests (n)` (`Approve` / `Mark fulfilled` / `Deny`, Recipient select, `Service limits` → `Reset …`) | GM | `dashboard.hbs:109-179` |
| └ Tab **GM Setup** (`ag-tab--gm`) | `Player Access`, `Pantheon knock-on damping`, `Group display name`, `Fill in permanent item ids` (`Check rewards`, `Fill in ids`, result lists), `Developer Tools` (`Load four draft guilds`). Footer `Cancel` / `Save Changes` | GM | `dashboard.hbs:296-325` |
| Actors-sidebar launcher `Renown` | GM, or players when Player Access is on | all | `module.mjs:736-752` |
| Dialogs (kit) | `Renown Help`, `New faction` / `New deity` (promptText), `Rename folder`, `Edit information`, `Edit reward` (form), `Related deities` (checklist on award), confirmations: `Undo this favour change?`, `Remove this relation?`, `Add four example guilds?`, `Fill in permanent item ids?`, `Share with party`, `Remove this objective reference?`, `Remove this entry?`, `Remove this reward?`, `Deny this request?`, `Reset service charges?`, `Clear this milestone choice?`, `Import these definitions?` | mixed | `module.mjs:494-640` |
| Embed (Character Hub) `.agf-embed` | Compact standing list | per host | `styles/module.css:157-168` |

Strengths: every destructive action has a labelled confirmation, kit components are used throughout (`ag-split`, `ag-rows`, `ag-meter`, `ag-steps`, `ag-badge`, `ag-empty`, `ag-toolbar`, `ag-devtools`), the icon-only trash button has an `aria-label`, and GM handlers call `assertGM()`. Player requests are authenticated on the active GM through a per-user capability token. No UI-only permissions were found.

#### Findings

| ID | Pri | Size | Where | Problem | Fix |
|---|---|---|---|---|---|
| FR-01 | P1 | L | Organizations tab, `dashboard.hbs:57-179` | This is the most crowded screen in the module. The left folder rail and the main-pane roster list the same organizations twice. Selecting one re-renders, and its seven editors (each a `<details>`) sit *below* the full roster and a `Selected character` section, so the GM scrolls past the whole list on every selection. Results push controls down. | In this tab, make the `ag-split` left column the roster itself (search, the three filter selects and the grouped rows), with no separate folder rail. Keep `Import` / `Export` / `New faction` in the toolbar. The right column becomes the selected organization's editor with kit sub-tabs: **Profile \| Visibility \| Information \| Rewards \| Requests \| Links**. Profile includes the milestone ranks. Visibility covers discovery buttons, placeholder/sharing and the field-visibility table. Links covers quests and contracts. The character picker goes in the editor header. Folder management becomes a `Folders…` toolbar button that opens a dialog. |
| FR-02 | P1 | M | `Profile and discovery` (`:144`), deity editor (`:258`); handlers `module.mjs:573` (discovery), `:593-597`, `:478` (slider) | Immediate-save buttons sit inside forms that wait for Save. `Reveal to party`, `Toggle for <char>`, `Add information`, `Add reward`, `Remove`, the relation sliders and others save on click and then call `render({force:true})`. Anything typed but not saved in Name, Leader, Description, Tags or the milestone rows of the same faction or deity is silently lost. | Move the immediate actions out of the edit form (with FR-01, discovery goes to the Visibility sub-tab). Track a dirty state on the form, show "Unsaved changes" in the footer status (`ag-footer__status` is already rendered but empty), and ask with a labelled confirm ("Discard unsaved changes?" / "Discard changes") before any re-render that would drop edits. |
| FR-03 | P1 | M | `Claims and service requests` (`:175`, `:287`); `this.#queue(gf)` per faction | Player claims and service requests appear only inside the selected faction or the open deity. To find pending requests, the GM has to open every organization and every deity. This is daily-use friction during play. | Add a GM-only **Requests** tab, or a "Pending requests" view at the top of Organizations, that lists every pending or approved request across factions and deities with the organization or deity name. Reuse the `agfRequests` partial and its actions. Show the pending count as a badge on the tab. This aggregates existing data; no new mechanic. |
| FR-04 | P1 | L | Pantheon tab with a deity open (GM), `dashboard.hbs:206-291` | The player-facing deity view and all deity authoring share one long page: card, Favour, Adjust, history, relation sliders, lore, then four GM `<details>` (a form of about 13 fields plus a rank editor, rewards, lore editor, requests). Factions are authored in Organizations but deities are authored inside the view tab, and `New deity` sits in Pantheon while deity `Import` sits in the Organizations toolbar. CLAUDE.md: "Authoring and management of content … lives in its own tab(s)". | Keep Pantheon as the view for everyone; the GM keeps the in-context `Adjust…` and `Undo`. Move deity authoring into the GM authoring area: either a `Kind: Organizations / Deities` filter in the FR-01 roster with the same editor sub-tabs (Profile, Visibility, Lore, Rewards, Requests, Relations), or a GM-only **Deities** tab with the same layout. Move `New deity` there next to `Import`. |
| FR-05 | P2 | M | `Save faction` (`:149`) + `Save field visibility` (`:157`), `Save deity` (`:277`) | One organization has two separate Save/Cancel footers, each inside its own collapsible section partway down the scroll. Both Cancels just re-render, which discards both forms. The primary action isn't at the bottom-right of the window. | After FR-01, use one footer per editor sub-tab that stays fixed to the bottom of the detail pane. Alternatively, merge field visibility into the profile save so there is one `Save Changes` per organization or deity. |
| FR-06 | P2 | S | GM Setup `Fill in permanent item ids`, `dashboard.hbs:310-318` | GM Setup holds a maintenance action and its result lists, not a setting. The results push `Developer Tools` down. | Move it into the GM-only `Developer Tools` `<details>` (or a sibling `Maintenance` `<details>`) so GM Setup holds settings only. Keep the handlers as they are. |
| FR-07 | P2 | S | Entry editor `:36`, faction profile `:144`, deity editor `:258` | Discovery buttons are labelled inconsistently and don't show their state. Factions and information entries say `Toggle for <char>`, while deities say `Reveal to` / `Hide from <char>`. Entry meta shows only "revealed to party", never the per-character state. `Link: preview` shows the current state rather than what the button does. | Use `Reveal to <char>` / `Hide from <char>` everywhere, and add a per-character badge to the entry meta. Rename the link button to `Switch to document link` / `Switch to preview`, or make it a small select. |
| FR-08 | P2 | S | Labels across `dashboard.hbs` (`:65`, `:75`, `:122`, `:133`; folder default `module.mjs:413`) | The UI mixes terms for the same thing: the tab says "Organizations", while the button says `New faction`, the dossier eyebrow says `Faction`, the rail says `Undiscovered faction` and the default folder is `Other Factions`. | Pick one visible term (the tab says "Organization") and use it for labels and empty states. Ids, flags and API names stay unchanged. Ask Robb which word he prefers. |
| FR-09 | P2 | S | `Load four draft guilds` seed, `scripts/core.mjs:10-15` | Not a layout issue, but a CLAUDE.md rule. The demo data in this public repo uses setting-flavoured names, leaders and source notes instead of synthetic `[TEST]`-style records. | Replace it with synthetic `[TEST] Guild A…D` records with neutral text. The button label becomes `Load four [TEST] organizations`. |
| FR-10 | P2 | S | Folders section `:137-141` | One `Rename <folder>` button per folder in a wrapping cluster. It grows without limit, and there's no list view of folders. | As part of the `Folders…` dialog (FR-01), list folders as `ag-rows` with a `Rename…` button per row. Ask Robb whether folders also need Remove (currently missing). |
| FR-11 | P3 | S | Reward level header `:37` | A red `Clear choice` button shows on every level, even for "All rewards" levels and levels with no recorded choice. | Show it only for `choose_one` levels that have a recorded choice. |
| FR-12 | P3 | S | Tab `Player` `:51` | The tab shows one character's personal standing, chosen with a Character picker. "Player" doesn't match what it shows. | Rename it to `Character` (or `Personal`). Help text at `module.mjs:514` needs the same change. |
| FR-13 | P3 | S | Header `:46` | The extra subtitle `<p>` in the header title block is not part of the shared shell; Cinders and the other modules have none. | Remove it, or move it into the empty state or Help. |
| FR-14 | P3 | S | Relation sliders `:240-245`, `module.mjs:478` | The add-relation slider's accessible name is just "Resonance". The preview text isn't announced. Changing an existing slider saves and re-renders, which moves keyboard focus back to the top. | Use `aria-label="Resonance with <selected deity>"` and add `aria-live="polite"` to `[data-resonance-preview]`. After the save's re-render, put focus back on the same slider (by `data-resonance-target`). |
| FR-15 | P3 | S | `DEFAULT_OPTIONS.position` `module.mjs:364` | The default 1180×800 window is much wider than the other modules (Cinders is 760) and covers most of the canvas on a laptop Forge session. | After FR-01 and FR-04, about 980×760 is enough; the container queries already handle narrower widths. |

#### Proposed cleanup brief (Renown)

1. **0.14.1 (patch, fixes):** FR-06 (maintenance into Developer Tools), FR-07 (discovery labels and state), FR-09 (synthetic `[TEST]` seed), FR-11 (`Clear choice` only when relevant), FR-12 (`Character` tab label), FR-13 (header subtitle), FR-14 (slider a11y and focus). Also FR-08 once Robb picks the term. Bump `module.json` version and download URL, and `assert.equal(manifest.version,'0.14.0')` in `tests/v06-feedback.test.mjs:10`. Search the module for other `0.14.0` assertions. Add a CHANGELOG entry and run `node scripts/check.mjs ashen-gate-factions`. Also re-check `tests/orgs-tab.test.mjs` / `ui-pass.test.mjs`, which assert which actions GM Setup may contain.
2. **0.15.0 (minor, Organizations restructure):** FR-01 (roster as the left list, editor sub-tabs, `Folders…` dialog), FR-02 (no silent loss of unsaved edits), FR-05 (one footer per editor), FR-10 (folder list), FR-15 (default size). Verify in Forge: Renown → Organizations, pick a faction, type in Name, click `Reveal to party`; it should warn instead of losing the text. Each sub-tab should show its own Save at the bottom-right.
3. **0.16.0 (minor, queues and deities):** FR-03 (cross-faction Requests view with a count badge), FR-04 (deity authoring moved out of the Pantheon view into the GM authoring area alongside Import). Verify in Forge: as a player, request a reward from one faction and a service from one deity. As GM, both should appear in the Requests view without opening either record.

---

### ashen-gate-locations (Locations, v0.18.0)

**Audited:** main @ 8931b9d, where Locations is **0.18.0** (renumbered from 1.18.0; it stays 0.x). Every script and CSS file cited here is byte-identical to the working tree at 8931b9d, so the line numbers apply there. The 3977194→8931b9d changes (1.17.4, 1.18.0 node templates, 0.18.0 renumber) were read and are included: `nodePickHtml` and `nodeRefHtml` in LOC-CR-03. `node scripts/ui-lint.mjs ashen-gate-locations` passes. This was a static read of the code: nothing was checked in a live Foundry session.

#### 1. Window inventory

| Window / surface | Who | Tabs / sub-areas (exact labels) | Where |
|---|---|---|---|
| **Locations window** (`LocationsApp`, 980×720, title `Ashen Gate \| Locations`) | GM + players (players only when Player Access is on) | GM tabs: **Locations · Routes · GM Setup** (GM Setup marked GM, last). Players: **Locations**, plus **Routes** only once a route is visible to them or a journey is active. With one tab the tab bar is hidden. | `scripts/app.mjs:157` (class), `:243-262` (shell/tabs) |
| ↳ Locations tab, GM | GM | Toolbar: search, filters **Threat / Region / Profession / Quest / Status / Placeable**, **Sort by** + direction, **Group by**, **Tree** chip, **Show representative-only too**, **Clear filters**, count, **Import**, **Export**, **New location**. List: groups you can fold, or Tree mode (**Expand all / Collapse all**, "Drop here for top level"). Editor (one long scroll, no sub-tabs): crumbs, **Move to…**, **Delete location**, Name + **Hidden / Unidentified / Revealed** segmented control, **Player Preview**, **Publish**, ID line, Type/Region/Threat/Image grid, image preview, cards **Who Can See It**, **Unidentified Marker & Pin**, **Place**, then the blocks you can reorder: **Description, Conditions, Places Inside, Gathering Resources** (each node has a collapsible "Exotic materials (optional, GM only)"), **Factions, Quests, Related Locations, Loot & Rewards, Notes, Linked Scenes**, plus custom details, then **Add detail**, the **Party Notes** card and a sticky footer (**Cancel** · status · **Place on Scene**, **Save Changes**). | `app.mjs:280-321` (list/toolbar), `:385-397` (filters), `:505-632` (editor), `:635-717`, `:718-821` (nodes) |
| ↳ Locations tab, player | player | Search; tree grouped by region (Unidentified last); viewer cards (Conditions, Places Here, Gathering Resources, Factions, Quests, Related Locations, Loot & Rewards, notes, details); **Share with…**; **Party Notes** (Edit / Save Notes / Cancel) | `app.mjs:367-376`, `:400-489` |
| ↳ Routes tab, GM | GM | Toolbar (search, count, **New route**); journey banner (**Open**, **Travel tracker**); list grouped **Unknown / Rumoured / Known / Explored**. Editor: **Delete route**, Name + 4-state segmented control, From/To, **One-way**, distance/leg/legs/hazard %/hazard table/terrain grid, GM notes, cards **Map Drawing**, **Journey** (Start journey ×2 / Next leg / Turn back / Travel tracker / End journey, hazard Reroll / Dismiss / Share with players, legs log), **Who Can See It** (with a "Right now (saved route)" `<details>`), footer **Cancel** / **Save Changes** | `scripts/routes-ui.mjs:56-216` |
| ↳ Routes tab, player | player | Journey banner + **Travel tracker**; route cards grouped Rumoured / Known / Explored / Unknown paths | `routes-ui.mjs:219-235` |
| ↳ GM Setup tab | GM | Cards **Player Access**, **Unidentified Pins**, **Routes** (default leg length), collapsed **Developer Tools** (**Import [TEST] sample locations**); footer **Cancel** / **Save Changes** | `app.mjs:824-842`, `routes-ui.mjs:369-373` |
| **Travel tracker** (`TravelTracker`, 320×420, title `Ashen Gate \| Travel`) | GM (controls) / players (progress) | No tabs. Header + opacity slider; journey summary + leg strip; hazard card; **Roll next leg**; collapsible panels **Pace (tracking only)**, **Night watches (tracking only)**, **Foraging and navigation (tracking only)** (GM only); **Latest** log; footer **Pause/Resume · End journey · Open route** (players: **Open Routes**) | `scripts/travel-app.mjs:23`, `scripts/travel-view.mjs:213-283`, `scripts/travel-behaviours.mjs` |
| Player Preview (custom DialogV2, 560 wide) | GM | Unidentified + Revealed preview, **Close** | `app.mjs:1333-1345` |
| Dialogs | — | Discard changes? (location `app.mjs:219`, route `routes-ui.mjs:260`); Reveal location? (`app.mjs:1088`); Delete location? (`:1151`); Take over Party Notes? (`:1237`); Clear Party Notes? (`:1256`); Move to… (`:1287`); Show to every player? (`:1303`); Share with… (player, `:1316`); Locations Help (`:1380`); Delete route? (choice or confirm, `routes-ui.mjs:316-318`); End journey? (`routes-ui.mjs:358`, `travel-app.mjs:135`); Travel Help (`travel-app.mjs:161`) | |
| Embed (Character Hub) | GM + players | Compact journey bar, search, places grouped by region, **Open Locations** | `scripts/embed.mjs:15-35` |
| Launchers | | Actors sidebar **Locations** (player-facing, gated by Player Access): `main.mjs:44`. Items sidebar **Location Builder** (GM-only): `scripts/launcher.js:1-94`, `main.mjs:159`. Token controls **Travel tracker (Ashen Gate)**: `main.mjs:148`. Double-clicking a Map Note or the party marker opens the window: `main.mjs:165`. | |

**Permissions:** good. Every GM mutation in `api.mjs` calls `requireGM()` (save, state, publish, delete, import/export, routes, journey, behaviours, clearPartyNotes, placeOnScene, pinsOf). `open`/`openLocation`/`listRoutes` call `requireAccess()`. The Items launcher re-checks `isGM` when clicked (`launcher.js:74-76`). I found no permission enforced only in the UI.

#### 2. Findings

##### Crowded

**LOC-CR-01 · P1 · L.** GM location editor is one ~17-card scroll (`app.mjs:505-632`, Locations tab). Settings cards (Who Can See It, Unidentified Marker & Pin, Place) sit *above* the content blocks, so the GM scrolls past three configuration cards to reach the Description. The Party Notes card sits at the very bottom, under Add detail. An image adds a 14rem preview (`agl-img`, `app.mjs:618`) that pushes everything down.
*Fix:* add editor sub-tabs (kit `.ag-tabs` inside `.agl-detail`) with the sticky footer shared across them:
- **Content**: Type/Region/Threat/Image grid + the blocks you can reorder + Add detail.
- **Visibility & Map**: Who Can See It, Unidentified Marker & Pin, Place, Linked Scenes.
- **Party Notes**: the notes card.

Keep the header strip (crumbs, Name, state control, Publish/Preview) above the sub-tabs. Show the image as a thumbnail next to the Image field, not full-width.

**LOC-CR-02 · P1 · M.** The GM Locations toolbar holds up to 16 controls in one wrapping row (`app.mjs:314-317`, `:385-397`): search, 6 filter selects, Sort, direction, Group by, Tree, Show representative-only, Clear, count, Import, Export, New location. On a 980px window it wraps to 2–3 lines and pushes the list down.
*Fix:* top row = search · **Filters (n)** toggle chip · **Tree** chip · count · Import/Export · **New location** (right). The 6 filters plus Sort/Group/Show representative-only go in a second row that opens from the Filters chip (a `<details class="ag-toolbar__filters">` or a toggled row), remembered per window like `treeMode`.

**LOC-CR-03 · P2 · M.** A gathering node row packs 3 lines of inline controls plus an Exotic `<details>` (`app.mjs:718-741`, `:758-792`, `:794-821`): grip, name, link, skill, tier, DC, eye, ↑, ↓, eye, trash, then Common/×/Rare/×, then Finite/Available/note/Exhaust. With 4+ nodes the Gathering Resources card is the longest thing in the editor. On top of that, the add area now stacks a template picker, an **Add node** button, a **Gathering Nodes** button and a custom-name field (`app.mjs:744-756`, `:580`).
*Fix:* collapse each node to a summary row (name · skill · Tier · DC · status badge · tools). Put the materials, Finite/Available/note and Exotic fields behind a per-node `<details>` ("Edit node"), open for new nodes. Put the template picker and the custom-node field under one **Add node ▾** choice: kit `choiceDialog` with **From template** / **Custom**.

**LOC-CR-04 · P2 · M.** The route editor mixes authoring with live play (`routes-ui.mjs:113-141`, `:165-191`). The Journey card (Start, Next leg, Turn back, End journey, hazard Reroll/Dismiss/Share, legs log) sits between Map Drawing and Who Can See It, above the Save footer. During a session the GM has to scroll through route settings to roll a leg.
*Fix:* move the journey controls to a route sub-tab **Journey**, or leave just **Start journey** + **Travel tracker** in the editor and let the tracker own Next leg / hazards (it already does). Keep the banner at the top of the Routes tab.

**LOC-CR-05 · P3 · S.** Every list entry has 5 trailing controls (grip, ↑, ↓, eye, trash: `app.mjs:512-520`). Across Factions/Quests/Related/Loot/Notes that adds up to a lot of icon noise.
*Fix:* keep the grip (Alt+↑/↓ already works) and the eye. Put ↑/↓/Remove in an `ag-btn-group` that is always visible but placed after the entry text with `ghost sm` spacing, or drop ↑/↓ where the grip keyboard path exists and say so in the hint.

**LOC-CR-06 · P3 · S.** The Locations Help dialog is a single 14-bullet list (`app.mjs:1361-1380`).
*Fix:* group it under small headings (Editing, Visibility, Map pins, Tree & moving, Gathering, Party Notes), or use `<details>` per topic.

##### Inconsistent navigation

**LOC-NAV-01 · P2 · M.** Two save models share one editor screen. These apply **at once**: state segmented control, Publish, Who Can See It (`app.mjs:1294-1309`), Mark exhausted/Restore (when the editor is clean), Move to…, drag-move, route audience and Map Drawing link/unlink. Everything else waits for **Save Changes**. The only signal is grey hint text ("Changes here apply at once.").
*Fix:* give each applies-at-once card a kit badge in its head (`<span class="ag-badge ag-badge--accent">Applies now</span>`). Ideally group those cards in the LOC-CR-01 **Visibility & Map** sub-tab so the content sub-tab is purely draft + Save.

**LOC-NAV-02 · P2 · S.** Several actions silently save unsaved edits first: Start journey, Link selected drawing, Draw for me and route state (`routes-ui.mjs:302-343`), and Place on Scene (`app.mjs:1157-1166`). The GM can commit half-finished edits without meaning to.
*Fix:* if `routeDirty`/`dirty`, ask with a labelled `confirmDialog` (**Save and start journey** / **Keep editing**), or disable these buttons with "Save first" hint text while dirty.

**LOC-NAV-03 · P2 · S.** In the GM editor there are two Save/Cancel pairs on one screen. The Party Notes card has its own **Cancel / Save Notes** (`app.mjs:476`) inside the `<form>` whose footer has **Cancel / Save Changes**. Footer Cancel does not cancel the notes edit, and the reverse holds too.
*Fix:* LOC-CR-01's Party Notes sub-tab separates them. Until then, put the notes card outside the editor `<form>` and label its buttons **Cancel notes edit** / **Save Party Notes**.

**LOC-NAV-04 · P3 · S.** **Place on Scene** sits in the footer's primary cluster beside **Save Changes** (`app.mjs:630`). It is an action, not a save.
*Fix:* move it to the editor head next to **Move to…** (or to the Place card), leaving the footer as Cancel / status / Save Changes.

**LOC-NAV-05 · P3 · S.** Launcher naming is inconsistent. The Items sidebar says **Location Builder** (`launcher.js:7,65`), the Actors sidebar says **Locations**, and the window header says `Ashen Gate | Locations`.
*Fix:* label the Items launcher **Locations** (aria "Open Ashen Gate Locations (GM)") so one name is used everywhere.

**LOC-NAV-06 · P3 · S.** The player Routes tab appears and disappears with game state (`app.mjs:253-254`). A player's tab bar can vanish mid-session when the last route is hidden, and with one tab there is no tab bar at all, so the layout shifts.
*Fix:* always show **Routes** to players when Player Access is on and use the existing empty state ("Routes appear here once your GM reveals them.").

**LOC-NAV-07 · P3 · S.** In the Travel tracker footer, **End journey** (danger) sits between **Pause** and **Open route**, and all three stretch to equal width (`travel-view.mjs:261-263`, CSS `locations.css:211`).
*Fix:* put **End journey** at the left, separated, and Pause/Resume + Open route on the right, matching "destructive away from primary".

**LOC-NAV-08 · P3 · S.** The GM Setup footer says "Nothing here changes until you click Save Changes." (`app.mjs:840`), but the Developer Tools button inside the same scroll imports [TEST] records immediately.
*Fix:* add a hint inside the Developer Tools `<details>` ("Runs at once; not part of Save Changes"), or move the footer status to describe only the settings cards.

##### Inconsistent components

**LOC-CMP-01 · P2 · S.** `<p class="ag-empty">text</p>` is used as a bare paragraph, not the kit empty-state structure (`ag-empty__title` / `__text`). Examples: Unidentified teaser fallback `app.mjs:406`, "No party notes yet." `:478`, every section drop hint `:517`, "No places inside this one." `:701`, "No player accounts…" `:668`, `routes-ui.mjs:150`. It renders as a centred padded block inside cards and looks unlike the real empty states.
*Fix:* use `.agl-hint` (or kit `.ag-field__hint`) for in-card hints and keep `.ag-empty` for whole-pane empty states.

**LOC-CMP-02 · P2 · S.** Long checkbox labels can't wrap. `.agl-switch { white-space: nowrap }` (`locations.css:41`) is applied to long sentences: route "When a player can't see one end, show "…" from the end they can see (otherwise they see nothing)" (`routes-ui.mjs:158`), "Players who see it can share it with others" (`app.mjs:673`), "Players can open Locations". In the ~550px detail pane these overflow or get clipped, which breaks "never clip actionable text".
*Fix:* drop `nowrap` from `.agl-switch` (keep it only for short toolbar switches via `.agl-filters .agl-switch`). Shorten the route label to "Show "<unknown path>" from the visible end" and move the rest to a hint.

**LOC-CMP-03 · P3 · S.** Progress bars are hand-rolled: `.agl-embed__bar` (`embed.mjs:28`, `locations.css:165-166`) and `.agl-travel__strip--bar` (`travel-view.mjs:202`, `locations.css:203-204`), both with inline `style="width:%"`.
*Fix:* use the kit `.ag-meter` (`ag-meter__track` / `__fill`) for both.

**LOC-CMP-04 · P3 · S.** The embed's search box is a bare `<input>` (`embed.mjs:33`), not the kit `.ag-search` with an icon, and its empty states use `.ag-empty` with no title.
*Fix:* wrap it in `<label class="ag-search">` and use the `ag-empty__title`/`__text` structure.

**LOC-CMP-05 · P3 · S.** Section heads are hand-rolled. `.agl-section__head` duplicates the kit's `.ag-card__head` / `.ag-section__head` (`locations.css:76-77`), and `.agl-grid` duplicates `.ag-form-grid`.
*Fix:* switch to the kit classes and delete the local rules (the layout is the same).

**LOC-CMP-06 · P3 · S.** Destructive or irreversible confirms are styled unevenly. **End journey** has a labelled button but no `danger: true` (`routes-ui.mjs:358`, `travel-app.mjs:135`), although the button that triggers it is red. **Dismiss** on a hazard discards it for good with no confirmation (`routes-ui.mjs:214`, `travel-view.mjs:240`).
*Fix:* pass `danger: true` for End journey. Dismiss is fine without a confirm, but give it a tooltip saying "Players never learn of it".

**LOC-CMP-07 · P3 · S.** Unidentified needs no confirmation, Revealed does (`app.mjs:1084-1091`). Unidentified also exposes the label, teaser and pin to players.
*Fix:* add a labelled confirm, **Make unidentified**, only when moving from Hidden.

##### Accessibility

**LOC-A11Y-01 · P1 · S.** Links are not keyboard-reachable. Every `<a class="agl-link" data-action=…>` has no `href` and no `tabindex`, so it is not focusable and Enter does nothing. That covers place links, crumbs, quest links, document links, related/children links and route endpoints: `app.mjs:402, 410, 415, 428, 521, 533, 540, 598, 700`, `routes-ui.mjs:230`. Players navigate the viewer almost entirely through these.
*Fix:* render them as `<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm agl-link">` (or add `href="#"` + `role="link"`). One helper (`link()`/`go()`/`docLink()`) covers almost every call site.

**LOC-A11Y-02 · P2 · S.** Status icons use `aria-label` on a bare `<i>`. Generic elements' `aria-label` is ignored by most screen readers, so the row's accessible name loses Hidden/Unidentified/Revealed, "Representative only", "Selected players only", the unpublished dot, route state and broken-endpoint warning. Locations: `app.mjs:328` (`mark()`), `:330`, `:335` (`agl-dot`), `:701`; `routes-ui.mjs:67, 69`. The unpublished dot is colour plus tooltip only.
*Fix:* add `role="img"` to these, or better, put an `<span class="ag-sr-only">` with the text next to an `aria-hidden` icon.

**LOC-A11Y-03 · P2 · S.** The tracker leg strip hides hazards from screen readers. Hazard legs are marked only by a red border (`locations.css:202`), and the strip's `role="img"` label is just "Leg N of M" (`travel-view.mjs:199-210`). Per-cell tooltips are on non-focusable `<li>`.
*Fix:* include hazards in the label ("Leg 3 of 8; hazards on legs 2, 3"), and mark hazard cells with an icon or pattern, not just the border colour.

**LOC-A11Y-04 · P3 · S.** Icon-only Remove buttons all read "Remove" or "Move up" (`app.mjs:519`), so a screen-reader list of 6 factions has 6 identical "Remove" buttons.
*Fix:* pass the entry label into `title` ("Remove <label>", "Move <label> up").

**LOC-A11Y-05 · P3 · S.** The hazard card (`routes-ui.mjs:211`) and the render-error card use `role="alert"` and are recreated on every re-render (any select change re-renders), so a screen reader re-announces the hazard repeatedly.
*Fix:* use `role="status"`, or render the alert only when the hazard first appears.

**LOC-A11Y-06 · P3 · M.** Every keystroke in the search box re-renders the whole window and restores focus by hand (`app.mjs` bind, `routes-ui.mjs:239-242`). This resets screen-reader context and gets slow with large lists.
*Fix:* debounce (~150ms) and re-render only the list `<aside>`.

**LOC-A11Y-07 · P3 · S.** The `ag-segmented` state controls use `role="radio"` buttons with no arrow-key handling (`app.mjs:573`, `routes-ui.mjs:111`). Each button is a separate Tab stop, which is not how radiogroups normally behave.
*Fix:* add roving `tabindex` + ←/→ handling, or drop `role="radio"` and use `aria-pressed` buttons.

#### 3. Counts

P1: 3 (LOC-CR-01, LOC-CR-02, LOC-A11Y-01) · P2: 9 (LOC-CR-03, LOC-CR-04, LOC-NAV-01, LOC-NAV-02, LOC-NAV-03, LOC-CMP-01, LOC-CMP-02, LOC-A11Y-02, LOC-A11Y-03) · P3: 16 (LOC-CR-05, LOC-CR-06, LOC-NAV-04, LOC-NAV-05, LOC-NAV-06, LOC-NAV-07, LOC-NAV-08, LOC-CMP-03, LOC-CMP-04, LOC-CMP-05, LOC-CMP-06, LOC-CMP-07, LOC-A11Y-04, LOC-A11Y-05, LOC-A11Y-06, LOC-A11Y-07) · total 28.

#### 4. Proposed cleanup brief

The current published version is **0.18.0**. Stay on 0.x. Bump `module.json` `version` + `download`, `const VERSION` in `scripts/main.mjs`, and any version assertions in tests (e.g. `tests/version-0x.test.mjs`, `tests/ui-pass-*.test.mjs`). Add a CHANGELOG entry and run `node scripts/check.mjs ashen-gate-locations`. No saved-data changes are needed for any of this. Sub-tab and filter-row state stays per window, like `treeMode`.

**Release A: 0.18.1 (patch: a11y and component fixes, no layout change)**
1. LOC-A11Y-01: make `agl-link` buttons, or focusable links with keyboard activation, in the `link`/`go`/`docLink` helpers and the remaining inline anchors.
2. LOC-A11Y-02: status icons get `role="img"` or sr-only text. The unpublished dot gets sr-only text.
3. LOC-A11Y-03: the strip label lists hazard legs, and hazard cells get an icon marker.
4. LOC-A11Y-04/05: entry-specific Remove/Move labels; hazard card `role="status"`.
5. LOC-CMP-01: replace the in-card `<p class="ag-empty">` with `.agl-hint`.
6. LOC-CMP-02: remove `nowrap` from `.agl-switch` (keep it for toolbar switches) and shorten the route unknown-path label.
7. LOC-CMP-06/07: `danger: true` on End journey; labelled confirm on Hidden→Unidentified; Dismiss tooltip.
8. LOC-NAV-05: Items launcher label **Locations**.

How to verify in Forge:
- Tab through a revealed location as a player; Enter on a place, quest or document link opens it.
- In a narrow window, the route "Who Can See It" checkbox text wraps.
- End journey's confirm button is red.

**Release B: 0.19.0 (minor: GM editor restructure)**
1. LOC-CR-01 + LOC-NAV-01 + LOC-NAV-03: editor sub-tabs **Content · Visibility & Map · Party Notes** under the editor header (crumbs, Name, state control, Preview/Publish). The applies-at-once cards go in Visibility & Map with an **Applies now** badge. The sticky footer stays shared. The image becomes a thumbnail next to the Image field.
2. LOC-NAV-04: Place on Scene moves to the editor head.
3. LOC-NAV-02: Place on Scene, Start journey, Draw for me, Link drawing and route state ask **Save and …** / **Keep editing** when there are unsaved edits.
4. LOC-CR-03: collapsible per-node detail; one **Add node** choice (From template / Custom).
5. LOC-CR-05: tidier entry tools.

How to verify in Forge: open a location, switch sub-tabs with unsaved edits (the dot stays, nothing is lost), and Save from each sub-tab.

**Release C: 0.20.0 (minor: list toolbar, routes, polish)**
1. LOC-CR-02: toolbar row 1 = search · **Filters (n)** chip · **Tree** · count · Import/Export · **New location**. The filters/sort/group row opens from the chip.
2. LOC-CR-04: route editor sub-tab **Journey** (or the tracker owns leg rolling; the editor keeps Start + Travel tracker).
3. LOC-NAV-06: Routes tab always shown to players with access. LOC-NAV-07: tracker footer order. LOC-NAV-08: Developer Tools hint.
4. LOC-CMP-03/04/05: kit `.ag-meter` for the embed and tracker bars, `.ag-search` in the embed, kit section/grid classes.
5. LOC-A11Y-06/07: debounced list-only search render; roving tabindex on the segmented controls.
6. LOC-CR-06: Help grouped by topic.

How to verify in Forge:
- With a 980px window, the Locations toolbar is one row and Filters opens the second row.
- The Routes tab shows Journey on its own sub-tab.
- The player Routes tab is present with no routes.

---

### ashen-gate-manager (General Manager) — audited at main 8931b9d, module v0.45.1

Read-only audit. Sources: `module.json`, `scripts/main.js` (the 3 window classes, handlers, settings menus, API), `templates/manager.hbs`, `templates/my-appearance.hbs`, `styles/manager.css`, `styles/skins/*.css`, `scripts/appearance.js`, `scripts/appearance-consumer.mjs`, `scripts/browse-view.js`, `scripts/codex.js`, `scripts/module-cards.js`, `scripts/gm-setup.js`, `scripts/items-launcher.js`, `scripts/item-filters.js`. `node scripts/ui-lint.mjs ashen-gate-manager` passes. These findings come from reading the code and templates. Nothing here was checked in a live Foundry world.

Note: the audit began on commit 3977194 (v0.44.0). Every finding was then re-checked against 8931b9d (v0.45.1). The 0.45.0 rework of the Import tab (folds, a capped preview table, a bottom message drawer) is already in, and it resolves most of the crowding I had noted on the Import tab.

#### 1. Window inventory

| Window / surface | Who | Where | Tabs / sub-sections (exact labels) |
|---|---|---|---|
| **Ashen Gate \| General Manager** (`AshenGateManager`, HandlebarsApplicationV2, 1020×820) | GM only (settings menu `restricted:true`, `api.open()` rejects non-GM, Items-sidebar launcher removed for non-GM) | `scripts/main.js:210`, `templates/manager.hbs` | Header: brand + emblem, **Appearance ▾** popover, "GM only" flag, version, **Help**. Tabs (`hbs:32-39`): **Import · Items · Modules · Scenes · History · GM Setup** |
| ↳ Header **Appearance** popover (role=dialog) | GM | `hbs:5-26` | Skin card radio group, **Size** segmented (Compact/Comfortable), "Open My Appearance", footer **Cancel** / **Save World Default** |
| ↳ **Import** tab | GM | `hbs:41-152`, drawer `hbs:969-1005` | Toolbar (Choose JSON or ZIP package, loaded file, Clear, Download report). Folds: **Load**, **ZIP files**, **Options** (with nested **Advanced / sample files**), **Preview**. Sticky actions: Validate & Preview / Select eligible / Deselect all. Footer: Cancel / **Import Selected Documents**. Bottom drawer: **Show/Hide messages** with chip-tabs (errors, review notes, module links, results) |
| ↳ **Items** tab | GM | `hbs:154-678`; rail views `scripts/item-filters.js:87` | Shared toolbar (search, Source, Type, Origin, Rarity, Folder, Has core_ref, Clear filters, Load compendiums). Icon-only vertical rail (`hbs:174`) with 8 views: **All items · Ashen Gate records · Folders · Core links · Checks · Export and backup · Adopt and tag world Items · NPC Codex** |
| ↳↳ All items (Browse) | GM | `scripts/browse-view.js:79` (string HTML) | Sort, Group, Refresh (in toolbar); scope segmented Ashen Gate / Non-Ashen Gate / All; 10 facet selects; 2 checkboxes; results + detail aside; pager |
| ↳↳ Ashen Gate records | GM | `hbs:182-278` | List/detail split: System chips, **More filters** (Status, Package, Show archived), rows, selection bar with **Actions ▾** menu (Export selected, Replace from loaded JSON, Copy to staging compendium, Archive, Restore, Delete archived…), pager. Detail: Open sheet, item card, key/values, Uses / Used by, Local edits |
| ↳↳ Folders | GM | `hbs:466-623` | Sections: **Clean compendiums**, **Organize folders**, **Recent organize runs**, **Protected folders**, **Rules** (Edit rules (JSON) / Export / Import / Reset rules to defaults…) |
| ↳↳ Core links | GM | `hbs:625-674` | **Core links** (Scan, preview table, Cancel / Download backup / Apply…), **Recent core-link runs** (Undo) |
| ↳↳ Checks | GM | `hbs:280-303` | **Check library**, **Housekeeping report** |
| ↳↳ Export and backup | GM | `hbs:305-324` | Export everything, Back up before play, **More ▾** (Export changed, Copy summary) |
| ↳↳ Adopt and tag world Items | GM | `hbs:326-372` | Stats, toolbar, table, Classify + Tag / Remove tags, Export all tagged Items |
| ↳↳ NPC Codex (GM) | GM | `hbs:374-464`; handlers `main.js:~2290` | List (search, All / Known to players / Hidden chips, **Codex ▾** menu); detail: Actor sheet, Hide from players…, per-field Hidden/Party/Characters segment, GM-only block, edit form (Cancel / Save Changes), **Preview as** |
| ↳ **Modules** tab | GM | `hbs:680-732` | **Pre-session check** (Run / Copy report / Download report), **Ashen Gate modules** (Refresh, Hide all, module cards with Open + Hide from/Reveal to players) |
| ↳ **Scenes** tab | GM | `hbs:734-913`; rail `main.js:41` | Icon-only rail: **Live: this scene · Moods & layers · Export & import**. Live: Base mood, Add a layer, Fine-tune this scene (Cancel / Save as layer… / Save as mood… / Apply to scene), "On this scene now" aside. Library: toolbar (search, filter chips, New mood, New layer), lists, preset editor. Share: Export, Import |
| ↳ **History** tab | GM | `hbs:915-932` | Recent import operations (`<details>` per run) |
| ↳ **GM Setup** tab | GM | `hbs:934-966`, window footer `hbs:1007-1013` | **World appearance**, **NPC Codex** (player access toggle), **Core sources**, **Developer Tools** (Load example package). Footer Cancel / Save Changes |
| **Ashen Gate \| My Appearance** (`AshenGateMyAppearance`, 560×520) | Any user. Since 0.45.0 the settings menu is GM-only (`main.js:2489`); players reach it through Utilities' Appearance button and the Character Hub's "More in My Appearance" | `main.js:2352`, `templates/my-appearance.hbs` | Skin radio cards (incl. Inherit), Size segmented, footer **Save My Appearance** |
| **Ashen Gate \| NPC Codex** (player view, `AshenGateCodexPlayer`, 620×640, plain ApplicationV2 with string HTML) | Players while GM Setup → *Let players open the NPC Codex* is on (menu `restricted` toggled at `main.js:2497-2502`); also mounted in Character Hub | `main.js:2388`, `scripts/codex.js:239` | Header (Refresh, version), card grid |
| Items-sidebar launcher **General Manager** | GM only (removed for non-GM, re-checked on click) | `scripts/items-launcher.js`, `main.js:2602` | Shared `items` launch group (order 10) |
| Dialogs | GM | `confirmDialog` ×23 in `main.js`; `infoDialog` Help `main.js:898` | All confirmations use the kit helper with specific titles and action labels (e.g. "Reset rules to defaults", "Delete N…", two-step delete). **No generic Confirm/Yes found.** |

**How the appearance controller and skins affect other modules**
- On `ready`, Manager writes the effective skin's base `--ag-*` tokens inline on `<html>` along with `data-ag-skin` / `data-ag-size` (`main.js` ready hook, `appearance.js:applyTo`). It also swaps one `<link>` for the active structural skin (`syncSkinStylesheet`). Every module's kit-styled window and launcher therefore re-themes live. Without Manager, the kit's `:root` defaults apply, which satisfies the "default theme when Manager is absent" rule.
- Structural skins (`styles/skins/stone-tablet.css`, `tome-pages.css`) restyle **kit components only**: `.ag-tabs`, `.ag-siderail`, `.ag-segmented`, `.ag-card`, `.ag-btn`, `.ag-header`, `.ag-footer`, `.ag-table`, `.ag-notice`, launchers and tooltips. Any hand-rolled module component, including Manager's own, is not reshaped (see GM-CO-01).
- Locations (`app.mjs:258`, `travel-app.mjs:115`) and Character Hub (`sheet.mjs:392`) also call `api.appearance.applyTo(content)` on every render. That writes a second, inline copy of the tokens on their window content (see GM-CO-04).
- `scripts/appearance-consumer.mjs` (the `mountAshenGateAppearance` helper) is used by no module and carries a different fallback palette (see GM-CO-07).

#### 2. Findings

Priority: P1 (hurts daily use, breaks an explicit CLAUDE.md rule, or is an a11y blocker) / P2 (noticeable friction or inconsistency) / P3 (polish). Size: S (under 1 h, one file) / M (one window) / L (a restructure across windows).

##### Crowded

| ID | P | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| GM-CR-01 | P1 | M | Items → All items: `hbs:156-171` toolbar + `browse-view.js:79-99` | Up to about 22 filter controls stack above the first result: 5 toolbar selects, a checkbox, Sort, Group and Refresh, then scope, 10 facet selects and 2 more checkboxes. Several overlap: Type vs Kind / AG type, Rarity vs Rarity / quality, Folder vs Pack / folder. The results get pushed below the fold. | Keep search, scope and Sort/Group in the toolbar. Move the facets into one `<details class="aglib-filters">` titled "More filters (n)", like Ashen Gate records already does. Remove the duplicates by dropping the shared-toolbar selects on this view, or the matching facets. |
| GM-CR-02 | P1 | M | Items → Folders: `hbs:466-623` | One long page with 5 sections and two near-duplicate preview/apply flows: **Clean compendiums** (Commit) and **Organize folders** (Apply). Each has its own footer and 2-3 long help paragraphs (`hbs:471, 488, 542-544`). Protected folders and Rules sit below both flows. | Give the Folders view sub-tabs or `<details>` groups: **Clean** (default, open), **Organize a selection** (collapsed), **Rules & protected folders** (collapsed), **History**. Shorten each help block to one line plus a "How it decides" `<details>`. |
| GM-CR-03 | P2 | M | Items → NPC Codex detail: `hbs:405-462` | One column holds the discovery control, every field with its own segmented control, the GM-only block, the edit form with its footer, and then **Preview as**. Save Changes therefore sits mid-panel with more content below it. | Split the detail into sub-tabs: **Reveals** (segments, which save immediately), **Notes & links** (form, footer at the bottom), **Player preview**. That way the footer is always last. |
| GM-CR-04 | P2 | S | Scenes → Moods & layers: `hbs:846-875` | The preset editor renders under the full library list, so after clicking **Edit** or **New mood** the GM has to scroll to find it. | Render the editor in place of the list (list ↔ editor), or scroll it into view and focus its first field on open. |
| GM-CR-05 | P3 | S | Import tab Options fold `hbs:82-111`; Modules tab `hbs:702-731`; GM Setup `hbs:945-956` | Many `agmanager-tiny` explanatory paragraphs, 2-4 per section. They repeat what the controls and tooltips already say, e.g. "(GM launcher remains available)" on every module card. | Keep one line per section and move longer text into the Help dialog or a "Details" `<details>`. |

##### Inconsistent navigation

| ID | P | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| GM-NV-01 | P1 | L | Items rail `item-filters.js:87`, `hbs:374` | **NPC Codex** is the 8th icon in the *Items* rail, but it manages NPC Actors and what players learn, not items. The shared Items filters also show above it and don't apply. GMs have to hunt for a session-time tool. | Promote **NPC Codex** to its own top-level tab (Import · Items · Codex · Modules · Scenes · History · GM Setup) and hide the Items toolbar there. |
| GM-NV-02 | P2 | M | Items toolbar `hbs:156-171` vs Checks/Export/Adopt/Codex views | The toolbar is labelled "kept across the rail", but Checks, Export, Adopt and Codex ignore it. Housekeeping even says "the filters above do not apply". Filters show where they have no effect. | Render the shared toolbar only on All items, Ashen Gate records, Folders and Core links. |
| GM-NV-03 | P2 | M | Rails `hbs:174-175` (8 views) and `hbs:736-737` (3 views) | The section navigation is an icon-only circular rail; labels exist only as aria-label/tooltip. With 8 icons, GMs must hover to find things. It is also a hand-rolled `.aglib-rail`, not the kit's `.ag-siderail` (see GM-CO-01). | Use kit sub-tabs (`.ag-tabs` under the main tabs) with text labels. If a rail is kept, use `.ag-siderail` with visible labels. Group Items into fewer sub-tabs: **Browse · Records · Maintenance** (Folders, Core links, Checks) **· Export**. |
| GM-NV-04 | P2 | M | Import → Options → Advanced / sample files `hbs:104-109`; drafts toggle `hbs:84`; Import profile `hbs:94-100`; Items → Adopt and tag world Items `hbs:326-372` | Developer and sandbox tools sit outside the GM-only **Developer Tools** area: the sample/starter/manifest downloads, "Include draft / proposed / example records (sandbox testing only)", the *Development* import profile, and the repo-review capture workflow (Adopt & export "for review… reconciled for the repo"). | Move the sample downloads and the Adopt/tag/export workflow into GM Setup → Developer Tools, or a GM-only Developer Tools sub-tab. Keep one draft control (see GM-NV-05). |
| GM-NV-05 | P2 | S | `hbs:84` and `hbs:94-100`; `main.js` `applyProfile()` | "Include draft" checkbox and **Import profile** (Development / Session-safe) drive the same `includeDrafts` flag. Two controls for one state can disagree after a manual tick. | Keep only the profile select (or only the checkbox) and show its effect in the Options summary. |
| GM-NV-06 | P2 | M | Header popover `hbs:5-26` vs GM Setup → World appearance `hbs:936-941` | The world default skin is edited in two places with two different UIs (cards + its own Save in the header; a `<select>` + window Save in GM Setup). CLAUDE.md puts GM configuration in GM Setup. The popover also mixes a per-device setting (Size) with the world setting. | Make GM Setup → World appearance the only world-default editor, using the skin cards. Turn the header **Appearance** button into "My Appearance" (personal skin + size), or drop it. This also lets the header follow "version + Help on the right" (see GM-NV-07). |
| GM-NV-07 | P3 | S | Manager header `hbs:4-30`; My Appearance header `my-appearance.hbs:2-5`; player Codex header `main.js:~2395` | The headers differ: Manager has Appearance, GM-only flag, version and Help. My Appearance has a version and a subtitle but no Help. The player Codex has Refresh before the version and no Help. | Standardise on `[actions…] version Help` on the right, and add a one-paragraph Help to My Appearance and the player Codex. |
| GM-NV-08 | P3 | S | `hbs:915-932` History tab | "History" covers imports only. Organize and core-link history live inside Items → Folders and Core links. | Rename the tab to **Import history**, or show all three logs there with a filter. |
| GM-NV-09 | P3 | S | GM Setup → Core sources (`hbs:948-958`) vs Items → Folders → Protected folders / Rules | Settings for Core links live in GM Setup, but the equivalent Organize settings (protected folders, rules) live in the Items tab. | Choose one rule. Simplest: leave both next to their feature and put a one-line link in GM Setup, or move Core sources into the Core links view inside a `<details>` "Sources". |
| GM-NV-10 | P3 | S | Primary labels across flows | The apply verbs differ for similar actions: "Commit (n)…" (Clean), "Apply…" (Organize), "Apply (n)…" (Core links), "Import Selected Documents", "Import" (moods), "Apply to scene". | Use "Apply (n)…" for all preview→apply flows and "Import (n)" for imports. |

##### Inconsistent components

| ID | P | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| GM-CO-01 | P2 | M | `manager.css`: `.aglib-rail` (rail), `.aglib-split`/`.aglib-list`/`.aglib-detail` (split), `.aglib-kv` (key/values), `.agcodex-seg` (segmented), `.agmanager-package` (stat tiles), `.agmanager-result` (result cards), `.agmanager-presession-row` / `.agmanager-auditrow` (status rows), `.agmanager-history` (cards) | Each is a hand-rolled copy of a kit component (`.ag-siderail`, `.ag-split`, `.ag-kv`, `.ag-segmented`, `.ag-card`, `.ag-rows`/`.ag-row`, `.ag-notice`). The structural skins restyle only the kit classes, so Manager's rail, split, segments and cards keep rounded default shapes under Stone Tablet or Tome Pages while other modules change. | Swap in the kit classes: rail→`.ag-siderail`, split→`.ag-split`, key/values→`.ag-kv`, codex segment→`.ag-segmented` (aria-checked), result/history→`.ag-card`, status rows→`.ag-rows` with tone badges. Keep only layout tweaks in `manager.css`. |
| GM-CO-02 | P2 | S | `manager.css`: `.agcodex-seg .is-party` (ok on ok-soft), `.is-actors` (accent on accent-soft), `.agcodex-gm h4` (danger on danger-soft), `.agm-skin-card__now` (accent on accent-soft when selected) | Toned text sits on its own soft fill using the base tone colour. Kit 2.1 added `--ag-*-ink` tokens exactly for 4.5:1 contrast here, and this is a contrast risk on the light skins (Parchment, Tome Pages). | Use `--ag-ok-ink`, `--ag-accent-ink` and `--ag-danger-ink`. |
| GM-CO-03 | P2 | S | Codex: reveal segments apply at once (`main.js:2295`), but learned/links/notes need **Save Changes**. Appearance: Size saves on click, skin needs Save (`hbs:15-23`, `my-appearance.hbs:13-19`) | Mixed save models in one panel. Users can't tell what is already saved, and Cancel looks like it reverts everything. | Label the instant parts ("Saved immediately"), or put them under the same Save. In Appearance, make Size part of the Save, or move it out of the Save-gated area with a note. |
| GM-CO-04 | P2 | S (Manager) + S each in Locations/Hub | `appearance.js:applyTo`; callers `ashen-gate-locations/scripts/app.mjs:258`, `travel-app.mjs:115`, `ashen-gate-character-hub/scripts/sheet.mjs:392` | Those windows copy the skin's base tokens inline onto their content on render. When the GM or player changes skin, `<html>` updates live, but those windows keep the old base colours until they re-render. Kit-derived tokens (soft fills) are recomputed from the new skin on `.ag-app`, so the window shows a mix of old and new colours. | Since `<html>` theming already reaches every window, document `applyTo` as needed only for detached roots, and drop the per-render calls in Locations/Hub (feature-detect stays harmless). Or make them subscribe and re-apply. Manager side: note in the API docs. |
| GM-CO-05 | P3 | S | Badges: History rows `hbs:925` `<span class="ag-badge">{{status}}</span>` with no tone; Folders/Core-links summaries all neutral | Status badges lack the tones used in the Import preview and results, so failures in History look the same as successes. | Map statuses to the `ACTION_TONE` / `statusTone` helpers already in `main.js`. |
| GM-CO-06 | P3 | S | Item search placeholder `hbs:157` "Search name, id, tag, text… (id:…, type:weapon, tag:, status:)" | The query syntax lives only in the placeholder, which gets clipped in a narrow toolbar and disappears once the user types. | Short placeholder ("Search items"), with the syntax in a `?` tooltip button or the Help dialog. |
| GM-CO-07 | P3 | S | `scripts/appearance-consumer.mjs` (+ test) | Dead helper. No module imports it, and its FALLBACK palette (`#1c2024`, `#c9a66b`…) doesn't match the kit's Standard tokens, so a future adopter would get a different "default". | Delete it, or align it to the kit `:root` tokens and document it as the approved consumer path. |
| GM-CO-08 | P3 | S | Files: Import (`hbs:44`, hidden input), Organize rules Import (`hbs:605`, `ag-btn` label), Codex restore (`hbs:397`, menu label), Moods import (`hbs:890`, visible native `<input type=file>`) | Four different file-picker patterns. | One pattern: a real `<button class="ag-btn">` that calls `input.click()` on a visually hidden input (also fixes GM-A11-01). |

##### Accessibility

| ID | P | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| GM-A11-01 | P1 | S | Import file picker `hbs:44` + `manager.css:53` (`.agmanager-filelabel input{display:none}`); Organize **Import** rules `hbs:605` (`hidden` input inside a `<label class="ag-btn">`) | The input is `display:none`/`hidden` and the wrapping `<label>` can't take focus, so the **main Import action cannot be reached by keyboard**. Neither can rules import. | Visually hide the input instead (`.ag-sr-only`-style clip, still focusable), or use a `<button>` that calls `input.click()`. Keep the existing busy-disable. |
| GM-A11-02 | P1 | S | Deity links: GM Codex `hbs:428` and player Codex `scripts/codex.js:234` (`<a … role="button" data-ag-codex-deity>` with no `href` / `tabindex`) | A clickable element that is not focusable. In the **player-facing** Codex, keyboard users can't open a deity. | Render a `<button type="button" class="agcodex-link">` (or add `tabindex="0"` + Enter/Space handler). |
| GM-A11-03 | P2 | S | Codex menu "Restore reveals from a codex export…" `hbs:397` (`<label role="menuitem" tabindex="0">` with a `hidden` input) | It can take focus, but Enter/Space do nothing: there is no keydown handler (`main.js` binds only `change`). | Same fix as GM-A11-01: a `<button role="menuitem">` that opens the input. |
| GM-A11-04 | P2 | S | Import drawer chips `hbs:973-975` | Buttons carry both `role="tab"` + `aria-selected` **and** `aria-pressed`, which conflict, inside an `ag-chip-group role="tablist"`. The panel `aria-controls` is missing on the tabs. | Pick one model. Prefer plain toggle chips (`aria-pressed`, no tab roles), or full tabs with `aria-controls="agm-drawer-body"` and arrow keys. |
| GM-A11-05 | P3 | S | Main tabs `hbs:32-39` (role=tab, no tabpanel / arrow keys; `main.js:701` re-renders on click); `.aglib-menu__pop role="menu"` (`hbs:216, 312, 395`) | The ARIA roles promise keyboard patterns (arrow-key tabs, roving menu focus) that aren't implemented. | Add `role="tabpanel"` + `aria-labelledby` on `.agm-pane` plus arrow-key handling (or drop the tab roles). Drop `role=menu`/`menuitem` from the `<details>` menus, which already work as disclosure lists. |
| GM-A11-06 | P3 | S | Module card `hbs:713` | `data-tooltip` sits on a non-focusable `<article>`. Each card's **Open** button has no accessible name naming the module, so a screen reader hears 8 identical "Open" buttons. | Add `aria-label="Open {{title}}"` to Open and move the reason into visible text (already shown when `!canToggle`). |
| GM-A11-07 | P3 | S | GM Setup tab switch (`main.js:701`) | Switching tabs re-renders and silently drops unsaved GM Setup edits. The footer Cancel/Save gives no dirty warning. | Keep a dirty flag. Warn on tab change, or keep the draft in `this.setupDraft` across renders. |

No animations were found in manager.css or the skins, so the reduced-motion check doesn't apply. The kit's `:focus-visible` covers Manager's buttons and summaries. Icon-only buttons (pager, close, remove-layer, favourite, rail tabs) all have `aria-label` + tooltip.

##### Permissions (UI vs API)

| ID | P | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| GM-PM-01 | P2 | M | `main.js:2591` `playerAccess.getState()` → `audience:"gm-only"`; player Codex gated by its own setting (`CODEX_ACCESS_SETTING`, GM Setup) | Manager has a player-facing surface (the NPC Codex), but it reports itself as GM-only to the Player Access contract. So the Modules tab's **Hide all** and per-module cards never hide the Codex. This is inconsistent with "player-facing launchers are gated by each module's Player Access setting". | Implement `ag-player-access/1` for the Codex: `getState` returns the Codex setting, `set` toggles it. The Modules tab then shows a "Ashen Gate \| General Manager (NPC Codex)" card, and GM Setup can link to it instead of owning a second toggle. |

The permission checks I read are enforced in the API, not only in the UI. Codex, Scenes, Organize, Browse, Core links, world export and pre-session each call `isGM`/`requireGM` in their service functions. `setWorldDefault` rejects non-GMs, and the player Codex query is answered by the GM with only that player's projection. I found no UI-only GM gate.

#### 3. Counts

**P1 = 5** (GM-CR-01, GM-CR-02, GM-NV-01, GM-A11-01, GM-A11-02) · **P2 = 14** (GM-CR-03, GM-CR-04, GM-NV-02, GM-NV-03, GM-NV-04, GM-NV-05, GM-NV-06, GM-CO-01, GM-CO-02, GM-CO-03, GM-CO-04, GM-A11-03, GM-A11-04, GM-PM-01) · **P3 = 12** (GM-CR-05, GM-NV-07, GM-NV-08, GM-NV-09, GM-NV-10, GM-CO-05, GM-CO-06, GM-CO-07, GM-CO-08, GM-A11-05, GM-A11-06, GM-A11-07). **Total 31.**

#### 4. Proposed cleanup brief (from v0.45.1; the module stays 0.x)

**Release A — 0.45.2 (patch: accessibility and contrast fixes, no layout change)**
1. GM-A11-01 / GM-CO-08: replace the hidden-input labels (Import, Organize rules Import, Codex restore) with a shared "file button" helper: a `<button class="ag-btn">` plus a visually hidden input. Keep the busy-disable from 0.44.1.
2. GM-A11-02: deity links become `<button>` in `hbs:428` and `codex.js:234`. Update the codex render tests.
3. GM-A11-03, GM-A11-04: menuitem file button; drawer chips become toggle chips (`aria-pressed` only).
4. GM-CO-02: use `--ag-*-ink` tokens for toned text on soft fills.
5. GM-A11-06, GM-CO-05, GM-CO-06: Open button aria-labels, toned History badges, short search placeholder.
6. CHANGELOG ("keyboard can now choose an import file…"), bump `version` + `download` URL, `node scripts/check.mjs ashen-gate-manager`.
   - Robb verifies in Forge: open Manager → Import, press Tab until **Choose JSON or ZIP package** is focused, press Enter, and the file picker opens. In Items → NPC Codex with a linked deity, Tab reaches the deity link. Switch to the Parchment skin and check that the Codex Party/Characters segments read clearly.

**Release B — 0.46.0 (minor: navigation restructure)**
1. GM-NV-01: new top-level **Codex** tab. Remove `codex` from `ITEM_VIEWS` and keep a redirect for the saved `itemsView==='codex'` and Browse's `openCodex` (`main.js` `browse()` factory).
2. GM-NV-03 / GM-NV-02: Items gets text sub-tabs **Browse · Records · Maintenance · Export**. Maintenance holds Folders, Core links and Checks as its own sub-sections. The shared filter toolbar shows only on Browse, Records, Maintenance→Folders and Core links. Scenes' rail becomes text sub-tabs **Live · Moods & layers · Export & import**.
3. GM-NV-04 / GM-NV-05: GM Setup → Developer Tools gains the sample/starter/manifest downloads and the Adopt & tag workflow (moved out of the Items rail). Import Options keeps a single draft control (the profile select).
4. GM-CR-01: All items puts its facets in a "More filters (n)" `<details>` and drops the duplicate selects.
5. GM-CR-02: Folders split into **Clean** (open) / **Organize a selection** / **Rules & protected folders** / **History** folds. Help paragraphs shortened.
6. GM-NV-06 / GM-NV-07: GM Setup → World appearance uses the skin cards and is the only world-default editor. The header button becomes **My Appearance** (personal skin + size). Headers standardised to `actions · version · Help`. My Appearance and player Codex get Help.
7. Saved data: `itemsView`/`librarySection` are in-memory only, so no migration is needed. The `importLayout` folds are unchanged. Bump minor, CHANGELOG, check.mjs.
   - Robb verifies: every former Items rail entry is still reachable (Codex tab, Items sub-tabs, Developer Tools). Browse → Open on an NPC lands on the Codex tab. Changing the skin in GM Setup updates players live.

**Release C — 0.47.0 (minor: component consolidation and cross-module theming)**
1. GM-CO-01: swap `.aglib-rail/.aglib-split/.aglib-kv/.agcodex-seg/.agmanager-result/.agmanager-presession-row/.agmanager-history` for the kit's `.ag-siderail/.ag-split/.ag-kv/.ag-segmented/.ag-card/.ag-rows`, and delete the replaced CSS. Re-check under Stone Tablet and Tome Pages.
2. GM-CR-03 / GM-CO-03: Codex detail sub-tabs **Reveals · Notes & links · Player preview**, with the instant-save parts labelled. GM-CR-04: the moods editor replaces the list while editing.
3. GM-PM-01: Manager exposes `ag-player-access/1` for the NPC Codex (state = existing `CODEX_ACCESS_SETTING`, so there is no new persisted data). The Modules tab card and Hide all then cover it.
4. GM-CO-04 (Manager side): document that `applyTo` is not needed for windows under `<html>`, and note it in the API comment. Open matching small patch tasks for Locations and Character Hub to drop their per-render `applyTo(content)` calls.
5. GM-CO-07: delete `appearance-consumer.mjs` and its test (or align its fallback to kit `:root`). GM-A11-05, GM-A11-07, GM-NV-08, GM-NV-09, GM-NV-10 polish.
6. Bump minor, CHANGELOG, check.mjs.
   - Robb verifies: with Locations open, switch skin in Manager. The Locations window recolours fully without reopening. Modules tab shows a Codex card, and Hide all hides the player Codex menu.

---

### ashen-gate-utilities (v0.25.0, main 8931b9d)

This is a read-only audit. I read `module.json`, `scripts/main.mjs`, `shops.mjs`, `shop-buy.mjs`, `shop-sell.mjs`, `services.mjs`, `merchant-lists.mjs`, `party-fund.mjs`, `shop-import.mjs`, `item-tips.mjs` and `styles/utilities.css`, and checked the changes between 3977194 and 8931b9d (0.22.2 → 0.25.0).

There are no templates: every view is an HTML string built in JS. `node scripts/ui-lint.mjs ashen-gate-utilities` passes. File:line refs are to 8931b9d. Everything here comes from reading markup and CSS, not from a live render.

**Fixed since the first pass (dropped):**
- The overlay contrast finding: 0.23.0 added a per-user background slider and made the header and text solid.
- The duplicated coin strip: 0.24.0 added the shared `coinStripHTML` / `coinChipsHTML` in `core.mjs:723-730`.

**Partly fixed:** Party Inventory crowding. 0.25.0 moved the purse to a **Party Fund** sub-tab, leaving one line on Items. It is re-scoped as UT-05 and UT-06.

#### 1. Window inventory

| Window / surface | Tabs and sub-tabs (exact labels) | Who | Where |
|---|---|---|---|
| **Actors-sidebar launcher** "Utilities" | n/a | GM; players only with Player Access | `main.mjs:1219` |
| **Main window** `UtilitiesApp` (title "Ashen Gate \| Utilities", 900×690) | Header: `Ashen Gate \| Utilities` with the subtitle "Group challenges, individual requests and party utilities". Right side: Appearance (only when Manager is active), `v0.25.0`, Help. | GM / player | `main.mjs:283-294` |
| ↳ **Rolls** | No sub-tabs. Shows the session card or the last result. Below it, the GM's **Start Rolls** card, or the player's **Your roll is requested** panel. | both | `main.mjs:124-200` |
| ↳ **Party Inventory** | GM status card "Party Stash" (On/Off badge, Turn On/Off for Players, Award Gold, Create Party Stash). Below it, `ag-tabs` sub-tabs: **Items** (purse in one line with a "Deposit, take or change coins" button, search/Take-into toolbar, type-grouped grid, drop zone, note), **Party Fund** (Party purse strip with Character/Coin/Amount and Deposit/Take, GM Adjust Purse / Convert; **Change coins** form; **Log** of the last 20 with Full History) and **History** (Award Gold, Clear History, entries with Undo). | both (players only while the stash is on) | `main.mjs:207-212`, `845-857`, `1009-1100`; `party-fund.mjs:99-125` |
| ↳ **Shops** (GM) | `ag-segmented` **Shops** / **Shop editor** / **Merchant lists**. **Shops**: toolbar (search, sort, count, Import JSON, Export, New shop, New service) and rows grouped by settlement. While a file is open, the Import preview replaces it. **Shop editor**: the shop editor (name, settlement, merchant fields with an Actor drop zone, flavour, GM notes, Items for sale table grouped by type, item drop zone, Merchant's coins, Buys from players, Danger zone) or the service editor (Bank shown as deprecated, its Log, Danger zone). **Merchant lists**: a card grid, each card with Shared with + Share…, "n of m open" + Open all / Close all, entry rows each with an Open/Closed switch, Edit, Delete. The list editor replaces the grid. | GM | `shops.mjs:241-425`; `merchant-lists.mjs:139-226`; `shop-import.mjs:83-96`; `services.mjs:259-270` |
| ↳ **Shops** (player) | `ag-segmented` **Open shops** / **Merchant list**. Each entry is either Open (Open shop) or Closed (Look inside, read only). | players while Shops is on | `shop-buy.mjs:407-424` |
| ↳ **Roll Tables** | GM: "RollTable Messenger" and Last draw. Players: only an empty state. | both | `main.mjs:216-222` |
| ↳ **Conditions** | Pop Out Overlay; Party Characters roster; detail pane (Owner changes lock line, conditions with Remove, Apply); **Condition controllers** line with Revoke (GM) or a badge (controller); a long note. | both | `main.mjs:235-250` |
| ↳ **History** (GM) | "Completed & Cancelled Checks" (rolls only) | GM | `main.mjs:251-257` |
| ↳ **GM Setup** (GM) | Player Access, stash / votes / electrum; **Party Fund** (Coin exchange fee); **Shopping**; **Conditions** (owners manage, Condition controllers). Footer: Cancel / status / Save Changes. | GM | `main.mjs:260-281` |
| **Conditions overlay** (title "Party Conditions") | Opacity slider, conditions per character with × | each user | `main.mjs:527-545` |
| **Vote prompt** `StashVotePrompt` (title "Party Stash: Approve?") | Deny / Accept | other connected players | `main.mjs:959-970` |
| **Shop window** (title = shop name, 560×640) | Head; coin strips (Party purse, Your coins + select, Merchant's coins); **Buy / Sell** `ag-segmented`; ware cards grouped by type with Buy…; Sell list; or the Bank form (deprecated) | players (GM via Open) | `shop-buy.mjs:375-404`, `467-495`; `shop-sell.mjs:174-190`; `services.mjs:47-70`, `235-242` |
| **Embedded stash** (`api.embed.mount`, Character Hub) | Items body with the full purse strip | partner window | `main.mjs:1134-1200` |
| **Dialogs** (kit) | Award Gold, Adjust Party Purse, Convert Electrum, Present <shop>, Share <list>, Change the merchant's coins, Buy/Sell (form, then choice), Help. Labelled confirmations for: skip/end/cancel, undo, clear history, revoke controller, delete shop/service/list, discard, stop showing. | GM / player | `main.mjs:651`, `791`, `830`, `398`; `shops.mjs:496-575`; `shop-buy.mjs` buy; `merchant-lists.mjs:185-221` |

**Still good:**
- The header follows the convention.
- GM Setup holds settings only, with Save/Cancel in the footer.
- Confirmations have specific labels.
- Icon-only buttons carry `aria-label`. Item links are real `<button>`s with a focus ring (`utilities.css:230`).
- Long lists are grouped: the stash and wares by type, shops by settlement.
- Reduced motion is respected.
- GM writes are rejected in the API (`gmOnly()` / `isGM()`), and player actions are re-checked on the GM client. No permission is enforced only in the UI.

#### 2. Findings

##### Crowded

| ID | Pri | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| UT-01 | P1 | M | Shops → Shop editor, `shops.mjs:365-386` (table `325-341`, merchant fields `348-354`, settlement `356-364`) | The shop editor is one long page. In order, it holds: a form grid (name, settlement, merchant name, art, an Actor drop zone with a linked note, flavour, GM notes), a 7-column items table with inputs in every row, an item drop zone, Merchant's coins, Buys from players, and a Danger zone. 0.24.0 added the settlement and Actor-drop blocks. At 900 px the table scrolls sideways, and with many items the coin and buying settings end up far below. | Use kit `ag-tabs` inside the editor: **Details** (name, settlement, merchant, flavour, GM notes, Danger zone at the end), **Items** (table and drop zone), **Coins & buying**. Keep the footer Save/Cancel across all three. Move Flavour and Cost out of the main table row, into a second line under the item or a per-row `<details>`. |
| UT-04 | P2 | M | Rolls, `main.mjs:198-200`, `124-135` | The GM's Start Rolls card (mode radios, title, every character, 18 skill checkboxes, DC, count) always renders below the running session or the last result. | Put Start Rolls in a `<details class="ag-section">` that is open only when nothing is running and no result is shown, or add sub-tabs **Current** / **Start Rolls**. Show the skills as an `ag-chip-group` of aria-pressed chips, the same pattern as the shop's "Item types it buys". |
| UT-05 | P2 | M | Party Inventory → Party Fund, `main.mjs:1043-1048`, `845-857`; `party-fund.mjs:99-115` | Party Fund stacks three bordered blocks: the purse strip with its own Character/Coin/Amount form, Change coins with its own "Whose coins" select, then the Log. That makes two independent character pickers on one page, and the log is pushed below two forms. Deposit/Take are small default buttons while Confirm exchange is primary, so the two forms look different in weight. | Use one "Character" picker at the top of Party Fund that drives both Deposit/Take and Change coins. Show the purse coins, then the Deposit / Take / Change coins actions as a segmented choice that reveals one form at a time. Give each form the same primary button style. Keep the Log below, collapsible. |
| UT-06 | P2 | S | Party Inventory GM status card, `main.mjs:211` | The GM's "Party Stash" card stays above the sub-tabs on every sub-tab. It holds a badge, an explanatory paragraph, the stash name and count, and two or three buttons, so it pushes Items, Party Fund and History down. | Shrink it to one `ag-toolbar` line above the sub-tabs: stash name · count · On/Off badge · Award Gold. Move the paragraph to Help. Remove the toggle (UT-07). |
| UT-08 | P2 | S | Shops list rows, `shops.mjs:241-253` | Each row's end holds up to 3 badges (shown to, hidden count, cash chips) and 4 buttons (Edit, Duplicate, Open, Stop showing). They wrap onto 2–3 lines. | Keep Edit and Present…/Open/Stop showing in the row. Move Duplicate into the editor header. Put cash into `ag-row__meta`. |
| UT-15 | P2 | M | Merchant lists card, `merchant-lists.mjs:139-149` | Each card stacks: head, Shared with + Share…, a toolbar (count, Open all, Close all), one row per entry (name, meta, a "Shown to …" badge, an Open/Closed switch), a hint paragraph, then Edit/Delete. In a narrow `ag-card-grid` column the switch and badges wrap, and a list with 10+ stores makes a very tall card. The per-entry "Shown to …" badge repeats the Open/Closed switch. | Make the card a summary: name, settlement, Shared-with badge, "n of m open", and the actions Share… / Open all / Close all / Edit / Delete. Put the entries in a `<details><summary>Stores (m)</summary>` with just the name and switch per row. Drop the duplicate `shownBadge` from entry rows. Move the hint into Help. |
| UT-17 | P2 | M | Shop window, `shop-buy.mjs:393-403` | Up to three coin strips (Party purse; Your coins with a character select; Merchant's coins) render above the wares. In the 560 px window they stack one per row, so "For sale" starts below the fold. | Show one compact line: "Paying as [character ▾]" followed by that character's coins as chips. Put the Party purse and Merchant's coins in a collapsed `<details><summary>Coins</summary>`, or show them in the Buy preview, which already lists before → after. |
| UT-19 | P3 | S | Shops toolbar, `shops.mjs:259` | The toolbar end has four buttons plus a hidden file input, and it wraps at narrow widths. | Group Import JSON / Export into one `ag-btn-group`, kept left of the create actions. See UT-18 for New service. |
| UT-20 | P3 | S | Long notes: Conditions `main.mjs:249` (0.23.0 made it longer), Party Inventory `main.mjs:211`, `1026`, GM Setup hints `main.mjs:263-276`, list card hint `merchant-lists.mjs:147` | Always-visible paragraphs repeat what Help says. | Move them into `helpHtml()` (`main.mjs:258`) or a collapsed "How this works" `<details>`. Keep one-line hints. |

##### Inconsistent navigation

| ID | Pri | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| UT-02 | P1 | M | Sub-tabs: Shops GM `shops.mjs:412-417`; Shops player `shop-buy.mjs:422`; stash `main.mjs:1032` | Stash sub-tabs use kit `ag-tabs` (`role=tab`), but the Shops sub-tabs use `ag-segmented` (`role=radio`), which is the kit's value switch. | Use `ag-tabs` for every sub-section. Keep `ag-segmented` only for value switches: Buy/Sell (`shop-sell.mjs:174`), Coins go to, Result mode. |
| UT-03 | P1 | M | "Shop editor" sub-tab, `shops.mjs:367`, `412`; list editor `merchant-lists.mjs:166` | "Shop editor" is a permanent sub-tab. With nothing open it is an empty "No shop open" page, and the label is "Shop" even when editing a service. The merchant-list editor works the other way, replacing its grid in place. | Remove the sub-tab. Edit / New open the editor in place of the list, with a "← All shops" ghost button and the existing footer. Sub-tabs become **Shops & services** / **Merchant lists**. |
| UT-07 | P2 | S | Party Inventory `main.mjs:211` (`toggle-stash`); Conditions `main.mjs:237-239` (`revoke-controller`) | Two GM Setup settings can be changed outside GM Setup and take effect immediately. "Turn On/Off for Players" writes *Party Stash on for players* without Save Changes. The 0.23.0 "Revoke" in the Conditions tab writes the *Condition controllers* setting directly; it is confirmed, but it bypasses the GM Setup save model. | Remove the stash toggle and show a read-only badge "Off for players · change in GM Setup". For controllers, either keep Revoke as a deliberate quick action and add it to the CLAUDE.md exceptions, or link to GM Setup instead. Ask Robb which he prefers. |
| UT-09 | P2 | M | Histories: GM **History** tab `main.mjs:251` (rolls only), stash History `main.mjs:1093`, Party Fund Log `main.mjs:1043-1047`, Bank Log `shops.mjs:390-396` | There are now four logs, and the top-level tab named just "History" covers only rolls. | Make roll history a GM sub-tab of Rolls (**Current** / **History**) and remove the top-level tab (GM tabs go from 7 to 6). Alternatively, rename the tab **Roll History**. The Party Fund Log's "Full History" link already points to stash History, so keep that. |
| UT-10 | P2 | S | Shop editor, `shops.mjs:371`, `379`, `309` | The editor has a Save/Cancel footer, but several buttons in it write immediately: Restock, Add / Remove / Set…, Restock cash, Present…, Stop showing. A GM can reasonably expect Cancel to undo them. | Group the immediate actions in the editor head under a label "Applies now", or disable them while the draft has unsaved changes and show the hint "Save first". |
| UT-11 | P2 | S | Roll Tables for players, `main.mjs:216`, `287` | Players get a tab whose only content is "Roll tables are run by the GM". | Hide the tab for players, as History and GM Setup already are (`main.mjs:287`). |
| UT-21 | P3 | S | Subtitle `main.mjs:293`; footer status `main.mjs:281` | The subtitle doesn't mention the stash, Party Fund or Shops. On most tabs the footer reads "Native permissions apply". | Subtitle: "Rolls, party inventory, shops and conditions". Drop the footer filler. |
| UT-22 | P3 | S | Rolls session, `main.mjs:195` | "Cancel Session" (left) and "End & Record" (right) are both plain buttons. | Make End & Record `primary` and Cancel Session `ghost`. |
| UT-23 | P3 | S | Merchant-list editor, `merchant-lists.mjs:150-163` | The editor has no Share… and no Delete; both live only on the card. | Add a Share… button to the editor head, and the same "Danger zone → Delete list" section the shop editor has. |
| UT-24 | P3 | S | Settlement select: list editor `merchant-lists.mjs:153`, shop editor `shops.mjs:356-364` | The shop editor lists only Locations' *settlements*, typed fallback included. The list editor lists *every* location and has no typed fallback, yet both are labelled "Settlement". | Reuse `settlementField` (exported from `shops.mjs`) in the list editor. |
| UT-18 | P3 | S | New service, `shops.mjs:259-260`; `services.mjs:262-263` | Bank is the only service type and is deprecated in 0.25.0, but "New service" is still a full-size create button next to "New shop", and the empty state still suggests it. | Make it a ghost `sm` button labelled "New Bank (deprecated)" after Import/Export, and drop it from the empty-state text. Keep it so existing worlds can still create a Bank. |
| UT-33 | P3 | S | Player Shops, `shop-buy.mjs:422`, `407-418` | The player sub-tab is "Merchant list" (singular) where the GM's is "Merchant lists". Open stores show in both Open shops and every list that holds them. | Rename it "Merchant lists". Optionally mark entries that are also in Open shops with a short "also in Open shops" meta note. |

##### Inconsistent components

| ID | Pri | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| UT-12 | P2 | M | Rows hand-rolled with `.agu-participant` / `.agu-history`: `main.mjs:184`, `222`, `245`, `255`, `1092` (also used by the Party Fund Log); CSS `utilities.css:37-62` | Shops, lists, import, sell and the Bank log use kit `ag-rows` / `ag-row`. Rolls, roll History, Conditions, stash History and the new Party Fund Log use custom rows with their own borders and a larger font. | Move these to `ag-rows` / `ag-row` (title, meta, end) and delete `.agu-participant` / `.agu-history`. |
| UT-13 | P2 | M | Stash grid, `main.mjs:1007-1027`; CSS `utilities.css:106-122` | The stash is a hand-built `role="table"` CSS grid, while the shop editor uses `ag-table`. | Use `ag-table-wrap` / `ag-table` per type group, and hide columns at narrow widths with a container query. |
| UT-14 | P2 | S | Vote prompt, `main.mjs:960-965` | The window title is "Party Stash: Approve?" even when `purpose==='shop'`, which is spending the purse in a shop. The buttons are bare "Deny" / "Accept". The seconds count is frozen at render time. | Set the title by purpose ("Party purse: approve purchase?" / "Party stash: approve take-out?"). Label the buttons "Deny purchase" / "Allow purchase" (or the take-out equivalents). Either tick the countdown or say "within 60 seconds". |
| UT-16 | P2 | S | Merchant lists **Close all** and the per-entry switch, `merchant-lists.mjs:146`, `178-181`, `210-215` | Close all stops showing every store on the list *to every player* with no confirmation. The single Closed switch does the same for one store. A store that is on another list shared with different players, or that was presented on its own, is closed there too, which is a side effect outside this card. | Add a labelled confirmation to Close all: "Close n stores for every player?", naming any that are also on other shared lists or presented directly. Do the same for the per-entry switch only when the store is shown to players outside this list's audience. Open all can stay unconfirmed. |
| UT-25 | P3 | S | Empty states: `main.mjs:61` (no icon), `shop-buy.mjs:385` (always the store icon), inline in `shops.mjs:260-261`, `327`, `367`, `merchant-lists.mjs:168`, `shop-import.mjs:86` | Three styles: with an icon, without one, and with a CTA. | Use one shared `empty(title,text,{icon,action})`. |
| UT-26 | P3 | S | Button helpers: `btn` (`main.mjs:56-59`) and `button` (`shops.mjs:228`) | They differ in which kinds they accept and in icon support. | Keep one. |
| UT-27 | P3 | S | Coin text: shop surfaces use `coinChipsHTML`; stash History, the Party Fund Log (`main.mjs:1080-1092`), purse notes and confirmations use plain "10 gp" | Since 0.24.0 the coin style is shared, but logs and dialogs still show plain text. | Use `coinChipsHTML` in history lines and the fund log, or decide that plain text is the convention for logs and dialogs and say so in CLAUDE.md. |
| UT-28 | P3 | S | Recipients fieldset, `main.mjs:219` | A full `ag-empty` block is nested inside a fieldset. | Use an `ag-field__hint` line. |
| UT-32 | P3 | S | Ware cards, `shop-buy.mjs:375-384`; CSS `utilities.css:218-232` | `agu-ware-card` / `agu-ware-grid` is a new hand-rolled card and grid. The kit has `ag-card` / `ag-card-grid` / `ag-card__actions`. | Build ware cards on `ag-card ag-card--compact` inside an `ag-card-grid`, keeping only the image/price layout in module CSS. |

##### Accessibility

| ID | Pri | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| UT-29b | P2 | S | All tab bars and sub-tabs (`main.mjs:292`, `1032`; `shops.mjs:416`; `shop-buy.mjs:422`) | Tabs have no arrow-key handling, `aria-controls` or roving `tabindex`, and some navigation uses radio semantics. | After UT-02, add one `bindTablist(root)` helper (Left/Right/Home/End, roving tabindex, `aria-controls`) and give `.agu-main` `role="tabpanel"`. |
| UT-29 | P3 | S | Shop sort select `shops.mjs:259`; list "add" select `merchant-lists.mjs:162` | These have an `aria-label` but no visible label. | Add `ag-field--inline` labels "Sort" and "Add". |
| UT-30 | P3 | S | `utilities.css:88` (text-shadow 3px/2px), `100` (outline 2px, offset -6px), `155`, `230` (2px) | Raw px values that ui-lint doesn't catch. | Use the kit focus/space tokens. |
| UT-31 | P3 | S | Stash deposit (drag only), the shop editor's item and merchant-Actor drop zones (`shops.mjs:353`, `381`) | Deposit and adding items work only by drag and drop, with no keyboard path. | Add "Deposit item…" and "Add item…" buttons that open a `formDialog` with a select or UUID input. Ask Robb first, since this adds new behaviour. |

#### 3. Counts

34 findings in total:
- **P1: 3**: UT-01, UT-02, UT-03.
- **P2: 15**: UT-04 to UT-17 and UT-29b.
- **P3: 16**: UT-18 to UT-33, except UT-29b.

(IDs are not strictly ordered by priority: UT-29b was added during re-verification.)

#### 4. Proposed cleanup brief (for a later Build chat)

These start from **0.25.0** and stay on 0.x. Each release:
- bumps `module.json` `version` and the `download` URL;
- adds a CHANGELOG entry;
- greps the module for the old version string, since tests assert it;
- runs `node scripts/check.mjs ashen-gate-utilities`.

None of these changes saved data; sub-tab state is in memory only, so no migration is needed.

**Release A: 0.25.1 (patch: fixes and small consistency)**
1. UT-14: vote prompt title and labels by purpose; fix or drop the frozen countdown.
2. UT-16: labelled confirmation for Close all, and for a per-entry close that reaches players outside the list.
3. UT-11: hide Roll Tables for players.
4. UT-07: remove the stash toggle from Party Inventory and show a badge instead. Ask Robb about Revoke in Conditions.
5. UT-22, UT-21, UT-20, UT-28, UT-29, UT-30, UT-33, UT-18, UT-24: small label, layout and token fixes.

Ask Robb to check in Forge:
- With the shop vote on, buy with the party purse and check the prompt title.
- Merchant lists → Close all, and check the confirmation.
- As a player, check there is no Roll Tables tab.

**Release B: 0.26.0 (minor: navigation restructure)**
1. UT-02 and UT-29b: one `ag-tabs` sub-tab pattern with keyboard support.
2. UT-03: drop the "Shop editor" sub-tab; the editor opens in place with a back button.
3. UT-01: editor inner tabs Details / Items / Coins & buying; Flavour and Cost out of the main row.
4. UT-10: "Applies now" group for immediate editor actions.
5. UT-08 and UT-19: Duplicate moves into the editor; Import/Export grouped.
6. UT-15 and UT-23: merchant-list card becomes a summary with collapsible stores; Share… and Delete in the list editor.
7. UT-09 and UT-04: Rolls gets Current / History sub-tabs; Start Rolls becomes collapsible.
8. UT-05 and UT-06: Party Fund gets one character picker and one action at a time; the GM stash card shrinks to a one-line toolbar.
9. UT-17: compact coin line in the shop window.

Ask Robb to check:
- Shops → Edit, then switch between the editor tabs, then Cancel and Save.
- Merchant lists → expand Stores, then Share….
- Rolls → History.
- Party Inventory → Party Fund: Deposit, Take and Change coins.
- A player shop window at default size.

**Release C: 0.26.1 (patch: kit components)**
1. UT-12 and UT-13: `ag-rows` for Rolls, History, Conditions and the logs; `ag-table` for the stash. Delete the dead CSS.
2. UT-32: ware cards on `ag-card` / `ag-card-grid`.
3. UT-25, UT-26, UT-27: one empty-state helper, one button helper, one coin text rule.
4. UT-31 only if Robb wants it, because it adds keyboard deposit/add behaviour.

Tests check logic only. Robb should look at the stash, the Conditions roster and the shop window at both Compact and Comfortable sizes and in a narrow window.

---

This audit was read-only and was taken against main at commit 8931b9d (Ledger 0.25.0, Headquarters 0.12.1). Line numbers refer to those files. The shared kit (`styles/ag-ui.css`, `ag-dialogs.mjs`, `ag-html.mjs`) is byte-identical to Manager's in both modules, and `scripts/ui-lint.mjs` reports nothing for either module. The findings below are about how each module uses the kit, not about the kit itself.

Priority: P1 = hurts daily use, breaks an explicit CLAUDE.md rule or blocks accessibility. P2 = noticeable friction. P3 = polish.
Size: S = under an hour in one file. M = one window. L = a restructure across windows.

---

### ashen-gate-profession-ledger (v0.25.0)

#### 1. Window inventory

| Surface | Who | Tabs / sub-views (exact labels) | Location |
|---|---|---|---|
| **Main window** `LedgerApp` (`#agl-window`, 1180×800), title "Ashen Gate \| Profession Ledger" | GM + players (Player Access gate) | Tabs: **Individual**, **Party**, **Recipe Catalog**, **Gathering**, then GM-only (`ag-tab--gm`) **Gathering Nodes**, **Assign**, **GM Setup** | `scripts/main.js:1548` (class), `:1571` `_tabs`, `:2043` `_prepareContext` builds the header, tabs, main and footer. `templates/ledger.hbs` is only `{{{html}}}` |
| ↳ Individual | all | Toolbar: search + Character picker. Character panel: Professions (cards; for the GM also **Award XP** and an **Adjust XP** `<details>`), Materials, Recipes to learn, Known recipes (folders by profession) | `:1576`, `characterPanel :617`, `professionCard :605`, `xpAdjustPanel :595` |
| ↳ Party | all | Toolbar: search + segmented **By player / By profession**. Party recipes (folders), Party materials, Professions | `:1583` |
| ↳ Recipe Catalog | all (GM sees every recipe) | Toolbar: search. GM-only **Catalog tools** card (**Import Ledger recipe/material JSON**, **Open General Manager**, visibility legend). Folders by profession | `:1626`, `:1638` |
| ↳ Gathering (player) | players | Pending "Your gathering check" cards, **Request gathering** form (lead, Helpers, node radios grouped by location, **Request gather**) | `:1958` |
| ↳ Gathering (GM) | GM | **Requests** queue, one card per open check (**Cancel check / Total / Record total / Roll for …**), last-result notice, **Start gathering**: segmented node source (**Location node / Node template / Ad-hoc node**), template picker or ad-hoc 8-field form plus **Exotic candidates** picker (filters, up to 50 rows), Lead gatherer, Helpers, **Use draft materials anyway**, **Start / Send gathering check** | `:1982`, `_gatherQueue :1938`, `_templatePick :1802`, `_exoticPicker :1907` |
| ↳ Gathering Nodes (new in 0.25.0) | GM | Toolbar: search, Activity filter, count, and at the end **Import nodes**, **Export**, **Copy Location nodes**, **New node** (primary). Folders by activity, each node card with **Edit / Duplicate / Delete**. Inline editor card (**Cancel / Save Changes**) and import preview (**Cancel / Apply import**) | `_nodes :1813`, `_nodeRow :1832`, `_nodeEditor :1846`, `_nodeImportPreview :1893` |
| ↳ Assign | GM | Toolbar: Characters select + **Preview**. Preview table grouped by character, **Add selected**, **Add all missing (n)** | `:1746` |
| ↳ GM Setup | GM | One long page: **Party** (roster), **Player Access**, **Tools and checks** (baseline file **Import baseline file… / Export current table**, preview **Cancel / Apply baseline**, 5-column table), **Exotic discovery**, **Crafted items**. Footer: **Cancel**, status, **Save Changes** | `:1662`, `_roster :1651`, `_toolSetup :1701`, `_baselinePanel :1728`, `_exoticSetup :1676`, `_coreAwardSetup :1684` |
| Help | all | `infoDialog('Profession Ledger help')` | `:2146` |
| Craft confirmation | crafter's owner | DialogV2 "Craft <recipe>?": check select, roll mode, **Cancel / Craft** | `:816–822` |
| Material consent | owner of the supplying character | DialogV2 "Allow <name>'s materials?": **Decline / Allow** | `:689` |
| Gathering roll popup | lead gatherer's owner | DialogV2 "Gathering check — <name>": **Later / Roll** | `:1167` |
| Confirmations (`confirmDialog`) | GM or owner | Learn <recipe>?, Adjust <prof> XP?, Add profession features?, Discard unsaved GM Setup changes?, Undo XP award?, delete node (labelled, names the referring Locations), legacy catalog import | `:1473`, `:1501`, `:2170`, `:2317`, `:1444`, `:2250`, `:2326` |
| Chat cards | all; XP controls GM only | Craft and gather cards. GM gets **Award <prof> XP** or **Undo award** | `decorateChatCard :1436` |
| Tidy5e **Professions** sheet tab | owner + GM | Same character panel plus **Open Profession Ledger** | `renderSheetTab :2332`, `registerTidyTab :2404` |
| Embed (`api.embed.mount`, Character Hub) | owner + GM | Same character panel | `mountEmbed :2369` |
| Actors-sidebar launcher **Professions** | player-facing, gated by Player Access (correct per CLAUDE.md) | — | `addActorDirectoryLauncher :2521` |
| Settings menu **Open Profession Ledger** | GM only (`restricted:true` since 0.25.0) | — | `:2428` |

Permissions: every GM action I traced is rejected in the data layer as well as hidden in the UI. That covers `awardXP`, `adjustXP`, the gathering start/resolve/cancel/approve/decline functions, assign, crosswalk, the Exotic API and the node templates. I found no UI-only permission gaps.

#### 2–3. Findings

| ID | Pri | Size | Where | What's wrong | Fix |
|---|---|---|---|---|---|
| **PL-01** | **P1** | S | `main.js:822` (craft dialog), `:824` | **Bug: the craft dialog ignores the player's choice of check.** The **Craft** button callback returns only `{mode}`. Line 824 then looks up `answer.check`, which is always `undefined`, so the preset check is always rolled even when the player picked another tool or skill in "Check (bonus)". This is still present at 8931b9d. | Return `{mode, check: button.form.elements.check?.value}` from the callback, and add a test that picks the second option. |
| **PL-02** | **P1** | M | Gathering tab, GM view, `:1982–2042` (with `:1802`, `:1907`, `:1938`) | **Crowded, and worse in 0.25.0.** One scrolling page holds the request queue, every open check card, the last-result notice, then the Start form: a three-way source switch, then either the template picker or an 8-field ad-hoc form plus an Exotic picker with up to 50 rows, then lead and helpers, a long draft-materials checkbox label and Start. New requests and checks push Start further down during play. | Add GM sub-tabs inside Gathering (`ag-segmented` or a second `ag-tabs` row): **Requests (n)** · **Active checks (n)** · **Start gathering**. Open on Requests when n>0. Put the last-result notice in Active checks. Collapse the ad-hoc Exotic picker into `<details>` "Exotic candidates (n chosen)". Shorten the draft checkbox label to "Use draft materials anyway" and move the explanation into an `ag-field__hint`. |
| **PL-03** | P2 | M | Gathering Nodes, `_nodes :1813`, `_nodeEditor :1846`, `_nodeImportPreview :1893` | **Crowded (new tab).** The editor opens inline *above* the node list. It is long: 12 fields, a professions fieldset, three material tables and "Node test", with Save Changes at its very bottom. Editing a node near the end of the list jumps the GM to the top. The import preview stacks in the same place. | Show the editor as a split detail (`ag-split`: list on the left, editor on the right), or replace the list while editing with a "← Back to nodes" link. Group the editor into `<details>` sections **Basics**, **Check**, **Materials** (open), **Node test** (closed). Keep Cancel bottom-left and Save Changes bottom-right. |
| **PL-04** | P2 | M | GM Setup, `:1662–1745` | **Crowded.** Five sections stack on one page: a roster of every world character, a long explanation, the baseline import and preview, a 5-column table of every profession, and two single-setting cards. The single Save Changes footer is correct and should stay. | GM Setup sub-tabs **Party** · **Tools and checks** · **Gathering & crafting** (Exotic discovery, Crafted items) · **Player Access**, all sharing one footer and the existing draft/dirty tracking. Move the baseline file panel into a `<details>` "Baseline file". |
| **PL-05** | P2 | S | Recipe Catalog, `_catalogTools :1626` | **Ownership and navigation.** The GM "Catalog tools" card sits between the search and the list. It offers **Import Ledger recipe/material JSON**, a legacy source importer, although General Manager owns source import. The card also pushes the recipe list down. | Move the legacy import into a GM-only `.ag-devtools` "Developer Tools" `<details>` at the end of GM Setup, or remove it (ask Robb). Put **Open General Manager** at `ag-toolbar__end`. Fold the badge legend into the existing GM notice. |
| **PL-06** | P2 | S | `_gatherQueue :1938–1957` | **Hand-rolled list.** `agl-request-list` / `agl-request` still have no CSS rules, so each request renders as a bulleted `<ul>` of loose paragraphs. **Approve** is not the primary button. | Render each request as `ag-card ag-card--compact` (or an `ag-row`), with the reason field above, **Decline** (ghost) on the left and **Approve** (primary) on the right. |
| **PL-07** | P2 | M | `professionCard :605`, `xpAdjustPanel :595` | **Crowded.** For the GM, every profession card in the narrow side column carries Award XP (input and button) plus an Adjust XP disclosure (three inputs, Apply, history). This repeats in the sheet tab and the Character Hub embed. | Put one `<details>` "GM: XP" per card, holding Award / Adjust (an `ag-segmented` switch) and the history list. |
| **PL-08** | P3 | S | `ledger.css:38–39` `.agl-xpbar`, plus `.agl-avatar`, `.agl-label`, `.agl-section h3`, `.agl-panel h2`, `.agl-management-actions` | **Kit bypass.** These duplicate `.ag-meter`, `.ag-portrait`, `.ag-eyebrow`, `.ag-section__head/__title` and `.ag-btn-group`. The XP bar `role="progressbar"` also has no accessible name. | Switch to the kit classes. Give the meter `aria-label="<Profession> XP"`. |
| **PL-09** | P3 | S | Party tab "By player" folders, `:1603` | **Accessibility.** The GM button **Open <name>'s view** sits inside `<summary>`, so an interactive control is nested in another one. | Move the button into the folder body, outside the summary. |
| **PL-10** | P3 | S | `_tabs :1571`, `<main role="tabpanel">` `:2053` | **Accessibility.** Tabs have no `id`/`aria-controls`, the panel has no `aria-labelledby`, and there is no arrow-key roving. Headquarters has the same gap (HQ-13). | Add ids and `aria-controls`, and add Left/Right/Home/End handling. |
| **PL-11** | P3 | S | `_baselinePanel :1728+` | **Apply baseline** writes a world setting but is styled as a plain button. (The newer node import's Apply is already primary.) | Make **Apply baseline** `ag-btn--primary`. |
| **PL-12** | P3 | S | `ledger.css:94` `.agl-node.is-off{opacity:.7}` | **Contrast risk.** Opacity dims the reason text along with the label. | Use `color: var(--ag-muted)` on the title only, and keep the reason at full contrast. |
| **PL-13** | P3 | S | `_tabs` vs Headquarters `TABS`; GM Setup **Cancel** `:2147` | **Inconsistent with Headquarters.** Ledger tabs have no icons while Headquarters tabs do. Ledger Cancel discards *and* leaves GM Setup, while Headquarters Cancel resets and stays. | Agree one convention for the suite: tab icons, and Cancel = discard drafts and stay on GM Setup. |

#### 4. Proposed cleanup brief (Profession Ledger)

1. **0.25.1 (patch)**
   - PL-01: return the chosen check from the craft dialog, and add a test.
   - PL-06: style the request queue with kit rows and make Approve primary.
   - PL-11: make Apply baseline primary.
   - PL-12: replace the node opacity with muted colour.
   - PL-09: move the "Open <name>'s view" button out of `<summary>`.
   - PL-08 (meter only): replace `.agl-xpbar` with `.ag-meter` and add an aria-label.
   - Bump `VERSION` in `main.js`, the `module.json` version and download URL, and any `0.25.0` test assertions. Add a CHANGELOG entry.
2. **0.26.0 (minor)**
   - PL-02: Gathering GM sub-tabs Requests / Active checks / Start gathering.
   - PL-03: Gathering Nodes editor as a split detail with collapsible sections.
   - PL-07: one "GM: XP" disclosure per profession card.
   - PL-10: tab ARIA wiring and arrow keys.
3. **0.27.0 (minor)**
   - PL-04: GM Setup sub-tabs.
   - PL-05: legacy JSON import moved into a GM-only Developer Tools area, or removed (ask Robb).
   - PL-08 (remaining kit swaps).
   - PL-13: suite alignment, done with Headquarters.

To check in Forge after each release:
- **0.25.1:** as a player, craft a recipe that offers two checks. Pick the second and confirm the chat card names it.
- **0.26.0:** as GM, check that Gathering shows its three sub-tabs with counts. In Gathering Nodes, edit the last node and confirm the list stays where it was.
- **0.27.0:** as GM, change one setting on each GM Setup sub-tab, then press Save Changes once.

---

### ashen-gate-headquarters (v0.12.1)

#### 1. Window inventory

| Surface | Who | Tabs / sub-views (exact labels) | Location |
|---|---|---|---|
| **Main window** `HeadquartersApp` (`#ashen-gate-headquarters-window`, 1150×790), title "Ashen Gate \| Headquarters" | GM + players (Player Access gate) | Not activated, GM: **Activation**, **Facilities** (GM). Not activated, player: empty state, no tabs. Activated: **Guildhall Builder**, **Personal Quarters**, **Hirelings**, **Benefits**, then **Facilities** (GM), **GM Setup** (GM) | `js/main.mjs:180` (class), `:205` `page()`, `TABS :58`, `tabStrip :60`, `header :57`. `templates/main.hbs` is only a content host |
| ↳ Activation | GM | Card "Guildhall not activated": HQ ID, Location ID, Campaign key, Guild key, **Activate Guildhall**. Facility library list | `:222` |
| ↳ Guildhall Builder | all | Three columns: **Available Facilities** + **Canvas Tools** (zoom −/+), board, **Selected Facility** inspector (**Rotate 90°**, **Uninstall**; GM **Upgrade copy** + **Apply Upgrade**; Benefits; Staffing). Footer: **Edit Guildhall / Finish Editing / GM Take Over** | `:232`, `inspector :244`, `staffingInspector :275` |
| ↳ Personal Quarters | all (owner/GM edit) | Room picker (segmented for 2–4 rooms, otherwise a tab strip), **Personal Facility**, **Decorations** art grid, board, **Room Inspector** (**Rotate**, **Remove**) | `:251`, `roomTabs :263`, `decorInspector :268` |
| ↳ Hirelings | GM. Players see an empty state | **Hirelings Roster** cards (Working toggle, station form **Assign / Transfer / Update Station**, departure select + **Confirm Permanent Departure…**, **Individual perks** and **Personnel history** disclosures). Right column card **Add from imported Hireling definitions** (**Add to roster**) | `:289` |
| ↳ Benefits | all | **Informational Benefits** list with Active/Inactive badges | `:322` |
| ↳ Facilities | GM | Toolbar: search, Status, Placement, Sort, Group, count, **Import facility definitions**. Grouped rows (**Unlock**, **Acquire +1**). **Decorations** section (Image path, **Browse / Upload**, **Add art**) | `facilities :336`, `js/facilities-tab.mjs` `facilitiesPanel` |
| ↳ GM Setup | GM | Cards: **Player Access**, **Guild Rank** (**Set Rank**, applies at once), **Player rooms** (**Create Missing Player Rooms**), **Guildhall and canvas**, **Five-Rank Configuration**, `<details>` **Developer Tools** (**Seed Test Facility Records**). Footer: **Cancel**, status, **Save Changes** | `management :342`, `js/setup-form.mjs` |
| Help | all | `infoDialog('Headquarters help')` | `help :229` |
| Confirmations | GM / room owner | Unassign <name>?, Uninstall this facility? / Return this facility?, Remove this decoration?, Mark <name> as <status>? | `:409–417`, `:437` |
| FilePicker | GM | Background and decoration art | `:405` |
| Actors-sidebar launcher **Headquarters** | player-facing, gated by Player Access (correct) | — | `mountActorsLauncher` |
| Keybinding Shift+H, settings menu (GM-restricted) | all / GM | — | `init` hook |
| Embed (`api.embed.mount`, Character Hub) | owner + GM, read-only | Guildhall / Personal facility groups, **Open Headquarters** | `js/embed.mjs` |

Permissions: GM operations are enforced in `logic.mjs` (`requireGM`, `allowedToEdit`). Player edits can only travel through `PLAYER_OPS` in `player-intent-bridge.mjs`, and the public API getters are GM-checked. I found no UI-only permission gaps.

#### 2–3. Findings

| ID | Pri | Size | Where | What's wrong | Fix |
|---|---|---|---|---|---|
| **HQ-01** | **P1** | M | `tile :243`, decorations in `quarters :251`, `click :385`, `drop` | **Accessibility blocker.** Placed facilities and decorations are `<div data-installed>` / `<div data-decoration>` selected only by mouse click (no role, tabindex or key handler). Placing and moving work only by drag and drop. A keyboard user cannot select a piece, so the inspector's Rotate, Uninstall and Upgrade are unreachable, and nothing can be installed or moved. | Render tiles as `<button type="button" class="aghq-tile" aria-pressed aria-label="<name>, <w>×<h>, <rot>°">`, and do the same for decorations. In the inspector, add a "Move" nudge cluster (← ↑ → ↓ icon buttons with aria-labels) using the existing `move` / `move_decoration` ops. A keyboard "Install" for library rows needs a placement rule, which is a mechanics decision for Robb, so ask before adding it. |
| **HQ-02** | **P1** | S | GM Setup, `:348–349`, handlers `:400–401` | **Breaks the CLAUDE.md rule "GM Setup holds settings only".** **Create Missing Player Rooms** creates content, and **Guild Rank / Set Rank** changes campaign state immediately even though it sits inside the Save Changes form. Tests currently encode this placement (`facilities-tab.mjs` `SETUP_ACTIONS`, `tests/facilities-tab.test.mjs:34`), so this needs Robb's call. | Move **Create Missing Player Rooms** to a GM-only `ag-toolbar__end` button on Personal Quarters, where the empty state already points GMs. Move Guild Rank to a GM control on the Facilities tab toolbar (or a small "Guild" header row) behind a labelled confirmation "Set Guild Rank to N?" / "Set rank N". Update `SETUP_ACTIONS`, the tests and the Help text. |
| **HQ-03** | P2 | S | Tab click `:387` | **Unsaved GM Setup edits are lost silently** when the GM switches tabs. `markSetupDirty` sets the "Unsaved changes" status, but nothing guards the tab switch. Ledger guards this case. | Keep a `setupDirty` flag. On leaving GM Setup while dirty, show `confirmDialog('…', {title:'Discard unsaved GM Setup changes?', yes:'Discard changes', no:'Keep editing', danger:true})`. |
| **HQ-04** | P2 | M | Hirelings, `:289–321` | **Crowded, and the create action is in the wrong place.** The create action is a card in the right column rather than at the right of a toolbar. There is no search, filter or grouping. Each card stacks the Working toggle, the station form, the permanent-departure form and two disclosures. | Add a toolbar: search, Status filter (Active / Departed), count, and at `ag-toolbar__end` the imported-hireling select plus **Add to roster**. Group cards by employment status. Move the departure select into a `<details>` "Permanent departure…". Show Working as a labelled kit checkbox ("Working") instead of "Working: ON — toggle". |
| **HQ-05** | P2 | S | Hirelings `:312–318`, station select `:315` | **Raw internal values shown in the UI.** Employment status (lower-case token), perk status tokens and reasons ("…; default nonstacking"), history rows as `event · status · ISO timestamp`, internal copy keys `(copy_…)` in the station select. Also "Working ON/OFF" text. | Add label maps for status and perk status (kit badges: ok/warn), use `toLocaleString()` for dates, and show the facility name only (add "#2" when there are duplicates) in the station select. |
| **HQ-06** | P2 | S | `hirelings :291`, `page :213` | **The Hirelings tab is always empty for players.** It only says hirelings are kept by the GM. | Leave Hirelings out of the player tab list. The Benefits tab and embed already say what players need. |
| **HQ-07** | P2 | S | Facilities toolbar (`facilities-tab.mjs` `facilitiesPanel`), `main.mjs:404` | **Ownership.** **Import facility definitions** is a second importer, but General Manager owns source import and already calls `api.importFacilities`. | Replace it with a feature-detected **Open General Manager** button at `ag-toolbar__end`, or move the importer into the GM Setup Developer Tools. Ask Robb which. |
| **HQ-08** | P2 | S | Activation, `:227` | The four ID fields are **pre-filled with real values** (`value="HQ-DEMO-001"` etc.), so `required` passes and one click activates with demo IDs. | Change them to `placeholder`, so the fields start empty. |
| **HQ-09** | P2 | S | Facilities tab (`facilitiesPanel`) | **Crowded.** The **Decorations** add-art form sits below the full grouped catalog, so it drops out of view as the catalog grows. | Add an `ag-segmented` sub-view inside Facilities, **Facilities** / **Decorations**, or put Decorations in a `.ag-section` with its own `<details>` at the top. |
| **HQ-10** | P3 | S | Footer `:220` | Hirelings, Benefits and Quarters show "Auto-saved · View only" even while the GM is editing hirelings. The editing lease only applies to the Builder. | Show the lease and editor status only on Guildhall Builder. Show "Auto-saved" elsewhere. |
| **HQ-11** | P3 | S | `headquarters.css` `.aghq-hire-photo`, `.aghq-detail ul`, `.aghq-staff-list`; Facilities filter selects | **Kit bypass.** The hand-rolled portrait duplicates `.ag-portrait`. The inspector's staff and benefit lists are raw `<ul>` rather than `.ag-rows`. Filter selects have aria-labels but no visible labels. | Switch to the kit classes. Wrap the filters in `ag-field ag-field--inline` with short visible labels. |
| **HQ-12** | P3 | S | `roomTabs :264` | **Accessibility.** "You can edit this room" exists only as a tooltip on an `aria-hidden` icon, so screen-reader users never get it. | Add `<span class="ag-sr-only">(you can edit)</span>`. |
| **HQ-13** | P3 | S | `tabStrip :60` | **Accessibility.** Same tab ARIA and keyboard gap as PL-10: no `aria-controls`, no arrow keys. | Fix in the same way as PL-10. |
| **HQ-14** | P3 | S | `help :229` | The Help text says rooms are created "from GM Setup" and uses internal jargon ("Hirelings v1 personnel state", "HIRE/HPERK"). | Rewrite it after HQ-02, in plain player and GM language. |
| **HQ-15** | P3 | S | `facilities-tab.mjs` "stage(s)", uninstall message "Hireling(s)" | Lazy plurals. | Use a `plural()` helper like Ledger's. |

#### 4. Proposed cleanup brief (Headquarters)

1. **0.12.2 (patch)**
   - HQ-03: unsaved GM Setup guard.
   - HQ-05: human labels and dates.
   - HQ-08: placeholders instead of values on Activation.
   - HQ-10: lease status only on Builder.
   - HQ-11: kit swaps.
   - HQ-12: sr-only "you can edit".
   - HQ-15: plurals.
   - Bump the `module.json` version and download URL, search the module for `0.12.1` in code and tests, and add a CHANGELOG entry.
2. **0.13.0 (minor)**
   - HQ-02: move player rooms to Personal Quarters and Guild Rank out of GM Setup, behind a labelled confirmation. Update `SETUP_ACTIONS` and the tests.
   - HQ-14: Help rewrite.
   - HQ-06: no Hirelings tab for players.
   - HQ-04: Hirelings toolbar, grouping and departure disclosure.
   - HQ-09: Facilities / Decorations sub-view.
   - HQ-07: importer replaced by Open General Manager, after asking Robb.
3. **0.14.0 (minor)**
   - HQ-01: keyboard-operable board (tiles and decorations as buttons, inspector Move nudges). Ask Robb about a keyboard Install placement rule before building one.
   - HQ-13: tab ARIA, shipped together with Ledger's PL-10.

To check in Forge after each release:
- **0.12.2:** in GM Setup, change the Guildhall name, click the Benefits tab, and expect the discard prompt.
- **0.13.0:** as GM, the Personal Quarters toolbar shows Create Missing Player Rooms. As a player, there is no Hirelings tab.
- **0.14.0:** tab to a placed facility, press Enter, and use the inspector arrows to move it.

Tests (`node scripts/check.mjs`) prove the logic, not the live Foundry UI.

---

Audited at `main` **8931b9d**. Quest Log is **0.16.0** and Skill Trees is **0.19.4**.

This is a read-only audit. It checks the code against the CLAUDE.md UI conventions and the shared kit (ag-ui.css 2.1.0, ag-dialogs, ag-launchers). `scripts/ui-lint.mjs` passed for both modules. The audit reads code and does not test the live Foundry UI. Items marked *(verify in Forge)* depend on how things render in a live world.

Priority: **P1** hurts daily use, breaks an explicit CLAUDE.md rule or blocks accessibility. **P2** causes noticeable friction or inconsistency. **P3** is polish.
Size: **S** is under 1 hour in one file. **M** covers one window. **L** restructures several windows.

---

### ashen-gate-quest-manager (Quest Log, v0.16.0)

#### Window inventory

| Window / surface | Tabs, sub-tabs and sections (labels as shown) | Who | Where |
|---|---|---|---|
| **Quest Log** window, `Ashen Gate \| Quest Log`, 940×700 | Header: "Ashen Gate \| Quest Log", subtitle "Quests · Work orders · Contracts". On the right: *Show/Hide objectives overlay*, version, *Help* | GM; players when Player Access is on | `scripts/main.mjs:224-246` |
| ↳ **Party** tab | List column: search, *Status* select, *Notes for character* select, count, rows with *Track*. Reading pane: title, status, summary, **Objectives**, **Rewards**, **Locations**, **Shared party notes**, **Character notes** + *Save character notes* | all | `main.mjs:201, 214-222`, `readableDetail` `:60-70`, rows `:43-47` |
| ↳ **Individual** tab | Same as Party; the select is labelled *Character* | all | same |
| ↳ **Journal** tab (the "Game Journal") | Sidebar: search "Search journals", *New session*, GM: *Show archived sessions*; session rows (name, subtitle, "Session N · date", *Current* / *Archived* badges, pencil = rename inline with *Cancel* / *Save*), or search results. Page: session title/subtitle. Right side: players get *My journal* / *Party journal*; the GM gets a *Journal* select plus *Export Markdown* and *Archive session* / *Restore session*. Below that: notices, the formatting toolbar (Bold, Italic, Underline, Heading, Subheading "H3", Normal text, Bulleted list, Numbered list), the two-page book (contenteditable), and the footer *Discard changes* / status / *Save* | all, when Player Access is on and Character Hub (if active) shows Quests | `main.mjs:201-213`; `scripts/journal-ui.mjs:46-97` (markup), `:103-211` (binding); `styles/quest.css:152-207` |
| ↳ **Quests** tab (GM) | Sub-views (segmented): All, Drafts, Hidden, Active, Completed / Failed, Orders, Contracts (with counts). Toolbar: search, Type, Location, Visible, Group, Sort, count, *Import*, *Export*, *New quest*. List: bulk bar (*Select all N shown*, *Clear*, *Set status…* + *Apply*, *Hide*, *Reveal*, *Duplicate*, *Delete*), cards grouped with pick boxes. Editor: head (title, *Unsaved changes* badge, *Delete quest*), GM info notice, collapsible sections **Basics**, **Audience**, **Objectives** (per-objective Shown / Progress / Revealed), **Rewards** (suggested text; Item rewards table, drop zone, *Give rewards* panel with *Not now* / *Grant rewards*), **Campaign status and reveal**, **GM notes** (GM notes, issuer notes, `<details>` "Advanced: canonical source JSON", `<details>` "Delegated assignments (GM only)"). Sticky save bar: *Cancel* / status / *Save changes* (or *Create quest*) | GM | `main.mjs:71-199`; `gm-panels.mjs:30-78`; `quests-tab.mjs:6-16`; `rewards-ui.mjs:23-105` |
| ↳ **GM Setup** tab (GM) | **Player Access**, **Players' screens**, **Compendium packs**, **Objectives overlay** (button). Footer *Cancel* / *Save Changes* | GM | `gm-panels.mjs:80-94` |
| Dialogs | *Quest Log Help*; *Discard unsaved changes?* (Discard changes / Keep editing); bulk *Set N quests to X?* / *Reveal N quests?* / *Delete N quests?*; *Nothing to change*; *Bulk action finished*; *Remove this reward?*; *Give these rewards?*; *Rewards given*; *Give this reward again?*; *Delete this assignment?*; *Delete <quest>?*. Journal: *Replace the newer text?*, *Discard unsaved changes?*, *Archive <session>?*. Import uses the browser file picker | GM (help and journal: all) | `main.mjs:308, 321, 380-397, 423-424, 455-485`; `journal-ui.mjs:162, 187, 206` |
| **Objectives overlay** (fixed, draggable) | "Tracked objectives", fade slider, close (×), per-quest untrack (−) | any user with access | `main.mjs:530-560`, `quest.css:121-140` |
| Actors-sidebar launcher **Quests** | – | GM always; players by Player Access | `main.mjs` (`addLauncher`, `mountLauncher` call) |
| Embed (Character Hub) | Search, **Party** / *<character>* groups, *Open Quest Log*, reading pane | GM / owner | `main.mjs` (`embedHTML`/`mountEmbed`) |

Permissions are enforced in the data and API layer. Quest stores call `assertGM`. The Journal store checks every call (`journal-store.mjs:34-35, 57-95, 119-121, 129, 191`): player pages are readable only by their owner and the GM, archive/restore/export are GM-only, and archived sessions are read-only. No permission problems were found.

#### Findings: Quests, Party/Individual, Setup, overlay

| ID | P | Size | Where | What's wrong | Fix |
|---|---|---|---|---|---|
| QL-01 | **P1** | S | `main.mjs:55` (`locationLinks`, also used in the embed) | **Not keyboard reachable.** The location links are `<a class="agq-location" data-action="open-location">` with no `href`, so they cannot take focus or be activated from the keyboard. | Render them as `<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm">`, or add `href="#"` + `role="button"` and handle Enter/Space. |
| QL-02 | P2 | M | Editor `main.mjs:169-185, 103-107, 117-124` | **Mixed save models in one editor.** 0.15.0 added collapsible sections and one sticky *Save changes* bar, which is a big improvement. But two parts inside the sections still save on their own: Item rewards save as you change them, and Delegated assignments have their own *Save assignment*. The **GM notes** section mixes free-text notes, issuer notes, the Advanced source JSON and the assignments editor. Every section starts open (`open=k=>sections?.[k]!==false`), so a GM's first visit shows a very long pane. | (a) Start Rewards, Campaign status and GM notes collapsed on first use. (b) Move Delegated assignments into its own section, **Assignments (saved separately)**, with its own small footer. (c) In the Rewards section header, say "Item rewards save as you change them" so the GM doesn't expect *Save changes* to cover them. |
| QL-03 | P2 | S | Header `main.mjs:243`; GM Setup `gm-panels.mjs:90-92` | **Header and GM Setup break the conventions.** The header's right side holds the overlay toggle as well as version + Help. The same toggle is repeated in GM Setup. There it is a per-user preference that applies at once, while the tab promises "saved with Save Changes". | Keep only version + Help in the header. Move the overlay toggle to the Party and Individual toolbar (QL-04), and remove it from GM Setup (and from `SETUP_ACTIONS`). Update the Help text. |
| QL-04 | P2 | M | Player tabs `main.mjs:214-222` | **Navigation differs from the Quests tab.** The player tabs stack search, Status, character select and count vertically in the list column. Quests uses a full-width `ag-toolbar`. On Party, the *Notes for character* select sits with the filters, but it only chooses whose notes the reading pane shows. | Put a full-width `ag-toolbar` above the split: search, Status, count, and the overlay toggle at the right. Move the character picker into the **Character notes** heading on Party; keep it in the toolbar on Individual (*Character*). |
| QL-05 | P2 | M | `main.mjs:197`, `gm-panels.mjs:54-74` | **Crowded: three control bars before the first card.** The sub-view strip (7 segments) comes first, then the toolbar (search, 5 selects, count, Import, Export, New quest), then the bulk bar inside the ~14rem list column. Once quests are ticked, the bulk bar wraps a status select, *Apply*, *Hide*, *Reveal*, *Duplicate* and *Delete* into that narrow rail. | Put Type, Location and Visible in a `<details>` "Filters (n)" disclosure in the toolbar; keep Group and Sort. When something is ticked, show the bulk bar as a full-width row under the toolbar instead of in the rail (keep the hint line in the rail). Group Import/Export as an `ag-btn-group`. *New quest* stays far right. |
| QL-06 | P2 | M | `rewards-ui.mjs:23-48, 94-105` | **The rewards table is too wide for the editor.** It has 6 columns, with a number input and two selects per row, inside a collapsible section of the editor column. *Give rewards* opens a second table inside it, which needs horizontal scrolling at the default width. | Stack *Shown to players* and *Goes to* under the item name in one cell (label + select), which leaves 4 columns. Give the Give-rewards panel its own `agq-sec`-style box with the footer at its bottom. |
| QL-07 | P2 | M | `main.mjs:117-123, 481-483` | **Delegated assignments are edited as raw JSON.** *Edit* silently copies JSON into a textarea further down, with no scroll, focus or status. | Rename *Edit* to *Load into editor*, then focus and scroll to the textarea and show "Editing ASSIGN-…". Give it a *Cancel* / *Save assignment* `ag-footer` (and its own section, QL-02 b). |
| QL-08 | P3 | S | `module.json` title "Ashen Gate \| Quest Manager"; window "Quest Log"; launcher "Quests"; tab "Journal" vs code/folder "Game Journal"; Help "*Objectives Overlay* button" (the button is labelled "Show objectives overlay") | **The names don't match.** The module, window, launcher, tab and Help use different names. | Ask Robb for one name for the module and one for the tab. Use them in `module.json`, the header, `TABS` and Help. |
| QL-09 | P3 | S | `main.mjs:90-91` | *Individual character* is shown and active when Audience = Party (the hint says "Only for an individual quest."). | Show or enable it only when `#ag-scope` = individual. |
| QL-10 | P3 | S | `main.mjs:121, 332` | **The JSON overrides the form silently.** Once the GM types in "Advanced: canonical source JSON", it overrides the form on save, and the form still looks editable. | When the JSON is edited, set the save-bar status to "Saving from JSON; form edits are ignored" and give the form fields `aria-disabled`. |
| QL-11 | P3 | S | `main.mjs:418` | **Track redraws the whole window.** Ticking *Track* re-renders everything. The view-state code restores the scroll, but the round trip is visible. | Update the overlay and the checkbox without a full `render()`, as the search input does. |
| QL-12 | P3 | S | `main.mjs:168, 221` | The same GM info notice repeats on every editor view and on the GM's player tabs. | Show it once, in Help or in the Quests tab's empty state. |
| QL-13 | P3 | S | `main.mjs:486` | **Import has no preview or confirmation.** Manager's importer offers a preview (`previewQuestImport`). | Show the `previewQuestImport` result in a `confirmDialog` ("Import N quests") before writing, or point the button at Manager's importer. |
| QL-14 | P3 | S | `main.mjs:343` | **Closing the window drops unsaved quest edits.** `close()` saves unsaved journal text, but a dirty quest editor (`unsavedSource`) is dropped without asking. | In `close()`, ask *Discard unsaved changes?* when `unsavedSource` is set. |
| QL-15 | P3 | S | `quest.css:122`; `main.mjs:500-560` | **The overlay's default position may cover the sidebar.** It is now draggable (0.14.0), but its first position is top-right, over Foundry's sidebar. Moving it needs a pointer (no keyboard move). *(verify in Forge)* | Default to the left of `#sidebar`. Let arrow keys move it when its header has focus (give the header `tabindex="0"`). |
| QL-16 | P3 | S | `gm-panels.mjs:30-45` | **GM cards can get very tall.** A card can show ID, location, giver, or the full GM *Source* notes when there is no giver, plus audience, tags, progress, rewards and last change. Long issuer notes make a card very tall. (No clipping, which is correct.) | Show the Source line only when grouping by Giver, or behind a toolbar toggle "Show card details". Never truncate it. |

#### Findings: Journal tab (Game Journal, new in 0.16.0)

What works: the footer has *Discard changes* (ghost, left) / status / *Save* (primary, right). Confirmations are labelled (*Replace with mine*, *Discard changes*, *Archive session*). Inline rename has *Cancel* left / *Save* right, Enter and Escape. Toolbar buttons have `aria-label` + tooltips. The editor has `role="textbox"`, `aria-multiline` and a focus-visible ring. Pasted HTML is sanitized. Unsaved text is saved before switching page, session or tab, and before closing. The tab sits after Individual and before the GM tabs.

| ID | P | Size | Where | What's wrong | Fix |
|---|---|---|---|---|---|
| QJ-01 | P2 | M | `quest.css:183-207`; `journal-ui.mjs:91, 215-223` *(verify in Forge)* | **The two-page book is cramped at the default window size.** The one-page switch is keyed to the whole window (`.ag-window` is the size container; break at 40rem), not to the page pane. At 940 px the pane is about 600 px, so each page is about 230-250 px wide. The pages also have a fixed `height:26rem`, `overflow-x:auto` and `overflow-y:hidden`, so moving the caret between columns and scrolling is awkward. | Make the detail pane the container (`.agq-jdetail{container-type:inline-size}`) and show one page below about 46rem of *pane* width. Optionally add a *One page / Two pages* toggle in the toolbar, remembered per user. |
| QJ-02 | P2 | S | `journal-ui.mjs:72-75` | **Two different controls for the same choice.** Players get *My journal* / *Party journal* as two buttons that swap `primary`/`secondary` kinds; the GM gets a select labelled "Journal". The Quests tab already uses the kit's `ag-segmented` (`role="radiogroup"`) for this pattern. | Use `ag-segmented` + `aria-checked` for the players' switch. Label the GM select "Whose journal" (options: Party journal, each player). |
| QJ-03 | P2 | S | `journal-ui.mjs:81, 94-95` | **The page header mixes page choice with session admin.** *Export Markdown* and the red *Archive session* sit next to the journal picker, so a destructive session action is always in view while writing. | Move them into a right-aligned `ag-btn-group` on its own line under the session title, with *Archive session* last, or into a `<details>` "Session actions". Keep the labelled confirmation. |
| QJ-04 | P3 | S | `journal-ui.mjs:89, 140-143` | **The formatting toolbar gives no feedback.** Buttons don't show the current state (no `aria-pressed` for Bold, Italic, Underline or list). `role="toolbar"` has no arrow-key movement, so every button is a Tab stop. "Subheading" shows the text "H3" while "Heading" uses an icon. | On `selectionchange`, set `aria-pressed` from `document.queryCommandState`. Use one roving `tabindex`. Use a consistent glyph. |
| QJ-05 | P3 | S | `journal-ui.mjs:68`; `journal-store.mjs:149` | **New session fails only after the click.** A player's *New session* (and rename) fails with a notification when no GM is connected. | When no GM is active for a player, disable the button and add the hint "Needs a GM connected". |
| QJ-06 | P3 | S | `main.mjs:204-213` | **The GM can't tell why players don't see the tab.** It also depends on Character Hub's player visibility for "quests", but nothing in the GM UI says so. | Say so in GM Setup → Player Access ("The Journal tab also follows Character Hub's Quests visibility"). |
| QJ-07 | P3 | S | `journal-ui.mjs:68, 92` | Two primary buttons on one screen: *New session* in the sidebar and *Save* in the footer. | Make *New session* secondary (it is the create action at the right of the search, which is correct). |

---

### ashen-gate-skill-trees (Skill Trees, v0.19.4)

The 0.19.3 → 0.19.4 changes (level-backup guards) don't touch the UI. All findings below were re-checked at 8931b9d, with line numbers updated.

#### Window inventory

| Window / surface | Tabs and sections (labels as shown) | Who | Where |
|---|---|---|---|
| **Skill Trees** window, `Ashen Gate \| Skill Trees`, 1120×740 | Header: "Ashen Gate \| Skill Trees". On the right: version, *Help* | GM; players when Player Access is on | `scripts/main.js:578-580`, `templates/tree.hbs:1-9` |
| ↳ **Skill Trees** tab | **Sidebar** (*Menu* drawer when narrow): Tree / Character selects; points (*Level / To choose / Used* or *Awarded / Available / Unlocked*), provider badge, *Award Points*, *Reset Tree for X*; **Characters** roster (profession); `<details>` **History for X** (*Undo*); GM tools: *Player Preview*, *Edit Layout* → *Appearance*, *Tree Settings*, *Undo*, *Redo*; **Selected perk** inspector (*Unlock…*, *Grant (GM override)*, *Keep at this level*, *Remove / Refund*; in edit mode *Assign/Change Perk*, *Edit Properties*, *Connect Prerequisite*, *Remove Node*); **Perks** shelf (edit mode); `<details>` **Tree as a list**. **Canvas**: *Menu*, title, zoom −/+/reset, banners, board, corner tooltip, line key, edit help | all; GM parts gated | `tree.hbs:19-180` |
| ↳ **Tree Library** tab (GM) | Toolbar: search, count, *New tree*. Cards: **Trees** (rows with *Open*; *Export Selected Tree*, *Export All Trees*); **Saved data check** (*Give Missing Perks*); **Profession perk check** (*Open*); **Publication and backups** (*Backup Actor Tree Progress*, *Publish Player View*) | GM | `tree.hbs:182-233` |
| ↳ **GM Setup** tab (GM) | **Player access**; **Data tools** (*Import Ledger perk choices*, *Review Legacy (n)*, *Backup & Clear Legacy*); `<details>` **Developer Tools** (*Install QA Fixture Records*, *Reset QA Fixture*); footer *Cancel* / *Save Changes* | GM | `tree.hbs:234-267` |
| Uninitialized state | "No tree workspace yet" + *Initialize GM Storage* | GM | `tree.hbs:10-17, 177-179` |
| Dialogs | *Create tree*; *Tree settings*; *Assign perk*; *Edit node • X*; *Tree appearance*; *Award progression points* then *Award points?*; *Unlock this perk?*; *Remove perk* / *Refund this perk?*; *Grant perk (GM override)*; *Review X*; *Undo this change?*; *Import Ledger perk choices?* / *Nothing to import*; *Keep perk*; *Reset this tree?*; *Give missing perks?*; *Migrate legacy trees?*; *Clear the legacy public setting?*; QA install/reset; *Create the private tree journal?*; *Skill Trees help* | GM (unlock and help: all) | `main.js:115, 867, 879, 910, 921, 941, 988, 1006, 1070, 1111-1117, 1125, 1135, 1145-1148, 1156, 1171, 1189, 1201-1205, 1213, 1223, 1229, 1252, 1267` |
| Actors-sidebar launcher **Skill Trees** | – | GM; players by Player Access | `main.js:1333-1335` |
| Module Settings menu **Open Skill Trees** | – | all (`restricted:false`; the window rechecks access) | `main.js:1498` |
| Chat whisper cards | *Open Skill Tree* (owner), *Review* (GM) | owner / GM | `main.js:1339-1371` |
| Embed (Character Hub) | One `<details>` per tree: points, **Available now** (*Unlock*), **Unlocked**, `<details>` **Locked (n)**, *Open tree* | GM / owner | `main.js:1398-1419, 1441` |

Permissions: every mutating handler and API checks `game.user.isGM` in the function itself (`main.js:113-476`, `player-access.mjs:21`). Players' unlocks go through the GM-client request. No permission problems were found.

#### Findings

| ID | P | Size | Where | What's wrong | Fix |
|---|---|---|---|---|---|
| ST-01 | **P1** | M | Sidebar `tree.hbs:21-122` | **Crowded: the Selected perk inspector is buried.** After clicking a node, a GM on a profession tree has to scroll the sidebar past Tree/Character, points, Award/Reset, the Characters roster, History and GM tools before reaching the perk's details and the Unlock/Refund buttons. In edit mode the Perks shelf and Tree list come after that. | Split the sidebar into kit sub-tabs: **Perk** (inspector; switch to it whenever a node is selected), **Character** (points, *Award Points*, History, roster, *Reset tree* — see ST-11) and **Edit** (GM; Perks shelf, *Appearance*, *Tree Settings*, *Undo/Redo*). Keep the Tree/Character selects pinned above the sub-tabs. |
| ST-02 | P2 | S | `main.js:1187-1189` | **Bug: the Undo confirmation shows literal `<strong>` tags.** `what` contains `<strong>…</strong>`, but `confirmDialog` treats the message as plain text and escapes it, so the GM sees the raw tags. | Build `what` without markup. |
| ST-03 | P2 | M | GM Setup `tree.hbs:243-250`; `main.js:1247-1267` | **GM Setup holds actions, not just settings.** The Data tools (Ledger import, legacy migrate/clear) sit above a *Save Changes* footer that saves only Player Access. *Review Legacy (n)* actually **migrates** (dialog "Migrate legacy trees?"). | Move Data tools to a **Checks & maintenance** sub-tab of Tree Library (ST-04), or into Developer Tools. Rename the button *Migrate Legacy Trees (n)…*. GM Setup keeps only Player Access and Developer Tools. |
| ST-04 | P2 | M | Tree Library `tree.hbs:184-231` | **The Library mixes the tree list with three maintenance cards.** *Export Selected Tree* depends on the selection **in another tab**. Rows offer only *Open*. | Give the Library sub-tabs **Trees** and **Checks & maintenance**. Give each row *Open* and *Export*. Put *Export All Trees* next to *New tree*. |
| ST-05 | P2 | M | `main.js:86-89` (`input()` → `DialogV2.input`), used by 9 dialogs | **These dialogs have no Cancel button.** `DialogV2.input` is a prompt with a single action button, so the only way out is the header ×. That differs from the kit (Cancel left, action right). *(verify in Forge)* | Use `DialogV2.wait` with `[cancel, ok]`, as `_appearance` does (`:1070-1071`). |
| ST-06 | P2 | S | `tree.hbs:132-135`, `trees.css:31-35` | **Hand-rolled banner.** `.agst-banner--warn/--info` copies `ag-notice`. | Use `ag-notice ag-notice--warn/--info` with `role="status"`/`alert`, and delete the `.agst-banner*` CSS. |
| ST-07 | P2 | M | Edit node dialog `main.js:1003-1017` | **Crowded.** The prerequisites table lists every other node (23 rows on a 24-perk tree), each with a select and a checkbox, followed by Status/Visibility/Display. The status options are raw lowercase values. | Put Status, Visibility and Display first. Group the rows by tier (`<tbody>` per tier), or collapse the other tiers in a `<details>`. Give the status options proper labels. |
| ST-08 | P2 | S | `tree.hbs:106`, `main.js:853` | **Connect mode can't be cancelled.** After *Connect Prerequisite* the only way out is leaving Edit Layout. | Add a *Cancel connecting* button in the notice, and let Escape clear `linkFrom`. |
| ST-09 | P3 | S | `main.js:1111-1117` | **Award Points asks twice:** a form, then a separate confirmation. | Drop the second confirmation; make the form's button read "Award N points". |
| ST-10 | P3 | S | `tree.hbs:69-70`, `main.js:1096-1107` | Undo/Redo are always enabled and do nothing when there is nothing to undo or redo. | Disable them when the stacks are empty. |
| ST-11 | P3 | S | `tree.hbs:45` | The full-size danger button *Reset Tree for X* always sits next to *Award Points*. | Move it into the Character sub-tab, inside a `<details>` "Reset this tree…". |
| ST-12 | P3 | S | `tree.hbs:61-72` | The mode toggles (*Player Preview*, *Edit Layout*) live in the sidebar and disappear when the drawer is closed. | Move them to the canvas bar as `aria-pressed` ghost buttons. |
| ST-13 | P3 | S | Embed `main.js:1398-1419`, `trees.css:163-180` | **The embed uses hand-rolled components.** The points pill and Unlocked chips are hand-rolled. The empty states have no `ag-empty__title`. Perk text is cut with "…" after 160 characters. | Use `ag-badge`, `ag-chip-group`/`ag-chip` and `ag-empty__title`. Put the full text in a `<details>` instead of cutting it. |
| ST-14 | P3 | S | `main.js:1339` | **Chat card buttons skip the kit:** no kit class, and the icon has no `aria-hidden`. | Use `class="ag-btn ag-btn--sm"` and `aria-hidden="true"`. |
| ST-15 | P3 | S | `main.js:1498` (hint "v0.6"), Help `:867` ("Tree View") | Some text is out of date: the settings hint and the Help's name for the tab. | Update the hint and call the tab "Skill Trees" in Help. |
| ST-16 | P3 | S | `tree.hbs:234-235` | GM Setup (Player Access) is hidden until GM storage is initialized. | Render the Player access card whether or not storage exists. |
| ST-17 | P3 | S | `main.js:1295-1331` | Moving nodes in Edit Layout works only with a pointer. | When editing, let arrow keys on a focused node move it by 10 px (Shift: 50 px). |
| ST-18 | P3 | S | `tree.hbs:228` | **Republish looks like the main action.** *Publish Player View* is primary, but every edit already refreshes the snapshot. | Make it a secondary *Republish player view* in Checks & maintenance. |

---

### Quest Log and Skill Trees: proposed cleanup briefs

#### Quest Log (`ashen-gate-quest-manager`, currently 0.16.0)

**Release 0.16.1 (patch: fixes and accessibility)**
1. QL-01: location links become buttons.
2. QL-09, QL-11, QL-14: show the character select only for individual quests; Track without a full render; confirm before closing with unsaved quest edits.
3. QJ-04, QJ-05, QJ-07: toolbar pressed state and roving focus; New session disabled with a hint when no GM is connected; New session secondary.
4. QL-08 and QJ-06: Help and hint wording (and names, if Robb picks them).

**Release 0.17.0 (minor: layout consistency)**
1. QL-03 and QL-04: header shows only version + Help. Party/Individual get a top toolbar with the overlay toggle on the right. Remove the toggle from GM Setup.
2. QL-05: filters disclosure; bulk bar as a full-width row when something is ticked.
3. QL-02, QL-06, QL-07: sections start collapsed after Basics/Objectives; an Assignments section with its own footer; rewards table down to 4 columns; a note that Item rewards save as you change them.
4. QJ-01, QJ-02, QJ-03: one page/two pages keyed to the pane width; `ag-segmented` for the journal switch; session actions moved out of the page header.
5. QL-10, QL-12, QL-13, QL-15, QL-16: JSON-override status, a single GM notice, import preview, overlay default position, card details toggle.

Bump `module.json` version + download URL and `const VERSION` in `main.mjs:20`, add a CHANGELOG entry, and run `node scripts/check.mjs ashen-gate-quest-manager`. Update `test/ui-pass-v0100.test.mjs`, `quests-v0150.test.mjs`, `journal-main.test.mjs` and `SETUP_ACTIONS` when `toggle-overlay` leaves GM Setup. To check in Forge: Quests tab → filters disclosure and bulk row; editor → sections, then Save changes. Party tab → Tab key reaches a location link. Journal tab at the default window size → a readable page width.

#### Skill Trees (`ashen-gate-skill-trees`, currently 0.19.4)

**Release 0.19.5 (patch: fixes)**
1. ST-02: plain-text Undo confirmation.
2. ST-05: `input()` → `DialogV2.wait` with Cancel left and the action right.
3. ST-06: `.agst-banner` → `ag-notice`.
4. ST-08: *Cancel connecting* and Escape.
5. ST-09, ST-10, ST-14, ST-15: single Award prompt, disabled Undo/Redo, chat card button classes, stale text.

**Release 0.20.0 (minor: layout restructure)**
1. ST-01 and ST-11: sidebar sub-tabs Perk / Character / Edit; Reset in a `<details>`.
2. ST-12: Player Preview and Edit Layout move to the canvas bar.
3. ST-04, ST-03, ST-18: Library sub-tabs Trees (row Open/Export) and Checks & maintenance (checks, backup, Republish, Ledger import, legacy migrate/clear). GM Setup keeps only Player access and Developer Tools.
4. ST-07: Edit node dialog grouped by tier, with labelled status options.
5. ST-13, ST-16, ST-17: kit chips and badges in the embed, Player Access before storage exists, keyboard node moves.

Bump `module.json` version + download URL and `const VERSION` in `main.js:21`, add a CHANGELOG entry, and run `node scripts/check.mjs ashen-gate-skill-trees`. Update `tests/ui-pass-v0190.test.mjs` and `tests/dialogs-v0181.test.mjs`. To check in Forge: click a node → the Perk sub-tab shows its details without scrolling. Library → Export on a row. In edit mode, Edit Properties → Cancel closes the dialog without saving.

---

#### Counts

| Module | P1 | P2 | P3 |
|---|---|---|---|
| Quest Log: Quests, player tabs, Setup, overlay | 1 | 6 | 9 |
| Quest Log: Journal tab | 0 | 3 | 4 |
| Skill Trees | 1 | 7 | 10 |
| **Total** | **2** | **16** | **23** |

Earlier finding dropped at 8931b9d: the character pickers listing NPCs was fixed in Quest Log 0.14.0. Earlier findings revised: the editor crowding (now QL-02, down from P1 to P2 after the 0.15.0 sections and sticky save bar) and the overlay position (now QL-15, down to P3 because the overlay can be dragged).

---

### ashen-gate-character-hub (v0.32.0, main 8931b9d)

Player-facing alternative dnd5e character sheet (ActorSheetV2, `makeDefault: false`). All HTML is built in JS strings (no .hbs templates). Kit files (ag-ui.css, ag-html.mjs, ag-dialogs.mjs) are used; `node scripts/ui-lint.mjs ashen-gate-character-hub` passes. Audit is static (read-only code review against 8931b9d); nothing was run in Foundry.

Re-verified against 0.29.0-0.32.0 (Compact mode, Pop out, opacity removed from Full, AG bar moved to the bottom, Escape handling, quiet redraws, quick-bar keys, sticky toolbars, weight bar, Combat group/sort/filters, Appearance menu, NPC Codex, Cinder chips, Compact stats). Dropped as fixed or obsolete: the old header opacity slider (removed), Escape closing the whole Hub (fixed 0.29.2), focus loss inside text fields during live redraws (fixed 0.29.4; buttons still lose focus, see CH-02).

#### 1. Window inventory

| Window / surface | Who sees it | Where |
|---|---|---|
| **Character Hub sheet** (`CharacterHubSheet`, registered for `character` Actors, chosen per Actor via Sheet config or `api.open`) | Anyone with LIMITED+ on the Actor. LIMITED: portrait card only; OBSERVER: view-only banner, disabled controls; owner/GM: full | `scripts/sheet.mjs:336+`, registration `scripts/main.mjs`, shell `scripts/views.mjs:162-180` |
| Header, **Full** (`ag-header`) | All | `views.mjs:165-170`: `Ashen Gate \| Character Hub` left; then **Compact**, **Pop out**/**Pop in** (where V14 can detach), **Appearance** (menu), **NPC Codex** (with General Manager, GM or when shared), **Level up**, **Restore backup**/**Restore this backup** (GM), **Open native sheet**; far right `v0.32.0` + **Help** |
| Header, **Compact** | All except LIMITED | Same file: **Full**, see-through slider (60-100 %, "experimental"), Pop out, Appearance (icon only), NPC Codex, version, Help |
| Appearance menu (popover under its button) | All (own look only) | `scripts/look.mjs:97-113`: with Manager: **Skin** list (GM default + skins), **Size (this device)**, **More in My Appearance**; without Manager: **Theme** (GM default / Dark / Light), **Density** (GM default / Compact / Comfortable) |
| Full layout: left character column (name, Cinder chips, Inspiration, class/species/background card, paper doll + AC + Portrait/Token art, Other equipped, Initiative/Speed/Proficiency tiles, HP + damage/heal + Hit Dice/rests + exhaustion + Strain pill, GM Strain row, six abilities, conditions, resources) | All (parts gated by Player visibility) | `scripts/character.mjs:243-268` |
| Full: tab rail (right edge, icon-only `ag-siderail`, labels in tooltips): **Overview**, **Combat**, **Inventory**, **Magic**, **Features**, **Ashen Gate**, **Companions**, **Journey (alpha)**, **GM Setup** | GM Setup GM-only; others per Player visibility | `views.mjs:67-87` |
| - Overview: **Skills**, **Saving Throws**, **Passives & Senses**, **Proficiencies**, **Professions** (with the Ledger) | All | `views.mjs:27-61` |
| - Combat: sticky band (search, **Group**, **Sort**, Death save at 0 HP, action-type chips, **Hide unequipped** / **Has uses** / **Uses left** / **Clear filters**); Favourites; groups **Combat / Professions / Consumables / Features / Trinkets** | All | `scripts/tabs.mjs:67-84` |
| - Inventory: sticky band (**Character \| Party stash**, search, Attuned x / y, coin purse, weight bar); banner; one section per item type | All (Party stash needs Utilities) | `tabs.mjs:113-140` |
| - Magic: sticky band (search, Group, Sort, spell-level strip, filter chips); Favourites; groups | All | `tabs.mjs:153-182` |
| - Features: sticky band (search, Group, Sort, action chips + filter chips); Favourites; groups | All | `tabs.mjs:185-200` |
| - Ashen Gate: segmented sub-tabs **Professions**, **Perks**, **Cinders** (+ **Open skill tree**), **Renown**, **Quests**, **Locations**, **Base** | Per partner Player Access + Hub visibility | `scripts/partners.mjs:159-240` |
| - Companions: **Mount** (0/1), **Pets** (n/cap), cards with name, description, stats, gear/perks, clothing, drop zones + selects; GM pet-limit select | All; pet limit GM-only | `scripts/companion-views.mjs:90-104` |
| - Journey (alpha): alpha note; GM: character picker, add-note form; entries with GM Edit/Hide/Delete | Owner + GM | `scripts/journey-views.mjs:41-55` |
| - GM Setup: **Player visibility** (Quick set: Everything / Core only + a checkbox per part), **Hub appearance (default)** (Theme, Density), **Companions** (world default + per-character table) | GM | `companion-views.mjs:111-140`, `look.mjs:116-122` |
| Full: Ashen Gate quick bar (bottom edge, icon-only): Professions, Skill Trees, Cinders, Renown, Quests (jump to sub-tab), Headquarters, Locations (open window) | Per visibility | `views.mjs:96-121` |
| **Compact layout** (500x780 default): one scrolling column with name, Cinder chips, paper doll + AC, stat line (AC when slots hidden, Init, Speed, Prof), HP block with hit dice/rests/exhaustion/Strain pill, GM Strain row, six compact ability tiles (mod, score, save), conditions; then Mastery & marks and Quick bar at the bottom | All except LIMITED | `character.mjs:276-307`, `views.mjs:172`, `sheet.mjs:253` |
| Bottom hotbars (Full and Compact): **Mastery & marks** strip (non-folding) and **Quick bar** (10 slots, keys 1-9/0, folds) | Per visibility "hotbars" | `scripts/hotbar-views.mjs:30-58`, `scripts/quick-keys.mjs` |
| In-sheet popovers: slot menu, Other-equipped inline menu, HP editor (Cancel / Apply), conditions + list, Appearance menu, quick-bar Undo notices | Owner/GM (Appearance: all) | `character.mjs`, `look.mjs`, `hotbar-views.mjs`; Escape handling `scripts/escape.mjs` |
| Dialogs (kit `ag-dialogs`): Help (`infoDialog`, ends with an About/version list), Level up class pick (ok "Level up"), Restore pick ("Next") + danger "Restore from backup", Push ("Push"), socket Attach/Swap pick, Detach confirm, Remove companion confirm, Delete note confirm, attunement choice on equip | As per action | `help.mjs`; `sheet.mjs:41-44,131-167,221-236`; `cinders.mjs`; `item-actions.mjs:105-125` |
| External windows: dnd5e config windows (right-click), dnd5e advancement, FilePicker / Prototype Token config (double-click art), item sheets, native sheet, partner windows, Manager's NPC Codex and My Appearance, separate browser window (Pop out) | Owner/GM; Codex per Manager | `configure.mjs`, `level-up.mjs`, `art.mjs`, `codex.mjs`, `popout.mjs` |
| Launchers | None (sheet chosen per Actor) | - |

**Compact mode notes.** "Compact" means two different things in this module: (a) the **Compact view** (narrow single column, header button **Compact**/**Full**, client setting `compactMode`, 500x780); (b) the **Compact density** (kit size set, also offered in the Hub's own Appearance menu as Compact / Comfortable). The Compact view in 0.32.0 now carries nearly all of Full's left column plus both hotbars, and scrolls internally with the hotbars pinned. Its header still carries 7-8 controls in 500px and wraps (`character-hub.css:580-581`). Full still opens at 1240x800; the content pane is ~700px wide.

#### 2-3. Findings

| ID | Pri | Size | Location | What's wrong | Fix |
|---|---|---|---|---|---|
| CH-01 | P1 | M | `views.mjs:81-87`, `character-hub.css:45-48` (Full) | Tabs are still an icon-only vertical rail on the right edge, with labels only in tooltips. CLAUDE.md says "Tabs directly below [header]". Nine look-alike icons with no visible text, and GM Setup isn't marked GM (kit `.ag-tab--gm`). | A kit `.ag-tabs.ag-tabs--scroll` strip with icon + label at the top of the content pane, GM Setup with `ag-tab--gm`, rail removed. Or keep the rail with visible short labels. Robb's call: he has kept this layout on purpose. |
| CH-02 | P1 | M | `sheet.mjs:404` (`innerHTML`), `redraw.mjs:49-56` | 0.29.4 restores focus only to input/textarea/select. Every **button** click that re-renders (tab, sub-tab, filter chip, Group/Sort-driven redraw, slot ⋯ menu, condition +, Appearance menu, Inventory view, Compact/Full) still drops keyboard focus to the document. Opened popovers don't receive focus and don't return it on close. | Extend `captureFocus`/`restoreFocus` to `button, [tabindex]` using the same `fieldKey` (tag + data-*). On a popover opening, focus its first control; on close (incl. Escape), focus its opener. |
| CH-03 | P2 | M | `views.mjs:165-170` (Full header) | The Full header now holds up to 10 controls: Compact, Pop out, Appearance, NPC Codex, Level up, Restore backup, Open native sheet, version, Help. App-level (view, window, look), character-level (Level up, Restore) and cross-module (Codex) actions are mixed in one row. | Brand left; version + Help right. Move **Level up** / **Restore backup** into the character column's name row. Put **Pop out**, **Open native sheet** and **NPC Codex** into one header "⋯" menu. Keep **Compact/Full** and **Appearance** as the only other header buttons. |
| CH-04 | P1 | M | Compact header, `views.mjs:165-170`; `character-hub.css:580-581`, `:567`; `compact-opacity.mjs:203-206` | In the 500px Compact window the header shows the brand + Full + the see-through slider + Pop out + Appearance + NPC Codex + version + Help, so it wraps onto 2-3 rows and eats the narrow column's height. The slider is labelled "experimental" in a player-facing header. | In Compact show only Full, a "⋯" menu (Pop out, NPC Codex, Appearance) and Help next to the version. Move the see-through slider into the Appearance menu (Compact only). |
| CH-05 | P2 | S | `views.mjs:146-148`, `look.mjs:18,111`, `help.mjs:23-24`, GM Setup `look.mjs:121` | Name collision: the **Compact** view button and the **Compact / Comfortable** density in the Appearance menu and GM Setup are different things with the same word, in the same header. Help line 24 says "Compact or Comfortable" right after the Compact view bullet. | Rename the view mode (e.g. **Mini** / **Narrow view**; button "Mini view" / "Full view") everywhere: button, tooltip, Help, README, CHANGELOG wording. Keep "Compact/Comfortable" for density only (the kit term). Ask Robb for the name. |
| CH-06 | P1 | M | `look.mjs:14-122`, `sheet.mjs:122-126,286`, GM Setup card; `character-hub.css:570-577` | Without General Manager the Hub has its own appearance system: per-user `look` and world `lookDefault` settings (Dark/Light, Compact/Comfortable), a GM Setup card, and a hard-coded light palette + px token overrides. CLAUDE.md: General Manager owns shared appearance settings; modules only need to render a default theme without it. This duplicates Manager's state and will drift from Manager's skins. | Keep the Appearance button only when Manager's API is present (it already delegates there). Without Manager, render the kit default and drop the built-in picker, the `lookDefault` GM Setup card and the custom light palette. The leftover settings stay registered and unused (no migration). Robb decides, since 0.31.0 added it on purpose. |
| CH-07 | P2 | M | Magic `tabs.mjs:177-179`, Features `:196-197`, Combat `:81`, Inventory `:136-138`; `character-hub.css:264` | 0.30.0 made the toolbars sticky, so the stacked controls now stay on screen permanently. Magic keeps three frozen rows (search + Group + Sort, level strip, filter chips); Combat two (toolbar + chips); Inventory toolbar + purse + weight. In Full at 800px tall, minus header, hotbars and AG bar, the scrolling list area is small. | One frozen toolbar row: search, then a **Filters** popover (`<details>` / `ag-toolbar__filters`) holding Group, Sort and the chips with an "n on" badge. Keep only the Magic level strip as a second row. Let the purse/weight scroll with the list or sit in one row with the toolbar. |
| CH-08 | P2 | M | `character-hub.css:316,342`; `tabs.mjs:162` (Magic columns) | In Full at 1240px the content pane is ~700px; the card subgrid has star + icon + name + up to 6 fact columns (Magic) + Prepare + Cast. It only wraps below a 640px container, so names squeeze to 8rem. | Cap grid columns at ~4 (move Level/School into the summary or section header), or raise the wrap breakpoint to ~760px. |
| CH-09 | P2 | S | `character-hub.css:53-62` | Full under a 900px container becomes one column: the whole (long) character column, then the rail as a row, then content, with the AG bar at the bottom. Tabs and content sit far below. Now that Compact exists, this layout is mostly reached by resizing Full. | In the narrow Full layout put the tabs first and collapse the character column into a `<details>` summary (name, HP, AC), or suggest Compact view there. |
| CH-10 | P2 | M | `views.mjs:96-121` vs `partners.mjs:159+`; `cinders.mjs:174-181`; `help.mjs:44,46` | Cinders is reached from three places (name-row chips, bottom AG bar, Ashen Gate sub-tab). The AG bar says **Skill Trees** / **Headquarters** where sub-tabs say **Perks** / **Base**. The AG bar's Locations opens the window; the Locations sub-tab embeds it. Help lists jumps and sub-tabs without Cinders. | One label per module everywhere. AG bar buttons all jump to their sub-tab (Open button inside the panel for the window), or drop the AG bar once tabs are labelled (CH-01). Update Help. |
| CH-11 | P2 | S | `sheet.mjs:476-500` (contextmenu), `character.mjs:107` (AC), `character.mjs:276-288` (Compact stat line), `views.mjs:27-35` | "Right-click to configure" (AC, Init, Speed, Prof, HP, Hit Dice, abilities, skills, saves, senses, proficiencies) is mouse-only. AC, Speed and Proficiency (Full tiles and the new Compact stat-line spans) aren't focusable, so the keyboard context-menu key can't reach them. Quick-bar clear is right-click only. | Show a small "Configure" ghost icon button on hover/focus for each configurable stat, or a "Configure…" submenu. Let Delete/Backspace on a focused filled quick-bar slot clear it (with the existing Undo). |
| CH-12 | P2 | S | `sheet.mjs:502-509`; `character.mjs:105` | Changing portrait/token art is double-click only on a non-focusable `div`, in Full and Compact. | Add a "Change portrait"/"Change token art" ghost button next to the Portrait/Token art toggle (owner/GM). Keep double-click as a shortcut. |
| CH-13 | P2 | S | `tabs.mjs:90-92`; `character-hub.css:365-367` | The display-only Inventory banner shows in danger red on every visit when the item is absent, which reads like an error. It hard-codes a font-family stack instead of the kit display font. | `font-family: var(--ag-font-display)`. Absent state muted or `ag-notice--info`. Confirm wording with Robb (no rules change). |
| CH-14 | P3 | S | `sheet.mjs:96`, `:524-530` | In Compact, clicking a Cinder chip switches to Full **and saves Full** as the user's preference, so the next Hub opens in Full. | Switch for this window only (don't call `saveCompact`), or open Cinders' own window from Compact. |
| CH-15 | P3 | S | `views.mjs:42` vs `character.mjs:215-221` | Saving throws appear twice in Full: the Save line on each ability tile and Overview **Saving Throws**. | Keep one. Robb's call. |
| CH-16 | P3 | M | `views.mjs:36` (`agch-kv`), `views.mjs:38` (`agch-zebra`), `collapse.mjs` (`agch-sec`), `journey-views.mjs:29-38`, `partners.mjs:29` (`agch-plist`), `hotbar-views.mjs` (`agch-hotbtn`) | Hand-rolled duplicates of kit components: `.ag-kv`, `.ag-section`, `.ag-rows`/`.ag-row` (with `.ag-rows__head`). The item-card subgrid is justified. | Swap to the kit classes and delete the duplicated CSS. |
| CH-17 | P3 | S | `companion-views.mjs:94-95`; `partners.mjs:29,180` | Mixed empty states: bare muted `<p>` ("No mount.", "No pets.", partner "No … yet.", "Not installed or not active.") vs kit `ag-empty` elsewhere. | Use the shared `empty()` helper (`tabs.mjs:18`). |
| CH-18 | P3 | S | `buttons.mjs:5` | `btn()` copies `title` into `aria-label`, overriding the visible label. **Prepared** is announced "Unprepare" (`tabs.mjs:158`); **Restore backup**, **Pop out** and **NPC Codex** get long sentences; **Death save** gets "(right-click to configure)". Breaks label-in-name. | Set `aria-label` only for icon-only buttons; otherwise keep `data-tooltip` alone. |
| CH-19 | P3 | S | `collapse.mjs:62` | Icon fold toggles update `title`, but they use `data-tooltip`, so the "Collapse/Expand X" tooltip goes stale after a click. | Update `data-tooltip` and `aria-label`. |
| CH-20 | P3 | S | `views.mjs:83-85` | Rail `role="tab"` buttons have no arrow-key movement and no `aria-controls`; the tabpanel (`views.mjs:179`) has no id. | Add arrow keys (like `segmentStep`), a panel id and `aria-controls`. Keep this if CH-01 moves to `.ag-tabs`. |
| CH-21 | P3 | S | `companion-views.mjs:122`, `sheet.mjs:118` | Player visibility **Quick set: Everything / Core only** overwrites every toggle at once with no confirmation. | `confirmDialog` with labelled actions ("Show everything to players" / "Show core only"). |
| CH-22 | P3 | S | `sheet.mjs:41` | The Push confirm is never danger-styled, even when Backfire is guaranteed (the row's Push button is red then). | Pass `danger: true` when `pv.guaranteed`. |
| CH-23 | P3 | S | `journey-views.mjs:38,43`; `views.mjs:72` | A hidden Journey entry shows both "Hidden from player" and "GM only". The tab says "(alpha)" next to a "New · alpha" badge. | Keep one marker (`ag-gm-flag`). Drop "(alpha)" from the tab label. |
| CH-24 | P3 | S | `partners.mjs:122,137,149` | Ashen Gate summaries cut Locations and stash lists at 8 ("and N more"), hiding clickable links. | Show all in a scrolling `.ag-rows`, or make "and N more" a button. |
| CH-25 | P3 | S | `help.mjs:12-54`; `tabs.mjs:199`; `hotbar-views.mjs:40` | Help has grown to ~37 bullets in one list. The Features hint still says level-up is on the native sheet (Level up is in the Hub header since 0.27.0). The Mastery & marks help sits in a tooltip on a non-focusable title span. | Group Help into `<details>` sections (Character, Tabs, Hotbars, Ashen Gate, Compact view & Appearance, GM). Fix the Features hint. Make the marks help a small focusable "?" button. |
| CH-26 | P3 | S | `tabs.mjs:71` | Combat column "DMG/HEAL" vs "Damage" elsewhere and sentence-case labels. | "Damage / Healing". |
| CH-27 | P3 | S | `character-hub.css:316,353-356,533` | Item icons are raw `32px`/`24px` (don't scale with Comfortable); `.agch-levelup` isn't scoped under `.agch-app`. | Kit tokens (`--ag-icon-chip`/`--ag-icon`); scope the rule. |
| CH-28 | P3 | S | `character.mjs:219`, `character-hub.css:244` (Full and Compact) | Save proficiency on ability tiles is accent colour only (no icon), and the Compact save shows just "+3". | Add the proficiency icon used in the Overview list to the save line. |

Permissions: GM-only handlers refuse non-GMs in the data layer: Strain step (`cinders.mjs`), restore (`level-restore.mjs`, `sheet.mjs:151`), visibility set/preset (`visibility.mjs`), pet limits (`companions.mjs`), Journey add/edit/hide/delete/reward (`journey.mjs`), world look default (`look.mjs:55-56`), Codex re-checks availability (`codex.mjs:147-148`, and Manager checks again). Owner actions go through `canEdit` + `requirePart`. No UI-only permission found.

What already follows the conventions: version + Help together at the far right; labelled danger confirms (Restore, Detach, Remove companion, Delete note); Cancel left / primary right in the HP editor and Journey edit; GM Setup holds settings only; reduced-motion guards (including the new orb rotation); Escape closes the innermost popover only; quiet redraws keep scroll and text-field focus.

#### 4. Proposed cleanup brief (from 0.32.0)

**Release A, 0.32.1 (patch: fixes, no layout change)**
1. CH-02: keep focus on buttons across re-renders; move focus into popovers and back on close.
2. CH-14: Cinder chip in Compact doesn't change the saved Compact preference.
3. CH-18, CH-19, CH-20: accessible names, stale fold tooltips, rail arrow keys + `aria-controls`.
4. CH-21, CH-22: confirm Quick set; danger Push confirm when Backfire is guaranteed.
5. CH-23, CH-25 (stale Features hint + focusable marks help), CH-26, CH-27, CH-28.
6. Bump `module.json` version + download URL, `constants.mjs` `VERSION`, any test asserting `0.32.0`; CHANGELOG; `node scripts/check.mjs ashen-gate-character-hub`.

**Release B, 0.33.0 (minor: header, naming, navigation)** *(needs Robb's decisions on CH-01, CH-05 and CH-06 first)*
1. CH-05: rename the Compact view (e.g. "Mini view") everywhere; Compact stays the density name.
2. CH-03, CH-04: Full header = Mini/Full, Appearance, "⋯" (Pop out, Open native sheet, NPC Codex), version + Help. Level up / Restore move to the name row. Mini header = Full, "⋯", Help; see-through slider moves into the Appearance menu.
3. CH-06: Appearance only through General Manager. Drop the built-in look picker, the GM Setup default card and the hard-coded light palette (settings left unused, no migration).
4. CH-01, CH-10, CH-20: labelled `.ag-tabs` strip (GM Setup `ag-tab--gm`); one name per partner module; AG bar removed or consistent; Help updated.
5. CH-09: narrow Full puts tabs first and collapses the character column into a `<details>` summary.
6. CH-11, CH-12: visible Configure and Change-art buttons; keyboard clear for quick-bar slots.

**Release C, 0.34.0 (minor: density and kit components)**
1. CH-07: one frozen toolbar row with a Filters popover in Combat, Magic and Features; slimmer Inventory band.
2. CH-08: fewer grid columns / higher wrap breakpoint.
3. CH-16, CH-17: kit `.ag-kv`, `.ag-section`, `.ag-rows`, shared empty states; delete duplicated CSS.
4. CH-13, CH-15, CH-24, CH-25 (Help in `<details>` groups): banner styling, Overview saves (Robb's call), full partner lists.

Each release: version bump (patch A, minor B and C, staying on 0.x), CHANGELOG, run the check. Tests prove logic only. In Forge, Robb verifies: open a character → Sheet → *Ashen Gate Character Hub*; Tab through tabs, chips and the slot ⋯ menu and check focus stays put; switch Compact (Mini) / Full and Pop out; open Appearance with and without General Manager; resize Full under ~900px.
