# Renown: Known vs Recruited (module 0.23.0, first unlock added in 0.24.0)

Two separate per-faction states, both **campaign state** (never part of a reusable definition, never exported, never in `ag-foundry-import` packages):

| State | Meaning | Where it is stored |
|---|---|---|
| `discovery` (**Known**) | The player knows the faction exists: name, leader, description (per `field_reveals`) and information entries (per their unlock rules). | the faction's group state record (`groupClaims` flag of its `Faction State • … (Group)` Journal) |
| `membership` (**Recruited**) | The player has standing: Renown, ranks, milestones, rewards, claims, requests and history. | same record, beside `discovery` |

## Shape

```json
{
  "discovery":  { "party": false, "actors": ["<Foundry actor id>"] },
  "membership": { "party": false, "actors": ["<Foundry actor id>"] }
}
```

- Actor ids are world-local Foundry ids (state only, never canonical). Faction ids stay `FACTION-*`.
- A member is always Known: membership without discovery counts for nothing. Recruiting adds to both; removing Known removes membership; removing membership keeps Known.
- `membership.party: true` recruits every character. Group standing is shown to a player when the party is recruited **or** any of their own characters is (so a world that only ever revealed a faction to one character keeps its group view).
- Removing membership never deletes standing, claims or history. They stay in the record, hidden from players, and return if the person is recruited again.

## Source and import format: unchanged

`membership` is not in the reusable source allowlist (`sourceDefinition` drops it, like `discovery`'s mutable parts). `ag-foundry-import/0.2` packages and Renown's `ag-factions-source-export` files carry no membership. In a Renown import file's `starting_state`, `party_discovered` and an actor's `discovered` keep their old meaning: shown **and** recruited (so a starting Renown score is visible). Nothing to change in ChatGPT's import packages.

## Migration (0.23.0)

Runs when the active GM opens the world; safe to re-run; writes nothing on the second run.

1. A group state with **no** `membership` field gets `membership = copy of its effective discovery`. Everything already shown stays recruited exactly as before.
2. Before that write is made, reads behave the same way (a missing field resolves to the copy), so there is no window where a player loses their standing.
3. New factions start with `membership: {party:false, actors:[]}`. A new reveal adds to `discovery` only.

## What a player's client receives

Per faction in the player view payload (built GM-side, never filtered only in the template):

- Known only: `{id, name, leader, public_role, folder_key, canShare, member:false, status:"Known (not recruited)", entries, group:null, personal:{}, groupTrack:null, individualTrack:null}`. No score, rank, milestone, threshold, reward, claim, request or history key exists in it.
- Recruited: the same plus `member:true`, `status:"Recruited"`, `group`, `personal` (only the player's recruited characters), `groupTrack`, `individualTrack`.
- Sharing a faction with the party copies knowledge only; it never recruits.

## GM behaviour

- **Recruit / Remove … from members…** in Visibility, Group and Character tabs; **Show to / Hide from** for Known. Removing is behind a labelled danger confirmation.
- Recording Renown for a character (or the party) that is not recruited: dialog "Not recruited: recruiting now" with **Recruit <name> now** ticked; unticking cancels the award.
- Faction knock-ons (0.22.0 relations) only apply to factions the character is recruited into. Reward claims and requests need membership.
- API (GM only): `api.setMembership(factionId, {party:true, on})` or `{actorId, on}`; both Booleans required, exactly one of `party` / `actorId`. Returns the scope status `{known, member, ...}`. Players' `api.getFactions()` is the projected view above.

Deities have no membership: they keep `discovery` only, and their later tiers depend on the Vow (below).

## First unlock only (0.24.0)

World setting `hideLaterTiers` (GM Setup, default **on**). All of this is built GM-side into the player payload; later tiers are not sent and hidden by the template.

| Case | Player payload (setting on) | Setting off (0.23.0) |
|---|---|---|
| Faction, Known only | `groupTrack` and `individualTrack` = `{preview:true, milestones:[first]}`. The first milestone is the lowest threshold, projected at a score below every threshold: locked, reward teasers only, no benefit text, no document link, `canClaim:false`, `unlocksWhenRecruited:true`, `unlocksText:"Unlocks when recruited"`. Still `group:null`, `personal:{}`. | both tracks `null` |
| Faction, recruited | as 0.23.0. The shared `individualTrack` is the full list only when every character the player owns is recruited; otherwise it is the one-milestone preview and recruited characters read their own `personal[actorId].milestones` (full). | as 0.23.0 |
| Deity, character has no Vow to this god | `personal[actorId].milestones` = first tier only, `limited:true`, `rank` = first tier name, `next:null`, `remaining:0`, `percent:0`. Shared `ladder` = first row while any of the player's known characters is unsworn. | full |
| Deity, Vow sworn to this god | full ladder, `limited:false` | full |

- Per character: a Vow to another god does not unlock this one. The flag is `flags.ashen-gate-factions.vow` on the Actor; changing it re-projects the player views.
- Claims: a later-tier reward of a god is refused for a character without a Vow to it (setting on). Faction claims already need membership.
- GM views and the GM API are unchanged. `getPantheon` rows carry `limited`; the Hub embed shows "More tiers unlock when you swear a vow." instead of "Top rank".
- Hints shown to players: "Unlocks when recruited", "More ranks unlock when you are recruited.", "More tiers unlock when you swear a vow." No counts or later names.
