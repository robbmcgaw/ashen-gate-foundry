# Ashen Gate | Renown

Formerly **Factions & Renown**. Only the display name changed: the module id is still `ashen-gate-factions`, and settings, flags, API, import schema and saved data are unchanged.

Module ID `ashen-gate-factions` · Foundry V14 · dnd5e. Factions with group Renown, per-character Renown, discovery, rewards and service requests. Open it from **Actors sidebar → Renown** (players when **GM Setup → Player Access** is on).

## Tabs

- **Group:** each faction the party knows, with group Renown score and rank. The group's display name can be customized in GM Setup.
- **Player:** the same factions for one character, with that character's personal Renown. Players can **Share with Party** what they have discovered, claim rewards and send service requests (the GM is notified and acknowledgments are tracked per user).
- **Pantheon:** deities, shown as a grid of holy-symbol tiles (Major and Lesser) with each one's title and the chosen character's rank. Open a deity for its card (title, rank, domain, blurb, portfolio, teachings, followers, practices, saying), that character's favour and rank ladder, rewards, lore, and allies/rivals. Favour is per character only; there is no group score. Players see only deities revealed to one of their characters. The GM gets the same controls as for factions: create, edit the card and rank titles, reveal, adjust favour, rewards, lore, relations and requests.
- **Organizations** (GM): every faction (hidden, character-only and revealed) in a searchable list with visibility, group Renown, folder and linked-objective chips. Filter, sort and group by visibility or folder. Creating, editing, revealing, folders, rewards, claims, information entries, linked quests, Import and Export live here.
- **GM Setup** (GM): settings only: Player Access and the custom group display name.

Discovery can be all-or-nothing per faction, or field by field (Name, Leader, Description). Existing factions stay in all-fields-visible mode until the GM opts in. Source-definition exports (`AG_Factions_Definitions.json`) omit player disclosure, Renown, claims, service usage and history.

## Relation to other modules

Independent. General Manager hands faction files to `api.previewFactionsImport` / `api.importFactions` (GM only): new factions are added, existing ones are never changed. A faction can hold typed Objective references; with Quest Manager active the GM-only `getObjectiveRefs` and `auditObjectiveRefs` report on them, and Renown never resolves or reveals Quest state itself.

## Public API

`game.modules.get('ashen-gate-factions').api`: `open` (optionally `open({factionId, actorId, tab: 'group' | 'player'})`, 0.10.0; `open({deityId, actorId, tab: 'pantheon'})`, 0.11.0), `embed.mount` (below), `getFactions` (players get only their filtered view), `validateFaction`, `getDeities`, `getPantheon(actor)` (Pantheon, 0.11.0; see Deity records), `playerAccess` (`ag-player-access/1`), and GM-only `previewFactionsImport`, `importFactions`, `refreshPlayerViews`, `getObjectiveRefs`, `auditObjectiveRefs`.


### `embed.mount(element, options)` (0.10.0)

Shows a compact, **read-only** standing list for one character inside another module's window, for example Character Hub's Ashen Gate → Renown. One row per organization the user may see: the party's rank and Renown score, this character's rank and score, the next milestone for each, and **Open** (opens the Renown window on that organization; the Player view when a character is given).

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
- **Pantheon (0.11.0):** when `actorId` is given, a Pantheon section follows with that character's favour with each deity they know (symbol, name, title, rank, score, next rank, **Open**). Same rule as `getPantheon`: players only for characters they own, only revealed deities.
- **Permission:** read from the same sources as the Renown window: the GM sees everything; a player sees only their own filtered player view (never undiscovered organizations, GM notes or other players' characters), and the character's personal standing only when they own it. Players see "The GM has hidden Renown." while Player Access is off. Claims, requests and Renown awards stay in the Renown window.

## Deity records

A deity is a definition with `entity_type: "Deity"` in the same import/export file (`ag-factions-source-export/0.4`; `0.3` faction-only files still import). Deity fields: `deity.symbol` (image path, e.g. `assets/ashen-gate/deities/<name>.png`), `title`, `domain`, `tier` (`major`|`lesser`), `blurb`, `portfolio`, `teachings`, `followers`, `practices`, `saying {text, attribution}`, `relations [{deity_id, resonance: 0..1}]` (0 Dissonance, 0.5 neutral, 1 Resonance; gains spread to related deities, damped and GM-confirmed). The rank titles are the deity's `individual_track` milestones. Full field list, defaults and a synthetic example: [docs/renown-deity-schema.md](../../docs/renown-deity-schema.md).

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-factions/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-factions-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
