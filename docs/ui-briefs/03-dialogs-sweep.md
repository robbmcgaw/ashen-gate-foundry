# Build brief 3: Dialogs and words sweep

Self-contained brief for a build chat. Read `CLAUDE.md`, `docs/ui-standard.md` §3 ("Confirmations and dialogs") and §7 ("Copy and tone"), and `docs/ui-audit.md` §2 items 1–3 and 8 and §4 "Confirmations and dialogs", on branch `design/ui-standard`.

**Depends on brief 1**, which ships `ag-dialogs.mjs` and the `.ag-dialog` styles. Branch `ui/dialogs-sweep` from `main` once brief 1 has merged. If you build in parallel, branch from `ui/kit-2` and retarget later. Merge when green. It is independent of brief 2.

## Goal
Remove the most visible problems in one small, low-risk PR:
- Help that opens with Yes/No buttons.
- Yes/No confirmations.
- Dialogs that ignore the skin.
- Test or debug wording that players can see.

Behaviour, data and layouts don't change. **Not in scope:** Character Hub (brief 2) and Renown (its own pass). Their dialogs move there.

## Rules for every change
- **Shared helper.** Every confirm, prompt and help goes through the module's copy of `ag-dialogs.mjs`. Copy the file byte-identical from `ui/kit-2`. `check.mjs` enforces it.
- **Help** = `infoDialog(title, html)` with one **Close** button.
- **Confirm** = `confirmDialog(message, {title, yes, no: 'Cancel', danger})`:
  - The title is a sentence-case question.
  - The message names things, never ids.
  - `yes` repeats the verb ("Unbind Cinder", "Reset tree", "Undo award").
  - `danger: true` when something is removed, reset or undone.
  - A discard-changes prompt may use `no: 'Keep editing'`.
- **Custom DialogV2 windows** that must stay custom (Ledger consent, gathering roll, Hub attunement-style choices): add `classes: ['ag-app', 'ag-dialog', …]` and nothing else.
- **No other changes.** No copy changes beyond what is listed below, and no layout changes.

## Per module
Line references are from the audit at `b2cd06b`; `main` has moved, so re-locate each one with grep.

### General Manager
- **Help** (`scripts/main.js`, `case "help"`, about line 830): `infoDialog`.
- **Confirms** (24 `DialogV2.confirm` calls in `main.js`; 9 rely on the default Yes/No): all become `confirmDialog` with labelled buttons. Delete, archive, replace, hide-all and reset get `danger: true`.
- **Sentence-case titles:**
  - "FINAL DELETE CONFIRMATION" → "Delete managed content permanently?"
  - "REPLACE fields from source — confirm" → "Replace fields from the source?"
  - `${action.toUpperCase()} managed content` → "Archive managed content?" (and similar for each action)
  - "Hide All Player Interfaces — confirm" → "Hide all player windows?"
  - "Copy into staging Compendium (EXPERIMENTAL)" → "Copy into a staging compendium?"
- **Words GMs see:**
  - Remove "(provisional, pending Tim confirmation)" (`templates/manager.hbs` about line 86).
  - Rewrite "Other workstreams can support direct opening…" (about line 715) as one plain sentence about what the GM can do.
- **Error pills:** messages rendered inside `.ag-badge` (`main.js` about lines 1995 and 2035) become `.ag-notice--danger`.

### Skill Trees
- **Help** (`scripts/main.js` `_help`, about line 788): `infoDialog`.
- **Confirms:** the `confirm()` helper (about line 79) takes `{title, yes, danger}`. Labelled calls:
  - Reset tree → "Reset tree" (danger)
  - Remove node → "Remove node" (danger)
  - Refund → "Refund points" (danger)
  - Remove QA records → "Remove test records" (danger)
  - Clear legacy → "Back up and clear" (danger)
  - Unlock → "Unlock perk"
- **Words:**
  - Remove the "Alpha release" label (`templates/tree.hbs` about line 184).
  - Empty tree copy (about line 167): drop "add demo trees" (no such action). Use "No trees yet. Create one with New tree."

### Cinders
- **Help** (`scripts/main.mjs` `_help`): `infoDialog`.
- **Confirms** (helper about line 68):
  - Unbind → "Unbind Cinder" (danger)
  - Reset Strain settings → "Reset to defaults" (danger)
  - Import → "Import"
  - Move progress → "Move progress"
  - Push → `yes: 'Push'`, title "Push [power]?"
- **`DialogV2.input` forms:** switch to `formDialog`, keeping the same fields and labels (Save, Create, Bind, Transfer) so they pick up the skin.

### Profession Ledger
- **Confirms** (`scripts/main.js`):
  - Undo XP award → "Undo award" (danger)
  - Learn → "Learn [profession]"
  - Adjust XP → "Adjust XP"
  - Add profession features → "Add features"
  - Discard unsaved GM Setup → yes "Discard changes", no "Keep editing" (danger)
  - Import Ledger Catalog → "Import catalog"
  - Craft → "Craft"
- **Custom dialogs:** the material consent dialog (about line 663) and the gathering roll dialog (about line 1074) get `classes: ['agl-consent', 'ag-app', 'ag-dialog']`.

### Locations
- **Help** (`app.mjs` about line 1264, `travel-app.mjs` about line 159): `infoDialog`.
- **Confirms:** every `DialogV2.confirm` in `app.mjs`, `routes-ui.mjs` and `travel-app.mjs` becomes `confirmDialog`. The decline label is always "Cancel", except discard prompts ("Keep editing").
  - Delete location / Delete route / Clear party notes → danger.
  - "Show to every player?" → yes "Show to everyone".
  - Reveal location → yes "Reveal location".
  - Abort / End journey → yes "End journey".
- **Prompts** (Move to…, Share with…, Player Preview): add the dialog classes. Only use `formDialog` where it fits without behaviour change.

### Utilities
- **Footer** (`scripts/main.mjs` about line 229): remove "Foundry V14 · dnd5e 6.0.6 target · live acceptance pending". The footer then holds nothing, so remove it.
- **Header version:** "v… Alpha · GM/Player" becomes just the version.
- **Empty state** (about line 93): "Create two disposable character Actors…" → "Add at least two characters to start a check."

### Headquarters
- **Footer** (`js/main.mjs` about line 206): remove "Shared revision N · state revision N" for everyone. Keep "Auto-saved" and "Editor"/"View only".
- **Header and subtitle:** remove "(test default)" and "Alpha".
- **Help back button** (about line 208): "Back to builder" / "Back to manage" → "Back to [tab label]", using the visible tab names.
- **Wrong wording:**
  - "create rooms … in the Management tab" (about line 227) → "GM Setup tab".
  - Facilities hint "activated in GM Setup" (`facilities-tab.mjs` about line 60) → "Activation tab".
- **Departure confirm:** use the hireling's name, not the HIRE id.
- **Add confirms (danger):** Remove decoration → "Remove decoration"; Unassign hireling → "Unassign [name]".

### Quest Log
- **Delete confirm** (`scripts/main.mjs` about line 204): "Delete ${this.gmId}?" → "Delete [quest name]?", yes "Delete quest" (danger).
- **Unsaved-changes prompts:** yes "Discard changes", no "Keep editing".

## Versions
- **Patch bump** above the version brief 1 sets, for each module touched:
  - Manager, Skill Trees, Cinders, Ledger, Locations, Utilities, HQ, Quest Log.
  - With brief 1's numbers from 2026-10-21: 0.42.1, 0.18.1, 0.4.1, 0.23.1, 1.16.1, 0.14.1, 0.11.1, 0.9.1.
  - Recompute when building.
- **Update hard-coded versions** (Manager header, title, ready log).
- **CHANGELOG line:** "Confirmations name the action (no more Yes/No), Help opens with a Close button, dialogs follow the Ashen Gate look; test wording removed from player views."

## Acceptance checks
1. **`node scripts/check.mjs` green.**
   - In every touched module, the lint count of `DialogV2.confirm(` / `.prompt(` outside `ag-dialogs.mjs` is **0**. Update the baseline.
   - `ag-dialogs.mjs` copies are identical.
2. **Tests, per module:**
   - Help resolves through `infoDialog` (a mocked DialogV2 sees `ok.label === 'Close'` and `classes` including `ag-app`).
   - Each destructive confirm passes `danger: true` and a verb label; Cancel resolves false and makes no data change.
   - Use the mock pattern in `quest-manager/test/dialogs.test.mjs`.
3. **Grep proof** in the PR description: none of these strings remain in module code:
   - "acceptance pending", "(test default)", "pending Tim confirmation", "Alpha release", "Management tab", "add demo trees"
   - `yes: {label` with "Yes", and `title:` strings in capitals
4. **Chromium render** of `confirmDialog` and `infoDialog` markup (the DialogV2 shell stand-in from the style guide) in Standard, Stone Tablet and Tome Pages, Compact and Comfortable.

## Forge click steps for Robb (after merge)
1. Help: Manager, Skill Trees, Cinders, Locations. Each opens with one **Close** button.
2. Confirmations, Cancel left and red action right:
   - Skill Trees: Reset tree → "Reset tree".
   - Cinders → Manage: Unbind → "Unbind Cinder".
   - Ledger: undo an XP award → "Undo award".
   - Locations: delete a test location → "Delete location".
   - Press Cancel each time: nothing changes.
3. Switch to Stone Tablet: those dialogs look like stone, not plain Foundry.
4. As a player:
   - Utilities: no "acceptance pending" footer.
   - Headquarters: no revision numbers, no "(test default)".
   - Empty Personal Quarters text says "GM Setup tab".
5. HQ as GM: remove a decoration and unassign a hireling. Both ask first.

## Only Robb can verify
- DialogV2 button order and footer markup in V14.
- Keyboard: Enter triggers the action and Escape cancels.
- Dialogs opened from the Actors sidebar launchers.
