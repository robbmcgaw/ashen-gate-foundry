# Current release candidate: **v0.12.0 General Manager Beta**

AG-WORK-0018 source-level feedback build. See `README-v0.12.0.md` for focused regression evidence, disposable test fixtures, setup/reset steps, and live Foundry acceptance limits.

# Current release: **v0.11.2 General Manager Beta**

See README-v0.11.2.md for the campaign-state scope validation fix and regression results. Live Foundry V14 acceptance remains pending.

---

# Previous release: v0.11.1 General Manager Beta

See README-v0.11.1.md for the reveal-policy correction and regression results. Live Foundry V14 acceptance remains pending.

---

# Current local test release: **v0.10.0 Appearance & Resolver Handoff Beta**

See [`README-v0.10.0.md`](README-v0.10.0.md) for DEC-0074/0075, appearance and source resolver handoff. The prior [`README-v0.8.0.md`](README-v0.8.0.md) documents DEC-0072, limitations, installation, and GM/player acceptance tests. The older v0.7.0 import guide remains valid for ZIP/JSON import features.

# Current release: v0.7.0 Actor & Document Import Beta

Read [`README-v0.7.0.md`](README-v0.7.0.md) and [`DELIVERY_STANDARD_v1.md`](DELIVERY_STANDARD_v1.md) first. Earlier alpha notes are preserved for provenance. The current release has NOT been tested in a real Foundry V14 world.

---

# Ashen Gate Manager v0.4.0 — contract-aware import alpha

**Read [`README-v0.4.md`](README-v0.4.md) first.** This build extends v0.3 while preserving the earlier feature documentation below. Tested locally with Node; not verified in Forge / Foundry V14.

---

# Ashen Gate Manager v0.3.0 — Wide Alpha (local-only test build)

**This is an installable Foundry V14 module and an experimental build, NOT a production-ready importer.** Its code has been statically checked and Node tests pass; it **has not run inside the user's Forge world or a live Foundry V14 client**. The active Ashen Gate GitHub source remains authoritative. No GitHub changes were made.

## Why this release covers several features at once

The manager now provides a common GM UI for import, iteration, tagging, template compilation, archiving, staging, macros, audits and export, so each feature can be tested one by one without shipping a new module for every tab. Integration is **not** proof of correctness. Test in a cloned world or after a verified world backup.

## Install / upgrade

Module ID remains `ashen-gate-manager`. Do not install v0.2 and v0.3 simultaneously. With Forge, use **Games Configuration → Summon Import Wizard** on the ZIP; restart the game server and enable the module in the world. For a local Foundry instance, place `ashen-gate-manager` in `Data/modules` and restart.

Open: **Configure Settings → Module Settings → Ashen Gate Manager → Open Import Manager**. Or (as GM):

```js
game.modules.get('ashen-gate-manager').api.open();
```

## Features and real limitations

| Interface | Included in this alpha | Boundaries |
|---|---|---|
| Import | File JSON, validate/preview, stable-ID matching, create world Items/Journals, safe field-wise updates and conflicts, dependency-aware sequencing | Only `ag-foundry-import/0.1` package format, not Tim's raw source JSON; no ZIP parsing; no Actor writes |
| Import profiles | Session-safe (approved only, default) and Development (drafts/examples enabled) | Presets aren't saved custom profiles and NEVER automatically import |
| Adopt & Export | Tag world Items for recovery, export tagged Items as unreviewed JSON | Not canonical approval; doesn't capture embedded Actor Items |
| Library | Browse managed world docs, export local modifications, archive/restore, eligible archived deletion, explicit source field replacement | Only manager-imported Items/Journals; no automatic Journal page reflow or Actor Item replacement |
| Templates | Package-local declarative Item/Journal defaults, `template_ref`, template version tracking, sample package download | Templates are read from JSON; no in-app template editor, no executable templates |
| Staging | Copy selected managed world Items into a world Compendium; skip source-ID matches | Copies aren't synced on future imports; not an isolated sandbox |
| Macros | Install/update two bundled experimental macros without running, protect locally modified macro code, export definitions | No automatic rewriting of purchased Skill Tree nodes or Actor progress; macros must be explicitly run |
| Audit | Managed permanent IDs, baselines and ref resolution | World docs only, not all compendium content or embedded Actor Items |
| History / snapshots | Compact history and downloaded JSON snapshots before source update, archive, replace or delete | **No automatic undo / transaction rollback**; snapshot is **not** a full world backup |
| Source sync | Export captured and managed data for ChatGPT/GitHub review | No direct GitHub pull, live update, or commit; still requires explicit review and authorization |

### Intentional safety boundaries

- **GM-only** tool. The built-in Macros can change world documents if later run; *installing* them never runs them.
- It never silently adopts unmanaged world content based on a matching name. Adoption tags are for **review/capture**, not automatic assertion of canonical identity.
- Permanent source IDs bind to documents via `flags.ashen-gate-manager.source.sourceId`; Foundry UUID is not treated as a permanent source ID.
- Conflicting managed field edits are blocked by the normal importer. **Replace from loaded JSON** intentionally overwrites source-managed Item fields, but only after explicit confirmation and snapshot download.
- Archive moves managed documents to Archive folders and sets the `lifecycle.archived` flag; it doesn't remove Actors' existing items or change permission state. Archived docs are excluded from automatic updates.
- Delete requires **archive first**, no known managed ref dependents, no matching Actor Item source flags, **two confirmations** and a downloaded document snapshot. That cannot detect every possible external reference or derived Actor copy. Make a real Foundry world backup.
- Snapshots may contain GM-only/copyright-protected data. Don't upload them publicly without review.
- Source rulebook data and template contract are still under development. The importer is a Foundry adapter, not the definition of Profession XP, Perks or Cinders.
- A Source `refs` array may use the current typed project shape `{ "relation": "uses", "target_id": "MAT-IRON", "mode": "hard_requirement" }`; legacy refs from v0.2 are also supported. Only hard requirements must resolve for import.
- **No automatic Skill Tree Journal regeneration**; the bundled experimental generator is older playtest code (50 XP curve, placeholder rewards) and skips same-name Journals. Existing module progress migration is not implemented.

## Practical feature-by-feature smoke test (on a clone/backup)

1. **Launch & preview:** Open manager, select **Import**, click Load Example. Default Session-safe profile excludes example records. Toggle **Development** and verify CREATE actions appear. No world changes before Apply.
2. **Create & idempotence:** Select eligible and Apply. Run the preview again; objects should appear UNCHANGED. Two world Items and one world Journal should exist. Confirm your Actor inventories are untouched.
3. **Source update:** Load `samples/demo-package-update.json` from the installed ZIP and preview. Apply to a disposable test world Item. Confirm its Foundry `_id` stays the same; pre-change JSON snapshot should download.
4. **Adopt:** Tag an existing unmanaged world Item in Adopt & Export; verify only manager `capture` flags changed. Export all tagged Items as unreviewed JSON.
5. **Template:** Open Templates, download example JSON, load it on Import, preview after choosing Development. Confirm per-record text overrides default values; ensure template name/version appear in the imported source flags.
6. **Local conflict:** Manually edit an imported Item description and load a different updated source value. Preview should show CONFLICT; neither source nor local copy silently wins.
7. **Replace:** Library → select a managed Item also present in the currently loaded package; Replace from loaded JSON. Confirm both prompt and snapshot download. Unmanaged fields remain untouched; manually modified *managed* fields may be overwritten.
8. **Archive / restore:** Library → select a disposable imported Item → Archive. Check that it moved to an Archive folder and is excluded from reimport. Restore it and check its previous folder is restored.
9. **Compendium copy:** Library → select disposable managed Items → Copy to staging compendium. Inspect the created `world.ashen-gate-staging-items` pack; re-copy should skip duplicates. This is not live synchronization.
10. **Macros:** Macros → select and install. Verify two new Macro documents appear without executing. Change a macro's code manually; updating should report CONFLICT and not overwrite the change. Export managed macros for a local backup.
11. **Delete (last):** Archive an expendable manager-imported Item, then Delete Archived. Verify two confirmations and snapshot download. Do not use on live game content; deleting a world Item does NOT remove existing embedded copies from Actors, but may break other external references.
12. **Audit/history:** Scan for duplicate IDs and unresolved references, inspect operation history, and export anything you want to review back in chat.

## Package input shape

```json
{
  "manifest": {
    "schema_version": "ag-foundry-import/0.1",
    "package_id": "EXAMPLE-IMPORT",
    "version": "0.1.0"
  },
  "templates": [
    {
      "id":"generic-material",
      "version":"0.1.0",
      "document_type":"Item",
      "defaults":{"type":"loot","system":{"description":{"value":"<p>Template default</p>"}}}
    }
  ],
  "records": [
    {
      "id":"MAT-EXAMPLE",
      "entity_type":"Material",
      "status":"example_only",
      "version":"0.1.0",
      "provenance":{"source":"demonstration only"},
      "visibility":"gm",
      "refs":[],
      "template_ref":"generic-material",
      "foundry":{"document_type":"Item","data":{"name":"Example Material"}}
    }
  ]
}
```

`template_ref` is optional; old v0.1/v0.2 packages still work. Template defaults are resolved before source validation and import. Recipe/crafting mechanics remain in the canonical source definitions, not determined by this tool.

## Development and testing

All source code and sample macros are included; Node.js 18+ for static/pure tests:

```sh
npm test
node --check scripts/main.js
node --check scripts/core.js
node --check scripts/capture.js
node --check scripts/workflows.js
```

No Foundry-hosted execution or manual UI acceptance has been performed in this build. The Foundry API and HTML rendering must still be validated in your world. Audit logs are not claims of successful live tests.

## Known missing production functionality

A genuine three-way **field-by-field merge UI**, schema migration for Item subtype/removed fields, Actor inventory or Active Effect safe updating, incremental Journal page/Skill Tree graph migrations, automatic rollback, compendium-source reimport/update, ZIP ingestion, custom named profiles, a native template editor, player-facing catalog, and remote GitHub update checks are not complete in v0.3. This is the shared UI and functional groundwork; these must pass runtime testing before becoming safe production tools.

## Repository

This archive is a **local prototype**. No GitHub commit, deployment or sync was requested or performed.

## World export (0.18.0)

Library tab → **Export Ashen Gate data**. GM only (rejected in the handler, not just hidden). Buttons: **Export everything**, **Export changed since last export**, **Copy summary** (counts per module plus new/changed/removed ids, to paste elsewhere; it does not save a file or move the snapshot).

File: `AG_World_Export_<YYYY-MM-DD>.json` (`_changed` is added for a changed-only file). Keys and records are sorted so diffs stay clean.

```
header   { schema: "ag-world-export/0.1", date, mode: "everything"|"changed", note?,
           world: {id, title}, versions: {foundry, dnd5e, modules: {<module id>: version|null}} }
summary  { <section>: {total, new, changed, removed, status?} }   // section = world, locations, quests, factions, skill_trees, headquarters, profession_ledger
world    [ {id, kind, type, name, folder_path, access: "visible"|"gm", visibility, flags, system, hash, uuid} ]
modules  { <section>: {module_id, version, status: "ok"|"not available"|"no definitions to export", reason?, records: [{id, name, data, hash}]} }
removed  [ {id, name, section} ]   // ids in the last snapshot that are gone now (when anything was removed or in changed mode)
```

- `world` holds every Item, Journal, Actor, Roll Table and Macro whose Manager source flag carries a permanent `sourceId` (`PROF-`, `MAT-`, `REC-`, `ITEM-`, `PERK-`, …), plus the Folders Manager made for them. `id` is the permanent id (folders: `<type>:<path>`). `uuid` is a local hint only, never an id. `access` is `visible` when players can observe the document by default, else `gm`. `flags` is Manager's flag namespace (source, lifecycle, capture). `system` is omitted for `character` and `group` Actors (`system_omitted` says why).
- `modules` records come from the other modules' public GM-only APIs, feature-detected: Locations `listLocations`, Quest Log `listQuests` + `getGMSource` (definition only, no status), Factions `getFactions`, Skill Trees `listTrees`, Headquarters `exportState().catalog` (facility definitions only). Profession Ledger has no definitions of its own; its professions, recipes and perks are the tagged `world` Items. Play state keys (exhausted/available nodes, loot status, locks, scene bindings, progress, stash, party notes) are stripped.
- `hash` is a short non-cryptographic content hash for change detection. In `changed` mode the file lists new and changed records only. The snapshot (world setting `worldExportSnapshot`, GM only) is updated after the file save call returns; the browser cannot confirm the file reached disk, so if you cancel the download, run **Export everything** again.
