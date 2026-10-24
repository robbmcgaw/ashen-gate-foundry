# Ashen Gate UI/UX guidelines

The shared rules for every Ashen Gate window. CLAUDE.md's "UI conventions (shared shell)" is the short version; this page is
the long one, with the reasons. The per-module findings that apply it are in [ui-audit-2026-10.md](ui-audit-2026-10.md).

Every rule names its source. Source keys resolve in the [Sources](#sources) list at the end. **Ours** marks a house decision
where the sources disagree or say nothing. Rules marked *(kit 2.2)* need a shared-kit addition that doesn't exist yet (see
[Kit gaps](#15-kit-gaps-proposed-kit-22)).

Scope: Foundry VTT V14 ApplicationV2 windows, DialogV2 dialogs, sidebar launchers, embeds in Character Hub, and chat cards,
in every skin (Standard, the colour skins, High Contrast, Daylight, and the shaped skins: Stone Tablet, Tome Pages,
Ledger Book, Field Journal, Frontier Map) and at both sizes (Compact, Comfortable).

---

## 1. Window anatomy

```
┌───────────────────────────────────────────────────────────────┐
│ Ashen Gate | <Module>                         v0.x.y   Help   │  header (.ag-header)
│ [Tab] [Tab] [Tab] [Tab]                     [GM Setup GM]     │  tabs (.ag-tabs), GM tabs last
├───────────────────────────────────────────────────────────────┤
│ [search……………] [Filters (2)] [Group ▾]  12 of 40   [+ New x] │  toolbar (.ag-toolbar), one row
│ ┌──────────────┬────────────────────────────────────────────┐ │
│ │ list / rail  │ detail (sub-tabs if long)                   │ │  .ag-split, one scrolling pane each
│ │ grouped rows │                                             │ │
│ └──────────────┴────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────────────┤
│ Cancel                  Unsaved changes          Save Changes │  footer (.ag-footer), pinned
└───────────────────────────────────────────────────────────────┘
```

1. **Header**: `Ashen Gate | <Module>` on the left. Version and Help on the right, in that order and always last. (CLAUDE.md)
   **Exception, Character Hub only** (0.37.0, Robb's request): the in-sheet header shows the character's name (with a
   "Level n" badge and the species · class · background line under it); the brand lives in the window title
   ("Ashen Gate | Character Hub — <name>", 0.37.1). Version and Help stay on the right. ui-lint allows this for the Hub's
   `agch-head__name` heading only; every other module keeps the brand in its header.
2. **Exception, Character Hub only** (0.46.0, Robb's decision): the Hub's header carries a group of icon buttons —
   Compact / Full, Appearance, Pop out / Pop in and Level up — beside the "⋯" menu. Reason: they are the Hub's everyday
   window and character actions, and burying them in "⋯" made them hard to find; the "⋯" menu keeps only Configure…, NPC
   Codex and Open native sheet (plus the GM's Restore backup…). The icon buttons need `aria-label` + `data-tooltip`, keep
   their disabled reasons, and the group wraps rather than clips in a narrow window. Every other module keeps the rule below.
   Put at most **one** other window-level control in the header (for example a view switch). Anything else goes in the
   toolbar of the tab it affects, or in a single "⋯" menu next to Help. Tool bars that carry everything become a wall of
   equal-weight buttons. [Apple Toolbars] [WCAG 3.2.3]
3. **No subtitle** line in the header. Module descriptions belong in Help or the first-use empty state. **Ours**
4. **Tabs** sit directly below the header. **Toolbar** at the top of the content: search first, filters, count, create action
   at the right end. (CLAUDE.md) [Carbon Data table] [Primer Data table]
5. **One scrolling pane** per column (`.ag-window > .ag-scroll`, `.ag-split__list`, `.ag-split__detail`). The header, tabs,
   toolbar and footer don't scroll away. [Primer Dialog]
6. **Footer** (`.ag-footer`) is pinned to the bottom of the window or of the editor pane. Cancel is bottom-left, the single
   primary action is bottom-right, and the status ("Unsaved changes", "Saved") is in the middle (`.ag-footer__status`).
   (CLAUDE.md) [Apple Alerts] [GNOME Dialogs] [Carbon Dialogs] — Windows dialogs use the opposite order; we don't.
7. **One primary button per view**. A second "primary" (for example a sidebar create button) is secondary.
   [Apple Toolbars] [Carbon Dialogs] [Primer Saving]
8. Default window size fits a 1366×768 laptop with Foundry's sidebar open: aim for at most about **1000×760** unless the window
   is a canvas (Skill Trees board, Headquarters builder). Use `windowSize()` so Comfortable scales it. **Ours**

## 2. Navigation: tabs, sub-tabs, rails

1. **Top-level tabs: 6 at most** per role. More than that means two tabs belong together (make them sub-tabs) or the module
   needs a labelled side list. [Apple Tab views] [MS NavigationView] [Carbon Tabs]
2. **Tab labels**: one or two words, nouns, with visible text. An icon may lead the text but never replaces it. Icon-only
   navigation hides the labels in tooltips that keyboard and touch users can't read. [Apple Tab views] [Carbon Tabs]
   [NNg Tooltips]
3. **GM-only tabs** go last and carry `.ag-tab--gm`. GM Setup is always the last tab. (CLAUDE.md)
4. **Same tabs, same order, same names** for a given role every time the window opens. Don't add or remove a tab mid-session
   because game state changed: show the tab with an empty state instead. If a tab would only ever be empty for a role (for
   example "the GM runs this"), leave it out for that role. [WCAG 3.2.3]
5. **One level of sub-tabs**, at most. Sub-tabs use `.ag-tabs.ag-tabs--sub` *(kit 2.2)*, which look different from the top
   row, and sit at the top of the pane they switch. Never three levels. [Material 3 secondary tabs] [Carbon Disclosures]
6. **Navigation uses tabs, values use segmented controls.** `.ag-tabs` (`role="tab"`) switches what you're looking at;
   `.ag-segmented` (`role="radio"`) picks a value (Buy/Sell, Party/Character). Don't use a segmented control as navigation.
   [Carbon Tabs] [Primer Navigation]
7. Tabs are one Tab stop: Left/Right move between them, Home/End jump to the ends, `aria-controls` points at the panel
   (`bindTablist()` *(kit 2.2)*). [W3C APG Tabs]
8. **Don't use tabs** when the user needs to compare content across them, or for a step-by-step flow. [Carbon Tabs]
9. **Side rails** (`.ag-siderail`) are for a list of many peers (records, rooms). A rail of section icons needs visible
   labels. (Character Hub's icon rail is a pending decision: see the audit.) [NNg Vertical nav] [MS NavigationView]
10. **One name per thing** everywhere: the launcher, window title, header, tabs, Help and partner embeds use the same word.
    [WCAG 3.2.4] [Apple Writing]

## 3. Choosing a container

| Content | Use | Not |
|---|---|---|
| A few large, separate areas of one window | Top-level tabs | A long page with headings |
| A long editor (more than about two screens of fields) | Sub-tabs inside the editor, sharing one footer | One scrolling form |
| Many short, optional sections, of which you usually need one or two | Collapsible `<details class="ag-fold">` *(kit 2.2)* | Tabs |
| Records you scan, sort and compare (names, numbers, states) | `.ag-rows` (or `.ag-table` when the columns matter) | Cards |
| Visually different items, picked by eye (art, tiles, deities, wares) | `.ag-card` in `.ag-card-grid` | Tables |
| A list you pick from, with a detail for the picked one | `.ag-split` (list left, detail right) | Detail rendered below the full list |
| Advanced or rarely used options | A labelled disclosure ("Advanced options", "Filters (n)") | Hiding required or frequent controls |

Rules behind the table:

1. Show what most people use at the top level and put the rest behind a **labelled** disclosure. Never hide required input or
   information needed to finish the task. [Apple Disclosure] [NNg Progressive disclosure] [Carbon Disclosures]
2. **No disclosure inside a disclosure.** If you need that, you need sub-tabs. [Carbon Disclosures]
3. **The editor never renders below the whole list.** Open it beside the list (`.ag-split`), or in place of the list with a
   "← All <things>" back button. Scrolling past the list to reach the thing you just clicked is the most common crowding
   problem in the suite. **Ours** [Primer Navigation]
4. Collapsible sections remember their open/closed state per user. Start optional sections closed on first use; keep the
   main section open. **Ours**
5. Cards are for display, not for forms: one card per record, its actions in `.ag-card__actions` at the bottom-right.
   [Apple Lists and tables]

## 4. Density and spacing

The kit has two size sets with the same token names. Compact is the default; General Manager → My Appearance → Size switches a
device to Comfortable.

| Token | Compact | Comfortable | Use |
|---|---|---|---|
| `--ag-space-1` | 3px | 4px | inside chips, between icon and text |
| `--ag-space-2` | 6px | 8px | between controls in a row |
| `--ag-space-3` | 8px | 12px | between rows, card padding (compact card) |
| `--ag-space-4` | 12px | 16px | pane padding, between sections |
| `--ag-space-5` | 16px | 24px | between major groups |
| `--ag-space-6` | 24px | 32px | empty-state padding |
| `--ag-control-h` | 28px | 36px | buttons, inputs, selects |
| `--ag-control-h-sm` | 24px | 30px | row actions, chips |
| `--ag-row-h` | 32px | 44px | minimum record row |
| `--ag-text-xs/sm/md/lg/xl` | 11 / 11.5 / 13 / 14 / 17px | 11 / 12.5 / 14 / 17 / 21px | |

1. **Tokens only.** No raw px for spacing, sizes or font sizes in module CSS (`scripts/ui-lint.mjs` enforces most of this).
   [Fluent Layout] [Carbon Spacing]
2. **Density is a mode, not a tweak.** Don't shrink one panel to fit more in; split it instead. Don't mix densities in one
   view: toolbar, header row and body rows use the same set. [Carbon Data table] [SAP Cozy/compact] [Cloudscape Density]
3. **Targets are at least 24×24 CSS px** in Compact, or spaced so they don't overlap. `--ag-control-h-sm` (24px) is the
   floor; don't go below it for anything clickable. [WCAG 2.5.8]
4. Spacing between controls matters as much as their size: a row of more than about six controls is a sign to group or fold.
   [Apple Accessibility] **Ours**

## 5. Toolbars, lists, search, filter, group, sort

1. **Toolbar row 1**: search · up to two quick filters (chips or selects) · **Filters (n)** · Group/Sort · count · create
   action at the right end. One row at the default window width. [Carbon Filtering] [Primer Data table]
2. Everything else (more filters, "show hidden too" switches) goes in a second row that opens from **Filters (n)**, where *n*
   counts the active ones, next to **Clear filters**. [Carbon Filtering]
3. Filters apply instantly when there are few of them; a long or slow filter set gets an Apply button. [Carbon Filtering]
4. Show a toolbar only where it works. Don't show filters on a view they don't affect. **Ours**
5. **Group long lists** by a useful category (status, type, region, settlement), with collapsible group headers and counts.
   Sort within groups. (CLAUDE.md) [Apple Lists and tables]
6. Sort by a select or by clicking a column header; clicking again reverses. [Apple Lists and tables] [Primer Data table]
7. **Long lists**: render every grouped row and rely on search, filter and group. Paginate only for very large sets (hundreds
   of records), never infinite-scroll. [Primer Data table] [NNg Infinite scrolling]
8. **Sticky** headers and toolbars: one row at most, and never covering the focused row. [WCAG 2.4.11]
9. **Row actions**: at most two visible buttons per row, the rest in a "⋯" menu. Bulk actions appear in a full-width bar
   under the toolbar once rows are ticked, not inside a narrow list column. [Primer Data table] [Carbon Data table]
10. **Never clip or truncate actionable text** (button labels, links, option names). Data text may wrap; if it must be cut,
    the full value is one click or focus away. (CLAUDE.md) [Apple Lists and tables] [Primer Data table]
11. The create action is in the toolbar at the right end, labelled "New <thing>", and is the only create button on the
    screen. (CLAUDE.md)

## 6. Forms and settings

**GM Setup**

1. GM Setup holds **settings only**: values the GM sets once and changes rarely, saved with **Save Changes**. (CLAUDE.md)
   [Apple Settings]
2. Not in GM Setup: content authoring, one-off actions (create rooms, set a rank, fill in ids, migrate data), imports of
   content, and per-user preferences. Those go in their content tab, in a GM-only **Maintenance** or **Checks** sub-tab, or in
   **Developer Tools** (`.ag-devtools`, GM-only, last in GM Setup) for demo and debug tools. (CLAUDE.md) **Ours**
3. All of a module's GM settings live in GM Setup. Don't send the GM to Foundry's Configure Settings for one of them.
   (CLAUDE.md)
4. A long GM Setup (more than about two screens) gets sub-tabs, all under the one footer. [Apple Settings]

**Every form**

5. **One Save per form**, in the pinned footer, labelled with a verb ("Save Changes", "Create quest"). Don't disable or hide
   Save to signal "nothing changed" or "invalid": let it run and say what's wrong. [Primer Saving] [Primer Forms]
6. Show **"Unsaved changes"** in the footer status as soon as the form is dirty. [Polaris Save bar] [Primer Saving]
7. **Never lose typed edits.** Before anything throws away a dirty form (tab switch, selecting another record, closing the
   window, or a button elsewhere that re-renders), ask: "Discard unsaved changes?" with **Discard changes** / **Keep
   editing** (`guardDirty()` *(kit 2.2)*). [Primer Saving]
8. **Don't mix instant and draft saving in one form.** Controls that apply at once (reveal, publish, toggles, sliders, add or
   remove rows) live outside the draft form, in their own card or sub-tab, with an **Applies now** badge in its head. Toggles
   may apply instantly; text inputs and selects wait for Save. [Primer Saving]
9. An action that needs the saved record (Place on scene, Start journey) asks first when the form is dirty: **Save and
   <action>** / **Keep editing**. It never saves half-finished edits silently. **Ours**
10. **Labels above inputs**. Side-by-side only for checkbox/toggle rows and compact settings rows. Every input has a visible
    label; placeholders are examples, never labels. [Carbon Forms] [Primer Forms]
11. **Help text** under the field, one line, always visible for need-to-know information. Longer explanations go in Help or a
    "How this works" disclosure. [Carbon Forms] [Apple Writing]
12. **Validation**: never on focus or on the first keystroke. Check when the field loses focus after an edit, re-check live
    while it's in error, and on Save move focus to the first error. Mark it `aria-invalid` and link the message with
    `aria-describedby`; put the message next to the field, not in a notification. [Carbon Forms] [Primer Forms] [Baymard]
    [WCAG 3.3.3]
13. **Cancel** discards the drafts and stays on the same tab. **Ours** (Ledger and Headquarters currently disagree.)
14. **Reset to defaults** is labelled with what it resets ("Reset rules to defaults…") and confirmed. [Apple Offering help]
    [Primer Saving]
15. Don't ask for anything you can detect, and don't make the user enter the same thing twice. [Apple Settings] [WCAG 3.3.7]

## 7. Confirmations and destructive actions

1. **Confirm** what can't be undone or affects other people: delete, reset, overwrite, revoke, close a store for every
   player, remove items from characters. **Don't confirm** common, reversible actions; offer Undo instead (the suite already
   has Undo for XP, history and quick-bar clears). Overused confirmations get clicked through. [Apple Alerts] [NNg
   Confirmation dialogs] [Primer Saving]
2. Use the kit helpers (`confirmDialog`, `choiceDialog`), never a raw DialogV2. (ui-lint)
3. **Title** names the action and the object as a question: "Delete [TEST] Location A?". **Button** names the verb: "Delete
   location". Never "OK", "Yes", "Confirm". The other button is exactly **Cancel**. [Apple Alerts] [MS Dialogs] [Carbon Dialogs]
4. **Body**: one sentence on the consequence ("Players lose access to its notes."). Name the side effects, for example other
   lists that also show the store. Don't explain the buttons. [Apple Alerts] [Carbon Dialogs]
5. `danger: true` for removals and resets, so the button is red; the label still carries the meaning. [WCAG 1.4.1]
6. **The destructive button is never the default.** In a danger dialog, Enter and initial focus go to Cancel: use
   `confirmDanger()` (kit 2.2). `confirmDialog(…, {danger: true})` still makes the action the default, so each cleanup
   moves its removals to `confirmDanger`. [Apple Buttons] [W3C APG Dialog] [GNOME Dialogs]
7. Esc cancels. Don't open a confirmation from inside another modal; finish one before the next. [W3C APG Dialog]
   [Carbon Dialogs]
8. A form that collects input and then asks "Are you sure?" asks once: put the consequence in the form's button ("Award 3
   points"). **Ours** [Carbon Dialogs]

## 8. Empty, loading and error states

1. **Empty state** (`.ag-empty` with `__title` and `__text`): an icon, one line of what's missing, one line of what to do,
   and at most one low-emphasis action. Three kinds: first use ("No locations yet. Create one or import a file."), no results
   ("Nothing matches these filters." + Clear filters), and not available ("Turn on X in GM Setup"). [Primer Empty states]
   [Carbon Empty states]
2. Use `.ag-empty` for a **whole pane** only. Inside a card, a hint line (`.ag-field__hint`) is enough. **Ours**
3. **Loading**: show nothing for under 1 second; a spinner in the button or a skeleton of the list for 1–3 seconds; a
   determinate progress bar from 3 seconds (imports, organize runs). Long jobs don't block the window. [Primer Loading]
   [NNg Response times] [Carbon Loading]
4. Skeletons for lists and panes of known shape only; never skeleton a dialog or a menu. [Carbon Loading] [NNg Skeleton
   screens]
5. Show progress in the control that started it ("Importing… 40%") and announce results without moving focus
   (`role="status"`, `aria-live="polite"`). Reserve `role="alert"` for errors, and don't re-create alerts on every render.
   [Apple Buttons] [WCAG 4.1.3]
6. **Errors** go next to their cause, in plain words: what happened and how to fix it. No blame, no raw codes, no "Error" as
   a title. Keep the user's input and offer Retry. Don't use a modal for field errors. [Apple Writing] [MS Dialogs]
   [Primer Saving] [WCAG 3.3.3]
7. When a partner module is missing, say so with an `.ag-notice--info` and carry on; never fail to open. (CLAUDE.md)

## 9. Keyboard and accessibility

1. **Everything clickable is a real control**: `<button type="button">` for actions, `<a href>` for links. No `data-action`
   on a `div`, `span`, `li` or on an `<a>` without `href`. These can't take focus, so keyboard users can't use them.
   [WCAG 2.1.1] [WCAG 2.4.3]
2. **File pickers**: a real button that opens a visually hidden (not `display:none`) input (`fileButton()` *(kit 2.2)*).
   **Ours**
3. **Icon-only buttons** have `aria-label` and `data-tooltip` (not `title`; ui-lint enforces this). A visible text label is
   the accessible name: don't override it with a longer `aria-label`. Repeated buttons name their object ("Remove
   [TEST] Faction A", not six "Remove"). [MS Tooltips] [WCAG 2.5.3]
4. **Status icons** (hidden, revealed, unpublished, GM only) carry text: an `aria-hidden` icon plus `.ag-sr-only` text, or
   `role="img"` with `aria-label`. `aria-label` on a bare `<i>` is ignored. [WCAG 1.1.1]
5. **Never colour alone**: a status has text, an icon or a shape as well. [WCAG 1.4.1]
6. **Focus survives re-renders**: after a click that re-renders, focus returns to the same control (matched by its
   `data-*` key), and the scroll position is kept. Popovers move focus in when they open and back to their opener when they
   close; Esc closes the innermost one. [WCAG 2.4.3] [W3C APG Dialog] [Primer Focus]
7. After deleting a record, focus goes to the next record or the list, not the top of the window. [Primer Focus]
8. **Focus is always visible** (the kit's `:focus-visible` ring) and never hidden under a sticky toolbar or footer.
   [WCAG 2.4.7] [WCAG 2.4.11]
9. **Drag and drop always has a keyboard alternative**: a button or menu that does the same thing ("Add item…", "Move",
   "Deposit item…"). [WCAG 2.1.1] [WCAG 2.5.7]
10. **ARIA roles promise keyboard behaviour.** Only use `role="tab"`, `role="menu"`, `role="radio"`, `role="toolbar"` when the
    arrow-key pattern is implemented; otherwise use plain buttons and `<details>`. No interactive control inside a
    `<summary>`. [W3C APG Tabs] [W3C APG Disclosure]
11. **Contrast** in every skin: text 4.5:1, large text and control boundaries 3:1. Toned text on a soft fill uses the
    `--ag-*-ink` tokens; don't dim text with `opacity`. Placeholder and disabled text never carry information.
    [WCAG 1.4.3] [WCAG 1.4.11] [Primer Forms]
12. Keyboard shortcuts go through Foundry's keybinding settings so users can see and rebind them. Single-key shortcuts only
    work while the window has focus. [WCAG 2.1.4] [MS Keyboard accelerators]

## 10. Motion

1. Animate only to explain a change (open, close, move, progress), never as decoration on frequent actions, and never make
   people wait for an animation. [Apple Motion]
2. Use `--ag-dur-fast` (120ms) for feedback and `--ag-dur` (180ms) for panels, with `--ag-ease`. Nothing over 300ms.
   [MS Timing and easing]
3. Honour `prefers-reduced-motion: reduce`: no transitions, no rotation or looping art, no shimmer (the kit block at the end
   of `ag-ui.css` covers kit classes; modules guard their own). [WCAG 2.3.3] [web.dev Reduced motion]
4. Looping motion (rotating art) also stops while the window is minimised or hidden. **Ours**

## 11. Tooltips and help

1. Tooltips (`data-tooltip`, class `ag-tooltip`) are for **icon-only controls** and **supplemental** detail. Anything you need
   to finish the task is visible text. [MS Tooltips] [NNg Tooltips]
2. Tooltips start with a verb, run under about 75 characters, and don't repeat the label. [Apple Offering help]
3. Tooltips appear on focus as well as hover, and only on focusable elements. Never put a tooltip on a plain `div` or an
   `aria-hidden` icon as the only place information lives. [WCAG 1.4.13]
4. No errors, warnings or status in tooltips; use an inline notice. [MS Tooltips] [Carbon Notifications]
5. **Help** (header button, `infoDialog`) is grouped by topic with headings or `<details>` sections, not one long list. It
   uses the same names as the UI and is updated in the same release as the UI it describes. **Ours**
6. **Hints**: one line in place. Paragraphs of explanation on a working screen move into Help or a "How this works"
   disclosure. **Ours** [Carbon Forms]

## 12. Microcopy

1. **Buttons start with a verb** and name the object when it isn't obvious: "New location", "Delete route", "Award XP".
   [Apple Writing] [Primer Saving]
2. A trailing **ellipsis** means the button opens a dialog or asks for more input before acting: "Move to…", "Set Strain…".
   [Apple Buttons]
3. **Sentence case** for labels, buttons, tabs, headings, hints and messages ("New location", "Who can see it"). The
   established **Save Changes** button keeps its capitals. **Ours** (the suite is already mostly sentence case; Robb to
   confirm) [MS Writing style] [Carbon Forms]
4. **Periods** only on full sentences (hints, messages, tooltips), not on labels or headings. [MS Writing style]
5. **No internal values** in the UI: no raw status tokens, ids, keys or ISO timestamps. Map them to labels and local
   dates. [Apple Writing] [MS Writing style]
6. **Plurals** done properly ("1 stage", "2 stages"), never "stage(s)". **Ours**
7. **Same word for the same thing** across modules (Help, launcher, tabs and embeds included). Don't call one thing
   "Compact" in one place and use "Compact" for something else in the same header. [WCAG 3.2.4] [Apple Writing]
8. Labels describe what a switch does when on ("Show hidden locations"), not the mechanism. [Apple Writing]
9. **Production wording:** no Alpha, Beta, Preview, New, Experimental or similar status labels anywhere a user sees them
   (UI, Help, settings, module descriptions); status is discussed in chat. Internal API contract ids keep their names.
   `scripts/ui-lint.mjs` (`status-wording`) checks module.json, scripts and templates. **Ours** (Robb, 2026-10)

## 13. Theming

1. Colours come from kit tokens only. Module CSS uses no colour literals (ui-lint). [Apple Dark mode]
2. Every window renders in the kit's default theme without General Manager. (CLAUDE.md)
3. **General Manager owns appearance.** Modules don't ship their own skin, palette or theme picker; they follow `<html>`.
   They don't copy skin tokens onto their own content on every render either: `<html>` already reaches every window, and a
   copy goes stale when the skin changes. [Apple Dark mode] (CLAUDE.md "Ownership")
4. Structural skins reshape **kit classes only**, so a hand-rolled copy of a kit component won't follow Stone Tablet, Tome
   Pages, Ledger Book, Field Journal or Frontier Map. That's one more reason to use the kit (section 14). **Ours**
5. Test new UI in one dark and one light skin and at both sizes before release. [Apple Dark mode]

## 14. Use the kit

Use the kit's component rather than writing a module-local copy. The audit found copies of each of these:

| Need | Kit class |
|---|---|
| Side list of sections or records | `.ag-siderail`, `.ag-split` |
| Key/value facts | `.ag-kv` |
| Record list | `.ag-rows` / `.ag-row` (`__icon`, `__main`, `__title`, `__meta`, `__end`) |
| Data with real columns | `.ag-table-wrap` / `.ag-table` |
| Status pill | `.ag-badge` (`--ok`, `--warn`, `--danger`, `--accent`) |
| Toggle filter | `.ag-chip` with `aria-pressed` |
| Progress, standing, XP | `.ag-meter` (with an accessible name) |
| Portrait | `.ag-portrait` |
| Section head | `.ag-section__head` / `.ag-card__head` |
| Inline message | `.ag-notice` (`--info`, `--ok`, `--warn`, `--danger`) |
| Form layout | `.ag-form-grid`, `.ag-field`, `.ag-field__hint` |

Kit files are byte-identical in every module (check.mjs fails if they drift), so a kit change ships in **all** modules in
one PR, each with a patch bump.

## 15. Kit gaps (proposed kit 2.2)

The audit kept reaching for things the kit doesn't have yet. Each is additive and keeps kit 2.1 working. Kit 2.2.0 ships the
rows marked **shipped** (usage in [section 17](#17-kit-22-usage)); the rest are still proposals.

| Addition | What it is | Rules it serves |
|---|---|---|
| `.ag-tabs--sub` **shipped** (with `subTabs()`) | Secondary tab row: smaller, underline style, distinct from the top pill row | §2.5 |
| `bindTablist(root)` in `ag-html.mjs` **shipped** | Roving tabindex, Left/Right/Home/End, `aria-controls`/`aria-labelledby` wiring for any `.ag-tabs` | §2.7, §9.10 |
| `.ag-fold` **shipped** (with `fold()`, `bindFolds()`) | Styled `<details>`/`<summary>` section with chevron, count and optional end actions (generalises `.ag-devtools`) | §3 |
| `fileButton({label, accept})` **shipped** (with `bindFileButtons()`) | A real button plus a visually hidden file input | §9.2 |
| `.ag-link` **shipped** (with `linkButton()`) | A button that looks like an inline link, for in-text navigation | §9.1 |
| `guardDirty()` helper **shipped** (in `ag-dialogs.mjs`) | Tracks a form's dirty state, writes "Unsaved changes" to the footer status, asks before discard | §6.6–6.7 |
| `.ag-badge--now` / "Applies now" | Badge for cards whose controls save immediately | §6.8 |
| `.ag-spinner`, `.ag-skeleton` | Loading states, reduced-motion safe | §8.3–8.4 |
| `confirmDanger()` **shipped** (a new helper; `confirmDialog` is unchanged) | With `danger: true`, Cancel becomes the default button | §7.6 |
| `captureFocus`/`restoreFocus` | Shared version of Character Hub's focus restore, covering buttons too | §9.6 |

## 16. Review checklist (copy into a UI PR)

- [ ] Header: brand left; version + Help right; at most one other control; no subtitle.
- [ ] At most 6 top-level tabs with text labels; GM tabs last and marked; at most one sub-tab level, using `.ag-tabs`.
- [ ] Toolbar is one row: search, Filters (n), count, create action at the right.
- [ ] No editor rendered below a whole list; long editors use sub-tabs or folds.
- [ ] GM Setup holds settings only; demo/debug in Developer Tools.
- [ ] One Save per form in a pinned footer; "Unsaved changes" shown; no silent loss of edits; instant controls kept out of
      draft forms or badged "Applies now".
- [ ] Confirmations: "Verb object?" title, verb button, Cancel, `danger` for removals, Cancel is the default.
- [ ] Empty, no-results and partner-missing states use the kit.
- [ ] Every clickable is a `button` or `a[href]`; icon-only buttons have `aria-label` + `data-tooltip`; status icons have text.
- [ ] Focus stays put after a re-render; Esc closes the innermost popover; drag and drop has a keyboard path.
- [ ] Kit tokens only; ink tokens on tinted fills; checked in a dark and a light skin, Compact and Comfortable.
- [ ] Reduced motion respected.
- [ ] Same names in launcher, header, tabs, Help and embeds; verb-first buttons; no raw ids or tokens.
- [ ] Tell Robb exactly what to click in Forge to see the change.

## 17. Kit 2.2 usage

Kit 2.2.0 adds helpers to `ag-html.mjs` and `ag-dialogs.mjs` and the matching classes to `ag-ui.css`. Nothing calls them
yet: each module's cleanup adopts them. They have unit tests against a mocked DOM in `scripts/kit-tests/` (logic only; check
the look and the keyboard in Forge). Import from the module's own copy (`./ag-html.mjs`, `./ag-dialogs.mjs`).

| Helper | File | Signature |
|---|---|---|
| `uiState` | ag-html | `uiState(namespace, {storage?, userId?}) → {key, get(name, fallback, allowed?), set(name, value)}` |
| `subTabs` | ag-html | `subTabs({group, label, tabs: [{id, label, icon?, count?}], selected}) → html` |
| `tabPanelAttrs` | ag-html | `tabPanelAttrs(group, tab, {hidden?}) → attribute string` |
| `bindTablist` | ag-html | `bindTablist(root, {state?, key?}) → unbind()` |
| `fold` | ag-html | `fold({key?, title, count?, hint?, open?, body}) → html` |
| `bindFolds` | ag-html | `bindFolds(root, state) → unbind()` |
| `fileButton` | ag-html | `fileButton({label?, accept?, multiple?, icon?, disabled?, data?, className?}) → html` |
| `bindFileButtons` | ag-html | `bindFileButtons(root, handler(files, wrapper)) → unbind()` |
| `linkButton` | ag-html | `linkButton(label, {data?, icon?, ariaLabel?, tooltip?}) → html` |
| `confirmDanger` | ag-dialogs | `confirmDanger(message, {title, yes, no?}) → Promise<boolean>` |
| `guardDirty` | ag-dialogs | `guardDirty({status?, text?, title?, message?, discard?, keep?, ask?, onChange?}) → guard` |

Text arguments (labels, titles, counts, hints) are escaped; `body` of `fold()` is HTML the caller has already escaped.

**Remember a choice per user** (sub-tab, open folds). Stored in the browser's localStorage per user; never throws.

```js
const ui = uiState('ashen-gate-quest-manager');
this.subTab = ui.get('gmSetupTab', 'general', ['general', 'rules', 'access']); // falls back if the tab no longer exists
```

**Sub-tabs** (one level, at the top of the pane they switch). Clicks still run your handler; `bindTablist` adds the
keyboard (one Tab stop, Left/Right, Home/End; Enter or Space selects) and remembers the clicked `data-tab`.

```js
const tabs = [{id: 'general', label: 'General'}, {id: 'rules', label: 'Rules'}, {id: 'access', label: 'Player access'}];
const html = `${subTabs({group: 'gm-setup', label: 'GM Setup sections', tabs, selected: this.subTab})}
  <section ${tabPanelAttrs('gm-setup', this.subTab)}>…</section>`;
// after render:
bindTablist(root.querySelector('.ag-tabs--sub'), {state: ui, key: 'gmSetupTab'});
root.querySelectorAll('.ag-tabs--sub [data-tab]').forEach(b => b.addEventListener('click', () => { this.subTab = b.dataset.tab; this.render(); }));
```

`bindTablist` also works on an existing top-level `.ag-tabs` row: it adds `role="tab"` and roving `tabindex` to its buttons
and wires each tab's `aria-controls` panel. Focus after a re-render is still the module's job (§9.6).

**Folds** for optional sections (never a fold in a fold, no buttons in the title):

```js
const html = fold({key: 'advanced', title: 'Advanced options', count: 3, body: advancedHtml});
// after render:
bindFolds(root, ui); // restores and remembers open/closed per user
```

**File picker** that the keyboard can reach. A drop zone may stay beside it, never instead of it.

```js
const html = fileButton({label: 'Import JSON…', accept: '.json,application/json'});
// after render:
bindFileButtons(root, async ([file]) => this.importFile(file));
```

**Link button** for in-app navigation inside text (use `<a href>` for real URLs):

```js
`Turn on Player access in ${linkButton('GM Setup', {data: {action: 'goto-tab', tab: 'gm-setup'}})}.`
```

**Destructive confirmation**: title "Delete <thing>?", action "Delete <thing>", Cancel is the default.

```js
if (!(await confirmDanger('Players lose access to its notes.', {title: `Delete ${name}?`, yes: 'Delete location'}))) return;
```

**Unsaved edits**: one guard per draft form. It writes "Unsaved changes" into the footer status and asks "Discard unsaved
changes?" (Keep editing / Discard changes, Keep editing is the default) before a tab switch, selection change or close.

```js
this.guard ??= guardDirty({status: () => this.element?.querySelector('.ag-footer__status')});
// after render:
this.guard.watch(root.querySelector('form.ag-draft'));
const selectTab = this.guard.guard(tab => { this.tab = tab; return this.render(); });
// after a successful save, and on Cancel:
this.guard.markClean();
// on close:
async close(options) { if (!(await this.guard?.confirm() ?? true)) return this; return super.close(options); }
```

An action that needs the saved record can pass its own `ask` (for example a `choiceDialog` with **Save and <action>** /
**Keep editing**, §6.9).

---

## Sources

Read directly or from the official source repositories (w3c/wcag, w3c/aria-practices, primer/design,
carbon-design-system/carbon-website, MicrosoftDocs/windows-dev-docs) in October 2026. Keys marked † were seen through search
summaries only and should be checked before quoting. Keys marked ‡ are cited by their canonical URL and were not re-read in
this pass.

- **[Apple Alerts]** https://developer.apple.com/design/human-interface-guidelines/alerts
- **[Apple Buttons]** https://developer.apple.com/design/human-interface-guidelines/buttons
- **[Apple Tab views]** https://developer.apple.com/design/human-interface-guidelines/tab-views
- **[Apple Disclosure]** https://developer.apple.com/design/human-interface-guidelines/disclosure-controls
- **[Apple Settings]** https://developer.apple.com/design/human-interface-guidelines/settings
- **[Apple Writing]** https://developer.apple.com/design/human-interface-guidelines/writing
- **[Apple Motion]** https://developer.apple.com/design/human-interface-guidelines/motion
- **[Apple Offering help]** https://developer.apple.com/design/human-interface-guidelines/offering-help
- **[Apple Toolbars]** https://developer.apple.com/design/human-interface-guidelines/toolbars
- **[Apple Dark mode]** https://developer.apple.com/design/human-interface-guidelines/dark-mode
- **[Apple Accessibility]** https://developer.apple.com/design/human-interface-guidelines/accessibility
- **[Apple Lists and tables]** https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- **[W3C APG Tabs]** https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- **[W3C APG Dialog]** https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **[W3C APG Disclosure]** https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- **[WCAG 1.1.1]**‡ https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html
- **[WCAG 1.4.1]** https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- **[WCAG 1.4.3]** https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- **[WCAG 1.4.11]** https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- **[WCAG 1.4.13]** https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- **[WCAG 2.1.1]**‡ https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
- **[WCAG 2.1.4]** https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html
- **[WCAG 2.3.3]** https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- **[WCAG 2.4.3]** https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
- **[WCAG 2.4.7]** https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
- **[WCAG 2.4.11]** https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- **[WCAG 2.5.3]**‡ https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
- **[WCAG 2.5.7]**‡ https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- **[WCAG 2.5.8]** https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **[WCAG 3.2.3]** https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html
- **[WCAG 3.2.4]** https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html
- **[WCAG 3.3.3]** https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html
- **[WCAG 3.3.7]** https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html
- **[WCAG 4.1.3]** https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- **[Primer Saving]** https://primer.style/ui-patterns/saving
- **[Primer Forms]** https://primer.style/ui-patterns/forms/overview
- **[Primer Loading]** https://primer.style/ui-patterns/loading
- **[Primer Empty states]** https://primer.style/ui-patterns/empty-states
- **[Primer Navigation]** https://primer.style/ui-patterns/navigation
- **[Primer Data table]** https://primer.style/components/data-table
- **[Primer Dialog]** https://primer.style/components/dialog
- **[Primer Focus]** https://primer.style/guides/accessibility/focus-management
- **[Carbon Tabs]** https://carbondesignsystem.com/components/tabs/usage/
- **[Carbon Data table]** https://carbondesignsystem.com/components/data-table/usage/
- **[Carbon Spacing]** https://carbondesignsystem.com/elements/spacing/overview/
- **[Carbon Loading]** https://carbondesignsystem.com/patterns/loading-pattern/
- **[Carbon Forms]** https://carbondesignsystem.com/patterns/forms-pattern/
- **[Carbon Dialogs]** https://carbondesignsystem.com/patterns/dialog-pattern/
- **[Carbon Empty states]** https://carbondesignsystem.com/patterns/empty-states-pattern/
- **[Carbon Disclosures]** https://carbondesignsystem.com/patterns/disclosures-pattern/
- **[Carbon Notifications]** https://carbondesignsystem.com/patterns/notification-pattern/
- **[Carbon Filtering]** https://carbondesignsystem.com/patterns/filtering/
- **[MS Dialogs]** https://learn.microsoft.com/windows/apps/develop/ui/controls/dialogs-and-flyouts/dialogs
- **[MS NavigationView]** https://learn.microsoft.com/windows/apps/develop/ui/controls/navigationview
- **[MS Tooltips]** https://learn.microsoft.com/windows/apps/develop/ui/controls/tooltips
- **[MS Keyboard accelerators]** https://learn.microsoft.com/windows/apps/develop/input/keyboard-accelerators
- **[MS Timing and easing]** https://learn.microsoft.com/windows/apps/design/motion/timing-and-easing
- **[MS Writing style]** https://learn.microsoft.com/windows/apps/design/style/writing-style
- **[NNg Progressive disclosure]**† https://www.nngroup.com/articles/progressive-disclosure/
- **[NNg Vertical nav]**† https://www.nngroup.com/articles/vertical-nav/
- **[NNg Response times]**† https://www.nngroup.com/articles/response-times-3-important-limits/
- **[NNg Skeleton screens]**† https://www.nngroup.com/articles/skeleton-screens/
- **[NNg Tooltips]**† https://www.nngroup.com/articles/tooltip-guidelines/
- **[NNg Infinite scrolling]**† https://www.nngroup.com/articles/infinite-scrolling-tips/
- **[NNg Confirmation dialogs]**† (summary article) https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956
- **[GNOME Dialogs]**† https://developer.gnome.org/hig/patterns/feedback/dialogs.html
- **[Fluent Layout]**† https://fluent2.microsoft.design/layout
- **[Material 3 secondary tabs]**† https://api.flutter.dev/flutter/material/TabBar/TabBar.secondary.html
- **[Cloudscape Density]**† https://cloudscape.design/foundation/visual-foundation/content-density/
- **[SAP Cozy/compact]**† https://www.sap.com/design-system/fiori-design-web/v1-136/foundations/visual/cozy-compact
- **[Polaris Save bar]**† https://polaris.shopify.com/components/contextual-save-bar
- **[Baymard]**† https://baymard.com/blog/inline-form-validation
- **[web.dev Reduced motion]**† https://web.dev/articles/prefers-reduced-motion
