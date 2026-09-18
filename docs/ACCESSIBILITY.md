# Accessibility Audit (NFR-009)

Status: **audited and fixed against the live deployment**, with a follow-up
pass on 2026-09-18 covering interactive patterns added after the original
scan (see below).

NFR-009 targets WCAG 2.2 AA. Before this, it was genuinely unaudited —
not known to be compliant or non-compliant, just untested.

## Method

Automated scan with [axe-core](https://github.com/dequelabs/axe-core) 4.10.2
(WCAG 2.1 A/AA + 2.2 AA rule sets) injected directly into the live Azure
deployment via the browser console, run against all 13 distinct pages:

- Public: `/login`, `/register`
- Employee: `/my-day`, `/tasks`, `/attendance`, `/corrections`, `/profile`
- Admin: `/admin/dashboard`, `/admin/live`, `/admin/users`, `/admin/tasks`,
  `/admin/reports`, `/admin/corrections`, `/admin/audit`

Followed by a manual keyboard spot-check on the login form (tab order,
focus visibility) — automated tools can't fully verify focus-visible
styling, only that it isn't obviously broken.

## Findings (initial scan, 2026-09-08)

| Issue | Impact | Pages affected | Root cause |
|---|---|---|---|
| Color contrast | Serious | my-day, all 6 admin pages | `text-slate-500` on `bg-slate-100` measured 4.34:1 against a 4.5:1 requirement (global timer bar, shown on every logged-in page); a `text-slate-400` timeline label on my-day failed more clearly |
| Unlabeled `<select>` | Critical | admin/users (7), admin/tasks (1) | Per-row role/status dropdowns had no accessible name at all; two "Filter by status" selects had a visible `<label>` that wasn't programmatically linked via `htmlFor`/`id` |
| Scrollable table not keyboard-focusable | Serious | admin/reports, admin/audit | `overflow-x-auto` table wrappers had no `tabIndex`, so a keyboard-only user couldn't scroll them once content actually overflowed |

## Fixes

- `global-timer-bar.tsx`, `my-day/page.tsx`: bumped `text-slate-500` →
  `text-slate-600`, `text-slate-400` → `text-slate-500`.
- `admin/users/page.tsx`: added `aria-label` to the per-row role/status
  selects (naming the affected user), and `htmlFor`/`id` linking the
  status-filter label to its select.
- `admin/tasks/page.tsx`: same `htmlFor`/`id` fix for its status filter.
- Six `overflow-x-auto` wrappers (`admin/audit`, `admin/live`,
  `admin/reports`, `admin/tasks`, `admin/users`, `attendance`) — added
  `tabIndex={0} role="region" aria-label="..."`. Only two of these had
  actually overflowed at the test viewport width and were flagged by axe;
  fixed all six since the same wrapper pattern will overflow on a narrower
  screen regardless of whether it happened to trigger during this scan.

## Verification

Re-scanned all 13 pages against the live deployment after the fix
deployed (commit `7501be3`, Deploy #3). **Zero violations across every
page**, up from 3 distinct issue types across 9 of the 13 pages.

## Follow-up audit (2026-09-18)

The interactive patterns above didn't all exist yet at the original scan —
the Stitch-design UI restyle (Phases 3-9) added drawers, clickable table
rows opening those drawers, and toggle switches to several screens *after*
2026-09-08, and axe-core's automated scan doesn't catch keyboard-operability
or touch-target-coverage gaps in patterns that pass a contrast/labeling
check but were never actually driven by a keyboard or a touch tap. A manual
pass (real Tab-and-Enter keyboard testing, and real 375px-viewport touch
testing) against a fresh instance found three real, newly-introduced issues,
verified live against both staging and production after fixing:

| Issue | Pages affected | Root cause |
|---|---|---|
| Clickable table row not keyboard-operable | Live Attendance, Audit Log, Task Management, Attendance History, Attendance Logs, Task Time History | `<tr onClick=...>` with no `tabIndex`/keydown handling - a keyboard-only user could Tab past the row but never open it |
| `<select>` could overflow its container | Global timer bar's "Switch to another task" control, My Day's "assign to task" control | Component's `xs` size had no width constraint, so a real (unbounded-length) task title could render the closed box 300px+ wide next to two small icon buttons |
| Toggle switch tap target excluded its own label | Settings (3 toggles) | Only the 44×24 switch itself was inside the `<label>`; the adjacent text describing what it does was a sibling, not part of the tappable/clickable target |

Fixed: `tabIndex={0}` + Enter/Space handling + a focus-visible ring added to
each affected row (6 files); `Select`'s `xs` size capped to `max-w-[7rem]
truncate` at the component level, fixing both call sites at once; each
Settings `ToggleField` restructured so the whole row is the `<label>`.

Verified with a real keyboard (Tab to a row, dispatch a real `Enter`
keydown, confirm the drawer opens) and a real toggle click on the label
text (not the switch), against staging and then production, after each
deploy.

## What this doesn't cover

Automated scanning (axe-core) catches roughly 30-40% of WCAG success
criteria by nature — things like unlabeled controls, contrast ratios, and
missing landmarks are detectable programmatically; things like whether
error messages are genuinely *understandable*, whether a screen reader's
reading order matches visual order in complex widgets, or whether
alternative text is meaningfully descriptive rather than just present, need
a human (ideally one who uses assistive technology day-to-day) to judge.
This audit is real and the fixes are real, but "zero axe violations" is a
floor, not a ceiling — it's not the same claim as "fully WCAG 2.2 AA
compliant," which would need a manual audit beyond what was done here.
