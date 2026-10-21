# Rewards and loot: build briefs

Design (final): `docs/rewards-and-loot-design.md` (branch `design/rewards-loot` until it is merged). Robb's decisions are in its §10.

Every brief is self-contained. Read `CLAUDE.md`, then the brief, then the design sections it names. Every PR also follows `docs/ui-standard.md` (final, branch `design/ui-standard`): shared UI kit 2.1.0 on `main`, and strict `scripts/ui-lint.mjs`.

## Order

```
S1 (shared helper; touches scripts/check.mjs)            ← first, alone
 ├─ Q1 → Q2 → Q3   Quest Log, in this order (same module)
 ├─ R1             Renown         ┐
 ├─ U1             Utilities      │ single-module,
 ├─ H1             Character Hub  │ run in parallel with each other
 ├─ L1             Locations      │ and with Q1–Q3
 └─ T1             Skill Trees    ┘
```

| # | Brief | Module | Kind | Bump | Waits for |
|---|---|---|---|---|---|
| S1 | [01-shared-item-drop.md](01-shared-item-drop.md) | Quest Log + `scripts/check.mjs` | **touches shared files** | patch | — |
| Q1 | [02-quest-rewards-list.md](02-quest-rewards-list.md) | Quest Log | single-module | minor | S1 |
| Q2 | [03-quest-grant-on-complete.md](03-quest-grant-on-complete.md) | Quest Log | single-module | minor | Q1 |
| Q3 | [04-quest-reward-import.md](04-quest-reward-import.md) | Quest Log | single-module | minor | Q1 (may follow Q2) |
| R1 | [05-renown-rewards.md](05-renown-rewards.md) | Renown | single-module | minor | S1 |
| U1 | [06-utilities-drops.md](06-utilities-drops.md) | Utilities | single-module | patch | S1 |
| H1 | [07-hub-journey-items.md](07-hub-journey-items.md) | Character Hub | single-module | minor | S1 |
| L1 | [08-locations-drops.md](08-locations-drops.md) | Locations | single-module | patch | S1 |
| T1 | [09-skill-trees-drop.md](09-skill-trees-drop.md) | Skill Trees | single-module | patch | S1 |

**Shared files.** `ag-item-drop.mjs` is byte-identical in every module that ships it, and `scripts/check.mjs` fails if the copies differ.
- S1 creates it.
- Every later PR **copies it unchanged** from Quest Log on `main`.
- If a later PR finds a bug in it or needs a new export, **stop and report**. The fix is a separate shared PR that updates every copy at once (like a kit release).

The other shared files are never edited by these PRs: `styles/ag-ui.css`, `ag-launchers.mjs`, `ag-dialogs.mjs`, `ag-html.mjs`.

**Parallel PRs and the lint baseline.** `scripts/ui-lint-baseline.json` is shared.
- Only touch it if your module's ratchet count changes. New code must not raise any count.
- On a conflict, take `main`'s version, run `node scripts/ui-lint.mjs --update-baseline`, and check that `git diff origin/main -- scripts/ui-lint-baseline.json` changes only your module's entry.
- Merge `main` into your branch last, just before merging.

**Shopping.** Utilities' shop editor (shopping brief 02, branch `design/shopping`) uses this helper with `{folders: true}` once S1 is on `main`. If shops and U1 run at the same time, whichever merges second takes the other's `ag-item-drop.mjs` copy unchanged.
