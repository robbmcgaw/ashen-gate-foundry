# Player Access v1 — DEC-0072 release checks (not yet live-run)

- [ ] PA-01: Existing player launcher remains enabled by default on upgrade.
- [ ] PA-02: While two player clients are connected, GM hides interface; launcher removed and pre-opened window closed.
- [ ] PA-03: Saved macro, direct API.open, settings menu, or `new Application().render()` cannot open it while Hidden.
- [ ] PA-04: Show again; authorized player can open from Actors and original permissions remain.
- [ ] PA-08/09: Manager disabled, world reload, reconnect and second player sync preserve the gate.
- [ ] PA-10: Non-GM `api.playerAccess.setEnabled(true)` rejected.
- [ ] PA-12: GM-only Setup and source-restricted content remain protected when Visible.
- [ ] PA-13/14: Import content while hidden; no XP, known recipe, node unlock or Item progress reset/duplicate.
- [ ] GM and player console traces, main/edit view screenshots, responsive layout and button click-through recorded as ACTUAL Foundry observations only.

---

# Profession Ledger v0.4.0 — Foundry V14 Beta Checklist

**Use backup/test world and disposable Actor Items.** This is an alpha source+offline-tested ZIP; do **not** assume Forge/dnd5e writes are validated.

1. Update the existing `ashen-gate-profession-ledger` module through Forge. Confirm `module.json.version` and header show **0.4.0**. Verify `Actors → Profession Ledger` opens for GM and player. Keep Manager/Skill Trees optional (they may be disabled without crashing Ledger).
2. Verify **existing** Party Roster and Ledger Recipe Library survive unchanged from v0.3. Test GM Setup controls, save/cancel roster warning and Developer Tools isolation. Do not import a synthetic catalog into live world.
3. In a disposable Actor, copy a Manager-tagged `PROF-*` Item. GM → Individual → award **5 XP**. Confirm Actor flag is `professionProgress` and level becomes 2; Skill Trees flag remains unchanged. Check pending perk choice counter (level 2 = 2 available if no perks selected). Test invalid input and non-GM cannot award XP.
4. Copy **one real tagged `REC-*` Recipe Item (quantity 2)** to a disposable owned Actor. Player → Recipe Learning → Learn. Confirm quantity becomes 1 and `knownRecipes` has exactly one `REC-*`; duplicate learning is disabled. Separately test a quantity-1 Item is deleted after learning. Test a player cannot learn from another Actor or GM-only Item. Learning an above-tier recipe is permitted.
5. Verify Crafting Planner shows indexed Recipes but does **not** allow sending requests for an unlearned Recipe. After learning, the selected Actor can request, provided material requirements and recorded tier are met; requests do not consume inventory.
6. GM → Gathering: choose active Actor, mark eligible gathering Professions, manually set DC/tier, select a Manager-imported **player-visible `MAT-*` world Item**, ask player for a sheet check, type the reported total, preview, then confirm a success reward. The Actor receives exactly one new Item stack with the chosen quantity/source ID. Confirm no XP is auto-awarded; use Individual action separately if appropriate.
7. Check failed rolls, missing `MAT-*`, secret/retired materials, invalid DC/quantity, ineligible known tier, duplicate Confirm clicks, and changed world/Actor state between preview and confirmation. GM-only award controls must be unavailable to player.
8. Player → Gathering → Request gathering sends a GM-only whisper. GM prompt reaches selected Actor's owner and GM. Check chat respects visibility. No player receives undisclosed possible rewards or GM settings.
9. Observe the GM reward reveal animation (cosmetic only), and enable OS reduced-motion preference to confirm immediate reveal. Resize window, test tabs, focus, long names and error states. Screenshot main/player and GM setup view for Archie standards comparison.
10. Report **exact Foundry+dnd5e version**, module build, screenshot, console errors and pass/fail. Distinguish user-reported playtest from automated tests. Do not test repeated Manager reimports until first clean import works as Tim/Borris intend.
