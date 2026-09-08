# Performance Testing (NFR-001)

Status: **tested against a defined reference load; one real gap found, partially fixed.**

NFR-001 reads: "Normal interactive API operations should target p95 response
time under 500 ms under agreed reference load." Neither the SRS nor the
tracker ever numerically defined "agreed reference load" — like the RPO/RTO
targets in [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md), this was an
engineering placeholder pending real sign-off. The assumption used for this
test, and proposed for actual sign-off:

> Single-organisation deployment, up to ~150 employees, modelled as a
> shift-start spike of **30 concurrent active users**.

## Method

Run against the live Azure deployment (not local dev), 2026-09-08:

- **Phase A — read-heavy:** 30 dedicated test accounts, staggered logins,
  each looping `GET /attendance/state`, `GET /tasks?scope=mine`,
  `GET /task-timers/daily-log` for 60 seconds sustained.
- **Phase B — write path:** 40 dedicated one-shot accounts, 12 concurrent,
  each running one full cycle: clock in → create task → start timer → stop
  timer → clock out → logout.

All test accounts were created directly in the database (bypassing
registration) and fully deleted afterward — see the (uncommitted,
git-ignored-by-convention) `apps/api/load-test-*.js` scripts. The two real
demo accounts (`admin@atms.app`, `employee@atms.app`) were never touched.

## Results

| Endpoint | n | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| `GET /attendance/state` | 2003 | 54ms | 97ms | 806ms | 2404ms |
| `GET /tasks?scope=mine` | 2003 | 53ms | 105ms | 601ms | 1799ms |
| `GET /task-timers/daily-log` | 2003 | 53ms | 105ms | 256ms | 1804ms |
| `POST /attendance/clock-in` | 40 | 152ms | **528ms** | 872ms | 872ms |
| `POST /tasks` | 40 | 197ms | **996ms** | 1096ms | 1096ms |
| `POST /task-timers/start` | 40 | 190ms | **1017ms** | 1122ms | 1122ms |
| `POST /task-timers/stop` | 40 | 86ms | 794ms | 813ms | 813ms |
| `POST /attendance/clock-out` | 40 | 226ms | 750ms | 914ms | 914ms |
| `POST /auth/logout` | 40 | 74ms | 347ms | 356ms | 356ms |
| `POST /auth/login` | 106 | 800ms | 7918ms | 9250ms | 9389ms |

## Reading this honestly

**Reads pass comfortably.** All three GET endpoints hold p95 under 110ms —
well inside the 500ms target, even under 30 concurrent users hammering them
continuously for a full minute.

**Writes do not meet the target.** Every write endpoint exceeds 500ms at
p95 except logout; task creation and timer start both exceed 1 second at
p95. This is a real finding, not a test artifact — these numbers have no
retry logic or throttling involved. The most likely cause is the
cost-minimised Azure tier this is deployed on (Container Apps at 0.5 vCPU,
Postgres Flexible Server `Standard_B1ms` Burstable) queuing under even
modest concurrent write load; this wasn't validated before now because
nothing had generated concurrent write traffic against the live deployment
until this test.

**Login's numbers are contaminated and shouldn't be read at face value.**
10 of 106 login attempts hit a `429 ThrottlerException` — the API's own
per-IP rate limiter on `/auth/login`, correctly doing its job, but tripped
here because all 30 simulated "different users" came from one test
machine's single IP, which real distributed users wouldn't do. The recorded
retry-after-backoff attempts also bake in this test script's own sleep
delay, not server time. What's still worth taking at face value: Argon2id
password verification is deliberately CPU-expensive (that's the security
property), and under concurrent load on a 0.5 vCPU container that cost
compounds — the same underlying cause as the write-path slowdown above,
just harder to isolate cleanly from this test's login-throttle interaction.

## Fix applied and re-tested (2026-09-08, same day)

Applied the two cheapest fixes and re-ran the identical test immediately
after:

- API Container App: `0.5 vCPU / 1Gi` → **`1.0 vCPU / 2Gi`**
- Postgres: `Standard_B1ms` (1 vCore, Burstable) → **`Standard_B2s`**
  (2 vCores, still Burstable — a ~2x cost step, not the much larger jump to
  General Purpose)

| Endpoint | p95 before | p95 after | Verdict |
|---|---:|---:|---|
| `GET /attendance/state` | 97ms | 62ms | pass |
| `GET /tasks?scope=mine` | 105ms | 61ms | pass |
| `GET /task-timers/daily-log` | 105ms | 60ms | pass |
| `POST /attendance/clock-in` | 528ms | 586ms | **still fails** |
| `POST /tasks` | 996ms | 561ms | **still fails** (much closer) |
| `POST /task-timers/start` | 1017ms | 314ms | pass |
| `POST /task-timers/stop` | 794ms | 219ms | pass |
| `POST /attendance/clock-out` | 750ms | 473ms | pass |
| `POST /auth/logout` | 347ms | 219ms | pass |

**Honest read: real, substantial improvement, not a full fix.** 4 of 5
write endpoints now pass; the two that create a new row (`clock-in` →
new `AttendanceSession`, `tasks` → new `Task`) are the two still over
target, `clock-in` marginally worse than before if anything. A plausible
next hypothesis: BR-002's partial unique index (one active attendance
session per user) adds constraint-check overhead specifically on INSERT
that an UPDATE-only operation (like starting/stopping an existing timer)
doesn't pay — untested, would need a targeted follow-up to confirm rather
than assumed.

## Recommendation

Not urgent for a single-user demo. Before onboarding a real organisation
with a shift-start clock-in spike, worth either investigating the INSERT-
specific hypothesis above, or taking the next cost step (Postgres General
Purpose tier) — see RISK-007 in the tracker for current status.
