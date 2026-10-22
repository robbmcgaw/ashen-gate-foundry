# UI audit decisions (2026-10-22)

Taken by the Studio session while Robb was away, under his standing instruction to make logical decisions without him, not over-engineer, and follow the style guide. They answer the open questions in `ui-audit-2026-10.md` and override a module brief wherever the two differ. Robb can change any of them.

## Decisions
- **CH-01 Hub navigation:** keep the icon rail (it suits Compact and the pop-out). Add visible text labels when the window is wide enough; always keep aria-labels and tooltips. No move to labelled tabs.
- **CH-06:** the Hub keeps its built-in light/dark and density choice when Manager is absent (shipped in Hub 0.31.0).
- **CH-05:** keep the name "Compact".
- **HQ-02:** move Create Missing Player Rooms and Set Rank out of GM Setup into a management tab. GM Setup is settings only.
- **Second importers (PL-05 Ledger, HQ-07 Headquarters, QL-13 Quest Log):** keep them, demoted to a secondary place labelled "Advanced: import here, or use General Manager". General Manager is the documented primary path. No removal.
- **UT-07:** the stash toggle becomes a read-only status badge that links to GM Setup. Revoke stays as an action with a confirmation.
- **FR-08:** use "Faction" everywhere, not "Organization".
- **QL-08:** one name, "Quest Log" (module title, tab, launcher, docs). Keep the module id.
- **Drag and drop (UT-31, HQ-01, ST-17):** add small, consistent keyboard alternatives (an "Add to..." or "Move to..." menu).
- **FR-09:** replace Renown's seed names in this public repo with synthetic [TEST]-style names.
- **Labels:** sentence case for new and changed labels. Keep "Save Changes" as is.
- **CH-15:** remove the duplicate saving throws in the Hub; keep the one in the ability box.

## Scope control for every cleanup chat
Do every P1 and every P2 sized S or M that fits the module brief. Skip P3 unless trivial. No redesign beyond the brief.

## Order
1. Standalone patches now: PL-01 (Ledger) and ST-02 (Skill Trees).
2. Kit 2.2 in one PR across all modules.
3. One cleanup chat per module: Renown, Locations, General Manager, Utilities, Profession Ledger, Headquarters, Skill Trees, Quest Log, Cinders, Character Hub. Parallel across modules once Kit 2.2 is merged; never two chats in the same module at once.
