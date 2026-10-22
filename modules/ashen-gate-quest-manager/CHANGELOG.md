## 0.15.0 — 2026-10-22

- **Quests tab views:** All, Drafts, Hidden, Active (Available or Active), Completed / Failed, Orders and Contracts, each with a count. Your last view, sort, grouping and editor sections come back next time (per GM).
- **Cleaner quest cards:** type badge (Quest / Order / Contract), status, *Visible to players* or *GM only*, location, giver or faction when the quest names one (typed refs such as `quest_giver`, `issued_by`, `offered_by_faction`); without one, the quest's source / issuer notes show as its **Source** line, in full, audience (Party, or Individual with the character), objectives done (2/5), rewards (item rewards and the suggested-rewards text, where coin is written) and when it last changed. Text wraps; nothing is cut off.
- **Group and sort:** group by status, location, type or giver; sort by title, status, location or recently changed (also type and ID). Group by giver uses that Source text when there is no typed giver. Search matches title, ID, location (ID or name), giver or Source text, tags (when a quest file has them) and the individual character. New quest sits on the right of the toolbar.
- **Editor:** sections that fold open and closed (Basics, Audience, Objectives, Rewards, Campaign status and reveal, GM notes). One save bar stays at the bottom of the editor: Cancel on the left, **Save changes** on the right, and a clear *Unsaved changes* note (also in the editor header). One save writes the definition and the campaign state together. Objective progress and reveal sit beside each objective. The scroll and focus behaviour from 0.14.0 is kept. Item rewards and delegated assignments still save on their own.
- **Bulk actions** on ticked quests: set status, hide, reveal, duplicate (a GM-only draft copy with a new `-COPY` id) and delete. Set status, reveal and delete ask first and say which quests players will newly see; delete has a red, labelled button. A bulk reveal never publishes a draft or a GM-only definition. A quest that can't be changed is listed with the reason; the others still change.
- Drafts stay GM only: a new quest is saved Hidden as a draft, as before.
- Saved data: new per-user flag `gmView` (view, sort, grouping, editor sections). Quests themselves are stored as before. No migration.

## 0.14.0 — 2026-10-22

- **No journals pop open.** Assigning, revealing or completing a quest, or giving rewards, no longer opens journal pages or entries on anyone's screen (journals and reward items are created with their sheet closed; a player's client also closes a Quest Log journal that opens by itself right after the GM wrote it).
- New GM Setup switch, off by default: **Open the Quest Log for players when a quest is revealed to them**. It opens the player's Quest Log window at that quest, never a journal.
- **Objectives overlay:** drag it by its header (kept on screen); a minus button by each quest stops tracking it; a slider in the header fades the background from 100 % to 0 % while the header and text stay solid. Place and fade are kept per user.
- **Quest editor keeps its place.** Saving, picking a quest in the list or another client's change no longer scrolls the list or editor back to the top; each list and each quest's editor keeps its own scroll. The field you are typing in keeps focus.
- **Character pickers list player characters only** (dnd5e characters a player owns): the individual-character dropdown, the character selector and party reward recipients. NPCs, monsters, GM-only actors and level backups ("… - level X") are left out. A quest already set to another actor keeps it, labelled "(not a player character)".
- Players no longer get a Quest Log entry in Configure Settings (every Quest Log setting was already hidden; their Settings window now also drops any Quest Log entry).
- Saved data: new per-user flag `overlay` (place and fade) and world setting `openForPlayers` (off). Nothing else changes. No migration.

## 0.13.1 — 2026-10-21

- Character Hub level-up backups ("<Name> - level X") no longer appear in the character selector or the individual-quest character picker, and are not counted as party reward recipients.
- Assigning an individual quest to a backup, giving it a reward (Give rewards or drag onto its sheet) or saving character notes on it is refused: "That is a level backup copy, not a playable character."
- Saved data: no change. No migration.

## 0.13.0 — 2026-10-21

- Quest files can list item rewards (`outcomes.item_rewards`: `item_id`, `quantity`, `visibility`, `recipient`, GM-only `note`). They appear in the quest's Item rewards list and are given like any other reward.
- Import checks them and names the quest and entry for each mistake (unknown key, a uuid instead of `item_id`, duplicate id, bad value, more than 50).
- The import warns, and still imports, when an item id has no item in the world yet.
- Reimporting keeps the GM's reward changes and every grant; a reward taken out of the file after it was given shows "No longer in the quest".
- Quests saved earlier with a malformed reward entry still open and publish (the entry is skipped).

## 0.12.0 — 2026-10-21

- Give quest rewards: when a quest is saved as Completed and something is owed, the **Give rewards** panel opens (also from a button on the reward list). Pick who gets each reward, check **Will receive**, then **Grant rewards** (asks first). Results are shown per character.
- All or nothing per character; containers keep their contents; never given twice in the same round, even after a crash. **Grant again** gives a reward once more (asks first).
- Drag a reward row onto a character sheet to give it (GM only, recorded once).
- Whispered chat card to the GMs and the recipients' players. Character Hub's Journey records the reward when the Hub is there.
- Players' quests count as rewarded once every reward they can see is given.
- Saved data: grant records in the quest's `rewards` block (added in 0.11.0); nothing else changes.

## 0.11.0 — 2026-10-21

- Quest editor: new **Item rewards** list. Drop items from a character or NPC sheet, a compendium or the Items sidebar; set quantity, who sees it and who it goes to. Changes save at once.
- Items dropped from a sheet are copied into a GM-only Items folder, *Ashen Gate Rewards (Quest Log)*; the character or NPC is never changed. Folders are refused.
- Players see the rewards each row allows (name, picture, quantity) under **Rewards** in the quest.
- Nothing is granted to characters yet. The old checkbox now reads *Rewards handled outside Quest Log*.
- New GM-only API `api.rewards` (`ag-quest-rewards/1`). Saved data: an optional `rewards` block on quest state; quests without it work as before, so no migration.

## 0.10.2 — 2026-10-21

- Shared item-drop helper (`ag-item-drop/1`); no visible change.

## 0.10.1 — 2026-10-21

- Shared UI kit 2.1.0 and dialog helper: choice dialogs follow the Ashen Gate look (Cancel on the left, the choices on the right); red buttons, badges and grey text on selected or striped rows are easier to read in every skin (at least 4.5:1); a hidden empty state stays hidden; disabled list rows keep readable text.
- No behaviour or saved-data changes.

## 0.10.0 — 2026-10-21

- Ashen Gate UI standard look (same layout): header with the overlay toggle, version and Help on the right; scrolling tabs with icons; GM tabs marked.
- Quests tab: one toolbar with search, status chips, filters, count, and **New quest** on the right (Import and Export beside it). The list is left-aligned rows with objectives done (e.g. 2/4), a thin progress bar and status badges, grouped under headings with counts.
- Quest editor: Cancel bottom-left and Save bottom-right for the definition and for progress & reveal; **Delete quest** sits in the editor header (red, asks first). Fields use the kit layout.
- GM Setup: **Player Access now saves with Save Changes** together with the compendium pack IDs (Cancel puts the form back). Same setting keys.
- Objectives overlay: theme colours, round close button with a label.
- Empty states, notices and tooltips follow the kit; works at narrow window sizes and the Comfortable size. The embedded view (Character Hub) keeps its layout.
- No saved data, flag or setting changes.

## 0.9.1 — 2026-10-21

- Confirmations name the action and follow the Ashen Gate look: Delete quest asks "Delete [quest name]?" (red, no id), Delete assignment is red, and leaving unsaved quest changes asks Discard changes / Keep editing. Cancel is on the left. No behaviour or saved data changes.

## 0.9.0 — 2026-10-21

- Shared UI kit 2.0.0: rounded compact look for shared parts, Comfortable size option (General Manager → My Appearance), shared dialog helper.
- Dialogs now come from the shared `ag-dialogs.mjs` (same behaviour, now skinned).
- Quest cards keep box corners (not the new pill shape) so multi-line cards and the selected edge look right.

## 0.8.0 — 2026-10-20

- **New API `embed.mount(element, {actorId, mode: 'character'})`** so a partner module (Character Hub) can show a character's quests inside its own window: Party and Individual quests with search and Track, and the selected quest's objectives, locations, party notes and Character notes (Save). Returns `{unmount, refresh}`; it refreshes itself on changes. See the README.
- Same visibility and checks as the Quest Log window. GM authoring and progress stay in the window. The window itself is unchanged. No saved data changes.

## 0.7.2 — 2026-10-19

- Delete quest, Delete assignment and the "discard unsaved source changes" question now use Foundry dialogs (the desktop app has no browser `confirm`), with a labelled action button and Cancel on the left.
- New **Help** button in the header (draft text). The window title now reads `Ashen Gate | Quest Log`, matching its header. Module id, API and saved data are unchanged.

## 0.7.1 — 2026-10-19

- Fewer pointless writes: re-publishing a quest whose player view hasn't changed no longer rewrites its Quest Log journal. This happens on every user or actor change, for every Individual quest, and each write made every open window re-render. Real changes publish exactly as before.
- No saved-data or permission changes.

## 0.7.0 — 2026-10-19

- New GM-only **Quests** tab: every quest, order and contract (Draft, Hidden, Available, Active, Completed, Failed) with search, filters (type, status, location, visible to players), sort, and group by status or type. Pick one to edit it in the same tab, or press **New quest** to draft. Import JSON and Export Sources are small buttons in its toolbar.
- **GM Setup** is now settings only: Player Access, objectives overlay, compendium pack IDs.
- "Draft" is a label for a quest still marked draft and never taken out of Hidden; drafts are never shown to players. Player view, API and saved data are unchanged.

## 0.6.0 — 2026-10-19

- New GM-only `api.previewQuestImport(payload, {mode})` and `api.importQuests(payload, {mode})` so General Manager's single importer can hand Quest files over. New quests are created; existing ones are kept (or, with mode `update`, get their definition replaced while status and notes stay). Quest Log's own Import JSON is unchanged.

## 0.6.1 — 2026-10-19

- `api.listQuests()` (GM-only) also returns each quest's `kind` (quest, order, contract) and `definitionStatus` (draft, approved...), so Locations can label draft and hidden quests in its picker. Nothing saved changes.

## 0.5.1 — 2026-10-18

- New look from the shared Ashen Gate UI kit (`styles/ag-ui.css`): cleaner type, consistent padding, header, tabs, buttons and fields that match every other Ashen Gate module.
- Follows the appearance chosen in General Manager, live, with no reload. Without Manager it uses the built-in Standard look.
- Dropdowns no longer cut off the bottom of their text.
- The Actors-sidebar launcher buttons now match the Manager and Location Builder buttons in the Items sidebar, with padding inside the sidebar edges.

## 0.5.2 — 2026-10-19

- Actors sidebar launcher label is now "Quests" (tooltip "Quest Log"), in the shared two-column grid with a fixed order. Buttons wrap their labels instead of clipping, use the Ashen Gate theme tokens for hover/focus, and the grid reflows with no gap when a module is off or hidden by Player Access.

## 0.5.0 — 2026-10-18

- Quest details list the Locations linked to a quest (from Locations 1.0, or the Location IDs set on the quest); click one to open it. Shown only when the Locations module is active and the location is revealed to you.
- New GM-only `api.listQuests()` so Locations can offer every quest when linking.

## 0.4.3 — 2026-10-18

- Fix: the shared Ashen Gate launcher group now sits above the Actors sidebar header instead of inside it, so Foundry's Create Actor / Create Folder buttons show again. Tighter padding around the group.

## 0.4.1 — 2026-10-18

- Moved to the `ashen-gate-foundry` repository. No gameplay changes.
- Installs and updates through the manifest URL; releases are built automatically.

## 0.4.2 — 2026-10-18

- Actors sidebar: the launcher button now joins one shared "Ashen Gate" group at the top of the Actors sidebar, with the same style as the other modules' buttons and a fixed order: Profession Ledger, Skill Trees, Quest Log, Factions & Renown, Headquarters, Utilities (#2).
- Re-rendering the sidebar no longer duplicates the button; Player Access still hides it, and the group disappears when it has no buttons.

## 0.4.0 Alpha — UI, reveal and tracking (2026-10-17)

- Normal GM source form and clearer per-quest publish/reveal flow; JSON behind Advanced.
- Player tracking for multiple quests and optional objectives overlay from authorized projections only.
- Player interface toggle moved into GM Setup, optional compendium settings explained, consistent title/launcher.
- Tracking/permissions tests, real Foundry import fixtures, setup/reset and five-column manual tests. No live V14 verification.

# Quest Manager change history

## 0.3.1 Alpha (2026-10-16, targeted local release; no commit)

- Strict Objective source and Manager native-projection envelope checks, including nonempty typed relations, legal scope, source provenance types and exact reference fields; campaign-state Objective definitions rejected.
- Standalone bundled Archie resolver 0.1-prototype contract aligned to the pinned `f535fe085cc3446dd3e82dd796df95118631b145` consumer handoff, with GM-only configured compendium pack loading and `refreshCompendiums`.
- Exact pack-only Objective resolution without Manager, world-over-pack DEC-0078 precedence, explicit conflicts and archived-copy exclusion. Type/kind validation inspects only the resolved native binding; no display-name fallback.
- Unchanged player-safe Quest projection/reveal gate, five campaign statuses, Party/Individual views and GM-only Quest-owned Assignment state.
- Focused source/mocked regression suite; no live Foundry V14 acceptance.

## 0.3.0 Alpha (2026-10-16, local candidate)

- Reconciled against GitHub main `d2e2820cb20f1691e166bbf762731cd3144c62bb` (initial build read), DEC-0077–0081, shared Objective/Assignment schemas and Archie/Borris `ag-definition-resolver/0.1-prototype` consumer handoff.
- Added exact-ID/type read-only Objective consumer, native Manager world document fallback when Manager is disabled, duplicate/archive checks and fail-closed player views. No display-name fallback.
- Added a separate GM-owned `ASSIGN-*` delegated execution Journal and GM Setup editor; validated typed target, participants/results; GM-only read/write API. Prevented Objective deletion while linked Assignment exists.
- Hardened duplicate native/domain bindings and private/public views. Explicit GM-only objectives cannot be published via per-objective reveal flags.
- Retained Party/Individual views, five campaign statuses, independent source lifecycle, GM review/reveal/progress, reward handling and character-authored notes.
- Added source-level and mocked tests for Manager enabled/disabled, opaque hidden results, and Assignment ownership; **no Foundry runtime test**.

## 0.2.0 Alpha (source package supplied locally)

- Previous independent Quest Log, GM source and campaign Journal state, public projections, Actor notes, and permission tests (39 tests passed).
- Previous source package and Foundry UI were implementation candidates, not canonical final Quest design artifacts or live Foundry-tested packages.
