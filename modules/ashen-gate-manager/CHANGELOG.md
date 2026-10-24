## 0.60.11 — 2026-10-24

Scenes, second iteration. Everything is previewable and undoable, nothing is written without Apply, GM only.

- **Seven new layers.** Blight: **Ash fall**, **Blight haze**, **Ember glow**, **Heat shimmer**. Atmosphere: **Fog bank**, **Candlelit interior**, **Underwater murk**. (Ash fall uses core snow weather under a grey tint, and Heat shimmer is a warm tint only: Foundry has no ash or heat-distortion effect.) Worlds with a saved list do not get them silently: Moods & layers shows "Add shipped presets", which adds only what is missing and never changes your own presets.
- **Time of day blend** (Live > Fine-tune): pick two moods and drag the slider; on release the controls below fill with the blend. It is a draft until *Apply to scene*.
- **Random weather** (Live): a seeded proposal (same seed, same result), shown as text first. It only adds layers (one weather and up to two others, Blight ones a little more often), optionally a new mood if "Keep the current mood" is off. *Apply this roll* does it; *Discard* drops it.
- **Looks** (new Scenes sub-tab): save a scene's mood and layers under a name, preview what it would do to chosen scenes or every scene in a folder, then *Apply look*. Rows say Will change, Nothing to change, or Cannot apply and why. **Undo last batch** puts every scene back (a value you changed since is kept). A look can link a playlist; it starts or stops only if you tick that when applying.
- **Default look per scene** (Looks, off by default): with "Restore default looks when a scene is activated" on, activating a scene that has a default look applies it (no music, no fade, and not if it already shows it).
- **No flashing** switch (Live): presets can be marked "Flashing or strobing"; while the switch is on they refuse to apply and never come up in Random weather. None of the shipped presets flash (Manager has no lightning or strobe effect); the switch covers presets you or an imported file mark.
- **Macro API:** `game.modules.get('ashen-gate-manager').api.scenes.apply("Name")` applies a look, mood or layer by name (looks first). Also `names`, `listLooks`, `saveLook`, `removeLook`, `previewLook`, `applyLook`, `undoLastBatch`, `setDefaultLook`, `setAutoLook`, `getCalm`, `setCalm`, `planPreset`, `addNewDefaults`.
- Moods files may carry `"flashing": true` on a preset (optional; older files import as before).
- Saved data: three new world settings (looks, default-look switch, No flashing) and an optional `defaultLook` flag on a scene you choose; nothing existing is rewritten; no migration.
- Tested with mocked Foundry only (logic, not the live Forge UI or how the effects look).

## 0.60.10 — 2026-10-24

- **Fix: Preview sync no longer stops with "Cannot read properties of null (reading 'type')".** Sync read the type of embedded Items, effects, pages and table results (and of the item list saved at the last import) without allowing for an empty or missing entry, so one odd entry in one document stopped the whole preview. Those lists now skip empty entries.
- **One document that cannot be compared no longer stops the preview.** It is listed under Untouched as "Could not compare this record" with the reason, left exactly as it is (never written, never deleted), and the rest of the preview carries on. If the preview itself still fails, the message now says which step (reading the files, reading your world, comparing) and the full error with its stack is in the browser console (F12).
- Sync's safety rules are unchanged: it only deletes documents Manager imported, and never touches character sheets. Tested with mocked data only; not run in a live Foundry.
- Saved data: no change; no migration.

## 0.60.9 — 2026-10-24

- **Assets: matching images to records by name.** After you drop images on the Assets bar (or Choose files…), Manager now previews which records they fit, and **Find matching files** does the same for a folder. A file named after a record's permanent id still wins. Otherwise it guesses from the file name: the whole name, then first and last name, then a single first or last name (Actors only; at least 3 letters, not a very common word). Case, `_ - .`, sizes, trailing numbers and words like portrait, token, final, img and copy are ignored, as are titles (Mr, Dame, the) in the record name. Each row says why it fits, strongest first, NPCs first. Guesses start ticked unless the record's image was set in Foundry.
- **Never guessed between.** A file that fits several records equally, or a record that fits several files, shows as an unticked row with a list to pick from. Picking ticks it (unless the image was set in Foundry).
- **Existing Actors can be linked here.** Only the portrait and the prototype token image change (the token ring and everything else are untouched), and only when the row is ticked and you press Link. The table shows the old images. A record or token image that changed since the preview is skipped. No rename, move or delete.
- Saved data: no change; no migration.

## 0.60.8 — 2026-10-24

- **Small pause indicator also removes Foundry's pause screen effect.** With *Show the pause as a small indicator* on, the teal glow around the screen edges (and the dimmed side panels) is switched off while the game is paused, so only the small Paused label remains. With the setting off, or the game running, nothing changes. The effect's exact source could not be checked in a live Foundry, so this targets the usual layers; if a glow remains, the README (Pause glow) says how to find it, and a GM can run `game.modules.get('ashen-gate-manager').api.pauseGlowReport()` while paused.
- Saved data: no change; no migration.

## 0.60.7 — 2026-10-24

- **Pull from GitHub: folders without a manifest start unticked.** After Find packs, packs with a manifest are still ticked. A folder with no manifest (for example an old or archive folder) now starts unticked and says "No manifest: files import in name order. Tick only if you want this folder." Tick it yourself to pull it. Import order and everything else about pulling is unchanged.
- **Skill Trees import preview shows the tree summary.** When Skill Trees describes a new tree (for example how many nodes it has), the preview row shows that line instead of "New; imported through Skill Trees." Older Skill Trees versions show the old line. Nothing else changes.
- Saved data: no change; no migration.

## 0.60.6 — 2026-10-24

- **Fix: Sync from package no longer reports "unresolved required reference" for records another file in the sync defines.** A package that links to a profession (or any record) defined in an earlier file, such as the Crafting Extensions pack linking to `PROF-*`, was checked against an empty list of known records during Sync, so every cross-file link failed and the whole sync was stopped. Sync now checks links against the world, the other files in the sync, and the file itself. A link to a record that is in none of them is still reported.
- Saved data: no change. No migration.

## 0.60.5 — 2026-10-24

- **Scene moods and layers: the id is made from the label.** The new mood / layer editor no longer asks for an *Id*. It is made from the label when you save (lower-case words joined by dashes, `-2`, `-3`... if taken) and does not change later. *Advanced: set id (optional)* is still there for a new one. A duplicate also gets a made id instead of a typed `-copy`.
- Saved data: no change; existing moods and layers keep their ids. No migration.

## 0.60.4 — 2026-10-24

- Shared UI kit 2.3.0 (id helpers and the record picker, used by Quest Log first). No change to how this module looks or works.
- Saved data: no change; no migration.

## 0.60.3 — 2026-10-25

Hide ids from the UI. Permanent record ids (REC-, MAT-, NPC-, DEITY- and the rest) no longer show in Manager's rows, lists, tooltips, labels or messages; names show instead.

- **Where the id went:** GM-only places keep it, in a collapsed **Details** fold with a **Copy id** button: the import preview rows, import results and history, Items → Records (the detail pane), Core links, Browse (rows and detail), the Housekeeping report and the NPC Codex detail. Search by id still matches for the GM.
- **Names in messages:** import errors, review notes and results, Records actions, Check library, Codex errors, Browse "open" messages and the world-export summary use the record's name (or "this record") instead of its id. A link to a record that is not in this world reads "Location record (not in this world)". Validation messages about a link to a record that is not in the package can still name the missing id, because there is no name to show.
- **Machine words are gone from the screens:** relation names (such as `also_available_as_journal`), status and visibility values (`reveal_gated`, `gm`, `approved`) and entity types (`HandoutItem`) show as readable labels ("Also available as a journal", "Revealed by the GM", "Handout item") in Records, Browse, the import preview and the status filters. Stored values are unchanged.
- **No more "References" list in item descriptions.** Import used to append a list of the record's links, with the raw relation name and the id, to the description (players could read it). It no longer does, and a link written as `[[AGREF:ID|ID]]` now shows the linked document's name. Links stay in the record's data. On a re-import that already updates a record, the old list is removed from its description only if nobody has edited the description since the last import (it matches what the last import wrote); edited descriptions are left as they are. A record with an old list and no other change is refreshed the same way.
- **Related-record cells (author contract).** In an item description, a table cell written as `<td data-ag-ref="created_by">Iron Caltrops</td>` becomes a content link to the record linked under that relation (Recipe: Iron Caltrops) when that record is in the world and visible to players; otherwise it stays plain text. Re-importing, Sync from package and Update existing all resolve it the same way, and the marker stays so it can be resolved again. A record with links but no marker gets nothing added. See the README.
- **Not changed:** stored data, ids, flags, APIs and export file formats. The Pre-session check still names records by id on purpose, so the report can be pasted where players can read it without revealing hidden names.
- Tests are mocked (including a new no-ids test); please check the screens above in Forge.

## 0.60.2 — 2026-10-24

Fixes to **Pull from GitHub** (0.60.0). Stacked on 0.60.1.
- **Saving the token.** The token box was a password field, so the browser or a password manager filled it with a saved password (Robb's box showed 10 dots) and the save then complained about the token. It is now a plain text box shown as dots, with browser and password-manager autofill switched off. The pasted text is cleaned first (a trailing new line, invisible characters, wrapping quotes, a leading "Bearer"). Save settings now checks the token against GitHub for the chosen repository and says "saved" only when GitHub accepts it; a token GitHub refuses is not stored. Messages say which it is: "The pasted text does not look like a token: …" (wrong text, with what is wrong), "GitHub rejected the token (401) …", or "a well-formed token, but GitHub cannot see owner/name (404) …". An empty box with a token already saved just saves the other settings and says the token was not changed.
- **Doubled folder names.** A manifest may list paths from the repository root (as a pack built in the repository does), paths relative to its own folder, or bare file names (as in a ZIP). Each entry is tried root-relative first, then manifest-folder-relative, then as the one file of that name under the manifest's folder, using the repository's file list. Manifest order is kept and `..` still cannot leave the repository.
- **Folders without a manifest** (such as a sandbox pack) are now offered as a pack of their `.json` files in name order. Gathering node files are left out (the Profession Ledger imports them) and the pack row says so. A folder a manifest already lists is not offered twice.
- **Readable names.** Packs are named from the manifest's title or name (plus version), else from the file or folder name with dates and "manifest" removed. Rows show file names, not repository paths, in the pack list and the progress table. Tests are mocked; the real GitHub and Forge round trip is unchecked.

## 0.60.1 — 2026-10-24

**Fix: the compact pause indicator was invisible.** With *Show the pause as a small indicator* on, the big banner was hidden but the small Paused label never appeared. Foundry forces anything marked hidden to stay hidden, and the label was marked that way. It is now hidden by the module's own style instead, so it shows at the top centre while the game is paused. Style only; no saved data changes.

## 0.60.0 — 2026-10-24

**Pull from GitHub** (Import tab, GM only). Reads a content pack straight from a GitHub repository instead of downloading ZIP files, and hands it to Sync from package.
- **Settings you enter:** repository (owner/name), branch (main unless you change it), and the folder or manifest file of each pack (one per line). Nothing is prefilled.
- **Token:** a fine-grained, read-only personal access token (Contents: read) for that one repository. It is stored on this device only (a client setting, never a world setting, so players can never read it), is sent only to api.github.com, is never logged or put in a message, and is shown back masked. **Remove token…** deletes it (confirmation, Cancel is the default).
- **Find packs** lists the manifests under your paths (a main pack and a sandbox pack are separate lines); tick the ones to pull. **Pull selected packs** reads every file the manifest lists, in order and relative to the manifest folder, at one commit, four at a time, with a progress list and Cancel. Files over 1 MB are read through the git blobs API.
- **Plain-language errors** for an expired or rejected token, no access to the repository, a missing file or branch, rate limits and being offline.
- **Nothing partial reaches Sync:** if any file cannot be read, nothing is sent (a half-read pack would look like deletions to Sync).
- **Check for updates** (only when you press it; nothing runs at startup) compares each file's blob SHA with your last pull and says "Up to date" or how many files changed, per pack line.
- **Apply:** **Preview in Sync from package** puts the files through Sync's existing input stage and preview, so nothing changes before you confirm, edited records are kept by default and character sheets are never touched. **Use the normal import instead** lists them as the normal import's multi-file list.
- **Gathering node files** are imported by the Profession Ledger's own import; they are read, listed as handled by the Ledger and not sent to Sync.
- Saved data: three new client settings (token, pull settings, last-pull SHAs). No world data changes, no migration. Tests use a mocked fetch: the real GitHub round trip has not been tried.

## 0.59.0 — 2026-10-24

**Compact pause.** New GM setting **Show the pause as a small indicator** in **GM Setup → General → Game pause** (saved with Save Changes). Off by default, which leaves Foundry's large Game Paused banner exactly as it is.
- **On:** for everyone in the world the big banner is hidden and a small **Paused** label (pause icon plus the word) sits at the top centre of the screen. It does not take clicks, uses the skin's colours and has no animation.
- It follows Foundry's real paused state, including when you load the world already paused and after a reconnect. Pausing and resuming (the Pause button, the spacebar hotkey, other modules) are not touched; only the banner's look is replaced.
- Saved data: one new world setting, `compactPause`, read as off when absent. No migration. New `styles/pause.css`. Tests are mocked: how it looks in Forge has not been seen.

## 0.58.0 — 2026-10-24

**Chat reskin.** The chat sidebar and its messages follow your Ashen Gate skin. Presentation only: Foundry's and dnd5e's own messages, buttons, roll privacy and message menu are the real ones, just restyled. Stacked on 0.57.0.
- **Messages:** one header line (portrait, name, quiet player name and time, small menu). Whispers use a dashed edge, blind rolls a dotted edge and out-of-character messages a double edge, so state never rests on colour alone.
- **Rolls:** small formula, large total, *Critical* and *Fumble* labelled; natural 20 and natural 1 dice are outlined, dropped dice (advantage/disadvantage) struck through.
- **Item cards:** the description starts closed (dnd5e's own chevron still opens it, and an open one scrolls inside a capped height), tags are one quiet wrapped line, a card's attack and damage messages sit close together, and the action buttons (Attack, Damage, Critical, Save, Apply, and so on) are labelled, at least 36px tall, full width on the narrow sidebar, with clear hover and focus rings; the first action is the filled one and actions come last.
- **Chat box:** compact roll-mode row, tidy message box, the editor's Format toolbar appears only while you are typing; the Dice Tray module's tray (if installed) is restyled too.
- **Setting:** *Style the chat panel with this skin* in **My Appearance** (this device, on by default, saved with Save My Appearance). Nothing is saved or migrated; with it off, chat looks as Foundry made it.
- New `styles/chat.css`. Tests are mocked: how it looks in Forge has not been seen.

## 0.57.0 — 2026-10-24

New **Items → Assets** sub-tab (GM only) for the Forge Assets Library.
- **Browse:** thumbnails with folder navigation, a breadcrumb, search, *Show more* and a *Copy path* button on every image. On The Forge it opens the Assets Library; a Source menu switches to the Foundry data folder, which is also what you get when not on The Forge.
- **Add files:** drop several images onto the folder, or press *Choose files…* (a real button, so it works from the keyboard). Each file shows its result (uploaded, replaced, skipped, not uploaded); three upload at a time and *Stop* ends the run. If any file already exists in the folder you are asked once: skip them (the default) or replace them (a red button). Only image files are uploaded. *Create folder…* makes a folder in the one you are viewing.
- **Link files to records:** *Find matching files* looks in the folder you are viewing and the folders under it (up to 4 deep, 200 folder reads) for files named after a record's permanent id, such as `NPC-OREN.webp`. A table shows each record, the file, its image now and the new image. Nothing is written until *Link*. Records with a default image, an icon Manager chose or a file this tab linked earlier start ticked. A record whose image you set in Foundry, or that came with the import, starts unticked and is replaced only if you tick it. A record that changed since the preview is skipped. Only `img` (and Manager's own icon flags) is written. There is no undo, but the table lists every old image.
- **Actors are not linked here.** An existing Actor changes only through Import with *Update existing actors*, so Actors with a matching file are listed as not changed.
- **Missing art:** records with no image or a generic one, filter by kind and by none/generic, with the file name to use. After *Find matching files* a row says "File found" when its file is already in the library. Names are shown, not ids.
- **Rename, move and delete are not offered.** Foundry's FilePicker gives modules browse, create folder and upload only, and The Forge's Assets Library is reached through that same FilePicker, so there is nothing to build these on. The tab says so and has *Manage on Forge…* (opens the Assets Library page). The Forge's own source could not be read while building this; if Forge exposes a delete API, it can be added later.
- Saved data: nothing new is stored. Linking writes only the record's image and Manager's existing icon flags. No migration. Tests are mocked (FilePicker, documents); please check in Forge.

## 0.56.0 — 2026-10-24

**Sync from package** (Import tab). One switch, off by default, that makes the world match the package files you choose, as if they were literally the old ones. It is separate from *Update existing actors* and *Also apply updates*, which keep your edits; while Sync is on the normal import is paused, so the two never mix.

- **Choose everything in one go.** Pick several JSON files and ZIPs at once (Robb's pack is two ZIPs, main and sandbox). "Missing from the package" is judged against the union of all of them, per package line, so syncing the main ZIP alone never removes the sandbox records, and the preview says which package lines it compared against. A ZIP with an import-order manifest (`ag-alpha-manifest/1`) holds a whole pack. Each ZIP keeps its 50-file limit; a sync may join up to 150 files. An id in two files with different content is refused everywhere.
- **Preview first, nothing changes before you confirm.** Create, Overwrite (per-field differences on expand), Kept: edited in your world, Delete (every record by name and kind) and Untouched, with the same counts the run applies. A "Not removed" list for records other modules own.
- **Unedited records update fully; edited ones are kept.** Records match a world document by Manager's permanent id, never by name. Items (with their effects), Journals (pages by name), Roll Tables (results), Macros and NPC Actors take everything the package defines, but a record changed in your world since its import (judged from Manager's record of the last import; an Actor or other document with no such record counts as edited) is left alone and listed under *Kept: edited in your world (N)* with its field differences on expand. The off-by-default option *Also overwrite records I edited* lets the package win instead; the preview then counts the edited fields that will be lost. The same rule applies to deletes: an edited record (or one with no import record) that the files no longer carry is kept, under *Kept: edited in your world, no longer in the package*, and deleted only with that option ticked. An NPC keeps current and temporary HP, death saves, spell slot use, item quantities and uses, and its biography (the GM notes). Items copied onto Actors by the package follow it; items you added to an Actor stay. Fields the package no longer defines, fields adopted from a 2024 core item (Core links) and Actor effects are left as they are.
- **Character sheets are never touched.** No Actor of type character is created, overwritten or deleted, nor anything on one (Items, effects, flags), nor any hotbar. A world Item that is also on a character sheet can be overwritten or deleted and the sheet's copy stays exactly as it is. Refused in the data layer, not just hidden.
- **Delete only what Manager imported.** A document is deleted only when it carries Manager's source flag, its package line (`packageId`) is one of the lines in this sync, and no chosen file has its id. Records imported by an older Manager have no package line and are kept unless you tick *Also delete records not in these files*. Never deleted, and listed as Not removed instead: Keep here, protected-folder, archived, player-owned and scene-placed Actors, macros on a hotbar, Actors that are not NPCs, and records another surviving record still refers to. Deleted ids are retired (a world setting) and a later package cannot reuse one; an id that still exists can always be updated.
- **Other modules' records** (Locations, Routes, Shops and the Quest, Skill Tree, Headquarters, Renown and Strain files) are passed to those modules' own import APIs in update mode; each keeps its own state. Manager now remembers which ids it handed over (a hidden world setting, filled by normal imports too) and lists the ones a newer package drops as *Not removed: remove it in <module>*. Manager never deletes another module's records.
- **Safe to interrupt and repeat.** A typed confirmation (*Replace content from package*), a red *Replace N records and delete M* button, an automatic JSON backup of everything overwritten or deleted (and the other modules' exports) before the first write, and a world check just before writing. Work runs in chunks of 20 with a progress bar and *Cancel sync*. Deletes run last and only when nothing before them failed. Running the same files again changes nothing; a cancelled or failed run is finished by running it again. Rich-text links and other values Foundry stores differently from the package are remembered, so they are not reported as changes forever.
- ZIP artwork uploads to the same folders as a normal import (when *Upload matching ZIP portraits* is on).
- Page links in a Journal are now found by page name when the name is unique (a sync can add or drop pages).
- A record a sync creates, or writes because its content or metadata changed, gets the 0.55.0 ownership rule through the same functions the importer uses (`initialOwnership`, `releasable`): approved + player-visible Items, Journals and Actors become readable by players (Observer), a default is only ever raised. Records whose content already matches are not written; *Release player-visible records…* covers those.
- Saved data: two new hidden world settings, `syncRetiredIds` and `handoffLedger`, both empty by default; no migration. The source flag gains an optional `syncMemo` text on documents a sync writes. Existing documents are untouched until you run a sync. (Tests are mocked; please check on a copy of a world in Forge.)

## 0.55.0 — 2026-10-24

Fix: after an import, every gathering node material, recipe and similar record showed **Unreleased** in Profession Ledger. Manager created every imported world document hidden from players (default ownership None), even when the record is approved and player-visible, and the Ledger rightly treated a record players cannot read as not released.

- **Imports are readable by players when the record says so.** An Item, Journal entry or Actor whose record is `approved` with `player` visibility is now created with default ownership Observer. GM-only (`gm`), `reveal_gated` and not-approved records stay None, and Tables and Macros are unchanged. A re-import raises a None default to Observer under the same rule; it never lowers anything, never touches per-user ownership, and leaves alone a default you lowered on purpose after Manager released the record.
- **Worlds imported before 0.55.0 need a one-time release.** Open **Items → Checks → Release player-visible records…**, press *Find hidden player-visible records*, read the counts and examples, then *Release*. It sets only the default ownership to Observer for approved, player-visible records, in chunks with a progress bar and Cancel, and running it again does nothing. Records that were not imported by Manager are not touched.
- **Pre-session check** has a new *Player visibility* line (WARN while approved, player-visible records are still hidden, with the id list and where to fix it).
- Help and README explain the rule. Saved data: only `ownership.default` and a small `ownershipBaseline` flag on documents you release or import; nothing else changes. Tests are mocked; please check in Forge (see the PR).

## 0.54.1 — 2026-10-23

Fix: when one player saved My Appearance, every other client changed to that skin too. Foundry tells every client when any user's per-user setting changes, and Manager adopted the value it was handed as its own. Now a per-user skin is taken only from your own changes, and another user's change is ignored. The world default and your own Size are unchanged. Saved data is untouched. (Tests are mocked; please check with two accounts in Forge.)

## 0.54.0 — 2026-10-23

Nine new appearance skins, 16 in all. Pick them in GM Setup → General (world default) or My Appearance (your own; every player can choose any of them).

- **Colour skins:** *Blightgreen* (olive-grey with a pale lime accent), *Cinderlight* (near-black with one orange-gold ember), *Hearthfire* (warm amber on dark oak), *Frostbound* (cold blue-white on deep navy), *High Contrast* (pure black and white, yellow focus ring; text at least 7:1 and borders at least 4.5:1) and *Daylight* (cool, low-glare paper with a calm teal accent). Daylight is the only light one.
- **Shaped skins:** *Ledger Book* (ruled lines, column rules and stamped headings on green-cream paper), *Field Journal* (leather cover, stitched edges, pasted-note cards) and *Frontier Map* (faint contour lines, a compass rose beside the title, sepia ink). Like Stone Tablet and Tome Pages they only reshape the shared kit components, work at both sizes, use no images beyond inline SVG and have no animation.
- Every text, status, focus-ring and border pairing of the nine skins is checked by a test (text 4.5:1, focus ring and borders 3:1).
- Saved data: no change. Existing skin choices stay as they are. No migration.

## 0.53.1 — 2026-10-23

Code-read review fixes for the pre-session check and ZIP import.

- **Pre-session check uses Quest Log's item rule.** The Recipes and Skill trees rows counted retired, superseded and archived items, and ids shared by two items, as present. They now count only active items with exactly one holder of the id, so a recipe or perk is flagged when Quest Log would call its item missing.
- **Quest rewards row flags shared ids.** A reward whose item id is held by two items (Quest Log status "conflict") is now listed, as well as one that is missing.
- **ZIP import order no longer depends on the browser's language, and honours the intended order.** Files of the same kind are sorted by plain character comparison and by the number in the `L18_25`-style prefix, not by `localeCompare`. If the ZIP holds the alpha import manifest (`ordered_files`), that order is used (the manifest is listed as used, not as an unknown file). Without it, files sharing a prefix import after the files whose ids they name, so the two `L18_25` files import Artistry first, then Act One. Content files are unchanged.
- Saved data: unchanged. No migration.

## 0.53.0 — 2026-10-23

Pre-session check (Modules tab, GM only). Still strictly read-only: it writes nothing to the world.

- **Clear results** next to *Run pre-session check* removes the report from the window. The report is not saved anywhere (no setting or flag), so this changes nothing in the world. With no report, Clear, Copy and Download are off and the section says "Run the check to see results." Focus stays on *Run pre-session check* after Run and moves there after Clear.
- **Character Hub and Cinders** are in the check: *Module versions* shows them active, not active or not installed like the others, and *Player Access* reads Cinders' switch. Character Hub has no Player Access switch (players open it as their character's sheet), so its line is N-A.
- **New content checks**, each PASS / WARN / N-A with what to do; long lists stop after 10 ids ("and 12 more"):
  - *Recipes*: a craft recipe whose result item (`result_item_id`) or `MAT-*` ingredient is not in the world. Activity recipes are never flagged.
  - *Skill trees*: a tree node whose perk has no imported Item (N-A without Skill Trees).
  - *Core links*: imported Items with a `core_ref` that are not linked yet; "Adopt them in Items > Core links". An Item linked without adopting (Core links' link-only choice) counts as done, as it does in Core links.
  - *Profession Ledger*: tool and skill names from imported profession content that match no dnd5e tool or skill (N-A without the Ledger).
  - *Quest rewards*: a quest item reward whose item is not in the world (N-A without Quest Log's rewards list).
  - *Imports*: N-A. Manager does not store Blocked or Conflict results (it works them out when you preview a package), so the check does not guess them.
- Saved data: no change; no migration.

## 0.52.2 — 2026-10-23

Import fixes from the real-Foundry test run.

- **Deep folder paths no longer fail the import.** Foundry allows at most 4 folder levels. A deeper `folder_path` keeps its first 3 levels and joins the rest into the 4th with " - ": *Ashen Gate/Professions/Artistry/Music/Compositions* files into *Ashen Gate/Professions/Artistry/**Music - Compositions***. Same path, same folder every time, so re-imports reuse it. Applies to Items, Journals, Actors, Roll Tables and Macros. The Import preview shows the folder that will be used under the record's type, plus one note listing the shortened paths. Content files are unchanged. A failed earlier run may have left an empty *Music* folder; it can be deleted.
- **Re-importing a package you already imported plans Update again.** Foundry stores Manager's last-import record of each field in nested form after a document update, and Manager misread that as the package having removed `system`, so every changed record showed Blocked "Source removed system". Manager now reads both forms, so a changed record is Update, one where your edit would be overwritten is Conflict, and a field a package really removed is still Blocked.
- **ZIP import ("Import everything without stopping"): Blocked and Conflict records are listed under Needs your decision** with their reason (grouped, e.g. "Blocked (reason): A, B"), instead of being counted as Skipped.
- **Browse: "activity" finds activity recipes.** The word activity (or activities) now matches activity recipes and names with the word, not every crafted item whose description mentions a dnd5e activity. Other words still search descriptions.
- Saved data: no change; no migration. Earlier imports are read as they are.

## 0.52.1 — 2026-10-23

- Removed the Beta wording from the interface. The module description in Setup → Add-on Modules now reads *GM-only import/library and optional module hub, Player Access dashboard, plus the appearance controller with separate GM and player choices. For Foundry V14.* (before: "…Beta; Foundry V14 runtime unverified.").
- Import messages no longer say "in alpha": a Journal template that shares pages says "Journal pages cannot be shared between records.", and a blocked full replacement says "Full source replacement works for Items only."
- Internal contract ids (such as `ag-appearance/0.1-beta`) keep their names. Saved data: no change; no migration.

## 0.52.0 — 2026-10-23

Browse search and smart icons, from the live test.

- **Browse search finds what a row shows.** Every chip on a Browse row is now searchable, so "activity" lists the activity recipes and "creative" the creative professions. A recipe is also found by its profession's word for a recipe: if a profession calls its recipes "Compositions", searching "composition" lists the profession and its recipes. Craft recipes don't match "activity". Typing in the search box now always starts at the first page of results (before, only Enter went back to page 1).
- **Smart icons: fewer odd picks.**
  - Id-like parts of a name ("LIT-01", "MUS-01", anything with a digit), [TEST]-style tags and words under 4 letters are ignored, except a short list of real words such as axe, bow, orb and ale.
  - A keyword only matches a whole word or its plural, never the start of a longer word ("Lutenist" is not a lute).
  - Creative words point at Foundry core art that exists: artistry, art, painting, portrait, canvas and brush give a paint brush; music, lute, lyre, ballad, song and instrument give an instrument; poem, verse, literary, quill and scroll give a scroll, quill or book; play, mask, theatre and performance give a mask.
  - When nothing fits the name well enough, the record gets Manager's generic icon for its type, and the Import preview says **no confident match** (Improve icons says "No confident match; use Change…"). The kind or the description alone no longer picks an icon, so an activity recipe with an unhelpful name gets the generic recipe icon instead of a random mask.
  - Unchanged: an icon set on a record or by you in Foundry is always kept, Change… and Undo work as before, and imports, ids and saved data don't change.
- Saved data: no change; no migration.

## 0.51.0 — 2026-10-22

- **Creative Work Orders.** Import now accepts a Work Order (`ORDER-*`) whose `work_order_domain` is `creative` (Artistry commissions such as a ballad or a portrait), alongside `crafting` and `production`. A missing or unknown domain is still refused, now with "Work Order requires a crafting, production or creative domain." Matches Quest Log 0.18.0.
- Saved data: no change; no migration.

## 0.50.0 — 2026-10-22

Import a whole ZIP without confirming each file.

- **Import everything without stopping** (new, off by default, on the ZIP files list). Each ticked file is previewed in the usual order and its new records and metadata refreshes are imported straight away, with the same checks, backups, Import history and results as pressing Import yourself. Your Options (profile, update and icon settings) still apply, and records the preview blocks or excludes are never imported. It starts off again for every new ZIP.
- **Also apply updates to records that already exist** (only with the first box). Off: records already in your world are left as they are and listed as **Needs your decision** in the summary. On: the updates your Options allow are applied too, after Manager downloads its usual backup of the changed documents. An icon-only change counts as an update.
- **Pauses only when needed.** Auto mode stops at a file with errors, or when an import fails or cannot start; **Skip this file** goes on with the rest, **Stop ZIP import** ends it. While it runs, the window shows "File n of m" with the file name, and **Stop ZIP import** stays available (it stops after the current file).
- **Summary.** At the end, one row per file: Created, Updated, Unchanged, Needs your decision, Skipped and Failed, with the same Done / Done with notes / Needs attention labels as the Import results panel.
- Quest Log, Skill Trees, Strain, Headquarters and Renown files run through their own modules the same way. A file whose module is off or too old is listed as Nothing to import, with the reason.
- With the box off, ZIP import works exactly as before.

## 0.49.0 — 2026-10-22

For effect notes and recipe names in Profession Ledger 0.29.0. Display only: imports, ids and saved data don't change.

- **Effect notes on activities.** An activity recipe's effect note (`effect_note`, up to 400 characters: a boon the GM decides at the table) shows in Browse as an **Effect note** chip and detail field, and Browse search finds its words. The Import preview row says "Effect note" after the effort and tier. A note on a craft recipe is not shown (the Ledger ignores it).
- **What a profession calls a recipe.** A Profession record's `recipeLabel` / `recipeLabelPlural` (1–30 characters each) shows in Browse as **Recipe label**, for example "Formula / Formulas", as a chip and detail field, and in the Import preview row. A profession with only a recipe label and no category now shows it too. A label longer than 30 characters is ignored, as in the Ledger.
- Re-importing a record that gains either field shows as a metadata refresh, as for any new field.
- New sample: `samples/AG_Artistry_v0.49.0_Test.json` (synthetic [TEST] data) adds an effect note and recipe labels to the Artistry sample.
- **Content checker** (`scripts/validate-content.mjs`, repo root): notes, not errors, when an effect note isn't text, is over 400 characters or is on a craft recipe, and when a recipe label isn't 1–30 characters of text.

## 0.48.0 — 2026-10-22

For the new Artistry profession in Profession Ledger 0.28.0.

- **Creative professions import.** A Profession record with `profession_kind: "creative"` (or `category: "creative"`) imports like a crafting or gathering one. Artistry is `PROF-ARTISTRY`.
- **Activity recipes import.** A Recipe record with `kind: "activity"` (a performance, a painting) has no ingredients and no result item. It imports as its recipe Item, the thing a character learns, and nothing else: no result Item and no "missing result item" or "no ingredients" problem. Recipes without `kind` are craft recipes and import exactly as before, errors included.
- **Import preview:** under the Type, a recipe shows *Activity* or *Craft* with its effort and tier ("Activity · Short effort · Apprentice"), and a profession shows its category ("Creative"). The downloaded preview report has the same line.
- **Browse:** recipes get an *Activity* or *Craft* chip, professions their category, with *Recipe kind*, *Effort*, *Tier*, *Tools* or *Profession category* in the detail. Searching "activity" finds activities.
- **"Any musical instrument"** (also "Musical instrument", "music") is a group of tools. Manager never checked tool names, so it imports in a profession's access list and in `required_tools` like any other.
- **Smart icons know creative words:** music, instrument, lute, lyre, drum, song, performance (instruments); paint, brush, canvas, art (painting); sculpt, statue (sculpture); poem, verse (scrolls and quills); play, mask, theatre (masks). "Instrument" now means a musical instrument, not a hand tool. An activity whose name matches nothing gets a stage or instrument icon instead of a document.
- The new fields (`kind`, `access`, the creative category) are kept whole in the stored definition and in world export.
- New sample: `samples/AG_Artistry_v0.48.0_Test.json` ([TEST] Artistry and two [TEST] activities).
- Saved data: no change. No migration.

## 0.47.0 — 2026-10-22

- **Smart icons.** A record with no icon, or only a placeholder (blank, Foundry's bag / mystery man / d20 / dice art, dnd5e's default item art, Manager's own generic icons, or a local file that is missing), now gets a fitting icon from Foundry's own icon library (core `icons/`, plus `systems/dnd5e/icons` when it can be read), picked from its name, kind and tags: "Iron Caltrops" gets a caltrops icon, "Healing Draught" a potion, "Oak Shield" a shield. The same record always gets the same icon. If nothing fits, the generic category icon is used as before. The words-to-folders list is in `scripts/icon-keywords.js` and easy to extend.
- **Icons you chose are never replaced.** An icon set in the import file is kept exactly as written, even a generic one used by many records (the brown scroll stays). Remote URLs and `assets/` or `worlds/` paths are never touched. On a re-import Manager fills an icon only when the world copy still has a placeholder; an icon you changed in Foundry stays. Icons Manager picked before are picked again only when you tick **Re-pick smart icons**. A re-import whose only change is filling a placeholder icon shows as **Icon** in the preview.
- **Import preview: Icon column.** Each record that gets a chosen icon shows a small picture, the path and why ("matched: potion"), with **Change…** to pick another file (your pick is what Import writes) and **Use suggestion** to go back. **Choose icons for records without one** in Options turns it off (on by default; remembered per user). The icon library is indexed once per browser in the background ("Indexing icons…"); the preview never waits for it, and if the library cannot be read (on The Forge, say) generic icons are used.
- **Items → Checks → Improve icons.** *Find placeholder icons* lists world Items and Actors whose icon is a placeholder, with a suggestion and **Change…** for each (player characters start unticked). **Apply (n)…** writes in chunks of 50 with **Cancel**, **Download backup** saves the current icons first, and **Undo last icon change** puts the last run back (only icons still as Manager left them). GM only.
- Each imported Item, Actor, Roll Table and Macro now records who chose its icon: `flags.ashen-gate-manager.iconSource` (`smart`, `authored` or `fallback`) and `flags.ashen-gate-manager.iconPath`. A Change… pick counts as `authored`. Packages may leave out `foundry.data.img`: Manager chooses one.
- Saved data: no migration. New world setting `iconUndo` (hidden) for Undo; the icon index is cached in this browser's localStorage. Documents imported before 0.47.0 keep their icons; placeholder ones can be filled by a re-import or Improve icons.

## 0.46.1 — 2026-10-22

- Locations 0.20.0 retired routes. A Route record in an import is now skipped with "Routes are retired; make a location with type Route instead." (it used to say to enable or update Locations). Location records in the same file still import. Manager still passes Route records on to a Locations that can import them.
- Saved data: no change. No migration.

## 0.46.0 — 2026-10-22

UI/UX cleanup (docs/ui-audit-2026-10.md, General Manager; shared kit 2.2 helpers). Nothing about importing changes.

- **Six tabs: Import · Items · NPC Codex · Modules · Scenes · GM Setup.** NPC Codex is its own tab (it was the 8th icon in the Items rail). History is now **Import → Import history**. The arrow keys move between tabs; focus stays on the tab you picked.
- **Text sub-tabs instead of icon rails.** Items: **Browse · Records · Folders · Core links · Checks · Export**. Scenes: **Live · Moods & layers · Export & import**. The search and filter toolbar shows only on Browse, Records, Folders and Core links.
- **Items filters behind Filters (n).** The toolbar is one row (search, Filters (n), Sort / Group on Browse, Clear filters, Load compendiums); Filters (n) opens a second row with Source, Type, Origin, Rarity, Folder, *Has core_ref* and, on Browse, its own filters. Results start right under the toolbar. The search syntax moved to Help.
- **Folders in four folds:** Clean compendiums (open), Organize a selection, Rules & protected folders, History. Shorter help text; the full "how the rules decide" is in Help.
- **NPC Codex detail sub-tabs: Reveals · Notes & links · Player preview.** Reveals are marked *Applies now*; Notes & links has its own Save Changes at the bottom. Unsaved notes are kept while you switch sub-tabs and asked about before you pick another NPC or close the window.
- **Appearance:** the world default skin is set only in **GM Setup → General**, with the skin cards. The header button is now **My Appearance** (your own skin and size). In My Appearance, Size now saves with *Save My Appearance* (it used to save on click), with Cancel and an "Unsaved changes" status.
- **GM Setup sub-tabs: General · Core sources · Developer Tools.** Developer Tools now holds the example package, the sample/starter/manifest downloads (moved from Import → Options) and *Adopt & tag world Items* (moved from the Items rail). Unsaved GM Setup changes survive tab switches and re-renders; closing the window asks first.
- **NPC Codex player access is on the Modules tab.** General Manager now has a card there, *General Manager (NPC Codex)*, with Reveal / Hide like the other modules, and **Hide all** covers it. It uses the same setting as before (`codexPlayerAccess`); GM Setup shows its state with a link to Modules. The Manager window itself stays GM-only.
- **Import Options:** one drafts control, the **Import profile** (Development includes draft, proposed and example records). The separate *Include draft* box is gone.
- **Keyboard and screen readers:** every file picker (Import, organize rules Import, Codex restore, moods file) is a real button the keyboard can reach. Deity links in the GM and player Codex are buttons. Message-bar chips are plain toggle chips; the menus no longer claim a menu role they don't support. Module card **Open** buttons name their module. My Appearance and the player Codex have Help.
- **Shared kit parts:** Records and NPC Codex use the kit split, key/values, rows, cards and segmented radios (so Stone Tablet and Tome Pages reshape them); toned text on tinted fills uses the kit ink tokens (clearer on light skins); History, Checks and Pre-session statuses have toned badges. Removals ask with the kit danger confirm, where Cancel is the default.
- **Labels:** preview-then-apply buttons say **Apply (n)…** (Clean compendiums, Organize, Core links); imports say **Import (n)**. The mood editor replaces the list while you edit, with a way back.
- Removed the unused `appearance-consumer.mjs` helper. `api.appearance.applyTo` is documented as needed only for detached roots (pop-outs); no appearance setting or API name changed.
- Saved data: unchanged. No setting, flag or id was renamed and nothing is migrated; sub-tab, fold and Filters-row choices are remembered per user in this browser.

## 0.45.2 — 2026-10-22

- Shared UI kit 2.2 (no visible change).

## 0.45.1 — 2026-10-22

- **Works with Locations 0.18.0.** Locations was renumbered from 1.18.0 to 0.18.0 (the suite is pre-release). Manager never compares a Locations version number any more: the Pre-session check's *Module versions* row asks whether Locations offers `importLocations`, `previewLocation`, `setLocationState` and `publishLocation`, and its *Migration* row runs when Locations has `moveLocation` and `setAudience`. Before this, Locations 0.18.0 would have been reported as "older than 1.3.0" and its migration skipped. Route import, Browse and World export already checked for `importRoutes` / `listRoutes` and are unchanged; their "not active" messages no longer name a version.
- Saved data: unchanged. No migration.

## 0.45.0 — 2026-10-22

- **Import tab, less scrolling.** The tab is now a short row of controls (choose file, what is loaded, Clear, Download report) and folds: **Load** (package details), **ZIP files** (the file list), **Options** (drafts, update switches, profile, advanced/sample files) and **Preview** (summary and the record table, which scrolls inside its own box). Which folds are open is remembered on this device. **Validate & Preview** and **Import Selected Documents** stay in view.
- **Messages in a bottom bar.** Validation errors, Import review notes, Links to other Ashen Gate modules and Import results moved out of the tab into a bar at the bottom of the window with a count for each; open it to read one kind at a time in a box of limited height with its own scroll. It opens by itself on new errors or a new result, and stays shut once you close it.
- **Items tab lists** (Adopt table, Checks results, Clean compendiums and Organize groups, rules, Core links) scroll inside their own box like the Ashen Gate records list, so no tab needs endless page scrolling.
- **Clean compendiums no longer freezes on big worlds.** Commit writes 50 documents at a time without redrawing the sidebar for each, gives Foundry a turn between chunks, and shows a progress bar with **Cancel move**. Cancel stops after the current chunk: what was moved stays moved and is in **Undo last organize**, the rest is untouched. If a write fails part way, what was written is in Undo too. Undo and Organize Apply also write in chunks of 50.
- **"Cinder - Powers" folder.** Cinder powers filed under `Ashen Gate/Cinders/Powers` now go to `Ashen Gate/Cinders/Cinder - Powers`. An existing `Ashen Gate/Cinders/Powers` folder is renamed once (when the GM loads the world, and before an import), only if it holds Manager-imported powers; any other folder called Powers is never touched, and if a "Cinder - Powers" folder already sits beside it nothing is renamed. Nothing else in the folder changes.
- **Players' Game Settings show nothing of General Manager.** My Appearance is GM-only there (players use the Appearance button in Ashen Gate | Utilities); **Open NPC Codex** appears for players only while GM Setup → *Let players open the NPC Codex* is on.
- **Character Hub follows Player Access.** Revealing a module on the Modules tab also switches on its parts in the Character Hub's Player visibility (through the Hub's public `api.playerVisibility.set`, when the Hub is active); revealing Cinders also shows the Strain bar, and hiding Cinders (or Hide all) hides it. You can still turn parts off in the Hub's GM Setup.
- Saved data: two new settings, `importLayout` (this device's folds) and `folderRenames` (world, records the one-time rename). No migration of existing data.

## 0.44.3 — 2026-10-22

- **Import fix:** after Apply, the link pass no longer reports "Optional link LOC-/FACTION-/QUEST-…: missing" for records that exist in Locations, Renown, Quest Log or Headquarters. It now asks the owning module (when active) whether it holds the record; if it does, the link is kept by its permanent id and History shows one note per record, "Linked by permanent id to Renown record FACTION-…". If that module hasn't imported the record yet, the note reads "will link when Renown imports it" (plus "Renown is not active in this world" when it is off). Ids no module owns are still "missing".
- `SHOP-` ids belong to Utilities: a link to a shop is informational in the preview and after Apply, like the other modules' records. No new linking is added.
- No import-behaviour or saved-data changes beyond the link check (a link to an existing record of another module is no longer listed as unresolved on the Manager document).

## 0.44.2 — 2026-10-21

- **Import preview:** an optional link to a record another Ashen Gate module owns and imports itself (Locations `LOC-`/`RTE-`, Renown `FACTION-`/`RENOWN-`/`DEITY-`, Quest Log `QUEST-`/`ORDER-`/`CONTRACT-`/`ASSIGN-`, Headquarters `FAC-`) is no longer listed as an "absent" reference in Import review notes. It shows in a separate info box, **Links to other Ashen Gate modules**, as "links to Renown record FACTION-… (imported separately)", adding "Renown is not active in this world" when that module is off. Links to ids no module owns are still warnings.
- A *required* link to such a record still blocks the import as before; its message now says which module it comes from and to import it there first.
- No import-behaviour or saved-data changes.

## 0.44.1 — 2026-10-21

- **Import fix:** choosing a file in the Import tab while an import was running cleared the loaded package and aborted the import part way ("Cannot read properties of null (reading 'records')"). While an import is writing, the file picker and the other Import options (profile, drafts, update switches, ZIP ticks, record ticks, portrait upload) are now disabled, and their handlers ignore any change, so the running import always finishes. Choosing a file (the same one included) works again as soon as it ends.
- No saved-data changes.

## 0.44.0 — 2026-10-21

- **Import:** `Shop`, `Service` and `MerchantList` records (shopping, Utilities 0.21.0+) are listed in the preview like Routes (create / update / kept, with drafts and blocked statuses as usual) and handed to Utilities' `api.shops.importShops` after the package's Items are created, in the same run. The results panel shows each one, with any item line Utilities couldn't find.
- Without Utilities 0.21.0 (or with it off) they are skipped as "Needs Utilities 0.21.0 or later"; nothing else in the import changes.
- The update switch is now **Update existing locations, routes and shops**. Shop stock left, coins, sales and who a shop is shown to are always kept.
- No saved-data changes.

## 0.43.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- Stone Tablet and Tome Pages red buttons use the same easier-to-read red text; screen-reader labels use the kit helper (no local copy).
- No behaviour or saved-data changes.

## 0.43.0 — 2026-10-21

- **UI standard look (same layout).** Standard header (Ashen Gate | General Manager, GM only flag, version read from the module, Help); the emblem is the boxes icon used everywhere else. The header and tabs stay in place while a long tab scrolls. GM Setup is the last tab.
- **Buttons look right.** The old panel button rule that gave every button a gold border is gone: Cancel is a plain ghost button, small buttons are small, and Remove / Reset / Hide buttons are red (each still asks first). Remove sits in the editor header, never next to Cancel. Editors and GM Setup end with Cancel on the left and Save on the right.
- **GM Setup:** settings only, all saved together with **Save Changes** (Cancel drops them). New **World appearance** field (the same setting as the header Appearance menu). **Let players open the NPC Codex** no longer saves the moment you tick it. **Load example** moved to Developer Tools at the bottom. Same setting keys; no saved data changes.
- **Appearance menu:** the chosen skin card is highlighted again, the saved world default is marked, and it has a Cancel button.
- **Items:** one toolbar (search, filters, Sort, Group, one Clear filters, one Load compendiums) and one pager style. Kit tables with stripes, kit badges and rarity badges, kit empty states. Pre-session check stays a tool on the Modules tab.
- Tooltips use Foundry's tooltip instead of slow browser hover text; icon-only buttons have labels. Settings menu now reads "General Manager / Open General Manager". My Appearance and the player NPC Codex use the standard header and open larger at Comfortable size.

## 0.42.1 — 2026-10-21

- Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views.
- All 24 confirmations use the shared dialog helper with sentence-case question titles ("Delete managed content permanently?", "Replace fields from the source?", "Hide all player windows?", "Copy into a staging compendium?"). Delete, archive, replace, hide, undo and reset are marked as danger. Messages name documents instead of ids.
- "Beta" is gone from the window header; "pending Tim confirmation" and the "Other workstreams" note are gone from the Import and Modules tabs.
- Preview and item-card errors show as a red notice instead of a badge.

## 0.42.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- **Size setting:** new per-device **Size** switch (Compact / Comfortable) in My Appearance and in the GM Appearance popover. It is a client setting (`uiSize`, this browser only), any player can change it, and it applies right away: Manager writes `data-ag-size` on the page and every Ashen Gate window follows. Compact is the default; without Manager every module stays Compact. The General Manager window opens 1.2× larger at Comfortable. `api.appearance.listSizes()` / `setSize()`; `getState()` gains `size`.
- Rarity colours now come from the kit (Common is grey so it shows on light skins); Manager's own rarity pills keep their classes.
- Stone Tablet and Tome Pages keep their own corners and shape the new kit parts.

## 0.41.2 — 2026-10-21

- **Organize rules import checks the file first.** A file of the wrong kind (for example an Organize backup), with no rules list, with no rules or with an invalid rule is refused with the reason before anything is asked. It no longer asks "Replace with 0 rules?" first.
- **Scene moods import:** a preset with a `kind` other than `mood` or `layer` is now reported and skipped (it was silently read as a mood). The same id twice in one file shows in the preview (the later copy is skipped) instead of showing as New and then failing at Import. Import is all or nothing: both lists are checked before anything is saved, and a failed save puts the other back.
- **Core Links:** a D&D Beyond import with no core source book no longer counts as 2024 from dnd5e's default `rules` value alone, so it is not offered as a weak 2024 candidate.
- **NPC Codex:** re-importing an NPC whose record text changed (role, wants, codex block, ...) but whose Actor did not now updates the stored record (with *Update existing actors* on), so the Codex shows the new text. Before, it said Unchanged.
- **NPC Codex:** revealing an unknown field now says it is not a Codex field and lists the ones you can reveal (it used to say GM-only). The GM view no longer looks among Renown deities for a faction link (deities are `DEITY-` links).
- `api.definitions.dispose()` and `api.appearance.refresh()` now refuse non-GM callers.
- Messages say **Items** where they still said Library.
- No saved data changes; no migration.

## 0.41.1 — 2026-10-21

- **Security fix: the NPC Codex could show players linked records they had not found.** A player's Codex is built on the GM's client, where Locations, Quest Log and Renown answer with GM data, so the Connections list could carry the name (or, when no name was found, the id) of a hidden location, unrevealed quest, undiscovered faction or undiscovered NPC.
- Now every link kind follows the owning module's own player view: a **location** only if the player's Locations shows it as revealed, a **quest** only if the player's Quest Log shows it, a **faction** only if the player's Renown shows it with its name, an **NPC** only if that NPC is discovered in the Codex for the party or one of the player's characters, a **deity** only if Renown says they discovered it (as in 0.40.0). The player's own client lists what it can see and sends only those ids to the GM; the GM never adds a name for them.
- Anything else shows as **Unknown**, with no id, no name and no link. A link whose module is missing, hidden or failing is Unknown too.
- **Preview as player** shows locations, quests and factions as Unknown (the GM's client cannot run those modules' player views for someone else) and says so under the preview.
- No saved data changes; no migration.

## 0.41.0 — 2026-10-21

- **Modifiers on items and perks.** `ITEM-*` and `PERK-*` records may carry a record-level `modifiers` block (`ag-modifiers/0.1`): a list of `ag-modifier/1` entries `{target, value, label, scope?, op?, applies?, stack?, requires?}`. Manager checks the shape (schema, 1–20 entries, a known scope on the entry or the block, no unknown fields, `op` only `add`, a whole-number value that isn't 0, a label, `applies` an object, `requires` lists of canonical ids). The only scope is `cinder`. A modifiers block on any other record (a `POWER-*` uses `power.modifiers`) is refused.
- **The scope's module checks the rest.** Each scope's entries go to its owner's public `api.modifiers.validate(entries, {recordId, record})` (feature-detected) in the Import preview and again just before Apply; its errors block the import. Ashen Gate | Cinders 0.1.0 has no modifier check yet, so these records import with one "not checked" warning. Manager never applies a modifier.
- **`implementation`** (optional, display only) on any perk-like record: `automatic`, `informational` or `gm_resolved`. Anything else is refused. `HPERK-*` keeps Headquarters' own rule (which also allows `hybrid`).
- The blocks are stored as written in the record's definition (`source.definition`), like `power`. Import never touches Cinder instances, sockets, bearers or Strain.
- `scripts/validate-content.mjs` runs the same checks (and the scope owner's exported `validateModifiers` once it has one). New schema reference: `docs/modifiers-schema.md`, synthetic set in `test-fixtures/modifiers/`. `docs/perks-and-modifiers-architecture.md` (approved, with Robb's decisions) and the ChatGPT brief `docs/perks-and-modifiers-for-gpt.md` are now on main.
- No saved data changes; no migration.

## 0.40.0 — 2026-10-21

- **NPC Codex links to deities.** `codex.links` (and Connections added in the Codex) now accept `DEITY-*` ids. In the GM and player Codex a deity link opens **Ashen Gate | Renown**'s Pantheon on that deity (`api.open({deityId, actorId, tab: 'pantheon'})`, feature-detected).
- **Players never learn about an undiscovered deity.** The GM side asks Renown which deities each player's characters have discovered (`getPantheon`); any other deity link is sent as **Unknown**, with no id or name. The player's own client double-checks with Renown's player-filtered `getDeities`.
- Renown missing or hidden, or the deity not in this world: the link is plain text with a tooltip, never an error.
- `scripts/validate-content.mjs` accepts `DEITY-` in `codex.links`. `docs/npc-codex-schema.md` updated.
- No saved data changes; no migration.

## 0.39.0 — 2026-10-21

- **Cinder content imports and is checked.** Cinder definitions (`MUT-*` with a `cinder` block), powers (`POWER-*` with a `power` block) and Backfire tables (`BF-*`, `entity_type: "BackfireTable"`) import as ordinary documents. Their typed blocks are checked by **Ashen Gate | Cinders** (`api.cinder.validateDefinition`) in the Import preview and again just before Apply, so a mistake (a lethal Backfire effect, a Push with no Strain cost, an unknown modifier) blocks the import with Cinders' message. Without Cinders the records still import, with a warning that their blocks were not checked.
- **Strain config files** (`ag-strain-config/0.1`: band names, Backfire schedule, rest recovery, effect-roll bonus) are recognised on the Import tab and handed to Ashen Gate | Cinders (`api.strain.previewConfigImport` / `importConfig`). They are also read from a ZIP bundle, after tree files. It only changes the Strain config, never a character's Strain.
- **Importing never touches live play state:** no Cinder instance, bearer, points, unlocks, Strain or Backfire is created or changed by an import or a re-import.
- `scripts/validate-content.mjs` checks the same blocks and the Strain config file (and notes references to records outside the file). New schema reference for content writers: `docs/cinder-strain-schema.md`, with a complete synthetic set in `test-fixtures/cinder/`.
- No saved data changes; no migration.

## 0.38.1 — 2026-10-21

- **Fix: hand-made Homebrew items were filed under Core 5.5e.** dnd5e 6.0.6 gives every new Item `system.source.rules: "2024"` (or `"2014"` in a legacy-rules world) and `revision: 1` with an empty book, and Organize, Clean compendiums, the Items Origin filter and Core Links' world candidates all treated that rules value as core. Core now needs **positive evidence**: a Plutonium import, a core source book (PHB/DMG/MM 2014 or 2024, SRD 5.1/5.2, `XPHB`…, and full titles like `Player's Handbook (2024)`), or a dnd5e system compendium. A copy from a dnd5e compendium or a D&D Beyond import with no core book is **weak** evidence. An item with only the default rules, no source, a custom source or a third-party/homebrew book is **Homebrew**. 2014 core and SRD 5.1 still count as Core.
- **Why, per move:** the Organize and Clean compendiums previews show the reason for each move (e.g. `Core 5.5e: source book PHB 2024`, `Homebrew: no source book (rules "2024" alone is dnd5e's default for new items)`).
- **Weak evidence starts unticked** in Clean compendiums, with a note; Organize marks it "weak evidence: check it".
- **Keep here in Clean compendiums:** world rows now have Keep here (same flag as Organize's). Protected folders also hold items in place.
- `docs/organize-rules.md` updated.
- **Migration:** none; no saved data changes. Saved custom rules are unchanged (`sourceTagged` just reads the new evidence). Items already moved by a previous run go back with **Undo last organize** if that run is still the most recent and the items have not been moved since.

## 0.38.0 — 2026-10-21

- **Item preview.** In Items → All items, picking an Item's name shows dnd5e's own item card (the same `richTooltip` card the native sheet's tooltip uses) in the details pane, with below it: where it lives (World, or Compendium: label and id, locked or not), the full folder path, the uuid, and type, rarity, source (book, page, 2024/2014 rules), origin, core_ref, Ashen Gate id, price, weight and attunement when present. Ashen Gate records shows the same preview for an Item. Hovering an Item name there (and in Adopt and tag) shows dnd5e's tooltip through its `data-tooltip-html` + uuid mechanism. Read-only and GM-only (the preview checks the GM itself); a compendium item is loaded on its own by uuid, never the whole pack.
- **Player access is back on the Modules tab.** Each module card shows a badge (Visible to players, Hidden from players, GM only, Not installed, Module disabled, Player access unsupported) and **Reveal to players** / **Hide from players** next to **Open**; **Refresh** and **Hide all** (asks first, reports failures) sit at the top of the tab. Same safeguards and the same `ag-player-access/1` calls: each module saves its own setting, eligibility is re-checked at click time, Manager stores nothing. Removed from the Appearance panel.
- **Appearance is a dropdown in the top bar** (next to Help), no longer a tab: the same skin cards and swatches, Save World Default, Open My Appearance, the effective/override line and status. Closes on Escape or a click outside; arrow keys move between skins; fits narrow windows. The old tab id `appearance` still works: it stays on the previous tab and opens the dropdown. Help and GM Setup now point to the new places.
- **Migration:** none; no saved data changes. Public API unchanged.

## 0.37.0 — 2026-10-21

- **Item Active Effects from a file.** Item records may carry `foundry.data.effects`, so a package can ship mount and pet gear, perks and magic items with their bonuses as real Active Effects. Each effect has its own permanent `eff_id` (stored on the effect as `flags.ashen-gate-manager.effect.effId`; never matched by name), `name`, `transfer` (required), `changes[]` `{key, mode, value, priority?}`, and optionally `img`, `description`, `disabled`, `duration {seconds, rounds, turns}` and `statuses`. `mode` takes Foundry's numbers 0–5 or the names `custom`, `multiply`, `add`, `downgrade`, `upgrade`, `override`. Format: `docs/item-effects-schema.md`.
- **Re-import:** new effects are created; an effect Manager made is updated field by field, and a field you edited in Foundry is kept (if the file and you both changed the same field, that effect is kept whole). An effect missing from the file is never deleted; effects made by hand are never touched. A re-import of the same file writes nothing. The preview lists every effect under its Item as New, Update, Kept or Untouched; the result panel gives counts.
- **Safe by design:** empty keys, bad modes, non-string/number values, unknown effect fields and duplicate `eff_id`s are errors; at most 20 effects per Item and 30 changes per effect. Keys mentioning macros or scripts, `flags.core.*` and document fields are rejected, and nothing in an effect runs.
- **Item flags allow-list:** only `ashen-gate-character-hub.companion.role` (`mount-gear`, `mount-perk`, `pet-clothing`, `pet-perk`) is imported, as a managed field. Other flags (and effect flags) are dropped with a preview warning; Manager's own source flag is always written from the record. A newly managed field whose live value already equals the file (e.g. a role you set by hand) is adopted instead of blocking the Item; a different live value still blocks for review.
- `scripts/validate-content.mjs` checks `effects` with the same rules, and notes dropped flags and companion items with `transfer: true`. `docs/companion-items-schema.md`: the [TEST] Saddle example now carries a Walk speed +10 effect.
- GM-only as before: the import refuses players, and the effect writer checks the GM itself. World Items only: Actor-embedded Items, templates and compendiums are unchanged.
- **Migration:** none. `effects` and `flags` are new optional fields, old files import unchanged, and no saved data changes.

## 0.36.0 — 2026-10-21

- **Items tab.** Browse, Library, Organize and Core Links are now one **Items** tab with the Library-style icon rail: **All items** (the Browse search), **Ashen Gate records** (the Library list, inspector and Actions), **Folders** (Organize), **Core links**, **Checks** (Check library and the Housekeeping report), plus **Export and backup**, **Adopt and tag** and **NPC Codex** (the other Library rail entries, so nothing is lost). The Library, Organize and Core Links buttons are gone from the top bar.
- **Shared filters, kept across the rail:** search, Source (World or one compendium), Type, Origin (Ashen Gate, Core 2024, Core 2014, DDB / Plutonium, Homebrew), Rarity, Folder (with sub-folders) and *Has core_ref*. Origin comes from what importers write: Manager's source flag, `flags.ddbimporter` / `flags.plutonium`, then `system.source` 2024 or 2014 (or a dnd5e system pack); anything else is Homebrew. Rarity shows in the shared colours (common white, uncommon green, rare blue, very rare purple, legendary orange, artifact red), CSS variables `--ag-rarity-*` on `:root`.
- **Folders: this selection or folder.** Filter (e.g. Origin: DDB / Plutonium, or one Folder), then choose *This selection or folder* and Preview: only those documents are planned, and Apply runs exactly what was previewed. Choosing it switches Move to *Refile everything* so documents in your own folders are included (you can switch it back). Preview, Download backup, confirmation, Undo, protected folders and Keep here work as before. Organize uses the Source filter (World when All sources).
- **Clean compendiums** (Folders view, one button). Checks the world sidebar (Items, Actors, Journals) and every compendium against the folder rules (Ashen Gate / Core 5.5e / Homebrew), with *Refile everything*, so whole imported sets (DDB, Plutonium) in their own folders are found too. The preview lists every move by place and document type, each ticked; untick any (or *Untick all* per group), then **Commit**. Writes go in batches of 250 with a progress bar; Download backup, a labelled confirmation and **Undo last organize** (the whole run, every place) work as for Organize. Protected folders, Keep here and player characters are never moved. Locked world compendiums are not read and are listed as "locked, skipped" with how to unlock; module and system compendiums are listed as skipped (Foundry does not allow changing them). A move whose document changed since the preview is left alone and named. API: `api.organize.cleanPreview()` / `cleanApply({moves})`, GM-only.
- **Core links:** with filters on, only matching scanned items are shown; Apply and Download backup use only the ticked rows you can see. Apply is still opt-in with a confirmation and backup.
- **Large worlds:** All items and Ashen Gate records draw 100 rows per page; filtering 2,500 items stays well under a second in tests.
- **Migration:** none; no saved data changes. Old tab ids `browse`, `library`, `organize` and `corelinks` (and Library rail sections) open the matching rail entry. API names are unchanged; `api.organize.preview/apply` accept optional `ids` and `folderId`, `api.browse.search` accepts optional `shared` filters. Everything stays GM-only in the API.

## 0.35.1 — 2026-10-21

Alpha-test fixes.

- **Scenes: Cold night and Blood moon now show.** Foundry only blends the night tint in as the scene gets dark, and only when *Blend day and night colours with darkness* is on. Both layers now turn that on, and on a bright scene the message says to add a darker mood or raise Darkness. Saved, unedited copies of these two default layers are read as the fixed version (nothing rewritten); layers you edited are left alone.
- **Scenes: Back to normal restores the scene's original values.** It used to undo only moods and layers, so a fine-tune change (or swapping moods after one) could leave the scene dark. Manager now records each field's value before it first changes it (mood, layer or fine-tune) in the scene's `moodStack` flag, and Back to normal writes all of them back and clears the fine-tune draft. Removing a single layer still keeps your own edits. Scenes from 0.35.0 restore from their stored stack; no migration step needed.
- **Organize: buttons work again.** Preview, Apply, Download backup, Undo, Cancel and Run report were wired to the Core Links handler since 0.26.0 and did nothing. Every Preview now also says what it checked and why nothing would move (e.g. items in your own folders need *Move: Refile everything*). Organize works on the whole world sidebar or one compendium, not a single folder; the toolbar now says so.
- **Core Links:** a scan with no Ashen Gate items carrying `core_ref` now explains that and what to do.
- **Library:** the empty state says Library lists only Ashen Gate records imported through Manager, and points to Browse for other items.
- **GM Setup:** plain-language labels and hints for *Let players open the NPC Codex* and *Core sources*. Behaviour unchanged.

## 0.35.0 — 2026-10-20

- **Scenes: layers.** You can now stack layers on top of the base mood from an *Add a layer* strip: Mist, Rain, Snow, Cold night, Blood moon, Hearth glow, Pitch black, Bright moon. They are editable like moods (Moods & layers → Edit / Duplicate / New layer). Core Foundry has one weather per scene, so a weather layer replaces the weather below it, and the message says which.
- **Safe undo per layer.** *On this scene now* lists the mood and its layers, each with a remove button. Removing one puts back only the fields it changed. A field you changed since (Scene config or Fine-tune) is kept, and the message names it. If a higher layer also set the field, nothing visible changes until that layer goes. **Back to normal** removes everything the same way.
- **Fine-tune this scene.** Sliders and switches for every supported field: darkness, global illumination (on, bright, glow, colour), day/night colour blending, day and night tint (hue, intensity, luminosity, saturation, shadows), weather, and explored/unexplored fog colours. It is a draft until **Apply to scene**, which writes only what you moved. *Save as layer… / Save as mood…* turns it into a preset.
- **Transition picker** (Instant, 3 s, 10 s, 30 s or the preset's own) fades darkness using core's darkness animation. Presets can carry their own transition.
- **Favourites per scene:** star a mood in Moods & layers and it's listed first on that scene.
- **Export / import moods file** (`ashen-gate-moods.json`, format in `docs/scene-moods-schema.md`). Import shows a preview first: new, already the same, same id with different values (Keep mine / Replace mine / Keep both), or skipped. Scenes are never changed by import.
- **Clearer feedback:** badges for core *Suppress Weather* / *Adjust Darkness* regions and Darkness Lock; layers whose weather isn't in this world are marked; fields this Foundry lacks are listed instead of shown.
- New: world setting `sceneLayers`; scene flags `moodStack` and `moodFavourites`. **Migration:** a scene with the 0.22.0 `moodBase`/`mood` flags is read as a one-entry stack. Back to normal still restores it exactly, and the old flags are cleared on the next change. Safe to re-run. Saved mood presets are unchanged.
- API `api.scenes` adds `addLayer`, `removeEffect`, `applyDraft`, `toggleFavourite`, `exportPresets`, `previewImport`, `importPresets`. Every function refuses players.

## 0.34.0 — 2026-10-20

- **Browse: Renown deities.** With Renown 0.11.0 or later, each deity from Renown's `api.getDeities()` is a **Deity** row (Ashen Gate) with chips for tier (major / lesser), domain and discovery, plus status and visibility. Search finds it by name, id (`id:DEITY-`), tags, title, domain and portfolio; `type:deity` and `tier:lesser` work. Details list title, domain, portfolio, discovery and relations (with Resonance / Dissonance), and related deities by id. **Open in Renown** shows Renown's Pantheon at that deity. Without Renown (or an older one) there are no deity rows and nothing else changes. Discovery shows the source setting (placeholder / sharing); who has discovered a deity stays in Renown.
- **Browse: NPC Codex.** Each NPC Codex entry (`api.codex.list`) is listed, with chips for who knows it (party / *n* characters / hidden), how many fields are revealed and how many links. It merges with the NPC's world Actor (and any Journal with the same id) into one row: *Found in* World • NPC Codex. **Open in NPC Codex** jumps to Library → NPC Codex at that NPC; **Sheet** still opens the Actor. `type:npc-codex` finds them.
- Browse stays read-only and GM-only (a player is refused before anything is read). Help text and README updated. No saved-data changes.

## 0.33.0 — 2026-10-20

- **NPC Codex** (Library → NPC Codex on the rail). Lists every imported NPC record (`entity_type: "NPC"`) with portrait, role and how much players know. For each NPC you set who knows it (name and portrait) and, field by field, who knows its role, appearance, signature line, wants, knows, *what the party has learned* and its connections: **Hidden**, **Party** or specific **Characters**.
- Portrayal, session role, stat block, GM notes and your own Codex notes are GM-only and never sent to players. **Preview as** the party or one character shows exactly what that player gets. **Hide from players…** (with confirmation) hides an NPC and every field.
- **Connections:** ids from the record's `codex.links` and `refs`, plus ones you add (`LOC-`, `FAC-`, `QUEST-`, `NPC-` …). Names come from Locations, Renown and Quests when they are active; the Codex never changes their state.
- **Players:** GM Setup → *Players can open the NPC Codex* (off by default). Players open it from Configure Settings → *Open NPC Codex*. Their client asks the connected GM, who sends back only what is revealed to that player's characters.
- **Import:** NPC records import exactly as before. New optional record block `codex` (`links`, `default_reveal`); `default_reveal` only applies until you change that NPC. Re-import never touches reveals, learned text or notes. Schema and example: `docs/npc-codex-schema.md`.
- **Export:** Codex → *Export codex* (GM file: definitions plus reveals) and *Restore reveals from a codex export*. The world export leaves Codex state out.
- **API:** `api.codex` (`list`, `get`, `setReveal`, `setDetails`, `previewAs`, `exportAll`, `forPlayer`, `openPlayerView`, `mount`). GM functions refuse players.
- New: Actor flag `flags.ashen-gate-manager.codex` (written only from the Codex) and world setting `codexPlayerAccess`. No migration; nothing existing changes.

## 0.32.0 — 2026-10-20

- **Library layout.** Library is now a list beside a detail pane, with an icon rail (like the Character Hub) for **Records**, **Check library**, **Export and backup** and **Adopt and tag**, so these no longer stack down one long page.
- **Records:** one search box, system chips with counts, and *More filters* (status, package, show archived). Rows are grouped by system (Unclassified / Shared last) and show name, ID, status, version and edit count at one height. Click a row for its details on the right; nothing is clipped, numbers line up.
- The seven command buttons are one **Actions** menu that appears when records are ticked. Archive, Restore and Delete confirmations now name the action on their button; the final Delete dialog lists the records it will delete.
- Narrow windows: the detail pane moves under the list, and the rail goes across the top.
- Layout only: every Library action, setting and API works as before. No saved-data changes.

## 0.31.0 — 2026-10-20

- **Organize: 2014 and SRD 5.1 count as Core.** A non-Ashen-Gate Item now goes under **Core 5.5e** when it was imported by Plutonium, or its `system.source` says 2024 (as before) **or 2014 core**: rules `2014`, book PHB / DMG / MM (legacy codes, `PHB'14` too) or SRD 5.1. Items with no source, or a third-party or homebrew source, still go under **Homebrew**. Run Organize → Preview: 2014 / SRD 5.1 items an earlier run filed under Homebrew show as moves back to Core 5.5e.
- **Core Links is unchanged:** it still only links and adopts 2024 content; 2014 and SRD 5.1 items are never candidates. The two tests are now separate in code (`isCoreSource` for Organize, `isSource2024` for Core Links; `isSourceTagged` is gone).
- The `sourceTagged` match key keeps its name so saved custom rules still work; it now means *core source*. `docs/organize-rules.md` updated. No saved-data changes.

## 0.30.0 — 2026-10-20

- **Organize: Homebrew folder.** In the default rules, a non-Ashen-Gate Item goes under **Core 5.5e** only when it is *source-tagged*: imported by Plutonium (`flags.plutonium`) or marked 2024 in `system.source` (rules `2024`, or book PHB'24 / DMG'24 / MM'24 / SRD 5.2, `XPHB`-style names too). Every other non-Ashen-Gate Item goes under a new top-level **Homebrew** tree with the same sub-folders (`Homebrew/Spells/Level 3`, `Homebrew/Items/Rare Magic`, `Homebrew/Items/Weapons`, …). Ashen Gate records and Actor/Journal rules are unchanged.
- New rule match key `sourceTagged` (true/false) for custom rules. **Saved custom rules are untouched**; *Reset rules to defaults* picks up the new ones. Items an earlier run filed under Core 5.5e that are not source-tagged show in Preview as moves to Homebrew.
- The Organize card says which items go to Core 5.5e and which to Homebrew.
- **Core Links** uses the same source-tagged test for world Items and world compendiums, so a Plutonium item whose book Manager doesn't recognise is now a candidate too. 2014 content is still never a candidate.
- Rule format documented in `docs/organize-rules.md`. No saved-data changes.

## 0.29.0 — 2026-10-20

- **Renown deities** (Renown 0.11.0 or later). A Renown file with `schema_version` `ag-factions-source-export/0.4` (factions and deities in `definitions[]`) is recognised and handed to Renown unchanged, as 0.3 files are.
- **Import preview:** each row of a Renown file shows *Deity* or *Faction*, as Renown reports it. An older Renown that does not report it shows *Faction*, as before.
- **World export** has a new `deities` section with each deity's definition, read from Renown's `getDeities()`. With an older Renown it is listed as not available. The `factions` section is unchanged.
- No saved-data changes.

## 0.28.0 — 2026-10-20

- **Renown naming.** The Factions module is now shown as **Renown** (Ashen Gate | Renown), so Manager's text follows: import results (*Renown > GM Setup (Actors sidebar launcher)*), Browse source labels and "Open it in Renown", the specialist-file handoff, the campaign-standing notice, Pre-session check rows (*Renown*, *Renown definitions*), Player access and the Browse help. Module id `ashen-gate-factions`, its API, flags, the `ag-factions-` file schema and "faction" entries are unchanged. No saved-data changes.

## 0.27.0 — 2026-10-20

- **Route records import** (needs Locations 1.10.0 or later). A Manager package can carry `entity_type: "Route"` records (point-crawl routes between locations; schema in `docs/routes-schema.md`). In the same run they go to Locations **after** the locations they join, whatever their order in the file.
- **Preview** lists each route: *create*, *update* (with *Update existing locations and routes*), *skipped* (already exists, a draft, or Locations missing/too old) or *blocked* with the reason: an endpoint that is neither in Locations nor created by this import, the same location twice, or a bad `distance_km`. Locations checks every other field on Apply; its reason for any refusal (e.g. a bad `leg_km`) is shown per record in the **Import results** panel.
- **Re-import never touches play state:** a route's discovery state, who can see it, its map drawing and any journey stay as they are, like a location's marker state.
- A record that requires a location living only in Locations (a route's endpoint) no longer fails validation as an unresolved reference.
- **ZIP bundles:** a Manager file holding only Route records is imported after the other Manager files in the ZIP, so its locations exist first.
- **Browse** and **World export** list routes (export without play state). An older Locations shows them as not available.
- The *Update existing locations* switch is now *Update existing locations and routes*. `scripts/validate-content.mjs` runs Route records through Locations' own checks. No saved-data changes.

## 0.26.0 — 2026-10-20

- **Core Links** (new GM-only tab). **Scan** checks every Ashen Gate world Item whose source data has `core_ref` against 2024 (5.5e) core items. It looks in this order: world items imported by Plutonium or marked 2024, 2024 entries in world compendiums, the GM's core sources, then the dnd5e 2024 packs. Legacy 2014 content is never used. Items without `core_ref` are never touched.
- Matches are HIGH (same name, type, and the `core_ref` book/rarity when given), MEDIUM (same name, something else differs) or LOW (similar name). Only HIGH is ticked; MEDIUM and LOW need your tick. Each row shows the source (e.g. "Plutonium world item", "dnd5e 2024 pack: …"), other candidates and a field diff.
- **Apply** (with confirmation) always stores the link (`flags.ashen-gate-manager.coreLink`: uuid, source, name, type, matched on, confidence, date) and, by default, **adopts** the core item's image and data (description included). Name, Ashen Gate id, Manager source data, folder and ownership stay. Adopt falls back to **link only** (with the reason shown) when it would change the item type or lose the stack quantity the Ledger and Utilities use; any row can be set to Link only. **Download backup** and **Undo last core link** (last 5 runs). Re-running changes nothing; a link whose core item is gone shows as **Re-link**.
- **Re-import:** an adopted item's image and data are a known local edit. The preview says "Core-linked to …: keeps the adopted core image and data" and does not overwrite, conflict or block on them; other fields (e.g. name) still update. Library's "replace from source" refuses core-adopted items until the link is undone.
- **GM Setup** tab (new): **Core sources**: automatic detection on/off, plus extra compendiums and world Item folders to treat as core sources.
- World Items only: copies in player inventories or on Actors are never touched. GM only, enforced in the API (`api.coreLinks.preview / apply / undoLast / describeSources / saveSources`). New world settings `coreSources` and `coreLinkHistory`. No migration.

## 0.25.0 — 2026-10-20

- **Organize folders** (new GM-only **Organize** tab). Files world Items, Actors and Journals (or one unlocked world compendium) into a structured folder tree, e.g. `Core 5.5e/Items/Uncommon Magic`, `Core 5.5e/Spells/Level 3`, `Ashen Gate/Professions/Apprentice/Materials`. Re-run any time: anything already in place is left alone, so a second run changes nothing.
- **Preview** shows every move grouped by destination folder with counts, the folders that would be created, and what is skipped and why (protected, keep-here, player character, your own folder, no rule). **Apply** (with confirmation) re-plans, creates missing folders and changes **only the folder** of each document; nothing is renamed, edited or deleted and no folder is ever deleted (empty folders are listed). **Download backup** saves the current folders first; **Undo last organize** puts documents back (last 5 runs kept; anything you moved by hand since is left alone).
- Two modes: **Only unfiled and misfiled** (default: unfiled documents and ones already under `Ashen Gate…`/`Core 5.5e`) or **Refile everything** (also from your own folders). **Protect folder** (inherited by sub-folders) and per-document **Keep here** are always skipped. Player characters and player-owned actors stay where they are. Locked, module and system compendiums are inspect-only.
- **Rules** are an editable first-match list (Edit as JSON, Export, Import, Reset to defaults). Ashen Gate records match on Manager's source data (kind, tier, visibility, status, id prefix); other content on dnd5e fields (item type, rarity, armor/consumable type, spell level, creature type, CR).
- **Housekeeping report** (read-only): Ashen Gate ids found more than once across the world and compendiums, and likely temporary records ([TEST] names, example_only). Nothing is changed.
- GM only, enforced in the API (`api.organize.preview / apply / undoLast / saveSchema / setFolderProtected / setKeepFolder / housekeeping`). New world settings `organizeSchema` (empty = defaults) and `organizeHistory`; new flags `organizeProtected` (Folder) and `keepFolder` (document), written only when the GM sets them. No migration.

## 0.24.0 — 2026-10-20

- **Browse** (new GM-only tab). One searchable list across world Actors, Items, Journals and Journal pages, the Ashen Gate records partner modules expose through their public APIs (Locations, Quest Log, Factions, Skill Trees with their perk nodes, Headquarters facilities, Profession Ledger materials), and compendium entries. Compendiums are read from pack indexes only (no full documents) and load when you press **Load compendiums**, then stay cached until Refresh.
- **Ashen Gate / Non-Ashen Gate / All** selector at the top. Ashen Gate = Manager-imported documents (source flag) or partner-module records; everything else (core, system, other modules) is Non-Ashen Gate.
- Search is instant, ignores case and accents, and matches name, id, tags and description text; every word must match. Prefixes: `id:MAT-HERB`, `tag:`, `type:`, `status:`, `tier:`, `pack:`, `owner:`. Filters with counts that combine: kind, AG type, owner/module, category, profession, tier, rarity/quality, status, visibility, pack/folder, **Only imported by Manager**, **Unlinked** (record with no world document); **Clear** resets them. Sort by name, type or recently changed; group by kind, category, owner, pack/folder, AG type, profession or tier. 100 rows per page.
- Each row shows name, id, kind/type chips, status and visibility chips, tier/profession/quality when known, and where it was found (World, compendium name, or module). **Open** shows the world or compendium sheet, or the owning module at that record (Locations card, Quest Log quest, Skill Trees tree); a module with no open-at-record API opens its window with a hint. **Copy id**. Name opens a **details** panel with the key fields and related records by id (both directions). World and compendium rows drag like sidebar entries (`text/plain` drag data) onto sheets, the canvas or journals.
- The same record never appears twice: rows with the same canonical id or uuid merge (world document first) and list every place they were found.
- The index rebuilds after Actor/Item/Journal/page create/update/delete (debounced) and on **Refresh**. Strictly read-only: nothing here edits a record, setting or flag. GM only, also checked in the API (`api.browse.search / getIndex / detail / open / dragData / refresh / loadCompendiums / status`). No saved-data change, no migration. Saved searches are not in this version.

## 0.23.0 — 2026-10-20

- **ZIP bundles with several import files.** A ZIP may now hold Manager packages plus Quest, Skill Tree, Headquarters and Factions files (the same files Manager already recognises one at a time). Import shows a **ZIP contents** list: file, type, record count and status, with a checkbox per file (all ticked except files with errors). Other JSON is listed as skipped with the reason.
- **Import selected files** runs the ticked files one at a time through the normal preview and Apply, Manager packages first, then Quests, Skill Trees, Headquarters, Factions (Locations stay inside Manager packages and go to Locations after their documents, as before). Each file gets its own entry in the Import results panel; a file that fails to load or validate gets a "Needs attention" result and the rest continue. **Skip this file** and **Stop ZIP import** are available. Nothing writes until you confirm each Apply.
- Ids that appear in an earlier file of the same ZIP are reported and left out of the later file (never overwritten). Artwork with the same file name in two folders is reported and not uploaded. Over 50 import files in one ZIP is refused with a clear message before anything loads. Same safety limits as before (60 MB, 500 files, unsafe paths, 25 MB/100 MB expanded, 10 MB JSON); nothing in a ZIP is executed. GM only (`planBundleImport` refuses non-GMs).
- A ZIP with exactly one Manager package and no other import file behaves exactly as before. No saved-data change, no migration.

## 0.22.0 — 2026-10-20

- **Scene moods** (new GM-only **Scenes** tab). Shows the current scene (viewed, else active; or pick any scene) and its mood. One click applies **Day, Twilight, Windy (leaves), Storm** or **Night**; **Back to normal** puts the scene back exactly as it was. Optional 3-second darkness fade.
- A mood is a small preset listing only the scene fields it sets: darkness, global illumination, day/night tint (hue, intensity, luminosity, saturation, shadows) and core weather (or **No weather**). Edit, add and remove presets (saved per world); the shipped five are marked **Default**; **Reset moods to defaults** asks first.
- Core Foundry only, no other module needed. Each field and weather id is checked on the live scene first; if one is missing, nothing changes and the GM gets a message naming it.
- Before a scene's first mood, its original values are kept in a scene flag (`moodBase`, never overwritten) and the mood id in `mood`; Back to normal clears both. GM only, also checked in the API (`api.scenes.applyMood / restore / listMoods / savePreset / removePreset`). Existing scenes are untouched until a mood is applied. No migration.

## 0.21.2 — 2026-10-19

- **Appearance cards are the selector.** In My Appearance and Manager → Appearance, the dropdown is gone: click a skin card to choose it (the chosen card is highlighted). My Appearance has an **Inherit world default** card for what the dropdown's "Use GM default" did. Cards are a keyboard radio group (Tab in, arrow keys move and choose, Space/Enter activate) and wrap at narrow widths. Save buttons, status lines and what gets saved are unchanged; nothing applies until you Save. Pure UI change, no saved-data change.

## 0.21.1 — 2026-10-19

- **Parchment contrast.** Parchment's accent (links, accent badges), danger, ok and warn colours were 3.1–4.0:1 on the parchment surfaces and on their own badge tints, below WCAG AA. They are now darker bronze/brick/green/amber (accent #734e21, danger #94352e, ok #25603b, warn #734f0c), all at least 4.5:1; the light-parchment-with-ink-and-bronze look stays.
- Stone Tablet's danger text was 4.43:1 on the danger badge/button tint; lightened a few steps (#f9b3aa). Parchment's focus ring is slightly darker (#a5772b) to hold 3:1. Standard's danger is 4.48:1 on its tint and is left alone because it is the kit default shared by every module. No other skin changed.
- Contrast test now covers every skin against the kit's real pairs (links, status text, badges, danger button, focus ring). No saved-data change.

## 0.21.0 — 2026-10-19

- **Pre-session check** (Modules tab, GM only). **Run pre-session check** lists PASS / WARN / FAIL / N-A lines for: Ashen Gate module versions (inactive or too old for Manager's hand-offs warns), each module's GM data (Locations GM Data, Quest GM sources, Skill Trees definitions, Factions definitions, Headquarters vault), Player Access per module (a hidden player launcher warns), [TEST] records players can see, hidden names in player views, the Locations 1.8.0 migration and pending GM notice, and Foundry / dnd5e versions. A summary line ends the list. **Copy report** copies it as plain text; **Download report** saves a .txt.
- Leak scan uses the modules' own player views (Locations player previews, Quest Log's visible quests) and reports hits by record id, never by name. Factions, Skill Trees and Headquarters have no player view Manager can call, so they show "could not check". A gm-visibility Item that players can open is a FAIL.
- Strictly read-only: it never creates, changes or deletes a document, flag or setting. Missing modules show "not installed". GM only, checked inside the function too (`api.preSessionCheck()`).
- **Back up before play** (Library tab, next to Export). Saves all Ashen Gate data in one file, `AG_Backup_<date>.json`, using the same code as **Export everything**. It does not change the "changed since last export" baseline: a backup is not an export. GM only, checked inside the function too (`api.backup()`). Nothing in the world changes.

## 0.20.0 — 2026-10-19

- **Two new structural skins** in Appearance (GM world default) and My Appearance (per player): **Ashen Gate — Stone Tablet** (carved stone slabs, chiselled bevels, engraved uppercase headings, inset carved tabs, lichen-green primary actions, ember focus ring) and **Ashen Gate — Tome Pages** (vellum pages with paper grain, leather-bound title bar, gutter and corner shading, small-capital headings with ornamental rules, ribbon bookmark on the open tab, rubric-red primary actions). They reshape every Ashen Gate window and the sidebar launchers, not just colours.
- Each skin's stylesheet is loaded only while it is the effective skin and only matches when it is active; the five colour skins are unchanged. No web fonts (uses Foundry's own Modesto Condensed/Amiri with system serif fallbacks) and no images beyond inline noise. Text keeps WCAG AA contrast; focus rings stay visible; no animation.
- Saved appearance settings are untouched; an unknown skin still falls back to Standard. My Appearance now shows each skin's description.

## 0.19.0 — 2026-10-19

- **Update existing actors** (Import tab, opt-in, off by default). Re-importing a file can now update Actors Manager created earlier. Actors are matched only by their permanent id, never by name. The preview marks each Actor CREATE, UPDATE or SKIPPED and lists every field that would change.
- Only the package's own definition changes: name, image (if the file gives one), the token settings the file defines, and the package's embedded items (new ones added, changed descriptions and rules updated). Kept as they are: HP and other system values, XP and level, conditions/effects, items players added, quantities, uses and equipped state, biography/notes, ownership, folder, and every other module's flags. A field the GM edited and the package did not change is kept.
- Applying asks for a separate **Update existing Actors** confirmation listing each change, and a JSON backup of those Actors downloads before anything is written. **Download backup of N actor(s)** under the preview downloads it on its own. GM only, also checked where the write happens. Running the same import again changes nothing.
- Actors imported before 0.19.0 work: their package items are recognised on the first update (an item with duplicate copies is left alone and listed). Items removed from the package stay on the Actor.

## 0.18.1 — 2026-10-19

- World export no longer stores record names in the saved snapshot (a world setting players could read), so hidden record names cannot leak. It keeps only content hashes. "Removed since last export" now lists ids and sections, not names. An older snapshot that still has names loads fine and is rewritten without them on the next export.

## 0.18.0 — 2026-10-19

- **Export Ashen Gate data** (Library tab). One button group: **Export everything**, **Export changed since last export**, and **Copy summary**. Each Export saves ONE JSON file (`AG_World_Export_<date>.json`) of every Ashen Gate tagged world document plus the definitions Locations, Quest Log, Factions, Skill Trees and Headquarters expose; a module that is off or too old is listed as "not available". Definitions only: no actor progress, stash, party notes, quest status or other play state. GM only. "Changed" compares content hashes with a snapshot saved (new world setting, additive) after the last export; the first run exports everything. Format is documented in the README.

## 0.17.0 — 2026-10-19

- **Import results panel.** After every Apply, the Import tab keeps a plain result panel (newest first, until you press Clear results): per module and file what was created, updated, kept and what failed, with the reason, what to do about it, and where to find it afterwards (for example Quest Log > GM Setup). Applies that cannot start (module off, nothing selected, file not loaded) are listed there too, not only as a pop-up. The History tab entry is unchanged.
- Player Access now lists **Locations** as player-capable with its own toggle, like the others (only Manager and a separate Location Builder stay GM only). Locations is also listed when not installed.
- Skill Trees warnings and notes from the owning module now show in the result rows.

## 0.16.0 — 2026-10-19

- The **Macros** tab is gone for now (install, export and custom macro JSON). Macros already installed in a world stay as they are, and nothing stored changed.
- Importing Macro documents inside an import package works as before (for example the `[TEST] Link test data` macro). Imported Macros are still never executed.

## 0.15.0 — 2026-10-19

- The **Templates** tab is gone. The three sample downloads (template package, Import JSON starter, source manifest) are under **Import → Advanced / sample files**. Packages that use templates still compile as before.
- The **Audit** tab is gone. **Library → Check library** shows the same results inline.
- The two bundled legacy experimental macros (14-tree generator, tree access sync) are removed from the Macros tab. Macros already installed in a world are not touched. Custom macro JSON still works.

## 0.14.0 — 2026-10-19

- **One import for everything.** Manager now recognises Quest, Skill Tree, Headquarters facility and Factions files by their shape and hands them to that module (Quest Log 0.6.0+, Skill Trees 0.7.0+, Headquarters 0.7.0+, Factions 0.7.0+). The preview shows each record as new or kept, and you pick what to import. Records already in the world are kept; tick **Update existing** to replace Quests and Skill Trees (their status and purchases are protected). Headquarters and Factions only add new ones. If a module is off, its rows say so.
- A file Manager cannot use now says what it looks like (top-level keys, record types) and which module's import similar files belong to.
- Fix: a failed load no longer leaves the previous file shown as "loaded". The banner and file name clear on every new attempt, and you can pick the same file again.
- The row of module buttons under the header is gone; the **Modules** tab opens and manages modules.
- **Export** is no longer a tab. Adopting and exporting world Items now lives in **Library**, next to export of selected records.
- **Player Access** moved under **Appearance** as a compact list below the skin selector.
- Fix (appearance for players): a player's screen could keep the previous world default after the GM changed it, because the setting was re-read before Foundry had stored it. Manager now uses the value Foundry sends with the change. Players who picked their own look in My Appearance keep it; anyone who has not reloaded since a module update needs one refresh.

## 0.13.0 — 2026-10-18

- **One import for everything.** Location records in an `ag-foundry-import/0.2` package are now imported by Manager's normal run when Locations (1.2.0+) is active: Items and other documents first, then the Locations are passed to `api.importLocations` in the same Apply, so Material references resolve. You no longer import the same file a second time in Location Builder.
- Location rows appear in the normal preview (create, or skipped with a reason) and in the import message and History (imported count, skipped count with reasons). Existing location ids are kept as they are unless you tick the new **Update existing locations** option.
- If Locations is not active the rows are skipped and the preview says "N location records skipped: enable Locations".
- Draft locations follow **Include drafts** like every other record.

## 0.13.1 — 2026-10-19

- GM-only Items sidebar launcher moved to `scripts/items-launcher.js`: General Manager always first, Locations second, in one shared two-column group whichever module renders first. Still GM-only (checked on render and on click). No saved-data changes. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.12.2 — 2026-10-18

- Header is one line: title and version on the left, Help and the "GM only" chip on the right. The empty emblem box (non-existent `fa-gate` icon) is replaced by a `fa-dungeon` icon.
- Module launchers moved to one compact row under the header with short labels and icons (Professions, Skill Trees, Quests, Factions, Headquarters, Locations, Utilities), in the same order as the Actors-sidebar launchers. Full name and state stay in the tooltip; inactive modules stay disabled. Wraps only at narrow widths. (#3)

## 0.12.3 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- Appearance now themes the whole page: Manager writes the effective skin (GM world default or your own override) to the document, so every Ashen Gate window and sidebar launcher follows it, not only Manager's own windows.
- Two new skins: **Verdigris** (dark teal with brass) and **Parchment** (light). Standard, Slate and Ember are refreshed.
- My Appearance has a new layout with a colour preview of each skin.
- New `api.appearance.openMyAppearance()`, so other modules (Utilities) can open the player-safe My Appearance window.
- The General Manager button in the Items sidebar is styled by the shared kit, so it matches the Location Builder button and the Actors-sidebar launchers.

## 0.12.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## v0.12.0 Beta — AG-WORK-0018 (2026-10-17)

- Fix Library local-edit scanning to compare serialized Foundry document data, avoiding render failures when live accessors expose non-cloneable document values.
- Reject invalid RollTable result types and malformed ranges/weights during whole-package preflight, before any documents are written. Update the prior synthetic fixture to V14's string result types.
- Route JSON/template/source exports through Foundry's file-save utility so actions save a file instead of navigating the browser to raw JSON; keep the browser fallback for unsupported runtimes.
- Add current-version header, compact direct Ashen Gate module buttons, and remove the redundant workflow subtitle.
- Normalize macro line endings when checking bundled macro re-imports; preserve edit conflict detection.
- Added reproducible valid/blocked RollTable fixtures and setup/reset notes. Node/mock only; live Foundry V14 acceptance remains separate.

## v0.11.2 Beta - 2026-10-16

- Reject `campaign_state` and unsupported scopes in the native definition reader; preserve unscoped Manager projections as valid.
- Add a regression covering a campaign-state Recipe incorrectly resolving as a reusable definition.
- 156 Node tests pass. No migration or campaign/Actor progression writes; live Foundry V14 remains untested.

## v0.11.1 Beta - 2026-10-16

- Pass the injected reveal policy into native definition visibility checks. Revealed records remain subject to current-user Foundry document permission; unrevealed, unreadable, and reveal-policy errors fail closed.
- Add a focused regression test; no data migration.
- 155 Node tests pass. Live Foundry V14 remains untested.

## v0.11.0 Beta — AG-WORK-0014; DEC-0077–0081 (2026-10-16)

- Built from the complete v0.10.0 Beta baseline; retained Items, Journals, Actors, RollTables, Macros, JSON/ZIP import, nested folders, icon fallbacks, Library, archive/restore, macro safety, Player Access, module launchers, and GM/player Appearance.
- Aligned Manager's read-only `ag-definition-resolver/0.1-prototype` consumer to Archie handoff b196dd7 (world unique active precedence over matching pack source, no world fallthrough, typed lookup, duplicate conflict, archived exclusion, permission-safe source read, GM reference validation, provider and explicit pack adapters).
- Preserved full reusable non-Foundry source definition in Manager projection source flags, including MAT/REC/PERK structured properties, provenance, version, and required/optional typed refs. Metadata-only reimport remains non-destructive to native Actor progress and campaign state.
- Explicit canonical NPC logical `entity_type: NPC` vs Foundry `document_type: Actor`; reject `entity_type: Actor` instead of silently rewriting IDs.
- Fixed CI-only test harness dependency: the v0.7.0 ZIP tests now import Manager’s bundled JSZip rather than a machine-specific global installation.
- Added synthetic end-to-end lifecycle/reader tests. Live Foundry V14 GM/player tests still outstanding.

## 0.10.0 Beta — 2026-10-16
- AG-WORK-0013/0014: preserve missing optional canonical source refs and expose authorized read-only native-definition reader using Archie resolver v0.1 baseline semantics.
- Add resolved/unresolved source-ref diagnostics; test five document kinds, archive, player access, explicit packs and event refresh.
- 142 Node local tests passed; Foundry V14 runtime test pending; no campaign migrations or gameplay changes.

## v0.8.0 — Player Access Controller Beta
- DEC-0072 / `ag-player-access/1` GM-only dashboard, per-owner API read/write, honest unsupported and missing statuses, Hide All with partial failure reports.
- Added status refresh and module-tile access labels; Manager advertises its own GM-only read-only capability.
- Preserved v0.7.0 import pipeline and existing specialist campaign/Actor state.
- See README-v0.8.0.md for GM/player runtime tests still outstanding.

## v0.7.0 — Actor & Document Import Beta
- Actor, RollTable, Macro create-only import support; ZIP package selection and opt-in bundled art upload.
- Expanded typed folders, UUID bindings, fallbacks, importer type counts and simplified Import UI.
- Stu 8-Actor JSON validated locally; live Foundry/dnd5e runtime remains unverified. See README-v0.7.0.md.

# Changelog

## 0.6.0 — Import Fidelity Beta (2026-10-15)
- New optional nested `foundry.folder_path` for Items/Journals; create/reuse typed folders on first import.
- Bundled category fallback icons with preservation of authored art, plus detected-404 fallback.
- Final world UUID binding pass for typed refs and provisional `[[AGREF:ID|Label]]` rich-text placeholders; missing and ambiguous targets reported.
- GM-only General Manager Items directory launcher; header and help improvements; compatibility with `ag-foundry-import/0.2` retained.
- Synthetic three-record clean-import fixture; local automated tests and release notes.

Earlier 0.5.1 changes are documented in `README-v0.5.1.md`.

## v0.9.1 — GM/player Appearance & Resolver Handoff Beta
- From exact v0.8.0 baseline: GM Appearance world default, separate player-safe per-user My Appearance screen, three scoped semantic token palettes.
- Optional `ag-appearance/0.1-beta` GM/player-safe setting API and specialist fallback/cleanup example. No gameplay or Player Access state copied or mutated.
- GM-only read-only helper to audit typed AG source IDs via Archie `ag-definition-resolver/0.1-prototype`, without mandating an SDK or choosing world-vs-compendium precedence.
- Existing JSON/ZIP document importing and Library untouched. Source-reviewed, local tests only. See README-v0.9.1.md.
