# Ashen Gate | Headquarters

Module ID `ashen-gate-headquarters` · Foundry V14 · dnd5e. A shared Guildhall: build its layout from facilities, keep a hirelings roster, personal quarters and benefits. Facility effects are informational; this module does not apply mechanics. Open it from **Actors sidebar → Headquarters** (players when **GM Setup → Player Access** is on).

## Tabs

- **Guildhall Builder** (shown as **Activation** until the GM activates the Guildhall, a one-time setup step): place acquired facilities on the Guildhall canvas by dragging, or with **Place** (first free space) and the inspector's **Move** buttons from the keyboard.
- **Personal Quarters**: per-player rooms. The GM's **Create missing player rooms** is on this tab's toolbar.
- **Benefits**: what the installed facilities offer and whether each is active.
- **Hirelings** (GM): the hosted hirelings roster with search, a status filter, Active / Departed groups, **Add to roster**, stations, Working and permanent departures. Players don't get this tab.
- **Facilities** (GM): a guild row with the current rank and **Set rank…** (asks first), then two sub-tabs. **Facilities** lists every imported or seeded facility definition with Locked / Unlocked / Acquired status, copies owned and installed, search, filters, sort and grouping, Unlock and Acquire +1; an **Advanced: import here, or use General Manager** fold keeps a direct JSON import. **Decorations** holds the artwork players can place. It also works before the Guildhall is activated, so facilities can be imported first.
- **GM Setup** (GM): settings only: Player Access, Guildhall and canvas settings and the guild rank table, all saved together by **Save Changes**. Unsaved changes are kept until you discard them. Developer Tools (the test-record seeder) are collapsed at the end.

State is kept in a GM-only Journal; players see filtered views.

## Relation to other modules

Independent. General Manager hands facility files to `api.previewFacilityImport` / `api.importFacilities` (GM only): new facilities are added and existing ids are kept. Importing never unlocks or acquires anything.

## Public API

`game.modules.get('ashen-gate-headquarters').api`: `open`, `playerAccess` (`ag-player-access/1`), `playerView`, `embed.mount`, `inspectFacilityRef`, and GM-only `getState`, `exportState`, `getPersonnel`, `reconcileDepartures`, `previewFacilityImport`, `importFacilities`.

### `playerView(actor)` (0.9.0)

Player-safe, read-only Guildhall view for one character, for partner modules such as Character Hub.

```js
game.modules.get('ashen-gate-headquarters').api.playerView(actor)
// → {active: true, guildhall: {name, rank},
//    facilities: [{key, facilityId: 'FAC-…', name, category, stage, room: 'shared'|'personal', roomOwner, benefits: [{name, description, recipient}]}],
//    hirelings: [], hirelingsPublished: false}
```

- `facilities`: facilities installed in the shared Guildhall, plus those in the personal rooms of the players who own this character (`roomOwner` is that player's name; `null` for shared). Sorted personal first, then by name. Benefits are the installed stage's informational benefits.
- `hirelings` is always `[]` and `hirelingsPublished` is `false`. The hireling roster, Working status and staffing are GM-private in Headquarters and are not published to players, so this API doesn't publish them either.
- Built from the public projection for every caller, the GM included, so it never contains personnel, staffing occupants, history or the editor lease.
- Guildhall not activated → `{active: false, guildhall: null, facilities: [], hirelings: [], hirelingsPublished: false}`.
- **Permission:** the GM, or a user with **Owner** permission on the Actor. Anyone else gets `Error('Actor access denied')`. Players also get an error while Headquarters Player Access is off.


### `embed.mount(element, options)` (0.10.0)

Shows a compact, **read-only** Guildhall view for one character inside another module's window, for example Character Hub's Ashen Gate → Base: the Guildhall's name and rank and the facilities that character may see (Guildhall rooms and their own room), each with its stage and benefits, and **Open Headquarters**. Building, staffing and everything else stay in the Headquarters window.

```js
const api = game.modules.get('ashen-gate-headquarters')?.api;
if (api?.embed?.mount) {
  const view = api.embed.mount(element, {actorId: actor.id, mode: 'character'});
  // later: view.refresh();  view.unmount();
}
```

- `element`: a DOM element the caller owns. Headquarters replaces its contents and adds the class `aghq-embed`.
- `options.actorId`: the character. `options.mode`: `'character'` (the only mode; `api.embed.modes` lists them). An unknown mode or a missing element throws.
- Returns `{unmount(), refresh()}`. It refreshes itself when the Guildhall or Player Access changes and unmounts itself if the element has left the page.
- **Permission:** the same as `playerView`: players see "The GM has hidden Headquarters." while Player Access is off; only the GM or the Actor's owner sees the view; it shows only `playerView`'s player-safe data, so other players' rooms, hirelings and private state never appear.

## Install

Foundry or The Forge: **Add-on Modules → Install Module → Manifest URL**, paste

`https://raw.githubusercontent.com/robbmcgaw/ashen-gate-foundry/main/modules/ashen-gate-headquarters/module.json`

and Install. Updates arrive through Check for Updates / Forge's update button. Every version is also on the [GitHub Releases](https://github.com/robbmcgaw/ashen-gate-foundry/releases) page (tag `ashen-gate-headquarters-v<version>`) for manual install or rollback. Change history is in [CHANGELOG.md](CHANGELOG.md).
