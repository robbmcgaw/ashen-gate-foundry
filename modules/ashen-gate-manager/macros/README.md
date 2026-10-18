# Ashen Gate Manager macro library (experimental)

The Manager reads `macros/manifest.json` and loads the JS file declared in each entry. It does **not** scan directories automatically: adding a new file requires registering its metadata and source in the manifest. The Manager installs script macros as world Macro documents without executing them. Installed macros must be reviewed before anyone runs them.

Entry fields: `id` (stable unique identifier), `name`, `version`, `description`, `source` (module-relative path within `macros/`), `category` and `status`. Current entries are **legacy experimental** Profession Skill Tree macros and should not be used to implement current Profession advancement.

Existing managed macro flags use the same original registry IDs, so upgrades preserve their Foundry IDs and local code edit protections. No auto-discovery of arbitrary files or executable JSON is supported.

## Adding user macros

Use the Macros tab's **Load custom macro JSON** button to select an `ag-macro-registry/0.4` JSON containing entries with `id`, `name`, `version`, `description`, and `command` (JavaScript source text). See `macros/custom-registry-example.json`. Loading is preview only; selecting and installing never executes code. User-loaded registry entries exist only until the Manager window is closed. Installed macros persist in the Foundry world and carry source-ID/version and edited-code safeguards. Only import scripts you trust and review their source before executing.
