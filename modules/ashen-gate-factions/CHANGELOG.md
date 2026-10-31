## 0.28.0 — 2026-10-31

- **Character Hub embed: Factions and Pantheon are two sub-tabs.** In Character Hub → Ashen Gate → Renown, the one long scroll is now **Factions** and **Pantheon** (the kit's sub-tabs: one Tab stop, Left/Right/Home/End move between them, Enter or Space opens one). Both tabs are always there; with nothing to show they say "No factions known yet." or "No deities known yet." instead of disappearing. The last tab you used is remembered per user on this device. Keyboard focus stays on the same tab or **Open** button when the view redraws.
- Nothing else about the content changes: the same Open buttons, ranks, scores, next milestones and Vow line, and the same permission rules (players see only what their view holds, the Pantheon only for characters they own and only revealed deities, the GM sees everything).
- The embed's empty state uses the kit box radius (it was the larger card radius). The rows and cells were already on box and well radii; pill radius stays on buttons only.
- Tests are mocked Foundry and a mocked DOM: they prove the markup, keys, memory and permissions, not the live window.

## 0.27.0 — 2026-10-31

- **`api.exportState()`** (GM only, refused for players, in the API and in the builder itself): returns all Renown play state as plain JSON, schema `ag-factions-state-export/0.1`, shape `{schema_version, factions, personal}` with no timestamps of its own. `factions` has one row per faction and deity (`id`, `kind`, `name`, track ids) with its `group` state: standing and event history, rank position (`progress`), claims, requests, uses, choices, who has discovered it, per-entry and per-field reveals and recruited members, with an `actor_names` map beside every actor id. `personal` has one row per character (`actor_id`, `actor_name`, Vow and Vow log) with that character's standing, rank position, claims, requests, uses and choices for each faction and deity (deity standing is piety). It reads Renown's own state records and writes nothing. It is not the definitions export (`exportDefinitions`) and is not a format the content reconcile reads. General Manager 0.90.0 uses it for its world backup.

## 0.26.0 — 2026-10-30

- **`api.exportDefinitions()`** (GM only, refused for players): returns the file **Export** downloads (`schema_version` `ag-factions-source-export/0.4`: every faction and deity definition, no standings, claims or discovery). The Export button now calls the same function, so there is one code path. General Manager's *Back up world now…* uses it for `factions.json`. Feature-detect it (`typeof api.exportDefinitions === 'function'`). Nothing saved is changed.

## 0.25.0 — 2026-10-28

**Players see every rank; ranks they have not unlocked are flavor-only locked cards.**

- **Locked cards.** A faction a player can see (Known or Recruited) and a god shown to them now give the player every rank in order. A rank the character or party has not unlocked is a **Locked** card (lock icon and the word Locked) with its rank number, its threshold and a line of flavor text. Its name, benefit text, reward names, descriptions, teasers, item links and numbers are not sent to the player at all (not just hidden), and there is no Claim button. Unlocked ranks show everything as before.
- **Flavor text.** Every milestone (group and individual tracks, deity ladders) takes an optional `flavor` string, 1-2 sentences, 400 characters at most. The faction editor has **Flavor when locked** on each rank. Without one the card says "A further rank, earned through renown." (gods: "A further tier, opened by a sworn Vow."). Older records without it keep working. `flavor` is part of the reusable definition: it validates in factions import/export files and General Manager packages, is exported, imported and Synced like the rank text, and shows in the update preview as a changed milestone.
- **Known (not recruited).** The first rank is the 0.24.0 preview in full ("Unlocks when recruited", not claimable); ranks 2 to 5 are locked cards. Recruited: ranks open as the standing reaches them. A player with two characters sees each one's own ladder.
- **Gods.** Tier 1 in full with the Vow toggle; tiers 2 to 5 stay locked cards for a character who has not sworn a Vow to that god, whatever their piety, and open as piety is earned once the Vow is sworn (per character; breaking the Vow locks them again). The next-rank pointer is a generic "Tier n".
- **GM Setup: Locked ranks** replaces the 0.24.0 switch "Hide later tiers until recruited or sworn". Choices: *Flavor text only* (default), *Hide locked ranks* (exactly 0.24.0) and *Show everything* (locked ranks show names and reward teasers; a god's whole ladder; as before 0.24.0). A world whose GM had turned the old switch off is carried over once to *Show everything*; everyone else gets the default.
- **Claims.** Unchanged on the server: a reward on a rank that has not been reached is refused; a later tier of a god is refused without that character's Vow (not in *Show everything*, as before 0.24.0).
- API (`getFactions`, `getDeities`, `getPantheon`) and the Character Hub embed follow the same rules for players; the embed's "Next" names a generic "Rank n" / "Tier n". The GM view and GM API are unchanged.
- Details: docs/renown-known-vs-recruit.md, docs/renown-deity-schema.md.

## 0.24.0 — 2026-10-28

**First unlock visible, later tiers hidden until recruited or sworn.**

- **Factions.** A faction that is shown but not recruited now gives the player its first unlock (the first milestone of the group track and of the individual track), marked **Unlocks when recruited**, with its name and the usual locked reward teasers. It cannot be claimed. A line says "More ranks unlock when you are recruited." Later milestones are not sent to the player at all. Once recruited, the full ladder shows as before. A player with a recruited and a not-recruited character sees the full ladder for the first and the preview for the second.
- **Deities.** Until a character has sworn a Vow to a god, the player sees that god's first tier (the Seeker card with the Vow toggle) and "More tiers unlock when you swear a vow." The other tiers, and the next-rank name and threshold, are not sent. When the character swears a Vow to that god the whole ladder appears; if the GM breaks the Vow it is hidden again and piety is untouched. Judged per character. Only first-tier rewards can be claimed until the Vow is sworn.
- **Existing worlds.** Recruited factions and sworn gods are unchanged. A god a character knows but has not sworn to loses its later tiers in that player's view (intended). The GM view is unchanged.
- **GM Setup: Hide later tiers until recruited or sworn** (on by default). Off restores 0.23.0: factions that are only Known show no ranks, and gods show the whole ladder.
- API and Character Hub: `getFactions()`, `getDeities()` and `getPantheon()` follow the same rules for players; `getPantheon` rows carry `limited`. The Hub embed says "More tiers unlock when you swear a vow." for an unsworn god instead of "Top rank".
- Player views refresh when a Vow is sworn, ended or broken (a GM must be online, as for every player view).
- Details: docs/renown-known-vs-recruit.md.

## 0.23.0 — 2026-10-28

A faction can now be shown to a player without recruiting them. Two separate states: **Known** (the player sees the faction) and **Recruited** (the player has standing with it).

- **Known (not recruited).** Showing a faction to the party or a character gives the player its name, leader and description (as your field reveals allow) and the information entries they have learned, with the text "Known (not recruited)". No ranks, progress bars, rewards, claims or history are sent to their client at all, not just hidden in the window. Sharing with the party shares knowledge only.
- **Recruit** (GM). **Visibility**, and the **Group** and **Character** tabs, have **Recruit** / **Remove … from members…** next to the show/hide buttons (now worded **Show to …** / **Hide from …**). Recruiting also shows the faction. Hiding a faction also removes the recruit, after a confirmation that says exactly what happens. Removing a recruit hides their standing but deletes nothing; recruiting them again brings it back. The faction list shows a **Recruited: party / characters** or **Not recruited** chip beside the visibility chip.
- **Awarding Renown to someone not recruited** asks first: "Not recruited: recruiting now", with **Recruit <name> now** ticked. Untick it to cancel the award.
- **Knock-ons** (0.22.0) only reach factions the character is recruited into. Claims and requests need membership.
- **Existing worlds are unchanged.** The first time a GM opens a world on 0.23.0, every faction that is already shown stays recruited exactly as before (membership starts as a copy of what is shown). This runs once, is safe to run again and rewrites no standing. From then on a new reveal is Known only.
- **Import:** a file's `starting_state` "discovered" flags still mean shown and recruited, as before. The file format is unchanged; membership is campaign state and is never exported.
- API: `setMembership(factionId, {party: true | actorId, on})` (GM only). `getFactions()` for a player reflects the split. Deities are not changed.
- Details: docs/renown-known-vs-recruit.md.

## 0.22.0 — 2026-10-28

Factions can be related to each other, and personal Renown spreads along those relations the way piety spreads between deities.

- **Related factions** (faction editor, Profile): add other factions with a slider from Dissonance (a rival) to Resonance (an ally), with the same preview text as the Pantheon. It is part of Profile, so it saves with **Save Changes** and **Cancel** drops it. Factions without relations behave as before, and their stored definitions are not rewritten.
- **Personal only.** When the GM adds personal Renown for a character with a faction, a list shows what each related faction would change (all ticked; untick any). Group Renown never spreads. Only gains spread, knock-ons never chain, and only factions the character already knows are affected. A related faction's score never goes below 0, and ranks and rewards already claimed are kept.
- **History and Undo…** (GM): each knock-on is its own history line, "Dissonance with <faction>: <reason>", linked to its cause. Personal history now has **Undo…**, which also undoes the knock-ons that entry caused.
- **GM Setup**: **Faction knock-on damping** beside the Pantheon one (same default 0.5 and maximum 0.95).
- **Players** see a faction's relations only to factions they already know, shown as Resonance or Dissonance. A history line caused by a faction they do not know does not name it.
- **Import and export**: Faction definitions accept the optional `relations: [{faction_id, resonance}]` (see docs/renown-faction-relations-schema.md). Update-mode import still keeps any definition edited in this world.
- API: `getFactionKnockOns(factionId, gain)` (GM, read only).

## 0.21.1 — 2026-10-28

**Show undiscovered placeholder now works for deities.**

- Turning on **Show undiscovered placeholder** (Factions → a deity → Visibility) did nothing for deities; only factions used it. Now, in a player's Pantheon, each undiscovered deity with it on appears as an **Undiscovered deity** tile in its Major or Lesser group (counted in the group total). The tile is not clickable and reads "Undiscovered deity. Not yet known to your character."
- Nothing about the deity leaks: the player view gets only `{kind:'deity-placeholder', tier, key}` (key is an opaque per-tier number, never the deity's id), built on the GM side. No name, symbol, title, domain, relations or ladder is sent.
- Revealing the deity (to the party or to one of the player's characters) replaces the placeholder with the real tile. A deity with the setting off stays completely hidden. The GM Pantheon is unchanged.
- Placeholders are not known deities: `getDeities`, `getPantheon`, the character embed and Vow checks never list them.
- Tested with mocked data. The live Foundry UI is not tested here.

## 0.21.0 — 2026-10-27

Swearing a Vow gives the character a Vow feature.

- **Swear Vow** now adds one feat Item, "Vow of <god>", to the character: 1 use, back on a Long Rest, with an **Invoke your Vow** activity that spends the use and applies one Active Effect adding the god's +1d4 to the roll the Vow names (a skill, a save, an ability check, a tool or an attack). The Item's description carries the god's summary and requirement. Where a Vow only helps against something ("against being Frightened"), the description says so: Foundry cannot tell what a roll is against, so the player decides.
- Only one Vow Item exists at a time. Swapping gods, ending the Vow with the toggle, and **Break Vow…** all remove the old Item (and any applied Vow effect). Swearing again recreates a deleted Item. Other Items are never touched. The Item is flagged `flags.ashen-gate-factions.vowItem` (Managed by Renown).
- dnd5e 6.0.6 has no "ends after this roll" duration, so Renown ends the applied effect itself after the next matching roll; a one-hour duration is the fallback.
- A character who already has a sworn Vow gets the Item the next time the GM's client loads (re-runnable repair; nothing else is rewritten). Importing a deity never touches a character's Vow or Vow Item.
- A short Vow history (sworn, replaced, ended, broken) is kept in the character's `vowLog` flag.
- The Seeker reward can carry a `vow_benefit` record (name, bonus, applies_to, uses, summary, requirement); the source allowlist accepts exactly that shape and nothing more, so the Pantheon file with Seeker Vows imports. A reward with a `vow` tag and no `vow_benefit` still lets the Vow be sworn, with no Item. `vow_benefit` is not sent to a player until they reach the rank.
- The toggle appears on the first rank card whatever the reward's behavior, including passive rewards with no use limit.
- Tested with mocked data. The live Foundry UI and the dnd5e roll flow are not tested here.

## 0.20.3 — 2026-10-26

Narrow-window fixes (shared kit 2.4.0).

- **A narrow window no longer scrolls a list inside the page.** When the list and the editor stack, the list takes its natural height and the window scrolls once. Side by side (wider windows) the list and the editor keep their own scroll.
- The faction editor (Factions tab) and the Group / Character pages remember their scroll position in that single scroll area.
- **Stacked list and editor: picking a row brings the editor into view.** In a narrow window, picking a row (or creating a new one) scrolls to the editor or faction details and moves focus to its heading, and a **Back to list** button at its top (shown only while stacked) scrolls back to the selected row and focuses it. Wide windows are unchanged; scrolling is instant under reduced motion.
- **Tab rows that scroll sideways now show it.** When tabs are cut off at the edge of a narrow window, that edge fades out, and the selected tab is scrolled into view when the window opens (before, the last tabs, such as GM Setup, could be hidden with no sign that more existed). Arrow keys and Tab bring a hidden tab into view. Nothing animates.
- No change to saved data. Check in Forge: Renown > Factions with the window about 600 px wide or less: the roster is full length, and the editor follows it with all of its fields.

## 0.20.2 — 2026-10-26

- **Fix:** asking again for a reward that is already waiting (a one-time claim still pending or approved, or a repeatable service already requested or approved) is no longer treated as an error. The player gets "Renown request received by GM." and the GM does not get a red "Reward not available for request" notice. The GM is still told only once, when the first request arrives. A reward that was already delivered, or is out of uses, is still refused as before.

## 0.20.1 — 2026-10-26

- **Fix:** when two players share the same faction at about the same time (or a Share arrives after the party already knows it), Renown now answers "Discovery shared with party." Before, the player got the red "Renown request was not accepted" notice although nothing was wrong.
- README: held reward copies are in **Ashen Gate / Backups / Renown Rewards** (it still named the old folder).
- No change to saved data. Mocked tests only; hard to try by hand (it needs two players sharing together), so the test covers it.

## 0.20.0 — 2026-10-26

Renown now files its Journals and held reward Items under one **Ashen Gate** folder instead of a second top-level folder: definitions, state and the per-player views go in **Ashen Gate / Factions Data**, import snapshots in **Ashen Gate / Backups**, held reward copies in **Ashen Gate / Backups / Renown Rewards**. On the first GM login after updating, Renown moves its own documents that are in the old **Ashen Gate — Factions Data** or **Ashen Gate Rewards (Renown)** folder (or loose); anything you filed somewhere else stays where you put it. Nothing is deleted (the old, now empty folders stay for you to delete) and no ownership or permission changes. Players still see only their own view.

## 0.19.1 — 2026-10-26

Two messages that still said Renown for a deity now say Piety (follow-up to 0.19.0).

- Recording a change on a deity shows "<Character> Piety: 3 → 5" (factions keep "Renown: …").
- Approving a deity reward the character no longer qualifies for says "Piety no longer qualifies."
- **Break Vow…** now asks with the danger confirmation, where Enter and the first focus are on Cancel (it used the standard one, whose action button was the default).
- No change to saved data. Mocked tests only; check in Forge by recording a Piety change on a deity.

## 0.19.0 — 2026-10-26

Pantheon: Piety, paragraphs and a Vows note.

- The deity score is now called **Piety** everywhere a person reads it: Pantheon tab (rank meter, rank badges, heading, history, award box), the character's Pantheon section, the deity editor, dialogs and Help. Faction and Group tabs keep Renown. Display wording only; ids, flags, settings, API names and saved data are unchanged.
- Reward descriptions and rank benefits now show a blank line as a paragraph gap (single line breaks are still kept), on Pantheon cards and on the Group and Character tabs.
- A short **How Vows work** note sits at the top of the Pantheon tab (also in Help).
- A rank with a reward but no written description now shows the reward's teaser instead of an empty card; a rank with neither shows "Nothing to claim at this rank."
- **Vows.** The first rank card of a god the character has reached has a **Swear Vow** / **Vow sworn** toggle (text and pressed state, keyboard accessible) for the character's owner and the GM. One Vow per character across all gods: swearing to another god asks "Swear a Vow to <god>? This ends your Vow to <other>.". The GM also gets **Break Vow…** (confirmation, danger button), which ends the Vow, takes 3 piety with that god (never below 0) and logs it in the piety history. The sworn Vow shows above the Pantheon cards and in the character embed ("Vow: <god>").
- Saved data: the Vow is a new Actor flag (`flags.ashen-gate-factions.vow`); a re-runnable repair runs with the GM's usual startup migration and touches only actors that already have the flag. Nothing is written on import. Tested with mocked data and a headless-browser layout check, not the live Forge UI.

## 0.18.2 — 2026-10-26

Renown ignores Manager bulk writes (Sync, Import) while they run and redraws once when they finish. No change to saved data.

## 0.18.1 — 2026-10-25

Line breaks in reward text are kept.

- Reward descriptions and teasers, and rank benefits, now show the line breaks the author wrote (`\n` in the source text), so a reward can read "what it does / Limit: / Price:" on separate lines. This is display only (CSS `white-space: pre-line`); the text is still escaped plain text, never HTML. Information entries already kept their line breaks.
- **Add a reward** now has a multi-line Description box (it was a single line). Edit… on a reward already had one, and keeps line breaks when saved.
- Import and update mode (0.18.0) carry the line breaks through unchanged; a change that is only a line break counts as a change in the preview. The source schema already accepted `\n` in `description`, `teaser` and `benefit` and puts no length limit on them, so nothing was raised.
- Saved data: no change, no migration. Tested with mocked data only (logic and stylesheet, not the live Forge UI).

## 0.18.0 — 2026-10-25

Import update mode: refresh the factions and deities already in your world from a newer file.

- **`api.previewFactionsImport(data, {mode, overwriteEdited})` and `api.importFactions(data, {mode, overwriteEdited})`** (GM only). `mode` is `'skip'` (the default, exactly as before: records already here are kept as they are) or `'update'`. Anything else is refused. `api.importOptions` (`ag-renown-import/1`, modes `skip`/`update`) lets General Manager feature-detect it.
- **What update rewrites:** the definition of a record already in the world: name, public text, ranks and milestones (thresholds, benefits, choose-one), rewards, information entries, relations and resonance, tags, refs, visibility, status, version and provenance. The folder a faction sits in is yours and is kept unless the file names a folder that exists here.
- **What update keeps:** standings and their history, claims, requests, used charges, rewards already claimed, choices made at choose-one milestones, discovery, what the party learned for each entry, field reveals and every character's personal record. Ids are permanent, so all of it stays attached. An id the new file drops (a reward, milestone or entry) keeps its saved data and is listed as *no longer defined*; nothing is deleted. A new id starts empty (a new entry whose Renown threshold the party already meets is learned, as for any new entry).
- **Preview per record:** New, Update (with what changes: field names and counts of milestones, rewards and entries added, removed or changed), Unchanged, or Kept: edited. Renown now remembers a fingerprint of each definition at import; a definition you changed in Renown's editor since is *Kept: edited* unless you turn on **Also overwrite faction edits**. Records imported by an older Renown have no fingerprint, so edits cannot be told apart: they update, and the preview says so.
- **Snapshot first:** before any write, the old definitions about to be replaced are saved as a GM-only Journal (*Renown Snapshot • date*, in the Ashen Gate — Factions Data folder) holding the JSON, and the Import button also downloads it. If the snapshot cannot be saved, nothing is changed.
- **Safe to repeat:** running the same file again changes nothing (every record shows Unchanged). A rename done by `supersedes` is not counted as an edit. A definition that still holds old campaign data from before the migration is kept until the world has been opened by the GM once.
- **Import… in the Factions tab:** when the file has records already here it asks whether to update them and whether to overwrite faction edits (both off).
- Saved data: no migration. New optional world data: `importSource` (fingerprint) on definition Journals and `importSnapshot` Journals. Tested with mocked data only (logic, not the live Forge UI).

## 0.17.0 — 2026-10-25

`supersedes` for information entries and a GM-only `api.supersedeIds`.

- A faction or deity file may now carry `supersedes: ["<old id>"]` on a faction/deity and on its information entries (the closed source schema accepted no unknown keys before). It is an instruction to the importer and is not stored in the definition.
- **`api.supersedeIds({OLD_ENTRY_ID: 'NEW_ENTRY_ID'}, {dryRun, definitions})`** (GM only, safe to run again): renames the entry in the stored definition (with `definitions`, the new entry's name and text replace the old) and moves what the party learned for it (`knowledge`) to the new id. Standings, claims, requests, rewards, choices and track ids are not touched. An old id that is not there is skipped; a faction or deity id is reported and not renamed. General Manager calls it when you apply a package.
- Saved data: no migration. Tested with mocked data only (logic, not the live Forge UI).

## 0.16.3 — 2026-10-24

- **Related quests and contracts: pick the quest by name.** *Quest, work order or contract* is a searchable list (grouped Quest, Work order, Contract) instead of a box to paste an id into. Saved references now read as the quest's name; one whose quest has been deleted reads *Missing* (Remove still works). If Quest Log is off, the list says so and saved references show their kind. The id stays in the *Details* disclosure of each saved reference.
- Saved data: no change; references already stored keep working. No migration.

## 0.16.2 — 2026-10-24

- Shared UI kit 2.3.0 (id helpers and the record picker, used by Quest Log first). No change to how this module looks or works.
- Saved data: no change; no migration.

## 0.16.1 — 2026-10-24

Canonical ids and stored tokens are hidden from the UI. No changes to saved data, ids, flags, the API or export files.

- **Related quests and contracts** (Factions tab, Links) shows each reference as Quest, Work order or Contract plus its relationship, not the id. The GM can open **Details** on a row for the id and **Copy id**; the Remove button and its confirmation no longer name the id. Adding a reference still means pasting an id.
- **Item rewards** show a *Permanent id* badge instead of the id; **Details** (GM) holds the id and **Copy id**. The GM Setup check for permanent ids lists faction and reward names only.
- Messages and notifications (import problems, deity relation problems, invalid or duplicate references, Undo favour, request lists) use names, or a neutral label such as *Unnamed faction* or *Unknown deity*. Searching the roster by id still matches.
- Relation, mode, status, unlock, behaviour and visibility values show as plain labels everywhere (an unknown objective relation reads *Related to* instead of the stored token). Import file problems for the GM keep their file-path detail.
- New test `no-ids-ui.test.mjs`.

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
