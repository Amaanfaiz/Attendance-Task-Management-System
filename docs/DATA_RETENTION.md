# Data Retention Policy (NFR-013)

Status: **documented; not yet automated.**

NFR-013 requires attendance, task, and audit retention periods to be
"configurable or documented" — this satisfies it via documentation. Neither
the SRS nor the tracker specified any retention period or jurisdiction
beforehand; like the backup RPO/RTO targets in
[BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md), the numbers below are an
engineering proposal, not a decision that's actually been made. **They need
your sign-off, ideally after checking against wherever this organisation is
legally based** — labor-record retention requirements vary significantly by
country and even by state/province, and getting this wrong in either
direction (deleting too early is a compliance risk; keeping forever is a
privacy/GDPR-style data-minimisation risk) has real consequences this
document can't resolve for you.

## Current actual behaviour (as of 2026-09-08)

Nothing is automatically deleted. There is no purge job, no cron schedule,
no TTL of any kind on attendance sessions, tasks, or audit log entries —
confirmed by searching the codebase, not assumed. Everything grows
unbounded except:

- **Backups** — rolling 14-day window (Azure-managed, see
  BACKUP_AND_RESTORE.md — a separate concern from *retaining the live
  data itself*).
- **Refresh tokens / password reset tokens** — these have a real
  `expiresAt` and are cascade-deleted with their user; not in NFR-013's
  scope (attendance/task/audit) but worth knowing they already behave
  correctly.

## Proposed retention periods (pending your sign-off)

| Record type | Proposed retention | Rationale |
|---|---|---|
| **Attendance records** (clock in/out, breaks) | 3 years from creation | Matches the US FLSA's 3-year minimum for payroll-adjacent time records — a reasonable floor if this ever needs to support a payroll dispute, regardless of actual jurisdiction. Shorten if the real jurisdiction requires less and you want to minimise stored personal data instead. |
| **Task records** (tasks, time entries) | Indefinite | Low legal sensitivity, real ongoing business value as project history, low storage cost. Revisit only if storage cost or a specific privacy request makes it worth reconsidering. |
| **Audit log entries** | 7 years from creation | The audit log's entire purpose is accountability — retaining it *longer* than the operational records it describes is the point, not a mistake. 7 years matches common financial/compliance-record norms; shorten if that's overkill for this organisation's actual regulatory exposure. |
| **Correction requests** | Same as the attendance record they reference | They're part of that record's own history (BR-012: corrections never destroy the original event), so they should live and die with it, not on their own separate clock. |

## What "documented" means right now vs. what "configurable" would take

This document satisfies NFR-013 as written ("configurable **or**
documented"). Actually enforcing these periods — an automated purge job —
is real additional work, not yet built:

- A scheduled job (NestJS `@nestjs/schedule`, or an Azure Container Apps
  scheduled job / cron trigger) that deletes attendance sessions, task time
  entries, and audit log rows past their retention window.
- Should almost certainly soft-delete or archive-then-delete rather than
  hard-delete outright, given BR-012's "never destroy original event
  history" principle applies in spirit even to expired records — an
  audit trail that silently vanishes is a worse audit trail than one that
  never existed.
- Needs its own safety rails before running against production: a dry-run
  mode, an audit log entry *for the purge itself* (deleting audit records
  without a record of having done so undermines the entire point of an
  audit log), and probably a manual approval step rather than a fully
  unattended cron for the first several runs.

Recommend treating automation as a separate, deliberate follow-up — not
something to build reactively alongside this documentation pass — given
the last point above (a bug in a delete job is categorically worse than a
bug in almost anything else in this system).
