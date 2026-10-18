# Utilities v0.2.0 — Foundry/Forge acceptance checklist

**Complete executable tests:** [`tests/FOUNDRY_ACCEPTANCE_v0.2.0.csv`](../tests/FOUNDRY_ACCEPTANCE_v0.2.0.csv). 32 tests use the exact project-wide AG-FOUNDRY-DEV/1.7 column order:

**Test ID | Test Name | Module | Role | Test Steps | Expected Outcome | Pass/Fail | Test Notes**

All live results are **NOT RUN**. Do not count 57 passing Node tests as live acceptance. User controls the Foundry V14 GM/player test pass.

1. Set up the [real native Foundry test data](../fixtures/SETUP_AND_RESET.md), with at least one non-GM account and preferably two players.
2. Start with UTL-01–UTL-12: installation, player authorization, Group Check submission, early completion, archives and a second character selection.
3. Then test distinct Roll Requests, History, text RollTables, condition refresh, GM-only stash and responsive shell.
4. A second active GM is required for UTL-30; otherwise record BLOCKED, not PASS.
5. On failure copy the exact console error, tested Foundry+dnd5e/module versions, user role and screenshot in the same CSV row.
6. On completing the disposable-world pass, run the [explicit reset](../fixtures/SETUP_AND_RESET.md).

**Stop-ship security issues:** player access to private source/GM records, unauthorized Actor/Item changes, or duplicate accepted roll contributions. Do not use affected features in the live campaign.

**V14 runtime acceptance:** NOT RUN. Screenshots in `tests/` are local Chromium mock previews rendered from real UI HTML, **not** Foundry/Forge screenshots or evidence that native features work in-game.
