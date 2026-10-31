# Ashen Gate | Renown

Formerly **Factions & Renown**. Only the display name changed: the module id is still `ashen-gate-factions`, and settings, flags, API, import schema and saved data are unchanged.

**Sidebar folders.** Renown keeps its documents under **Ashen Gate / Factions Data** (Journals) with snapshots in **Ashen Gate / Backups**; see docs/folder-convention.md.

Module ID `ashen-gate-factions` · Foundry V14 · dnd5e. Factions with group Renown, per-character Renown, discovery, rewards and service requests. Open it from **Actors sidebar → Renown** (players when **GM Setup → Player access** is on).

## Tabs

- **Group:** each faction the party knows, with group Renown score and rank. The group's display name can be customized in GM Setup.
- **Character:** the same factions for one character, with that character's personal Renown. Players can **Share with party** what they have discovered, claim rewards and send service requests (the GM is notified and acknowledgments are tracked per user).
- **Pantheon:** deities, shown as a grid of holy-symbol tiles (Major and Lesser) with each one's title and the chosen character's rank. Open a deity for its card (title, rank, domain, blurb, portfolio, teachings, followers, practices, saying), that character's piety and rank ladder, rewards, lore, and allies/rivals. Piety is per character only; there is no group score. A **How Vows work** note tops the tab. A character holds one Vow at a time: the first rank card of a god the character has reached has a **Swear Vow** / **Vow sworn** toggle (owner or GM; swapping gods asks first), and the GM has **Break Vow…** (ends it, takes 3 piety with that god, never below 0, recorded in the history). The Vow is stored in Renown's own Actor flag (`flags.ashen-gate-factions.vow`); the character embed shows `Vow: <god>`. Swearing also adds a **Vow of <god>** feat to the character (one use per Long Rest, an *Invoke your Vow* activity and one Active Effect with the god's +1d4 from the Seeker reward's `vow_benefit`); it is removed when the Vow ends, is swapped or is broken. Rewards may carry `vow_benefit` `{name, bonus, applies_to[{kind: skill|save|check|tool|attack, key, condition?}], uses{max, recovery}, summary, requirement}` (closed shape). Players see only deities revealed to one of their characters, plus (0.21.1) a plain **Undiscovered deity** tile in the right tier for each undiscovered deity whose Visibility has **Show undiscovered placeholder** on: no name, symbol, title, domain or id, and it cannot be opened; revealing the deity replaces it with the real tile. Placeholders are not deities in the API: `getDeities`, `getPantheon`, the embed and Vows list only deities the character knows. The player view carries them separately as `payload.deityPlaceholders` (`{kind:'deity-placeholder', tier, key}`, key an opaque per-tier ordinal). The GM also adjusts piety and undoes changes here; **Edit deity** opens the deity in the Factions tab.
- **Factions** (GM): every faction, or every deity (**Show**), in the list on the left with its visibility badge (and, for factions, group Renown and rank). Search filters as you type; filter, group and sort. **Manage folders** (add, rename or delete folders; deleting one moves its factions to *Other factions*), **Import…**, **Export** and **New faction…** / **New deity…** are on the right of the toolbar. Pick one to edit it on the right, in sub-tabs: **Profile** (name, folder, tags and ranks), **Visibility** (reveal to the party or a character, placeholder, sharing and, for factions, field by field), **Information** / **Lore**, **Rewards**, **Requests**, and **Links** (factions: quests and contracts) or **Relations** (deities). Profile and Visibility save with **Save Changes** at the bottom right; the other sub-tabs apply at once (marked *Applies now*). Leaving with unsaved edits asks first.
- **Requests** (GM): every open claim and service request from every faction and deity, grouped by name, with the number open on the tab. **Open <name>** goes to that record's Requests sub-tab.
- **GM Setup** (GM): settings only: Player access, Pantheon damping, Faction knock-on damping and the custom group display name, saved together with **Save Changes**. A collapsed **Developer Tools** box at the bottom holds **Fill in permanent item ids** (0.14.0: checks item rewards and, after a confirmation, fills in missing permanent item ids) and loads four synthetic **[TEST]** demo factions.

Group and Character show the folder list on the left; Factions has its own list and editor; Pantheon, Requests and GM Setup use the full width.

Discovery can be all-or-nothing per faction, or field by field (Name, Leader, Description). Existing factions stay in all-fields-visible mode until the GM opts in. Source-definition exports (`AG_Factions_Definitions.json`) omit player disclosure, Renown, claims, service usage and history.

## Item rewards (0.14.0)

Drop an item on a reward level (from the Items sidebar, a compendium, or any character or NPC sheet). Reward levels take **items only**; journals and other documents go on the information list.
- The reward keeps the item's link, its picture and its **permanent item id** (from General Manager) when it has one; the editor shows a **Permanent id** badge (the GM can open Details for the id and Copy id), or **No permanent id**, and a red **Missing** badge when the item can't be found.
- An item dragged off a sheet is copied into a GM-only **holding copy** (Items sidebar → folder *Ashen Gate / Backups / Renown Rewards*). The sheet keeps its item. Removing the reward deletes its holding copy.
- When the GM approves a claim, the item is found by its permanent id first, then by its link, and copied to the character with everything inside it (containers). A claim is never granted twice. If the item is missing, the GM is told and the request stays waiting.

Reward descriptions, teasers and rank benefits keep line breaks (`\n` in the source text; shown with `white-space: pre-line`, still escaped plain text).

## Import update mode (0.18.0)

`options = {mode: 'skip' | 'update', overwriteEdited: false}`, GM only; `api.importOptions` (`ag-renown-import/1`) reports that it is available.

- **Rewritten from the file:** name, public text, ranks and milestones (thresholds, benefits, choose-one), rewards, information entries, relations and resonance, tags, refs, visibility, status, version, provenance. The faction's folder is kept.
- **Kept:** standings and history, claims, requests, used charges, claimed rewards, choose-one choices, discovery, what the party learned per entry, field reveals, personal records. An id the file drops keeps its saved data and is reported as *no longer defined*; a new id starts empty. `starting_state` is for new records only.
- **Preview rows:** `new`, `update` (with `changes`: field names and counts), `unchanged`, `kept` (edited here since the last import; replaced only with `overwriteEdited: true`). Records without an import fingerprint (imported by an older Renown) cannot be checked for edits.
- **Snapshot:** the old definitions are saved as a GM-only *Renown Snapshot* Journal before any write; if that fails nothing changes. Running the same file twice changes nothing. Closed source schema and provenance rules are unchanged.
- Import… in the Factions tab offers the same choice when the file has records already in the world.

## Superseded entries (0.17.0)

A faction or deity file may carry `supersedes: ["<old id>"]` on a faction/deity and on its information entries. General Manager passes the pairs to `api.supersedeIds({OLD: 'NEW'}, {dryRun, definitions})` (GM only, safe to run again), which renames the entry in the stored definition and moves what the party learned for it. Standings, claims, rewards and tracks are untouched. See `docs/supersedes-schema.md`.

## Relation to other modules

Independent. General Manager hands faction files to `api.previewFactionsImport(data, options)` / `api.importFactions(data, options)` (GM only). Default `mode: 'skip'`: new factions are added, existing ones are never changed. `mode: 'update'` (0.18.0) rewrites the definitions of records already here and keeps all campaign state (see Import update mode). A faction can hold typed Objective references; with Quest Manager active the GM-only `getObjectiveRefs` and `auditObjectiveRefs` report on them, and Renown never resolves or reveals Quest state itself.

## Public API

`game.modules.get('ashen-gate-factions').api`: `open` (optionally `open({factionId, actorId, tab: 'group' | 'player'})` (`'player'` is the Character tab), 0.10.0; `open({deityId, actorId, tab: 'pantheon'})`, 0.11.0), `embed.mount` (below), `getFactions` (players get only their filtered view), `validateFaction`, GM-only `exportDefinitions()` (0.26.0: the `ag-factions-source-export/0.4` file the Export button downloads, definitions only), GM-only `exportState()` (0.27.0: all play state as plain JSON, schema `ag-factions-state-export/0.1` `{schema_version, factions, personal}`: standings with rank position, claims, requests, uses, choices, discovery and field reveals, membership, Vows, each with canonical ids, display names and actor ids beside character names; no definition text; used by General Manager's world backup), `getDeities`, `getPantheon(actor)` (Pantheon, 0.11.0; see Deity records), `playerAccess` (`ag-player-access/1`), and GM-only `previewFactionsImport`, `importFactions`, `refreshPlayerViews`, `getObjectiveRefs`, `auditObjectiveRefs`, `rewards.backfillItemIds({dryRun = true})` (`ag-renown-rewards/1`, 0.14.0), `deleteFolder(key)` (0.16.0: its factions move to Other factions and are never deleted; resolves `{deleted, key, name, moved: {factions, deities}}`, and `deleted: false` when the folder is already gone).


### `embed.mount(element, options)` (0.10.0)

Shows a compact, **read-only** standing list for one character inside another module's window, for example Character Hub's Ashen Gate → Renown. One row per faction the user may see: the party's rank and Renown score, this character's rank and score, the next milestone for each, and **Open** (opens the Renown window on that faction; the Character tab when a character is given).

```js
const api = game.modules.get('ashen-gate-factions')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Factions replaces its contents and adds the class `agf-embed`.
- `options.actorId`: the character whose personal standing is shown. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when Renown's journals or settings change and unmounts itself if the element has left the page.
- **Pantheon (0.11.0):** when `actorId` is given, a Pantheon section follows with that character's piety with each deity they know (symbol, name, title, rank, score, next rank, **Open**). Same rule as `getPantheon`: players only for characters they own, only revealed deities.
- **Permission:** read from the same sources as the Renown window: the GM sees everything; a player sees only their own filtered player view (never undiscovered factions, GM notes or other players' characters), and the character's personal standing only when they own it. Players see "The GM has hidden Renown." while Player Access is off. Claims, requests and Renown awards stay in the Renown window.

## Deity records

A deity is a definition with `entity_type: "Deity"` in the same import/export file (`ag-factions-source-export/0.4`; `0.3` faction-only files still import). Deity fields: `deity.symbol` (image path, e.g. `assets/ashen-gate/deities/<name>.png`), `title`, `domain`, `tier` (`major`|`lesser`), `blurb`, `portfolio`, `teachings`, `followers`, `practices`, `saying {text, attribution}`, `relations [{deity_id, resonance: 0..1}]` (0 Dissonance, 0.5 neutral, 1 Resonance; gains spread to related deities, damped and GM-confirmed). The rank titles are the deity's `individual_track` milestones. Full field list, defaults and a synthetic example: [docs/renown-deity-schema.md](../../docs/renown-deity-schema.md).

## Faction relations (0.22.0)

A faction can list **Related factions** (Factions tab, Profile): each has a slider from Dissonance (rival) to Resonance (ally). When the GM adds **personal** Renown for a character with one faction, Renown lists what each related faction would change (scaled by **GM Setup → Faction knock-on damping**) and the GM confirms each row. Group Renown never spreads, knock-ons never chain, only factions the character already knows are affected, scores stay at 0 or above and claimed ranks and rewards are kept. Personal history has **Undo…**, which also undoes its knock-ons. Players see relations only to factions they know. Schema: `docs/renown-faction-relations-schema.md`.

## Known and recruited (0.23.0)

Showing a faction to a player makes it **Known (not recruited)**: they see its name, leader, description and the information they have learned, and nothing about standing. The GM then **Recruits** the party or a character (Visibility, Group or Character tab), which brings in ranks, progress, rewards, claims and history. Recruiting also shows the faction; hiding it also removes the recruit; removing a recruit hides standing and deletes nothing. Awarding Renown to someone who is not recruited offers to recruit them first, and faction knock-ons only reach factions the character is recruited into. Worlds from 0.22.0 or earlier keep everything already shown as recruited. State shape and rules: [docs/renown-known-vs-recruit.md](../../docs/renown-known-vs-recruit.md). Deities do not use recruiting (see below). API: `setMembership(factionId, {party:true | actorId, on})` (GM).

## Locked ranks (0.25.0, replaces the 0.24.0 switch)

Players see **every rank** of a faction they know and of a god shown to them. A rank they have not unlocked is a **Locked** card (lock icon and the word Locked) showing only its rank number, its threshold and a line of **flavor text**; its name, text and rewards are never sent to the player, so editing a template cannot reveal them. Unlocked ranks show everything as before. Each milestone (group and individual tracks, deity ladders) has an optional `flavor` (editor field **Flavor when locked**, 400 characters at most); without one the card says "A further rank, earned through renown." (gods: "A further tier, opened by a sworn Vow.").

- **Faction, Known but not recruited:** the first rank in full as a preview ("Unlocks when recruited", not claimable), then locked cards. Once recruited, ranks open as the party or character earns them.
- **Deity:** the first tier in full (with the Vow toggle); the rest locked until that character swears a Vow to the god and earns the piety. Judged per character; the "next" pointer is a generic "Tier n".
- **GM Setup, Locked ranks** (one setting): *Flavor text only* (default), *Hide locked ranks* (Renown 0.24.0: nothing beyond the first rank or tier until recruited or sworn), *Show everything* (as before 0.24.0). A world that had turned the old 0.24.0 switch off starts on *Show everything*.
- The GM always sees everything. `getFactions()`, `getDeities()`, `getPantheon()` and the Character Hub embed follow the same rules for players. Details: [docs/renown-known-vs-recruit.md](../../docs/renown-known-vs-recruit.md).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-factions/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-factions-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
