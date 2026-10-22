## 0.16.0 — 2026-10-22

- **Delete folder…** (GM): each row in *Manage folders* now has a Delete folder… button. It asks "Delete folder “<name>”?", says how many factions (and deities) will move to *Other factions* and that they are not deleted, and Cancel is the default. Deleting a folder never deletes a faction or deity, or touches its Renown, discovery or rewards; everything in it moves to *Other factions*. Keyboard focus moves to the next folder's Delete folder… (or the New folder name when none are left).
- A deleted folder's id is never used again for a new folder. Players cannot delete folders: the API refuses anyone but the GM.
- A faction that points at a folder that no longer exists (for example one imported from another world) shows under *Other factions* instead of being hidden, and Export, `getFactions` and General Manager's world export no longer name a folder that is gone.
- New GM-only API: `api.deleteFolder(key)`. No changes to saved data; no migration.

## 0.15.0 — 2026-10-22

UI cleanup (audit 2026-10, Renown brief). No changes to saved data, flags, setting keys, ids or the API.

- **Tabs:** Group, **Character** (was Player), Pantheon, and for the GM **Factions** (was Organizations), **Requests** (new) and GM Setup. "Faction" is the one word everywhere ("Unknown faction", "Other factions"). The header has no subtitle. The tab row takes the arrow keys, Home and End.
- **Factions tab:** the list on the left *is* the roster (search, Show: Factions or Deities, Visibility, Group by, Sort), so nothing is listed twice and the editor no longer sits below the list. Pick one to edit it on the right, in sub-tabs: Profile, Visibility, Information (Lore for deities), Rewards, Requests, and Links (Relations for deities). The character picker is in the editor's header. Ranks and the deity card text are in folds that remember whether they are open. Search hides rows as you type without redrawing the window.
- **One Save Changes per sub-tab**, pinned at the bottom right of the editor: Profile saves name, folder, tags and ranks; Visibility saves the placeholder, sharing and field reveals together (field visibility no longer has its own Save). The other sub-tabs apply at once and say so (*Applies now*).
- **No more lost edits:** typing in a form shows "Unsaved changes"; switching tab, sub-tab, record, character or filter, pressing a button that redraws the window, or closing it asks "Discard unsaved changes?" (Keep editing is the default). A player request or another change arriving while you type waits until you save or cancel.
- **Deities are authored in the Factions tab** (Show: Deities): New deity, the card, ranks, discovery, lore, rewards, requests and relation sliders. Pantheon is the view for everyone; the GM keeps Adjust favour and Undo there, plus **Edit deity**.
- **Requests tab** (GM): every open claim and service request from every faction and deity, grouped by name, with the open count on the tab. **Open <name>** goes to that record's Requests sub-tab.
- **Manage folders** (toolbar) lists folders as rows with a count and **Rename…**, and adds new ones. A faction's folder is also set in its Profile (the keyboard alternative to dragging).
- **Discovery buttons** say what they do: Reveal to / Hide from the party or the chosen character, for factions, deities and entries alike. Entries show who knows them (Party, the character, or Hidden). The link button reads *Switch to document link* / *Switch to preview*. Unlock rules, reward behaviour and Quest link states show in words, not stored tokens.
- **Clear choice** shows only on a Choose one level that has a recorded choice.
- **Confirmations** for removing, denying, resetting and clearing name their object ("Remove [TEST] Boon?") and Cancel is the default button.
- **GM Setup** holds settings only: *Fill in permanent item ids* moved into Developer Tools. The demo loader adds four synthetic **[TEST] Guild A–D** factions.
- Import is a real button (keyboard reachable). Focus stays on the control you used after the window redraws. The add-relation slider names its deity and the preview text is announced.
- The window opens at 980×760 (was 1180×800).

## 0.14.1 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.14.0 — 2026-10-21

- **Item rewards follow the shared item-drop standard** (`ag-item-drop.mjs`, copied unchanged from Quest Log). Reward levels take **items only**: a journal or other document gets "Rewards take items. Drop journals and other documents on the info list." and nothing is added; a folder is refused. The information list still takes any document.
- Item rewards also store the item's picture and its **permanent item id** (`item_id`) when it has one. The reward editor shows the picture, the id (or a **No permanent id** badge), and a red **Missing** badge when the item can't be found.
- An item dragged off a character or NPC sheet becomes a GM-only **holding copy** (with its contents) in the Items folder *Ashen Gate Rewards (Renown)*. The sheet keeps its item. Removing such a reward (after the usual confirmation, and only when it has no claims) deletes its holding copy.
- Approving a claim finds the item by its permanent id first, then by its link, and copies it with its contents in one go; a failure part-way is rolled back, and a claim is still never granted twice. A **missing item** now tells the GM "The reward item is missing (…). Fix the reward, then approve again." and the request stays waiting (it used to sit silently approved).
- **GM Setup → Fill in permanent item ids:** **Check rewards** lists what would change (Will fill / No permanent id / Missing); **Fill in ids** asks first, then fills only empty ids. Safe to run again; never changes a link or a claim. GM-only API: `api.rewards.backfillItemIds({dryRun})`. Saving a reward also fills its own empty id.
- Saved data: rewards gain two optional keys (`item_id`, `img`); export includes them and older files without them still import. Player views never carry them. No other data changes.

## 0.13.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- No behaviour or saved-data changes.

## 0.13.0 — 2026-10-21

- UI standard look (kit 2): the header spans the whole window with the tabs below it (they no longer overlap), and only the content scrolls. Group, Player and Organizations keep the folder list on the left; Pantheon and GM Setup use the full width.
- Organizations toolbar: search filters as you type; Visibility, Sort and Group by; a "6 of 12" count; Import, Export and **New faction** on the right (New faction asks for a name). Visibility badges: Revealed green, Characters only gold, Hidden plain.
- Pantheon toolbar: **All deities** back button, character picker and **New deity** (asks for a name). One character picker in Player, Pantheon and Organizations; the profile now shows the character's name instead of an id.
- Standing shows a progress bar to the next rank and rank dots; the current milestone is outlined.
- Editors (faction profile, field visibility, deity, GM Setup) end with Cancel on the left and Save on the right. Field visibility has its own section.
- **GM Setup:** Player Access, damping and the group name now save together with one **Save Changes** (same settings). "Load four draft guilds" moved to Developer Tools at the bottom of GM Setup.
- Remove, reset and clear buttons are red and ask first; **Deny request now asks first**. Icon-only buttons have labels and tooltips.
- Window opens 1.2x larger with the Comfortable size, and works down to a narrow width (the list stacks above the details).
- No changes to saved data, flags or setting keys.

## 0.12.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- Dialogs now come from the shared `ag-dialogs.mjs` (same behaviour, now skinned).

# Renown change history (formerly Factions & Renown)

## 0.11.1 — 2026-10-20

- Holy symbols (Pantheon tiles, deity card, Character Hub embed) now always sit on a light parchment plate, so line-art symbols stay readable in the dark theme and in a faded Hub window. The fallback glyph uses the same dark ink. Style only.

## 0.11.0 — 2026-10-20

- New **Pantheon** tab for players and GM: deities as holy-symbol tiles grouped Major/Lesser. Open one for its card, the chosen character's favour, rank ladder (each deity has its own rank titles), rewards, lore and related deities.
- Favour with a deity is **per character only**. The API refuses group standing, group rewards and group claims for a deity.
- Players only ever receive deities revealed to one of their characters. A relation is listed only once both deities are revealed. The filtering happens in the GM-written player view, not just the UI.
- GM: create a deity, edit its card, symbol path (with Browse), rank titles and thresholds, reveal it to the party or one character, adjust favour, and manage rewards, lore, relations and requests. These are the same controls factions have.
- Import/export: deities live in the same file. Export is now `ag-factions-source-export/0.4`; `0.3` files still import. Re-import never changes deities already in the world.
- New read API: `getDeities()`, `getPantheon(actor)`. `getFactions()` still lists factions only. Schema: `docs/renown-deity-schema.md`.
- **Resonance / Dissonance:** each deity can list related deities with a one-way slider: 0 Dissonance, 0.5 neutral, 1 Resonance. A gain with one deity moves the related ones by gain × strength × damping. Damping is set in GM Setup (default 0.5). Positive results round down, negative ones round away from zero. Losses never spread and changes never chain. The GM confirms each change; they all start ticked.
- Favour history names the cause of each related change, except to players who can't see that deity. GM **Undo** on a history entry adds reversing entries for it and the changes it caused.
- Character Hub embed: a Pantheon section with the character's favour with each deity they know. `open({deityId, actorId, tab: 'pantheon'})`.
- No change to existing factions or saved data.

## 0.10.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a compact, read-only standing list: per organization the user may see, the party's and this character's rank and score, the next milestone, and Open. Returns `{unmount, refresh}`; it refreshes itself on changes. See the README.
- `api.open()` can now take `{factionId, actorId, tab}` to open on one organization (and the Player view for one character). `open()` with no options is unchanged.
- Same data and visibility as the Renown window (players: their own filtered view only). Claims and awards stay in the window. No saved data changes.

## 0.9.0 — 2026-10-20

- Renamed to **Renown** (was *Factions & Renown*): window header `Ashen Gate | Renown`, launcher tooltip, Help, notifications, the Player Access setting and the module title in Forge.
- Unchanged: module id `ashen-gate-factions`, settings and flags, API, socket, import/export schema and file name, and saved world data. Organizations are still called factions inside Renown.

## 0.8.3 — 2026-10-19

- Faction actions that used the browser's `prompt`/`confirm` (rename folder, edit information, edit reward, remove entry/reward/reference, reset charges, clear a milestone choice, share with party, add example guilds) now use Foundry dialogs, so they work in the desktop app. Destructive confirms have a labelled action button. Editing a reward is now one form instead of six prompts; the same checks apply.
- New header (`Ashen Gate | Factions`, version, **Help**). The Help text is a draft.
- No saved-data, permission or API changes.

## 0.8.2 — 2026-10-19

- Export file name no longer has a hard-coded version: it is now `AG_Factions_Definitions.json`.

## 0.8.1 — 2026-10-19

- Faster GM login: the startup check of each faction's group state now writes only when a missing field actually needs filling, instead of rewriting every faction's state journal on every load (which also re-rendered open Factions windows each time). Saved data is unchanged.

## 0.8.0 — 2026-10-19

- New GM-only **Organizations** tab: every faction (hidden, character-only and revealed) in a searchable list with visibility, group Renown, folder and linked-objective chips; filter by visibility, sort, group by visibility or folder. Creating, editing, revealing, folders, rewards, claims, information entries, linked quests, Import and Export all live here, unchanged.
- **GM Setup** now holds settings only: Player Access and the custom group display name.
- No saved-data changes. Player views, import APIs and permissions are unchanged.

## 0.7.2 — 2026-10-19

- Import through General Manager reports a failing faction with its reason and still lists the factions that were added, instead of failing the whole file. No change to saved data.

## 0.7.1 — 2026-10-19

- Actors sidebar launcher is now a two-column grid in the shared Ashen Gate group, button label "Renown" (tooltip "Factions & Renown"). Fixed order (Quests, Renown, Professions, Skill Trees, Locations, Headquarters, Utilities) whatever the module load order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.7.0 — 2026-10-19

- **Import JSON** (GM Setup → Organizations and folders). Loads factions from a definitions file (the same `ag-factions-source-export/0.3` file that **Export definitions only** writes). A preview lists each faction as NEW or SKIP before anything is written.
- **Additive and safe.** A faction whose id already exists is skipped whole: its definition, discovery and Renown are never changed. Nothing is deleted. No migration of saved data.
- **Optional `starting_state`** in the file (new factions only): reveal to the party, group Renown events, and per-character discovery and Renown by character name. A name that is not in the world is skipped and reported.
- GM-only in the data layer: `api.importFactions(data)` and `api.previewFactionsImport(data)` refuse players, as does the button.
- The playtest data pack now includes `AG_Playtest_Factions_0.5.1.json` for this.

## 0.6.6 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.
- Tabs sit in a full-width strip at the top of the main pane. Headings use the UI font instead of Georgia.

## 0.6.5 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.6.4 — 2026-10-18

- Fix: opening the Factions window failed in Foundry V14 with "Cannot add property minWidth, object is not extensible". ApplicationV2 window position doesn't accept `minWidth`/`minHeight`; the minimum size is now set in CSS.

## 0.6.3 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.6.2 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.6.0 Beta — 2026-10-17 (local, unpublished)

- Add Foundry module `socket: true` to enable the existing player-to-GM request/share channel and correlated player receipt messaging (`FB-025/027/028`).
- Add optional campaign-owned selective field disclosure for Name, Leader, and Description; prior worlds use legacy behavior unchanged. Never project private disclosure configuration, Objective source refs, or unauthorized linked UUIDs to player Journals (`FB-026`).
- Surface the granted copy of Item rewards on the authorized Actor; do not change original source document ownership (`FB-027`, access-persistence request remains limited to owned Actor copies).
- Link newly dropped accessible Journals by default, with explicit guidance when a linked source is restricted; do not bypass Journal permissions (`FB-029`).
- Compact GM Setup into named collapsible sections, preserve scroll/section state after in-place actions, improve selected character spacing, explain organizational tags and declare minimum app dimensions (`FB-030`, `FB-2026-10-16-003`).
- Supply real-world synthetic fixtures with explicit setup/reset and 22 exact-format cases; keep linked Quest flow Not Run until Eli's iteration is accepted (`FB-031`).
- Keep `ag-player-access/1`, the prior Renown/reward logic, legacy data, and optional Manager/Quest consumer boundaries.

Changelog

## 0.5.2 Beta — 2026-10-16

- Added optional, GM-only validation of faction `QUEST-*` / `ORDER-*` / `CONTRACT-*` references against the **actual** Quest Manager `ag-objective-consumer/0.2-alpha` API. Verifies `entityType:Objective`, source ID, and owner-reported status; does not infer Objective existence by display name, UUID, or local faction state.
- GM Setup shows resolved/unverified/unavailable/conflict statuses, without ever publishing Objective refs to a player projection. Added GM-only `api.auditObjectiveRefs(factionId)` for focused integrated testing; preserved `api.getObjectiveRefs` and all existing APIs.
- Missing/disabled/unsupported Quest Manager leaves the Factions module usable, with references marked `unverified`. No automatic Quest grant, discovery or state mutation.
- Added focused negative tests for source/type mismatch, optional partner absence, and player leakage. No data migration.

## 0.5.1 Beta — 2026-10-16

- GM-only canonical Objective reference editing and portable typed refs; standalone theme token fallbacks.
- Earlier release history and functionality retained from the v0.5.1 package.
