# Ashen Gate | Quest Log

Module ID `ashen-gate-quest-manager` · Foundry V14 · dnd5e. Quest, Work Order and Contract objectives with a Party log and per-character Individual logs, GM-driven reveal, progress and rewards, and GM-only Assignment records. Open it from **Actors sidebar → Quest Log** (players when **GM Setup → Player Access** is on).

## Tabs

- **Party** and **Individual:** what players can see. Tick **Track** on a quest, then **Show objectives overlay** (right end of the toolbar) for a small on-screen tracker (display only; it does not change progress). Individual is scoped to the character's owner.
- **Quests** (GM): every quest, order and contract as one line (0.26.0): title and status always, then progress, visible to players or GM only, kind and level, location, giver and last change as the list column widens; the chevron opens a row with every fact in place (full title, type, level, visibility, location, giver or faction (a typed ref when the quest names one, otherwise its source / issuer notes as the Source line), audience, tags, rewards, last change). Facts: giver or faction (a typed ref when the quest names one, otherwise its source / issuer notes as the Source line), audience (party, or the individual character), objectives done (e.g. 2/5), rewards (item rewards and the suggested-rewards text) and when it last changed. Views with counts under the tabs: All, Drafts, Hidden, Active (Available or Active), Completed / Failed, Orders, Contracts. The toolbar has search (title, ID, location, giver, tags), **Filters (n)** (type, location and visibility in a second row), group (status, location, type, giver) and sort (title, status, location, recently changed, type, ID); **New quest** is on the right. Import JSON… (with a preview) and Export JSON sit under *Advanced: import here, or use General Manager* at the end of the list; General Manager's importer is the usual path. Your view, sort, grouping and editor sections are remembered for you. Tick cards for bulk actions (a row above the list): set status, hide, reveal, duplicate (a GM-only draft copy) and delete (asks first). A bulk reveal never publishes a draft. The editor has sections that fold (Basics, Audience, Objectives, Rewards, Campaign status and reveal, GM notes, Advanced: source JSON) and one save bar at the bottom: Cancel, an unsaved-changes note, **Save changes**. Item rewards save as you change them (*Applies now*); delegated assignments have their own section after the save bar with **Save assignment**. Drafts are never shown to players.
- **Journal:** session notes in an open book, for players and the GM (see *Game Journal* below).
- **GM Setup** (GM): Player access, players' screens and compendium pack IDs, saved together with **Save Changes**.

Three objective types share one model: `QUEST-*`, `ORDER-*` (crafting, production or creative work order) and `CONTRACT-*`. Hidden / Available / Active / Completed / Failed are campaign statuses, separate from a source definition's own `status` (draft, approved, …). `ASSIGN-*` Assignments are GM-only execution records attached to an objective; they make no automatic Faction, Profession, Location or Headquarters changes.

## Game Journal (0.16.0, updated 0.21.0)

- **New session** (GM or a player; a player needs a GM connected) creates *Session N* (`SESSION-001`, `SESSION-002`, …) with a party journal and one journal per player user. Name and optional subtitle can be changed by the GM and by whoever started it.
- Players switch between **My journal** and **Party journal**; the GM picks the party journal or any player's journal (read only) from **Journal**. Search covers session names and the pages the viewer may read.
- Toolbar: bold, italic, underline, strikethrough, highlight, title heading, heading, subheading, normal text, bulleted and numbered lists, quote and divider. Stored as HTML with those tags only (no attributes, no links, images or scripts). **Auto format…** previews a conservative tidy-up (spacing, blank lines, bullet and numbered lines to lists, punctuation spacing, lone `Title:`/ALL CAPS lines to headings) and **Undo auto format** reverses it.
- The top of the page is two rows: the title (with date and subtitle) with *Whose journal* and **More…**, then the formatting toolbar. **More…** holds the exports, Rename session…, Show archived sessions, Archive / Restore and Delete session….
- GM only: **GM-only notes** under the party journal (its own page, NONE for every player; refused to players in the API and left out of Export This Session by default); the session **Date** (set in the rename form; automatic until changed); **Delete session…** on an archived session. The title reads *Session N - name*.
- Saves on leaving the book, on **Save** / Ctrl+S, and before switching or closing. A page someone else saved meanwhile asks before it is replaced.
- Export: **Export Journal** (your own journal, or for the GM the player journal on screen), **Export Group Journal**, and for the GM **Export GM Journal** each download every session (the GM: archived ones too) oldest first as one Markdown file; **Export This Session** (GM) downloads only the open session. GM: **Archive session** (hidden from players, read only, nothing deleted) and **Restore session**.
- Storage: one JournalEntry per session in *Ashen Gate / Quests / Game Journal*. Entry: OBSERVER for everyone. Party page: OWNER for everyone. A player's page: OWNER for that player, NONE for the other players. Foundry's own ownership lets players write their pages with no GM connected, and stops them writing anyone else's; Quest Log's API checks the same rules before every read and write. These entries are also listed in Foundry's Journal sidebar under that folder (a player opening one sees the party page and their own only).
- API `api.journal` (`ag-quest-journal/1`): `isAvailable()`, `list({archived})`, `get(id)`, `pages(id)`, `read(id, target)`, `write(id, target, html, {base, force})`, `create({name, subtitle})`, `rename(id, {name, subtitle})`, `search(query)`; GM only: `archive(id)`, `restore(id)`, `remove(id)` (archived sessions only), `exportMarkdown(id, {includeGmNotes})`. `rename` also takes `date` (`YYYY-MM-DD`, GM only). `target` is `'me'`, `'party'` or a player's user id; `'gm-notes'` is the GM-only page (GM only).

## Item rewards (0.11.0)

In the quest editor (Quests tab), **Item rewards** sits in the *Rewards* section. Drop items on it from a character or NPC sheet, a compendium or the Items sidebar; each change saves at once.
- Per row: quantity, **Shown to players** (after it's completed, the default; while the quest is visible; never), and **Goes to** (one chosen character, the default; each character; split). Goes to is fixed on individual quests.
- An item dropped from a sheet is copied into a GM-only Items folder, **Ashen Gate Rewards (Quest Log)**; the character or NPC keeps its item. Removing the row (asks first) deletes that held copy.
- Folders are refused ("Drop items one at a time."), and so is anything that isn't an item.
- Players see the rewards their row allows (name, picture and quantity only) under **Rewards** in the quest.
- *Rewards handled outside Quest Log* is the old checkbox, unchanged.
- API (GM only, contract `ag-quest-rewards/1`): `api.rewards.list(questId)`, `addFromDrop(questId, dropData)`, `update(questId, key, {quantity, visibility, recipient})`, `remove(questId, key)`.

## Giving rewards (0.12.0)

Every grant is started and confirmed by the GM; nothing is ever taken from anyone.
- Set a quest to **Completed** and save: if anything is still owed, the **Give rewards** panel opens under the reward list (or press **Give rewards** in its head). Tick what to give, pick the character for "One character", untick characters for "Each character", or share out "Split" in whole numbers. **Will receive** shows the result; **Grant rewards** asks first, then lists what each character got. **Not now** leaves the rewards pending.
- Party characters are the characters players own; individual quests always give to their character.
- Each character's items are created in one go, or not at all. Containers arrive with their contents. Each grant is a new item (no stacking).
- A reward is never given twice in the same round: saving Completed again offers only what is still owed, and a crash between creating items and saving the record is repaired from the items' tags.
- **Grant again** on a given row (asks first) lets you give it once more.
- Drag a row onto a character sheet to give it to that character (GM only, recorded; a second drop says "Already given to …").
- A whispered chat card goes to the GMs and the players who own the recipients. With Character Hub 0.25.0 or later, the character's Journey records the reward.
- Players see who got what nowhere; their quest counts as rewarded once every reward they can see is given (or the checkbox is ticked).
- API (GM only): `api.rewards.grantable(questId)`, `grant(questId, choices)`, `grantAgain(questId, rewardKey, {confirm: true})`.

## Item rewards in quest files (0.13.0)

A quest record can list item rewards in `outcomes.item_rewards` (at most 50):

```json
"outcomes": {
  "description": "[TEST] Coin reward is GM-handled.",
  "item_rewards": [
    {"item_id": "ITEM-TEST-HEALING-DRAUGHT", "quantity": 2, "recipient": "each"},
    {"item_id": "ITEM-TEST-RUSTED-BLADE", "visibility": "gm", "note": "[TEST] If slain."}
  ]
}
```

| Field | Rule |
|---|---|
| `item_id` | Required. An `ITEM-*` id, a `REC-*` recipe id or a `MAT-*` material id (0.18.2), unique within the quest. Never a Foundry uuid. |
| `quantity` | Optional whole number, 1 or more (default 1). |
| `visibility` | Optional: `on_complete` (default), `shown` or `gm`. |
| `recipient` | Optional: `chosen` (default), `each` or `split`. |
| `note` | Optional, up to 300 characters, shown to the GM only. |

- Unknown keys, a `uuid`, a duplicate `item_id`, a bad value or more than 50 entries stop the import with an error naming the quest and the entry.
- The item itself is imported as an Item (in the same file, the same bundle or earlier). General Manager imports each Recipe record as its recipe Item and each Material record as its material Item, matched by the `REC-*` / `MAT-*` id. A given recipe Item arrives as an ordinary recipe Item with its source intact, so the character can learn it with Learn in the Profession Ledger. If the world has no item with that id yet, the import warns and still brings the quest in; the row shows Missing until the item arrives.
- Reimporting with *update* keeps the GM's changes (quantity, visibility, recipient, removed rows) and every grant. A reward taken out of the file that was already given stays in the GM list as "No longer in the quest".
- Examples and common mistakes: `docs/fixtures/item-rewards/` (`quest-recipe-rewards.json` shows REC/MAT rewards) (check with `node scripts/validate-content.mjs`).

## Superseded ids (0.25.0)

`api.supersedeIds({OLD: 'NEW'}, {dryRun})` (GM only, safe to run again) renames an id a quest names (giver, faction, typed link) and the remembered link name; progress is untouched. General Manager calls it when you apply a package with `supersedes`. See `docs/supersedes-schema.md`.

## Relation to other modules

Independent. General Manager can hand Quest files to `api.previewQuestImport` / `api.importQuests` (GM only); Quest's own Import keeps working. Locations links appear on quests when Locations is active. Factions can reference Objective ids and only reads Quest data through feature-detected, GM-only diagnostics.

## Privacy

Source and campaign state live in GM-only Journals; players see only permission-filtered projections of revealed data. GM-only Journals must never be given player ownership.

## Public API

`game.modules.get('ashen-gate-quest-manager').api`:

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
const result = api?.resolveObjective('QUEST-EXAMPLE', {entityType: 'Objective'});
const view = api?.getVisibleObjective('QUEST-EXAMPLE'); // sanitized player view
```

Also: `open`, `openObjective`, `embed` (`mount`, see below), `tracking`, `listVisible`, `consumer` (`resolveObjective`, `refreshCompendiums`, `getDefinitionReaderStatus`), `assignments` (`list`, `get`, `save`, `remove`; GM only), `listQuests`, `getGMSource`, `getGMState`, `setGMState`, `previewQuestImport`, `importQuests` (all GM only) and `playerAccess` (`ag-player-access/1`). Player reads need Player Access and a published, readable projection. Compendium-based definitions are configured by exact pack id in GM Setup → Compendium packs.

### `embed.mount(element, options)` (0.8.0)

Shows one character's quests inside another module's window, for example Character Hub's Ashen Gate → Quests: the Party quests and that character's Individual quests on the left (search, **Track**), the selected quest's objectives, locations, shared party notes and **Character notes** (Save) on the right, and an **Open Quest Log** button.

```js
const api = game.modules.get('ashen-gate-quest-manager')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Quest Log replaces its contents and adds the class `agq-embed` (and, until 0.11, the old name `ag-quest-embed`; nothing is styled by it).
- `options.actorId`: the character whose Individual quests and notes are shown. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself whenever the Quest Log window would (quest, actor, user or setting changes) and unmounts itself if the element has left the page.
- **Permission:** the same as the Quest Log window's Party and Individual tabs. Players see "Quest Log is hidden" while Player Access is off, and only quests whose published view they can read. Track and Save Character Notes go through the window's own checks (a quest must still be visible; notes need Owner on the character). GM authoring, reveal and progress are not in the embed.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-quest-manager/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-quest-manager-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
