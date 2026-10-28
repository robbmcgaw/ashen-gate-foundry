## 0.37.6 — 2026-10-28

Complete activity needs the tool.

- An Artistry composition that needs a tool (its own tool, the profession's tool, or a list such as any musical instrument) can't be completed by a character who carries none of them. **Complete activity** is a disabled button with the reason next to it ("Needs Calligrapher’s Supplies"), and the Ledger refuses it everywhere (Individual, Party, character sheet tab, API `completeActivity`), including for the GM. "Has the tool" is the same test as the "doesn’t have this" badge: an owned tool Item or tool proficiency.
- Compositions with a workstation (rehearsal stage, studio, writing desk) are unchanged: the station is confirmed with the GM and the tool is only a check choice.
- Craft is unchanged (a missing tool still only warns).
- No saved data changes.

