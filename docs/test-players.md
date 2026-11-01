# Test players (`ag-test-players/1`)

The GM can pick one or more of the world's player users as **Test players** (General Manager > GM Setup > General > Test players). Foundry cannot enable modules per user, so each Ashen Gate module hides its launcher, windows and player API behind its own **Player Access** setting. A Test player is treated as if every module's Player Access were **on**; every other player still follows each module's own setting.

## The contract

| | |
|---|---|
| Owner | General Manager (`ashen-gate-manager`, 0.98.0+) |
| Setting key | `ashen-gate-manager.testPlayers` |
| Scope / UI | `world` (every client can read it), `config: false` (not in Foundry's Game Settings screen) |
| Shape | an array of User id strings, e.g. `["aB3dE5fG7hI9jK1l"]` |
| Default | `[]` |
| Who may change it | the GM only |

Manager also publishes `game.modules.get('ashen-gate-manager').api.testPlayers`: `{contract: 'ag-test-players/1', key, get(), set(ids)}`. `set` is GM-only and keeps only existing non-GM users. Other modules must not call it; they read the setting key.

## What a module does

Every module carries an identical copy of `scripts/ag-test-players.mjs` (`js/` in Headquarters; `scripts/check.mjs` fails if the copies drift) and calls `isTestPlayer(user, game)`:

- returns `true` only for a **non-GM** user whose id is in the list;
- returns `false`, never throws, when General Manager is not installed or not active, the setting is not registered, the value is not an array, or the user is a GM or unknown;
- only reads `game.settings.get('ashen-gate-manager', 'testPlayers')` (inside try/catch, after checking it is registered). It never imports Manager code, so modules stay independent.

Each module's Player Access decision becomes: GM, **or** its own setting is on, **or** `isTestPlayer(user)`. For checks the GM client makes on behalf of a requesting player (Renown, Cinders, Skill Trees, Headquarters, Utilities, Locations notes and sharing), the requesting user is the one tested.

## What it does not do

- It grants **no GM power**. GM-only API calls and data actions are still refused for a Test player.
- Document permission checks are unchanged (Actor ownership, Item and journal permissions, Hub visibility toggles, "stash on", "shops on"): a Test player sees only what a real player with those permissions would, which is the point of testing.
- Each module's `api.playerAccess.getState()` (`ag-player-access/1`) still reports the module's own world setting, so Manager's Modules tab and Hide all keep working on the real value. The Modules tab adds a **Test players: on** note to a card while the list is not empty.
- No saved data changes; removing a user from the list simply returns them to the normal rule.

## Modules

Character Hub 0.71.0, Cinders 0.18.0, Renown (ashen-gate-factions) 0.29.0, Headquarters 0.17.0, Locations 0.43.0, General Manager 0.98.0 (NPC Codex, player dock), Profession Ledger 0.45.0, Quest Log (ashen-gate-quest-manager) 0.32.0, Skill Trees 0.27.0, Utilities 0.37.0.

Tests are mocked Foundry only. To verify live, see the Forge steps in the pull request.
