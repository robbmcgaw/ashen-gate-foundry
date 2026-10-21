# NPC Codex: record schema and reveal model

General Manager 0.33.0 and later. The NPC Codex lives in **General Manager → Library → NPC Codex** (rail icon). It shows every imported NPC record. For each field, the GM decides who knows it: nobody (hidden), the whole party, or specific characters. Players get a read-only codex of only what has been revealed to them.

## Where things live

| What | Where | Written by | Re-import |
|---|---|---|---|
| NPC content (role, appearance, wants, …) | The NPC record in a Manager package (`ag-foundry-import/0.2`). It is stored on the NPC Actor as `flags.ashen-gate-manager.source.definition` | Package import | Updated like any record |
| Reveals, what the party has learned, GM-added connections, GM notes | `flags.ashen-gate-manager.codex` on the same NPC Actor | GM only, from the Codex | **Never touched** |
| Players can open the codex | World setting `ashen-gate-manager.codexPlayerAccess` (default off). GM Setup → NPC Codex | GM | n/a |

Existing NPC records keep working as they are. NPCs still import as Actor shells, matched by permanent id. The `codex` block below is optional and additive.

## NPC record fields

The fields GPT drafts already use. `codex` is new and optional.

| Field | Type | Default | Codex use |
|---|---|---|---|
| `id` | string `NPC-…` | required | Permanent id. Never rename. Keep it neutral (no spoilers). |
| `entity_type` | `"NPC"` | required | Only `NPC` records appear in the Codex. |
| `name` | string | Actor name | Shown once the NPC is discovered. |
| `role` | string | `""` | Revealable. Shown under the name. |
| `appearance` | string | `""` | Revealable. |
| `signature_line` | string | `""` | Revealable. Shown as a quote. |
| `wants` | string | `""` | Revealable. |
| `knows` | string | `""` | Revealable. |
| `portrayal` | string | `""` | **GM only.** Never revealable. |
| `session_role` | string | `""` | **GM only.** |
| `stat_block` | string | `""` | **GM only.** |
| `gm_notes` | string[] | `[]` | **GM only.** |
| `art` | `{repo_path, forge_path}` | nulls | Not used by the Codex. The portrait is the Actor image. |
| `refs` | ref[] | `[]` | Refs to linkable ids (below) also show as connections. |
| `codex.links` | string[] | `[]` | Ids of related records, shown as connections. |
| `codex.default_reveal` | object | all hidden | Starting reveals, used **only until the GM changes anything** for that NPC. |

`foundry` (the Actor projection) is unchanged: `document_type: "Actor"`, `data: {name, type: "npc", img, system, prototypeToken, items}`.

### Linkable ids

`LOC-` (Locations), `FAC-`, `FACTION-` and `RENOWN-` (Renown), `DEITY-` (Renown Pantheon deities, Manager 0.40.0+), `QUEST-`, `ORDER-` and `CONTRACT-` (Quests), and `NPC-` (other Codex entries). Anything else in `codex.links` is ignored (`scripts/validate-content.mjs` reports it). Links are by id only. The GM's Codex shows a link's name when the owning module is active and knows the id, through that module's public API; otherwise it shows the id. The Codex never stores or changes Locations, Renown or Quest state.

#### What a player sees of a link (Manager 0.40.1+)

With Connections revealed, a player gets a link's name only when that player can already see the record in the **owning module's own player view**:

| Kind | Known to the player when |
|---|---|
| `LOC-` | the player's Locations lists it as revealed (`api.listLocations()` on their client) |
| `QUEST-`, `ORDER-`, `CONTRACT-` | the player's Quest Log shows it (`api.listVisible()` on their client) |
| `FAC-`, `FACTION-`, `RENOWN-` | the player's Renown shows the faction with its name (`api.getFactions()` on their client; a discovered faction whose name is still hidden stays Unknown) |
| `NPC-` | that NPC is discovered in the Codex for the party or one of the player's characters |
| `DEITY-` | Renown says the party or one of the player's characters discovered it (see below) |

Everything else is sent as **Unknown**: no id, no name, no link. A link whose module is missing, hidden from players or failing is Unknown too.

How: the player's client reads its own Locations, Quest Log and Renown views and sends only those ids with the Codex request. The GM's client returns those links without a name and the player's client names them from its own views; NPC and deity links are checked on the GM side. A forged request can learn at most that an NPC links to an id the player already guessed, never a name. **Preview as player** cannot run another user's Locations, Quest Log or Renown view, so it shows those links as Unknown (and says so).

#### Deity links (`DEITY-`)

Use the deity's permanent Renown id, e.g. `"DEITY-EXAMPLE-LANTERN-MOTHER"`. Keep the id neutral; a player who has discovered the deity can see it.

- **Opens the Pantheon.** When **Ashen Gate | Renown** is active and has the deity, the link opens Renown's Pantheon on that deity (`api.open({deityId, actorId, tab: 'pantheon'})`; a player opens it as one of their characters who knows the deity).
- **Visibility follows Renown, not the Codex alone.** Even with Connections revealed, a player only sees a deity link if Renown says one of their characters (or the party) has discovered that deity (Renown's player-filtered `getPantheon`/`getDeities`). Otherwise the link shows as **Unknown**, unlinked, and the player's data carries neither the deity's id nor its name. The party-level view and preview show a deity only when every player character knows it.
- **Missing partner.** Renown not active, hidden from players, or the deity not in this world: the link is plain text with a tooltip (for players with Renown missing: **Unknown**). Never an error.

### `codex.default_reveal`

```json
{"discovery": "hidden", "fields": {"role": "party", "appearance": "party"}}
```

`discovery` and each field take `"hidden"` or `"party"`. Field keys: `role`, `appearance`, `signature_line`, `wants`, `knows`, `learned`, `links`. Per-character reveals are made in play, not in the record.

## Reveal model

Each rule is `{party: boolean, actors: string[]}`, the same shape Renown uses for faction field reveals. `actors` are world Actor ids of player characters.

- **Discovery** (`discovery`): whether a player knows the NPC at all (name and portrait). A player who has not discovered the NPC receives nothing about them.
- **Fields** (`fields.<key>`): each revealable field separately. A field shows to a player only if the NPC is discovered by them **and** the field's rule includes the party or one of their characters. A field revealed to one character is marked *only you* in that player's view.
- `learned` is text the GM writes in the Codex ("What the party has learned"). `links` reveals the connections list.
- GM-only fields and GM notes are never in a player's data.

### Stored state (`flags.ashen-gate-manager.codex`)

```json
{
  "version": 1,
  "discovery": {"party": true, "actors": []},
  "fields": {
    "role": {"party": true, "actors": []},
    "appearance": {"party": true, "actors": []},
    "signature_line": {"party": false, "actors": []},
    "wants": {"party": false, "actors": ["<actorId>"]},
    "knows": {"party": false, "actors": []},
    "learned": {"party": true, "actors": []},
    "links": {"party": false, "actors": []}
  },
  "learned": "She logs every crossing twice.",
  "links": ["QUEST-EXAMPLE-DOUBLE-LEDGER"],
  "notes": "GM-only notes added in play."
}
```

## Synthetic example record

```json
{
  "id": "NPC-EXAMPLE-MIRA-VANE",
  "entity_type": "NPC",
  "status": "draft",
  "version": "0.1.0",
  "provenance": {"sources": ["[EXAMPLE] synthetic record for the schema docs"]},
  "visibility": "gm",
  "scope": "setting_adapter",
  "refs": [{"relation": "found_at", "target_id": "LOC-EXAMPLE-FERRY-GATE", "mode": "optional"}],
  "name": "[EXAMPLE] Mira Vane",
  "role": "Ferry clerk at the gate",
  "appearance": "Ink-stained cuffs, a brass tally chain.",
  "portrayal": "Clipped, polite, counts things while talking.",
  "wants": "To get her brother off the night-ferry roster.",
  "knows": "Which barges skip the toll ledger.",
  "signature_line": "Toll's paid in coin or in names.",
  "session_role": "Gatekeeper for the first ferry scene.",
  "gm_notes": ["[EXAMPLE] Paid to look away; flips if the party helps her brother."],
  "stat_block": "Commoner (2024)",
  "art": {"repo_path": null, "forge_path": null},
  "codex": {
    "links": ["FAC-EXAMPLE-TOLL-WARDENS", "QUEST-EXAMPLE-DOUBLE-LEDGER", "DEITY-EXAMPLE-LANTERN-MOTHER"],
    "default_reveal": {"discovery": "hidden", "fields": {"role": "party", "appearance": "party"}}
  },
  "foundry": {
    "document_type": "Actor",
    "data": {"name": "[EXAMPLE] Mira Vane", "type": "npc", "img": "icons/svg/mystery-man.svg", "system": {}}
  }
}
```

## Export and restore

**Library → NPC Codex → Codex → Export codex** saves `AG_NPC_Codex_<date>.json`:

```json
{"schema_version": "ag-npc-codex-export/0.1", "exported_at": "…", "visibility": "gm",
 "definitions": [/* NPC records without the foundry block */],
 "reveals": {"NPC-EXAMPLE-MIRA-VANE": {/* stored state, as above */}}}
```

It is a GM file: it contains GM-only fields. **Restore reveals from a codex export** replaces the stored state of the listed NPCs that exist in this world and skips the rest. It never changes NPC content, which comes from the package import. Actor ids in `actors` are world-local, so a restore into a different world keeps party reveals but not per-character ones. The world export (Library → Export) leaves Codex state out.

## API (`game.modules.get('ashen-gate-manager').api.codex`)

| Function | Who | Returns |
|---|---|---|
| `list()`, `get(id)`, `characters()` | GM | Full GM entries; player characters available for reveals |
| `setReveal(id, key, {mode, actorId, on})` | GM | `key`: `discovery` or a field key; `mode`: `hidden`, `party`, or `actor` with `actorId` and `on` |
| `setDetails(id, {learned, notes, links})` | GM | `{state, rejected}` (`rejected`: link ids that are not linkable) |
| `previewAs(actorIds)` | GM | Exactly what a player owning those characters receives (`[]` = party only) |
| `exportAll()` | GM | The export file object |
| `forPlayer()` | anyone | The calling player's codex. A player's client asks the active GM over a Foundry query (V13+); the GM's client re-checks access and returns only that player's projection. A GM gets the party view. |
| `playerAccessEnabled()` | anyone | Whether players can open the codex |
| `openPlayerView()` | anyone | Opens the read-only player window |
| `mount(element)` | anyone | Renders the read-only player codex into `element`, for example a Character Hub tab. Returns an async refresh function. Display only, except that a discovered deity link opens Renown's Pantheon. |

GM functions throw for players. Errors are plain-language messages.
